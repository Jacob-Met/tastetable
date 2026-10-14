"""Start the maintained application with fixture providers on loopback."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
from collections.abc import Mapping


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OMITTED_NAMES = frozenset({
    "QLOO_API_KEY", "QLOO_BASE_URL", "TASTETABLE_LIVE",
    "TASTETABLE_LLM_BASE_URL", "TASTETABLE_LLM_MODEL",
    "TASTETABLE_LLM_API_KEY", "WEB_CONCURRENCY",
})


def fixture_environment(environ: Mapping[str, str]) -> dict[str, str]:
    """Copy permitted entries without looking up excluded provider values."""
    return {
        name: environ[name]
        for name in environ
        if name.upper() not in OMITTED_NAMES
        and not name.upper().startswith("UVICORN_")
    }


def _port(value: str) -> int:
    if not re.fullmatch(r"[0-9]+", value) or not 1 <= int(value) <= 65535:
        raise argparse.ArgumentTypeError("port must be an integer from 1 through 65535")
    return int(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the existing TasteTable app on loopback with fictional "
                    "fixtures and the scripted model. No browser is opened.",
        allow_abbrev=False,
    )
    parser.add_argument("--port", type=_port, default=8000,
                        help="loopback port, 1 through 65535 (default: 8000)")
    args = parser.parse_args(argv)
    command = [
        sys.executable, "-B", "-m", "uvicorn", "app:app",
        "--app-dir", str(PROJECT_ROOT),
        "--host", "127.0.0.1", "--port", str(args.port), "--workers", "1",
    ]
    try:
        return subprocess.call(
            command, cwd=PROJECT_ROOT, env=fixture_environment(os.environ),
        )
    except KeyboardInterrupt:
        return 130
    except OSError as error:
        try:
            print(f"fixture demo could not start: {str(error)[:240]}", file=sys.stderr)
        except OSError:
            pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
