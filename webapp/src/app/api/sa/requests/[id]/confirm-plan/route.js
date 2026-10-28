// ── ค่าตั้งต้นของฟอร์ม "ขอยืนยันหน้างาน" (ประเมินจากแบบ งวด S5 · สเปก A-1) — GET อย่างเดียว ──────────────────
// GET : ใบต้นทาง (ป้ายดีล/สถานที่) · ชื่อเรื่อง · พื้นที่ที่จะยกไปพร้อมตัวเลขรอบจากแบบ — หน้า `/requests/new?confirms=`
//       เอาไปตั้งฟอร์มล็อก (§2.3 ของสเปก)
//
// ⭐ **ตัวตัดสินคือ `surveyConfirmPlan` ตัวเดียวกับปุ่ม · POST สร้างร่าง · ด่านตอนยื่น** — route นี้ไม่ตัดสินเอง ⇒ ทุกประโยค
//   ที่ตอบมาจาก `surveyConfirmLink.js` (F1) และทุกการปฏิเสธมาถึงจอ **ก่อน** ผู้ใช้พิมพ์อะไร (N1 · N2 · N3 · N11 …)
// ⭐ **ตรวจสถานที่ซ้ำแบบเดียวกับ POST (R13)** — `loadSurveySite(..., { requireCustomer: true })` · หลังย้ายลูกค้า (datafix)
//   ถ้าไม่ตรวจที่นี่ ฟอร์มจะถูกกรอกจนเสร็จแล้วค่อยโดน POST ตีกลับด้วยคำแนะนำที่ฝ่ายขายทำตามไม่ได้
// 🔴 **อ่านอย่างเดียว ไม่เขียนอะไรเลย** — GET ที่เขียนข้อมูลคือกับดักที่เจอมาแล้ว (UAT ที่บล็อกแค่ non-GET ยังเขียน prod ได้)
// 🔴 **อ่านพัง = 500 ไม่ใช่ "ไม่มี"** — ตัวอ่านของงวดไม่ throw แต่คืน `{ error }` · `loadSurveySite` กับตัวซอยก้อน throw
//   ⇒ ห่อทั้ง handler · ไม่มีคำตอบครึ่งเดียว (ฟอร์มที่ได้พื้นที่ไม่ครบชุดคือฟอร์มที่บันทึกแล้วไม่ตรงกับที่เห็น)
// ⚠️ ทะเบียนโซนอ่านผ่าน `fetchAllInChunks` (เพดานแถว · R9) · ดีลอ่านด้วย primary key แถวเดียวผ่าน `loadSurveyConfirmDeal`
// ⚠️ proxy ปล่อยเส้นนี้ด้วย prefix `/api/sa/requests` ตัวเดียวกับใบแม่ (proxy.test.mjs ยืนยันว่าได้เท่ากัน) ·
//   ด่านจริงคือ `canViewRequests` + `canManageRequest` ของใบต้นทาง
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canManageRequest } from '@/lib/requests/access';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { loadSurveySite } from '@/lib/service/surveyRepo';
import { loadSurveyConfirmContext, loadSurveyConfirmDeal, loadSurveyConfirmOriginal } from '@/lib/service/surveyConfirmRepo';
import {
  SURVEY_CONFIRM_ID_PATTERN, SURVEY_CONFIRM_NO_ORIGINAL, surveyConfirmForbiddenText, surveyConfirmPlan,
  surveyConfirmPreviousRoundText,
} from '@/lib/service/surveyConfirmLink';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
/* ใบต้นทางในคำปฏิเสธ — จอใช้ทำลิงก์ "กลับไปที่ใบ …" (null เฉพาะ 404: ไม่มีใบให้กลับไป) */
const refOf = (row) => ({ id: row.id, docNo: row.docNo || null });
/* ป้ายดีล — รูปเดียวกับช่องดีลของฟอร์มแก้ (`lockedRefs.deal` ใน app/requests/[id]/page.js) */
const dealLabelOf = (deal, dealId) => (deal
  ? `${deal.code || deal.id}${deal.title ? ` — ${deal.title}` : ''}`
  : (dealId || ''));
