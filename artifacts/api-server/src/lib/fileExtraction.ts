import path from "node:path";

export interface FileExtractionResult {
  kind: "text" | "rows";
  text?: string;
  rows?: string[][];
}

/**
 * Extracts content from an uploaded MCQ source file, regardless of format.
 * .xlsx/.xls/.csv return structured rows (best for column-mapped imports);
 * .pdf/.docx/.txt return raw text (for pattern-based extraction).
 */
export async function extractFileContent(buffer: Buffer, originalName: string, mimeType: string): Promise<FileExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls" || mimeType.includes("spreadsheet") || mimeType.includes("ms-excel")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
    return { kind: "rows", rows };
  }

  if (ext === ".csv" || mimeType.includes("csv")) {
    const text = buffer.toString("utf8");
    const rows = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => parseCsvLine(line));
    return { kind: "rows", rows };
  }

  if (ext === ".pdf" || mimeType === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return { kind: "text", text: result.text };
  }

  if (ext === ".docx" || mimeType.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { kind: "text", text: result.value };
  }

  // Fallback: treat as plain text (.txt and anything else we don't recognize)
  return { kind: "text", text: buffer.toString("utf8") };
}

/** Minimal CSV line parser handling quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else current += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
