// ── ตารางสรุปทั้งใบ: บรีฟ → กลิ่น → ผลลัพธ์ → สถานะ (ม็อกอัพ ส่วน 07) ────
//
// ⭐ **โครงสามชั้นที่ตกลงกันไว้ อ่านได้ในตารางเดียว** — SO 1 : PDR 1 : กลิ่น N :
// direction M · เดิมหน้ารายละเอียดมีแต่การ์ดรายแถวเรียงกันลงมา ⇒ ใบที่มี 3 บรีฟ
// × 2 direction = 6 การ์ด ต้องไถทั้งหน้าถึงจะตอบได้ว่า "บรีฟไหนยังไม่มีอะไรเลย"
//
// ⚠️ **ประกอบที่ lib ไม่ใช่ใน JSX** — กฎที่ตั้งไว้หลังบั๊กรางซ้ำ (#1033): ประกอบ
// array ของขั้นตอน/แถวใน JSX เมื่อไร CI จะมองไม่เห็น แล้วผู้ใช้เป็นคนเจอบนจอ
import { ROW_STAGE_LABELS, ROW_STAGE_TONES, rowStage } from '@/lib/requests/rowStage';
import { hopLabel } from '@/lib/requests/hops';

// ผลลัพธ์จากลูกค้า → ป้าย + โทน · ยังไม่ตอบ = ยังไม่ถึงตาลูกค้า ไม่ใช่ลูกค้าเงียบ
const OUTCOME_TONE = { confirmed: 'success', revise: 'neutral', rejected: 'danger' };

/**
 * แถวหนึ่งของตาราง — direction หนึ่งตัว
 *
 * ⚠️ `name` ใช้ `label` ของแถว **ไม่ใช่ชื่อกลิ่นจากทะเบียน** — label เป็น snapshot
 * ณ ตอนส่ง (ดู delivery.js) ⇒ ทะเบียนเปลี่ยนชื่อทีหลังแล้วใบเก่ายังอ่านออกว่าตอนนั้น
 * ส่งอะไรไป
 */
function directionRow(item) {
  const stage = rowStage(item);
  return {
    id: item.id,
    name: item.label || '—',
    scentId: item.producedScentId || null,
    // ⭐ รอบแก้ต้องอ่านออกจากตารางว่าเป็นรอบแก้ ไม่ต้องเปิดการ์ดดู
    rework: !!item.derivedFromItemId,
    outcome: item.outcome || null,
    outcomeLabel: item.outcome ? hopLabel('outcome', item.outcome) : null,
    outcomeTone: item.outcome ? OUTCOME_TONE[item.outcome] || 'neutral' : null,
    outcomeNote: item.outcomeNote || null,
    confirmedQty: item.confirmedQty ?? null,
    stage,
    stageLabel: ROW_STAGE_LABELS[stage] || stage,
    stageTone: ROW_STAGE_TONES[stage] || 'neutral',
  };
}

/**
 * ทั้งใบ → กลุ่มตามบรีฟ — คืน [{ id, label, directions, untouched }]
 *
 * ⚠️ **มีก้อน "ยังไม่ผูกบรีฟ" เสมอเมื่อมี direction ที่ briefId ว่าง** — ของพวกนี้มีอยู่
 * จริงบน prod (แถวที่เกิดก่อน mig 0213 และแถวรอบแก้ที่เกิดก่อน #1049) · ซ่อนทิ้ง
 * เมื่อไร ตารางจะบอกยอดน้อยกว่าที่มีจริงโดยไม่มีอะไรฟ้อง
 */
export function briefBoard(briefs = [], items = []) {
  const rows = (items || []).filter((i) => i?.lineKind === 'scent_dev');
  const groups = (briefs || []).map((b, i) => {
    const directions = rows.filter((r) => r.briefId === b.id).map(directionRow);
    return {
      id: b.id,
      label: b.label || `กลิ่นที่ ${i + 1}`,
      brief: b.brief || null,
      directions,
      // "ยังไม่ได้ลงมือ" = บรีฟที่ยังไม่มี direction ไหนตอบเลย — ตัวเลขที่บอกว่างานยัง
      // ไม่ครบ ซึ่งยอดรวมของทั้งใบมองไม่เห็น
      untouched: directions.length === 0,
    };
  });

  const orphans = rows.filter((r) => !r.briefId || !groups.some((g) => g.id === r.briefId));
  if (orphans.length) {
    groups.push({
      id: null,
      label: 'ยังไม่ผูกบรีฟ',
      brief: null,
      directions: orphans.map(directionRow),
      untouched: false,
    });
  }
  return groups;
}

/**
 * ยอดรวมของทั้งใบ — ใช้ทำแถบตัวเลขเหนือตาราง
 *
 * ⚠️ `waiting` นับ direction ที่ **ยังเดินอยู่** ไม่ใช่ที่ยังไม่ถูกตอบ — สองอันนี้ต่างกัน
 * ตรงแถวที่ลูกค้าขอแก้ (จบในเชิงงานแล้ว งานย้ายไปแถวใหม่) ซึ่งเคยทำให้ใบปิดไม่ลง
 */
export function briefBoardTotals(groups = []) {
  const all = groups.flatMap((g) => g.directions);
  return {
    briefs: groups.filter((g) => g.id).length,
    directions: all.length,
    untouched: groups.filter((g) => g.id && g.untouched).length,
    confirmed: all.filter((d) => d.outcome === 'confirmed').length,
    revised: all.filter((d) => d.outcome === 'revise').length,
    rejected: all.filter((d) => d.outcome === 'rejected').length,
    waitingCustomer: all.filter((d) => d.stage === 'sent').length,
    awaitingPrice: all.filter((d) => d.stage === 'awaiting_price').length,
    done: all.filter((d) => d.stage === 'done').length,
  };
}
