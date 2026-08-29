// ── อ่าน/เขียนฐานสำหรับการนำเข้าข้อมูลเก่า (F-8) ──────────────────────────
import { genId } from '@/lib/id';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { findProvinceByName } from '@/lib/master/thaiAdmin';
import { SITE_RUN_BUCKET, SITE_RUN_WIDTH, siteCodePrefix } from '@/lib/service/siteCode';
import { ZONE_RUN_BUCKET, ZONE_RUN_WIDTH, normalizeFloor, zoneCodePrefix } from '@/lib/service/zoneCode';
import { fetchAll } from '@/lib/supabaseFetchAll';

/* ภาพรวมของที่มีอยู่ ใช้เทียบว่าอะไรมีแล้ว/อะไรต้องสร้าง
   ⚠️ ต้องดึง **ครบทุกแถว** — PostgREST ตัดที่ 1000 แถวเงียบ ๆ และไซต์บริการของ
      จริงมีเป็นร้อย ลูกค้าเป็นพัน ⇒ ตัดแถวทิ้ง = เห็นว่า "ยังไม่มี" แล้วสร้างซ้ำ */
export async function loadImportSnapshot(supabase) {
  const [customers, sites, zones, assets] = await Promise.all([
    fetchAll(() => supabase.from('customers').select('id, name').order('id')),
    fetchAll(() => supabase.from('service_sites').select('id, code, "customerId", name').order('id')),
    fetchAll(() => supabase.from('service_zones').select('id, code, "siteId", name').order('id')),
    fetchAll(() => supabase.from('service_assets').select('id, "siteId", "zoneId", kind, status').order('id')),
  ]);
  return { customers, sites, zones, assets };
}

/* ลงมือสร้างตามแผน — ไซต์ → โซน → เครื่อง ตามลำดับที่ FK บังคับ
   คืน { sites, zones, assets, errors } นับจำนวนที่สร้างจริง
   ⚠️ **ไม่มีทรานแซกชันครอบทั้งงาน** (PostgREST ทำให้ไม่ได้) ⇒ ออกแบบให้ล้ม
      กลางทางแล้ว "รันซ้ำได้" แทน: ของที่สร้างไปแล้วรอบหน้าจะขึ้นเป็น skip */
