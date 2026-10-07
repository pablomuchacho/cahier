import { INSTITUTION, api, formatRoom } from './api.js';
import {
  addDays,
  debounce,
  el,
  formatDayHeading,
  formatMonthYear,
  formatTime,
  formatWeekRange,
  parseFlexibleDate,
  sameDay,
  startOfWeek,
  toISODate,
  toMobilysDate,
} from './utils.js';

const TITLES = {
  home: ['Accueil', 'Tableau de bord'],
  calendar: ['Calendrier', 'Disponibilités des salles'],
  book: ['Réserver', 'Parcours en 4 étapes'],
  mine: ['Mes réservations', 'Consulter, modifier, annuler'],
  profile: ['Profil', 'Session Mobilys · IJD'],
  login: ['Connexion', 'Institut Jaques-Dalcroze'],
};

const state = {
  route: 'home',
  user: null,
  connected: false,
  rooms: [],
  places: [],
  orders: [],
  notifications: [],
  unread: 0,
  calendarDate: new Date(),
  calendarView: matchMedia('(max-width: 767px)').matches ? 'list' : 'week',
  selectedRoomId: null,
  occupation: [],
  booking: {
    step: 1,
    date: toISODate(new Date()),
    roomId: null,
    start: '09:00',
    end: '10:00',
    activity: '',
    participants: 1,
    note: '',
    conflict: null,
    suggestions: [],
  },
  search: '',
  loading: false,
  proxyOk: false,
};

const ui = {
  main: document.getElementById('main'),
  pageTitle: document.getElementById('page-title'),
  pageSub: document.getElementById('page-sub'),
  toast: document.getElementById('toast'),
  overlay: document.getElementById('overlay'),
  sheet: document.getElementById('sheet'),
  notifBadge: document.getElementById('notif-badge'),
  sidebarUser: document.getElementById('sidebar-user'),
};

let toastTimer;

function toast(message, tone = 'info') {
  ui.toast.hidden = false;
  ui.toast.textContent = message;
  ui.toast.dataset.tone = tone;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.hidden = true;
  }, 3200);
}

function pushNotif(title, detail) {
  state.notifications.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    detail,
    at: new Date(),
  });
  state.unread += 1;
  renderNotifBadge();
}

function renderNotifBadge() {
  if (state.unread > 0) {
    ui.notifBadge.hidden = false;
    ui.notifBadge.textContent = String(Math.min(state.unread, 9));
  } else {
    ui.notifBadge.hidden = true;
  }
}

function setRoute(route) {
  if (!state.connected && route !== 'login') {
    state.route = 'login';
  } else {
    state.route = route;
  }
  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === state.route);
  });
  const meta = TITLES[state.route] || TITLES.home;
  ui.pageTitle.textContent = meta[0];
  ui.pageSub.textContent = meta[1];
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSheet() {
  ui.sheet.hidden = true;
  ui.overlay.hidden = true;
  ui.sheet.innerHTML = '';
}

function openSheet(content) {
  ui.sheet.hidden = false;
  ui.overlay.hidden = false;
  ui.sheet.innerHTML = '';
  ui.sheet.append(content);
}

function skeleton(n = 3) {
  return el(
    'div',
    { class: 'stack' },
    Array.from({ length: n }, () => el('div', { class: 'panel' }, [
      el('div', { class: 'skeleton', style: 'width:40%;margin-bottom:10px' }),
      el('div', { class: 'skeleton', style: 'width:80%' }),
    ]))
  );
}

async function boot() {
  bindChrome();
  try {
    const health = await api.health();
    state.proxyOk = Boolean(health?.ok);
  } catch {
    state.proxyOk = false;
  }

  try {
    const session = await api.session('reservations');
    state.connected = Boolean(session?.connected);
    state.user = session?.infos || null;
  } catch {
    state.connected = false;
  }

  if (state.connected) {
    await refreshData();
    setRoute('home');
  } else {
    setRoute('login');
  }
}

function bindChrome() {
  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => setRoute(btn.dataset.route));
  });
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
  document.getElementById('notif-btn')?.addEventListener('click', () => {
    state.unread = 0;
    renderNotifBadge();
    openSheet(
      el('div', {}, [
        el('h2', { text: 'Notifications' }),
        state.notifications.length
          ? el(
              'div',
              { class: 'stack' },
              state.notifications.map((n) =>
                el('div', { class: 'event' }, [
                  el('strong', { text: n.title }),
                  el('p', { class: 'muted', text: n.detail }),
                  el('p', { class: 'muted', text: formatTime(n.at) }),
                ])
              )
            )
          : el('p', { class: 'empty', text: 'Aucune notification pour le moment.' }),
        el('div', { class: 'btn-row', style: 'margin-top:16px' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', text: 'Fermer', onClick: closeSheet }),
        ]),
      ])
    );
  });
  ui.overlay.addEventListener('click', closeSheet);
}

