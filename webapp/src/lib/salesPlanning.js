import { can, hasTeam, inScope, isReadOnlyObserver, isRdRole, isSuperuser, primaryTeam, TEAMS } from '@/lib/permissions';
import { whereTeamIn } from '@/lib/teamScope';
import { businessMonthKey } from '@/lib/businessDate';
import { documentNumberSlots, publishedNumberingPattern } from '@/lib/documentStandards';

// ⚠️ ลำดับในอาร์เรย์นี้ = กติกา "เดินหน้าอย่างเดียว" ของทั้งระบบ ไม่ใช่แค่ลำดับที่โชว์:
// ทุกจุดที่ผลักดีลไปข้างหน้าเทียบด้วย stageIndex() ตัวล่างนี้ ("ถ้าอยู่ก่อนเป้าหมาย ค่อยดัน")
// สลับตำแหน่ง = เปลี่ยนพฤติกรรมจริง ไม่ใช่เปลี่ยนหน้าตา — ก่อนขยับต้องดู stageAtLeast ด้วย
//
// มติผู้ใช้ B4 (2026-07-28): เสนอไทม์ไลน์มาก่อนเสนอราคา — งานจริงคือเสนอกำหนดงานให้
// ลูกค้าดูก่อน แล้วค่อยออกใบ. ลำดับเดิมกลับหัว ทำให้ดีลที่ออกใบแล้วโดน "ดึงถอย" กลับเป็น
// timeline_proposed ทุกครั้งที่ไปสร้าง/ผูกโครงการ (เพราะ index มันมากกว่า)
export const DEAL_STAGES = [
  'lead',
  'qualified',
  'timeline_proposed',
  'quotation',
  'awaiting_confirm',
  'deposit_pending',
  'won',
  'in_project',
  'lost',
];

// ── "ดีลปิดแล้วหรือยัง" — ตัวตัดสินกลาง ห้ามสะกด ['won','in_project'] เองอีก ─────
// in_project ถูกยุบเป็น won ตั้งแต่ mig 0082 (ตัดออกจาก CHECK แล้ว) แต่แถวเก่ายังมีอยู่
// ทุกจุดที่ถามว่า "ปิดได้แล้วหรือยัง" จึงต้องนับสองค่านี้เสมอ — เดิมสะกดเองกระจาย 30+ จุด
// ทั้ง route/หน้าเว็บ/lib และมีสำเนา isWonDeal/isOpenDeal ซ้ำกันเป๊ะใน 2 ไฟล์
// (dashboardMetrics + projectRollup) · ด่านใหม่ที่ลืมใส่ in_project จะรั่วเงียบ ๆ
// เพราะดีลเก่าหลุดด่านไปโดยไม่มี error ให้เห็น
export const WON_STAGES = ['won', 'in_project'];
export const CLOSED_STAGES = [...WON_STAGES, 'lost'];

// รับ "stage" (สตริง) — ตัวที่รับทั้งดีลอยู่ที่ isWonDeal/isOpenDeal ใน sales/dashboardMetrics
export const isWonStage = (stage) => WON_STAGES.includes(stage);
export const isClosedStage = (stage) => CLOSED_STAGES.includes(stage);
export const isOpenStage = (stage) => !isClosedStage(stage);

// ── ขั้นที่ "ให้คนเลือกได้" ในฟอร์ม/ตัวกรอง ────────────────────────────────────
// in_project ถูกยุบเป็น won ตั้งแต่ mig 0082 — STAGE_LABELS ยังแปลไว้ให้อ่านแถวเก่าได้
// แต่ห้ามโผล่เป็นตัวเลือกใหม่ · เดิมบรรทัดนี้ถูกประกาศซ้ำในหน้ารวมดีลกับหน้ารายละเอียด
// ดีลคนละไฟล์ (ตรงกันโดยบังเอิญ) และโมดัลสร้างดีลก็สะกดเงื่อนไขของตัวเองอีกชุด
export const PIPELINE_STAGES = DEAL_STAGES.filter((stage) => stage !== 'in_project');

