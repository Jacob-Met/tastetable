"""Literal accessibility evidence must support the stated entrance check."""
import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import ScriptedModel, run_agent
from constraints import check_wheelchair, evaluate
from personas import PERSONAS
from qloo_client import Entity, FixtureTransport, QlooClient, parse_entity

ACCESS_ID = "urn:tag:accessibility:place:wheelchair_accessible_entrance"
UNCLEAR = [
    {"tag_id": "urn:tag:accessibility:place:no_wheelchair_access", "name": "Not wheelchair accessible"},
    {"tag_id": "urn:tag:amenity:place:wheelchair_rental", "name": "Wheelchair rental"},
    {"tag_id": "urn:tag:accessibility:place:wheelchair_accessible_restroom",
     "name": "Wheelchair accessible restroom only"},
    {"name": "Wheelchair accessible entrance unavailable"},
    {"tag_id": ACCESS_ID, "name": "Not wheelchair accessible"},
    {"tag_id": "urn:tag:accessibility:place:wheelchair_accessible_entrance_unconfirmed"},
]


def venue(tags):
    return parse_entity({"entity_id": "FIX-AUTHORED", "name": "Authored venue", "tags": tags})


@pytest.mark.parametrize("tag", UNCLEAR, ids=[
    "negation", "unrelated-service", "restroom-only", "unavailable",
    "contrary-label", "unconfirmed-identifier",
])
def test_unclear_or_negated_tag_is_not_an_entrance_pass(tag):
    entity = venue([copy.deepcopy(tag)])
    before = copy.deepcopy(entity.to_dict())
    check = check_wheelchair(entity)
    assert check.status == "unknown"
    assert "affirmative" in check.reason
    assert not evaluate(entity, ["wheelchair"]).ok
    assert entity.to_dict() == before


@pytest.mark.parametrize("tag", [
    {"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"},
    {"name": "Wheelchair accessible entrance"},
    {"tag_id": ACCESS_ID},
    {"id": ACCESS_ID, "name": None},
    {"name": "  WHEELCHAIR   accessible  entrance  "},
    {"name": "Wheelchair-accessible entrance"},
], ids=["fixture", "label-only", "identifier-only", "alternate-id",
        "case-and-spacing", "hyphen"])
def test_explicit_affirmative_entrance_evidence_remains_accepted(tag):
    entity = venue([copy.deepcopy(tag)])
    before = copy.deepcopy(entity.to_dict())
    check = check_wheelchair(entity)
    assert check.status == "pass"
    assert check.reason == "tagged 'wheelchair accessible entrance'"
    assert evaluate(entity, ["wheelchair"]).ok
    assert entity.to_dict() == before


@pytest.mark.parametrize("barrier", [
    {"tag_id": "urn:tag:accessibility:place:steps_at_entrance"},
    {"name": "Steps at entrance"},
], ids=["identifier", "label"])
def test_existing_steps_refusal_precedes_affirmative_signal(barrier):
    entity = venue([{"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"}, barrier])
    assert check_wheelchair(entity).status == "fail"
    assert not evaluate(entity, ["wheelchair"]).ok


def test_unknown_access_remains_optional_when_not_requested():
    entity = venue([{"name": "Wheelchair rental"}])
    assert check_wheelchair(entity).status == "unknown"
    assert evaluate(entity, []).ok
    missing = check_wheelchair(venue([]))
    assert missing.status == "unknown"
    assert missing.reason == "no accessibility tag in Qloo data"


@pytest.mark.parametrize("tag", UNCLEAR[:3], ids=["negative", "unrelated", "partial"])
def test_actual_planner_keeps_unqualified_venues_out_of_checked_week(tag):
    transport = FixtureTransport()
    for place in transport.data["places"]:
        place["tags"] = [t for t in place["tags"]
                         if not t["tag_id"].startswith("urn:tag:accessibility:")]
        place["tags"].append(copy.deepcopy(tag))
    original_data = copy.deepcopy(transport.data)
    result = run_agent(copy.deepcopy(PERSONAS["rosa"]),
                       qloo=QlooClient(api_key="SYNTHETIC-FIXTURE", transport=transport),
                       model=ScriptedModel())
    assert result["mock"] is True
    assert result["plan"]["meals"] == []
    assert result["plan"]["outing"] is None
    assert result["plan"]["rejected"]
    assert all(any(check["constraint"] == "wheelchair" and check["status"] == "unknown"
                   for check in rejected["failed"])
               for rejected in result["plan"]["rejected"])
    assert transport.data == original_data


