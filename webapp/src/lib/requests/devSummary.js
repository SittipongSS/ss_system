// ── การ์ด "สรุปใบนี้" ของพัฒนากลิ่น / พัฒนาสูตร (ม-165 · มติเจ้าของ 18/11/2026) — logic ล้วน ไม่แตะ DB ─────
//
// ⭐ **ข้อมูลที่สำคัญเท่านั้น** (เจ้าของ): SO · จำนวนจาก SO · direction ยืนยัน · ขอแก้ · ไม่เอา — **หนึ่งรายการต่อหนึ่งบรรทัด**
// ⭐ **ตัวเลขนำ = ยืนยัน x / y ตัวเดียวกับด่านปิดใบ** (`soReconcile` + `scentSlotLinesOf` — ชุดเดียวกับ `closeRequestError`)
//   🐞 ที่มา: การ์ดเดิมขึ้น "8/8 ลูกค้าตอบแล้ว" สีเขียว (นับแถวที่มีคำตอบ รวมไม่เอา/ขอแก้) ขณะที่ด่านบอก 2 จาก 3 ขาด 1 (RQ-SB-26090014)
// ⭐ พัฒนาสูตร = ทรงเดียวกัน **ไม่มีก้อน SO** (prod 18/11: 0 จาก 56 ใบผูก SO) ⇒ ตัวเลขนำไม่มีตัวหาร
// ⚠️ **ทับมติ 2026-08-25 "การ์ดทรงเดียวทุกหัวข้อ" เฉพาะสองสายนี้** — หัวข้ออื่นยังใช้ `panelSummary.js`
// ⚠️ นับที่นี่ที่เดียว ห้ามประกอบใน JSX (กฎหลังบั๊กรางซ้ำ #1033)
// ⚠️ แถวรอบแก้ข้อมูลเก่าที่ไม่มี `derivedFromItemId` ไม่ถูกเดาจากรหัส PF — เดาผิด = ผูกผิดเงียบ ๆ (แผน "ข้อที่ตัดสินเอง")
import { productDevLabel } from '@/lib/requests/rowLabel';
import { nextByStageFor, rowStage } from '@/lib/requests/rowStage';
import { requestWaitLabel } from '@/lib/requests/replyTurn';
import { salesOrderQty, soReconcile, soReconcileTone } from '@/lib/requests/soReconcile';
import { scentSlotLinesOf } from '@/lib/requests/scentOrderLinks';
import { attachAdds } from '@/lib/requests/scentOrderAttach';
import { scentDesignLines } from '@/lib/requests/scentDesignOrders';

const LINE_KIND = { scent_dev: 'scent_dev', formula_dev: 'product_dev' };
const UNIT = { scent_dev: 'กลิ่น', formula_dev: 'สูตร' };
const DAY = 24 * 60 * 60 * 1000;

const daysSince = (stamp, today) => {
  const a = Date.parse(String(stamp || '').slice(0, 10));
  const b = Date.parse(String(today || '').slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / DAY)) : null;
};

/** ชื่อที่การ์ดโชว์ — ค่าสดจากทะเบียนก่อน (ตัวเดียวกับตาราง) · ยังไม่ผูกทะเบียน = ป้ายของแถว */
function rowName(item, kind) {
  if (kind === 'formula_dev') {
    // ม-166 — แถวหัวน้ำหอมที่ส่งเป็นกลิ่น: ของที่ได้คือกลิ่นลูก (`refProducedScent`) คู่ของสูตร
    return item.refFormula?.name || item.refProducedScent?.name
      || productDevLabel(item.label, item.refScent, item.categoryCode);
  }
  return item.refScent?.name || item.label || '—';
}

function rowCode(item, kind) {
  const ref = kind === 'formula_dev' ? item.refFormula || item.refProducedScent : item.refScent;
  const code = String(ref?.code ?? '').trim();
  return code && code !== '-' ? code : null;
}

/**
 * ชื่อสั้นของรอบแก้ใต้ตัวแม่ — "ALMOST HERE #1" ใต้ "ALMOST HERE" = "#1" · "WHITE TEA 02 #1.1" ใต้ "WHITE TEA 02 #1" = "#1.1"
 * ⚠️ ตัดได้เฉพาะเมื่อชื่อลูกขึ้นต้นด้วยชื่อฐานของแม่ แล้วตามด้วย "#" — นอกนั้นใช้ชื่อเต็ม (ไม่เดา)
 */
