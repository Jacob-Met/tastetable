"""Caregiver constraint checks over Qloo place entities.

These are heuristics over Qloo tags/keywords, NOT medical or dietary advice and
NOT a guarantee of venue accessibility. Every result is pass / fail / unknown,
and the UI tells the caregiver to call ahead for anything not explicitly 'pass'.

Tag IDs for accessibility are placeholders in the fixture; resolve the real ones
with GET /v2/tags (https://docs.qloo.com/reference/get-tags-1) before going live.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from qloo_client import Entity

SUPPORTED = {"soft_foods", "low_sodium", "wheelchair"}

HARD_TEXTURE = ("sandwich", "pressed bread", "crusty bread", "ribs", "brisket", "burger",
                "fried", "jerky", "nuts", "cured")
SOFT_TEXTURE = ("soup", "caldo", "mashed", "grits", "polenta", "risotto", "tofu", "steamed",
                "flan", "chawanmushi", "gnocchi", "made to order", "refried beans", "pozole")
HIGH_SODIUM = ("cured", "pickle", "pickled", "bbq", "rich broth", "olives", "cuban sandwich",
               "ramen")
LOW_SODIUM = ("low sodium", "heart-healthy", "steamed", "made to order")


@dataclass
class Check:
    constraint: str
    status: str  # pass | fail | unknown
    reason: str

    def to_dict(self) -> dict:
        return {"constraint": self.constraint, "status": self.status, "reason": self.reason}


@dataclass
class Verdict:
    entity_id: str
    name: str
    ok: bool
    checks: list[Check] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"entity_id": self.entity_id, "name": self.name, "ok": self.ok,
                "checks": [c.to_dict() for c in self.checks]}


def _keywords(e: Entity) -> list[str]:
    kws = e.properties.get("keywords") or []
    return [str(k.get("name", k) if isinstance(k, dict) else k).lower() for k in kws]


def _hits(words: list[str], vocab: tuple[str, ...]) -> list[str]:
    return sorted({w for w in words for v in vocab if v in w})


def check_soft_foods(e: Entity) -> Check:
    kw = _keywords(e)
    soft, hard = _hits(kw, SOFT_TEXTURE), _hits(kw, HARD_TEXTURE)
    if soft:
        return Check("soft_foods", "pass", f"soft options listed: {', '.join(soft[:3])}")
    if hard:
        return Check("soft_foods", "fail", f"menu signals are mostly firm: {', '.join(hard[:3])}")
    return Check("soft_foods", "unknown", "no texture signal in Qloo keywords; ask the venue")


def check_low_sodium(e: Entity) -> Check:
    kw = _keywords(e)
    low, high = _hits(kw, LOW_SODIUM), _hits(kw, HIGH_SODIUM)
    if high and not low:
        return Check("low_sodium", "fail", f"high-sodium signals: {', '.join(high[:3])}")
    if low:
        return Check("low_sodium", "pass", f"lower-sodium signals: {', '.join(low[:3])}")
    return Check("low_sodium", "unknown", "no sodium signal; ask for low-salt preparation")


def check_wheelchair(e: Entity) -> Check:
    names = " ".join(e.tag_names).lower()
    ids = " ".join(e.tag_ids).lower()
    if "steps_at_entrance" in ids or "steps at entrance" in names:
        return Check("wheelchair", "fail", "tagged 'steps at entrance'")
    # Accept the established complete signal, while holding mixed or qualified
    # accessibility claims for confirmation. A rental/service tag is unrelated.
    access_id = "urn:tag:accessibility:place:wheelchair_accessible_entrance"
    affirmative, unclear = False, False
    for tag in e.tags:
        raw_name = tag.get("name")
        label = " ".join(("" if raw_name is None else str(raw_name)).casefold().replace("-", " ").split())
        tag_id = str(tag.get("tag_id") or tag.get("id") or "").strip().casefold()
        if label == "wheelchair accessible entrance" or (not label and tag_id == access_id):
            affirmative = True
        elif (tag_id == access_id or
              ("wheelchair" in label and set(label.split()) &
               {"access", "accessible", "accessibility", "inaccessible", "entrance"})):
            unclear = True
        if (tag_id.startswith("urn:tag:accessibility:place:") and
                "wheelchair" in tag_id and tag_id != access_id):
            unclear = True
    if affirmative and not unclear:
        return Check("wheelchair", "pass", "tagged 'wheelchair accessible entrance'")
    if "wheelchair" in ids or "wheelchair" in names:
        return Check("wheelchair", "unknown", "no unambiguous affirmative entrance evidence; ask the venue")
    return Check("wheelchair", "unknown", "no accessibility tag in Qloo data")


CHECKERS = {"soft_foods": check_soft_foods, "low_sodium": check_low_sodium,
            "wheelchair": check_wheelchair}
# Constraints where 'unknown' is treated as a fail (safety-critical access needs).
STRICT = {"wheelchair"}


def evaluate(e: Entity, constraints: list[str], kind: str = "restaurant") -> Verdict:
    checks = []
    for c in constraints:
        if c not in SUPPORTED:
            raise ValueError(f"unknown constraint {c!r}")
        if kind == "outing" and c in ("soft_foods", "low_sodium"):
            continue  # dietary checks don't apply to a cinema/museum
        checks.append(CHECKERS[c](e))
    ok = all(ch.status != "fail" and not (ch.status == "unknown" and ch.constraint in STRICT)
             for ch in checks)
    return Verdict(e.entity_id, e.name, ok, checks)


def filter_entities(entities: list[Entity], constraints: list[str], kind: str = "restaurant"
                    ) -> tuple[list[Entity], list[Verdict]]:
    verdicts = [evaluate(e, constraints, kind) for e in entities]
    kept = [e for e, v in zip(entities, verdicts) if v.ok]
    return kept, verdicts
