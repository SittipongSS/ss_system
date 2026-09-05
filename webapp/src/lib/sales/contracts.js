// ── สัญญาของฝ่ายขาย (mig 0278) — กติกาล้วน ไม่มี I/O ────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-20 (docs/sales-contract-plan.md) — สามข้อที่ตัดสินไปแล้ว:
//   1. ออกสัญญาได้เมื่อดีลมีใบเสนอราคาที่ **อนุมัติภายในแล้ว** (approvalStatus)
//      ไม่ต้องรอลูกค้าตอบรับ
//   2. ลงนามนอกระบบ — พิมพ์ไปเซ็นแล้วอัปโหลดไฟล์กลับ
//   3. ระบบเจนเนื้อสัญญาเองจากแม่แบบ
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอ (ซ่อน/จางปุ่ม + บอกเหตุผล) และฝั่ง API (ปฏิเสธจริง)
//    ⇒ ห้าม import อะไรที่เป็น server-only · **ด่านต้องเป็นตัวเดียวกันสองที่**
//    บทเรียนจากโมดูลบัญชี: ด่านที่แยกสองชุดจะเพี้ยนหากันแล้วได้ปุ่มที่กดแล้ว 403 เงียบ ๆ

import { dealTypeOf } from '@/lib/salesPlanning';

export const CONTRACT_KINDS = Object.freeze(['scent_design', 'manufacturing', 'service']);

export const CONTRACT_KIND_LABELS = Object.freeze({
  scent_design: 'สัญญาจ้างออกแบบกลิ่น',
  manufacturing: 'สัญญาจ้างผลิต',
  service: 'สัญญาบริการ',
});

/* ชื่อเต็มบนกระดาษ — ยาวกว่าป้ายในตารางโดยเจตนา (ป้ายสั้นไว้อ่านในลิสต์
   ชื่อเต็มไว้เป็นหัวเอกสารตามต้นฉบับที่ใช้จริง)
   ⚠️ **ต้องตรงกับ `titleTh` ของแม่แบบชนิดนั้น** — ตัวเรนเดอร์อ่านตารางนี้ก่อนเสมอ
      (`template.titleTh` เป็นแค่ทางถอย) ⇒ สองที่เขียนคนละคำเมื่อไร กระดาษจะพิมพ์คำที่
      ไม่มีใครตั้งใจ · สัญญาบริการเคยเป็น "สัญญาให้บริการ" ที่นี่ แต่แม่แบบและต้นฉบับ
      เขียน "สัญญาบริการ" — มติผู้ใช้ 2026-09-06: **ยึด "สัญญาบริการ"** · มีเทสต์ล็อกคู่ไว้แล้ว */
export const CONTRACT_KIND_DOC_TITLES = Object.freeze({
  scent_design: 'สัญญาจ้างออกแบบกลิ่นและการพัฒนาสินค้า',
  manufacturing: 'สัญญาจ้างผลิตสินค้า',
  service: 'สัญญาบริการ',
});

export const CONTRACT_KIND_DOC_TITLES_EN = Object.freeze({
  scent_design: 'SCENT DESIGN & PRODUCT DEVELOPMENT AGREEMENT',
  manufacturing: 'MANUFACTURING AGREEMENT',
  service: 'SERVICE AGREEMENT',
});

/* ── ที่มาของสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30) ──────────────────────
   *"(PO ลูกค้า / อีเมล / สัญญากระดาษเก่า / หรืออาจมีอื่นๆ)"* — ผู้ใช้ตอบ "เอา" ว่าเอกสาร
   อื่นใช้แทนสัญญาได้ โดยมีเงื่อนไขว่า **ต้องผ่าน AE Sup อนุมัติ**
   ⇒ เปิดทางให้งานบริการเดินได้โดยไม่ต้องรอต้นฉบับสัญญาจ้างบริการ (ยังไม่มี) และ
     ไม่ต้องกุสัญญาปลอมขึ้นมาในระบบ */
export const CONTRACT_SOURCES = Object.freeze(['generated', 'external']);

export const CONTRACT_SOURCE_LABELS = Object.freeze({
  generated: 'ระบบเจนจากแม่แบบ',
  external: 'เอกสารภายนอกใช้แทนสัญญา',
});

export const EXTERNAL_DOC_KINDS = Object.freeze(['customer_po', 'email', 'paper_contract', 'other']);

export const EXTERNAL_DOC_KIND_LABELS = Object.freeze({
  customer_po: 'ใบสั่งซื้อของลูกค้า (PO)',
  email: 'อีเมลยืนยันจากลูกค้า',
  paper_contract: 'สัญญากระดาษฉบับเดิม',
  other: 'เอกสารอื่น',
});

export const contractSourceOf = (contract) =>
  (CONTRACT_SOURCES.includes(contract?.source) ? contract.source : 'generated');
export const isExternalContract = (contract) => contractSourceOf(contract) === 'external';
export const externalDocKindLabel = (kind) => EXTERNAL_DOC_KIND_LABELS[kind] || '—';