async function refreshData() {
  state.loading = true;
  render();
  try {
    const [roomsRes, placesRes, unread, orders] = await Promise.all([
      api.getRooms(INSTITUTION).catch(() => ({ listeSalles: [] })),
      api.getPlaces().catch(() => ({ liste: [] })),
      api.unreadMsg().catch(() => ({ nbUnread: 0 })),
      api
        .listOrders({
          commandeNum: '',
          commandeDateConf: '',
          searchLimit: 50,
          checkChevauch: false,
          filterStateSelected: JSON.stringify([]),
        })
        .catch(() => []),
    ]);

    state.rooms = (roomsRes.listeSalles || []).map(formatRoom);
    state.places = placesRes.liste || [];
    state.unread = Number(unread.nbUnread || 0);
    state.orders = Array.isArray(orders) ? orders : orders?.liste || orders?.data || [];
    renderNotifBadge();
    ui.sidebarUser.textContent = state.user?.nom || state.user?.login || 'Session active · IJD';
  } catch (err) {
    toast(err.message || 'Chargement impossible', 'error');
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  ui.main.innerHTML = '';
  if (state.route === 'login') ui.main.append(viewLogin());
  else if (state.route === 'home') ui.main.append(viewHome());
  else if (state.route === 'calendar') ui.main.append(viewCalendar());
  else if (state.route === 'book') ui.main.append(viewBook());
  else if (state.route === 'mine') ui.main.append(viewMine());
  else if (state.route === 'profile') ui.main.append(viewProfile());
}

function viewLogin() {
  const form = el('form', { class: 'login-card stack', autocomplete: 'on' }, [
    el('h2', { text: 'Dalcroze' }),
    el('p', {
      class: 'muted',
      text: state.proxyOk
        ? 'Connecte-toi avec ton compte Mobilys (mweb.dalcroze.ch).'
        : 'Proxy hors-ligne — lance python3 proxy/mobilys_proxy.py puis recharge.',
    }),
    el('label', { class: 'field' }, [
      el('span', { text: 'Identifiant' }),
      el('input', { name: 'login', required: true, autocomplete: 'username', placeholder: 'prenom.nom' }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { text: 'Mot de passe' }),
      el('input', {
        name: 'password',
        type: 'password',
        required: true,
        autocomplete: 'current-password',
        placeholder: '••••••••',
      }),
    ]),
    el('button', { class: 'btn btn-primary', type: 'submit', text: 'Se connecter' }),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.login(String(data.get('login')), String(data.get('password')));
      if (res.error) {
        toast(res.message || 'Identifiants incorrects', 'error');
        pushNotif('Connexion refusée', res.message || 'Identifiants incorrects');
        return;
      }
      state.connected = true;
      const session = await api.session('reservations');
      state.user = session?.infos || { login: String(data.get('login')) };
      pushNotif('Connexion', 'Session Mobilys ouverte');
      toast('Connecté');
      await refreshData();
      setRoute('home');
    } catch (err) {
      toast(err.message || 'Échec de connexion', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  return form;
}

function viewHome() {
  if (state.loading && !state.rooms.length && !state.orders.length) return skeleton(4);

  const upcoming = normalizeOrders(state.orders).filter((o) => o.start && o.start >= new Date()).slice(0, 4);
  const recent = normalizeOrders(state.orders).slice(0, 4);

  return el('div', {}, [
    el('section', { class: 'hero' }, [
      el('h2', { text: 'Réserver en moins de 30 secondes' }),
      el('p', {
        text: 'Consulte les disponibilités, choisis une salle et confirme. Conflits détectés automatiquement via Mobilys.',
      }),
      el('div', { class: 'btn-row', style: 'margin-top:20px' }, [
        el('button', {
          class: 'btn btn-primary',
          type: 'button',
          text: 'Nouvelle réservation',
          style: 'background:#fff;color:var(--primary)',
          onClick: () => setRoute('book'),
        }),
        el('button', {
          class: 'btn btn-secondary',
          type: 'button',
          text: 'Voir le calendrier',
          style: 'background:transparent;border-color:rgba(255,255,255,.35);color:#fff',
          onClick: () => setRoute('calendar'),
        }),
      ]),
    ]),
    el('div', { class: 'grid-actions' }, [
      quickCard('Réserver', 'Date → salle → créneau → confirmation', () => setRoute('book')),
      quickCard('Calendrier', state.calendarView === 'list' ? 'Vue agenda' : 'Jour / semaine / mois', () =>
        setRoute('calendar')
      ),
      quickCard('Mes réservations', `${normalizeOrders(state.orders).length} visible(s)`, () => setRoute('mine')),
    ]),
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Prochaines réservations' }),
      el('button', { class: 'btn btn-secondary', type: 'button', text: 'Tout voir', onClick: () => setRoute('mine') }),
    ]),
    upcoming.length
      ? el('div', { class: 'stack' }, upcoming.map(orderCard))
      : el('p', { class: 'empty panel', text: 'Aucune réservation à venir. Les salles Mobilys apparaîtront après connexion.' }),
    el('div', { class: 'section-head' }, [el('h2', { text: 'Récentes' })]),
    recent.length
      ? el('div', { class: 'stack' }, recent.map(orderCard))
      : el('p', {
          class: 'empty panel',
          text: state.rooms.length
            ? `${state.rooms.length} salle(s) disponible(s) à la réservation.`
            : 'Connecte-toi pour synchroniser tes commandes Mobilys.',
        }),
  ]);
}

function quickCard(title, sub, onClick) {
  return el('button', { class: 'card-action', type: 'button', onClick }, [
    el('strong', { text: title }),
    el('span', { text: sub }),
  ]);
}

function normalizeOrders(list) {
  return (list || [])
    .map((item) => {
      const start = parseFlexibleDate(item.start || item.dateDebut || item.debut || item.Start || item.DATE_DEBUT);
      const end = parseFlexibleDate(item.end || item.dateFin || item.fin || item.End || item.DATE_FIN);
      return {
        id: item.numero || item.num || item.id || item.orderId || item.COMMANDE_NUM,
        title: item.resource || item.salle || item.LIEU_NOM || item.libelle || item.name || 'Réservation',
        location: item.localisation || item.LIEU_APPARTENANCES || item.place || '',
        activity: item.activity || item.activite || item.ACTIVITE || '',
        state: item.state || item.statut || item.STATE || item.etat || '',
        start,
        end,
        raw: item,
      };
    })
    .sort((a, b) => (b.start?.getTime?.() || 0) - (a.start?.getTime?.() || 0));
}

function orderCard(order) {
  return el('article', { class: 'order' }, [
    el('div', { class: 'order-top' }, [
      el('div', {}, [
        el('strong', { text: order.title }),
        el('p', {
          class: 'muted',
          text: [order.location, order.activity].filter(Boolean).join(' · ') || 'Mobilys',
        }),
      ]),
      el('span', { class: `pill ${stateTone(order.state)}`, text: order.state || 'Réservation' }),
    ]),
    el('p', {
      text: order.start
        ? `${toMobilysDate(order.start)} · ${formatTime(order.start)}${order.end ? ` – ${formatTime(order.end)}` : ''}`
        : 'Horaires à confirmer',
    }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Voir',
        onClick: () => showOrderDetail(order),
      }),
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        text: 'Annuler',
        onClick: () => cancelOrder(order),
      }),
    ]),
  ]);
}

