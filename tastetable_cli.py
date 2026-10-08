"""Run the existing TasteTable planner locally with explicit fixture inputs."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from agent import ScriptedModel, run_agent
from constraints import SUPPORTED
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient

MAX_PROFILE_BYTES = 64 * 1024
MAX_TASTES = 5
MAX_TEXT_CHARS = 60
PROFILE_KEYS = {"cuisines", "music", "films", "constraints", "city"}


class InputError(ValueError):
    """The invocation or authored profile cannot be admitted."""


class _ParserExit(Exception):
    def __init__(self, status: int):
        self.status = status


def _write(fd: int, text: str) -> None:
    """Write without buffered shutdown retries after a broken pipe."""
    data = memoryview(text.encode("utf-8", errors="backslashreplace"))
    while data:
        count = os.write(fd, data)
        if count == 0:
            raise OSError("output accepted no bytes")
        data = data[count:]


def _diagnostic(message: str) -> None:
    try:
        _write(2, f"tastetable: {message}\n")
    except OSError:
        pass


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)

    def exit(self, status: int = 0, message: str | None = None) -> None:
        if message:
            _write(2, message)
        raise _ParserExit(status)

    def _print_message(self, message: str, file=None) -> None:
        if message:
            _write(1 if file is sys.stdout else 2, message)


def _arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = _Parser(
        description="Plan locally with fictional fixtures and the scripted policy; "
                    "no live provider or application server is used.",
        allow_abbrev=False,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--persona", choices=sorted(PERSONAS),
                        help="use an existing fictional taste profile")
    source.add_argument("--profile", metavar="FILE",
                        help="read authored profile JSON (use - for stdin; at most 64 KiB)")
    return parser.parse_args(argv)


def _text(value, field: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise InputError(f"{field} must be a string")
    value = value.strip()
    if not allow_empty and not value:
        raise InputError(f"{field} must not be blank")
    if len(value) > MAX_TEXT_CHARS:
        raise InputError(f"{field} exceeds {MAX_TEXT_CHARS} characters")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise InputError(f"{field} must contain valid Unicode text") from None
    return value


def validate_profile(value) -> dict:
    """Admit the documented local profile shape without changing planner rules."""
    if not isinstance(value, dict):
        raise InputError("profile must be a JSON object")
    unknown = value.keys() - PROFILE_KEYS
    if unknown:
        raise InputError("unknown profile fields: " + ", ".join(sorted(unknown)))
    profile = {}
    for field in ("cuisines", "music", "films"):
        items = value.get(field, [])
        if not isinstance(items, list) or len(items) > MAX_TASTES:
            raise InputError(f"{field} must be a list of at most {MAX_TASTES} strings")
        profile[field] = [_text(item, field) for item in items]
    if not any(profile.values()):
        raise InputError("provide at least one cuisine, music artist or film")

    constraints = value.get("constraints", [])
    if not isinstance(constraints, list) or len(constraints) > len(SUPPORTED):
        raise InputError("constraints must be a list of at most three supported names")
    if any(not isinstance(item, str) or item not in SUPPORTED for item in constraints):
        raise InputError("constraints must contain only: " + ", ".join(sorted(SUPPORTED)))
    if len(set(constraints)) != len(constraints):
        raise InputError("constraints must not repeat a name")
    profile["constraints"] = list(constraints)
    city = value.get("city", "Pasadena")
    profile["city"] = "" if city is None else _text(city, "city", allow_empty=True)
    return profile


def _object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise InputError(f"duplicate JSON field: {key}")
        result[key] = value
    return result


def _constant(value: str):
    raise InputError(f"non-finite JSON constant is not allowed: {value}")


def load_profile(filename: str) -> dict:
    try:
        if filename == "-":
            raw = sys.stdin.buffer.read(MAX_PROFILE_BYTES + 1)
        else:
            with Path(filename).open("rb") as stream:
                raw = stream.read(MAX_PROFILE_BYTES + 1)
    except OSError as exc:
        raise InputError(f"cannot read profile: {exc}") from None
    if len(raw) > MAX_PROFILE_BYTES:
        raise InputError(f"profile exceeds {MAX_PROFILE_BYTES} bytes")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object,
                           parse_constant=_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise InputError(f"invalid profile JSON: {exc}") from None
    return validate_profile(value)


def main(argv: list[str] | None = None) -> int:
    try:
        args = _arguments(argv)
        if args.persona:
            original = PERSONAS[args.persona]
            profile = validate_profile({key: original[key] for key in PROFILE_KEYS
                                        if key in original})
        else:
            profile = load_profile(args.profile)
    except _ParserExit as exc:
        return exc.status
    except InputError as exc:
        _diagnostic(str(exc))
        return 2
    except OSError as exc:
        _diagnostic(f"cannot write help: {exc}")
        return 1

    try:
        response = run_agent(
            profile,
            qloo=QlooClient(api_key="MOCK-NOT-A-KEY", transport=FixtureTransport()),
            model=ScriptedModel(),
        )
        result = {
            "provenance": {
                "mode": "offline-fixtures",
                "policy": "ScriptedModel",
                "transport": "FixtureTransport",
                "data": "fictional venues and hand-set affinities",
                "checks": "existing heuristics; no live provider validation",
            },
            "profile": profile,
            "response": response,
        }
        output = json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2) + "\n"
    except Exception as exc:
        _diagnostic(f"planning failed: {type(exc).__name__}: {exc}")
        return 1
    try:
        _write(1, output)
    except OSError as exc:
        _diagnostic(f"cannot write result: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
