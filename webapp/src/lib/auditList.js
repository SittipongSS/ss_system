// ── หน้าบันทึกการใช้งาน (/audit) — เพดานการโหลด · ป้ายจำนวน · ตัวเลือก "ผู้ทำ" ─────────────
//
// 🐞 (ตรวจตัวเลข H4 · 2026-10-08) หัวแผงขึ้น "500 รายการ" และท้ายตาราง "ทั้งหมด 500 รายการ" **ทุกช่วงเวลา**
//    — 500 คือเพดาน `limit` ของ API (บันทึกล่าสุด 500 แถว) ไม่ใช่ยอดจริง · 3 เดือนกับ "ทั้งหมด" จึงได้เลขเดียวกัน
//    และตัวเลือก "ผู้ทำ" สร้างจาก 500 แถวนั้น ⇒ คนที่ทำรายการเก่ากว่าแถวที่ 500 ไม่มีให้เลือกเลย
// ⇒ API นับยอดจริงตามตัวกรองเดียวกัน (`count: 'exact'`) · ป้ายพูดว่าเห็นกี่แถวจากเท่าไร ·
//    ตัวเลือกผู้ทำมาจากทะเบียนผู้ใช้ (ทุกคน) รวมกับผู้ทำที่เห็นในแถว (บัญชีที่ถูกลบไปแล้ว)
import { fmtNumber } from '@/lib/format';

export const AUDIT_DEFAULT_LIMIT = 500;
export const AUDIT_MAX_LIMIT = 2000;

/** เพดานแถวต่อคำขอ — ค่าว่าง/อ่านไม่ออก = ค่าตั้งต้น · เกินเพดาน = เพดาน */
export function auditLimit(raw) {
  const n = parseInt(raw ?? '', 10);
  return Math.min(Number.isFinite(n) && n > 0 ? n : AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT);
}

/** โหลดมาไม่ครบชุดหรือเปล่า — `total` ไม่รู้ (null) = ถือว่าครบ (ไม่เดาว่าขาด) */
export function auditTruncated({ shown = 0, total = null } = {}) {
  return Number.isFinite(total) && total > shown;
}

/** ป้ายจำนวนบนหัวแผง — "8 รายการ" หรือ "500 ล่าสุด จาก 12,345 รายการ" */
export function auditCountText({ shown = 0, total = null } = {}) {
  if (!auditTruncated({ shown, total })) return `${fmtNumber(shown)} รายการ`;
  return `${fmtNumber(shown)} ล่าสุด จาก ${fmtNumber(total)} รายการ`;
}

/**
 * ตัวเลือก "ผู้ทำ" → [[actorId, ชื่อ]] เรียงตามชื่อ
 * @param directory ผู้ใช้ทั้งระบบ `[{ id, name }]` (ฝั่ง server · รวมบัญชีที่ปิดแล้ว)
 * @param rows      แถวที่โหลดมา — เติมผู้ทำที่ไม่อยู่ในทะเบียน (บัญชีถูกลบ · บัญชีจำลองตอนทดสอบ)
 * ⚠️ ชื่อจากทะเบียนชนะชื่อในแถว — แถวเก็บชื่อ ณ วันที่ทำ ซึ่งอาจเป็นชื่อเก่า
 */
export function auditActorOptions(directory = [], rows = []) {
  const byId = new Map();
  for (const u of directory || []) {
    if (u?.id) byId.set(u.id, u.name || u.id);
  }
  for (const r of rows || []) {
    if (r?.actorId && !byId.has(r.actorId)) byId.set(r.actorId, r.actorName || r.actorId);
  }
  return [...byId.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'th'));
}
