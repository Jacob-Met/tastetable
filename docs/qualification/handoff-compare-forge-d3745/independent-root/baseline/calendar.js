/* Local iCalendar handoff for an already displayed TasteTable plan.
 * RFC 5545: sections 3.1 (folding), 3.3.11 (TEXT), and 3.6.1 (all-day events).
 * No network, storage, calendar-service calls, or recommendation decisions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TasteTableCalendar = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const CAUTION = "Suggested outing only; no booking or opening hours confirmed. Not medical or dietary advice. Confirm accessibility, texture and sodium needs with the venue and the person's care team.";
  const encoder = new TextEncoder();

  function text(value, label, max, allowEmpty = false) {
    if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
      throw new Error("The plan has an invalid " + label + ". Generate a new plan before exporting.");
    }
    // Refuse unsupported controls and lone UTF-16 surrogates instead of silently
    // replacing source characters when the calendar is encoded as UTF-8.
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
        Array.from(value).some((c) => c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff)) {
      throw new Error("The plan contains unsupported characters in " + label + ". Generate a new plan before exporting.");
    }
    return value;
  }

  function readPick(item, kind) {
    if (!item || item.kind !== kind || !DAYS.includes(item.day)) {
      throw new Error("A suggestion has an invalid day or type. Generate a new plan before exporting.");
    }
    return {
      day: item.day, kind,
      entityId: text(item.entity_id, "Qloo entity ID", 1000),
      name: text(item.name, "venue name", 1000),
      why: text(item.why, "explanation", 12000),
    };
  }

  function readPlan(result) {
    if (!result || typeof result.mock !== "boolean" || !result.plan ||
        !Array.isArray(result.plan.meals) || result.plan.meals.length > 7 ||
        !Array.isArray(result.plan.notes) || result.plan.notes.length > 32) {
      throw new Error("The plan is incomplete. Generate a new plan before exporting.");
    }
    const seen = new Set();
    function pick(item, kind) {
      const result = readPick(item, kind);
      const slot = result.day + "/" + kind;
      if (seen.has(slot)) throw new Error("The plan repeats a day and type. Generate a new plan before exporting.");
      seen.add(slot);
      return result;
    }
    const items = result.plan.meals.map((item) => pick(item, "restaurant"));
    if (result.plan.outing !== null) items.push(pick(result.plan.outing, "outing"));
    items.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.kind.localeCompare(b.kind));
    return {
      mock: result.mock,
      items,
      notes: result.plan.notes.map((note) => text(note, "plan note", 12000, true)),
    };
  }

  function dateString(date) {
    const year = date.getUTCFullYear();
    if (year < 1 || year > 9999) throw new Error("Choose a week that ends before the year 10000.");
    return String(year).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  }

  function mondayDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error("Choose the Monday that begins your week.");
    }
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1) throw new Error("Choose a valid Monday.");
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (dateString(date) !== value || date.getUTCDay() !== 1) throw new Error("Choose a valid Monday.");
    // Check the full week, including the exclusive end of Sunday, up front.
    dateString(plusDays(date, 7));
    return date;
  }

  function plusDays(date, days) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  function escapeText(value) {
    return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  }

  function foldLine(line) {
    const lines = [];
    let current = "", bytes = 0;
    for (const c of line) {
      const size = encoder.encode(c).length;
      if (bytes + size > 75) {
        lines.push(current);
        current = " "; // RFC continuation space counts toward the next 75 octets.
        bytes = 1;
      }
      current += c;
      bytes += size;
    }
    lines.push(current);
    return lines.join("\r\n");
  }

  function newId() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function exportMetadata(plan, options) {
    const id = options.id === undefined ? newId() : options.id;
    if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) throw new Error("Invalid calendar plan identifier.");
    const createdAt = options.createdAt === undefined ? new Date() : options.createdAt;
    if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime()) ||
        createdAt.getUTCFullYear() < 1 || createdAt.getUTCFullYear() > 9999) {
      throw new Error("Invalid calendar creation date.");
    }
    const stamp = createdAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const source = plan.mock
      ? "DEMO: synthetic Qloo fixture; these venues are fictional."
      : "Qloo-grounded suggestion; aggregate affinity is not a claim about any individual.";
    return { id, stamp, source };
  }

  function calendarFile(plan, items, week, metadata, identity) {
    if (!items.length) throw new Error("There are no checked suggestions to export. Unavailable days stay open.");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TasteTable//Suggested weekly plan//EN", "CALSCALE:GREGORIAN"];
    for (const item of items) {
      const arrangement = item.originalDay === undefined ? [] : [
        "Originally suggested for: " + item.originalDay + ". Arranged for: " + item.day + " " + item.date + ".",
      ];
      const description = [metadata.source, CAUTION, "Qloo entity ID: " + item.entityId,
        ...arrangement, "Why this suggestion: " + item.why, ...plan.notes.map((note) => "Plan note: " + note)].join("\n\n");
      lines.push("BEGIN:VEVENT", "UID:" + metadata.id + "-" + identity(item) + "@tastetable.invalid",
        "DTSTAMP:" + metadata.stamp, "DTSTART;VALUE=DATE:" + item.date.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + item.endDate.replace(/-/g, ""),
        "SUMMARY:" + escapeText(item.summary), "DESCRIPTION:" + escapeText(description),
        "STATUS:TENTATIVE", "TRANSP:TRANSPARENT", "CLASS:PRIVATE", "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return {
      filename: (plan.mock ? "tastetable-demo-" : "tastetable-") + week + ".ics",
      text: lines.map(foldLine).join("\r\n") + "\r\n",
      count: items.length,
    };
  }

  function createPlanExport(result, options = {}) {
    const plan = readPlan(result); // Copy only displayed grounded picks, never baseline/trace/rejections.
    const metadata = exportMetadata(plan, options);

    function preview(week) {
      const monday = mondayDate(week);
      return plan.items.map((item) => {
        const date = plusDays(monday, DAYS.indexOf(item.day));
        return {
          ...item,
          date: dateString(date),
          endDate: dateString(plusDays(date, 1)),
          summary: (plan.mock ? "[DEMO] " : "") + "TasteTable suggestion: " + item.name,
        };
      });
    }

    function download(week) {
      return calendarFile(plan, preview(week), week, metadata,
        (item) => item.date.replace(/-/g, "") + "-" + item.kind);
    }
    return Object.freeze({ preview, download, source: metadata.source, count: plan.items.length });
  }

  function invalidWeek() {
    throw new Error("The arranged week does not match its checked suggestions. Review the week before exporting.");
  }

  function readWeekEntry(entry) {
    if (!entry || typeof entry.key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(entry.key) ||
        !entry.pick || !["restaurant", "outing"].includes(entry.pick.kind) || entry.originalDay !== entry.pick.day) {
      invalidWeek();
    }
    return { key: entry.key, originalDay: entry.originalDay, ...readPick(entry.pick, entry.pick.kind) };
  }

  function readWeekSource(state) {
    if (!state || !["mock", "live"].includes(state.sourceMode)) invalidWeek();
    const plan = readPlan({ mock: state.sourceMode === "mock", plan: state.sourcePlan });
    const originals = [...state.sourcePlan.meals, ...(state.sourcePlan.outing ? [state.sourcePlan.outing] : [])];
    if (!Array.isArray(state.picks) || state.picks.length !== originals.length) invalidWeek();
    const keys = new Set();
    const items = state.picks.map((entry, index) => {
      const item = readWeekEntry(entry);
      const { key, originalDay, ...pick } = item;
      if (keys.has(key) || JSON.stringify(pick) !== JSON.stringify(readPick(originals[index], originals[index].kind))) {
        invalidWeek();
      }
      keys.add(key);
      return item;
    });
    return { mock: plan.mock, notes: plan.notes, items };
  }

  function readAssignments(state, plan) {
    const monday = mondayDate(state.weekStart);
    const assignments = state.assignments;
    if (!assignments || typeof assignments !== "object" || Array.isArray(assignments) ||
        Object.keys(assignments).length !== plan.items.length) invalidWeek();
    for (const item of plan.items) {
      if (!Object.prototype.hasOwnProperty.call(assignments, item.key) ||
          (assignments[item.key] !== null && !DAYS.includes(assignments[item.key]))) invalidWeek();
    }
    return monday;
  }

  /** Writer for the editable week, with one session per original checked plan.
   * Pass the same current state and its native weekRows(state) to each call.
   * Discard the session when replacing or clearing the source plan. Dates come
   * only from that state; pick-key UIDs survive moves and omissions within a week.
   * Separately chosen weeks have distinct identities.
   * A downloaded file does not synchronize or cancel any previous import.
   */
  function createWeekExport(initialState, options = {}) {
    const plan = readWeekSource(initialState);
    readAssignments(initialState, plan);
    const fingerprint = JSON.stringify(plan);
    const metadata = exportMetadata(plan, options);
    const byKey = new Map(plan.items.map((item) => [item.key, item]));

    function preview(state, rows) {
      if (JSON.stringify(readWeekSource(state)) !== fingerprint) invalidWeek();
      const monday = readAssignments(state, plan);
      if (!Array.isArray(rows) || rows.length !== 7) invalidWeek();
      const included = new Set();
      const items = [];
      for (let index = 0; index < DAYS.length; index++) {
        const row = rows[index];
        const date = plusDays(monday, index);
        if (!row || row.day !== DAYS[index] || row.date !== dateString(date) ||
            !Array.isArray(row.picks) || row.picks.length > plan.items.length) invalidWeek();
        for (const entry of row.picks) {
          const checked = readWeekEntry(entry);
          const item = byKey.get(checked.key);
          if (!item || included.has(item.key) || state.assignments[item.key] !== row.day ||
              JSON.stringify(checked) !== JSON.stringify(item)) invalidWeek();
          included.add(item.key);
          items.push({ ...item, day: row.day, date: row.date,
            endDate: dateString(plusDays(date, 1)),
            summary: (plan.mock ? "[DEMO] " : "") + "TasteTable suggestion: " + item.name });
        }
      }
      if (plan.items.some((item) => state.assignments[item.key] !== null && !included.has(item.key))) invalidWeek();
      return items;
    }

    function download(state, rows) {
      return calendarFile(plan, preview(state, rows), state.weekStart, metadata,
        (item) => state.weekStart.replace(/-/g, "") + "-" + item.key);
    }
    return Object.freeze({ preview, download, source: metadata.source, totalCount: plan.items.length });
  }

  function mount(element) {
    const week = element.querySelector("#calendarWeek");
    const button = element.querySelector("#calendarDownload");
    const list = element.querySelector("#calendarPreview");
    const status = element.querySelector("#calendarStatus");
    const source = element.querySelector("#calendarSource");
    let session = null;

    function clear() {
      session = null;
      button.disabled = true;
      list.replaceChildren();
      source.textContent = "";
      status.textContent = "";
      element.hidden = true;
    }

    function refresh() {
      button.disabled = true;
      list.replaceChildren();
      if (!session) return;
      if (!session.count) {
        status.textContent = "There are no checked suggestions to export. Unavailable days stay open.";
        return;
      }
      try {
        const items = session.preview(week.value);
        for (const item of items) {
          const row = element.ownerDocument.createElement("li");
          row.textContent = item.day + " " + item.date + " — " + item.name + " (all-day suggestion)";
          list.append(row);
        }
        status.textContent = items.length + " suggested events for the week beginning " + week.value + ". Days without a suggestion stay open.";
        button.disabled = false;
      } catch (error) {
        status.textContent = error.message;
      }
    }

    week.addEventListener("input", refresh);
    week.addEventListener("change", refresh);
    button.addEventListener("click", () => {
      if (!session) return;
      let url;
      try {
        const output = session.download(week.value);
        url = URL.createObjectURL(new Blob([output.text], { type: "text/calendar;charset=utf-8" }));
        const link = element.ownerDocument.createElement("a");
        link.href = url;
        link.download = output.filename;
        element.ownerDocument.body.append(link);
        link.click();
        link.remove();
        status.textContent = "Calendar file prepared. Open it in your calendar app to review and import the suggestions.";
      } catch (error) {
        status.textContent = "Calendar download unavailable: " + error.message;
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });

    return Object.freeze({
      clear,
      setResult(result) {
        clear();
        element.hidden = false;
        try {
          session = createPlanExport(result);
          source.textContent = session.source;
          refresh();
        } catch (error) {
          status.textContent = "Calendar download unavailable: " + error.message;
        }
      },
    });
  }

  return Object.freeze({ createPlanExport, createWeekExport, mount });
});
