"""Exact response checks for the application-local ES module MIME repair."""
import mimetypes
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles
from starlette.testclient import TestClient

from static_modules import ModuleStaticFiles


class ModuleMimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="taste-module-mime-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.body = b'export const note = "literal <tag> and caf\xc3\xa9";\r\n'
        self.assets = {
            "module.mjs": self.body,
            "upper.MJS": self.body,
            "script.js": b"window.fixture = true;\n",
            "style.css": b"body { color: black; }\n",
            "page.html": b"<!doctype html><p>literal</p>\n",
        }
        for name, body in self.assets.items():
            (self.root / name).write_bytes(body)
        # Model the observed Windows mapping inside this test process only.
        ordinary_guess = mimetypes.guess_type

        def guess(path):
            if str(path).lower().endswith(".mjs"):
                return "text/plain", None
            return ordinary_guess(path)

        self.addCleanup(patch.stopall)
        patch("starlette.responses.guess_type", side_effect=guess).start()
        self.original = TestClient(Starlette(routes=[Mount("/static", StaticFiles(directory=self.root))]))
        self.corrected = TestClient(Starlette(routes=[Mount("/static", ModuleStaticFiles(directory=self.root))]))
        self.addCleanup(self.original.close)
        self.addCleanup(self.corrected.close)

    def test_module_get_exact_bytes_and_local_mapping(self):
        for name in ("module.mjs", "upper.MJS"):
            with self.subTest(name=name):
                old = self.original.get("/static/" + name)
                new = self.corrected.get("/static/" + name)
                self.assertEqual(old.headers["content-type"], "text/plain; charset=utf-8")
                self.assertEqual(new.status_code, 200)
                self.assertEqual(new.content, self.body)
                self.assertEqual(new.headers["content-type"], "text/javascript; charset=utf-8")
                for key in ("content-length", "etag", "last-modified", "accept-ranges"):
                    self.assertEqual(new.headers[key], old.headers[key])
        self.assertEqual((self.root / "module.mjs").read_bytes(), self.body)

    def test_head_keeps_metadata_without_body(self):
        get = self.corrected.get("/static/module.mjs")
        head = self.corrected.head("/static/module.mjs")
        self.assertEqual(head.status_code, 200)
        self.assertEqual(head.content, b"")
        self.assertEqual(dict(head.headers), dict(get.headers))

    def test_conditional_requests_keep_304_and_validators(self):
        first = self.corrected.get("/static/module.mjs")
        for key, header in (("etag", "if-none-match"), ("last-modified", "if-modified-since")):
            with self.subTest(header=header):
                headers = {header: first.headers[key]}
                old = self.original.get("/static/module.mjs", headers=headers)
                new = self.corrected.get("/static/module.mjs", headers=headers)
                self.assertEqual((old.status_code, new.status_code), (304, 304))
                self.assertEqual(new.content, b"")
                self.assertEqual(new.headers["etag"], first.headers["etag"])
                self.assertEqual(new.headers["content-type"], "text/javascript; charset=utf-8")

    def test_single_range_exact_slice(self):
        headers = {"range": "bytes=7-18"}
        old = self.original.get("/static/module.mjs", headers=headers)
        new = self.corrected.get("/static/module.mjs", headers=headers)
        self.assertEqual((old.status_code, new.status_code), (206, 206))
        self.assertEqual(new.content, self.body[7:19])
        self.assertEqual(new.content, old.content)
        self.assertEqual(new.headers["content-range"], old.headers["content-range"])
        self.assertEqual(new.headers["content-type"], "text/javascript; charset=utf-8")

    def test_multipart_ranges_keep_javascript_part_types(self):
        # Compare the installed framework's framing, not an assumed header layout.
        with patch("starlette.responses.token_hex", return_value="owned-fixed-boundary"):
            old = self.original.get("/static/module.mjs", headers={"range": "bytes=0-5,15-20"})
            new = self.corrected.get("/static/module.mjs", headers={"range": "bytes=0-5,15-20"})
        self.assertEqual((old.status_code, new.status_code), (206, 206))
        self.assertEqual(new.content, old.content.replace(
            b"Content-Type: text/plain; charset=utf-8", b"Content-Type: text/javascript; charset=utf-8"))
        self.assertEqual(new.content.count(b"Content-Type: text/javascript; charset=utf-8\n"), 2)
        self.assertEqual(int(new.headers["content-length"]) - int(old.headers["content-length"]),
                         len(new.content) - len(old.content))
        for key in set(old.headers) - {"content-type", "content-length"}:
            self.assertEqual(new.headers[key], old.headers[key])
        self.assertIn(b"Content-Range: bytes 0-5/" + str(len(self.body)).encode(), new.content)
        self.assertIn(b"Content-Range: bytes 15-20/" + str(len(self.body)).encode(), new.content)
        self.assertIn(self.body[0:6], new.content)
        self.assertIn(self.body[15:21], new.content)
        self.assertNotIn(b"Content-Type: text/plain", new.content)

    def test_invalid_range_uses_inherited_refusal(self):
        for value in ("bytes=9999-", "bytes=invalid"):
            with self.subTest(value=value):
                old = self.original.get("/static/module.mjs", headers={"range": value})
                new = self.corrected.get("/static/module.mjs", headers={"range": value})
                self.assertEqual((new.status_code, new.content, dict(new.headers)),
                                 (old.status_code, old.content, dict(old.headers)))
                self.assertGreaterEqual(new.status_code, 400)

    def test_ordinary_assets_and_missing_files_are_identical(self):
        for name in ("script.js", "style.css", "page.html", "missing.mjs"):
            with self.subTest(name=name):
                old = self.original.get("/static/" + name)
                new = self.corrected.get("/static/" + name)
                self.assertEqual((new.status_code, new.content, dict(new.headers)),
                                 (old.status_code, old.content, dict(old.headers)))
        self.assertEqual(self.corrected.get("/static/missing.mjs").status_code, 404)

    def test_actual_application_mount_and_bytes(self):
        from app import app

        source = Path(__file__).resolve().parents[1] / "static" / "saved_week_ui.mjs"
        with TestClient(app) as client:
            response = client.get("/static/saved_week_ui.mjs")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, source.read_bytes())
            self.assertEqual(response.headers["content-type"], "text/javascript; charset=utf-8")


if __name__ == "__main__":
    unittest.main()
