"""Taste65 frozen PDF separator receiver; supplements unchanged field accounting.
No report generation, browser launch, printing or rasterization.
Only future corrected ORIGINAL PDF bytes may be decoded by extract_lines().
"""
import math

CASES = (
    {"pdf": 0, "field": "original-record pick-1 note", "markers": ("A", "B", "C"),
     "separators": ("CR", "CRLF")},
    {"pdf": 1, "field": "literal-notes pick-0 explanation",
     "markers": ("WHY_BEGIN", "CR_ONLY", "CRLF_PAIR", "LF_LINE"),
     "separators": ("CR", "CRLF", "LF")},
    {"pdf": 1, "field": "literal-notes pick-1 note",
     "markers": ("NOTE2_BEGIN", "CR", "CRLF", "LF"),
     "separators": ("CR", "CRLF", "LF")},
)

def _matches(text, marker):
    # ASCII edge whitespace only; no Unicode normalization or internal rewrite.
    text = text.lstrip(" \t\r\n")
    return text == marker or (
        text.startswith(marker) and len(text) > len(marker)
        and text[len(marker)] in " \t\r\n"
    )

def check_case(lines, case):
    selected = []
    for marker in case["markers"]:
        hits = [line for line in lines if _matches(line["text"], marker)]
        if len(hits) != 1:
            raise ValueError(f'{case["field"]}: expected one separate line for {marker!r}, got {len(hits)}')
        selected.append(hits[0])
    # These are short frozen fields. If a future print splits a field over pages,
    # this gate stays pending independent boundary inspection; it does not infer
    # single line spacing from unrelated page coordinates.
    if len({line["page"] for line in selected}) != 1:
        raise ValueError(f'{case["field"]}: cross-page marker sequence needs explicit inspection')
    for line in selected:
        if not math.isfinite(line["baseline"]) or not math.isfinite(line["fontSize"]) or line["fontSize"] <= 0:
            raise ValueError(f'{case["field"]}: nonfinite/invalid source geometry')
    if [line["order"] for line in selected] != sorted({line["order"] for line in selected}):
        raise ValueError(f'{case["field"]}: marker order differs')
    steps = [b["baseline"] - a["baseline"] for a, b in zip(selected, selected[1:])]
    # The final authored transition is CRLF in the short A/B/C case and LF in
    # both stress cases. It calibrates spacing, independently of first CR.
    reference = steps[-1]
    min_size = min(line["fontSize"] for line in selected)
    max_size = max(line["fontSize"] for line in selected)
    if not (0.75 * min_size <= reference <= 3.0 * max_size):
        raise ValueError(f'{case["field"]}: implausible positive line advance {reference}')
    tolerance = max(0.25, abs(reference) * 0.01)
    if any(not math.isfinite(step) or step <= 0 or abs(step - reference) > tolerance for step in steps):
        raise ValueError(f'{case["field"]}: CR/CRLF/LF do not each make one equal positive line advance')
    return {"field": case["field"], "markers": list(case["markers"]),
            "separators": list(case["separators"]), "page": selected[0]["page"],
            "stepsPt": steps, "referencePt": reference, "tolerancePt": tolerance,
            "selectedLines": selected}

def extract_lines(pdf_bytes):
    """Use original PDF text-line origins, not bounding-box tops or whitespace-erased text."""
    import fitz
    out = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        for page_index, page in enumerate(document):
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block["lines"]:
                    spans = line["spans"]
                    if not spans:
                        continue
                    text = "".join(span["text"] for span in spans)
                    # Our ASCII markers start the selected line; source span
                    # origin gives its true baseline regardless of emoji ascent.
                    first = next((s for s in spans if s["text"].lstrip(" \t\r\n")), spans[0])
                    out.append({"page": page_index + 1, "order": len(out),
                                "text": text, "baseline": first["origin"][1],
                                "fontSize": first["size"]})
    return out

def receive(original_pdf_bytes):
    if len(original_pdf_bytes) != 3 or any(not isinstance(x, bytes) for x in original_pdf_bytes):
        raise ValueError("Require the three admitted original PDF byte strings in frozen fixture order")
    lines = [extract_lines(raw) for raw in original_pdf_bytes]
    return [check_case(lines[case["pdf"]], case) for case in CASES]
