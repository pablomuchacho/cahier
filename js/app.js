import {
  applyTimetable,
  countHomeworkByClass,
  DEFAULT_CLASSES,
  DEFAULT_SCHEDULE,
  deleteHomework,
  deleteSlot,
  getHomeworkByWeek,
  getSchedule,
  getSettings,
  putHomework,
  putSlot,
  saveSettings,
  TIMETABLE_VERSION,
} from './db.js?v=10';

const STATUS_LABELS = {
  todo: 'À faire',
  repeat: 'À revoir',
  done: 'Validé',
};

const DAYS = [
  { id: '0', label: 'Lundi' },
  { id: '1', label: 'Mardi' },
  { id: '2', label: 'Mercredi' },
  { id: '3', label: 'Jeudi' },
  { id: '4', label: 'Vendredi' },
  { id: '5', label: 'Samedi' },
  { id: '6', label: 'Dimanche' },
];

const state = {
  tab: 'homework',
  weekStart: mondayOf(new Date()),
  filter: 'all',
  items: [],
  slots: [],
  settings: null,
  editingSlotId: null,
  pendingSlotId: null,
  pendingClassType: null,
  recording: false,
  recognition: null,
  transcript: '',
  sessionFinal: '',
  interim: '',
  dictationSaved: false,
  objectUrls: [],
  expandedSlotIds: new Set(),
};

