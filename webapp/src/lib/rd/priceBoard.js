// ── หน้า "รอใส่ราคา" ของ RD — หนึ่งแถวคือหนึ่งรายการที่ลูกค้าคอนเฟิร์มแล้ว (ม-153 · มติผู้ใช้ 2026-10-01) ──
//
// ⭐ **ทำไมต้องมีหน้านี้** (ผู้ใช้: *"ขั้นแจ้งราคา F/FB อยากให้รวมตาราง … ให้ RD ได้เห็นว่าต้องไปใส่ราคาต่อ"*) —
// ขั้นราคาอยู่ที่ **แถว** ไม่ใช่ใบ (`rowStage` → `awaiting_price`) ⇒ RD ต้องเปิดใบทีละใบถึงจะเจอ · คิวคำร้อง
// เคยเรียกใบพวกนี้ว่า "รอ RD ทำต่อ" เหมือนใบที่ยังพัฒนาอยู่ (แก้คู่กันใน `queueBoard.js`)
//
// ⚠️ **ตัวกรองแถวคือด่านชุดเดียวกับ POST ใส่ราคา** — ใบต้องเปิดอยู่ (`REQUEST_OPEN_STATUSES`) + แถวผ่าน
// `canPriceRow` · ถ้าหน้านี้กว้างกว่าด่าน = แถวที่กดแล้ว 409 (ของจริง: ใบที่ยกเลิกไปแล้วยังมีแถวคอนเฟิร์มค้าง)
// ⚠️ **ป้ายตัวเลขบนเมนูนับด้วยตัวเดียวกัน** (`awaitingPriceCount`) — นับคนละตัวเมื่อไร ป้ายกับหน้าพูดไม่ตรงกัน
// ⚠️ ไฟล์นี้ไม่แตะ DB และไม่รู้ว่า "วันนี้" คือวันไหน — ผู้เรียกส่งวันไทยมา (กติกาเดียวกับ perfumerBoard)
import { canPriceRow } from '@/lib/requests/rowStage';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestedLabel } from '@/lib/requests/rowLabel';
import { currentPriceToUse } from '@/lib/master/priceSlots';

const DEPT = 'RD';

/** ใบ × แถวที่รอ RD ใส่ราคาอยู่จริง — ด่านเดียวกับ POST `/api/sa/requests/[id]/items/[itemId]/price` */
export function awaitingPriceItems(requests = []) {
  const out = [];
  for (const request of requests || []) {
    if (request?.dept !== DEPT || !REQUEST_OPEN_STATUSES.includes(request.status)) continue;
    for (const item of request.items || []) {
      if (canPriceRow(item)) out.push({ request, item });
    }
  }
  return out;
}

/** ป้ายตัวเลขของเมนู "รอใส่ราคา" — นับเป็น **รายการ** (หน่วยเดียวกับแถวของหน้า) ไม่ใช่ใบ */
export const awaitingPriceCount = (requests = []) => awaitingPriceItems(requests).length;

// ป้ายของรายการที่ขอมา — พัฒนาสูตรตัดหาง "→ รหัส" ของป้ายเก่า (ตัวเดียวกับหัวโมดัลใส่ราคาบนหน้าใบ)
const requestedText = (item) => (item?.lineKind === 'product_dev' ? requestedLabel(item?.label) : (item?.label || ''));

/**
 * แถวของตาราง — `pairs` จาก `awaitingPriceItems` · `live[i]` จาก `rowsSlotPricesLive` (ลำดับเดียวกัน)
 *
 * ⚠️ `live` ไม่มี (หรือแถวนั้นไม่มี) = ไม่รู้ช่อง/ราคาสด ⇒ ไม่มีปุ่ม "ใช้ราคานี้" · ปุ่ม "ใส่ราคา" บอกเหตุแทน
 */
