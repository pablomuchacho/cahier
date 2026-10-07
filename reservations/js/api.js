/**
 * Mobilys Web (Dalcroze / IJD) API client.
 * Base: same-origin proxy /api/mobilys → https://mweb.dalcroze.ch
 * Institution: IJD
 */

export const INSTITUTION = 'IJD';
export const UPSTREAM = 'https://mweb.dalcroze.ch';

const PROXY_BASE = '/api/mobilys';

function encodeForm(data) {
  const params = new URLSearchParams();
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  return params.toString();
}

async function request(path, { method = 'GET', body, json = true, form = false } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body != null) {
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      payload = encodeForm(body);
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`${PROXY_BASE}${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
    });
  } catch (err) {
    const error = new Error(
      'Impossible de joindre l’API Mobilys. Démarre le proxy : python3 proxy/mobilys_proxy.py'
    );
    error.cause = err;
    error.offline = true;
    throw error;
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error(
      response.ok
        ? 'Réponse Mobilys non JSON (session ou endpoint indisponible).'
        : `Erreur HTTP ${response.status}`
    );
    error.status = response.status;
    error.raw = text.slice(0, 400);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data.message || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  health() {
    return fetch('/api/health', { credentials: 'same-origin' }).then((r) => r.json());
  },

  session(module = 'reservations') {
    return request('/react/user/session', {
      method: 'POST',
      body: { module },
      form: true,
    });
  },

  sessionFrontend() {
    return request('/react/user/sessionFrontend');
  },

  login(login, password) {
    return request('/react/user/connexion', {
      method: 'POST',
      body: { vLogin: login, vMdp: password },
      form: true,
    });
  },

  logout() {
    return request('/react/user/logout', { method: 'POST', body: {}, form: true });
  },

  frontendLogout() {
    return request('/react/user/frontendLogout', { method: 'POST', body: {}, form: true });
  },

  getConfig(institution = INSTITUTION) {
    return request('/react/frontendController/getConfig', {
      method: 'POST',
      body: { institution },
      form: true,
    });
  },

  getHome(institution = INSTITUTION, language = 'fr') {
    return request('/react/frontendController/getHome', {
      method: 'POST',
      body: { institution, language },
      form: true,
    });
  },

  getRooms(institution = INSTITUTION) {
    return request('/react/frontendController/getReservations', {
      method: 'POST',
      body: { institution },
      form: true,
    });
  },

  getPlaces() {
    return request('/react/frontendController/enum/places');
  },

  getPlanning(lieuID, institution = INSTITUTION) {
    return request('/react/frontendController/getPlanning', {
      method: 'POST',
      body: { institution, lieuID },
      form: true,
    });
  },

  getPlanningLimits(lieuID) {
    return request('/react/frontendController/getPlanningLimits', {
      method: 'POST',
      body: { lieuID },
      form: true,
    });
  },

  getOccupation({ start, end, id }) {
    return request('/react/frontendController/getOccupation', {
      method: 'POST',
      body: { start, end, id },
      form: true,
    });
  },

  searchAvailability(payload) {
    return request('/react/frontendController/getDispoSearch', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  checkDates(payload) {
    return request('/react/frontendController/checkDates', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  addToCart(payload) {
    return request('/react/frontendController/addToCart', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  getCart(institution = INSTITUTION, cartID = 0) {
    return request('/react/frontendController/getCart', {
      method: 'POST',
      body: { institution, cartID },
      form: true,
    });
  },

  deleteFromCart(payload) {
    return request('/react/frontendController/deleteFromCart', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  createOrder(payload) {
    return request('/react/frontendController/createOrder', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  unreadMsg() {
    return request('/react/frontendController/unreadMsg', {
      method: 'POST',
      body: {},
      form: true,
    });
  },

  listOrders(payload) {
    return request('/react/orders/liste', {
      method: 'POST',
      body: payload,
      form: true,
    });
  },

  orderDetail(orderId) {
    return request('/react/orders/detail', {
      method: 'POST',
      body: { orderId },
      form: true,
    });
  },

  orderResources(orderId) {
    return request('/react/orders/getRes', {
      method: 'POST',
      body: { orderId },
      form: true,
    });
  },

  cancelOrders(rows, cancelContent = '', sendNotif = true) {
    return request('/react/orders/cancelOrdersSelection', {
      method: 'POST',
      body: {
        rows: JSON.stringify(rows),
        cancelContent,
        sendNotif,
      },
      form: true,
    });
  },

  quickChangeState(orderId, state) {
    return request('/react/orders/quickChangeState', {
      method: 'POST',
      body: { orderId, state },
      form: true,
    });
  },
};

export function formatRoom(room) {
  return {
    id: room.LIEU_NUM ?? room.id,
    name: room.LIEU_NOM ?? room.name ?? room.text ?? 'Salle',
    location: room.LIEU_APPARTENANCES ?? room.batiment ?? room.localisation ?? '',
    capacity: Number(room.LIEU_NBRE_PLACE ?? room.capacity ?? 0) || null,
    instant: Boolean(room.LIEU_WITHOUT_CONF),
    raw: room,
  };
}
