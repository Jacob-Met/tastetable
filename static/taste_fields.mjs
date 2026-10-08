/** Reversible comma-separated taste fields used by the regular planner. */
export function parseTasteEntries(source) {
  if (typeof source !== "string") throw new TypeError("Taste entries must be text.");
  const entries = [];
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /\s/u.test(source[index])) index += 1;
    if (index === source.length) break;
    if (source[index] === ",") { index += 1; continue; }

    if (source[index] === '"') {
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const char = source[index];
        index += 1;
        if (char !== '"') {
          value += char;
        } else if (source[index] === '"') {
          value += '"';
          index += 1;
        } else {
          closed = true;
          break;
        }
      }
      if (!closed) {
        throw new SyntaxError('Close the quoted entry with a double quote, for example "Earth, Wind & Fire".');
      }
      while (index < source.length && /\s/u.test(source[index])) index += 1;
      if (index < source.length && source[index] !== ",") {
        throw new SyntaxError("After a closing quote, use a comma before the next entry. Double a quote inside a quoted name.");
      }
      entries.push(value);
    } else {
      const start = index;
      while (index < source.length && source[index] !== ",") index += 1;
      const value = source.slice(start, index).trim();
      if (value) entries.push(value);
    }
    if (source[index] === ",") index += 1;
  }
  return entries;
}

export function formatTasteEntries(entries) {
  if (!Array.isArray(entries) || Array.from(entries).some((entry) => typeof entry !== "string")) {
    throw new TypeError("Taste entries must be an array of text.");
  }
  return entries.map((entry) => {
    if (!entry || entry.includes(",") || entry.includes('"') || entry.trim() !== entry) {
      return '"' + entry.replace(/"/g, '""') + '"';
    }
    return entry;
  }).join(", ");
}
