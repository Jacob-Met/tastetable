/** Portable planning inputs compatible with tastetable_cli.py's profile shape. */
export const MAX_PROFILE_BYTES = 64 * 1024;
const FIELDS = new Set(["cuisines", "music", "films", "constraints", "city"]);
const TASTES = ["cuisines", "music", "films"];
const SUPPORTED = new Set(["soft_foods", "low_sodium", "wheelchair"]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
// Match Python str.strip(), which is the native profile admission rule.
const edgeSpace = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu;

function text(value, field, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(field + " must be text.");
  const clean = value.replace(edgeSpace, "");
  const chars = Array.from(clean);
  if (!allowEmpty && !clean) throw new Error(field + " must not contain blank entries.");
  if (chars.length > 60) throw new Error(field + " must be at most 60 characters per entry.");
  if (chars.some((char) => {
    const point = char.codePointAt(0);
    return point >= 0xd800 && point <= 0xdfff;
  })) throw new Error(field + " must contain valid Unicode text.");
  if (/[\u0000-\u001f\u007f]/u.test(clean)) {
    throw new Error(field + " contains control characters that the form cannot preserve.");
  }
  if (field !== "city" && clean.trim() !== clean) {
    throw new Error(field + " has edge characters that the form cannot preserve.");
  }
  if (field !== "city" && clean.includes(",")) {
    throw new Error(field + " contains a comma inside an entry. This form uses commas to separate entries and cannot reopen that value faithfully.");
  }
  return clean;
}

/** Return detached normalized fields; do not change the caller's object. */
export function normalizeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Planning inputs must be a JSON object.");
  }
  for (const key of Object.keys(value)) {
    if (!FIELDS.has(key)) throw new Error("Unknown planning-input field: " + key + ".");
  }
  const profile = {};
  for (const field of TASTES) {
    const values = own(value, field) ? value[field] : [];
    if (!Array.isArray(values) || values.length > 5) {
      throw new Error(field + " must be a list of at most five entries.");
    }
    profile[field] = Array.from(values, (item) => text(item, field));
  }
  if (!TASTES.some((field) => profile[field].length)) {
    throw new Error("Enter at least one cuisine, music artist or film before saving planning inputs.");
  }
  const constraints = own(value, "constraints") ? value.constraints : [];
  if (!Array.isArray(constraints) || constraints.length > SUPPORTED.size
    || Array.from(constraints).some((item) => !SUPPORTED.has(item))) {
    throw new Error("Constraints must contain only soft_foods, low_sodium and wheelchair.");
  }
  if (new Set(constraints).size !== constraints.length) {
    throw new Error("Constraints must not repeat a name.");
  }
  profile.constraints = [...constraints];
  const city = own(value, "city") ? value.city : "Pasadena";
  profile.city = city === null ? "" : text(city, "city", true);
  return profile;
}

// JSON.parse validates the complete syntax first. Scan its top-level key tokens
// separately so duplicate fields, including escaped spellings, cannot win by order.
function refuseDuplicateFields(source) {
  let depth = 0;
  let expectsKey = false;
  const keys = new Set();
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      const start = index;
      for (index += 1; index < source.length; index += 1) {
        if (source[index] === "\\") index += 1;
        else if (source[index] === '"') break;
      }
      if (depth === 1 && expectsKey) {
        const key = JSON.parse(source.slice(start, index + 1));
        if (keys.has(key)) throw new Error("Duplicate planning-input field: " + key + ".");
        keys.add(key);
        expectsKey = false;
      }
    } else if (char === "{" || char === "[") {
      depth += 1;
      if (depth === 1) expectsKey = true;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 1) {
      expectsKey = true;
    }
  }
}

export function readProfileFile(bytes) {
  const data = bytes instanceof Uint8Array ? bytes
    : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  if (!data) throw new Error("Read planning inputs as UTF-8 bytes.");
  if (!data.byteLength) throw new Error("The planning-input file is empty.");
  if (data.byteLength > MAX_PROFILE_BYTES) throw new Error("Planning-input files must be at most 64 KiB.");
  let source;
  try {
    // Preserve a BOM so JSON admission refuses it, just like the native CLI.
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    throw new Error("The planning-input file must contain valid UTF-8 text.");
  }
  let value;
  try { value = JSON.parse(source); }
  catch { throw new Error("The file must contain valid planning-input JSON without a byte-order mark."); }
  refuseDuplicateFields(source);
  return normalizeProfile(value);
}

export function makeProfileFile(value) {
  const profile = normalizeProfile(value);
  const output = JSON.stringify(profile, null, 2) + "\n";
  if (new TextEncoder().encode(output).byteLength > MAX_PROFILE_BYTES) {
    throw new Error("Planning-input files must be at most 64 KiB.");
  }
  return { profile, text: output, filename: "tastetable-profile.json" };
}
