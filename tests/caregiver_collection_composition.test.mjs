import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Application-hook receiving only. The real app, request controller and week
// codec/model execute; the DOM, module mounts, storage and calendar delivery are
// explicit doubles. This is not browser, IndexedDB, download or visual evidence.
const sourcePaths = {
  app: "../static/app.js", requests: "../static/plan-request.js",
  model: "../static/week_plan.mjs", codec: "../static/week_file.mjs",
};
const sources = Object.fromEntries(await Promise.all(Object.entries(sourcePaths)
  .map(async ([key, path]) => [key, await readFile(new URL(path, import.meta.url), "utf8")])));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function saved(version = "A") {
  const pick = (day, why) => ({ day, kind: "restaurant", entity_id: "same-source-id",
    name: "<literal>& 海", why, affinity: 0, fallback: false });
  const counts = { picks: 2, with_qloo_entity_id: 2, with_affinity_evidence: 2,
    constraint_checked: 2, unsafe_candidates_rejected: 0 };
  return {
    format: "tastetable.saved-week.v1", receivedAt: "2026-10-08T12:00:00.000Z",
    savedAt: "2026-10-09T01:00:00.000Z", calendarId: (version === "A" ? "a" : "b").repeat(32),
    inputs: { cuisines: [version], music: [], films: [], city: "Literal " + version, constraints: [] },
    response: {
      mock: true,
      plan: { meals: [pick("Monday", version + " first occurrence"), pick("Wednesday", version + " second occurrence")],
        outing: null, rejected: [], notes: ["Original " + version + " <credit>& 海"] },
      llm_only: { meals: [], outing: { day: "Saturday", name: "Ungrounded", why: "Literal baseline" } },
      comparison: { constraints: [], grounded: counts, llm_only: { ...counts, picks: 1 } },
      trace: [{ tool: "literal", args: null, result_summary: "source " + version }],
    },
    week: { start: "2026-10-12", assignments: { "pick-0": "Tuesday", "pick-1": null } },
  };
}

async function appFixture() {
  const nodes = new Map(), events = [], refreshes = [], calendar = [], requests = [];
  class Node {
    constructor() { this.value = ""; this.hidden = false; this.disabled = false;
      this.textContent = ""; this.innerHTML = ""; this.valid = true; this.listeners = new Map(); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    fire(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, preventDefault() {}, ...event }); }
    setAttribute(k, v) { this[k] = v; }
    removeAttribute(k) { delete this[k]; }
    checkValidity() { return this.valid; }
    replaceChildren() {}
    append() {}
    scrollIntoView() {}
    focus() {}
    click() { this.fire("click"); }
    remove() {}
    querySelectorAll() { return []; }
  }
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Node());
    return nodes.get(selector);
  };
  const form = node("#form");
  for (const key of ["cuisines", "music", "films", "city"]) form[key] = new Node();
  const constraints = ["soft_foods", "low_sodium", "wheelchair"].map(value => ({ value, checked: false }));
  form.querySelectorAll = selector => selector.includes(":checked") ? constraints.filter(x => x.checked) : constraints;
  node("#results").hidden = true;
  const window = new Node();
  let handoff, collection, worksheet, model = null, changed = 0, changedCallback;
  const mounts = {
    "./venue_followup.mjs": {
      mountVenueFollowup(root, current, onChange) {
        changedCallback = () => { events.push("worksheet.changed"); onChange(); };
        worksheet = {
          sync() { changedCallback(); },
          retire() { model = null; events.push("worksheet.retire"); changedCallback(); },
          accept(state, label) {
            model = { kind: "empty", label, entries: () => [] };
            events.push("worksheet.accept.empty"); changedCallback();
          },
          acceptPrepared(state, next) {
            next.entries(state); model = next;
            events.push("worksheet.accept.prepared"); changedCallback();
          },
          snapshot() {
            const { state, origin } = current();
            if (!state || !origin || !model) throw new Error("No accepted worksheet");
            return { state, origin, model };
          },
        };
        return worksheet;
      },
    },
    "./caregiver_handoff.mjs": {
      mountCaregiverHandoff(root, options) {
        handoff = options;
        return { changed() { changed++; events.push("handoff.changed"); } };
      },
    },
    "./saved_week_ui.mjs": {
      createSavedWeeksUI(options) {
        collection = options;
        return { refreshCurrent() { refreshes.push(options.capture()); events.push("collection.refresh"); } };
      },
    },
  };
  const context = vm.createContext({
    structuredClone, AbortController, Uint8Array, console,
    document: { querySelector: node, createElement: () => new Node(), body: new Node() },
    window,
    fetch: async (url, options) => {
      requests.push({ url, method: options?.method || "GET" });
      if (options) throw new Error("No provider request admitted");
      if (url === "/api/health") return { json: async () => ({ qloo_mode: "mock" }) };
      if (url === "/api/personas") return { json: async () => [] };
      throw new Error("Unexpected bootstrap request");
    },
    TasteTableCalendar: {
      createWeekExport(state, options) {
        calendar.push({ state, options });
        return { source: "calendar double", preview: () => [] };
      },
    },
  });
  new vm.Script(sources.requests, { filename: "static/plan-request.js" }).runInContext(context);
  const modelModule = new vm.SourceTextModule(sources.model, { context, identifier: "static/week_plan.mjs" });
  await modelModule.link(() => { throw new Error("Unexpected model import"); });
  await modelModule.evaluate();
  const codecModule = new vm.SourceTextModule(sources.codec, { context, identifier: "static/week_file.mjs" });
  await codecModule.link(specifier => {
    assert.equal(specifier, "./week_plan.mjs"); return modelModule;
  });
  await codecModule.evaluate();
  const app = new vm.SourceTextModule(sources.app, { context, identifier: "static/app.js" });
  await app.link(specifier => {
    if (specifier === "./week_plan.mjs") return modelModule;
    if (specifier === "./week_file.mjs") return codecModule;
    const values = mounts[specifier];
    assert.ok(values, "Only the declared UI mounts are doubled: " + specifier);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: specifier });
  });
  await app.evaluate();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const open = envelope => collection.openSaved(async () => ({ name: "same display name", text: JSON.stringify(envelope) }));
  const prepared = (envelope, note = "retained note") => {
    const opened = codecModule.namespace.readWeekFile(JSON.stringify(envelope));
    const origin = Object.fromEntries(["response", "inputs", "receivedAt", "calendarId"].map(k => [k, opened[k]]));
    const noteModel = { kind: "prepared", note, entries(state) {
      assert.equal(state.weekStart, envelope.week.start); return [];
    } };
    return handoff.prepare({ ...opened, origin, model: noteModel, handoffSavedAt: envelope.savedAt }, "literal & 海.json");
  };
  return { node, form, window, events, refreshes, calendar, requests, open, prepared,
    handoff: () => handoff, collection: () => collection, worksheet: () => worksheet,
    changed: () => changed, source: () => handoff.current(), capture: () => collection.capture() };
}

