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
  assert.equal(git(packet.focusOracleText), "4e6754a480c172435da147cd2ffe5790654ec5d9", "frozen focused oracle identity");
  assert.equal(packet.originalCapsuleSha, "121e7a87aa3287bb444bd97679902ea6f680107d", "original capsule identity");
  assert.equal(packet.fixtureSha, "5e9918c1c1a0e57c8f3682804d2d3b21190e8a49", "unchanged original fixture");
  assert.notEqual(packet.candidateAppSha, "ed40637354a456c03dfa32a2e4ec954f23110ffa", "original app must not be executed by this focused receiver");
  const unchangedSources = {"static/index.html":"c9058dae2b074078902be5badf7c5690293e3ee1","static/plan-request.js":"b21276dda840fe6dd96a3bf3258a851970ff5e4d","static/calendar.js":"dbed22d2cb91090bccec9472fbffd2854eed2722","static/week_plan.mjs":"8ed28163e0273c510fdd8e6f7c5d1c8476efb862","static/week_file.mjs":"420ddb8f63fca264dcf97be7147801105696155d","static/venue_followup.mjs":"a3c4b8bd120149441d343cbda2d3c15f6d106ca2","static/venue_note_file.mjs":"f8406cb540d52222996c585666ae1a55a1030def","static/caregiver_handoff.mjs":"4286409b3fe932f61957ba72f5db918d18ff0751","static/saved_weeks.mjs":"0bb822cb6f75c376397c0f7d6d6de78035f865bc","static/saved_week_ui.mjs":"5a281492002b61222c70ed9b4268150504d20b15"};
  assert.equal(packet.sources.length, 11, "exact eleven-source capsule");
  assert.equal(new Set(packet.sources.map(s => s.path)).size, 11, "no duplicate source paths");
  for (const source of packet.sources) {
    assert.equal(source.sha, source.path === "static/app.js" ? packet.candidateAppSha : unchangedSources[source.path], "only exact supplied app may differ: " + source.path);
    assert.equal(typeof source.sha, "string", "source path admitted");
  }
  const receipt = {
    schema: "tastetable.d98-focused-apply-publication-receipt.v1",
    startedAt: new Date().toISOString(), runtime: process.version,
    originalCompositionCommit: fixturePack.sourceCommit, rootOracle: fixturePack.oracle,
    focusedOracle: git(packet.focusOracleText), candidateApp: packet.candidateAppSha,
    originalCapsule: packet.originalCapsuleSha, originalDriver: "74ec645378f92867ce4661da12111de98736c278",
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
    let urlNo = 0, venueController, caregiverHooks, collectionHooks, lastCalendarComplete = null;
    const observe = (event, data = null) => events.push({ seq: events.length, event, data });
    const document = domAdapter(sourceMap.get("static/index.html"), observe, (url, filename) => {
      if (!urls.has(url)) throw new Error("Download used an unknown Blob URL");
      downloads.push({ filename, blob: urls.get(url) }); observe("download.gesture", { filename, coherence: coherence() });
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
      createWeekExport(state, options) {
        observe("calendar.accept", { id: options.id, entities: state.picks.map((p) => p.pick.entity_id) });
        const result = nativeCalendar.createWeekExport(state, options);
        lastCalendarComplete = { id: options.id, entities: state.picks.map((p) => p.pick.entity_id), weekStart: state.weekStart, receivedAt: options.createdAt.toISOString() };
        observe("calendar.accept.complete", plain(lastCalendarComplete));
        return result;
      }
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
          accept(...args) { observe("caregiver.accept.enter"); const result = hooks.accept(...args); observe("caregiver.accept.exit", { thenable: Boolean(result && typeof result.then === "function") }); return result; }
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
            observe("collection.capture", {
              available: Boolean(capture),
              capture: capture ? { source: capture.response.rootAcceptedOrigin, response: plain(capture.response), inputs: plain(capture.inputs), entities: capture.weekState.picks.map((p) => p.pick.entity_id), assignments: plain(capture.weekState.assignments), weekStart: capture.weekState.weekStart, calendarId: capture.calendarId, receivedAt: capture.receivedAt } : null,
              coherence: coherence()
            });
            return capture;
          },
          openSaved(...args) { observe("collection.openSaved"); return hooks.openSaved(...args); }
        });
        return Object.freeze({ refreshCurrent() { observe("collection.refresh.enter", { coherence: coherence() }); const result = real.refreshCurrent(); observe("collection.refresh.exit", { coherence: coherence() }); return result; } });
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
    function coherence() {
      const find = (selector) => document.querySelector(selector);
      const f = find("#form");
      const observed = {
        current: null, currentError: null,
        form: { cuisines: f.cuisines.value, music: f.music.value, films: f.films.value, city: f.city.value,
          constraints: f.querySelectorAll("[name=constraints]").map((e) => ({ value: e.value, checked: e.checked })) },
        calendar: lastCalendarComplete ? plain(lastCalendarComplete) : null,
        calendarPreview: find("#calendarPreview").children.map((e) => e.textContent),
        calendarEnabled: !find("#calendarDownload").disabled,
        date: find("#weekDate").value,
        view: { plan: find("#plan").innerHTML, days: find("#weekDays").innerHTML, omitted: find("#omittedPicks").innerHTML, credit: find("#weekNotes").textContent }
      };
      try {
        const live = venueController.snapshot();
        observed.current = { origin: plain(live.origin), entities: live.state.picks.map(p => p.pick.entity_id),
          assignments: plain(live.state.assignments), weekStart: live.state.weekStart, records: plain(live.model.snapshotRecords()) };
      } catch (error) { observed.currentError = { name: error.name, message: error.message }; }
      return observed;
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
      seed, preview, open, postpone, chooseHandoff, exportedHandoff, calendarOutput, edit, coherence,
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

  function expectHCoherence(actual, label) {
    check(actual.currentError === null && actual.current !== null, label + ": actual live model admits current source");
    eq(actual.current.origin, F.H.origin, label + ": complete accepted H origin");
    eq(actual.current.entities, F.H.expected.entityIds, label + ": H occurrence identities");
    eq(actual.current.assignments, F.H.expected.assignments, label + ": H arrangement");
    eq(actual.current.weekStart, F.H.expected.weekStart, label + ": H state week");
    eq(actual.current.records, F.H.records, label + ": all H model records");
    const expected = F.H.expected.inputs;
    eq(actual.form, { cuisines: expected.cuisines.join(", "), music: expected.music.join(", "), films: expected.films.join(", "), city: expected.city,
      constraints: ["soft_foods", "low_sodium", "wheelchair"].map(value => ({ value, checked: expected.constraints.includes(value) })) }, label + ": all H input controls");
    eq(actual.date, F.H.expected.weekStart, label + ": H displayed date");
    eq(actual.calendar, { id: F.H.expected.calendarId, entities: F.H.expected.entityIds, weekStart: F.H.expected.weekStart, receivedAt: F.H.expected.receivedAt }, label + ": actual completed H calendar construction");
    eq(actual.calendarPreview, ["Monday 2030-08-12 — Shared venue display name 1 (all-day suggestion)"], label + ": fully refreshed H calendar preview");
    check(actual.calendarEnabled, label + ": H calendar control ready");
    check(F.H.expected.entityIds.every(id => actual.view.plan.includes(id)), label + ": complete original H response view");
    check(actual.view.days.includes("H:pick:1") && !actual.view.days.includes("H:pick:2"), label + ": scheduled H occurrence rendered");
    check(actual.view.omitted.includes("H:pick:2") && !actual.view.omitted.includes("H:pick:1"), label + ": omitted H occurrence rendered");
    check(actual.view.credit.includes(F.H.expected.credit), label + ": literal H credit rendered");
    check(![actual.view.plan, actual.view.days, actual.view.omitted, actual.view.credit].some(text => text.includes("A:pick:") || text.includes("Literal A credit")), label + ": no prior A view remnants");
  }
  function expectHWeek(week, label) {
    const expected = JSON.parse(F.H.weekText);
    for (const key of ["format", "receivedAt", "calendarId", "inputs", "response", "week"]) eq(week[key], expected[key], label + ": exact " + key);
    check(typeof week.savedAt === "string" && Number.isFinite(Date.parse(week.savedAt)) && new Date(week.savedAt).toISOString() === week.savedAt, label + ": actual generated save timestamp is canonical");
  }
  await execute("handoff-H-complete-before-collection-publication", async (e, g) => {
    await e.seed("A");
    accepted(e, "A", F.A.records, "setup accepted A");
    await e.chooseHandoff(F.H.handoffText, "focused-H.json");
    pendingShown(e, "prepared literal H");
    const mark = e.events.length, storesBefore = e.storeCalls.length, downloadsBefore = e.downloads.length;
    e.H("apply").click();
    const synchronousEnd = e.events.length;
    await drain();
    const window = e.events.slice(mark, synchronousEnd);
    g.applyWindow = { firstEvent: mark, synchronousEnd, events: window };
    const entries = window.filter(x => x.event === "caregiver.accept.enter");
    const exits = window.filter(x => x.event === "caregiver.accept.exit");
    const invalidations = window.filter(x => x.event === "request.invalidate");
    const commits = window.filter(x => x.event === "dom.planWrite");
    const models = window.filter(x => x.event === "venue.acceptPrepared.exit");
    const calendars = window.filter(x => x.event === "calendar.accept.complete");
    eq(entries.length, 1, "real H Apply enters the actual accept hook exactly once");
    eq(exits.length, 1, "real H Apply completes the actual accept hook synchronously exactly once");
    check(exits[0].data.thenable === false, "actual H acceptance returns synchronously without a thenable");
    eq(invalidations.length, 1, "H Apply invalidates real request generation exactly once");
    eq(commits.length, 1, "H Apply commits the prepared response view exactly once");
    check(entries[0].seq < invalidations[0].seq && invalidations[0].seq < commits[0].seq && commits[0].seq < exits[0].seq, "request invalidation precedes first commit inside H acceptance");
    eq(models.length, 1, "actual H prepared worksheet accepted exactly once");
    eq(calendars.length, 1, "actual H calendar constructor completes exactly once");
    check(models[0].seq > commits[0].seq && calendars[0].seq > commits[0].seq, "H model and calendar acceptance follow the prepared plan commit");
    const readyAfter = Math.max(models[0].seq, calendars[0].seq);
    const publications = window.filter(x => /^collection\.(refresh\.enter|capture|refresh\.exit)$/.test(x.event));
    check(publications.some(x => x.event === "collection.refresh.enter") && publications.some(x => x.event === "collection.capture"), "H completion actually refreshes collection and performs its real capture");
    for (const event of publications) {
      check(event.seq > readyAfter && event.seq < exits[0].seq, "no partial-state collection operation: " + event.event + " seq " + event.seq);
      expectHCoherence(event.data.coherence, event.event + " seq " + event.seq);
      if (event.event === "collection.capture") {
        check(event.data.available === true && event.data.capture !== null, "published H collection capture is available");
        eq(event.data.capture, { source: "root-origin-H", response: F.H.origin.response, inputs: F.H.origin.inputs, entities: F.H.expected.entityIds,
          assignments: F.H.expected.assignments, weekStart: F.H.expected.weekStart, calendarId: F.H.expected.calendarId, receivedAt: F.H.expected.receivedAt }, "every actual collection capture is complete H");
      }
    }
    check(!window.some(x => x.event === "store.save" || x.event === "store.rename" || x.event === "store.remove" || x.event === "download.gesture"), "H Apply has no implicit storage mutation or export gesture");
    eq(e.storeCalls.length, storesBefore, "H Apply invokes no storage operation");
    eq(e.downloads.length, downloadsBefore, "H Apply prepares no implicit Blob download");
    accepted(e, "H", F.H.records, "final explicit H Apply");
    pendingGone(e, "H preview consumed");
    check(!e.$("#results").hidden && !e.$("#venueFollowup").hidden, "accepted H results and worksheet visible");
    check(!e.H("save").disabled && !e.$("#saveWeek").disabled && !e.$("#calendarDownload").disabled, "all H export controls enabled after acceptance");
    expectHCoherence(e.coherence(), "final accepted H");
    const out = await e.exportedHandoff();
    eq(out.format, "tastetable.caregiver-handoff.v1", "actual caregiver export native format");
    expectHWeek(out.week, "actual caregiver exported week");
    eq(out.venueNotes.origin, F.H.origin, "caregiver export notes bound to exact H origin");
    eq(out.venueNotes.records, F.H.records, "caregiver export retains H history, omitted and explicit empty records");
    const beforeWeek = e.downloads.length;
    e.$("#saveWeek").click(); await drain();
    eq(e.downloads.length, beforeWeek + 1, "actual portable week gesture prepares exactly one Blob");
    expectHWeek(JSON.parse(await e.downloads.at(-1).blob.text()), "actual portable H week");
    await assertCalendar(e, "H");
    const allAfter = e.events.slice(mark);
    for (const event of allAfter.filter(x => x.event === "download.gesture")) {
      check(event.seq > exits[0].seq, "all export gestures follow full H acceptance");
      expectHCoherence(event.data.coherence, "explicit export " + event.data.filename);
    }
    for (const event of allAfter.filter(x => x.event === "collection.capture" && x.seq >= synchronousEnd)) {
      expectHCoherence(event.data.coherence, "post-acceptance capture seq " + event.seq);
      check(event.data.available && event.data.capture.source === "root-origin-H" && event.data.capture.calendarId === F.H.expected.calendarId, "later capture remains H");
      eq(event.data.capture.entities, F.H.expected.entityIds, "later capture H occurrences");
    }
    eq(e.downloads.length - downloadsBefore, 3, "exactly the three explicitly requested H output Blobs");
    eq(e.storeCalls.length, storesBefore, "focused flow never saves to browser collection storage");
    g.artifacts = [];
    for (const output of e.downloads.slice(downloadsBefore)) {
      const text = await output.blob.text();
      g.artifacts.push({ filename: output.filename, bytes: Buffer.byteLength(text), sha256: sha(text, "sha256"), text });
    }
    g.observations.push({
      publicationEvents: publications.map(x => ({seq:x.seq,event:x.event})), modelCompletion: models[0].seq,
      calendarCompletion: calendars[0].seq, acceptanceExit: exits[0].seq,
      interpretation: "One corrected H Apply trace plus explicit final exports. No original campaign replay, persisted-corruption claim, physical browser or installation claim."
    });
  });
  receipt.finishedAt = new Date().toISOString();
  receipt.status = receipt.failedGroups === 0 ? "passed" : "failed";
  receipt.scopeStatement = "One focused corrected application H Apply with real unchanged controller, codec, model and calendar JavaScript. Original DOM, storage, HTTP and download-transport doubles remain explicit. No old app/campaign execution, browser, IndexedDB, physical-file, provider or native-installation proof.";
  return receipt;
}

