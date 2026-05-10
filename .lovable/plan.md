## Goal

Fix the upload drop zone in `src/routes/upload.tsx` so dragging PDFs onto it adds the files instead of letting the browser open them. No visual redesign — the existing `<label>` dropzone keeps its current look.

## Changes (single file: `src/routes/upload.tsx`)

### 1. Global safety listeners while `/upload` is mounted

In `UploadPage`, add a `useEffect` that attaches `dragover` and `drop` listeners to `window` which call `preventDefault()`. Remove them on unmount. This stops a stray drop anywhere on the page from navigating the browser to the PDF.

```ts
useEffect(() => {
  const prevent = (e: DragEvent) => { e.preventDefault(); };
  window.addEventListener("dragover", prevent);
  window.addEventListener("drop", prevent);
  return () => {
    window.removeEventListener("dragover", prevent);
    window.removeEventListener("drop", prevent);
  };
}, []);
```

### 2. Make `Dropzone` actually a drop target

The current `Dropzone` is a `<label>` wrapping a hidden `<input type="file">`. It has zero drag handlers, which is why the browser falls back to its default "open the file" behaviour.

Update `Dropzone` to:

- Accept the same props plus nothing new externally — drag handling stays internal.
- Track an `isDragging` state for the highlight.
- Handle `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`:
  - All four call `e.preventDefault()` and `e.stopPropagation()`.
  - `dragenter` / `dragover` → set `isDragging = true`.
  - `dragleave` → set `isDragging = false` (only when leaving the element, not children — use `e.currentTarget.contains(relatedTarget)` guard).
  - `drop` → set `isDragging = false`, read `e.dataTransfer.files`, validate, hand off to `onFile`.

- Validation:
  - Filter to `application/pdf` (also accept files whose name ends with `.pdf` as a fallback for browsers that drop without a MIME type).
  - If any dropped file is non-PDF (or none are PDF), call `toast.error("Only PDF files are supported for plan/specification upload.")` and do not accept the drop.
  - If valid PDFs were dropped, pass the first one to `onFile` (the existing single-file API per zone).

- Duplicate guard: if a dropped file has the same `name` and `size` as the currently selected `file`, skip it silently (do not re-add or toast).

- Highlight: when `isDragging`, swap the dashed border colour to the existing `border-primary/60` and background to `bg-accent/40`. No new tokens, no new colors — uses tokens already in the file.

### 3. Keep Browse working

The existing hidden `<input type="file">` inside the `<label>` is untouched. Clicking the dropzone still opens the picker because the wrapping element remains a `<label htmlFor>`-style click target. The drop handlers are added to the same `<label>` element; they do not interfere with click-to-browse.

### 4. Out of scope (per instructions)

- No changes to `persist()`, job/file insert logic, storage paths, the `test job` flag handling, or any business logic.
- No changes to styles.css, colors, layout, sidebar, typography.
- Both Plan and Spec dropzones get the fix because they both use the same `Dropzone` component.

## Acceptance check after implementation

1. `bunx tsc --noEmit` passes.
2. Drag PDF onto Plan zone → file is added; browser does not navigate.
3. Drag two PDFs onto the same zone → first is accepted (single-file zone), no crash.
4. Drag a `.png` onto a zone → toast: "Only PDF files are supported for plan/specification upload."
5. Drop a PDF outside any zone → nothing happens (global listener prevents default).
6. Click the zone → file picker still opens and works.
7. No console errors.
8. Visual style unchanged except a subtle border/background highlight while dragging.
