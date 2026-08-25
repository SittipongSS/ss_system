// ── รางขั้น + อายุงาน ของ "แถว" — ของกลางทุกหัวข้อ (มติผู้ใช้ 2026-08-25) ──
//
// ⭐ **ตารางสรุปทั้งใบเล่าเรื่องเดียวกันทุกหัวข้อ** — เดิมสามหัวข้อมีตารางคนละชุด
// คนละคอลัมน์ (`BriefBoard` · `FormulaDevBoard` · `DocumentBoard`) และแต่ละตารางบอก
// ขั้นของแถวด้วย **ป้ายคำเดี่ยว ๆ** ซึ่งตอบได้แค่ "ตอนนี้อยู่ไหน" ไม่ได้บอกว่าเหลืออีกไกล
// แค่ไหน · ทั้งที่รางแบบเดียวกันมีอยู่แล้วบนตารางคิว ใบสั่งขาย สัญญา ทะเบียนชำระ
//
// ⚠️ **ไม่ใช่ primitive ใหม่** — วาดด้วย `<StepTrack compact>` ตัวเดิม · ไฟล์นี้มีแต่
// ตรรกะ (เหตุผลเดียวกับที่ `queueTrack.js` แยกจาก StepTrack: ต้องเทสต์ได้โดยไม่เรนเดอร์)
//
// ⚠️ **ขั้นมาจาก `rowStage` ที่เดียว** เหมือนทุกจอ ⇒ รางบนตารางกับปุ่มท้ายเธรดขัดกัน
// ไม่ได้เชิงโครงสร้าง
import { ROW_STAGES, rowStage } from '@/lib/requests/rowStage';
import { isDocLineKind } from '@/lib/requests/docTypes';

/* ── สายของแถว ────────────────────────────────────────────────────────────
   ⭐ **สองสาย ไม่ใช่สายเดียว** — สายเอกสารไม่มีลูกค้าอยู่ในเส้นทาง (ม-85) · ยัดห้าขั้น
   ให้มันแปลว่าราง 2 ใน 5 จุดจะเทาค้างตลอดกาลในทุกใบขอเอกสาร ซึ่งอ่านเหมือนงานค้าง
   ⚠️ `key` ต้องตรงกับชื่อขั้นใน `ROW_STAGES` — ตัวเทียบข้างล่างใช้ index ของมันตรง ๆ */
const DEV_TRACK = [
  { key: 'awaiting_ack', label: 'รับเรื่อง' },
  { key: 'developing', label: 'ส่งงาน' },
  { key: 'ready', label: 'รับของ' },
  { key: 'picked_up', label: 'ส่งลูกค้า' },
  { key: 'sent', label: 'ลูกค้าตอบ' },
];
const DOC_TRACK = [
  { key: 'awaiting_ack', label: 'รับเรื่อง' },
  { key: 'developing', label: 'ส่งงาน' },
  { key: 'ready', label: 'ได้รับแล้ว' },
];

// ขั้นปลายทางที่ "จบแล้ว" — รางเต็มทุกจุด ไม่ว่าเดินมาทางไหน
const TERMINAL = { done: 'done', awaiting_price: 'done', revised: 'done', declined: 'bad' };

/**
 * ราง `<StepTrack compact>` ของหนึ่งแถว
 *
 * ⚠️ **`declined` ทาแดงเฉพาะจุดที่ค้าง ไม่ใช่ทั้งราง** — แถวที่ฝ่ายตอบว่าให้ไม่ได้
 * ยังเดินผ่านขั้นก่อนหน้ามาจริง · ย้อมแดงทั้งเส้นแล้วอ่านเหมือนไม่มีอะไรเกิดขึ้นเลย
 */
export function rowTrackSteps(row) {
  const stage = rowStage(row);
  const track = isDocLineKind(row?.lineKind) ? DOC_TRACK : DEV_TRACK;
  const terminal = TERMINAL[stage] || null;
  const at = ROW_STAGES.indexOf(stage);
  return track.map((s, i) => {
    const stepAt = ROW_STAGES.indexOf(s.key);
    if (terminal === 'bad' && i === track.length - 1) return { ...s, state: 'bad' };
    if (terminal) return { ...s, state: 'done' };
    // ขั้นที่ถืออยู่ตอนนี้ = `now` · ก่อนหน้า = `done` · หลังจากนั้น = `todo`
    if (stepAt < at) return { ...s, state: 'done' };
    if (stepAt === at) return { ...s, state: 'now' };
    return { ...s, state: 'todo' };
  });
}

