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
//
// ── ขาเข้า/ขาออกของ 80% (มติผู้ใช้ 2026-09-25 · ชุดย้อนการรับใบ ข้อ 3) ─────────────
//   ขาเข้า  SCENT ปิด Won → `cascadeNpdProbability` ดัน **NPD เท่านั้น** ขึ้น 80
//           🐞 เดิมตั้งทุกดีลเปิดในโครงการเป็น autoProbability ⇒ SCENT/RE-ORDER/OTHER (และ NPD
//           ที่ยังไม่ออกใบ) ที่ AE เลือก FC% เองถูกรีเซ็ตเป็นค่าตั้งต้นของขั้นเงียบ ๆ
//   ขาออก  ย้อนการรับใบ → `settleProbabilityAfterUnaccept`
//           · ดีลที่ถูกย้อน = resolveProbability (RPC ตั้งค่าตั้งต้นของขั้นให้ ซึ่งผิดกับ NPD
//             ที่โครงการยังมี SCENT Won — ควรได้ 80 ไม่ใช่ 50) · 80 นี้ติดป้าย cascade เพราะกติกาตั้ง
//             ⇒ ถอยได้ภายหลังแบบเดียวกับพี่น้อง
//           · NPD พี่น้องที่ cascade ดันไว้ กลับฐาน **เฉพาะเมื่อ** โครงการไม่เหลือ SCENT ที่ Won
//             **และ** audit ล่าสุดที่ขยับ FC% ของดีลนั้นยังเป็นของ cascade (ไม่มีใครแตะหลังจากนั้น)
//             ⚠️ 80 เป็นระดับที่ AE เลือกเองได้ปกติ ⇒ ดูแค่ตัวเลขไม่พอ ต้องดูว่าใครตั้ง
//   ⚠️ ขาออกมีเฉพาะทาง "ย้อนการรับใบ" — ยกเลิก SO พร้อมย้อนสถานะ (0170) กับแอดมินลบใบบังคับ
//      (0381) ไม่ถอย 80 ให้ (มติ 25/09 ข้อ 4 ขอบเขตเดียวกับการเปิดใบพี่น้องคืน) ⇒ 80 ที่ค้างจาก
//      สองทางนั้นจะถูกถอยในการย้อนรับใบครั้งถัดไปของโครงการเดียวกัน ถ้าเข้าเงื่อนไขครบ
import {
  DEFAULT_PROBABILITY_BY_STAGE,
  WON_STAGES,
  isClosedStage,
  isWonStage,
  normalizeDealType,
  stageAtLeast,
} from '@/lib/salesPlanning';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';

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
  if (wonScentInProject && npdWonScentRuleApplies(deal)) {
    // Math.max กัน "ปรับขึ้น" กลายเป็นปรับลง: awaiting_confirm/deposit_pending ฐาน 80 อยู่แล้ว
    return Math.max(base, NPD_AFTER_WON_SCENT);
  }
  return base;
}

const dealTypeOf = (deal) => normalizeDealType(deal?.dealType ?? deal?.metadata?.projectType);

/** ดีลนี้อยู่ในขอบเขตของกติกา "NPD + SCENT Won → 80" ไหม (ไม่ดูว่าโครงการมี SCENT Won หรือยัง)
    = NPD ที่ยังเปิดและออกใบเสนอราคาแล้ว · ตัวเดียวที่ autoProbability, cascade และขาถอยใช้ตัดสิน
    ⇒ สามทางนี้ไม่มีวันเห็นขอบเขตต่างกัน */
export function npdWonScentRuleApplies(deal) {
  return dealTypeOf(deal) === 'NPD'
    && !isClosedStage(deal?.stage)
    && stageAtLeast(deal?.stage, QUOTED_FROM_STAGE);
}

const isWonScentDeal = (row) => dealTypeOf(row) === 'SCENT' && isWonStage(row?.stage);

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
  return (data || []).some((row) => dealTypeOf(row) === 'SCENT');
}

