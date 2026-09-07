// ── อ่านความยาวของโทเคน CSS ออกมาเป็น px จริง ─────────────────────────────
//
// 🐞 **บั๊กจริง (พบ 2026-09-07 ตอน UAT):** `DetailOverview` หาเส้นตัดของแถบตรึง
// หัวใบด้วย
//     Number.parseFloat(getComputedStyle(root).getPropertyValue('--scroll-anchor-top'))
// แต่โทเคนนั้นเป็น `calc()` ที่เบราว์เซอร์ **ไม่คลี่ให้ตอนอ่านผ่าน
// getPropertyValue** — ค่าที่ได้คือสตริง `"calc(52px + 0px + 49px + 12px)"`
// ⇒ `parseFloat` คืน **NaN ทุกครั้ง** ⇒ โค้ดตกไปใช้ค่าคงที่ 106 ตลอดกาล
//
// วัดจริงที่จอกว้าง 1100px: ค่าจริง **113px** แต่โค้ดใช้ 106 ⇒ เพี้ยน 7px
// และที่แย่กว่านั้น — `window.addEventListener('resize', attach)` ที่เขียนไว้เพื่อ
// "ผูกตัวจับใหม่เมื่อเส้นตัดเปลี่ยนตามความกว้างจอ" **ไม่มีความหมายเลย** เพราะค่า
// ที่อ่านได้ไม่เคยเปลี่ยน (NaN → 106 เสมอ)
//
// ⚠️ อย่าแก้ด้วยการบวกโทเคนย่อยเองใน JS (`--topbar-h + --sysbar-h + …`) — สูตร
// จะมีสองที่ที่ต้องแก้พร้อมกัน แล้ววันหนึ่งมันจะไม่ตรงกันโดยไม่มีอะไรฟ้อง
// ⇒ ให้ **เบราว์เซอร์คำนวณให้** ด้วยกล่องวัดที่สูงเท่าโทเคน แล้วอ่านความสูงจริง

/** ค่าที่เป็น px ตรง ๆ อ่านได้ทันทีไม่ต้องแตะ DOM — คืน null ถ้าไม่ใช่ */
export function plainPx(raw) {
  const text = String(raw ?? '').trim();
  if (!/^-?\d*\.?\d+px$/.test(text)) return null;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * ความยาวของโทเคน CSS เป็น px — รองรับ `calc()` เพราะให้เบราว์เซอร์คำนวณเอง
 *
 * @param name     ชื่อโทเคน เช่น `--scroll-anchor-top`
 * @param fallback ค่าที่ใช้เมื่ออ่านไม่ได้จริง ๆ (ไม่มี DOM · ไม่มีโทเคนนี้)
 */
export function cssLengthPx(name, fallback = 0) {
  if (typeof document === 'undefined' || !document.body) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  if (!String(raw).trim()) return fallback;      // ไม่มีโทเคนนี้ประกาศไว้เลย
  const direct = plainPx(raw);
  if (direct !== null) return direct;            // ค่าตรง ๆ ไม่ต้องเสียรอบวัด

  /* กล่องวัด: สูงเท่าโทเคน กว้าง 0 มองไม่เห็น และไม่กินคลิก
     ⚠️ ต้องแปะบน body จริง — element ที่ยังไม่อยู่ในเอกสารได้ความสูง 0 เสมอ */
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:var(${name})`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(px) && px > 0 ? px : fallback;
}
