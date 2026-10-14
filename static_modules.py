"""Application-local MIME for ES modules, using Starlette's file handling."""
from pathlib import Path

from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles


class ModuleStaticFiles(StaticFiles):
    """Serve admitted .mjs files as JavaScript without changing host MIME tables."""

    def file_response(self, full_path, stat_result, scope, status_code=200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        if Path(full_path).suffix.lower() == ".mjs":
            response.headers["content-type"] = "text/javascript; charset=utf-8"
            if isinstance(response, FileResponse):
                # Keep response metadata consistent with the emitted header.
                response.media_type = "text/javascript"
        return response
