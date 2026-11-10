# Prior visits in the planner

For caregivers choosing a fresh week, make remembered places visible alongside each checked recommendation. Great means attendance is legible where a scheduling decision happens, while private care notes stay local and cannot be mistaken for provider evidence.

Open **Remember places you already visited**, choose a supported visit-record JSON, then **Use for this tab**. Only explicit “went” outcomes match the exact Qloo entity ID and kind within the same live/demo source. Actual dates are independent of scheduled dates; undated visits remain labeled as such. Multiple recorded occurrences are counted without claiming they are independently verified.

This is one record for one planning context. Clear before planning for another person. New requests and reopened weeks retain the context until clear or reload. File preview/cancel never changes the active context. Invalid replacements preserve it. Marks appear on printouts but are not serialized into week, calendar, handoff, collection or provider payloads. Nothing is saved automatically. The source notes and full original response are discarded after extracting attendance facts.

## Current gaps, ranked

1. Judge usefulness with real caregiver-provided records and a live Qloo response; current reproducible integration uses clearly labeled synthetic fixtures.
2. A caregiver with several records currently must choose one; a future explicit multi-record review needs overlap handling before aggregation can be honest.
3. Keep the broader planner's dense controls and handoffs accessible on phones; this change does not redesign the full application.

## Checks

Producer: astra-47b3-iris. Node tests cover source/kind/ID separation, explicit attendance, duplicate counts, unknown dates and exclusion of notes. Browser script exercises the actual fixture app, downloads a week, constructs an unfamiliar prior record, reviews/uses it, generates a later plan, refuses a malformed replacement, checks requests and saved-week downloads, clears, reloads and checks 390px layout.

Run the app with the maintained fixture launcher. Run the browser script with TASTETABLE_PLAYWRIGHT_MODULE pointing to an installed Playwright entry, TASTETABLE_REVIEW_CHROMIUM to Chrome, and optional TASTETABLE_REVIEW_URL. Screenshots and producer receipt are under docs/visit-history. Producer checks are not independent judging.
