import hashlib,json,pathlib,time
R=pathlib.Path(__file__).resolve().parents[1]
P=R/'publication-author-v1';P.mkdir(exist_ok=False)
F=json.loads((R/'candidate-freeze-v1.json').read_text())
PREFIX='docs/qualification/handoff-compare-forge-d3745/'
def identity(p):
 b=p.read_bytes();return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),git_blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest())
binding=dict(schema='forge.tastetable.handoff-source-binding.v1',repository=F['repository'],issue=F['issue'],base=F['base'],base_tree=F['base_tree'],publication_state='unpublished author freeze',selected_source=[{k:v for k,v in r.items() if k!='path'} for r in F['selected']],unchanged_dependencies=[{k:v for k,v in r.items() if k!='path'} for r in F['unchanged'] if r['repository_path'] in ['static/caregiver_handoff.mjs','static/week_file.mjs','static/venue_note_file.mjs','static/venue_followup.mjs','static/week_plan.mjs','static/week_compare.mjs']],source_review='Independent source review and root consumer are separate gates; this record makes no result claim for them.',original_packet=identity(R/'preparation/original-source-packet-v1.json'),original_packet_note='Retained locally, not duplicated in this source selection. Complete original files can be fetched at the immutable base/donor commits; source-admission records exact tuples. The packet also retains the bounded owner-query responses and complete base tree.')
(P/'source-binding-v1.json').write_text(json.dumps(binding,ensure_ascii=True,indent=2)+'\n')
(P/'README.md').write_text('''# Caregiver handoff comparison — original author record

This original author record belongs to TasteTable issue125, Forge d3745ea0f44f. It is source-bound to the nine paths in `source-binding-v1.json` over current commit c93c83c4b5f05686dca5810427dd4f5f826709e9. The pure note comparator is reused byte-for-byte from the adjacent issue68 owner at 975bf346cc300f50abfac3c3ebac2fc492077091; none of that branch’s editor/index/CSS changes are adopted.

The public contract and issue reservation were sealed before the six new authored bodies. Existing native readers and week comparison are unchanged. The author course used Node24.19.0 in an isolated source projection and executed one command: `node --test --test-reporter=tap tests/test_handoff_compare.mjs tests/caregiver_handoff.test.mjs`. Fourteen new model/DOM-listener methods plus eight unchanged handoff-reader methods passed (22 total, no failures/skips), with exit0, process-group absence and exact source before/after. Full stdout/stderr and the original receipt are retained here. The recorded PID is in that cloud execution namespace, not a native-device identity.

These are model and authored DOM-fixture controls, not an actual browser or provider course. They cover occurrence/date identity, complete-source mismatch, literal five-field note and reply-question history, missing/null/empty distinctions, invalid replacement, latest selection, Clear/page departure and file-byte/UTF-8 refusal. Root owns a separately authored consumer; Loom owns a separate source review. Neither later result is claimed by this original record.

The initial source gate proves exactly one link added to index.html, an append-only README section, the exact donor helper, and all other staged current source/workflow bodies unchanged. Full original source identities and immutable Git pins are in `original-source-admission-v1.json`; the larger local retrieval packet is hash-bound by the source binding and freeze, not duplicated here. This evidence does not authenticate a source merely from caller-supplied annotations; final publication requires independent full-tree and body review.

Read the product guide at `docs/COMPARE_CAREGIVER_HANDOFFS.md` in the repository for usage. The page never edits, restores or uploads a file and makes no health, safety or verification inference. Source metadata and raw note content remain literal saved data.
''')
rows=[]
for row in F['selected']:
 p=pathlib.Path(row['path']);now=identity(p);assert all(now[k]==row[k] for k in now)
 rows.append(dict(path=row['repository_path'],source_path=str(p),mode='100644',role='source',**now))
items=[('author/README.md',P/'README.md'),('source-binding-v1.json',P/'source-binding-v1.json'),('author/public-contract-v1.md',R/'preparation/public-contract-v1.md'),('author/reservation-response-v1.json',R/'preparation/reservation-response-v1.json'),('author/original-source-admission-v1.json',R/'preparation/original-source-admission-v1.json'),('author/candidate-freeze-v1.json',R/'candidate-freeze-v1.json'),('author/run-author-v1.py',R/'preparation/run-author-v1.py'),('author/freeze-candidate-v1.py',R/'preparation/freeze-candidate-v1.py'),('author/receipt.json',R/'author-v1/receipt.json'),('author/stdout.txt',R/'author-v1/stdout.txt'),('author/stderr.txt',R/'author-v1/stderr.txt'),('author/seal-author-selection-v1.py',pathlib.Path(__file__).resolve())]
for dest,p in items: rows.append(dict(path=PREFIX+dest,source_path=str(p.resolve()),mode='100644',role='support',**identity(p)))
assert len({r['path'] for r in rows})==len(rows)
map=dict(schema='forge.tastetable.handoff-author-publication-inputs.v1',created_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),repository=F['repository'],base=F['base'],qualification_prefix=PREFIX,files=rows,counts=dict(source=9,support=len(items),total=len(rows)),scope='Original source and author evidence only; no later independent authority inferred or regenerated.')
out=R/'publication-author-inputs-v1.json';out.write_text(json.dumps(map,ensure_ascii=True,indent=2)+'\n')
print(json.dumps(dict(path=str(out.resolve()),**identity(out),files=len(rows))))