test("both mounted features start without accepted data and only GET bootstrap is allowed", async () => {
  const f = await appFixture();
  assert.ok(f.handoff()); assert.ok(f.collection());
  assert.equal(f.capture(), null);
  assert.throws(f.source, /No accepted worksheet/);
  assert.deepEqual(f.requests, [
    { url: "/api/health", method: "GET" }, { url: "/api/personas", method: "GET" },
  ]);
});

test("collection Open retires before the read and accepts exact source, duplicate occurrences and empty notes", async () => {
  const f = await appFixture(), a = saved("A"), b = saved("B");
  assert.equal(await f.open(a), true);
  f.handoff().accept(f.prepared(a));
  const before = f.changed(), held = deferred();
  const pending = f.collection().openSaved(() => {
    assert.equal(f.capture(), null);
    assert.throws(f.source, /No accepted worksheet/);
    assert.equal(f.node("#results").hidden, true);
    assert.ok(f.changed() > before);
    return held.promise;
  });
  assert.equal(f.form["aria-busy"], "true");
  held.resolve({ name: "same display name", text: JSON.stringify(b) });
  assert.equal(await pending, true);
  const current = f.source();
  assert.deepEqual(JSON.parse(JSON.stringify(current.origin)), {
    response: b.response, inputs: b.inputs, receivedAt: b.receivedAt, calendarId: b.calendarId,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(current.state.assignments)), b.week.assignments);
  assert.equal(current.state.picks.length, 2);
  assert.notEqual(current.state.picks[0].key, current.state.picks[1].key);
  assert.equal(current.model.kind, "empty");
  assert.equal(f.form.city.value, b.inputs.city);
  assert.equal(f.refreshes.at(-1).calendarId, b.calendarId);
  assert.equal(f.calendar.at(-1).options.id, b.calendarId);
  assert.equal(f.form["aria-busy"], "false");
});

