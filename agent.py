"""TasteTable agent: an OpenAI-style tool-calling loop over Qloo.

Tools exposed to the model (OpenAI "tools" JSON schema):
  * qloo_search      - resolve names -> Qloo entity IDs (GET /search) or
                       concepts -> tag IDs (GET /v2/tags)
  * qloo_recs        - taste-grounded candidates (GET /v2/insights)
  * constraint_check - caregiver constraint filter over fetched candidates

Model backends share one interface, ``model.chat.completions.create(model=,
messages=, tools=)`` returning an OpenAI chat.completion-shaped dict:
  * ScriptedModel     - deterministic offline stub (default; used in tests/demo)
  * OpenAICompatModel - any OpenAI-compatible /chat/completions endpoint (opt-in
                        via env, never used by tests, no key is bundled)

The final plan is assembled deterministically from tool results by
``assemble_plan`` so every pick is traceable to a Qloo entity ID + affinity.
"""
from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

from constraints import evaluate
from qloo_client import Entity, INSIGHTS_TYPES, QlooClient

MEAL_DAYS = ["Monday", "Wednesday", "Friday", "Sunday"]
OUTING_DAY = "Saturday"
FALLBACK_CUISINES = ["Diner", "Italian", "Japanese"]  # broad, soft-food-friendly
VENUE_CONCEPTS = ["jazz", "cinema", "museum", "concert hall"]
MAX_STEPS = 12
MAX_TRACE_DEPTH = 32

TOOLS = [
    {"type": "function", "function": {
        "name": "qloo_search",
        "description": "Resolve a name to a Qloo entity (kind=entity, GET /search) or a concept "
                       "to a Qloo tag (kind=tag, GET /v2/tags).",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string"},
            "kind": {"type": "string", "enum": ["entity", "tag"]},
            "types": {"type": "string", "description": "e.g. urn:entity:artist"}},
            "required": ["query", "kind"]}}},
    {"type": "function", "function": {
        "name": "qloo_recs",
        "description": "Get taste-ranked candidates from Qloo /v2/insights.",
        "parameters": {"type": "object", "properties": {
            "filter_type": {"type": "string", "enum": ["urn:entity:place"]},
            "tag_ids": {"type": "array", "items": {"type": "string"}},
            "signal_entity_ids": {"type": "array", "items": {"type": "string"}},
            "location": {"type": "string"},
            "purpose": {"type": "string", "enum": ["restaurant", "outing"]},
            "take": {"type": "integer"}},
            "required": ["filter_type", "purpose"]}}},
    {"type": "function", "function": {
        "name": "constraint_check",
        "description": "Check fetched candidates against the caregiver's saved constraints. "
                       "The server uses every requested constraint and each candidate's "
                       "retained purpose; tool arguments cannot weaken these checks.",
        "parameters": {"type": "object", "properties": {
            "entity_ids": {"type": "array", "items": {"type": "string"}},
            "constraints": {"type": "array", "items": {"type": "string"}},
            "kind": {"type": "string", "enum": ["restaurant", "outing"]}},
            "required": ["entity_ids", "constraints", "kind"]}}},
]


# ============================================================== model backends

def _completion(content: Optional[str] = None, tool_calls: Optional[list] = None) -> dict:
    msg: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {"id": "chatcmpl-scripted", "object": "chat.completion", "model": "scripted-stub",
            "choices": [{"index": 0, "message": msg,
                         "finish_reason": "tool_calls" if tool_calls else "stop"}]}


def _call(cid: str, name: str, args: dict) -> dict:
    return {"id": cid, "type": "function",
            "function": {"name": name, "arguments": json.dumps(args)}}


class _Completions:
    def __init__(self, fn):
        self.create = fn


class _Chat:
    def __init__(self, fn):
        self.completions = _Completions(fn)