const els = {
  list: document.getElementById('list'),
  filters: document.getElementById('filters'),
  weekLabel: document.getElementById('week-label'),
  progressText: document.getElementById('progress-text'),
  progressBar: document.getElementById('progress-bar'),
  todayHint: document.getElementById('today-hint'),
  record: document.getElementById('record'),
  recordLabel: document.getElementById('record-label'),
  dictationLive: document.getElementById('dictation-live'),
  sheet: document.getElementById('sheet'),
  form: document.getElementById('homework-form'),
  notes: document.getElementById('notes'),
  classPicks: document.getElementById('class-picks'),
  sheetTitle: document.getElementById('sheet-title'),
  toast: document.getElementById('toast'),
  classSheet: document.getElementById('class-sheet'),
  classList: document.getElementById('class-list'),
  classForm: document.getElementById('class-form'),
  className: document.getElementById('class-name'),
  viewHomework: document.getElementById('view-homework'),
  viewPlanning: document.getElementById('view-planning'),
  schedule: document.getElementById('schedule'),
  slotSheet: document.getElementById('slot-sheet'),
  slotForm: document.getElementById('slot-form'),
  slotTitle: document.getElementById('slot-title'),
  slotSubmit: document.getElementById('slot-submit'),
  dayPicks: document.getElementById('day-picks'),
  slotClassPicks: document.getElementById('slot-class-picks'),
  slotStart: document.getElementById('slot-start'),
  slotEnd: document.getElementById('slot-end'),
  slotRoom: document.getElementById('slot-room'),
  slotNotes: document.getElementById('slot-notes'),
  pageWord: document.getElementById('page-word'),
};

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toKey(d);
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, days) {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

function formatWeek(key) {
  const start = fromKey(key);
  const end = fromKey(addDays(key, 6));
  const monthStart = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(start);
  const monthEnd = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(end);
  return `${monthStart} — ${monthEnd}`;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function classLabel(id) {
  return state.settings?.classes?.find((item) => item.id === id)?.label || id;
}

function slugify(label) {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `cours-${Date.now()}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slotForClass(classType) {
  return state.slots.find((slot) => slot.classType === classType);
}

function slotLabel(slot) {
  if (!slot) return '';
  const day = DAYS[slot.day]?.label || '';
  const room = slot.room ? ` · salle ${slot.room}` : '';
  const prof = slot.notes ? ` · ${slot.notes}` : '';
  return `${day} ${slot.start}–${slot.end}${room}${prof}`;
}

function courseOptions() {
  const classes = state.settings?.classes || [];
  const scheduleIds = [...new Set(state.slots.map((slot) => slot.classType))];
  const first = scheduleIds.map((id) => classes.find((item) => item.id === id)).filter(Boolean);
  const rest = classes.filter((item) => !scheduleIds.includes(item.id));
  return [...first, ...rest];
}

function coursesToShow() {
  const options = courseOptions();
  const used = new Set([
    ...state.slots.map((slot) => slot.classType),
    ...state.items.map((item) => item.classType),
  ]);
  if (state.filter !== 'all') return options.filter((item) => item.id === state.filter);
  const scheduled = options.filter((item) => used.has(item.id) || state.slots.some((slot) => slot.classType === item.id));
  return scheduled.length ? scheduled : options;
}

function itemsForCourse(classType) {
  return state.items.filter((item) => item.classType === classType);
}

async function refresh() {
  try {
    state.settings = await getSettings();
  } catch {
    state.settings = {
      classes: DEFAULT_CLASSES.map((item) => ({ ...item })),
      lastClassType: 'solfege',
    };
  }

  try {
    if (state.settings.timetableVersion !== TIMETABLE_VERSION) {
      state.settings = await applyTimetable(state.settings);
    }
    state.slots = await getSchedule();
  } catch (error) {
    console.error(error);
    state.slots = [];
  }

  if (!state.slots.length) {
    state.slots = DEFAULT_SCHEDULE.map((slot) => ({ ...slot }));
    applyTimetable(state.settings).catch((error) => console.error(error));
  }

  state.items = await getHomeworkByWeek(state.weekStart).catch(() => []);
  revokeUrls();
  renderWeek();
  renderFilters();
  renderList();
  renderSchedule();
}

function renderWeek() {
  const current = mondayOf(new Date());
  els.weekLabel.textContent = formatWeek(state.weekStart);
  els.todayHint.textContent = state.weekStart === current ? 'Cette semaine' : 'Autre semaine — clique la date pour revenir';

  const total = state.items.length;
  const done = state.items.filter((item) => item.status === 'done').length;
  const repeat = state.items.filter((item) => item.status === 'repeat').length;
  if (!total) {
    els.progressText.textContent = 'Aucun devoir cette semaine';
    if (els.progressBar) els.progressBar.style.left = '0%';
    return;
  }
  els.progressText.textContent = `${done}/${total} validé${done > 1 ? 's' : ''}${
    repeat ? ` · ${repeat} à revoir` : ''
  }`;
  if (els.progressBar) els.progressBar.style.left = `${Math.round((done / total) * 100)}%`;
}

function renderFilters() {
  const courses = courseOptions().filter((item) =>
    state.slots.some((slot) => slot.classType === item.id) ||
    state.items.some((homework) => homework.classType === item.id)
  );
  const chips = [{ id: 'all', label: 'Tous les cours' }, ...courses];
  els.filters.innerHTML = chips
    .map((chip) => {
      const count = chip.id === 'all'
        ? state.items.length
        : itemsForCourse(chip.id).length;
      return `<button type="button" class="${state.filter === chip.id ? 'active' : ''}" data-filter="${chip.id}">
        ${escapeHtml(chip.label)} ${count}
      </button>`;
    })
    .join('');
}

function homeworkActions(item) {
  const validate = item.status === 'done'
    ? `<button type="button" class="btn-action btn-undo" data-action="todo" data-id="${item.id}">↺ Refaire</button>`
    : `<button type="button" class="btn-action btn-validate" data-action="done" data-id="${item.id}">✓ Valider</button>`;
  const repeat = item.status === 'repeat'
    ? ''
    : `<button type="button" class="btn-action btn-repeat" data-action="repeat" data-id="${item.id}">À revoir</button>`;
  return `
    ${validate}
    ${repeat}
    <button type="button" class="btn-action btn-postpone" data-action="next-week" data-id="${item.id}" title="Reporter à la semaine suivante">+7j</button>
    <button type="button" class="btn-action btn-delete" data-action="delete" data-id="${item.id}" title="Supprimer">✕</button>`;
}

function homeworkCard(item) {
  const repeats = item.repeatCount ? `<span class="badge-repeat-count">Répété ${item.repeatCount}×</span>` : '';
  const statusLabel = STATUS_LABELS[item.status] || item.status;
  const statusSymbol = item.status === 'done' ? '✓' : item.status === 'repeat' ? '⟳' : '●';
  return `
    <article class="item item-${item.status}">
      <div class="item-head">
        <span class="badge badge-${item.status}">${statusSymbol} ${statusLabel}</span>
        ${repeats}
      </div>
      <p class="item-notes">${escapeHtml(item.notes)}</p>
      <div class="item-actions">${homeworkActions(item)}</div>
    </article>`;
}

function renderList() {
  const groups = coursesToShow();
  if (!groups.length) {
    els.list.innerHTML = `<p class="course-empty">Aucun cours actif. Ajoute-en un avec « Gérer les cours ».</p>`;
    return;
  }

  els.list.innerHTML = groups.map((course, index) => {
    const slot = slotForClass(course.id);
    const items = itemsForCourse(course.id);
    const done = items.filter((item) => item.status === 'done').length;
    const num = String(index + 1).padStart(2, '0');
    const cards = items.length
      ? items.map(homeworkCard).join('')
      : `<p class="course-empty">Aucun devoir à faire</p>`;
    return `
      <article class="course-card">
        <div class="course-head">
          <div class="course-info">
            <span class="course-index">${num}</span>
            <div>
              <h2 class="course-title">${escapeHtml(course.label)}</h2>
              <p class="course-meta">
                ${slot ? `<span class="course-schedule">${escapeHtml(slotLabel(slot))}</span> · ` : ''}
                <span class="course-counter">${done}/${items.length} validé${done > 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>
          <button type="button" class="btn-dictate-course" data-add-course="${course.id}" title="Dicter un devoir pour ${escapeHtml(course.label)}">
            <span class="mic-dot" aria-hidden="true"></span>
            <span>Dicter</span>
          </button>
        </div>
        <div class="course-body">
          ${cards}
        </div>
      </article>`;
  }).join('');
}

function renderSchedule() {
  const today = state.weekStart === mondayOf(new Date()) ? (new Date().getDay() + 6) % 7 : -1;
  const slots = state.slots.length ? state.slots : DEFAULT_SCHEDULE;

  els.schedule.innerHTML = DAYS.map((day) => {
    const daySlots = slots.filter((slot) => String(slot.day) === day.id);
    const isToday = Number(day.id) === today;
    const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      fromKey(addDays(state.weekStart, Number(day.id)))
    );

    const rows = daySlots.length
      ? daySlots.map((slot) => {
        const slotId = String(slot.id || `${slot.day}-${slot.start}-${slot.classType}`);
        const isExpanded = state.expandedSlotIds.has(slotId);
        const related = state.items.filter((item) => item.classType === slot.classType);
        const totalHw = related.length;
        const doneHw = related.filter((item) => item.status === 'done').length;
        const pendingHw = totalHw - doneHw;

        let hwPill = '';
        if (totalHw === 0) {
          hwPill = `<span class="slot-hw-pill is-none">0 devoir</span>`;
        } else if (pendingHw === 0) {
          hwPill = `<span class="slot-hw-pill is-done">✓ ${totalHw} fait${totalHw > 1 ? 's' : ''}</span>`;
        } else {
          hwPill = `<span class="slot-hw-pill is-pending">● ${pendingHw} à faire</span>`;
        }

        const hwDetails = isExpanded ? `
          <div class="slot-details">
            <div class="slot-details-head">
              <div class="slot-details-title">
                <h4>Devoirs de ${escapeHtml(classLabel(slot.classType))}</h4>
                <span class="slot-details-count">${totalHw} devoir${totalHw > 1 ? 's' : ''}${totalHw ? ` · ${doneHw} validé${doneHw > 1 ? 's' : ''}` : ''}</span>
              </div>
              <div class="slot-details-quick-actions">
                <button type="button" class="btn-action btn-dictate-sm" data-add-course="${slot.classType}" title="Dicter un devoir pour ${escapeHtml(classLabel(slot.classType))}">
                  <span class="mic-dot" aria-hidden="true"></span>
                  <span>Dicter</span>
                </button>
                <button type="button" class="btn-action btn-write-sm" data-write-course="${slot.classType}" title="Écrire un devoir">
                  + Écrire
                </button>
              </div>
            </div>

            ${totalHw ? `
              <div class="slot-hw-list">
                ${related.map((item) => `
                  <div class="slot-hw-card item-${item.status}">
                    <div class="slot-hw-top">
                      <span class="badge badge-${item.status}">
                        ${item.status === 'done' ? '✓' : item.status === 'repeat' ? '⟳' : '●'} ${STATUS_LABELS[item.status]}
                      </span>
                      ${item.repeatCount ? `<span class="badge-repeat-count">Répété ${item.repeatCount}×</span>` : ''}
                    </div>
                    <p class="slot-hw-text">${escapeHtml(item.notes)}</p>
                    <div class="item-actions">${homeworkActions(item)}</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="slot-hw-empty">
                <p>Aucun devoir enregistré pour ce cours cette semaine.</p>
                <button type="button" class="btn-action btn-dictate-sm" data-add-course="${slot.classType}">
                  <span class="mic-dot" aria-hidden="true"></span>
                  <span>Dicter un devoir</span>
                </button>
              </div>
            `}

            <div class="slot-footer">
              <button type="button" class="btn-subtle" data-slot-edit="${slot.id}">Modifier l’horaire</button>
              <button type="button" class="btn-subtle btn-danger-subtle" data-slot-delete="${slot.id}">Retirer l’horaire</button>
            </div>
          </div>
        ` : '';

        return `
          <article class="slot-card ${isExpanded ? 'is-expanded' : ''}" data-slot-id="${escapeHtml(slotId)}">
            <div class="slot-summary" role="button" tabindex="0" data-slot-toggle="${escapeHtml(slotId)}" aria-expanded="${isExpanded}" title="${isExpanded ? 'Masquer les devoirs' : 'Afficher les devoirs'}">
              <div class="slot-summary-main">
                <div class="slot-summary-top">
                  <span class="slot-time">${escapeHtml(slot.start)} – ${escapeHtml(slot.end)}</span>
                  <h3 class="slot-title">${escapeHtml(classLabel(slot.classType))}</h3>
                </div>
                <p class="slot-location">
                  ${slot.room ? `<span class="slot-tag">Salle ${escapeHtml(slot.room)}</span>` : ''}
                  ${slot.notes ? `<span class="slot-prof">${escapeHtml(slot.notes)}</span>` : ''}
                </p>
              </div>
              <div class="slot-summary-side">
                ${hwPill}
                <span class="slot-chevron" aria-hidden="true">›</span>
              </div>
            </div>
            ${hwDetails}
          </article>`;
      }).join('')
      : `<p class="empty-day">Aucun cours prévu</p>`;

    return `
      <section class="day-row ${isToday ? 'is-today' : ''}">
        <div class="day-head">
          <h2 class="day-title">${day.label} ${isToday ? '<span class="today-tag">Aujourd’hui</span>' : ''}</h2>
          <span class="day-date">${date}</span>
        </div>
        <div class="day-slots">${rows}</div>
      </section>`;
  }).join('');
}

