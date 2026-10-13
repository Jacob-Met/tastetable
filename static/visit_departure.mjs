/** Departure protection for one admitted visit-record session. */
export function createVisitDepartureGuard(ownerWindow) {
  let baseline = null, attached = false;
  const snapshot = record => JSON.stringify(record.visits);
  function beforeLeave(event) {
    event.preventDefault();
    event.returnValue = true;
  }
  function update(record, hasInvalidDraft = false) {
    const needed = Boolean(record && baseline !== null
      && (hasInvalidDraft || snapshot(record) !== baseline));
    if (needed !== attached) {
      ownerWindow[needed ? "addEventListener" : "removeEventListener"]("beforeunload", beforeLeave);
      attached = needed;
    }
    return needed;
  }
  return Object.freeze({
    accept(record) {
      baseline = snapshot(record);
      update(record);
    },
    update,
  });
}
