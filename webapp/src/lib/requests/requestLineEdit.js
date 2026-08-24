// ── แก้ "บรรทัด" ของคำร้องที่ยังไม่ถูกรับเรื่อง ──────────────────────────
//
// ⭐ **ช่องว่างที่ผู้ใช้ทักมา (2026-08-24)**: ปุ่ม "แก้ไข" เปิดได้แค่หัวใบ 5 ช่อง
// (`requestEdit.js`) ⇒ หัวข้อที่เนื้องานจริงอยู่ใน *บรรทัด* — ขอเอกสาร (ชนิด +
// รายละเอียด) · ขอใบวางบิล · พัฒนาสูตร (หมวด × กลิ่น) — **แก้เนื้อไม่ได้เลยสักช่อง**
// เลือกชนิดเอกสารผิดหรือพิมพ์รายละเอียดตกไปหนึ่งบรรทัด ต้องลบทั้งใบแล้วเปิดใหม่
// (ทำได้เฉพาะร่าง · ส่งไปแล้วคือจบ)
//
// ⚠️ **ไม่ได้เขียนกฎบรรทัดชุดใหม่** — ตัวตรวจยังเป็น `normalizeLinesFor` ตัวเดียว
// กับ POST · ไฟล์นี้ตอบคำถามที่ POST ไม่เคยต้องตอบอย่างเดียวคือ **"แถวไหนคือแถวไหน"**
// (จับคู่ของเดิมกับของใหม่) ซึ่งเป็นตรรกะบริสุทธิ์ ⇒ มีเทสต์ครอบได้
//
// ⚠️ **ห้าม delete-แล้ว-insert ทั้งชุด** ซึ่งเป็นวิธีที่สั้นกว่ามาก:
//   · `attachments.entityId` ผูก `dept_request_items.id` — สายพัฒนาสูตรให้ผู้ขอแนบ
//     รูป/สเปกรายแถวได้ตั้งแต่ร่าง (`RequestRows canEditAttachments`) ⇒ ลบแถวทิ้ง
//     แล้วไฟล์กลายเป็นลูกกำพร้า ชี้ id ที่ไม่มีแล้ว
//   · `dept_request_items.briefId` / `derivedFromItemId` ชี้กันเองระหว่างแถว
// ⇒ จับคู่ด้วย id แล้วเขียนเฉพาะช่องที่ต่างจริง
import { rowStage } from '@/lib/requests/rowStage';

/* ช่องที่ผู้ขอเป็นเจ้าของรายรูปร่างบรรทัด — **ไม่ใช่ทุกคอลัมน์ของแถว**
   ⚠️ ช่องของ *ก้าว* (ackAt · readyAt · outcome · docNumber · producedScentId …)
   ไม่อยู่ในลิสต์นี้เด็ดขาด — มันเป็นของฝ่ายปลายทางและมีเส้นของตัวเองอยู่แล้ว
   (`PATCH /items/[itemId]` ทาง `hop`) · หลุดเข้ามาเมื่อไร ผู้ขอจะเขียนทับก้าวของ
   อีกฝ่ายผ่านทางฟอร์มแก้ใบ
   ⚠️ `label` อยู่ในลิสต์เพราะมันเป็น **snapshot ที่ derive มาแล้ว** (ชื่อชนิดเอกสาร /
   ชื่อหมวด · ชื่อกลิ่น) ไม่ใช่ค่าที่ client พิมพ์เอง — ดู `lineLabels.js` */
const WRITABLE_BY_SHAPE = Object.freeze({
  document: Object.freeze(['docType', 'label', 'spec']),
  billing_doc: Object.freeze(['docType', 'label', 'spec']),
  product_dev: Object.freeze(['categoryCode', 'scentId', 'label', 'spec', 'qty', 'unit']),
});

/** รูปร่างบรรทัดนี้แก้ผ่านฟอร์มแก้ใบได้ไหม — `scent_dev` ไม่ได้ (RD สร้างตอนส่งงาน) */
export function lineShapeEditable(lineShape) {
  return Boolean(WRITABLE_BY_SHAPE[lineShape]);
}

/**
 * แถวที่ "ยังไม่มีใครแตะ" — แก้/ลบได้
 *
 * ⭐ ถามผ่าน `rowStage` ที่เดียวของระบบ ไม่ใช่ไล่เช็ค `ackAt || readyAt || …` เอง
 * (ลืมช่องใดช่องหนึ่งเมื่อไร = ยอมให้เขียนทับแถวที่เดินไปแล้ว)
 * ⚠️ ในทางปฏิบัติที่ขั้น draft/pending ไม่มีแถวไหนเดินได้อยู่แล้ว — ก้าวรายแถวถูก
 * ปิดที่ server (`before.status === 'pending'` ตีกลับ 409) · ด่านนี้เป็นชั้นที่สอง
 * สำหรับใบเก่าที่ข้อมูลเพี้ยน และสำหรับวันที่มีใครขยาย `REQUEST_EDITABLE_STATUSES`
 */
export const isRowUntouched = (row) => rowStage(row) === 'awaiting_ack';

