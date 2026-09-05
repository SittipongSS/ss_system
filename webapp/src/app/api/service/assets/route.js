// ── ทะเบียนเครื่องรวมทุกไซต์ (เฟส B) + จุดเกิดของเครื่อง (mig 0344) ───────
//
// ⭐ **เส้นแรกของระบบที่ถามเครื่องโดยไม่ผ่านไซต์** — ทุก route ของเครื่องก่อนหน้านี้
//   อยู่ใต้ `/api/service/sites/[id]/assets/` ⇒ คำถามพื้นฐานอย่าง "เครื่อง OV08-0334
//   อยู่ไหน" ตอบไม่ได้เลย ต้องรู้ไซต์ก่อนถึงจะถามถึงเครื่องได้
//
// ⭐ **POST = "เพิ่มเครื่อง" ขึ้นทะเบียน** (mig 0344) — ย้ายมาอยู่ที่นี่เพราะการ
//   ขึ้นทะเบียนคือการบอกว่า **บริษัทได้เครื่องมา** ไม่ใช่การใส่ของเข้าสถานที่
//   ⇒ เครื่องที่ยังไม่ได้ติดตั้งไม่มีไซต์ให้เอา id มาใส่ใน URL ตั้งแต่แรก
//   ⚠️ เส้นเดิม `POST /api/service/sites/[id]/assets` **ยังอยู่** — มันคือการเพิ่ม
//     เครื่องเข้าไซต์ที่รู้ปลายทางอยู่แล้ว (เช่นตอนติดตั้งหน้างาน) คนละงานกัน
import { genId } from '@/lib/id';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { businessDate } from '@/lib/businessDate';
import { MACHINE_CODE_SCOPE, MACHINE_RUN_BUCKET, MACHINE_RUN_WIDTH, machineCodePrefix } from '@/lib/service/machineCode';
import { machineAddError, machineRow } from '@/lib/service/machineAdd';
import { findAssetModel } from '@/lib/service/assetModelsRepo';
import { findZone, loadAllAssets, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  /* ด่านระดับโมดูล ไม่ใช่รายไซต์ — `requireSite` ใช้ไม่ได้เพราะเส้นนี้ไม่มีไซต์เดียว
     ให้ตรวจ · ฝ่ายขายอ่านไม่ได้ (ไม่ส่ง forRequestForm) เพราะทะเบียนเครื่องเป็นของ TS */
  const access = requireService({ user });
  if (access.response) return access.response;

  try {
    const { assets, sites } = await loadAllAssets(supabase);
    const siteById = new Map(sites.map((s) => [s.id, s]));

    /* แนบ **ตัวตนของไซต์** ไปกับเครื่องแต่ละตัว ไม่ใช่ให้จอไปไล่หาเอง —
       จอทะเบียนต้องกรอง/เรียง/จัดกลุ่มด้วยชื่อไซต์และลูกค้า ซึ่งเป็นข้อมูลคนละตาราง
       ⚠️ `siteKind` คือตัวที่แยก "อยู่หน้างานลูกค้า" ออกจาก "อยู่ในคลัง" บนจอ —
          ห้ามให้จอเดาจาก customerId/arCode (บริษัทตัวเองมีไซต์ลูกค้าจริงด้วย)
       ⚠️ ตั้งแต่ mig 0344 **เครื่องไม่มีไซต์ได้** (สถานะ "ว่าง") ⇒ ช่องพวกนี้เป็น
          `null` ทั้งแถวโดยตั้งใจ ไม่ใช่ข้อมูลหาย · จอต้องอ่านเป็น "ยังไม่มีที่อยู่" */
    const rows = assets.map((asset) => {
      const site = asset.siteId ? (siteById.get(asset.siteId) || null) : null;
      return {
        ...asset,
        siteCode: site?.code || null,
        siteName: site?.name || null,
        siteKind: site?.kind || null,
        customerId: site?.customerId || null,
        customerName: site?.customerName || null,
        routeZone: site?.routeZone || null,
        province: site?.province || null,
      };
    });

    return ok(rows);
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { modelId, kind?, colour?, receivedAt, status?, broken?, siteId?, zoneId?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  try {
    const body = await req.json().catch(() => ({}));

    /* ⚠️ **โหลดของที่ด่านต้องใช้ก่อนเรียกด่าน** — ด่านตัดสินจากแถวจริง (รุ่นยังเปิด
       ใช้งานไหม · ไซต์เป็นคลังหรือหน้างาน) ไม่ใช่จาก id ที่ client ส่งมา */
    const model = body.modelId ? await findAssetModel(supabase, body.modelId) : null;
    let site = null;
    if (body.siteId) {
      const { data, error } = await supabase
        .from('service_sites').select('id, code, name, kind, isActive')
        .eq('id', body.siteId).maybeSingle();
      if (error) return fail(error.message, 500);
      site = data || null;
      if (!site) return badRequest('ไซต์ที่เลือกไม่มีอยู่ในระบบ');
      if (site.isActive === false) return badRequest(`ไซต์ ${site.name} ถูกปิดใช้งานอยู่`);
    }

    // 🔑 ด่านตัวเดียวกับที่จอใช้ปิดปุ่ม — fail-closed
    const gate = machineAddError(body, {
      canEdit: canEditService(user), model, site, today: businessDate(),
    });
    if (gate) return badRequest(gate);

    // ⚠️ โซนต้องเป็นของไซต์เดียวกัน — เชื่อ id จาก client ตรง ๆ ไม่ได้
    if (body.zoneId && site && !(await findZone(supabase, site.id, body.zoneId))) {
      return badRequest('โซนที่เลือกไม่อยู่ในไซต์นี้');
    }

    /* ประกอบ prefix **ก่อน** insert — ตกด่านตรงนี้ยังไม่มีแถวและยังไม่กินเลขรัน
       ⚠️ `YYMM` มาจาก **วันที่รับเข้า** ไม่ใช่นาฬิกา (ขึ้นทะเบียนย้อนหลังของเก่าได้) */
    const { prefix, error: codeError } = machineCodePrefix({
      modelCode: model.modelCode,
      receivedAt: body.receivedAt,
    });
    if (codeError) return badRequest(codeError);

    /* ⚠️ **`label` เป็น NOT NULL แต่รหัสยังไม่เกิดตอนนี้** — ตัวออกเลขกลางเป็นคน
       เติม `code` ตอน insert ⇒ อ้างถึงมันในค่าที่ส่งเข้าไปไม่ได้
       ⇒ ตั้ง `label` เป็น **ชื่อรุ่น** ซึ่งเป็นค่าจริงที่อ่านรู้เรื่องตั้งแต่วันแรก
         และ TS แก้เป็นชื่อตำแหน่ง ("เครื่องล็อบบี้ ซ้าย") ได้ตอนติดตั้ง
       🪤 **ห้ามตั้งเป็นค่าชั่วคราวแล้วค่อย UPDATE ทับ** — update ล้มเมื่อไรจะได้
         ชื่อขยะค้างอยู่บนทะเบียนถาวร และไม่มีใครรู้ว่ามันคือค่าชั่วคราว
       ⭐ ตัวตนของเครื่องคือ `code` ไม่ใช่ `label` — ทุกจออ่านรหัสจาก `code` */
    const row = {
      id: genId('SVA'),
      label: model.name,
      ...machineRow(body, { model, site, userId: user.id, userName: user.name }),
    };

    // รหัสออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
    const { data, error: insertError } = await insertRowWithComposedCode(
      supabase,
      { scope: MACHINE_CODE_SCOPE, bucket: MACHINE_RUN_BUCKET, prefix, width: MACHINE_RUN_WIDTH },
      row,
    );
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_asset', entityId: data.id, after: data,
      summary: `เพิ่มเครื่อง ${data.code} · ${model.name}${site ? ` ที่ไซต์ ${site.name}` : ' (ว่าง)'}`,
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
