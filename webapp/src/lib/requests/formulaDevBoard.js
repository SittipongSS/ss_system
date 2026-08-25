// ── สรุปทั้งใบของ "พัฒนาสูตร" (P4) — logic ล้วน ─────────────────────────
//
// ⭐ **โครงสองชั้น ไม่ใช่สามชั้น** — ต่างจากพัฒนากลิ่นตรงนี้เป็นหลัก:
//   พัฒนากลิ่น  SO → PDR → บรีฟ N ก้อน → direction M ตัว   (RD สร้างแถวตอนส่ง)
//   พัฒนาสูตร   คำร้อง → แถว N (หมวด × กลิ่น)              (SA สร้างแถวตอนเปิด)
// ⇒ ไม่มีชั้น "บรีฟ" ให้จัดกลุ่ม · ตารางสรุปจึงเป็นรายแถวตรง ๆ
//
// ⚠️ **นับจากขั้นของแถวที่ `rowStage.js` ที่เดียว** — ตัวเดียวกับที่คิว ภาพรวม `/rd`
// และปุ่มท้ายเธรดใช้ ⇒ ตัวเลขบนจอนี้ขัดกับที่อื่นไม่ได้เชิงโครงสร้าง
//
// ⚠️ **ประกอบที่ lib ไม่ใช่ใน JSX** — กฎที่ตั้งไว้หลังบั๊กรางซ้ำ (#1033)
import { ROW_STAGE_LABELS, ROW_STAGE_TONES, isRowSettled, rowStage } from '@/lib/requests/rowStage';
import { hopLabel } from '@/lib/requests/hops';
/* ⭐ **รางขั้น + อายุงานเป็นของกลางทุกหัวข้อ** (มติผู้ใช้ 2026-08-25) — สามตาราง
   เคยบอกขั้นด้วยป้ายคำเดี่ยว ๆ ซึ่งตอบได้แค่ "ตอนนี้อยู่ไหน" ไม่ได้บอกว่าเหลืออีกไกล
   แค่ไหน · ประกอบที่นี่ (ตัวสร้างแถว) ไม่ใช่ใน JSX — กฎหลังบั๊กรางซ้ำ #1033 */
import { rowIdleStamps, rowTrackSteps } from '@/lib/requests/rowTrack';
import { reworkBriefOf } from '@/lib/requests/rework';

const OUTCOME_TONE = { confirmed: 'success', revise: 'neutral', rejected: 'danger' };

/**
 * ทั้งใบ → แถวของตารางสรุป
 *
 * ⚠️ `name` ใช้ `label` ของแถวซึ่งเป็น **snapshot ตอนเปิดใบ** ("เทียนหอม · SC-2611
 * Amber Woods") ไม่ใช่ชื่อจากทะเบียนสด ⇒ ทะเบียนเปลี่ยนชื่อทีหลังแล้วใบเก่ายังอ่าน
 * ออกว่าตอนนั้นขออะไร (แพตเทิร์นเดียวกับ briefBoard)
 */
