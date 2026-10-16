/*
 * Mound Report storage layer.
 * Saves pitchers, sessions and media (photos/videos as Blobs) in the browser's IndexedDB.
 * If IndexedDB is blocked (private window, locked-down browser), it falls back to memory
 * so the app still works for the current visit.
 */
const DB = (() => {
  'use strict';
  const NAME = 'mound-report';
  const VERSION = 1;
  const STORES = {
    pitchers: [],
    sessions: ['pitcherId'],
    media: ['pitcherId', 'sessionId'],
    meta: []
  };

  let dbPromise = null;
  let persistent = false;
  let mem = null; // in-memory fallback: { storeName: Map }

  function keyPath(store) { return store === 'meta' ? 'key' : 'id'; }

  function openIDB() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.entries(STORES).forEach(([name, indexes]) => {
          if (!db.objectStoreNames.contains(name)) {
            const st = db.createObjectStore(name, { keyPath: keyPath(name) });
            indexes.forEach(ix => st.createIndex(ix, ix));
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  async function ready() {
    if (dbPromise) return dbPromise.then(() => persistent);
    dbPromise = openIDB().then(db => { persistent = true; return db; }).catch(() => {
      persistent = false;
      mem = {};
      Object.keys(STORES).forEach(s => { mem[s] = new Map(); });
      return null;
    });
    await dbPromise;
    if (persistent && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    return persistent;
  }

  async function run(store, mode, fn) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const st = tx.objectStore(store);
      let result;
      const req = fn(st);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  const clone = v => (v == null ? v : { ...v });

  return {
    ready,
    get isPersistent() { return persistent; },

    async getAll(store) {
      await ready();
      if (!persistent) return Array.from(mem[store].values()).map(clone);
      return run(store, 'readonly', s => s.getAll());
    },

    async get(store, key) {
      await ready();
      if (!persistent) return clone(mem[store].get(key));
      return run(store, 'readonly', s => s.get(key));
    },

    async put(store, obj) {
      await ready();
      if (!persistent) { mem[store].set(obj[keyPath(store)], clone(obj)); return obj; }
      await run(store, 'readwrite', s => s.put(obj));
      return obj;
    },

    async putMany(store, list) {
      await ready();
      if (!persistent) { list.forEach(o => mem[store].set(o[keyPath(store)], clone(o))); return; }
      const db = await dbPromise;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        list.forEach(o => st.put(o));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    },

    async delete(store, key) {
      await ready();
      if (!persistent) { mem[store].delete(key); return; }
      await run(store, 'readwrite', s => s.delete(key));
    },

    async getByIndex(store, index, value) {
      await ready();
      if (!persistent) return Array.from(mem[store].values()).filter(o => o[index] === value).map(clone);
      return run(store, 'readonly', s => s.index(index).getAll(value));
    },

    async keysByIndex(store, index, value) {
      await ready();
      if (!persistent) return Array.from(mem[store].values()).filter(o => o[index] === value).map(o => o[keyPath(store)]);
      return run(store, 'readonly', s => s.index(index).getAllKeys(value));
    },

    async countByIndex(store, index, value) {
      await ready();
      if (!persistent) return Array.from(mem[store].values()).filter(o => o[index] === value).length;
      return run(store, 'readonly', s => s.index(index).count(value));
    },

    async clear(store) {
      await ready();
      if (!persistent) { mem[store].clear(); return; }
      await run(store, 'readwrite', s => s.clear());
    }
  };
})();
