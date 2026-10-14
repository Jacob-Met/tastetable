import hashlib, json, pathlib, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
C=ROOT/'candidate'
def record(path):
    raw=path.read_bytes()
    return {'path':str(path.resolve()),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'mode':path.stat().st_mode & 0o777}
selected=['static/handoff_compare.mjs','static/handoff_compare_ui.mjs','static/compare-handoffs.html','static/handoff_compare.css','tests/test_handoff_compare.mjs','docs/COMPARE_CAREGIVER_HANDOFFS.md','static/index.html','README.md','static/venue_note_changes.mjs']
original=json.loads((ROOT/'preparation/original-source-admission-v1.json').read_text())
before={r['path']:r for r in original['files'] if r['source_commit']=='c93c83c4b5f05686dca5810427dd4f5f826709e9'}
source=[];unchanged=[]
for p in sorted(C.rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(C).as_posix(); row=record(p);row['repository_path']=rel;row['git_mode']='100644'
    if rel in selected:
        row['role']='reused-source' if rel=='static/venue_note_changes.mjs' else 'modified-source' if rel in before else 'new-source'
        if rel in before:row['before_git_blob']=before[rel]['git_blob']
        if row['role']=='reused-source':
            assert row['git_blob']=='9d7153966d16d61a3089e1df2454a7d3b3806d96'
            row['source_commit']='975bf346cc300f50abfac3c3ebac2fc492077091'
        source.append(row)
    else:
        assert row['git_blob']==before[rel]['git_blob'],rel
        unchanged.append(row)
assert len(source)==9
old=(ROOT/'original/static/index.html').read_bytes();new=(C/'static/index.html').read_bytes()
addition=b'      <a href="/static/compare-handoffs.html" target="_blank" rel="noopener">Compare caregiver handoffs (new tab)</a>\n'
assert new.count(addition)==1 and new.replace(addition,b'',1)==old
assert (C/'README.md').read_bytes().startswith((ROOT/'original/README.md').read_bytes())
author=json.loads((ROOT/'author-v1/receipt.json').read_text())
assert author['accepted'] and author['source_before']==author['source_after']
assert all(record(C/r['path'])['sha256']==r['sha256'] for r in author['source_before'])
assert '# tests 22\n' in author['stdout']['text'] and '# pass 22\n' in author['stdout']['text'] and '# fail 0\n' in author['stdout']['text']
receipt={'schema':'forge.tastetable.handoff-candidate-freeze.v1','frozen_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'repository':'Jacob-Met/tastetable','base':'c93c83c4b5f05686dca5810427dd4f5f826709e9','base_tree':'5dbdb2e6a1a649ddcf568146911572b5f7a41117','issue':'https://github.com/Jacob-Met/tastetable/issues/125','source_root':str(C.resolve()),'publication_state':'unpublished','selected':source,'unchanged':unchanged,'controls':[record(ROOT/p) for p in ['preparation/public-contract-v1.md','preparation/original-source-packet-v1.json','preparation/original-source-admission-v1.json','preparation/reservation-response-v1.json','preparation/run-author-v1.py','preparation/freeze-candidate-v1.py','author-v1/receipt.json','author-v1/stdout.txt','author-v1/stderr.txt']],'qualification':{'author_methods':14,'inherited_caregiver_methods':8,'total_passed':22,'node_version':'24.19.0','scope':'Model and DOM-listener fixture, no actual browser course','source_unchanged':True,'group_absent':True},'fence_checks':{'index_one_link_only':True,'readme_append_only':True,'donor_helper_exact':True,'all_other_staged_sources_exact':True}}
out=ROOT/'candidate-freeze-v1.json'
with out.open('x') as f:f.write(json.dumps(receipt,ensure_ascii=True,indent=2)+'\n')
print(json.dumps(record(out),indent=2))
