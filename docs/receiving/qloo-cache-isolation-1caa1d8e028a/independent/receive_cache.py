#!/usr/bin/env python3
"""Independent public QlooClient result-ownership receiver; authored offline data only."""
from __future__ import annotations
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import socket
import sys
from unittest.mock import patch


def identity(p):
    b=p.read_bytes();s=p.stat()
    return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'mtime_ns':s.st_mtime_ns,'mode':s.st_mode,'inode':s.st_ino}


def row(name='Fictional Cafe'):
    return {'entity_id':'fictional-place','name':name,'types':['urn:entity:place'],
        'query':{'affinity':'0.625'},'popularity':'0.75',
        'tags':[{'tag_id':'fictional-tag','name':'Fictional cuisine','labels':['original','secondary']}],
        'properties':{'geocode':{'city':'Fictional City','coordinates':[1.25,2.5]},
            'keywords':[{'text':'fictional quiet','weights':[0.5,0.25]}]}}


class Peer:
    def __init__(self, responder):
        self.responder=responder;self.calls=[]
    def __call__(self,path,params,headers):
        self.calls.append({'path':path,'params':copy.deepcopy(params),
            'header_shape_ok':headers=={'X-Api-Key':'FICTIONAL-RECEIVER-NOT-A-KEY','accept':'application/json'}})
        return self.responder(path,params)


def attempt(fn):
    try:
        value=fn()
    except Exception as error:
        return {'returned':False,'exception':type(error).__name__,'message':str(error),
            'status':getattr(error,'status',None),'retryable':getattr(error,'retryable',None)},error
    return {'returned':True,'value':value},None