/* 🔴 **ใบ external ไม่มีเอกสารของระบบให้พิมพ์** — เนื้อของมันคือไฟล์ที่แนบไว้
   ปล่อยให้เส้นพิมพ์ทำงานเมื่อไร ระบบจะเรนเดอร์ "สัญญา" จากแม่แบบด้วยช่องที่ไม่มีใคร
   ตกลงด้วย แล้ว **ตรึงลง `issuedHtml` ถาวร** (ใบ external ได้ `contractNo` จาก RPC
   ตอนอนุมัติ ⇒ ผ่านเงื่อนไขเก็บเนื้อของ route พิมพ์) — ตรงข้ามกับเหตุผลที่ mig 0322
   มีอยู่: *"ไม่ต้องกุสัญญาปลอมขึ้นมาในระบบ"* */
export const EXTERNAL_NO_DOCUMENT_NOTE = 'ใบนี้ใช้เอกสารภายนอกแทนสัญญา — ตัวเอกสารคือไฟล์ที่แนบไว้ ไม่ใช่ฉบับที่ระบบเจนจากแม่แบบ';

/* ⭐ `awaiting_approval` เพิ่ม 2026-08-31 (mig 0323) — ขั้น "รอหัวหน้ารับรอง" ของ
   สาย generated · ของเดิม SA กดบันทึกลงนามแล้วจบเลย = ไม่มีด่านที่สอง ทั้งที่
   `signed` เป็นตัวปลดล็อกของจริงหลายอย่าง
   ⚠️ สาย external ไม่มีขั้นนี้ (มติผู้ใช้) — เอกสารเซ็นมาจากข้างนอกแล้ว การกดของ
   AE Sup ที่นั่นคือด่านที่สองอยู่ในตัว ⇒ draft → signed ทีเดียว
   ⇒ **สองสายจบที่ "signed + มีคนรับรอง" เหมือนกัน** ต่างแค่จำนวนคลิก */
export const CONTRACT_STATUSES = Object.freeze(['draft', 'awaiting_signature', 'awaiting_approval', 'signed', 'revised', 'cancelled']);

/* 🪤 **สถานะที่ทะเบียนไม่มีวันแสดง** — ทะเบียนคัดเหลือ *ฉบับล่าสุดของแต่ละสาย* เท่านั้น
   (`latestContractRevisions` · mig 0280) และใบที่สถานะ `revised` ถูกแทนที่ด้วยฉบับที่
   `revisionNo` สูงกว่าในสายเดียวกัน **เสมอโดยนิยาม** ⇒ มันถูกคัดทิ้งทุกครั้ง
   ⇒ เอา `revised` ไปเป็นตัวเลือกตัวกรอง = ตัวเลือกที่กดแล้วได้ศูนย์แถวตลอดกาล
     ซึ่งอ่านเหมือน "ไม่มีข้อมูล" ทั้งที่คือ "หน้านี้แสดงของแบบนั้นไม่ได้"
   ⚠️ ฉบับเก่ายัง **เปิดดูได้** จากลิงก์สายฉบับบนหน้ารายละเอียด — ไม่ได้หายไปจากระบบ */
export const CONTRACT_LIST_STATUSES = Object.freeze(
  CONTRACT_STATUSES.filter((status) => status !== 'revised'),
);

export const CONTRACT_STATUS_LABELS = Object.freeze({
  draft: 'ร่าง',
  awaiting_signature: 'รอลงนาม',
  awaiting_approval: 'รอหัวหน้ารับรอง',
  signed: 'ลงนามแล้ว',
  revised: 'ออกฉบับแก้ไขแล้ว',
  cancelled: 'ยกเลิก',
});

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (กติกาเดียวกับ SCENT_STATUS_TONES)
export const CONTRACT_STATUS_TONES = Object.freeze({
  draft: 'muted',
  awaiting_signature: 'warning',
  // โทนคนละตัวกับ "รอลงนาม" โดยตั้งใจ — สองขั้นนี้รอคนละคนทำคนละเรื่อง
  awaiting_approval: 'info',
  signed: 'success',
  revised: 'muted',
  cancelled: 'danger',
});

export const contractKindLabel = (kind) => CONTRACT_KIND_LABELS[kind] || 'สัญญา';
export const contractStatusLabel = (status) => CONTRACT_STATUS_LABELS[status] || status || '—';
export const contractStatusTone = (status) => CONTRACT_STATUS_TONES[status] || 'muted';
export const isContractKind = (kind) => CONTRACT_KINDS.includes(kind);