class ScriptedModel:
    """Deterministic policy that behaves like a tool-calling LLM.

    It reads the persona from the first user message and the tool results so
    far, and decides the next phase. Phase is encoded in tool_call ids
    (``p<phase>_<n>``). It adapts: if too few restaurants survive the
    constraint check it widens the search to fallback cuisines.
    """

    def __init__(self):
        self.chat = _Chat(self._create)

    @staticmethod
    def _results(messages: list[dict], phase: int) -> list[dict]:
        return [json.loads(m["content"]) for m in messages
                if m.get("role") == "tool" and m.get("tool_call_id", "").startswith(f"p{phase}_")]

    def _create(self, model: str = "scripted-stub", messages: Optional[list] = None,
                tools: Optional[list] = None, **_: Any) -> dict:
        messages = messages or []
        persona = json.loads(next(m["content"] for m in messages if m["role"] == "user"))
        done = {int(m["tool_call_id"][1:].split("_")[0]) for m in messages
                if m.get("role") == "tool"}
        phase = max(done) + 1 if done else 1
        cons = persona["constraints"]

        def first_ids(ph: int, key: str) -> list[str]:
            out = []
            for r in self._results(messages, ph):
                if r.get("matches"):
                    out.append(r["matches"][0][key])
            return out

        if phase == 1:  # resolve entities + tags in parallel
            calls = []
            for n, name in enumerate(persona["music"]):
                calls.append(_call(f"p1_m{n}", "qloo_search",
                                   {"query": name, "kind": "entity", "types": "urn:entity:artist"}))
            for n, name in enumerate(persona["films"]):
                calls.append(_call(f"p1_f{n}", "qloo_search",
                                   {"query": name, "kind": "entity", "types": "urn:entity:movie"}))
            for n, c in enumerate(persona["cuisines"]):
                calls.append(_call(f"p1_c{n}", "qloo_search", {"query": c, "kind": "tag"}))
            return _completion(None, calls)

        p1 = [m for m in messages if m.get("role") == "tool" and m["tool_call_id"].startswith("p1_")]
        signals = [json.loads(m["content"])["matches"][0]["entity_id"] for m in p1
                   if m["tool_call_id"][3] in "mf" and json.loads(m["content"]).get("matches")]
        cuisine_tags = [json.loads(m["content"])["matches"][0]["tag_id"] for m in p1
                        if m["tool_call_id"][3] == "c" and json.loads(m["content"]).get("matches")]

        if phase == 2:
            return _completion(None, [_call("p2_0", "qloo_recs", {
                "filter_type": "urn:entity:place", "purpose": "restaurant",
                "tag_ids": cuisine_tags, "signal_entity_ids": signals,
                "location": persona.get("city"), "take": 10})])
        if phase == 3:
            ids = [c["entity_id"] for c in self._results(messages, 2)[0].get("candidates", [])]
            return _completion(None, [_call("p3_0", "constraint_check",
                                            {"entity_ids": ids, "constraints": cons,
                                             "kind": "restaurant"})])
        if phase == 4:  # adaptive widening
            passed = sum(v["ok"] for v in self._results(messages, 3)[0]["verdicts"])
            extra = [c for c in FALLBACK_CUISINES if c not in persona["cuisines"]]
            if passed >= len(MEAL_DAYS) or not extra:
                return _completion(None, [_call("p4_skip", "qloo_search",
                                                {"query": "", "kind": "tag"})])
            return _completion(None, [_call(f"p4_{n}", "qloo_search", {"query": c, "kind": "tag"})
                                      for n, c in enumerate(extra)])
        if phase == 5:
            fb_tags = first_ids(4, "tag_id")
            if not fb_tags:
                return _completion(None, [_call("p5_skip", "qloo_search",
                                                {"query": "", "kind": "tag"})])
            return _completion(None, [_call("p5_0", "qloo_recs", {
                "filter_type": "urn:entity:place", "purpose": "restaurant", "tag_ids": fb_tags,
                "signal_entity_ids": signals, "location": persona.get("city"), "take": 10})])
        if phase == 6:
            r5 = self._results(messages, 5)
            ids = [c["entity_id"] for c in r5[0].get("candidates", [])] if r5 else []
            if not ids:
                return _completion(None, [_call("p6_skip", "qloo_search",
                                                {"query": "", "kind": "tag"})])
            return _completion(None, [_call("p6_0", "constraint_check",
                                            {"entity_ids": ids, "constraints": cons,
                                             "kind": "restaurant"})])
        if phase == 7:
            return _completion(None, [_call(f"p7_{n}", "qloo_search", {"query": v, "kind": "tag"})
                                      for n, v in enumerate(VENUE_CONCEPTS)])
        if phase == 8:
            return _completion(None, [_call("p8_0", "qloo_recs", {
                "filter_type": "urn:entity:place", "purpose": "outing",
                "tag_ids": first_ids(7, "tag_id"), "signal_entity_ids": signals,
                "location": persona.get("city"), "take": 5})])
        if phase == 9:
            ids = [c["entity_id"] for c in self._results(messages, 8)[0].get("candidates", [])]
            return _completion(None, [_call("p9_0", "constraint_check",
                                            {"entity_ids": ids, "constraints": cons,
                                             "kind": "outing"})])
        return _completion("Plan inputs gathered; assembling weekly plan from tool results.")


