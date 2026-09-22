// ── ตำแหน่งเต็มบนช่องลงนามของเอกสาร (QT · SO · FM-SA-04) ─────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-09-22 "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม" + "ปรับการแสดงชื่อตำแหน่งในใบ QT และ SO ด้วย"
//   ช่องลงนามทุกช่องพิมพ์ **ตำแหน่งภาษาอังกฤษแบบเต็ม** — ห้ามคำย่ออย่าง "AE" · "AE Supervisor" ·
//   "AE เจ้าของดีล" ที่เคยพิมพ์ (คนนอกบริษัทที่ถือกระดาษอ่านคำย่อภายในไม่ออก)
//
// ⚠️ **ที่เดียวของคำพวกนี้** — ใบเสนอราคา ใบสั่งขาย และ FM-SA-04 เรียกตัวนี้ทั้งหมด
//    เขียนคำเองที่ปลายทางเมื่อไร สามเอกสารจะเรียกตำแหน่งเดียวกันคนละคำอีก (บทเรียน `ROLE_LABELS`
//    ที่ยังมี "Account Coordinate" สะกดผิดอยู่ — ป้ายชุดนั้นเป็นของจอ ไม่ใช่ของกระดาษ จึงไม่ใช้ร่วม)
// ⚠️ ตำแหน่งบนกระดาษคือ **ตำแหน่งของคนที่เซ็นจริง** (`document_signature_evidence.signerRole` ·
//    role ในบัญชีของผู้ประทับตรา) ไม่ใช่ตำแหน่งที่ช่องนั้น "ควรเป็น" — admin กดแทนได้ทุกขั้น
//    ถ้าพิมพ์ตำแหน่งของช่องจะได้ชื่อคนหนึ่งคู่ตำแหน่งที่เขาไม่ได้ดำรง · ตำแหน่งของช่องเป็นค่าสำรอง
//    เฉพาะช่องที่ยังไม่มีใครเซ็น (หรือหลักฐานไม่บอก role)
// ⚠️ คำอังกฤษทั้งใบไทยและใบอังกฤษ — ตำแหน่งเป็นชื่อเฉพาะที่พิมพ์บนนามบัตรเป็นอังกฤษอยู่แล้ว
import { normalizeRole } from '@/lib/permissions';

/* role (โค้ดในบัญชี / signerRole ในหลักฐาน) → ตำแหน่งเต็ม
   ⚠️ เพิ่ม role ใหม่ใน `ROLES` (permissions.js) ต้องเติมที่นี่ — เทสต์ไล่ทุก role ที่เซ็นเอกสารได้
   `viewer` ไม่มีตำแหน่งโดยตั้งใจ (อ่านอย่างเดียว เซ็นอะไรไม่ได้) ⇒ ตกไปค่าสำรองของช่อง */
export const POSITION_TITLES = Object.freeze({
  admin: 'Administrator',
  secretary: 'Secretary',
  executive: 'Executive',
  ae_supervisor: 'Account Executive Supervisor',
  senior_ae: 'Senior Account Executive',
  ae: 'Account Executive',
  ac: 'Account Coordinator',
  marketing: 'Marketing Officer',
  ra: 'Regulatory Affairs Officer',
  rd: 'Research and Development Officer',
  rd_perfumer: 'Perfumer',
  rd_chemist: 'Product Development Chemist',
  rd_coordinator: 'Project Coordinator',
  rd_supervisor: 'Research and Development Supervisor',
  finance: 'Finance Officer',
  pc: 'Purchasing Officer',
  pd: 'Production Officer',
  wh: 'Warehouse Officer',
  qc: 'Quality Control Officer',
  ts: 'Technical Service Officer',
  ts_planner: 'Technical Service Planner',
  ts_senior: 'Senior Technical Service Officer',
  ts_audit: 'Technical Service Auditor',
  ts_manager: 'Assistant Technical Service Manager',
});

/**
 * ตำแหน่งเต็มของ role — ไม่รู้จัก/ว่าง = `fallback`
 *
 * @param {string|null|undefined} role  โค้ด role (`ae` · `senior_ae` · `ae_supervisor` · `ac` · `finance` · `admin` …)
 * @param {string} [fallback]  คำที่พิมพ์เมื่อไม่รู้ตำแหน่ง — ปกติคือตำแหน่งของช่องนั้น (`positionTitle('ae')`)
 * @returns {string}
 */
export function positionTitle(role, fallback = '') {
  const code = normalizeRole(String(role ?? '').trim().toLowerCase());
  return POSITION_TITLES[code] || fallback;
}