const DAY = 86400000;
const dayStart = (value) => {
  if (!value) return null;
  const t = Date.parse(String(value).length <= 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(t) ? t : null;
};

// วันของก้าวล่าสุดที่แถวนี้เดินผ่าน — ย้อนจากท้ายสาย ก้าวที่ใหม่สุดชนะ
const lastHopAt = (row) => dayStart(row?.outcomeAt)
  ?? dayStart(row?.sentAt) ?? dayStart(row?.pickedUpAt)
  ?? dayStart(row?.readyAt) ?? dayStart(row?.ackAt) ?? dayStart(row?.createdAt);

/**
 * ตราเวลาที่ "ค้างมากี่วัน" ต้องใช้ — **แยกจากการคิดเลขโดยตั้งใจ**
 *
 * ⭐ ตัวสร้างแถว (`briefBoard` · `formulaDevBoard` · `documentBoard`) เป็นฟังก์ชัน
 * บริสุทธิ์ที่ไม่มีสิทธิ์รู้ว่า "วันนี้" คือวันไหน ⇒ มันแนบตราเวลามาให้ แล้วจอที่รู้จัก
 * `today` เป็นคนคิดเลข · รวมสองอย่างเข้าด้วยกันเมื่อไร ตัวสร้างแถวต้องอ่านนาฬิกา
 * ซึ่งผิดกฎ react-hooks/purity และทำให้เทสต์ของมันขึ้นกับวันที่รัน
 */
export function rowIdleStamps(row) {
  const stage = rowStage(row);
  return {
    at: lastHopAt(row),
    born: dayStart(row?.ackAt) ?? dayStart(row?.createdAt),
    settled: stage === 'done' || stage === 'declined' || stage === 'revised',
  };
}

/**
 * "ค้างมากี่วัน" ของแถวที่ยังเดินอยู่ · แถวที่จบแล้วบอก "จบใน N วัน" แทน
 *
 * ⭐ **คอลัมน์นี้ไม่เคยมีที่ยืน** ทั้งที่เป็นตัวเดียวที่เรียงความเร่งด่วนได้จริง —
 * วัด 2026-08-25: มีแถวค้างเกิน 7 วัน 4 แถว ยาวสุด **15 วัน** โดยไม่มีจอไหนบอก
 *
 * ⚠️ **`today` ต้องส่งเข้ามา ห้ามอ่านนาฬิกาข้างใน** — เรนเดอร์ฝั่ง server กับ client
 * คนละวินาทีแล้ว React เตือน hydration mismatch (กฎเดียวกับกำหนดการของฉัน) ·
 * ยังไม่รู้วันนี้ = คืน null ไม่ใช่เดา (จอขึ้นขีดไปก่อนหนึ่งเฟรม)
 *
 * @returns {{days:number, settled:boolean, late:boolean}|null}
 */
export function idleFromStamps(stamps, today = null) {
  const now = dayStart(today);
  if (!stamps || stamps.at === null || now === null) return null;
  if (stamps.settled) {
    // จบไปแล้ว — เลขที่มีความหมายคือ "ใช้เวลาทั้งหมดกี่วัน" ไม่ใช่อายุนับถึงวันนี้
    if (stamps.born === null) return null;
    return { days: Math.max(0, Math.round((stamps.at - stamps.born) / DAY)), settled: true, late: false };
  }
  const days = Math.max(0, Math.round((now - stamps.at) / DAY));
  // ⚠️ เกณฑ์ 7 วันเป็นของ **คอลัมน์นี้** ไม่ใช่ของกำหนดส่ง — วันกำหนดส่งเป็นคำสัญญา
  // ที่ฝ่ายให้ไว้ ส่วนตัวนี้คือ "ไม่มีใครแตะแถวนี้มานานแค่ไหน" คนละคำถาม
  return { days, settled: false, late: days > 7 };
}

export const rowIdle = (row, today = null) => idleFromStamps(rowIdleStamps(row), today);

// ป้ายพร้อมใช้ — จอไม่ต้องประกอบคำเอง (สามตารางจะเขียนคนละคำทันทีที่ให้ประกอบเอง)
export function idleLabel(stamps, today = null) {
  const idle = idleFromStamps(stamps, today);
  if (!idle) return null;
  // ⚠️ "จบใน 0 วัน" อ่านเหมือนตัวเลขผิด ทั้งที่ของจริงคือเปิดปิดวันเดียวกัน
  if (idle.settled) return idle.days === 0 ? 'จบวันเดียว' : `จบใน ${idle.days} วัน`;
  return idle.days === 0 ? 'วันนี้' : `${idle.days} วัน`;
}

export const rowIdleLabel = (row, today = null) => idleLabel(rowIdleStamps(row), today);
