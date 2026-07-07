import { SALES_FEATURES, STAGE_LABELS } from '@/lib/salesPlanning';
import { categoryOf, isExciseCategory } from '@/lib/master/categoryOf';

// ── Deal lifecycle: single source ของ "สถานะ + ขั้นต่อไป + go/no-go + routing" ──
// ใช้บนหน้าศูนย์ดีล (deals/[id]) เพื่อให้ตรรกะไม่กระจายใน UI. เป็น pure function.

// ลำดับหลักของ pipeline (lost เป็นทางแยก terminal — จัดการแยกใน UI)
export const MAIN_SEQUENCE = [
  'lead',
  'qualified',
  'quotation',
  'timeline_proposed',
  'awaiting_confirm',
  'deposit_pending',
  'won',
  'in_project',
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

// routing: ส่งต่อไประบบที่ทำงานจริง. related = { projectProducts, exciseRegistrations, sahamitPo, shipmentPrep }
function buildRoutes(deal, related) {
  const { projectProducts = [], exciseRegistrations = [], sahamitPo = null } = related || {};
  const hasProject = !!deal.projectId;
  const projectHref = hasProject ? `/pm/projects/${deal.projectId}` : null;
  const routes = [];

  // 1) PM project — ปลดล็อกตั้งแต่เสนอไทม์ไลน์ขึ้นไป (project เกิดก่อน win ได้)
  const pmUnlockable = ['timeline_proposed', 'awaiting_confirm', 'deposit_pending', 'won', 'in_project'].includes(deal.stage);
  routes.push({
    kind: 'pm',
    label: 'โครงการ PM',
    status: hasProject ? 'done' : pmUnlockable ? 'available' : 'locked',
    href: projectHref,
    action: hasProject ? null : 'create-project',
    hint: hasProject ? 'ผูกโครงการแล้ว' : pmUnlockable ? 'สร้างโครงการเพื่อเริ่มผลิต' : 'ถึงขั้น "เสนอไทม์ไลน์" ก่อน',
  });

  // 2) สรรพสามิต — เฉพาะดีลที่มี FG หมวด 01-002 เท่านั้น
  if (dealHasExciseFg(deal, projectProducts)) {
    const regCount = exciseRegistrations.length;
    routes.push({
      kind: 'excise',
      label: 'ทะเบียนสรรพสามิต',
      status: regCount > 0 ? 'done' : hasProject ? 'available' : 'locked',
      href: hasProject ? projectHref : null,
      action: !hasProject || regCount > 0 ? null : 'create-excise',
      hint: regCount > 0 ? `มีทะเบียน ${regCount} รายการ` : hasProject ? 'สร้างทะเบียนจากโครงการ' : 'สร้างโครงการ PM ก่อน',
    });
  }

  // 3) ส่งของ — เมื่อเปิด flag shipment เท่านั้น
  if (SALES_FEATURES.shipment) {
    routes.push({
      kind: 'shipment',
      label: 'เตรียมส่งของ',
      status: !hasProject ? 'locked' : related?.shipmentPrep ? 'done' : 'available',
      href: projectHref,
      action: null,
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
      action: null,
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
