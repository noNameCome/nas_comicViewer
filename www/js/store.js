const Store = (() => {
  const LIB_KEY = 'mv_libraries';
  const SORT_KEY = 'mv_sort_pref';
  const COLS_KEY = 'mv_cols_pref';
  const HISTORY_KEY = 'mv_history';
  const FAV_KEY = 'mv_favorites';
  const HISTORY_MAX = 60;

  async function getSortPref() {
    const res = await Capacitor.Plugins.Preferences.get({ key: SORT_KEY });
    return res.value || 'name_asc';
  }

  async function setSortPref(pref) {
    await Capacitor.Plugins.Preferences.set({ key: SORT_KEY, value: pref });
  }

  async function getColsPref() {
    const res = await Capacitor.Plugins.Preferences.get({ key: COLS_KEY });
    return parseInt(res.value, 10) || 4;
  }

  async function setColsPref(cols) {
    await Capacitor.Plugins.Preferences.set({ key: COLS_KEY, value: String(cols) });
  }

  async function getLibraries() {
    const res = await Capacitor.Plugins.Preferences.get({ key: LIB_KEY });
    if (!res.value) return [];
    try { return JSON.parse(res.value); } catch (e) { return []; }
  }

  async function saveLibraries(list) {
    await Capacitor.Plugins.Preferences.set({ key: LIB_KEY, value: JSON.stringify(list) });
  }

  async function upsertLibrary(lib) {
    const list = await getLibraries();
    const idx = list.findIndex(l => l.id === lib.id);
    if (idx >= 0) list[idx] = lib; else list.push(lib);
    await saveLibraries(list);
    return list;
  }

  async function deleteLibrary(id) {
    const list = (await getLibraries()).filter(l => l.id !== id);
    await saveLibraries(list);
    await DB.clearLibrary(id);
    return list;
  }

  function uid() {
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function getHistory() {
    const res = await Capacitor.Plugins.Preferences.get({ key: HISTORY_KEY });
    if (!res.value) return [];
    try { return JSON.parse(res.value); } catch (e) { return []; }
  }

  async function addHistory(rec) {
    const list = (await getHistory()).filter(r => r.id !== rec.id);
    list.unshift(Object.assign({}, rec, { viewedAt: Date.now() }));
    await Capacitor.Plugins.Preferences.set({ key: HISTORY_KEY, value: JSON.stringify(list.slice(0, HISTORY_MAX)) });
  }

  async function clearHistory() {
    await Capacitor.Plugins.Preferences.set({ key: HISTORY_KEY, value: JSON.stringify([]) });
  }

  async function getFavorites() {
    const res = await Capacitor.Plugins.Preferences.get({ key: FAV_KEY });
    if (!res.value) return [];
    try { return JSON.parse(res.value); } catch (e) { return []; }
  }

  async function saveFavorites(list) {
    await Capacitor.Plugins.Preferences.set({ key: FAV_KEY, value: JSON.stringify(list) });
  }

  async function toggleFavorite(rec) {
    const list = await getFavorites();
    const idx = list.findIndex(r => r.id === rec.id);
    if (idx >= 0) {
      list.splice(idx, 1);
      await saveFavorites(list);
      return false;
    }
    list.unshift(Object.assign({}, rec, { favoritedAt: Date.now() }));
    await saveFavorites(list);
    return true;
  }

  const DB_NAME = 'manga_viewer';
  const DB_VER = 1;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'id' });
          store.createIndex('byLib', 'libraryId', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  const DB = {
    async putFiles(records) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        for (const r of records) tx.objectStore('files').put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clearLibrary(libraryId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const idx = tx.objectStore('files').index('byLib');
        const range = IDBKeyRange.only(libraryId);
        const cur = idx.openCursor(range);
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { c.delete(); c.continue(); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async getFiles(libraryId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const idx = tx.objectStore('files').index('byLib');
        const range = IDBKeyRange.only(libraryId);
        const out = [];
        const cur = idx.openCursor(range);
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { out.push(c.value); c.continue(); } else resolve(out);
        };
        cur.onerror = () => reject(cur.error);
      });
    },
    async updateProgress(id, page) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.get(id);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec) { rec.lastPage = page; store.put(rec); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async setMeta(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async getMeta(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readonly');
        const req = tx.objectStore('meta').get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
      });
    }
  };

  return { getLibraries, saveLibraries, upsertLibrary, deleteLibrary, uid, DB, getSortPref, setSortPref, getColsPref, setColsPref, getHistory, addHistory, clearHistory, getFavorites, toggleFavorite };
})();
