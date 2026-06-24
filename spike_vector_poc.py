"""
Phase 4 read-only spike #2 — prove it on the cases vision got wrong.

  A) Window glazed height vs 2210 head datum  (Beddis schedule, prelim p7/idx6)
  B) Garage width 4800 near GARAGE label       (Harrison floor plan, p2/idx1)
  C) Dimension strings as positioned text       (both floor plans)

Read-only. Prints positioned spans (text + x/y bbox) so we can see whether the
discriminator vision had to guess at is recoverable by POSITION, deterministically.
No model in the loop — running twice must print identically.
"""
import re
import fitz

NUM = re.compile(r"\d{2,5}")
DIMPAIR = re.compile(r"\d{3,5}\s*[xX×]\s*\d{3,5}")
WCODE = re.compile(r"\bW\d{1,3}\b")


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
                    out.append((t, round(x0), round(y0), round(x1), round(y1)))
    return out


def near(sp, cx, cy, r):
    t, x0, y0, x1, y1 = sp
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    return abs(mx - cx) <= r and abs(my - cy) <= r


print("=" * 78)
print("A) BEDDIS schedule page (prelim idx6) — W-codes + positioned numbers")
print("=" * 78)
doc = fitz.open("tests/fixtures/beddis/prelim.pdf")
page = doc[6]
sp = spans(page)
wcodes = [s for s in sp if WCODE.fullmatch(s[0])]
print(f"W-code spans found: {[s[0] for s in wcodes]}")
# For the first few W-codes, list every numeric span within a radius and its y — so we
# can see if the inner glazed-pane number sits at a different y than the 2210 head datum.
for w in wcodes[:4]:
    wt, wx0, wy0, wx1, wy1 = w
    cx, cy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
    nums = [(s[0], s[1], s[2]) for s in sp if NUM.fullmatch(s[0]) and near(s, cx, cy, 120)]
    nums.sort(key=lambda n: n[2])  # by y (top→bottom)
    print(f"  {wt} @x{round(cx)},y{round(cy)} -> nums(by y): {nums}")
print(f"  raw dim-pairs on page: {sorted(set(DIMPAIR.findall(page.get_text('text'))))}")
doc.close()

print()
print("=" * 78)
print("B) HARRISON floor plan (concept idx1) — GARAGE label + nearby widths")
print("=" * 78)
doc = fitz.open("tests/fixtures/harrison/concept.pdf")
page = doc[1]
sp = spans(page)
gar = [s for s in sp if "GARAGE" in s[0].upper()]
print(f"GARAGE-ish spans: {[(s[0], s[1], s[2]) for s in gar]}")
for g in gar[:2]:
    gt, gx0, gy0, gx1, gy1 = g
    cx, cy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    nums = [(s[0], s[1], s[2]) for s in sp if NUM.fullmatch(s[0]) and near(s, cx, cy, 250)]
    nums.sort(key=lambda n: (n[2], n[1]))
    print(f"  '{gt}' @x{round(cx)},y{round(cy)} -> nums within 250px: {nums}")
print(f"  4800 present anywhere as positioned text? "
      f"{any(s[0]=='4800' for s in sp)} ; 2150? {any(s[0]=='2150' for s in sp)}")
print(f"  raw dim-pairs on page: {sorted(set(DIMPAIR.findall(page.get_text('text'))))[:20]}")
doc.close()

print()
print("=" * 78)
print("C) Dimension strings as positioned text — coverage on both floor plans")
print("=" * 78)
for label, path, idx in [
    ("BEDDIS prelim floor (idx2)", "tests/fixtures/beddis/prelim.pdf", 2),
    ("HARRISON floor (idx1)", "tests/fixtures/harrison/concept.pdf", 1),
]:
    doc = fitz.open(path)
    page = doc[idx]
    sp = spans(page)
    pure_nums = [s[0] for s in sp if NUM.fullmatch(s[0])]
    pairs = sorted(set(DIMPAIR.findall(page.get_text("text"))))
    print(f"{label}: {len(sp)} spans, {len(pure_nums)} pure-number spans, "
          f"{len(pairs)} distinct NxN dim-pairs")
    print(f"   sample dim-pairs: {pairs[:12]}")
    doc.close()
