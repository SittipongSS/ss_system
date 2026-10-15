// ── ตัวคิดของหน้าต่าง "เพิ่มหลายโซน" (`ZonesBulkModal` · mig 0392 · PR-A) — ตรรกะล้วน ไม่มี JSX ─────────────────
//
// ⭐ ติ๊กโซนแล้วใส่ "แต่ละครั้งกี่แพ็ค" (ค่า packsPerRound) ทีเดียว — สองแบบ (มติ S5 ของ r2 · คำตามมติ 29/09):
//   · 'assessed' ตามผลประเมินของแต่ละโซน (`assessedPackages` ของทะเบียน) — โซนที่ยังไม่เคยประเมิน = ว่าง ใส่ทีหลังในตาราง
//   · 'equal'    เท่ากันทุกโซน (ตัวเลขเดียว 1–9999)
// ⚠️ ข้อความตีกลับขึ้น **หลังกด** "เพิ่ม n โซน" เท่านั้น (กฎบ้าน: แดงหลังกด) — ตัวนี้แค่บอกว่ากดแล้วจะได้อะไร/ติดอะไร
// ⚠️ generic ของงานบริการ ไม่ผูกกับใบสั่งขาย ⇒ PR-D ห่อหน้าต่างของใบย้อนหลังด้วยตัวเดียวกันได้
// ⭐ **ตัวเลขผลประเมินที่มาจากแบบ** (ประเมินจากแบบ · งวด S2b · แผน survey-desk-assessment §5) — เตือน ไม่เคยห้าม (มติเจ้าของ D1:
//   ผลจากแบบเป็นผลประเมินจริง เสนอราคา/ตั้งงานบริการได้) · แถวทะเบียนบอกมาเองว่าโซนไหนเป็นผลจากแบบ:
//     `confirmTag` มีคำ = ผลล่าสุดมาจากแบบ ⇒ ต่อ " (จากแบบ)" ท้ายตัวเลข (`zoneAssessedSourceNote`)
//     `confirm` เป็น 'awaiting' = ใบตอบว่าต้องยืนยันหน้างานและยังไม่ได้ยืนยัน ⇒ นับใน `plan.awaitingConfirm`
//   ⚠️ แถวที่ไม่มีสองคีย์นี้ (ผลลงหน้างาน · ยังไม่ประเมิน · ทะเบียนรายไซต์ของใบย้อนหลังที่พกแต่ตัวเลข) = ไม่มีคำต่อท้าย นับ 0
import { naText } from '@/lib/format';
// คำของวิธีประเมินมาจากที่เดียว — ไฟล์ล้วน (ไม่มีของ server)
import { SURVEY_METHOD_CHIP, SURVEY_METHOD_LABEL } from '@/lib/service/surveyMethodSwitch';

export const ZONES_BULK_PACKS_MIN = 1;
export const ZONES_BULK_PACKS_MAX = 9999;
/* คำเดียวกับ SERVICE_SETUP_LINE_TEXT.packsLabel ของใบสั่งขาย (มติ 29/09) — ตัวนี้ generic ของงานบริการ จึงเขียน literal เอง */
export const ZONES_BULK_PACKS_LABEL = 'รอบละกี่แพ็ค';
export const ZONES_BULK_PACKS_INVALID = 'รอบละกี่แพ็ค ต้องเป็นจำนวนเต็ม 1–9999';
export const ZONES_BULK_NONE_PICKED = 'ยังไม่ได้เลือกโซน';
export const zonesBulkCapText = (cap) => `เกิน ${cap} โซนต่อรายการ — แยกรายการที่ใบเสนอราคา`;

const packsOrNull = (value) => {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= ZONES_BULK_PACKS_MIN && n <= ZONES_BULK_PACKS_MAX ? n : null;
};

/** ต่อท้ายตัวเลขผลประเมินของโซน — " (จากแบบ)" เมื่อผลล่าสุดของโซนมาจากแบบ (`confirmTag` ของแถวทะเบียนมีคำ) · นอกนั้น = ''
 *  ใช้ทั้งชิปโซนในหน้าต่างนี้ ("· ประเมินไว้ n แพ็ค (จากแบบ)") และบรรทัดผลประเมินในตารางงานบริการ ("ผลประเมิน n แพ็ค (จากแบบ)") */
