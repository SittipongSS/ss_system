// ── คำสั่งย้าย/เปลี่ยนสถานะของเครื่อง (เฟส C · mig 0335) — logic ล้วน ────────
//
// ⭐ **คำสั่งพวกนี้เป็น action ไม่ใช่การแก้ช่องในฟอร์ม** — ถ้าปล่อยให้คนไปแก้ `siteId`
//   ในฟอร์มแก้ข้อมูล ประวัติจะขาดช่วงเงียบ ๆ (ไม่มีวันที่ ไม่มีเหตุผล ไม่มีคนสั่ง)
//   และ `installedAt`/`removedAt` ที่มีคู่เดียวต่อเครื่องจะถูกทับทุกรอบที่ย้าย
//
// ⭐ **ตัวตัดสินตัวเดียวใช้ทั้งจอและ API** — กติกา GatedAction ของระบบ:
//     `assetMoveOwnerError`  → คุมการ **มองเห็น** (ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม)
//     `assetMoveError`       → คุมการ **กดได้** (ติดด่าน = โชว์แล้วบอกเหตุ)
//   ห้ามให้จอมีเงื่อนไขที่ API ไม่รู้ หรือกลับกัน
import { ASSET_CONDITIONS, ASSET_STATUSES, isWarehouseSite } from './sites';

/* ทะเบียนคำสั่ง — คำที่ผู้ใช้พูด ไม่ใช่ชื่อคอลัมน์ที่เปลี่ยน
   ⚠️ `install` กับ `transfer` เขียนคอลัมน์เดียวกันเป๊ะ แต่แยกกันเพราะคำถามที่ต้อง
      ตอบต่างกัน: ติดตั้งจากคลังไม่ต้องบอกว่าทำไมถึงถอดจากที่เดิม ส่วนย้ายต้องบอก */
export const MOVE_KINDS = [
  'receive', 'install', 'transfer', 'return', 'repair', 'repair_done', 'condition', 'retire',
];

export const MOVE_LABELS = {
  receive: 'รับเข้าคลัง',
  install: 'ติดตั้งเข้าไซต์',
  transfer: 'ย้ายไปไซต์อื่น',
  /* 🔄 เดิมชื่อ "ถอนกลับคลัง" (mig 0332: คลังเป็นไซต์จริง) — mig 0344 ยกเลิกโมเดลนั้น
     เครื่องที่ไม่ได้ติดตั้งคือเครื่องที่ **ไม่มีที่อยู่** ไม่ใช่เครื่องที่จอดอยู่ไซต์คลัง
     ⇒ คำสั่งนี้คือ "ถอดออกจากไซต์" แล้วเครื่องกลับไปเป็น "ว่าง" */
  return: 'ถอดออกจากไซต์',
  repair: 'ส่งซ่อม',
  repair_done: 'รับคืนจากซ่อม',
  condition: 'แจ้งเปลี่ยนสภาพ',
  retire: 'ปลดระวาง',
};

// คำสั่งที่ CHECK ใน DB บังคับเหตุผล — จอต้องบังคับด้วย ไม่งั้นผู้ใช้เจอ error ดิบของ Postgres
export const MOVE_NEEDS_REASON = ['transfer', 'return', 'retire'];

/* คำสั่งที่ต้องเลือกไซต์ปลายทาง — ที่เหลือเปลี่ยนแค่สถานะ/สภาพโดยอยู่ที่เดิม
   🐞 `repair_done` เคยไม่อยู่ในลิสต์นี้ (UAT 2026-09-02): เครื่องที่ส่งซ่อม**จากไซต์
      ลูกค้า** ยังมี `siteId` ชี้ไซต์นั้นอยู่ ⇒ พอสั่งรับคืนแล้วตั้ง `in_stock`
      เครื่องกลายเป็น "อยู่ในคลัง" ทั้งที่ siteId เป็นไซต์ลูกค้า ⇒ **trigger ของ DB
      เป็นคนตีกลับ (500 + ข้อความภาษาฐานข้อมูล)** ซึ่งเป็นสิ่งที่ไฟล์นี้มีไว้เพื่อกัน */
export const MOVE_CHANGES_SITE = ['install', 'transfer', 'return', 'repair_done'];

