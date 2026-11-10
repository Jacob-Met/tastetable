import test from "node:test";
import assert from "node:assert/strict";
import { evidenceMarkup, structuredEvidence } from "../static/pick_evidence.mjs";
const esc = s => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
test("historical saved picks retain their complete original explanation", () => {
 const pick={why:"Original source with <literal> & reason"};
 assert.equal(structuredEvidence(pick),null);
 assert.equal(evidenceMarkup(pick,esc),'<p class="why">Original source with &lt;literal&gt; &amp; reason</p>');
});
test("uncertain care evidence stays uncertain and literal, separate from taste", () => {
 const pick={why:"retained complete source",evidence:{format:"tastetable.pick-evidence.v1",
 taste_reason:"Audience signal <not a personal guarantee>",checks:[{constraint:"low_sodium",status:"unknown",reason:"No menu evidence <ask> & confirm"}]}};
 const html=evidenceMarkup(pick,esc);
 assert.match(html,/Tag\/keyword check: unknown/);assert.match(html,/No menu evidence &lt;ask&gt; &amp; confirm/);
 assert.match(html,/Audience signal &lt;not a personal guarantee&gt;/);
 assert.ok(!html.includes("check: pass"));assert.match(html,/Confirm current food and access needs/);
});
test("unsupported optional evidence never suppresses the original explanation", () => {
 for(const evidence of [{format:"future"}, {format:"tastetable.pick-evidence.v1",taste_reason:"x",checks:[{constraint:"wheelchair",status:"safe",reason:"x"}]}])
 assert.equal(evidenceMarkup({why:"Original explanation",evidence},esc),'<p class="why">Original explanation</p>');
});
