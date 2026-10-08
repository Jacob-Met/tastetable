/** Regular app event/codec receiving with a declared DOM/worksheet test double.
 * Run: node --experimental-vm-modules --test tests/test_regular_arrangement_consumer.mjs
 * Actual browser focus/layout and the real worksheet DOM remain separate gates.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

const root = resolve(process.env.TASTETABLE_UNDO_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const { createWeekPlan } = await import(pathToFileURL(resolve(root, "static/week_plan.mjs")));
const { makeWeekFile, readWeekFile } = await import(pathToFileURL(resolve(root, "static/week_file.mjs")));
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve_ => setImmediate(resolve_));
const counts = { picks: 3, with_qloo_entity_id: 3, with_affinity_evidence: 2, constraint_checked: 2, unsafe_candidates_rejected: 1 };
const originalAssignments = { "pick-0": "Monday", "pick-1": "Wednesday", "pick-2": "Saturday" };

function fixture(empty = false) {
  const response = {
    mock: true,
    plan: {
      meals: empty ? [] : [
        { day: "Monday", kind: "restaurant", entity_id: "authored-shared-id", name: "Same name <A>", why: "Original first explanation.", affinity: 0.8 },
        { day: "Wednesday", kind: "restaurant", entity_id: "authored-shared-id", name: "Same name <A>", why: "Distinct original occurrence.", affinity: 0.6 },
      ],
      outing: empty ? null : { day: "Saturday", kind: "outing", entity_id: "authored-outing", name: "Gallery", why: "Original access note.", affinity: null },
      notes: ["Authored source: these are fictional suggestions."],
      rejected: [{ name: "Not scheduled", failed: [{ constraint: "wheelchair", status: "unknown", reason: "Ask the venue." }] }],
    },
    llm_only: { meals: [], outing: { day: "Saturday", name: "Unverified comparison", why: "Original comparison." } },
    comparison: { constraints: ["wheelchair"], grounded: { ...counts }, llm_only: { ...counts, with_qloo_entity_id: 0 } },
    trace: [{ tool: "authored_fixture", args: { literal: "<&>" }, result_summary: "No provider request." }],
  };
  const inputs = { cuisines: ["Italian"], music: ["Björk"], films: [], city: "Authored city", constraints: ["wheelchair"] };
  const receivedAt = "2026-10-01T12:00:00.000Z";
  const calendarId = "1234567890abcdef1234567890abcdef";
  const state = createWeekPlan(response, "2026-10-05");
  const file = makeWeekFile({ response, inputs, state, receivedAt, calendarId }, new Date("2026-10-02T12:00:00.000Z"));
  return { response, inputs, receivedAt, calendarId, file };
}

async function loadApp() {
  assert.equal(typeof vm.SourceTextModule, "function", "Use --experimental-vm-modules for the native app-module receiver.");
  const html = await readFile(resolve(root, "static/index.html"), "utf8");
  const elements = new Map();
  const downloads = [], requests = [], worksheet = [], prints = [], blobs = new Map();
  let focused = null, generated = fixture().response;
  class Element {
    constructor(id = "", tag = "div") {
      this.id = id; this.tagName = tag.toUpperCase(); this.value = ""; this.textContent = "";
      this.innerHTML = ""; this.hidden = false; this.disabled = false; this.checked = false;
      this.dataset = {}; this.files = []; this.children = []; this.listeners = new Map(); this.attributes = new Map();
    }
    addEventListener(type, listener) { const old = this.listeners.get(type) || []; old.push(listener); this.listeners.set(type, old); }
    fire(type, extra = {}) { const event = { type, target: this, preventDefault() {}, ...extra }; for (const listener of this.listeners.get(type) || []) listener(event); }
    click() {
      if (this.disabled) return;
      if (this.tagName === "A" && this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
      this.fire("click");
    }
    focus() { focused = this.id || this.dataset.pickKey; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); }
    checkValidity() { return this.id !== "weekDate" || /^\d{4}-\d{2}-\d{2}$/.test(this.value); }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    remove() {}
    scrollIntoView() {}
    closest(selector) { return selector === "select[data-pick-key]" && this.dataset.pickKey ? this : null; }
    querySelectorAll(selector) {
      if (this.id === "form" && selector.startsWith("[name=constraints]")) return constraints.filter(field => !selector.endsWith(":checked") || field.checked);
      throw new Error("Unexpected test-double querySelectorAll: " + selector);
    }
  }
  for (const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[2], match[1]);
    element.disabled = /\sdisabled(?:\s|>)/.test(match[0]);
    element.hidden = /\shidden(?:\s|>)/.test(match[0]);
    elements.set("#" + element.id, element);
  }
  const constraints = [...html.matchAll(/<input\b[^>]*\bname="constraints"[^>]*\bvalue="([^"]+)"[^>]*>/g)].map(match => {
    const element = new Element(); element.value = match[1]; return element;
  });
  for (const name of ["cuisines", "music", "films", "city"]) elements.get("#form")[name] = new Element(name, "input");
  const select = selector => {
    if (elements.has(selector)) return elements.get(selector);
    const match = /^#weekOrganizer select\[data-pick-key="([^"]+)"\]$/.exec(selector);
    if (match) { const element = new Element("", "select"); element.dataset.pickKey = match[1]; return element; }
    return null;
  };
  const body = new Element("body", "body"), window = new Element("window");
  window.print = () => prints.push({ date: select("#weekDate").value, days: select("#weekDays").innerHTML, omitted: select("#omittedPicks").innerHTML });
  const document = { querySelector: select, createElement: name => new Element("", name), body };
  const urlAPI = { createObjectURL(blob) { const id = "blob:authored/" + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL() {} };
  const context = vm.createContext({
    document, window, URL: urlAPI, Blob, TextEncoder, TextDecoder, Date, Intl, structuredClone,
    AbortController, crypto: webcrypto, setTimeout: callback => { callback(); return 0; },
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || "GET", body: options.body });
      if (url === "/api/health") return { json: async () => ({ qloo_mode: "mock" }) };
      if (url === "/api/personas") return { json: async () => [] };
      if (url === "/api/plan" && options.method === "POST") return { ok: true, json: async () => structuredClone(generated) };
      throw new Error("Unprovided fixture transport: " + url);
    },
  });
  for (const name of ["plan-request.js", "calendar.js"]) vm.runInContext(await readFile(resolve(root, "static", name), "utf8"), context, { filename: name });
  const modules = new Map();
  const getModule = async path => {
    if (modules.has(path)) return modules.get(path);
    let module;
    if (path.endsWith("/venue_followup.mjs")) {
      module = new vm.SyntheticModule(["mountVenueFollowup"], function () {
        this.setExport("mountVenueFollowup", (_root, current) => {
          let session = null;
          return Object.freeze({
            accept(state, label) { session = state; worksheet.push({ kind: "accept", state, label }); },
            sync() { worksheet.push({ kind: "sync", ...current(), session }); },
            retire() { session = null; worksheet.push({ kind: "retire" }); },
          });
        });
      }, { context, identifier: path });
    } else module = new vm.SourceTextModule(await readFile(path, "utf8"), { context, identifier: path });
    modules.set(path, module);
    await module.link((specifier, from) => getModule(resolve(dirname(from.identifier), specifier)));
    return module;
  };
  await (await getModule(resolve(root, "static/app.js"))).evaluate();
  await tick();
  const idle = async () => { for (let i = 0; i < 10; i++) { await tick(); if (select("#form").attributes.get("aria-busy") === "false") return; } throw new Error("Fixture app did not become idle"); };
  const open = async (text, name = "authored-week.json") => {
    select("#weekFile").files = [{ name, text: typeof text === "function" ? text : async () => text }];
    select("#weekFile").fire("change"); await idle();
  };
  const click = id => { const element = select(id); assert.ok(element, "Missing product control " + id); element.click(); };
  const move = (key, day) => {
    const element = new Element("", "select"); element.dataset.pickKey = key; element.value = day || "";
    select("#weekOrganizer").fire("change", { target: element });
  };
  const date = (value, types = ["input", "change"]) => { select("#weekDate").value = value; for (const type of types) select("#weekDate").fire(type); };
  const save = async () => { const before = downloads.length; click("#saveWeek"); assert.equal(downloads.length, before + 1, "Save must prepare one actual codec output"); return readWeekFile(await downloads.at(-1).blob.text()); };
  const calendar = async () => { const before = downloads.length; click("#calendarDownload"); assert.equal(downloads.length, before + 1); return downloads.at(-1).blob.text(); };
  return { select, click, move, date, save, calendar, open, idle, downloads, requests, worksheet, prints, window,
    focused: () => focused, setGenerated: response => { generated = response; } };
}

test("existing file admission, move/omit and real Save/calendar writers retain the source", async () => {
  const f = fixture(), app = await loadApp(); await app.open(f.file.text);
  assert.equal(app.select("#results").hidden, false);
  app.move("pick-0", "Sunday"); app.move("pick-1", null);
  const saved = await app.save();
  assert.deepEqual(plain(saved.state.assignments), { ...originalAssignments, "pick-0": "Sunday", "pick-1": null });
  assert.deepEqual(plain(saved.response), f.response); assert.deepEqual(plain(saved.inputs), f.inputs);
  assert.equal(saved.receivedAt, f.receivedAt); assert.equal(saved.calendarId, f.calendarId);
  assert.match(await app.calendar(), /DTSTART;VALUE=DATE:20261011/);
  assert.equal(app.requests.filter(item => item.method !== "GET").length, 0);
  const last = app.worksheet.at(-1); assert.equal(last.kind, "sync"); assert.equal(last.state.sourcePlan, last.session.sourcePlan);
});

test("one Undo recovers a multi-pick reset, with exact source and calendar identity", async () => {
  const f = fixture(), app = await loadApp(); await app.open(f.file.text);
  app.move("pick-0", "Sunday"); app.move("pick-1", null);
  const edited = await app.save(), editedCalendar = await app.calendar();
  app.click("#resetWeek"); assert.deepEqual(plain((await app.save()).state.assignments), originalAssignments);
  app.click("#undoWeek"); const restored = await app.save();
  assert.deepEqual(plain(restored.state.assignments), plain(edited.state.assignments));
  assert.deepEqual(plain(restored.response), f.response); assert.equal(restored.calendarId, f.calendarId);
  assert.equal(await app.calendar(), editedCalendar);
  app.click("#redoWeek"); assert.deepEqual(plain((await app.save()).state.assignments), originalAssignments);
});

test("same-week input/change, Print/Save and no-op reset preserve Redo", async () => {
  const app = await loadApp(); await app.open(fixture().file.text);
  app.move("pick-0", "Sunday"); app.click("#undoWeek");
  app.date("2026-10-08"); app.click("#printWeek"); await app.save(); app.click("#resetWeek");
  assert.equal(app.prints.length, 1); assert.equal(app.select("#redoWeek").disabled, false);
  app.click("#redoWeek"); assert.equal((await app.save()).state.assignments["pick-0"], "Sunday");
  app.click("#undoWeek"); assert.equal(app.select("#undoWeek").disabled, true);
  assert.equal(app.select("#weekDate").value, "2026-10-08");
});

test("invalid date then move/omit does not save draft text or create phantom history", async () => {
  const app = await loadApp(); await app.open(fixture().file.text);
  app.date(""); assert.equal(app.select("#printWeek").disabled, true);
  app.move("pick-1", null);
  assert.equal(app.select("#saveWeek").disabled, true); assert.equal(app.select("#calendarDownload").disabled, true);
  app.click("#undoWeek");
  assert.equal(app.select("#weekDate").value, "2026-10-05"); assert.equal(app.select("#weekError").textContent, "");
  assert.equal(app.select("#printWeek").disabled, false); assert.equal(app.select("#calendarDownload").disabled, false);
  assert.deepEqual(plain((await app.save()).state.assignments), originalAssignments);
  assert.equal(app.select("#undoWeek").disabled, true);
  app.click("#redoWeek"); assert.equal((await app.save()).state.assignments["pick-1"], null);
  const sync = app.worksheet.filter(item => item.kind === "sync").at(-1);
  assert.equal(sync.date, "2026-10-05"); assert.equal(sync.state.sourcePlan, sync.session.sourcePlan);
});

test("new actual edits clear Redo; explicit saved-file replacement starts fresh", async () => {
  const f = fixture(), app = await loadApp(); await app.open(f.file.text);
  app.move("pick-0", "Sunday"); app.click("#undoWeek"); app.move("pick-2", "Tuesday");
  assert.equal(app.select("#redoWeek").disabled, true);
  await app.open(f.file.text);
  assert.equal(app.select("#undoWeek").disabled, true); assert.equal(app.select("#redoWeek").disabled, true);
  assert.deepEqual(plain((await app.save()).state.assignments), originalAssignments);
  assert.equal(app.worksheet.filter(item => item.kind === "accept").length, 2);
});

test("starting and failing Open retires history immediately; late reads cannot revive it", async () => {
  const f = fixture(), app = await loadApp(); await app.open(f.file.text); app.move("pick-0", "Sunday");
  assert.equal(app.select("#undoWeek").disabled, false);
  let finish;
  app.select("#weekFile").files = [{ name: "pending.json", text: () => new Promise(resolve_ => { finish = resolve_; }) }];
  app.select("#weekFile").fire("change");
  assert.equal(app.select("#results").hidden, true); assert.equal(app.select("#undoWeek").disabled, true);
  assert.equal(app.select("#redoWeek").disabled, true); assert.equal(app.worksheet.at(-1).kind, "retire");
  finish("not JSON"); await app.idle(); app.click("#undoWeek");
  assert.equal(app.select("#results").hidden, true); assert.equal(app.select("#saveWeek").disabled, true);
  assert.match(app.select("#requestStatus").textContent, /could not open/);
  app.select("#weekFile").files = [{ name: "late.json", text: () => new Promise(resolve_ => { finish = resolve_; }) }];
  app.select("#weekFile").fire("change"); app.select("#form").fire("input"); finish(f.file.text); await app.idle();
  assert.equal(app.select("#results").hidden, true); assert.equal(app.select("#undoWeek").disabled, true);
  assert.equal(app.worksheet.filter(item => item.kind === "accept").length, 1);
});

test("the generated-plan admission path also creates and retires source-bound history", async () => {
  const app = await loadApp();
  app.select("#form").querySelectorAll("[name=constraints]").find(field => field.value === "wheelchair").checked = true;
  app.select("#form").fire("submit"); await app.idle();
  assert.equal(app.select("#results").hidden, false); assert.equal(app.select("#undoWeek").disabled, true);
  app.move("pick-0", "Sunday"); app.click("#undoWeek");
  const saved = await app.save(); assert.deepEqual(plain(saved.state.assignments), originalAssignments);
  assert.equal(app.requests.filter(item => item.method === "POST").length, 1, "Only the declared authored plan transport was called");
  app.window.fire("pagehide"); assert.equal(app.select("#undoWeek").disabled, true); assert.equal(app.select("#results").hidden, true);
});

test("empty accepted weeks have no reset entry but can recover a changed week date", async () => {
  const app = await loadApp(); await app.open(fixture(true).file.text); app.click("#resetWeek");
  assert.equal(app.select("#undoWeek").disabled, true); assert.equal(app.select("#calendarDownload").disabled, true);
  app.date("2026-10-15"); app.click("#undoWeek");
  const saved = await app.save(); assert.equal(saved.state.weekStart, "2026-10-05"); assert.deepEqual(plain(saved.state.assignments), {});
  assert.equal(app.select("#undoWeek").disabled, true); assert.equal(app.select("#redoWeek").disabled, false);
});
