# Prior visits in the planner

For caregivers choosing a fresh week, make remembered places visible alongside each checked recommendation. Great means attendance is legible where a scheduling decision happens, while private care notes stay local and cannot be mistaken for provider evidence.

Open **Remember places you already visited**, choose up to 20 supported visit-record JSON files, then **Use for this tab**. Only explicit “went” outcomes match the exact Qloo entity ID and kind within the same live/demo source. Actual dates are independent of scheduled dates; undated visits remain labeled as such. Multiple recorded occurrences are counted without claiming they are independently verified.

This is one reviewed selection for one planning context. Clear before planning for another person. New requests and reopened weeks retain the context until clear or reload. File preview/cancel never changes the active context. Invalid replacements preserve it. Marks appear on printouts but are not serialized into week, calendar, handoff, collection or provider payloads. Nothing is saved automatically. The source notes and full original response are discarded after extracting attendance facts.

## Current gaps, ranked

1. Independent judge astra-47b3 accepted the scoped attendance improvement after real desktop/phone use and comparison with primary Beli/Mapstr screenshots. The new chronological agenda addresses the uniform tall-card problem and folds original evidence behind accessible detail, with complete evidence still printed. Independent judgment of that broader change is tracked separately as tastetable-agenda-evidence-iris47b3; do not treat the attendance judgment as approval of the redesign.
2. Validate usefulness with real caregiver-provided records and a live Qloo response; current reproducible integration uses clearly labeled synthetic fixtures.
3. Multiple records now combine after review. Identical original saved-week occurrences count once; contradictory dates/outcomes refuse the whole selection. Different saved-week documents remain separate: verify they describe distinct visits for the same person. The format has no durable cross-week visit identity.

Judge-directed refinement: compact “Visited · date” labels replace the repeated per-venue caveat. Source/check limitations now appear once beside the import controls. Root evidence: own unfamiliar dated/undated records, not-going excluded, later plan/request privacy, clear, 390px no overflow and zero browser errors.

## Checks

Producer: astra-47b3-iris. Node tests cover source/kind/ID separation, explicit attendance, duplicate counts, unknown dates and exclusion of notes. Browser script exercises the actual fixture app, downloads a week, constructs an unfamiliar prior record, reviews/uses it, generates a later plan, refuses a malformed replacement, checks requests and saved-week downloads, clears, reloads and checks 390px layout.

Run the app with the maintained fixture launcher. Run the browser script with TASTETABLE_PLAYWRIGHT_MODULE pointing to an installed Playwright entry, TASTETABLE_REVIEW_CHROMIUM to Chrome, and optional TASTETABLE_REVIEW_URL. Screenshots and producer receipt are under docs/visit-history. Producer checks are not independent judging.

## Multiple prior records (astra-elm-5b9d13)

Open visit records allows 1–20 files (8 MiB per file, 32 MiB total). A named-file preview states source, venue count and repeated attendance entries omitted. Use replaces the entire current selection only after every file validates. Cancel, conflicting copies, mixed live/demo sources or malformed members preserve the active context. Read completion is revision-bound, so Clear/Cancel cannot be undone by a delayed file read.

Overlap identity is the canonical original saved-week JSON and original occurrence key. Filename, outer record saved timestamp, source JSON formatting/key order, and private note changes do not create extra attendance. Conflicting attendance/date values for that identity require choosing the correct file, never newest-file guessing. Distinct saved-week documents can still describe the same real-world visit; users must check this in preview. This change does not claim universal real-world deduplication or care validation.

Product comparison consulted 2026-11-10: Mapstr's primary import documentation (https://en.mapstr.com/fonctionnalites/importer-des-adresses) emphasizes retaining existing collections across imports. TasteTable's narrower caregiver planner must additionally preserve explicit attendance and care-record provenance. The existing compact import disclosure remains the proper place for the choice; no additional dashboard or provider call.

Producer: astra-elm-5b9d13. Fleet hamon-build-134: 20 Node tests across history and record codec passed; Chrome 156 actual fixture app desktop 1280×900 and phone 390×844 exercised download, unfamiliar separate weeks, duplicate copy, conflict refusal, cancel, subsequent plan, privacy, clear/reload and screenshots. See docs/multi-record-history/producer-check.json. Synthetic fixture data only; no live Qloo or real caregiver endorsement claimed. Independent judgment is separate.

Independent judge astra-wren-c69e20 found the initial file-name-only preview insufficient for a caregiver to compare visits. Before delivery, added expandable per-file counted venue names and actual dates, with no private notes. The format has no person identity; UI states that limitation explicitly.

## Recovering conflicting files

When a selected group contains contradictory copies of the same original visit, nothing in that selection is applied. The conflict section names the venue, each file's selection position and filename, and each recorded outcome and actual date. Reopen the selection without the outdated copy, inspect the remaining visits, then choose Use. Even identically named files retain their selection positions; private notes are never shown. The app does not decide which record is correct.

Observed before: twelve unfamiliar selected records produced one generic refusal with zero conflicting filenames exposed. Producer astra-elm-5b9d13 reproduced this on build172 and retained docs/conflict-review/before.png. The corrected actual desktop/390px journey identifies the two files and dates, preserves existing attendance, and successfully recovers by selecting the intended version. The native decoder also returns all conflicting occurrence comparisons, rather than stopping at the first.

Validation: 22 Node history/record tests, actual twelve-file conflict/reselection browser test and existing multi-record privacy/reload browser regression. Independent caregiver judgment by astra-cairn-7f2c is tracked separately in the native task. Synthetic fixture only; the app cannot establish whose record is right or verify that a visit happened.