// ── เลขที่สัญญา ────────────────────────────────────────────────────────────
//
// CT-AAAA-BB-XXXXX-R (AAAA = เลขรหัสลูกค้า · BB = ชนิดสัญญา · เลขรันเดินยาวไม่ตัดรอบ)
//
// ⚠️ **ไม่ได้อยู่ในทะเบียน "มาตรฐานเอกสาร"** (DOCUMENT_STANDARD_KEYS) โดยเจตนา —
//    ทะเบียนนั้นบังคับให้มีรหัสแบบฟอร์มควบคุม (FM-xx-nn) ซึ่งสัญญายังไม่มี และการ
//    กุรหัสขึ้นเองแปลว่ามีเอกสารควบคุมปลอมโผล่ในระบบคุณภาพ · วันไหนฝ่ายเอกสารออก
//    รหัสจริงให้ ค่อยย้ายรูปแบบนี้เข้าทะเบียนแล้วให้หน้าตั้งค่าคุมแทน
/* ⭐ **มติผู้ใช้ 2026-08-31: แทรกอักษรย่อชนิดสัญญาเข้าไปในเลขที่** —
   `CT-YYMMXXXX-R` → **`CT-AA-YYMMXXXX-R`** ⇒ อ่านเลขแล้วรู้ทันทีว่าเป็นสัญญาอะไร
   โดยไม่ต้องเปิดใบ (เลขสัญญาถูกอ้างในอีเมล ใบวางบิล และบันทึกเพิ่มเติม)

   ⚠️ **SR ไม่ใช่ SV** (ผู้ใช้เลือกเอง) — `SV` เป็นรหัส**ทีมขาย** Services อยู่แล้ว
   และโผล่ในชื่อดีลทุกใบ (`SV_ลูกค้า_งาน`) ⇒ ใช้ซ้ำเมื่อไรคนอ่านเลขจะไม่แน่ใจว่า
   หมายถึงชนิดสัญญาหรือทีมที่ขาย */
export const CONTRACT_KIND_CODES = Object.freeze({
  scent_design: 'SD',
  manufacturing: 'MF',
  service: 'SR',
});

export const contractKindCode = (kind) => CONTRACT_KIND_CODES[kind] || null;

/** รูปแบบเลขที่ของสัญญาชนิดนั้น — `CT-BB-YYMM{RUNNING:4}`
 *
 * ⭐ **มติผู้ใช้ 2026-08-31 (รอบสอง): กลับมาใช้ทรงนี้ + เลขรันไม่ตัดรอบ**
 *   เคยลองทรง `CT-AAAA-BB-XXXXX` ที่มีรหัสลูกค้านำหน้าแล้วถอยกลับ — ทรงนี้สั้นกว่า
 *   และยังบอกเดือนที่ออกสัญญาได้ ซึ่งทรงที่มีรหัสลูกค้าทำไม่ได้ (ไม่มี YYMM)
 *
 * ⚠️ **YYMM ในเลขคือ "เดือนที่ออก" ไม่ใช่ตัวตัดรอบเลขรัน** (ดู `CONTRACT_NUMBER_MONTH`)
 * ⚠️ คืน `null` เมื่อชนิดไม่รู้จัก — ผู้เรียกต้องปฏิเสธ ไม่ใช่ปล่อยให้ออกเลขที่มี
 *   อักษรย่อมั่ว ๆ ซึ่งลบทิ้งไม่ได้แล้วเมื่อออกไป
 */
export function contractNumberPattern(kind) {
  const code = contractKindCode(kind);
  return code ? `CT-${code}-{YY}{MM}{RUNNING:4}` : null;
}

/* ⚠️ **เคาน์เตอร์เป็นบ่อเดียวทั้งบริษัท** (มติผู้ใช้ 2026-08-31: "นับรวมทั้งบริษัท") —
   ทั้งรหัสลูกค้าและอักษรย่อชนิดเปลี่ยนแค่ *หน้าตาเลข* ไม่ได้แยกสายเลขรัน
   ⇒ `CT-0121-SR-00042` แปลว่าเป็นสัญญาใบที่ 42 **ของบริษัท** ไม่ใช่ของลูกค้ารายนั้น
   ⇒ **ห้ามเปลี่ยน scope เป็นรายลูกค้า/รายชนิดโดยไม่ถามก่อน** — RPC สองตัวใน SQL
   (`issue_sales_contract` · `approve_external_sales_contract`) ฮาร์ดโค้ด `'CT'` ไว้
   การแยกสายต้องมี migration แก้ทั้งคู่ ไม่ใช่แก้ฝั่ง JS อย่างเดียว */
export const CONTRACT_NUMBER_SCOPE = 'CT';

