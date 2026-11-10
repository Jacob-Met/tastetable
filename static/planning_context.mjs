/**
 * Read-only presentation of the preferences behind the displayed week and
 * the next request. It never retires a plan or writes a saved record.
 */
const FIELDS = [
  ["city", "City"],
  ["cuisines", "Cuisines"],
  ["music", "Music"],
  ["films", "Films"],
  ["constraints", "Care needs"],
];
const CARE_LABELS = { soft_foods: "Soft foods", low_sodium: "Low sodium", wheelchair: "Wheelchair access" };
const list = value => (Array.isArray(value) ? value : String(value ?? "").split(","))
  .map(value => String(value).trim()).filter(Boolean);
const clone = value => JSON.parse(JSON.stringify(value));

export function readPlanningInputs(form) {
  const field = name => form.elements.namedItem(name);
  return {
    cuisines: list(field("cuisines")?.value),
    music: list(field("music")?.value),
    films: list(field("films")?.value),
    city: field("city")?.value ?? "",
    constraints: [...form.querySelectorAll('[name="constraints"]:checked')].map(input => input.value),
  };
}

export function normalizePlanningInputs(value = {}) {
  return {
    city: String(value.city ?? "").trim(),
    cuisines: list(value.cuisines),
    music: list(value.music),
    films: list(value.films),
    constraints: list(value.constraints),
  };
}

const comparable = value => Array.isArray(value)
  ? JSON.stringify([...new Set(value.map(item => item.toLocaleLowerCase()))].sort())
  : value.toLocaleLowerCase();
const display = (key, value) => key === "constraints"
  ? (value.map(item => CARE_LABELS[item] || item).join(", ") || "None selected")
  : (Array.isArray(value) ? value.join(", ") : value) || "Not specified";

export function describePlanningContext({ acceptedInputs = null, draftInputs = {}, pending = false } = {}) {
  const draft = normalizePlanningInputs(draftInputs);
  const accepted = acceptedInputs == null ? null : normalizePlanningInputs(acceptedInputs);
  const source = accepted || draft;
  const changes = accepted ? FIELDS.filter(([key]) => comparable(accepted[key]) !== comparable(draft[key]))
    .map(([key, label]) => ({ key, label, before: display(key, accepted[key]), after: display(key, draft[key]) })) : [];
  return {
    hasCurrentWeek: Boolean(accepted),
    changed: changes.length > 0,
    pending: Boolean(pending),
    rows: FIELDS.map(([key, label]) => ({ key, label, value: display(key, source[key]) })),
    changes,
    notice: pending
      ? (accepted ? "Finding a new week. Your current week remains available." : "Finding a week with these preferences.")
      : changes.length
        ? "These edits apply to your next plan. Your current week still uses the preferences above."
        : accepted ? "These are the preferences used for your current week." : "Choose tastes and care needs below, then plan your week.",
  };
}

export function mountPlanningContext(root, { form, onRestore = () => {} } = {}) {
  if (!root || !form) return { sync() {}, destroy() {} };
  const document = root.ownerDocument;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  let acceptedInputs = null;
  let pending = false;
  let disposed = false;
  root.classList.add("planning-context");
  const heading = make("h3", "planning-context-heading", "Planning preferences");
  const summary = make("dl", "planning-context-summary");
  const changeTitle = make("p", "planning-context-change-title", "Changed for the next plan");
  const changes = make("ul", "planning-context-changes");
  const notice = make("p", "planning-context-notice");
  // One short status message announces a change, rather than every taste token.
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const actions = make("div", "planning-context-actions");
  const restore = make("button", "", "Use this week’s preferences");
  restore.type = "button";
  actions.append(restore);
  root.replaceChildren(heading, summary, changeTitle, changes, notice, actions);

  function render() {
    if (disposed) return;
    const state = describePlanningContext({ acceptedInputs, draftInputs: readPlanningInputs(form), pending });
    root.dataset.hasCurrentWeek = String(state.hasCurrentWeek);
    root.dataset.changed = String(state.changed);
    root.dataset.pending = String(state.pending);
    heading.textContent = state.hasCurrentWeek ? "Preferences behind this week" : "Planning preferences";
    summary.replaceChildren();
    for (const row of state.rows) {
      // Empty taste fields add no useful summary information; keep the actual
      // editor available below and always show city and care needs.
      if (!["city", "constraints"].includes(row.key) && row.value === "Not specified") continue;
      const pair = make("div");
      pair.dataset.preference = row.key;
      pair.append(make("dt", "", row.label), make("dd", "", row.value));
      summary.append(pair);
    }
    changes.replaceChildren();
    for (const change of state.changes) {
      const item = make("li");
      item.dataset.preference = change.key;
      item.append(make("strong", "", change.label + ": "), document.createTextNode(change.after));
      changes.append(item);
    }
    changeTitle.hidden = !state.changed;
    changes.hidden = !state.changed;
    actions.hidden = !state.changed;
    restore.disabled = pending;
    // Avoid repeatedly announcing the same status while typing.
    if (notice.textContent !== state.notice) notice.textContent = state.notice;
  }

  function restoreCurrent() {
    if (!acceptedInputs || pending || disposed) return;
    onRestore(clone(acceptedInputs));
    render();
  }
  restore.addEventListener("click", restoreCurrent);
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
  return {
    sync(next = {}) {
      if (disposed) return;
      if (Object.prototype.hasOwnProperty.call(next, "acceptedInputs")) {
        acceptedInputs = next.acceptedInputs == null ? null : clone(next.acceptedInputs);
      }
      if (Object.prototype.hasOwnProperty.call(next, "pending")) pending = Boolean(next.pending);
      render();
    },
    destroy() {
      disposed = true;
      form.removeEventListener("input", render);
      form.removeEventListener("change", render);
      restore.removeEventListener("click", restoreCurrent);
    },
  };
}