@pytest.mark.parametrize("other", [UNCLEAR[0], UNCLEAR[2], UNCLEAR[3], UNCLEAR[4], UNCLEAR[5]],
                         ids=["negative", "partial", "unavailable", "contrary-label", "unknown-id"])
def test_mixed_access_claims_remain_unknown(other):
    entity = venue([{"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"},
                    copy.deepcopy(other)])
    assert check_wheelchair(entity).status == "unknown"
    assert not evaluate(entity, ["wheelchair"]).ok


def test_unrelated_rental_tag_does_not_cancel_established_entrance_evidence():
    entity = venue([copy.deepcopy(UNCLEAR[1]),
                    {"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"}])
    assert check_wheelchair(entity).status == "pass"


def test_affirmative_label_does_not_override_a_different_accessibility_identifier():
    entity = venue([{"tag_id": UNCLEAR[0]["tag_id"], "name": "Wheelchair accessible entrance"}])
    assert check_wheelchair(entity).status == "unknown"


@pytest.mark.parametrize("label", [
    "Not wheelchair accessible.",
    "Wheelchair accessibility: unconfirmed",
], ids=["contrary-period", "unconfirmed-colon"])
def test_punctuated_mixed_access_claims_remain_unknown_in_actual_planner(label):
    note = {"tag_id": "urn:tag:amenity:place:entrance_note", "name": label}
    entity = venue([{"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"}, note])
    assert check_wheelchair(entity).status == "unknown"
    assert not evaluate(entity, ["wheelchair"]).ok
    transport = FixtureTransport()
    for place in transport.data["places"]:
        place["tags"] = [t for t in place["tags"]
                         if not t["tag_id"].startswith("urn:tag:accessibility:")]
        place["tags"].extend([
            {"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"},
            copy.deepcopy(note),
        ])
    original_data = copy.deepcopy(transport.data)
    result = run_agent(copy.deepcopy(PERSONAS["rosa"]),
                       qloo=QlooClient(api_key="SYNTHETIC-FIXTURE", transport=transport),
                       model=ScriptedModel())
    assert result["mock"] is True
    assert result["plan"]["meals"] == []
    assert result["plan"]["outing"] is None
    assert result["plan"]["rejected"]
    assert transport.data == original_data


@pytest.mark.parametrize("label", [
    "Wheelchair users prohibited",
    "Wheelchair information pending",
    "Wheelchair users ask staff",
], ids=["prohibited", "pending-information", "staff-query"])
def test_unqualified_accessibility_namespace_note_stays_unknown_in_actual_planner(label):
    note = {"tag_id": "urn:tag:accessibility:place:entrance_note", "name": label}
    entity = venue([{"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"}, note])
    assert check_wheelchair(entity).status == "unknown"
    assert not evaluate(entity, ["wheelchair"]).ok
    transport = FixtureTransport()
    for place in transport.data["places"]:
        place["tags"] = [t for t in place["tags"]
                         if not t["tag_id"].startswith("urn:tag:accessibility:")]
        place["tags"].extend([
            {"tag_id": ACCESS_ID, "name": "Wheelchair accessible entrance"},
            copy.deepcopy(note),
        ])
    original_data = copy.deepcopy(transport.data)
    result = run_agent(copy.deepcopy(PERSONAS["rosa"]),
                       qloo=QlooClient(api_key="SYNTHETIC-FIXTURE", transport=transport),
                       model=ScriptedModel())
    assert result["mock"] is True
    assert result["plan"]["meals"] == []
    assert result["plan"]["outing"] is None
    assert result["plan"]["rejected"]
    assert transport.data == original_data
