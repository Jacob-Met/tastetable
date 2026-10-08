import assert from "node:assert/strict";
import test from "node:test";
import { formatTasteEntries, parseTasteEntries } from "../static/taste_fields.mjs";

test("ordinary comma lists keep existing trim, empty and duplicate behavior", () => {
  for (const source of ["", "   ", ", ,", "Cuban, Mexican", " Bach ,,Celia Cruz, ", 'Bill "Smokey" Robinson, C"minor', "Bach,Bach"]) {
    assert.deepEqual(parseTasteEntries(source), source.split(",").map((entry) => entry.trim()).filter(Boolean));
  }
});

test("the native artist-name counterexample remains two exact entries", () => {
  const names = ["Earth, Wind & Fire", "Celia Cruz"];
  const formatted = formatTasteEntries(names);
  assert.equal(formatted, '"Earth, Wind & Fire", Celia Cruz');
  assert.deepEqual(parseTasteEntries(formatted), names);
});

test("embedded quotes and comma-bearing film names round-trip visibly", () => {
  const values = ['He said "hello"', "Good Night, and Good Luck.", '"quoted" title', 'x"y,z"'];
  assert.equal(formatTasteEntries(['He said "hello"']), '"He said ""hello"""');
  assert.deepEqual(parseTasteEntries(formatTasteEntries(values)), values);
});

test("quoted contents keep spaces and explicit empty values while surrounding spaces are ignored", () => {
  assert.deepEqual(parseTasteEntries('  " Bach "  , "" ,   Celia Cruz  '), [" Bach ", "", "Celia Cruz"]);
  assert.deepEqual(parseTasteEntries('"",, ""'), ["", ""]);
  assert.deepEqual(parseTasteEntries(formatTasteEntries(["\uFEFFBach", "Cruz\u00a0"])), ["\uFEFFBach", "Cruz\u00a0"]);
});

test("manual edits can combine quoted and ordinary fields", () => {
  assert.deepEqual(parseTasteEntries('"Earth, Wind & Fire", Miles Davis, "A ""quoted"" film"'),
    ["Earth, Wind & Fire", "Miles Davis", 'A "quoted" film']);
  assert.deepEqual(parseTasteEntries('  "Cuban, regional", Mexican,  '), ["Cuban, regional", "Mexican"]);
});

test("unterminated quotes and trailing text are explicit syntax errors", () => {
  for (const source of ['"', '"Bach', '"Bach" Cruz', '"Bach"x', '"A ""quote', 'Cuban, "unfinished']) {
    assert.throws(() => parseTasteEntries(source), SyntaxError, source);
  }
  assert.deepEqual(parseTasteEntries('"A ""quote"""'), ['A "quote"']);
  assert.deepEqual(parseTasteEntries('"A ""quote"'), ['A "quote']);
});

test("order, duplicate entries, Unicode and source arrays are preserved", () => {
  const corpus = [
    ["Cuban", "Mexican"], ["", ""], ["Bach", "Bach"], ["🎻", "東京"],
    [" ", "\u0085Name\u0085"], ["a,b", 'c"d'], [",", '"'], ["a\\b", "x'y"],
    [" , ", ' "" '], [" leading", "trailing "], ["[a] {b}", "<literal>"],
  ];
  for (const values of corpus) {
    const original = structuredClone(values);
    const formatted = formatTasteEntries(values);
    assert.deepEqual(parseTasteEntries(formatted), original);
    assert.deepEqual(values, original);
  }
});

test("helper inputs cannot silently coerce or omit non-text array values", () => {
  for (const source of [null, [], 1, {}]) assert.throws(() => parseTasteEntries(source), TypeError);
  for (const values of [null, "Bach", [null], [1], Array(1)]) assert.throws(() => formatTasteEntries(values), TypeError);
});
