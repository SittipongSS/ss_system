// ── API กลิ่นรายตัว (mig 0171) — แก้ / รับเข้าทะเบียน / เปลี่ยนสถานะ / ลบ ──
// action ทั้งหมดมาทาง PATCH ตัวเดียว (body.action) เพื่อให้ด่านสิทธิ์อยู่ที่เดียว
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  acceptScentError, archiveScentError, canEditScent, canViewScents,
  deleteScentError, isScentRegistrar, normalizeScentInput, scentTransitionError,
  sendScentError,
} from '@/lib/master/scents';
import {
  assertDerivedFromScent, countRegistryRefs, findScent, findScentDetail, updateScent,
} from '@/lib/master/scentFormulaAdmin';
import { canForceDelete, unlinkRegistryRefs, isDryRun, isForceRequest, scentForcePreview } from '@/lib/forceDelete';
import { purgeUpdates } from '@/lib/master/updates';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewScents(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    // ⚠️ ต่อ "ที่มา" และ "ราคา" ชุดเดียวกับหน้ารายการ — เปิดใบเดียวกันจากสองทาง
    // แล้วเห็นข้อมูลไม่เท่ากันคือโรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์ม
    const scent = await findScentDetail(supabase, id);
    if (!scent) return notFound('ไม่พบกลิ่น');
    return ok(scent);
  } catch (e) {
    return fail(e.message, 500);
  }
});