function revokeUrls() {
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
}

function renderChoiceChips(root, items, name, selected) {
  if (!root) return;
  root.innerHTML = items
    .map((item) => {
      const active = String(selected) === String(item.id);
      return `
      <label class="pick ${active ? 'active' : ''}">
        <input type="radio" name="${name}" value="${item.id}" class="sr-only" ${active ? 'checked' : ''} />
        ${escapeHtml(item.label)}
      </label>`;
    })
    .join('');
  root.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => renderChoiceChips(root, items, name, input.value));
  });
}

function openSheet({ title, notes, classType } = {}) {
  if (!state.settings) return;
  els.sheetTitle.textContent = title || 'Nouveau devoir';
  els.notes.value = notes || '';
  state.pendingClassType = classType || state.settings.lastClassType;
  renderChoiceChips(els.classPicks, courseOptions(), 'classType', state.pendingClassType);
  els.sheet.hidden = false;
  els.sheet.style.display = 'flex';
  els.sheet.classList.add('is-open');
  els.notes.focus();
}

function closeSheet() {
  els.sheet.hidden = true;
  els.sheet.style.display = 'none';
  els.sheet.classList.remove('is-open');
  state.pendingClassType = null;
  els.form.reset();
}

function renderClassManager() {
  const canRemove = state.settings.classes.length > 1;
  els.classList.innerHTML = state.settings.classes
    .map((item) => `
      <li>
        <span>${escapeHtml(item.label)}</span>
        <button type="button" data-remove-class="${item.id}" ${canRemove ? '' : 'disabled'}>Retirer</button>
      </li>`)
    .join('');
}