class Metric:
    def __init__(self,base):self.base=base;self.calls=0
    def __float__(self):
        value=self.base+0.125*self.calls;self.calls+=1;return value


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();source=args.source.resolve();out=args.out.resolve()
    if out.exists():parser.error('--out must be absent')
    if source.parent==out or source.parent in out.parents or out in source.parents:
        parser.error('source and output must be disjoint')
    before=identity(source);out.mkdir(parents=True)
    checks=[]
    def record(name,ok,peer,**facts):
        shape=all(c['header_shape_ok'] for c in peer.calls)
        checks.append({'name':name,'pass':bool(ok and shape),'calls':peer.calls,'header_shapes_ok':shape,**facts})
    with patch('socket.create_connection',side_effect=AssertionError('No network permitted')):
        spec=importlib.util.spec_from_file_location('qloo_client',source)
        module=importlib.util.module_from_spec(spec);sys.modules['qloo_client']=module;spec.loader.exec_module(module)
        def client(peer):return module.QlooClient(api_key='FICTIONAL-RECEIVER-NOT-A-KEY',transport=peer)

        for route in ['search','insights']:
            payload={'results':[row()]} if route=='search' else {'success':True,'results':{'entities':[row()]}}
            original=copy.deepcopy(payload)
            peer=Peer(lambda path,params:payload);c=client(peer)
            if route=='search':
                invoke=lambda:c.search('fictional',types='urn:entity:place',take=2)
                expected_path='/search';expected_params={'query':'fictional','types':'urn:entity:place','take':2}
            else:
                invoke=lambda:c.insights('urn:entity:place',signal_entities=['fictional-artist'],filter_tags=['fictional-tag'],location_query='Fictional City',take=2,extra={'filter.exclude.entities':'fictional-excluded'})
                expected_path='/v2/insights';expected_params={'filter.type':'urn:entity:place','take':2,'signal.interests.entities':'fictional-artist','filter.tags':'fictional-tag','filter.location.query':'Fictional City','filter.exclude.entities':'fictional-excluded'}
            first=invoke();second=invoke();initial=copy.deepcopy(first[0].to_dict())
            second_initial=copy.deepcopy(second[0].to_dict())
            first[0].tags[0]['labels'][0]='CALLER-EDIT'
            first[0].properties['geocode']['coordinates'][1]=99.0
            first[0].properties['keywords'][0]['weights'].append(9.0)
            first[0].types.append('urn:entity:caller-only')
            first[0].affinity=-1.0
            exported=first[0].to_dict();exported['properties']['geocode']['city']='CALLER-CITY'
            exported_current_alias=first[0].properties['geocode']['city']=='CALLER-CITY'
            third=invoke()
            third_snapshot=copy.deepcopy(third[0].to_dict());second_snapshot=copy.deepcopy(second[0].to_dict())
            record(route+'_nested_caller_edits_stay_out_of_existing_and_future_returns',
                payload==original and second_snapshot==initial and second_initial==initial and third_snapshot==initial
                and len(peer.calls)==1 and peer.calls[0]['path']==expected_path and peer.calls[0]['params']==expected_params
                and initial['affinity']==0.625 and initial['popularity']==0.75 and exported_current_alias,
                peer,initial=initial,caller_owned_after_edit=copy.deepcopy(first[0].to_dict()),
                other_return_after_edit=second_snapshot,later_return=third_snapshot,
                transport_payload_unchanged=payload==original,to_dict_still_aliases_its_own_entity=exported_current_alias)

        payload={'results':{'tags':[{'id':'fictional-nested-tag','name':{'localized':['Fictional name']},'type':'urn:tag:genre'},
                                    {'id':'fictional-flat-tag','name':'Fictional flat','type':'urn:tag:genre'}]}}
        original=copy.deepcopy(payload);peer=Peer(lambda path,params:payload);c=client(peer)
        first=c.find_tags('fictional',tag_type='urn:tag:genre',take=2)
        second=c.find_tags('fictional',tag_type='urn:tag:genre',take=2);initial=copy.deepcopy(first)
        first[0]['name']['localized'][0]='CALLER-EDIT';first[1]['name']='CALLER-FLAT'
        third=c.find_tags('fictional',tag_type='urn:tag:genre',take=2)
        record('tag_return_graph_detached_without_tightening_existing_tolerant_parser',
            payload==original and second==initial and third==initial and len(peer.calls)==1
            and peer.calls[0]['path']=='/v2/tags' and peer.calls[0]['params']=={'filter.query':'fictional','take':2,'filter.tag.types':'urn:tag:genre'},
            peer,initial=initial,caller_after_edit=first,other_return_after_edit=second,later_return=third,
            transport_payload_unchanged=payload==original,
            fixture_note='Nested name is an authored tolerant-parser control, not a claim about provider schema. The second tag uses ordinary flat strings.')

        def distinct(path,params):
            return {'results':[row(json.dumps(params,sort_keys=True))]}
        peer=Peer(distinct);c=client(peer)
        names=[c.search('one',types='urn:entity:place',take=2)[0].name,
               c.search('one',types='urn:entity:place',take=2)[0].name,
               c.search('two',types='urn:entity:place',take=2)[0].name,
               c.search('one',types='urn:entity:book',take=2)[0].name,
               c.search('one',types='urn:entity:place',take=1)[0].name]
        record('distinct_query_type_and_take_keep_distinct_cache_entries',len(peer.calls)==4 and names[0]==names[1] and len(set(names))==4,peer,names=names)

        affinity=Metric(0.25);popularity=Metric(0.5);raw=row();raw['query']['affinity']=affinity;raw['popularity']=popularity
        peer=Peer(lambda path,params:{'results':[raw]});c=client(peer)
        values=[]
        for _ in range(2):
            entity=c.search('metric-control')[0];values.append([entity.affinity,entity.popularity])
        record('cached_raw_metrics_are_still_parsed_on_each_public_call',
            len(peer.calls)==1 and values==[[0.25,0.5],[0.375,0.625]] and affinity.calls==2 and popularity.calls==2,
            peer,values=values,raw_float_calls={'affinity':affinity.calls,'popularity':popularity.calls},
            fixture_note='Authored numeric conversion controls verify preserved raw-cache parsing order; no metric repair is adopted.')

        peer=Peer(lambda path,params:{'success':False,'errors':['fictional declared refusal']});c=client(peer)
        results=[attempt(lambda:c.insights('urn:entity:place'))[0] for _ in range(2)]
        record('declared_insight_refusal_retains_error_and_cached_response',len(peer.calls)==1
            and all(not r['returned'] and r['exception']=='QlooError' and r['status']==400 and r['retryable'] is False for r in results)
            and results[0]==results[1],peer,outcomes=results)

        raw=row();raw['query']['affinity']='fictional-not-a-number'
        peer=Peer(lambda path,params:{'results':[raw]});c=client(peer)
        results=[attempt(lambda:c.search('bad-metric'))[0] for _ in range(2)]
        record('malformed_metric_conversion_error_remains_unchanged',len(peer.calls)==1
            and all(not r['returned'] and r['exception']=='ValueError' for r in results) and results[0]==results[1],peer,outcomes=results)

        error=module.QlooError(503,'fictional transport failure')
        def refused(path,params):raise error
        peer=Peer(refused);c=client(peer)
        first,first_error=attempt(lambda:c.search('retry-control'))
        first_count=len(peer.calls)
        second,second_error=attempt(lambda:c.search('retry-control'))
        record('transport_error_is_not_cached_or_automatically_retried',first_count==1 and len(peer.calls)==2
            and first_error is error and second_error is error and first==second
            and first['status']==503 and first['retryable'] is True,peer,outcomes=[first,second])

        peer=Peer(lambda path,params:(_ for _ in ()).throw(AssertionError('Unsupported type reached transport')));c=client(peer)
        outcome,_=attempt(lambda:c.insights('urn:entity:fictional-unsupported'))
        record('unsupported_type_refused_before_transport',not outcome['returned'] and outcome['exception']=='ValueError' and not peer.calls,peer,outcome=outcome)

        peer=Peer(lambda path,params:{'results':'fictional-non-list'});c=client(peer)
        results=[c.search('empty'),c.find_tags('empty'),c.insights('urn:entity:place')]
        again=[c.search('empty'),c.find_tags('empty'),c.insights('urn:entity:place')]
        record('existing_empty_results_fallback_and_each_route_cache_are_preserved',results==[[],[],[]] and again==results and len(peer.calls)==3,peer,results=results,repeated=again)

    after=identity(source)
    receipt={'source':str(source),'source_before':before,'source_after':after,
        'source_bytes_mtime_mode_inode_unchanged':before==after,'receiver':identity(Path(__file__).resolve()),
        'environment':{'python':sys.version,'executable':sys.executable,'platform':platform.platform()},
        'scope':'Real public QlooClient methods with a fictional in-memory transport; no network, provider key, browser, fixture file or installed client used.',
        'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'pass':before==after and all(c['pass'] for c in checks)}
    p=out/'receipt.json';p.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'receipt':str(p),'passed':receipt['passed'],'total':receipt['total'],'pass':receipt['pass'],
        'failed':[c['name'] for c in checks if not c['pass']]}))
    return 0 if receipt['pass'] else 1

if __name__=='__main__':raise SystemExit(main())
