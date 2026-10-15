/** View-only filters for the existing single-record visit editor. */
export function matchesVisitRecordFilter(visit, {query = "", outcome = "all"} = {}) {
  const needle = query.trim().toLowerCase();
  return (outcome === "all" || visit.outcome === outcome)
    && (!needle || [visit.name, visit.note].some(value => value.toLowerCase().includes(needle)));
}

export function mountVisitRecordFilters(doc = document) {
  const list = doc.querySelector("#visits");
  if (!list || doc.querySelector("#visitFilters")) return;

  const element = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const panel = element("section", "", "visit-filters card no-print");
  panel.id = "visitFilters";
  panel.setAttribute("aria-labelledby", "visitFiltersTitle");
  const heading = element("h2", "Find visits"); heading.id = "visitFiltersTitle";
  const fields = element("div", "", "visit-filter-fields");
  const searchLabel = element("label", "Search venue or note");
  const search = element("input");
  search.id = "visitFilterQuery"; search.type = "search";
  search.placeholder = "A venue name or something you noted";
  search.setAttribute("aria-controls", "visits");
  searchLabel.append(search);
  const outcomeLabel = element("label", "Outcome");
  const outcome = element("select"); outcome.id = "visitFilterOutcome";
  outcome.setAttribute("aria-controls", "visits");
  for (const [value, label] of [["all", "All outcomes"], ["unrecorded", "Unrecorded"],
    ["went", "Went"], ["did_not_go", "Did not go"]]) {
    const option = element("option", label); option.value = value; outcome.append(option);
  }
  outcomeLabel.append(outcome);
  const clear = element("button", "Clear filters", "secondary");
  clear.id = "clearVisitFilters"; clear.type = "button";
  fields.append(searchLabel, outcomeLabel, clear);
  const help = element("p", "Filters change this view. Downloads and printing include every visit.", "field-help");
  const status = element("p"); status.id = "visitFilterStatus";
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const empty = element("p", "No visits match. Try another search or use Clear filters to show every visit.", "visit-filter-empty");
  empty.id = "visitFilterEmpty"; empty.hidden = true;
  panel.append(heading, fields, help, status, empty); list.before(panel);
  let knownChildren = [...list.children];

  function refresh() {
    const cards = [...list.querySelectorAll(":scope > .visit-card")];
    let matches = 0, visible = 0, invalid = 0, editing = 0;
    cards.forEach((card, index) => {
      // Keep the original occurrence number when earlier cards are out of view.
      card.querySelector(".visit-heading").dataset.visitRecordNumber = String(index + 1);
      const match = matchesVisitRecordFilter({
        name: card.querySelector("h3").textContent,
        note: card.querySelector('[data-field="note"]').value,
        outcome: card.querySelector('[data-field="outcome"]').value,
      }, {query: search.value, outcome: outcome.value});
      const hasInvalid = Boolean(card.querySelector('[aria-invalid="true"]'));
      const hasFocus = card.contains(doc.activeElement);
      const show = match || hasInvalid || hasFocus;
      card.classList.toggle("visit-record-filtered-out", !show);
      if (match) matches++;
      if (show) visible++;
      if (!match && hasInvalid) invalid++;
      else if (!match && hasFocus) editing++;
    });
    search.disabled = outcome.disabled = cards.length === 0;
    clear.disabled = search.value === "" && outcome.value === "all";
    empty.hidden = cards.length === 0 || visible !== 0;
    let message = cards.length === 0 ? "This record has no visits to filter."
      : `Showing ${visible} of ${cards.length} visits.`;
    if (visible > matches) message += ` ${matches} match the filters.`;
    if (invalid) message += " Visits with fields to correct stay visible.";
    if (editing) message += " The visit you are editing stays visible until you leave it.";
    status.textContent = message;
    knownChildren = [...list.children];
  }

  function reset() { search.value = ""; outcome.value = "all"; refresh(); }
  search.addEventListener("input", refresh);
  outcome.addEventListener("change", refresh);
  clear.addEventListener("click", () => { reset(); search.focus(); });
  // Existing field handlers run first. Read the displayed values and validity;
  // do not read or replace the editor's private record or file-preview state.
  list.addEventListener("input", refresh);
  list.addEventListener("change", refresh);
  list.addEventListener("focusin", refresh);
  list.addEventListener("focusout", () => queueMicrotask(refresh));
  doc.querySelector("#useRecord").addEventListener("click", () => {
    const children = [...list.children];
    // A successful Use replaces the cards synchronously. A canceled/invalid
    // open, or a forced click with no prepared record, must retain the view.
    if (children.length !== knownChildren.length
      || children.some((child, index) => child !== knownChildren[index])) reset();
  });
  // Observe ordinary re-renders, including a future Undo/Redo composition,
  // without making filter state part of the retained visit record.
  new MutationObserver(refresh).observe(list, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["aria-invalid"],
  });
  refresh();
}

if (typeof document !== "undefined") mountVisitRecordFilters();
