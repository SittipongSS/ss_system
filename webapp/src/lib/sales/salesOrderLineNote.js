// ── หมายเหตุรายการ (`metadata.note`) บนใบสั่งขาย — แก้ในโหมด "แก้ไขข้อมูล" ของใบร่าง (มติเจ้าของ 25/11/2026) ─────────
//
// ⭐ เจ้าของ: "อยากปรับใบสั่งขายให้แก้หมายเหตุของรายการได้ เพราะบางทีมันต้องแก้"
//   ก่อนนี้บรรทัดใบสั่งขายเป็น snapshot จากใบเสนอราคาทั้งบรรทัด ⇒ แก้หมายเหตุหนึ่งบรรทัดต้องออก Rev. ที่ QT
//
// ⭐ **อยู่ในลูปปกติของใบ** (มติรอบสอง-สาม 25/11): สร้าง SO → แก้ไขข้อมูล → บันทึกร่าง → ยื่นอนุมัติ → อนุมัติ
//   · หมายเหตุรายการแก้ในโหมด "แก้ไขข้อมูล" แล้วไปกับปุ่ม "บันทึกร่าง" (action `save` · คีย์ `lineNotes`) — ไม่มีปุ่มบันทึกแยก
//     🐞 รอบแรกเป็นดินสอบันทึกแยกทีละบรรทัด ⇒ กดบันทึกหมายเหตุระหว่างแก้ข้อมูลอื่นค้าง = หน้าโหลดใบใหม่ทับฟอร์มที่ยังไม่บันทึกหาย
//   · แก้ได้เฉพาะใบร่าง/ตีกลับ (ด่านสถานะของ action `save` ตัวเดิม) — "พอยื่นหรืออนุมัติแล้วจะแก้ไม่ได้ ต้อง revise"
//     ยื่นแล้วอยากแก้ = ดึงกลับเป็นร่าง · อนุมัติแล้ว = ย้อนการอนุมัติแล้วออก Rev. (SO Rev. ก๊อป `metadata` ของบรรทัด — mig 0376)
//   · ใบที่แก้ได้ยังไม่มีฉบับตรึง ⇒ ปุ่มพิมพ์เรนเดอร์สดจากบรรทัด ไม่ต้องตรึงอะไรใหม่
//   · ⚠️ หน้าสร้าง SO ไม่มีช่องนี้ (ข้อยกเว้นกฎ "ฟอร์มแก้ = ฟอร์มสร้าง" ด้วยเหตุผลด้านข้อมูล): บรรทัดยังไม่มีจนกว่า RPC
//     `create_sales_order_draft` จะก๊อปจาก QT ตอนกดสร้าง — กดสร้างแล้วได้ใบร่างทันที แก้หมายเหตุต่อได้ก่อนยื่น
//
// ทำไมช่องนี้แก้ได้ ทั้งที่ราคา/จำนวน/คำอธิบายแก้ไม่ได้: หมายเหตุไม่กระทบเงิน และไม่อยู่ในลายนิ้วมือการอนุมัติ
//   (`salesOrderApprovalContent`) — ต่างจากราคา/จำนวนที่ต้องตรงกับใบเสนอราคาที่ลูกค้ารับ
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอและฝั่ง API — ห้าม import อะไรที่เป็น server-only
import { lineNoteEdit } from '@/lib/sales/quoteLines';
import { fmtNumber } from '@/lib/format';

/* ยาวสุดที่รับ — กันกระดาษล้นหน้า ไม่ใช่ข้อจำกัดของฐาน (metadata เป็น jsonb) */
export const SO_LINE_NOTE_MAX = 1000;

export const SO_LINE_NOTE_TEXT = Object.freeze({
  label: 'หมายเหตุรายการ',
  placeholder: 'หมายเหตุรายการนี้ — แสดงใต้รายการในใบสั่งขาย',
  hint: 'บันทึกพร้อมปุ่ม ‘บันทึกร่าง’ · เว้นว่าง = ลบหมายเหตุ',
  lineMissing: 'มีรายการที่ไม่ได้อยู่ในใบนี้แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง',
  tooLong: `หมายเหตุรายการยาวได้ไม่เกิน ${fmtNumber(SO_LINE_NOTE_MAX)} ตัวอักษร`,
  invalid: 'ข้อมูลหมายเหตุรายการไม่ถูกต้อง',
});

