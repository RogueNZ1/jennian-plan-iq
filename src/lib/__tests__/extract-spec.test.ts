import { describe, it, expect } from "vitest";
import { extractJobHeaderFromFile } from "../takeoff/extract-spec";
import type { ExtractedFile } from "../takeoff/pdf-text";

function makeFile(text: string): ExtractedFile {
  return {
    fileId: "test",
    fileName: "test.pdf",
    fileType: "specification",
    pages: [{ pageNumber: 1, text, widthPts: 595, heightPts: 842, pageSize: "A4" }],
  };
}

describe("extractJobHeaderFromFile", () => {
  it("extracts client name, address, city from SMW format", () => {
    const smwText = `
Test Client Name
123 Example Street
Palmerston North
13/04/2026
10 Year Master Build Guarantee Included in Cost
Plan Version: 1
Area Over Frame: 167.9
Perimeter: 63.8lm
Jennian Homes Manawatu 2013 Ltd
275 Broadway Ave, Palmerston North
`;
    const file = makeFile(smwText);
    const header = extractJobHeaderFromFile(file);
    expect(header.clientName).toBe("Test Client Name");
    expect(header.addressLine1).toBe("123 Example Street");
    expect(header.city).toBe("Palmerston North");
    expect(header.date).toBe("13/04/2026");
    expect(header.source).toBe("smw");
  });

  it("extracts JMW number from document body", () => {
    const file = makeFile(`
Test Client
123 Example Street
Palmerston North
Site: JMW26001
Plan Version: 1
`);
    const header = extractJobHeaderFromFile(file);
    expect(header.jmwNumber).toBe("JMW26001");
  });

  it("extracts JMW number from filename", () => {
    const file: ExtractedFile = {
      fileId: "f1",
      fileName: "JMW25025_Dixon_Bean_Stage_Loads.xlsx",
      fileType: "specification",
      pages: [
        { pageNumber: 1, text: "Some content", widthPts: 595, heightPts: 842, pageSize: "A4" },
      ],
    };
    const header = extractJobHeaderFromFile(file);
    expect(header.jmwNumber).toBe("JMW25025");
  });

  it("extracts Job # from architectural plans", () => {
    const plansText = `
NOT FOR CONSTRUCTION
CONCEPT DESIGN
Job # 2540
Russell Test and Jenny Example
45 Example Crescent
Palmerston North
`;
    const file = makeFile(plansText);
    const header = extractJobHeaderFromFile(file);
    expect(header.jobNumber).toBe("2540");
    expect(header.source).toBe("plans");
  });

  it("returns nulls gracefully for unrecognised format", () => {
    const file = makeFile("Random unrelated content with no job info");
    const header = extractJobHeaderFromFile(file);
    expect(header.clientName).toBeNull();
    expect(header.jmwNumber).toBeNull();
    expect(header.source).toBe("unknown");
  });

  it("JMW number is always uppercase", () => {
    const file = makeFile("Project reference: jmw26001");
    const header = extractJobHeaderFromFile(file);
    expect(header.jmwNumber).toBe("JMW26001");
  });

  it("does not confuse Jennian address with client address", () => {
    const file = makeFile(`
Test Family Name
99 Real Street
Palmerston North
13/04/2026
Jennian Homes Manawatu 2013 Ltd
275 Broadway Ave, Palmerston North
`);
    const header = extractJobHeaderFromFile(file);
    expect(header.clientName).toBe("Test Family Name");
    expect(header.addressLine1).toBe("99 Real Street");
    expect(header.addressLine1).not.toContain("Broadway");
  });
});
