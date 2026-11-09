import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { attachRegistryPrice } from '@/lib/master/scentFormulaAdmin';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { confirmedRegistrySources, priceRegistryRows } from '@/lib/rd/priceRegistry';

export const dynamic = 'force-dynamic';

const DEPT = 'RD';

// GET /api/rd/price-board/registry — กลิ่น/สูตรที่มาจากคำร้องที่ลูกค้าคอนเฟิร์ม + สถานะราคา/Ingredient List
// (แท็บ "กลิ่น" · "สูตร" ของหน้า "ราคา + Ingredient List" · มติเจ้าของ 09/11/2026)
//
// ⭐ **ใบทุกสถานะ** (ยกเว้นร่าง/ยกเลิก — ตัดที่ lib) ต่างจาก `/api/rd/price-board` ที่เห็นแค่ใบเปิด
//   — ของที่ขาดส่วนใหญ่อยู่ในใบที่ปิดไปแล้ว (วัด prod 09/11) · หน่วยเป็นตัวในทะเบียน ไม่ใช่แถวคำร้อง
// ⚠️ **อ่านอย่างเดียว** — การใส่ราคาเขียนผ่าน `POST /api/master/{scents|formulas}/[id]/price` ·
//   Ingredient List ผ่าน `PATCH /api/master/formulas/[id]` (action `ingredients`) · `proxy.js` เปิด `/api/rd` แค่ GET
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับเส้นแท็บแรก + เมนูของโมดูล
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่ายที่รับคำร้อง');

  let requests;
  try {
    /* ⭐ ตัวโหลดคิวตัวเดิม (ไล่หน้า/ซอยก้อนครบ · นับใน check:rowcap แล้ว) · `lean` = ไม่ต้องใช้ราคาแถว/ชื่อโครงการ
       ⚠️ ไม่ส่ง `status` = ทุกสถานะ — ใบที่ปิดแล้วคือที่มาของตัวที่ขาดส่วนใหญ่ */
    requests = await loadRequests(supabase, { dept: DEPT, lean: true });
  } catch (e) {
    return fail(e?.message || 'อ่านคำร้องของฝ่ายไม่สำเร็จ', 500);
  }
  const sources = confirmedRegistrySources(requests);
  const formulaIds = [...sources.formulas.keys()];
  if (!formulaIds.length && !sources.scents.size) return ok({ scents: [], formulas: [] });

  try {
    // ทะเบียนสด — ซอยลิสต์ id (ยาวตามจำนวนที่คอนเฟิร์ม · กับดัก URL 16 KB)
    const formulas = formulaIds.length
      ? await fetchAllInChunks(formulaIds, (chunk) => supabase.from('formulas').select('*').in('id', chunk).order('id'))
      : [];
    // กลิ่นของที่มา + กลิ่นของสูตร (ช่อง F ของสูตรลงที่กลิ่นของสูตร — ต้องรู้สถานะ/ราคาของมัน)
    const scentIds = [...new Set([...sources.scents.keys(), ...formulas.map((f) => f.scentId).filter(Boolean)])];
    const scents = scentIds.length
      ? await fetchAllInChunks(scentIds, (chunk) => supabase.from('scents').select('*').in('id', chunk).order('id'))
      : [];

    // รหัส AR อ่านสดจากทะเบียนลูกค้า (กติกาเดียวกับตัวโหลดคิว) — ไม่ใช่ชื่อที่ประทับไว้บนกลิ่น/สูตร
    const customerIds = [...new Set([...scents, ...formulas].map((r) => r.customerId).filter(Boolean))];
    const customers = customerIds.length
      ? await fetchAllInChunks(customerIds, (chunk) => supabase.from('customers').select('id, "arCode"').in('id', chunk).order('id'))
      : [];
    const arById = new Map(customers.map((c) => [c.id, String(c.arCode || '').trim() || null]));

    /* ⭐ ราคาอ่านผ่าน `attachRegistryPrice` ตัวเดียวกับหน้าทะเบียน/หน้าคำร้อง — วัสดุตัวไหน/หมดอายุไหม ตอบเหมือนกันทุกจอ
       · สามชนิด สามรอบ (ไม่ใช่รายตัว) · ชื่อส่งไปด้วยเพราะตัวเลือกวัสดุ (`pickStampedMaterial`) ใช้ชื่อตัดสินตอนผูกซ้ำ */
    const named = (rows) => rows.map((r) => ({ id: r.id, name: r.name || null }));
    const prices = new Map();
    const reads = [
      { kind: 'RM_F', column: 'scentId', rows: named(scents) },
      { kind: 'RM_B', column: 'formulaId', rows: named(formulas) },
      { kind: 'RM_FB', column: 'formulaId', rows: named(formulas) },
    ].filter((r) => r.rows.length);
    for (const { kind, column, rows } of reads) {
      for (const r of await attachRegistryPrice(supabase, rows, { column, kind })) prices.set(`${kind}:${r.id}`, r.price);
    }

    return ok(priceRegistryRows({ sources, scents, formulas, prices, arById }));
  } catch (e) {
    return fail(`อ่านทะเบียนกลิ่น/สูตร/ราคาไม่สำเร็จ: ${e?.message || ''}`.trim(), 500);
  }
});
