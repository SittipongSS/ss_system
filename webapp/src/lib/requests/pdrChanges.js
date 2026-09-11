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

/** ค่าหนึ่งช่อง → ข้อความอ่านออก · ว่าง = "(ว่าง)" ไม่ใช่สตริงเปล่า
 *  `categoryLabel` = ป้ายหมวดจากทะเบียน (ช่อง 1.11) — ไม่ส่ง = รหัสดิบ */
function readable(field, value, { categoryLabel = null } = {}) {
  if (field.type === 'categories' && categoryLabel) {
    const list = (Array.isArray(value) ? value : []).map((v) => String(v ?? '').trim()).filter(Boolean);
    return list.length ? clip(list.map((c) => categoryLabel(c) || c).join(', ')) : '(ว่าง)';
  }
  // ช่องตัวเลือก — พิมพ์ **ป้าย** ไม่ใช่ key ที่เก็บ ("caregiver" → "CAREGIVER") · ค่าที่ไม่รู้จักพิมพ์ดิบ
  if (Array.isArray(field.options) && field.options.length && (field.type === 'multi' || field.type === 'select')) {
    const labelOf = (v) => field.options.find((o) => o.value === v)?.label || v;
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v ?? '').trim()).filter(Boolean);
    return list.length ? clip(list.map(labelOf).join(', ')) : '(ว่าง)';
  }
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
export function pdrChangeLines(before = {}, columns = {}, opts = {}) {
  const lines = [];
  for (const [column, next] of Object.entries(columns)) {
    const field = FIELD_BY_COLUMN[column];
    if (!field) continue;                       // คอลัมน์ที่ไม่ได้อยู่ในทะเบียน = ไม่ใช่ช่องที่คนกรอก
    if (same(field, before[column], next)) continue;
    lines.push(`${field.label}: ${readable(field, before[column], opts)} → ${readable(field, next, opts)}`);
  }
  return lines;
}

/* ── แถวสินค้า (ข้อ 2.1–2.7 รายสินค้า · mig 0229 + 0352) ────────────────────
   ⭐ ย้ายสเปกลงแถวแล้ว **ต้องตามไปดูแถวด้วย** — ไม่งั้น RD แก้ขนาดบรรจุของสินค้า SA
      ไม่มีทางรู้ (โรคเดียวกับที่ IS-26080021 แก้ไปแล้วสำหรับหัวใบ)
   ⚠️ จับคู่ด้วย **id ที่ฟอร์มพามา** (`nextIds`) — id ของแถวเปลี่ยนทุกครั้งที่บันทึก (เขียนชุดใหม่
      แล้วลบชุดเดิม) แต่ภายในหนึ่งการบันทึก id ที่ฟอร์มถืออยู่ชี้แถวเดิมได้ถูก · ไม่ส่ง = เทียบตามลำดับ */
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
  /* id ของแถวเดิมที่ฟอร์มส่งมาคู่กับ `next[i]` (`pdrTargetValuesFrom` พา id มา) — มีเมื่อไร **จับคู่
     ด้วย id** · 🐞 จับตามตำแหน่งอย่างเดียว ⇒ เอาสินค้าที่ 1 ออก เธรดกลายเป็น "สินค้าที่ 1 เปลี่ยน
     หมวด…" 7 บรรทัดปลอม แล้วบรรทัด "เอาออก" ถูกเพดานบรรทัดกลืน (ผลรีวิวรอบสาม) */
  nextIds = null,
} = {}) {
  const o = { scentLabel: (id) => (id ? scentLabel(id) : ''), categoryLabel: (c) => (c ? categoryLabel(c) : '') };
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(next) ? next : [];
  const lines = [];
  const text = (col, row) => String(col.text(row, o) ?? '').trim();
  const name = (row) => text(TARGET_COLUMNS[0], row) || '—';
  const diff = (at, x, y) => {
    for (const col of TARGET_COLUMNS) {
      const p = text(col, x); const q = text(col, y);
      if (p === q) continue;
      lines.push(`${at} · ${col.label}: ${clip(p) || '(ว่าง)'} → ${clip(q) || '(ว่าง)'}`);
    }
  };

  const byId = new Map(a.filter((r) => r?.id).map((r) => [r.id, r]));
  // ⚠️ ผู้เรียกส่ง `nextIds` มา = จับคู่ด้วย id **เสมอ** แม้ไม่มี id ไหนรอด — 🐞 เดิมถอยไปจับตาม
  //    ตำแหน่งเมื่อแทนที่ทุกแถว ⇒ เอาออกทั้งหมดแล้วเพิ่มใหม่ เธรดขึ้น "แก้ทุกช่อง" ปลอม (รีวิวรอบสี่)
  if (Array.isArray(nextIds)) {
    const ids = nextIds;
    const used = new Set();
    // เอาออกขึ้นก่อน — เป็นบรรทัดที่สำคัญที่สุดและต้องไม่ถูกเพดานบรรทัดของเธรดกลืน
    const kept = new Set(ids.filter((id) => id && byId.has(id)));
    a.forEach((r, i) => { if (!kept.has(r.id)) lines.push(`สินค้าที่ ${i + 1} (เดิม): เอาออก (${name(r)})`); });
    b.forEach((row, i) => {
      const id = ids[i];
      const old = id && byId.has(id) && !used.has(id) ? byId.get(id) : null;
      if (!old) { lines.push(`สินค้าที่ ${i + 1}: เพิ่มใหม่ (${name(row)})`); return; }
      used.add(id);
      diff(`สินค้าที่ ${i + 1}`, old, row);
    });
    return lines;
  }

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const at = `สินค้าที่ ${i + 1}`;
    if (!a[i]) { lines.push(`${at}: เพิ่มใหม่ (${name(b[i])})`); continue; }
    if (!b[i]) { lines.push(`${at}: เอาออก (${name(a[i])})`); continue; }
    diff(at, a[i], b[i]);
  }
  return lines;
}

