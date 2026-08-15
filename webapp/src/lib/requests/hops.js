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
import { ROW_STAGES, ROW_STAGE_LABELS, rowStage } from '@/lib/requests/rowStage';
import { isDocLineKind } from '@/lib/requests/docTypes';

// ⭐ สองก้าวท้ายเป็นของสายเอกสารเท่านั้น (ม-85) — สายนั้นไม่มีลูกค้า/ราคา จึงจบด้วย
//   receive  ผู้ขอยืนยันว่าได้ไฟล์ที่ใช้ได้จริง (answerStatus = done)
//   refuse   ฝ่ายปฏิเสธ พร้อมเหตุผลบังคับ (answerStatus = declined)
export const ROW_HOPS = ['ack', 'ready', 'pickup', 'send', 'outcome', 'receive', 'refuse'];

// ก้าวไหนเป็นของฝั่งไหน — 'dept' = ฝ่ายที่ต้องตอบ · 'requester' = ผู้ขอ
export const HOP_OWNER = {
  ack: 'dept', ready: 'dept', pickup: 'requester', send: 'requester', outcome: 'requester',
  receive: 'requester', refuse: 'dept',
};

// ขั้นที่แถวต้องอยู่ **ก่อน** จะเดินก้าวนี้ได้ (array = ได้หลายขั้น)
const HOP_FROM_STAGE = {
  ack: 'awaiting_ack',
  ready: 'developing',
  pickup: 'ready',
  send: 'picked_up',
  outcome: 'sent',
  // ⚠️ receive รับได้จากขั้นค้างเก่าด้วย (picked_up/sent) — แถวเอกสารที่เคยหลงเดิน
  // สายพัฒนาไปแล้วต้องมีทางจบ ไม่ใช่ติดถาวรเพราะเราแก้กติกา
  receive: ['ready', 'picked_up', 'sent'],
  // ปฏิเสธ = คำตอบของฝ่ายระหว่างที่งานยังอยู่ในมือ — รับเรื่องแล้วแต่ยังไม่ส่ง ·
  // ส่งแล้ว (ready) คือมีของแล้ว ไม่มีเหตุให้ปฏิเสธอีก
  refuse: 'developing',
};

// ก้าวนี้ใช้กับรูปร่างบรรทัดนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
//
// 🐞 **ด่านที่ปิดบั๊ก "ค้างที่รอใส่ราคาถาวร"**: เดิมแถวเอกสารเดินก้าวของสายพัฒนาได้
// ครบชุด (รับของ → ส่งให้ลูกค้า → บันทึกคำตอบ) แล้วไปตายที่ขั้นราคาเพราะไม่มีกลิ่น/
// สูตรให้ผูก ⇒ ปิดใบไม่ได้ตลอดกาล · ตัดตั้งแต่ก้าวแรกที่ผิดสาย ไม่ใช่ปล่อยไปตายปลายทาง
function hopLineKindError(row, hop) {
  const doc = isDocLineKind(row?.lineKind);
  if (doc && ['pickup', 'send', 'outcome'].includes(hop)) {
    return 'แถวเอกสารไม่มีก้าวของสายพัฒนา — ผู้ขอกด "ได้รับแล้ว" เมื่อไฟล์ใช้ได้จริง';
  }
  if (!doc && ['receive', 'refuse'].includes(hop)) {
    return 'ก้าวนี้ใช้กับแถวขอเอกสารเท่านั้น';
  }
  return null;
}

export const ROW_OUTCOMES = ['confirmed', 'revise', 'rejected'];