/** ข้อความที่ผู้ใช้พิมพ์ → ข้อความที่จะเก็บ (ตัดช่องว่างหัวท้าย · ว่าง = ลบหมายเหตุ) */
export const normalizeLineNote = (value) => String(value ?? '').trim();

/** หมายเหตุเดิมของบรรทัด (ตัดช่องว่างแล้ว) — ใช้ตัดสินว่า "แก้จริงไหม" */
export const currentLineNote = (line) => normalizeLineNote(line?.metadata?.note);

/** เกินความยาวที่รับไหม (นับเป็นตัวอักษร ไม่ใช่ UTF-16) */
export const lineNoteTooLong = (value) => [...normalizeLineNote(value)].length > SO_LINE_NOTE_MAX;

/**
 * metadata ชุดใหม่ของบรรทัด (ไม่ใช่ patch — ต้อง **ลบ** คีย์ได้)
 *   · มีข้อความ = `lineNoteEdit` (ธง `noteAuto` + คู่ภาษา `noteEn` ของทะเบียนสินค้าหลุด เพราะข้อความที่พิมพ์เองไม่มีคู่แปล
 *     — กติกาเดียวกับช่องหมายเหตุของใบเสนอราคา)
 *   · ว่าง = ลบ note/noteEn/noteAuto ทิ้งทั้งสามคีย์ (แบบเดียวกับตอนบันทึกใบเสนอราคา)
 */
export function salesOrderLineNoteMetadata(metadata, note) {
  const text = normalizeLineNote(note);
  if (text) return lineNoteEdit(metadata, text);
  const { note: _note, noteEn: _noteEn, noteAuto: _noteAuto, ...rest } = metadata || {};
  return rest;
}

/**
 * ฝั่งจอ: ร่างที่พิมพ์ค้าง `{ [lineId]: ข้อความ }` → ก้อนที่ส่งไปกับ "บันทึกร่าง" (เฉพาะบรรทัดที่ต่างจากของเดิม)
 * คืน `null` เมื่อไม่มีอะไรเปลี่ยน ⇒ ไม่ส่งคีย์ `lineNotes` เลย (route ไม่แตะบรรทัด)
 */
export function changedLineNotes(drafts = {}, lines = []) {
  const byId = new Map((Array.isArray(lines) ? lines : []).map((line) => [line.id, line]));
  const out = {};
  for (const [lineId, value] of Object.entries(drafts || {})) {
    const line = byId.get(lineId);
    if (line && normalizeLineNote(value) !== currentLineNote(line)) out[lineId] = normalizeLineNote(value);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * ฝั่ง route: ตรวจก้อน `lineNotes` เทียบกับบรรทัดจริงของใบ — คืน `{ changes, error }`
 *   `changes` = `[{ line, previous, note, metadata }]` เฉพาะบรรทัดที่ข้อความเปลี่ยนจริง
 * ⚠️ ตรวจว่าบรรทัดเป็นของใบนี้จริง — จอส่ง id อะไรมาก็ได้ ปล่อยผ่าน = เขียนทับบรรทัดของใบอื่น
 */
export function validateLineNotesPatch(patch, lines = []) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { changes: [], error: SO_LINE_NOTE_TEXT.invalid };
  const byId = new Map((Array.isArray(lines) ? lines : []).map((line) => [line.id, line]));
  const changes = [];
  for (const [lineId, raw] of Object.entries(patch)) {
    const line = byId.get(lineId);
    if (!line) return { changes: [], error: SO_LINE_NOTE_TEXT.lineMissing };
    if (raw !== null && typeof raw !== 'string') return { changes: [], error: SO_LINE_NOTE_TEXT.invalid };
    if (lineNoteTooLong(raw)) return { changes: [], error: SO_LINE_NOTE_TEXT.tooLong };
    const note = normalizeLineNote(raw);
    const previous = currentLineNote(line);
    if (note !== previous) changes.push({ line, previous, note, metadata: salesOrderLineNoteMetadata(line.metadata, note) });
  }
  return { changes, error: null };
}
