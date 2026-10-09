# Review a venue-note replacement

Open the saved week that belongs with your venue notes. In **Prepare your venue calls**, choose **Open venue notes** and select the companion JSON file.

The replacement summary states how many records would be **added**, **changed**, **removed** or **kept unchanged**. Open **Inspect notes to add, change, remove or keep** to review every affected occurrence and date. A record is one original suggested visit on one exact date; two suggestions at the same venue remain separate.

- **Remove** shows the full current record that is absent from the incoming file. That record will be removed only if you choose Replace. The suggested visit itself is not removed from the plan.
- **Change** names the changed stored fields and shows the complete current and incoming notes. An explicit empty question override is distinguished from using the original suggested questions. Earlier reply-question snapshots remain separately labeled.
- **Add** shows a new record from the incoming file.
- **Keep unchanged** means all five stored note fields match exactly. It is not a new venue confirmation.

Other dates and currently omitted visits are included. The review does not match by venue name, combine records, or decide which version is better. The incoming file still replaces the **entire** retained note set.

Choose **Cancel replacement** to leave the current notes untouched. Choose **Replace venue notes** only after reviewing the changes. An empty incoming file will show all current records as removals and clears them only after this explicit action. Save your current venue notes first if you want to keep that earlier copy.

Editing a note or changing/retiring the current plan invalidates a pending review; open the file again. File admission, accepted-plan identity, byte/record limits and all replacement controls keep their existing behavior. Nothing is uploaded or saved automatically. The week arrangement, calendar identity and original heuristic checks stay unchanged; caregiver-entered notes do not establish safety, availability or reservations.

## Native maintenance and receiving

The pure `compareVenueNotes` helper consumes two already-admitted record sets belonging to the same accepted origin. It returns a detached frozen projection; it does not admit arbitrary file envelopes or apply a replacement. Identity is the exact `[key, date]` pair. Current record order comes first, then new incoming identities in file order. All five stored fields use exact equality, retaining spaces, line endings, Unicode, null and empty strings.

Run the existing and focused model controls with installed Node:

```text
node --test tests/venue_followup.test.mjs tests/venue_note_file.test.mjs tests/venue_note_changes.test.mjs
```

The maintained native-plan browser receiver includes the new helper in its explicit source/serving list; its other source list entries and test assertions are unchanged. The separate authored-fixture receiver `tools/check_venue_note_changes_browser.py` uses the existing Windows Chrome and Python Playwright installations, a private browser profile and a GET-only loopback source server. It does not start the Python planner or perform any provider request. Generate only the fictional fixtures with `node tools/venue_note_changes_fixture.mjs OUTPUT`, then supply explicit `--root`, `--fixtures` and new `--output` paths to the receiver.

Native evidence is source-specific. The current source was received as an 18-file import/runtime/test closure from canonical main145d2798, not a complete cloned repository. All unowned canonical leaves must be preserved during later full-tree composition. No hosted CI, deployed planner, live provider or real-world caregiver outcome is claimed. Current estate no-Actions direction holds PR/main integration.
