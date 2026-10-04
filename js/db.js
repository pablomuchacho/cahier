const DB_NAME = 'cahier-db';
const DB_VERSION = 3;
const HOMEWORK = 'homework';
const SETTINGS = 'settings';
const SCHEDULE = 'schedule';

const DEFAULT_CLASSES = [
  { id: 'impro-mouvement', label: 'Improvisation pour le mouvement' },
  { id: 'impro', label: 'Improvisation' },
  { id: 'solfege', label: 'Solfège' },
  { id: 'technique-corporelle', label: 'Technique et créativité corporelle' },
  { id: 'rythmique', label: 'Rythmique' },
  { id: 'piano', label: 'Piano' },
];

export const TIMETABLE_VERSION = 'hem-2026-09-22';

export const DEFAULT_SCHEDULE = [
  {
    id: 'mon-impro-mouvement',
    day: 0,
    start: '13:30',
    end: '15:00',
    classType: 'impro-mouvement',
    room: '103',
    notes: 'Pascale Rochat Martinet',
  },
  {
    id: 'mon-impro-sourisse',
    day: 0,
    start: '15:20',
    end: '16:40',
    classType: 'impro',
    room: '408',
    notes: 'Laurent Sourisse',
  },
  {
    id: 'tue-tamae',
    day: 1,
    start: '09:00',
    end: '11:00',
    classType: 'solfege',
    room: '103',
    notes: 'Tamaé Gennai',
  },
  {
    id: 'tue-emilio',
    day: 1,
    start: '13:00',
    end: '14:30',
    classType: 'technique-corporelle',
    room: '101',
    notes: 'Emilio Artessero Quesada',
  },
  {
    id: 'wed-rythmique',
    day: 2,
    start: '11:50',
    end: '13:05',
    classType: 'rythmique',
    room: '021',
    notes: 'Florence Jaccottet',
  },
  {
    id: 'thu-piano-branchi',
    day: 3,
    start: '10:45',
    end: '11:30',
    classType: 'piano',
    room: '408',
    notes: 'Sarah Branchi',
  },
];

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HOMEWORK)) {
          const store = db.createObjectStore(HOMEWORK, { keyPath: 'id' });
          store.createIndex('byWeek', 'weekStart', { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS)) {
          db.createObjectStore(SETTINGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SCHEDULE)) {
          const store = db.createObjectStore(SCHEDULE, { keyPath: 'id' });
          store.createIndex('byDay', 'day', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Base locale bloquée — recharge la page'));
    });
  }
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getHomeworkByWeek(weekStart) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HOMEWORK, 'readonly');
    const index = tx.objectStore(HOMEWORK).index('byWeek');
    const request = index.getAll(weekStart);
    request.onsuccess = () => {
      const items = request.result.sort((a, b) => a.createdAt - b.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function putHomework(item) {
  const db = await openDb();
  const tx = db.transaction(HOMEWORK, 'readwrite');
  tx.objectStore(HOMEWORK).put(item);
  await txDone(tx);
}

export async function deleteHomework(id) {
  const db = await openDb();
  const tx = db.transaction(HOMEWORK, 'readwrite');
  tx.objectStore(HOMEWORK).delete(id);
  await txDone(tx);
}

export async function getSettings() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS, 'readonly');
    const request = tx.objectStore(SETTINGS).get('app');
    request.onsuccess = () => {
      const value = request.result;
      resolve(
        value || {
          id: 'app',
          classes: DEFAULT_CLASSES.map((item) => ({ ...item })),
          lastClassType: 'impro',
          seenTip: false,
        }
      );
    };
    request.onerror = () => reject(request.error);
  });
}

export async function countHomeworkByClass(classType) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HOMEWORK, 'readonly');
    const request = tx.objectStore(HOMEWORK).getAll();
    request.onsuccess = () => {
      resolve(request.result.filter((item) => item.classType === classType).length);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSchedule() {
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(SCHEDULE)) return [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SCHEDULE, 'readonly');
      const request = tx.objectStore(SCHEDULE).getAll();
      request.onsuccess = () => {
        resolve(
          request.result.sort((a, b) => a.day - b.day || String(a.start).localeCompare(String(b.start)))
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function putSlot(slot) {
  const db = await openDb();
  const tx = db.transaction(SCHEDULE, 'readwrite');
  tx.objectStore(SCHEDULE).put(slot);
  await txDone(tx);
}

export async function deleteSlot(id) {
  const db = await openDb();
  const tx = db.transaction(SCHEDULE, 'readwrite');
  tx.objectStore(SCHEDULE).delete(id);
  await txDone(tx);
}

export async function replaceSchedule(slots) {
  const current = await getSchedule();
  const db = await openDb();
  const tx = db.transaction(SCHEDULE, 'readwrite');
  const store = tx.objectStore(SCHEDULE);
  for (const item of current) store.delete(item.id);
  const now = Date.now();
  for (const slot of slots) {
    store.put({
      ...slot,
      createdAt: slot.createdAt || now,
      updatedAt: now,
    });
  }
  await txDone(tx);
}

export async function applyTimetable(settings) {
  const classes = [...(settings.classes || [])];
  for (const course of DEFAULT_CLASSES) {
    const existing = classes.find((item) => item.id === course.id);
    if (!existing) classes.push({ ...course });
    else if (course.id === 'impro' && existing.label === 'Impro') existing.label = course.label;
  }
  const next = {
    ...settings,
    classes,
    lastClassType: settings.lastClassType || 'impro',
    timetableVersion: TIMETABLE_VERSION,
  };
  await replaceSchedule(DEFAULT_SCHEDULE);
  await saveSettings(next);
  return next;
}

export async function saveSettings(settings) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS, 'readwrite');
  tx.objectStore(SETTINGS).put({ ...settings, id: 'app' });
  await txDone(tx);
}

export { DEFAULT_CLASSES };