function stateTone(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('annul') || v.includes('refus')) return 'error';
  if (v.includes('attente') || v.includes('pending')) return 'warning';
  if (v.includes('confirm') || v.includes('valid') || v.includes('accept')) return 'success';
  return '';
}

async function showOrderDetail(order) {
  openSheet(
    el('div', {}, [
      el('h2', { text: order.title }),
      el('p', { class: 'muted', text: 'Chargement du détail Mobilys…' }),
    ])
  );
  try {
    const [detail, resources] = await Promise.all([
      api.orderDetail(order.id).catch(() => null),
      api.orderResources(order.id).catch(() => null),
    ]);
    openSheet(
      el('div', { class: 'stack' }, [
        el('h2', { text: order.title }),
        el('p', {
          text: order.start
            ? `${toMobilysDate(order.start)} · ${formatTime(order.start)}${order.end ? ` – ${formatTime(order.end)}` : ''}`
            : '',
        }),
        el('pre', {
          style: 'white-space:pre-wrap;font-size:12px;background:#f5f8fa;padding:12px;border-radius:12px;overflow:auto',
          text: JSON.stringify({ detail, resources }, null, 2).slice(0, 2500),
        }),
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', text: 'Fermer', onClick: closeSheet }),
          el('button', {
            class: 'btn btn-danger',
            type: 'button',
            text: 'Annuler la réservation',
            onClick: () => cancelOrder(order),
          }),
        ]),
      ])
    );
  } catch (err) {
    toast(err.message, 'error');
    closeSheet();
  }
}

