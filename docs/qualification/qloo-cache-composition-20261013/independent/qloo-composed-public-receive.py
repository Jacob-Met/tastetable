"""Public Qloo recovery + returned-value isolation receiver, independent of internals.

Run in a fresh process with an explicit client path, expected SHA-256 and new
receipt path. Authored synthetic payloads only; no provider or network transport.
"""
from __future__ import annotations

import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path
import platform
import sys
import types

ENTITY = {
    "entity_id": "fixture-composition-place",
    "name": "Authored composition place",
    "types": ["urn:entity:place"],
    "query": {"affinity": 0.75},
    "popularity": 0.25,
    "tags": [{"tag_id": "urn:tag:composition", "name": "Authored tag",
              "metadata": {"affinity": {"score": 0.65}}}],
    "properties": {
        "geocode": {"city": "Authored city"},
        "source_data": {"affinity": {"score": 0.7}, "labels": ["untouched"]},
    },
}
EXPECTED = [{
    "entity_id": "fixture-composition-place",
    "name": "Authored composition place",
    "types": ["urn:entity:place"],
    "affinity": 0.75,
    "popularity": 0.25,
    "tags": copy.deepcopy(ENTITY["tags"]),
    "properties": copy.deepcopy(ENTITY["properties"]),
}]


class CheckFailed(RuntimeError):
    pass


def ensure(condition, message):
    if not condition:
        raise CheckFailed(message)


class SequenceTransport:
    def __init__(self, bad, good):
        self.responses = [copy.deepcopy(bad), copy.deepcopy(good)]
        self.requests = []
        self.returned = []

    def __call__(self, path, params, headers):
        # Do not retain headers, credentials or environment values in evidence.
        self.requests.append({"path": path, "params": copy.deepcopy(params)})
        ensure(bool(self.responses), "Unexpected extra transport request")
        payload = self.responses.pop(0)
        self.returned.append(payload)
        return payload


def mutate_returned(result, marker):
    result[0].properties["source_data"]["affinity"]["score"] = marker
    result[0].properties["source_data"]["labels"].append("caller mutation")
    result[0].tags[0]["metadata"]["affinity"]["score"] = marker
    result[0].affinity = marker
    result.append(result[0])


def course(module, endpoint):
    if endpoint == "search":
        broken = copy.deepcopy(ENTITY)
        broken["popularity"] = "authored-not-a-number"
        bad = {"results": [copy.deepcopy(ENTITY), broken]}
        good = {"results": [copy.deepcopy(ENTITY)]}
        expected_error = ValueError
        invoke = lambda client: client.search(
            "authored composition", types="urn:entity:place", take=2)
    else:
        bad = {"success": False, "errors": ["authored temporary refusal"]}
        good = {"success": True, "results": {"entities": [copy.deepcopy(ENTITY)]}}
        expected_error = module.QlooError
        invoke = lambda client: client.insights(
            "urn:entity:place", signal_entities=["fixture-signal"],
            location_query="Authored city", take=2)
    pristine_good = copy.deepcopy(good)
    transport = SequenceTransport(bad, good)
    client = module.QlooClient(api_key="FIXTURE-NOT-A-KEY", transport=transport)
    passed = []
    stage = "initial_refusal"
    record = {"endpoint": endpoint}
    try:
        try:
            invoke(client)
        except expected_error as exc:
            record["initial_error_type"] = type(exc).__name__
        else:
            raise CheckFailed("Malformed first response unexpectedly succeeded")
        ensure(len(transport.requests) == 1, "Initial refusal automatically retried")
        passed.append(stage)

        stage = "explicit_identical_retry"
        recovered = invoke(client)
        ensure([entity.to_dict() for entity in recovered] == EXPECTED,
               "Explicit retry did not return the pristine authored entities")
        ensure(len(transport.requests) == 2, "Explicit retry must make request two")
        ensure(transport.requests[0] == transport.requests[1],
               "Explicit retry changed its public request")
        passed.append(stage)

        stage = "mutation_after_transport_success"
        mutate_returned(recovered, 91)
        cached = invoke(client)
        ensure([entity.to_dict() for entity in cached] == EXPECTED,
               "Caller mutation after recovery contaminated the next cache result")
        ensure(len(transport.requests) == 2, "Cache repeat fetched again")
        passed.append(stage)

        stage = "mutation_after_cache_hit"
        mutate_returned(cached, 92)
        repeated = invoke(client)
        ensure([entity.to_dict() for entity in repeated] == EXPECTED,
               "Caller mutation after a cache hit contaminated the next result")
        ensure(len(transport.requests) == 2, "Later cache repeat fetched again")
        ensure(transport.returned[1] == pristine_good,
               "Public result mutation reached the transport-owned successful payload")
        passed.append(stage)
        record["ok"] = True
    except Exception as exc:
        record.update(ok=False, failed_stage=stage,
                      error_type=type(exc).__name__, error=str(exc))
    record.update(passed_stages=passed, transport_calls=len(transport.requests),
                  requests=transport.requests)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("receipt path already exists; choose a new output")
    raw = args.client.read_bytes()
    before = hashlib.sha256(raw).hexdigest()
    ensure(before == args.expected_sha256, "Client SHA-256 differs from explicit source pin")
    module = types.ModuleType("anvil_composed_qloo_client")
    module.__file__ = str(args.client.resolve())
    sys.modules[module.__name__] = module
    # Execute the verified bytes, rather than rereading source between hash and import.
    exec(compile(raw, str(args.client), "exec"), module.__dict__)
    records = [course(module, endpoint) for endpoint in ("search", "insights")]
    after = hashlib.sha256(args.client.read_bytes()).hexdigest()
    receipt = {
        "schema": "hamon.qloo-recovery-isolation-public-receiving/1",
        "recorded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "optimization": sys.flags.optimize,
        "source_path": str(args.client.resolve()),
        "source_bytes": len(raw),
        "source_sha256_before": before,
        "source_sha256_after": after,
        "source_unchanged": before == after,
        "courses": records,
        "ok": before == after and all(row["ok"] for row in records),
        "scope": "Public search/insights calls with authored synthetic transports. "
                 "No private-cache inspection, network, provider, real key, automatic "
                 "retry, external model, service upgrade or original receiver change.",
    }
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"ok": receipt["ok"], "optimization": sys.flags.optimize,
                      "courses": [{"endpoint": r["endpoint"], "ok": r["ok"],
                                   "transport_calls": r["transport_calls"],
                                   "failed_stage": r.get("failed_stage")}
                                  for r in records]}))
    return 0 if receipt["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
