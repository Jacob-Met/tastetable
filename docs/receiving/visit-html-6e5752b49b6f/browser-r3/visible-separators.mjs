// Independent visible-separator receiving for TasteTable65. No product imports.
export const SEPARATOR_ORACLE_VERSION = "taste65-visible-separators/1";

/** Runs inside the actual document; all indices are JavaScript UTF-16 offsets. */
export function receiveVisibleSeparators(element, expectedText, markers, label = "field") {
  function need(ok, code, detail) {
    if (!ok) { const error = new Error(label + ": " + detail); error.code = code; throw error; }
  }
  need(element && element.nodeType === 1, "SEPARATOR_ELEMENT", "an actual element is required");
  need(typeof expectedText === "string" && Array.isArray(markers) && markers.length >= 3,
    "SEPARATOR_INPUT", "explicit original text and at least three markers are required");
  need(element.textContent === expectedText, "SEPARATOR_TEXT", "original textContent changed");
  const document = element.ownerDocument, view = document.defaultView;
  const walker = document.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
  const nodes = []; let node, flat = "";
  while ((node = walker.nextNode())) { nodes.push({ node, start: flat.length }); flat += node.data; }
  need(flat === expectedText, "SEPARATOR_TEXT", "flattened text differs from the original");
  function boundary(offset, end) {
    for (let i = 0; i < nodes.length; i++) {
      const row = nodes[i], limit = row.start + row.node.data.length;
      if (offset < limit || (end && offset === limit) || i === nodes.length - 1) {
        need(offset >= row.start && offset <= limit, "SEPARATOR_OFFSET", "invalid UTF-16 boundary");
        return [row.node, offset - row.start];
      }
    }
    throw new Error(label + ": no text node at offset " + offset);
  }
  const measured = markers.map(marker => {
    need(typeof marker === "string" && marker.length > 0, "SEPARATOR_INPUT", "marker must be nonempty");
    const candidates = [];
    for (let at = expectedText.indexOf(marker); at >= 0; at = expectedText.indexOf(marker, at + marker.length)) {
      const word = character => /[A-Za-z0-9_]/.test(character ?? "");
      if (!word(expectedText[at - 1]) && !word(expectedText[at + marker.length])) candidates.push(at);
    }
    need(candidates.length === 1, "SEPARATOR_INPUT", "marker must be one unambiguous complete token: " + marker);
    const offset = candidates[0];
    // Measure a single complete code point so line wrapping later in a marker cannot pollute its box.
    const units = marker.codePointAt(0) > 0xffff ? 2 : 1;
    const a = boundary(offset, false), b = boundary(offset + units, true);
    const range = document.createRange(); range.setStart(...a); range.setEnd(...b);
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    need(rects.length === 1, "SEPARATOR_VISIBILITY", "marker must have exactly one visible glyph box: " + marker);
    const rect = rects[0], owner = a[0].parentElement, style = view.getComputedStyle(owner);
    const lineHeight = Number.parseFloat(style.lineHeight);
    need(Number.isFinite(lineHeight) && lineHeight > 0, "SEPARATOR_LINE_HEIGHT",
      "this fixed report requires a measurable CSS line-height");
    return { marker, offset, units, top: rect.top, left: rect.left, width: rect.width,
      height: rect.height, lineHeight, fontFamily: style.fontFamily, fontSize: style.fontSize };
  });
  const steps = [];
  for (let i = 1; i < measured.length; i++) {
    const previous = measured[i - 1], next = measured[i];
    need(next.offset > previous.offset, "SEPARATOR_INPUT", "markers must follow original source order");
    const between = expectedText.slice(previous.offset + previous.marker.length, next.offset);
    need(between === "\r" || between === "\r\n" || between === "\n",
      "SEPARATOR_INPUT", "adjacent markers must enclose exactly one CR, CRLF or LF");
    need(previous.fontFamily === next.fontFamily && previous.fontSize === next.fontSize,
      "SEPARATOR_FONT", "compare same-font marker glyphs");
    const lineHeight = previous.lineHeight, tolerance = Math.max(1.25, lineHeight * 0.08);
    need(Math.abs(next.lineHeight - lineHeight) <= tolerance, "SEPARATOR_LINE_HEIGHT",
      "line-height changed between markers");
    const delta = next.top - previous.top;
    need(delta > 0 && Math.abs(delta - lineHeight) <= tolerance, "SEPARATOR_LINE_STEP",
      JSON.stringify(between) + " must advance one line; observed " + delta + " for line-height " + lineHeight);
    steps.push({ separator: between, from: previous.marker, to: next.marker, delta, lineHeight, tolerance });
  }
  const lf = steps.find(step => step.separator === "\n");
  if (lf) for (const step of steps) {
    need(Math.abs(step.delta - lf.delta) <= Math.max(step.tolerance, lf.tolerance),
      "SEPARATOR_LF_CONTROL", "CR/CRLF must match this field's observed LF advance");
  }
  need(element.textContent === expectedText, "SEPARATOR_TEXT", "inspection changed original text");
  return { label, exactText: true, utf16Length: expectedText.length, markers: measured, steps,
    sameFieldLFControl: Boolean(lf), passed: true };
}

/** Synthetic actual-DOM negative controls, not a substitute for the product fields. */
export function runSeparatorGeometryControls(check) {
  const document = globalThis.document, host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "20px", top: "20px", width: "420px",
    height: "150px", font: "16px monospace", lineHeight: "24px", background: "white", color: "black",
    zIndex: "2147483647" });
  document.body.append(host);
  const expected = "🙂 A0\rB0\r\nC0\nD0", markers = ["A0", "B0", "C0", "D0"], results = [];
  function fixture(positions, changedText = false, hidden = false) {
    host.replaceChildren();
    const prefix = document.createElement("span"); prefix.style.display = "none"; prefix.textContent = "🙂 ";
    host.append(prefix);
    markers.forEach((marker, i) => {
      const span = document.createElement("span"); span.textContent = marker;
      Object.assign(span.style, { position: "absolute", left: "0px", top: positions[i] + "px",
        font: "16px monospace", lineHeight: "24px" });
      if (hidden && i === 1) span.style.display = "none";
      host.append(span);
      if (i < 3) {
        const separator = document.createElement("span"); separator.style.display = "none";
        separator.textContent = ["\r", "\r\n", "\n"][i]; host.append(separator);
      }
    });
    if (changedText) host.lastChild.textContent += "changed";
  }
  function trial(name, positions, expectedCode = null, changedText = false, hidden = false) {
    fixture(positions, changedText, hidden);
    let result = null, failure = null;
    try { result = check(host, expected, markers, name); } catch (error) { failure = { code: error.code, message: error.message }; }
    if (expectedCode === null ? Boolean(failure) : failure?.code !== expectedCode) {
      throw new Error("Independent control " + name + " failed: " + JSON.stringify({ result, failure, expectedCode }));
    }
    results.push({ name, expectedCode, accepted: Boolean(result?.passed), failure });
  }
  try {
    trial("single-line steps with astral UTF-16 prefix", [0, 24, 48, 72]);
    trial("collapsed lone CR rejected", [0, 0, 24, 48], "SEPARATOR_LINE_STEP");
    trial("double CRLF break rejected", [0, 24, 72, 96], "SEPARATOR_LINE_STEP");
    trial("changed original text rejected", [0, 24, 48, 72], "SEPARATOR_TEXT", true);
    trial("missing visible marker rejected", [0, 24, 48, 72], "SEPARATOR_VISIBILITY", false, true);
    return { syntheticDOMControls: true, productClaim: false, results, passed: true };
  } finally { host.remove(); }
}