/* 🔄 **คำสั่งที่ทำให้เครื่องกลับไปเป็น "ว่าง"** (mig 0344 · เดิมชื่อ `MOVE_TO_WAREHOUSE`)
   ของเดิมบังคับให้เลือก **ไซต์ประเภทคลัง** เป็นปลายทาง เพราะ `siteId` เป็น NOT NULL
   ⇒ เครื่องที่ไม่ได้ติดตั้งต้องมีคลังรองรับเสมอ
   พอ mig 0344 ให้เครื่องไม่มีไซต์ได้ กติกานั้นกลายเป็น **ทางตัน**: ระบบไม่มีไซต์คลัง
   สักใบ (ตาราง `service_sites` ว่าง) ⇒ ถอดเครื่องออกจากไซต์ไม่ได้เลย
   ⇒ คำสั่งสองตัวนี้ตอนนี้ **ล้างที่อยู่** ไม่ใช่ย้ายไปที่อื่น */
export const MOVE_CLEARS_SITE = ['return', 'repair_done'];

/* ต้องเป็นไซต์ **คนละใบ** กับที่อยู่ตอนนี้ — "ย้ายไปที่เดิม" ไม่ใช่การย้าย
   ⚠️ `repair_done` ไม่อยู่ในลิสต์นี้โดยตั้งใจ: เครื่องที่ส่งซ่อมจากคลัง กลับเข้า
      คลังใบเดิมเป็นเรื่องปกติที่สุด */
export const MOVE_REQUIRES_NEW_SITE = ['install', 'transfer'];

/* สถานะปลายทางของแต่ละคำสั่ง — **ตารางเดียว** ไม่ให้ route กับจอเดาเอง
   ⚠️ `null` = ไม่แตะแกนนั้น (เช่น `condition` ไม่เปลี่ยน status) */
export const MOVE_RESULT = {
  receive: { status: 'in_stock', condition: null },
  install: { status: 'active', condition: null },
  transfer: { status: 'active', condition: null },
  return: { status: 'in_stock', condition: null },
  repair: { status: 'repair', condition: 'broken' },
  repair_done: { status: 'in_stock', condition: 'ok' },
  condition: { status: null, condition: null },   // ผู้ใช้เลือกสภาพเอง
  retire: { status: 'removed', condition: null },
};

/* ── ด่านที่ 1: เป็นเจ้าของคำสั่งนี้ไหม → คุมการ "มองเห็น" ────────────────
   คืนข้อความไทยเมื่อไม่ควรเห็นปุ่มนี้เลย · null = โชว์ได้
   ⚠️ ไม่มีสิทธิ์แก้ = ไม่เห็นปุ่มไหนเลย (ต่างจากติดด่าน ที่เห็นแต่กดไม่ได้) */
export function assetMoveOwnerError(asset, kind, { canEdit = false } = {}) {
  if (!asset) return 'ไม่พบเครื่องนี้';
  if (!canEdit) return 'ไม่มีสิทธิ์จัดการเครื่องบริการ';
  if (!MOVE_KINDS.includes(kind)) return 'คำสั่งไม่ถูกต้อง';

  /* เครื่องที่ปลดระวางแล้วไม่มีคำสั่งไหนทำได้อีก — **ปุ่มหายทั้งชุด ไม่ใช่กดไม่ได้**
     เพราะมันไม่ใช่ "ติดด่านชั่วคราว" แต่คือจุดจบของเครื่อง */
  if (asset.status === 'removed') return 'เครื่องนี้ปลดระวางแล้ว';

  const onSite = asset.status === 'active';
  const inStock = asset.status === 'in_stock';
  const atRepair = asset.status === 'repair';

  // ปุ่มที่ไม่เข้ากับสภาพปัจจุบันเลย ไม่ต้องโชว์ — โชว์แล้วบอกเหตุมีประโยชน์เฉพาะ
  // กับด่านที่ผู้ใช้ "แก้ได้" ไม่ใช่กับคำสั่งที่ไม่มีความหมายในสถานะนี้
  if (kind === 'install' && !inStock) return 'ติดตั้งได้เฉพาะเครื่องที่อยู่ในคลัง';
  if (kind === 'transfer' && !onSite) return 'ย้ายได้เฉพาะเครื่องที่ติดตั้งอยู่';
  if (kind === 'return' && !onSite) return 'ถอดออกจากไซต์ได้เฉพาะเครื่องที่ติดตั้งอยู่';
  if (kind === 'repair' && atRepair) return 'เครื่องนี้ส่งซ่อมอยู่แล้ว';
  if (kind === 'repair_done' && !atRepair) return 'ใช้ได้เฉพาะเครื่องที่ส่งซ่อมอยู่';
  if (kind === 'receive') return 'รับเข้าคลังใช้กับเครื่องที่ยังไม่มีในระบบ';

  return null;
}