async function cancelOrder(order) {
  if (!order?.id) return toast('Identifiant de commande manquant', 'error');
  if (!confirm(`Annuler la réservation « ${order.title} » ?`)) return;
  try {
    const res = await api.cancelOrders([order.id], 'Annulation depuis l’app réservations', true);
    toast(res.message || 'Réservation annulée');
    pushNotif('Annulation', res.message || `Commande ${order.id} annulée`);
    closeSheet();
    await refreshData();
  } catch (err) {
    toast(err.message || 'Annulation impossible', 'error');
  }
}

function viewCalendar() {
  const toolbar = el('div', { class: 'calendar-toolbar' }, [
    el('button', {
      class: 'btn btn-secondary',
      type: 'button',
      text: '‹',
      onClick: () => shiftCalendar(-1),
    }),
    el('div', {
      class: 'grow',
      text:
        state.calendarView === 'month'
          ? formatMonthYear(state.calendarDate)
          : state.calendarView === 'week'
            ? formatWeekRange(state.calendarDate)
            : formatDayHeading(state.calendarDate),
    }),
    el('button', {
      class: 'btn btn-secondary',
      type: 'button',
      text: '›',
      onClick: () => shiftCalendar(1),
    }),
    el('button', {
      class: 'btn btn-secondary',
      type: 'button',
      text: 'Aujourd’hui',
      onClick: () => {
        state.calendarDate = new Date();
        render();
      },
    }),
  ]);

  const switcher = el('div', { class: 'view-switch' }, [
    viewBtn('list', 'Agenda'),
    viewBtn('day', 'Jour'),
    viewBtn('week', 'Semaine'),
    viewBtn('month', 'Mois'),
  ]);

  const roomSelect = el(
    'label',
    { class: 'field', style: 'margin:12px 0' },
    [
      el('span', { text: 'Salle' }),
      el(
        'select',
        {
          onChange: async (e) => {
            state.selectedRoomId = e.target.value ? Number(e.target.value) : null;
            await loadOccupation();
            render();
          },
        },
        [
          el('option', { value: '', text: 'Toutes / choisir une salle' }),
          ...state.rooms.map((room) =>
            el('option', {
              value: String(room.id),
              text: `${room.name}${room.location ? ` · ${room.location}` : ''}`,
              selected: String(room.id) === String(state.selectedRoomId),
            })
          ),
        ]
      ),
    ]
  );

  const body =
    state.calendarView === 'month'
      ? monthView()
      : state.calendarView === 'week'
        ? weekView()
        : state.calendarView === 'day'
          ? dayView()
          : listView();

  return el('div', { class: 'layout-split' }, [
    el('div', {}, [toolbar, switcher, roomSelect, body]),
    el('aside', { class: 'panel stack' }, [
      el('h2', { style: 'margin:0;font-family:var(--font-display);font-size:1.25rem', text: 'Détails' }),
      el('p', {
        class: 'muted',
        text: state.selectedRoomId
          ? `Occupation chargée pour la salle #${state.selectedRoomId}.`
          : 'Sélectionne une salle pour charger les créneaux Mobilys (getOccupation).',
      }),
      ...(state.occupation || []).slice(0, 8).map((slot) =>
        el('div', { class: 'event' }, [
          el('strong', { text: Array.isArray(slot.availableV2) ? `${slot.availableV2.length} créneaux` : 'Occupation' }),
          el('p', { class: 'muted', text: JSON.stringify(slot).slice(0, 120) }),
        ])
      ),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Réserver ce jour',
        onClick: () => {
          state.booking.date = toISODate(state.calendarDate);
          if (state.selectedRoomId) state.booking.roomId = state.selectedRoomId;
          state.booking.step = state.selectedRoomId ? 3 : 1;
          setRoute('book');
        },
      }),
    ]),
  ]);
}

function viewBtn(id, label) {
  return el('button', {
    type: 'button',
    class: state.calendarView === id ? 'active' : '',
    text: label,
    onClick: () => {
      state.calendarView = id;
      render();
    },
  });
}

