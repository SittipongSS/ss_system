// ── ตัวเลือกงวดของคำร้องขอเอกสารการเงิน (ขอเอกสารจากหน้า QT · PR-2 · มติเจ้าของ 28/10/2026) ──────────────────────
//
// ⭐ สองแหล่ง ตัดสินที่นี่ที่เดียว (ฟอร์มคำร้อง · หน้า QT · API ใช้ตัวเดียวกัน):
//   · ใบเสนอราคามีใบสั่งขายที่ **มีแถวงวดแล้ว** ⇒ ตัวเลือก = แถวงวดจริง (`installmentId`) — เลขในแผน QT ไม่ใช่เลขของงวดอีกต่อไป
//     หลังปรับแผน (0377) / ยกเงินเข้า (0378) ⇒ ผูกด้วย id เสมอ
//   · ยังไม่มีแถวงวด (ไม่มี SO หรือ SO ร่างที่ยังไม่เริ่มติดตาม) ⇒ ตัวเลือก = แถวในแผนของ QT (`installmentSeq`) —
//     `ensureInstallments` ผูกให้ตอนสร้างแถวงวด (mig 0413 · installmentRequestsStore.claimPendingRequests)
// ⭐ "ไม่ระบุงวด" เลือกได้เสมอ (มติข้อ 1) — ไม่ใช่ตัวเลือกในรายการนี้ ผู้เรียกวางไทล์ของมันเอง
// ⭐ งวดเดียวมีได้หลายคำร้อง (มติข้อ 3) ⇒ งวดที่มีคำร้องแล้วยังเลือกได้ · แถวพกคำร้องที่มีอยู่ไว้ให้จอบอก
// ⚠️ ฟังก์ชันล้วน — ไม่แตะฐาน (ตัวโหลดอยู่ที่ route `/api/sa/requests/billing-installments`)
import {
  installmentRefunded, installmentVoid, installmentsFromPaymentPlan,
} from '@/lib/sales/salesOrderPayments';
import { OPENING_INSTALLMENT_LABEL, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import { installmentRequests } from '@/lib/sales/installmentRequests';

const text = (value) => String(value ?? '').trim();
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const requestBrief = (request) => ({ id: request.id, docNo: request.docNo || '', status: request.status || '' });

/* เหตุที่งวดจริงเลือกไม่ได้ — ด่านเดียวกับตัวผูกตอนเปิดใบ (billingInstallmentLink: งวดยกมา · คืนเงินแล้ว) + งวดโมฆะของใบที่ตาย */
function orderRowBlock(row, order) {
  if (isOpeningInstallment(row)) return `${OPENING_INSTALLMENT_LABEL}เป็นเงินที่เก็บก่อนเข้าระบบ`;
  if (installmentRefunded(row)) return 'งวดนี้บัญชีบันทึกคืนเงินแล้ว';
  if (installmentVoid(row, order)) return 'งวดโมฆะ — ใบสั่งขายไม่ต้องตามเก็บแล้ว';
  return '';
}

/**
 * ตัวเลือกงวดของใบเสนอราคาหนึ่งใบ
 *
 * @param quotation    `{ id, paymentPlan, totalAmount }`
 * @param order        ใบสั่งขายของใบเสนอราคานี้ (`{ id, orderNumber, status }`) · ไม่มี = null
 * @param installments แถวงวดจริงของใบสั่งขาย (`select('*')`) · ไม่มี = []
 * @param requests     คำร้อง billing_doc ที่เกี่ยวข้อง (ของ QT นี้ + ที่ผูกงวดของใบ) — ต้องมี `installmentId`/`installmentSeq`
 * @returns `{ source: 'order' | 'plan' | 'none', orderId, orderNumber, rows, unassigned }`
 *   แถว: `{ key, seq, label, percent, amount, installmentId, status, blocked, requests: [{ id, docNo, status }] }`
 *   · `unassigned` = คำร้องของใบเสนอราคาที่ "ไม่ระบุงวด" (ไม่อยู่ในแถวไหนเลย) — หน้า QT โชว์แยกให้เห็นครบ
 *   · `key` = ตัวตนของไทล์ (`id:<installmentId>` | `seq:<n>`) · `blocked` = เหตุที่เลือกไม่ได้ ('' = เลือกได้)
 */
export function billingInstallmentChoices({ quotation, order = null, installments = [], requests = [] } = {}) {
  const rows = (Array.isArray(installments) ? installments : []).filter((row) => row?.id);
  const list = Array.isArray(requests) ? requests : [];
  const choices = choicesOf({ quotation, order, rows, list });
  const placed = new Set(choices.rows.flatMap((row) => row.requests.map((r) => r.id)));
  return { ...choices, unassigned: list.filter((request) => request?.id && !placed.has(request.id)).map(requestBrief) };
}

function choicesOf({ quotation, order, rows, list }) {
  if (order?.id && rows.length) {
    return {
      source: 'order',
      orderId: order.id,
      orderNumber: order.orderNumber || '',
      rows: [...rows].sort((a, b) => Number(a.seq) - Number(b.seq)).map((row) => ({
        key: `id:${row.id}`,
        seq: Number(row.seq) || null,
        label: text(row.label) || `งวดที่ ${row.seq}`,
        percent: Number(row.percent) || 0,
        amount: money(row.amount),
        installmentId: row.id,
        status: row.status || 'pending',
        blocked: orderRowBlock(row, order),
        requests: installmentRequests(row, list).map(requestBrief),
      })),
    };
  }
  const plan = quotation ? installmentsFromPaymentPlan(quotation.paymentPlan, quotation.totalAmount) : [];
  if (!plan.length) return { source: 'none', orderId: order?.id || null, orderNumber: order?.orderNumber || '', rows: [] };
  return {
    source: 'plan',
    orderId: order?.id || null,
    orderNumber: order?.orderNumber || '',
    rows: plan.map((row) => ({
      key: `seq:${row.seq}`,
      seq: row.seq,
      label: row.label,
      percent: row.percent,
      amount: money(row.amount),
      installmentId: null,
      status: null,
      blocked: '',
      // คำร้องที่เลือกเลขนี้ไว้และยังรอแถวงวด (ยังไม่มี installmentId)
      requests: list
        .filter((request) => !text(request.installmentId) && Number(request.installmentSeq) === row.seq)
        .map(requestBrief),
    })),
  };
}

/** ไทล์ที่เลือก → ช่องของ POST เปิดคำร้อง (`linkInstallmentId` = งวดจริง · `installmentSeq` = แผน QT) · ไม่ระบุ/หาไม่เจอ = {} */
export function installmentChoicePayload(choices, key) {
  const row = (choices?.rows || []).find((r) => r.key === key && !r.blocked);
  if (!row) return {};
  return row.installmentId ? { linkInstallmentId: row.installmentId } : { installmentSeq: row.seq };
}

/** หาไทล์จากค่าที่มากับลิงก์ (`installmentId` ของงวดจริง หรือ `installmentSeq` ของแผน) — ไม่พบ = '' (ไม่ระบุงวด) */
export function installmentChoiceKey(choices, { installmentId = '', installmentSeq = '' } = {}) {
  const rows = choices?.rows || [];
  const id = text(installmentId);
  if (id) return rows.find((r) => r.installmentId === id)?.key || '';
  const seq = Number(installmentSeq);
  if (Number.isInteger(seq) && seq > 0) return rows.find((r) => !r.installmentId && r.seq === seq)?.key || '';
  return '';
}
