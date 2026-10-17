"""CommonGround: find places two (or more) people can both enjoy, using Qloo.

Scope: a negotiation/recommendation path layered on the existing QlooClient.
Each party contributes taste concepts only (artists, films, cuisine tags) and
optional hard constraints. The module never sends names or health details to
Qloo: only entity IDs and tag IDs go into the request, per the kit's SAFE_USE.

Method (least-satisfied, not average):
  1. For each party, resolve taste entities and call /v2/insights with that
     party's signal entities, so each party gets its own affinity per venue.
  2. Keep venues that appear in every party's result set.
  3. Score a venue by its MINIMUM affinity across parties. A venue one person
     barely likes never wins on the strength of another person's high score.
  4. Apply each party's constraints as a veto (constraints.evaluate). A venue
     that fails or is unknown for any party is rejected, with the reason kept.

Mock by default: QlooClient.from_env() returns the synthetic fixture unless
QLOO_API_KEY and TASTETABLE_LIVE=1 are both set. Output carries `mock: true`
so a mock result is never presented as live Qloo data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from constraints import evaluate
from qloo_client import Entity, QlooClient

PLACE_TYPE = "urn:entity:place"


@dataclass
class Party:
    party_id: str                      # opaque label, e.g. "caregiver", "member-2"
    signal_entity_ids: list[str] = field(default_factory=list)
    tag_ids: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)


def _venues_for(client: QlooClient, party: Party, location: Optional[str], take: int) -> dict[str, Entity]:
    if not party.signal_entity_ids and not party.tag_ids:
        return {}
    ents = client.insights(
        PLACE_TYPE,
        signal_entities=party.signal_entity_ids or None,
        filter_tags=party.tag_ids or None,
        location_query=location,
        take=take,
    )
    return {e.entity_id: e for e in ents}


def find_common_ground(parties: list[Party], client: Optional[QlooClient] = None,
                       location: Optional[str] = None, take: int = 15,
                       max_results: int = 5) -> dict:
    """Return ranked shared venues plus the rejected ones, with reasons."""
    if len(parties) < 2:
        raise ValueError("CommonGround needs at least two parties")
    ids = [p.party_id for p in parties]
    if len(set(ids)) != len(ids):
        raise ValueError("party_id values must be unique")
    client = client or QlooClient.from_env()

    per_party = {p.party_id: _venues_for(client, p, location, take) for p in parties}
    shared = set.intersection(*(set(v) for v in per_party.values())) if per_party else set()

    accepted, rejected = [], []
    for eid in sorted(shared):
        affinities = {pid: per_party[pid][eid].affinity for pid in ids}
        ent = per_party[ids[0]][eid]
        veto_reasons = []
        for p in parties:
            if not p.constraints:
                continue
            verdict = evaluate(per_party[p.party_id][eid], p.constraints, kind="restaurant")
            if not verdict.ok:
                for ch in verdict.checks:
                    if ch.status != "pass":
                        veto_reasons.append({"party": p.party_id, "constraint": ch.constraint,
                                             "result": ch.status, "reason": ch.reason})
        known = [a for a in affinities.values() if a is not None]
        row = {
            "entity_id": eid,
            "name": ent.name,
            "affinities": affinities,
            "score": min(known) if len(known) == len(ids) else None,  # least-satisfied
        }
        if veto_reasons:
            row["vetoed_by"] = veto_reasons
            rejected.append(row)
        else:
            accepted.append(row)

    accepted.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0), r["name"]))
    return {
        "mock": client.is_mock,
        "parties": ids,
        "method": "least-satisfied (min affinity across parties); constraints are vetoes",
        "shared_candidates": len(shared),
        "results": accepted[:max_results],
        "rejected": rejected,
    }