function shiftCalendar(dir) {
  const d = new Date(state.calendarDate);
  if (state.calendarView === 'month') d.setMonth(d.getMonth() + dir);
  else if (state.calendarView === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setDate(d.getDate() + dir);
  state.calendarDate = d;
  render();
}

async function loadOccupation() {
  if (!state.selectedRoomId) {
    state.occupation = [];
    return;
  }
  const start = toMobilysDate(state.calendarDate);
  const end = toMobilysDate(
    state.calendarView === 'month'
      ? addDays(state.calendarDate, 30)
      : state.calendarView === 'week'
        ? addDays(startOfWeek(state.calendarDate), 6)
        : state.calendarDate
  );
  try {
    const data = await api.getOccupation({
      start,
      end,
      id: state.selectedRoomId,
    });
    state.occupation = Array.isArray(data) ? data : data?.data || [];
  } catch (err) {
    state.occupation = [];
    toast(err.message || 'Occupation indisponible', 'error');
  }
}

function ordersForDay(date) {
  return normalizeOrders(state.orders).filter((o) => o.start && sameDay(o.start, date));
}

function monthView() {
  const first = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(start, i);
    const inMonth = day.getMonth() === state.calendarDate.getMonth();
    const events = ordersForDay(day);
    cells.push(
      el('button', {
        type: 'button',
        class: `day-cell${inMonth ? '' : ' muted'}${sameDay(day, new Date()) ? ' today' : ''}`,
        onClick: () => {
          state.calendarDate = day;
          state.calendarView = 'day';
          render();
        },
      }, [
        el('span', { class: 'n', text: String(day.getDate()) }),
        el(
          'div',
          { class: 'dot-row' },
          events.slice(0, 3).map(() => el('span', { class: 'dot' }))
        ),
      ])
    );
  }
  return el('div', { class: 'month-grid' }, [
    ...['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => el('div', { class: 'dow', text: d })),
    ...cells,
  ]);
}

function weekView() {
  const start = startOfWeek(state.calendarDate);
  return el(
    'div',
    { class: 'week-grid' },
    Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const events = ordersForDay(day);
      return el('div', { class: `week-col${sameDay(day, new Date()) ? ' today' : ''}` }, [
        el('strong', { text: formatDayHeading(day).split(' ').slice(0, 2).join(' ') }),
        ...events.map((ev) =>
          el('button', {
            type: 'button',
            class: 'event',
            style: 'margin-top:8px;width:100%;text-align:left',
            onClick: () => showOrderDetail(ev),
          }, [
            el('strong', { text: ev.title }),
            el('p', { class: 'muted', text: formatTime(ev.start) }),
          ])
        ),
        !events.length ? el('p', { class: 'muted', text: 'Libre' }) : null,
      ]);
    })
  );
}

function dayView() {
  const events = ordersForDay(state.calendarDate);
  return el('div', { class: 'day-timeline' }, [
    el('div', { class: `day-block${sameDay(state.calendarDate, new Date()) ? ' today' : ''}` }, [
      el('strong', { text: formatDayHeading(state.calendarDate) }),
      events.length
        ? el('div', { class: 'stack', style: 'margin-top:12px' }, events.map(orderCard))
        : el('p', { class: 'muted', text: 'Aucun événement ce jour.' }),
    ]),
  ]);
}

function listView() {
  const start = startOfWeek(state.calendarDate);
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  return el(
    'div',
    { class: 'stack' },
    days.map((day) => {
      const events = ordersForDay(day);
      return el('section', { class: 'panel' }, [
        el('strong', { text: formatDayHeading(day) }),
        events.length
          ? el('div', { class: 'stack', style: 'margin-top:10px' }, events.map(orderCard))
          : el('p', { class: 'muted', text: 'Rien de prévu' }),
      ]);
    })
  );
}

function viewBook() {
  const b = state.booking;
  const steps = ['Date', 'Salle', 'Créneau', 'Confirmation'];
  const stepRow = el(
    'div',
    { class: 'steps' },
    steps.map((label, i) =>
      el('div', {
        class: `step${b.step === i + 1 ? ' active' : ''}${b.step > i + 1 ? ' done' : ''}`,
        text: `${i + 1}. ${label}`,
      })
    )
  );

  let body;
  if (b.step === 1) body = bookStepDate();
  else if (b.step === 2) body = bookStepRoom();
  else if (b.step === 3) body = bookStepSlot();
  else body = bookStepConfirm();

  return el('div', { class: 'wizard' }, [stepRow, body]);
}

