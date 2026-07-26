// ── เชื่อมใบขอราคาผลิต ↔ ทะเบียนวัสดุ (mig 0157–0159) — logic ล้วน ──────
// ในใบขอราคาผลิต เซลไม่ได้รอ RD/PC ตอบราคาในใบ — ราคาวัสดุมาจากทะเบียน
// (ราคาวัสดุเป็น "ขั้นก่อน" ที่รวบรวมไว้แล้ว มติ 2026-07-23)
//
// 0159: บรรทัดผูกวัสดุด้วย **id** (`materialId`) ไม่ใช่การเทียบชื่อ — การเทียบชื่อ
// คือรากของบั๊ก "ตอบราคาแล้วบรรทัดไม่เคยได้ราคา" และมันเงียบเสมอเวลาสะกดไม่ตรง
import {
  isRevisionExpired, latestRevision, revisionTiers, tierForQty, tierUnitPrice,
} from '@/lib/materialPrices';

// สถานะการผูกทะเบียนของบรรทัดต้นทุนหนึ่งบรรทัด:
//   'internal'  บรรทัดค่าดำเนินการ (ไม่มี sourceDept) — ไม่ต้องหาในทะเบียน
//   'unlinked'  ยังไม่ได้เลือกวัสดุ — เซลต้องเลือกจากทะเบียนก่อน
//   'missing'   ผูกไว้แต่หาวัสดุตัวนั้นไม่เจอในชุดที่โหลดมา (ถูกเก็บเข้ากรุ/ลบ)
//   'draft'     วัสดุยังเป็นร่างที่เซลเสนอ รอ RD/PC รับเข้าทะเบียน
//   'no_price'  อยู่ในทะเบียนแล้วแต่ยังไม่มีใครใส่ราคา
//   'expired'   มีราคาแต่เกินอายุ — ต้องเปิดเคสขอราคาใหม่
//   'ready'     ราคายังสด ดึงมาใช้ได้เลย
// คืน { status, material, revision, tier, tierBelow } — tierBelow = true แปลว่า
// ชั้นที่บรรทัดเลือกไว้ต่ำกว่าชั้นต่ำสุดที่รุ่นนี้มี (ราคาที่ได้เป็นของล็อตใหญ่กว่า
// = ถูกกว่าความจริง ต้องบอกผู้ใช้ ไม่ใช่เงียบ ๆ ใช้ชั้นอื่นแทน)
export function componentLibraryStatus(component, materials = [], { todayIso } = {}) {
  const none = { material: null, revision: null, tier: null, tierBelow: false };
  if (!component?.sourceDept) return { status: 'internal', ...none };
  if (!component.materialId) return { status: 'unlinked', ...none };

  const material = materials.find((m) => m.id === component.materialId) || null;
  if (!material) return { status: 'missing', ...none };
  if (material.status === 'draft') return { status: 'draft', ...none, material };

  const revision = latestRevision(material.revisions || []);
  const { tier, below } = tierForQty(revision, component.priceTierQty);
  if (!revision || tierUnitPrice(revision, tier) == null) {
    return { status: 'no_price', ...none, material, revision };
  }
  const expired = isRevisionExpired(revision, todayIso);
  return {
    status: expired ? 'expired' : 'ready',
    material,
    revision,
    tier,
    tierBelow: below,
  };
}

export const COMPONENT_LIBRARY_LABELS = {
  unlinked: 'ยังไม่เลือกวัสดุ',
  missing: 'วัสดุถูกเก็บเข้ากรุ',
  draft: 'วัสดุยังเป็นร่าง',
  no_price: 'ยังไม่มีราคาในทะเบียน',
  expired: 'ราคาในทะเบียนเกินอายุ',
  ready: 'ราคาพร้อมใช้',
};

// ราคา snapshot ที่ตรึงอยู่บนบรรทัดแล้ว (ดึงมาจากทะเบียนตอนไหนสักตอน)
export function componentSnapshotPrice(component) {
  if (component?.priceStatus !== 'quoted') return null;
  const price = component.unitBasis === 'per_kg' ? component.pricePerKg : component.pricePerUnit;
  return price == null ? null : Number(price);
}

// snapshot บนบรรทัดเกินอายุแล้วหรือยัง — ดูจากรุ่นที่บรรทัดตรึงไว้ ไม่ใช่รุ่นล่าสุด
// (ทะเบียนออก rev ใหม่ไม่ได้แปลว่าใบนี้ต้องขยับ — ใบตรึงตัวเลขของตัวเองไว้ มติ 2)
export function componentSnapshotExpired(component, materials = [], todayIso) {
  if (componentSnapshotPrice(component) == null) return false;
  if (!component.materialRevisionId) return false;   // กรอกมือ/ใบเก่า — ไม่มีอายุให้เทียบ
  const material = materials.find((m) => m.id === component.materialId);
  const revision = (material?.revisions || []).find((r) => r.id === component.materialRevisionId);
  if (!revision) return false;
  return isRevisionExpired(revision, todayIso);
}

