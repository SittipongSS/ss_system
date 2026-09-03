// ── วางแผนนำเข้า: ร่างจากชีต × ของที่มีอยู่ในฐาน (F-8) ────────────────────
//
// ⭐ **คุณสมบัติที่สำคัญที่สุดของไฟล์นี้คือ "รันซ้ำแล้วไม่พัง"** — การนำเข้า
// ข้อมูลเก่าไม่มีทางจบในรอบเดียว (แถวตกรายงาน → คนไปแก้ชีต → อัปโหลดใหม่)
// ⇒ ทุกอย่างเทียบด้วย**กุญแจธรรมชาติ** (ลูกค้า+ชื่อไซต์ · ไซต์+ชื่อโซน) แล้ว
// ของที่มีอยู่แล้วขึ้นเป็น `skip` ไม่ใช่สร้างซ้อน
//
// 🔴 **ไม่สร้างลูกค้าใหม่เด็ดขาด** — ทะเบียนลูกค้ามีรหัส AR · การอนุมัติ · ชื่อ
// สองภาษา · และมี 5 ตารางที่ก๊อปชื่อไปเก็บ (customer-name-mirrors) การให้ไฟล์
// Excel งอกลูกค้าได้ = สร้างลูกค้าซ้ำที่ไม่มีใครตามลบ ⇒ ชื่อที่ไม่ตรงทะเบียน
// ตกรายงานให้คนไปสร้าง/แก้ชื่อในทะเบียนก่อน
import { customerNameIn, customerSnapshotName } from '@/lib/master/customerName';
import { nameKey } from './importValues';
import { isAssetOnSite } from './sites';

export const ROW_OK = 'ok';        // มีของให้สร้าง
export const ROW_SKIP = 'skip';    // ตรงกับของที่มีอยู่แล้วทั้งแถว
export const ROW_ERROR = 'error';  // นำเข้าไม่ได้ ต้องแก้ที่ชีตหรือทะเบียน

/* ดัชนีลูกค้าตามชื่อ — ชื่อซ้ำในทะเบียนมีจริง จึงเก็บเป็น array แล้วให้ผู้เรียก
   ตัดสินว่า "กำกวม" ไม่ใช่หยิบตัวแรกมาใช้เงียบ ๆ */
export function indexCustomers(customers = []) {
  const index = new Map();
  for (const customer of customers) {
    /* ทำดัชนี **ทั้งสองภาษา** — ลูกค้าที่มีแต่ชื่ออังกฤษเคยไม่เข้าดัชนีเลย
       (คีย์มาจาก `name` อย่างเดียว) แถวที่พิมพ์ชื่ออังกฤษจึงตก "ไม่พบลูกค้า"
       ทุกครั้ง · คนกรอกชีตพิมพ์ชื่อที่ตัวเองใช้ ไม่ได้เลือกภาษาตามทะเบียน
       🪤 Set กันลูกค้ารายเดียวถูกใส่สองรอบในคีย์เดียวกัน (สองภาษาย่อยแล้วเท่ากัน)
          ไม่งั้นผู้เรียกเห็น 2 รายการแล้วขึ้น "ตรงกับทะเบียน 2 ราย" หลอก */
    const keys = new Set([nameKey(customer.name), nameKey(customer.nameEn)].filter(Boolean));
    for (const key of keys) {
      const list = index.get(key) || [];
      list.push(customer);
      index.set(key, list);
    }
  }
  return index;
}

const siteKey = (customerId, name) => `${customerId}|${nameKey(name)}`;
const zoneKey = (siteId, name) => `${siteId}|${nameKey(name)}`;

export function indexSites(sites = []) {
  const index = new Map();
  for (const site of sites) index.set(siteKey(site.customerId, site.name), site);
  return index;
}

export function indexZones(zones = []) {
  const index = new Map();
  for (const zone of zones) index.set(zoneKey(zone.siteId, zone.name), zone);
  return index;
}

