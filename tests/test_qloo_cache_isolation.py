"""A caller can edit its Qloo results without changing a later cached response."""

from copy import deepcopy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qloo_client import FixtureTransport, QlooClient, QlooError  # noqa: E402


def entity_payload():
    return {"results": {"entities": [{
        "entity_id": "FIX-cache-hall",
        "name": "Fictional music hall",
        "types": ["urn:entity:place"],
        "query": {"affinity": 0.8},
        "popularity": 0.4,
        "tags": [{"tag_id": "FIX-jazz", "name": "Jazz", "type": "genre"}],
        "properties": {
            "geocode": {"city": "Original City"},
            "keywords": [{"name": "music", "count": 1}],
        },
    }]}}


class SuppliedTransport:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def __call__(self, path, params, headers):
        assert headers == {"X-Api-Key": "MOCK-NOT-A-KEY", "accept": "application/json"}
        self.calls.append((path, dict(params)))
        return self.response


def make_client(response):
    transport = SuppliedTransport(response)
    return QlooClient(api_key="MOCK-NOT-A-KEY", transport=transport), transport


def request(client, method, query="first"):
    if method == "search":
        return client.search(query, types="urn:entity:place", take=3)
    return client.insights("urn:entity:place", location_query=query, take=3)


def edit_result(entity):
    entity.tags[0]["name"] = "My local tag"
    entity.properties["geocode"]["city"] = "My local city"
    entity.to_dict()["properties"]["keywords"][0]["name"] = "My local keyword"


def assert_original_metadata(entity):
    assert entity.tags[0]["name"] == "Jazz"
    assert entity.properties["geocode"]["city"] == "Original City"
    assert entity.properties["keywords"][0]["name"] == "music"


@pytest.mark.parametrize("method", ["search", "insights"])
def test_editing_cold_result_preserves_transport_and_later_cached_result(method):
    payload = entity_payload()
    before = deepcopy(payload)
    client, transport = make_client(payload)

    first = request(client, method)[0]
    edit_result(first)
    second = request(client, method)[0]

    assert_original_metadata(second)
    assert payload == before
    assert len(transport.calls) == 1
    assert first.tags[0]["name"] == "My local tag"  # caller edits remain usable
    assert first is not second


@pytest.mark.parametrize("method", ["search", "insights"])
def test_editing_warm_result_preserves_earlier_and_later_callers(method):
    client, transport = make_client(entity_payload())
    first = request(client, method)[0]
    second = request(client, method)[0]
    edit_result(second)
    third = request(client, method)[0]

    assert_original_metadata(first)
    assert_original_metadata(third)
    assert len(transport.calls) == 1
    assert second.properties["geocode"]["city"] == "My local city"


@pytest.mark.parametrize("method", ["search", "insights"])
def test_local_edits_do_not_pollute_a_distinct_query_to_the_same_transport(method):
    payload = entity_payload()
    before = deepcopy(payload)
    client, transport = make_client(payload)
    edit_result(request(client, method, "first")[0])

    second_query = request(client, method, "second")[0]
    first_query_again = request(client, method, "first")[0]

    assert_original_metadata(second_query)
    assert_original_metadata(first_query_again)
    assert payload == before
    assert len(transport.calls) == 2
    parameter = "query" if method == "search" else "filter.location.query"
    assert [call[1][parameter] for call in transport.calls] == ["first", "second"]


def test_tag_results_keep_existing_fields_and_allow_local_edits():
    payload = {"results": {"tags": [{"id": "FIX-jazz", "name": "Jazz", "type": "genre"}]}}
    before = deepcopy(payload)
    client, transport = make_client(payload)
    first = client.find_tags("jazz", tag_type="genre", take=2)
    first[0]["name"] = "My label"
    first.append({"tag_id": "LOCAL", "name": "Local only", "type": "genre"})

    assert client.find_tags("jazz", tag_type="genre", take=2) == [
        {"tag_id": "FIX-jazz", "name": "Jazz", "type": "genre"}
    ]
    assert payload == before
    assert transport.calls == [("/v2/tags", {
        "filter.query": "jazz", "take": 2, "filter.tag.types": "genre",
    })]


def test_cached_raw_values_are_still_parsed_once_per_public_read():
    class CountingFloat:
        def __init__(self):
            self.calls = 0

        def __float__(self):
            self.calls += 1
            return 0.25

    value = CountingFloat()
    payload = entity_payload()
    payload["results"]["entities"][0]["query"]["affinity"] = value
    client, transport = make_client(payload)

    assert client.search("hall")[0].affinity == 0.25
    assert client.search("hall")[0].affinity == 0.25
    assert value.calls == 2
    assert payload["results"]["entities"][0]["query"]["affinity"] is value
    assert len(transport.calls) == 1


def test_existing_parse_error_identity_survives_explicit_retry():
    error = ValueError("synthetic metric conversion failure")

    class BrokenFloat:
        def __float__(self):
            raise error

    payload = entity_payload()
    payload["results"]["entities"][0]["query"]["affinity"] = BrokenFloat()
    client, transport = make_client(payload)

    for _ in range(2):
        with pytest.raises(ValueError) as refused:
            client.search("hall")
        assert refused.value is error
    # Rejected payloads are not cached; each explicit call fetches again.
    assert len(transport.calls) == 2


def test_failed_transport_is_not_cached_and_later_success_is_reused():
    error = QlooError(429, "synthetic busy response")
    payload = entity_payload()
    calls = []

    def transport(path, params, headers):
        calls.append((path, dict(params)))
        if len(calls) == 1:
            raise error
        return payload

    client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=transport)
    with pytest.raises(QlooError) as refused:
        client.search("hall")
    assert refused.value is error and error.retryable
    assert_original_metadata(client.search("hall")[0])
    assert_original_metadata(client.search("hall")[0])
    assert len(calls) == 2


def test_missing_optional_fields_and_zero_metrics_keep_their_values():
    payload = {"results": [
        {"id": "FIX-minimal", "name": "Minimal"},
        {"id": "FIX-zero", "name": "Zero", "affinity": 0, "popularity": 0},
    ]}
    client, transport = make_client(payload)
    first = client.search("both")
    first[0].tags.append({"name": "Local only"})
    second = client.search("both")

    assert [entity.entity_id for entity in second] == ["FIX-minimal", "FIX-zero"]
    assert second[0].affinity is None and second[0].popularity is None
    assert second[0].tags == [] and second[0].properties == {} and second[0].types == []
    assert second[1].affinity == 0.0 and second[1].popularity == 0.0
    assert len(transport.calls) == 1


def test_real_fixture_transport_keeps_its_fictional_source_after_caller_edits():
    transport = FixtureTransport()
    before = deepcopy(transport.data)
    client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=transport)
    first = client.insights("urn:entity:place", take=50)
    expected = deepcopy([entity.to_dict() for entity in first])
    first[0].tags[0]["name"] = "My local fixture label"
    first[0].properties["geocode"]["city"] = "My local fixture city"

    second = client.insights("urn:entity:place", take=50)

    assert [entity.to_dict() for entity in second] == expected
    assert transport.data == before
    assert len(transport.log) == 1