function openClassManager() {
  if (!state.settings) return;
  renderClassManager();
  els.className.value = '';
  els.classSheet.hidden = false;
  els.classSheet.style.display = 'flex';
  els.classSheet.classList.add('is-open');
  els.className.focus();
}

function closeClassManager() {
  els.classSheet.hidden = true;
  els.classSheet.style.display = 'none';
  els.classSheet.classList.remove('is-open');
  els.classForm.reset();
}

function openSlotSheet(slot) {
  if (!state.settings) return;
  state.editingSlotId = slot?.id || null;
  els.slotTitle.textContent = slot ? 'Modifier l’horaire' : 'Ajouter un horaire';
  els.slotSubmit.textContent = slot ? 'Enregistrer l’horaire' : 'Ajouter l’horaire';
  const today = state.weekStart === mondayOf(new Date()) ? (new Date().getDay() + 6) % 7 : 0;
  renderChoiceChips(els.dayPicks, DAYS, 'day', slot ? String(slot.day) : String(Math.max(today, 0)));
  renderChoiceChips(
    els.slotClassPicks,
    state.settings.classes,
    'slotClassType',
    slot?.classType || state.settings.lastClassType
  );
  els.slotStart.value = slot?.start || '14:00';
  els.slotEnd.value = slot?.end || '15:30';
  els.slotRoom.value = slot?.room || '';
  els.slotNotes.value = slot?.notes || '';
  els.slotSheet.hidden = false;
  els.slotSheet.style.display = 'flex';
  els.slotSheet.classList.add('is-open');
  els.slotStart.focus();
}

