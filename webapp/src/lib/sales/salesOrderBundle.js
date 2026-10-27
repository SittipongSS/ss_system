// ── ชุดเอกสารใบสั่งขาย QT · SO · การชำระ → ZIP (มติเจ้าของ 27/10/2569) ──────────────────
//
// ติ๊กหลายใบบนทะเบียนใบสั่งขาย แล้วโหลดเป็น ZIP ไฟล์เดียว — **โฟลเดอร์ละหนึ่งใบสั่งขาย** ข้างในเป็นไฟล์แยก:
//   01 ใบเสนอราคา QT-….pdf            ← quotations/[id]/issued/pdf (ฉบับที่อนุมัติ)
//   02 ใบสั่งขาย SO-….pdf             ← sales-orders/[id]/issued/pdf (ฉบับที่อนุมัติ)
//   03 งวดที่ 1 หลักฐานการชำระ.jpg     ← กลุ่ม "หลักฐานการชำระ" ของแท็บเอกสาร (ไฟล์ต้นฉบับ ไม่แปลง)
//   04 งวดที่ 1 ใบกำกับภาษี IV-….pdf
// ไฟล์ยืนยันคำสั่งซื้อ · สัญญา · แนบเพิ่ม **ไม่อยู่ในชุด** (เจ้าของไม่เลือก — ชุดนี้คือเอกสารขายกับเอกสารเงิน)
//
// ⭐ **ห่อ ZIP ที่เบราว์เซอร์ ไม่ใช่ที่ server** — Vercel ตอบ body ได้ไม่เกิน 4.5 MB ต่อคำขอ ⇒ ZIP หลายใบที่มีสลิป
//   พังแน่ · ที่นี่ดึงทีละไฟล์ผ่าน proxy เดิมของแต่ละบ้าน (ด่านสิทธิ์/ด่าน path ชุดเดิม ไม่มีด่านที่สอง)
// ⭐ **ไฟล์ที่เอามาไม่ได้ไม่หายเงียบ** — ใส่ `ไฟล์ที่ขาด.txt` ที่รากของ ZIP บอกใบ · ไฟล์ · เหตุ (ใบยังไม่อนุมัติ =
//   ไม่มีฉบับตรึง · ใบย้อนหลังไม่มีใบเสนอราคา · ไม่มีสิทธิ์ ฯลฯ) — ZIP ที่ขาดไฟล์โดยไม่บอกอ่านเหมือน "ใบนี้มีแค่นี้"
// ⚠️ ไฟล์นี้ไม่แตะ DB/เครือข่ายเอง — ตัวโหลดส่งเข้ามา (`loadDocuments` · `fetchFile` · `JSZip`) ⇒ เทสต์ได้โดยไม่ต่ออะไร

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

/**
 * แผนไฟล์ของใบเดียว — คืน `{ folder, items }` · item = `{ stem, sourceName, href, label, reason }`
 * `href: null` = รู้ตั้งแต่ก่อนดึงว่าไม่มี (`reason` บอกเหตุ) · `stem` ยังไม่มีนามสกุล (รู้หลังดึงไฟล์)
 * `documents` = ผลของ GET sales-orders/[id]/documents · `null` + `documentsError` = อ่านไม่สำเร็จ
 */
export function planSalesOrderBundle(order, documents, { documentsError = null } = {}) {
  const items = [];
  const quoteNumber = order?.quotation?.quoteNumber || null;
  items.push(order?.quotationId
    ? {
      stem: `${pad(1)} ${bundleSafeName(`ใบเสนอราคา ${quoteNumber || ''}`.trim())}`,
      sourceName: 'quotation.pdf',
      href: `/api/sales-planning/quotations/${enc(order.quotationId)}/issued/pdf`,
      label: `ใบเสนอราคา ${quoteNumber || ''}`.trim(),
    }
    : { stem: null, href: null, label: 'ใบเสนอราคา', reason: 'ใบนี้ไม่ได้สร้างจากใบเสนอราคาในระบบ (ใบย้อนหลัง)' });
  items.push({
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
  return { folder: bundleFolderName(order), items };
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
  const lines = [
    'ไฟล์ที่ไม่ได้อยู่ในชุดเอกสารนี้',
    '',
    ...missing.map((m) => `${m.orderNumber || m.orderId} · ${m.label} — ${m.reason}`),
    '',
  ];
  return lines.join('\r\n');
}

/**
 * ดึงทุกไฟล์ของทุกใบแล้วห่อ ZIP — คืน `{ blob, fileCount, missing }`
 *   loadDocuments(order) → JSON ของแท็บเอกสาร (โยน Error ข้อความไทยเมื่ออ่านไม่ได้)
 *   fetchFile(href)      → Blob (โยน Error ข้อความไทยเมื่อไม่ได้ไฟล์)
 *   onProgress({ done, total })
 */
export async function buildSalesOrderBundle(orders, { loadDocuments, fetchFile, JSZip, onProgress, concurrency = 3 } = {}) {
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
      if (!item.href) missing.push({ orderId: plan.order.id, orderNumber: plan.order.orderNumber, label: item.label, reason: item.reason });
      else tasks.push({ plan, folder, item });
    }
  }

  let done = 0;
  let fileCount = 0;
  onProgress?.({ done, total: tasks.length });
  await runPool(tasks, concurrency, async ({ plan, folder, item }) => {
    try {
      const blob = await fetchFile(item.href);
      zip.file(`${folder}/${item.stem}${bundleExtension(item.sourceName, blob?.type)}`, blob);
      fileCount += 1;
    } catch (error) {
      missing.push({ orderId: plan.order.id, orderNumber: plan.order.orderNumber, label: item.label, reason: error?.message || 'ดึงไฟล์ไม่สำเร็จ' });
    }
    done += 1;
    onProgress?.({ done, total: tasks.length });
  });

  if (missing.length) {
    const order = new Map(orders.map((o, i) => [o.id, i]));
    missing.sort((a, b) => (order.get(a.orderId) ?? 0) - (order.get(b.orderId) ?? 0));
    zip.file(BUNDLE_MISSING_FILE, bundleMissingText(missing));
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, fileCount, missing };
}
