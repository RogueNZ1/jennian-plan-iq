/**
 * SMW document export — fills placeholders in a Word (.docx) template stored
 * in Supabase Storage (smw-templates/Jennian_SMW_Template.docx), or produces
 * a minimal placeholder docx when no template is uploaded yet.
 *
 * Uses only browser-native APIs (DecompressionStream, TextDecoder, DataView)
 * and Supabase — no additional npm packages.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildQSExportData, type QSExportData } from "@/lib/iq-qs-export";

/* ----------------------------------------------------------------- CRC-32 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* --------------------------------------------------------- inflate (raw) */

async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
  // @ts-ignore DecompressionStream is available in modern browsers and Cloudflare Workers
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  void writer.write(data as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/* --------------------------------------------------------------- zip parse */

async function parseZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map<string, Uint8Array>();

  // Find End of Central Directory by scanning backwards for signature 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a valid ZIP: EOCD not found");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdCount = view.getUint16(eocdOffset + 8, true);

  let cdPos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(cdPos, true) !== 0x02014b50) break;
    const fileNameLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const localHeaderOffset = view.getUint32(cdPos + 42, true);
    const fileName = new TextDecoder("utf-8").decode(bytes.slice(cdPos + 46, cdPos + 46 + fileNameLen));
    cdPos += 46 + fileNameLen + extraLen + commentLen;

    // Read local file header
    const lhPos = localHeaderOffset;
    if (view.getUint32(lhPos, true) !== 0x04034b50) continue;
    const method = view.getUint16(lhPos + 8, true);
    const compSize = view.getUint32(lhPos + 18, true);
    const lhFileNameLen = view.getUint16(lhPos + 26, true);
    const lhExtraLen = view.getUint16(lhPos + 28, true);
    const dataOffset = lhPos + 30 + lhFileNameLen + lhExtraLen;
    const compData = bytes.slice(dataOffset, dataOffset + compSize);

    let fileData: Uint8Array;
    if (method === 0) {
      fileData = compData;
    } else if (method === 8) {
      fileData = await decompressDeflate(compData);
    } else {
      // Unsupported method — skip
      continue;
    }

    entries.set(fileName, fileData);
  }

  // Silence unused variable warning
  void cdSize;

  return entries;
}

/* ------------------------------------------------------------- DOS datetime */

function dosDateTime(): { time: number; date: number } {
  const n = new Date();
  return {
    time: (n.getHours() << 11) | (n.getMinutes() << 5) | (n.getSeconds() >> 1),
    date: ((n.getFullYear() - 1980) << 9) | ((n.getMonth() + 1) << 5) | n.getDate(),
  };
}

/* --------------------------------------------------------------- zip build */

function buildZip(fileMap: Map<string, Uint8Array>): Uint8Array {
  const { time, date } = dosDateTime();
  const enc = new TextEncoder();

  interface LocalEntry {
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    localOffset: number;
  }

  const localEntries: LocalEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const [name, data] of fileMap) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const localOffset = offset;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // method: STORED
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);  // compressed size
    lv.setUint32(22, data.length, true);  // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);            // extra field length
    lh.set(nameBytes, 30);

    chunks.push(lh);
    chunks.push(data);
    offset += lh.length + data.length;

    localEntries.push({ name: nameBytes, data, crc, localOffset });
  }

  const cdStart = offset;

  // Central directory
  for (const entry of localEntries) {
    const cd = new Uint8Array(46 + entry.name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // method: STORED
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.data.length, true); // compressed
    cv.setUint32(24, entry.data.length, true); // uncompressed
    cv.setUint16(28, entry.name.length, true);
    cv.setUint16(30, 0, true);            // extra
    cv.setUint16(32, 0, true);            // comment
    cv.setUint16(34, 0, true);            // disk start
    cv.setUint16(36, 0, true);            // internal attr
    cv.setUint32(38, 0, true);            // external attr
    cv.setUint32(42, entry.localOffset, true);
    cd.set(entry.name, 46);
    chunks.push(cd);
    offset += cd.length;
  }

  const cdSize = offset - cdStart;

  // End of Central Directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);   // disk number
  ev.setUint16(6, 0, true);   // cd start disk
  ev.setUint16(8, localEntries.length, true);
  ev.setUint16(10, localEntries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);  // comment length
  chunks.push(eocd);

  // Concatenate all chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