function closeSlotSheet() {
  els.slotSheet.hidden = true;
  els.slotSheet.style.display = 'none';
  els.slotSheet.classList.remove('is-open');
  state.editingSlotId = null;
  els.slotForm.reset();
}

function setTab(tab) {
  state.tab = tab;
  const planning = tab === 'planning';
  if (els.pageWord) els.pageWord.textContent = planning ? 'Planning' : 'Devoirs';
  els.viewHomework.hidden = planning;
  els.viewPlanning.hidden = !planning;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  if (planning && state.recording) stopRecording();
  if (planning) renderSchedule();
  else renderList();
}

async function removeClass(id) {
  const course = state.settings.classes.find((item) => item.id === id);
  if (!course) return;
  if (state.settings.classes.length <= 1) {
    toast('Garde au moins un cours');
    return;
  }
  const used = await countHomeworkByClass(id);
  const extra = used ? ` ${used} devoir${used > 1 ? 's' : ''} resteront visibles.` : '';
  if (!confirm(`Retirer « ${course.label} » ?${extra}`)) return;
  state.settings.classes = state.settings.classes.filter((item) => item.id !== id);
  if (state.settings.lastClassType === id) {
    state.settings.lastClassType = state.settings.classes[0].id;
  }
  if (state.filter === id) state.filter = 'all';
  await saveSettings(state.settings);
  await refresh();
  renderClassManager();
  toast(`${course.label} retiré`);
}

async function startRecording(classType) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    toast('Dictée vocale indisponible hors-ligne. Écris le devoir ci-dessous.');
    openSheet({ title: 'Nouveau devoir', classType: classType || state.pendingClassType });
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('Dictée indisponible — écris le devoir');
    openSheet({ title: 'Nouveau devoir', classType: classType || state.pendingClassType });
    return;
  }

  if (state.recording) return;
  if (classType) state.pendingClassType = classType;
  else if (state.filter !== 'all') state.pendingClassType = state.filter;

  state.transcript = '';
  state.sessionFinal = '';
  state.interim = '';
  state.dictationSaved = false;
  state.recording = true;
  els.record.classList.add('active');
  els.record.setAttribute('aria-pressed', 'true');
  els.recordLabel.textContent = 'Terminer la dictée';
  updateDictationLive('Parle… dis le cours si tu veux (« piano : … »)');

  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let finals = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) finals += `${piece} `;
      else interim += piece;
    }
    state.sessionFinal = finals.replace(/\s+/g, ' ').trim();
    state.interim = interim.replace(/\s+/g, ' ').trim();
    const live = [state.transcript, state.sessionFinal, state.interim].filter(Boolean).join(' ');
    updateDictationLive(live || 'Parle…');
  };

  recognition.onerror = (event) => {
    state.recording = false;
    resetDictationUi();
    if (event.error === 'not-allowed') {
      toast('Micro désactivé : autorise-le dans Safari');
    } else if (event.error === 'network') {
      toast('Réseau instable pour la voix. Saisie écrite ouverte.');
      openSheet({ title: 'Nouveau devoir', classType: state.pendingClassType });
    } else if (event.error && event.error !== 'no-speech') {
      toast(`Dictée interrompue (${event.error})`);
    }
  };

  recognition.onend = () => {
    commitSession();
    if (!state.recording) return;
    try { recognition.start(); } catch {}
  };

  try {
    recognition.start();
    state.recognition = recognition;
  } catch {
    state.recording = false;
    resetDictationUi();
    toast('Impossible de démarrer la dictée');
  }
}

