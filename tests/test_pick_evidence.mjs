import test from "node:test";
import assert from "node:assert/strict";
import { carePrompt, evidenceMarkup, structuredEvidence } from "../static/pick_evidence.mjs";
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

test("the dated choice does not turn passing tag checks into a venue guarantee", () => {
 const pick={evidence:{format:"tastetable.pick-evidence.v1",taste_reason:"taste",checks:[
  {constraint:"soft_foods",status:"pass",reason:"menu keyword"},
  {constraint:"wheelchair",status:"pass",reason:"listed tag"}]}};
 const html=carePrompt(pick,["soft_foods","wheelchair"],esc);
 assert.match(html,/Confirm with the venue:/);
 assert.match(html,/Soft foods, Wheelchair access/);
 assert.match(html,/not a current venue confirmation/);
 assert.doesNotMatch(html,/confirmed safe|verified accessible/i);
});
test("missing, unknown and failed original evidence is visible before expanding details", () => {
 const pick={evidence:{format:"tastetable.pick-evidence.v1",taste_reason:"taste",checks:[
  {constraint:"wheelchair",status:"fail",reason:"stairs observed in tags"},
  {constraint:"low_sodium",status:"unknown",reason:"menu unavailable"}]}};
 const html=carePrompt(pick,["wheelchair","low_sodium","soft_foods"],esc);
 assert.match(html,/data-check-status="concern"/);
 assert.match(html,/Original tags raised concerns about Wheelchair access/);
 assert.match(html,/Original data could not establish Low sodium, Soft foods/);
 const historical=carePrompt({why:"older record"},["low_sodium"],esc);
 assert.match(historical,/Original data could not establish Low sodium/);
});
test("care prompts are safe and absent when no constraints were requested", () => {
 assert.equal(carePrompt({why:"old"},[],esc),"");
 assert.match(carePrompt({why:"old"},["<allergen>"],esc),/&lt;allergen&gt;/);
 assert.doesNotMatch(carePrompt({why:"old"},["<allergen>"],esc),/<allergen>/);
});
