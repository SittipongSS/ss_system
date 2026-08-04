// ── สถานะของ "แถว" คำร้อง + เวลาที่ใช้รายก้าว (mig 0202) ──────────────────
//
// ⭐ **แถวคือหน่วยของงาน ไม่ใช่ใบ** — คนละหมวดส่งไม่พร้อมกันได้ ⇒ สถานะอยู่ที่แถว
// ส่วนใบเป็นตัวรวบและตัวนับ (requestProgress ใน stages.js)
//
// ⭐ ไฟล์นี้เป็น **แหล่งเดียว** ที่ตอบว่า "แถวนี้อยู่ขั้นไหน · ใครต้องทำอะไรต่อ" ⇒
// คิวรายฝ่าย · รางแนวตั้งในหน้ารายละเอียด · ปุ่มหลัก อ่านจากที่นี่ทั้งหมด
// จึงขัดกันไม่ได้เชิงโครงสร้าง (ไม่ใช่เพราะมีคนคอยดูให้ตรงกัน)
//
// ⚠️ ทุกอย่างที่นี่ **derive ตอนอ่าน ห้ามเก็บคอลัมน์** — กฎเดิมของ repo ที่เขียนไว้
// สองที่แล้ว (requestProgress · revisionSummary) · เก็บเมื่อไรก็ drift เมื่อนั้น
import { canQuoteMaterial } from '@/lib/materialPrices';
import { canManageRequest } from '@/lib/requests/access';

// ลำดับตามเวลาจริงของงาน — index ใช้เทียบว่า "ถึงขั้นนี้หรือยัง" ได้เลย
export const ROW_STAGES = [
  'awaiting_ack',   // รอฝ่ายปลายทางรับเรื่อง
  'developing',     // รับเรื่องแล้ว กำลังทำ
  'ready',          // ทำเสร็จแล้ว รอผู้ขอมารับ
  'picked_up',      // ผู้ขอรับของแล้ว รอส่งลูกค้า
  'sent',           // ส่งลูกค้าแล้ว รอลูกค้าตอบ
  'revised',        // ลูกค้าขอให้แก้ — แถวนี้จบ งานไปต่อที่แถวใหม่
  'awaiting_price', // ลูกค้าคอนเฟิร์มแล้ว รอใส่ราคา
  'done',           // จบครบวง
  'declined',       // จบแบบไม่ได้ของ (ลูกค้าไม่เอา / ตอบไม่ได้)
];

export const ROW_STAGE_LABELS = {
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

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับสถานะใบและบรรทัด)
export const ROW_STAGE_TONES = {
  awaiting_ack: 'warning',
  developing: 'info',
  ready: 'info',
  picked_up: 'info',
  sent: 'warning',
  revised: 'neutral',
  awaiting_price: 'warning',
  done: 'success',
  declined: 'danger',
};

// ── ขั้นของแถว ───────────────────────────────────────────────────────────
//
// อ่านจาก "ช่องไหนถูกกรอกแล้ว" ตามลำดับย้อนกลับ — ช่องที่ล่าสุดชนะ
// ⚠️ บรรทัดวัสดุไม่มี 4 ก้าว (ตอบราคาแล้วจบเลย) จึงตกที่ awaiting_ack/developing
//    จนกว่าจะตอบ แล้วข้ามไป done/declined — **ไม่ต้องแยกสาขาตาม lineKind**
//    เพราะช่องก้าวของมันว่างอยู่แล้วโดยธรรมชาติ
export function rowStage(row) {
  if (!row) return null;
  // สถานะปลายทางชนะเสมอ — ใส่ราคาแล้วคือจบ ไม่ว่าจะเดินมาทางไหน
  if (row.answerStatus === 'done') return 'done';
  if (row.answerStatus === 'declined' || row.outcome === 'rejected') return 'declined';
  if (row.outcome === 'confirmed') return 'awaiting_price';
  if (row.outcome === 'revise') return 'revised';
  if (row.sentAt) return 'sent';
  if (row.pickedUpAt) return 'picked_up';
  if (row.readyAt) return 'ready';
  if (row.ackAt) return 'developing';
  return 'awaiting_ack';
}

// แถวที่ยังเดินอยู่ = ยังมีใครต้องทำอะไรกับมัน
const SETTLED = new Set(['done', 'declined', 'revised']);
export const isRowSettled = (row) => SETTLED.has(rowStage(row));

// ── ใส่ราคาได้เมื่อไร ────────────────────────────────────────────────────
// ⭐ ด่านนี้เหลือ **ชั้นเดียว** เพราะราคาย้ายมาอยู่ในใบเดิม — เดิมขอราคาเป็นคำร้อง
// คนละใบ จึงต้องกันสามชั้น (จอ · API · เดาไม่ได้ว่ามีทางเข้าอื่นไหม)
// ตอนนี้ไม่มี endpoint "สร้างคำร้องขอราคา" ให้ยิงตรงอีกแล้ว
export function canPriceRow(row) {
  return rowStage(row) === 'awaiting_price';
}

