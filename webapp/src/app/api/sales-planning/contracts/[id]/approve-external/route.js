import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  CONTRACT_NUMBER_MONTH,
  contractKindLabel,
  contractNumberPattern,
  externalApproveError,
  externalDocKindLabel,
} from '@/lib/sales/contracts';
import { documentNumberSlots } from '@/lib/documentStandards';

export const dynamic = 'force-dynamic';

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/* POST /api/sales-planning/contracts/[id]/approve-external
   ── AE Supervisor อนุมัติให้ "เอกสารภายนอก" ใช้แทนสัญญา (mig 0322 · มติ 2026-08-30)
   ───────────────────────────────────────────────────────────────────────────

   ⭐ **นี่ไม่ใช่ `/sign` อีกตัว** — `/sign` ตอบว่า *"ลูกค้าเซ็นสัญญาของเรากลับมาแล้ว"*
   ซึ่งเป็นงานธุรการของใบที่ผ่านขั้นตอนมาครบ · ใบนี้ตอบคำถามคนละข้อ:
   **"เอกสารที่ไม่ใช่สัญญาของเรา ผูกพันพอจะเดินงานได้ไหม"** ⇒ เป็นการ *ตัดสิน* ไม่ใช่บันทึก

   🔴 **ด่านจึงต่างกัน และห้ามลอกของ `/sign`** — `/sign` ใช้ `canEditSalesPlanning`
   ซึ่ง **AE กับ AC ผ่านหมด** · การกดปุ่มนี้ปลดล็อกด่าน "จ่ายก่อนบริการ" ของทั้งเฟส
   ⇒ ถ้า AE อนุมัติเอกสารของดีลตัวเองได้ ด่านทั้งเส้นรั่วตั้งแต่ขั้นแรก
   ⇒ ด่านจริงอยู่ที่ `externalApproveError` ตัวเดียวกับที่ปุ่มบนจอถาม

   ⚠️ **ชั้นสิทธิ์ที่ของจริงมีสามชั้น อย่าเข้าใจผิดว่าชั้นนี้คือด่าน**
     1. proxy — `/api/sales-planning/*` ทั้ง namespace ต้องมี `salesplan:edit`
        (`src/proxy.js` บรรทัดท้ายของกลุ่ม) ⇒ FN/TS/RD โดนตัดตั้งแต่ยังไม่ถึงไฟล์นี้
     2. บรรทัดล่างนี้ — `canViewSalesPlanning` เป็นแค่กันคนที่ไม่มีสิทธิ์เห็นโมดูลเลย
        **ไม่ได้ทำหน้าที่เลือกผู้อนุมัติ** และหลวมกว่าชั้น 1 โดยตั้งใจ เพื่อให้ที่เดียว
        ที่ตอบว่า "ใครกดได้" คือ `externalApproveError`
     3. `externalApproveError` — **ด่านจริง**: ae_supervisor หรือ admin เท่านั้น
   ⇒ วันที่มติเปลี่ยนผู้อนุมัติ ให้แก้ที่ `canApproveExternalContract` ที่เดียว
     (ถ้าผู้อนุมัติใหม่ไม่มี `salesplan:edit` ต้องเพิ่มกฎ proxy ให้ด้วย — ชั้น 1 มองไม่เห็น
     ด่านใน handler เลย · บทเรียนเดียวกับตอนฝ่ายบัญชีได้ปุ่มที่กดแล้ว 403)

   ⭐ **ออกเลข CT ให้ด้วย** (มติผู้ใช้ 2026-08-30 เลือกเอง) — เลข CT คือเลขของ
   *ทะเบียนสัญญา* ส่วน PO/อีเมลคือ *หลักฐาน* ที่แนบ ⇒ ทุกแถวในทะเบียนมีเลขเหมือนกันหมด
   ⇒ ใช้ RPC `approve_external_sales_contract` ซึ่งออกเลข + เปลี่ยนสถานะเป็น `signed`
     ในทรานแซกชันเดียว · **ห้ามใช้ `issue_sales_contract`** เพราะตัวนั้นจบที่
     `awaiting_signature` ซึ่งสาย external ไม่มีขั้นนั้น และไม่มีปุ่มไหนพาใบออกมาจากตรงนั้น */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const signedFileId = String(body?.signedFileId || '').trim();
  const effectiveDate = String(body?.effectiveDate || '').trim();
  const expiryDate = String(body?.expiryDate || '').trim();
  const signedDate = String(body?.signedDate || '').trim() || effectiveDate;

  if (effectiveDate && !isDate(effectiveDate)) return badRequest('วันที่เริ่มมีผลไม่ถูกต้อง (ปี-เดือน-วัน)');
  if (expiryDate && !isDate(expiryDate)) return badRequest('วันที่สิ้นสุดไม่ถูกต้อง (ปี-เดือน-วัน)');
  if (signedDate && !isDate(signedDate)) return badRequest('วันที่บนเอกสารไม่ถูกต้อง (ปี-เดือน-วัน)');

  /* ด่านเดียวกับปุ่มบนจอ — ขัดกันไม่ได้ (แพตเทิร์นเดียวกับ financeActionError) */
  const gate = externalApproveError(before, user, { signedFileId, effectiveDate, expiryDate });
  if (gate) return fail(gate, 409);

  /* ไฟล์ต้องเป็นไฟล์แนบของสัญญาใบนี้จริง ไม่ใช่ id ไฟล์ใบอื่นที่ยิงมาตรง ๆ
     (ด่านเดียวกับ `/sign` — คนละคำถามกับ "มีไฟล์ไหม" ที่ `externalApproveError` ถาม) */
  const { data: file, error: fileError } = await supabase
    .from('attachments').select('id, "entityType", "entityId"').eq('id', signedFileId).maybeSingle();
  if (fileError) return fail(fileError.message, 500);
  if (!file || file.entityType !== 'contract' || file.entityId !== id) {
    return badRequest('ไฟล์ที่อ้างถึงไม่ใช่ไฟล์แนบของสัญญาใบนี้');
  }

  const now = new Date();
  /* เลขที่ของสาย external ใช้รูปแบบเดียวกับสายเจนทุกประการ รวมอักษรย่อชนิดสัญญา —
     ต่างกันแค่ *เมื่อไรที่ออกเลข* (ตอนอนุมัติ ไม่ใช่ตอนกดออกสัญญา) */
  const pattern = contractNumberPattern(before.kind);
  if (!pattern) return fail('ชนิดสัญญาของใบนี้ไม่รู้จัก — ออกเลขที่ไม่ได้', 409);
  const { prefix, width } = documentNumberSlots(pattern, { date: now });

  const { data: approved, error: rpcError } = await supabase.rpc('approve_external_sales_contract', {
    p_id: id,
    p_month: CONTRACT_NUMBER_MONTH,
    p_prefix: prefix,
    p_width: width,
    p_patch: {
      signedDate,
      signedAt: now.toISOString(),
      signedFileId,
      effectiveDate,
      expiryDate,
      approvedById: user.id || null,
      approvedByName: user.name || null,
      approvedAt: now.toISOString(),
      externalRef: typeof body?.externalRef === 'string'
        ? (body.externalRef.trim().slice(0, 200) || null)
        : (before.externalRef ?? null),
    },
  });
  if (rpcError) {
    const message = String(rpcError.message || '');
    /* 🪤 คอลัมน์ยังไม่มี = `master_row_assignments` ทิ้งคีย์เงียบ ๆ แล้ว CHECK ของฐานเตะ
       ⇒ บอกให้ตรงว่ายังไม่ได้รัน migration ไม่ใช่ปล่อยข้อความ 23514 ดิบให้ผู้ใช้อ่าน */
    if (message.includes('sales_contracts_external_approved') || message.includes('sales_contracts_external_kind')) {
      return fail('ระบบยังไม่ได้ติดตั้งส่วนของเอกสารภายนอก (migration 0322) — แจ้งผู้ดูแลระบบ', 500);
    }
    if (message.includes('contract_not_external')) return fail('ใบนี้ไม่ใช่สัญญาที่ใช้เอกสารภายนอก', 409);
    if (message.includes('contract_already_issued')) return fail('ใบนี้ออกเลขที่ไปแล้ว', 409);
    if (message.includes('contract_not_draft')) return fail('อนุมัติได้เฉพาะใบที่ยังเป็นร่าง', 409);
    return fail(message || 'อนุมัติเอกสารแทนสัญญาไม่สำเร็จ', 500);
  }

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: approved,
    summary: `อนุมัติ${externalDocKindLabel(approved.externalDocKind)}ใช้แทน${contractKindLabel(approved.kind)} `
      + `${approved.contractNo} (มีผล ${effectiveDate} ถึง ${expiryDate})`,
    request: req,
  });

  const { issuedHtml, ...rest } = approved;
  return ok(rest);
});