/* ⭐ **เลขรันเดินยาว ไม่ตัดรอบเดือน** (มติผู้ใช้ 2026-08-31: "XXXX รันเรื่อยๆ")
   🔴 **นี่คือจุดที่คนอ่านโค้ดพลาดง่ายที่สุดของเลขชุดนี้** — เลขมี `YYMM` อยู่ในตัว
   แต่ `YYMM` นั้นมาจาก **prefix** (เดือนที่ออกใบ) ส่วนตัวตัดรอบของเลขรันคือ
   **คีย์ `month` ของ `entity_number_counters`** ซึ่งเป็นคนละค่ากันสิ้นเชิง
   ⇒ ตั้ง `'-'` = ตัวนับไม่มีวันตัดรอบ · ผลคือเลขเดินต่อข้ามเดือน:
     `CT-SR-26080001` → (เดือนถัดไป) `CT-SR-26090002` ไม่ใช่ย้อนกลับเป็น 0001
   ⚠️ แพตเทิร์น `'-'` ไม่ใช่ท่าที่คิดขึ้นใหม่ — AR กับ FG บนฐานใช้อยู่แล้ว

   🪤 ตัวนับของเลขยุคก่อนคือ (CT, '2608') ส่วนของชุดนี้คือ (CT, '-') — **คนละแถวกัน**
   ⇒ ชุดใหม่เริ่มที่ 0001 · ไม่ชนกับเลขเก่าเพราะ `CT-26080001` (ยุคแรก ไม่มีอักษรย่อ)
     คนละสตริงกับ `CT-SR-26080001`
   🪤 กิ่ง seed ของ RPC ใช้ `LIKE p_prefix || '%'` ซึ่งผูกกับเดือน ⇒ ถ้าแถวตัวนับ
     (CT, '-') หายไป มันจะ seed จากเลขของ *เดือนปัจจุบัน* เท่านั้นแล้วนับซ้ำ ·
     กิ่งนั้นทำงานเฉพาะตอนแถวหาย ซึ่ง trigger ของ mig 0241 กันไว้ไม่ให้ลบอยู่แล้ว

   ⚠️ **เพดาน 9,999 ใบตลอดอายุระบบ** (ไม่ใช่ต่อเดือนแล้ว) — เกินแล้ว RPC โยน
     `contract_monthly_sequence_exhausted` · ปัจจุบันมีสัญญา 4 ใบ จึงยังห่างมาก
     แต่วันที่ใกล้ ให้ขยายเป็น 5 หลัก **ในเลขชุดใหม่** ไม่ใช่แก้ความกว้างของชุดเดิม */
export const CONTRACT_NUMBER_MONTH = '-';

// ── ประเภทดีล/สายธุรกิจ → ชนิดสัญญาที่ออกได้ ──────────────────────────────
//
// มติผู้ใช้ 2026-08-20 (ตอบคำถาม "เฉพาะดีล SCENT ครอบคลุมแค่ไหน"):
//   ออกแบบกลิ่น = ดีล SCENT · จ้างผลิต = NPD/RE-ORDER สาย PRODUCT
//   บริการ      = NPD/RE-ORDER สาย SERVICE
//
// ⚠️ **สายธุรกิจอ่านจากดีลก่อน แล้วค่อยตกไปที่โครงการ** — ดีลถือสายของตัวเองตั้งแต่
//    mig 0275 (มติผู้ใช้ 2026-08-20) ส่วนดีลเก่าที่ยังไม่ระบุยังสืบจากโครงการที่ผูกอยู่
//    ซึ่งเป็นกติกาเดียวกับ backfill ของ 0275 ไม่ใช่การเดา
// ⚠️ NULL คือ "ยังไม่ระบุ" ที่ถูกต้อง ไม่ใช่ข้อผิดพลาด ⇒ ดีลที่ยังไม่มีสายจะออกได้แค่
//    สัญญาออกแบบกลิ่น (ซึ่งไม่ต้องใช้สาย) · **ห้ามเดาสายให้เอง**
const SCENT_TYPES = new Set(['SCENT']);
const DELIVERY_TYPES = new Set(['NPD', 'RE-ORDER']);

export const contractBusinessLine = (deal, project = null) =>
  deal?.line || project?.line || deal?.project?.line || null;

export function contractKindsForDeal(deal, project = null) {
  const type = dealTypeOf(deal);
  const line = contractBusinessLine(deal, project);
  const kinds = [];
  if (SCENT_TYPES.has(type)) kinds.push('scent_design');
  if (DELIVERY_TYPES.has(type)) {
    if (line === 'PRODUCT') kinds.push('manufacturing');
    if (line === 'SERVICE') kinds.push('service');
  }
  return kinds;
}

// ใบเสนอราคาที่ "ปลดล็อกสัญญา" ได้ — อนุมัติภายในแล้ว และใบยังมีผลอยู่
// ⚠️ ใบที่ถูกยกเลิก/ปฏิเสธไม่นับ แม้จะเคยอนุมัติมาก่อน: มันคือใบที่ตายแล้ว
//    การอ้างมันบนสัญญาเท่ากับอ้างราคาที่ไม่มีใครถืออยู่
const DEAD_QUOTE_STATUSES = new Set(['cancelled', 'rejected']);

export function approvedQuotationsForContract(quotations = []) {
  return (quotations || []).filter((q) => q?.approvalStatus === 'approved' && !DEAD_QUOTE_STATUSES.has(q?.status));
}

