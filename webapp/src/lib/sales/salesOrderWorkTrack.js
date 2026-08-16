// ── เส้นเดินงานของใบสั่งขาย — logic ล้วน ────────────────────────────────
//
// ⭐ **เส้นเดียวสามช่วง ไม่ใช่สามเส้นขนาน** (มติผู้ใช้ 2026-08-13)
// บรีฟกลิ่นจบก่อนถึงสั่งของ · ของครบก่อนถึงผลิต ⇒ มันต่อกัน ไม่ได้เดินพร้อมกัน
// วาดขนานคือโกหกลำดับงาน และจำนวนจุดไม่เท่ากัน (5·3·4) ทำให้ตาเทียบข้ามแถวไม่ได้
//
// ⚠️ แยกสองสถานะนี้ให้ขาด:
//   · **ไม่เกี่ยวกับใบนี้เลย** (ใบไม่มีบรรทัดออกแบบกลิ่น) ⇒ ช่วงนั้น **หายไปทั้งช่วง**
//   · **เกี่ยวแต่ยังไม่เชื่อม** ⇒ ขึ้นกล่องชวนกด ไม่ใช่จุดเปล่า ๆ ที่ไม่บอกว่าต้องทำอะไร
//
// ⭐ **สรรพสามิตเป็นสองช่วงคนละที่ ไม่ใช่ช่วงเดียวท้ายเส้น** (มติผู้ใช้ 2026-08-17)
// ขึ้นทะเบียนคือใบที่ประกาศราคาขายปลีก+ฉลากต่อสรรพสามิต ⇒ ต้องอนุมัติ **ก่อน** ผลิต/ส่ง
// (เหตุผลเต็มอยู่ที่ lib/tax/requirements.js) ส่วนยื่นชำระมาหลังขายจริง ⇒ ท้ายเส้น
// กองสองอันไว้ท้ายเส้นด้วยกันเท่ากับบอกว่า "ขึ้นทะเบียนหลังผลิตเสร็จ" ซึ่งผิดลำดับงานจริง
//
// ⭐ **รูปของเส้นมาจากประเภทดีล ไม่ใช่ใบทุกใบเหมือนกันหมด** (มติผู้ใช้ 2026-08-17)
// ของเดิมตรึงช่วง ของเข้า/ผลิต ไว้ทุกใบ ⇒ SO ที่ขาย "ออกแบบกลิ่น" ล้วนขึ้นว่า
// "ยังไม่ผูกรายการของเข้า" และ "ยังไม่มีงานผลิต" ทั้งที่ไม่มีวันมี — ทวงงานที่ไม่มีอยู่จริง
// ระบบเลือกแม่แบบไทม์ไลน์ด้วย `deal.dealType` อยู่แล้ว (lib/workflowTemplates.js)
// และ request kind ก็ประกาศ `dealType` ของตัวเอง — เส้นนี้เป็นที่เดียวที่ไม่ฟัง
import { REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { JOB_STATUS_LABELS } from '@/lib/pm/productionPlan';
import { TRACKS, statusMeta } from '@/lib/excise/workflow';
import { fmtMoney } from '@/lib/format';

/* ประเภทดีลที่มีสายผลิตจริง — ของเข้าและผลิตขึ้นเฉพาะสองตัวนี้
   · SCENT     ขายค่าออกแบบกลิ่น จบที่ RD ส่ง direction ไม่มีของเข้าไม่มีคิวผลิต
   · NPD       พัฒนาสินค้า → ของเข้า → ผลิต
   · RE-ORDER  สั่งผลิตซ้ำ → ของเข้า → ผลิต
   · OTHER     ยังไม่นิยามสายเดินงาน (มติผู้ใช้ 2026-08-17)

   ⚠️ **พัฒนาสูตรไม่อยู่บนเส้นนี้โดยตั้งใจ** — `formula_dev` ประกาศ `needs: ['project','deal']`
   ไม่ใช่ `['salesOrder']` (มติ ม-40: ลูกค้าขอตัวอย่างก่อนซื้อ) ⇒ มันผูกกับดีล เกิดก่อน SO
   และจบไปแล้วตอน SO เกิด · ลากมาวางบนเส้นของ SO = โชว์งานที่ไม่ใช่ชีวิตของใบนี้

   ⚠️ **สรรพสามิตไม่อยู่ในตารางนี้** — ภาระภาษีมาจาก *ของที่ขาย* ไม่ใช่ชนิดดีล
   ⇒ สองช่วงนั้นดูบรรทัดสินค้าเสมอ ทุกประเภทดีลรวม OTHER · ตัดตามชนิดดีลเมื่อไร
   ใบ OTHER ที่ขายสินค้าในพิกัดจะไม่เหลือทางสร้างใบยื่นเลย */
export const DEAL_TYPES_WITH_SUPPLY_CHAIN = ['NPD', 'RE-ORDER'];

/** จุดของแต่ละช่วง — ลำดับต้องตรงกับสถานะจริงของโมดูลเจ้าของงาน */
export const SCENT_STEPS = ['draft', 'pending', 'acknowledged', 'answered', 'closed'];
export const DELIVERY_STEPS = ['linked', 'arriving', 'complete'];
export const JOB_STEPS = ['draft', 'planned', 'in_progress', 'done'];

/* ⚠️ สองอันนี้ **ดึงจาก TRACKS** ไม่ใช่พิมพ์ลิสต์ที่สอง — ขั้นของโมดูลภาษีประกาศไว้ที่
   lib/excise/workflow.js อยู่แล้ว เขียนซ้ำเมื่อไรมันเพี้ยนหากันตอนใครสักคนเพิ่มขั้น
   `rejected` ไม่นับเป็นจุด มันคือ *สุขภาพ* ของขั้นที่ยืนอยู่ (กฎเดียวกับ "เลยกำหนด"
   ของช่วงของเข้า) ⇒ ระบายจุดปัจจุบันเป็นแดง ไม่ใช่งอกจุดเพิ่ม */
export const REGISTRATION_STEPS = TRACKS.registration.stages.filter((s) => s.key !== 'rejected').map((s) => s.key);
export const FILING_STEPS = TRACKS.payment.stages.filter((s) => s.key !== 'rejected').map((s) => s.key);

const SHORT_REGISTRATION = { draft: 'ร่างทะเบียน', pending_legal: 'รอนิติกรรม', approved: 'ขึ้นทะเบียนแล้ว' };
const SHORT_FILING = {
  draft: 'เตรียมใบยื่น', pending: 'รอรับเงิน', received: 'รอยื่น',
  filing: 'กำลังยื่น', complete: 'ชำระแล้ว', delivered: 'ส่งเอกสารแล้ว',
};

/** สถานะทะเบียนจาก lib/excise/soFiling.js → จุดที่ยืนอยู่บนราง 3 จุด */
const REGISTRATION_AT = { none: 0, draft: 0, rejected: 0, pending: 1, approved: 2 };

const SHORT_SCENT = {
  draft: 'ร่าง', pending: 'รอรับเรื่อง', acknowledged: 'กำลังทำ', answered: 'ตอบแล้ว', closed: 'ปิดเรื่อง',
};
const DELIVERY_LABELS = { linked: 'ผูกรายการ', arriving: 'ของทยอยเข้า', complete: 'ครบทุกรายการ' };
const SHORT_JOB = {
  draft: 'ร่าง', planned: 'วางคิวแล้ว', in_progress: 'กำลังผลิต', done: 'ผลิตเสร็จ',
};

/** จุดถึงไหนแล้ว → รายการจุดพร้อมสถานะ done/live/late/todo */
function markSteps(keys, labels, activeIndex, { late = false } = {}) {
  return keys.map((key, index) => ({
    key,
    label: labels[key] || key,
    state: index < activeIndex ? 'done'
      : index === activeIndex ? (late ? 'late' : 'live')
        : 'todo',
  }));
}

function scentSegment(scent, orderId) {
  if (!scent?.hasDesignLines) return null; // ไม่เกี่ยวกับใบนี้ → หายทั้งช่วง
  const request = scent.existing;
  if (!request) {
    // ⭐ งานพัฒนากลิ่นเริ่มที่ SO ไม่ใช่ที่หน้าคำร้อง (มติผู้ใช้ 2026-08-08) — พาไปพร้อม
    // ใบที่เลือกไว้แล้ว และ `returnTo` กลับมาที่ใบเดิม ไม่ใช่โยนไปหน้าคิวรวม
    // ⚠️ ผูกกับ `scentBriefEntry.test.mjs` — สาม query นี้ต้องครบ ไม่งั้นฟอร์มเปิดมาเปล่า
    const back = `/sa/sales-orders/${orderId}`;
    return {
      key: 'scent',
      label: 'บรีฟกลิ่น',
      state: 'todo',
      connect: {
        message: scent.blocked || 'ยังไม่ได้เปิดคำร้องพัฒนากลิ่นสำหรับใบนี้',
        actionLabel: scent.blocked ? null : 'เปิดคำร้องพัฒนากลิ่น',
        href: scent.blocked || !orderId
          ? null
          : `/requests/new?kind=scent_dev&salesOrderId=${encodeURIComponent(orderId)}&returnTo=${encodeURIComponent(back)}`,
      },
      meta: scent.count != null ? `${scent.count} กลิ่น` : null,
    };
  }
  const index = Math.max(0, SCENT_STEPS.indexOf(request.status || 'pending'));
  const done = request.status === 'closed';
  return {
    key: 'scent',
    label: 'บรีฟกลิ่น',
    state: done ? 'done' : 'live',
    steps: markSteps(SCENT_STEPS, SHORT_SCENT, done ? SCENT_STEPS.length - 1 : index),
    statusLabel: REQUEST_STATUS_LABELS[request.status] || request.status,
    meta: scent.count != null ? `${scent.count} กลิ่น` : null,
    link: { label: request.docNo || 'เปิดคำร้อง', href: `/requests/${request.id}` },
  };
}

function deliverySegment(readiness, projectId, hasSupplyChain) {
  if (!hasSupplyChain) return null;
  if (!readiness || readiness.state === 'unknown') {
    return {
      key: 'delivery',
      label: 'ของเข้า',
      state: 'todo',
      connect: {
        message: 'ยังไม่ผูกรายการของเข้ากับใบนี้',
        actionLabel: 'ผูกที่ไทม์ไลน์โครงการ',
        href: projectId ? `/sa/projects/${projectId}?tab=timeline` : null,
      },
    };
  }
  // 🔴 "เลยกำหนด" ไม่ใช่ขั้นถัดจาก "รอของ" — เป็น *สุขภาพ* ของขั้นเดียวกัน
  //    จึงระบายจุดกลางเป็นแดง ไม่ใช่เพิ่มจุดที่สี่
  // มีรายการผูกแล้ว = จุดแรกผ่านไปแล้วเสมอ ⇒ ยังไม่ครบก็อยู่ที่จุดกลางทุกกรณี
  const complete = readiness.state === 'ready';
  const activeIndex = complete ? DELIVERY_STEPS.length - 1 : 1;
  return {
    key: 'delivery',
    label: 'ของเข้า',
    state: complete ? 'done' : readiness.state === 'blocked' ? 'late' : 'live',
    steps: markSteps(DELIVERY_STEPS, DELIVERY_LABELS, activeIndex, { late: readiness.state === 'blocked' }),
    statusLabel: readiness.label,
    meta: readiness.total ? `มาแล้ว ${readiness.arrived}/${readiness.total}` : null,
    link: projectId ? { label: 'จัดการที่โครงการ', href: `/sa/projects/${projectId}?tab=timeline` } : null,
  };
}

function productionSegment(plan, { approved, hasSupplyChain }) {
  if (!hasSupplyChain) return null;
  if (!plan || plan.state === 'none') {
    return {
      key: 'production',
      label: 'ผลิต',
      state: 'todo',
      connect: {
        // ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีงานผลิต" เป็นเรื่องปกติ ไม่ใช่สิ่งที่ต้องชวนให้กด
        // (ระบบกวาดร่างจาก SO ที่อนุมัติแล้วให้เอง — ดู isJobWaitingToSchedule)
        message: approved ? 'ยังไม่มีงานผลิตที่ผูกกับใบนี้' : 'งานผลิตจะเกิดหลังใบนี้อนุมัติ',
        actionLabel: approved ? 'เปิดคิวงานผลิต' : null,
        href: '/production/jobs',
      },
    };
  }
  const order = { draft: 0, planned: 1, running: 2, done: 3 };
  const index = order[plan.state] ?? 0;
  return {
    key: 'production',
    label: 'ผลิต',
    state: plan.state === 'done' ? 'done' : plan.state === 'draft' ? 'late' : 'live',
    steps: markSteps(JOB_STEPS, SHORT_JOB, index, { late: plan.state === 'draft' }),
    statusLabel: plan.label,
    meta: plan.jobs?.length ? `${plan.jobs.length} งานผลิต` : null,
    link: { label: 'เปิดคิวงานผลิต', href: '/production/jobs' },
  };
}

/* ── สรรพสามิต ────────────────────────────────────────────────────────────
   `excise` คือคำตอบของ GET /api/tax/orders/from-sales-order ตรง ๆ
   (loading · schemaReady · lines[] · filing · eligible · amountToCollect)

   ⚠️ **ไม่มีบรรทัดสรรพสามิต = หายทั้งสองช่วง** ไม่ใช่ขึ้นว่า "ไม่ต้องยื่น" —
   ใบขายของนอกพิกัดไม่ควรเห็นเรื่องภาษีเลย (กฎเดียวกับช่วงบรีฟกลิ่น) */

/** รหัส FG ของกลุ่มหนึ่ง — คนอ่านต้องรู้ว่า *ตัวไหน* ไม่ใช่แค่ว่ามีกี่ตัว
    ⚠️ trim ด้วย — รหัส FG ในฐานข้อมูลจริงมีแท็บท้ายรหัสอยู่หลายแถว */
function fgCodes(lines) {
  return lines.map((line) => String(line.fgCode || '').trim()).filter(Boolean);
}

const FG_LIST_LIMIT = 6;

/* รายการ FG ที่ค้าง — **แยกเป็นกลุ่มตามสาเหตุ ไม่ใช่ข้อความก้อนเดียว**
   ใบจริงมี FG ปนกันหลายสถานะ (บางตัวไม่เคยเปิดทะเบียน บางตัวร่างค้าง)

   🪤 ของเดิมต่อเป็นสตริงเดียวโดยใช้ ` · ` คั่น **ทั้งระหว่างรหัสและระหว่างกลุ่ม** ⇒
   อ่านไม่ออกว่ากลุ่มจบตรงไหน ("+อีก 1 · ร่างทะเบียนค้าง" อ่านเหมือนเป็นรหัสถัดไป)
   ⇒ คืนเป็นโครงสร้างให้ตัวเรนเดอร์จัดบรรทัดเอง อย่ายุบกลับเป็นสตริง */
function registrationNotes(open) {
  const order = ['none', 'draft', 'rejected', 'pending'];
  return order
    .map((state) => ({ state, group: open.filter((line) => line.registrationState === state) }))
    .filter(({ group }) => group.length)
    .map(({ state, group }) => {
      const codes = fgCodes(group);
      return {
        state,
        label: REGISTRATION_SHORT_GAP[state],
        count: group.length,
        codes: codes.slice(0, FG_LIST_LIMIT),
        // ไม่ตัดเงียบ — ส่วนที่เกินต้องนับให้เห็น (ตัวเลขรวมอยู่ที่ `count` แล้ว)
        more: Math.max(0, codes.length - FG_LIST_LIMIT),
      };
    });
}

/* ⚠️ **คำสั้น** — ป้ายพวกนี้ลงในคอลัมน์ช่วงที่กว้าง ~311px ยาวกว่านี้แตกสามบรรทัด
   (กฎ "ป้ายที่ล้นคอลัมน์ให้ย่อคำ ไม่ใช่ขยายคอลัมน์") · ใช้ทั้งบนหัวเส้นและหัวกลุ่ม
   รายการ — ชุดเดียว ไม่เขียนสองชุดให้เพี้ยนหากัน */
const REGISTRATION_SHORT_GAP = {
  none: 'ยังไม่ขึ้นทะเบียน',
  draft: 'ร่างค้าง ยังไม่ยื่น',
  rejected: 'ทะเบียนถูกตีกลับ',
  pending: 'รอนิติกรรมตรวจ',
};

function registrationSegment(excise) {
  if (!excise || excise.loading || excise.schemaReady === false) return null;
  const lines = excise.lines || [];
  if (!lines.length) return null;

  const open = lines.filter((line) => line.registrationState !== 'approved');
  if (!open.length) {
    return {
      key: 'registration',
      label: 'ขึ้นทะเบียนสรรพสามิต',
      state: 'done',
      steps: markSteps(REGISTRATION_STEPS, SHORT_REGISTRATION, REGISTRATION_STEPS.length - 1),
      statusLabel: statusMeta('approved').label,
      meta: `${lines.length} FG ครบ`,
      link: { label: 'ดูทะเบียน', href: '/tax/registrations' },
    };
  }

  // จุดที่ยืนอยู่ = FG ที่ถอยหลังสุด — ช่วงจบเมื่อ **ทุกตัว** ผ่าน ไม่ใช่ตัวที่เร็วที่สุดผ่าน
  const activeIndex = Math.min(...open.map((line) => REGISTRATION_AT[line.registrationState] ?? 0));
  // 🔴 ยังไม่มีทะเบียนอนุมัติ = แดงเสมอ (มติผู้ใช้ 2026-08-17) — ยกเว้นที่ยื่นแล้ว
  // รอนิติกรรมตรวจ อันนั้นงานเดินอยู่ ไม่ใช่ของค้างที่ฝ่ายขาย
  const late = open.some((line) => line.registrationState !== 'pending');
  const worst = open.find((line) => line.registrationState !== 'pending') || open[0];
  const gap = REGISTRATION_SHORT_GAP[worst.registrationState] || REGISTRATION_SHORT_GAP.none;

  // ไม่เคยเปิดทะเบียนสักใบ = ยังไม่เชื่อม ⇒ กล่องชวนกด ไม่ใช่รางจุดที่ยังไม่เริ่ม
  if (open.every((line) => line.registrationState === 'none')) {
    return {
      key: 'registration',
      label: 'ขึ้นทะเบียนสรรพสามิต',
      state: 'late',
      connect: {
        message: 'ยังไม่ได้เปิดทะเบียนสรรพสามิตให้ FG ของใบนี้',
        actionLabel: 'เปิดทะเบียนสรรพสามิต',
        href: '/tax/registrations',
      },
      // รายการรหัสอยู่ในรูปเดียวกับกรณีมีราง — ไม่ยัดเข้าไปในประโยคชวนกด
      notes: registrationNotes(open),
      meta: `ค้าง ${open.length}/${lines.length} FG`,
    };
  }

  return {
    key: 'registration',
    label: 'ขึ้นทะเบียนสรรพสามิต',
    state: late ? 'late' : 'live',
    steps: markSteps(REGISTRATION_STEPS, SHORT_REGISTRATION, activeIndex, { late }),
    statusLabel: gap,
    meta: `ค้าง ${open.length}/${lines.length} FG`,
    notes: registrationNotes(open),
    link: {
      label: 'ดูทะเบียน',
      href: open.length === 1 && open[0].registrationLinkId
        ? `/tax/registrations/${open[0].registrationLinkId}`
        : '/tax/registrations',
    },
  };
}

function filingSegment(excise, { approved }) {
  if (!excise || excise.loading || excise.schemaReady === false) return null;
  const lines = excise.lines || [];
  if (!lines.length && !excise.filing) return null;

  if (excise.filing) {
    const index = Math.max(0, FILING_STEPS.indexOf(excise.filing.status));
    const rejected = excise.filing.status === 'rejected';
    const done = excise.filing.status === FILING_STEPS.at(-1);
    return {
      key: 'filing',
      label: 'ยื่นชำระสรรพสามิต',
      state: done ? 'done' : rejected ? 'late' : 'live',
      steps: markSteps(FILING_STEPS, SHORT_FILING, index, { late: rejected }),
      statusLabel: statusMeta(excise.filing.status).label,
      // ยอดเรียกเก็บรวม VAT 7% แล้ว — คิดที่ resolveSoFiling ที่เดียว ห้ามคิดซ้ำตรงนี้
      meta: excise.amountToCollect ? `เรียกเก็บ ${fmtMoney(excise.amountToCollect)}` : null,
      link: { label: 'เปิดใบยื่น', href: `/tax/filings/${excise.filing.id}` },
    };
  }

  // ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีใบยื่น" เป็นเรื่องปกติ ไม่ใช่สิ่งที่ต้องชวนให้กด
  // (เหตุผลเดียวกับช่วงผลิต) — และ `eligible` ของ resolveSoFiling รวมเงื่อนไขนี้ไว้แล้ว
  if (!approved || !excise.eligible) {
    return {
      key: 'filing',
      label: 'ยื่นชำระสรรพสามิต',
      state: 'todo',
      connect: { message: approved ? 'ใบนี้ยังไม่มีรายการที่พร้อมสร้างใบยื่น' : 'สร้างใบยื่นได้หลังใบนี้อนุมัติ' },
      meta: `${lines.length} FG`,
    };
  }

  return {
    key: 'filing',
    label: 'ยื่นชำระสรรพสามิต',
    state: 'todo',
    connect: {
      message: `พร้อมสร้างใบยื่นจาก ${lines.length} รายการ`,
      actionLabel: excise.createLabel || 'สร้างใบยื่นชำระ',
      onClick: excise.onCreateFiling || null,
      disabled: !!excise.createDisabled,
      disabledReason: excise.createDisabledReason || null,
    },
    meta: excise.amountToCollect ? `เรียกเก็บ ${fmtMoney(excise.amountToCollect)}` : null,
  };
}

/**
 * รวมเป็นเส้นเดียว — คืน `{ segments, current }` หรือ `null` เมื่อไม่มีช่วงไหนเกี่ยวเลย
 * `current` = ช่วงที่ใบนี้ "ติดอยู่" ตอนนี้ (ช่วงแรกที่ยังไม่ done)
 *
 * `dealType` = ประเภทดีลแม่ (`dealTypeOf(order.deal)`) — ตัดสินว่าใบนี้มีสายผลิตไหม
 * ⚠️ ผู้เรียกต้อง normalize มาแล้ว · ค่าที่ไม่รู้จักถือว่า **ไม่มีสายผลิต** เพื่อไม่ให้
 * ประเภทใหม่ที่ยังไม่ได้นิยามสายงานไปโผล่ช่วงที่ไม่ใช่ของมันเงียบ ๆ
 */
export function salesOrderWorkTrack({
  scent, readiness, plan, excise, orderId, projectId, dealType, approved = false,
} = {}) {
  const hasSupplyChain = DEAL_TYPES_WITH_SUPPLY_CHAIN.includes(dealType);
  const segments = [
    scentSegment(scent, orderId),
    // ⭐ ขึ้นทะเบียนอยู่ **ก่อน** ของเข้า/ผลิต — ทะเบียนต้องอนุมัติก่อนผลิตและส่งของจริง
    registrationSegment(excise),
    deliverySegment(readiness, projectId, hasSupplyChain),
    productionSegment(plan, { approved, hasSupplyChain }),
    // ⭐ ยื่นชำระอยู่ท้ายสุดเสมอ — ยื่นหลังขายจริง
    filingSegment(excise, { approved }),
  ].filter(Boolean);

  if (!segments.length) return null;
  const current = segments.find((s) => s.state !== 'done') || segments[segments.length - 1];
  return { segments, current };
}
