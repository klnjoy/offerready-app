/* Client-side resume text extraction (was window.OfferReadyResume in
 * content/assets/resume-extract.js). The raw file never leaves the browser;
 * only extracted text is sent, transiently, for one gap-analysis call.
 * Parsers are code-split and load only when a file of that type is picked. */

const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_RESUME_CHARS = 16000; // matches the API resume cap
const MAX_PDF_PAGES = 12;

export interface ExtractedResume {
  text: string;
  meta: { fileName: string; fileType: "pdf" | "docx" | "txt"; chars: number };
}

function clean(text: string): string {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESUME_CHARS);
}

function kindOf(file: File): "pdf" | "docx" | "txt" | null {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type.includes("pdf") || /\.pdf$/.test(name)) return "pdf";
  if (type.includes("word") || type.includes("officedocument") || /\.docx?$/.test(name)) return "docx";
  if (type.includes("text") || /\.(txt|md)$/.test(name)) return "txt";
  return null;
}

async function extractPdf(file: File): Promise<string> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new Error("Could not load the PDF reader. Check your connection.");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return out.join("\n");
}

async function extractDocx(file: File): Promise<string> {
  let mammoth: typeof import("mammoth").default;
  try {
    mammoth = (await import("mammoth")).default;
  } catch {
    throw new Error("Could not load the DOCX reader. Check your connection.");
  }
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return res?.value || "";
}

/** Rejects with a user-facing Error on any failure. */
export async function extractResume(file: File): Promise<ExtractedResume> {
  if (!file) throw new Error("No file selected.");
  if (file.size > MAX_BYTES) throw new Error("That file is larger than 8 MB. Please upload a smaller resume.");
  const kind = kindOf(file);
  if (!kind) throw new Error("Unsupported file. Upload a PDF, DOCX, or TXT resume.");
  const raw = kind === "pdf" ? await extractPdf(file) : kind === "docx" ? await extractDocx(file) : await file.text();
  const text = clean(raw);
  if (text.length < 40) {
    throw new Error("Couldn't read enough text from that file. If it's a scanned PDF, paste your resume text instead.");
  }
  return { text, meta: { fileName: file.name || "resume", fileType: kind, chars: text.length } };
}