// ── ด่านออกสัญญา ────────────────────────────────────────────────────────────
// คืน { ok, reason } — `reason` เป็นข้อความไทยที่เอาไปโชว์ใต้ปุ่มได้ตรง ๆ
// (ปุ่มจางที่ไม่บอกเหตุผล = คนเดินมาถามผู้ดูแลทีละคน — กติกาเดียวกับการ์ดระบบที่ปิดอยู่)
export function contractEligibility({ kind, deal, project = null, quotations = [] } = {}) {
  if (!deal) return { ok: false, reason: 'ไม่พบดีลของสัญญานี้' };
  const approved = approvedQuotationsForContract(quotations);
  if (!approved.length) {
    return { ok: false, reason: 'ออกสัญญาได้หลังใบเสนอราคาของดีลนี้ผ่านการอนุมัติแล้ว' };
  }
  const allowed = contractKindsForDeal(deal, project);
  if (!allowed.length) {
    const type = dealTypeOf(deal) || 'ไม่ระบุ';
    const line = contractBusinessLine(deal, project);
    if (DELIVERY_TYPES.has(type) && !line) {
      return { ok: false, reason: 'ดีลนี้ยังไม่ระบุสายธุรกิจ — เลือกสายสินค้า/บริการที่ดีลก่อน' };
    }
    return { ok: false, reason: `ดีลประเภท ${type} ยังไม่มีชนิดสัญญาที่ออกได้` };
  }
  if (kind && !allowed.includes(kind)) {
    return {
      ok: false,
      reason: `${contractKindLabel(kind)}ออกกับดีลนี้ไม่ได้ — ออกได้เฉพาะ ${allowed.map(contractKindLabel).join(' · ')}`,
    };
  }
  return { ok: true, reason: null, kinds: allowed, quotations: approved };
}

// ── สถานะ → ทำอะไรได้บ้าง ───────────────────────────────────────────────────
// จุดเดียวที่ตอบว่า "ปุ่มไหนขึ้น" ทั้งหน้าจอและ API — แยกสองชุดเมื่อไรได้ปุ่มที่กดแล้ว
// ระบบปฏิเสธ (หรือแย่กว่า: ปุ่มที่ไม่ขึ้นทั้งที่ทำได้)
export const isContractEditable = (contract) => contract?.status === 'draft';
/* ⚠️ **ออกเลขแบบเจนได้เฉพาะสาย generated** — ใบ external ออกเลขตอน AE Sup อนุมัติ
   ผ่าน RPC คนละตัว (`approve_external_sales_contract`) เพราะมันจบที่ `signed` ไม่ใช่
   `awaiting_signature` · ปล่อยให้ปุ่ม "ออกสัญญา" ขึ้นบนใบ external เมื่อไร คนจะกดแล้ว
   ได้ใบที่ค้างอยู่สถานะ "รอลงนาม" ซึ่งไม่มีปุ่มไหนพาออกมาเลย */
export const canIssueContract = (contract) =>
  contract?.status === 'draft' && !isExternalContract(contract);
export const canSignContract = (contract) =>
  contract?.status === 'awaiting_signature' && !isExternalContract(contract);

/* ── ขั้น "หัวหน้ารับรองการลงนาม" (mig 0323 · มติผู้ใช้ 2026-08-31) ──────────
   *"ต้องมีขั้น Approve จาก AE sup ด้วย ไม่งั้นไปทำงานต่อไม่ได้"*
   🔴 **ด่านเดียวกับอนุมัติเอกสารภายนอก และห้ามยืม `canEditSalesPlanning`** — เหตุผล
   เดียวกันเป๊ะ: `/sign` ที่อยู่ก่อนหน้าใช้ cap นั้น ซึ่ง AE/AC ผ่านหมด ⇒ ถ้าขั้นนี้
   ใช้ตัวเดียวกัน คนที่กดลงนามก็กดรับรองตัวเองได้ = ด่านที่สองไม่มีอยู่จริง */
export const canApproveSignedContract = (contract) => contract?.status === 'awaiting_approval';

export function signedApproveError(contract, user) {
  if (!contract) return 'ไม่พบสัญญา';
  if (!canApproveExternalContract(user)) return 'รับรองการลงนามได้เฉพาะ AE Supervisor';
  if (contract.status === 'signed') return 'ใบนี้ถูกรับรองไปแล้ว';
  if (contract.status === 'awaiting_signature') return 'ยังไม่ได้บันทึกการลงนาม — ฝ่ายขายต้องแนบไฟล์ฉบับลงนามก่อน';
  if (contract.status !== 'awaiting_approval') return 'ใบนี้ยังไม่เข้าขั้นรับรองการลงนาม';
  /* ฐานบังคับไว้อีกชั้นด้วย CHECK `sales_contracts_awaiting_approval_signed` —
     ตรวจซ้ำที่นี่เพื่อให้ผู้ใช้ได้ข้อความไทย ไม่ใช่ 23514 ดิบ ๆ */
  if (!contract.signedFileId) return 'ใบนี้ยังไม่มีไฟล์ฉบับลงนามแนบอยู่';
  if (!contract.signedDate) return 'ใบนี้ยังไม่มีวันที่ลงนาม';
  return null;
}

/** ปุ่มรับรองควรโผล่ไหม — เจ้าของขั้นเห็นเสมอ แล้วบอกเหตุตอนกด (GatedAction) */
export const showSignedApprove = (contract, user) =>
  contract?.status === 'awaiting_approval' && canApproveExternalContract(user);

/** สัญญาใบนี้ "ใช้งานได้" แล้วหรือยัง — จุดเดียวที่ปลายน้ำควรถาม
 *  ⚠️ ยังเท่ากับ `status === 'signed'` เป๊ะ ๆ เพราะ mig 0323 บังคับที่ฐานแล้วว่า
 *  signed ต้องมีคนรับรอง ⇒ ของที่เคยเช็ค `status === 'signed'` ไม่ต้องแก้สักจุด
 *  มีตัวนี้ไว้เพื่อให้ **ความหมาย** อยู่ที่เดียว ถ้าวันหนึ่งเงื่อนไขซับซ้อนขึ้น */
