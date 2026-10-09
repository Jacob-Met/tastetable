import pathlib,json,hashlib
r=pathlib.Path(__file__).parent;e=r/'evidence';s=r/'source'
packet=json.loads((e/'baseline-transfer.json').read_text(encoding='utf-8'));tree=packet['complete_tree'];entries=tree['tree'];assert not tree['truncated']
def oid(kind,data):return hashlib.sha1(kind.encode()+b' '+str(len(data)).encode()+bytes([0])+data).hexdigest()
dirs={'':[]}
for row in entries:
 parent,_,name=row['path'].rpartition('/');dirs.setdefault(parent,[]).append((name,row)); 
 if row['type']=='tree':dirs.setdefault(row['path'],[])
checked=[]
for path in sorted(dirs,key=lambda p:p.count('/'),reverse=True):
 data=b''
 for name,row in sorted(dirs[path],key=lambda x:x[0].encode()+(b'/' if x[1]['type']=='tree' else b'')):
  mode='40000' if row['mode']=='040000' else row['mode']
  data+=mode.encode()+b' '+name.encode()+bytes([0])+bytes.fromhex(row['sha'])
 digest=oid('tree',data)
 if path:
  expect=next(x['sha'] for x in entries if x['path']==path);assert digest==expect,(path,digest,expect)
 else:assert digest=='71f2c5b144e2a54787cb92b37d6e639bbfef6ba6',digest
 checked.append({'path':path,'tree':digest})
result={'base':packet['base'],'root_tree':'71f2c5b144e2a54787cb92b37d6e639bbfef6ba6','recursive_entries':len(entries),'leaf_count':sum(x['type']!='tree' for x in entries),'verified_tree_objects':len(checked),'trees':checked,'instructions':[x['path'] for x in entries if x['path'].split('/')[-1]=='AGENTS.md'],'workflows':[x for x in entries if x['type']=='blob' and x['path'].startswith('.github/workflows/')],'remote_writes':False,'limit':'Source-tree reconstruction only; source-only branch not yet published and PR/main held.'}
print(json.dumps({k:v for k,v in result.items() if k not in ('trees','workflows')}),flush=True)
(e/'canonical-tree-reconstruction.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
