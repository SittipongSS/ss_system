// ── ย่อ user agent ให้คนอ่านรู้เรื่อง (mig 0223) ─────────────────────────
//
// ⚠️ **ย่อเพื่อ "แสดงผล" เท่านั้น** — ค่าที่ส่งขึ้น server และเก็บใน `userAgent`
// ยังเป็นสตริงเต็มเสมอ เพราะรายละเอียดที่ตัดทิ้งตรงนี้ (build number, engine)
// คือสิ่งที่คนไล่บั๊กต้องใช้ตอนเจอเคสเฉพาะเบราว์เซอร์
//
// ที่มา: เปิดของจริงแล้วเห็นว่าแถบบริบทขึ้นว่า
//   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Geck…"
// ซึ่งกินทั้งบรรทัดแล้วยังถูกตัดกลางคำ · ผู้ใช้อ่านไม่ออกว่าระบบเก็บอะไรไป
// ซึ่งขัดกับเหตุผลที่โชว์แถบนี้ตั้งแต่แรก (มติ Q6: บอกให้รู้ว่าเก็บอะไร)

const BROWSERS = [
  // ⚠️ ลำดับสำคัญ: Edge/Opera/Samsung ใส่คำว่า "Chrome" ไว้ใน UA ของตัวเองด้วย
  // เช็คตัวที่เจาะจงกว่าก่อนเสมอ ไม่งั้นทุกอย่างกลายเป็น Chrome
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/Chrome\/(\d+)/, 'Chrome'],
  // Safari ต้องอยู่ท้ายสุด — เบราว์เซอร์เกือบทุกตัวมีคำว่า Safari ใน UA
  [/Version\/(\d+).*Safari/, 'Safari'],
];

const PLATFORMS = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Windows NT 10/, 'Windows'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/**
 * "Chrome 141 · macOS" — คืนสตริงเดิมแบบตัดสั้นเมื่อจับรูปแบบไม่ได้
 * (ไม่คืนค่าว่าง: เดาไม่ออกยังดีกว่าไม่บอกอะไรเลย)
 */
export function shortUserAgent(ua) {
  const raw = String(ua || '').trim();
  if (!raw) return '';

  let browser = null;
  for (const [pattern, name] of BROWSERS) {
    const match = raw.match(pattern);
    if (match) { browser = `${name} ${match[1]}`; break; }
  }

  let platform = null;
  for (const [pattern, name] of PLATFORMS) {
    if (pattern.test(raw)) { platform = name; break; }
  }

  if (browser && platform) return `${browser} · ${platform}`;
  return browser || platform || raw.slice(0, 60);
}
