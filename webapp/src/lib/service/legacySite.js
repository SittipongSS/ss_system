// ── เพิ่มไซต์ย้อนหลัง — ตัววางแผน (logic ล้วน · ไม่แตะ DB) ─────────────────────
//
// ⭐ **คีย์ไซต์ที่มีอยู่ก่อนมีระบบทีละแห่ง** (มติผู้ใช้ 2026-09-11 · ม็อก `mockups/legacy-site`)
//   ขอบเขตที่เคาะ: *"เพิ่มแต่ ไซต์ โซน จุด — ยังไม่ต้องเชื่อมเครื่อง กับ SO สัญญา การจ่าย"*
//   ⇒ ไฟล์นี้รู้จักแค่ ไซต์ · โซน · จุดติดตั้ง ไม่มีช่องของอย่างอื่นเลย
//
// ⭐ **เป็นข้อยกเว้นเฉพาะข้อมูลเก่าของมติ 30/08 "ใบคำร้องคือทางเกิดของไซต์ทางเดียว"** —
//   มติ 08/09 เขียนไว้แล้วว่าทางที่เหลือของของเก่าคือ "เพิ่มไซต์ทีละใบที่ทะเบียน"
//   (`docs/service-field-operations.md` §10B) แต่ไม่เคยมีปุ่ม ⇒ คนคีย์ของเก่าต้องเปิดใบประเมินปลอม
//
// 🔑 **ตัวตัดสินชุดเดียวกับทุกทางที่สร้างของชนิดเดียวกัน** — ฟอร์มไซต์ (`normalizeSiteInput`)
//   · รหัสไซต์ (`siteCodePrefix`) · ฟอร์มโซน (`normalizeZoneInput` + จุด) · รหัสโซน
//   (`zoneCodePrefix`) · กุญแจเทียบชื่อของตัวนำเข้า (`nameKey` + ตัดช่องว่าง) ⇒ โมดัลนี้ พรีวิว และตอนบันทึก
//   พูดเสียงเดียวกัน · บทเรียน #1685: พรีวิวที่คิดคนละชุดกับตอนลงมือ บอก "จะสร้าง 145" แล้วสร้างได้ 0
//
// ⚠️ **ตรวจทุกด่านก่อนเขียนแถวแรก** — PostgREST ไม่มีทรานแซกชันครอบทั้งงาน (ตัวนำเข้าก็ออกแบบ
//   แบบนี้) ⇒ รวมทุกเหตุเป็นรายการเดียว บอกครบในครั้งเดียว ไม่ใช่ทีละข้อ
import { normalizeSiteInput } from './sites';
import { siteCodePrefix } from './siteCode';
import { normalizeZoneInput } from './zones';
import { zoneCodePrefix } from './zoneCode';
import { nameKey } from './importValues';
import { customerCodeSegment } from '@/lib/master/masterCodes';

/* 🔑 **กุญแจเทียบชื่อซ้ำ** = `nameKey` ของตัวนำเข้า (ตัวพิมพ์ · วงเล็บ · ขีด) **แล้วตัดช่องว่างทิ้งหมด**
   ⚠️ เข้มกว่าตัวนำเข้าหนึ่งขั้นโดยตั้งใจ — `nameKey` ยุบช่องว่างซ้อนแต่ยังเก็บช่องว่างกลางคำ ⇒
      "สาขา สีลม" กับ "สาขาสีลม" ไม่ชนกัน · คนพิมพ์ไทยเว้นวรรคไม่สม่ำเสมอ และคนคีย์ของเก่า
      ทีละแห่งคือคนที่จะพิมพ์ชื่อเดิมคนละแบบในอีกสัปดาห์ · ชื่อที่ต่างกันแค่ช่องว่างแทบไม่เคย
      เป็นคนละที่จริง ⇒ กันไว้ก่อนดีกว่าได้สองใบประวัติแยกร่าง */
export const legacyNameKey = (name) => nameKey(name).replace(/\s+/g, '');
const dupKey = legacyNameKey;

