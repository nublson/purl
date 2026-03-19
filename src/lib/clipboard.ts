export async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  // Fallback for older browsers or restrictive clipboard environments.
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!ok) throw new Error("execCommand copy failed");
}
