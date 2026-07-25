// ── ทะเบียนวัสดุ (mig 0143 + 0157) — logic ล้วน ───────────────────────
// ราคาวัสดุ (PM/RM) แยกจากราคาผลิต: ใช้ซ้ำได้ข้ามงาน มีรุ่น (rev) มีอายุ
// ใช้ร่วมทั้ง API และหน้าจอ กฎเดียวกันทั้งสองฝั่ง
//
// 0157: วัสดุเป็น **ข้อมูลหลัก** (มีสถานะ + ตัวตนที่ไม่ซ้ำ) และราคา 1 rev
// มีได้ **หลายชั้นจำนวน** — ราคาไม่ได้อยู่บน rev แล้ว อยู่ที่ rev.tiers
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

// ── ชั้นจำนวน (0157) ────────────────────────────────────────────────────
// ราคาของ 1 rev มีได้หลายชั้น: PM ขอราคาต่อชิ้นที่ 1000/3000/5000 = คนละราคา
// qty = null แปลว่า "ราคาเดียวไม่แบ่งชั้น" (เคส RM ต่อ กก.)
// ความหมายของชั้น: ราคาที่ **สั่งตั้งแต่ qty ขึ้นไป**

// ชั้นราคาของรุ่น เรียงจากน้อยไปมาก (ชั้น null มาก่อนเสมอ)
export function revisionTiers(revision) {
  const tiers = Array.isArray(revision?.tiers) ? revision.tiers : [];
  return [...tiers].sort((a, b) => {
    const qa = numberOrNull(a?.qty);
    const qb = numberOrNull(b?.qty);
    if (qa == null) return qb == null ? 0 : -1;
    if (qb == null) return 1;
    return qa - qb;
  });
}

// ราคาของชั้นหนึ่ง ๆ — อ่านช่องที่ตรงกับหน่วยของรุ่นเท่านั้น (ราคาที่ลงผิดช่อง
// ถือว่าไม่มี ไม่ใช่เอามาใช้ข้ามหน่วยแล้วเพี้ยนเงียบ)
export function tierUnitPrice(revision, tier) {
  if (!tier) return null;
  return revision?.unitBasis === 'per_kg'
    ? numberOrNull(tier.pricePerKg)
    : numberOrNull(tier.pricePerUnit);
}

// ชั้นที่ใช้เมื่อไม่ได้ระบุจำนวน = ชั้นไม่แบ่งชั้น ถ้าไม่มีก็ชั้นต่ำสุด
export function defaultTier(revision) {
  const tiers = revisionTiers(revision);
  return tiers[0] || null;
}

// ชั้นที่ตรงกับจำนวนที่ต้องการ: ชั้นสูงสุดที่ยังไม่เกินจำนวนนั้น
// คืน { tier, below } — below = true แปลว่าจำนวนที่ขอต่ำกว่าชั้นต่ำสุดที่มี
// (ราคาที่ได้จึงเป็นราคาของล็อตใหญ่กว่า = ต่ำกว่าความจริง ต้องเตือนผู้ใช้ ไม่ใช่เงียบ)
export function tierForQty(revision, qty) {
  const tiers = revisionTiers(revision);
  if (!tiers.length) return { tier: null, below: false };
  const want = numberOrNull(qty);
  if (want == null) return { tier: tiers[0], below: false };
  const withQty = tiers.filter((t) => numberOrNull(t.qty) != null);
  if (!withQty.length) return { tier: tiers[0], below: false };
  let picked = null;
  for (const t of withQty) if (Number(t.qty) <= want) picked = t;
  return picked ? { tier: picked, below: false } : { tier: withQty[0], below: true };
}

// ราคาต่อหน่วยของรุ่น — คืน null เมื่อยังไม่มีรุ่น/ไม่มีชั้นราคา
// (อย่าคืน 0 = คนละความหมาย). ระบุ qty เพื่อเลือกชั้น ไม่ระบุ = ชั้นตั้งต้น
export function revisionUnitPrice(revision, qty = null) {
  if (!revision) return null;
  const { tier } = tierForQty(revision, qty);
  return tierUnitPrice(revision, tier);
}

// ช่วงราคาของรุ่น (ไว้แสดงในตารางทะเบียนเมื่อมีหลายชั้น) — { min, max, count }
export function revisionPriceRange(revision) {
  const prices = revisionTiers(revision)
    .map((t) => tierUnitPrice(revision, t))
    .filter((p) => p != null);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices), count: prices.length };
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

