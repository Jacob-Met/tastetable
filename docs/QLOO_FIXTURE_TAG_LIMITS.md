# Requested tag limits in the offline fixture client

The ordinary public client sends its requested result count to the transport:

```python
from qloo_client import FixtureTransport, QlooClient

transport = FixtureTransport()
client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=transport)
tags = client.find_tags("a", take=2)
print([tag["name"] for tag in tags])
# ['Cuban', 'Mexican']
```

The bundled fictional data has seven matches for this broad query. The fixture
transport now applies the requested count after its existing name and alias
filtering. It keeps the original fixture order and fields. Previously, the
same public call returned all seven matches regardless of the requested count.

Omitting the public method's take argument retains its existing default of
three. A nonnegative integer limit of zero returns no matches; a limit above
the number of matches returns every matching tag. Direct FixtureTransport
calls that omit the take parameter retain their previous all-matches behavior.

This correction is limited to fixture tag selection. It does not introduce a
new type-filter policy or change provider requests, response parsing, fixture
contents, planner rules, entity search, insights, cache admission or returned
object isolation. Existing integer conversion semantics are reused; this
guide specifies nonnegative integer counts, not a new invalid-input policy.

Repeated identical public requests still use the cache. Different requested
counts retain distinct cache keys. Caller edits do not change the fixture or
subsequent parsed results.

## Run the focused checks

From the repository root, using Python's standard library only:

```sh
python -B -m unittest discover -s tests -p 'test_fixture_tag_limits.py' -v
```

The maintained tests cover the default, explicit boundaries, stable prefixes,
post-filter limiting, empty and normalized queries, direct-call compatibility,
cache separation, caller isolation and unchanged request/authentication shape.

The [receiving record](receiving/fixture-tag-limits-1caa1d8e028a/README.md)
binds the original source, native original/candidate results, independent
receiving and byte comparisons for the three ordinary persona commands.
This is qualification of the fictional local fixture, with no live Qloo
response, venue verification, browser or installed service claim.