const OUTCOME_LABELS = {
  confirmed: 'ลูกค้าคอนเฟิร์ม',
  revise: 'ลูกค้าขอให้แก้',
  rejected: 'ลูกค้าไม่เอา',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ป้ายขั้นในข้อความ error — **ชุดเดียวกับที่จอใช้** (`ROW_STAGE_LABELS`)
//
// 🐞 เดิมไฟล์นี้ประกาศชุดของตัวเองแล้วคอมเมนต์ว่า "คนละชุดกับป้ายบนจอ" ทั้งที่
// **ทุกตัวสะกดตรงกันเป๊ะทั้ง 9 ค่า** — ก๊อปมาแล้วเขียนเหตุผลกำกับให้ดูตั้งใจ ·
// เจอตอนไล่ความยาวป้ายรอบ 2026-08-08: แก้ที่ rowStage แล้วไฟล์นี้ยังพูดคำเก่า
// ⇒ ผู้ใช้เห็น "รอไปรับ" บนจอ แต่ข้อความ error บอก "เสร็จแล้ว รอไปรับ"
const ROW_STAGE_TEXT = ROW_STAGE_LABELS;

// ── ด่านขั้นตอน — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────────────────
//
// ⚠️ ข้อความบอก **ขั้นปัจจุบัน** ด้วยเสมอ — "ข้ามขั้นไม่ได้" เฉย ๆ ไม่ช่วยให้ผู้ใช้
// รู้ว่าต้องทำอะไรก่อน (บทเรียนเดียวกับที่ requestFormBlocker ทำไว้ในฟอร์ม)
export function hopStageError(row, hop) {
  if (!row) return 'ไม่พบรายการ';
  if (!ROW_HOPS.includes(hop)) return 'ก้าวไม่ถูกต้อง';
  const kindError = hopLineKindError(row, hop);
  if (kindError) return kindError;
  const stage = rowStage(row);
  const want = HOP_FROM_STAGE[hop];
  const wanted = Array.isArray(want) ? want : [want];
  if (wanted.includes(stage)) return null;

  // เดินไปแล้ว vs ยังไม่ถึง — บอกให้ต่างกัน เพราะทางแก้คนละทาง
  const passed = ROW_STAGES.indexOf(stage) > ROW_STAGES.indexOf(wanted[0]);
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

  // ⭐ ก้าวส่ง (ready) ไม่ถามวันแล้ว (ม-92: "ไม่จำเป็นต้องใส่วันที่ ใช้ stamp
  // วันเวลา") — ว่าง = hopPatch ประทับวันไทยของวันที่กดให้เอง · เส้น lead time
  // ยังครบเพราะช่องวันไม่เคยว่างจริง แค่ย้ายจากมือคนไปเป็นตราประทับ
  if (hop === 'ready') return null;
  // ⚠️ ก้าวฝั่งผู้ขอ (pickup/send/receive) ยังถาม — พวกนั้นบันทึกเหตุการณ์นอกระบบ
  // (ของถึงมือลูกค้าเมื่อไร) ที่มักเกิดก่อนวันกดบันทึก
  if (['pickup', 'send', 'receive'].includes(hop)) {
    return at ? null : 'ต้องระบุวันที่';
  }

  // ปฏิเสธ — เหตุผลคือหลักฐาน (constraint answer_evidence บังคับคู่ declined+เหตุผล)
  // ไม่มีช่องวันของตัวเอง: เวลาอยู่บนเหตุการณ์ในเธรดแล้ว
  if (hop === 'refuse') {
    const reason = String(values.note ?? '').trim();
    if (!reason) return 'ต้องบอกเหตุผลที่ปฏิเสธ';
    if (reason.length > 2000) return 'เหตุผลยาวเกิน 2000 ตัวอักษร';
    return null;
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

  // ── สองก้าวจบของสายเอกสาร (ม-85) ─────────────────────────────────────
  // ⭐ ได้รับแล้ว = ผู้ขอยืนยันว่าไฟล์ใช้ได้จริง — คนถามคือคนตัดสินว่าคำตอบใช้ได้
  //   (แนวคิดเดียวกับปุ่มปิดเรื่อง) · วันเก็บที่ pickedUpAt — "วันได้รับ" ตรงตัว
  //   และผ่าน CHECK hop_chain (pickedUpAt ต้องมี readyAt ซึ่งมีแล้วเพราะฝ่ายส่งก่อน)
  if (hop === 'receive') {
    return {
      pickedUpAt: at, pickedUpById: by.id, pickedUpByName: by.name,
      answerStatus: 'done',
    };
  }
  // ⭐ ปฏิเสธ = ฝ่ายจบแถวแบบไม่ได้ของ — declineReason บังคับโดย constraint
  //   answer_evidence · ไม่แตะช่องก้าว (แถวหยุดที่ขั้นที่มันอยู่ แล้ว rowStage อ่าน
  //   answerStatus ชนะเสมอ)
  if (hop === 'refuse') {
    return {
      answerStatus: 'declined',
      declineReason: String(values.note ?? '').trim(),
    };
  }

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

// ⚠️ ค่าตั้งต้นของ `outcome` คือ **"บันทึกคำตอบ"** ไม่ใช่ "บันทึกคำตอบลูกค้า" —
// คำว่าลูกค้าอยู่ในป้ายของขั้นก่อนหน้า ("ส่งลูกค้าแล้ว") อยู่แล้ว และคอลัมน์
// "ก้าวถัดไป" ใช้คำสั้นนี้มาตลอด ⇒ เดิมสองที่พูดคนละคำสำหรับก้าวเดียวกัน
export const hopLabel = (hop, outcome) => (hop === 'outcome'
  ? (OUTCOME_LABELS[outcome] || 'บันทึกคำตอบ')
  : {
    ack: 'รับเรื่อง', ready: 'ส่งงาน', pickup: 'รับของ', send: 'ส่งให้ลูกค้า',
    receive: 'ได้รับแล้ว', refuse: 'ปฏิเสธ',
  }[hop] || hop);

// ป้ายก้าวที่รู้จักสายของแถว
// ⭐ **ทุกสายเรียกก้าวส่งว่า "ส่งงาน"** (มติผู้ใช้ 2026-08-15 — ทับ ม-89 ที่เคยแยก
// "ส่งของ" กับ "ส่งเอกสาร") ⇒ ตอนนี้ไม่มีสาขาที่ต่างกันเหลืออยู่
// ⚠️ **คงฟังก์ชันไว้ ไม่ยุบเข้า `hopLabel`** — ผู้เรียก 4 จุดส่ง `row` มาแล้ว และ
// นี่คือที่เดียวที่คำรายสายจะกลับมาได้ถ้ามีหัวข้อใหม่ต้องการคำของตัวเอง
export const hopLabelFor = (row, hop, outcome) => hopLabel(hop, outcome);

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
  : {
    ack: 'acknowledge', ready: 'ready', pickup: 'pickup', send: 'sent',
    receive: 'received', refuse: 'refused',
  }[hop] || 'comment');
