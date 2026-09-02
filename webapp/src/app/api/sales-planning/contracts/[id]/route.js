import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import {
  EXTERNAL_DOC_KINDS, canDeleteContract, contractKindLabel, isContractEditable, isExternalContract,
} from '@/lib/sales/contracts';
import { contractQuotationNotice, newerApprovedQuotation } from '@/lib/sales/contractQuotationState';
import { syncContractsForQuotation } from '@/lib/sales/contractQuotationSync';
import { purgeAttachments } from '@/lib/master/attachments';

export const dynamic = 'force-dynamic';

// ช่องที่แก้ได้ตอนเป็นร่าง — ทุกอย่างที่เหลือ (สถานะ เลขที่ ฉบับตรึง ผู้ออก) ขยับได้
// เฉพาะผ่าน action ของตัวเอง (issue / sign / cancel)
// ⚠️ allowlist ไม่ใช่ blocklist: ช่องใหม่ที่เพิ่มทีหลังต้องมาเปิดที่นี่โดยตั้งใจ
const EDITABLE_KEYS = new Set([
  'contractDate', 'fields', 'notes', 'customerName', 'quotationId', 'effectiveDate', 'expiryDate',
  /* ⭐ ข้อมูลของเอกสารที่ใช้แทนสัญญา (mig 0322) — โมดัลสร้างมีสองช่องนี้มาตั้งแต่แรก
     แต่ฟอร์มแก้ไม่มี ⇒ พิมพ์เลข PO ผิดตัวเดียวต้องลบร่างแล้วสร้างใหม่
     ⚠️ CHECK `sales_contracts_external_kind` บังคับว่า external ต้องมี `externalDocKind`
        และ generated ต้องเป็น NULL ⇒ ต้องกรองตามที่มาของใบก่อนเขียน (ดูข้างล่าง) */
  'externalDocKind', 'externalRef',
]);

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  // ไฟล์ที่เซ็นกลับ + ใบเสนอราคาที่อ้าง — หน้ารายละเอียดต้องการทั้งคู่เสมอ
  const [{ data: signedFile }, { data: quotation }] = await Promise.all([
    row.signedFileId
      // ⚠️ คอลัมน์ของ attachments คือ `uploadedByName` ไม่ใช่ `createdByName` (mig 0028)
      ? supabase.from('attachments').select('id, "fileName", "mimeType", "sizeBytes", "createdAt", "uploadedByName"').eq('id', row.signedFileId).maybeSingle()
      : Promise.resolve({ data: null }),
    row.quotationId
      ? supabase.from('quotations').select('id, "quoteNumber", status, "approvalStatus", "approvedAt", "createdAt", "totalAmount"').eq('id', row.quotationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // สายฉบับ (Rev.) — ใบเดียวกันทั้งสายอ่านจากเลขฐาน · ใช้โชว์ลิงก์ข้ามฉบับบนหน้าใบ
  const base = row.baseNumber || row.contractNo;
  const { data: revisions } = base
    ? await supabase.from('sales_contracts')
      .select('id, "contractNo", "revisionNo", status, "issuedAt"')
      .eq('baseNumber', base).order('revisionNo', { ascending: true })
    : { data: null };

  /* ⭐ ใบเสนอราคาถูกปิดไปแล้วหรือยัง (มติผู้ใช้ 2026-08-22) — ร่างยกเลิกตามตรงนี้เลย
     เพื่อให้คนที่เปิดใบเห็นสถานะจริง ไม่ใช่ร่างที่ดูใช้ได้แต่ฐานราคาหายไปแล้ว */
  const sync = await syncContractsForQuotation(supabase, { quotation, actor: user });
  const current = sync.cancelled.includes(row.id) ? { ...row, status: 'cancelled' } : row;

  /* ใบอื่นของดีลเดียวกันที่อนุมัติทีหลัง — **เตือนอย่างเดียว** ดีลหนึ่งมีใบอนุมัติหลายใบ
     พร้อมกันได้จริง (ออกแบบกลิ่นใบหนึ่ง ผลิตอีกใบหนึ่ง) */
  const { data: siblings } = quotation
    ? await supabase.from('quotations')
      .select('id, "quoteNumber", status, "approvalStatus", "approvedAt", "createdAt"')
      .eq('dealId', row.dealId)
    : { data: null };
  const newerApproved = quotation ? newerApprovedQuotation(quotation, siblings || []) : null;

  const { issuedHtml, ...rest } = current;
  return ok({
    ...rest,
    hasIssuedDocument: !!issuedHtml,
    signedFile: signedFile || null,
    quotation: quotation || null,
    quotationNotice: contractQuotationNotice(current, quotation, { newerApproved }),
    revisions: revisions || [],
    canEdit: inSalesEditScope(user, row.deal) && canEditSalesPlanning(user),
  });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;

  // ⭐ ใบที่ออกเลขไปแล้วคือกระดาษที่ลูกค้าถืออยู่ — แก้เนื้อไม่ได้ ต้องยกเลิกแล้วออกใหม่
  if (!isContractEditable(before)) {
    return fail('สัญญาที่ออกเลขแล้วแก้ไม่ได้ — ยกเลิกแล้วออกฉบับใหม่แทน', 409);
  }

  const body = await req.json();
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (EDITABLE_KEYS.has(key)) patch[key] = value;
  }
  /* 🪤 **ประตูหลังของ `fields`** — route สร้างกันใบ external ไม่ให้ได้ช่องของแม่แบบแล้ว
     แต่ถ้าไม่กันที่นี่ด้วย ค่าเดิมเดินกลับเข้ามาทาง PATCH ได้ (จอไม่มีช่องให้กรอก แต่
     ยิงตรงได้) แล้วเส้นเอกสารก็มีของให้เรนเดอร์อีกครั้ง · เงียบ ๆ ไม่ตีกลับ เพราะจอส่ง
     `fields: {}` มาด้วยทุกครั้งที่กดบันทึกร่าง — ตีกลับจะกลายเป็นแก้วันที่สัญญาไม่ได้ */
  if (isExternalContract(before)) {
    delete patch.fields;
    /* ที่มาของใบเปลี่ยนไม่ได้ ⇒ ช่องบังคับของสายนี้ต้องยังมีค่าที่รู้จักเสมอ
       ปล่อยค่าว่าง/ค่ามั่วผ่าน = ฐานตีกลับ 23514 พร้อมข้อความที่คนอ่านไม่ออก */
    if ('externalDocKind' in patch && !EXTERNAL_DOC_KINDS.includes(patch.externalDocKind)) {
      return badRequest('ต้องระบุว่าใช้เอกสารชนิดไหนแทนสัญญา');
    }
    if ('externalRef' in patch) {
      patch.externalRef = String(patch.externalRef ?? '').trim().slice(0, 200) || null;
    }
  } else {
    // ใบที่ระบบเจนต้องไม่มีค่าสองช่องนี้เลย (CHECK เดียวกันบังคับให้เป็น NULL)
    delete patch.externalDocKind;
    delete patch.externalRef;
  }
  if (!Object.keys(patch).length) return badRequest('ไม่มีช่องที่แก้ได้ในคำขอนี้');
  if (patch.fields && typeof patch.fields !== 'object') return badRequest('ค่าที่กรอกต้องเป็นอ็อบเจกต์');
  patch.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('sales_contracts').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `แก้ร่าง${contractKindLabel(data.kind)} ${data.contractNo || data.id}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});

// DELETE — เฉพาะร่างที่ยังไม่เคยออกเลข (ใบที่มีเลขต้องยกเลิกให้เหลือร่องรอย)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canDeleteContract(row)) {
    return fail('ลบได้เฉพาะร่างที่ยังไม่ออกเลขที่สัญญา — ใบที่ออกแล้วให้กดยกเลิก', 409);
  }

  // ไฟล์ฉบับลงนามที่แนบกับสัญญา — กวาดก่อนแถวหาย (polymorphic ไม่มี FK cascade)
  await purgeAttachments('contract', id);
  const { error } = await supabase.from('sales_contracts').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'delete', entityType: 'sales_contract', entityId: id,
    before: row,
    summary: `ลบร่าง${contractKindLabel(row.kind)} ของดีล ${row.deal?.title || row.dealId}`,
    request: req,
  });
  return ok({ ok: true });
});
