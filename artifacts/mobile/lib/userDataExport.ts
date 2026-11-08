import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { strToU8, zipSync } from "fflate";

export type ExportFormat = "json" | "xlsx" | "csv";

export type ExportTable = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export type UserDataExport = {
  schema_version: string;
  exported_at: string;
  account: { user_id: string; email: string | null };
  included_types: string[];
  tables: Record<string, ExportTable>;
};

type BuiltFile = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

const TABLE_ORDER = [
  "profiles",
  "posts",
  "post_images",
  "messages",
  "following",
  "followers",
  "story_likes",
  "xp_activity_log",
  "referrals",
  "acoin_transactions",
  "xp_transfers",
];

const TABLE_TITLES: Record<string, string> = {
  profiles: "Profile",
  posts: "Posts",
  post_images: "Post Images",
  messages: "Messages",
  following: "Following",
  followers: "Followers",
  story_likes: "Story Likes",
  xp_activity_log: "XP Activity",
  referrals: "Referrals",
  acoin_transactions: "ACoin Transactions",
  xp_transfers: "XP Transfers",
};

function dateStamp(iso: string): string {
  return (iso || new Date().toISOString()).slice(0, 10);
}

function orderedTables(data: UserDataExport): [string, ExportTable][] {
  const keys = Object.keys(data.tables ?? {});
  const ordered = [
    ...TABLE_ORDER.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !TABLE_ORDER.includes(key)).sort(),
  ];
  return ordered.map((key) => [
    key,
    data.tables[key] ?? { columns: [], rows: [] },
  ]);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function xmlEscape(value: unknown): string {
  return cellText(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function sheetName(source: string, used: Set<string>): string {
  const base = (TABLE_TITLES[source] ?? source)
    .replace(/[\\/?*:[\]]/g, " ")
    .trim()
    .slice(0, 31) || "Data";
  let result = base;
  let suffix = 2;
  while (used.has(result.toLowerCase())) {
    const ending = ` ${suffix++}`;
    result = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(result.toLowerCase());
  return result;
}

function toWorksheetXml(table: ExportTable): string {
  const columns = table.columns.length
    ? table.columns
    : Array.from(new Set(table.rows.flatMap((row) => Object.keys(row))));
  const rowCount = Math.max(1, table.rows.length + 1);
  const lastColumn = columnName(Math.max(0, columns.length - 1));
  const dimension = `${columns.length ? "A1" : "A1"}:${lastColumn}${rowCount}`;

  const widthXml = columns.map((column, columnIndex) => {
    const longestValue = table.rows.slice(0, 100).reduce((longest, row) => {
      return Math.max(longest, Math.min(cellText(row[column]).length, 60));
    }, column.length);
    const width = Math.max(12, Math.min(42, longestValue + 2));
    const index = columnIndex + 1;
    return `<col min="${index}" max="${index}" width="${width}" customWidth="1"/>`;
  }).join("");

  const headerCells = columns.map((column, index) => {
    const ref = `${columnName(index)}1`;
    return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(column)}</t></is></c>`;
  }).join("");
  const rowXml = table.rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = columns.map((column, columnIndex) => {
      const value = row[column];
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      if (value === null || value === undefined) return `<c r="${ref}"/>`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      if (typeof value === "boolean") {
        return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const autoFilter = columns.length > 0
    ? `<autoFilter ref="A1:${lastColumn}${rowCount}"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${widthXml}</cols>
  <sheetData><row r="1" ht="24" customHeight="1">${headerCells}</row>${rowXml}</sheetData>
  ${autoFilter}
</worksheet>`;
}

function buildXlsx(data: UserDataExport): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const tables = orderedTables(data);
  const usedSheetNames = new Set<string>();
  const sheets = [
    {
      name: "Export Info",
      table: {
        columns: ["Field", "Value"],
        rows: [
          { Field: "Exported at", Value: data.exported_at },
          { Field: "Account ID", Value: data.account?.user_id ?? "" },
          { Field: "Account email", Value: data.account?.email ?? "" },
          { Field: "Schema version", Value: data.schema_version },
          { Field: "Included categories", Value: (data.included_types ?? []).join(", ") },
        ],
      } satisfies ExportTable,
    },
    ...tables.map(([key, table]) => ({
      name: sheetName(key, usedSheetNames),
      table,
    })),
  ];
  usedSheetNames.add("export info");

  const contentOverrides = sheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const sheetRelationships = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");

  files["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentOverrides}
</Types>`);
  files["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  files["xl/workbook.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  files["xl/styles.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF273A67"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(toWorksheetXml(sheet.table));
  });

  return zipSync(files, { level: 6 });
}

function csvCell(value: unknown): string {
  let text = cellText(value);
  // Prevent spreadsheet applications from evaluating untrusted exported text.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvArchive(data: UserDataExport): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      "AfuChat data export. Each CSV contains one database table with a header row. " +
      `Exported at: ${data.exported_at}\nAccount ID: ${data.account?.user_id ?? ""}\n`,
    ),
    "export-info.csv": strToU8(
      `Field,Value\r\n${[
        ["Exported at", data.exported_at],
        ["Account ID", data.account?.user_id ?? ""],
        ["Account email", data.account?.email ?? ""],
        ["Schema version", data.schema_version],
        ["Included categories", (data.included_types ?? []).join(", ")],
      ].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`,
    ),
  };

  for (const [key, table] of orderedTables(data)) {
    const columns = table.columns.length
      ? table.columns
      : Array.from(new Set(table.rows.flatMap((row) => Object.keys(row))));
    const lines = [
      columns.map(csvCell).join(","),
      ...table.rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ];
    files[`${key}.csv`] = strToU8(`\uFEFF${lines.join("\r\n")}\r\n`);
  }
  return zipSync(files, { level: 6 });
}

function buildFile(data: UserDataExport, format: ExportFormat): BuiltFile {
  const stamp = dateStamp(data.exported_at);
  if (format === "xlsx") {
    return {
      fileName: `afuchat-data-export-${stamp}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: buildXlsx(data),
    };
  }
  if (format === "csv") {
    return {
      fileName: `afuchat-data-export-${stamp}-csv.zip`,
      mimeType: "application/zip",
      bytes: buildCsvArchive(data),
    };
  }
  return {
    fileName: `afuchat-data-export-${stamp}.json`,
    mimeType: "application/json",
    bytes: strToU8(JSON.stringify(data, null, 2)),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function downloadOnWeb(file: BuiltFile): void {
  const copy = new ArrayBuffer(file.bytes.byteLength);
  new Uint8Array(copy).set(file.bytes);
  const blob = new Blob([copy], { type: file.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function saveAndShareUserDataExport(
  data: UserDataExport,
  format: ExportFormat,
): Promise<string> {
  const file = buildFile(data, format);

  if (Platform.OS === "web") {
    downloadOnWeb(file);
    return file.fileName;
  }

  const baseDirectory = FileSystem.documentDirectory;
  if (!baseDirectory) throw new Error("Device storage is unavailable. The export was not saved.");

  const directory = `${baseDirectory}afuchat_exports/`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }

  const uri = `${directory}${file.fileName}`;
  const encoded = format === "json"
    ? JSON.stringify(data, null, 2)
    : bytesToBase64(file.bytes);
  await FileSystem.writeAsStringAsync(uri, encoded, {
    encoding: format === "json" ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64,
  });

  const saved = await FileSystem.getInfoAsync(uri);
  if (!saved.exists || (typeof saved.size === "number" && saved.size === 0)) {
    throw new Error("The export file could not be verified on the device.");
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("The file was saved, but this device cannot open the share menu.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: file.mimeType,
    dialogTitle: `Save or open ${file.fileName}`,
    UTI: format === "xlsx"
      ? "org.openxmlformats.spreadsheetml.sheet"
      : format === "json"
        ? "public.json"
        : "public.zip-archive",
  });
  return file.fileName;
}