test("handoff preparation and late preparation refusal do not change the accepted collection snapshot", async () => {
  const f = await appFixture(), a = saved("A"), b = saved("B");
  await f.open(a);
  const before = f.source(), events = f.events.length, refreshes = f.refreshes.length;
  const view = f.prepared(b);
  assert.equal(f.source().state, before.state);
  assert.equal(f.source().origin, before.origin);
  assert.equal(f.source().model, before.model);
  assert.equal(f.events.length, events);
  assert.equal(f.refreshes.length, refreshes);
  assert.equal(f.form.city.value, a.inputs.city);
  const broken = structuredClone(b); broken.response.plan.notes = [null];
  assert.throws(() => f.prepared(broken), /incomplete original plan/);
  const unsupported = structuredClone(b);
  unsupported.inputs.constraints = ["unrepresented"]; unsupported.response.comparison.constraints = ["unrepresented"];
  assert.throws(() => f.prepared(unsupported), /constraint that this page cannot display/);
  assert.equal(f.source().origin, before.origin);
  assert.equal(f.source().model, before.model);
  assert.equal(view.origin.calendarId, b.calendarId);
});

test("explicit handoff Apply invalidates a held collection success and final capture uses the applied model/origin", async () => {
  const f = await appFixture(), a = saved("A"), b = saved("B"), held = deferred();
  const pending = f.collection().openSaved(() => held.promise);
  f.handoff().accept(f.prepared(b, "B note"));
  const accepted = f.source(), refresh = f.refreshes.at(-1), calendar = f.calendar.at(-1);
  assert.equal(accepted.origin.calendarId, b.calendarId);
  assert.equal(accepted.model.note, "B note");
  assert.equal(refresh.calendarId, b.calendarId);
  assert.equal(calendar.options.id, b.calendarId);
  assert.equal(f.form["aria-busy"], "false");
  held.resolve({ name: "same display name", text: JSON.stringify(a) });
  assert.equal(await pending, false);
  assert.equal(f.source().origin, accepted.origin);
  assert.equal(f.source().model, accepted.model);
  assert.equal(f.source().state, accepted.state);
  assert.equal(f.form.city.value, b.inputs.city);
});

test("a late collection failure cannot retire a newer accepted handoff", async () => {
  const f = await appFixture(), held = deferred();
  const pending = f.collection().openSaved(() => held.promise);
  f.handoff().accept(f.prepared(saved("B"), "newer exact notes"));
  const accepted = f.source(), status = f.node("#requestStatus").textContent, changed = f.changed();
  held.reject(new Error("record removed after read began"));
  assert.equal(await pending, false);
  assert.equal(f.source().origin, accepted.origin);
  assert.equal(f.source().model, accepted.model);
  assert.equal(f.node("#requestStatus").textContent, status);
  assert.equal(f.changed(), changed);
});

test("current collection refusal retains inputs but does not resurrect the retired plan or worksheet", async () => {
  const f = await appFixture(), a = saved("A");
  await f.open(a); f.handoff().accept(f.prepared(a));
  assert.equal(await f.collection().openSaved(async () => ({ name: "bad", text: "{" })), false);
  assert.equal(f.capture(), null);
  assert.throws(f.source, /No accepted worksheet/);
  assert.equal(f.node("#results").hidden, true);
  assert.equal(f.node("#saveWeek").disabled, true);
  assert.equal(f.form.city.value, a.inputs.city);
  assert.match(f.node("#requestStatus").textContent, /not valid JSON/);
});

test("cancel while a collection read is held invalidates its eventual success", async () => {
  const f = await appFixture(), a = saved("A"), held = deferred();
  await f.open(a);
  const pending = f.collection().openSaved(() => held.promise);
  f.node("#cancelPlan").fire("click");
  const status = f.node("#requestStatus").textContent;
  held.resolve({ name: "late", text: JSON.stringify(saved("B")) });
  assert.equal(await pending, false);
  assert.equal(f.capture(), null);
  assert.throws(f.source, /No accepted worksheet/);
  assert.equal(f.form.city.value, a.inputs.city);
  assert.equal(f.node("#requestStatus").textContent, status);
});

test("invalid dates refuse capture; arrangement edits retain accepted source and notify handoff retirement", async () => {
  const f = await appFixture(), a = saved("A");
  await f.open(a);
  const original = f.source(), before = f.changed();
  f.node("#weekDate").value = "";
  f.node("#weekDate").fire("input");
  assert.equal(f.capture(), null);
  assert.equal(f.node("#saveWeek").disabled, true);
  assert.ok(f.changed() > before);
  f.node("#weekDate").value = a.week.start;
  f.node("#weekDate").fire("input");
  const target = { dataset: { pickKey: "pick-1" }, value: "Thursday", closest() { return this; } };
  const changed = f.changed();
  f.node("#weekOrganizer").fire("change", { target });
  assert.equal(f.capture().weekState.assignments["pick-1"], "Thursday");
  assert.equal(f.source().origin, original.origin);
  assert.equal(f.source().model, original.model);
  assert.ok(f.changed() > changed);
  assert.equal(f.capture().response.plan.notes[0], "Original A <credit>& 海");
});