// ตอน **สร้าง** ดีลยังปิดไม่ได้ — Won มาจากการรับใบเสนอราคา ไม่ใช่การเลือกจากดรอปดาวน์
export const CREATABLE_STAGES = PIPELINE_STAGES.filter((stage) => !isWonStage(stage));

/**
 * ขั้นที่เลือกได้ตอน **แก้** ดีล — ดีลที่ปิด Won แล้วต้องเห็นค่าปัจจุบันของตัวเอง
 * ในดรอปดาวน์ ไม่งั้นช่องจะโชว์ขั้นผิด (ช่องถูก disabled ด้วย alreadyWon อยู่แล้ว)
 */
export const editableStages = (alreadyWon = false) => (alreadyWon ? PIPELINE_STAGES : CREATABLE_STAGES);

export const STAGE_LABELS = {
  lead: 'ลีด',
  qualified: 'ผ่านคัดกรอง',
  quotation: 'เสนอราคา',
  timeline_proposed: 'เสนอไทม์ไลน์',
  awaiting_confirm: 'รอยืนยัน',
  deposit_pending: 'รอมัดจำ',
  won: 'ปิดได้ (Won)',
  in_project: 'เข้าโครงการ',
  lost: 'ไม่สำเร็จ (Lost)',
};

// Feature toggles — modules intentionally hidden in the UI for now (Phase 1
// keeps the commercial spine only). Flip to true to re-enable; backend/data and
// API routes stay intact so no data is lost while hidden.
export const SALES_FEATURES = {
  quotations: true, // เฟส D: FM-SA-01 เต็มรูป (เมนู /sa/quotations + editor + revise + พิมพ์)
  documents: false,
  shipment: false,
  forecastReview: false, // "ทบทวนพยากรณ์ยอด" panel on the overview
  sahamitRisk: false,    // "ความเสี่ยง / ตรวจย้อน FC สหมิตร" KPI + panel
};

// ค่าตั้งต้นตอนผู้ใช้ไม่ได้เลือก FC เอง — เรียงตามลำดับใน DEAL_STAGES
// ⚠️ ต้องตรงกับฟังก์ชัน deal_probability_for_stage() ใน migration 0175 เป๊ะ ๆ
// (ฝั่ง DB ใช้ตอนถอยดีลออกจาก Won) — มีเทสต์อ่านไฟล์ .sql มาเทียบให้แล้ว
//
// ทุกค่าของดีลที่ยังเปิดต้องเป็นหนึ่งใน 3 ระดับที่เลือกได้จริง (FORECAST_LEVELS: 20/50/80)
// มติผู้ใช้ 2026-07-29: เดิมเป็นเลขอิสระ 10/30/55/65/75/90 ซึ่งไม่มีอยู่ในดรอปดาวน์เลย
// สักตัว แล้วไปพึ่ง snapForecastLevel ปัดตอนแสดงผล — ค่าที่เก็บกับค่าที่คนเห็นจึงคนละตัว
//
// การแมปยึด "หลักฐานที่ต้องมี" ของแต่ละระดับ ไม่ใช่ระยะทางบน pipeline:
//   ก่อนออกใบเสนอราคา (lead/qualified/timeline_proposed) → 20
//   ออกใบเสนอราคาแล้ว (quotation)                        → 50
//   รอยืนยัน / รอมัดจำ (awaiting_confirm/deposit_pending) → 80
//
// 100 = ค่าที่ **ระบบตั้งเองตอนปิด Won เท่านั้น** เลือกจากฟอร์มไม่ได้แล้ว (เหมือน lost=0)
// — ดีลที่ยังไม่ Won จึงสูงสุดได้แค่ 80 รวมถึงขั้น "รอมัดจำ"
export const DEFAULT_PROBABILITY_BY_STAGE = {
  lead: 20,
  qualified: 20,
  timeline_proposed: 20,
  quotation: 50,
  awaiting_confirm: 80,
  deposit_pending: 80,
  won: 100,
  in_project: 100,
  lost: 0,
};

