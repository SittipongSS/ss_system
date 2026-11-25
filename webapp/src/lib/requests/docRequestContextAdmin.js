// ── คำร้องขอเอกสาร: ข้อมูลลูกค้า + กลิ่น/สูตรของบรรทัด MSDS ที่จออ่านสด (ม-167 · 25/11/2026) — ชั้นอ่านฐาน ─────────
//
// ⭐ ตัวโหลดเดียวของ: GET ใบ (`docCustomer` + `item.docSubject`) · ด่านกดส่ง (ข้อมูลลูกค้าครบไหม) · เส้นพรีวิวของฟอร์ม
//    (`/api/sa/requests/doc-customer`) ⇒ จอกับ server เห็นข้อมูลชุดเดียวกัน · กติกาอยู่ที่ `docCustomer.js` / `docLineSubject.js`
// ⚠️ อ่านสดทุกครั้ง ไม่ประทับลงใบ — ทะเบียนลูกค้า/FG/กลิ่น/สูตร เป็นเจ้าของข้อมูล (กติกา registryLinks.js)
import { docCustomerView } from '@/lib/requests/docCustomer';
import {
  FG_SUBJECT_NOUN, docLineSubjectView, docLineWantsSubject, fgBoundSubjectId, fgNeedsLineSubject, fgSubjectKind,
} from '@/lib/requests/docLineSubject';
import { REQUEST_FG_SUBJECT_DOC_TYPES } from '@/lib/requests/docTypes';
import { formulaLabel, scentLabel } from '@/lib/master/registryLabel';

/* คอลัมน์ที่ภาพข้อมูลลูกค้าใช้ — ช่องเดี่ยวเดิม (`address`/`shippingAddress`/`branchCode`) ต้องมาด้วย:
   ลูกค้าที่ยังไม่ backfill `addresses` ได้ที่อยู่จากช่องเดี่ยว (`customerAddresses` → `addressesFromLegacy`) */
export const DOC_CUSTOMER_COLUMNS = 'id, name, "nameEn", phone, addresses, address, "shippingAddress", "branchCode"';

