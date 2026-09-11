// ── ช่างเพิ่มพื้นที่ที่เจอหน้างาน (มติข้อ 6 · แผน §9) ──────────────────────
//
// 🐞 **คอลัมน์ที่มีมาตั้งแต่ mig 0314 แต่ไม่มีทางไปถึง** — `service_survey_zones.status`
//   รับค่า `'added'` มาตั้งแต่วันแรก · ป้ายบนจอ SA ก็เขียนรอไว้แล้ว
//   (`SurveyDetail.js` → "เจ้าหน้าที่เพิ่มหน้างาน") แต่ **ไม่มีจุดเขียนสักจุดในทั้งระบบ**:
//   INSERT มีเส้นเดียวคือตอน SA เปิดใบ (ไม่ส่งคอลัมน์ status ⇒ ได้ DEFAULT `'ok'` เสมอ)
//   และ `PATCH` ของช่างปฏิเสธค่านี้ตรง ๆ โดยอ้างถึง "เส้นสร้างแถว" — **ซึ่งไม่เคยมีอยู่จริง**
//   ⇒ ช่างที่ไปถึงแล้วเจอโถงที่ใบไม่ได้ขอมา ทำได้อย่างเดียวคือโทรบอก SA ให้เปิดใบใหม่
//
// 🔴 **จังหวะออกรหัส ZN ต่างจากของ SA และต้องต่างจริง ๆ** — พื้นที่ใหม่ที่ SA พิมพ์ตอนเปิดใบ
//   รอถึง "ตอนกดส่งใบ" ถึงได้รหัส (`materializeSurveyZones`) เพราะร่างที่ถูกทิ้งต้องไม่กิน
//   เลข ZN · แต่พื้นที่ที่เพิ่มหน้างาน**เกิดหลังใบถูกส่งไปแล้ว** ⇒ ไม่มีจังหวะ "กดส่ง" ให้รอ
//   อีก ⇒ ถ้าปล่อย `zoneId` ว่างไว้ แถวนั้นจะ **หายจากทะเบียนพื้นที่ของลูกค้าสองชั้น**
//   (ชั้นอ่าน `.in('zoneId', …)` และชั้นคำนวณ `if (!row.zoneId) continue`) ⇒ ขายไม่ได้
//   ลงเครื่องไม่ได้ ไม่โผล่ให้ติ๊กในรอบหน้า — เงียบสนิท ไม่มี error
//   ⇒ **ออกรหัสทันทีตรงนี้** โดยเรียกตัวเดิม (มันรันซ้ำได้และผูกชื่อซ้ำเข้าโซนเดิมให้เอง)
//   ⚠️ ไม่ขัดกฎ "ร่างต้องไม่ทิ้งอะไรไว้ในทะเบียน" ที่หัวไฟล์ `surveyRepo.js` — กฎนั้นพูดถึง
//     *ร่าง* · ใบที่ช่างกำลังยืนวัดอยู่ถูกส่งไปแล้ว · และถ้าใบถูกยกเลิก/ช่างลบพื้นที่ทีหลัง
//     ตัวเก็บกวาดของ §5E③ ลบได้เฉพาะโซนที่ **ใบนี้สร้าง** (`createdBySurveyRequestId` · mig 0355
//     — materializeSurveyZones เขียนให้) · ชื่อไปชนโซนเดิมในทะเบียน = ผูกเฉย ๆ ไม่ได้ตัวชี้ ⇒ ไม่ถูกลบ
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService } from '@/lib/permissions';
import { genId } from '@/lib/id';
import { surveyAddZoneError } from '@/lib/service/survey';
import { normalizeAddedZone, surveyRowNameClash, zoneNameKey } from '@/lib/service/surveyRequest';
import { loadSiteZones, loadSurveyZones, loadZoneSurveyLocks, materializeSurveyZones } from '@/lib/service/surveyRepo';
import { busySurveyRequests } from '@/lib/service/zonePickState';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const dynamic = 'force-dynamic';