export const contractInForce = (contract) => contract?.status === 'signed';
/* ⚠️ ยกเลิกได้ถึงขั้น "รอหัวหน้ารับรอง" ด้วย — ใบที่ลงนามผิดฉบับต้องมีทางออก
   ก่อนที่มันจะกลายเป็นสัญญาที่ใช้งานได้ (ใบที่ signed แล้วต้องทำบันทึกเพิ่มเติมแทน) */
export const canCancelContract = (contract) => ['draft', 'awaiting_signature', 'awaiting_approval'].includes(contract?.status);
/* ลบได้ตราบใดที่ยังเป็นร่าง (มติผู้ใช้ 2026-08-21: "ถ้าร่างให้ลบได้ จนกว่าจะกดออกสัญญา")
   ร่างไม่มีทางมีเลขที่อยู่แล้ว — เงื่อนไขเลขที่คงไว้เป็นเข็มขัดนิรภัยของข้อมูลเก่า */
export const canDeleteContract = (contract) => contract?.status === 'draft' && !contract?.contractNo;

/* ── ฉบับแก้ไข (Rev.) — กติกาเดียวกับใบเสนอราคา ────────────────────────────
   ใบที่ออกเลขแล้วแก้เนื้อไม่ได้ ต้องออก **แถวใหม่** ที่ถือเลขฐานเดิม เลขฉบับถัดไป
   (CT-YYMMXXXX-1) แล้วใบเดิมกลายเป็น `revised` = อ่านอย่างเดียว

   ⚠️ **ใบที่ลงนามแล้วออก Rev. ไม่ได้** — ตัวสัญญาข้อ 3.2 เขียนไว้เองว่าการแก้ไข
   เพิ่มเติมต้องทำเป็นลายลักษณ์อักษรและลงนามทั้งสองฝ่าย ⇒ ของแบบนั้นคือ "บันทึก
   เพิ่มเติมสัญญา" (เอกสารคนละใบ) ไม่ใช่การออกฉบับแก้ไขทับของเดิม */
export const canReviseContract = (contract) => contract?.status === 'awaiting_signature';

export function contractReviseBlockReason(contract) {
  if (canReviseContract(contract)) return null;
  if (contract?.status === 'draft') return 'ใบนี้ยังเป็นร่าง — แก้ในใบได้เลย ไม่ต้องออกฉบับแก้ไข';
  if (contract?.status === 'signed') return 'สัญญาที่ลงนามแล้วต้องทำบันทึกเพิ่มเติมสัญญา ไม่ใช่ออกฉบับแก้ไข (ข้อ 3.2)';
  if (contract?.status === 'revised') return 'ใบนี้ถูกแทนที่ด้วยฉบับแก้ไขแล้ว — ออก Rev. ต่อที่ฉบับล่าสุด';
  return 'ใบที่ยกเลิกแล้วออกฉบับแก้ไขไม่ได้';
}

// เลขฐานของสายฉบับ — ใบเก่าที่ยังไม่มี baseNumber ใช้เลขที่ของตัวเองเป็นฐาน
export const contractRevisionKey = (contract) =>
  contract?.baseNumber || contract?.contractNo || contract?.id || '';

const revisionNo = (contract) => (Number.isFinite(Number(contract?.revisionNo)) ? Number(contract.revisionNo) : 0);
const revisionTime = (contract) => {
  const value = Date.parse(contract?.createdAt || contract?.updatedAt || '');
  return Number.isFinite(value) ? value : 0;
};

/* เหลือเฉพาะฉบับล่าสุดของแต่ละสาย — ทะเบียนต้องไม่โชว์ฉบับเก่าปนกับฉบับปัจจุบัน
   (แพตเทิร์นเดียวกับ latestQuotationRevisions ของใบเสนอราคา) */
export function latestContractRevisions(contracts = []) {
  const latest = new Map();
  for (const contract of contracts) {
    const key = contractRevisionKey(contract);
    const current = latest.get(key);
    if (!current
      || revisionNo(contract) > revisionNo(current)
      || (revisionNo(contract) === revisionNo(current) && revisionTime(contract) > revisionTime(current))) {
      latest.set(key, contract);
    }
  }
  return [...latest.values()].sort((a, b) => revisionTime(b) - revisionTime(a));
}

