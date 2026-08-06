// ── ก้าวของแถวคำร้อง — ด่านล้วน ไม่แตะ DB (mig 0202) ──────────────────────
//
// 5 ก้าวที่แถวหนึ่งเดินผ่าน · แต่ละก้าวมี **เจ้าของฝั่ง** ตายตัว และเดินข้ามขั้นไม่ได้
//
//   ack      ฝ่ายปลายทางรับเรื่อง (+ รับปากวันส่ง)
//   ready    ฝ่ายปลายทางส่งของ
//   pickup   ผู้ขอรับของแล้ว
//   send     ผู้ขอส่งให้ลูกค้าแล้ว
//   outcome  ผู้ขอบันทึกคำตอบลูกค้า (คอนเฟิร์ม / ขอแก้ / ไม่เอา)
//
// ⚠️ ด่านที่นี่ **ต้องครอบให้ครบก่อนแตะ DB** — constraint ของ 0202 บังคับหลายข้อ
// (คอนเฟิร์มต้องมีจำนวน · ตอบแล้วต้องมีวันที่ · ไม่เอาต้องมีเหตุผล) ถ้าปล่อยให้ไป
// ตายที่ DB ผู้ใช้จะได้ error ดิบภาษาอังกฤษที่อ่านไม่รู้เรื่อง
import { ROW_STAGES, rowStage } from '@/lib/requests/rowStage';

export const ROW_HOPS = ['ack', 'ready', 'pickup', 'send', 'outcome'];

// ก้าวไหนเป็นของฝั่งไหน — 'dept' = ฝ่ายที่ต้องตอบ · 'requester' = ผู้ขอ
export const HOP_OWNER = {
  ack: 'dept', ready: 'dept', pickup: 'requester', send: 'requester', outcome: 'requester',
};

// ขั้นที่แถวต้องอยู่ **ก่อน** จะเดินก้าวนี้ได้
const HOP_FROM_STAGE = {
  ack: 'awaiting_ack',
  ready: 'developing',
  pickup: 'ready',
  send: 'picked_up',
  outcome: 'sent',
};

export const ROW_OUTCOMES = ['confirmed', 'revise', 'rejected'];