export function priceBoardRows(pairs = [], live = []) {
  return (pairs || []).map(({ request, item }, i) => {
    const ctx = live?.[i] || null;
    const slots = ctx?.slots || [];
    const current = ctx?.current || [];
    // ของในทะเบียนที่แถวนี้ผูก — สูตร (ถ้ามี) ไม่งั้นกลิ่นของช่อง F (แถวกลิ่นล้วน)
    const scentSource = current.find((c) => c.key === 'F')?.source || null;
    let registry = null;
    if (ctx?.formula) {
      registry = { kind: 'formula', id: ctx.formula.id, code: ctx.formula.code || null, name: ctx.formula.name || null, categoryCode: ctx.formula.categoryCode || null };
    } else if (scentSource?.name || scentSource?.code) {
      registry = { kind: 'scent', id: scentSource.id, code: scentSource.code, name: scentSource.name, categoryCode: null };
    }
    const { entry, blocker } = currentPriceToUse(current);
    return {
      itemId: item.id,
      requestId: request.id,
      docNo: request.docNo || null,
      title: request.title || null,
      customerName: request.customerName || null,
      customerArCode: request.customerArCode || null,
      requestedByName: request.requestedByName || null,
      label: requestedText(item),
      // ชื่อที่โชว์เป็นบรรทัดหลัก = ของในทะเบียน (รหัส + ชื่อ) · ยังไม่ผูก = ป้ายที่ขอมา — หัวโมดัล/กล่องยืนยันใช้ตัวเดียวกัน
      name: [registry?.code, registry?.name].filter(Boolean).join(' ') || requestedText(item),
      lineKind: item.lineKind || null,
      sortOrder: item.sortOrder ?? 0,
      // วันที่ลูกค้าตอบ — คนกรอกเอง ย้อนหลังได้ (ไม่ใช่วันที่ RD รู้เรื่อง) ⇒ ป้ายบนจอเขียนว่า "ลูกค้าคอนเฟิร์ม"
      confirmedAt: item.outcomeAt || null,
      confirmedQty: item.confirmedQty ?? null,
      unit: item.unit || null,
      registry,
      slots,
      current,
      // ⭐ "ใช้ราคานี้" — ตัวตัดสินเดียวกับ POST (`currentPriceToUse`) · entry null = ไม่มีราคาให้ใช้ (ไม่โชว์ปุ่ม)
      useCurrent: entry ? {
        key: entry.key,
        short: entry.short,
        text: entry.text,
        revisionId: entry.price.revisionId || null,
        revisionNo: entry.price.revisionNo ?? null,
        unitPrice: entry.price.unitPrice,
        validThrough: entry.price.validThrough || null,
        source: entry.source || null,
      } : null,
      useCurrentBlocker: blocker,
      // ไม่มีช่องให้ใส่ = แถวยังไม่ผูกกลิ่น/สูตร — ข้อความเดียวกับที่ `normalizeSlotPrices` ตีกลับ
      priceBlocker: slots.length ? '' : 'รายการนี้ยังไม่ผูกกลิ่นหรือสูตรในทะเบียน — ใส่ราคาไม่ได้',
    };
  });
}

/* รอมาแล้วกี่วัน นับจากวันที่ลูกค้าคอนเฟิร์มถึงวันไทยที่ผู้เรียกส่งมา · ไม่มีวัน = null (ไม่ใช่ 0) */
export function waitingDays(row, todayIso) {
  if (!row?.confirmedAt || !todayIso) return null;
  const a = Date.parse(`${String(row.confirmedAt).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(todayIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/* เรียงในใบ — คอนเฟิร์มก่อนขึ้นก่อน · ไม่มีวันไปท้าย · ปิดท้ายลำดับแถวในใบ + id ให้นิ่งทุกครั้งที่โหลด */
export function compareBoardRows(a, b) {
  const ad = a.confirmedAt || '', bd = b.confirmedAt || '';
  if (!ad !== !bd) return ad ? -1 : 1;
  if (ad !== bd) return ad < bd ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return String(a.itemId).localeCompare(String(b.itemId));
}

/**
 * จัดกลุ่มตามใบคำร้อง — ใบที่รอนานสุดขึ้นก่อน (มติผู้ใช้: "กลุ่มตามใบคำร้อง")
 * · ใบหนึ่งใส่ครบทุกแถว = ฝั่ง RD ปิดใบเอง ⇒ ต้องเห็นว่าเหลือกี่รายการในใบเดียวกัน
 */
export function priceBoardGroups(rows = [], { todayIso = null } = {}) {
  const map = new Map();
  for (const row of rows) {
    const group = map.get(row.requestId) || {
      key: row.requestId,
      requestId: row.requestId,
      docNo: row.docNo,
      title: row.title,
      customerName: row.customerName,
      customerArCode: row.customerArCode,
      rows: [],
    };
    group.rows.push(row);
    map.set(row.requestId, group);
  }
  const groups = [...map.values()].map((g) => {
    const sorted = [...g.rows].sort(compareBoardRows);
    const days = sorted.map((r) => waitingDays(r, todayIso)).filter((d) => d != null);
    return {
      ...g,
      rows: sorted,
      total: sorted.length,
      oldestAt: sorted[0]?.confirmedAt || null,
      maxDays: days.length ? Math.max(...days) : null,
    };
  });
  return groups.sort((a, b) => {
    const ad = a.oldestAt || '', bd = b.oldestAt || '';
    if (!ad !== !bd) return ad ? -1 : 1;
    if (ad !== bd) return ad < bd ? -1 : 1;
    return String(a.docNo || a.requestId).localeCompare(String(b.docNo || b.requestId));
  });
}

/** ยอดเหนือตาราง — นับเป็นรายการทุกช่องยกเว้นช่อง "ใบคำร้อง" (บอกหน่วยบนป้ายเสมอ) */
export function priceBoardTotals(rows = [], { todayIso = null } = {}) {
  const days = rows.map((r) => waitingDays(r, todayIso)).filter((d) => d != null);
  return {
    rows: rows.length,
    requests: new Set(rows.map((r) => r.requestId)).size,
    maxDays: days.length ? Math.max(...days) : null,
    usable: rows.filter((r) => r.useCurrent && !r.useCurrentBlocker).length,
  };
}
