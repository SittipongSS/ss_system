import { SALES_FEATURES, STAGE_LABELS } from '@/lib/salesPlanning';
import { categoryOf, isExciseCategory } from '@/lib/master/categoryOf';

// ── Deal lifecycle: single source ของ "สถานะ + ขั้นต่อไป + go/no-go + routing" ──
// ใช้บนหน้าศูนย์ดีล (deals/[id]) เพื่อให้ตรรกะไม่กระจายใน UI. เป็น pure function.

// ลำดับหลักของ pipeline (lost เป็นทางแยก terminal — จัดการแยกใน UI)
// won = สถานะปิดสุดท้าย; งานผลิต (PM) เป็นมิติแยก ไม่ใช่ขั้นถัดไปของดีล
export const MAIN_SEQUENCE = [
  'lead',
  'qualified',
  'quotation',
  'timeline_proposed',
  'awaiting_confirm',
  'deposit_pending',
  'won',
];

const CLOSED = ['won', 'in_project', 'lost'];

// รวบ fgCode ทั้งหมดของดีล (จาก metadata.fgCodes + project_products ถ้ามีโครงการ)
export function dealFgCodes(deal, projectProducts = []) {
  const out = new Set();
  for (const fg of (deal?.metadata?.fgCodes || [])) if (fg) out.add(String(fg));
  for (const row of projectProducts || []) {
    const fg = row?.product?.fgCode || row?.fgCode;
    if (fg) out.add(String(fg));
  }
  return [...out];
}

// ดีลนี้มี FG ที่เข้าข่ายสรรพสามิต (หมวด 01-002) ไหม
export function dealHasExciseFg(deal, projectProducts = []) {
  return dealFgCodes(deal, projectProducts).some((fg) => isExciseCategory(categoryOf(fg)));
}

// nextAction ต่อ stage — label + hint (kind ใช้เลือกปุ่มหลักฝั่ง UI)
function nextActionFor(stage, hasProject) {
  const quoteOn = SALES_FEATURES.quotations;
  switch (stage) {
    case 'lead':
      return { kind: 'qualify', label: 'คัดกรองลูกค้า / บันทึกกิจกรรม', hint: 'ประเมินโอกาส แล้วเลื่อนเป็น "ผ่านคัดกรอง"' };
    case 'qualified':
      return quoteOn
        ? { kind: 'quote', label: 'ทำใบเสนอราคา', hint: 'สร้างใบเสนอราคาส่งลูกค้า' }
        : { kind: 'propose', label: 'เสนอไทม์ไลน์ / ปิด Won', hint: 'เสนอกำหนดงานหรือปิดการขายเมื่อได้ยืนยัน' };
    case 'quotation':
      return { kind: 'accept', label: 'รอรับใบเสนอราคา', hint: 'เมื่อลูกค้ารับ → เลื่อนเป็น "รอยืนยัน"' };
    case 'timeline_proposed':
      return { kind: 'await', label: 'รอลูกค้ายืนยัน', hint: 'ติดตามการยืนยันไทม์ไลน์' };
    case 'awaiting_confirm':
      return { kind: 'deposit', label: 'รอมัดจำ', hint: 'เมื่อรับมัดจำ → ปิด Won ได้' };
    case 'deposit_pending':
      return { kind: 'win', label: 'ปิดการขาย (Won)', hint: 'ได้มัดจำแล้ว — กดปิด Won' };
    case 'won':
      return hasProject
        ? { kind: 'open_project', label: 'ติดตามงานผลิต', hint: 'เปิดโครงการ PM เพื่อดำเนินงาน' }
        : { kind: 'create_project', label: 'สร้างโครงการ PM', hint: 'ส่งต่อเข้าสู่การผลิต' };
    case 'in_project':
      return { kind: 'open_project', label: 'ติดตามงานผลิต', hint: 'งานอยู่ในขั้นผลิต — ติดตามที่โครงการ PM' };
    case 'lost':
      return null;
    default:
      return null;
  }
}

// steps สำหรับ stepper: state = done | current | todo (lost → ทั้งแถวเป็น skipped)
function buildSteps(stage) {
  if (stage === 'lost') {
    return MAIN_SEQUENCE.map((key) => ({ key, label: STAGE_LABELS[key] || key, state: 'skipped' }));
  }
  const idx = MAIN_SEQUENCE.indexOf(stage);
  return MAIN_SEQUENCE.map((key, i) => ({
    key,
    label: STAGE_LABELS[key] || key,
    state: idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo',
  }));
}

// สถานะทะเบียนสรรพสามิต (จาก excise workflow): draft→pending_legal→approved (rejected=ตีกลับ)
const REG_STATUS_HINT = {
  draft: 'ทะเบียนฉบับร่าง — แนบเอกสาร/ส่งอนุมัติ',
  pending_legal: 'รอฝ่ายกฎหมายอนุมัติ',
  rejected: 'ถูกตีกลับ — แก้ไขแล้วส่งใหม่',
};

// รวมรายการ FG หมวด 01-002 ของดีล (ให้ productId ถ้ามีจาก project_products)
function collectExciseFgEntries(deal, projectProducts) {
  const entries = [];
  const seen = new Set();
  for (const row of projectProducts || []) {
    const fg = row?.product?.fgCode || row?.fgCode;
    if (!fg || !isExciseCategory(categoryOf(fg))) continue;
    const key = String(row.productId || fg);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ fgCode: String(fg), productId: row.productId || null });
  }
  if (!entries.length) {
    for (const fg of (deal?.metadata?.fgCodes || [])) {
      if (!fg || !isExciseCategory(categoryOf(fg)) || seen.has(String(fg))) continue;
      seen.add(String(fg));
      entries.push({ fgCode: String(fg), productId: null });
    }
  }
  return entries;
}