function bookStepDate() {
  return el('div', { class: 'stack' }, [
    el('h2', { style: 'margin:0;font-family:var(--font-display)', text: 'Choisir la date' }),
    el('label', { class: 'field' }, [
      el('span', { text: 'Date' }),
      el('input', {
        type: 'date',
        value: state.booking.date,
        onChange: (e) => {
          state.booking.date = e.target.value;
        },
      }),
    ]),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Continuer',
        onClick: () => {
          state.booking.step = 2;
          render();
        },
      }),
    ]),
  ]);
}

function bookStepRoom() {
  const q = state.search.trim().toLowerCase();
  const rooms = state.rooms.filter((room) => {
    if (!q) return true;
    return [room.name, room.location, String(room.id)].join(' ').toLowerCase().includes(q);
  });

  return el('div', { class: 'stack' }, [
    el('h2', { style: 'margin:0;font-family:var(--font-display)', text: 'Choisir la salle' }),
    el('div', { class: 'search-bar' }, [
      el('input', {
        type: 'search',
        placeholder: 'Recherche salle, localisation…',
        value: state.search,
        onInput: debounce((e) => {
          state.search = e.target.value;
          render();
        }, 120),
      }),
    ]),
    rooms.length
      ? el(
          'div',
          { class: 'stack' },
          rooms.map((room) =>
            el('button', {
              type: 'button',
              class: 'room',
              style: `text-align:left;border-color:${String(state.booking.roomId) === String(room.id) ? 'var(--primary)' : 'var(--line)'}`,
              onClick: () => {
                state.booking.roomId = room.id;
                state.selectedRoomId = room.id;
                state.booking.step = 3;
                render();
                loadOccupation().then(render);
              },
            }, [
              el('div', { class: 'room-top' }, [
                el('strong', { text: room.name }),
                room.instant ? el('span', { class: 'pill success', text: 'Direct' }) : null,
              ]),
              el('p', {
                class: 'muted',
                text: [room.location, room.capacity ? `${room.capacity} places` : null].filter(Boolean).join(' · '),
              }),
            ])
          )
        )
      : el('p', {
          class: 'empty',
          text: state.places.length
            ? `Sites connus : ${state.places.map((p) => p.text).join(', ')}. Aucune salle listée — vérifie les droits Mobilys.`
            : 'Aucune salle renvoyée par getReservations.',
        }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Retour',
        onClick: () => {
          state.booking.step = 1;
          render();
        },
      }),
    ]),
  ]);
}

function bookStepSlot() {
  const slots = buildSlotSuggestions();
  return el('div', { class: 'stack' }, [
    el('h2', { style: 'margin:0;font-family:var(--font-display)', text: 'Choisir le créneau' }),
    el('div', { class: 'field-row', style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, [
      el('label', { class: 'field' }, [
        el('span', { text: 'Début' }),
        el('input', {
          type: 'time',
          value: state.booking.start,
          onChange: (e) => {
            state.booking.start = e.target.value;
          },
        }),
      ]),
      el('label', { class: 'field' }, [
        el('span', { text: 'Fin' }),
        el('input', {
          type: 'time',
          value: state.booking.end,
          onChange: (e) => {
            state.booking.end = e.target.value;
          },
        }),
      ]),
    ]),
    el('div', { class: 'slot-list' }, slots.map((slot) =>
      el('button', {
        type: 'button',
        class: `slot ${slot.busy ? 'busy' : 'available'}${state.booking.start === slot.start ? ' selected' : ''}`,
        text: slot.start,
        disabled: slot.busy,
        onClick: () => {
          state.booking.start = slot.start;
          state.booking.end = slot.end;
          render();
        },
      })
    )),
    state.booking.conflict
      ? el('div', { class: 'conflict-box' }, [
          el('strong', { text: 'Cette salle est déjà réservée.' }),
          el('p', { text: state.booking.conflict }),
          state.booking.suggestions.length
            ? el(
                'div',
                { class: 'suggest-list' },
                state.booking.suggestions.map((s) =>
                  el('button', {
                    class: 'btn btn-secondary',
                    type: 'button',
                    text: s.label,
                    onClick: () => {
                      if (s.roomId) state.booking.roomId = s.roomId;
                      if (s.start) state.booking.start = s.start;
                      if (s.end) state.booking.end = s.end;
                      state.booking.conflict = null;
                      render();
                    },
                  })
                )
              )
            : null,
        ])
      : null,
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Retour',
        onClick: () => {
          state.booking.step = 2;
          render();
        },
      }),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Vérifier & continuer',
        onClick: () => checkAndContinue(),
      }),
    ]),
  ]);
}