// PATCH /api/master/scents/[id]
//   { action: 'edit',   ...ฟิลด์เดียวกับตอนสร้าง }
//   { action: 'accept', code }            — RD รับร่างเข้าทะเบียน
//   { action: 'sent',   sentAt }          — RD บันทึกวันที่ส่งกลิ่นให้ลูกค้า
//   { action: 'status', status }          — developing ↔ active ↔ archived
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let scent;
  try {
    scent = await findScent(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'edit';

  try {
    if (action === 'edit') {
      if (!canEditScent(user, scent)) return forbidden('ไม่มีสิทธิ์แก้กลิ่นนี้');
      const { value, error } = normalizeScentInput({ ...scent, ...body });
      if (error) return badRequest(error);
      // ⚠️ ส่ง id ไปด้วย — กันกลิ่นอ้างตัวเองเป็นต้นทาง (constraint ของ 0205 กันอยู่
      // แล้ว แต่ที่นี่ได้ข้อความไทยแทน error ดิบของ Postgres)
      await assertDerivedFromScent(supabase, { ...value, id });
      /* ⭐ **แก้รหัสได้แล้ว** (มติผู้ใช้ 2026-08-10) — เดิมรหัสเปลี่ยนผ่าน action
         'accept' เท่านั้น ⇒ พิมพ์รหัสผิดตอนรับเข้าทะเบียนแล้วแก้ไม่ได้เลย ต้องลบ
         ทั้งแถวแล้วสร้างใหม่ ซึ่งช่วงย้ายระบบที่พิมพ์รหัสเป็นร้อยตัวคือกำแพงจริง
         ⚠️ **เฉพาะคนที่รับกลิ่นเข้าทะเบียนได้** — รหัสคือตัวตนที่ระบบอื่นอ้างถึง
         (ใบขอราคา · สินค้า · เอกสาร) ไม่ใช่ข้อความทั่วไปที่ใครก็แก้ได้
         ⚠️ สถานะยังเปลี่ยนผ่าน action เฉพาะทางเหมือนเดิม — กันหน้าจอส่งมาเงียบ ๆ */
      const { code, ...editable } = value;
      if (code !== undefined && code !== (scent.code ?? null)) {
        if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่แก้รหัสได้');
        /* 🐞 **ล้างรหัสของกลิ่นที่รับเข้าทะเบียนแล้วไม่ได้** — DB มี CHECK
           `status = 'draft' OR code IS NOT NULL` อยู่แล้ว แต่ปล่อยให้ชนที่ฐานจะได้
           error ดิบของ Postgres ที่คนอ่านไม่ออก · ตอบเป็นภาษาไทยตั้งแต่ที่นี่
           ⚠️ ร่างยังล้างได้ — ร่างที่ยังไม่มีรหัสคือสถานะปกติของมัน */
        if (!code && scent.status !== 'draft') {
          return badRequest('กลิ่นที่รับเข้าทะเบียนแล้วต้องมีรหัสเสมอ — แก้เป็นรหัสใหม่ หรือเก็บเข้ากรุแทน');
        }
        editable.code = code;
      }
      const data = await updateScent(supabase, id, editable);
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    if (action === 'accept') {
      // มติ 10: ฝ่ายขายเปิดร่างได้ แต่คนรับเข้าทะเบียนคือ RD เท่านั้น
      if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่รับกลิ่นเข้าทะเบียนได้');
      const error = acceptScentError(scent, body);
      if (error) return badRequest(error);
      const data = await updateScent(supabase, id, {
        code: String(body.code).trim(),
        status: 'developing',
        // RD ที่รับเรื่องเป็นเจ้าของกลิ่น ถ้ายังไม่มีใครถือ
        ownerId: scent.ownerId || user.id,
        ownerName: scent.ownerName || user.name || null,
        acceptedById: user.id,
        acceptedByName: user.name || null,
        acceptedAt: new Date().toISOString(),
      });
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    // ⭐ วันที่ส่งกลิ่นให้ลูกค้า — ช่องเดียวบนตัวกลิ่น ไม่ใช่แถวในตารางรอบอีกแล้ว
    // (กลิ่น 1 ตัวส่งครั้งเดียว · ลูกค้าให้แก้ ⇒ กลิ่นตัวใหม่ที่มีวันที่ของตัวเอง)
    // แก้ทับได้โดยตั้งใจ — คนกรอกผิดวันแล้วต้องแก้ได้ ไม่ใช่ลบกลิ่นทิ้งแล้วสร้างใหม่
    if (action === 'sent') {
      if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่บันทึกวันที่ส่งกลิ่นได้');
      const error = sendScentError(scent, body);
      if (error) return badRequest(error);
      const data = await updateScent(supabase, id, {
        sentAt: String(body.sentAt).trim(),
        sentById: user.id,
        sentByName: user.name || null,
      });
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
        summary: `บันทึกวันที่ส่งกลิ่น ${scent.code || scent.name}`,
      });
      return ok(data);
    }

    if (action === 'status') {
      if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่เปลี่ยนสถานะกลิ่นได้');
      const next = body.status;
      // ตรวจเส้นทางเสมอ · เคส archive ตรวจก่อนเพื่อให้ได้ข้อความที่ตรงกว่า
      // ("ร่างยังไม่ได้เข้าทะเบียน — ลบทิ้งแทน" ดีกว่า "เปลี่ยนสถานะไม่ได้")
      const error = (next === 'archived' ? archiveScentError(scent) : null)
        || scentTransitionError(scent, next);
      if (error) return badRequest(error);
      const data = await updateScent(supabase, id, { status: next });
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    return badRequest('action ไม่ถูกต้อง');
  } catch (e) {
    return badRequest(e.message);
  }
});

// DELETE — ปกติลบได้เฉพาะร่างที่ยังไม่มีประวัติการส่ง
// ?dryRun=1  พรีวิวว่าจะกระทบอะไรบ้าง (admin)
// ?force=1   break-glass ของผู้ดูแลระบบ: ลบได้ทุกสถานะ (แพตเทิร์นเดียวกับ
//            ใบเสนอราคา/SO/ใบขอราคาผลิต — ดู lib/forceDelete.js)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let scent;
  try {
    scent = await findScent(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');

  if (isDryRun(req) || isForceRequest(req)) {
    if (!canForceDelete(user)) return forbidden('บังคับลบต้องเป็นผู้ดูแลระบบ (admin)');
    const preview = await scentForcePreview(supabase, scent);
    if (isDryRun(req)) return ok(preview);

    /* ⭐ **ปลด pointer ที่เป็น RESTRICT ก่อน** (mig 0232) — คำร้อง · บรรทัดคำร้อง ·
       ทะเบียนราคา ไม่ยอมให้ลบกลิ่นที่ถูกอ้างอยู่แล้ว (เดิมฐานข้อมูลเซ็ต NULL ให้เอง
       เงียบ ๆ ซึ่งคือรูที่ R-5 ปิด) · ที่เหลือ (สินค้า/สูตร/สายพันธุ์) ยังเป็น SET NULL
       ⚠️ ปลดไม่สำเร็จต้องหยุด ไม่ใช่ลบต่อ — ไม่งั้นได้ 23503 ที่ผู้ใช้อ่านไม่ออก */
    try {
      await unlinkRegistryRefs(supabase, 'scent', id);
    } catch (unlinkError) {
      return fail(unlinkError.message, 500);
    }
    // เธรดเป็น polymorphic ไม่มี FK ต้องกวาดเองเหมือนทุก entity ที่ใช้ของกลาง
    const { error: delError } = await supabase.from('scents').delete().eq('id', id);
    if (delError) return fail(delError.message, 500);
    await purgeUpdates(supabase, 'scent', id);
    await recordAudit({
      user, action: 'delete', entityType: 'scent', entityId: id, before: scent, request: req,
      summary: `[admin force] ลบกลิ่น ${scent.code || scent.name} (สถานะ ${scent.status})`,
    });
    return ok({ ok: true, forced: true });
  }

  if (!canEditScent(user, scent)) return forbidden('ไม่มีสิทธิ์ลบกลิ่นนี้');

  // นับสดตอนจะลบ ไม่ใช่พ่วงมากับ findScent — ทุกหน้าที่อ่านกลิ่นจะต้องจ่ายค่านับนั้น
  // ทั้งที่ใช้จริงเฉพาะตอนลบ (เดิม findScent join Rev ทุกครั้งด้วยเหตุผลเดียวกันนี้)
  // ⚠️ นับทุก pointer ที่เป็น RESTRICT (mig 0232) ไม่ใช่แค่ `producedScentId` —
  // ช่องที่ตกหล่นจะผ่านด่านนี้แล้วไปตายที่ฐานข้อมูลด้วย 23503 ที่ผู้ใช้อ่านไม่ออก
  const error = deleteScentError(scent, {
    linkedCount: await countRegistryRefs(supabase, 'scent', id),
  });
  if (error) return badRequest(error);

  const { error: delError } = await supabase.from('scents').delete().eq('id', id);
  if (delError) return fail(delError.message, 500);
  await purgeUpdates(supabase, 'scent', id);
  await recordAudit({
    user, action: 'delete', entityType: 'scent', entityId: id, before: scent, request: req,
  });
  return ok({ ok: true });
});
