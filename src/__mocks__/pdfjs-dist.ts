// Stub for pdfjs-dist — not available in the sandbox npm registry.
// Real pdfjs-dist loads via CDN in the Lovable dev environment.

export const GlobalWorkerOptions = { workerSrc: "" };

export function getDocument(_src: unknown) {
  return {
    promise: Promise.reject(new Error("pdfjs-dist not available in this build")),
  };
}

export type PDFPageProxy = unknown;
export type PDFDocumentProxy = unknown;