// หาทะเบียนที่ตรงกับ FG (จับด้วย productId ก่อน แล้ว fallback fgCode)
function matchRegistration(entry, regs) {
  const fg = entry.fgCode.trim().toLowerCase();
  return (regs || []).find((r) =>
    (entry.productId && r.productId === entry.productId) ||
    (r.fgCode && String(r.fgCode).trim().toLowerCase() === fg),
  ) || null;
}

// สรรพสามิตรายตัว FG: ยังไม่ขึ้น→สร้างทะเบียน, กำลังขึ้น→ไปทำต่อ, อนุมัติแล้ว→ไปยื่นชำระ
function buildExciseRoutes(deal, projectProducts, exciseRegistrations, hasProject) {
  const entries = collectExciseFgEntries(deal, projectProducts);
  if (!entries.length) return []; // ไม่มี FG 01-002 → ไม่โชว์การ์ดสรรพสามิต
  if (!hasProject) {
    return [{ kind: 'excise', label: 'ทะเบียนสรรพสามิต', status: 'locked', hint: 'สร้างโครงการ PM ก่อน', actionKind: null, href: null }];
  }
  const multi = entries.length > 1;
  return entries.map((e) => {
    const reg = matchRegistration(e, exciseRegistrations);
    const kind = multi ? `excise:${e.fgCode}` : 'excise';
    const label = multi ? `ทะเบียน ${e.fgCode}` : 'ทะเบียนสรรพสามิต';
    if (!reg) {
      return { kind, label, status: 'available', hint: `${e.fgCode} ยังไม่ขึ้นทะเบียน`, actionKind: 'create-excise', actionLabel: 'สร้างทะเบียน', productId: e.productId, href: null };
    }
    if (reg.status === 'approved') {
      return { kind, label, status: 'done', hint: `${e.fgCode} ขึ้นทะเบียนแล้ว → ไปยื่นชำระ`, actionKind: null, href: '/tax/filings', linkLabel: 'ไปยื่นชำระ' };
    }
    return { kind, label, status: 'progress', hint: `${e.fgCode}: ${REG_STATUS_HINT[reg.status] || 'อยู่ระหว่างขึ้นทะเบียน'}`, actionKind: null, href: `/tax/registrations/${reg.id}`, linkLabel: 'เปิดทะเบียน' };
  });
}

// routing: ส่งต่อไประบบที่ทำงานจริง. related = { projectProducts, exciseRegistrations, sahamitPo, shipmentPrep }
function buildRoutes(deal, related) {
  const { projectProducts = [], exciseRegistrations = [], sahamitPo = null } = related || {};
  const hasProject = !!deal.projectId;
  const projectHref = hasProject ? `/sa/projects/${deal.projectId}` : null;
  const routes = [];

  // 1) PM project — ปลดล็อกตั้งแต่เสนอไทม์ไลน์ขึ้นไป (project เกิดก่อน win ได้)
  const pmUnlockable = ['timeline_proposed', 'awaiting_confirm', 'deposit_pending', 'won', 'in_project'].includes(deal.stage);
  routes.push({
    kind: 'pm',
    label: 'โครงการ PM',
    status: hasProject ? 'done' : pmUnlockable ? 'available' : 'locked',
    href: projectHref,
    linkLabel: 'เปิดโครงการ',
    actionKind: hasProject ? null : pmUnlockable ? 'create-project' : null,
    actionLabel: 'สร้างโครงการ',
    hint: hasProject ? 'ผูกโครงการแล้ว' : pmUnlockable ? 'สร้างโครงการเพื่อเริ่มผลิต' : 'ถึงขั้น "เสนอไทม์ไลน์" ก่อน',
  });

  // 2) สรรพสามิต — รายตัว FG หมวด 01-002 ตามสถานะทะเบียน
  for (const r of buildExciseRoutes(deal, projectProducts, exciseRegistrations, hasProject)) routes.push(r);

  // 3) ส่งของ — เมื่อเปิด flag shipment เท่านั้น
  if (SALES_FEATURES.shipment) {
    routes.push({
      kind: 'shipment',
      label: 'เตรียมส่งของ',
      status: !hasProject ? 'locked' : related?.shipmentPrep ? 'done' : 'available',
      href: projectHref,
      linkLabel: 'เปิด',
      actionKind: null,
      hint: !hasProject ? 'สร้างโครงการ PM ก่อน' : related?.shipmentPrep ? 'มีเอกสารส่งของแล้ว' : 'ไปเตรียมเอกสารส่งของใน PM',
    });
  }

  // 4) PO สหมิตร — อ่านอย่างเดียว (แสดงเมื่อผูกแล้ว)
  if (sahamitPo) {
    routes.push({
      kind: 'sahamit',
      label: `PO สหมิตร ${sahamitPo.poNumber || ''}`.trim(),
      status: 'done',
      href: `/sahamit/po/${sahamitPo.id}`,
      linkLabel: 'เปิด',
      actionKind: null,
      hint: `${sahamitPo.lines?.length || 0} รายการ`,
    });
  }

  return routes;
}

// main: คืนทุกอย่างที่หน้าศูนย์ดีลต้องใช้
export function dealLifecycle(deal, related = {}) {
  if (!deal) return null;
  const hasProject = !!deal.projectId;
  const open = !CLOSED.includes(deal.stage);
  return {
    steps: buildSteps(deal.stage),
    nextAction: nextActionFor(deal.stage, hasProject),
    canGo: open, // ปิด Won ได้จากทุกสถานะที่ยังเปิด (markWon กัน idempotent)
    canNoGo: open, // Lost ได้จากทุกสถานะที่ยังเปิด
    routes: buildRoutes(deal, related),
  };
}
