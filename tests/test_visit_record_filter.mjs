import test from "node:test";
import assert from "node:assert/strict";
import { matchesVisitRecordFilter } from "../static/visit_record_filter.mjs";

const visits = Object.freeze([
  Object.freeze({name:"Same Café", note:"  Bring the blue bag\r\nAsk <literal> 🙂  ", outcome:"went"}),
  Object.freeze({name:"Same Café", note:"Call ahead", outcome:"unrecorded"}),
  Object.freeze({name:"Garden", note:"Reschedule after rain", outcome:"did_not_go"}),
]);
const selected = filters => visits.flatMap((visit, index) => matchesVisitRecordFilter(visit, filters) ? [index] : []);

test("all outcomes retain repeated venue occurrences and blank queries", () => {
  assert.deepEqual(selected({}), [0, 1, 2]);
  assert.deepEqual(selected({query:" \n "}), [0, 1, 2]);
  assert.deepEqual(selected({query:" SAME CAFÉ "}), [0, 1]);
});
test("literal note text is searchable without interpreting markup, regex or wildcards", () => {
  assert.deepEqual(selected({query:"<LITERAL> 🙂"}), [0]);
  assert.deepEqual(selected({query:"blue bag"}), [0]);
  for (const query of [".*", "Caf*", "Café|Garden", "Cafe"]) {
    assert.deepEqual(selected({query}), []);
  }
});
test("each explicit outcome combines with the venue or note search", () => {
  assert.deepEqual(selected({outcome:"unrecorded"}), [1]);
  assert.deepEqual(selected({outcome:"went"}), [0]);
  assert.deepEqual(selected({outcome:"did_not_go"}), [2]);
  assert.deepEqual(selected({query:"Café", outcome:"unrecorded"}), [1]);
  assert.deepEqual(selected({query:"rain", outcome:"went"}), []);
});
test("changed observations change the view while original values remain exact", () => {
  const before = JSON.stringify(visits);
  assert.equal(matchesVisitRecordFilter({...visits[1], note:"blue bag", outcome:"went"},
    {query:"BLUE BAG", outcome:"went"}), true);
  assert.deepEqual(selected({query:"blue bag", outcome:"went"}), [0]);
  assert.equal(JSON.stringify(visits), before);
});
