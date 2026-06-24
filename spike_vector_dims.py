"""
Phase 4 read-only spike #3 — WHERE do the big structural dims live?

Spike #2 proved the large numbers vision misreads (garage 4800/2150, schedule
H x W) are NOT simple positioned NxN pairs in the text layer. This probes:

  A) Harrison floor plan (idx1): dump EVERY positioned span that is a 3-5 digit
     number, with x/y. Is 4800 / 2150 anywhere at all (any token form)? Are the
     big room/structural dims present as lone numbers needing spatial pairing?
  B) Beddis schedule (idx6): dump ALL spans row-by-row (group by y-band) so we
     can see the schedule table cells — is each window's H and W a separate cell?
  C) get_drawings() on Harrison floor: are there dimension *lines* (thin long
     strokes) whose endpoints could be paired with lone numbers to recover spans?

Read-only. Deterministic. No model. No mutation.
"""
import re
import fitz

NUM35 = re.compile(r"\d{3,5}")
PURE = re.compile(r"\d{2,5}")


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


print("=" * 78)
print("A) HARRISON floor (idx1) — every 3-5 digit numeric token + position")
print("=" * 78)
doc = fitz.open("tests/fixtures/harrison/concept.pdf")
page = doc[1]
sp = spans(page)
# any token CONTAINING a 3-5 digit run (covers '4800', '2,150', '4800mm', 'W4800')
bignum = [s for s in sp if NUM35.search(s[0])]
print(f"page size: {round(page.rect.width)} x {round(page.rect.height)}")
print(f"tokens containing a 3-5 digit run: {len(bignum)}")
for s in sorted(bignum, key=lambda s: (s[2], s[1])):
    print(f"  '{s[0]}'  x{s[1]} y{s[2]}")
# explicit substring scan across ALL span text (any form, even glued)
alltext = " | ".join(s[0] for s in sp)
for needle in ("4800", "2150", "4,800", "2,150", "480", "215"):
    print(f"  substring '{needle}' in any span? {needle in alltext}")
doc.close()

print()
print("=" * 78)
print("B) BEDDIS schedule (idx6) — spans grouped into y-bands (table rows)")
print("=" * 78)
doc = fitz.open("tests/fixtures/beddis/prelim.pdf")
page = doc[6]
sp = spans(page)
print(f"page size: {round(page.rect.width)} x {round(page.rect.height)}  spans={len(sp)}")
# cluster by y (rows). 6px band.
rows = {}
for s in sorted(sp, key=lambda s: (s[2], s[1])):
    key = round(s[2] / 6)
    rows.setdefault(key, []).append(s)
for key in sorted(rows):
    cells = rows[key]
    y = cells[0][2]
    line = "  ".join(f"{c[0]}@x{c[1]}" for c in cells)
    # only print rows that mention a W-code or have a 3-5 digit number (the data rows)
    if any(re.fullmatch(r"W\d{1,3}", c[0]) for c in cells) or any(NUM35.search(c[0]) for c in cells):
        print(f"  y{y:>4}: {line}")
doc.close()

print()
print("=" * 78)
print("C) HARRISON floor (idx1) — dimension-line geometry probe")
print("=" * 78)
doc = fitz.open("tests/fixtures/harrison/concept.pdf")
page = doc[1]
draws = page.get_drawings()
# A dimension line = a near-axis-aligned long thin stroke. Count long lines.
longlines = []
for d in draws:
    for it in d.get("items", []):
        if it[0] == "l":  # line segment: ("l", p1, p2)
            p1, p2 = it[1], it[2]
            dx, dy = abs(p2.x - p1.x), abs(p2.y - p1.y)
            length = (dx * dx + dy * dy) ** 0.5
            axis = "H" if dy < 2 else ("V" if dx < 2 else "")
            if length > 150 and axis:
                longlines.append((round(length), axis, round(p1.x), round(p1.y), round(p2.x), round(p2.y)))
print(f"total drawings: {len(draws)}")
print(f"long (>150u) axis-aligned line segments (candidate dimension/extension lines): {len(longlines)}")
for ll in sorted(longlines, reverse=True)[:25]:
    print(f"  len{ll[0]:>5} {ll[1]} ({ll[2]},{ll[3]})->({ll[4]},{ll[5]})")
doc.close()
