// ── อ้างอิงเพิ่มของคำร้อง (QT · SO · FG) — "ถ้ามี" (ม-88) ────────────────
//
// ⭐ ย้ายมาจาก `POST /api/sa/requests` เพื่อให้ **ทางแก้ใบใช้ตัวเดียวกัน**
// (มติผู้ใช้ 2026-08-24: "หน้าแก้ต้องเหมือนหน้าสร้าง ทุกหัวข้อ") — ฟอร์มแก้กาง
// ช่องพวกนี้แล้ว ถ้า server ไม่รับ ผู้ใช้จะพิมพ์แล้วหายเงียบ
//
// ⚠️ **ต่างจากของที่ `needs`** — ดีล/ใบสั่งขายของบรีฟกลิ่น/ใบเสนอราคาของใบวางบิล
// เป็น *ต้นทาง* ที่ลูกค้า ดีล และฐานยอดถูก derive มาจากมัน ⇒ เปลี่ยนทีหลังไม่ได้
// (ด่านยาวเป็นร้อยบรรทัดอยู่ที่ POST) · ที่นี่คือของที่ **ว่างได้ทุกช่อง** และด่าน
// มีข้อเดียว: "มีจริง และอยู่ดีลเดียวกัน"
import { requestNeedsRef, requestOptionalRefs } from '@/lib/master/requestTypes';

/**
 * ตรวจอ้างอิงเพิ่มแล้วคืนคอลัมน์ที่จะเขียน — `{ patch, error }`
 *
 * ⚠️ คืน **เฉพาะคีย์ที่หัวข้อนั้นมีจริง** — PostgREST ปฏิเสธทั้งก้อนเมื่อ body มี
 * คอลัมน์ที่ DB ยังไม่มี (บทเรียน `productTypeId` · mig 0204) และหัวข้อที่ไม่ประกาศ
 * `optionalRefs` ต้องไม่ถูกล้างค่าที่ `needs` เขียนไว้
 */
export async function resolveOptionalRefs(supabase, kind, body = {}, { dealId = null } = {}) {
  const optionalRefs = requestOptionalRefs(kind);
  const patch = {};
  if (!optionalRefs.length) return { patch, error: null };

  if (optionalRefs.includes('quotation') && !requestNeedsRef(kind, 'quotation')) {
    if (body.quotationId) {
      const { data: qt, error } = await supabase
        .from('quotations').select('id, "dealId"').eq('id', body.quotationId).maybeSingle();
      if (error) return { patch: {}, error: error.message };
      if (!qt) return { patch: {}, error: 'ไม่พบใบเสนอราคาที่อ้างถึง' };
      if (dealId && qt.dealId && qt.dealId !== dealId) {
        return { patch: {}, error: 'ใบเสนอราคาที่อ้างไม่ใช่ของดีลนี้' };
      }
      patch.quotationId = qt.id;
    } else {
      // ⚠️ **ล้างได้** — ช่องนี้ "ว่างได้" ⇒ เอาออกแล้วต้องหายจริง ไม่ใช่ค้างของเดิม
      patch.quotationId = null;
    }
  }

  if (optionalRefs.includes('salesOrder') && !requestNeedsRef(kind, 'salesOrder')) {
    if (body.salesOrderId) {
      const { data: so, error } = await supabase
        .from('sales_orders').select('id, "dealId"').eq('id', body.salesOrderId).maybeSingle();
      if (error) return { patch: {}, error: error.message };
      if (!so) return { patch: {}, error: 'ไม่พบใบสั่งขายที่อ้างถึง' };
      if (dealId && so.dealId && so.dealId !== dealId) {
        return { patch: {}, error: 'ใบสั่งขายที่อ้างไม่ใช่ของดีลนี้' };
      }
      patch.salesOrderId = so.id;
    } else {
      patch.salesOrderId = null;
    }
  }

  if (optionalRefs.includes('product')) {
    /* ⭐ FG **หลายรายการ** (ม-89) — ตรวจทุกตัวว่ามีจริง แล้วเก็บ snapshot
       [{ id, label }] เอง (ชื่อจากแถวจริง ไม่รับจาก client — ทะเบียนเปลี่ยนชื่อ
       ทีหลัง ใบเก่ายังอ่านออกว่าตอนนั้นอ้างอะไร) · FG ไม่ผูกดีล จึงไม่เทียบดีล */
    const wanted = [...new Set((Array.isArray(body.productIds) ? body.productIds : [])
      .concat(body.productId ? [body.productId] : []).filter(Boolean))];
    if (wanted.length > 20) {
      return { patch: {}, error: 'อ้างสินค้า (FG) ได้ไม่เกิน 20 รายการ' };
    }
    let refProduct = [];
    if (wanted.length) {
      const { data: fgs, error } = await supabase
        .from('products').select('id, "fgCode", "productDescription"').in('id', wanted);
      if (error) return { patch: {}, error: error.message };
      const byId = new Map((fgs || []).map((f) => [f.id, f]));
      if (wanted.some((id) => !byId.has(id))) {
        return { patch: {}, error: 'ไม่พบสินค้า (FG) ที่อ้างถึงบางรายการ' };
      }
      refProduct = wanted.map((id) => {
        const fg = byId.get(id);
        return { id, label: [fg.fgCode, fg.productDescription].filter(Boolean).join(' · ') || id };
      });
    }
    patch.productRefs = refProduct;
    // คู่เดิม (productId/productName) เก็บตัวแรกไว้ให้จอเก่าที่ยังอ่านช่องเดี่ยว
    patch.productId = refProduct[0]?.id || null;
    patch.productName = refProduct[0]?.label || null;
  }

  return { patch, error: null };
}
