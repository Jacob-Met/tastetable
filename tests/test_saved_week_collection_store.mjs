import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";
import { createSavedWeekStore } from "../static/saved_week_store.mjs";
import { COLLECTION_FORMAT, planCollectionRestore } from "../static/saved_week_collection.mjs";

const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const date = "2026-10-14T04:00:00.000Z";
const draft = (id) => createDraft({ id, name: id, response, inputs: { cuisines: [], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  weekState: createWeekPlan(response, "2026-12-31"), receivedAt: date, calendarId: "0123456789abcdef0123456789abcdef", now: new Date(date) });
const a = draft("collection_test_A"), b = draft("collection_test_B"), c = draft("collection_test_C");
const backup = (records) => ({ format: COLLECTION_FORMAT, savedAt: date, records });
const rows = (records) => records.map((draft) => ({ id: draft.id, draft }));

// Small transactional test double, not a browser qualification. Requests operate
// on a private working map and are committed only at transaction completion.
function fixture(initial, options = {}) {
  let data = new Map(initial.map((d) => [d.id, structuredClone(d)]));
  const activity = [];
  const db = { objectStoreNames: { contains: () => true }, close() {}, transaction(_name, mode) {
    options.beforeTransaction?.(mode, data);
    const working = structuredClone(data);
    let pending = 0, ended = false, scheduled = false;
    const tx = { objectStore: () => store, abort() {
      if (ended) return;
      ended = true; activity.push("abort"); setImmediate(() => tx.onabort?.());
    } };
    function settle() {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => {
        scheduled = false;
        if (!ended && pending === 0) {
          ended = true;
          if (mode === "readwrite") { data = working; activity.push("commit"); }
          tx.oncomplete?.();
        }
      });
    }
    function queue(fn, request = {}) {
      pending++;
      setImmediate(() => {
        pending--;
        if (ended) return;
        try { request.result = fn(); request.onsuccess?.(); }
        catch (error) { request.error = tx.error = error; tx.abort(); }
        settle();
      });
      return request;
    }
    const store = { keyPath: "id", autoIncrement: false,
      openCursor() {
        const entries = [...working.entries()], request = {}; let index = 0;
        const next = () => queue(() => index >= entries.length ? null : {
          primaryKey: entries[index][0], value: structuredClone(entries[index][1]),
          continue() { index++; next(); },
        }, request);
        next(); return request;
      },
      add(value) { return queue(() => {
        activity.push(`add:${value.id}`);
        if (value.id === options.failID) throw new Error("Injected last add failure");
        if (working.has(value.id)) throw new Error("ConstraintError");
        working.set(value.id, structuredClone(value)); return value.id;
      }); },
    };
    settle(); return tx;
  } };
  return { activity, values: () => [...data.values()], put: (d) => data.set(d.id, structuredClone(d)),
    indexedDB: { open() { const request = {}; setImmediate(() => { request.result = db; request.onsuccess(); }); return request; } } };
}

test("direct API rejects non-envelope values before opening storage or JSON coercion", async () => {
  let opens = 0;
  const store = createSavedWeekStore({ indexedDB: { open() { opens++; throw new Error("storage opening reached"); } } });
  const good = backup([a]);
  for (const input of [{ ...good, extra: undefined }, { ...good, savedAt: new Date(date) },
    { ...good, records: [{ ...a, extra: undefined }] }]) {
    await assert.rejects(async () => store.restoreMissing(input, []), TypeError);
  }
  assert.equal(opens, 0);
});

test("one transaction adds only missing originals, and identical/empty restore are no-ops", async () => {
  const f = fixture([a]), store = createSavedWeekStore({ indexedDB: f.indexedDB });
  assert.deepEqual(await store.restoreMissing(backup([a, b]), [a]), { added: 1, alreadyPresent: 1 });
  assert.deepEqual(f.values(), [a, b]);
  assert.equal(f.activity.filter((x) => x === "commit").length, 1);
  assert.deepEqual(await store.restoreMissing(backup([a, b]), [b, a]), { added: 0, alreadyPresent: 2 });
  assert.deepEqual(await store.restoreMissing(backup([]), [a, b]), { added: 0, alreadyPresent: 0 });
  assert.deepEqual(f.values(), [a, b]); store.close();
});

test("later request failure rolls back the earlier successful add", async () => {
  const f = fixture([a], { failID: c.id }), store = createSavedWeekStore({ indexedDB: f.indexedDB });
  await assert.rejects(store.restoreMissing(backup([b, c]), [a]), /last add/);
  assert.deepEqual(f.activity, [`add:${b.id}`, `add:${c.id}`, "abort"]);
  assert.deepEqual(f.values(), [a]); store.close();
});

test("changed complete collection, conflicts and unreadable existing rows abort before any add", async () => {
  for (const original of [[{ ...a, name: "Changed" }], [a, c], [{ ...a, text: "bad" }]]) {
    const f = fixture(original), store = createSavedWeekStore({ indexedDB: f.indexedDB });
    await assert.rejects(store.restoreMissing(backup([b]), [a]));
    assert.deepEqual(f.values(), original); assert.ok(!f.activity.some((x) => x.startsWith("add:")));
  }
  const f = fixture([a]), store = createSavedWeekStore({ indexedDB: f.indexedDB });
  await assert.rejects(store.restoreMissing(backup([{ ...a, name: "Incoming rename" }, b]), [a]), /conflict/);
  assert.deepEqual(f.values(), [a]);
});

test("fresh transaction sees an external mutation after preview and refuses", async () => {
  const f = fixture([a], { beforeTransaction(mode, data) { if (mode === "readwrite") data.set(c.id, c); } });
  const plan = planCollectionRestore(backup([b]), rows([a]));
  const store = createSavedWeekStore({ indexedDB: f.indexedDB });
  await assert.rejects(store.restoreMissing(backup([b]), plan.expected), /changed since/);
  assert.deepEqual(f.values(), [a, c]); assert.ok(!f.activity.some((x) => x.startsWith("add:")));
});

test("caller mutation after invocation cannot replace the reviewed records or token", async () => {
  const f = fixture([a]), store = createSavedWeekStore({ indexedDB: f.indexedDB });
  const input = backup([structuredClone(b)]), token = structuredClone([a]);
  const pending = store.restoreMissing(input, token);
  input.records[0].name = "Changed during open"; token[0].text = "bad";
  assert.deepEqual(await pending, { added: 1, alreadyPresent: 0 });
  assert.deepEqual(f.values(), [a, b]);
});

test("combined capacity overflow and mismatched primary keys leave every existing row intact", async () => {
  const full = Array.from({ length: 50 }, (_, n) => ({ ...a, id: `full_record_${n}` }));
  const f = fixture(full), store = createSavedWeekStore({ indexedDB: f.indexedDB });
  await assert.rejects(store.restoreMissing(backup([b]), full), /exceed 50/);
  assert.deepEqual(f.values(), full); assert.ok(!f.activity.some((x) => x.startsWith("add:")));
  const bad = fixture([a], { beforeTransaction(mode, data) { if (mode === "readwrite") data.set("wrong_key", b); } });
  await assert.rejects(createSavedWeekStore({ indexedDB: bad.indexedDB }).restoreMissing(backup([c]), [a]), /key does not match/);
  assert.deepEqual(bad.values(), [a, b]);
});
