/**
 * Helpers for reading just enough HTML to parse Open Graph / Twitter metadata.
 * Full marketing pages (e.g. Webflow) can be hundreds of KB; OG tags live in <head>.
 */

/** Stop reading once we have a complete head, or hit this safety cap. */
export const OG_HTML_READ_MAX_BYTES = 512 * 1024;

const HEAD_CLOSE_TAG = "</head>";

/** Returns HTML truncated at `</head>` (inclusive), or the full string if absent. */
export function truncateHtmlAtHead(html: string): string {
  const idx = html.toLowerCase().indexOf(HEAD_CLOSE_TAG);
  if (idx === -1) return html;
  return html.slice(0, idx + HEAD_CLOSE_TAG.length);
}

/**
 * Reads a response body until `</head>` or {@link OG_HTML_READ_MAX_BYTES}.
 * Cancels the underlying stream early so large bodies are not fully downloaded.
 */
export async function readHtmlForOpenGraph(
  response: Response,
  maxBytes: number = OG_HTML_READ_MAX_BYTES,
): Promise<string> {
  if (!response.body) {
    const html = await response.text();
    return truncateHtmlAtHead(html);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let html = "";
  let consumed = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      const remaining = maxBytes - consumed;
      if (remaining <= 0) break;

      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      consumed += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });

      const closeIdx = html.toLowerCase().indexOf(HEAD_CLOSE_TAG);
      if (closeIdx >= 0) {
        html = html.slice(0, closeIdx + HEAD_CLOSE_TAG.length);
        await reader.cancel().catch(() => {});
        return html;
      }

      if (consumed >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }

  html += decoder.decode();
  return truncateHtmlAtHead(html);
}