/** ใบที่รอมือใคร — ใช้ทั้งป้ายตัวเลขบนเมนูและตัวกรอง "ที่ต้องทำ" ในลิสต์
 *
 *  **สองเลนของใบเดียวกัน** เหมือนใบสั่งขาย:
 *    เลนเจ้าของ   → ร่างที่ยังไม่ออกเลข · ใบที่ออกแล้วรอเก็บฉบับลงนามกลับมา
 *    เลนผู้รับรอง → `awaiting_approval` ซึ่งรอ **AE Supervisor** เท่านั้น (mig 0323)
 *
 *  🐞 เดิมมีแต่เลนเจ้าของ ⇒ ขั้น "รอหัวหน้ารับรอง" ไม่เคยโผล่ในตัวกรอง "ที่ต้องทำ"
 *     และเมนูสัญญาก็ไม่เคยมีป้ายเลย (ตรวจ 2026-09-02) · ใบที่ค้างตรงนั้นบล็อกงาน
 *     ทั้งเส้น เพราะสัญญาต้อง `signed` ก่อนถึงจะปลดด่าน "จ่ายก่อนบริการ" ได้
 *  ⚠️ ต้องส่ง `user` เข้ามา ไม่ใช่แค่ `userId` — เลนผู้รับรองเป็นเรื่องของ **บทบาท**
 *     ไม่ใช่ความเป็นเจ้าของใบ (ด่านเดียวกับปุ่ม: `canApproveExternalContract`)
 *
 *  🐞 **สายเอกสารภายนอกไม่มีคิวเลยทั้งเส้น** (แก้ 2026-09-02) — สายนั้นเดิน
 *     `draft → signed` ทีเดียว ไม่เคยแตะ `awaiting_approval` ⇒ เลนผู้รับรองด้านบน
 *     ไม่เคยยิงกับมัน · ส่วนเลนเจ้าของก็ถือใบไว้ตลอด แม้หลังแนบไฟล์ครบแล้ว
 *     ⇒ คนที่กดอนุมัติได้จริง (AE Supervisor) ไม่มีทางรู้ว่ามีใบรออยู่ นอกจากมีคนไปบอก
 *
 *  ⭐ **ใบ external ร่างสลับเลนตอนแนบไฟล์** — ก่อนแนบเป็นงานของเจ้าของ (ไปเอาเอกสาร
 *     จากลูกค้ามาแนบ) หลังแนบเป็นงานของ AE Sup (อ่านแล้วอนุมัติ) · ผู้เรียกต้องบอกมา
 *     ผ่าน `externalDocReady` เพราะแถวในฐานไม่มีคอลัมน์ที่ตอบได้ (ดู `markExternalDocReady`)
 *     ⚠️ ไม่ส่งมา = ถือว่า **ยังไม่แนบ** ⇒ ใบตกอยู่เลนเจ้าของเหมือนเดิม ไม่ใช่ไปโผล่
 *        ในป้ายของ AE Sup ด้วยใบที่เขายังกดไม่ได้
 */
export function isContractWaitingOnMe(contract, { userId = '', user = null, externalDocReady = false } = {}) {
  if (!contract) return false;
  if (contract.status === 'awaiting_approval') return canApproveExternalContract(user);
  if (isExternalContract(contract) && contract.status === 'draft' && externalDocReady) {
    return canApproveExternalContract(user);
  }
  const me = userId || user?.id || '';
  if (!me) return false;
  const mine = contract.ownerId === me || contract.createdBy === me;
  if (!mine) return false;
  return contract.status === 'draft' || contract.status === 'awaiting_signature';
}

// จำนวนวันที่ใบค้างอยู่ในขั้น "รอลงนาม" — ตัวเลขที่ฝ่ายขายใช้ตามงานจริง
export function daysAwaitingSignature(contract, now = new Date()) {
  if (contract?.status !== 'awaiting_signature' || !contract?.issuedAt) return null;
  const issued = new Date(contract.issuedAt);
  if (Number.isNaN(issued.getTime())) return null;
  return Math.max(0, Math.floor((now - issued) / 86400000));
}

/* ══════════════════════════════════════════════════════════════════════════
   อนุมัติให้ "เอกสารภายนอก" ใช้แทนสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30)
   ══════════════════════════════════════════════════════════════════════════

   🔴 **ด่านนี้ต้องเป็นของ AE Supervisor เท่านั้น — ห้ามลอก `canEditSalesPlanning`**
   route `/contracts/[id]/sign` ที่มีอยู่ใช้ `canEditSalesPlanning` ซึ่ง **AE กับ AC ผ่านหมด**
   ซึ่งถูกสำหรับการ *บันทึกว่าเซ็นแล้ว* (งานธุรการของใบที่ผ่านขั้นตอนมาครบ) แต่ผิดสำหรับ
   ใบนี้ เพราะการกดนี้คือการ **ตัดสินว่าเอกสารที่ไม่ใช่สัญญาผูกพันพอที่จะเดินงานได้**
   ซึ่งปลดล็อกด่าน "จ่ายก่อนบริการ" ของทั้งเส้น ⇒ AE กดเองได้เมื่อไร ด่านทั้งเฟสรั่ว
   ⚠️ กับดักจริง: ถ้าเขียนตามความเคยชินจะได้ปุ่มที่ AE กดผ่าน และ **เทสต์เดิมจับไม่ได้เลย**
   เพราะไม่มีเทสต์ไหนล็อกด่านของ route นี้ไว้ (มีแล้วในไฟล์เทสต์ของโมดูลนี้)

   ⚠️ ไม่ใช้ `isSuperuser` เดี่ยว ๆ เป็นด่าน (บทเรียน `canConfirmPayment`) — admin ผ่าน
   เพราะเป็น superuser ของทั้งระบบ (#1501) ไม่ใช่เพราะเป็น "หัวหน้าฝ่ายขายอีกคน" */
