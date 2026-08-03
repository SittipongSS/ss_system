// ── คำร้องข้ามฝ่าย (mig 0173) — logic ล้วน ────────────────────────────────
// ต่อยอดจาก "เคสขอราคาวัสดุ" (0158) ที่มีครบทุกอย่างอยู่แล้ว — เลขที่ · สถานะ
// 6 ขั้น · คิวรายฝ่าย · บรรทัด + ชั้นจำนวน · เธรดกลาง · ไฟล์แนบ — แล้วขยายให้
// รับ "ชนิด" (lib/master/requestTypes.js) จนกลืนงานของระบบสอบถามเดิมได้ทั้งหมด
//
// ⚠️ สถานะ/ป้าย/กฎ **คงเดิมทุกตัวอักษร** จากเคสขอราคา — ผู้ใช้ที่ใช้เคสอยู่ต้อง
// ไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ (คนที่ได้ของใหม่คือฝั่งสอบถามที่ย้ายมา)
import { businessMonthKey } from '@/lib/businessDate';
import { isSuperuser } from '@/lib/permissions';
import {
  MATERIAL_KINDS, canQuoteMaterial, sourceDeptForMaterialKind,
} from '@/lib/materialPrices';
import {
  requestDocScope, requestHasItems, requestKindLabel,
} from '@/lib/master/requestTypes';

export const REQUEST_STATUSES = ['draft', 'pending', 'acknowledged', 'answered', 'closed', 'cancelled'];

export const REQUEST_STATUS_LABELS = {
  draft: 'ร่าง',
  pending: 'ส่งแล้ว — รอรับเรื่อง',
  acknowledged: 'รับเรื่องแล้ว — กำลังดำเนินการ',
  answered: 'ตอบแล้ว',
  closed: 'ปิดเรื่อง',
  cancelled: 'ยกเลิก',
};

// โทนของ pill = **ชื่อโทนของ `<StatusBadge>`** ไม่ใช่ค่าสี — หน้าจอจึงไม่ต้องรู้จัก
// token สีเลย และเปลี่ยนดีไซน์ป้ายได้ที่ Badge.module.css ที่เดียวทั้งระบบ
// (มาตรฐานเดียวกับ SCENT_STATUS_TONES / SCENT_FEEDBACK_TONES)
export const REQUEST_STATUS_TONES = {
  draft: 'neutral',
  pending: 'warning',
  acknowledged: 'info',
  answered: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
};

// คำร้องที่ "ยังเดินอยู่" — ใช้กรองคิวและนับงานค้างของฝ่าย
export const REQUEST_OPEN_STATUSES = ['pending', 'acknowledged'];

export const REQUEST_ITEM_STATUS_LABELS = {
  pending: 'รอราคา',
  quoted: 'ตอบราคาแล้ว',
  no_quote: 'ตอบไม่ได้',
};

export function normalizeRequestStatus(value) {
  return REQUEST_STATUSES.includes(value) ? value : 'draft';
}

// ── เลขที่ ────────────────────────────────────────────────────────────────
// ออกตอนกดส่งเท่านั้น (ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง — บทเรียนใบขอราคาผลิต)
export async function generateRequestDocNo(supabase, kind, dept, now = new Date()) {
  const scope = requestDocScope(kind, dept);
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: month });
  if (error) throw new Error(`ออกเลขที่คำร้องไม่สำเร็จ: ${error.message}`);
  return `${scope}-${month}${String(data).padStart(4, '0')}`;
}

// ── ตรวจรายการในคำร้องก่อนแตะ DB (เฉพาะชนิดที่มีบรรทัด) ─────────────────
export const MAX_REQUEST_ITEMS = 40;
export const MAX_REQUEST_TIERS = 12;

