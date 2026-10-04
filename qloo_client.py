"""Minimal Qloo API client for TasteTable (stdlib only).

Documentation this client is written against (read 2026-10-04, no live calls made):
  * Hackathon developer guide (base URL, auth header, GET-only, supported types):
      https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
  * Insights API (GET /v2/insights, main recommendations endpoint):
      https://docs.qloo.com/reference/insights-api-deep-dive
  * Parameter reference (filter.type, filter.tags, filter.location.query,
    signal.interests.entities, take, ...):
      https://docs.qloo.com/reference/parameters
  * Entity search (GET /search):      https://docs.qloo.com/reference/get-search
  * Tags search   (GET /v2/tags):     https://docs.qloo.com/reference/get-tags-1
  * Hackathon kit (credential handling, safe use):
      https://github.com/qloo/qloo-hackathon-kit  (docs/API_ACCESS.md, docs/SAFE_USE.md)

Key documented facts encoded below:
  * Hackathon keys only work against https://hackathon.api.qloo.com (else 401).
  * Auth is the ``X-Api-Key`` header - NOT a query param and NOT a Bearer token.
  * /v2/insights is GET with dotted query params; ``filter.type`` is required.
  * Music is ``urn:entity:artist``; restaurants/venues are ``urn:entity:place``.
  * /recs and /recommendations are legacy and unsupported - do not use them.

Response-shape caveat: the doc pages render examples client-side, so the
parsers below are deliberately tolerant (they accept ``results`` as a list or as
``{"entities": [...]}`` / ``{"tags": [...]}``, and affinity under
``query.affinity`` or top-level ``affinity``). Verify against one live response
once a key is issued, then tighten the fixtures in fixtures/qloo_fixtures.json.

The API key is read from the QLOO_API_KEY environment variable on the server
only. It is never logged, never sent to the browser, and never stored in repo.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

HACKATHON_BASE_URL = "https://hackathon.api.qloo.com"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "qloo_fixtures.json"

# Entity types accepted by filter.type on /v2/insights (developer guide).
INSIGHTS_TYPES = {
    "urn:entity:artist", "urn:entity:book", "urn:entity:brand",
    "urn:entity:destination", "urn:entity:movie", "urn:entity:person",
    "urn:entity:place", "urn:entity:podcast", "urn:entity:tv_show",
    "urn:entity:video_game",
}

Transport = Callable[[str, dict, dict], dict]  # (path, params, headers) -> json


class QlooError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Qloo HTTP {status}: {message}")
        self.status = status
        # Bounded-retry policy from docs/API_ACCESS.md: only 429/5xx are retryable.
        self.retryable = status == 429 or status >= 500


@dataclass
class Entity:
    entity_id: str
    name: str
    types: list[str] = field(default_factory=list)
    affinity: Optional[float] = None
    popularity: Optional[float] = None
    tags: list[dict] = field(default_factory=list)
    properties: dict = field(default_factory=dict)

    @property
    def tag_names(self) -> list[str]:
        return [str(t.get("name", "")) for t in self.tags]

    @property
    def tag_ids(self) -> list[str]:
        return [str(t.get("tag_id") or t.get("id") or "") for t in self.tags]

    def to_dict(self) -> dict:
        return {
            "entity_id": self.entity_id, "name": self.name, "types": self.types,
            "affinity": self.affinity, "popularity": self.popularity,
            "tags": self.tags, "properties": self.properties,
        }


# --------------------------------------------------------------------------- parsing

def _entity_list(payload: dict, key: str = "entities") -> list[dict]:
    res = payload.get("results", [])
    if isinstance(res, dict):
        res = res.get(key, [])
    return res if isinstance(res, list) else []


def parse_entity(raw: dict) -> Entity:
    q = raw.get("query") or {}
    affinity = q.get("affinity", raw.get("affinity"))
    types = raw.get("types") or ([raw["type"]] if raw.get("type") else [])
    return Entity(
        entity_id=str(raw.get("entity_id") or raw.get("id") or ""),
        name=str(raw.get("name", "")),
        types=list(types),
        affinity=float(affinity) if affinity is not None else None,
        popularity=float(raw["popularity"]) if raw.get("popularity") is not None else None,
        tags=list(raw.get("tags") or []),
        properties=dict(raw.get("properties") or {}),
    )


def parse_search(payload: dict) -> list[Entity]:
    return [parse_entity(r) for r in _entity_list(payload)]


def parse_insights(payload: dict) -> list[Entity]:
    if payload.get("success") is False:
        raise QlooError(400, str(payload.get("errors") or payload))
    return [parse_entity(r) for r in _entity_list(payload, "entities")]


def parse_tags(payload: dict) -> list[dict]:
    out = []
    for t in _entity_list(payload, "tags"):
        out.append({"tag_id": t.get("id") or t.get("tag_id"), "name": t.get("name"),
                    "type": t.get("type")})
    return out


# --------------------------------------------------------------------------- transports

def http_transport(base_url: str, timeout: float = 15.0) -> Transport:
    """Live transport (stdlib). GET only, as required by the developer guide."""
    def _call(path: str, params: dict, headers: dict) -> dict:
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
        req = urllib.request.Request(f"{base_url}{path}?{qs}", headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:  # surface status clearly, never echo headers
            raise QlooError(e.code, e.reason) from None
    return _call


class FixtureTransport:
    """Recorded-fixture mock that answers with documented response shapes.

    It also emulates the server-side rules that matter for correctness tests:
    missing X-Api-Key -> 401, unsupported filter.type -> 403, legacy paths -> 404.
    Every request is appended to ``self.log`` (headers are NOT logged).
    """

    def __init__(self, path: Path = FIXTURE_PATH):
        self.data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.log: list[dict] = []

    def __call__(self, path: str, params: dict, headers: dict) -> dict:
        self.log.append({"path": path, "params": dict(params)})
        if not headers.get("X-Api-Key"):
            raise QlooError(401, "No API key found in request")
        if path == "/search":
            return self._search(params)
        if path == "/v2/tags":
            return self._tags(params)
        if path == "/v2/insights":
            return self._insights(params)
        raise QlooError(404, f"unsupported path {path}")

    def _search(self, p: dict) -> dict:
        q = str(p.get("query", "")).lower().strip()
        types = set(filter(None, str(p.get("types", "")).split(",")))
        hits = [e for e in self.data["search_entities"]
                if q and q in e["name"].lower()
                and (not types or set(e.get("types", [])) & types)]
        return {"results": hits[: int(p.get("take", 5))]}

    def _tags(self, p: dict) -> dict:
        q = str(p.get("filter.query", "")).lower().strip()
        hits = [t for t in self.data["tags"]
                if q and (q in t["name"].lower() or q in [a.lower() for a in t.get("aka", [])])]
        return {"success": True,
                "results": {"tags": [{k: t[k] for k in ("id", "name", "type")} for t in hits]}}

    def _insights(self, p: dict) -> dict:
        ftype = p.get("filter.type")
        if not ftype:
            raise QlooError(400, "filter.type is required")
        if ftype not in INSIGHTS_TYPES:
            raise QlooError(403, f"You do not have permission to access {ftype}")
        want_tags = set(filter(None, str(p.get("filter.tags", "")).split(",")))
        signals = list(filter(None, str(p.get("signal.interests.entities", "")).split(",")))
        loc = str(p.get("filter.location.query", "")).lower()
        out = []
        for e in self.data["places"]:
            if ftype not in e.get("types", []):
                continue
            ids = {t["tag_id"] for t in e.get("tags", [])}
            if want_tags and not (ids & want_tags):
                continue
            if loc and loc not in e["properties"].get("geocode", {}).get("city", "").lower():
                continue
            sig = [e.get("_signals", {}).get(s) for s in signals]
            sig = [s for s in sig if s is not None]
            aff = max(sig) if sig else round(0.35 * e.get("popularity", 0.5), 3)
            item = {k: v for k, v in e.items() if not k.startswith("_")}
            item["query"] = {"affinity": aff}
            out.append(item)
        out.sort(key=lambda x: x["query"]["affinity"], reverse=True)
        return {"success": True, "results": {"entities": out[: int(p.get("take", 10))]},
                "duration": 1}


# --------------------------------------------------------------------------- client

class QlooClient:
    def __init__(self, api_key: Optional[str] = None, base_url: str = HACKATHON_BASE_URL,
                 transport: Optional[Transport] = None):
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.transport = transport or http_transport(self.base_url)
        self._cache: dict[str, Any] = {}  # docs: cache only what the project needs

    @classmethod
    def from_env(cls) -> "QlooClient":
        """Live client only when QLOO_API_KEY is set AND TASTETABLE_LIVE=1; else mock."""
        key = os.environ.get("QLOO_API_KEY")
        if key and os.environ.get("TASTETABLE_LIVE") == "1":
            return cls(api_key=key, base_url=os.environ.get("QLOO_BASE_URL", HACKATHON_BASE_URL))
        return cls(api_key="MOCK-NOT-A-KEY", transport=FixtureTransport())

    @property
    def is_mock(self) -> bool:
        return isinstance(self.transport, FixtureTransport)

    def _get(self, path: str, params: dict) -> dict:
        ck = path + json.dumps(params, sort_keys=True)
        if ck not in self._cache:
            headers = {"X-Api-Key": self._api_key or "", "accept": "application/json"}
            self._cache[ck] = self.transport(path, params, headers)
        return self._cache[ck]

    # GET /search  - https://docs.qloo.com/reference/get-search
    def search(self, query: str, types: Optional[str] = None, take: int = 3) -> list[Entity]:
        params = {"query": query, "take": take}
        if types:
            params["types"] = types
        return parse_search(self._get("/search", params))

    # GET /v2/tags - https://docs.qloo.com/reference/get-tags-1
    def find_tags(self, query: str, tag_type: Optional[str] = None, take: int = 3) -> list[dict]:
        params = {"filter.query": query, "take": take}
        if tag_type:
            params["filter.tag.types"] = tag_type
        return parse_tags(self._get("/v2/tags", params))

    # GET /v2/insights - https://docs.qloo.com/reference/insights-api-deep-dive
    def insights(self, filter_type: str, *, signal_entities: Optional[list[str]] = None,
                 filter_tags: Optional[list[str]] = None, location_query: Optional[str] = None,
                 take: int = 10, extra: Optional[dict] = None) -> list[Entity]:
        if filter_type not in INSIGHTS_TYPES:
            raise ValueError(f"unsupported filter.type {filter_type}")
        params: dict[str, Any] = {"filter.type": filter_type, "take": take}
        if signal_entities:
            params["signal.interests.entities"] = ",".join(signal_entities)
        if filter_tags:
            params["filter.tags"] = ",".join(filter_tags)
        if location_query:
            params["filter.location.query"] = location_query
        params.update(extra or {})
        return parse_insights(self._get("/v2/insights", params))