/* จำนวนเครื่องที่มีอยู่แล้ว แยกตาม ไซต์+โซน+ชนิด — กุญแจของกติกา "ไม่สร้างซ้ำ" */
export function indexAssetCounts(assets = []) {
  const index = new Map();
  for (const asset of assets) {
    /* mig 0332: เครื่องในคลังไม่นับเป็น "มีอยู่แล้วที่จุดนี้" — ไม่งั้นกติกากันซ้ำ
       จะข้ามการสร้างเครื่องที่ติดตั้งจริง เพราะเห็นของในสต๊อกที่ siteId เดียวกัน */
    if (!isAssetOnSite(asset)) continue;
    const key = `${asset.siteId}|${asset.zoneId || ''}|${asset.kind || 'diffuser'}`;
    index.set(key, (index.get(key) || 0) + 1);
  }
  return index;
}

/* วางแผนทั้งไฟล์
   snapshot = { customers, sites, zones, assets }
   คืน { rows, summary } — rows เรียงตามลำดับในไฟล์เสมอ (คนไล่ตามชีตได้) */
export function planImport(drafts = [], snapshot = {}) {
  const customerIndex = indexCustomers(snapshot.customers);
  const siteIndex = indexSites(snapshot.sites);
  const zoneIndex = indexZones(snapshot.zones);
  const assetCounts = indexAssetCounts(snapshot.assets);

  // ของที่ "จะถูกสร้าง" ในรอบนี้ — แถวที่ 2 ของไซต์เดียวกันต้องเห็นว่าแถวแรก
  // สร้างไว้แล้ว ไม่งั้นไฟล์เดียวสร้างไซต์ซ้ำสองใบตั้งแต่รอบแรก
  const plannedSites = new Map();   // siteKey → { ref, name, customerId }
  const plannedZones = new Map();   // `${siteRef}|${nameKey}` → { ref, name }
  const plannedAssets = new Map();  // `${siteRef}|${zoneRef}|${kind}` → count

  const rows = drafts.map((draft) => {
    const issues = [...draft.issues];
    const blocking = [];

    if (!draft.customerName || !draft.site?.name) {
      blocking.push('ขาดชื่อลูกค้าหรือชื่อไซต์');
    }

    let customer = null;
    if (draft.customerName) {
      const matches = customerIndex.get(nameKey(draft.customerName)) || [];
      if (matches.length === 1) [customer] = matches;
      else if (matches.length === 0) blocking.push(`ไม่พบลูกค้า “${draft.customerName}” ในทะเบียน — สร้างลูกค้าก่อน`);
      else blocking.push(`ชื่อลูกค้า “${draft.customerName}” ตรงกับทะเบียน ${matches.length} ราย — ระบุให้ชัดก่อน`);
    }

    if (blocking.length) {
      return {
        rowNumber: draft.rowNumber, status: ROW_ERROR, issues, blocking,
        customerName: draft.customerName, siteName: draft.site?.name || null,
        site: null, zone: null, assets: [], carried: draft.carried,
      };
    }

    // ── ไซต์ ──
    const sKey = siteKey(customer.id, draft.site.name);
    const existingSite = siteIndex.get(sKey);
    const plannedSite = plannedSites.get(sKey);
    let siteRef;
    let sitePlan;
    if (existingSite) {
      siteRef = existingSite.id;
      sitePlan = { action: 'use', id: existingSite.id, code: existingSite.code || null, name: existingSite.name };
    } else if (plannedSite) {
      siteRef = plannedSite.ref;
      sitePlan = { action: 'reuse-new', ref: plannedSite.ref, name: plannedSite.name };
    } else {
      siteRef = `new-site-${plannedSites.size + 1}`;
      plannedSites.set(sKey, { ref: siteRef, name: draft.site.name, customerId: customer.id });
      sitePlan = {
        action: 'create', ref: siteRef, name: draft.site.name,
        customerId: customer.id, customerName: customerSnapshotName(customer),
        routeZone: draft.site.routeZone, address: draft.site.address,
        province: draft.site.province || null,
        contactName: draft.site.contactName, contactPhone: draft.site.contactPhone,
      };
    }

    // ── โซน ──
    let zoneRef = null;
    let zonePlan = null;
    if (draft.zone?.name) {
      const zKey = zoneKey(siteRef, draft.zone.name);
      const existingZone = existingSite ? zoneIndex.get(zoneKey(existingSite.id, draft.zone.name)) : null;
      const planned = plannedZones.get(zKey);
      if (existingZone) {
        zoneRef = existingZone.id;
        zonePlan = { action: 'use', id: existingZone.id, code: existingZone.code || null, name: existingZone.name };
      } else if (planned) {
        zoneRef = planned.ref;
        zonePlan = { action: 'reuse-new', ref: planned.ref, name: planned.name };
      } else {
        zoneRef = `new-zone-${plannedZones.size + 1}`;
        plannedZones.set(zKey, { ref: zoneRef, name: draft.zone.name });
        zonePlan = { action: 'create', ref: zoneRef, siteRef, name: draft.zone.name, floor: draft.zone.floor || null };
      }
    }

    // ── เครื่อง ──
    // ⚠️ กติกากันซ้ำอยู่ที่ระดับ **ไซต์+โซน+ชนิด** ไม่ใช่รายตัว: ชีตเก่าให้มาแค่
    //   จำนวน ไม่มีซีเรียล ⇒ เทียบรายตัวไม่ได้เลย · ที่ไหนมีเครื่องชนิดนั้นอยู่แล้ว
    //   ถือว่า "คีย์ไปแล้ว" และข้าม — ปลอดภัยกว่าเติมซ้ำจนนับเป็นสองเท่า
    // siteRef เป็น id จริงเมื่อไซต์มีอยู่แล้ว และเป็น ref ชั่วคราวเมื่อกำลังจะสร้าง
    const assetKey = `${siteRef}|${zoneRef || ''}|`;
    const assets = [];
    const skippedAssets = [];
    const byKind = new Map();
    for (const asset of draft.assets) byKind.set(asset.kind, (byKind.get(asset.kind) || 0) + 1);

    for (const [kind, wanted] of byKind) {
      const key = `${assetKey}${kind}`;
      const already = (assetCounts.get(key) || 0) + (plannedAssets.get(key) || 0);
      if (already > 0) {
        skippedAssets.push({ kind, wanted, already });
        continue;
      }
      plannedAssets.set(key, wanted);
      for (const asset of draft.assets) {
        if (asset.kind !== kind) continue;
        assets.push({ ...asset, siteRef, zoneRef });
      }
    }

    const creates = (sitePlan.action === 'create' ? 1 : 0)
      + (zonePlan?.action === 'create' ? 1 : 0)
      + assets.length;

    return {
      rowNumber: draft.rowNumber,
      status: creates > 0 ? ROW_OK : ROW_SKIP,
      issues,
      blocking: [],
      customerName: customerNameIn(customer),
      siteName: draft.site.name,
      site: sitePlan,
      zone: zonePlan,
      assets,
      skippedAssets,
      carried: draft.carried,
    };
  });

  return { rows, summary: summarize(rows) };
}

