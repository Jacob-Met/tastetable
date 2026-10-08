(function (root) {
  "use strict";

  // Abort is best effort. Request identity also fences transports and response
  // readers that finish after abort, input edits, or page departure.
  function create({ send, onStart, onResult, onError, onIdle }) {
    let generation = 0;
    let active = null;
    let disposed = false;

    function invalidate() {
      generation++;
      const previous = active;
      active = null;
      previous?.abort();
      onIdle?.();
    }

    async function run(url, body) {
      if (disposed) return false;
      const request = ++generation;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const current = () => !disposed && request === generation;
      try {
        onStart?.();
        const result = await send(url, body, controller.signal);
        if (!current()) return false;
        onResult?.(result);
        return true;
      } catch (error) {
        if (current()) onError?.(error);
        return false;
      } finally {
        if (current()) {
          active = null;
          onIdle?.();
        }
      }
    }

    return { run, invalidate, dispose() {
      if (!disposed) { disposed = true; invalidate(); }
    } };
  }

  const api = Object.freeze({ create });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TasteTablePlanRequests = api;
})(globalThis);
