async function receiverMain(packet) {
  const vm = await import("node:vm");
  const assert = (await import("node:assert/strict")).default;
  const crypto = await import("node:crypto");
  const sha = (text, kind) => crypto.createHash(kind).update(text).digest("hex");
  const git = (text) => {
    const data = Buffer.from(text, "utf8");
    return crypto.createHash("sha1").update("blob " + data.length + "\0").update(data).digest("hex");
  };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const fixturePack = JSON.parse(packet.fixtureText);
  const F = fixturePack.fixtures;
  const receipt = {
    schema: "tastetable.d98-independent-combined-receipt.v1",
    startedAt: new Date().toISOString(), runtime: process.version,
    sourceCommit: fixturePack.sourceCommit, rootOracle: fixturePack.oracle,
    sourceAdmission: [], groups: [], assertionsReached: 0,
    passedAssertions: 0, failedAssertions: 0, passedGroups: 0, failedGroups: 0,
    boundaries: fixturePack.executionBoundary,
    driver: { git: git(packet.receiverSource), sha256: sha(packet.receiverSource, "sha256"), bytes: Buffer.byteLength(packet.receiverSource) },
    fixtures: { git: git(packet.fixtureText), sha256: sha(packet.fixtureText, "sha256"), bytes: Buffer.byteLength(packet.fixtureText) }
  };
  for (const s of packet.sources) {
    const actual = { path: s.path, git: git(s.text), bytes: Buffer.byteLength(s.text), sha256: sha(s.text, "sha256") };
    assert.equal(actual.git, s.sha, "exact source identity: " + s.path);
    receipt.sourceAdmission.push(actual);
  }
  assert.equal(receipt.driver.git, packet.receiverSha, "frozen receiver source");
  assert.equal(receipt.fixtures.git, packet.fixtureSha, "frozen fixture source");
  const sourceMap = new Map(packet.sources.map((s) => [s.path, s.text]));
  let currentGroup = null;
  function check(condition, label, detail = null) {
    receipt.assertionsReached++;
    const row = { label, passed: Boolean(condition), detail };
    currentGroup.checks.push(row);
    if (condition) receipt.passedAssertions++;
    else { receipt.failedAssertions++; throw new Error("Assertion failed: " + label); }
  }
  function eq(actual, expected, label) {
    let okay = true;
    try { assert.deepEqual(plain(actual), plain(expected)); } catch { okay = false; }
    check(okay, label, okay ? null : { expected, actual });
  }
  const defer = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const drain = async () => { await new Promise((resolve) => setImmediate(resolve)); };
  function domAdapter(html, observe, download) {
    const decode = (s) => s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|middot|mdash);/gi, (_, token) => {
      const names = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", middot: "·", mdash: "—" };
      if (token[0] === "#") return String.fromCodePoint(token[1].toLowerCase() === "x" ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10));
      return names[token.toLowerCase()];
    });
    const voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    class Element {
      constructor(tag) {
        this.tagName = tag.toLowerCase(); this.parentNode = null; this.nodes = []; this.attributes = {};
        this.dataset = {}; this.listeners = new Map(); this.value = ""; this.checked = false;
        this.disabled = false; this.hidden = false; this.files = []; this.validityOverride = true;
      }
      get children() { return this.nodes.filter((n) => n instanceof Element); }
      get id() { return this.attributes.id || ""; }
      get textContent() { return this.nodes.map((n) => n instanceof Element ? n.textContent : n).join(""); }
      set textContent(value) { this.nodes = [String(value ?? "")]; }
      get innerHTML() { return this._html || ""; }
      set innerHTML(value) {
        this._html = String(value); this.nodes = [];
        parse(this._html, this);
        if (this.id === "plan") observe("dom.planWrite");
      }
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === "value") this.value = String(value);
        if (name === "hidden") this.hidden = true;
        if (name === "disabled") this.disabled = true;
        if (name === "checked") this.checked = true;
        if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      }
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
      removeAttribute(name) {
        delete this.attributes[name];
        if (name === "hidden") this.hidden = false;
        if (name === "disabled") this.disabled = false;
      }
      append(...nodes) {
        for (const node of nodes) {
          if (node instanceof Element) { node.remove(); node.parentNode = this; }
          this.nodes.push(node instanceof Element ? node : String(node));
        }
      }
      replaceChildren(...nodes) {
        for (const node of this.children) node.parentNode = null;
        this.nodes = []; this.append(...nodes);
      }
      remove() {
        if (!this.parentNode) return;
        this.parentNode.nodes = this.parentNode.nodes.filter((n) => n !== this); this.parentNode = null;
      }
      contains(node) { for (let p = node; p; p = p.parentNode) if (p === this) return true; return false; }
      matches(simple) {
        if (simple.endsWith(":checked")) { if (!this.checked) return false; simple = simple.slice(0, -8); }
        const tag = simple.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
        if (tag && this.tagName !== tag[0].toLowerCase()) return false;
        for (const m of simple.matchAll(/#([a-zA-Z0-9_-]+)/g)) if (this.id !== m[1]) return false;
        for (const m of simple.matchAll(/\.([a-zA-Z0-9_-]+)/g)) if (!(this.attributes.class || "").split(/\s+/).includes(m[1])) return false;
        for (const m of simple.matchAll(/\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
          if (!Object.hasOwn(this.attributes, m[1])) return false;
          const expected = m[2] ?? m[3] ?? m[4];
          if (expected !== undefined && this.attributes[m[1]] !== expected) return false;
        }
        return true;
      }
      querySelectorAll(selector) {
        const parts = selector.trim().split(/\s+/);
        const result = [];
        const visit = (parent) => { for (const child of parent.children) {
          if (child.matches(parts.at(-1))) {
            let p = child.parentNode, i = parts.length - 2;
            while (i >= 0 && p) { if (p.matches(parts[i])) i--; p = p.parentNode; }
            if (i < 0) result.push(child);
          }
          visit(child);
        }};
        visit(this); return result;
      }
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
      closest(selector) { for (let p = this; p; p = p.parentNode) if (p.matches(selector)) return p; return null; }
      addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
      emit(type, force = false) {
        if (type === "click" && this.disabled && !force) return [];
        const event = { type, target: this, currentTarget: null, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        const results = [];
        for (let node = this; node; node = node.parentNode) {
          event.currentTarget = node;
          for (const fn of node.listeners.get(type) || []) results.push(fn(event));
        }
        return results;
      }
      click() {
        if (this.disabled) return;
        if (this.tagName === "a" && this.download) download(this.href, this.download);
        this.emit("click");
      }
      focus() { document.activeElement = this; }
      scrollIntoView() {}
      checkValidity() { return this.validityOverride; }
    }
    function parse(markup, root) {
      const stack = [root];
      const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*|)>|([^<]+)/g;
      let m;
      while ((m = re.exec(markup))) {
        if (m[1]) {
          const tag = m[1].toLowerCase();
          for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; }
        } else if (m[2]) {
          const element = new Element(m[2]);
          const attrs = m[3] || "";
          for (const a of attrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g)) {
            element.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ""));
          }
          stack.at(-1).append(element);
          if (!voids.has(element.tagName) && !/\/\s*>$/.test(m[0])) stack.push(element);
        } else if (m[4]) stack.at(-1).append(decode(m[4]));
      }
    }
    const document = new Element("document");
    parse(html, document);
    document.createElement = (tag) => new Element(tag);
    document.body = document.querySelector("body");
    document.activeElement = null;
    const form = document.querySelector("#form");
    for (const name of ["cuisines", "music", "films", "city"]) form[name] = form.querySelector("[name=" + name + "]");
    return document;
  }
  async function boot() {
    const events = [], downloads = [], urls = new Map(), calls = [];
    let urlNo = 0, venueController, caregiverHooks, collectionHooks;
    const observe = (event, data = null) => events.push({ seq: events.length, event, data });
    const document = domAdapter(sourceMap.get("static/index.html"), observe, (url, filename) => {
      if (!urls.has(url)) throw new Error("Download used an unknown Blob URL");
      downloads.push({ filename, blob: urls.get(url) }); observe("download.gesture", { filename });
    });
    const winEvents = new Map();
    const window = {
      addEventListener(type, fn) { if (!winEvents.has(type)) winEvents.set(type, []); winEvents.get(type).push(fn); },
      print() { observe("print.request"); }
    };
    const context = vm.createContext({
      document, window, console: { log() {}, warn() {}, error() {} },
      TextEncoder, TextDecoder, AbortController, structuredClone, Blob, Uint8Array,
      crypto: crypto.webcrypto, Date, Intl,
      URL: { createObjectURL(blob) { const url = "receiver-blob:" + (++urlNo); urls.set(url, blob); return url; }, revokeObjectURL(url) { urls.delete(url); } },
      setTimeout() { observe("download.cleanupTimerScheduled"); return 0; },
      fetch: async (url, options) => {
        calls.push({ url: String(url), method: options?.method || "GET" });
        if (url === "/api/health" && !options) return { json: async () => ({ qloo_mode: "mock" }) };
        if (url === "/api/personas" && !options) return { json: async () => [] };
        throw new Error("Receiver forbids provider/network calls");
      }
    });
    vm.runInContext(sourceMap.get("static/plan-request.js"), context, { filename: "static/plan-request.js" });
    vm.runInContext(sourceMap.get("static/calendar.js"), context, { filename: "static/calendar.js" });
    const nativeRequests = context.TasteTablePlanRequests, nativeCalendar = context.TasteTableCalendar;
    context.TasteTablePlanRequests = {
      create(config) {
        const wrapped = { ...config };
        for (const name of ["onStart", "onResult", "onError", "onIdle"]) wrapped[name] = (...args) => {
          observe("request." + name, name === "onError" ? { message: args[0]?.message } : name === "onResult" ? { source: args[0]?.response?.rootAcceptedOrigin } : null);
          return config[name]?.(...args);
        };
        const real = nativeRequests.create(wrapped);
        return Object.freeze({
          run(...args) { observe("request.run"); return real.run(...args); },
          invalidate() { observe("request.invalidate"); return real.invalidate(); },
          dispose() { observe("request.dispose"); return real.dispose(); }
        });
      }
    };
    context.TasteTableCalendar = {
      ...nativeCalendar,
      createWeekExport(state, options) { observe("calendar.accept", { id: options.id, entities: state.picks.map((p) => p.pick.entity_id) }); return nativeCalendar.createWeekExport(state, options); }
    };
    const modules = new Map();
    for (const name of ["week_plan.mjs", "week_file.mjs", "venue_followup.mjs", "venue_note_file.mjs", "caregiver_handoff.mjs", "saved_weeks.mjs", "saved_week_ui.mjs"]) {
      const path = "static/" + name;
      modules.set(path, new vm.SourceTextModule(sourceMap.get(path), { context, identifier: path }));
    }
    let savedModel;
    const rows = new Map(["B", "C"].map((k) => [F[k].draft.id, plain(F[k].draft)]));
    const deferredReads = new Map();
    const storeCalls = [];
    const store = {
      async list() {
        observe("store.list"); storeCalls.push({ method: "list" });
        return [...rows].map(([id, draft]) => ({ id, draft: savedModel.validateDraft(plain(draft)) })).concat([plain(fixturePack.unreadableRow)]);
      },
      async get(id) {
        observe("store.get", { id }); storeCalls.push({ method: "get", id });
        const deferred = deferredReads.get(id);
        if (deferred) { deferredReads.delete(id); return deferred.promise; }
        if (!rows.has(id)) throw new Error("Missing receiver row: " + id);
        return savedModel.validateDraft(plain(rows.get(id)));
      },
      async save(draft) {
        const checked = savedModel.validateDraft(plain(draft));
        observe("store.save", { id: checked.id, name: checked.name }); storeCalls.push({ method: "save", id: checked.id });
        rows.set(checked.id, checked); return checked;
      },
      async rename(id, name) {
        observe("store.rename", { id, name }); storeCalls.push({ method: "rename", id, name });
        if (!rows.has(id)) throw new Error("Missing receiver row: " + id);
        const renamed = savedModel.renameDraft(plain(rows.get(id)), name, new Date("2030-04-02T00:00:00.000Z"));
        rows.set(id, plain(renamed)); return renamed;
      },
      async remove(id) {
        observe("store.remove", { id }); storeCalls.push({ method: "remove", id }); rows.delete(id);
      },
      close() { observe("store.close"); }
    };
    const storeModule = new vm.SyntheticModule(["createSavedWeekStore"], function () { this.setExport("createSavedWeekStore", () => store); }, { context, identifier: "receiver:storage-boundary" });
    modules.set("static/saved_week_store.mjs", storeModule);
    const linkReal = (specifier) => {
      if (!specifier.startsWith("./")) throw new Error("Unadmitted import: " + specifier);
      const found = modules.get("static/" + specifier.slice(2));
      if (!found) throw new Error("Missing exact source module: " + specifier);
      return found;
    };
    await modules.get("static/caregiver_handoff.mjs").link(linkReal);
    await modules.get("static/caregiver_handoff.mjs").evaluate();
    await modules.get("static/saved_week_ui.mjs").link(linkReal);
    await modules.get("static/saved_week_ui.mjs").evaluate();
    savedModel = modules.get("static/saved_weeks.mjs").namespace;
    const venue = modules.get("static/venue_followup.mjs").namespace;
    const caregiver = modules.get("static/caregiver_handoff.mjs").namespace;
    const savedUI = modules.get("static/saved_week_ui.mjs").namespace;
    const wrapVenue = new vm.SyntheticModule(["mountVenueFollowup"], function () {
      this.setExport("mountVenueFollowup", (root, current, changed) => {
        const real = venue.mountVenueFollowup(root, current, () => { observe("venue.changed"); changed(); });
        venueController = real;
        const wrapped = {};
        for (const name of Object.keys(real)) wrapped[name] = (...args) => {
          if (name !== "snapshot") observe("venue." + name + ".enter");
          const result = real[name](...args);
          if (name !== "snapshot") observe("venue." + name + ".exit");
          return result;
        };
        return Object.freeze(wrapped);
      });
    }, { context, identifier: "receiver:venue-observer" });
    const wrapCaregiver = new vm.SyntheticModule(["mountCaregiverHandoff"], function () {
      this.setExport("mountCaregiverHandoff", (root, hooks) => {
        caregiverHooks = hooks;
        return caregiver.mountCaregiverHandoff(root, {
          ...hooks,
          prepare(...args) { observe("caregiver.prepare.enter"); const result = hooks.prepare(...args); observe("caregiver.prepare.exit"); return result; },
          accept(...args) { observe("caregiver.accept.enter"); const result = hooks.accept(...args); observe("caregiver.accept.exit"); return result; }
        });
      });
    }, { context, identifier: "receiver:caregiver-observer" });
    const wrapCollection = new vm.SyntheticModule(["createSavedWeeksUI"], function () {
      this.setExport("createSavedWeeksUI", (hooks) => {
        collectionHooks = hooks;
        const real = savedUI.createSavedWeeksUI({
          ...hooks,
          capture() {
            const capture = hooks.capture();
            observe("collection.capture", capture ? { source: capture.response.rootAcceptedOrigin, entities: capture.weekState.picks.map((p) => p.pick.entity_id), calendarId: capture.calendarId } : null);
            return capture;
          },
          openSaved(...args) { observe("collection.openSaved"); return hooks.openSaved(...args); }
        });
        return Object.freeze({ refreshCurrent() { observe("collection.refresh.enter"); const result = real.refreshCurrent(); observe("collection.refresh.exit"); return result; } });
      });
    }, { context, identifier: "receiver:collection-observer" });
    const app = new vm.SourceTextModule(sourceMap.get("static/app.js"), { context, identifier: "static/app.js" });
    await app.link((specifier) => {
      if (specifier === "./venue_followup.mjs") return wrapVenue;
      if (specifier === "./caregiver_handoff.mjs") return wrapCaregiver;
      if (specifier === "./saved_week_ui.mjs") return wrapCollection;
      return linkReal(specifier);
    });
    await app.evaluate();
    await drain();
    const $ = (selector) => { const element = document.querySelector(selector); if (!element) throw new Error("DOM adapter selector has no match: " + selector); return element; };
    const H = (name) => $("[data-handoff-" + name + "]");
    const makeFile = (text, name, deferred = null) => ({
      name, size: Buffer.byteLength(text),
      async arrayBuffer() { if (deferred) return deferred.promise; return Uint8Array.from(Buffer.from(text)).buffer; }
    });
    async function chooseHandoff(text, name = "root-handoff.json", deferred = null) {
      H("open").click(); H("input").files = [makeFile(text, name, deferred)];
      const promises = H("input").emit("change").filter((v) => v && typeof v.then === "function");
      if (!deferred) { await Promise.all(promises); await drain(); }
      return { promises, finish: () => Promise.all(promises) };
    }
    async function seed(key = "A") { await chooseHandoff(F[key].handoffText, "seed-" + key + ".json"); H("apply").click(); await drain(); }
    async function preview(keyOrId) {
      const id = F[keyOrId]?.draft.id || keyOrId;
      const button = $("#savedWeeksList").querySelectorAll("button").find((e) => e.dataset.savedWeekId === id);
      if (!button) throw new Error("No collection row in actual UI: " + id);
      button.click(); await drain();
    }
    async function open(key) { await preview(key); $("#openSavedWeek").click(); await drain(); }
    function postpone(key) { const pending = defer(); deferredReads.set(F[key].draft.id, pending); return pending; }
    function form() {
      const f = $("#form");
      return { cuisines: f.cuisines.value, music: f.music.value, films: f.films.value, city: f.city.value,
        constraints: f.querySelectorAll("[name=constraints]").map((e) => ({ value: e.value, checked: e.checked })) };
    }
    function snapshot() {
      const context = venueController.snapshot();
      return { ...context, records: plain(context.model.snapshotRecords()), form: form(), calendar: $("#calendarPreview").children.map((e) => e.textContent), date: $("#weekDate").value };
    }
    async function exportedHandoff() {
      const before = downloads.length; H("save").click(); await drain();
      check(downloads.length === before + 1, "actual caregiver Save prepares exactly one Blob download");
      return JSON.parse(await downloads.at(-1).blob.text());
    }
    async function calendarOutput() {
      const before = downloads.length; $("#calendarDownload").click(); await drain();
      check(downloads.length === before + 1, "actual calendar gesture prepares exactly one Blob download");
      return await downloads.at(-1).blob.text();
    }
    function edit(field, value) {
      const input = $("#venueFollowup").querySelector('[data-contact-field="' + field + '"]');
      if (!input) throw new Error("No actual worksheet input: " + field);
      input.value = value; input.emit(field === "status" ? "change" : "input");
    }
    return { $, H, context, document, events, calls, downloads, rows, store, storeCalls, snapshot, form,
      seed, preview, open, postpone, chooseHandoff, exportedHandoff, calendarOutput, edit,
      appCapture: () => collectionHooks.capture(), appOpen: (key) => collectionHooks.openSaved(() => store.get(F[key].draft.id)),
      forceApply: () => H("apply").emit("click", true),
      pendingBuffer: (text) => Uint8Array.from(Buffer.from(text)).buffer };
  }
  function expectForm(env, key, label) {
    const expected = F[key].expected.inputs;
    eq(env.form(), { cuisines: expected.cuisines.join(", "), music: expected.music.join(", "), films: expected.films.join(", "), city: expected.city,
      constraints: ["soft_foods", "low_sodium", "wheelchair"].map((value) => ({ value, checked: expected.constraints.includes(value) })) }, label);
  }
  function pendingGone(env, label) {
    check(env.H("preview").hidden === true, label + ": preview independently hidden");
    check(env.H("apply").disabled === true, label + ": Apply independently disabled");
  }
  function pendingShown(env, label) {
    check(env.H("preview").hidden === false, label + ": preview visible");
    check(env.H("apply").disabled === false, label + ": Apply enabled");
  }
  function unchanged(env, before, label) {
    const after = env.snapshot();
    check(after.origin === before.origin, label + ": exact accepted origin object retained");
    check(after.state === before.state, label + ": exact arranged state object retained");
    check(after.model === before.model, label + ": exact worksheet model object retained");
    eq(after.records, before.records, label + ": complete notes retained");
    eq(after.form, before.form, label + ": all form values retained");
    eq(after.calendar, before.calendar, label + ": calendar rows retained");
  }
  function accepted(env, key, records, label) {
    const actual = env.snapshot(), expected = F[key].expected;
    eq(actual.origin, F[key].origin, label + ": exact complete accepted origin");
    eq(actual.state.assignments, expected.assignments, label + ": exact arrangement");
    eq(actual.state.picks.map((p) => p.pick.entity_id), expected.entityIds, label + ": occurrence/source identity");
    eq(actual.state.sourcePlan.notes, [expected.credit], label + ": literal source credit");
    eq(actual.state.weekStart, expected.weekStart, label + ": displayed week");
    eq(actual.records, records, label + ": complete worksheet records");
    expectForm(env, key, label + ": every form field");
    const capture = env.appCapture();
    check(Boolean(capture), label + ": collection capture available");
    eq(capture.response, F[key].origin.response, label + ": collection capture accepted response");
    check(capture.weekState === actual.state, label + ": collection capture exact current state object");
    check(!env.$("#saveWeek").disabled, label + ": portable week save enabled");
  }
  function retired(env, retainedForm, label) {
    check(env.$("#results").hidden, label + ": current plan hidden");
    check(env.$("#venueFollowup").hidden, label + ": worksheet retired");
    check(env.$("#saveWeek").disabled, label + ": week save disabled");
    check(env.H("save").disabled, label + ": caregiver save disabled");
    check(env.$("#calendarDownload").disabled, label + ": calendar disabled");
    eq(env.$("#calendarPreview").children.length, 0, label + ": calendar rows cleared");
    check(env.appCapture() === null, label + ": collection capture unavailable");
    eq(env.form(), retainedForm, label + ": all previous form values retained");
    let refused = false; try { env.snapshot(); } catch { refused = true; }
    check(refused, label + ": actual worksheet snapshot refuses retired plan");
    pendingGone(env, label);
  }
  async function assertCalendar(env, key) {
    const output = (await env.calendarOutput()).replace(/\r\n[ \t]/g, "");
    const lines = output.split("\r\n");
    const expected = F[key].expected;
    const scheduled = Object.entries(expected.assignments).filter(([, day]) => day !== null);
    const uid = lines.filter((x) => x.startsWith("UID:"));
    eq(uid, scheduled.map(([pick]) => "UID:" + expected.calendarId + "-" + expected.weekStart.replace(/-/g, "") + "-" + pick + "@tastetable.invalid"), key + ": exact literal calendar UID baseline");
    eq(lines.filter((x) => x.startsWith("DTSTAMP:")), scheduled.map(() => "DTSTAMP:" + expected.receivedAt.replace(/[-:]/g, "").replace(/\.000Z$/, "Z")), key + ": original calendar timestamp");
    eq(lines.filter((x) => x.startsWith("DTSTART;VALUE=DATE:")), scheduled.map(([pick]) => "DTSTART;VALUE=DATE:" + expected.visitDates[Number(pick.slice(5))].replace(/-/g, "")), key + ": exact calendar visit dates");
  }
  async function execute(id, run) {
    const group = { id, status: "running", checks: [], observations: [] };
    currentGroup = group; receipt.groups.push(group);
    let env;
    try {
      env = await boot(); await run(env, group);
      check(env.calls.every((c) => c.method === "GET" && ["/api/health", "/api/personas"].includes(c.url)), "no provider request: only declared health/persona doubles reached");
      group.status = "passed"; receipt.passedGroups++;
    } catch (error) {
      group.status = "failed"; group.error = { name: error.name, message: error.message, stack: error.stack };
      receipt.failedGroups++;
    } finally {
      if (env) { group.events = env.events; group.storageCalls = env.storeCalls; group.requestDoubles = env.calls; }
    }
  }
  await execute("preview-B-over-A", async (e) => {
    await e.seed(); await e.chooseHandoff(F.H.handoffText);
    const before = e.snapshot(); await e.preview("B");
    eq(e.$("#savedPreviewTitle").textContent, "Same display name", "real collection Preview displays B metadata");
    eq(e.storeCalls.filter((x) => x.method === "get").at(-1).id, "root-row-B", "real Preview reads exact B storage row");
    unchanged(e, before, "Preview B over A"); pendingShown(e, "metadata preview preserves pending H");
    const out = await e.exportedHandoff();
    eq(out.week.response, F.A.origin.response, "caregiver export remains A");
    eq(out.venueNotes.records, F.A.records, "caregiver export preserves notes A");
    pendingShown(e, "caregiver Save preserves pending H");
  });
  await execute("rename-remove-snapshot", async (e) => {
    await e.seed(); await e.open("B"); e.edit("reply", "root-notes-B");
    await e.chooseHandoff(F.H.handoffText); const before = e.snapshot();
    e.$("#renameSavedWeekName").value = "Renamed B"; e.$("#renameSavedWeek").click(); await drain();
    eq(e.rows.get(F.B.draft.id).name, "Renamed B", "real Rename controller invokes native draft rename in the storage adapter");
    unchanged(e, before, "Rename detached B"); pendingShown(e, "Rename preserves pending H");
    e.$("#removeSavedWeek").click(); await drain();
    check(!e.rows.has(F.B.draft.id), "real Remove controller removes exact storage-adapter row B");
    unchanged(e, before, "Remove detached B"); pendingShown(e, "Remove preserves pending H");
    const out = await e.exportedHandoff(); eq(out.week.response, F.B.origin.response, "removed row still exports accepted B"); eq(out.venueNotes.records, before.records, "removed row retains detached B notes");
  });
  await execute("unreadable-preview", async (e) => {
    await e.seed(); const before = e.snapshot(); await e.preview("root-row-corrupt");
    check(e.$("#savedPreviewTitle").textContent.includes("cannot be opened"), "actual UI reports unreadable record");
    check(e.$("#openSavedWeek").disabled, "unreadable record cannot Open");
    unchanged(e, before, "Unreadable Preview"); const out = await e.exportedHandoff(); eq(out.venueNotes.records, F.A.records, "unreadable Preview preserves current A export");
  });
  await execute("open-retire-before-await", async (e, g) => {
    await e.seed(); await e.chooseHandoff(F.H.handoffText); await e.preview("B");
    const beforeForm = e.form(), pending = e.postpone("B"), mark = e.events.length;
    e.$("#openSavedWeek").click();
    retired(e, beforeForm, "before unresolved storage read settles");
    const events = e.events.slice(mark).map((x) => x.event);
    check(events.indexOf("request.onStart") >= 0 && events.indexOf("request.onStart") < events.indexOf("store.get"), "real onStart precedes storage get and its await");
    check(!events.includes("request.onResult"), "no acceptance before storage resolution");
    g.observations.push({ unresolvedAtAssertions: true, afterAssertionsCleanup: "The deliberately deferred storage promise is rejected with a receiver-labelled error solely to close the pending test action; this later callback is not part of the before-await acceptance claim." });
    pending.reject(new Error("receiver cleanup of deliberately pending Open")); await drain();
  });
  await execute("open-B-success", async (e) => {
    await e.seed(); await e.open("B"); accepted(e, "B", [], "collection B success");
    await assertCalendar(e, "B");
    const captures = e.events.filter((x) => x.event === "collection.capture" && x.data);
    eq(captures.at(-1).data, { source: "root-origin-B", entities: F.B.expected.entityIds, calendarId: F.B.expected.calendarId }, "final real collection capture is B after origin acceptance");
  });
  await execute("open-B-current-refusal", async (e) => {
    await e.seed(); await e.preview("B"); const form = e.form(), pending = e.postpone("B"), mark = e.events.length;
    e.$("#openSavedWeek").click(); pending.reject(new Error("root designated current B refusal")); await drain();
    retired(e, form, "current B refusal");
    eq(e.events.slice(mark).filter((x) => x.event === "request.onError").length, 1, "current B refusal dispatches one actual error");
    eq(e.events.slice(mark).filter((x) => x.event === "request.onIdle").length, 1, "current B refusal dispatches one actual idle");
    check(e.$("#requestStatus").textContent.includes("root designated current B refusal"), "current B error is displayed");
  });
  await execute("open-B-edit-cancel", async (e) => {
    await e.seed(); await e.preview("B"); const pending = e.postpone("B"); e.$("#openSavedWeek").click();
    e.$("#form").city.value = "root edited city"; e.$("#form").city.emit("input");
    const form = e.form(), mark = e.events.length; pending.resolve(plain(F.B.draft)); await drain();
    retired(e, form, "input edit cancels pending B");
    check(!e.events.slice(mark).some((x) => ["request.onResult","request.onError","request.onIdle"].includes(x.event)), "obsolete B success emits no result/error/idle after edit");
    eq(e.$("#form").city.value, "root edited city", "edited city remains current");
  });
  await execute("B-then-C-success-race", async (e, g) => {
    await e.seed(); const b = e.postpone("B"), c = e.postpone("C");
    const bp = e.appOpen("B"), cp = e.appOpen("C");
    c.resolve(plain(F.C.draft)); check(await cp, "C actual host Open succeeds"); const before = e.snapshot(), mark = e.events.length;
    b.resolve(plain(F.B.draft)); check(await bp === false, "obsolete B actual host Open returns false");
    unchanged(e, before, "late B success after C"); accepted(e, "C", [], "C wins same-name source race");
    check(!e.events.slice(mark).some((x) => ["request.onResult","request.onError","request.onIdle"].includes(x.event)), "obsolete success emits no result/error/idle");
    g.observations.push({ entry: "captured exact app Open callback; no second concurrent UI Open admission claimed" });
  });
  await execute("B-late-failure-after-C", async (e, g) => {
    await e.seed(); const b = e.postpone("B"), c = e.postpone("C"), bp = e.appOpen("B"), cp = e.appOpen("C");
    c.resolve(plain(F.C.draft)); await cp; const before = e.snapshot(), status = e.$("#requestStatus").textContent, mark = e.events.length;
    b.reject(new Error("root obsolete B rejection")); check(await bp === false, "obsolete B rejection returns false");
    unchanged(e, before, "late B error after C"); eq(e.$("#requestStatus").textContent, status, "late B error does not replace success status");
    check(!e.events.slice(mark).some((x) => ["request.onResult","request.onError","request.onIdle"].includes(x.event)), "obsolete rejection emits no result/error/idle");
    g.observations.push({ entry: "captured exact app Open callback; no second concurrent UI Open admission claimed" });
  });
  await execute("handoff-preview-over-A", async (e) => {
    await e.seed(); const before = e.snapshot(), mark = e.events.length; await e.chooseHandoff(F.H.handoffText);
    unchanged(e, before, "pure H preparation"); pendingShown(e, "valid H prepared");
    check(!e.events.slice(mark).some((x) => ["request.invalidate","request.onStart","dom.planWrite","store.save"].includes(x.event)), "prepare does not commit, retire requests or save storage");
    const out = await e.exportedHandoff(); eq(out.week.response, F.A.origin.response, "unapplied H cannot enter current export"); eq(out.venueNotes.records, F.A.records, "A notes remain exported");
  });
  await execute("handoff-refusal-cancel", async (e) => {
    await e.seed(); const before = e.snapshot(), mark = e.events.length;
    await e.chooseHandoff("{", "root-invalid.json"); unchanged(e, before, "invalid H refusal"); pendingGone(e, "invalid H refusal");
    check(e.H("status").textContent.includes("not valid JSON"), "native caregiver codec refusal displayed");
    await e.chooseHandoff(F.H.handoffText); e.H("cancel").click(); await drain();
    unchanged(e, before, "valid H Cancel"); pendingGone(e, "valid H Cancel");
    check(!e.events.slice(mark).some((x) => ["request.invalidate","request.onStart","dom.planWrite"].includes(x.event)), "refusal and Cancel never retire current request state or commit a view");
  });
  await execute("handoff-apply-H", async (e, g) => {
    await e.seed(); await e.chooseHandoff(F.H.handoffText); const mark = e.events.length;
    e.H("apply").click(); await drain(); const events = e.events.slice(mark);
    const invalidationIndex = events.findIndex((x) => x.event === "request.invalidate"), commitIndex = events.findIndex((x) => x.event === "dom.planWrite");
    check(invalidationIndex >= 0 && commitIndex >= 0 && invalidationIndex < commitIndex, "Apply invalidates real request generation before first plan commit");
    eq(events.filter((x) => x.event === "caregiver.accept.enter").length, 1, "prepared H accepted exactly once");
    accepted(e, "H", F.H.records, "explicit H Apply"); pendingGone(e, "consumed H preview"); await assertCalendar(e, "H");
    const finalCapture = events.filter((x) => x.event === "collection.capture" && x.data).at(-1);
    eq(finalCapture.data, { source: "root-origin-H", entities: F.H.expected.entityIds, calendarId: F.H.expected.calendarId }, "final refresh captures H origin and H state");
    check(!events.some((x) => x.event === "store.save"), "Apply performs no implicit browser storage Save");
    const out = await e.exportedHandoff(); eq(out.venueNotes.records, F.H.records, "H export preserves history, omitted note and explicit empty fields");
    g.observations.push({ transientCaptureSources: events.filter((x) => x.event === "collection.capture" && x.data).map((x) => x.data), interpretation: "Intermediate render refreshes are recorded; the final capture is asserted after the synchronous accepted-origin/model/calendar sequence. No event-loop yield or implicit storage write is claimed." });
  });
  await execute("apply-H-obsoletes-B", async (e, g) => {
    for (const outcome of ["success", "failure"]) {
      if (outcome === "failure") e = await boot();
      await e.seed(); const b = e.postpone("B"), bp = e.appOpen("B");
      await e.chooseHandoff(F.H.handoffText); pendingShown(e, "actual unchanged H UI admits preview over retired snapshot: " + outcome);
      e.H("apply").click(); await drain(); const before = e.snapshot(), mark = e.events.length;
      if (outcome === "success") b.resolve(plain(F.B.draft)); else b.reject(new Error("root obsolete B after H"));
      check(await bp === false, "H fences pending B " + outcome);
      unchanged(e, before, "late B " + outcome + " after H"); accepted(e, "H", F.H.records, "H after B " + outcome);
      check(!e.events.slice(mark).some((x) => ["request.onResult","request.onError","request.onIdle"].includes(x.event)), "late B " + outcome + " cannot emit callbacks after H");
      g.observations.push({ subtrace: outcome, events: e.events, requestDoubles: e.calls });
    }
  });
  await execute("open-retires-pending-handoff-read", async (e) => {
    await e.seed(); await e.preview("B"); const buffer = defer();
    const reading = await e.chooseHandoff(F.H.handoffText, "root-deferred-H.json", buffer);
    const b = e.postpone("B"), mark = e.events.length; e.$("#openSavedWeek").click();
    buffer.resolve(e.pendingBuffer(F.H.handoffText)); await reading.finish(); await drain();
    pendingGone(e, "collection Open retires unfinished H read");
    check(!e.events.slice(mark).some((x) => x.event === "caregiver.prepare.enter"), "stale H bytes never reach app prepare callback");
    b.resolve(plain(F.B.draft)); await drain(); accepted(e, "B", [], "B after stale H read");
  });
  await execute("note-date-edit-retires-preview", async (e, g) => {
    for (const change of ["note", "date", "arrangement", "invalidDate"]) {
      if (change !== "note") e = await boot();
      await e.seed(); await e.chooseHandoff(F.H.handoffText);
      if (change === "note") e.edit("nextStep", "root edited next step");
      if (change === "date") { e.$("#weekDate").value = "2030-05-08"; e.$("#weekDate").emit("input"); }
      if (change === "arrangement") { const select = e.$('#weekOrganizer select[data-pick-key="pick-0"]'); select.value = "Friday"; select.emit("change"); }
      if (change === "invalidDate") { e.$("#weekDate").value = "2030-02-30"; e.$("#weekDate").emit("input"); }
      pendingGone(e, change + " invalidates H"); const mark = e.events.length;
      e.forceApply(); await drain();
      check(!e.events.slice(mark).some((x) => x.event === "caregiver.accept.enter"), change + ": forced stale Apply handler refuses acceptance");
      if (change === "invalidDate") {
        check(e.appCapture() === null, "invalid displayed date refuses collection capture");
        check(e.H("save").disabled, "invalid displayed date refuses caregiver export");
        check(e.$("#saveWeek").disabled, "invalid displayed date refuses week export");
      } else {
        const capture = e.appCapture();
        check(capture?.response.rootAcceptedOrigin === "root-origin-A", change + ": edited current capture stays bound to A");
        if (change === "note") eq(e.snapshot().records[0].note.nextStep, "root edited next step", "native note edit actually committed before stale Apply attempt");
        if (change === "date") eq(capture.weekState.weekStart, "2030-05-06", "native date edit actually moved displayed week");
        if (change === "arrangement") eq(capture.weekState.assignments["pick-0"], "Friday", "native arrangement edit actually committed");
      }
      g.observations.push({ subtrace: change, events: e.events, requestDoubles: e.calls });
    }
  });
  await execute("collection-save-after-apply", async (e) => {
    await e.seed(); await e.chooseHandoff(F.H.handoffText); e.H("apply").click(); await drain();
    e.$("#savedWeekName").value = "root H browser copy"; const before = new Set(e.rows.keys());
    e.$("#saveCurrentWeek").click(); await drain();
    const added = [...e.rows.keys()].filter((id) => !before.has(id)); eq(added.length, 1, "actual browser Save controller captures one new storage-adapter draft");
    const draft = e.rows.get(added[0]), saved = JSON.parse(draft.text);
    eq(saved.format, "tastetable.saved-week.v1", "collection Save retains native week format");
    eq(saved.response, F.H.origin.response, "browser copy contains exact H source");
    eq(saved.week, JSON.parse(F.H.weekText).week, "browser copy contains exact H arrangement");
    check(!Object.hasOwn(saved, "venueNotes") && !Object.hasOwn(saved, "records") && !draft.text.includes("root-notes-H") && !draft.text.includes("H-history") && !draft.text.includes("H-omitted"), "browser copy excludes complete venue notes and question history");
    await e.preview(added[0]); e.$("#openSavedWeek").click(); await drain();
    accepted(e, "H", [], "reopened saved H browser copy"); const out = await e.exportedHandoff(); eq(out.venueNotes.records, [], "original H notes do not silently recover from browser copy");
  });
  await execute("same-name-two-row-identities", async (e) => {
    await e.seed(); await e.preview("B"); const bTitle = e.$("#savedPreviewTitle").textContent;
    await e.preview("C"); eq(e.$("#savedPreviewTitle").textContent, bTitle, "B and C genuinely share display text");
    const mark = e.storeCalls.length; e.$("#openSavedWeek").click(); await drain();
    eq(e.storeCalls.slice(mark).filter((x) => x.method === "get").map((x) => x.id), ["root-row-C"], "actual UI Open reads exact selected C row ID once");
    accepted(e, "C", [], "same-name C selection"); await assertCalendar(e, "C");
  });
  receipt.finishedAt = new Date().toISOString();
  receipt.status = receipt.failedGroups === 0 ? "passed" : "failed";
  receipt.scopeStatement = "Actual frozen application, controller, codec, model and calendar JavaScript executed. DOM, storage, HTTP responses and physical download transport were explicit doubles. This is not browser, IndexedDB, physical-file, provider, installed or native-device receiving.";
  return receipt;
}
