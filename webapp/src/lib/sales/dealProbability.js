// ── FC% ของดีลมาจากไหน ────────────────────────────────────────────────────
//
// กติกาของบริษัท (มติผู้ใช้ 2026-08-05):
//   SCENT     ตั้งต้น 20% · ออกใบเสนอราคาแล้ว → 50%
//   NPD       ออกใบเสนอราคาแล้ว → 50%
//             + ถ้าโครงการที่เชื่อมอยู่ **มีดีล SCENT ที่ปิด Won แล้ว** → 80%
//
// 🐞 ที่มา: `createQuotationDraft` ดัน stage ไป 'quotation' ให้เรียบร้อย แต่
// **ไม่เคยแตะ `probability`** — ดีลที่ออกใบเสนอราคาไปแล้วจึงยังโชว์ FC 20% ค้างอยู่
// (ป้าย FC% ในตารางอ่านจากคอลัมน์นี้ตรง ๆ) ⇒ ยอดถ่วงน้ำหนักบนแดชบอร์ดต่ำกว่าความจริง
// ทั้งที่หลักฐาน "ออกใบเสนอราคาแล้ว" มีอยู่ในระบบแล้ว
//
// ⚠️ ตัวเลขฐานยังมาจาก DEFAULT_PROBABILITY_BY_STAGE ที่เดียวเหมือนเดิม (ผูกกับ
// `deal_probability_for_stage()` ใน mig 0175 ซึ่งฝั่ง DB ใช้ตอนถอยดีลออกจาก Won)
// ที่นี่เพิ่มได้เฉพาะกติกาที่ **ขั้นอย่างเดียวตอบไม่ได้** — คือข้อ NPD ข้างบน ซึ่งต้องรู้
// ว่าโครงการเดียวกันมีพี่น้อง SCENT ที่ Won แล้วหรือยัง
import {
  DEFAULT_PROBABILITY_BY_STAGE,
  WON_STAGES,
  isClosedStage,
  isWonStage,
  normalizeDealType,
  stageAtLeast,
} from '@/lib/salesPlanning';

/* NPD ที่มีพี่น้อง SCENT ปิด Won แล้ว = ลูกค้าจ่ายจริงกับโครงการนี้ไปแล้ว ระดับเดียวกับ
   "มี FC / ชำระค่า Scent Design" ตามเกณฑ์ 3 ระดับใน mig 0175 */
export const NPD_AFTER_WON_SCENT = 80;

/** ขั้นที่ถือว่า "ออกใบเสนอราคาแล้ว" — กติกาทั้งสองข้อนับจากจุดนี้ขึ้นไป */
export const QUOTED_FROM_STAGE = 'quotation';

/**
 * FC% ที่ควรเป็น เมื่อดูจากขั้น + ประเภทดีล + บริบทโครงการ
 * @param deal {stage, dealType}
 * @param opts.wonScentInProject โครงการที่เชื่อมมีดีล SCENT ที่ปิด Won แล้ว
 *   (ผู้เรียกเป็นคนหา — ฟังก์ชันนี้ต้องบริสุทธิ์เพื่อให้เทสต์คุมได้ทุกกรณี)
 */
export function autoProbability(deal, { wonScentInProject = false } = {}) {
  const stage = deal?.stage;
  const base = DEFAULT_PROBABILITY_BY_STAGE[stage] ?? DEFAULT_PROBABILITY_BY_STAGE.lead;
  // ปิดแล้ว = 100 (Won · ยอดจริง) หรือ 0 (Lost) — ระบบตั้งเอง ห้ามกติกาไหนมาแตะ
  if (isClosedStage(stage)) return base;
  if (
    normalizeDealType(deal?.dealType ?? deal?.metadata?.projectType) === 'NPD'
    && wonScentInProject
    && stageAtLeast(stage, QUOTED_FROM_STAGE)
  ) {
    // Math.max กัน "ปรับขึ้น" กลายเป็นปรับลง: awaiting_confirm/deposit_pending ฐาน 80 อยู่แล้ว
    return Math.max(base, NPD_AFTER_WON_SCENT);
  }
  return base;
}