export async function applyImportPlan(supabase, rows, { user, now = new Date() } = {}) {
  const created = { sites: 0, zones: 0, assets: 0 };
  const errors = [];
  const siteIdByRef = new Map();
  const zoneIdByRef = new Map();
  const actor = {
    createdById: user?.id ? String(user.id) : null,
    createdByName: user?.name || null,
  };

  // ── ไซต์ ──
  /* ⚠️ **ยิงทีละไซต์ ไม่ใช่ทั้งชุด** (mig 0315) — รหัส `ST-XXXX-AA-BBB-CCCC` มีรหัส
     ลูกค้าและจังหวัดอยู่ในท่อนหน้าเลขรัน ⇒ แต่ละแถวใช้ prefix คนละตัว
     ⚠️ แถวที่ประกอบรหัสไม่ได้ (ไม่มีจังหวัด / ลูกค้าไม่มีรหัส AR) **ออกเป็นรายงาน**
        ไม่ใช่ยัดลง DB ด้วยรหัสมั่ว — กติกาเดิมของสายนำเข้า (F-8) */
  const customerCache = new Map();
  const arCodeOf = async (customerId) => {
    if (customerCache.has(customerId)) return customerCache.get(customerId);
    const { data } = await supabase.from('customers').select('arCode').eq('id', customerId).maybeSingle();
    const value = data?.arCode || null;
    customerCache.set(customerId, value);
    return value;
  };

  for (const row of rows) {
    if (row.site?.action !== 'create') continue;
    if (siteIdByRef.has(row.site.ref)) continue;      // ไซต์เดียวกันโผล่หลายแถวในไฟล์

    const province = findProvinceByName(row.site.province);
    const { prefix, error: codeError } = siteCodePrefix({
      arCode: await arCodeOf(row.site.customerId),
      provinceCode: province?.code,
    });
    if (codeError) {
      errors.push(`ไซต์ "${row.site.name}": ${row.site.province ? codeError : 'ยังไม่มีคอลัมน์จังหวัด — รหัสไซต์ประกอบจากภาคและจังหวัด'}`);
      continue;
    }

    const { data, error } = await insertRowWithComposedCode(
      supabase,
      { scope: 'SS', bucket: SITE_RUN_BUCKET, prefix, width: SITE_RUN_WIDTH },
      {
        id: genId('SVS'),
        customerId: row.site.customerId,
        customerName: row.site.customerName || null,
        name: row.site.name,
        routeZone: row.site.routeZone || null,
        address: row.site.address || null,
        provinceCode: province.code,
        province: province.th,
        contactName: row.site.contactName || null,
        contactPhone: row.site.contactPhone || null,
        ...actor,
      },
    );
    if (error) {
      errors.push(`สร้างไซต์ "${row.site.name}" ไม่สำเร็จ: ${error.message}`);
      continue;
    }
    siteIdByRef.set(row.site.ref, data.id);
    created.sites += 1;
  }
  // ไซต์ที่มีอยู่แล้ว/ถูกใช้ซ้ำในไฟล์เดียวกัน — ผูก ref กับ id จริงให้ครบก่อนไปต่อ
  for (const row of rows) {
    if (row.site?.action === 'use') siteIdByRef.set(row.site.id, row.site.id);
  }

  const resolveSite = (ref) => siteIdByRef.get(ref) || ref;

  // ── โซน ──
  // รหัสโซนอ้าง **เลขรันของไซต์** ⇒ ต้องรู้รหัสไซต์ที่เพิ่งสร้าง/ที่มีอยู่ก่อน
  const siteCodeCache = new Map();
  const siteCodeOf = async (siteId) => {
    if (siteCodeCache.has(siteId)) return siteCodeCache.get(siteId);
    const { data } = await supabase.from('service_sites').select('code').eq('id', siteId).maybeSingle();
    const value = data?.code || null;
    siteCodeCache.set(siteId, value);
    return value;
  };

  for (const row of rows) {
    if (row.zone?.action !== 'create') continue;
    if (zoneIdByRef.has(row.zone.ref)) continue;      // โซนเดียวกันโผล่หลายแถวในไฟล์
    const siteId = resolveSite(row.zone.siteRef);
    if (!siteId || siteId.startsWith('new-site-')) {
      errors.push(`แถว ${row.rowNumber}: สร้างโซนไม่ได้เพราะไซต์ยังไม่ถูกสร้าง`);
      continue;
    }

    // ชั้นในรูปมาตรฐาน (04 · GF · B1) — ค่าเดียวกับที่ไปอยู่ในรหัสและในคอลัมน์ `floor`
    const floor = normalizeFloor(row.zone.floor);
    const { prefix, error: codeError } = floor.error
      ? { prefix: null, error: floor.error }
      : zoneCodePrefix({ siteCode: await siteCodeOf(siteId), floor: floor.value });
    if (codeError) {
      errors.push(`แถว ${row.rowNumber} · โซน "${row.zone.name}": ${codeError}`);
      continue;
    }

    const { data, error } = await insertRowWithComposedCode(
      supabase,
      { scope: 'ZN', bucket: ZONE_RUN_BUCKET, prefix, width: ZONE_RUN_WIDTH },
      { id: genId('SZN'), siteId, name: row.zone.name, floor: floor.value, ...actor },
    );
    if (error) {
      errors.push(`แถว ${row.rowNumber}: สร้างโซน "${row.zone.name}" ไม่สำเร็จ: ${error.message}`);
      continue;
    }
    zoneIdByRef.set(row.zone.ref, data.id);
    created.zones += 1;
  }
  for (const row of rows) {
    if (row.zone?.action === 'use') zoneIdByRef.set(row.zone.id, row.zone.id);
  }

  // ── เครื่อง ──
  const assetRows = [];
  for (const row of rows) {
    for (const asset of row.assets || []) {
      const siteId = resolveSite(asset.siteRef);
      if (!siteId || siteId.startsWith('new-site-')) {
        errors.push(`แถว ${row.rowNumber}: สร้างเครื่องไม่ได้เพราะไซต์ยังไม่ถูกสร้าง`);
        continue;
      }
      const zoneId = asset.zoneRef ? (zoneIdByRef.get(asset.zoneRef) || null) : null;
      if (asset.zoneRef && !zoneId) {
        errors.push(`แถว ${row.rowNumber}: สร้างเครื่องไม่ได้เพราะโซนยังไม่ถูกสร้าง`);
        continue;
      }
      assetRows.push({
        id: genId('SVA'),
        siteId,
        zoneId,
        kind: asset.kind,
        label: asset.label,
        qty: asset.qty ?? null,
        serial: asset.serial || null,
        model: asset.model || null,
        colour: asset.colour || null,
        floor: asset.floor || null,
        spot: asset.spot || null,
        productName: asset.productName || null,
        bottleMl: asset.bottleMl ?? null,
        installedAt: asset.installedAt || null,
        status: asset.status || 'active',
        settings: asset.settings || {},
        note: asset.note || null,
        ...actor,
      });
    }
  }
  // แบ่งก้อนละ 200 แถว — ก้อนใหญ่เกินไปโดน timeout แล้วไม่รู้ว่าเข้าไปกี่แถว
  for (let from = 0; from < assetRows.length; from += 200) {
    const chunk = assetRows.slice(from, from + 200);
    const { data, error } = await supabase.from('service_assets').insert(chunk).select('id');
    if (error) errors.push(`สร้างเครื่องไม่สำเร็จ (แถวที่ ${from + 1}–${from + chunk.length}): ${error.message}`);
    else created.assets += (data || []).length;
  }

  return { created, errors, siteIdByRef, zoneIdByRef };
}
