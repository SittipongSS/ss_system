// ── ใบสั่งขายที่งานของฝ่าย R&D อ้างถึง ────────────────────────────────────
//
// ⭐ **ที่มา** (มติผู้ใช้ 2026-08-29): ฝ่าย R&D ทำงานจากคำร้อง แต่ใบที่สำคัญที่สุด —
// บรีฟกลิ่น — เกิดจาก **ใบสั่งขาย** และ RD ต้องรู้ว่าออร์เดอร์นั้นสั่งอะไรไว้บ้าง
// (FG อะไร กี่ชิ้น) · เดิมทางเดียวที่จะเห็นคือกดลิงก์จากใบคำร้องทีละใบ
//
// ⚠️ **ไม่ใช่ทะเบียนใบสั่งขาย** — เอาเฉพาะใบที่มีคำร้องของฝ่ายนี้อ้างถึงจริง ๆ
// ใบสั่งขายทั้งบริษัทเป็นงานของฝ่ายขาย (กฎสามชั้น ชั้น 2 · docs/module-ownership-rule.md)
// ⚠️ **อ่านอย่างเดียว** — ทุกการแก้ยังอยู่ที่เจ้าของเอกสาร (`/sa/sales-orders/[id]`)
//
// ⚠️ ประกอบเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์ได้โดยไม่ต้องแตะฐาน — route แค่ดึงข้อมูล
// สามก้อน (คำร้อง · ใบ · บรรทัด) แล้วส่งเข้ามาที่นี่

/** id ของใบสั่งขายที่ถูกคำร้องกลุ่มนี้อ้างถึง (ไม่ซ้ำ · เรียงตามที่เจอ) */
export function referencedOrderIds(requests = []) {
  return [...new Set((requests || []).map((r) => r?.salesOrderId).filter(Boolean))];
}

/**
 * แถวของหน้า "ใบสั่งขายที่เกี่ยวข้อง" — หนึ่งแถวคือหนึ่งใบสั่งขาย พร้อมคำร้องที่อ้างถึง
 *
 * ⚠️ ใบเดียวถูกอ้างได้จากหลายคำร้อง (บรีฟกลิ่นหลายใบต่อหนึ่งออร์เดอร์) ⇒ รวมเป็นแถวเดียว
 * แล้วแนบรายการคำร้องไว้ ไม่ใช่แตกเป็นหลายแถวที่หน้าตาเหมือนกัน
 * ⚠️ **ใบที่หาไม่เจอถูกข้าม** — คำร้องเก่าที่ชี้ใบที่ถูกลบไปแล้วต้องไม่กลายเป็นแถวเปล่า
 */
export function relatedOrderRows({ requests = [], orders = [], lines = [] } = {}) {
  const orderById = new Map((orders || []).map((o) => [o.id, o]));
  const linesByOrder = new Map();
  for (const line of lines || []) {
    if (!line?.salesOrderId) continue;
    const list = linesByOrder.get(line.salesOrderId) || [];
    list.push(line);
    linesByOrder.set(line.salesOrderId, list);
  }

  const rows = new Map();
  for (const request of requests || []) {
    const order = orderById.get(request?.salesOrderId);
    if (!order) continue;
    const row = rows.get(order.id) || {
      ...order,
      requests: [],
      // FG ที่อยู่ในใบ — RD อ่านเพื่อรู้ว่าออร์เดอร์นี้ต้องได้กลิ่น/สูตรอะไรออกมา
      lines: (linesByOrder.get(order.id) || [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    };
    row.requests.push({
      id: request.id,
      docNo: request.docNo || null,
      kind: request.kind || null,
      status: request.status || null,
      title: request.title || null,
    });
    rows.set(order.id, row);
  }

  /* เรียงใบใหม่สุดขึ้นก่อน — ของที่ RD ต้องทำต่อคือออร์เดอร์ล่าสุดเสมอ
     ⚠️ `orderDate` ว่างได้ (ใบร่างเก่า) ⇒ ใบไม่มีวันไปอยู่ท้าย ไม่ใช่หายไป */
  return [...rows.values()].sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')));
}
