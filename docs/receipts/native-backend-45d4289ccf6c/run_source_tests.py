"""Execute the repository's real pytest entrypoint with no provider environment."""
from __future__ import annotations

import os
from pathlib import Path
import sys
from unittest.mock import patch

root = Path(sys.argv[1]).resolve()
for key in (
    "QLOO_API_KEY", "QLOO_BASE_URL", "TASTETABLE_LIVE",
    "TASTETABLE_LLM_BASE_URL", "TASTETABLE_LLM_MODEL", "TASTETABLE_LLM_API_KEY",
    "TASTETABLE_SOURCE_ROOT",
):
    os.environ.pop(key, None)
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True
sys.path.insert(0, str(root))
os.chdir(root)
import pytest

with patch("urllib.request.urlopen", side_effect=AssertionError("external request forbidden in receiving")):
    raise SystemExit(pytest.main(["-q", "-p", "no:cacheprovider", *sys.argv[2:]]))
