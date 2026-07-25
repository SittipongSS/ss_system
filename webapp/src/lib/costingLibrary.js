// ── เชื่อมใบขอราคาผลิต ↔ คลังราคาวัสดุ (PR-B, mig 0143+0144) — logic ล้วน ──
// ในใบขอราคาผลิต เซลไม่ได้รอ RD/PC ตอบราคาในใบอีกต่อไป — ราคาวัสดุมาจากคลัง
// (ราคาวัสดุเป็น "ขั้นก่อน" ที่รวบรวมไว้แล้ว มติ 2026-07-23)
import { bestPriceFor, isRevisionExpired, revisionUnitPrice } from '@/lib/materialPrices';

// สถานะการจับคู่ราคาคลังของบรรทัดต้นทุนหนึ่งบรรทัด:
//   'internal'  บรรทัดค่าดำเนินการ (ไม่มี sourceDept) — ไม่ต้องหาในคลัง
//   'confirmed' ขอ RD/PC ยืนยันแล้ว — ใช้ได้แน่นอน
//   'missing'   คลังไม่มีวัสดุนี้ — ต้องเปิดใบขอราคาวัสดุก่อน
//   'expired'   คลังมี แต่ราคาเกินอายุ — ต้องกด "ขอยืนยันราคา"
//   'ready'     คลังมี ราคายังไม่เกินอายุ — ดึงมาใช้ได้เลย
// materials = คลังทั้งชุด (แต่ละตัวมี revisions[]); todayIso สำหรับทดสอบ
export function componentLibraryStatus(component, materials = [], { customerId, todayIso } = {}) {
  if (!component?.sourceDept) return { status: 'internal', match: null };
  if (component.confirmStatus === 'confirmed' || component.priceSource === 'confirmed') {
    return { status: 'confirmed', match: null };
  }
  const match = bestPriceFor(materials, {
    kind: component.kind, label: component.label, customerId,
  });
  if (!match) return { status: 'missing', match: null };
  const expired = isRevisionExpired(match.revision, todayIso);
  return { status: expired ? 'expired' : 'ready', match };
}

// บรรทัดพร้อมส่งผู้บริหารไหม: ราคาครบ + ไม่มีบรรทัดที่ "เกินอายุแล้วยังไม่ยืนยัน"
// (บรรทัดที่ยืนยันแล้ว/ดึงจากคลังที่ยังสด/กรอกมือ ถือว่าใช้ได้)
// คืนข้อความไทยข้อแรกที่พบ หรือ null ถ้าพร้อม
export function libraryPricingBlocker(items = [], materials = [], opts = {}) {
  for (const item of items) {
    for (const component of item.components || []) {
      if (!component.sourceDept) continue;             // ค่าดำเนินการ ข้าม
      if (component.required === false) continue;      // ไม่บังคับ ข้าม
      // มีราคา snapshot บนบรรทัดแล้ว (ดึง/ยืนยัน/กรอกมือ) = ผ่าน
      const hasSnapshot = component.priceStatus === 'quoted'
        && (component.pricePerKg != null || component.pricePerUnit != null);
      if (hasSnapshot) {
        // ราคาที่ดึงจากคลังแต่บรรทัดถูกทำเครื่องหมายว่าเกินอายุและขอยืนยันค้าง
        if (component.confirmStatus === 'pending') {
          return `"${item.productLabel}" — บรรทัด "${component.label}" รอ RD/PC ยืนยันราคาที่เกินอายุ`;
        }
        continue;
      }
      // ยังไม่มีราคา — บอกว่าคลังมีให้ดึงไหม
      const { status } = componentLibraryStatus(component, materials, opts);
      if (status === 'missing') {
        return `"${item.productLabel}" — ยังไม่มีราคาวัสดุ "${component.label}" ในคลัง (เปิดใบขอราคาวัสดุก่อน)`;
      }
      return `"${item.productLabel}" — ยังไม่ได้ดึงราคา "${component.label}" จากคลัง`;
    }
  }
  return null;
}

// ค่าที่จะเขียนลงบรรทัดเมื่อดึงราคาจากคลัง 1 รุ่น — snapshot ราคา + ตัวชี้คลัง
export function componentFillFromRevision(revision, { confirmed = false } = {}) {
  const unit = revisionUnitPrice(revision);
  if (unit == null) return null;
  const priceField = revision.unitBasis === 'per_kg'
    ? { pricePerKg: unit, pricePerUnit: null }
    : { pricePerUnit: unit, pricePerKg: null };
  return {
    ...priceField,
    materialId: revision.materialId,
    materialRevisionId: revision.id,
    priceStatus: 'quoted',
    priceSource: confirmed ? 'confirmed' : 'library',
    confirmStatus: confirmed ? 'confirmed' : null,
  };
}