/* role ของฝ่ายบริการ — ประกาศไว้ที่เดียว ไม่ไล่พิมพ์ชื่อซ้ำในเงื่อนไข
   (เพิ่ม role ใหม่ของฝ่ายวันไหน จะได้ไม่ตกหล่นเงียบ ๆ แบบที่เคยเกิดกับ `!== 'FN'`) */
const SERVICE_VIEW_ROLES = new Set(['ts', 'ts_planner', 'ts_senior', 'ts_audit', 'ts_manager']);

export function salesPlanningViewScope(role) {
  if (isSuperuser(role)) return 'all';
  // viewer = whole-system read-only observer → sees every team's deals/pipeline,
  // exactly like a superuser's view (edit stays 'none' via salesPlanningEditScope).
  if (isReadOnlyObserver(role)) return 'all';
  // rd (ฝ่ายวิจัยและพัฒนา) ต้องเห็นดีล/โครงการทุกทีมเพื่อมีบริบทเต็มตอนตอบ
  // ข้อสอบถามจากฝ่ายขาย — อ่านอย่างเดียวเหมือน viewer (edit ยัง 'none').
  if (isRdRole(role)) return 'all';
  // finance (ฝ่ายบัญชี FN) ต้องเห็นใบสั่งขายทุกทีมเพื่อคอนเฟิร์มงวดชำระ (mig 0245) —
  // อ่านอย่างเดียวเหมือน rd/viewer (edit ยัง 'none' เพราะไม่มี salesplan:edit)
  // ⚠️ ไม่มีทีม: บัญชีไม่ได้อยู่ใต้ SA ⇒ scope 'team'/'own' จะแปลว่าเห็นศูนย์ใบ
  if (role === 'finance') return 'all';
  /* ⭐ ฝ่าย TS (บริการ) ต้องเห็นใบสั่งขายทุกทีม (มติผู้ใช้ 2026-08-30) — งานบริการ
     อ้างใบสั่งขายเป็นต้นเรื่องทุกชิ้น (จัดสรรลงโซน · ด่านเข้าไซต์ · รอบที่ขายไว้)
     ⚠️ **เปิด cap อย่างเดียวไม่พอ** — ฝ่าย TS ไม่ได้อยู่ใต้ SA จึงไม่มีทีมให้ scope
     `'team'`/`'own'` เกาะ ⇒ ตกมาถึงบรรทัดท้ายเป็น `'none'` แล้วเห็น **ศูนย์ใบ**
     ทั้งที่เมนูขึ้น (กับดักเดียวกับที่ `finance` ต้องมีบรรทัดของตัวเองข้างบน)
     ⚠️ อ่านอย่างเดียวเหมือน rd/viewer/finance — `salesPlanningEditScope` ยัง `'none'`
     เพราะไม่มี `salesplan:edit` */
  if (SERVICE_VIEW_ROLES.has(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none';
}

export function salesPlanningEditScope(role) {
  // Commercial deals follow the generic editScope, NOT PM's team-collaborative
  // model: AE edits only its OWN deals; ac / senior_ae edit the whole team.
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none';
}

export function canViewSalesPlanning(user) {
  return !!user && can(user.role, 'salesplan:view');
}

export function canEditSalesPlanning(user) {
  return !!user && can(user.role, 'salesplan:edit');
}

// สร้าง "ดีล" ได้เฉพาะ AE / Senior AE (งานหน้าบ้าน — เจ้าของดีลคือ AE เสมอ);
// AC เป็น back-office ไม่เปิดดีล. superuser (admin / sales head) เปิดได้ในฐานะกำกับดูแล.
// แก้ไข/ดูดีลยังใช้ scope เดิม (canEditSalesPlanning + inSalesEditScope).
// เปิดดีลได้: AE · Senior AE · **AC** (มติผู้ใช้ 2026-08-05 — เดิม AC เปิดไม่ได้)
// ⚠️ AC เป็นผู้ประสานงาน ไม่ใช่เจ้าของงาน ⇒ ฟอร์มสร้างต้องมีช่อง "ผู้รับผิดชอบ (AE)"
// และ server ต้องตรวจว่าคนที่ถูกเลือกอยู่ทีมเดียวกันจริง (lib/sales/dealOwner.js)
export function canCreateDeal(user) {
  return !!user && (user.role === 'ae' || user.role === 'senior_ae' || user.role === 'ac' || isSuperuser(user.role));
}

/**
 * ขอบเขตทีมของแถว "เป้าหมาย / ยอดย้อนหลัง" — **ที่เดียวของทั้งสองเส้นทาง**
 *
 * 🐞 **พบตอนตรวจระบบ 2026-08-16:** `POST /api/sales-planning/targets/bulk` คุมทีมไว้
 * (`hasTeam`) แต่ `POST /api/sales-planning/history` ซึ่งรับ payload หน้าตาเดียวกันและ
 * เปิดด้วย cap เดียวกัน **เอา `item.team` จาก payload ตรง ๆ ไม่คุมอะไรเลย**
 *
 * วันนี้ยังไม่เป็นช่องโหว่ — ผู้ถือ `salesplan:target` มีแค่ `admin` กับ `ae_supervisor`
 * ซึ่ง `isSuperuser` ทั้งคู่ (เห็นทุกทีมอยู่แล้ว) · แต่ระบบ cap แจกรายบทบาทได้ง่าย
 * วันที่ให้ cap นี้กับหัวหน้าทีม เส้น `history` จะเปิดให้เขียนยอดย้อนหลังของทุกทีมทันที
 * และยอดย้อนหลังคือฐานที่เอาไปเทียบผลงาน — แก้แล้วสังเกตยาก
 *
 * ⚠️ ยกมาเป็นตัวช่วยตัวเดียวแทนการก๊อปกติกาไปอีกที่ — "สองที่ที่ต้องแก้พร้อมกันด้วยมือ"
 * คือรูปแบบที่ระบบนี้เจ็บมาหลายรอบแล้ว (ดูหัวไฟล์ attachmentAccess / exciseBilling)
 *
 * @param label คำที่ใช้ในข้อความ เช่น "เป้า" / "ประวัติ" — ข้อความเดิมของแต่ละหน้าไม่เปลี่ยน
 * @returns {{team: string|null, ownerId: string|null} | {error: string, status: number}}
 */
export function resolveTargetRowScope(user, item = {}, { label = 'เป้า' } = {}) {
  const isSuper = isSuperuser(user?.role);
  if (isSuper) {
    const team = item.team || null;
    if (item.ownerId && !team) return { error: `${label}รายบุคคลต้องมีทีม`, status: 400 };
    return { team, ownerId: item.ownerId || null };
  }

  /* ⚠️ **ระบุทีมอื่นมา = ปฏิเสธ ไม่ใช่เงียบ ๆ เปลี่ยนให้เป็นทีมตัวเอง**
     โค้ดเดิมของ targets/bulk เขียนว่า `hasTeam(...) ? item.team : primaryTeam(user)`
     แล้วค่อยเช็ค `!hasTeam(user, team)` ทีหลัง — ซึ่ง **ไปไม่ถึงบรรทัดนั้นเลย** เพราะ
     ค่าที่ตกมาคือทีมของตัวเองเสมอ ⇒ ด่าน 403 เป็นโค้ดตาย และคนที่ส่งทีมอื่นมาจะได้
     "สำเร็จ" กลับไป ทั้งที่ยอดไปลงทีมตัวเอง = ตัวเลขของทีมตัวเองเพี้ยนโดยไม่มีใครรู้
     ⇒ แยกสองกรณีให้ชัด: ไม่ส่งทีมมา = ทีมหลัก (เจตนาเดิม) · ส่งทีมที่ไม่ได้สังกัด = 403 */
  if (item.team && !hasTeam(user, item.team)) return { error: 'forbidden', status: 403 };
  const team = item.team || primaryTeam(user);
  if (!team) return { error: 'ต้องระบุทีม', status: 400 };
  if (item.ownerId && !team) return { error: `${label}รายบุคคลต้องมีทีม`, status: 400 };
  return { team, ownerId: item.ownerId || null };
}

export function canEditSalesTarget(user) {
  // Targets are reserved for the sales head and admin. Plain salesplan:edit
  // (ae/ac) and team leads do NOT grant this.
  return !!user && can(user.role, 'salesplan:target');
}

export function canReviewSalesForecast(user) {
  return !!user && can(user.role, 'salesplan:review');
}

// อนุมัติใบเสนอราคา = การเซ็นรับรองโดย "เจ้าของดีล" (มติผู้ใช้ 2026-07-18 —
// ผู้อนุมัติบน FM-SA-01 = AE เจ้าของโครงการ/ลูกค้า). ผู้สร้างใบ (AC/AE/Senior) อาจไม่ใช่
// เจ้าของ → เจ้าของต้องอนุมัติก่อนส่ง; ถ้าเจ้าของสร้างเอง = เซ็นเองได้ (creator === owner).
// superuser (admin/หัวหน้าขาย) อนุมัติได้ในฐานะกำกับดูแล. deal ต้องมาพร้อม ownerId.
export function canApproveQuotation(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user.role)) return true;
  return !!user.id && user.id === deal.ownerId;
}

