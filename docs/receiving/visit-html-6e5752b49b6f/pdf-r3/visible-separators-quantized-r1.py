"""Taste65 receiving-only PDF baseline quantization successor.
Frozen original predicate remains 2b60e392; no source/PDF/text-accounting edit.
Applies only to the admitted 16 CSS px report text, line-height 1.55,
and observed integer PDF Tm grid at 72/96 physical pt per CSS pixel.
"""
import math

def _matches(text, marker):
    text=text.lstrip(" \t\r\n")
    return text==marker or (text.startswith(marker) and len(text)>len(marker) and text[len(marker)] in " \t\r\n")

def check_case(data,case):
    selected=[];records=[]
    for marker in case["markers"]:
        hits=[line for line in data["lines"] if _matches(line["text"],marker)]
        if len(hits)!=1:raise ValueError("Require unique separate marker "+marker)
        line=hits[0]
        matches=[row for row in data["visitorRecords"] if row["order"]==line["order"] and row["page"]==line["page"]]
        if len(matches)!=1:raise ValueError("Unbound original visitor")
        row=matches[0]
        # Resolves the reviewed R0 strip-boundary ambiguity for this intake.
        if row["rawVisitorText"]!=line["text"] or any(c in row["rawVisitorText"] for c in "\r\n"):
            raise ValueError("Selected callback contains stripped or multiple line boundaries")
        vals=[line["baseline"],line["fontSize"],row["rawFontSize"]]+row["combined"]+row["cm"]+row["tm"]
        if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in vals):
            raise ValueError("Nonfinite original geometry")
        if row["tm"][5]!=round(row["tm"][5]):raise ValueError("Unqualified noninteger PDF text grid")
        if abs(row["combined"][1])>1e-8 or abs(row["combined"][2])>1e-8 or abs(row["combined"][3]-0.75)>1e-6:
            raise ValueError("Unqualified report text transform")
        if abs(row["rawFontSize"]-16)>1e-6 or abs(line["fontSize"]-12)>1e-5 or abs(line["fontSize"]-row["rawFontSize"]*row["combined"][3])>1e-8:
            raise ValueError("Unqualified report font")
        selected.append(line);records.append(row)
    if len({line["page"] for line in selected})!=1:raise ValueError("Cross-page sequence needs explicit inspection")
    orders=[line["order"] for line in selected]
    if orders!=sorted(set(orders)):raise ValueError("Marker order differs")
    font=selected[0]["fontSize"];q=records[0]["combined"][3]
    if any(abs(line["fontSize"]-font)>1e-8 for line in selected) or any(abs(row["combined"][3]-q)>1e-8 for row in records):
        raise ValueError("Mixed source pitch or grid")
    pitch=1.55*font
    y0=selected[0]["baseline"]
    residuals=[line["baseline"]-y0-i*pitch for i,line in enumerate(selected)]
    steps=[b["baseline"]-a["baseline"] for a,b in zip(selected,selected[1:])]
    epsilon=1e-5
    if any(step<=0 for step in steps):raise ValueError("Collapsed/reversed separator")
    if max(residuals)-min(residuals)>q+epsilon:
        raise ValueError("Baselines cannot share one quantization phase at the fixed source pitch")
    return {"field":case["field"],"page":selected[0]["page"],"markers":list(case["markers"]),
            "stepsPt":steps,"sourcePitchPt":pitch,"quantumPt":q,"residualsPt":residuals,
            "residualRangePt":max(residuals)-min(residuals),"numericEpsilonPt":epsilon,
            "selectedLines":selected}
