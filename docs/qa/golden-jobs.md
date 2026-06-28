# Golden Jobs

Golden jobs are used to prove specific behaviours. They are not all expected to be fully solved today.

## JM-0060

Purpose:
- messy live job
- proves Extracted Quantities worksheet
- proves existing QS workbook tabs remain unchanged
- proves null/needs_review doctrine

Current expected state after Slice 2A-visible:
- Extracted Quantities sheet exists
- existing sheets Cover, 5. Data Input House, and IQ Import match control workbook cell-for-cell
- exterior perimeter appears
- interior door quantities appear
- opening/window rows appear
- unknown dimensions are blank/null
- assumed-height row shows needs_review with null height and null area
- clean totals exclude needs_review
- evidence columns are present

Not expected yet:
- every opening/window is correct
- visual overlay agrees
- verification reads ledger
- review reads ledger
- pricing accuracy

## Fenner / JM-0052

Purpose:
- opening recovery torture test
- must not fake a win

Current expected state:
- proof gate must hold
- Fenner failing baseline remains until honest recovery is implemented
- no tolerance widening to fake success
- no assumed-height pricing
- no signed truth in production

Not expected yet:
- full opening recovery
- all openings priced

## O'Neil

Purpose:
- raster elevation / schedule witness case
- tests non-vector evidence path

Current expected state:
- vector absence should not imply no openings
- schedule/floor witnesses remain future extraction evidence

Not expected yet:
- complete recovery before ledger authority is durable

## Beddis / 15a / Other Known Jobs

Purpose:
- maintain regression awareness
- do not use as excuse for detector tuning during authority migration

Update this file when a job becomes a formal smoke/regression target.