function buildSlotSuggestions() {
  const busy = new Set();
  (state.occupation || []).forEach((block) => {
    (block.availableV2 || []).forEach((t) => {
      const d = parseFlexibleDate(t) || (typeof t === 'string' && t.length === 5 ? null : null);
      if (typeof t === 'string' && /^\d{2}:\d{2}/.test(t)) busy.add(t.slice(0, 5));
      else if (d) busy.add(formatTime(d));
    });
  });
  // availableV2 means available times in Mobilys — invert naming carefully:
  // In Mobilys modal, availableV2 are selectable available hours.
  const available = new Set();
  (state.occupation || []).forEach((block) => {
    (block.availableV2 || block.available || []).forEach((t) => {
      if (typeof t === 'string' && /^\d{2}:\d{2}/.test(t)) available.add(t.slice(0, 5));
      else {
        const d = parseFlexibleDate(t);
        if (d) available.add(formatTime(d));
      }
    });
  });

  const hours = [];
  for (let h = 8; h <= 20; h += 1) {
    for (const m of [0, 30]) {
      if (h === 20 && m) continue;
      const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const endH = m === 30 ? h + 1 : h;
      const endM = m === 30 ? 0 : 30;
      const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      const isAvailable = available.size ? available.has(start) : true;
      hours.push({ start, end, busy: !isAvailable });
    }
  }
  return hours;
}

async function checkAndContinue() {
  const b = state.booking;
  if (!b.roomId) return toast('Choisis une salle', 'error');
  try {
    const res = await api.checkDates({
      vStartDate: toMobilysDate(b.date),
      vEndDate: toMobilysDate(b.date),
      vStartHour: b.start,
      vEndHour: b.end,
      vLieu: b.roomId,
      vCart: 0,
    });
    if (res.available === false || res.error) {
      state.booking.conflict = res.message || 'Cette salle est déjà réservée.';
      state.booking.suggestions = suggestAlternatives();
      pushNotif('Conflit', state.booking.conflict);
      render();
      return;
    }
    state.booking.conflict = null;
    state.booking.step = 4;
    render();
  } catch (err) {
    // Some tenants timeout checkDates when unauthenticated / incomplete — still allow confirm step with warning
    state.booking.conflict = err.message;
    state.booking.suggestions = suggestAlternatives();
    toast(err.message || 'Vérification indisponible', 'error');
    render();
  }
}

function suggestAlternatives() {
  const b = state.booking;
  const otherRooms = state.rooms.filter((r) => String(r.id) !== String(b.roomId)).slice(0, 3);
  const altTimes = [
    { start: '10:00', end: '11:00' },
    { start: '14:00', end: '15:00' },
    { start: '16:00', end: '17:00' },
  ].filter((t) => t.start !== b.start);
  return [
    ...otherRooms.map((r) => ({ label: `Autre salle · ${r.name}`, roomId: r.id })),
    ...altTimes.map((t) => ({ label: `Autre horaire · ${t.start}–${t.end}`, start: t.start, end: t.end })),
  ];
}

function bookStepConfirm() {
  const room = state.rooms.find((r) => String(r.id) === String(state.booking.roomId));
  const b = state.booking;
  return el('div', { class: 'stack' }, [
    el('h2', { style: 'margin:0;font-family:var(--font-display)', text: 'Confirmation' }),
    el('div', { class: 'event' }, [
      el('strong', { text: room?.name || `Salle #${b.roomId}` }),
      el('p', { text: `${toMobilysDate(b.date)} · ${b.start} – ${b.end}` }),
      el('p', { class: 'muted', text: room?.location || '' }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { text: 'Activité' }),
      el('input', {
        value: b.activity,
        placeholder: 'Ex. Répétition, cours…',
        onInput: (e) => {
          b.activity = e.target.value;
        },
      }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { text: 'Participants' }),
      el('input', {
        type: 'number',
        min: '1',
        value: String(b.participants),
        onInput: (e) => {
          b.participants = Number(e.target.value || 1);
        },
      }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { text: 'Remarque' }),
      el('textarea', {
        text: b.note,
        onInput: (e) => {
          b.note = e.target.value;
        },
      }),
    ]),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Retour',
        onClick: () => {
          b.step = 3;
          render();
        },
      }),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Confirmer la réservation',
        onClick: () => submitBooking(),
      }),
    ]),
  ]);
}