function updateDictationLive(text) {
  if (!els.dictationLive) return;
  els.dictationLive.hidden = false;
  els.dictationLive.textContent = text;
}

function resetDictationUi() {
  els.record.classList.remove('active');
  els.record.setAttribute('aria-pressed', 'false');
  els.recordLabel.textContent = 'Dicter un devoir';
  if (els.dictationLive) {
    els.dictationLive.hidden = true;
    els.dictationLive.textContent = '';
  }
}

function commitSession() {
  if (!state.sessionFinal) return;
  state.transcript = `${state.transcript} ${state.sessionFinal}`.replace(/\s+/g, ' ').trim();
  state.sessionFinal = '';
}

function finishDictation() {
  if (state.dictationSaved) return;
  state.dictationSaved = true;
  commitSession();
  resetDictationUi();
  saveDictation().catch((error) => {
    console.error(error);
    toast('Dictée non enregistrée');
  });
}

function stopRecording() {
  if (!state.recording) return;
  state.recording = false;
  const recognition = state.recognition;
  state.recognition = null;
  if (!recognition) {
    finishDictation();
    return;
  }
  recognition.onend = () => finishDictation();
  try { recognition.stop(); } catch { finishDictation(); }
  setTimeout(finishDictation, 800);
}

function resolveClassFromSpeech(text) {
  const hay = normalizeText(text);
  const courses = [...(state.settings?.classes || [])]
    .map((course) => ({
      id: course.id,
      needles: [
        normalizeText(course.label),
        normalizeText(course.id.replace(/-/g, ' ')),
      ].filter(Boolean),
    }))
    .sort((a, b) => Math.max(...b.needles.map((n) => n.length)) - Math.max(...a.needles.map((n) => n.length)));

  const aliases = {
    'impro-mouvement': ['impro mouvement', 'improvisation pour le mouvement', 'mouvement', 'pascale'],
    impro: ['improvisation', 'impro', 'sourisse'],
    solfege: ['solfege', 'tamae'],
    'technique-corporelle': ['technique corporelle', 'technique', 'corporelle', 'emilio'],
    rythmique: ['rythmique', 'rhythmique', 'florence'],
    piano: ['piano', 'branchi'],
  };

  for (const course of courses) {
    const extra = aliases[course.id] || [];
    const needles = [...course.needles, ...extra.map(normalizeText)].sort((a, b) => b.length - a.length);
    for (const needle of needles) {
      if (needle.length >= 4 && hay.includes(needle)) return { id: course.id, needle };
    }
  }
  return null;
}

