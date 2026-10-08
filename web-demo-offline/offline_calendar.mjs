/** Calendar handoff for the currently accepted finite offline recording.
 * The copied calendar.js owns the iCalendar format and event identity rules.
 */
import { calendarWeek, weekRows } from "./week_plan.mjs";

const PREVIEW_ID = "00000000000000000000000000000000";

function requireContext(context) {
  if (!context?.record || !context.state || context.record.response?.mock !== true
      || context.state.sourceMode !== "mock") {
    throw new Error("Show a recorded plan before preparing its calendar.");
  }
  if (JSON.stringify(context.state.sourcePlan) !== JSON.stringify(context.record.response.plan)
      || JSON.stringify(context.state.constraints)
        !== JSON.stringify(context.record.response.comparison?.constraints)) {
    throw new Error("The displayed week no longer matches its recorded source.");
  }
  if (calendarWeek(context.anchor)[0].date !== context.state.weekStart) {
    throw new Error("Review the displayed week date before preparing its calendar.");
  }
  const createdAt = new Date(context.receivedAt);
  if (typeof context.receivedAt !== "string" || !Number.isFinite(createdAt.getTime())
      || createdAt.toISOString() !== context.receivedAt) {
    throw new Error("The recorded week has no valid original receipt time.");
  }
  if (context.calendarId !== null
      && (typeof context.calendarId !== "string" || !/^[0-9a-f]{32}$/.test(context.calendarId))) {
    throw new Error("The recorded week has an invalid calendar identity.");
  }
  return createdAt;
}

function sessionFor(context, calendarApi, id) {
  const createdAt = requireContext(context);
  if (typeof calendarApi?.createWeekExport !== "function") {
    throw new Error("The calendar writer is unavailable. Reload the complete offline studio.");
  }
  return {
    session: calendarApi.createWeekExport(context.state, { id, createdAt }),
    rows: weekRows(context.state),
  };
}

/** A preview does not allocate or change a calendar identity. */
export function previewOfflineCalendar(context, calendarApi) {
  const { session, rows } = sessionFor(context, calendarApi, context?.calendarId ?? PREVIEW_ID);
  return {
    items: session.preview(context.state, rows),
    source: session.source,
    totalCount: session.totalCount,
    weekStart: context.state.weekStart,
  };
}

function newCalendarId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Prepare complete bytes; the caller retains the ID only after Blob preparation.
 * This function never mutates the accepted record, arrangement or saved metadata.
 */
export function prepareOfflineCalendar(context, calendarApi, idFactory = newCalendarId) {
  const preview = previewOfflineCalendar(context, calendarApi);
  if (!preview.items.length) {
    throw new Error("No visits are scheduled. Put a recorded pick into the week before downloading.");
  }
  const calendarId = context.calendarId ?? idFactory();
  const { session, rows } = sessionFor(context, calendarApi, calendarId);
  return { ...session.download(context.state, rows), calendarId };
}

/** Only the owning application can retain an ID in its current accepted context. */
export function mountOfflineCalendar(element, { getContext, retainCalendarId, calendarApi }) {
  const document = element.ownerDocument;
  const view = document.defaultView;
  const button = element.querySelector("#offlineCalendarDownload");
  const list = element.querySelector("#offlineCalendarPreview");
  const source = element.querySelector("#offlineCalendarSource");
  const status = element.querySelector("#offlineCalendarStatus");
  const error = element.querySelector("#offlineCalendarError");
  const urls = new Set();
  let active = true;

  function refresh() {
    button.disabled = true;
    list.replaceChildren();
    source.textContent = "";
    status.textContent = "";
    error.textContent = "";
    const context = getContext();
    element.hidden = !active || !context?.record;
    if (element.hidden) return null;
    try {
      const preview = previewOfflineCalendar(context, calendarApi);
      source.textContent = preview.source;
      for (const item of preview.items) {
        const row = document.createElement("li");
        const when = document.createElement("time");
        when.dateTime = item.date;
        when.textContent = item.day + " " + item.date;
        const venue = document.createElement("span");
        venue.textContent = item.name;
        row.append(when, venue);
        list.append(row);
      }
      status.textContent = preview.items.length
        ? preview.items.length + " all-day suggestions for the week beginning " + preview.weekStart
          + ". Only the scheduled visits shown here will be included."
        : "No visits are scheduled. Put a recorded pick into the week before downloading.";
      button.disabled = preview.items.length === 0;
      return { context, preview };
    } catch (problem) {
      error.textContent = "Calendar unavailable: " + problem.message;
      return null;
    }
  }

  button.addEventListener("click", () => {
    const current = refresh();
    if (!current || button.disabled) return;
    let url;
    let link;
    let retained = false;
    try {
      const output = prepareOfflineCalendar(current.context, calendarApi);
      const blob = new view.Blob([output.text], { type: "text/calendar;charset=utf-8" });
      url = view.URL.createObjectURL(blob);
      urls.add(url);
      link = document.createElement("a");
      link.href = url;
      link.download = output.filename;
      link.hidden = true;
      // Complete bytes and their Blob exist before the application retains an ID.
      // Refuse a context replaced during preparation before dispatching the link.
      document.body.append(link);
      retained = active && retainCalendarId(current.context, output.calendarId);
      if (!retained) {
        throw new Error("The displayed week changed. Review its current calendar preview and try again.");
      }
      link.click();
      status.textContent = "Calendar file prepared. Open it in a calendar app to review and import the suggestions. "
        + "Save week again if you want its calendar identity retained in that saved copy.";
    } catch (problem) {
      error.textContent = retained
        ? "The calendar file was prepared, but its download could not be started. Try Download calendar again."
        : "Calendar file could not be prepared: " + problem.message;
    } finally {
      link?.remove();
      if (url) view.setTimeout(() => {
        view.URL.revokeObjectURL(url);
        urls.delete(url);
      }, 1000);
    }
  });

  view.addEventListener("pagehide", () => {
    active = false;
    for (const url of urls) view.URL.revokeObjectURL(url);
    urls.clear();
    refresh();
  });
  view.addEventListener("pageshow", () => { active = true; refresh(); });
  return Object.freeze({ refresh });
}