/**
 * FC% ที่ควรเป็นของดีลใบนี้ โดยไปหาบริบทโครงการให้เอง
 * ⚠️ ดีลที่ยังไม่ผูกโครงการ = ไม่มีพี่น้อง จึงไม่ต้องยิง query
 */
export async function resolveProbability(supabase, deal) {
  if (!deal?.projectId || !npdWonScentRuleApplies(deal)) {
    return autoProbability(deal);
  }
  const wonScentInProject = await hasWonScentInProject(supabase, deal.projectId, deal.id);
  return autoProbability(deal, { wonScentInProject });
}

/* ── ขาเข้า: SCENT เพิ่งปิด Won → NPD พี่น้องในโครงการเดียวกันขึ้น 80 ────────────────
 *
 * ⚠️ ต้องเป็น **cascade** ไม่ใช่คำนวณตอนอ่าน: `probability` เป็นคอลัมน์จริงที่แดชบอร์ด
 * กับประวัติ FC (`sales_deal_forecasts`) อ่านตรง ๆ ถ้าปล่อยให้ค่าจริงกับกติกาไม่ตรงกัน
 * ตัวเลขที่ผู้บริหารเห็นก็จะไม่ตรงกับป้ายที่ AE เห็น
 *
 * ⭐ แตะ **เฉพาะ NPD ที่อยู่ในขอบเขตของกติกา** (npdWonScentRuleApplies) — มติ 25/09
 *    🐞 เดิมวนทุกดีลเปิดในโครงการแล้วตั้งเป็น autoProbability ⇒ SCENT/RE-ORDER/OTHER ที่ AE
 *    เลือก FC% เองถูกรีเซ็ตเป็นค่าตั้งต้นของขั้นทุกครั้งที่ SCENT ใบไหนในโครงการปิด Won
 *    (โค้ดทำได้ · prod ยังไม่เกิด: audit ของ cascade 10 แถวเป็น NPD ขาขึ้นทั้งหมด ตรวจ 25/09)
 *    NPD ที่ยังไม่ออกใบก็เป็นบั๊กตัวเดียวกัน — กติกา 80 ไม่ครอบ แต่เดิมถูกรีเซ็ตเป็น 20 ⇒ ตัดออกด้วย
 */
const PROJECT_DEAL_COLUMNS = 'id, stage, dealType, probability, projectValue, forecastMonth, metadata';

/** ดีลทุกใบของโครงการ — ไล่หน้าครบ (ด่าน check:rowcap) · ลำดับ id นิ่งให้ fetchAll */
async function loadProjectDeals(supabase, projectId) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_deals').select(PROJECT_DEAL_COLUMNS)
    .eq('projectId', projectId)
    .order('id', { ascending: true }));
  if (error) throw error;
  return data || [];
}

/** แถวที่ cascade ต้องเขียน (บริสุทธิ์ — ผู้เรียกเป็นคนโหลดดีลทั้งโครงการมาให้) */
export function pickNpdCascade(deals) {
  const rows = deals || [];
  if (!rows.some(isWonScentDeal)) return [];
  const picks = [];
  for (const row of rows) {
    if (!npdWonScentRuleApplies(row)) continue;
    const next = autoProbability(row, { wonScentInProject: true });
    if (next === Number(row.probability)) continue;
    picks.push({ ...row, probability: next, previousProbability: row.probability });
  }
  return picks;
}

/**
 * @returns รายการดีลที่ถูกปรับ — ผู้เรียกลง audit ด้วย `npdCascadeAuditSummary`
 *          (ป้ายนั้นคือหลักฐานเดียวที่ขาถอยใช้ตัดสินว่า "80 นี้ cascade ตั้ง")
 */
export async function cascadeNpdProbability(supabase, projectId, { changedBy = null } = {}) {
  if (!projectId) return [];
  const touched = [];
  for (const pick of pickNpdCascade(await loadProjectDeals(supabase, projectId))) {
    const { error: updateError } = await supabase
      .from('sales_deals')
      .update({ probability: pick.probability, updatedAt: new Date().toISOString() })
      .eq('id', pick.id);
    if (updateError) throw updateError;
    touched.push({ ...pick, changedBy });
  }
  return touched;
}

