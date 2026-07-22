// ── แม่แบบต้นทุนต่อประเภทสินค้า (mig 0140) — ชั้นเข้าถึงข้อมูล ────────────
// แยกจาก costTemplate.js (logic ล้วน) เพราะไฟล์นี้แตะ DB จริง — ทั้งสอง API route
// (list/create และ [id]) ใช้ตัวโหลดตัวเดียวกัน จะได้คืนรูปร่างเดียวกันเสมอ
// (แม่แบบ + บรรทัดเรียงตาม sortOrder อยู่ในก้อนเดียว)
//
// Server-only: เรียกผ่าน service-role client เหมือน master data ตัวอื่น

// อ่านแม่แบบพร้อมบรรทัด แล้วประกอบเป็นก้อนเดียว (PostgREST คืนบรรทัดคนละ query)
export async function loadCostTemplates(supabase, { includeHidden = false, id = null } = {}) {
  let query = supabase.from('product_type_cost_templates').select('*');
  if (!includeHidden) query = query.eq('isHidden', false);
  if (id) query = query.eq('id', id);
  const { data: templates, error } = await query.order('categoryCode', { ascending: true });
  if (error) throw error;
  if (!templates?.length) return [];

  const { data: lines, error: lineError } = await supabase
    .from('product_type_cost_lines')
    .select('*')
    .in('templateId', templates.map((t) => t.id))
    .order('sortOrder', { ascending: true });
  if (lineError) throw lineError;

  return templates.map((t) => ({
    ...t,
    lines: (lines || []).filter((l) => l.templateId === t.id),
  }));
}

export async function findCostTemplate(supabase, id) {
  const [template] = await loadCostTemplates(supabase, { includeHidden: true, id });
  return template || null;
}
