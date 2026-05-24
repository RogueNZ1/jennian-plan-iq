import type { BuilderConfig, DimensionFormat } from './builder-config';

export type SheetType =
  | 'floor_plan'
  | 'dimension_plan'
  | 'elevation'
  | 'site_plan'
  | 'concept_impression'
  | 'electrical'
  | 'unknown';

export interface PlanContext {
  builder: BuilderConfig;
  scaleString: string | null;
  scaleFactor: number | null;
  dimensionFormat: DimensionFormat;
  dimensionFormatSource: 'stated_on_plan' | 'builder_default' | 'nz_default';
  studHeightMm: number;
  studHeightSource: 'stated_on_plan' | 'builder_default' | 'nz_default';
  sheetType: SheetType;
  livingAreaM2: number | null;
  perimeterM: number | null;
}