class OpenAICompatModel:
    """Thin client for any OpenAI-compatible /chat/completions endpoint (opt-in)."""

    def __init__(self, base_url: str, model: str, api_key_env: str = "TASTETABLE_LLM_API_KEY"):
        self.base_url, self.model, self._key_env = base_url.rstrip("/"), model, api_key_env
        self.chat = _Chat(self._create)

    def _create(self, model: Optional[str] = None, messages: Optional[list] = None,
                tools: Optional[list] = None, **kw: Any) -> dict:
        body = json.dumps({"model": model or self.model, "messages": messages,
                           "tools": tools, **kw}).encode()
        headers = {"Content-Type": "application/json"}
        if os.environ.get(self._key_env):
            headers["Authorization"] = f"Bearer {os.environ[self._key_env]}"
        req = urllib.request.Request(f"{self.base_url}/chat/completions", body, headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())


def model_from_env():
    base = os.environ.get("TASTETABLE_LLM_BASE_URL")
    if base:
        return OpenAICompatModel(base, os.environ.get("TASTETABLE_LLM_MODEL", "gpt-4o-mini"))
    return ScriptedModel()


# ============================================================== tool execution

@dataclass
class AgentState:
    persona: dict
    entities: dict[str, Entity] = field(default_factory=dict)        # signal entities
    candidates: dict[str, dict] = field(default_factory=dict)         # id -> {entity, purpose, tags}
    verdicts: dict[str, dict] = field(default_factory=dict)
    tag_names: dict[str, str] = field(default_factory=dict)
    trace: list[dict] = field(default_factory=list)
    # Latest result for each purpose/query: candidate count, or no usable result.
    # This describes lookup completion, never provider or network availability.
    recommendation_outcomes: dict[tuple[str, str], Optional[int]] = field(default_factory=dict)


def _candidate_verdict(state: AgentState, candidate: dict) -> dict:
    """Bind every check to caregiver input and the candidate actually retained."""
    return evaluate(candidate["entity"], state.persona.get("constraints", []),
                    candidate["purpose"]).to_dict()


def _recommendation_key(filter_type, tag_ids, signal_entity_ids, location, take):
    """Mirror native pre-request preparation without changing its diagnostics.

    Unpreparable tool inputs have no lookup outcome. Equivalent omitted/empty
    filters share a key, so a later completed repeat resolves only that lookup.
    """
    # Bookkeeping observes JSON tool carriers only. Iterators and custom values
    # must reach the original client without extra iteration or conversion.
    if type(filter_type) is not str or type(take) is not int or \
            (location is not None and type(location) is not str):
        return None
    for values in (tag_ids, signal_entity_ids):
        if values is not None and (type(values) is not list or
                                   any(type(value) is not str for value in values)):
            return None
    try:
        if filter_type not in INSIGHTS_TYPES:
            return None
        return json.dumps([filter_type, ",".join(tag_ids or []),
                           ",".join(signal_entity_ids or []), location or None, take],
                          sort_keys=True)
    except Exception:
        return None  # Bookkeeping must not replace the native argument error.


