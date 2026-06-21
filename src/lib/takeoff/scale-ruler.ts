const PDF_POINTS_PER_MM = 72 / 25.4;

export type ScaleRuler = {
  scale: number;
  pdfPointsToMm(points: number): number;
  mmToPdfPoints(mm: number): number;
  measureGapWidthMm(widthPoints: number): number;
};

export function createScaleRuler(scale: number): ScaleRuler {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Plan scale must be a positive finite number; received ${scale}`);
  }

  return {
    scale,
    pdfPointsToMm(points: number) {
      return (points / PDF_POINTS_PER_MM) * scale;
    },
    mmToPdfPoints(mm: number) {
      return (mm / scale) * PDF_POINTS_PER_MM;
    },
    measureGapWidthMm(widthPoints: number) {
      return Math.round((widthPoints / PDF_POINTS_PER_MM) * scale);
    },
  };
}