/* ── ป้าย audit ─────────────────────────────────────────────────────────────
   ⚠️ ป้ายของ cascade รุ่นก่อน 25/09 (10 แถวบน prod) เขียนตรงใน route รับใบ — ตัวสร้างข้างล่าง
   คงรูปเดิมทุกตัวอักษร ⇒ ตัวจับตัวเดียวอ่านได้ทั้งแถวเก่าและใหม่
   ห้ามแก้ข้อความป้าย cascade โดยไม่คงตัวจับของรุ่นเก่าไว้ ไม่งั้น 80 ที่ cascade ตั้งไว้ก่อนวันแก้จะ
   กลายเป็น "80 ที่ AE เลือกเอง" แล้วไม่มีวันถอย */
export const NPD_CASCADE_AUDIT_TAG = 'SCENT ในโครงการเดียวกันปิด Won';

export function npdCascadeAuditSummary(row, quoteNumber) {
  return `FC ${row.previousProbability}% → ${row.probability}% (${NPD_CASCADE_AUDIT_TAG} จากใบ ${quoteNumber})`;
}

export function isNpdCascadeAudit(summary) {
  return typeof summary === 'string' && summary.includes(`(${NPD_CASCADE_AUDIT_TAG} `);
}

/* ป้ายของขาถอย **ต้องไม่มี** ป้าย cascade อยู่ข้างใน — ไม่งั้นการย้อนรอบถัดไปจะอ่านป้ายของตัวเอง
   เป็น cascade (เทสต์ dealProbabilityCascade ล็อกไว้) */
export function npdDecascadeAuditSummary(row, quoteNumber) {
  return `FC ${row.previousProbability}% → ${row.probability}% (ถอยกลับฐาน: โครงการไม่เหลือดีล SCENT ที่ Won แล้ว — ย้อนการรับใบ ${quoteNumber})`;
}

/* ดีลที่ถูกย้อนเอง: ถ้าค่าใหม่มาจากกติกา SCENT Won (NPD ได้ 80 เพราะโครงการยังมี SCENT Won) ⇒ **ติดป้าย cascade**
   เพราะเป็น 80 ชนิดเดียวกันทุกประการ (กติกาตั้ง ไม่ใช่ AE เลือก) ⇒ วันที่ SCENT ใบสุดท้ายถูกย้อนตาม ดีลนี้ถอยกลับฐาน
   ได้เหมือนพี่น้อง · ไม่ติดป้าย = 80 ค้างถาวร (เทสต์ "ย้อนต่อกันสองใบ" ล็อกไว้)
   ⚠️ ค่าที่ไม่ได้มาจากกติกานั้น (ตาราง JS กับ deal_probability_for_stage ของฐานไม่ตรงกัน) = ป้ายธรรมดา */
export function unacceptProbabilityAuditSummary(row, quoteNumber, { byWonScentRule = false } = {}) {
  return byWonScentRule
    ? `FC ${row.previousProbability}% → ${row.probability}% (${NPD_CASCADE_AUDIT_TAG} · FC ตามกติกาหลังย้อนการรับใบ ${quoteNumber})`
    : `FC ${row.previousProbability}% → ${row.probability}% (ย้อนการรับใบ ${quoteNumber} — FC ตามกติกาของดีลเปิด)`;
}

/* ── ขาออก: ย้อนการรับใบ → NPD ที่ cascade ดันไว้กลับฐาน (มติ 25/09) ────────────── */

/** audit ล่าสุดที่ขยับ FC% (changedKeys มี probability) ของแต่ละดีล
    ⚠️ "ล่าสุด" = id มากสุด (identity ของฐาน) ไม่ใช่ createdAt — createdAt มาจากนาฬิกาของ
    instance ที่เขียน (lib/audit.js) ซึ่งคนละเครื่องกันได้ · audit ที่ไม่แตะ FC% (แก้โน้ต/ขั้นที่ FC
    ไม่ขยับ) ไม่นับ ⇒ ไม่ถือว่า "มีคนแตะ" */