/* ── ด่านที่ 2: กดได้ไหม → คุมการ "กดได้ + บอกเหตุ" ─────────────────────
   รับค่าที่ผู้ใช้กรอกมาแล้ว (`input`) กับบริบทที่ต้องโหลดมาก่อน (`toSite`)
   ⚠️ **fail-closed** — ไม่ส่งบริบทมา = ปฏิเสธ ไม่ใช่ปล่อยผ่าน */
export function assetMoveError(asset, kind, input = {}, ctx = {}) {
  const owner = assetMoveOwnerError(asset, kind, ctx);
  if (owner) return owner;

  if (!input.movedAt) return 'ต้องระบุวันที่';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.movedAt))) return 'วันที่ไม่ถูกต้อง';

  if (MOVE_NEEDS_REASON.includes(kind)) {
    const reason = String(input.reason ?? '').trim();
    // 3 ตัวอักษรเท่ากับ CHECK ใน DB เป๊ะ — ต่างกันเมื่อไรผู้ใช้จะเจอ error ดิบของ Postgres
    if (reason.length < 3) return 'ต้องระบุเหตุผล';
  }

  /* คำสั่งที่ล้างที่อยู่ — ไม่มีปลายทางให้เลือก และ **ห้ามมี** (mig 0344)
     ⚠️ ส่ง `toSiteId` มาแปลว่าจอกับ API เข้าใจคำสั่งคนละอย่าง ⇒ ตีกลับ ไม่ใช่เมิน */
  if (MOVE_CLEARS_SITE.includes(kind)) {
    if (input.toSiteId) return `${MOVE_LABELS[kind]}ไม่ต้องเลือกไซต์ปลายทาง — เครื่องจะกลับไปเป็น "ว่าง"`;
    if (!asset.siteId && kind === 'return') return 'เครื่องนี้ไม่ได้อยู่ที่ไซต์ไหนอยู่แล้ว';
  } else if (MOVE_CHANGES_SITE.includes(kind)) {
    const { toSite } = ctx;
    if (!input.toSiteId) return 'ต้องเลือกไซต์ปลายทาง';
    if (!toSite) return 'ไม่พบไซต์ปลายทาง';
    if (MOVE_REQUIRES_NEW_SITE.includes(kind) && toSite.id === asset.siteId) {
      return 'ไซต์ปลายทางเป็นที่เดิม';
    }
    if (toSite.isActive === false) return 'ไซต์ปลายทางถูกปิดใช้งานอยู่';

    /* 🔴 ปลายทางต้องเป็นไซต์ **ประเภทที่ถูก** — trigger ใน DB (mig 0332) จะตีกลับอยู่แล้ว
       แต่ข้อความของ trigger เป็นภาษาของฐานข้อมูล ⇒ ต้องดักที่นี่ให้ได้ข้อความที่คนอ่านรู้เรื่อง */
    if (isWarehouseSite(toSite)) {
      return 'ติดตั้ง/ย้ายต้องเลือกไซต์ลูกค้า ไม่ใช่คลัง';
    }
  }

  if (kind === 'condition') {
    if (!ASSET_CONDITIONS.includes(input.condition)) return 'ต้องระบุสภาพเครื่อง';
    if (input.condition === asset.condition) return 'สภาพเครื่องเป็นค่านี้อยู่แล้ว';
  }

  /* วันที่ย้อนก่อนวันติดตั้งไม่ได้ — ไม่งั้นไทม์ไลน์เรียงกลับหัว
     ⚠️ เทียบเป็นสตริง ISO ได้ตรง ๆ (YYYY-MM-DD เรียงตามพจนานุกรม = เรียงตามเวลา) */
  if (asset.installedAt && MOVE_CHANGES_SITE.includes(kind) && kind !== 'install'
    && String(input.movedAt) < String(asset.installedAt)) {
    return 'วันที่ต้องไม่ก่อนวันติดตั้งของเครื่อง';
  }

  return null;
}