/** โซนต่อหนึ่งครั้ง — กันฟอร์มที่วนสร้างผิดเป็นร้อยโซน (ไซต์จริงใหญ่สุดในชีตไม่ถึงนี้) */
export const LEGACY_ZONE_MAX = 60;

/** ป้ายของโซนในข้อความ — ยังไม่มีชื่อก็ต้องบอกได้ว่าแถวไหน */
const zoneLabel = (zone, index) => {
  const name = String(zone?.name ?? '').trim();
  return name ? `โซน “${name}”` : `โซนที่ ${index + 1}`;
};

/**
 * ด่านของไซต์ใหม่ — คืน `{ value, prefix, duplicate, arMissing, errors }`
 *
 * @param site          ค่าจากฟอร์ม (รูปเดียวกับ ServiceSiteModal)
 * @param customer      แถวลูกค้าจากทะเบียน (`null` = หาไม่เจอ)
 * @param customerSites ไซต์ทั้งหมดของลูกค้ารายนี้ (รวมที่ปิดใช้งาน) — ใช้กันชื่อซ้ำ
 */
export function planLegacySiteRow(site = {}, { customer = null, customerSites = [] } = {}) {
  /* ⚠️ **ไม่หยุดที่เหตุแรก** — ชื่อว่างกับลูกค้าไม่มี AR แก้คนละที่คนละคน ⇒ บอกครบในครั้งเดียว
     (normalizeSiteInput คืนเหตุเดียวแล้วหยุด — ที่เหลือข้างล่างตรวจต่อจากค่าดิบได้) */
  const errors = [];
  const { value, error } = normalizeSiteInput(site);
  if (error) errors.push(error);

  if (!customer && String(site?.customerId ?? '').trim()) {
    errors.push('ไม่พบลูกค้าในทะเบียน — เลือกลูกค้าที่อนุมัติแล้วเท่านั้น');
  }

  /* รหัส `ST-XXXX-AA-BBB-CCCC` — ตัวเดียวกับ POST /api/service/sites · ข้อความของมันบอกเอง
     ว่าไปแก้ที่ไหน (ลูกค้าไม่มีรหัส AR · ยังไม่เลือกจังหวัด) */
  let prefix = null;
  const arMissing = !!customer && !customerCodeSegment(customer.arCode);
  if (customer) {
    const code = siteCodePrefix({ arCode: customer.arCode, provinceCode: value?.provinceCode ?? site?.provinceCode });
    if (code.error) errors.push(code.error);
    prefix = code.prefix;
  }

  /* 🔑 **ชื่อซ้ำในลูกค้าเดียวกัน** — `dupKey` (nameKey ของตัวนำเข้า + ตัดช่องว่าง) ⇒
     "สาขา สีลม" กับ "สาขาสีลม" นับว่าซ้ำ · ฐานไม่มี unique ตัวนี้ (index ธรรมดา) ⇒ ด่านอยู่ที่นี่
     ⚠️ นับไซต์ที่ปิดใช้งานด้วย — เปิดใบเดิมกลับดีกว่ามีสองใบประวัติแยกร่าง */
  const key = dupKey(value?.name ?? site?.name);
  const duplicate = key ? (customerSites || []).find((s) => dupKey(s?.name) === key) || null : null;
  if (duplicate) {
    errors.push(`ลูกค้ารายนี้มีไซต์ “${duplicate.name}” อยู่แล้ว (${duplicate.code || duplicate.id}) — เปิดไซต์เดิม หรือเติมโซน/จุดต่อในไซต์นั้นแทนการสร้างซ้ำ`);
  }

  /* ค่าที่โมดัลนี้ **ไม่ให้เลือก** — ตรึงที่นี่ ไม่เชื่อค่าที่ส่งมา
     · ไซต์ลูกค้าเสมอ (คลังไม่เกิดจากทางนี้) · เปิดใช้งาน (ของใหม่เริ่มที่ค่าตั้งต้น — กฎ AGENTS.md)
     · ไม่มีโครงการ (ของเก่าไม่เคยมีโครงการ) */
  return {
    value: value ? { ...value, kind: 'customer', isActive: true, projectId: null } : null,
    prefix,
    duplicate,
    arMissing,
    errors,
  };
}

