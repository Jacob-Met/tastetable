/** Explicit question-only reuse within one accepted worksheet. No storage or provider calls. */
function entryFor({ model, state, key, date }) {
  const entry = model.entries(state).find((item) => item.key === key && item.date === date);
  if (!entry) throw new Error("This visit is no longer scheduled for that date.");
  return entry;
}

/** Original occurrence identity, not venue name/entity, determines eligible history. */
export function questionReuseChoices(records, key, date) {
  return Object.freeze(records
    .filter((record) => record.key === key && record.date !== date && record.note.question !== null)
    .map((record) => Object.freeze({ date: record.date, question: record.note.question }))
    .sort((a, b) => b.date.localeCompare(a.date)));
}

/** The page and native tests share this prepare/guard/apply transaction. */
export function createQuestionReuse(current, apply) {
  let pending = null;
  function choices() {
    const context = current();
    entryFor(context);
    return questionReuseChoices(context.model.snapshotRecords(), context.key, context.date);
  }
  function prepare(sourceDate) {
    pending = null;
    const context = current(), entry = entryFor(context);
    const source = questionReuseChoices(context.model.snapshotRecords(), context.key, context.date)
      .find((item) => item.date === sourceDate);
    if (!source) throw new Error("Choose recorded custom questions for another date.");
    pending = { ...context, targetNote: entry.note, sourceDate, question: source.question };
    return Object.freeze({ sourceDate, targetDate: context.date, question: source.question });
  }
  function cancel() { pending = null; }
  function use() {
    if (!pending) return false;
    const saved = pending;
    pending = null;
    const context = current(), entry = entryFor(context);
    const source = questionReuseChoices(context.model.snapshotRecords(), context.key, context.date)
      .find((item) => item.date === saved.sourceDate);
    if (context.model !== saved.model || context.state !== saved.state
        || context.key !== saved.key || context.date !== saved.date
        || entry.note !== saved.targetNote || !source || source.question !== saved.question) {
      throw new Error("The visit or its notes changed. Choose the source questions again.");
    }
    // The controller owns the existing edit transaction and all note-change notifications.
    return apply(saved.question) === true;
  }
  return Object.freeze({ choices, prepare, use, cancel });
}

/** Add controls to one existing question editor; every Apply uses a fresh context guard. */
export function mountQuestionReuse(editor, current, apply, initialChoices) {
  const document = editor.ownerDocument, reuse = createQuestionReuse(current, apply);
  let retired = false;
  const panel = document.createElement("div");
  panel.dataset.questionReuse = "";
  const label = document.createElement("label"), select = document.createElement("select");
  label.append("Questions recorded for another date");
  select.dataset.questionReuseSource = "";
  label.append(select);
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Choose a source date";
  select.append(placeholder);
  // sync already admitted the model/state and captured these initial display options.
  // Preparing or applying a choice still performs the fresh transaction guards above.
  const options = initialChoices;
  for (const source of options) {
    const option = document.createElement("option");
    option.value = source.date;
    option.textContent = source.date + (source.question === "" ? " — explicitly empty questions" : "");
    select.append(option);
  }
  select.disabled = options.length === 0;
  const explanation = document.createElement("p");
  explanation.textContent = options.length
    ? "Preview custom questions from this same suggested visit. Only questions will be reused; replies and next steps stay with their recorded date. Check any dates mentioned in the text."
    : "No custom questions are recorded for another date for this suggested visit.";
  const preview = document.createElement("div");
  preview.dataset.questionReusePreview = ""; preview.hidden = true;
  const context = document.createElement("p");
  context.dataset.questionReuseContext = "";
  const text = document.createElement("pre");
  text.dataset.questionReuseText = "";
  text.style.whiteSpace = "pre-wrap"; text.style.overflowWrap = "anywhere";
  const empty = document.createElement("p");
  empty.dataset.questionReuseEmpty = "";
  empty.textContent = "This is an explicitly empty question list. Using it clears the current questions.";
  empty.hidden = true;
  const use = document.createElement("button"), cancel = document.createElement("button");
  use.type = cancel.type = "button";
  use.dataset.questionReuseApply = ""; use.textContent = "Use questions"; use.disabled = true;
  cancel.dataset.questionReuseCancel = ""; cancel.textContent = "Cancel reuse";
  preview.append(context, text, empty, use, cancel);
  const status = document.createElement("p");
  status.dataset.questionReuseStatus = ""; status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(explanation, label, preview, status); editor.append(panel);

  function invalidate() {
    reuse.cancel(); select.value = ""; preview.hidden = true; use.disabled = true;
    text.textContent = context.textContent = status.textContent = ""; empty.hidden = true;
  }
  select.addEventListener("change", () => {
    const sourceDate = select.value;
    invalidate();
    if (retired || !editor.isConnected || !sourceDate) return;
    try {
      const selected = reuse.prepare(sourceDate);
      select.value = sourceDate;
      context.textContent = "Questions recorded for " + selected.sourceDate + " → current visit " + selected.targetDate + ". Review before replacing the current questions.";
      text.textContent = selected.question;
      empty.hidden = selected.question !== "";
      preview.hidden = false; use.disabled = false;
    } catch (error) { status.textContent = "Questions unavailable: " + error.message; }
  });
  use.addEventListener("click", () => {
    if (retired || !editor.isConnected || !editor.open) return;
    try {
      const changed = reuse.use();
      invalidate();
      if (changed) status.textContent = "Questions reused for this visit. Review the text and any earlier reply before following up.";
    } catch (error) {
      invalidate(); status.textContent = "Questions not reused: " + error.message;
    }
  });
  cancel.addEventListener("click", invalidate);
  editor.addEventListener("toggle", () => { if (!editor.open) invalidate(); });
  return Object.freeze({
    invalidate,
    retire() { retired = true; invalidate(); select.disabled = true; },
  });
}
