// ── แก้ PDR แล้วต้องเห็นว่า "เดิมเป็นอะไร" ────────────────────────────────
//
// ⭐ ที่มา (มติผู้ใช้ 2026-08-12 · IS-26080021): พอฝ่ายปลายทางรับเรื่อง สิทธิ์แก้ PDR
// ย้ายไปเป็นของเขาทั้งใบ (`pdrEdit.js`) — RD แก้บรีฟที่ SA เขียนมาได้ทุกช่อง
// **แต่ SA ไม่มีทางรู้ว่าถูกแก้อะไร** เพราะ action `pdr` เขียนทับแล้วลงเธรดว่า
// "แก้แบบฟอร์ม PDR" ลอย ๆ ⇒ ค่าที่หายไปไม่มีร่องรอย
//
// ⚠️ **ไม่ทำตารางประวัติใหม่** — เธรดของใบมีอยู่แล้ว ยิงแจ้งเตือนให้เองอยู่แล้ว
// (`appendUpdate` → `notifyThreadUpdate`) และเป็นที่ที่คนไปอ่านอยู่แล้ว · ตารางใหม่
// = ที่ที่สองที่ต้องเปิดดู ซึ่งแปลว่าไม่มีใครเปิด
//
// ⚠️ ป้ายช่องมาจากทะเบียนกลาง `pdrFields.js` เสมอ — เขียนคำเองที่นี่เมื่อไร
// เธรดจะเรียกช่องคนละชื่อกับที่ตาเห็นบนฟอร์ม (โรคเดิมที่ PDR โดนมาแล้วสามจอ)
import { PDR_FIELDS, pdrIsArrayField } from '@/lib/requests/pdrFields';

const FIELD_BY_COLUMN = Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.column, f]),
);

// ยาวเกินนี้ในบรรทัดเดียวของเธรดอ่านไม่ออก — ตัดแล้วใส่ … ให้รู้ว่ายังมีต่อ
const CLIP = 60;
// ⚠️ เพดานจำนวนบรรทัด: PDR มี 48 ช่อง · แก้ทีเดียวหลายสิบช่องแล้วเธรดกลายเป็นกำแพง
// ข้อความที่ไม่มีใครอ่าน ⇒ โชว์ที่เปลี่ยนจริงกี่ช่องไว้ท้ายแทน
const MAX_LINES = 8;

const clip = (s) => (s.length > CLIP ? `${s.slice(0, CLIP - 1)}…` : s);

/** ค่าหนึ่งช่อง → ข้อความอ่านออก · ว่าง = "(ว่าง)" ไม่ใช่สตริงเปล่า */
function readable(field, value) {
  if (pdrIsArrayField(field)) {
    const list = (Array.isArray(value) ? value : []).map((v) => String(v ?? '').trim()).filter(Boolean);
    return list.length ? clip(list.join(', ')) : '(ว่าง)';
  }
  const text = String(value ?? '').trim();
  return text ? clip(text) : '(ว่าง)';
}

/** เท่ากันไหม — อาเรย์เทียบตามลำดับหลัง normalize แล้ว (normalizePdr จัดให้ตรงกันอยู่แล้ว) */
function same(field, a, b) {
  if (pdrIsArrayField(field)) {
    const norm = (v) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean);
    const x = norm(a); const y = norm(b);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/**
 * ช่องไหนเปลี่ยนบ้าง — คืนอาเรย์ข้อความ `"ป้ายช่อง: เดิม → ใหม่"`
 *
 * @param {object} before  แถวคำร้องก่อนแก้ (คีย์เป็นชื่อคอลัมน์)
 * @param {object} columns ค่าที่จะเขียนลง (ผลจาก `normalizePdr` — คีย์เป็นชื่อคอลัมน์)
 *
 * ⚠️ วนจาก `columns` ไม่ใช่จากทะเบียนทั้งชุด — ผู้เรียกที่แก้แค่บางส่วนส่งมาไม่ครบ
 * ทุกช่อง การวนทะเบียนจะอ่านช่องที่ไม่ได้ส่งมาเป็น "ถูกล้างเป็นว่าง" ทั้งแผง
 */
export function pdrChangeLines(before = {}, columns = {}) {
  const lines = [];
  for (const [column, next] of Object.entries(columns)) {
    const field = FIELD_BY_COLUMN[column];
    if (!field) continue;                       // คอลัมน์ที่ไม่ได้อยู่ในทะเบียน = ไม่ใช่ช่องที่คนกรอก
    if (same(field, before[column], next)) continue;
    lines.push(`${field.label}: ${readable(field, before[column])} → ${readable(field, next)}`);
  }
  return lines;
}

/**
 * ข้อความสรุปสำหรับเธรด — คืน `null` เมื่อกดบันทึกโดยไม่ได้เปลี่ยนอะไร
 * (ผู้เรียกจะได้ไม่ต้องลงเธรดว่า "แก้แล้ว" ทั้งที่ค่าเหมือนเดิมทุกช่อง)
 */
export function pdrChangeSummary(before = {}, columns = {}) {
  const lines = pdrChangeLines(before, columns);
  if (!lines.length) return null;
  const shown = lines.slice(0, MAX_LINES);
  const rest = lines.length - shown.length;
  return shown.join('\n') + (rest > 0 ? `\n…และอีก ${rest} ช่อง` : '');
}
