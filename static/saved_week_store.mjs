import { MAX_DRAFTS, validateDraft, renameDraft, draftName } from "./saved_weeks.mjs";

export const DATABASE_NAME = "tastetable.saved-weeks";
export const STORE_NAME = "drafts";

function storageError(error) {
  if (error?.name === "QuotaExceededError") return new Error("Browser storage is full. No saved week was changed.");
  if (error?.name === "VersionError") return new Error("These saved weeks belong to a newer app version. They have been left unchanged.");
  if (error?.name === "ConstraintError") return new Error("That saved week identity already exists. Please save a new copy.");
  if (error?.name === "SecurityError") return new Error("This browser is preventing saved-week storage. No saved week was changed.");
  return error instanceof Error ? error : new Error("Browser storage is unavailable. No saved week was changed.");
}

/** Each mutation is one native transaction. Never rewrite a cached whole library. */
export function createSavedWeekStore(options = {}) {
  const name = options.name || DATABASE_NAME;
  let indexedDB, unavailable;
  try { indexedDB = Object.prototype.hasOwnProperty.call(options, "indexedDB") ? options.indexedDB : globalThis.indexedDB; }
  catch (error) { unavailable = storageError(error); }
  let connection = null;
  let opening = null;

  async function database() {
    if (unavailable) throw unavailable;
    if (connection) return connection;
    if (opening) return opening;
    if (!indexedDB) throw new Error("This browser does not provide saved-week storage.");
    opening = new Promise((resolve, reject) => {
      let refused = false;
      let request;
      try { request = indexedDB.open(name, 1); }
      catch (error) { reject(storageError(error)); return; }
      request.onblocked = () => {
        refused = true;
        reject(new Error("Another tab is changing saved-week storage. Close that tab, then refresh saved weeks."));
      };
      request.onupgradeneeded = () => {
        if (refused) { request.transaction.abort(); return; }
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const db = request.result;
        if (refused) { db.close(); return; }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          reject(new Error("Saved-week storage has an unsupported layout. It has been left unchanged."));
          return;
        }
        const objectStore = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
        if (objectStore.keyPath !== "id" || objectStore.autoIncrement) {
          db.close();
          reject(new Error("Saved-week storage has an unsupported layout. It has been left unchanged."));
          return;
        }
        connection = db;
        db.onversionchange = () => { db.close(); if (connection === db) connection = null; };
        db.onclose = () => { if (connection === db) connection = null; };
        resolve(db);
      };
    });
    try { return await opening; }
    finally { opening = null; }
  }

  async function transaction(mode, work) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE_NAME, mode); }
      catch (error) { reject(storageError(error)); return; }
      let result, failure;
      const abort = (error) => {
        failure = error;
        try { tx.abort(); } catch { reject(storageError(error)); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageError(failure || tx.error));
      // The transaction's abort owns failure. A successful request alone is not
      // proof that data committed; later requests may still abort the mutation.
      tx.onerror = () => {};
      const guard = (fn) => (...args) => { try { fn(...args); } catch (error) { abort(error); } };
      try { work(tx.objectStore(STORE_NAME), (value) => { result = value; }, guard, abort); }
      catch (error) { abort(error); }
    });
  }

  function requireDraft(value) {
    if (value === undefined) throw new Error("That saved week was removed. Refresh the saved weeks list.");
    return validateDraft(value);
  }

  return Object.freeze({
    list() {
      return transaction("readonly", (store, done, guard) => {
        const rows = [];
        const request = store.openCursor();
        request.onsuccess = guard(() => {
          const cursor = request.result;
          if (!cursor) {
            rows.sort((a, b) => (b.draft?.createdAt || "").localeCompare(a.draft?.createdAt || "") || String(a.id).localeCompare(String(b.id)));
            done(rows);
            return;
          }
          if (rows.length >= 200) throw new Error("This browser has more saved records than this version can show. They have been left unchanged.");
          try { rows.push({ id: cursor.primaryKey, draft: validateDraft(cursor.value) }); }
          catch (error) {
            let label = "Unreadable saved record";
            try { label = draftName(cursor.value?.name); } catch {}
            rows.push({ id: cursor.primaryKey, label, error: error.message });
          }
          cursor.continue();
        });
      });
    },
    get(id) {
      return transaction("readonly", (store, done, guard) => {
        const request = store.get(id);
        request.onsuccess = guard(() => done(requireDraft(request.result)));
      });
    },
    save(value) {
      const draft = validateDraft(value);
      return transaction("readwrite", (store, done, guard) => {
        const count = store.count();
        count.onsuccess = guard(() => {
          if (count.result >= MAX_DRAFTS) throw new Error(`This browser already has ${MAX_DRAFTS} saved weeks. Remove one before saving another.`);
          store.add(draft);
          done(draft);
        });
      });
    },
    rename(id, name) {
      const label = draftName(name);
      return transaction("readwrite", (store, done, guard) => {
        const request = store.get(id);
        request.onsuccess = guard(() => {
          const changed = renameDraft(requireDraft(request.result), label);
          store.put(changed);
          done(changed);
        });
      });
    },
    remove(id) {
      return transaction("readwrite", (store, done, guard) => {
        const request = store.getKey(id);
        request.onsuccess = guard(() => {
          if (request.result === undefined) throw new Error("That saved week was already removed. Refresh the saved weeks list.");
          store.delete(id);
          done(id);
        });
      });
    },
    close() { connection?.close(); connection = null; },
  });
}