/* --------------------------------------------------------- placeholder fill */

function applyPlaceholders(xml: string, data: QSExportData): string {
  const now = new Date();
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const dateStr = `${String(now.getDate()).padStart(2, "0")} ${months[now.getMonth()]} ${now.getFullYear()}`;

  function rep(placeholder: string, value: string) {
    xml = xml.split(placeholder).join(value);
  }

  rep("[CLIENT NAME]", `${data.clientFirstName} ${data.clientSurname}`.trim());
  rep("[ADDRESS LINE 1]", data.streetAddress);
  rep("[CITY]", data.city ?? "");
  rep("[DATE]", dateStr);
  rep("[JMW NUMBER]", data.jmwNumber);
  rep("[HOUSE PRICE]", "");
  rep("[LAND PRICE]", "");
  rep("[TOTAL PRICE]", "");
  rep("[VERSION]", data.planVersion);
  rep("[AREA]", data.floorAreaM2?.toString() ?? "");
  rep("[PERIMETER]", data.perimeterLm?.toString() ?? "");
  rep("[TOTAL]", data.floorAreaM2?.toString() ?? "");
  rep("[WIND ZONE]", data.specItems["Wind Zone"] ?? "");
  rep("[FOUNDATION TYPE]", data.specItems["Foundation"] ?? "");
  rep("[CONCRETE MPA]", data.specItems["Concrete"] ?? "");
  rep("[EXTERIOR FRAMING]", data.specItems["Exterior Framing"] ?? "");
  rep("[ROOF TYPE]", data.specItems["Roof"] ?? "");
  rep("[ROOF PROFILE]", data.specItems["Roof profile"] ?? data.specItems["Roof Profile"] ?? "");
  rep("[RIDGE TYPE]", data.specItems["Ridge Type"] ?? data.ridgeType ?? "");
  rep("[UNDERLAY]", data.specItems["Underlay"] ?? data.underlay ?? "");
  rep("[PITCH]", data.specItems["Main Roof Pitch"] ?? data.roofPitch ?? "");
  rep("[SOFFIT]", data.specItems["Soffit Linings"] ?? "");
  rep("[STUD HEIGHT]", data.specItems["Stud Height Ground Floor"] ?? (data.studHeightMm ? `${data.studHeightMm}mm` : ""));
  rep("[FASCIA]", data.specItems["Fascia"] ?? "");
  rep("[SPOUTING]", data.specItems["Spouting"] ?? "");
  rep("[SPOUTING PROFILE]", data.specItems["Spouting Profile"] ?? "");
  rep("[DOWNPIPES]", data.specItems["Downpipes"] ?? "");
  rep("[CLADDING TYPE 1]", data.specItems["Exterior Cladding Type 1"] ?? data.claddingType1 ?? "");
  rep("[CLADDING TYPE 2]", data.specItems["Exterior Cladding Type 2"] ?? data.claddingType2 ?? "");
  rep("[WINDOW HEAD]", data.specItems["Window Head"] ?? "");
  rep("[FEATURE COLUMNS]", data.specItems["Feature Columns"] ?? "");
  rep("[BUILDING WRAP]", data.specItems["Building Wrap"] ?? "");
  rep("[METER BOX]", data.specItems["Meter Box"] ?? "");
  rep("[GARAGE DOOR SPEC]", data.specItems["Garage Door"] ?? "");
  rep("[OPENER]", data.specItems["Automatic Garage Door Opener"] ?? "");
  rep("[JOINERY]", data.specItems["Exterior Aluminium Joinery"] ?? "");
  rep("[BRAND]", data.specItems["Type"] ?? "");
  rep("[FLASHING]", data.specItems["Flashing Colour"] ?? "");
  rep("[THERMALLY BROKEN]", data.specItems["Thermally Broken Aluminium Joinery"] ?? "");
  rep("[LOW E]", data.specItems["Low E Max Glazing"] ?? "");
  rep("[BATHROOM GLAZING]", data.specItems["Bathroom, Ensuite, Toilet Windows"] ?? "");
  rep("[FRONT DOOR]", data.specItems["Front Door"] ?? "");
  rep("[FRONT DOOR HARDWARE]", data.specItems["Front Door Hardware"] ?? "");
  rep("[SECURITY STAYS]", data.specItems["Security Stays"] ?? "");
  rep("[WINDOW LATCHES]", data.specItems["Window Latches"] ?? "");
  rep("[CAT DOOR]", data.specItems["Cat Flap"] ?? "");
  rep("[CEILING INSULATION]", data.specItems["Ceiling Insulation"] ?? "");
  rep("[WALL INSULATION]", data.specItems["Exterior Wall Insulation"] ?? "");
  rep("[INTERIOR FRAMING]", data.specItems["Interior Framing"] ?? "");
  rep("[CEILING LINING]", data.specItems["General Ceiling Linings"] ?? "");
  rep("[WET CEILING LINING]", data.specItems["Bathroom / Ensuite Ceiling Linings"] ?? "");
  rep("[GIB STOPPING LEVEL]", data.specItems["Gib Stopping to Ceiling Linings"] ?? "");
  rep("[WALL LINING]", data.specItems["General Wall Linings"] ?? "");
  rep("[WET WALL LINING]", data.specItems["Bathroom / Ensuite Wall Linings"] ?? "");
  rep("[CORNER FINISH]", data.specItems["External Gib Corner Finish"] ?? "");
  rep("[SKIRTING]", data.specItems["Skirting"] ?? "");
  rep("[SCOTIA]", data.specItems["Scotia"] ?? "");
  rep("[GARAGE LINING]", data.specItems["Garage Walls"] ?? "");
  rep("[DOOR SPEC]", data.specItems["Interior Doors"] ?? "");
  rep("[HANDLES]", data.specItems["Interior Door Handles"] ?? "");
  rep("[DOOR STOPS]", data.specItems["Interior Door Stops"] ?? "");
  rep("[PRIVACY SETS]", data.specItems["Privacy Sets"] ?? "");
  rep("[DOOR HEIGHT]", data.specItems["Interior Door Height"] ?? "");
  rep("[CAVITY SLIDERS]", data.intDoorCavitySlider.toString());
  rep("[DOOR JAMBS]", data.specItems["Door Jambs"] ?? "");
  rep("[DOOR ARCHITRAVES]", data.specItems["Door Architraves"] ?? "");
  rep("[WINDOW JAMBS]", data.specItems["Window Jambs"] ?? "");
  rep("[WINDOW ARCHITRAVES]", data.specItems["Window Architraves"] ?? "");
  rep("[WARDROBE SPEC]", data.specItems["Wardrobe doors"] ?? data.specItems["Wardrobe Doors"] ?? "");
  rep("[LINEN CUPBOARD]", data.specItems["Linen Cupboard"] ?? "");
  rep("[ATTIC STORAGE]", data.atticStair > 0 ? "Included" : "No allowance");
  rep("[HWC]", data.specItems["Hot Water Heating"] ?? "");
  rep("[MAINS CABLE]", data.specItems["Mains Cable"] ?? "");

  // Window schedule placeholders
  const windowRooms: Array<{ code: string; roomLabel: string; key: keyof QSExportData["windowsByRoom"] }> = [
    { code: "W01", roomLabel: "Bed 1", key: "bed1" },
    { code: "W02", roomLabel: "Ensuite", key: "ensuite" },
    { code: "W03", roomLabel: "Bed 2", key: "bed2" },
    { code: "W04", roomLabel: "Bed 3", key: "bed3" },
    { code: "W05", roomLabel: "Bed 4", key: "bed4" },
    { code: "W06", roomLabel: "Toilet", key: "toilet" },
    { code: "W07", roomLabel: "Bathroom", key: "bathroom" },
    { code: "W08", roomLabel: "Kitchen", key: "kitchen" },
    { code: "W09", roomLabel: "Kitchen Extra", key: "kitchenExtra" },
    { code: "W10", roomLabel: "Family / Living", key: "familyLiving" },
    { code: "W11", roomLabel: "Dining", key: "dining" },
    { code: "W12", roomLabel: "Lounge", key: "lounge" },
    { code: "W13", roomLabel: "Garage Window", key: "garageWindow" },
    { code: "GD01", roomLabel: "Garage Door 1", key: "garageDoor1" },
    { code: "GD02", roomLabel: "Garage Door 2", key: "garageDoor2" },
  ];

  for (const { code, roomLabel, key } of windowRooms) {
    const room = data.windowsByRoom[key];
    rep(`[${code}_ROOM]`, roomLabel);
    rep(`[${code}_QTY]`, room?.qty.toString() ?? "");
    rep(`[${code}_HEIGHT]`, room?.height.toString() ?? "");
    rep(`[${code}_WIDTH]`, room?.width.toString() ?? "");
  }

  return xml;
}

