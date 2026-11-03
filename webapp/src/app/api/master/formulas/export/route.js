// ── GET /api/master/formulas/export — ทะเบียนสูตรเป็นไฟล์ Excel (ม-158 · มติเจ้าของ 03/11/2026) ───────────────
//
// ⭐ แถว = **เท่าที่ตาเห็นบนจอ** (กติกาเดียวกับ Excel ทะเบียนสินค้า) — รับตัวกรองชุดเดียวกับหน้ารายการทาง query
//   แล้วกรองด้วย `filterFormulas` ตัวเดียวกับที่จอใช้ · ไม่มีตัวกรอง = ทั้งทะเบียน (ค่าตั้งต้นของจอคือ "ทุกสถานะ")
// 🪤 **ต้องเป็น GET** — proxy ตัดสินสิทธิ์เขียนจาก method+path (ดูหัว `/api/products/export`)
// ⚠️ ด่านอ่านตัวเดียวกับรายการ (`canViewFormulas`) — ใครเห็นตารางได้ก็ได้ไฟล์ของตารางนั้น
import { withUser, forbidden, unauthorized } from '@/lib/http';
import { canViewFormulas } from '@/lib/master/formulas';
import { loadFormulas } from '@/lib/master/scentFormulaAdmin';
import { filterFormulas, sortFormulasNewestFirst } from '@/lib/master/formulaFilter';
import { buildFormulaExportBuffer, formulaExportFilename } from '@/lib/master/formulaWorkbook';
import { customerArIndex } from '@/lib/master/customerAr';
import { categoryNameBoth, findCategoryByCode } from '@/lib/master/productCategoryOptions';
import { fetchAll } from '@/lib/supabaseFetchAll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewFormulas(user)) return forbidden();
  const sp = new URL(req.url).searchParams;

  let formulas;
  let scents;
  let customers;
  let productTypes;
  try {
    [formulas, scents, customers, productTypes] = await Promise.all([
      // แถวชุดเดียวกับ GET ของรายการ (แชร์ · ที่มา) — ตัวกรองค้นด้วยของพวกนี้
      loadFormulas(supabase),
      // ต้องการแค่ชื่อ/รหัสกลิ่น — ไม่ใช้ `loadScents` (ติดที่มา/ราคา ซึ่งไฟล์นี้ไม่ใช้)
      fetchAll(() => supabase.from('scents').select('id, code, name').order('id')),
      // ลูกค้าโตตามธุรกิจ (ตารางใน check:rowcap) — ไล่หน้าทะลุเพดาน 1,000 แถว · ต้องการแค่รหัส AR
      fetchAll(() => supabase.from('customers').select('id, "arCode"').order('id')),
      supabase.from('product_types')
        .select('mainCategoryCode, mainCategoryName, typeCode, nameTh, nameEn')
        .then(({ data, error }) => { if (error) throw error; return data || []; }),
    ]);
  } catch (e) {
    return Response.json({ error: `อ่านทะเบียนสูตรไม่สำเร็จ: ${e?.message || ''}`.trim() }, { status: 500 });
  }

  const scentById = new Map((scents || []).map((s) => [s.id, s]));
  const arIndex = customerArIndex(customers);
  const scentNameOf = (id) => scentById.get(id)?.name || null;
  const rows = sortFormulasNewestFirst(filterFormulas(formulas, {
    search: sp.get('q') || '',
    status: sp.get('status') || '',
    kind: sp.get('kind') || '',
    source: sp.get('source') || '',
  }, { categories: productTypes, scentNameOf, arIndex }));

  try {
    const now = new Date();
    const buffer = await buildFormulaExportBuffer(rows, {
      // ป้ายหมวด "รหัส EN · TH" ตัวเดียวกับตาราง · หมวดที่ชื่อว่างทั้งสองภาษาถอยไปรหัส
      categoryLabel: (code) => {
        const name = categoryNameBoth(findCategoryByCode(productTypes, code));
        return name ? `${code} ${name}` : code;
      },
      scentLabel: (id) => {
        const scent = scentById.get(id);
        return scent ? [scent.code, scent.name].filter(Boolean).join(' · ') : null;
      },
      arCodeOf: (id) => arIndex.get(id) || null,
    }, { now });
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${formulaExportFilename(now)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[formula-export]', err);
    return Response.json({ error: 'ส่งออกทะเบียนสูตรไม่สำเร็จ' }, { status: 500 });
  }
});
