// ── คลังราคาวัสดุ (mig 0143) — logic ล้วน ─────────────────────────────
// ราคาวัสดุ (PM/RM) แยกจากราคาผลิต: ใช้ซ้ำได้ข้ามงาน มีรุ่น (rev) มีอายุ
// ใช้ร่วมทั้ง API และหน้าจอ กฎเดียวกันทั้งสองฝั่ง
import { businessMonthKey } from '@/lib/businessDate';
import { canQuoteCosting, isSuperuser, normalizeDepartment } from '@/lib/permissions';

// ชนิดวัสดุ = ชุดย่อยของบรรทัดแม่แบบ (ไม่รวม labor — ค่าดำเนินการไม่ใช่ "วัสดุ")
export const MATERIAL_KINDS = ['RM_F', 'RM_FB', 'PM'];
export const MATERIAL_KIND_LABELS = {
  RM_F: 'หัวน้ำหอม (RM)',
  RM_FB: 'เนื้อสาร (RM)',
  PM: 'บรรจุภัณฑ์ (PM)',
};

// อายุราคาเริ่มต้น — เกินแล้วต้องขอยืนยันก่อนใช้ในใบขอราคาผลิต
// (ปรับได้ทีหลังถ้าผู้ใช้อยากได้ค่าอื่น — มติ: default 90 วัน, ยืนยันตอน UAT)
export const DEFAULT_PRICE_TTL_DAYS = 90;

export function unitBasisForMaterialKind(kind) {
  return kind === 'PM' ? 'per_piece' : 'per_kg';
}

export function sourceDeptForMaterialKind(kind) {
  return kind === 'PM' ? 'PC' : 'RD';
}

// null/''/undefined = ยังไม่กรอก → null. ห้ามใช้ Number() ตรง ๆ เพราะ Number(null)=0
// จะกลายเป็น "ราคา 0" ทั้งที่แปลว่ายังไม่รู้ราคา
function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ราคาต่อหน่วยของรุ่น — คืน null เมื่อยังไม่มีรุ่น (อย่าคืน 0 = คนละความหมาย)
export function revisionUnitPrice(revision) {
  if (!revision) return null;
  return revision.unitBasis === 'per_kg'
    ? numberOrNull(revision.pricePerKg)
    : numberOrNull(revision.pricePerUnit);
}

// วันหมดอายุของรุ่น: ใช้ validUntil ถ้ามี ไม่งั้น quotedAt + TTL
// คืนสตริง 'YYYY-MM-DD'
export function revisionValidUntil(revision, ttlDays = DEFAULT_PRICE_TTL_DAYS) {
  if (!revision) return null;
  if (revision.validUntil) return String(revision.validUntil).slice(0, 10);
  if (!revision.quotedAt) return null;
  const base = new Date(revision.quotedAt);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + ttlDays);
  return base.toISOString().slice(0, 10);
}

// ราคาเกินอายุแล้วหรือยัง เทียบกับ "วันนี้" (ส่ง todayIso มาเพื่อทดสอบได้)
export function isRevisionExpired(revision, todayIso, ttlDays = DEFAULT_PRICE_TTL_DAYS) {
  const until = revisionValidUntil(revision, ttlDays);
  if (!until) return true; // ไม่มีข้อมูลพอ = ถือว่าต้องยืนยัน (ปลอดภัยไว้ก่อน)
  const today = String(todayIso).slice(0, 10);
  return today > until;
}

// รุ่นล่าสุดของวัสดุ (revisionNo มากสุด)
export function latestRevision(revisions = []) {
  if (!revisions.length) return null;
  return [...revisions].sort((a, b) => Number(b.revisionNo) - Number(a.revisionNo))[0];
}

// เลือกราคาที่ควรใช้สำหรับลูกค้าหนึ่ง ๆ: ราคาทับรายลูกค้าก่อน ไม่มีค่อยใช้ราคากลาง
// materials = [{ ...material, revisions: [...] }]
// คืน { material, revision } ที่ดีที่สุด หรือ null
export function bestPriceFor(materials = [], { kind, label, customerId } = {}) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const matches = materials.filter(
    (m) => m.kind === kind && !m.isHidden && norm(m.label) === norm(label),
  );
  if (!matches.length) return null;
  // ทับรายลูกค้าก่อน (customerId ตรง) แล้วค่อยราคากลาง (customerId null)
  const scoped = customerId ? matches.filter((m) => m.customerId === customerId) : [];
  const central = matches.filter((m) => !m.customerId);
  const pick = (scoped[0] || central[0] || matches[0]);
  const revision = latestRevision(pick.revisions || []);
  return revision ? { material: pick, revision } : null;
}

// ── สิทธิ์ ──────────────────────────────────────────────────────────────
// ตอบราคาวัสดุ (สร้าง rev): ต้องถือ costing:quote และเป็นฝ่ายเจ้าของ (RD/PC)
// admin ตอบแทนได้ (break-glass). แชร์ตรรกะกับใบขอราคาผลิตผ่าน canQuoteCosting
export function canQuoteMaterial(user, kindOrDept) {
  if (!canQuoteCosting(user)) return false;
  if (isSuperuser(user?.role)) return true;
  const dept = MATERIAL_KINDS.includes(kindOrDept)
    ? sourceDeptForMaterialKind(kindOrDept)
    : kindOrDept;
  return normalizeDepartment(user?.department) === dept;
}

// ── เลขที่เอกสาร MR-YYMMXXXX ─────────────────────────────────────────────
export async function generateMaterialRequestDocNo(supabase, now = new Date()) {
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: 'MR', p_month: month });
  if (error) throw new Error(`ออกเลขที่ใบขอราคาวัสดุไม่สำเร็จ: ${error.message}`);
  return `MR-${month}${String(data).padStart(4, '0')}`;
}

// ── ตรวจรูปแบบบรรทัดคำถาม (ก่อนแตะ DB) ──────────────────────────────────
export function normalizeMaterialRequestItems(input, { maxItems = 40 } = {}) {
  if (!Array.isArray(input) || input.length === 0) {
    return { items: [], error: 'ต้องระบุวัสดุอย่างน้อย 1 รายการ' };
  }
  if (input.length > maxItems) {
    return { items: [], error: `วัสดุในใบเดียวมากเกินไป (สูงสุด ${maxItems} รายการ)` };
  }
  const items = [];
  const seen = new Set();
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const at = `รายการที่ ${i + 1}`;
    if (!MATERIAL_KINDS.includes(raw.kind)) return { items: [], error: `${at}: ชนิดวัสดุไม่ถูกต้อง` };
    const label = String(raw.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { items: [], error: `${at}: ต้องระบุชื่อวัสดุ` };
    if (label.length > 200) return { items: [], error: `${at}: ชื่อวัสดุยาวเกิน 200 ตัวอักษร` };
    const dupKey = `${raw.kind}::${label.toLowerCase()}`;
    if (seen.has(dupKey)) return { items: [], error: `${at}: ชื่อวัสดุซ้ำกับบรรทัดก่อนหน้า` };
    seen.add(dupKey);
    items.push({
      kind: raw.kind,
      label,
      sourceDept: sourceDeptForMaterialKind(raw.kind),
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ตรวจราคาที่ RD/PC ตอบ 1 บรรทัด — คืน { value, error }
export function normalizeQuotedPrice(kind, price) {
  if (price == null || price === '') return { value: null, error: 'ต้องระบุราคา' };
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return { value: null, error: 'ราคาต้องเป็นตัวเลขไม่ติดลบ' };
  return { value: n, error: null };
}
