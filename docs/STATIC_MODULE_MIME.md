# JavaScript module responses

TasteTable's `/static` mount serves admitted `.mjs` files as
`text/javascript; charset=utf-8`, independently of the host's filename MIME
mapping. This lets a browser load the existing ES module graph on Windows
machines whose `.mjs` registration says `text/plain`.

The application uses `ModuleStaticFiles` from `static_modules.py`. It delegates
file lookup, containment, status selection and file transfer to Starlette, then
sets the JavaScript media type on successful module-file responses. Module
HEAD and conditional 304 responses carry that type too. Single-range responses
retain JavaScript typing; multipart responses retain the installed Starlette
framing with JavaScript types on the individual parts. No source bytes,
ETag, last-modified value, range or cache decision are changed.

Range support and multipart framing remain the installed dependency's behavior;
this change does not repair or extend them. The received Starlette 0.52.1
multipart response places its boundary in `Content-Range` and retains a
one-byte declared-length discrepancy observed in the original response too.
Ordinary complete module requests do not use that multipart path.

Ordinary `.js`, CSS, HTML and non-file/error responses retain the installed
framework's behavior. The change does not modify global `mimetypes` tables,
Windows registrations, environment variables, package versions, providers,
stored weeks or browser modules. Existing installations need their usual
dependencies from `requirements.txt`; no extra package is added.

For the existing fictional application, run from a complete checkout:

```sh
python -B tools/serve_fixture_demo.py --port 8017
```

Open `http://127.0.0.1:8017` after startup. The explicit fixture launcher and
its provider-environment policy are unchanged. This MIME repair is a module
bootstrap correction, not a claim that every application workflow has been
qualified on every platform.

Focused response regression, with the existing FastAPI/Starlette/httpx
dependencies installed:

```sh
python -B -m unittest discover -s tests -p test_static_module_mime.py -v
```

The regression uses an owned temporary static directory and a test-local MIME
stub; it changes no system registration. It covers exact module bytes, HEAD,
conditional requests, range behavior, ordinary asset parity and missing-file
refusal through the inherited static handler.