/* ── ฝั่งที่ต้องถามฐานข้อมูล ────────────────────────────────────────────────
   แยกจากตัวกติกาข้างบนเพื่อให้เทสต์ยิงกติกาได้โดยไม่ต้องต่อ DB */

/** โครงการนี้มีดีล SCENT ที่ปิด Won แล้วไหม (ไม่นับตัวเอง)
    ⚠️ กรอง dealType ฝั่ง DB ไม่ได้อย่างเดียว — ข้อมูลก่อน backfill ประเภทอยู่ที่
    `metadata.projectType` (ดู dealTypeOf) จึงดึงดีล Won ของโครงการมาแล้วคัดใน JS
    ด้วย normalizeDealType ตัวเดียวกับที่หน้าจอใช้ */
export async function hasWonScentInProject(supabase, projectId, exceptDealId = null) {
  if (!projectId) return false;
  let query = supabase
    .from('sales_deals')
    .select('id, dealType, metadata')
    .eq('projectId', projectId)
    .in('stage', WON_STAGES);
  if (exceptDealId) query = query.neq('id', exceptDealId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).some((row) => normalizeDealType(row.dealType ?? row.metadata?.projectType) === 'SCENT');
}

/**
 * FC% ที่ควรเป็นของดีลใบนี้ โดยไปหาบริบทโครงการให้เอง
 * ⚠️ ดีลที่ยังไม่ผูกโครงการ = ไม่มีพี่น้อง จึงไม่ต้องยิง query
 */
export async function resolveProbability(supabase, deal) {
  const dealType = normalizeDealType(deal?.dealType ?? deal?.metadata?.projectType);
  if (dealType !== 'NPD' || !deal?.projectId || !stageAtLeast(deal?.stage, QUOTED_FROM_STAGE)) {
    return autoProbability(deal);
  }
  const wonScentInProject = await hasWonScentInProject(supabase, deal.projectId, deal.id);
  return autoProbability(deal, { wonScentInProject });
}

/**
 * SCENT เพิ่งปิด Won → ดัน FC ของ NPD พี่น้องในโครงการเดียวกันขึ้นเป็น 80
 *
 * ⚠️ ต้องเป็น **cascade** ไม่ใช่คำนวณตอนอ่าน: `probability` เป็นคอลัมน์จริงที่แดชบอร์ด
 * กับประวัติ FC (`sales_deal_forecasts`) อ่านตรง ๆ ถ้าปล่อยให้ค่าจริงกับกติกาไม่ตรงกัน
 * ตัวเลขที่ผู้บริหารเห็นก็จะไม่ตรงกับป้ายที่ AE เห็น
 *
 * @returns รายการดีลที่ถูกปรับ (ไว้ลงประวัติ/บอกผู้ใช้)
 */
export async function cascadeNpdProbability(supabase, projectId, { changedBy = null } = {}) {
  if (!projectId) return [];
  const { data: siblings, error } = await supabase
    .from('sales_deals')
    .select('id, stage, dealType, probability, projectValue, forecastMonth, metadata')
    .eq('projectId', projectId);
  if (error) throw error;

  const wonScentInProject = (siblings || []).some(
    (row) => normalizeDealType(row.dealType ?? row.metadata?.projectType) === 'SCENT' && isWonStage(row.stage),
  );
  if (!wonScentInProject) return [];

  const touched = [];
  for (const row of siblings || []) {
    if (isClosedStage(row.stage)) continue;
    const next = autoProbability(row, { wonScentInProject });
    if (next === row.probability) continue;
    const { error: updateError } = await supabase
      .from('sales_deals')
      .update({ probability: next, updatedAt: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) throw updateError;
    touched.push({ ...row, probability: next, previousProbability: row.probability, changedBy });
  }
  return touched;
}