/**
 * ด่านของโซนทั้งชุด — คืน `{ zones: [{ key, value }], errors }`
 *
 * @param zones         `[{ key, name, floor, building, note, spots }]` จากฟอร์ม (key = ตัวชี้ของจอ)
 * @param existingZones โซนที่ไซต์ปลายทางมีอยู่แล้ว (โหมดเติมต่อ) — ใช้กันชื่อซ้ำ
 * @param siteCode      รหัสไซต์ปลายทาง (โหมดเติมต่อ) — ใช้ตรวจว่าออกรหัสโซนได้
 * @param makeSpotId    ตัวออก id ของจุดใหม่ (server)
 */
export function planLegacyZones(zones = [], { existingZones = [], siteCode = null, makeSpotId = null } = {}) {
  const errors = [];
  const out = [];
  const list = Array.isArray(zones) ? zones : [];
  if (list.length > LEGACY_ZONE_MAX) {
    return { zones: [], errors: [`โซนเกิน ${LEGACY_ZONE_MAX} โซนต่อครั้ง — บันทึกเป็นหลายรอบ (เติมโซนต่อในไซต์เดิมได้)`] };
  }

  /* ชื่อที่มีอยู่แล้วในไซต์ปลายทาง + ที่เพิ่งพิมพ์ในฟอร์มนี้ — ฐานกันด้วย
     `(siteId, lower(btrim(name)))` แต่ dupKey เข้มกว่า (ตัดวงเล็บ/ขีด/ช่องว่าง) ⇒ ตรวจที่นี่ก่อน
     ให้ได้ข้อความที่บอกว่าแถวไหน แทน 23505 ของโซนที่ n กลางทาง */
  const seen = new Map((existingZones || []).map((z) => [dupKey(z?.name), `มีอยู่แล้วในไซต์ (${z?.code || z?.id})`]));

  list.forEach((zone, index) => {
    const label = zoneLabel(zone, index);
    const { value, error } = normalizeZoneInput({ ...zone, spots: zone?.spots ?? [] }, { makeSpotId });
    if (error) { errors.push(`${label}: ${error}`); return; }

    const key = dupKey(value.name);
    if (seen.has(key)) {
      errors.push(`${label}: ชื่อซ้ำกับโซนที่${seen.get(key)}`);
      return;
    }
    seen.set(key, `อยู่ในฟอร์มนี้แล้ว (แถวที่ ${index + 1})`);

    /* โหมดเติมต่อ: ไซต์ปลายทางต้องออกรหัสโซนได้ (ไซต์รหัสรูปเดิมออกไม่ได้) ·
       โหมดสร้าง: ไซต์ยังไม่มีรหัส — ชั้นถูกตรวจรูปแล้วใน normalizeZoneInput ก็พอ */
    if (siteCode) {
      const code = zoneCodePrefix({ siteCode, floor: value.floor });
      if (code.error) { errors.push(`${label}: ${code.error}`); return; }
    }
    // โซนใหม่เริ่มที่ "ใช้งาน" เสมอ — ไม่มีช่องสถานะในโหมดสร้าง (กฎ AGENTS.md)
    out.push({ key: String(zone?.key ?? index), value: { ...value, isActive: true } });
  });

  return { zones: out, errors };
}

/** ข้อความเดียวที่บอกทุกเหตุ — กฎฟอร์ม: "ด่านตรวจรวมเป็นข้อความเดียว" */
export function legacyPlanMessage(errors = []) {
  if (!errors.length) return null;
  if (errors.length === 1) return errors[0];
  return `ยังบันทึกไม่ได้ ${errors.length} ข้อ — ${errors.join(' · ')}`;
}

/** สรุปจำนวนสำหรับพรีวิว/ปุ่มบันทึก */
export function legacyPlanCounts(zones = []) {
  const spots = (zones || []).reduce((sum, z) => sum + (Array.isArray(z?.value?.spots) ? z.value.spots.length : 0), 0);
  return { zones: (zones || []).length, spots };
}