function latestProbabilityAudits(audits) {
  const latest = new Map();
  for (const row of audits || []) {
    if (!Array.isArray(row?.changedKeys) || !row.changedKeys.includes('probability')) continue;
    const key = String(row.entityId);
    const seen = latest.get(key);
    if (!seen || Number(row.id) > Number(seen.id)) latest.set(key, row);
  }
  return latest;
}

const decascadeCandidate = (row, exceptDealId) => npdWonScentRuleApplies(row)
  && (exceptDealId == null || String(row.id) !== String(exceptDealId))
  && autoProbability(row) !== Number(row.probability);

/**
 * NPD ที่ต้องถอยกลับฐาน (บริสุทธิ์)
 * @param deals  ดีลทุกใบของโครงการ **หลัง** ย้อนการรับใบ (ใบที่ถูกย้อนไม่ Won แล้ว)
 * @param audits แถว audit_logs ของผู้สมัคร: { id, entityId, summary, changedKeys, probabilityAfter }
 * @param exceptDealId ดีลที่ถูกย้อนเอง — FC% ของมันมาจาก resolveProbability ไม่ใช่กติกานี้
 *
 * ถอยเมื่อครบทุกข้อ: โครงการไม่เหลือ SCENT ที่ Won · เป็น NPD ในขอบเขตกติกา · ค่าไม่ใช่ฐานอยู่แล้ว ·
 * audit ล่าสุดที่ขยับ FC% เป็นของ cascade · และค่าปัจจุบันยังเท่ากับที่ cascade ตั้ง
 * (ข้อสุดท้ายจับการแก้ที่ไม่ลง audit — เช่นทางฝั่ง DB)
 */
export function pickNpdDecascade(deals, audits, { exceptDealId = null } = {}) {
  const rows = deals || [];
  if (rows.some(isWonScentDeal)) return [];
  const latest = latestProbabilityAudits(audits);
  const picks = [];
  for (const row of rows) {
    if (!decascadeCandidate(row, exceptDealId)) continue;
    const last = latest.get(String(row.id));
    if (!last || !isNpdCascadeAudit(last.summary)) continue;
    if (Number(last.probabilityAfter) !== Number(row.probability)) continue;
    picks.push({
      id: row.id,
      previousProbability: row.probability,
      probability: autoProbability(row),
      cascadeAuditId: last.id,
    });
  }
  return picks;
}

/* `after->probability` = ดึงเฉพาะเลข FC จาก snapshot — audit ของ PATCH ดีลเก็บทั้งแถวใน after
   ⇒ ไม่ลากทั้งก้อนมาเพื่อใช้ช่องเดียว */
const PROBABILITY_AUDIT_COLUMNS = 'id, entityId, summary, changedKeys, probabilityAfter:after->probability';

async function loadProbabilityAudits(supabase, dealIds) {
  return fetchAllInChunks(dealIds.map(String), (chunk) => supabase
    .from('audit_logs').select(PROBABILITY_AUDIT_COLUMNS)
    .eq('entityType', 'sales_deal')
    .in('entityId', chunk)
    .order('id', { ascending: true }));
}

/**
 * ถอย 80 ของ NPD ในโครงการ หลังย้อนการรับใบ
 * ⚠️ เขียนแบบมีด่านค่าเดิม (`.eq('probability', ค่าที่อ่าน)`) — AE ที่แก้ FC ระหว่างที่เราอ่านอยู่ชนะเสมอ
 * @returns {{ touched, warnings }} — เขียนไม่ผ่านรายแถวไม่ล้มแถวอื่น (ย้อนรับใบ commit ไปแล้ว)
 *          · อ่านไม่ผ่าน = throw (ยังไม่ได้เขียนอะไร และไม่เดาว่า 80 ไหนเป็นของ cascade)
 */
