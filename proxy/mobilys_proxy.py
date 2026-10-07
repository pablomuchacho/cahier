#!/usr/bin/env python3
"""Static server for /reservations + Mobilys session proxy.

Serves http://127.0.0.1:5174/reservations/ and forwards
  /api/mobilys/<path>  →  https://mweb.dalcroze.ch/<path>
with per-browser cookie jars (HttpOnly Mobilys sessions).
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import threading
import uuid
from http.cookiejar import CookieJar
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPSHandler, HTTPCookieProcessor, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "reservations"
UPSTREAM = "https://mweb.dalcroze.ch"
HOST = "127.0.0.1"
PORT = int(os.environ.get("RESERVATIONS_PORT", "5174"))
SESSION_COOKIE = "dalcroze_proxy_sid"

_jars: dict[str, CookieJar] = {}
_lock = threading.Lock()
_ssl_handler = HTTPSHandler(context=ssl.create_default_context())


def _get_jar(sid: str) -> CookieJar:
    with _lock:
        if sid not in _jars:
            _jars[sid] = CookieJar()
        return _jars[sid]


def _read_sid(handler: SimpleHTTPRequestHandler) -> str | None:
    raw = handler.headers.get("Cookie", "")
    for part in raw.split(";"):
        part = part.strip()
        if part.startswith(SESSION_COOKIE + "="):
            return part.split("=", 1)[1].strip()
    return None


def _ensure_sid(handler: SimpleHTTPRequestHandler) -> str:
    return _read_sid(handler) or uuid.uuid4().hex


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args), file=sys.stderr)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        if self.path.startswith("/api/mobilys"):
            sid = _ensure_sid(self)
            self.send_response(204)
            self.send_header(
                "Set-Cookie", f"{SESSION_COOKIE}={sid}; Path=/; SameSite=Lax; HttpOnly"
            )
            origin = self.headers.get("Origin", "*")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self) -> None:
        if self.path.startswith("/api/mobilys"):
            return self._proxy()
        if self.path.startswith("/api/health"):
            return self._health()
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/reservations/")
            self.end_headers()
            return
        # Only expose the reservations app assets from this server
        path = urlparse(self.path).path
        if path.startswith("/reservations/") or path == "/reservations":
            return super().do_GET()
        self.send_error(404, "Not found — use /reservations/")

    def do_POST(self) -> None:
        if self.path.startswith("/api/mobilys"):
            return self._proxy()
        self.send_error(404)

    def do_PUT(self) -> None:
        if self.path.startswith("/api/mobilys"):
            return self._proxy()
        self.send_error(404)

    def do_DELETE(self) -> None:
        if self.path.startswith("/api/mobilys"):
            return self._proxy()
        self.send_error(404)

    def _health(self) -> None:
        body = json.dumps(
            {
                "ok": True,
                "upstream": UPSTREAM,
                "institution": "IJD",
                "app": "/reservations/",
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self) -> None:
        parsed = urlparse(self.path)
        upstream_path = parsed.path[len("/api/mobilys") :] or "/"
        if not upstream_path.startswith("/"):
            upstream_path = "/" + upstream_path
        target = UPSTREAM + upstream_path
        if parsed.query:
            target += "?" + parsed.query

        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None
        content_type = self.headers.get("Content-Type", "application/json")
        sid = _ensure_sid(self)
        jar = _get_jar(sid)
        opener = build_opener(HTTPCookieProcessor(jar), _ssl_handler)
        req = Request(target, data=body, method=self.command)
        req.add_header("Accept", self.headers.get("Accept", "application/json"))
        req.add_header("Content-Type", content_type)
        req.add_header("User-Agent", "Dalcroze-Reservations-Proxy/1.0")

        try:
            with opener.open(req, timeout=45) as resp:
                data = resp.read()
                status = resp.status
                resp_ctype = resp.headers.get("Content-Type", "application/json")
        except HTTPError as err:
            data = err.read() or b""
            status = err.code
            resp_ctype = (
                err.headers.get("Content-Type", "application/json")
                if err.headers
                else "application/json"
            )
        except URLError as err:
            payload = json.dumps(
                {"error": True, "message": f"Proxy upstream error: {err.reason}"}
            ).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header(
                "Set-Cookie", f"{SESSION_COOKIE}={sid}; Path=/; SameSite=Lax; HttpOnly"
            )
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(status)
        self.send_header("Content-Type", resp_ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header(
            "Set-Cookie", f"{SESSION_COOKIE}={sid}; Path=/; SameSite=Lax; HttpOnly"
        )
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    if not APP_ROOT.is_dir():
        raise SystemExit(f"Missing app folder: {APP_ROOT}")
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"App        → http://{HOST}:{PORT}/reservations/")
    print(f"Proxy API  → http://{HOST}:{PORT}/api/mobilys/ → {UPSTREAM}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStop.")


if __name__ == "__main__":
    main()
