"""Narrow installed-pypdf origin collector for the frozen Taste65 predicate.
Feeds check_case unchanged. Refuses ambiguous multi-line visitor callbacks,
rotated/reflected/skewed text or non-unit/rotated/cropped pages for selected markers.
Original PDF bytes only; no browser, report generation or rasterization.
"""
from __future__ import annotations
import io, math, re
from pypdf import PdfReader

MARKERS=("A","B","C","WHY_BEGIN","CR_ONLY","CRLF_PAIR","LF_LINE","NOTE2_BEGIN","CR","CRLF","LF")

def starts_marker(text):
    t=text.lstrip(" \t\r\n")
    return any(t==m or (t.startswith(m) and len(t)>len(m) and t[len(m)] in " \t\r\n") for m in MARKERS)

def combined(tm,cm):
    a,b,c,d,e,f=map(float,tm)
    A,B,C,D,E,F=map(float,cm)
    return [a*A+b*C,a*B+b*D,c*A+d*C,c*B+d*D,e*A+f*C+E,e*B+f*D+F]

def collect(pdf_bytes):
    reader=PdfReader(io.BytesIO(pdf_bytes),strict=True)
    if reader.is_encrypted:raise ValueError("Encrypted PDF outside admitted collector")
    lines=[];records=[];page_text=[]
    for page_no,page in enumerate(reader.pages,1):
        media=[float(x) for x in page.mediabox]
        crop=[float(x) for x in page.cropbox]
        if int(page.get("/Rotate",0))%360 or float(page.get("/UserUnit",1))!=1 or media[:2]!=[0.0,0.0] or crop!=media:
            raise ValueError("Rotated/non-unit/cropped page outside admitted collector")
        height=media[3]
        def visitor(text,cm,tm,font,font_size):
            clean=text.strip("\r\n")
            if not clean.strip(" \t"):return
            m=combined(tm,cm)
            row={"page":page_no,"order":len(records),"text":clean,
                 "rawVisitorText":text,"cm":list(map(float,cm)),"tm":list(map(float,tm)),
                 "combined":m,"fontBase":str(font.get("/BaseFont")) if font else None,
                 "rawFontSize":float(font_size)}
            records.append(row)
            # A callback's memo origin applies to the beginning of its text;
            # no later-line coordinate is invented when it aggregates lines.
            if "\r" in clean or "\n" in clean:
                if any(starts_marker(x) for x in re.split(r"[\r\n]+",clean)):
                    raise ValueError("Selected visitor callback aggregates multiple lines")
                return
            if not starts_marker(clean):return
            if font is None or not all(math.isfinite(x) for x in m+[float(font_size)]):
                raise ValueError("Unresolved font or nonfinite selected origin")
            if abs(m[1])>1e-8 or abs(m[2])>1e-8 or m[0]<=0 or m[3]<=0:
                raise ValueError("Non-upright selected text outside admitted collector")
            # PDF coordinates increase upward; the frozen predicate uses
            # top-down physical page points. Tf size is converted to points.
            line={"page":page_no,"order":row["order"],"text":clean,
                  "baseline":height-m[5],"fontSize":float(font_size)*abs(m[3])}
            if not math.isfinite(line["fontSize"]) or line["fontSize"]<=0:
                raise ValueError("Invalid selected physical font size")
            lines.append(line)
        page_text.append(page.extract_text(visitor_text=visitor))
    return {"lines":lines,"visitorRecords":records,"pageText":page_text,
            "pageCount":len(reader.pages),
            "scope":"Real pypdf visitor memo text origin composed tm then cm; no bbox or inferred line advance."}
