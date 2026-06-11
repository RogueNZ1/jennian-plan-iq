#!/usr/bin/env python3
"""P2 PROOF (12 Jun 2026): internal/external wall lineal metres measured from
the plan PDF's filled wall ribbons via shoelace-area geometry, at calibrated
1:100 A3 scale. JM-0027 results: internal 57 lm net (36 grey 90mm fills),
external trace 78.8 lm vs architect's stated 80.0 (delta 1.5% = face/centre
offset) -- METHOD SELF-VALIDATES against the drawing's stat block.
Port target: the geometry proxy worker (pdf.js path operators)."""
import pdfplumber, math, sys
from collections import defaultdict

MM = 0.352778 * 100  # pt -> real mm at 1:100
pg = pdfplumber.open(sys.argv[1]).pages[0]

def shoelace(p):
    return abs(sum(p[i][0]*p[(i+1)%len(p)][1] - p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))) / 2

def ribbon(pts):
    P = sum(math.dist(pts[i], pts[(i+1)%len(pts)]) for i in range(len(pts)))
    A = shoelace(pts)
    disc = P*P - 16*A
    if disc < 0: return None
    t = (P - math.sqrt(disc)) / 4
    return (A/t, t) if t > 0 else None

tot = defaultdict(lambda: [0.0, 0])
def add(color, L_pt, t_pt):
    t_mm = t_pt * MM
    if 60 <= t_mm <= 200 and L_pt*MM/1000 >= 0.25:
        k = (str(color), round(t_mm/10)*10); tot[k][0] += L_pt*MM/1000; tot[k][1] += 1

for r in pg.rects:
    if r.get("fill") and min(r["x1"]-r["x0"], r["bottom"]-r["top"]) > 0:
        w, h = r["x1"]-r["x0"], r["bottom"]-r["top"]; add(r.get("non_stroking_color"), max(w,h), min(w,h))
for c in pg.curves:
    if c.get("fill") and len(c.get("pts") or []) >= 4:
        rb = ribbon(c["pts"])
        if rb: add(c.get("non_stroking_color"), *rb)

for (color, t), (L, n) in sorted(tot.items(), key=lambda x: -x[1][0]):
    if L > 1: print(f"thick~{t}mm {color}: {L:.1f} m ({n} segs)")
print("\nClassification rule (JM-0027): grey(0.588) 90mm = INTERNAL; dark/black/white-core = EXTERNAL")
