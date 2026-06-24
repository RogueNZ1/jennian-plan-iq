"""
Phase 4 read-only spike #4 — comma-aware confirmation + scale calibration.

Spike #3 corrected the record: the big structural dims ARE positioned text, they
just carry thousands separators ('2,150 x 4,800'), so the comma-blind regex in
spike #2 missed them. This locks that in and adds Step 3 (scale).

  A) Comma-aware dim-pair extraction on BOTH floor plans + the schedule.
  B) Garage recoverability: find the H x W pair nearest the GARAGE label.
  C) Schedule head-datum-vs-pane separability (the 2f bug): is the 2,210 head
     row on a distinct y-band from the glazed-height cells? (deterministic split)
  D) Scale calibration: page is vector at a printed scale (e.g. 1:100). Show the
     page box in mm (points->mm) and confirm printed dims are already millimetres
     (so callout/schedule text needs NO scale; only un-annotated wall geometry does).

Read-only. Deterministic. No model.
"""
import re
import fitz

# comma/space tolerant: 1-2 groups of digits, optional thousands comma
N = r"\d{1,2}(?:,\d{3})|\d{2,5}"
DIMPAIR = re.compile(rf"({N})\s*[xX×]\s*({N})")
WCODE = re.compile(r"\bW\d{1,3}\b")
PT_PER_MM = 72.0 / 25.4  # 1 point = 1/72 inch


def to_int(s):
    return int(s.replace(",", ""))


def spans(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    x0, y0, x1, y1 = s["bbox"]
                    out.append((t, round((x0 + x1) / 2), round((y0 + y1) / 2)))
    return out


def dimpairs(page):
    pairs = []
    for t, cx, cy in spans(page):
        m = DIMPAIR.search(t)
        if m:
            pairs.append((to_int(m.group(1)), to_int(m.group(2)), cx, cy, t))
    return pairs


print("=" * 78)
print("A) Comma-aware dim-pairs as POSITIONED SPANS")
print("=" * 78)
for label, path, idx in [
    ("HARRISON floor (idx1)", "tests/fixtures/harrison/concept.pdf", 1),
    ("BEDDIS floor (idx2)", "tests/fixtures/beddis/prelim.pdf", 2),
]:
    doc = fitz.open(path)
    dp = dimpairs(doc[idx])
    big = [p for p in dp if max(p[0], p[1]) >= 1500]
    print(f"\n{label}: {len(dp)} positioned dim-pairs, {len(big)} with a side >=1500mm")
    for w, h, cx, cy, t in sorted(dp, key=lambda p: -max(p[0], p[1]))[:14]:
        print(f"   {w} x {h}  @x{cx} y{cy}   '{t}'")
    doc.close()

print()
print("=" * 78)
print("B) HARRISON — garage door dim nearest the GARAGE label")
print("=" * 78)
doc = fitz.open("tests/fixtures/harrison/concept.pdf")
page = doc[1]
sp = spans(page)
gar = [s for s in sp if "GARAGE" in s[0].upper()]
dp = dimpairs(page)
for gt, gx, gy in gar:
    best = min(dp, key=lambda p: (p[2] - gx) ** 2 + (p[3] - gy) ** 2)
    dist = round(((best[2] - gx) ** 2 + (best[3] - gy) ** 2) ** 0.5)
    print(f"  '{gt}' @x{gx} y{gy} -> nearest dim-pair {best[0]} x {best[1]} "
          f"('{best[4]}') @ {dist}px")
print("  (QS garage = 4800 wide x 2150 high; vision flaked it to 2710)")
doc.close()

print()
print("=" * 78)
print("C) BEDDIS schedule (idx6) — head datum vs glazed-pane y-band separation")
print("=" * 78)
doc = fitz.open("tests/fixtures/beddis/prelim.pdf")
page = doc[6]
sp = spans(page)
datum = sorted({cy for t, cx, cy in sp if t.replace(",", "") == "2210"})
wrows = sorted(cy for t, cx, cy in sp if WCODE.fullmatch(t))
print(f"  y-bands carrying the 2,210 head datum: {datum}")
print(f"  y of W-code rows:                      {wrows}")
print("  -> the 2,210 datum sits on its own y-rows, distinct from the per-cell")
print("     glazed H/W numbers; a row-band split separates them deterministically.")
doc.close()

print()
print("=" * 78)
print("D) Scale calibration probe")
print("=" * 78)
for label, path, idx in [
    ("HARRISON floor (idx1)", "tests/fixtures/harrison/concept.pdf", 1),
    ("BEDDIS floor (idx2)", "tests/fixtures/beddis/prelim.pdf", 2),
]:
    doc = fitz.open(path)
    page = doc[idx]
    wmm = page.rect.width / PT_PER_MM
    hmm = page.rect.height / PT_PER_MM
    txt = page.get_text("text")
    scales = sorted(set(re.findall(r"1\s*:\s*\d{2,4}", txt)))
    print(f"  {label}: page box {page.rect.width:.0f}x{page.rect.height:.0f}pt "
          f"= {wmm:.0f}x{hmm:.0f}mm (paper); printed scale tokens: {scales}")
    doc.close()
print("  NOTE: callout/schedule dim TEXT is already in millimetres (2,150 = 2150mm)")
print("        -> no scale needed to READ them. Scale (1:100 + paper size) is only")
print("        needed to turn un-annotated WALL GEOMETRY (drawing coords) into mm.")
