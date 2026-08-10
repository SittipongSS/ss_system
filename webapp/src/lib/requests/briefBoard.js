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
    // ⭐ **สายพันธุ์ของงาน** — ฐานเก็บไว้แล้วแต่ตารางไม่เคยใช้ ⇒ รอบแก้ลอยเป็นแถว
    // ธรรมดา อ่านไม่ออกว่าแก้มาจากตัวไหน (ผู้ใช้ทัก 2026-08-10)
    parentId: item.derivedFromItemId || null,
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

/**
 * เรียง direction **ตามสายพันธุ์** — ตัวต้นทางก่อน แล้วรอบแก้ที่แตกจากมันตามมาทันที
 *
 * ⭐ ผู้ใช้ยืนยันรูปร่างจริง (2026-08-10): 1 บรีฟพัฒนา 2-3 direction · ลูกค้าขอแก้แล้ว
 * พัฒนาต่ออีก 2-3 ที่ผูกกลับไปหาตัวต้นทาง ⇒ ใบที่เดินครบสองรอบมีได้ ~150 แถว
 * เรียงตาม sortOrder เฉย ๆ ทำให้ FR-04 (ที่แก้มาจาก FR-02) ไปอยู่ท้ายสุด อ่านไม่ออก
 * ว่าเกี่ยวกับใคร ทั้งที่ฐานเก็บ `derivedFromItemId` ไว้แล้ว
 *
 * ⚠️ `depth` ใช้เยื้องบนจอเท่านั้น — จำกัดที่ 1 เพราะรอบแก้ของรอบแก้ยังอ่านเป็น
 * "ลูกของต้นทางเดิม" ได้ ไม่ต้องเยื้องลึกจนคอลัมน์แรกหมดที่
 * ⚠️ ตัวที่พ่อไม่ได้อยู่ในบรีฟเดียวกัน (ข้อมูลเก่าก่อน #1049) ถือเป็นราก — ห้ามหายไป
 */
function lineage(list = []) {
  const byId = new Map(list.map((d) => [d.id, d]));
  const children = new Map();
  for (const d of list) {
    if (!d.parentId || !byId.has(d.parentId)) continue;
    if (!children.has(d.parentId)) children.set(d.parentId, []);
    children.get(d.parentId).push(d);
  }
  const out = [];
  const push = (d, depth) => {
    out.push({ ...d, depth });
    for (const kid of children.get(d.id) || []) push(kid, 1);
  };
  for (const d of list) {
    if (d.parentId && byId.has(d.parentId)) continue;
    push(d, 0);
  }
  return out;
}

/**
 * สรุปของบรีฟก้อนเดียว — ใช้ทำแถบพับที่อ่านได้โดยไม่ต้องกาง
 *
 * ⚠️ `needsAction` = มีตัวที่ **รอฝั่งเราทำอะไร** (ยังไม่ส่ง/ยังไม่ตั้งราคา) ไม่ใช่
 * "ยังไม่จบ" — ตัวที่ส่งไปแล้วรอลูกค้าตอบไม่ใช่ของที่เราต้องลงมือ ⇒ ก้อนนั้นพับได้
 */
function groupSummary(directions = []) {
  const outcome = (v) => directions.filter((d) => d.outcome === v).length;
  const waiting = directions.filter((d) => d.stage !== 'sent' && d.stage !== 'done').length;
  return {
    total: directions.length,
    rework: directions.filter((d) => d.rework).length,
    confirmed: outcome('confirmed'),
    revise: outcome('revise'),
    rejected: outcome('rejected'),
    waiting,
    needsAction: waiting > 0,
  };
}

export function briefBoard(briefs = [], items = []) {
  const rows = (items || []).filter((i) => i?.lineKind === 'scent_dev');
  const groups = (briefs || []).map((b, i) => {
    const directions = lineage(rows.filter((r) => r.briefId === b.id).map(directionRow));
    return {
      id: b.id,
      label: b.label || `กลิ่นที่ ${i + 1}`,
      brief: b.brief || null,
      directions,
      summary: groupSummary(directions),
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
      directions: lineage(orphans.map(directionRow)),
      summary: groupSummary(lineage(orphans.map(directionRow))),
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
