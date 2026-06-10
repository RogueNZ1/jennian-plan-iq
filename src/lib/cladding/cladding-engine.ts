/**
 * External cladding area engine — deterministic, fail-safe, nothing invented.
 *
 * The door-engine doctrine applied to cladding:
 *   - every output term is sourced from a measured or extracted input;
 *   - any missing input produces a FLAG and an excluded term — never a guess;
 *   - the result is only quote-grade when flags are empty.
 *
 * V1 model (whole-house resolution):
 *   wall_rect_area  = perimeter (geometry-measured) × stud height (elevation-extracted)
 *   gable_area      = Σ per gable end: ½ × span × rise,  rise = (span/2) × tan(pitch)
 *   glazing_deduct  = Σ canonical opening areas (windows, sliders, entrance, PA,
 *                     sectional doors — every hole in the cladding)
 *   net_cladding    = wall_rect_area + gable_area − glazing_deduct
 *
 * Per-cladding-type split: single type → 100%. Multiple types → split is NOT
 * computable at whole-house resolution (needs per-elevation banding) → areas null,
 * flagged for manual split. V2 = per-elevation facades from the plan.
 *
 * Gable span: derivable from the geometry room-polygon bounding box (V1.1 wiring);
 * until supplied, gables with no span are flagged and excluded.
 */

export type CladdingInput = {
  /** Geometry-measured external perimeter, lm. */
  perimeterLm: number | null;
  /** Elevation-extracted stud/wall height, metres. */
  studHeightM: number | null;
  /** Elevation-extracted roof pitch, degrees. */
  roofPitchDeg: number | null;
  /** Elevation-extracted count of gable ends. */
  gableEndCount: number;
  /** Gable span (building width at the gable), metres — measured input, never assumed. */
  gableSpanM: number | null;
  /** Canonical openings (every hole in the cladding): height × width, metres. */
  openings: Array<{ height_m: number; width_m: number }>;
  /** Cladding type labels from the elevation sheet (spec order). */
  claddingTypes: string[];
};

export type CladdingResult = {
  /** perimeter × stud height; null when either input is missing. */
  wallRectAreaM2: number | null;
  /** Total gable triangle area; 0 when no gables; null when gables exist but inputs are missing. */
  gableAreaM2: number | null;
  /** Σ opening areas. */
  glazingDeductionM2: number;
  /** rect + gables − glazing; null whenever any required term is null. */
  netCladdingAreaM2: number | null;
  /** Per-type areas. Single type carries the net area; multiple types carry null + flag. */
  perCladding: Array<{ type: string; areaM2: number | null }>;
  /** Empty flags = quote-grade. Any flag = a human decision is required. */
  flags: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeCladding(input: CladdingInput): CladdingResult {
  const flags: string[] = [];

  // Wall rectangle — both terms must be real measurements/extractions.
  let wallRect: number | null = null;
  if (input.perimeterLm != null && input.perimeterLm > 0 && input.studHeightM != null && input.studHeightM > 0) {
    wallRect = r2(input.perimeterLm * input.studHeightM);
  } else {
    if (input.perimeterLm == null || input.perimeterLm <= 0) flags.push("perimeter not measured — wall area not computed");
    if (input.studHeightM == null || input.studHeightM <= 0) flags.push("stud height not extracted — wall area not computed");
  }

  // Gables — excluded (flagged) rather than guessed when pitch or span is missing.
  let gable: number | null = 0;
  if (input.gableEndCount > 0) {
    if (input.roofPitchDeg == null || input.roofPitchDeg <= 0) {
      gable = null;
      flags.push(`${input.gableEndCount} gable end(s) present but roof pitch missing — gable area excluded`);
    } else if (input.gableSpanM == null || input.gableSpanM <= 0) {
      gable = null;
      flags.push(`${input.gableEndCount} gable end(s) present but gable span not measured — gable area excluded`);
    } else {
      const rise = (input.gableSpanM / 2) * Math.tan((input.roofPitchDeg * Math.PI) / 180);
      gable = r2(input.gableEndCount * 0.5 * input.gableSpanM * rise);
    }
  }

  // Glazing deduction — every opening is a hole in the cladding.
  const glazing = r2(
    input.openings.reduce((s, o) => s + (o.height_m > 0 && o.width_m > 0 ? o.height_m * o.width_m : 0), 0)
  );

  const net = wallRect != null && gable != null ? r2(wallRect + gable - glazing) : null;
  if (net != null && net <= 0) flags.push("net cladding area is non-positive — inputs need review");

  // Per-type split.
  let perCladding: Array<{ type: string; areaM2: number | null }>;
  if (input.claddingTypes.length === 0) {
    perCladding = [];
    if (net != null) flags.push("no cladding type extracted — area computed but unassigned");
  } else if (input.claddingTypes.length === 1) {
    perCladding = [{ type: input.claddingTypes[0], areaM2: net }];
  } else {
    perCladding = input.claddingTypes.map((t) => ({ type: t, areaM2: null }));
    flags.push("multiple cladding types — per-type split requires per-elevation banding (manual % for now)");
  }

  return {
    wallRectAreaM2: wallRect,
    gableAreaM2: gable,
    glazingDeductionM2: glazing,
    netCladdingAreaM2: net,
    perCladding,
    flags,
  };
}
