// ── เพิ่มไซต์ย้อนหลัง — ไซต์ · โซน · จุดติดตั้ง ในคำขอเดียว (มติผู้ใช้ 2026-09-11) ──
//
// POST { preview?, site?, targetSiteId?, zones: [{ key, name, floor, building?, note?, spots? }] }
//   preview      = ตรวจอย่างเดียว ไม่เขียนอะไร (ขั้น ③ ของโมดัล) — ตัวตัดสินชุดเดียวกับตอนบันทึก
//   targetSiteId = โหมด "เติมโซน/จุดต่อในไซต์นี้" (ไซต์มีอยู่แล้ว · ไม่สร้างไซต์)
//
// ⭐ **ข้อยกเว้นเฉพาะข้อมูลเก่า** ของมติ 30/08 "ใบคำร้องคือทางเกิดของไซต์ทางเดียว" — เหตุผลเต็ม
//   ที่ `lib/service/legacySite.js` · ยาม `siteOrigin.test.mjs` บันทึกข้อยกเว้นนี้ไว้
// ⭐ **ไม่เชื่อมเครื่อง · ใบสั่งขาย · สัญญา · การจ่าย** (ขอบเขตที่ผู้ใช้เคาะ) — body ส่งอะไร
//   อย่างอื่นมาก็ไม่อ่าน
//
// 🔑 สิทธิ์ = `canEditService` (แอดมิน · Planner · หัวหน้า/Audit/Senior TS) — ตรงกับสิทธิ์เพิ่ม
//   โซนที่มีอยู่แล้ว (มติข้อ B) · ฝ่ายขายสร้างไซต์ได้ทางใบคำร้อง แต่เพิ่มโซนไม่ได้ ⇒ ไม่อยู่ในนี้
//
// ⚠️ **ไม่มีทรานแซกชันครอบทั้งงาน** (PostgREST) — ออกแบบแบบเดียวกับตัวนำเข้า: ตรวจทุกด่านก่อน
//   เขียนแถวแรก → ไซต์ → โซนทีละแถว (จุดไปพร้อมโซนในแถวเดียว) · โซนไหนล้ม ข้ามเฉพาะโซนนั้น
//   แล้วคืนว่าอะไรสร้างแล้ว/ยังไม่สร้าง ⇒ จอส่งส่วนที่เหลือซ้ำด้วยโหมดเติมต่อ ไม่สร้างไซต์ซ้อน
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest, notFound } from '@/lib/http';
import { customerSnapshotName } from '@/lib/master/customerName';
import { buildThaiAdminIndex } from '@/lib/master/thaiAdmin';
import { SITE_RUN_BUCKET, SITE_RUN_WIDTH } from '@/lib/service/siteCode';
import { ZONE_RUN_BUCKET, ZONE_RUN_WIDTH, zoneCodePrefix } from '@/lib/service/zoneCode';
import { checkSiteReferences } from '@/lib/service/siteReferences';
import {
  legacyPlanCounts, legacyPlanMessage, planLegacySiteRow, planLegacyZones,
} from '@/lib/service/legacySite';
import {
  findCustomer, findSite, loadSites, loadZones, requireService, zoneSpotsColumnError,
} from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