// บรรทัดพร้อมส่งผู้บริหารไหม — คืนข้อความไทยข้อแรกที่พบ หรือ null ถ้าพร้อม
// pendingAskComponentIds = บรรทัดที่มีเคสขอราคาค้างอยู่ (Set ของ componentId)
export function libraryPricingBlocker(items = [], materials = [], opts = {}) {
  const { todayIso, pendingAskComponentIds } = opts;
  for (const item of items) {
    for (const component of item.components || []) {
      if (!component.sourceDept) continue;             // ค่าดำเนินการ ข้าม
      if (component.required === false) continue;      // ไม่บังคับ ข้าม
      const at = `"${item.productLabel}" — บรรทัด "${component.label}"`;

      // กรัม/ชิ้นเป็นของบรรทัด ไม่ใช่ของราคา — per_kg ที่ไม่มีกรัมคำนวณต้นทุนไม่ได้
      // แม้ราคาจะครบ (บั๊ก 3: แม่แบบไม่ใส่กรัมมา แล้วเดิมแก้บนใบไม่ได้เลย)
      if (component.unitBasis === 'per_kg' && !(Number(component.gramsPerUnit) > 0)) {
        return `${at} ยังไม่ได้ระบุกรัม/ชิ้น`;
      }
      if (pendingAskComponentIds?.has(component.id)) {
        return `${at} มีเคสขอราคาค้างอยู่ — รอฝ่าย ${component.sourceDept} ตอบก่อน`;
      }

      const snapshot = componentSnapshotPrice(component);
      if (snapshot != null) {
        if (componentSnapshotExpired(component, materials, todayIso)) {
          return `${at} ราคาที่ดึงมาเกินอายุแล้ว — กดขอราคาใหม่หรือดึงราคาล่าสุด`;
        }
        continue;
      }

      const { status } = componentLibraryStatus(component, materials, { todayIso });
      if (status === 'unlinked') return `${at} ยังไม่ได้เลือกวัสดุจากทะเบียน`;
      if (status === 'missing') return `${at} ผูกกับวัสดุที่ถูกเก็บเข้ากรุแล้ว — เลือกวัสดุใหม่`;
      if (status === 'draft') return `${at} วัสดุยังเป็นร่าง รอ ${component.sourceDept} รับเข้าทะเบียน`;
      if (status === 'no_price') return `${at} ยังไม่มีราคาในทะเบียน — กดขอราคา`;
      if (status === 'expired') return `${at} ราคาในทะเบียนเกินอายุ — กดขอราคาใหม่`;
      return `${at} ยังไม่ได้ดึงราคาจากทะเบียน`;
    }
  }
  return null;
}

// ค่าที่จะเขียนลงบรรทัดเมื่อดึงราคาจากทะเบียน 1 รุ่น — snapshot ราคา **ค่าเดียว**
// ที่ชั้นซึ่งบรรทัดเลือกไว้ + ตัวชี้กลับทะเบียน (มติ 2: สูตรต้นทุนไม่รู้จักชั้น)
export function componentFillFromRevision(revision, { tierQty = null } = {}) {
  const { tier } = tierForQty(revision, tierQty);
  const unit = tierUnitPrice(revision, tier);
  if (unit == null) return null;
  const priceField = revision.unitBasis === 'per_kg'
    ? { pricePerKg: unit, pricePerUnit: null }
    : { pricePerUnit: unit, pricePerKg: null };
  return {
    ...priceField,
    materialId: revision.materialId,
    materialRevisionId: revision.id,
    priceTierQty: tierQty == null ? null : Number(tierQty),
    priceStatus: 'quoted',
  };
}

// ── ชั้นราคาที่ควรใช้กับใบนี้ (คำแนะนำ ไม่ใช่การบังคับ — มติ 1+2) ─────────
// จำนวนวัสดุ ≠ จำนวนสินค้า: ใบที่มี 3 SKU สั่ง SKU ละ 1000 ใช้ขวดแบบเดียวกัน
// = สั่งขวด 3000 ใบ ต้องได้ราคาชั้น 3000. เซลเป็นคนตัดสินสุดท้ายเสมอ
export function suggestedTierQty(request) {
  const moq = Number(request?.moq);
  if (!Number.isFinite(moq) || moq <= 0) return null;
  const skus = (request?.items || []).length || 1;
  return moq * skus;
}

// ชั้นที่ระบบจะแนะนำจริงสำหรับบรรทัดหนึ่ง = ชั้นที่ครอบจำนวนนั้นในรุ่นล่าสุด
// (ไม่มีชั้นไหนครอบ = ไม่แนะนำอะไร ปล่อยให้เซลเลือกเอง)
export function suggestedTierForComponent(material, wantQty) {
  const revision = latestRevision(material?.revisions || []);
  if (!revision || wantQty == null) return null;
  const withQty = revisionTiers(revision).filter((t) => t.qty != null);
  if (!withQty.length) return null;
  const { tier, below } = tierForQty(revision, wantQty);
  return below ? null : (tier?.qty ?? null);
}