export const canApproveExternalContract = (user) =>
  user?.role === 'ae_supervisor' || user?.role === 'admin';

/** ด่านเดียวที่ทั้งปุ่มบนจอและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * ⭐ **บังคับวันมีผล/วันสิ้นสุดตอนอนุมัติ** (ต่างจากใบ generated ที่กรอกทีหลังได้) —
 *   ใบ external คือสิ่งเดียวที่บอกได้ว่า "สัญญานี้ครอบช่วงไหน" และ `paidThrough` กับ
 *   ทะเบียนต่อสัญญา 90 วันอ่านสองค่านี้ตรง ๆ ⇒ ปล่อยว่าง = ใบที่ปลดล็อกงานได้แต่
 *   ตอบไม่ได้ว่าปลดถึงเมื่อไร
 * ⭐ **บังคับไฟล์แนบ** — "เอกสารภายนอกใช้แทนสัญญา" โดยไม่มีเอกสารแนบ คือคำพูดลอย ๆ
 */
/* 🔴 **ด่านของ "เปิดขั้น" แยกจากด่านของ "กดยืนยัน"** (แก้ 2026-09-02)
   🐞 ของเดิมมีด่านเดียว แล้วปุ่มบนการ์ดจัดการเอาด่านนั้นมาปิดตัวเอง ⇒ **เดดล็อก**:
      ปุ่มถูกปิดเพราะ "ยังไม่ระบุวันที่เริ่มมีผล" แต่ช่องกรอกวันอยู่ใน **โมดัลที่ปุ่มนั้น
      เป็นคนเปิด** ⇒ AE Supervisor กดอนุมัติเอกสารแทนสัญญาไม่ได้เลยสักใบ ตั้งแต่ #1529
      (ยืนยันกับฐาน: ไม่มีใบ external ที่ status = 'signed' สักใบ)
   ⇒ ตัวนี้ตอบ "เปิดฟอร์มได้ไหม" — เฉพาะสิ่งที่รู้ได้ **ก่อน** กรอกฟอร์ม
     (สิทธิ์ · ที่มาของใบ · สถานะ · ชนิดเอกสาร · มีไฟล์แนบแล้วหรือยัง)
   ⚠️ ต้องเป็น **คำนำหน้าแท้** ของด่านกดยืนยัน — `externalApproveError` เรียกตัวนี้ก่อน
      เสมอ ⇒ ปุ่มเปิดได้ = ผ่านด่านชั้นแรกครบแล้วจริง ไม่ใช่ด่านคนละชุดที่ขัดกันได้ */
export function externalApproveOpenError(contract, user, payload = {}) {
  if (!contract) return 'ไม่พบสัญญา';
  if (!canApproveExternalContract(user)) {
    return 'อนุมัติเอกสารแทนสัญญาได้เฉพาะ AE Supervisor';
  }
  if (!isExternalContract(contract)) {
    return 'ใบนี้เป็นสัญญาที่ระบบเจนจากแม่แบบ — ใช้ขั้นออกสัญญาและลงนามตามปกติ';
  }
  if (contract.status === 'signed') return 'เอกสารของใบนี้ถูกอนุมัติไปแล้ว';
  if (contract.status === 'cancelled') return 'ใบนี้ถูกยกเลิกแล้ว';
  if (contract.status !== 'draft') return 'อนุมัติได้เฉพาะใบที่ยังเป็นร่าง';
  if (!contract.externalDocKind) return 'ยังไม่ได้ระบุว่าใช้เอกสารชนิดไหนแทนสัญญา';
  if (!payload.signedFileId) return 'แนบไฟล์เอกสารที่ใช้แทนสัญญาก่อน แล้วจึงกดอนุมัติได้';
  return null;
}

export function externalApproveError(contract, user, payload = {}) {
  const openError = externalApproveOpenError(contract, user, payload);
  if (openError) return openError;
  /* ── ต่อจากนี้คือค่าที่กรอกใน **โมดัล** — ปุ่มที่เปิดโมดัลห้ามเอาด่านชุดนี้มาปิดตัวเอง ── */
  if (!payload.effectiveDate) return 'ระบุวันที่เริ่มมีผลก่อนอนุมัติ';
  if (!payload.expiryDate) return 'ระบุวันที่สิ้นสุดก่อนอนุมัติ';
  if (payload.effectiveDate > payload.expiryDate) {
    return 'วันที่เริ่มมีผลต้องไม่เกินวันที่สิ้นสุด';
  }
  return null;
}

/** ปุ่ม "อนุมัติเอกสารแทนสัญญา" ควรโผล่ไหม — แยกจากด่านกดได้ตามกติกา GatedAction
 *  (คนที่เป็นเจ้าของขั้นต้องเห็นปุ่มเสมอแล้วบอกเหตุตอนกด ไม่ใช่ปุ่มหายเงียบ ๆ) */
export const showExternalApprove = (contract, user) =>
  isExternalContract(contract)
  && contract?.status === 'draft'
  && canApproveExternalContract(user);