export const zoneAssessedSourceNote = (zone) => (zone?.confirmTag ? ` (${SURVEY_METHOD_CHIP.drawing})` : '');

/** บรรทัดเตือนท้ายหน้าต่าง — "{k} โซนใช้ตัวเลขที่ประเมินจากแบบ ยังไม่ยืนยันหน้างาน" · ไม่มีโซนแบบนั้น = null (ไม่วาด)
 *  ⚠️ เตือนอย่างเดียว — ไม่เกี่ยวกับ `plan.error` และไม่ทำให้ปุ่มเพิ่มโซนติดด่าน */
export const zonesBulkAwaitingText = (plan) => {
  const count = Number(plan?.awaitingConfirm) || 0;
  return count > 0 ? `${count} โซนใช้ตัวเลขที่${SURVEY_METHOD_LABEL.drawing} ยังไม่ยืนยันหน้างาน` : null;
};

/**
 * @param selectedIds โซนที่ติ๊ก (ลำดับที่ติ๊ก) · @param zonesById Map zoneId → แถวทะเบียน (`assessedPackages` · `confirm`)
 * @param mode 'assessed' | 'equal' · @param equalPacks ตัวเลขที่พิมพ์ในช่อง "เท่ากันทุกโซน"
 * @param existingCount โซนที่บรรทัดถืออยู่แล้ว · @param cap เพดานโซนต่อบรรทัด (500 เท่ากับ CHECK ของฐาน)
 * @returns `{ rows: [{ zoneId, packsPerRound|null }], count, assessed, blank, packs, awaitingConfirm, error }` — error = ข้อความไทย (ไม่มี = null)
 *   · `awaitingConfirm` = โซนที่ติ๊กซึ่ง **ตัวเลขที่เติมให้มาจากแบบและยังรอยืนยันหน้างาน** (เฉพาะโหมด 'assessed' — โหมด 'equal'
 *     ใช้ตัวเลขที่คนพิมพ์เอง ไม่ได้ใช้ตัวเลขจากแบบ = 0 · โซนที่ผลประเมินเติมไม่ได้ก็ไม่นับ: มันอยู่ใน `blank` แล้ว) — ไม่เคยตั้ง `error`
 */
export function zonesBulkPlan({
  selectedIds = [], zonesById = new Map(), mode = 'assessed', equalPacks = '', existingCount = 0, cap = 500,
} = {}) {
  const ids = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  const equal = mode === 'equal';
  const packs = equal ? packsOrNull(equalPacks) : null;
  const zoneOf = (zoneId) => (zonesById instanceof Map ? zonesById.get(zoneId) : null);
  const rows = ids.map((zoneId) => ({
    zoneId,
    packsPerRound: equal ? packs : packsOrNull(zoneOf(zoneId)?.assessedPackages),
  }));
  const assessed = equal ? 0 : rows.filter((row) => row.packsPerRound !== null).length;
  const awaitingConfirm = equal
    ? 0
    : rows.filter((row) => row.packsPerRound !== null && zoneOf(row.zoneId)?.confirm === 'awaiting').length;
  let error = null;
  if (!ids.length) error = ZONES_BULK_NONE_PICKED;
  else if (Number(existingCount || 0) + ids.length > cap) error = zonesBulkCapText(cap);
  else if (equal && packs === null) error = ZONES_BULK_PACKS_INVALID;
  return { rows, count: ids.length, assessed, blank: equal ? 0 : ids.length - assessed, packs, awaitingConfirm, error };
}

/** บรรทัดผลลัพธ์ท้ายหน้าต่าง ("จะเพิ่ม n โซนใต้รายการ k · …") */
export function zonesBulkConsequence(plan, { lineNo = null, mode = 'assessed' } = {}) {
  const under = lineNo ? `ใต้รายการ ${lineNo}` : 'ใต้รายการนี้';
  const head = `จะเพิ่ม ${plan?.count ?? 0} โซน${under}`;
  if (mode === 'equal') return `${head} · แต่ละครั้งเท่ากันทุกโซน ครั้งละ ${naText(plan?.packs)} แพ็ค`;
  return `${head} · ${ZONES_BULK_PACKS_LABEL}: ตามผลประเมิน ${plan?.assessed ?? 0} โซน · ยังว่าง ${plan?.blank ?? 0} โซน`;
}
