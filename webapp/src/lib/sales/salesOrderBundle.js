// ── ชุดเอกสารใบสั่งขาย QT · SO · การชำระ → ZIP (มติเจ้าของ 27/10/2569) ──────────────────
//
// ติ๊กหลายใบบนทะเบียนใบสั่งขาย แล้วโหลดเป็น ZIP ไฟล์เดียว — **โฟลเดอร์ละหนึ่งใบสั่งขาย** ข้างในเป็นไฟล์แยก:
//   01 ใบเสนอราคา QT-….pdf            ← quotations/[id]/issued/pdf (ฉบับที่อนุมัติ)
//   02 ใบสั่งขาย SO-….pdf             ← sales-orders/[id]/issued/pdf (ฉบับที่อนุมัติ)
//   03 งวดที่ 1 หลักฐานการชำระ.jpg     ← กลุ่ม "หลักฐานการชำระ" ของแท็บเอกสาร (ไฟล์ต้นฉบับ ไม่แปลง)
//   04 งวดที่ 1 ใบกำกับภาษี IV-….pdf
// ไฟล์ยืนยันคำสั่งซื้อ · สัญญา · แนบเพิ่ม **ไม่อยู่ในชุด** (เจ้าของไม่เลือก — ชุดนี้คือเอกสารขายกับเอกสารเงิน)
// ⭐ สองจุดกด: ทะเบียนใบสั่งขาย (แถว = ใบ · `quotation.quoteNumber`) และรายงานยอดขาย `/sa/targets/report`
//   (แถว = ใบ หรือ **งวดของใบ Actual รายงวด หลายแถวต่อใบ** · `quoteNumber` บนแถว) ⇒ ตัวนี้รับได้ทั้งสองทรง
//   และยุบแถวซ้ำเป็นใบเดียวเอง (`uniqueSalesOrders`) — ใบเดียวต้องได้โฟลเดอร์เดียว
//
// ⭐ **ห่อ ZIP ที่เบราว์เซอร์ ไม่ใช่ที่ server** — Vercel ตอบ body ได้ไม่เกิน 4.5 MB ต่อคำขอ ⇒ ZIP หลายใบที่มีสลิป
//   พังแน่ · ที่นี่ดึงทีละไฟล์ผ่าน proxy เดิมของแต่ละบ้าน (ด่านสิทธิ์/ด่าน path ชุดเดิม ไม่มีด่านที่สอง)
// ⭐ **ไฟล์ที่เอามาไม่ได้ไม่หายเงียบ** — ใส่ `ไฟล์ที่ขาด.txt` ที่รากของ ZIP บอกใบ · ไฟล์ · เหตุ แยกสองหมวด:
//   ดึงไม่ได้ (`failed` — PDF สร้างไม่สำเร็จ · ไม่มีสิทธิ์ · อ่านรายการไม่ได้) กับ ยังไม่มีในระบบ (`absent` — งวดที่ยังไม่จ่าย
//   ไม่มีสลิป · งวดที่จ่ายแล้วแต่บัญชียังไม่แนบใบกำกับ · ใบย้อนหลังไม่มีใบเสนอราคา) — ZIP ที่ขาดไฟล์โดยไม่บอกอ่านเหมือน "ใบนี้มีแค่นี้"
//   (🐞 27/10 เจ้าของถาม "ไฟล์หลักฐานการชำระแต่ละงวดไม่มีหรอ" — งวด 2 ยังไม่จ่าย แต่ ZIP ไม่บอก)
// ⚠️ ไฟล์นี้ไม่แตะ DB/เครือข่ายเอง — ตัวโหลดส่งเข้ามา (`loadDocuments` · `fetchFile` · `JSZip`) ⇒ เทสต์ได้โดยไม่ต่ออะไร

import { SALES_ORDER_STATUS_LABELS } from '@/lib/sales/salesOrderWorkflow';

export const SALES_ORDER_BUNDLE_MAX = 50;
export const BUNDLE_MISSING_FILE = 'ไฟล์ที่ขาด.txt';

const enc = encodeURIComponent;