function cleanNotes(text, courseId, needle) {
  let notes = text.trim();
  if (!courseId) return notes;
  const course = state.settings?.classes?.find((item) => item.id === courseId);
  const pieces = [
    course?.label,
    course?.id?.replace(/-/g, ' '),
    needle,
    'improvisation pour le mouvement',
    'technique et créativité corporelle',
    'technique corporelle',
    'solfège',
    'solfege',
    'rythmique',
    'improvisation',
    'impro',
    'piano',
  ].filter(Boolean);
  for (const piece of pieces) {
    const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    notes = notes.replace(new RegExp(escaped, 'ig'), ' ');
  }
  notes = notes
    .replace(/^(pour|en|de|du|devoir|cours)\s+/i, '')
    .replace(/^[\s:,\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return notes || text.trim();
}

async function saveDictation() {
  const raw = `${state.transcript} ${state.sessionFinal} ${state.interim}`.replace(/\s+/g, ' ').trim();
  state.transcript = '';
  state.sessionFinal = '';
  state.interim = '';
  if (!raw) {
    toast('Rien entendu — réessaie');
    state.pendingClassType = null;
    return;
  }

  const detected = resolveClassFromSpeech(raw);
  const classType =
    state.pendingClassType ||
    detected?.id ||
    (state.filter !== 'all' ? state.filter : null) ||
    state.settings.lastClassType ||
    state.settings.classes[0]?.id;

  const notes = cleanNotes(raw, classType, detected?.needle);
  await putHomework({
    id: uid(),
    weekStart: state.weekStart,
    classType,
    notes,
    audio: null,
    status: 'todo',
    repeatCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  state.settings.lastClassType = classType;
  await saveSettings(state.settings);
  state.pendingClassType = null;
  state.filter = classType;
  setTab('homework');
  await refresh();
  toast(`Noté · ${classLabel(classType)}`);
}

async function updateItem(id, patch) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  await putHomework({ ...item, ...patch, updatedAt: Date.now() });
  await refresh();
}

async function handleHomeworkAction(action, id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (action === 'done') {
    await updateItem(id, { status: 'done' });
    toast('Validé');
  } else if (action === 'todo') {
    await updateItem(id, { status: 'todo' });
  } else if (action === 'repeat') {
    await updateItem(id, { status: 'repeat', repeatCount: (item.repeatCount || 0) + 1 });
    toast('À revoir');
  } else if (action === 'next-week') {
    await putHomework({
      ...item,
      id: uid(),
      weekStart: addDays(item.weekStart, 7),
      status: 'todo',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await updateItem(id, { status: 'done' });
    toast('Reporté à la semaine suivante');
  } else if (action === 'delete') {
    if (!confirm('Supprimer ce devoir ?')) return;
    await deleteHomework(id);
    await refresh();
  }
}

function goHome() {
  if (state.recording) stopRecording();
  closeSheet();
  closeClassManager();
  closeSlotSheet();
  state.filter = 'all';
  state.expandedSlotIds.clear();
  state.weekStart = mondayOf(new Date());
  setTab('homework');
  refresh().catch(console.error);
}

const brandHome = document.getElementById('brand-home');
if (brandHome) {
  brandHome.addEventListener('click', goHome);
}

document.getElementById('prev-week').addEventListener('click', async () => {
  state.weekStart = addDays(state.weekStart, -7);
  await refresh();
});

document.getElementById('next-week').addEventListener('click', async () => {
  state.weekStart = addDays(state.weekStart, 7);
  await refresh();
});

els.weekLabel.addEventListener('click', async () => {
  state.weekStart = mondayOf(new Date());
  state.filter = 'all';
  await refresh();
});

els.filters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderFilters();
  renderList();
});

els.record.addEventListener('click', () => {
  if (state.recording) stopRecording();
  else startRecording();
});

document.getElementById('add-text').addEventListener('click', () => {
  if (state.recording) stopRecording();
  openSheet({ title: 'Nouveau devoir' });
});

document.getElementById('manage-classes').addEventListener('click', openClassManager);
document.getElementById('manage-classes-planning').addEventListener('click', openClassManager);
document.getElementById('add-slot').addEventListener('click', () => openSlotSheet());

els.classSheet.addEventListener('click', async (event) => {
  if (event.target.closest('[data-close="classes"]')) {
    closeClassManager();
    return;
  }
  const remove = event.target.closest('[data-remove-class]');
  if (!remove || remove.disabled) return;
  await removeClass(remove.dataset.removeClass);
});

els.classForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = els.className.value.trim();
  if (!label) return;
  const id = slugify(label);
  if (state.settings.classes.some((item) => item.id === id || item.label.toLowerCase() === label.toLowerCase())) {
    toast('Ce cours existe déjà');
    return;
  }
  state.settings.classes.push({ id, label });
  await saveSettings(state.settings);
  els.className.value = '';
  await refresh();
  renderClassManager();
  toast(`${label} ajouté`);
});

els.sheet.addEventListener('click', (event) => {
  if (event.target.closest('[data-close="sheet"]')) closeSheet();
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const notes = els.notes.value.trim();
  if (!notes) {
    toast('Ajoute une consigne');
    return;
  }
  const classType = new FormData(els.form).get('classType') || state.pendingClassType || state.settings.lastClassType;
  await putHomework({
    id: uid(),
    weekStart: state.weekStart,
    classType,
    notes,
    audio: null,
    status: 'todo',
    repeatCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  state.settings.lastClassType = classType;
  await saveSettings(state.settings);
  closeSheet();
  state.filter = classType;
  setTab('homework');
  await refresh();
  toast(`Ajouté à ${classLabel(classType)}`);
});

function onHomeworkClick(event) {
  const add = event.target.closest('[data-add-course]');
  if (add) {
    if (state.recording) stopRecording();
    startRecording(add.dataset.addCourse);
    return;
  }
  const button = event.target.closest('[data-action]');
  if (button) handleHomeworkAction(button.dataset.action, button.dataset.id);
}

els.list.addEventListener('click', onHomeworkClick);
els.schedule.addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-slot-edit]');
  const remove = event.target.closest('[data-slot-delete]');
  const write = event.target.closest('[data-write-course]');
  const toggle = event.target.closest('[data-slot-toggle]');

  if (edit) {
    const slot = state.slots.find((item) => item.id === edit.dataset.slotEdit);
    if (slot) openSlotSheet(slot);
    return;
  }
  if (remove) {
    const slot = state.slots.find((item) => item.id === remove.dataset.slotDelete);
    if (!slot) return;
    if (!confirm(`Retirer ${classLabel(slot.classType)} le ${DAYS[slot.day].label} ?`)) return;
    await deleteSlot(slot.id);
    state.expandedSlotIds.delete(slot.id);
    await refresh();
    toast('Horaire retiré');
    return;
  }
  if (write) {
    if (state.recording) stopRecording();
    openSheet({ title: 'Nouveau devoir', classType: write.dataset.writeCourse });
    return;
  }

  // Devoir actions (valider, répéter, reporter, supprimer, ou dicter)
  const isHomeworkAction = event.target.closest('[data-action]') || event.target.closest('[data-add-course]');
  if (isHomeworkAction) {
    onHomeworkClick(event);
    return;
  }

  // Clic sur l'en-tête du créneau pour afficher / masquer les devoirs (2e étape)
  if (toggle) {
    const slotId = toggle.dataset.slotToggle;
    if (state.expandedSlotIds.has(slotId)) {
      state.expandedSlotIds.delete(slotId);
    } else {
      state.expandedSlotIds.add(slotId);
    }
    renderSchedule();
    return;
  }
});