async function submitBooking() {
  const b = state.booking;
  try {
    const check = await api.checkDates({
      vStartDate: toMobilysDate(b.date),
      vEndDate: toMobilysDate(b.date),
      vStartHour: b.start,
      vEndHour: b.end,
      vLieu: b.roomId,
      vCart: 0,
    }).catch(() => ({ available: true }));

    if (check.available === false) {
      state.booking.conflict = check.message || 'Cette salle est déjà réservée.';
      state.booking.suggestions = suggestAlternatives();
      state.booking.step = 3;
      pushNotif('Conflit', state.booking.conflict);
      render();
      return;
    }

    const added = await api.addToCart({
      start: toMobilysDate(b.date),
      end: toMobilysDate(b.date),
      timeStart: b.start,
      timeEnd: b.end,
      activity: b.activity || '',
      nbParticipant: b.participants || 1,
      remarque: b.note || '',
      id: b.roomId,
      cartID: 0,
    });

    if (added.error) {
      toast(added.message || 'Ajout au panier impossible', 'error');
      pushNotif('Erreur réservation', added.message || 'Échec addToCart');
      return;
    }

    const order = await api.createOrder({
      cgAccepted: true,
      institution: INSTITUTION,
      withoutConf: false,
    });

    if (order.error) {
      toast(order.message || 'Création de commande impossible', 'error');
      pushNotif('Erreur commande', order.message || 'Échec createOrder');
      return;
    }

    toast(order.message || added.message || 'Réservation créée');
    pushNotif('Création', order.message || 'Réservation enregistrée dans Mobilys');
    state.booking = {
      step: 1,
      date: toISODate(new Date()),
      roomId: null,
      start: '09:00',
      end: '10:00',
      activity: '',
      participants: 1,
      note: '',
      conflict: null,
      suggestions: [],
    };
    await refreshData();
    setRoute('mine');
  } catch (err) {
    toast(err.message || 'Échec de réservation', 'error');
    pushNotif('Erreur', err.message || 'Échec de réservation');
  }
}

function viewMine() {
  const q = state.search.trim().toLowerCase();
  const orders = normalizeOrders(state.orders).filter((o) => {
    if (!q) return true;
    return [o.title, o.location, o.activity, o.state, String(o.id)].join(' ').toLowerCase().includes(q);
  });

  return el('div', {}, [
    el('div', { class: 'search-bar' }, [
      el('input', {
        type: 'search',
        placeholder: 'Recherche salle, enseignant, activité, date…',
        value: state.search,
        onInput: debounce((e) => {
          state.search = e.target.value;
          render();
        }, 120),
      }),
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Actualiser',
        onClick: () => refreshData(),
      }),
    ]),
    orders.length
      ? el('div', { class: 'stack' }, orders.map(orderCard))
      : el('p', {
          class: 'empty panel',
          text: 'Aucune réservation trouvée. Les commandes Mobilys apparaissent ici après synchronisation.',
        }),
  ]);
}

function viewProfile() {
  return el('div', { class: 'panel stack' }, [
    el('h2', { style: 'margin:0;font-family:var(--font-display)', text: 'Profil' }),
    el('p', { text: `Institution : ${INSTITUTION}` }),
    el('p', { text: `API : ${state.proxyOk ? 'Proxy local OK → mweb.dalcroze.ch' : 'Proxy indisponible'}` }),
    el('p', {
      class: 'muted',
      text: state.user
        ? JSON.stringify(state.user).slice(0, 280)
        : 'Session Mobilys connectée (détails limités).',
    }),
    el('p', {
      class: 'muted',
      text: `Salles chargées : ${state.rooms.length} · Sites : ${state.places.map((p) => p.text).join(', ') || '—'}`,
    }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: 'Rafraîchir la session',
        onClick: () => refreshData(),
      }),
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        text: 'Se déconnecter',
        onClick: async () => {
          try {
            await api.logout().catch(() => api.frontendLogout());
          } catch {
            /* ignore */
          }
          state.connected = false;
          state.user = null;
          state.rooms = [];
          state.orders = [];
          pushNotif('Déconnexion', 'Session fermée');
          setRoute('login');
        },
      }),
    ]),
  ]);
}

boot();