// ชื่อไฟล์/โฟลเดอร์ที่ทุกระบบเปิดได้ — ตัวต้องห้ามของ Windows/macOS เป็น _ (ทรงเดียวกับ ZIP ของ /tax)
export function bundleSafeName(value, fallback = 'item') {
  return String(value || '').replace(/[\\/:*?"<>|\n\r\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || fallback;
}

const MIME_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/gif': '.gif',
};

/* นามสกุลจากชื่อไฟล์ต้นฉบับก่อน (ที่คนอัปตั้งมา) · ไม่มี = เดาจากชนิดที่ proxy ตอบ · เดาไม่ได้ = ไม่มีนามสกุล */
export function bundleExtension(fileName, mime) {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(fileName || '').trim());
  if (match) return `.${match[1].toLowerCase()}`;
  return MIME_EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || '';
}

export function bundleFolderName(order) {
  return bundleSafeName([order?.orderNumber, order?.customerName].filter(Boolean).join(' '), order?.id || 'SO');
}

const pad = (n) => String(n).padStart(2, '0');

/* PDF ใบสั่งขายฉบับที่ออกจริงมีเฉพาะใบที่ **อนุมัติอยู่** (เส้น issued/pdf ตอบ 404 ยังไม่เคยออก · 409 เปลี่ยนสถานะหลังอนุมัติ)
   ⇒ รู้จากสถานะของแถวได้ตั้งแต่ก่อนดึง = รายการ "ยังไม่มีในระบบ" ไม่ใช่ "ดึงไม่ได้" (🐞 27/10 ใบรออนุมัติขึ้นกล่องเตือน
   "ลองโหลดใหม่" ทั้งที่ลองกี่ครั้งก็ไม่ได้) · แถวที่ไม่บอกสถานะ (เช่นแถวรายงานซึ่งเป็นใบอนุมัติแล้วทั้งหมด) = ดึงตามปกติ */
export function salesOrderPdfAbsentReason(status) {
  if (!status || status === 'approved') return null;
  const label = SALES_ORDER_STATUS_LABELS[status] || status;
  if (status === 'cancelled') return `ใบถูกยกเลิก — ไม่มี PDF ฉบับที่ใช้แทนเอกสารที่ยังมีผล (สถานะใบ: ${label})`;
  if (status === 'revised') return `ใบนี้ออกฉบับแก้ไขแล้ว — ใช้ใบ Rev. ล่าสุดแทน (สถานะใบ: ${label})`;
  if (status === 'approval_revoked') return `ใบถูกย้อนการอนุมัติ — ยังไม่มีฉบับที่ออกจริงที่ใช้ได้ (สถานะใบ: ${label})`;
  return `ใบยังไม่อนุมัติ — ยังไม่มีฉบับที่ออกจริง (สถานะใบ: ${label})`;
}

/* ที่ติ๊กไว้หลังรายการขยับ — **ตัดเฉพาะใบที่หลุดจากรายการ** ไม่ล้างทั้งชุด · ไม่มีอะไรหลุด = คืนชุดเดิม (ตัวเดิม ไม่เรนเดอร์ซ้ำ)
   🐞 รุ่นแรกล้างทุกครั้งที่ `filtered` เปลี่ยนตัว — รายงานยอดขายโหลดใหม่ตอนกลับมาที่แท็บ (useRevalidateOnFocus) ⇒ ติ๊ก 10 ใบ
      สลับไปดูอย่างอื่นแล้วกลับมา ที่ติ๊กหายหมดทั้งที่ใบชุดเดิมยังอยู่ครบ · กติกาที่ต้องคงไว้คือ "ไม่โหลดใบที่มองไม่เห็น" เท่านั้น */