export function childShortName(parentName, childName) {
  const parent = String(parentName || '').trim();
  const child = String(childName || '').trim();
  const base = parent.replace(/\s*#.*$/, '').trim();
  if (!base || !child.startsWith(base)) return child;
  const rest = child.slice(base.length).trim();
  return rest.startsWith('#') ? rest : child;
}

/** ใบสั่งขายที่ใบนี้นับ — หนึ่งใบต่อบรรทัด (SO หลัก + SO แนบ · ม-164) · ไม่มี SO = [] */
function ordersOf(request) {
  const out = [];
  const mainNo = request?.countedSalesOrder?.orderNumber || request?.refSalesOrder?.orderNumber || null;
  if (mainNo || request?.salesOrderId) {
    const mainSlots = request?.scentSlots?.mainSlots ?? salesOrderQty(scentDesignLines(request?.salesOrderLines || []));
    out.push({
      id: request?.countedSalesOrder?.id || request?.refSalesOrder?.id || request?.salesOrderId,
      orderNumber: mainNo || request?.salesOrderId,
      role: 'main',
      attachedAt: null,
      slots: mainSlots,
      revisions: 0,
    });
  }
  for (const order of request?.attachedOrders || []) {
    const adds = attachAdds(order?.lines || []);
    out.push({
      id: order.countedOrderId || order.salesOrderId,
      orderNumber: order.countedOrderNumber || order.orderNumber || order.salesOrderId,
      role: 'attached',
      attachedAt: order.createdAt || null,
      slots: adds.slots,
      revisions: adds.revisions,
    });
  }
  return out;
}

/** ข้อความท้ายตัวเลขนำ — ภาษาเดียวกับด่านปิด (ขาด · ครบ · แถม · เกินที่ยังไม่ระบุ) */
function leadNote(reconcile) {
  if (!reconcile) return null;
  if (reconcile.state === 'pending') return 'ยังไม่มีที่ยืนยัน';
  if (reconcile.state === 'match') return 'ครบ';
  if (reconcile.state === 'short') return `ขาด ${-reconcile.diff}`;
  const parts = [];
  if (reconcile.freebies) parts.push(`แถม ${reconcile.freebies}`);
  if (reconcile.unexplained) parts.push(`เกิน ${reconcile.unexplained} ยังไม่ระบุ`);
  return parts.join(' · ') || `เกิน ${reconcile.diff}`;
}

/** ขั้นของแถวที่ยืนยันแล้ว — "เสร็จแล้ว" · "รอ RD ใส่ราคา" · "รอ RD ใส่ Ingredient List" (คำเดียวกับปุ่มของแถว) */
function confirmedStageText(request, item) {
  const stage = rowStage(item);
  if (stage === 'done') return 'เสร็จแล้ว';
  const next = nextByStageFor(item)[stage];
  if (!next) return null;
  return requestWaitLabel(request, next.owner, next.label);
}

/**
 * ก้อนข้อมูลของการ์ด — คืน null เมื่อใบไม่ใช่สองสายนี้
 *
 * @param request ใบจาก `findRequest` (items · briefs · salesOrderLines · scentSlotLines · attachedOrders · scentSlots)
 * @param kind    'scent_dev' | 'formula_dev'
 * @param today   วันไทย YYYY-MM-DD (`businessDate`) — ใช้นับ "ส่งไป n วัน" ของแถวที่รอลูกค้าตอบ
 */
export function devRequestSummary(request, kind, { today = null } = {}) {
  const lineKind = LINE_KIND[kind];
  if (!lineKind) return null;
  const all = request?.items || [];
  const items = all.filter((row) => row?.lineKind === lineKind);
  const unit = UNIT[kind];
  const named = (item) => ({ id: item.id, name: rowName(item, kind), code: rowCode(item, kind) });

  // ── ใบสั่งขาย + ตัวเลขนำ (ด่านปิดตัวเดียวกัน) ─────────────────────────────
  const orders = kind === 'scent_dev' ? ordersOf(request) : [];
  const reconcile = kind === 'scent_dev' ? soReconcile({ lines: scentSlotLinesOf(request), items }) : null;
  const paid = kind === 'scent_dev' && orders.length ? salesOrderQty(scentSlotLinesOf(request)) : null;

  const confirmedRows = items.filter((row) => row.outcome === 'confirmed');
  const confirmed = {
    count: confirmedRows.length,
    total: paid,
    note: paid != null ? leadNote(reconcile || { state: 'pending' }) : null,
    // ขาด/เกินที่ยังไม่ระบุ = เตือน · ครบ/เกินที่แถมรองรับครบ = เขียว · ยังไม่มีอะไรให้เทียบ = กลาง
    tone: paid != null && reconcile && reconcile.state !== 'pending' ? soReconcileTone(reconcile) : 'neutral',
    rows: confirmedRows.map((item) => ({
      ...named(item),
      stageText: confirmedStageText(request, item),
      freebie: !!item.freebieReason,
    })),
  };

  // ── ขอแก้ — หนึ่งต้นทางต่อบรรทัด + รอบแก้ที่แตกออก (ต้นไม้จาก `derivedFromItemId` เท่านั้น) ──
  const childrenOf = (id) => items.filter((row) => row.derivedFromItemId === id);
  const reviseRows = items.filter((row) => row.outcome === 'revise');
  const inRevision = new Set(items.filter((row) => row.derivedFromItemId).map((row) => row.id));
  const usedRevisions = inRevision.size;
  const paidRevisions = kind === 'scent_dev' ? orders.reduce((sum, o) => sum + (o.revisions || 0), 0) : null;
  const revise = {
    count: reviseRows.length,
    rows: reviseRows.map((item) => {
      const parent = named(item);
      return {
        ...parent,
        children: childrenOf(item.id).map((child) => {
          const c = named(child);
          return { ...c, short: childShortName(parent.name, c.name) };
        }),
      };
    }),
    // ⭐ ตัวนับรอบแก้โชว์เสมอ (ม-164 มติ 3: ไม่จำกัด แต่ต้องเห็นตัวนับ) · สูตรไม่มี SO ⇒ ไม่มี "ซื้อ"
    used: usedRevisions,
    paid: paidRevisions,
  };

  // ── ไม่เอา — หนึ่งตัวต่อบรรทัด · แถวที่มาจากรอบแก้มีป้าย ──────────────────────
  const rejectedRows = items.filter((row) => rowStage(row) === 'declined');
  const rejected = {
    count: rejectedRows.length,
    rows: rejectedRows.map((item) => ({ ...named(item), fromRevision: inRevision.has(item.id) })),
  };

  // ── ยังไม่มีคำตอบ — รอลูกค้าตอบ (ส่งแล้ว) แยกจากงานที่ยังอยู่ในมือฝ่าย/ผู้ขอ ──────────
  const open = items.filter((row) => !row.outcome && rowStage(row) !== 'declined' && rowStage(row) !== 'done');
  const waitingCustomer = open.filter((row) => rowStage(row) === 'sent').map((item) => ({
    ...named(item),
    sentDays: daysSince(item.sentAt, today),
  }));
  const working = open.filter((row) => rowStage(row) !== 'sent').map((item) => {
    const stage = rowStage(item);
    const next = nextByStageFor(item)[stage];
    return { ...named(item), stageText: next ? requestWaitLabel(request, next.owner, next.label) : null };
  });
  /* ⭐ บรีฟที่ยังไม่มี direction เลย (พัฒนากลิ่น) = งานที่ RD ยังไม่ลงมือ — แทนเช็คลิสต์ "ทุกบรีฟมี direction" เดิม
     ซึ่งค้างบนการ์ดหลังส่งใบ · เป็นรายการหนึ่งบรีฟต่อบรรทัดแทน */
  if (kind === 'scent_dev') {
    const touched = new Set(items.map((row) => row.briefId).filter(Boolean));
    for (const brief of request?.briefs || []) {
      if (touched.has(brief.id)) continue;
      working.push({
        id: `brief:${brief.id}`,
        name: brief.label || 'บรีฟไม่มีชื่อ',
        code: null,
        stageText: request?.status === 'draft' ? 'ยังไม่ได้ส่ง' : requestWaitLabel(request, 'dept', 'ส่งงาน'),
        brief: true,
      });
    }
  }

  return {
    kind,
    unit,
    orders,
    paid,
    confirmed,
    revise,
    rejected,
    waitingCustomer,
    working,
  };
}
