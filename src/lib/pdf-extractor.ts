import { safeFetch } from "@/lib/safe-outbound-fetch";
import { extractText } from "unpdf";

const PDF_FETCH_MAX_BYTES = 50 * 1024 * 1024;

export async function extractPdfTextByPage(url: string): Promise<string[]> {
  const response = await safeFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
    },
    signal: AbortSignal.timeout(20000),
    maxResponseBytes: PDF_FETCH_MAX_BYTES,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    throw new Error("URL did not return a PDF document.");
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  const result = await extractText(data);

  return result.text
    .map((pageText) => pageText.replace(/\s+/g, " ").trim())
    .filter((pageText) => pageText.length > 0);
}
