// ── เคสขอราคาวัสดุ (mig 0158) — logic ล้วน ─────────────────────────────
// เซลเปิดเคสถามราคาไปที่ PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// 1 เคส = หลายรายการ · แต่ละรายการผูกวัสดุในทะเบียนด้วย id เสมอ
// ใช้ร่วมทั้ง API และหน้าจอ กฎเดียวกันทั้งสองฝั่ง
import { businessMonthKey } from '@/lib/businessDate';
import { isSuperuser } from '@/lib/permissions';
import {
  MATERIAL_KINDS, canQuoteMaterial, sourceDeptForMaterialKind,
} from '@/lib/materialPrices';

export const ASK_STATUSES = ['draft', 'pending', 'acknowledged', 'answered', 'closed', 'cancelled'];

export const ASK_STATUS_LABELS = {
  draft: 'ร่าง',
  pending: 'ส่งแล้ว — รอรับเรื่อง',
  acknowledged: 'รับเรื่องแล้ว — กำลังหาราคา',
  answered: 'ตอบครบแล้ว',
  closed: 'ปิดเคส',
  cancelled: 'ยกเลิก',
};

// เคสที่ "ยังเดินอยู่" — ใช้กรองคิวและนับงานค้างของฝ่าย
export const ASK_OPEN_STATUSES = ['pending', 'acknowledged'];

export const ASK_ITEM_STATUS_LABELS = {
  pending: 'รอราคา',
  quoted: 'ตอบราคาแล้ว',
  no_quote: 'ตอบไม่ได้',
};

// เลขที่แยกตามฝ่ายผู้ตอบ: PC → PM-YYMMXXXX, RD → RM-YYMMXXXX
// (ดูเลขแล้วรู้ทันทีว่าเป็นงานฝ่ายไหน โดยไม่ต้องเปิดเคส)
export function askDocScope(dept) {
  return dept === 'PC' ? 'PM' : 'RM';
}

export async function generateAskDocNo(supabase, dept, now = new Date()) {
  const scope = askDocScope(dept);
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: month });
  if (error) throw new Error(`ออกเลขที่เคสขอราคาไม่สำเร็จ: ${error.message}`);
  return `${scope}-${month}${String(data).padStart(4, '0')}`;
}

// ── ตรวจรายการในเคสก่อนแตะ DB ────────────────────────────────────────────
export const MAX_ASK_ITEMS = 40;
export const MAX_ASK_TIERS = 12;