/**
 * ข้อความสรุปสำหรับเธรด — คืน `null` เมื่อกดบันทึกโดยไม่ได้เปลี่ยนอะไร
 * (ผู้เรียกจะได้ไม่ต้องลงเธรดว่า "แก้แล้ว" ทั้งที่ค่าเหมือนเดิมทุกช่อง)
 * @param {string[]} extraLines บรรทัดของส่วนที่ไม่ใช่หัวใบ (แถวสินค้า) — ต่อท้ายหัวใบ
 */
export function pdrChangeSummary(before = {}, columns = {}, extraLines = [], opts = {}) {
  // ⚠️ ป้ายหมวดชุดเดียวกับบรรทัดแถวสินค้า — เดิม 1.11 พิมพ์รหัสดิบข้างบรรทัดแถวที่เป็นชื่อ
  /* ⚠️ **"เอาสินค้าออก" ขึ้นก่อนทุกบรรทัด** — เพดาน MAX_LINES ตัดท้าย ⇒ ถ้าบรรทัดหัวใบมาก่อน
     (ล้างค่าเดิม 4 ช่อง + แก้อีกไม่กี่ช่อง) บรรทัดที่บอกว่าสินค้าหายไปจะถูกกลืน (รีวิวรอบสี่) */
  const extra = extraLines || [];
  // ⭐ บรรทัดสำคัญขึ้นก่อน: รายการงานที่งอก/ถอนตามแบบฟอร์ม (ม-144) และสินค้าที่ถูกเอาออก
  const lead = extra.filter((l) => /^รายการงานตามแบบฟอร์ม PDR:|: เอาออก \(/.test(l));
  const lines = [...lead, ...pdrChangeLines(before, columns, opts), ...extra.filter((l) => !lead.includes(l))];
  if (!lines.length) return null;
  const shown = lines.slice(0, MAX_LINES);
  const rest = lines.length - shown.length;
  return shown.join('\n') + (rest > 0 ? `\n…และอีก ${rest} ช่อง` : '');
}
