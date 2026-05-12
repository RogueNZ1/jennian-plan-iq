export const read = () => ({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
export const write = () => new Uint8Array();
export const utils = {
  book_new: () => ({ SheetNames: [], Sheets: {} }),
  aoa_to_sheet: () => ({}),
  book_append_sheet: () => {},
};