// items เข้ามาเป็น [{ kind, materialId?, newLabel?, label, spec?, componentId?, tiers: [qty…] }]
// materialId ว่าง = ของใหม่ ผู้เรียก (API) ต้องสร้างวัสดุร่างแล้วเติม id กลับมาก่อนบันทึก
export function normalizeAskItems(input, { dept } = {}) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { items: [], error: 'ต้องมีรายการอย่างน้อย 1 รายการ' };
  if (rows.length > MAX_ASK_ITEMS) {
    return { items: [], error: `รายการในเคสเดียวมากเกินไป (สูงสุด ${MAX_ASK_ITEMS} รายการ)` };
  }

  const items = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `รายการที่ ${i + 1}`;
    if (!MATERIAL_KINDS.includes(raw.kind)) return { items: [], error: `${at}: ชนิดวัสดุไม่ถูกต้อง` };
    // ทุกรายการต้องเป็นของฝ่ายเดียวกับหัวเคส — เลขที่เคสผูกกับฝ่าย ปนกันแล้วส่งผิดคน
    const itemDept = sourceDeptForMaterialKind(raw.kind);
    if (dept && itemDept !== dept) {
      return { items: [], error: `${at}: เป็นของฝ่าย ${itemDept} แต่เคสนี้ส่งไปฝ่าย ${dept}` };
    }

    const label = String(raw.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { items: [], error: `${at}: ต้องระบุชื่อวัสดุ` };
    if (label.length > 200) return { items: [], error: `${at}: ชื่อวัสดุยาวเกิน 200 ตัวอักษร` };

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: สเปกยาวเกิน 2000 ตัวอักษร` };

    // กันถามวัสดุตัวเดียวกันซ้ำในเคสเดียว (ตอบแล้วจะไม่รู้ว่าอันไหนคู่กับอันไหน)
    const dupKey = raw.materialId ? `id:${raw.materialId}` : `new:${label.toLowerCase()}`;
    if (seen.has(dupKey)) return { items: [], error: `${at}: ถามวัสดุตัวนี้ซ้ำในเคสเดียวกัน` };
    seen.add(dupKey);

    const { tiers, error } = normalizeAskTiers(raw.tiers);
    if (error) return { items: [], error: `${at}: ${error}` };

    items.push({
      kind: raw.kind,
      materialId: raw.materialId || null,
      label,
      spec: spec || null,
      componentId: raw.componentId || null,
      tiers,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ชั้นจำนวนที่ขอ — ผู้ขอระบุเองอิสระ ไม่มีชุดค่าบังคับ (มติ 2026-07-26)
// ว่าง = ขอราคาเดียวไม่แบ่งชั้น
export function normalizeAskTiers(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { tiers: [], error: null };
  if (rows.length > MAX_ASK_TIERS) {
    return { tiers: [], error: `ชั้นจำนวนมากเกินไป (สูงสุด ${MAX_ASK_TIERS} ชั้น)` };
  }
  const tiers = [];
  const seen = new Set();
  for (const raw of rows) {
    const qty = Number(typeof raw === 'object' ? raw?.qty : raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { tiers: [], error: 'จำนวนที่ขอต้องเป็นตัวเลขมากกว่า 0' };
    }
    if (seen.has(qty)) return { tiers: [], error: `จำนวน ${qty} ซ้ำ` };
    seen.add(qty);
    tiers.push(qty);
  }
  tiers.sort((a, b) => a - b);
  return { tiers, error: null };
}

// ── ความคืบหน้า + สถานะที่ derive ────────────────────────────────────────
// ตัวนับคำนวณตอนอ่านเสมอ ห้ามเก็บคอลัมน์ (กัน drift — แพตเทิร์นเดียวกับใบขอราคาผลิต)
export function askProgress(items = []) {
  const total = items.length;
  const done = items.filter((i) => i.priceStatus === 'quoted' || i.priceStatus === 'no_quote').length;
  return { done, total, complete: total > 0 && done === total };
}

// ตอบครบทุกรายการ → เคสเป็น answered เอง (ไม่ต้องให้ใครกด)
export function deriveAskStatusAfterAnswer(items = [], currentStatus = 'acknowledged') {
  if (currentStatus === 'cancelled' || currentStatus === 'closed') return currentStatus;
  return askProgress(items).complete ? 'answered' : 'acknowledged';
}

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
// ตอบ/รับเรื่อง = ฝ่ายเจ้าของเคส (RD ตอบ RM, PC ตอบ PM) + admin break-glass
export function canAnswerAsk(user, ask) {
  if (!ask) return false;
  return canQuoteMaterial(user, ask.dept);
}

// จัดการเคส (ส่ง/แก้ร่าง/ยกเลิก) = ผู้ขอเอง + admin
// (หัวหน้าทีมไม่ได้ถูกดึงเข้ามาโดยตั้งใจ — เคสขอราคาเป็นงานปฏิบัติของคนเปิดเอง)
export function canManageAsk(user, ask) {
  if (!ask) return false;
  if (isSuperuser(user?.role)) return true;
  return !!user?.id && ask.requestedById === user.id;
}

// ── ด่านของแต่ละ action — คืนข้อความไทย หรือ null ถ้าผ่าน ───────────────
export function submitAskError(ask, items = []) {
  if (!ask) return 'ไม่พบเคส';
  if (ask.status !== 'draft') return 'เคสนี้ส่งไปแล้ว';
  if (!items.length) return 'ต้องมีรายการอย่างน้อย 1 รายการก่อนส่ง';
  return null;
}

export function acknowledgeAskError(ask) {
  if (!ask) return 'ไม่พบเคส';
  if (ask.status === 'draft') return 'เคสนี้ยังไม่ถูกส่ง';
  if (ask.status !== 'pending') return 'เคสนี้รับเรื่องไปแล้ว';
  return null;
}

export function answerAskError(ask) {
  if (!ask) return 'ไม่พบเคส';
  if (!ASK_OPEN_STATUSES.includes(ask.status)) {
    return ask.status === 'draft' ? 'เคสนี้ยังไม่ถูกส่ง' : 'เคสนี้ปิดไปแล้ว';
  }
  return null;
}

export function closeAskError(ask, items = []) {
  if (!ask) return 'ไม่พบเคส';
  if (ask.status === 'closed') return 'เคสนี้ปิดแล้ว';
  if (ask.status === 'cancelled') return 'เคสนี้ถูกยกเลิกไปแล้ว';
  if (!askProgress(items).complete) return 'ยังมีรายการที่ยังไม่ได้ตอบ — ตอบให้ครบหรือกด "ตอบไม่ได้" ก่อน';
  return null;
}

export function cancelAskError(ask) {
  if (!ask) return 'ไม่พบเคส';
  if (ask.status === 'cancelled') return 'เคสนี้ถูกยกเลิกไปแล้ว';
  if (ask.status === 'closed') return 'เคสที่ปิดแล้วยกเลิกไม่ได้';
  if (ask.status === 'answered') return 'เคสนี้ตอบครบแล้ว — ปิดเคสแทนการยกเลิก';
  return null;
}

export function deleteAskError(ask) {
  if (!ask) return 'ไม่พบเคส';
  if (ask.status !== 'draft' || ask.submittedAt) {
    return 'ลบได้เฉพาะร่างที่ยังไม่ส่ง — เคสที่ส่งแล้วเป็นหลักฐาน';
  }
  return null;
}