/* ── ตัวตน = id เท่านั้น ห้ามเทียบด้วยชื่อ ──────────────────────────────────
   เดิมมี `inPmBackfillOwnerScope` ที่ให้สิทธิ์ดู/แก้ดีลเมื่อ **ชื่อผู้ใช้ตรงกับ
   `ownerName` ในแถว** (ตกค้างจากยุคที่ดีล backfill มาจาก PM แล้วไม่มี `ownerId`)
   ตัดทิ้งแล้วเพราะเป็นกับดักสองด้าน:
   - เปลี่ยนชื่อตัวเอง = **หลุดสิทธิ์ดีลของตัวเองทันที** โดยไม่มี error อะไรเลย
   - เปลี่ยนชื่อให้ไปตรงกับ `ownerName` ของคนอื่น = **ได้สิทธิ์แก้ดีลคนอื่น**
   ตรวจ prod แล้วปลอดภัยที่จะตัด: `sales_deals` 137 ใบ มี `ownerId` ครบ 100%
   และไม่มีแถวไหนเหลือ `metadata.source = 'pm-backfill'` เลย (0 แถว) */
export function inSalesViewScope(user, record) {
  return inScope(salesPlanningViewScope(user?.role), user, record);
}

export function inSalesEditScope(user, record) {
  return inScope(salesPlanningEditScope(user?.role), user, record);
}