class Toolbox:
    def __init__(self, qloo: QlooClient, state: AgentState):
        self.qloo, self.state = qloo, state

    def qloo_search(self, query: str, kind: str, types: Optional[str] = None) -> dict:
        if not query:
            return {"matches": [], "note": "skipped"}
        if kind == "tag":
            tags = self.qloo.find_tags(query)
            for t in tags:
                self.state.tag_names[t["tag_id"]] = t["name"]
            return {"matches": tags[:1]}
        ents = self.qloo.search(query, types=types)
        for e in ents[:1]:
            self.state.entities[e.entity_id] = e
        return {"matches": [{"entity_id": e.entity_id, "name": e.name, "types": e.types}
                            for e in ents[:1]]}

    def qloo_recs(self, filter_type: str, purpose: str, tag_ids: Optional[list] = None,
                  signal_entity_ids: Optional[list] = None, location: Optional[str] = None,
                  take: int = 10) -> dict:
        if not isinstance(purpose, str) or purpose not in ("restaurant", "outing"):
            raise ValueError("purpose must be restaurant or outing")
        key = (_recommendation_key(filter_type, tag_ids, signal_entity_ids, location, take)
               if type(purpose) is str else None)
        try:
            ents = self.qloo.insights(filter_type, signal_entities=signal_entity_ids,
                                      filter_tags=tag_ids, location_query=location, take=take)
        except Exception:
            if key is not None:
                self.state.recommendation_outcomes[(purpose, key)] = None
            raise
        if key is not None:
            self.state.recommendation_outcomes[(purpose, key)] = len(ents)
        for e in ents:
            if e.entity_id not in self.state.candidates:
                self.state.candidates[e.entity_id] = {
                    "entity": e, "purpose": purpose, "query_tags": list(tag_ids or []),
                    "signals": list(signal_entity_ids or []),
                    "fallback": any(self.state.tag_names.get(t) in FALLBACK_CUISINES
                                    and self.state.tag_names.get(t) not in self.state.persona["cuisines"]
                                    for t in (tag_ids or []))}
        return {"candidates": [{"entity_id": e.entity_id, "name": e.name,
                                "affinity": e.affinity} for e in ents]}

    def constraint_check(self, entity_ids: list, constraints: list, kind: str) -> dict:
        # Keep constraints/kind in the tool interface for existing model clients,
        # but never let model-supplied values replace the caregiver's requirements
        # or exempt a retained restaurant from its dietary checks.
        if not isinstance(entity_ids, list) or any(
                not isinstance(eid, str) or not eid for eid in entity_ids):
            raise ValueError("entity_ids must be a list of non-empty strings")
        if not isinstance(constraints, list) or any(not isinstance(c, str) for c in constraints):
            raise ValueError("constraints must be a list of strings")
        if kind not in ("restaurant", "outing"):
            raise ValueError("kind must be restaurant or outing")
        out = []
        for eid in entity_ids:
            c = self.state.candidates.get(eid)
            if not c:
                out.append({"entity_id": eid, "ok": False, "checks": [], "error": "unknown id"})
                continue
            v = _candidate_verdict(self.state, c)
            self.state.verdicts[eid] = v
            out.append(v)
        return {"verdicts": out}

    def run(self, name: str, args: dict) -> dict:
        fn = {"qloo_search": self.qloo_search, "qloo_recs": self.qloo_recs,
              "constraint_check": self.constraint_check}.get(name)
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            return fn(**args)
        except Exception as e:  # tool errors go back to the model, not the user
            return {"error": f"{type(e).__name__}: {e}"}


# ============================================================== plan assembly

def explain(c: dict, v: dict, state: AgentState) -> str:
    e: Entity = c["entity"]
    sig_names = [state.entities[s].name for s in c["signals"] if s in state.entities]
    matched = [t["name"] for t in e.tags if t.get("tag_id") in c["query_tags"]]
    parts = [f"Qloo affinity {e.affinity:.2f}" if e.affinity is not None else "Qloo-ranked",
             f"for audiences who like {', '.join(sig_names)}" if sig_names else "",
             f"(tag match: {', '.join(matched)})" if matched else ""]
    s = " ".join(p for p in parts if p) + "."
    if e.affinity is not None and e.affinity < 0.5:
        s += " Weak taste signal: chosen mainly because it passes the care constraints."
    if c.get("fallback"):
        s += " Widened pick: outside the stated cuisines because too few matches passed constraints."
    label = {"soft_foods": "Soft foods", "low_sodium": "Low sodium", "wheelchair": "Wheelchair"}
    checks = "; ".join(f"{label.get(ch['constraint'], ch['constraint'])}: {ch['status']} "
                       f"({ch['reason']})" for ch in v["checks"])
    if checks:
        s += f" Checks: {checks}."
    return s