/* ------------------------------------------------- minimal placeholder docx */

function buildMinimalSMWDocx(data: QSExportData): Uint8Array {
  const enc = new TextEncoder();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const lines = [
    `Jennian SMW Document — ${data.jmwNumber}`,
    ``,
    `Client: ${data.clientFirstName} ${data.clientSurname}`.trim(),
    `Address: ${data.streetAddress}${data.city ? `, ${data.city}` : ""}`,
    `Version: ${data.planVersion}`,
    ``,
    `Floor Area: ${data.floorAreaM2 ?? "—"} m²`,
    `Perimeter: ${data.perimeterLm ?? "—"} lm`,
    ``,
    ``,
    `NOTE: Upload Jennian_SMW_Template.docx to Supabase Storage (smw-templates bucket) to enable full template export.`,
  ].filter((l) => l !== null);

  const paragraphs = lines.map((line) =>
    line
      ? `<w:p><w:r><w:t xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
      : `<w:p/>`,
  ).join("\n");

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
${paragraphs}
  </w:body>
</w:document>`;

  const entries = new Map<string, Uint8Array>([
    ["[Content_Types].xml", enc.encode(contentTypes)],
    ["_rels/.rels", enc.encode(rels)],
    ["word/document.xml", enc.encode(document)],
    ["word/_rels/document.xml.rels", enc.encode(docRels)],
  ]);

  return buildZip(entries);
}

/* --------------------------------------------------------- main export fn */

export async function exportSMWDocument(jobId: string): Promise<{ blob: Blob; filename: string }> {
  const data = await buildQSExportData(jobId);
  const surname = data.clientSurname || data.clientName.split(" ").pop() || "Client";
  const filename = `${data.jmwNumber}-SMW-${surname}.docx`;

  // Try downloading template
  const { data: templateBlob, error } = await supabase.storage
    .from("smw-templates")
    .download("Jennian_SMW_Template.docx");

  if (error || !templateBlob) {
    // No template uploaded yet — return minimal placeholder docx
    const minDocx = buildMinimalSMWDocx(data);
    return {
      blob: new Blob([minDocx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      filename,
    };
  }

  const buffer = await templateBlob.arrayBuffer();
  const entries = await parseZip(buffer);

  const xmlEntry = entries.get("word/document.xml");
  if (!xmlEntry) throw new Error("Invalid docx: missing word/document.xml");

  let xml = new TextDecoder("utf-8").decode(xmlEntry);
  xml = applyPlaceholders(xml, data);

  entries.set("word/document.xml", new TextEncoder().encode(xml));
  const zipBytes = buildZip(entries);

  return {
    blob: new Blob([zipBytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    filename,
  };
}
