/** Ephemeral history for immutable, validated visit_record.mjs snapshots. */
export const VISIT_EDIT_HISTORY_LIMIT = 20;

function sameRecord(a, b) {
  return a === b || !!(a && b &&
    a.source.name === b.source.name && a.source.weekText === b.source.weekText &&
    a.visits.length === b.visits.length && a.visits.every((visit, index) => {
      const other = b.visits[index];
      return visit.key === other.key && visit.outcome === other.outcome &&
        visit.date === other.date && visit.note === other.note;
    }));
}

/** Validation stays with the native model; this helper never reads form fields. */
export function createVisitEditHistory(initial = null) {
  let current = initial, past = [], future = [], active = null;
  const changed = () => active !== null && !sameRecord(active.before, current);
  function close() {
    if (changed()) {
      past.push({before: active.before, after: current, target: active.target});
      if (past.length > VISIT_EDIT_HISTORY_LIMIT) past.shift();
      future = [];
    }
    active = null;
  }
  function reset(record) {
    current = record; past = []; future = []; active = null;
  }
  function record(next, target, grouped = true) {
    if (!current || !next) throw new TypeError("Use a visit record before editing.");
    if (!grouped || active?.target !== target) close();
    if (!active) active = {before: current, target};
    current = next;
    if (!grouped) close();
    return current;
  }
  function undo() {
    close();
    const change = past.pop();
    if (!change) return null;
    future.push(change); current = change.before;
    return {record: current, target: change.target};
  }
  function redo() {
    close();
    const change = future.pop();
    if (!change) return null;
    past.push(change); current = change.after;
    return {record: current, target: change.target};
  }
  return Object.freeze({
    get current() { return current; },
    get canUndo() { return changed() || past.length > 0; },
    get canRedo() { return !changed() && future.length > 0; },
    record, close, reset, undo, redo,
  });
}
