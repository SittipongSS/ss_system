// ── ใช้ Artwork ของสินค้ายื่นทะเบียนสรรพสามิต (มติเจ้าของ 04/11/2026 "ปุ่มใช้ไฟล์นี้ยื่น") ──────────────────────────────
//
// ⭐ ปุ่ม "ใช้ไฟล์นี้ยื่น" ในแผงทะเบียนฝั่งขาย (`RegistrationWorkModal`) — เส้นนี้ **คัดลอกไบต์เป็นไฟล์ใหม่** ในโฟลเดอร์ของทะเบียน
//   แล้วออกใบรับการอัปให้คนกด · **ไม่เขียนแถวไฟล์แนบ**: เบราว์เซอร์แนบไฟล์ใหม่ผ่านเส้นไฟล์แนบเส้นเดียวของระบบต่อเอง
//   (`lib/excise/registrationArtworkReuse.js`) และถอยไฟล์ด้วย `DELETE /api/upload` ถ้าแนบไม่ผ่าน
// 🔑 **ด่านทั้งเก้าข้อและข้อความอยู่ที่ `lib/excise/registrationArtworkCopy.js`** — เส้นนี้แค่อ่านทะเบียนแล้วส่งต่อ
//   ข้อแรก (รูปของ body) ถูกถามที่นี่ก่อนด้วย เพื่อให้คำขอผิดรูปถูกปฏิเสธ **ก่อนแตะฐาน**
// ⚠️ proxy เปิด POST ใต้ `/api/excise-registrations` ให้ products:edit / ra:approve — route ถามซ้ำ (กฎ 1 ของ systemRules) · ด่านรายใบคือสิทธิ์แนบเอกสารของทะเบียนในตัวกลาง
// ⚠️ อ่านทะเบียนไม่ได้ = 500 ไม่ใช่ 404 (supabase-js ไม่ throw — อ่าน `{ error }` เอง)
import { withUser, ok, fail } from '@/lib/http';
import { canUser } from '@/lib/permissions';
import {
  REGISTRATION_ARTWORK_COPY_ERRORS, copyProductArtworkToRegistration, registrationArtworkSource,
} from '@/lib/excise/registrationArtworkCopy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { attachmentId } — id ของแถว Artwork บนสินค้าของทะเบียนนี้
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    if (!user) return fail('unauthorized', 401);
    /* ด่านชั้นแรกตรงกับ proxy (POST ใต้ `/api/excise-registrations` = products:edit / ra:approve) — คนที่ไม่ถือสักตัว
       ถูกปฏิเสธก่อนแตะฐาน · ด่านรายใบ (แนบเอกสารของทะเบียนนี้ได้ไหม) อยู่ในตัวกลาง */
    if (!canUser(user, 'products:edit') && !canUser(user, 'ra:approve')) return fail(REGISTRATION_ARTWORK_COPY_ERRORS.forbidden, 403);
    const raw = await req.json().catch(() => null);
    const attachmentId = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.attachmentId : null;
    if (!registrationArtworkSource(attachmentId)) return fail(REGISTRATION_ARTWORK_COPY_ERRORS.shape, 400);

    const { data: registration, error } = await supabase
      .from('excise_registrations').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error.message, 500);

    const result = await copyProductArtworkToRegistration(supabase, { registration: registration || null, attachmentId, user });
    return result.status === 201 ? ok(result.body, 201) : fail(result.body.error, result.status);
  } catch (e) {
    return fail(e.message, 500);
  }
});