export async function decascadeNpdProbability(supabase, projectId, { exceptDealId = null } = {}) {
  const touched = [];
  const warnings = [];
  if (!projectId) return { touched, warnings };
  const deals = await loadProjectDeals(supabase, projectId);
  if (deals.some(isWonScentDeal)) return { touched, warnings };
  const candidates = deals.filter((row) => decascadeCandidate(row, exceptDealId));
  if (!candidates.length) return { touched, warnings };

  const audits = await loadProbabilityAudits(supabase, candidates.map((row) => row.id));
  for (const pick of pickNpdDecascade(deals, audits, { exceptDealId })) {
    const { data, error } = await supabase
      .from('sales_deals')
      .update({ probability: pick.probability, updatedAt: new Date().toISOString() })
      .eq('id', pick.id)
      .eq('probability', pick.previousProbability)
      .select('id');
    if (error) {
      warnings.push(`ถอย FC% ของดีล ${pick.id} ไม่สำเร็จ: ${error.message}`);
      continue;
    }
    if (data?.length) touched.push(pick);
  }
  return { touched, warnings };
}

/**
 * FC% หลังย้อนการรับใบ — เรียกจาก route ย้อนรับใบ **หลัง** RPC สำเร็จ (มติ 25/09 ข้อ 3)
 *   1) ดีลที่ถูกย้อน: resolveProbability แทนค่าตั้งต้นของขั้นที่ RPC ตั้ง (deal_probability_for_stage)
 *      ⇒ NPD ที่โครงการยังมี SCENT Won ได้ 80 ตามกติกา ไม่ตกไป 50
 *      ⚠️ FC% ที่ AE เลือกไว้ก่อนรับใบไม่กลับมา — ไม่มีที่เก็บ และมติให้ใช้กติกา
 *      ⚠️ แถว 'reversal' ใน sales_deal_forecasts ที่ RPC เขียนยังถือค่าตั้งต้นของขั้น — ค่าจริงอยู่ที่ดีล + audit
 *   2) NPD พี่น้อง: decascadeNpdProbability (เงื่อนไขครบชุดอยู่ที่ pickNpdDecascade)
 *
 * @param deal แถวดีลที่ RPC คืนมา (`result.deal`) — ไม่อ่านแถวซ้ำ (systemRules กฎ 6)
 * @returns {{ touched: Array<{id, previousProbability, probability, summary}>, warnings: string[] }}
 *          ไม่ throw — ย้อนรับใบ commit ไปแล้ว ผู้เรียกลง audit ทุกแถวใน touched และ log warnings
 */
export async function settleProbabilityAfterUnaccept(supabase, deal, { quoteNumber = '' } = {}) {
  const touched = [];
  const warnings = [];
  if (!deal?.id) return { touched, warnings };

  try {
    const next = await resolveProbability(supabase, deal);
    if (next !== Number(deal.probability)) {
      const { data, error } = await supabase
        .from('sales_deals')
        .update({ probability: next, updatedAt: new Date().toISOString() })
        .eq('id', deal.id)
        .eq('probability', deal.probability)
        .select('id');
      if (error) throw error;
      if (data?.length) {
        const row = { id: deal.id, previousProbability: deal.probability, probability: next };
        // resolveProbability ต่างจากฐานของขั้นได้ทางเดียวคือกติกา SCENT Won ⇒ ต่างจากฐาน = กติกาตั้ง
        const byWonScentRule = next !== autoProbability(deal);
        touched.push({ ...row, summary: unacceptProbabilityAuditSummary(row, quoteNumber, { byWonScentRule }) });
      }
    }
  } catch (error) {
    warnings.push(`FC% ของดีล ${deal.id}: ${error?.message || error}`);
  }

  try {
    const result = await decascadeNpdProbability(supabase, deal.projectId, { exceptDealId: deal.id });
    for (const row of result.touched) touched.push({ ...row, summary: npdDecascadeAuditSummary(row, quoteNumber) });
    warnings.push(...result.warnings);
  } catch (error) {
    warnings.push(`ถอย FC% ของ NPD ในโครงการ ${deal.projectId}: ${error?.message || error}`);
  }
  return { touched, warnings };
}
