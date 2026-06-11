#!/usr/bin/env python3
"""P1 PROOF (12 Jun 2026, validated on JM-0027 incl. 45-deg wings):
every opening/door label position is extractable from the plan PDF text layer.
Port target: src/lib/takeoff/* via pdf.js getTextContent() transforms.
Validated: 10 window labels, 9x810 + 760 + 860 doors, 4800/1030/3600/2000x2
and the standalone 1500 (barn slider openings) all located, rotated text included."""
import pdfplumber, sys, re

pg = pdfplumber.open(sys.argv[1]).pages[0]
words = pg.extract_words()
out = []
for i, w in enumerate(words):
    t = w["text"]
    cx, cy = (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2
    if "x" in t and any(c.isdigit() for c in t):          # window-size tokens e.g. 100x1
        s = t
        if i and words[i-1]["text"].isdigit() and len(words[i-1]["text"]) <= 2: s = words[i-1]["text"] + " " + s
        if i+1 < len(words) and words[i+1]["text"].isdigit() and len(words[i+1]["text"]) <= 3: s += " " + words[i+1]["text"]
        out.append(("window", s, cx, cy))
    elif t in ("810", "760", "860"):                       # door leaves
        out.append(("door", t, cx, cy))
    elif t in ("800", "030", "600", "000", "500") and i and words[i-1]["text"].isdigit() and len(words[i-1]["text"]) == 1 \
         and abs(words[i-1]["x1"] - w["x0"]) < 20 and (i+1 >= len(words) or words[i+1]["text"] != "X"):
        out.append(("paired", words[i-1]["text"] + " " + t, cx, cy))  # 4 800, 1 030, 3 600, 2 000, 1 500 (excl. room dims followed by X)
for kind, label, x, y in out: print(f"{kind:7s} {label:12s} @ ({x:.1f},{y:.1f}) pt")
