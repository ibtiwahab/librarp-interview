import path from "node:path";
import { AppError } from "../../utils/errors.js";

export const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".docx", ".pdf", ".txt"] as const;
export type SupportedKind = "xlsx" | "xls" | "csv" | "docx" | "pdf" | "txt";

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE_CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF

const EXECUTABLE_SIGNATURES: Array<{ bytes: number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: "Windows executable" }, // MZ
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: "ELF binary" },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: "Mach-O binary" },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], label: "Mach-O binary" },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: "Java class / Mach-O fat binary" },
  { bytes: [0x23, 0x21], label: "script" }, // #!
];

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

/** True when the buffer looks like human-readable text (UTF-8/UTF-16 with BOM). */
export function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  if (startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])) return true;
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) control++;
  }
  return control / sample.length < 0.02;
}

/**
 * Determines the real document type from its content, not the extension.
 * The extension must agree with the content, and executables are rejected.
 */
export function detectDocumentKind(fileName: string, buf: Buffer): SupportedKind {
  const ext = path.extname(fileName).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new AppError("UNSUPPORTED_FILE_TYPE", `This file type is not supported. Upload one of: ${SUPPORTED_EXTENSIONS.join(", ")}.`);
  }
  if (buf.length === 0) throw new AppError("UNPARSEABLE_FILE", "The uploaded file is empty.");

  const exe = EXECUTABLE_SIGNATURES.find((s) => startsWith(buf, s.bytes));
  if (exe && ext !== ".txt" && ext !== ".csv") {
    throw new AppError("UNSUPPORTED_FILE_TYPE", `This file appears to be a ${exe.label}, which is not allowed.`);
  }

  const mismatch = () =>
    new AppError(
      "UNSUPPORTED_FILE_TYPE",
      `The file contents do not match the ${ext} extension. Re-export the document and try again.`,
    );

  switch (ext) {
    case ".docx":
    case ".xlsx":
      if (!startsWith(buf, ZIP)) throw mismatch();
      return ext === ".docx" ? "docx" : "xlsx";
    case ".xls":
      // Legacy BIFF (OLE compound file). Some exporters write XLSX or HTML with .xls — accept XLSX.
      if (startsWith(buf, OLE_CFB)) return "xls";
      if (startsWith(buf, ZIP)) return "xlsx";
      throw mismatch();
    case ".pdf": {
      // %PDF may be preceded by a little junk; the spec allows it within the first 1 KB.
      const head = buf.subarray(0, 1024);
      if (!head.includes(Buffer.from(PDF))) throw mismatch();
      return "pdf";
    }
    case ".csv":
    case ".txt":
      if (exe || !looksLikeText(buf)) {
        throw new AppError("UNSUPPORTED_FILE_TYPE", `This ${ext} file does not contain plain text.`);
      }
      return ext === ".csv" ? "csv" : "txt";
    default:
      throw mismatch();
  }
}

export function decodeText(buf: Buffer): string {
  if (startsWith(buf, [0xff, 0xfe])) return buf.subarray(2).toString("utf16le");
  if (startsWith(buf, [0xfe, 0xff])) {
    const swapped = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const text = buf.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
