import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PROFILE_BYTES, makeProfileFile, normalizeProfile, readProfileFile } from "../static/profile_file.mjs";

const bytes = (source) => new TextEncoder().encode(source);
const read = (value) => readProfileFile(bytes(JSON.stringify(value)));
const example = () => ({
  cuisines: [" Cuban ", "Mexican"],
  music: ["Celia Cruz"],
  films: ["West Side Story"],
  city: " Pasadena ",
  constraints: ["wheelchair", "soft_foods"],
});

test("a file contains only detached native planning inputs and reopens them", () => {
  const original = example();
  const before = structuredClone(original);
  const output = makeProfileFile(original);
  assert.equal(output.filename, "tastetable-profile.json");
  assert.ok(output.text.endsWith("\n"));
  assert.deepEqual(Object.keys(JSON.parse(output.text)), ["cuisines", "music", "films", "constraints", "city"]);
  assert.deepEqual(readProfileFile(bytes(output.text)), {
    cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"],
    constraints: ["wheelchair", "soft_foods"], city: "Pasadena",
  });
  assert.deepEqual(original, before);
  output.profile.cuisines[0] = "changed";
  assert.deepEqual(original, before);
  assert.equal(JSON.parse(output.text).cuisines[0], "Cuban");
});

test("native defaults include Pasadena, while null or empty city stays empty", () => {
  assert.deepEqual(read({ music: ["Bach"] }), {
    cuisines: [], music: ["Bach"], films: [], constraints: [], city: "Pasadena",
  });
  assert.equal(read({ music: ["Bach"], city: null }).city, "");
  assert.equal(read({ music: ["Bach"], city: " \t " }).city, "");
  assert.equal(read({ music: ["Bach"], city: "Paris, France" }).city, "Paris, France");
});

test("counts Unicode code points and applies native whitespace trimming", () => {
  assert.equal(read({ films: ["🎞".repeat(60)] }).films[0], "🎞".repeat(60));
  assert.throws(() => read({ films: ["🎞".repeat(61)] }), /60 characters/);
  assert.equal(read({ music: ["\u0085 Bach \u0085"] }).music[0], "Bach");
  assert.equal(read({ music: ["Bach"], city: "\uFEFFParis" }).city, "\uFEFFParis");
  assert.throws(() => read({ music: ["\uFEFFBach"] }), /cannot preserve/);
  assert.throws(() => read({ music: ["Bach\uFEFF"] }), /cannot preserve/);
});

test("the existing comma form never silently splits a native taste entry", () => {
  for (const field of ["cuisines", "music", "films"]) {
    assert.throws(() => read({ [field]: ["An artist, Jr."] }), /comma inside an entry/);
  }
  assert.deepEqual(read({ films: ["A：B，C"] }).films, ["A：B，C"]);
});

test("single-line fields reject interior controls and invalid Unicode escapes", () => {
  for (const field of ["music", "city"]) {
    for (const bad of ["a\nb", "a\rb", "a\tb", "a\u0000b", "a\u007fb", "\ud800", "\udfff"]) {
      assert.throws(() => read({ music: ["Bach"], [field]: field === "music" ? [bad] : bad }), /control characters|valid Unicode/);
    }
  }
  assert.equal(read({ music: ["Bach"], city: "東京" }).city, "東京");
});

test("empty tastes, null arrays and more than five entries are refused", () => {
  for (const value of [{}, { music: [] }, { music: [" "] }, { music: null }, { music: [null] }, { music: [1] }, { music: Array(6).fill("Bach") }]) {
    assert.throws(() => read(value));
  }
  assert.equal(read({ music: Array(5).fill("Bach") }).music.length, 5);
  assert.throws(() => normalizeProfile({ music: Array(1) }), /must be text/);
  assert.throws(() => normalizeProfile({ music: ["Bach"], constraints: Array(1) }), /Constraints/);
});

test("only supported unique constraint names can become selected controls", () => {
  assert.deepEqual(read({ music: ["Bach"], constraints: ["low_sodium", "soft_foods", "wheelchair"] }).constraints,
    ["low_sodium", "soft_foods", "wheelchair"]);
  for (const constraints of [null, "wheelchair", ["wheelchair", "wheelchair"], ["Wheelchair"], [null], [1], ["__proto__"]]) {
    assert.throws(() => read({ music: ["Bach"], constraints }), /Constraints/);
  }
});

test("unknown object fields and wrong top-level shapes cannot become profile metadata", () => {
  for (const value of [null, [], "Bach", true, 1, { music: ["Bach"], response: {} }, { music: ["Bach"], api_key: "not-a-key" }]) {
    assert.throws(() => read(value), /object|Unknown/);
  }
  assert.throws(() => readProfileFile(bytes('{"music":["Bach"],"__proto__":{"music":["unexpected"]}}')), /Unknown/);
});

test("duplicate fields are refused even with escaped keys or unrelated key order", () => {
  for (const source of [
    '{"music":["Bach"],"music":["Cruz"]}',
    '{"music":["Bach"],"mu\\u0073ic":["Cruz"]}',
    '{"city":"Paris","music":["Bach"],"city":"London"}',
    '{"music":["Bach"],"constraints":[],"constraints":["wheelchair"]}',
  ]) assert.throws(() => readProfileFile(bytes(source)), /Duplicate/);
});

test("JSON key scanning does not treat quoted commas or braces as fields", () => {
  const profile = read({ films: ['A {"quoted": [value]} \\ end'], city: '{"music": "Bach", "music": "Cruz"}' });
  assert.equal(profile.films[0], 'A {"quoted": [value]} \\ end');
  assert.equal(profile.city, '{"music": "Bach", "music": "Cruz"}');
});

test("byte admission refuses BOM, malformed UTF-8 and non-JSON input", () => {
  for (const source of ["", "\uFEFF" + JSON.stringify({ music: ["Bach"] }), '{"music":[NaN]}', '{"music":["Bach"],}', "{}x"]) {
    assert.throws(() => readProfileFile(bytes(source)));
  }
  for (const data of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xed, 0xa0, 0x80]), new Uint8Array([0xff])]) {
    assert.throws(() => readProfileFile(data), /valid UTF-8/);
  }
  assert.throws(() => readProfileFile('{"music":["Bach"]}'), /UTF-8 bytes/);
  assert.throws(() => readProfileFile({}), /UTF-8 bytes/);
});

test("the 64 KiB bound is exact and measured in bytes", () => {
  const source = '{"music":["Bach"]}';
  assert.equal(readProfileFile(bytes(source + " ".repeat(MAX_PROFILE_BYTES - source.length))).music[0], "Bach");
  assert.throws(() => readProfileFile(bytes(source + " ".repeat(MAX_PROFILE_BYTES + 1 - source.length))), /64 KiB/);
  assert.throws(() => readProfileFile(bytes(source + "é".repeat(MAX_PROFILE_BYTES / 2))), /64 KiB/);
  assert.equal(readProfileFile(bytes(source).buffer).music[0], "Bach");
});