const OUTCOME_LABELS = {
  confirmed: 'ลูกค้าคอนเฟิร์ม',
  revise: 'ลูกค้าขอให้แก้',
  rejected: 'ลูกค้าไม่เอา',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ป้ายสั้นสำหรับใส่ในข้อความ error (คนละชุดกับป้ายบนจอ ซึ่งอยู่ที่ rowStage.js)
const ROW_STAGE_TEXT = {
  awaiting_ack: 'รอรับเรื่อง',
  developing: 'กำลังทำ',
  ready: 'เสร็จแล้ว รอไปรับ',
  picked_up: 'รับของแล้ว',
  sent: 'ส่งให้ลูกค้าแล้ว',
  revised: 'ลูกค้าขอให้แก้',
  awaiting_price: 'รอใส่ราคา',
  done: 'เสร็จ',
  declined: 'ไม่ได้ใช้',
};

// ── ด่านขั้นตอน — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────────────────
//
// ⚠️ ข้อความบอก **ขั้นปัจจุบัน** ด้วยเสมอ — "ข้ามขั้นไม่ได้" เฉย ๆ ไม่ช่วยให้ผู้ใช้
// รู้ว่าต้องทำอะไรก่อน (บทเรียนเดียวกับที่ requestFormBlocker ทำไว้ในฟอร์ม)
export function hopStageError(row, hop) {
  if (!row) return 'ไม่พบรายการ';
  if (!ROW_HOPS.includes(hop)) return 'ก้าวไม่ถูกต้อง';
  const stage = rowStage(row);
  const want = HOP_FROM_STAGE[hop];
  if (stage === want) return null;

  // เดินไปแล้ว vs ยังไม่ถึง — บอกให้ต่างกัน เพราะทางแก้คนละทาง
  const passed = ROW_STAGES.indexOf(stage) > ROW_STAGES.indexOf(want);
  return passed
    ? `รายการนี้ผ่านขั้นนี้ไปแล้ว (ตอนนี้อยู่ขั้น "${ROW_STAGE_TEXT[stage]}")`
    : `ยังไม่ถึงขั้นนี้ — ตอนนี้อยู่ขั้น "${ROW_STAGE_TEXT[stage]}"`;
}

// ── ด่านค่าที่ส่งมา — ต้องครอบทุกข้อที่ constraint ของ 0202 บังคับ ────────
export function hopValuesError(hop, values = {}) {
  const at = String(values.at ?? '').trim();
  if (at && !ISO_DATE.test(at)) return 'วันที่ไม่ถูกต้อง';

  if (hop === 'ack') {
    const due = String(values.dueAt ?? '').trim();
    if (due && !ISO_DATE.test(due)) return 'วันที่รับปากว่าจะส่งไม่ถูกต้อง';
    return null;
  }

  // ก้าวที่บันทึกว่า "เกิดขึ้นเมื่อไร" ต้องมีวันที่เสมอ — เส้นวัด lead time
  // ทั้งหมดอิงวันพวกนี้ ปล่อยให้ว่างแล้วตัวเลขจะหายไปทั้งแถวโดยไม่มีอะไรฟ้อง
  if (['ready', 'pickup', 'send'].includes(hop)) {
    return at ? null : 'ต้องระบุวันที่';
  }

  // outcome — ข้อบังคับมาจาก constraint ของ 0202 โดยตรง
  const outcome = values.outcome;
  if (!ROW_OUTCOMES.includes(outcome)) return 'ต้องระบุว่าลูกค้าตอบว่าอย่างไร';
  if (!at) return 'ต้องระบุวันที่ลูกค้าตอบ';

  if (outcome === 'confirmed') {
    const qty = Number(values.confirmedQty);
    // ⭐ จำนวนนี้ใช้กระทบยอดกับใบสั่งขาย — ไม่มีจำนวน = กระทบยอดไม่ได้
    if (!Number.isFinite(qty) || qty <= 0) return 'ต้องระบุจำนวนที่ลูกค้าคอนเฟิร์ม';
  }
  // ⭐ "ไม่เอา" กับ "ขอแก้" บังคับเหตุผลทั้งคู่ แต่คนละเหตุผลกัน:
  //   ไม่เอา — ปิดแถวถาวร ต้องมีหลักฐานว่าทำไม (constraint answer_evidence บังคับ
  //     declineReason เมื่อ answerStatus = 'declined')
  //   ขอแก้ — ข้อความนี้กลายเป็น **บรีฟของแถวใหม่ที่กำลังจะเกิด** ปล่อยว่างเมื่อไร
  //     ฝ่ายปลายทางจะเห็นแถว "รอรับเรื่อง" โผล่มาโดยไม่รู้ว่าต้องแก้อะไร
  if (['rejected', 'revise'].includes(outcome) && !String(values.note ?? '').trim()) {
    return 'ต้องระบุสิ่งที่ลูกค้าบอก';
  }
  if (String(values.note ?? '').length > 4000) return 'ข้อความยาวเกิน 4000 ตัวอักษร';
  return null;
}

// ── แปลงเป็น patch ที่เขียนลงแถวได้เลย ───────────────────────────────────
// ⚠️ ที่เดียวที่รู้ว่าก้าวไหนเขียนช่องไหน — handler ไม่ประกอบเอง ไม่งั้นกฎจะกระจาย
export function hopPatch(hop, values = {}, user = null, today = null) {
  const at = String(values.at ?? '').trim() || today;
  const by = { id: user?.id ?? null, name: user?.name ?? null };

  if (hop === 'ack') {
    const due = String(values.dueAt ?? '').trim();
    return {
      ackAt: at, ackById: by.id, ackByName: by.name,
      ...(due ? { dueAt: due } : {}),
    };
  }
  if (hop === 'ready') return { readyAt: at, readyById: by.id, readyByName: by.name };
  if (hop === 'pickup') return { pickedUpAt: at, pickedUpById: by.id, pickedUpByName: by.name };
  if (hop === 'send') return { sentAt: at, sentById: by.id, sentByName: by.name };

  const note = String(values.note ?? '').trim() || null;
  const patch = {
    outcome: values.outcome,
    outcomeAt: at,
    outcomeById: by.id,
    outcomeByName: by.name,
    outcomeNote: note,
  };
  if (values.outcome === 'confirmed') patch.confirmedQty = Number(values.confirmedQty);
  // "ไม่เอา" ปิดแถวทันที — ไม่ต้องรอใส่ราคา · declineReason บังคับโดย constraint
  if (values.outcome === 'rejected') {
    patch.answerStatus = 'declined';
    patch.declineReason = note;
  }
  // "ขอแก้" ไม่ปิด answerStatus — แถวจบในเชิงงาน (rowStage = 'revised') แต่ยังไม่
  // settled ในเชิงข้อมูลจนกว่าจะมีแถวใหม่มาแทน (P1b-3)
  return patch;
}

export const hopLabel = (hop, outcome) => (hop === 'outcome'
  ? (OUTCOME_LABELS[outcome] || 'บันทึกคำตอบลูกค้า')
  : { ack: 'รับเรื่อง', ready: 'ส่งของ', pickup: 'รับของ', send: 'ส่งให้ลูกค้า' }[hop] || hop);

// ── แถวที่เกิดจากการแก้ ───────────────────────────────────────────────────
//
// ⭐ "ลูกค้าขอให้แก้" ไม่ใช่การวนซ้ำในแถวเดิม — มันได้ **ของชิ้นใหม่** (มติผู้ใช้:
// แก้แล้วได้รายการใหม่ ไม่ใช่ Rev.) ⇒ เกิดแถวใหม่ที่ชี้กลับแถวเดิมเสมอ
//
// ⚠️ **เกิดเองตอนบันทึกว่าลูกค้าขอแก้ ไม่ใช่ปุ่มแยก** — มันเป็นผลลัพธ์ ไม่ใช่การ
// กระทำ · ถ้าให้คนกดเอง จะมีช่วงที่คำร้องค้างโดยไม่มีใครเห็นว่ายังมีงานเหลือ
//
// คัดลอก "สิ่งที่ขอ" ไปทั้งหมด แต่ล้าง "สิ่งที่เกิดขึ้นแล้ว" ทิ้ง — แถวใหม่ต้องเริ่ม
// ที่ขั้นรอรับเรื่องอีกครั้ง (ฝ่ายปลายทางรับเรื่องแก้ใหม่ ถามกลับได้ก่อนรับปากวัน)
export function followUpRowFrom(row, sortOrder) {
  return {
    requestId: row.requestId,
    lineKind: row.lineKind,
    sortOrder,
    // สิ่งที่ขอ — ยกมาทั้งชุด
    kind: row.kind ?? null,
    materialId: row.materialId ?? null,
    label: row.label,
    spec: row.spec ?? null,
    componentId: row.componentId ?? null,
    categoryCode: row.categoryCode ?? null,
    scentId: row.scentId ?? null,
    // ⭐ **บรีฟตามมาด้วย** (mig 0213) — รอบแก้คือ direction อีกตัวของบรีฟก้อนเดิม
    // ไม่ใช่บรีฟก้อนใหม่ · ตกหล่นเมื่อไรก็ผิดข้อที่ผู้ใช้สั่งไว้ตรง ๆ ว่า "กลิ่นต้อง
    // ย้อนกลับได้ว่ามาจากบรีฟไหน" — และรอบแก้คือรอบที่ต้องย้อนดูบรีฟมากที่สุด
    briefId: row.briefId ?? null,
    qty: row.qty ?? null,
    unit: row.unit ?? null,
    docType: row.docType ?? null,
    // สายพันธุ์ — อ่านย้อนได้ว่าแก้มาจากตัวไหน
    derivedFromItemId: row.id,
    // สิ่งที่เกิดขึ้นแล้วต้องไม่ตามมา (ก้าว · ผลลัพธ์ · ราคา)
    answerStatus: 'pending',
  };
}

// kind ของเหตุการณ์ในเธรด — ต้องตรงกับที่ลงทะเบียนไว้ใน lib/master/updateTypes.js
// ⚠️ kind ที่ไม่ได้ลงทะเบียนจะเงียบสนิทบนจอ (appendUpdate เตือนอย่างเดียว ไม่ตีกลับ)
export const hopUpdateKind = (hop, outcome) => (hop === 'outcome'
  ? (ROW_OUTCOMES.includes(outcome) ? outcome : 'comment')
  : { ack: 'acknowledge', ready: 'ready', pickup: 'pickup', send: 'sent' }[hop] || 'comment');
