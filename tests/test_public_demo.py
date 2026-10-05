import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def test_static_demo_has_relative_assets_and_fixture_data():
    page = (DOCS / "index.html").read_text(encoding="utf-8")
    script = (DOCS / "demo.js").read_text(encoding="utf-8")
    style = (DOCS / "style.css").read_text(encoding="utf-8")
    fixtures = json.loads((DOCS / "fixtures.json").read_text(encoding="utf-8"))

    assert 'href="./style.css"' in page
    assert 'href="./favicon.svg"' in page
    assert 'src="./demo.js"' in page
    assert "Offline preview" in page
    assert "Qloo or LLM API calls" in page
    assert "SYNTHETIC" in fixtures["_note"]
    assert fixtures["places"]
    assert all(place["entity_id"].startswith("FIX-") for place in fixtures["places"])
    assert ":root" in style
    assert "function runDemo()" in script


def test_demo_network_access_is_limited_to_its_local_fixture():
    script = (DOCS / "demo.js").read_text(encoding="utf-8")
    page = (DOCS / "index.html").read_text(encoding="utf-8")

    assert script.count("fetch(") == 1
    assert 'fetch("./fixtures.json"' in script
    assert "hackathon.api.qloo.com" not in script
    assert "api.openai.com" not in script
    assert "localStorage" not in script and "sessionStorage" not in script
    assert 'href="./style.css"' in page and 'src="./demo.js"' in page
    assert 'src="https://' not in page and 'href="https://' not in page.split("<body>", 1)[0]