export function keepVisibleSelection(selected, visibleIds = []) {
  const visible = new Set(visibleIds);
  const kept = [...selected].filter((id) => visible.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
}

/* ยุบแถวที่เป็นใบเดียวกัน (id ซ้ำ) — คงลำดับของแถวแรกที่เจอ */
export function uniqueSalesOrders(rows = []) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * แผนไฟล์ของใบเดียว — คืน `{ folder, items }` · item = `{ stem, sourceName, href, label, reason }`
 * `href: null` = รู้ตั้งแต่ก่อนดึงว่าไม่มี (`reason` บอกเหตุ) · `stem` ยังไม่มีนามสกุล (รู้หลังดึงไฟล์)
 * `documents` = ผลของ GET sales-orders/[id]/documents · `null` + `documentsError` = อ่านไม่สำเร็จ
 */
export function planSalesOrderBundle(order, documents, { documentsError = null } = {}) {
  const items = [];
  const quoteNumber = order?.quotation?.quoteNumber || order?.quoteNumber || null;
  items.push(order?.quotationId
    ? {
      stem: `${pad(1)} ${bundleSafeName(`ใบเสนอราคา ${quoteNumber || ''}`.trim())}`,
      sourceName: 'quotation.pdf',
      href: `/api/sales-planning/quotations/${enc(order.quotationId)}/issued/pdf`,
      label: `ใบเสนอราคา ${quoteNumber || ''}`.trim(),
    }
    : { stem: null, href: null, absent: true, label: 'ใบเสนอราคา', reason: 'ใบนี้ไม่ได้สร้างจากใบเสนอราคาในระบบ (ใบย้อนหลัง)' });
  const orderPdfAbsent = salesOrderPdfAbsentReason(order?.status);
  items.push(orderPdfAbsent
    ? { stem: null, href: null, absent: true, label: `ใบสั่งขาย ${order?.orderNumber || ''}`.trim(), reason: orderPdfAbsent }
    : {
      stem: `${pad(2)} ${bundleSafeName(`ใบสั่งขาย ${order?.orderNumber || ''}`.trim())}`,
      sourceName: 'sales-order.pdf',
      href: `/api/sales-planning/sales-orders/${enc(order?.id)}/issued/pdf`,
      label: `ใบสั่งขาย ${order?.orderNumber || ''}`.trim(),
    });

  if (documentsError || !documents) {
    items.push({ stem: null, href: null, label: 'หลักฐานการชำระ · ใบกำกับภาษี', reason: documentsError || 'อ่านรายการเอกสารของใบไม่สำเร็จ' });
    return { folder: bundleFolderName(order), items };
  }

  const rows = (documents.groups || []).find((g) => g.key === 'payment')?.rows || [];
  /* หลักฐานหลายไฟล์ในงวดเดียว = ต่อท้าย (2) (3) — ไฟล์แรกไม่มีเลข เพราะงวดส่วนใหญ่มีสลิปใบเดียว */
  const evidenceCount = new Map();
  let n = 3;
  for (const row of rows) {
    const seqText = row.seq != null ? `งวดที่ ${row.seq}` : 'งวด';
    let name;
    if (row.kind === 'tax_invoice') {
      name = `${seqText} ใบกำกับภาษี${row.taxInvoiceNo ? ` ${row.taxInvoiceNo}` : ''}`;
    } else {
      const k = (evidenceCount.get(seqText) || 0) + 1;
      evidenceCount.set(seqText, k);
      name = `${seqText} หลักฐานการชำระ${k > 1 ? ` (${k})` : ''}`;
    }
    items.push({ stem: `${pad(n)} ${bundleSafeName(name)}`, sourceName: row.title, href: row.href, label: name });
    n += 1;
  }
  items.push(...absentInstallmentItems(documents.installments));
  return { folder: bundleFolderName(order), items };
}

/* งวดที่จ่ายแล้ว (มีเงินเข้า) = ถึงคิวใบกำกับ · งวดยังไม่จ่าย/ตีกลับ = ยังไม่ถึง (ไม่ฟ้องว่าขาดใบกำกับ) · คืนเงินแล้ว = ไม่ฟ้องอะไร */
const PAID_STATUSES = new Set(['confirmed', 'reported', 'prepaid']);

/* งวดที่ยังไม่มีไฟล์ — สรุปงวดจาก API (`installments` ของแท็บเอกสาร) · ไม่มีสรุป (API รุ่นเก่า) = ไม่บอก ไม่เดา */
function absentInstallmentItems(installments) {
  const items = [];
  for (const inst of installments || []) {
    if (inst.status === 'refunded') continue;
    const seqText = inst.seq != null ? `งวดที่ ${inst.seq}` : 'งวด';
    const state = inst.statusLabel ? `สถานะงวด: ${inst.statusLabel}` : null;
    if (!inst.evidenceCount) {
      items.push({
        stem: null, href: null, absent: true, label: `${seqText} หลักฐานการชำระ`,
        reason: ['ยังไม่มีไฟล์ในระบบ', state].filter(Boolean).join(' — '),
      });
    }
    if (!inst.taxInvoiceFile && PAID_STATUSES.has(inst.status)) {
      items.push({
        stem: null, href: null, absent: true, label: `${seqText} ใบกำกับภาษี`,
        reason: inst.taxInvoiceNo
          ? `มีเลขที่ ${inst.taxInvoiceNo} แต่บัญชียังไม่ได้แนบไฟล์`
          : ['บัญชียังไม่ได้แนบใบกำกับ', state].filter(Boolean).join(' — '),
      });
    }
  }
  return items;
}

async function runPool(list, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next;
      next += 1;
      await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
}

export function bundleMissingText(missing) {
  const line = (m) => `${m.orderNumber || m.orderId} · ${m.label} — ${m.reason}`;
  const failed = missing.filter((m) => !m.absent);
  const absent = missing.filter((m) => m.absent);
  const lines = ['ไฟล์ที่ไม่ได้อยู่ในชุดเอกสารนี้', ''];
  if (failed.length) lines.push(`ดึงไม่ได้ ${failed.length} ไฟล์ (ลองโหลดใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ)`, ...failed.map(line), '');
  if (absent.length) lines.push(`ยังไม่มีในระบบ ${absent.length} รายการ`, ...absent.map(line), '');
  return lines.join('\r\n');
}

/**
 * ดึงทุกไฟล์ของทุกใบแล้วห่อ ZIP — คืน `{ blob, fileCount, missing }`
 *   loadDocuments(order) → JSON ของแท็บเอกสาร (โยน Error ข้อความไทยเมื่ออ่านไม่ได้)
 *   fetchFile(href)      → Blob (โยน Error ข้อความไทยเมื่อไม่ได้ไฟล์)
 *   onProgress({ done, total })
 */
export async function buildSalesOrderBundle(rows, { loadDocuments, fetchFile, JSZip, onProgress, concurrency = 3 } = {}) {
  const orders = uniqueSalesOrders(rows);
  const plans = new Array(orders.length);
  await runPool(orders, concurrency, async (order, i) => {
    try {
      plans[i] = { order, ...planSalesOrderBundle(order, await loadDocuments(order)) };
    } catch (error) {
      plans[i] = { order, ...planSalesOrderBundle(order, null, { documentsError: error?.message || String(error) }) };
    }
  });

  const zip = new JSZip();
  const missing = [];
  const tasks = [];
  const usedFolders = new Set();
  for (const plan of plans) {
    let folder = plan.folder;
    for (let k = 2; usedFolders.has(folder); k += 1) folder = `${plan.folder} (${k})`;
    usedFolders.add(folder);
    for (const item of plan.items) {
      if (!item.href) {
        missing.push({ orderId: plan.order.id, orderNumber: plan.order.orderNumber, label: item.label, reason: item.reason, absent: Boolean(item.absent) });
      } else tasks.push({ plan, folder, item });
    }
  }

  let done = 0;
  let fileCount = 0;
  onProgress?.({ done, total: tasks.length });
  /* ⭐ PDF ฉบับที่ออกจริงขอ **ทีละใบ** · ไฟล์อื่นขอพร้อมกันตาม `concurrency` — PDF ที่ยังไม่เคยสร้างต้องเปิด chromium (~5–8 วิ ·
     หน่วยความจำหลายร้อย MB) · ยิงพร้อมกันหลายใบ = หลายคำขอเปิด chromium ใน instance เดียว (🐞 27/10 ETXTBSY · ดู htmlPdf.js) */
  const isIssuedPdf = (task) => /\/issued\/pdf$/.test(task.item.href);
  const fetchOne = async ({ plan, folder, item }) => {
    try {
      const blob = await fetchFile(item.href);
      zip.file(`${folder}/${item.stem}${bundleExtension(item.sourceName, blob?.type)}`, blob);
      fileCount += 1;
    } catch (error) {
      missing.push({ orderId: plan.order.id, orderNumber: plan.order.orderNumber, label: item.label, reason: error?.message || 'ดึงไฟล์ไม่สำเร็จ', absent: false });
    }
    done += 1;
    onProgress?.({ done, total: tasks.length });
  };
  await Promise.all([
    runPool(tasks.filter(isIssuedPdf), 1, fetchOne),
    runPool(tasks.filter((task) => !isIssuedPdf(task)), concurrency, fetchOne),
  ]);

  if (missing.length) {
    const order = new Map(orders.map((o, i) => [o.id, i]));
    missing.sort((a, b) => (order.get(a.orderId) ?? 0) - (order.get(b.orderId) ?? 0));
    zip.file(BUNDLE_MISSING_FILE, bundleMissingText(missing));
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, fileCount, missing };
}