const normValue = (v) => (v === undefined || v === '' ? null : v);

/** ค่าเท่ากันไหม — ตัวเลขเทียบเป็นตัวเลข (DB คืน numeric เป็น number หรือ string) */
function sameValue(a, b) {
  const x = normValue(a);
  const y = normValue(b);
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  if (typeof x === 'number' || typeof y === 'number') return Number(x) === Number(y);
  return String(x) === String(y);
}

const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f, normValue(row[f])]));

/**
 * แผนการเขียนบรรทัด — `{ update, insert, remove, error }`
 *
 * `before` = แถวจริงในฐาน · `next` = ผลของ `normalizeLinesFor` (+ label ที่ resolve แล้ว)
 *
 * ⭐ **จับคู่ด้วย id เท่านั้น ไม่ใช่ตำแหน่ง** — คนแก้ใบสลับลำดับหรือลบแถวกลางได้
 * เทียบตามตำแหน่งเมื่อไรจะกลายเป็น "แถวที่ 2 ถูกเขียนทับด้วยเนื้อของแถวที่ 3"
 * ⚠️ id ที่ไม่มีอยู่จริงในใบนี้ถือเป็น **แถวใหม่** ไม่ใช่ error — client ที่ส่ง id
 * ของใบอื่นมาจึงได้แค่แถวใหม่ในใบตัวเอง ไม่ใช่ทางไปแตะใบคนอื่น
 */
export function requestLineDiff(before = [], next = [], { lineShape = null } = {}) {
  const fields = WRITABLE_BY_SHAPE[lineShape];
  const empty = { update: [], insert: [], remove: [] };
  if (!fields) {
    return { ...empty, error: `รายการของหัวข้อนี้แก้ทางนี้ไม่ได้ (${lineShape || 'ไม่มีรูปร่างบรรทัด'})` };
  }

  const beforeById = new Map((before || []).map((r) => [r.id, r]));
  const update = [];
  const insert = [];
  const kept = new Set();

  for (let i = 0; i < next.length; i += 1) {
    const row = next[i] || {};
    const sortOrder = i + 1;
    const old = row.id ? beforeById.get(row.id) : null;

    if (!old) {
      insert.push({ ...pick(row, fields), lineKind: row.lineKind, sortOrder });
      continue;
    }
    // ⚠️ id ซ้ำในก้อนเดียว = สองแถวอ้างแถวเดิมตัวเดียวกัน · เขียนทับกันเองเงียบ ๆ
    if (kept.has(old.id)) {
      return { ...empty, error: `รายการที่ ${sortOrder}: อ้างรายการเดิมซ้ำกับรายการก่อนหน้า` };
    }
    kept.add(old.id);

    const patch = {};
    for (const f of fields) if (!sameValue(old[f], row[f])) patch[f] = normValue(row[f]);
    if (old.sortOrder !== sortOrder) patch.sortOrder = sortOrder;
    if (!Object.keys(patch).length) continue;
    if (!isRowUntouched(old)) {
      return {
        ...empty,
        error: `รายการ "${old.label || old.id}" เดินก้าวไปแล้ว — แก้ไม่ได้ ให้คุยต่อในเธรดแทน`,
      };
    }
    update.push({ id: old.id, patch });
  }

  const remove = [];
  for (const old of before || []) {
    if (kept.has(old.id)) continue;
    if (!isRowUntouched(old)) {
      return {
        ...empty,
        error: `รายการ "${old.label || old.id}" เดินก้าวไปแล้ว — ลบไม่ได้ ให้ใช้ก้าวของแถวแทน`,
      };
    }
    remove.push(old.id);
  }

  return { update, insert, remove, error: null };
}

/** มีอะไรต้องเขียนจริงไหม — ไม่มีก็ไม่ต้องแตะตารางเลย */
export const lineDiffIsEmpty = (plan) => !plan
  || (!plan.update.length && !plan.insert.length && !plan.remove.length);

/* ── แถวจริง → ค่าของฟอร์ม ────────────────────────────────────────────────
 *
 * ⚠️ **ช่องกรอกทุกช่องต้องเป็นสตริง ไม่ใช่ null** — ตารางบรรทัดเป็น controlled
 * component ทั้งชุด (`row.spec.trim()` ใน DocumentLines · `value={row.qty}` ใน
 * ProductDevLines) · ส่ง null เข้าไปคือ uncontrolled warning แล้วช่องเลิกรับค่า
 * ⚠️ พา `id` ไปด้วยเสมอ — มันคือสิ่งเดียวที่บอก `requestLineDiff` ว่าแถวไหนคือแถวไหน
 */
export function lineFormRows(items = [], lineShape = null) {
  if (lineShape === 'product_dev') {
    return items.map((it) => ({
      id: it.id,
      categoryCode: it.categoryCode || '',
      scentId: it.scentId || '',
      qty: it.qty == null ? '' : String(it.qty),
      unit: it.unit || '',
      spec: it.spec || '',
    }));
  }
  return items.map((it) => ({
    id: it.id,
    docType: it.docType || '',
    spec: it.spec || '',
  }));
}
