# Qloo result ownership

`QlooClient.search()`, `find_tags()` and `insights()` return a fresh mutable result
tree on every call. You can attach or edit local metadata without changing a
later result or the transport's response data. This includes nested tag
dictionaries, geocode fields and keyword lists exposed by an `Entity`.

For example, this uses only the existing fictional fixtures:

```python
from qloo_client import FixtureTransport, QlooClient

transport = FixtureTransport()
client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=transport)

first = client.insights("urn:entity:place", take=50)
original_city = first[0].properties["geocode"]["city"]
first[0].properties["geocode"]["city"] = "My local annotation"

again = client.insights("urn:entity:place", take=50)
assert again[0].properties["geocode"]["city"] == original_city
assert len(transport.log) == 1
```

Repeated identical requests still reuse the raw in-memory response and parse it
on each public read. A distinct query still has its own cache entry. The client
copies the parsed result immediately before returning it; request construction,
metric conversion and transport errors retain their existing behavior.

`Entity.to_dict()` exposes that entity's current fields, including its mutable
lists and dictionaries. Editing those fields can therefore change the same
entity, while remaining isolated from other public calls. Direct calls to the
low-level `parse_entity`, `parse_search`, `parse_tags` and `parse_insights`
functions retain their existing behavior.

## Explicit recovery after parsing fails

A payload enters the cache only after its endpoint parser succeeds. If parsing
raises, that explicit call retains its exception and performs no automatic retry.
A later identical call fetches again. After it succeeds, caller-owned nested
results remain isolated on both that return and subsequent cache hits.

The original isolation receipt below records the earlier behavior. The separate
[composition qualification](qualification/qloo-cache-composition-20261013/README.md)
records recovery and isolation together, including the updated repeated-error
transport count of two.

## Regression checks

Run from the repository root with the project's pytest dependency available:

```sh
python -m pytest -q tests/test_qloo_cache_isolation.py
python -m pytest -q tests/test_tastetable.py tests/test_qloo_http_lifetime.py -k 'not test_web_endpoints'
```

The focused tests cover cold and warm cached results, separate queries, fixture
data preservation, tag fields, metric conversion, parse errors and transport
refusals. The second command exercises the existing Python client, planner,
constraint and local HTTP response checks; it explicitly leaves out the web
endpoint test. Neither command needs a live Qloo or model provider.

Exact original/candidate results and their source pins are recorded in the
[receiving record](receiving/qloo-cache-isolation-1caa1d8e028a/README.md).
