// ── การ์ด "สรุปใบนี้" — ทรงเดียวทุกหัวข้อ (มติผู้ใช้ 2026-08-25) ──────────
//
// 🐞 **ของเดิม: หัวข้อละทรง** — พัฒนากลิ่นมี 6 ตัวเลข + ป้ายกระทบยอด + เช็คลิสต์ ·
// พัฒนาสูตรมี 6 ตัวเลขคนละชุด · ขอเอกสารมี 4 · สอบถามข้อมูล/ติดตามของเข้า **ไม่มีเลย**
// ⇒ คนที่ดูใบสองหัวข้อในวันเดียวกันต้องเรียนรู้การ์ดใหม่ทุกครั้ง และไม่มีตัวเลขไหนอยู่
// ตำแหน่งเดิมให้กวาดตาข้าม
//
// ⭐ **ทรงเดียว: ตัวเลขนำ + แกนสามแถว** — ตัวเลขนำตอบ "งานนี้ไปถึงไหนแล้ว" (จบ/ทั้งหมด)
// ส่วนแกนสามแถวตอบ "ที่เหลือค้างอยู่ที่ใคร" ซึ่งเป็นคำถามเดียวกันทุกหัวข้อ:
//   รอ<ฝ่าย> · รอ<ผู้ขอ> · ไม่ถูกเลือก
// ตำแหน่งคงที่ ⇒ สแกนข้ามใบได้ · แถวศูนย์ **จางลงแต่ไม่หาย** (หายเมื่อไร ตำแหน่งเลื่อน
// แล้วข้อดีทั้งหมดของตำแหน่งคงที่ก็หมดไป)
//
// ⚠️ **คำใต้ตัวเลขนำเป็นภาษาของหัวข้อ** — "ได้รับแล้ว" (เอกสาร) · "ได้สูตรแล้ว" (สูตร) ·
// "ลูกค้าตอบแล้ว" (กลิ่น) · ต้องตรงกับคำที่ป้ายของแถวในตารางเดียวกันใช้ ไม่งั้นการ์ด
// กับตารางเรียกของชิ้นเดียวกันคนละชื่อ
//
// ⚠️ **ของเฉพาะหัวข้อไม่ปนกับแกนร่วม** — เงินของ FN · อ้างอิงของขอเอกสาร · กระทบยอด SO
// ของพัฒนากลิ่น ไปอยู่ก้อนล่างของการ์ด (prop `children` ของ `DocumentSummaryCard`)
import { isRowSettled, nextByStageFor, rowStage } from '@/lib/requests/rowStage';
import { requestWaitLabel } from '@/lib/requests/replyTurn';

/* คำใต้ตัวเลขนำ + ตัวนับ "จบแล้ว" ของแต่ละหัวข้อ
   ⚠️ `done` ต้องเป็น **จบแบบได้ของ** ไม่ใช่ `isRowSettled` — แถวที่ลูกค้าไม่เอา
   ก็จบเหมือนกัน แต่นับรวมเมื่อไร ใบที่ถูกปฏิเสธทั้งใบจะอ่านว่า "เสร็จครบ" */
const LEAD_BY_SHAPE = Object.freeze({
  document: { caption: 'ได้รับแล้ว', done: (row) => rowStage(row) === 'done' },
  billing_doc: { caption: 'ออกให้แล้ว', done: (row) => rowStage(row) === 'done' },
  product_dev: { caption: 'ได้สูตรแล้ว', done: (row) => !!row.producedFormulaId },
  /* ⚠️ สายกลิ่นวัดที่ **ลูกค้าตอบแล้ว** ไม่ใช่ "ส่งแล้ว" — ของที่ส่งไปแล้วแต่ลูกค้ายัง
     ไม่ตอบคือของที่ยังไม่รู้ผล ซึ่งเป็นสถานะที่ใบนี้ค้างอยู่จริง ๆ ส่วนใหญ่ */
  scent_dev: { caption: 'ลูกค้าตอบแล้ว', done: (row) => !!row.outcome },
});

/**
 * ตัวเลขของการ์ด "สรุปใบนี้" — ทรงเดียวทุกหัวข้อ
 *
 * @param request ใบพร้อม `items` · `dept`
 * @param lineShape รูปร่างบรรทัดของหัวข้อ (`lineShapeForKind`) — null = ใบไม่มีบรรทัด
 * @returns null เมื่อไม่มีบรรทัดให้นับ (หัวข้อเธรดล้วนใช้การ์ดขั้นของใบแทน)
 */
export function requestPanelSummary(request, lineShape = null) {
  const items = (request?.items || []).filter((row) => !lineShape || row?.lineKind === lineShape);
  if (!items.length) return null;
  const lead = LEAD_BY_SHAPE[lineShape] || LEAD_BY_SHAPE.scent_dev;

  let waitingDept = 0;
  let waitingRequester = 0;
  let refused = 0;
  let done = 0;
  for (const row of items) {
    const stage = rowStage(row);
    if (lead.done(row)) done += 1;
    /* ⚠️ `declined` เท่านั้นที่เป็น "ไม่ถูกเลือก" — `revised` ก็ settled เหมือนกันแต่
       มันคือแถวที่ **งานไปต่อที่แถวใหม่** ไม่ใช่แถวที่จบแบบไม่ได้ของ · นับรวมเมื่อไร
       ใบที่ลูกค้าขอแก้สองรอบจะอ่านว่าถูกปฏิเสธไปสองรายการ */
    if (stage === 'declined') { refused += 1; continue; }
    if (isRowSettled(row)) continue;
    const next = nextByStageFor(row)[stage];
    if (next?.owner === 'dept') waitingDept += 1;
    else if (next?.owner === 'requester') waitingRequester += 1;
  }

  return {
    lead: { done, total: items.length, caption: lead.caption, complete: done === items.length },
    /* ⚠️ ป้ายสองแถวแรกเป็น **ชื่อฝ่ายจริง** ไม่ใช่ "ฝ่าย"/"ผู้ขอ" ลอย ๆ — ผ่าน
       `requestWaitLabel` ตัวเดียวกับที่คิวและรางใช้ ⇒ สามที่พูดคำเดียวกันเสมอ และ
       ได้กติกาช่องไฟรอบรหัสฝ่ายมาด้วย ("รอ RD" ไม่ใช่ "รอRD") */
    rows: [
      { id: 'dept', label: requestWaitLabel(request, 'dept', '').trim(), value: waitingDept },
      { id: 'requester', label: requestWaitLabel(request, 'requester', '').trim(), value: waitingRequester },
      { id: 'refused', label: 'ไม่ถูกเลือก', value: refused },
    ],
  };
}
