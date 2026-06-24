"""
Phase 4 read-only spike #1 — characterise the vector layer.

For every page of both fixtures, report (no mutation, no render-to-disk):
  - positioned text: span count + total chars (get_text("dict"))
  - vector geometry: drawing count + total path segments (get_drawings())
  - raster images: count + largest-image coverage fraction (scan signal)
  - a vector-vs-scan verdict from those signals

Generalisation probe: Beddis (A-series) vs Harrison (25xxx) — same fields,
so structural divergence between templates shows up directly.
"""
import sys
import fitz  # PyMuPDF

FIXTURES = [
    ("BEDDIS prelim",  r"tests/fixtures/beddis/prelim.pdf"),
    ("BEDDIS concept", r"tests/fixtures/beddis/concept-floorplan.pdf"),
    ("HARRISON concept", r"tests/fixtures/harrison/concept.pdf"),
]


def largest_image_coverage(page) -> float:
    """Fraction of page area covered by the single largest raster image (scan signal)."""
    page_area = abs(page.rect.width * page.rect.height) or 1.0
    best = 0.0
    for img in page.get_images(full=True):
        xref = img[0]
        for rect in page.get_image_rects(xref):
            frac = abs(rect.width * rect.height) / page_area
            best = max(best, frac)
    return best


def page_drawing_segments(page) -> int:
    total = 0
    for d in page.get_drawings():
        total += len(d.get("items", []))
    return total


def verdict(chars: int, draws: int, segs: int, img_cov: float) -> str:
    # A scan = one big image, ~no positioned text, ~no vector paths.
    if img_cov > 0.85 and chars < 50 and segs < 20:
        return "SCAN (rasterised)"
    if chars > 200 and segs > 50:
        return "VECTOR (text + geometry)"
    if chars > 200:
        return "VECTOR-TEXT (text, little geometry)"
    return "MIXED / unclear"


for label, path in FIXTURES:
    try:
        doc = fitz.open(path)
    except Exception as e:
        print(f"\n### {label}: OPEN FAILED {e}")
        continue
    print(f"\n{'='*78}\n### {label}  ({path})  pages={doc.page_count}\n{'='*78}")
    print(f"{'pg':>2} | {'chars':>6} | {'spans':>5} | {'draws':>5} | {'segs':>6} | {'imgCov':>6} | verdict")
    print("-" * 78)
    for i in range(doc.page_count):
        page = doc[i]
        td = page.get_text("dict")
        spans = sum(len(l["spans"]) for b in td["blocks"] if b.get("type") == 0 for l in b["lines"])
        chars = len(page.get_text("text"))
        draws = len(page.get_drawings())
        segs = page_drawing_segments(page)
        img_cov = largest_image_coverage(page)
        v = verdict(chars, draws, segs, img_cov)
        print(f"{i:>2} | {chars:>6} | {spans:>5} | {draws:>5} | {segs:>6} | {img_cov:>6.2f} | {v}")
    doc.close()
