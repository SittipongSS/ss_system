// ── ปุ่มแอดมิน "บังคับรีเฟรชทุกคน" (มติเจ้าของ 25/09/2026) — logic ล้วน ใช้ทั้งจอและ route ────────
//
// ⭐ **ทริกจากแอดมินกดเท่านั้น** — มติ: "ขอเป็นบังคับรีเฟรชแบบ modal ส่วนการจะรีเฟรช ขอให้แอดมินกดเองพอ
//   อันอื่นไม่ต้อง" ⇒ 🔄 แทนตัวเช็กเวอร์ชันหลัง deploy ของ #1829 (แถบ + รีโหลดเมื่อเปลี่ยนหน้า) ที่ถอดทิ้งแล้ว
//   ห้ามเติมทริกอื่นกลับ (deploy · เปลี่ยน role) โดยไม่ถามเจ้าของ
// ⭐ **สัญญาณ = แถว audit_logs ล่าสุด** (entityType 'system' · entityId 'force-refresh') — ไม่ต้องมีตารางใหม่
//   และได้ร่องรอยว่าใครกดเมื่อไรในหน้า /audit ไปพร้อมกัน · ดัชนี (entityType, entityId) ของ mig 0049 รับคำถามนี้
// ⭐ แต่ละแท็บจำ "เวลาสั่งล่าสุดที่รู้ตอนเปิดหน้า" ไว้ แล้วถามซ้ำเป็นระยะ · ได้เวลาที่ใหม่กว่า = แอดมินสั่งหลังจาก
//   หน้านี้เปิด ⇒ หน้าต่างบังคับรีเฟรช (ปิดไม่ได้) · รีโหลดแล้วหน้าใหม่รู้เวลานี้ตั้งแต่ต้น จึงไม่วน

export const FORCE_REFRESH_SIGNAL = Object.freeze({
  entityType: 'system',
  entityId: 'force-refresh',
  action: 'force_refresh',
});

/** ถามทุก 1 นาทีเฉพาะตอนแท็บเปิดอยู่ · กลับมาดูแท็บ = ถามทันที (ไม่ถี่เกิน 20 วินาที) */
export const FORCE_REFRESH_POLL_MS = 60 * 1000;
export const FORCE_REFRESH_MIN_GAP_MS = 20 * 1000;

/** แท็บของแอดมินที่เพิ่งกด แจ้งตัวเฝ้าในแท็บเดียวกันว่า "รู้แล้ว" — ไม่ต้องเด้งหน้าต่างใส่คนกด */
export const FORCE_REFRESH_ISSUED_EVENT = 'ss:force-refresh-issued';

const timeOf = (value) => {
  const t = Date.parse(String(value ?? ''));
  return Number.isFinite(t) ? t : null;
};

/**
 * แอดมินสั่งรีเฟรชหลังจากที่หน้านี้เปิดไหม
 * @param baseline เวลาสั่งล่าสุดที่หน้านี้รู้ตอนเปิด — `undefined` = ยังถามไม่สำเร็จสักครั้ง (ไม่รู้ ⇒ ไม่เด้ง) ·
 *                 `null` = ถามแล้ว ยังไม่เคยมีใครสั่ง
 * @param at       เวลาสั่งล่าสุดที่เพิ่งถามได้
 */
export function isNewerSignal(baseline, at) {
  if (baseline === undefined) return false;
  const next = timeOf(at);
  if (next === null) return false;
  const known = timeOf(baseline);
  return known === null || next > known;
}