// POST { name, floor, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    /* ด่านชั้นนอกชุดเดียวกับการบันทึกผลวัด — คนจัดคิว (`service:edit`) หรือ
       เจ้าหน้าที่หน้างาน (`service:work`) เท่านั้น */
    const canEditAll = canEditService(user);
    if (!canEditAll && !canDoFieldWork(user)) return forbidden();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');
    if (request.kind !== 'site_survey') return badRequest('ใบนี้ไม่ใช่ใบประเมินพื้นที่');
    /* ไม่มีไซต์ = ออกรหัสโซนไม่ได้ (รหัส ZN อ้างเลขรันของไซต์) ⇒ ตีกลับตั้งแต่ต้น
       ดีกว่าปล่อยไปตายที่ `materializeSurveyZones` หลังแถวถูกสร้างไปแล้ว */
    if (!request.siteId) return conflict('ใบนี้ยังไม่ได้ผูกสถานที่ — เพิ่มพื้นที่ไม่ได้');

    /* 🔑 ด่านรายใบตัวเดียวกับ `PATCH` — ช่างเขียนได้เฉพาะใบที่ตัวเองถูกมอบหมาย
       (นัดของใบประเมินคือที่เดียวที่บอกว่า "ใครไป") */
    const visit = await findSurveyVisit(supabase, id);
    const access = visitWriteAccess({ user, visit, canEditAll });
    const gate = surveyAddZoneError(request, { canWrite: access.ok === true });
    if (gate) return access.ok ? conflict(gate) : forbidden(access.error || gate);

    const body = await req.json().catch(() => ({}));
    const zone = normalizeAddedZone(body);
    if (zone.error) return badRequest(zone.error);

    const rows = await loadSurveyZones(supabase, id);
    const clash = surveyRowNameClash(zone.value.name, rows);
    if (clash) return badRequest(clash);

    /* ── ชื่อตรงกับพื้นที่ที่มีอยู่แล้วในไซต์ = **ผูกเข้าอันเดิม ไม่ใช่สร้างซ้อน** ──────
       `materializeSurveyZones` ทำให้เองอยู่แล้ว (มันเทียบชื่อกับทะเบียนก่อนสร้าง)
       ⚠️ แต่โซนเดิมอาจ **มีใบสั่งวัดใบอื่นค้างอยู่** — ประตูใหม่บานนี้ต้องเจอยามตัวเดียวกับ
         ที่ฟอร์มของ SA เจอ ไม่งั้นมันคือทางลัดที่เดินอ้อมยามได้ (เฟส 3A)
       ⚠️ ตัดใบของตัวเองออกก่อนถาม — ใบนี้เปิดอยู่แน่นอน จะกลายเป็น "ใบค้าง" ของตัวเอง */
    const existing = await loadSiteZones(supabase, request.siteId);
    const hit = existing.find((z) => zoneNameKey(z.name) === zoneNameKey(zone.value.name));
    if (hit) {
      const { rows: openRows, requestsById } = await loadZoneSurveyLocks(supabase, [hit.id]);
      const busy = busySurveyRequests(openRows.filter((r) => r.requestId !== id), requestsById);
      const owner = busy.get(hit.id);
      if (owner) {
        return conflict(`พื้นที่ "${hit.name}" (${hit.code || hit.id}) มีใบสั่งวัดค้างอยู่แล้ว`
          + ` ${owner.docNo || owner.id} — รอใบนั้นจบก่อน`);
      }
    }

    /* ⭐ **`status: 'added'` ถูกตั้งที่นี่ที่เดียว** — เป็นข้อเท็จจริงของเส้นทางที่แถวเกิด
       ไม่ใช่ค่าที่ client เลือกได้ (`normalizeAddedZone` ไม่มีช่องนี้ให้ส่งมา) */
    const row = {
      id: genId('SVZ'),
      requestId: id,
      zoneId: null,
      zoneName: zone.value.name,
      floor: zone.value.floor,
      note: zone.value.note,
      status: 'added',
      sortOrder: rows.reduce((max, r) => Math.max(max, Number(r.sortOrder) || 0), 0) + 1,
      surveyedById: user.id ? String(user.id) : null,
      surveyedByName: user.name || null,
    };
    const { error: insertError } = await supabase.from('service_survey_zones').insert(row);
    if (insertError) return fail(insertError.message, 500);

    /* ออกรหัส ZN ทันที — ดูเหตุผลที่หัวไฟล์
       🔴 **ล้มแล้วต้องถอนแถวคืน** — ปล่อยแถวที่ไม่มี `zoneId` ค้างไว้ = พื้นที่ที่มองไม่เห็น
         ในทะเบียน แต่ยัง **ล็อกใบไม่ให้ส่งผล** ได้ (ด่านหกข้อบล็อกทั้งใบ ไม่ใช่รายแถว)
         ⇒ แถวอายุไม่กี่วินาที ยังไม่มีทางมีไฟล์แนบ ⇒ ลบตรง ๆ ได้ ไม่ต้องกวาดไฟล์ */
    const { error: codeError } = await materializeSurveyZones(supabase, {
      requestId: id, siteId: request.siteId, user,
    });
    if (codeError) {
      await supabase.from('service_survey_zones').delete().eq('id', row.id);
      return fail(codeError, 500);
    }

    const { data, error } = await supabase
      .from('service_survey_zones').select('*').eq('id', row.id).single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_survey_zone', entityId: row.id,
      after: data,
      summary: `ช่างเพิ่มพื้นที่หน้างาน ${data.zoneName} (ชั้น ${data.floor})`
        + ` ในใบ ${request.docNo || id}`,
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