// items เข้ามาเป็น [{ kind, materialId?, label, spec?, componentId?, tiers: [qty…] }]
// materialId ว่าง = ของใหม่ ผู้เรียก (API) ต้องสร้างวัสดุร่างแล้วเติม id กลับมาก่อนบันทึก
// `hasTiers` มาจากหัวข้อ (requestHasTiers) — false = บังคับราคาเดียว ทิ้งชั้นที่
// client ส่งมาทั้งหมด · มติผู้ใช้ 2026-08-03: **ขอราคา F/FB ไม่มีขั้น MOQ** มีเฉพาะ
// วัสดุ (PM) กับราคาผลิต · หัวน้ำหอม/เนื้อสารคิดเป็นราคาต่อกิโลเดียว ไม่ลดตามจำนวน
export function normalizeRequestItems(input, { dept, hasTiers = true } = {}) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { items: [], error: 'ต้องมีรายการอย่างน้อย 1 รายการ' };
  if (rows.length > MAX_REQUEST_ITEMS) {
    return { items: [], error: `รายการในคำร้องเดียวมากเกินไป (สูงสุด ${MAX_REQUEST_ITEMS} รายการ)` };
  }

  const items = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `รายการที่ ${i + 1}`;
    if (!MATERIAL_KINDS.includes(raw.kind)) return { items: [], error: `${at}: ชนิดวัสดุไม่ถูกต้อง` };
    // ทุกรายการต้องเป็นของฝ่ายเดียวกับหัวคำร้อง — เลขที่ผูกกับฝ่าย ปนกันแล้วส่งผิดคน
    const itemDept = sourceDeptForMaterialKind(raw.kind);
    if (dept && itemDept !== dept) {
      return { items: [], error: `${at}: เป็นของฝ่าย ${itemDept} แต่คำร้องนี้ส่งไปฝ่าย ${dept}` };
    }

    const label = String(raw.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { items: [], error: `${at}: ต้องระบุชื่อวัสดุ` };
    if (label.length > 200) return { items: [], error: `${at}: ชื่อวัสดุยาวเกิน 200 ตัวอักษร` };

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: สเปกยาวเกิน 2000 ตัวอักษร` };

    // กันถามวัสดุตัวเดียวกันซ้ำในคำร้องเดียว (ตอบแล้วจะไม่รู้ว่าอันไหนคู่กับอันไหน)
    const dupKey = raw.materialId ? `id:${raw.materialId}` : `new:${label.toLowerCase()}`;
    if (seen.has(dupKey)) return { items: [], error: `${at}: ถามวัสดุตัวนี้ซ้ำในคำร้องเดียวกัน` };
    seen.add(dupKey);

    // หัวข้อที่ไม่มีชั้นจำนวน = ทิ้งของที่ส่งมาเงียบ ๆ ไม่ error — ฟอร์มไม่แสดงช่องนี้
    // อยู่แล้ว ค่าที่หลุดมาได้คือของค้างจากตอนสลับหัวข้อ ไม่ใช่เจตนาของผู้ใช้
    const { tiers, error } = hasTiers
      ? normalizeRequestTiers(raw.tiers)
      : { tiers: [], error: null };
    if (error) return { items: [], error: `${at}: ${error}` };

    items.push({
      kind: raw.kind,
      materialId: raw.materialId || null,
      label,
      spec: spec || null,
      componentId: raw.componentId || null,
      tiers,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ชั้นจำนวนที่ขอ — ผู้ขอระบุเองอิสระ ไม่มีชุดค่าบังคับ (มติ 2026-07-26)
// ว่าง = ขอราคาเดียวไม่แบ่งชั้น
export function normalizeRequestTiers(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { tiers: [], error: null };
  if (rows.length > MAX_REQUEST_TIERS) {
    return { tiers: [], error: `ชั้นจำนวนมากเกินไป (สูงสุด ${MAX_REQUEST_TIERS} ชั้น)` };
  }
  const tiers = [];
  const seen = new Set();
  for (const raw of rows) {
    const qty = Number(typeof raw === 'object' ? raw?.qty : raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { tiers: [], error: 'จำนวนที่ขอต้องเป็นตัวเลขมากกว่า 0' };
    }
    if (seen.has(qty)) return { tiers: [], error: `จำนวน ${qty} ซ้ำ` };
    seen.add(qty);
    tiers.push(qty);
  }
  tiers.sort((a, b) => a - b);
  return { tiers, error: null };
}

// ── ความคืบหน้า + สถานะที่ derive ────────────────────────────────────────
// ตัวนับคำนวณตอนอ่านเสมอ ห้ามเก็บคอลัมน์ (กัน drift — แพตเทิร์นเดียวกับใบขอราคาผลิต)
export function requestProgress(items = []) {
  const total = items.length;
  const done = items.filter((i) => i.priceStatus === 'quoted' || i.priceStatus === 'no_quote').length;
  return { done, total, complete: total > 0 && done === total };
}

// ตอบครบทุกรายการ → คำร้องเป็น answered เอง (ไม่ต้องให้ใครกด)
// ⚠️ ใช้ได้เฉพาะชนิดที่มีบรรทัด — ชนิดที่ไม่มีบรรทัด (สอบถาม/บรีฟ/mockup) ผู้ตอบ
// กดปุ่ม "ตอบแล้ว" เอง เพราะระบบไม่มีทางรู้ว่าคำตอบครบหรือยัง
export function deriveRequestStatusAfterAnswer(items = [], currentStatus = 'acknowledged') {
  if (currentStatus === 'cancelled' || currentStatus === 'closed') return currentStatus;
  return requestProgress(items).complete ? 'answered' : 'acknowledged';
}

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
// ตอบ/รับเรื่อง = ฝ่ายเจ้าของคำร้อง (RD หรือ PC) + admin break-glass
export function canAnswerRequest(user, request) {
  if (!request) return false;
  return canQuoteMaterial(user, request.dept);
}

// จัดการคำร้อง (ส่ง/แก้ร่าง/ยกเลิก/ปิด) = ผู้ขอเอง + admin
// (หัวหน้าทีมไม่ได้ถูกดึงเข้ามาโดยตั้งใจ — คำร้องเป็นงานปฏิบัติของคนเปิดเอง)
export function canManageRequest(user, request) {
  if (!request) return false;
  if (isSuperuser(user?.role)) return true;
  return !!user?.id && request.requestedById === user.id;
}

// เห็นคำร้องนี้ไหม = ผู้ขอ หรือ ฝ่ายที่ต้องตอบ (ตรงกับ scope ของ GET /api/sa/requests)
// ใช้ตอนอ้างคำร้องจากที่อื่น เช่นปุ่ม "สร้างงานจากคำร้อง" ในระบบงานของฉัน
export function canViewRequest(user, request) {
  return canManageRequest(user, request) || canAnswerRequest(user, request);
}

// ── ด่านของแต่ละ action — คืนข้อความไทย หรือ null ถ้าผ่าน ───────────────
export function submitRequestError(request, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status !== 'draft') return 'คำร้องนี้ส่งไปแล้ว';
  if (requestHasItems(request.kind) && !items.length) {
    return 'ต้องมีรายการอย่างน้อย 1 รายการก่อนส่ง';
  }
  return null;
}

export function acknowledgeRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง';
  if (request.status !== 'pending') return 'คำร้องนี้รับเรื่องไปแล้ว';
  return null;
}

export function answerRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'draft' ? 'คำร้องนี้ยังไม่ถูกส่ง' : 'คำร้องนี้ปิดไปแล้ว';
  }
  return null;
}

export function closeRequestError(request, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'closed') return 'คำร้องนี้ปิดแล้ว';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกไปแล้ว';
  // ชนิดที่มีบรรทัดต้องตอบครบก่อน — ชนิดที่ไม่มีบรรทัด ผู้ขอเป็นคนตัดสินว่าพอแล้ว
  // (แนวคิดเดียวกับระบบสอบถามเดิม: คนถามคือคนตัดสินว่าคำตอบใช้ได้จริง)
  if (requestHasItems(request.kind) && !requestProgress(items).complete) {
    return 'ยังมีรายการที่ยังไม่ได้ตอบ — ตอบให้ครบหรือกด "ตอบไม่ได้" ก่อน';
  }
  if (!requestHasItems(request.kind) && request.status === 'pending') {
    return 'ยังไม่มีใครรับเรื่องเลย — ยกเลิกแทนการปิด';
  }
  return null;
}

export function cancelRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกไปแล้ว';
  if (request.status === 'closed') return 'คำร้องที่ปิดแล้วยกเลิกไม่ได้';
  if (request.status === 'answered') return 'คำร้องนี้ตอบแล้ว — ปิดเรื่องแทนการยกเลิก';
  return null;
}

export function deleteRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status !== 'draft' || request.submittedAt) {
    return 'ลบได้เฉพาะร่างที่ยังไม่ส่ง — คำร้องที่ส่งแล้วเป็นหลักฐาน';
  }
  return null;
}

// ── กำหนดวันตอบ ─────────────────────────────────────────────────────────
// ยกมาจากระบบสอบถามเดิม: ผู้ตอบระบุ "วันที่จะตอบ" ตอนกดรับเรื่อง แล้ววันนั้นเป็น
// เส้นวัด KPI (ไม่ใช่วันที่ผู้ขออยากได้ ซึ่งเป็นความคาดหวังฝ่ายเดียว)
export function requestDueTone(request, todayIso) {
  if (!request || !todayIso) return null;
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;
  const due = request.committedDueDate;
  if (!due) return { label: 'ยังไม่รับเรื่อง', color: 'var(--text-3)' };
  if (String(due) < String(todayIso)) return { label: 'เลยกำหนด', color: 'var(--red)' };
  if (String(due) === String(todayIso)) return { label: 'ครบกำหนดวันนี้', color: 'var(--amber)' };
  return null;
}

// ลำดับความเร่งของคิว (ยกมาจากระบบสอบถามเดิม): เรื่องที่ยังไม่มีใครรับมาก่อนเสมอ
// เพราะยังไม่มีใครรับปากวันตอบ = ยังไม่มีกำหนด ถ้าเรียงด้วยวันที่ล้วนมันจะตกไป
// ท้ายคิวทั้งที่เร่งที่สุด
export function compareRequestUrgency(a, b) {
  const taken = (r) => (r?.acknowledgedAt ? 1 : 0);
  if (taken(a) !== taken(b)) return taken(a) - taken(b);
  if (!a?.acknowledgedAt) return String(a?.submittedAt || '').localeCompare(String(b?.submittedAt || ''));
  return String(a?.committedDueDate || '9999').localeCompare(String(b?.committedDueDate || '9999'));
}

// ป้ายสรุปหนึ่งบรรทัดสำหรับคิว/ฟีด — ชนิด + หัวเรื่อง (หรือจำนวนรายการ)
export function requestSummaryText(request, items = []) {
  const kindLabel = requestKindLabel(request?.kind);
  if (request?.title) return `${kindLabel} · ${request.title}`;
  if (items.length) return `${kindLabel} · ${items.length} รายการ`;
  return kindLabel;
}

// ── หมุดไทม์ไลน์ (มติ 3 + 6) ──────────────────────────────────────────────
// คำร้องบางชนิดไม่ใช่งานลอย ๆ แต่เป็น "วิธีทำ" ของขั้นตอนที่มีอยู่แล้วในไทม์ไลน์:
// บรีฟกลิ่น = ขั้นออกแบบกลิ่น · ขอ mockup = ขั้นขึ้น Mock-up · ขอราคา PM = ขั้นหา
// บรรจุภัณฑ์ · ติดตามของเข้า = ขั้นสั่งซื้อสารและบรรจุภัณฑ์ · ชนิดพวกนี้จึงแปะหมุด
// กลับไปที่ task เดิม ไม่สร้าง task ใหม่ซ้อน
//
// ⚠️ จับคู่ด้วย `stepKey` ไม่ใช่ `projectTaskId` — `mergeTemplateTasks` ลบ/สร้าง task
// ใหม่ตอน resync แม่แบบ ผูก id ตรง ๆ แล้วหมุดหลุดเงียบ (ดู lib/pm/schedule.js)
//
// คืน Map(stepKey → คำร้อง[]) · เรียงเรื่องที่ยังค้างขึ้นก่อนเสมอ เพราะหมุดมีไว้
// เตือนว่า "ขั้นนี้มีเรื่องรออยู่" ไม่ใช่ไว้ดูประวัติ
export function requestsByStepKey(requests = [], { projectId = null } = {}) {
  const byStep = new Map();
  for (const r of requests) {
    if (!r?.stepKey) continue;
    // คำร้องร่างยังไม่ถูกส่ง = ยังไม่ใช่งานของใคร ไม่ควรโผล่บนไทม์ไลน์ของทีม
    if (r.status === 'draft') continue;
    // คำร้องของดีลอื่นที่ยังไม่ผูกโครงการนี้ ไม่ใช่หมุดของไทม์ไลน์นี้
    if (projectId && r.projectId && r.projectId !== projectId) continue;
    const list = byStep.get(r.stepKey) || [];
    list.push(r);
    byStep.set(r.stepKey, list);
  }
  for (const list of byStep.values()) {
    list.sort((a, b) => {
      const open = (r) => (REQUEST_OPEN_STATUSES.includes(r.status) ? 0 : 1);
      if (open(a) !== open(b)) return open(a) - open(b);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }
  return byStep;
}

// สรุปหมุดของขั้นเดียว → { total, open, first } หรือ null ถ้าไม่มีอะไรผูกอยู่
// UI ใช้ `open` ตัดสินสี: มีเรื่องค้าง = เตือน, ปิดครบแล้ว = เงียบ ๆ
export function stepPinSummary(byStep, stepKey) {
  const list = stepKey ? byStep?.get(stepKey) : null;
  if (!list?.length) return null;
  const open = list.filter((r) => REQUEST_OPEN_STATUSES.includes(r.status)).length;
  return { total: list.length, open, first: list[0] };
}

// ── ผลลัพธ์ของคำร้องที่ "มีของออกมา" (มติ 3) ─────────────────────────────
// บรีฟกลิ่นไม่ได้จบแค่ตอบกลับ — จบเมื่อ **มีกลิ่นอยู่ในทะเบียน** ถ้าปิดเรื่องได้
// โดยไม่ต้องบอกว่าได้กลิ่นอะไร ทะเบียนกลิ่นก็จะว่างต่อไปเรื่อย ๆ เหมือนที่ผ่านมา
//
// ⚠️ **ไม่เดาชื่อกลิ่นจากหัวเรื่องคำร้อง** — หัวเรื่องเป็นข้อความบรีฟ ("บรีฟกลิ่น
// ชุดใหม่ ลูกค้า X") ไม่ใช่ชื่อกลิ่น · สร้าง master data ผิดแย่กว่าไม่สร้าง
// (บทเรียนตรงจาก prod: มีสินค้า 10 แถวที่เอาชื่อกลิ่นไปกรอกช่องชื่อสูตร)
export const REQUEST_OUTCOMES = ['link', 'create', 'none'];

// ชนิดที่ต้องระบุผลลัพธ์ตอนปิดเรื่อง → ทะเบียนปลายทาง
export const OUTCOME_REGISTRY_BY_KIND = { scent_brief: 'scent' };

export function requestNeedsOutcome(kind) {
  return !!OUTCOME_REGISTRY_BY_KIND[kind];
}

// ตรวจรูปร่างของผลลัพธ์ก่อนแตะ DB — ใช้ร่วมทั้ง API และโมดัลปิดเรื่อง
// คืนข้อความไทย หรือ null ถ้าผ่าน
export function closeOutcomeError(request, outcome = {}) {
  if (!requestNeedsOutcome(request?.kind)) return null;
  // เคยผูกไว้แล้วตั้งแต่ตอนเปิด/ระหว่างทาง = ไม่ต้องถามซ้ำ
  if (request?.scentId) return null;

  const mode = outcome?.mode;
  if (!REQUEST_OUTCOMES.includes(mode)) return 'ต้องระบุว่าบรีฟนี้ได้กลิ่นตัวไหน';
  if (mode === 'link' && !outcome.scentId) return 'ต้องเลือกกลิ่นจากทะเบียน';
  if (mode === 'create') {
    const name = String(outcome.scentName ?? '').trim();
    if (!name) return 'ต้องระบุชื่อกลิ่นที่จะเพิ่มเข้าทะเบียน';
    if (name.length > 200) return 'ชื่อกลิ่นยาวเกิน 200 ตัวอักษร';
    // กลิ่นผูกลูกค้าเสมอ (มติ 9) — บรีฟที่ไม่มีลูกค้าสร้างกลิ่นไม่ได้
    if (!request?.customerId) return 'คำร้องนี้ไม่มีลูกค้า จึงเพิ่มกลิ่นเข้าทะเบียนไม่ได้';
  }
  return null;
}
