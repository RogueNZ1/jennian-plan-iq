declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }

  export interface ColInfo {
    wch?: number;
    wpx?: number;
  }

  export interface WorkSheet {
    "!cols"?: ColInfo[];
    "!rows"?: unknown[];
    "!ref"?: string;
    [addr: string]: CellObject | ColInfo[] | unknown[] | string | undefined;
  }

  export interface CellObject {
    v: string | number | boolean | Date;
    t: "s" | "n" | "b" | "d" | "z";
    [key: string]: unknown;
  }

  export interface ParsingOptions {
    type?: "base64" | "binary" | "buffer" | "file" | "array" | "string";
    cellStyles?: boolean;
    [key: string]: unknown;
  }

  export interface WritingOptions {
    type?: "base64" | "binary" | "buffer" | "file" | "array" | "string";
    bookType?: string;
    [key: string]: unknown;
  }

  export function read(data: Uint8Array | ArrayBuffer | string, opts?: ParsingOptions): WorkBook;
  export function write(wb: WorkBook, opts: WritingOptions & { type: "array" }): Uint8Array<ArrayBuffer>;
  export function write(wb: WorkBook, opts: WritingOptions): string | Uint8Array<ArrayBuffer>;

  export const utils: {
    book_new(): WorkBook;
    aoa_to_sheet(data: unknown[][]): WorkSheet;
    json_to_sheet(data: object[]): WorkSheet;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
    sheet_to_csv(ws: WorkSheet): string;
  };
}