/** แถวลูกค้าสำหรับเอกสาร — null = ไม่มี id / ไม่พบ · อ่านพัง = โยน (ผู้เรียกตัดสิน 500) */
export async function loadDocCustomerRow(supabase, customerId) {
  const id = String(customerId ?? '').trim();
  if (!id) return null;
  const { data, error } = await supabase.from('customers').select(DOC_CUSTOMER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** ภาพข้อมูลลูกค้าของใบ (`docCustomerView`) — null = ใบไม่มีลูกค้า */
export async function loadDocCustomerView(supabase, customerId, addressId = null) {
  const row = await loadDocCustomerRow(supabase, customerId);
  return row ? docCustomerView(row, addressId) : null;
}

async function rowsById(supabase, table, columns, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from(table).select(columns).in('id', unique).limit(unique.length);
  if (error) throw error;
  return new Map((data || []).map((r) => [r.id, r]));
}

/**
 * ติด `docSubject` (กลิ่น/สูตรของ FG ของบรรทัด MSDS · อ่านสด) ให้แถว — แถวอื่นคืนเดิม
 * ⚠️ ยิง query ชุดละครั้ง ไม่ใช่ทีละแถว · ไม่มีแถว MSDS ที่ผูก FG = ไม่ยิงเลย
 */
export async function attachDocLineSubjects(supabase, items = []) {
  const msds = (items || []).filter((i) => docLineWantsSubject(i) && i.productId);
  if (!msds.length) return items;
  const products = await rowsById(supabase, 'products',
    'id, "fgCode", "productDescription", "categoryCode", "formulaId", "formulaCode", "formulaName", "formulaDate", "scentId"',
    msds.map((i) => i.productId));
  const scentIds = [];
  const formulaIds = [];
  for (const item of msds) {
    const product = products.get(item.productId);
    if (product && fgBoundSubjectId(product)) {
      (fgSubjectKind(product) === 'scent' ? scentIds : formulaIds).push(fgBoundSubjectId(product));
    }
    if (item.scentId) scentIds.push(item.scentId);
    if (item.formulaId) formulaIds.push(item.formulaId);
  }
  const [scents, formulas] = await Promise.all([
    rowsById(supabase, 'scents', 'id, code, name, "producedAt"', scentIds),
    rowsById(supabase, 'formulas', 'id, code, name, "formulaDate"', formulaIds),
  ]);
  return items.map((item) => {
    if (!docLineWantsSubject(item) || !item.productId) return item;
    const product = products.get(item.productId) || null;
    const bound = product ? fgBoundSubjectId(product) : null;
    const docSubject = docLineSubjectView(item, {
      product,
      fgScent: bound ? scents.get(bound) || null : null,
      fgFormula: bound ? formulas.get(bound) || null : null,
      lineScent: item.scentId ? scents.get(item.scentId) || null : null,
      lineFormula: item.formulaId ? formulas.get(item.formulaId) || null : null,
    });
    return docSubject ? { ...item, docSubject } : item;
  });
}

/**
 * คำแนะนำผูกกลิ่น/สูตรให้ FG จากบรรทัด MSDS ของคำร้อง (ม-167 · มติเจ้าของ 25/11 "ในฐานข้อมูลสินค้า ขึ้นแนะนำ เพื่อกดยื่นขออนุมัติ")
 * — `[{ kind, noun, id, label, typed, requests: [{ id, docNo }] }]` · FG ผูกแล้ว/ชุดของขวัญ = `[]`
 * ⚠️ ใบที่ยกเลิกไม่นับ · ตัวเดียวกันหลายใบรวมเป็นแถวเดียว · ชื่อที่พิมพ์ (`typed`) ผูกไม่ได้ — โชว์ให้ RD รู้ว่าต้องลงทะเบียนก่อน
 * ⚠️ ผู้เรียก (GET สินค้า) ห่อ catch เอง — คำแนะนำพังต้องไม่ทำให้หน้าสินค้าเปิดไม่ได้
 */
export async function loadFgSubjectSuggestions(supabase, product) {
  if (!product?.id || !fgNeedsLineSubject(product)) return [];
  const kind = fgSubjectKind(product);
  const { data: rows, error } = await supabase.from('dept_request_items')
    .select('id, "requestId", "scentId", "formulaId", "typedSubjectName"')
    .eq('productId', product.id).eq('lineKind', 'document').in('docType', [...REQUEST_FG_SUBJECT_DOC_TYPES])
    .order('createdAt', { ascending: false }).limit(200);
  if (error) throw error;
  const picked = (rows || []).map((r) => ({
    ...r,
    subjectId: (kind === 'scent' ? r.scentId : r.formulaId) || null,
    typed: String(r.typedSubjectName ?? '').trim() || null,
  })).filter((r) => r.subjectId || r.typed);
  if (!picked.length) return [];

  const requests = await rowsById(supabase, 'dept_requests', 'id, "docNo", status', picked.map((r) => r.requestId));
  const live = picked.filter((r) => requests.has(r.requestId) && requests.get(r.requestId).status !== 'cancelled');
  if (!live.length) return [];
  const registry = await rowsById(supabase, kind === 'scent' ? 'scents' : 'formulas',
    kind === 'scent' ? 'id, code, name, "producedAt", status' : 'id, code, name, "formulaDate", status',
    live.map((r) => r.subjectId));

  const groups = new Map();
  for (const r of live) {
    const key = r.subjectId ? `id:${r.subjectId}` : `typed:${r.typed.toLowerCase()}`;
    const reg = r.subjectId ? registry.get(r.subjectId) : null;
    if (r.subjectId && !reg) continue;   // ตัวในทะเบียนถูกลบไปแล้ว — ไม่มีอะไรให้ผูก
    if (!groups.has(key)) {
      groups.set(key, {
        kind, noun: FG_SUBJECT_NOUN[kind], id: r.subjectId,
        label: reg ? (kind === 'scent' ? scentLabel(reg) : formulaLabel(reg)) : r.typed,
        typed: !r.subjectId, requests: [],
      });
    }
    const req = requests.get(r.requestId);
    const group = groups.get(key);
    if (!group.requests.some((q) => q.id === req.id)) group.requests.push({ id: req.id, docNo: req.docNo || null });
  }
  return [...groups.values()];
}
