// ── อ่าน/เขียนฐานสำหรับการนำเข้าข้อมูลเก่า (F-8) ──────────────────────────
import { genId } from '@/lib/id';
import { insertRowsWithEntityCode } from '@/lib/entityCode';
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
  const siteRows = [];
  for (const row of rows) {
    if (row.site?.action !== 'create') continue;
    siteRows.push({
      ref: row.site.ref,
      row: {
        id: genId('SVS'),
        customerId: row.site.customerId,
        customerName: row.site.customerName || null,
        name: row.site.name,
        routeZone: row.site.routeZone || null,
        address: row.site.address || null,
        contactName: row.site.contactName || null,
        contactPhone: row.site.contactPhone || null,
        ...actor,
      },
    });
  }
  if (siteRows.length) {
    const { data, error } = await insertRowsWithEntityCode(supabase, 'SS', siteRows.map((item) => item.row), now);
    if (error) return { created, errors: [`สร้างไซต์ไม่สำเร็จ: ${error.message}`], siteIdByRef, zoneIdByRef };
    // ⚠️ จับคู่ด้วย **id ที่เราออกเอง** ไม่ใช่ลำดับที่คืนมา — ลำดับผลของ RPC
    //    ไม่มีอะไรรับประกัน และถ้าเลื่อนไปหนึ่งช่อง เครื่องจะไปลงผิดไซต์ทั้งไฟล์
    const refById = new Map(siteRows.map((item) => [item.row.id, item.ref]));
    for (const inserted of data || []) {
      const ref = refById.get(inserted.id);
      if (ref) siteIdByRef.set(ref, inserted.id);
    }
    created.sites = (data || []).length;
  }
  // ไซต์ที่มีอยู่แล้ว/ถูกใช้ซ้ำในไฟล์เดียวกัน — ผูก ref กับ id จริงให้ครบก่อนไปต่อ
  for (const row of rows) {
    if (row.site?.action === 'use') siteIdByRef.set(row.site.id, row.site.id);
  }

  const resolveSite = (ref) => siteIdByRef.get(ref) || ref;

  // ── โซน ──
  const zoneRows = [];
  for (const row of rows) {
    if (row.zone?.action !== 'create') continue;
    const siteId = resolveSite(row.zone.siteRef);
    if (!siteId || siteId.startsWith('new-site-')) {
      errors.push(`แถว ${row.rowNumber}: สร้างโซนไม่ได้เพราะไซต์ยังไม่ถูกสร้าง`);
      continue;
    }
    zoneRows.push({ ref: row.zone.ref, row: { id: genId('SZN'), siteId, name: row.zone.name, ...actor } });
  }
  if (zoneRows.length) {
    const { data, error } = await insertRowsWithEntityCode(supabase, 'ZN', zoneRows.map((item) => item.row), now);
    if (error) errors.push(`สร้างโซนไม่สำเร็จ: ${error.message}`);
    else {
      const refById = new Map(zoneRows.map((item) => [item.row.id, item.ref]));
      for (const inserted of data || []) {
        const ref = refById.get(inserted.id);
        if (ref) zoneIdByRef.set(ref, inserted.id);
      }
      created.zones = (data || []).length;
    }
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