def _plan_notes(state: AgentState, verdicts: dict, meal_count: int, has_outing: bool) -> list[str]:
    notes = []
    for purpose, count, target in (("restaurant", meal_count, len(MEAL_DAYS)),
                                   ("outing", int(has_outing), 1)):
        outcomes = [value for (kind, _), value in state.recommendation_outcomes.items()
                    if kind == purpose]
        incomplete = any(value is None for value in outcomes)
        if incomplete:
            article = "An" if purpose == "outing" else "A"
            notes.append(f"{article} {purpose} recommendation lookup could not be completed; "
                         "any checked suggestions are retained.")
        if count >= target:
            continue
        candidates = [eid for eid, candidate in state.candidates.items()
                      if candidate["purpose"] == purpose]
        if not incomplete and outcomes and all(value == 0 for value in outcomes) and not candidates:
            notes.append(f"A completed {purpose} recommendation lookup returned no candidates.")
        elif any(eid in verdicts and not verdicts[eid]["ok"] for eid in candidates):
            notes.append(f"Some {purpose} candidates did not pass the requested checks.")
        if purpose == "restaurant":
            noun = "suggestion" if count == 1 else "suggestions"
            notes.append(f"The plan contains {count} checked restaurant {noun}; "
                         "unfilled meal days are left open.")
        else:
            notes.append("No checked outing suggestion is available in this plan.")
    return notes


def assemble_plan(state: AgentState) -> dict:
    # Only candidates submitted for checking can enter the plan. Re-evaluate
    # those candidates at assembly so old/partial verdicts cannot admit a pick
    # after its evidence, purpose or the caregiver's requirements have changed.
    # Keep the original tool results intact for the trace and its callers.
    verdicts = {eid: _candidate_verdict(state, c)
                for eid, c in state.candidates.items() if eid in state.verdicts}

    def ranked(purpose: str) -> list[dict]:
        pool = [c for eid, c in state.candidates.items()
                if c["purpose"] == purpose and verdicts.get(eid, {}).get("ok")]
        # primary-cuisine picks first, then by Qloo affinity
        return sorted(pool, key=lambda c: (c.get("fallback", False), -(c["entity"].affinity or 0)))

    days = []
    for day, c in zip(MEAL_DAYS, ranked("restaurant")):
        e = c["entity"]
        days.append({"day": day, "kind": "restaurant", "entity_id": e.entity_id, "name": e.name,
                     "affinity": e.affinity, "fallback": c.get("fallback", False),
                     "why": explain(c, verdicts[e.entity_id], state)})
    outing = None
    outs = ranked("outing")
    if outs:
        c = outs[0]
        e = c["entity"]
        outing = {"day": OUTING_DAY, "kind": "outing", "entity_id": e.entity_id, "name": e.name,
                  "affinity": e.affinity, "why": explain(c, verdicts[e.entity_id], state)}
    rejected = [{"name": state.candidates[eid]["entity"].name, "entity_id": eid,
                 "failed": [ch for ch in v["checks"] if ch["status"] != "pass"]}
                for eid, v in verdicts.items() if not v["ok"]]
    notes = _plan_notes(state, verdicts, len(days), outing is not None)
    return {"meals": days, "outing": outing, "rejected": rejected, "notes": notes}


# ============================================================== LLM-only baseline

def llm_only_baseline(persona: dict) -> dict:
    """What an ungrounded model typically produces for the same prompt.

    In demo mode this is a fixed template (no model call), shown so judges can
    compare structure: no entity IDs, no affinity evidence, no constraint
    verification. With TASTETABLE_LLM_BASE_URL set you could swap in a live
    no-tools completion; we keep the template for reproducibility.
    """
    picks = []
    for day, cuisine in zip(MEAL_DAYS, (persona["cuisines"] * 4)):
        picks.append({"day": day, "name": f"A well-reviewed {cuisine} restaurant nearby",
                      "why": f"They enjoy {cuisine} food.",
                      "verified": {"exists": False, "entity_id": None,
                                   "constraints_checked": False}})
    era = (persona["music"] or persona["films"] or ["classic"])[0]
    outing = {"day": OUTING_DAY, "name": f"A concert or show featuring music like {era}",
              "why": "Matches their music taste.",
              "verified": {"exists": False, "entity_id": None, "constraints_checked": False}}
    return {"meals": picks, "outing": outing, "source": "template (ungrounded baseline)"}


