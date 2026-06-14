import type { VisionRunSummary } from "./vision-types";

export const VISION_RECOVERED_ROWS_WARNING =
  "Vision recovered saved rows from an interrupted request. Review extracted rows before pricing.";

export function mergeVisionSummaryCounts(
  summary: VisionRunSummary,
  counts: {
    pages: number;
    quantities: number;
    openings: number;
    windows: number;
    measurements: number;
    moduleItems: number;
  },
  options: { recoveredFromInterruptedRun?: boolean } = {},
): VisionRunSummary {
  const rowCount = counts.quantities + counts.openings + counts.measurements + counts.moduleItems;
  const warnings = [...(summary.warnings ?? [])];
  if (
    options.recoveredFromInterruptedRun &&
    rowCount > 0 &&
    !warnings.includes(VISION_RECOVERED_ROWS_WARNING)
  ) {
    warnings.push(VISION_RECOVERED_ROWS_WARNING);
  }
  const doorCount = Math.max(0, counts.openings - counts.windows);
  return {
    ...summary,
    pages: Array.isArray(summary.pages) ? summary.pages : [],
    pagesRendered: Math.max(summary.pagesRendered, counts.pages),
    pagesSentToVision: Math.max(summary.pagesSentToVision, counts.pages > 0 ? 1 : 0),
    pagesProcessed: Math.max(summary.pagesProcessed, rowCount > 0 ? 1 : 0),
    processedPages: Math.max(summary.processedPages, rowCount > 0 ? 1 : 0),
    workingPlanReviewed: summary.workingPlanReviewed || rowCount > 0,
    areaPerimeterValuesFound: Math.max(summary.areaPerimeterValuesFound, counts.quantities),
    windowItemsFound: Math.max(summary.windowItemsFound, counts.windows),
    doorItemsFound: Math.max(summary.doorItemsFound, doorCount),
    wallLengthsFound: Math.max(summary.wallLengthsFound, counts.measurements),
    moduleDraftItemsCreated: Math.max(summary.moduleDraftItemsCreated, counts.moduleItems),
    visionQuantitiesCreated: Math.max(summary.visionQuantitiesCreated, counts.quantities),
    visionMeasurementsCreated: Math.max(summary.visionMeasurementsCreated, counts.measurements),
    visionOpeningsCreated: Math.max(summary.visionOpeningsCreated, counts.openings),
    visionModuleItemsCreated: Math.max(summary.visionModuleItemsCreated, counts.moduleItems),
    reviewRequiredItems: Math.max(
      summary.reviewRequiredItems,
      counts.quantities + counts.openings + counts.measurements + counts.moduleItems,
    ),
    warnings,
    warningCount: warnings.length,
  };
}