const makeSpotId = () => genId('SPT');

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const preview = body.preview === true;
  const targetSiteId = String(body.targetSiteId ?? '').trim() || null;

  try {
    /* ── 1) บริบท: ไซต์ปลายทาง (เติมต่อ) หรือ ลูกค้า + ไซต์ของเขา (สร้างใหม่) ─────────── */
    let target = null;
    let existingZones = [];
    let site = null;           // { value, prefix, duplicate, errors } ของไซต์ใหม่
    let customer = null;
    const errors = [];

    if (targetSiteId) {
      target = await findSite(supabase, targetSiteId);
      if (!target) return notFound('ไม่พบไซต์ที่จะเติมโซน/จุดต่อ');
      // คลังไม่ใช่ไซต์ลูกค้า — ทางนี้คือของเก่าที่ติดตั้งอยู่หน้างาน (mig 0332)
      if (target.kind && target.kind !== 'customer') return badRequest('ไซต์นี้เป็นคลัง — เติมโซนย้อนหลังได้เฉพาะไซต์ลูกค้า');
      existingZones = await loadZones(supabase, target.id);
    } else {
      customer = body.site?.customerId ? await findCustomer(supabase, String(body.site.customerId)) : null;
      /* ⚠️ ไซต์ของลูกค้า **ทุกชนิดทุกสถานะ** — ชื่อซ้ำกับไซต์ที่ปิดใช้งานก็ยังเป็นซ้ำ */
      const customerSites = customer
        ? await loadSites(supabase, { customerId: customer.id, includeInactive: true, kind: null })
        : [];
      site = planLegacySiteRow(body.site || {}, { customer, customerSites });
      errors.push(...site.errors);
      // ที่อยู่ต้นทาง (mig 0313) — ต้องเป็นแถวใน addresses[] ของลูกค้ารายนี้จริง
      if (site.value && customer) {
        const refError = await checkSiteReferences(supabase, site.value, customer);
        if (refError) errors.push(refError);
      }
    }

    const planned = planLegacyZones(body.zones, {
      existingZones, siteCode: target?.code || null, makeSpotId,
    });
    errors.push(...planned.errors);

    // โหมดเติมต่อที่ไม่มีโซนสักแถว = ไม่มีอะไรให้บันทึก (โหมดสร้างบันทึกไซต์เปล่าได้ — ยังไม่รู้พื้นที่)
    if (target && !planned.zones.length && !planned.errors.length) {
      errors.push('ยังไม่มีโซนที่จะเติม — เพิ่มอย่างน้อยหนึ่งโซน');
    }

    if (errors.length) {
      const message = legacyPlanMessage(errors);
      const payload = {
        errors,
        duplicate: site?.duplicate
          ? { id: site.duplicate.id, code: site.duplicate.code, name: site.duplicate.name }
          : null,
      };
      /* ชื่อซ้ำอย่างเดียว = 409 (มีของอยู่แล้ว) · ที่เหลือ = 400 (กรอกไม่ครบ/ผิดรูป)
         ⚠️ ส่ง `duplicate` กลับด้วย — จอต้องมีปุ่ม "เปิดไซต์เดิม / เติมต่อในไซต์นี้" ได้ทันที
            (กดบันทึกแล้วเน็ตหลุด กดใหม่มาชนด่านนี้ = ทางกลับเข้าโหมดเติมต่อ) ⇒ ใช้ ok() ใส่
            status เอง เพราะ badRequest/conflict ส่งได้แค่ข้อความ */
      const status = errors.length === 1 && site?.duplicate ? 409 : 400;
      return ok({ error: message, ...payload }, status);
    }

    const counts = legacyPlanCounts(planned.zones);

    /* คอลัมน์จุดต้องมีก่อนเขียนแถวแรก — ไม่งั้นไซต์/โซนเกิดแต่จุดหายเงียบ (ดู zoneSpotsColumnError)
       ตรวจตั้งแต่พรีวิว: จอขั้น ③ ต้องไม่บอก "ผ่านทุกด่าน" ในเมื่อบันทึกจริงจะเสียของ */
    if (counts.spots > 0) {
      const schemaError = await zoneSpotsColumnError(supabase);
      if (schemaError) return fail(schemaError, 503);
    }

    /* ── 2) พรีวิว — ไม่เขียนอะไร ────────────────────────────────────────── */
    if (preview) {
      return ok({
        preview: true,
        site: target
          ? { id: target.id, code: target.code, name: target.name, customerName: target.customerName || null, existing: true }
          : { codePrefix: site.prefix, name: site.value.name, customerName: customerSnapshotName(customer) },
        /* รหัสโซนเต็มท่อนหน้าได้เฉพาะโหมดเติมต่อ — โหมดสร้าง ไซต์ยังไม่มีเลขรัน (ออกตอนบันทึก) */
        zones: planned.zones.map((z) => ({
          key: z.key, name: z.value.name, floor: z.value.floor,
          codePrefix: target ? zoneCodePrefix({ siteCode: target.code, floor: z.value.floor }).prefix : null,
          spotCount: z.value.spots.length, spots: z.value.spots.map((s) => s.label),
        })),
        counts,
      });
    }

    /* ── 3) บันทึก: ไซต์ ───────────────────────────────────────────────────── */
    let siteRow = target;
    if (!target) {
      /* ชื่อจังหวัดมาจากทะเบียนตามรหัส — ไม่เชื่อข้อความที่จอส่งมา (รหัสคือตัวตน) */
      const provinceTh = buildThaiAdminIndex().byProvinceCode.get(String(site.value.provinceCode))?.th
        || site.value.province;
      const customerName = customerSnapshotName(customer);
      const { data, error: insertError } = await insertRowWithComposedCode(
        supabase,
        { scope: 'SS', bucket: SITE_RUN_BUCKET, prefix: site.prefix, width: SITE_RUN_WIDTH },
        {
          id: genId('SVS'),
          ...site.value,
          province: provinceTh,
          customerName,
          createdById: user.id ? String(user.id) : null,
          createdByName: user.name || null,
        },
      );
      if (insertError) return fail(insertError.message, 500);
      siteRow = data;
      await recordAudit({
        user, action: 'create', entityType: 'service_site', entityId: data.id, after: data,
        summary: `เพิ่มไซต์ย้อนหลัง ${data.code || data.id} · ${data.name} (${customerName})`,
        request: req,
      });
    }

    /* ── 4) บันทึก: โซนทีละแถว (จุดติดตั้งอยู่ในแถวเดียวกัน) ──────────────────────
       ⚠️ ล้มรายโซนไม่หยุดทั้งงาน — ไซต์ถูกสร้างไปแล้ว ถอยไม่ได้ (ไม่มีทรานแซกชัน) ⇒ บอกว่า
          โซนไหนสร้างแล้ว/ยังไม่สร้าง แล้วให้จอส่งส่วนที่เหลือซ้ำด้วยโหมดเติมต่อ */
    const zoneResults = [];
    for (const zone of planned.zones) {
      const { prefix, error: codeError } = zoneCodePrefix({ siteCode: siteRow.code, floor: zone.value.floor });
      if (codeError) { zoneResults.push({ key: zone.key, name: zone.value.name, error: codeError }); continue; }
      const { data, error: insertError } = await insertRowWithComposedCode(
        supabase,
        { scope: 'ZN', bucket: ZONE_RUN_BUCKET, prefix, width: ZONE_RUN_WIDTH },
        {
          id: genId('SZN'),
          siteId: siteRow.id,
          ...zone.value,
          createdById: user.id ? String(user.id) : null,
          createdByName: user.name || null,
        },
      );
      if (insertError) {
        zoneResults.push({
          key: zone.key,
          name: zone.value.name,
          error: insertError.code === '23505'
            ? `ไซต์นี้มีโซนชื่อ “${zone.value.name}” อยู่แล้ว`
            : insertError.message,
        });
        continue;
      }
      /* ⚠️ นับเฉพาะที่ฐานคืนมา — ห้ามถอยไปนับจากที่ขอ (ของเดิมทำ) เพราะกรณีเดียวที่ `spots`
         ไม่กลับมาคือจุดถูกทิ้ง ⇒ ถอยไปนับที่ขอ = บอก "บันทึก 3 จุด" ทั้งที่ฐานมี 0 */
      const savedSpots = Array.isArray(data.spots) ? data.spots.length : 0;
      zoneResults.push({
        key: zone.key, id: data.id, code: data.code, name: data.name, spotCount: savedSpots,
        ...(savedSpots < zone.value.spots.length
          ? { spotError: `จุดติดตั้งถูกบันทึก ${savedSpots}/${zone.value.spots.length} จุด — เติมที่ปุ่มแก้ไขโซนในหน้าไซต์` }
          : {}),
      });
      await recordAudit({
        user, action: 'create', entityType: 'service_zone', entityId: data.id, after: data,
        summary: `เพิ่มโซนย้อนหลัง ${data.code || data.id} · ${data.name} ที่ไซต์ ${siteRow.code || siteRow.name}`
          + ` · จุดติดตั้ง ${savedSpots} จุด`,
        request: req,
      });
    }

    const failed = zoneResults.filter((z) => z.error);
    return ok({
      site: { id: siteRow.id, code: siteRow.code, name: siteRow.name, created: !target },
      zones: zoneResults,
      counts: {
        zones: zoneResults.length - failed.length,
        spots: zoneResults.reduce((sum, z) => sum + (z.error ? 0 : z.spotCount || 0), 0),
      },
      partial: failed.length > 0 || zoneResults.some((z) => z.spotError),
    }, target ? 200 : 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
