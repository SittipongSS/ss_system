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
import {
  PDR_TARGET_KINDS, PDR_TARGET_LABELS, PDR_TARGET_SPEC, pdrTargetSpecText,
} from '@/lib/requests/pdrTargets';

const FIELD_BY_COLUMN = Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.column, f]),
);

// ยาวเกินนี้ในบรรทัดเดียวของเธรดอ่านไม่ออก — ตัดแล้วใส่ … ให้รู้ว่ายังมีต่อ
const CLIP = 60;
// ⚠️ เพดานจำนวนบรรทัด: PDR มี 48 ช่อง · แก้ทีเดียวหลายสิบช่องแล้วเธรดกลายเป็นกำแพง
// ข้อความที่ไม่มีใครอ่าน ⇒ โชว์ที่เปลี่ยนจริงกี่ช่องไว้ท้ายแทน
const MAX_LINES = 8;

const clip = (s) => (s.length > CLIP ? `${s.slice(0, CLIP - 1)}…` : s);

// ข้อความเขียนต่อ `{ key: ข้อความ }` → "KEY: ข้อความ" เรียงตาม key ⇒ เทียบและอ่านได้
const notesText = (value) => Object.entries(value && typeof value === 'object' ? value : {})
  .map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ');

/** ค่าหนึ่งช่อง → ข้อความอ่านออก · ว่าง = "(ว่าง)" ไม่ใช่สตริงเปล่า */
function readable(field, value) {
  // ⚠️ สองชนิดนี้ `String()` ตรง ๆ ไม่ได้ — ได้ "[object Object]" / "true" ลงเธรด
  if (field.type === 'switch') return value === true ? 'ใช่' : value === false ? 'ไม่ใช่' : '(ว่าง)';
  if (field.type === 'notes') return clip(notesText(value)) || '(ว่าง)';
  if (pdrIsArrayField(field)) {
    const list = (Array.isArray(value) ? value : []).map((v) => String(v ?? '').trim()).filter(Boolean);
    return list.length ? clip(list.join(', ')) : '(ว่าง)';
  }
  const text = String(value ?? '').trim();
  return text ? clip(text) : '(ว่าง)';
}

/** เท่ากันไหม — อาเรย์เทียบตามลำดับหลัง normalize แล้ว (normalizePdr จัดให้ตรงกันอยู่แล้ว) */
function same(field, a, b) {
  if (field.type === 'switch') return (a ?? null) === (b ?? null);
  // 🐞 เทียบด้วย `String()` แล้ว object ทุกตัวเท่ากัน ("[object Object]") ⇒ แก้ข้อความ
  //    เขียนต่อแล้วเธรดไม่เคยเห็น
  if (field.type === 'notes') return notesText(a) === notesText(b);
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

/* ── แถวสินค้า (ข้อ 2.1–2.7 รายสินค้า · mig 0229 + 0352) ────────────────────
   ⭐ ย้ายสเปกลงแถวแล้ว **ต้องตามไปดูแถวด้วย** — ไม่งั้น RD แก้ขนาดบรรจุของสินค้า SA
      ไม่มีทางรู้ (โรคเดียวกับที่ IS-26080021 แก้ไปแล้วสำหรับหัวใบ)
   ⚠️ เทียบ **ตามลำดับแถว** — แถวไม่มี id ถาวร (PATCH ลบแล้ว insert ใหม่ทุกครั้ง) และ
      ลำดับคือ "สินค้าที่ N" ที่ตาเห็นบนจอและบนกระดาษ */
const TARGET_COLUMNS = [
  { key: 'categoryCode', label: 'ประเภทสินค้า', text: (r, o) => o.categoryLabel(r.categoryCode) },
  { key: 'scentId', label: `${PDR_TARGET_LABELS.scent.no} กลิ่น`, text: (r, o) => o.scentLabel(r.scentId) },
  ...PDR_TARGET_KINDS.map((k) => ({
    key: k.key,
    label: `${PDR_TARGET_LABELS.cost.no} ${k.label}`,
    text: (r) => (r[k.onField]
      ? [r[k.priceField] != null && r[k.priceField] !== '' ? `${r[k.priceField]} บาท/Kg` : '', r[k.noteField] || '']
        .filter(Boolean).join(' · ') || 'ขอ'
      : ''),
  })),
  { key: 'pricePerUnit', label: `${PDR_TARGET_LABELS.price.no} ราคาขาย/ชิ้น`, text: (r) => r.pricePerUnit },
  ...PDR_TARGET_SPEC.map((f) => ({ key: f.key, label: `${f.no} ${f.label}`, text: (r) => pdrTargetSpecText(f, r) })),
];

/**
 * แถวสินค้าเปลี่ยนอะไรบ้าง — คืนอาเรย์ข้อความ `"สินค้าที่ N · ป้าย: เดิม → ใหม่"`
 * @param {object[]} before แถวเดิม (จาก DB) · @param {object[]} next แถวที่จะเขียน (ผลของ normalizer)
 * @param {{ scentLabel?: Function, categoryLabel?: Function }} options ป้ายจากทะเบียน (ไม่ส่ง = รหัสดิบ)
 */
export function pdrTargetChangeLines(before = [], next = [], {
  scentLabel = (id) => id, categoryLabel = (code) => code,
} = {}) {
  const o = { scentLabel: (id) => (id ? scentLabel(id) : ''), categoryLabel: (c) => (c ? categoryLabel(c) : '') };
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(next) ? next : [];
  const lines = [];
  const text = (col, row) => String(col.text(row, o) ?? '').trim();
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const at = `สินค้าที่ ${i + 1}`;
    if (!a[i]) { lines.push(`${at}: เพิ่มใหม่ (${text(TARGET_COLUMNS[0], b[i]) || '—'})`); continue; }
    if (!b[i]) { lines.push(`${at}: เอาออก (${text(TARGET_COLUMNS[0], a[i]) || '—'})`); continue; }
    for (const col of TARGET_COLUMNS) {
      const x = text(col, a[i]); const y = text(col, b[i]);
      if (x === y) continue;
      lines.push(`${at} · ${col.label}: ${clip(x) || '(ว่าง)'} → ${clip(y) || '(ว่าง)'}`);
    }
  }
  return lines;
}

/**
 * ข้อความสรุปสำหรับเธรด — คืน `null` เมื่อกดบันทึกโดยไม่ได้เปลี่ยนอะไร
 * (ผู้เรียกจะได้ไม่ต้องลงเธรดว่า "แก้แล้ว" ทั้งที่ค่าเหมือนเดิมทุกช่อง)
 * @param {string[]} extraLines บรรทัดของส่วนที่ไม่ใช่หัวใบ (แถวสินค้า) — ต่อท้ายหัวใบ
 */
export function pdrChangeSummary(before = {}, columns = {}, extraLines = []) {
  const lines = [...pdrChangeLines(before, columns), ...(extraLines || [])];
  if (!lines.length) return null;
  const shown = lines.slice(0, MAX_LINES);
  const rest = lines.length - shown.length;
  return shown.join('\n') + (rest > 0 ? `\n…และอีก ${rest} ช่อง` : '');
}
