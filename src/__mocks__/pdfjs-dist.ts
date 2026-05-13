// Stub for pdfjs-dist — not in the sandbox npm registry.
// Vite aliases all pdfjs-dist imports here at build time so the bundle resolves.
// At runtime (browser), loads the real library from CDN.

const VERSION = "5.7.284";
const CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.min.mjs`;
const CDN_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.worker.min.mjs`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLib = any;

let _lib: AnyLib | null = null;

async function loadLib(): Promise<AnyLib> {
  if (_lib) return _lib;
  const mod = await import(/* @vite-ignore */ CDN);
  mod.GlobalWorkerOptions.workerSrc = CDN_WORKER;
  _lib = mod;
  return _lib;
}

export const GlobalWorkerOptions = { workerSrc: "" };

export function getDocument(src: unknown) {
  const promise = loadLib().then((lib: AnyLib) => lib.getDocument(src).promise);
  return { promise };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PDFPageProxy = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PDFDocumentProxy = any;
