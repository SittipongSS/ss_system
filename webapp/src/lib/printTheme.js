export const PRINT_FONT_STACK = "'IBM Plex Sans Thai', 'Noto Sans Thai', Tahoma, Arial, sans-serif";
// PRINT_MONO_STACK ถูกลบ (2026-08-09) — ไม่มีใครเรียกเลยแม้แต่จุดเดียว และระบบ
// เหลือตัวพิมพ์เดียวแล้ว · เอกสารพิมพ์ไม่ผูกกับ --font-sans จึงไม่เปลี่ยนตาม

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export function printPlaceholderHtml({
  title = "กำลังเตรียมเอกสาร",
  message = "กำลังเตรียมเอกสาร…",
  tone = "neutral",
  closeButton = false,
} = {}) {
  const error = tone === "error";
  const color = error ? "#8b2f2f" : "#334155";
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      display: grid;
      min-height: 80vh;
      margin: 0;
      padding: 32px;
      place-items: center;
      box-sizing: border-box;
      color: ${color};
      font-family: ${PRINT_FONT_STACK};
      text-align: center;
    }
    p { max-width: 620px; margin: 0; line-height: 1.65; }
    button {
      margin-top: 16px;
      padding: 8px 14px;
      border: 1px solid currentColor;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    ${error ? `<h2>${escapeHtml(title)}</h2>` : ""}
    <p>${escapeHtml(message)}</p>
    ${closeButton ? '<button type="button" onclick="window.close()">ปิดหน้าต่าง</button>' : ""}
  </main>
</body>
</html>`;
}
