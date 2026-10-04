"""TasteTable web app (FastAPI). Run: uvicorn app:app --port 8000

The browser only talks to this backend; the Qloo key (if any) stays server-side,
as required by the hackathon kit (starter/cli-workflow "Next steps").
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agent import model_from_env, run_agent
from constraints import SUPPORTED
from personas import PERSONAS
from qloo_client import QlooClient

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="TasteTable", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def _clean(items: list[str], limit: int = 5) -> list[str]:
    return [s.strip()[:60] for s in items if s and s.strip()][:limit]


class PlanRequest(BaseModel):
    cuisines: list[str] = Field(default_factory=list)
    music: list[str] = Field(default_factory=list)
    films: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    city: Optional[str] = "Pasadena"


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "qloo_mode": "mock" if QlooClient.from_env().is_mock else "live"}


@app.get("/api/personas")
def personas():
    return list(PERSONAS.values())


@app.post("/api/plan")
def plan(req: PlanRequest):
    bad = [c for c in req.constraints if c not in SUPPORTED]
    if bad:
        raise HTTPException(400, f"unsupported constraints: {bad}")
    persona = {"cuisines": _clean(req.cuisines), "music": _clean(req.music),
               "films": _clean(req.films), "constraints": req.constraints,
               "city": (req.city or "")[:60]}
    if not (persona["cuisines"] or persona["music"] or persona["films"]):
        raise HTTPException(400, "enter at least one cuisine, artist or film")
    return run_agent(persona, qloo=QlooClient.from_env(), model=model_from_env())


@app.post("/api/plan/sample/{pid}")
def plan_sample(pid: str):
    if pid not in PERSONAS:
        raise HTTPException(404, "unknown persona")
    return run_agent(PERSONAS[pid], qloo=QlooClient.from_env(), model=model_from_env())