export function formulaDevBoard(items = []) {
  return (items || [])
    .filter((i) => i?.lineKind === 'product_dev')
    .map((item) => {
      const stage = rowStage(item);
      return {
        id: item.id,
        name: item.label || '—',
        spec: item.spec || null,
        qty: item.qty ?? null,
        unit: item.unit || null,
        // ⭐ สูตรที่เกิดจากแถวนี้ — ว่าง = RD ยังไม่ส่ง
        formulaId: item.producedFormulaId || null,
        /* ⭐ **ค่าสดจากทะเบียน** (มติผู้ใช้ 2026-08-18) — สูตรที่ออกจากแถวนี้ ·
           แถวที่ยังไม่มีสูตรได้ null · ดู `lib/requests/registryLinks.js`
           ⚠️ กลิ่นที่แถวนี้ *ขอ* อยู่คนละช่อง (`scent`) — คนละตัวกับสูตรที่ได้ */
        registry: item.refFormula ? { ...item.refFormula, kind: 'formula' } : null,
        scent: item.refScent ? { ...item.refScent, kind: 'scent' } : null,
        // ⭐ ราคาที่ออกจากแถวนี้ (ช่องว่างข้อ 5) — `findRequest` เติมจาก rev ที่
        // `answeredRevisionId` ชี้ · null = ยังไม่ถึงขั้นราคา
        priced: item.pricedResult || null,
        // ⭐ รอบแก้ต้องอ่านออกจากตารางว่าเป็นรอบแก้ ไม่ต้องเปิดการ์ดดู
        rework: !!item.derivedFromItemId,
        // ⭐ โจทย์ของรอบนี้ — คอมเมนต์ลูกค้าจากแถวต้นทาง (มติผู้ใช้ 2026-08-25)
        reworkBrief: reworkBriefOf(item, items),
        outcome: item.outcome || null,
        outcomeLabel: item.outcome ? hopLabel('outcome', item.outcome) : null,
        outcomeTone: item.outcome ? OUTCOME_TONE[item.outcome] || 'neutral' : null,
        outcomeNote: item.outcomeNote || null,
        confirmedQty: item.confirmedQty ?? null,
        stage,
        track: rowTrackSteps(item),
        // ⚠️ ตราเวลาดิบ ไม่ใช่จำนวนวัน — ตัวสร้างแถวไม่มีสิทธิ์รู้ว่า "วันนี้" คือวันไหน
        idle: rowIdleStamps(item),
        stageLabel: ROW_STAGE_LABELS[stage] || stage,
        stageTone: ROW_STAGE_TONES[stage] || 'neutral',
        settled: isRowSettled(item),
      };
    });
}

/**
 * ยอดรวมของทั้งใบ — แถบตัวเลขเหนือตาราง
 *
 * ⚠️ `waiting` = แถวที่ **ยังเดินอยู่** ไม่ใช่แถวที่ยังไม่ถูกตอบ — ต่างกันตรงแถวที่
 * ลูกค้าขอแก้ (จบในเชิงงานแล้ว งานย้ายไปแถวใหม่) ซึ่งเคยทำให้ใบปิดไม่ลง
 */
export function formulaDevTotals(rows = []) {
  return {
    asked: rows.length,
    delivered: rows.filter((r) => r.formulaId).length,
    // ยังไม่ส่ง = ยังไม่มีสูตรออกมาจากแถวนี้ และแถวยังเดินอยู่
    pending: rows.filter((r) => !r.formulaId && !r.settled).length,
    waitingCustomer: rows.filter((r) => r.stage === 'sent').length,
    awaitingPrice: rows.filter((r) => r.stage === 'awaiting_price').length,
    confirmed: rows.filter((r) => r.outcome === 'confirmed').length,
    revised: rows.filter((r) => r.outcome === 'revise').length,
    rejected: rows.filter((r) => r.outcome === 'rejected').length,
    done: rows.filter((r) => r.stage === 'done').length,
  };
}

// ── แถวที่พร้อมส่งพร้อมกัน (ช่องว่างข้อ 3 ของแบบ) ────────────────────────
//
// 🐞 ใบที่ขอ 5 รายการและทำเสร็จพร้อมกัน RD ต้องเปิดโมดัลห้ารอบ กรอกวันเดิมห้าครั้ง
// ⇒ โมดัลรวบ: วันที่ส่งกรอกครั้งเดียว ชื่อ/รหัสสูตรกรอกรายแถว
//
// ⚠️ เอาเฉพาะแถวขั้น `developing` — แถวที่ยังไม่รับเรื่อง (รอบแก้ที่เพิ่งเกิด) ยังส่ง
// ไม่ได้ (`hopStageError` จะตีกลับ) และแถวที่ส่งแล้วไม่ต้องส่งซ้ำ
export function bulkReadyRows(items = []) {
  return (items || []).filter(
    (i) => i?.lineKind === 'product_dev' && rowStage(i) === 'developing',
  );
}