// ── เวลาที่ใช้รายก้าว ────────────────────────────────────────────────────
//
// `ackFallback` = วันที่รับเรื่องระดับใบ ใช้เมื่อแถวยังไม่มี ackAt ของตัวเอง
// (แถวรอบแรกรับเรื่องที่ระดับใบ · แถวที่เกิดจากการแก้รับเรื่องรายแถว)
//
// ⚠️ **clamp ที่ 0 เสมอ** — migration จงใจไม่ใส่ CHECK เรียงวันที่ เพราะผู้ใช้
// แก้วันย้อนหลังเป็นเรื่องปกติ · ติดลบจึงเกิดได้จริงและไม่ใช่ข้อมูลเสีย
// แต่ต้องบอกผู้ใช้ว่ามันเรียงผิด ⇒ คืน `disordered` ให้หน้าจอขึ้นป้ายเตือน
const days = (from, to) => {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

export function rowLeadTimes(row, { ackFallback = null } = {}) {
  if (!row) return null;
  const ack = row.ackAt || ackFallback || null;
  const raw = {
    // ฝ่ายปลายทางใช้กี่วันกว่าจะทำเสร็จ
    develop: days(ack, row.readyAt),
    // ผู้ขอดองกี่วันกว่าจะไปรับ
    pickup: days(row.readyAt, row.pickedUpAt),
    // ผู้ขอดองกี่วันกว่าจะส่งลูกค้า
    deliver: days(row.pickedUpAt, row.sentAt),
    // ลูกค้าใช้กี่วันกว่าจะตอบ
    customer: days(row.sentAt, row.outcomeAt),
  };
  const total = days(ack, row.outcomeAt || row.sentAt || row.pickedUpAt || row.readyAt);
  const disordered = Object.values(raw).some((v) => v !== null && v < 0)
    || (total !== null && total < 0);
  const clamp = (v) => (v === null ? null : Math.max(0, v));
  return {
    develop: clamp(raw.develop),
    pickup: clamp(raw.pickup),
    deliver: clamp(raw.deliver),
    customer: clamp(raw.customer),
    total: clamp(total),
    disordered,
  };
}

// ── ก้าวถัดไปเป็นของใคร ──────────────────────────────────────────────────
//
// ⭐ คิวใช้ตัวนี้ทำคอลัมน์ "ก้าวถัดไป" · หน้ารายละเอียดใช้ตัวเดียวกันทำปุ่มหลัก
// ⇒ ทั้งสองที่พูดตรงกันเสมอโดยไม่ต้องมีใครคอยดูแล
//
// `owner` เป็น **ฝั่ง** ไม่ใช่คน: 'dept' = ฝ่ายที่ต้องตอบ · 'requester' = ผู้ขอ
// · null = ไม่มีใครต้องทำอะไรแล้ว
const NEXT_BY_STAGE = {
  awaiting_ack:   { owner: 'dept',      label: 'รับเรื่อง' },
  developing:     { owner: 'dept',      label: 'ส่งของ' },
  ready:          { owner: 'requester', label: 'รับของ' },
  picked_up:      { owner: 'requester', label: 'ส่งให้ลูกค้า' },
  sent:           { owner: 'requester', label: 'บันทึกคำตอบลูกค้า' },
  awaiting_price: { owner: 'dept',      label: 'ใส่ราคา' },
  revised:        null,
  done:           null,
  declined:       null,
};

// คืน { stage, owner, label, isMine } หรือ null ถ้าแถวนี้จบแล้ว
// `request` ต้องมาด้วยเพราะ "ใครคือฝ่ายที่ต้องตอบ" อยู่บนหัวใบ ไม่ใช่บนแถว
export function nextStepForRow(row, request, user) {
  const stage = rowStage(row);
  const next = NEXT_BY_STAGE[stage];
  if (!next) return null;
  const isDept = canQuoteMaterial(user, request?.dept);
  const isRequester = canManageRequest(user, request);
  return {
    stage,
    owner: next.owner,
    label: next.label,
    isMine: next.owner === 'dept' ? isDept : isRequester,
  };
}

// สรุปทั้งใบ — ใช้ทำแถบตัวเลขบนคิว ("รอฝ่ายขายทำต่อ" คือตัวที่ไม่มีในระบบวันนี้)
//
// ⚠️ `waitingRequester` คือตัวเลขที่ทำให้ฝ่ายปลายทางเลิกถูกนับงานที่ไม่ใช่ของตัวเอง
export function requestRowSummary(items = []) {
  const out = { total: items.length, waitingDept: 0, waitingRequester: 0, settled: 0 };
  for (const row of items) {
    const stage = rowStage(row);
    if (SETTLED.has(stage)) { out.settled += 1; continue; }
    const next = NEXT_BY_STAGE[stage];
    if (next?.owner === 'dept') out.waitingDept += 1;
    else if (next?.owner === 'requester') out.waitingRequester += 1;
  }
  return out;
}