/* ค่าที่ต้องเขียนลง `service_assets` หลังคำสั่งผ่านด่าน — คืน patch อย่างเดียว
   ไม่แตะ DB · route เอาไปยิงเอง (แพตเทิร์นเดียวกับ normalizeAssetInput) */
export function assetMovePatch(asset, kind, input = {}) {
  const result = MOVE_RESULT[kind] || {};
  const patch = {};

  if (result.status) patch.status = result.status;
  if (result.condition) patch.condition = result.condition;
  if (kind === 'condition') patch.condition = input.condition;

  if (MOVE_CLEARS_SITE.includes(kind)) {
    // เครื่องกลับไปเป็น "ว่าง" = ไม่มีที่อยู่ (mig 0344) — CHECK ของ DB บังคับให้ต้อง null
    patch.siteId = null;
    patch.zoneId = null;
  } else if (MOVE_CHANGES_SITE.includes(kind)) {
    patch.siteId = input.toSiteId;
    /* ⚠️ **ล้างโซนเสมอเมื่อข้ามไซต์** — โซนอยู่ใต้ไซต์ ปล่อยค้างไว้เครื่องจะชี้โซน
       ของไซต์อื่น (trigger ใน mig 0332 ตีกลับให้ แต่ต้องล้างที่นี่ไม่ใช่ให้ล้ม) */
    patch.zoneId = input.toZoneId || null;
  }

  if (kind === 'install' || kind === 'transfer') {
    patch.installedAt = input.movedAt;
    patch.removedAt = null;          // กลับมาใช้งานแล้ว วันถอดเดิมไม่จริงอีกต่อไป
  }
  if (kind === 'return' || kind === 'retire') {
    patch.removedAt = input.movedAt;
  }
  if (kind === 'receive') {
    patch.receivedAt = input.movedAt;
  }

  return patch;
}

/* แถวประวัติที่ต้อง insert คู่กับ patch — ประกอบจากค่า "ก่อน" ของเครื่องกับค่าที่กรอก
   ⚠️ เก็บ **ชื่อไซต์ ณ ตอนนั้น** ด้วย — ไซต์เปลี่ยนชื่อทีหลังแล้วประวัติต้องไม่เพี้ยน */
export function assetMoveRow(asset, kind, input = {}, ctx = {}) {
  const patch = assetMovePatch(asset, kind, input);
  return {
    assetId: asset.id,
    kind,
    movedAt: input.movedAt,
    fromSiteId: asset.siteId || null,
    fromSiteName: ctx.fromSite?.name || null,
    fromZoneId: asset.zoneId || null,
    // คำสั่งที่ล้างที่อยู่ ⇒ ปลายทางเป็น null จริง ๆ ไม่ใช่ค้างค่าเดิมไว้ (mig 0344)
    toSiteId: MOVE_CLEARS_SITE.includes(kind) ? null
      : MOVE_CHANGES_SITE.includes(kind) ? (input.toSiteId || null) : (asset.siteId || null),
    toSiteName: MOVE_CLEARS_SITE.includes(kind) ? null
      : MOVE_CHANGES_SITE.includes(kind) ? (ctx.toSite?.name || null) : (ctx.fromSite?.name || null),
    toZoneId: MOVE_CLEARS_SITE.includes(kind) ? null
      : MOVE_CHANGES_SITE.includes(kind) ? (input.toZoneId || null) : (asset.zoneId || null),
    statusBefore: asset.status || null,
    statusAfter: patch.status || asset.status || null,
    conditionBefore: asset.condition || null,
    conditionAfter: patch.condition || asset.condition || null,
    reason: String(input.reason ?? '').trim() || null,
    note: String(input.note ?? '').trim() || null,
  };
}

/* ตรวจว่าค่าที่จะเขียนลงเครื่องยังอยู่ในทะเบียน — กันคำสั่งใหม่ที่ลืมต่อ CHECK ใน DB
   (เรียกจากเทสต์เป็นหลัก · route เรียกซ้ำได้ไม่เสียหาย) */
export function assetMovePatchValid(patch = {}) {
  if (patch.status && !ASSET_STATUSES.includes(patch.status)) return false;
  if (patch.condition && !ASSET_CONDITIONS.includes(patch.condition)) return false;
  return true;
}