export function summarize(rows = []) {
  const summary = {
    rows: rows.length,
    ok: 0, skip: 0, error: 0,
    newSites: 0, newZones: 0, newAssets: 0,
    warnings: 0,
    carriedPacks: 0, carriedMl: 0,
  };
  for (const row of rows) {
    if (row.status === ROW_ERROR) summary.error += 1;
    else if (row.status === ROW_SKIP) summary.skip += 1;
    else summary.ok += 1;
    if (row.issues?.length) summary.warnings += 1;
    if (row.site?.action === 'create') summary.newSites += 1;
    if (row.zone?.action === 'create') summary.newZones += 1;
    summary.newAssets += row.assets?.length || 0;
    if (row.carried?.packs) summary.carriedPacks += 1;
    if (row.carried?.mlPerMonth || row.carried?.mlPerMonthRaw) summary.carriedMl += 1;
  }
  return summary;
}

/* แถวที่ต้องออกรายงานให้คนแก้ — ทั้งที่นำเข้าไม่ได้ และที่นำเข้าได้แต่มีของตกหล่น */
export function reportRows(rows = []) {
  return rows
    .filter((row) => row.status === ROW_ERROR || row.issues?.length || row.skippedAssets?.length)
    .map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      customerName: row.customerName,
      siteName: row.siteName,
      problems: [
        ...(row.blocking || []),
        ...(row.issues || []).map((issue) => `${issue.field}: ${issue.message}${issue.raw ? ` (“${issue.raw}”)` : ''}`),
        ...(row.skippedAssets || []).map((item) => `มี${item.kind} อยู่แล้ว ${item.already} รายการ — ข้าม ${item.wanted} รายการในชีต`),
      ],
    }));
}
