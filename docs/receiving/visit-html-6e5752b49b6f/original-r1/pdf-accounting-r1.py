"""Independent original-PDF field accounting; no product, HTML generator or print execution."""
import re,collections
def compact_ascii(value):
    return re.sub(r"[ \t\r\n\f\v]+","",value)
def expected_fields(fixture):
    values=[("record filename",fixture["filename"]),("record SHA",fixture["inputSha256"]),("source filename",fixture["sourceName"]),("week start",fixture["weekStart"]),("source receivedAt",fixture["sourceReceivedAt"]),("source savedAt",fixture["sourceSavedAt"]),("record savedAt",fixture["recordSavedAt"])]
    for row in fixture["occurrences"]:
        p=row["key"]+": "
        values += [(p+"name",row["venueName"]),(p+"entity ID",row["entityId"]),(p+"kind",row["kind"]),(p+"original day",row["originalDay"]),(p+"outcome code",row["outcome"]),(p+"outcome label",row["outcomeLabel"]),(p+"explanation",row["explanation"])]
        if row["plannedDay"] is not None: values += [(p+"planned day",row["plannedDay"]),(p+"planned date",row["plannedDate"])]
        if row["actualDate"] is not None: values.append((p+"actual date",row["actualDate"]))
        values.append((p+"note",row["note"] if row["note"] else "No note recorded"))
    return values
def account(pages,fixture):
    assert pages and all(isinstance(t,str) for t in pages)
    text="\n".join(pages);compact=compact_ascii(text);violations=[]
    actual_keys=re.findall(r"\bpick-[0-9]+\b",text)
    expected_keys=[r["key"] for r in fixture["occurrences"]]
    if actual_keys!=expected_keys:violations.append({"kind":"occurrence order/count","expected":expected_keys,"actual":actual_keys})
    for label,value in expected_fields(fixture):
        if compact_ascii(value) not in compact:violations.append({"kind":"missing field","field":label,"expected":value})
    repeated=collections.Counter(compact_ascii(r["entityId"]) for r in fixture["occurrences"])
    for entity,count in repeated.items():
        if compact.count(entity)<count:violations.append({"kind":"missing repeated entity occurrence","expectedCount":count,"actualCount":compact.count(entity),"entity":entity})
    if not re.search(r"\b"+re.escape(fixture["sourceMode"])+r"\b",text,re.I):violations.append({"kind":"missing saved source-mode label","expected":fixture["sourceMode"]})
    if any(r["keptOffWeek"] for r in fixture["occurrences"]):
        if not re.search(r"kept[\s-]+off[\s-]+(?:this[\s-]+)?week",text,re.I):violations.append({"kind":"missing explicit kept-off-week label"})
    if fixture["filename"]=="literal-notes-世界.json":
        for n in range(1,109):
            marker=f"N{n:03d}"
            count=len(re.findall(r"\b"+marker+r"\b",text))
            if count!=1:violations.append({"kind":"long-note marker count","marker":marker,"actual":count,"expected":1})
        if "UNBROKEN_"+"V"*600+"_END" not in compact:violations.append({"kind":"600-character note run incomplete"})
        if "Unbroken_"+"W"*280+"_NAME_END" not in compact:violations.append({"kind":"280-character venue run incomplete"})
    return {"passed":not violations,"violations":violations,"actualOccurrenceKeys":actual_keys,"requiredFieldCount":len(expected_fields(fixture)),"textCharacters":len(text),"whitespacePolicy":"ASCII whitespace only is compacted for text accounting. No Unicode normalization; exact DOM CR/TAB/space identity is not inferred. Visual page inspection remains mandatory."}
def synthetic_fixture_text(fixture):
    text=[fixture["sourceMode"]]+[v for _,v in expected_fields(fixture) if _ in ("record filename","record SHA","source filename","week start","source receivedAt","source savedAt","record savedAt")]
    # Reconstruct contract-shaped text only for accounting sensitivity tests, never a fake PDF/product pass.
    for row in fixture["occurrences"]:
        text.append(row["key"])
        text += [v for label,v in expected_fields(fixture) if label.startswith(row["key"]+": ")]
        if row["keptOffWeek"]:text.append("Kept off week")
        if row["actualDate"] is None:text.append("Not recorded")
    return "\n".join(text)
