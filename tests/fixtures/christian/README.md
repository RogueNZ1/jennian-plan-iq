# Christian / Awa Park core benchmark

Christian is the repeated live-run benchmark for Jennian IQ. It has been uploaded under several
job numbers (`JM-0021`, `JM-0029`, `JM-0042`, plus Codex reruns), and it exposed the exact failure
mode this project must not hide: the system can read plenty of printed joinery codes while still
losing room context or producing wildly different QS outputs.

## Fixture inputs

The full client plan set is not committed. The runnable offline fixture is a single extracted
floor-plan page:

```text
tests/doors/plans/christian-floorplan-page6.pdf
```

Local-only source files used to derive or inspect the benchmark can live here, but are ignored:

```text
tests/fixtures/christian/floorplan-page6.pdf
tests/fixtures/christian/window-schedule-page25.pdf
```

## Harness

`tests/christian/baseline.test.ts`

Current gate shape:

- Green: the parser must recover the printed joinery/opening codes from the proposed floor-plan
  page, including the representative high-value sliders/doors.
- Green: the parser must recover the title-case room footprint labels from this page.
- Green: printed joinery codes must route onto real room anchors.

This does not make Christian a signed-off pricing witness set. Previous Christian runs prove the
parser can look active while still routing poorly, so QS-priced opening totals remain pending until
Haydon signs off the rows against the actual workbook.

## Truth status

`ground-truth.json` is not signed-off QS pricing witness evidence yet. It records historical IQ outputs and the
known live failure evidence. Promote it to a priced truth set only after Haydon signs off the
Christian QS rows against the actual workbook.