export function monthKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export function yearKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 4);
  return /^\d{4}$/.test(s) ? s : null;
}

// Normalize a target period into { period, periodType } or null. Yearly targets
// use a 'YYYY' key, monthly targets a 'YYYY-MM' key.
export function normalizeTargetPeriod(period, periodType) {
  const type = periodType === 'year' ? 'year' : 'month';
  const key = type === 'year' ? yearKey(period) : monthKey(period);
  return key ? { period: key, periodType: type } : null;
}

export function toMoney(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function toProbability(value, stage = 'lead') {
  if (value === '' || value == null) return DEFAULT_PROBABILITY_BY_STAGE[stage] ?? 10;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PROBABILITY_BY_STAGE[stage] ?? 10;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeStage(value) {
  return DEAL_STAGES.includes(value) ? value : 'lead';
}
// true เฉพาะเมื่อเป็น stage จริง — ใช้ที่ PATCH เพื่อ "ปฏิเสธ" ค่าเพี้ยน แทนที่จะให้
// normalizeStage เงียบ ๆ ดันไป 'lead' (ดีลถูกดีดถอยสุดทางโดยไม่มี error)
export function isValidStage(value) {
  return DEAL_STAGES.includes(value);
}

// ── กติกา "เดินหน้าอย่างเดียว" — ที่เดียวของทั้งระบบ ──────────────────────
// เดิมแต่ละ route เขียน `DEAL_STAGES.indexOf(...)` เองกระจาย 3 ที่ + หน้าเว็บฮาร์ดโค้ด
// เป็นลิสต์ชื่อ stage ไว้อีกที่ (ซึ่งลืมอัปเดตทันทีที่ลำดับเปลี่ยน) — ยกมารวมไว้ตรงนี้
// stage ที่ไม่รู้จัก → -1 จึงถือว่า "อยู่ก่อนทุกอย่าง" (โดนดันไปข้างหน้า ไม่ค้างที่ค่าเพี้ยน)
export function stageIndex(stage) {
  return DEAL_STAGES.indexOf(stage);
}

// ดีลเดินมาถึงขั้นนี้ (หรือเลยไปแล้ว) หรือยัง — ใช้เปิด/ปิดปุ่มตามความคืบหน้า
export function stageAtLeast(stage, target) {
  return stageIndex(stage) >= stageIndex(target);
}

// ดันดีลไปข้างหน้าถึงขั้น target — ถ้าเลยไปแล้วคงเดิม (ห้ามถอยหลังเด็ดขาด)
// ครอบ 'lost'/'in_project' ให้ด้วยโดยอัตโนมัติ เพราะทั้งคู่อยู่ท้ายอาร์เรย์
export function advanceStage(current, target) {
  return stageIndex(current) < stageIndex(target) ? target : current;
}

// ประเภทดีล (เฟส A Sales Revamp) — คอลัมน์จริง sales_deals.dealType (migration 0088 + 0247)
// SCENT = พัฒนากลิ่น · NPD = พัฒนาสินค้า · RE-ORDER = สั่งผลิตซ้ำ · OTHER = อื่นๆ
// ทั้งสี่ค่าตรงกับ projects.type ของ PM แบบ 1:1 → passthrough ตรงตอนสร้างโครงการ
// (เลือก template) · 'OTHER' มีแม่แบบไทม์ไลน์ของตัวเองตั้งแต่ mig 0249
// (transition: ยังเขียน metadata.projectType คู่ไว้ 1 เฟส ให้โค้ด/ข้อมูลเก่าอ่านได้)
export const DEAL_TYPES = ['SCENT', 'NPD', 'RE-ORDER', 'OTHER'];
export const DEAL_TYPE_LABELS = {
  SCENT: 'พัฒนากลิ่น',
  NPD: 'พัฒนาสินค้า',
  'RE-ORDER': 'สั่งผลิตซ้ำ',
  OTHER: 'อื่นๆ',
};
export function normalizeDealType(value) {
  return DEAL_TYPES.includes(value) ? value : 'NPD';
}

/* ประเภทโครงการ = ประเภทดีลชุดเดียวกัน (1:1) — เคยแยกกันช่วงสั้น ๆ ตอน mig 0247 ที่
   'OTHER' ยังเป็นประเภทฝั่งขายล้วน · มติผู้ใช้ 2026-08-13 ให้ 'OTHER' มีสิทธิ์เท่าอีก
   สามประเภท (mig 0249 เปิด projects_type_check + แม่แบบไทม์ไลน์ของตัวเอง) จึงยุบกลับ
   ⚠️ ก่อนเพิ่มประเภทที่ 5: ถ้าประเภทใหม่ **ไม่** ก่อตั้งโครงการ ต้องแยกอาร์เรย์นี้ออก
   ก่อน ไม่งั้นค่าใหม่หลุดไปถึง projects.type แล้วไปตายที่ CHECK ของฐาน */
export const PROJECT_TYPES = DEAL_TYPES;
export const normalizeProjectType = normalizeDealType;
// อ่านประเภทจาก deal row: คอลัมน์จริงก่อน แล้ว fallback metadata (ข้อมูลก่อน backfill/แคชเก่า)
export function dealTypeOf(deal) {
  return normalizeDealType(deal?.dealType || deal?.metadata?.projectType);
}

/* ลำดับทีมมาตรฐานทั้งระบบ (ทีมที่ไม่รู้จักไปท้ายสุด)
   ⚠️ **ไม่ประกาศรายการเอง** — ชี้ไปที่ `TEAMS` ตัวเดียว (งวด T-5) */
export const TEAM_ORDER = TEAMS;
export function teamRank(team) {
  const i = TEAM_ORDER.indexOf(team);
  return i < 0 ? TEAM_ORDER.length : i;
}

export function forecastAmount(deal) {
  // Probability weighting was dropped — "คาดการณ์" duplicated "มูลค่า", so the
  // forecast is simply the full project value.
  return toMoney(deal?.projectValue);
}

export function applyDealScope(query, user) {
  const scope = salesPlanningViewScope(user?.role);
  if (scope === 'team') return whereTeamIn(query, user);
  // ⚠️ เทียบ `ownerId` อย่างเดียว — เดิมมี `or(ownerId.eq.…,ownerName.eq.…)` พ่วงมา
  // ซึ่งแปลว่า "เปลี่ยนชื่อ = ดีลของตัวเองหายจากหน้าจอ" (ชื่อในแถวเป็นสำเนาที่ไม่ถูก
  // อัปเดตตอน rename). ตรวจ prod แล้วสาขาชื่อไม่ได้ครอบแถวไหนเพิ่มเลย — ดีลทุกใบมี ownerId
  if (scope === 'own') return query.eq('ownerId', user?.id ?? '');
  if (scope === 'none') return query.eq('id', '__no_sales_planning_scope__');
  return query;
}

export function dealAuditLabel(deal) {
  return `${deal?.title || 'deal'}${deal?.customerName ? ` · ${deal.customerName}` : ''}`;
}

/* ── รอบตัดเลขรันของใบเสนอราคา (มติผู้ใช้ 2026-09-01 · mig 0328) ────────────
   *"ใบเสนอราคา ใบสั่งขาย รันไปเรื่อยๆ ตัดทุกปี"*

   ⭐ เลขรัน **เดินต่อข้ามเดือน ตัดรอบทุกปี** — `QT-26080241` → (เดือนถัดไป)
   `QT-26090242` ไม่ใช่ย้อนกลับเป็น `QT-26090001` · ปีใหม่เริ่ม `QT-27010001`

   🔴 **`YYMM` ในเลข ≠ ตัวตัดรอบของเลขรัน** (กับดักเดียวกับเลขคำร้อง `requests/docNo.js`
   และเลขสัญญา `sales/contracts.js` — เขียนเตือนไว้ทั้งสองที่แล้ว)
   · `YYMM` ที่คนเห็นในเลข มาจาก **รูปแบบเลขที่** ของมาตรฐานเอกสาร = เดือนที่ออกใบ
   · ตัวตัดรอบคือ **คีย์ `month` ของ `quote_number_counters`** ซึ่งเก็บ `'YY'` ตั้งแต่ 0328
   ⇒ ตารางตัวนับมีทั้งแถวยุคเดือน (`'2608'`) และแถวยุคปี (`'26'`) อยู่ด้วยกัน
     **ห้ามลบแถวยุคเดือน** — trigger `doc_number_counter_guard` (0242) กันไว้แล้ว

   ⚠️ ชื่อพารามิเตอร์ฝั่ง SQL ยังเป็น `p_month` (เปลี่ยนชื่อ = ต้อง DROP ฟังก์ชันที่
   ใบเสนอราคาทุกใบเรียกใช้) — ความหมายจริงคือ "คีย์ถังนับ" ตามคอมเมนต์นี้ */
export const quoteCounterYear = (now = new Date()) => businessMonthKey(now).slice(0, 2);

// เลขใบเสนอราคา: รูปแบบมาจาก "มาตรฐานเอกสารที่เผยแพร่" (หน้าตั้งค่า → mig 0123)
// ค่าตั้งต้น QT-{YY}{MM}{RUNNING:4}-{REVISION} = QT-YYMMXXXX-R เท่าเดิมทุกตัวอักษร
// (รูปแบบไม่เปลี่ยนตอน 0328 — เปลี่ยนแค่รอบตัดของเลขรัน)
//
// ⚠️ **ออกเลขพร้อม insert ในทรานแซกชันเดียว** (mig 0242) — ห้ามกลับไปจองเลขแล้วค่อย
// insert แยก: RPC เดิมคืนเลขที่ commit ไปแล้ว ⇒ insert ล้มเมื่อไรเลขใบเสนอราคาหายถาวร
// ฝั่งนี้ส่งได้แค่ชิ้นส่วนของรูปแบบ (prefix/ความกว้าง/ท่อนท้าย/ตัวคั่น) ตัวเลขเป็นของ DB
// คืน { data, error } ดิบตามเดิม — ผู้เรียกยังอ่าน error.code เองได้
export async function insertQuotationWithNumber(supabase, row, now = new Date()) {
  const pattern = await publishedNumberingPattern(supabase, 'quotation');
  const { prefix, width, tail, separator } = documentNumberSlots(pattern, { date: now });
  return supabase.rpc('create_quotation_with_number', {
    p_month: quoteCounterYear(now),
    p_prefix: prefix,
    p_width: width,
    p_tail: tail,
    p_separator: separator,
    p_row: row,
  });
}

// ปัดเงินเป็น 2 ตำแหน่ง (สตางค์) — กันทศนิยมลอย (เช่น 99.999) หลุดลง DB/เอกสาร/ยอด Won
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ส่วนลดหนึ่งชั้น (ใช้ทั้งรายบรรทัด + ท้ายใบ): percent = % ของฐาน, amount = บาทตรง
export function discountAmountOf(base, discountType, discountValue) {
  const b = toMoney(base);
  const v = toMoney(discountValue);
  if (!discountType || v <= 0) return 0;
  const amt = discountType === 'percent' ? (b * Math.min(v, 100)) / 100 : v;
  return Math.min(amt, b); // ส่วนลดไม่เกินฐาน — ยอดไม่ติดลบ
}

// ค่าส่วนลดที่ "บันทึกได้จริง" — % เกิน 100 ถูกตัดเหลือ 100
// การคำนวณ clamp ให้อยู่แล้ว (discountAmountOf) แต่ถ้าเก็บค่าดิบลง DB เอกสารจะพิมพ์
// ป้าย "ส่วนลด 150%" คู่กับยอดที่หักแค่ 100% ของฐาน = ป้ายขัดกับตัวเลขบนกระดาษเดียวกัน
export function normalizeDiscountValue(discountType, discountValue) {
  if (!discountType) return 0;
  const v = toMoney(discountValue);
  return discountType === 'percent' ? Math.min(v, 100) : v;
}

// ยอดสุทธิรายบรรทัด: qty × unitPrice − ส่วนลดบรรทัด (ปัดสตางค์)
export function quoteLineNet(line = {}) {
  const gross = round2(toMoney(line.qty, 1) * toMoney(line.unitPrice));
  const discountAmount = round2(discountAmountOf(gross, line.discountType, line.discountValue));
  return { gross, discountAmount, lineTotal: round2(gross - discountAmount) };
}

// รวมทั้งใบ (FM-SA-01): subtotal(หลังลดรายบรรทัด) − ส่วนลดท้ายใบ = ฐานภาษี → + VAT
// vatRate default 0 = "ราคารวม VAT แล้ว" (ราคาบรรทัด = ราคาผลิตจาก master — มติ
// 2026-07-19); เลือก 7 เมื่อต้องการบวก VAT แยกท้ายใบ. ทุกยอดปัดสตางค์ก่อนคืน.
export function quoteTotals(lines = [], { discountType = null, discountValue = 0, vatRate = 0 } = {}) {
  const subtotal = round2(lines.reduce((sum, line) => sum + quoteLineNet(line).lineTotal, 0));
  const discountAmount = round2(discountAmountOf(subtotal, discountType, discountValue));
  const taxable = round2(subtotal - discountAmount);
  const vatAmount = round2(taxable * (toMoney(vatRate) / 100));
  return { subtotal, discountAmount, vatAmount, totalAmount: round2(taxable + vatAmount) };
}