els.schedule.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    const toggle = event.target.closest('[data-slot-toggle]');
    if (toggle && !event.target.closest('button, input, textarea')) {
      event.preventDefault();
      const slotId = toggle.dataset.slotToggle;
      if (state.expandedSlotIds.has(slotId)) {
        state.expandedSlotIds.delete(slotId);
      } else {
        state.expandedSlotIds.add(slotId);
      }
      renderSchedule();
    }
  }
});

document.querySelector('.tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  const targetTab = button.dataset.tab;
  if (targetTab === 'homework') {
    if (state.tab === 'homework' && state.filter !== 'all') {
      state.filter = 'all';
      renderFilters();
    }
  }
  setTab(targetTab);
});

els.slotSheet.addEventListener('click', (event) => {
  if (event.target.closest('[data-close="slot"]')) closeSlotSheet();
});

// Explicit click bindings for close buttons and backdrops
document.querySelectorAll('[data-close="sheet"]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    closeSheet();
  });
});

document.querySelectorAll('[data-close="classes"]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    closeClassManager();
  });
});

document.querySelectorAll('[data-close="slot"]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    closeSlotSheet();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSheet();
    closeClassManager();
    closeSlotSheet();
  }
});

els.slotForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(els.slotForm);
  const start = els.slotStart.value;
  const end = els.slotEnd.value;
  if (!start || !end) {
    toast('Indique le début et la fin');
    return;
  }
  if (end <= start) {
    toast('La fin doit être après le début');
    return;
  }
  const classType = data.get('slotClassType') || state.settings.lastClassType;
  const existing = state.slots.find((slot) => slot.id === state.editingSlotId);
  await putSlot({
    id: existing?.id || uid(),
    day: Number(data.get('day') ?? 0),
    start,
    end,
    classType,
    room: els.slotRoom.value.trim(),
    notes: els.slotNotes.value.trim(),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
  state.settings.lastClassType = classType;
  await saveSettings(state.settings);
  closeSlotSheet();
  await refresh();
  toast(existing ? 'Horaire modifié' : 'Horaire ajouté');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.recording) stopRecording();
});

// S'assurer que toutes les modales sont bien fermées au démarrage
closeSheet();
closeClassManager();
closeSlotSheet();

refresh().catch(() => toast('Impossible de charger le cahier'));