/* ป้ายสถานที่ — รูปเดียวกับบรรทัดสถานที่ของบล็อกอ่านอย่างเดียวใน SurveySiteFields */
const siteLabelOf = (site) => [site?.code, site?.name].filter(Boolean).join(' · ') || site?.id || '';

export async function GET(_request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { id } = await params;
    const missing = () => answer({ error: SURVEY_CONFIRM_NO_ORIGINAL, code: 'confirm_no_original', open: null, original: null }, 404);
    /* id ที่ไม่ใช่รูปของคำร้อง = ไม่มีใบนั้น — ไม่ต้องถามฐาน */
    if (typeof id !== 'string' || !SURVEY_CONFIRM_ID_PATTERN.test(id)) return missing();

    const supabase = getSupabaseAdmin();
    const { original, error: originalError } = await loadSurveyConfirmOriginal(supabase, id);
    if (originalError) return answer({ error: originalError }, 500);
    /* ใบที่ไม่ใช่ประเมินพื้นที่ = แถว 1 ของแผน (N4) — ตอบก่อนด่านสิทธิ์ ใบของฝ่ายอื่นจึงไม่ได้ประโยค "เฉพาะฝ่ายผู้ขอ" */
    if (!original || original.kind !== 'site_survey') return missing();
    if (!canManageRequest(user, original)) {
      return answer({ error: surveyConfirmForbiddenText(original), original: refOf(original) }, 403);
    }

    const ctx = await loadSurveyConfirmContext(supabase, original);
    if (ctx.error) return answer({ error: ctx.error }, 500);
    const plan = surveyConfirmPlan({ original, ...ctx, stage: 'open' });
    if (!plan.ok) {
      return answer({
        error: plan.error, code: plan.code, open: plan.open, original: plan.status === 404 ? null : refOf(original),
      }, plan.status);
    }

    /* ดีล — ลูกค้ามาจากดีล ไม่ใช่จากแถวคำร้อง (ทางเดียวกับที่ POST อ่าน) · ตัวอ่านอยู่ใน `surveyConfirmRepo.js` (§2.2) */
    const { deal, error: dealError } = await loadSurveyConfirmDeal(supabase, original.dealId);
    if (dealError) return answer({ error: dealError }, 500);

    /* R13 — สถานที่ยังเป็นของลูกค้าของดีลไหม · ประโยคของ `loadSurveySite` ตัวเดียวกับที่ POST จะตอบ */
    const { site, error: siteError } = await loadSurveySite(
      supabase, original.siteId, deal?.customerId || null, { requireCustomer: true },
    );
    if (siteError) {
      return answer({ error: siteError, code: 'confirm_site_customer', open: null, original: refOf(original) }, 409);
    }

    /* ทะเบียนโซนของพื้นที่ที่ยก — รหัส · ชื่อปัจจุบัน · ชั้น (บรรทัดใบ้ของแต่ละแถวในฟอร์มล็อก) */
    const registry = await fetchAllInChunks(plan.carry.map((c) => c.zoneId), (chunk) => supabase
      .from('service_zones').select('id, code, name, floor').in('id', chunk).order('id', { ascending: true }));
    const zoneById = new Map(registry.map((z) => [z.id, z]));

    return answer({
      original: {
        id: original.id,
        docNo: original.docNo || null,
        title: original.title || null,
        dept: original.dept || null,
        dealId: original.dealId || null,
        dealLabel: dealLabelOf(deal, original.dealId),
        customerId: deal?.customerId || null,
        customerName: deal?.customerName || null,
        siteId: site.id,
        siteLabel: siteLabelOf(site),
      },
      title: plan.title,
      zones: plan.carry.map((c) => {
        const zone = zoneById.get(c.zoneId) || null;
        return {
          zoneId: c.zoneId,
          name: zone?.name || c.zoneName || c.zoneId,
          code: zone?.code || null,
          floor: zone?.floor ?? null,
          previous: surveyConfirmPreviousRoundText(c.previous, original.docNo),
        };
      }),
    });
  } catch (e) {
    console.error('[confirm-plan]', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
