/* ── ฉบับที่ออกจริงของใบสเปคสินค้า FM-SA-04 — HTML ไม่ใช่ PDF (เหมือน QT/SO) ──
 *
 * ⚠️ **ด่านเดียวกับหน้าสินค้า** — ใครอ่านสินค้าชิ้นนี้ได้ ก็พิมพ์เอกสารได้
 * ด่านที่สองที่ไม่ตรงกันคือรูที่คนอ่านของฝ่ายอื่นได้ผ่านทางพิมพ์ (บทเรียนเดียวกับ PDR)
 *
 * ⚠️ **ตารางตั้งค่าล่มต้องไม่ทำให้พิมพ์ไม่ได้** — มาตรฐานที่เผยแพร่อ่านแบบ best effort
 * ล้มเมื่อไรส่ง null แล้วเอกสารตกไปใช้ค่าสำรอง `FM-SA-04 Rev.00` ใน documentBrand.js
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { resolveCompanyBlock } from '@/lib/companyProfile';
import { fmtDate } from '@/lib/format';
import { categoryOf } from '@/lib/master/categoryOf';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import { loadProductSpec } from '@/lib/sales/productSpecStore';
import { listAttachments } from '@/lib/master/attachments';
import { specIllustrationsOf } from '@/lib/sales/productSpecIllustrations';
import { renderProductSpecDocument } from '@/lib/sales/productSpecDocument';

export const dynamic = 'force-dynamic';

const dateText = (value) => (value ? fmtDate(value) : '');

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = getSupabaseAdmin();

  const { data: product, error } = await supabase
    .from('products')
    .select('id, fgCode, productDescription, brandName, customerName, categoryCode, volume, volumeUnit, scentId, formulaCode, formulaName, team, ownerId')
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // ไม่พบ = 404 เหมือนสินค้านอกทีม (ไม่บอกว่ามีอยู่)
  if (!product || !canViewRecord(user, 'products', product)) {
    return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  }
  const scopeReason = productSpecScopeReason(product);
  if (scopeReason) return Response.json({ error: scopeReason }, { status: 400 });

  const loaded = await loadProductSpec(supabase, id);
  if (loaded.error) return Response.json({ error: loaded.error }, { status: 500 });
  if (!loaded.spec) return Response.json({ error: 'สินค้าชิ้นนี้ยังไม่มีใบสเปค' }, { status: 404 });

  /* ⭐ `?issue=<id>` = พิมพ์ **กระดาษใบที่ออกไปแล้ว** ใบนั้น · ไม่ส่งมา = พรีวิวฉบับล่าสุด
     ⚠️ กระดาษที่ออกไปแล้วต้องอ่านเหมือนวันที่ส่งไป ⇒ อ้าง `revisionId` ของตัวมันเอง
        ไม่ใช่ฉบับล่าสุดของสินค้า (ไม่งั้นใบเก่าเปลี่ยนเนื้อตามสเปกที่แก้ทีหลัง) */
  const issueId = new URL(request.url).searchParams.get('issue');
  const issue = issueId
    ? (loaded.issues || []).find((row) => row.id === issueId) || null
    : null;
  if (issueId && !issue) return Response.json({ error: 'ไม่พบเอกสารฉบับที่ขอ' }, { status: 404 });

  const revision = issue
    ? (loaded.revisions || []).find((row) => row.id === issue.revisionId)
    : (loaded.revisions || [])[0];
  if (!revision) return Response.json({ error: 'ไม่พบฉบับสเปกของเอกสารนี้' }, { status: 404 });

  const [{ data: profile }, { data: standard }, { data: types }, { data: scent }] = await Promise.all([
    supabase.from('company_profile').select('*').limit(1).maybeSingle(),
    supabase.from('document_standard_versions').select('*')
      .eq('documentKey', 'productSpec').eq('status', 'published').maybeSingle(),
    supabase.from('product_types').select('"mainCategoryCode", "typeCode", "nameTh", "nameEn"'),
    product.scentId
      ? supabase.from('scents').select('code, name').eq('id', product.scentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const category = categoryOf(product.fgCode) || product.categoryCode || '';
  const [main, type] = String(category).split('-');
  const typeRow = (types || []).find((row) => row.mainCategoryCode === main && row.typeCode === type);

  /* ภาพประกอบแนบกับ **ตัวสินค้า** (มติ 17/09 "ภาพประกอบอยู่กับสเปคสินค้า") ⇒ อ่าน
     จากไฟล์แนบของสินค้าตรง ๆ · กระดาษที่พิมพ์สดจึงเป็นภาพชุดวันนี้เสมอ ส่วนฉบับที่
     ออกไปแล้วอ่านเหมือนวันที่ส่งไปผ่าน snapshot ของ issued_documents (กลไกเดียวกับ QT/SO) */
  const illustrations = specIllustrationsOf(await listAttachments('product', id));

  const html = renderProductSpecDocument({
    issue: issue
      ? {
        ...issue,
        createdDateText: dateText(issue.createdAt),
        deliveryDueDateText: dateText(issue.deliveryDueDate),
        approvedDateText: dateText(revision.approvedAt),
        reviewedDateText: dateText(revision.reviewedAt),
      }
      /* ยังไม่เคยออกเอกสาร = พรีวิวฉบับร่าง · ไม่มีเลขที่เอกสารเพราะเลขเกิดตอนออกจริง
         (เผาเลขให้พรีวิวคือเลขที่หายไปโดยไม่มีกระดาษ) */
      : { docNo: '', revNo: revision.revNo, createdDateText: dateText(revision.createdAt) },
    revision,
    product: {
      ...product,
      categoryName: typeRow ? [typeRow.nameEn, typeRow.nameTh].filter(Boolean).join(' · ') : category,
      scentText: [scent?.name || product.formulaName, scent?.code || product.formulaCode].filter(Boolean).join(' | '),
      volumeText: [product.volume, product.volumeUnit].filter(Boolean).join(' '),
    },
    company: resolveCompanyBlock(profile || null),
    contact: {
      name: user?.name || null,
      email: user?.email || null,
      phone: null,
    },
    standard: standard || null,
    illustrations,
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