// ── ตัวตนของวัสดุ (0157) ────────────────────────────────────────────────
// ต้องตรงกับ unique index material_prices_identity_uk เป๊ะ ๆ ไม่งั้นฝั่งแอปจะ
// คิดว่าเป็นคนละตัวแล้วยิง insert ไปชน constraint (ผู้ใช้เห็น error ดิบ)
export function normLabel(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function materialIdentityKey({ kind, label, formulaCode, customerId } = {}) {
  return [kind, normLabel(label), formulaCode || '', customerId || ''].join('::');
}

export function findMaterialByIdentity(materials = [], identity = {}) {
  const key = materialIdentityKey(identity);
  return materials.find((m) => materialIdentityKey(m) === key) || null;
}

// สถานะราคาของวัสดุ 1 ตัว ณ วันนี้ — ใช้ทั้งป้ายในทะเบียนและด่านบนใบขอราคาผลิต
//   'draft'    เซลเสนอเข้ามา รอ RD/PC รับ (ยังใช้ในใบไม่ได้)
//   'archived' เก็บเข้ากรุแล้ว
//   'no_price' รับเข้าทะเบียนแล้วแต่ยังไม่มีใครใส่ราคา
//   'expired'  มีราคาแต่เกินอายุ
//   'ready'    ใช้ได้เลย
export function materialPriceState(material, todayIso, ttlDays = DEFAULT_PRICE_TTL_DAYS) {
  if (!material) return 'no_price';
  if (material.status === 'draft') return 'draft';
  if (material.status === 'archived') return 'archived';
  const rev = latestRevision(material.revisions || []);
  if (!rev || revisionUnitPrice(rev) == null) return 'no_price';
  return isRevisionExpired(rev, todayIso, ttlDays) ? 'expired' : 'ready';
}

export const MATERIAL_STATE_LABELS = {
  draft: 'ร่าง — รอรับเข้าทะเบียน',
  archived: 'เก็บเข้ากรุ',
  no_price: 'ยังไม่มีราคา',
  expired: 'ราคาเกินอายุ',
  ready: 'พร้อมใช้',
};

// รุ่นล่าสุดของวัสดุ (revisionNo มากสุด)
export function latestRevision(revisions = []) {
  if (!revisions.length) return null;
  return [...revisions].sort((a, b) => Number(b.revisionNo) - Number(a.revisionNo))[0];
}

// เลือกราคาที่ควรใช้สำหรับลูกค้าหนึ่ง ๆ: ราคาทับรายลูกค้าก่อน ไม่มีค่อยใช้ราคากลาง
// materials = [{ ...material, revisions: [...] }]
// คืน { material, revision } ที่ดีที่สุด หรือ null
export function bestPriceFor(materials = [], { kind, label, customerId } = {}) {
  const matches = materials.filter(
    (m) => m.kind === kind && m.status === 'active' && normLabel(m.label) === normLabel(label),
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

// ── ตรวจชั้นราคาที่ RD/PC ตอบ (0157) — คืน { tiers, error } ──────────────
// tiers ที่คืนพร้อมส่งเข้า RPC append_material_price_revision ได้เลย
export const MAX_PRICE_TIERS = 12;

export function normalizeTiers(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { tiers: [], error: 'ต้องระบุราคาอย่างน้อย 1 ชั้น' };
  if (rows.length > MAX_PRICE_TIERS) {
    return { tiers: [], error: `ชั้นราคามากเกินไป (สูงสุด ${MAX_PRICE_TIERS} ชั้น)` };
  }
  const tiers = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `ชั้นที่ ${i + 1}`;
    const { value: price, error } = normalizeQuotedPrice(null, raw.price);
    if (error) return { tiers: [], error: `${at}: ${error}` };

    let qty = null;
    if (raw.qty != null && raw.qty !== '') {
      qty = Number(raw.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { tiers: [], error: `${at}: จำนวนต้องเป็นตัวเลขมากกว่า 0` };
      }
    }
    // ห้ามปนกัน: มีหลายชั้นแล้วต้องบอกจำนวนทุกชั้น ไม่งั้นไม่รู้ว่าชั้นไหนใช้เมื่อไร
    if (rows.length > 1 && qty == null) {
      return { tiers: [], error: `${at}: ต้องระบุจำนวนเมื่อมีมากกว่า 1 ชั้น` };
    }
    const key = qty == null ? '0' : String(qty);
    if (seen.has(key)) return { tiers: [], error: `${at}: จำนวนซ้ำกับชั้นก่อนหน้า` };
    seen.add(key);
    tiers.push({ qty, price });
  }
  tiers.sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0));
  return { tiers, error: null };
}

// ── ตรวจข้อมูลวัสดุก่อนสร้าง/แก้ (0157) — คืน { value, error } ───────────
export function normalizeMaterialInput(body = {}) {
  if (!MATERIAL_KINDS.includes(body.kind)) {
    return { value: null, error: 'ชนิดวัสดุไม่ถูกต้อง' };
  }
  const label = String(body.label ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return { value: null, error: 'ต้องระบุชื่อวัสดุ' };
  if (label.length > 200) return { value: null, error: 'ชื่อวัสดุยาวเกิน 200 ตัวอักษร' };

  const supplierNote = String(body.supplierNote ?? '').trim();
  if (supplierNote.length > 500) return { value: null, error: 'หมายเหตุผู้ขายยาวเกิน 500 ตัวอักษร' };

  const formulaCode = String(body.formulaCode ?? '').trim() || null;
  // RM ผูกสูตร (ตัวตนของ F/FB คือสูตร) — PM ไม่มีสูตร กันเผลอส่งมาแล้วตัวตนเพี้ยน
  if (body.kind === 'PM' && formulaCode) {
    return { value: null, error: 'บรรจุภัณฑ์ (PM) ไม่ผูกกับสูตร' };
  }
  return {
    value: {
      kind: body.kind,
      label,
      sourceDept: sourceDeptForMaterialKind(body.kind),
      customerId: body.customerId || null,
      customerName: body.customerName || null,
      formulaCode,
      formulaName: String(body.formulaName ?? '').trim() || null,
      supplierNote: supplierNote || null,
    },
    error: null,
  };
}