def compare(grounded: dict, baseline: dict, constraints: list[str]) -> dict:
    g_items = grounded["meals"] + ([grounded["outing"]] if grounded["outing"] else [])
    return {
        "grounded": {"picks": len(g_items),
                     "with_qloo_entity_id": sum(1 for i in g_items if i.get("entity_id")),
                     "with_affinity_evidence": sum(1 for i in g_items if i.get("affinity") is not None),
                     "constraint_checked": len(g_items),
                     "unsafe_candidates_rejected": len(grounded["rejected"])},
        "llm_only": {"picks": len(baseline["meals"]) + 1, "with_qloo_entity_id": 0,
                     "with_affinity_evidence": 0, "constraint_checked": 0,
                     "unsafe_candidates_rejected": 0},
        "constraints": constraints,
    }


# ============================================================== loop

SYSTEM = ("You are TasteTable, a caregiver's planning assistant. Use qloo_search to resolve "
          "the senior's favourite artists, films and cuisines into Qloo IDs, qloo_recs to "
          "fetch taste-ranked places, and constraint_check before proposing anything. Never "
          "propose a venue that was not returned by Qloo or that failed a constraint. "
          "Do not send names or personal data to tools - only taste concepts.")


def run_agent(persona: dict, qloo: Optional[QlooClient] = None, model=None,
              model_name: Optional[str] = None) -> dict:
    qloo = qloo or QlooClient.from_env()
    model = model or ScriptedModel()
    model_name = model_name if model_name is not None else getattr(model, "model", "scripted-stub")
    taste_only = {k: persona[k] for k in ("cuisines", "music", "films", "constraints", "city")
                  if k in persona}  # no label/name leaves the server
    state = AgentState(persona=taste_only)
    tools = Toolbox(qloo, state)
    messages: list[dict] = [{"role": "system", "content": SYSTEM},
                            {"role": "user", "content": json.dumps(taste_only)}]
    final_text = ""
    for step in range(MAX_STEPS):
        resp = model.chat.completions.create(model=model_name, messages=messages, tools=TOOLS)
        msg = resp["choices"][0]["message"]
        messages.append(msg)
        calls = msg.get("tool_calls") or []
        if not calls:
            final_text = msg.get("content") or ""
            break
        for tc in calls:
            args = None
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except (ValueError, TypeError, RecursionError) as error:
                # Keep parser failures on the same model-visible error path as
                # tool failures. An undecoded call must never be dispatched.
                result = {"error": f"{type(error).__name__}: {error}"}
            else:
                result = tools.run(tc["function"]["name"], args)
            state.trace.append({"step": step, "tool": _trace_text(tc["function"]["name"]),
                                "args": _trace_args(args), "result_summary": _trace_text(_summ(result))})
            messages.append({"role": "tool", "tool_call_id": tc["id"],
                             "content": json.dumps(result)})
    plan = assemble_plan(state)
    baseline = llm_only_baseline(taste_only)
    return {"plan": plan, "llm_only": baseline,
            "comparison": compare(plan, baseline, taste_only["constraints"]),
            "trace": state.trace, "model_message": final_text, "mock": qloo.is_mock}


def _trace_args(args: Any) -> Any:
    """Keep diagnostic previews serializable without changing tool arguments."""
    pending = [(args, 0)]
    while pending:
        value, depth = pending.pop()
        if isinstance(value, (dict, list)):
            if depth >= MAX_TRACE_DEPTH:
                return {"trace_omitted": "argument nesting exceeds the diagnostic preview limit"}
            children = value.values() if isinstance(value, dict) else value
            pending.extend((child, depth + 1) for child in children)
    try:
        json.dumps(args, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (ValueError, TypeError, RecursionError):
        return {"trace_omitted": "arguments cannot be rendered as UTF-8 JSON"}
    return args


def _trace_text(value: str) -> str:
    return value.encode("utf-8", errors="backslashreplace").decode("utf-8")


def _summ(result: dict) -> str:
    if "error" in result:
        return result["error"]
    if "matches" in result:
        return ", ".join(m.get("name", "") for m in result["matches"]) or "no match"
    if "candidates" in result:
        return f"{len(result['candidates'])} candidates"
    if "verdicts" in result:
        return f"{sum(v['ok'] for v in result['verdicts'])}/{len(result['verdicts'])} passed"
    return "ok"


if __name__ == "__main__":
    from personas import PERSONAS
    print(json.dumps(run_agent(PERSONAS["rosa"])["plan"], indent=2))
