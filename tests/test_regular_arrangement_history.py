"""Run the regular planner's native JavaScript consumer controls."""
from pathlib import Path
import os
import shutil
import subprocess

import pytest


def test_regular_arrangement_history():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required for the JavaScript consumer controls")
    root = Path(__file__).resolve().parents[1]
    env = dict(os.environ, TASTETABLE_UNDO_ROOT=str(root))
    result = subprocess.run(
        [node, "--experimental-vm-modules", "--test",
         str(root / "tests/test_regular_arrangement_consumer.mjs")],
        env=env, capture_output=True, text=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
