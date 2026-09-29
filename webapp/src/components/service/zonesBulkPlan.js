// ── ตัวคิดของหน้าต่าง "เพิ่มหลายโซน" (`ZonesBulkModal` · mig 0392 · PR-A) — ตรรกะล้วน ไม่มี JSX ─────────────────
//
// ⭐ ติ๊กโซนแล้วใส่ "แต่ละครั้งกี่แพ็ค" (ค่า packsPerRound) ทีเดียว — สองแบบ (มติ S5 ของ r2 · คำตามมติ 29/09):
//   · 'assessed' ตามผลประเมินของแต่ละโซน (`assessedPackages` ของทะเบียน) — โซนที่ยังไม่เคยประเมิน = ว่าง ใส่ทีหลังในตาราง
//   · 'equal'    เท่ากันทุกโซน (ตัวเลขเดียว 1–9999)
// ⚠️ ข้อความตีกลับขึ้น **หลังกด** "เพิ่ม n โซน" เท่านั้น (กฎบ้าน: แดงหลังกด) — ตัวนี้แค่บอกว่ากดแล้วจะได้อะไร/ติดอะไร
// ⚠️ generic ของงานบริการ ไม่ผูกกับใบสั่งขาย ⇒ PR-D ห่อหน้าต่างของใบย้อนหลังด้วยตัวเดียวกันได้
import { naText } from '@/lib/format';

export const ZONES_BULK_PACKS_MIN = 1;
export const ZONES_BULK_PACKS_MAX = 9999;
/* คำเดียวกับ SERVICE_SETUP_LINE_TEXT.packsLabel ของใบสั่งขาย (มติ 29/09) — ตัวนี้ generic ของงานบริการ จึงเขียน literal เอง */
export const ZONES_BULK_PACKS_LABEL = 'แต่ละครั้งกี่แพ็ค';
export const ZONES_BULK_PACKS_INVALID = 'แต่ละครั้งกี่แพ็ค ต้องเป็นจำนวนเต็ม 1–9999';
export const ZONES_BULK_NONE_PICKED = 'ยังไม่ได้เลือกโซน';
export const zonesBulkCapText = (cap) => `เกิน ${cap} โซนต่อรายการ — แยกรายการที่ใบเสนอราคา`;

const packsOrNull = (value) => {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= ZONES_BULK_PACKS_MIN && n <= ZONES_BULK_PACKS_MAX ? n : null;
};

/**
 * @param selectedIds โซนที่ติ๊ก (ลำดับที่ติ๊ก) · @param zonesById Map zoneId → แถวทะเบียน (`assessedPackages`)
 * @param mode 'assessed' | 'equal' · @param equalPacks ตัวเลขที่พิมพ์ในช่อง "เท่ากันทุกโซน"
 * @param existingCount โซนที่บรรทัดถืออยู่แล้ว · @param cap เพดานโซนต่อบรรทัด (500 เท่ากับ CHECK ของฐาน)
 * @returns `{ rows: [{ zoneId, packsPerRound|null }], count, assessed, blank, packs, error }` — error = ข้อความไทย (ไม่มี = null)
 */
export function zonesBulkPlan({
  selectedIds = [], zonesById = new Map(), mode = 'assessed', equalPacks = '', existingCount = 0, cap = 500,
} = {}) {
  const ids = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  const equal = mode === 'equal';
  const packs = equal ? packsOrNull(equalPacks) : null;
  const rows = ids.map((zoneId) => ({
    zoneId,
    packsPerRound: equal ? packs : packsOrNull(zonesById instanceof Map ? zonesById.get(zoneId)?.assessedPackages : null),
  }));
  const assessed = equal ? 0 : rows.filter((row) => row.packsPerRound !== null).length;
  let error = null;
  if (!ids.length) error = ZONES_BULK_NONE_PICKED;
  else if (Number(existingCount || 0) + ids.length > cap) error = zonesBulkCapText(cap);
  else if (equal && packs === null) error = ZONES_BULK_PACKS_INVALID;
  return { rows, count: ids.length, assessed, blank: equal ? 0 : ids.length - assessed, packs, error };
}

/** บรรทัดผลลัพธ์ท้ายหน้าต่าง ("จะเพิ่ม n โซนใต้รายการ k · …") */
export function zonesBulkConsequence(plan, { lineNo = null, mode = 'assessed' } = {}) {
  const under = lineNo ? `ใต้รายการ ${lineNo}` : 'ใต้รายการนี้';
  const head = `จะเพิ่ม ${plan?.count ?? 0} โซน${under}`;
  if (mode === 'equal') return `${head} · แต่ละครั้งเท่ากันทุกโซน ครั้งละ ${naText(plan?.packs)} แพ็ค`;
  return `${head} · ${ZONES_BULK_PACKS_LABEL}: ตามผลประเมิน ${plan?.assessed ?? 0} โซน · ยังว่าง ${plan?.blank ?? 0} โซน`;
}
