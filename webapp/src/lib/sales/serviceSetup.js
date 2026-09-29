// ── งานบริการรายบรรทัดของใบสั่งขาย: ตัวตัดสินล้วน (mig 0392 · PR-A · มติเจ้าของ 26–28/09) ─────────────
//
// ⭐ **ฝ่ายขายตั้งงานบริการที่ใบสั่งขายเอง** — ทุกบรรทัดของใบสาย SERVICE ต้องตอบว่า "เป็นแพ็คเกจบริการรายรอบไหม"
//   แพ็คเกจต้องมี FG หมวด 02-001 · โซน (หลายโซนได้ แต่ละโซนมี "แพ็คต่อรอบ") · รอบบริการ · และใบมีช่วงบริการหนึ่งช่วง
//   ⇒ อนุมัติแล้วรอบขายของโซน (service_zone_terms) เกิดทันทีในทรานแซกชันเดียวกัน TS ไม่ต้องผูกโซนอีก
//   ใบที่อนุมัติไปก่อนมีเรื่องนี้ = "ตั้งงานบริการย้อนหลัง" (ยื่นตรวจ → ผู้จัดการฝ่ายขายอนุมัติ · ไม่แตะยอด/Actual)
//
// ⭐ **ไฟล์เดียวที่ทุกผิวพูดตาม** — ตาราง (U6) · ด่านยื่น/อนุมัติ (U3/U4) · โมดัลอนุมัติ · แถบผู้อนุมัติ · หัวใบ
//   ถามตัวตัดสินที่นี่เท่านั้น · ฐาน (0392) มีกติกาคู่กัน (`sales_order_line_service_role` · `sales_order_service_setup_errors`
//   · `sales_order_service_setup_editable`) และมีเทสต์คู่ขนานคุมว่าพูดตรงกัน (serviceSetupSqlParity.test.mjs)
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอและฝั่ง API — ห้าม import อะไรที่เป็น server-only
// 🔴 **ทิศทางการ import (กฎ 16 ของแผน)**: `intake.js` ↔ `serviceOrders.js` เป็นวงอยู่แล้ววันนี้ ⇒
//   - ไฟล์นี้ import `intake.js` / `serviceOrders.js` ได้ แต่สองไฟล์นั้น **ห้าม** import ไฟล์นี้
//   - ไฟล์นี้ **ห้าม** import `serviceRoundsEntry.js` (ตัวนั้น import ไฟล์นี้)
//   - **ห้ามมีค่าคงที่ระดับบนสุดที่อ่านชื่อที่ import มา** — เขียน literal แล้วอ่าน import ในฟังก์ชันเท่านั้น
//     (วงของ ESM: ถ้าวันหนึ่งมีใครพาไฟล์นี้เข้าวง ชื่อที่ import อาจยังไม่ถูกผูกตอนโมดูลนี้รันบรรทัดบนสุด)
//   ยาม: serviceSetupImports.test.mjs
import { categoryOf } from '@/lib/master/categoryOf';
import { orderBusinessLineOf } from '@/lib/sales/serviceOrders';
import { addDays, daysBetween, isConfirmed, monthEdge, pipelineCoverageIssues, wholeMonthsIn } from '@/lib/sales/paymentCoverage';
import { billingRuleMonthly, billingRuleNeedsBillingDate } from '@/lib/sales/billingRule';
import { fillInputRows, fillKindOf, fillTargetsOf } from '@/lib/sales/installmentDateDrafts';
import { installmentRefunded, installmentVoid, paymentNotRequired } from '@/lib/sales/salesOrderPayments';
import { bindTargetError } from '@/lib/service/intake';
import { isHistoricalOrder, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import { fmtDate, fmtMoney, fmtNumber, fmtYearMonth } from '@/lib/format';
import { formatMonthLabel } from '@/lib/datePeriods';
import { isSalesManager } from '@/lib/permissions';

/* ══ ค่าคงที่ ══════════════════════════════════════════════════════════════════════════════════════ */

export const SERVICE_KIND_PACKAGE = 'package';
export const SERVICE_KIND_NOT_SERVICE = 'not_service';
export const SERVICE_ROLE_UNSET = 'unset';

/* หมวดของแพ็คเกจบริการรายรอบ — ⚠️ ต้องเท่ากับ SERVICE_ROUND_CATEGORY ของ serviceOrders.js (เทสต์ยึดไว้)
   เขียน literal ซ้ำโดยตั้งใจ: ค่าคงที่ระดับบนสุดห้ามอ่านชื่อที่ import มา (กฎ 16) */
const PACKAGE_CATEGORY = '02-001';

/* เพดานเดียวกับ CHECK/RPC ของ 0392 */
export const SERVICE_SETUP_LIMITS = Object.freeze({ zonesPerLine: 500, packsMin: 1, packsMax: 9999, roundsMin: 1, roundsMax: 999 });

/* ตัวเลือกชนิดบรรทัด (OptionTiles · ไม่มีค่าตั้งต้น) */
export const SERVICE_KIND_OPTIONS = Object.freeze([
  { value: 'package', label: 'แพ็คเกจบริการรายรอบ', description: 'เลือก FG หมวด 02-001 แล้วเลือกโซนและรอบ' },
  { value: 'not_service', label: 'ไม่ใช่งานบริการรายรอบ', description: 'ค่าขนส่ง ค่าออกแบบ สินค้าส่งครั้งเดียว รายได้อื่นๆ — ไม่ส่งให้ TS' },
]);

export const SERVICE_BACKFILL_STATE_LABELS = Object.freeze({
  not_started: 'ยังไม่เริ่ม',
  editing: 'ฝ่ายขายกำลังตั้ง',
  submitted: 'รอผู้จัดการตรวจ',
  rejected: 'ตีกลับ',
});

/* ── รหัสจากฐาน (RAISE EXCEPTION '<code>') → ข้อความไทย + สถานะ HTTP (ภาคผนวก A.2) ──────────────────────
   ⚠️ ผู้แปลหาด้วย `message.includes(code)` ⇒ ห้ามมีคีย์ไหนเป็นสตริงย่อยของอีกคีย์ (เทสต์ยึดไว้)
   ⚠️ `service_setup_copy_line_mismatch` อยู่ที่ documentWorkflowErrors.js (เส้นออก Rev. แปลผ่านตัวนั้น) */
export const SERVICE_SETUP_SQL_MESSAGES = Object.freeze({
  service_setup_forbidden: { message: 'ตั้งงานบริการได้เฉพาะฝ่ายขาย', status: 403 },
  sales_order_not_found: { message: 'ไม่พบ ใบสั่งขาย', status: 404 },
  service_setup_state_invalid: { message: 'งานบริการของใบนี้แก้ไม่ได้ในสถานะนี้ — ใบต้องเป็นร่าง/ถูกตีกลับ หรือใบเดิมที่ยังไม่ยื่นตรวจงานบริการ', status: 409 },
  workflow_stale: { message: 'ใบนี้ถูกแก้จากอีกหน้าต่าง — โหลดข้อมูลล่าสุดแล้ว', status: 409 },
  service_setup_payload_invalid: { message: 'ข้อมูลงานบริการที่ส่งมาไม่ถูกรูป — โหลดหน้าใหม่แล้วลองอีกครั้ง', status: 400 },
  service_setup_period_invalid: { message: 'ช่วงบริการไม่ถูกต้อง — ต้องมีทั้งวันเริ่มและวันสิ้นสุด วันเริ่มไม่เกินวันสิ้นสุด (ปี ค.ศ. 2000–2100)', status: 400 },
  service_setup_line_unknown: { message: 'มีรายการที่ไม่ได้อยู่ในใบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง', status: 409 },
  service_setup_kind_on_fg_line: { message: 'รายการที่มีรหัส FG ตั้งชนิดเองไม่ได้ — ระบบตัดสินจากหมวดของ FG', status: 400 },
  service_setup_kind_invalid: { message: 'ชนิดรายการไม่ถูกต้อง', status: 400 },
  service_setup_not_package: { message: 'รายการนี้ไม่ใช่แพ็คเกจบริการรายรอบ — เลือกชนิดเป็นแพ็คเกจก่อน แล้วจึงเลือก FG/โซน/รอบ', status: 400 },
  service_setup_product_invalid: { message: 'แพ็คเกจที่เลือกใช้ไม่ได้ — ต้องเป็น FG หมวด 02-001 ที่อนุมัติแล้วและยังใช้งาน', status: 400 },
  service_setup_rounds_invalid: { message: 'รอบบริการต้องเป็นจำนวนเต็ม 1–999', status: 400 },
  service_setup_zones_too_many: { message: 'เกิน 500 โซนต่อรายการ — แยกรายการที่ใบเสนอราคา', status: 400 },
  service_setup_zone_duplicate: { message: 'เลือกโซนเดียวกันซ้ำในรายการเดียว', status: 400 },
  service_setup_zone_invalid: { message: 'โซนที่เลือกใช้ไม่ได้ (ไม่พบ · ปิดใช้งาน · ไม่ใช่ไซต์ลูกค้าของใบนี้)', status: 400 },
  service_setup_packs_invalid: { message: 'แพ็คต่อรอบต้องเป็นจำนวนเต็ม 1–9999', status: 400 },
  sales_order_service_setup_locked: { message: 'งานบริการของใบนี้ล็อกแล้ว — รออนุมัติ/อนุมัติแล้ว · แก้ด้วยการดึงกลับ หรือย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบแก้ได้หลังอนุมัติ)', status: 409 },
  sales_order_service_setup_incomplete: { message: 'งานบริการยังไม่ครบ — ตรวจรายการที่ขึ้นสีแดง', status: 409 },
  service_setup_review_forbidden: { message: 'อนุมัติ/ตีกลับงานบริการได้เฉพาะผู้จัดการฝ่ายขาย', status: 403 },
  service_setup_review_state_invalid: { message: 'งานบริการของใบนี้ไม่ได้รอตรวจ — โหลดหน้าใหม่', status: 409 },
  service_setup_separation_required: { message: 'อนุมัติงานบริการที่ตัวเองยื่นไม่ได้ — ให้ผู้จัดการฝ่ายขายคนอื่นอนุมัติ', status: 403 },
  workflow_reason_invalid: { message: 'กรุณาระบุเหตุผล 10–500 ตัวอักษร', status: 400 },
  service_setup_legacy_terms_exist: { message: 'ใบนี้มีรอบขายที่ TS ผูกไว้ด้วยทางเดิม — เปิดงานบริการทับไม่ได้ · แจ้งผู้ดูแลระบบ', status: 409 },
  service_setup_override_reason_required: { message: 'Admin Override ต้องระบุเหตุผล 10–500 ตัวอักษร', status: 400 },
});

/** error ดิบจาก RPC → `{ code, message, status }` หรือ null (รหัสที่ไม่รู้จัก — ผู้เรียกตอบข้อความกลาง/500 เอง) */
export function serviceSetupSqlMessage(error) {
  const raw = String(error?.message || error || '');
  const code = Object.keys(SERVICE_SETUP_SQL_MESSAGES).find((key) => raw.includes(key));
  return code ? { code, ...SERVICE_SETUP_SQL_MESSAGES[code] } : null;
}

/* ── ข้อความของแต่ละข้อที่ยังขาด (ภาคผนวก A.1) — วันที่รับเป็น ISO แล้วแปลงเป็น dd/mm/yyyy ที่นี่ ────────────
   args: n = เลขรายการ · label = คำอธิบายสั้นของบรรทัด · fg = รหัสแพ็คเกจ · zone = ชื่อโซน · text = ข้อความของ
   bindTargetError · seq = งวดที่ · a/b = งวดคู่ที่ซ้อน · since/until = ช่วงวัน */
const dayText = (value) => (value ? fmtDate(value) : '—');
export const SERVICE_SETUP_ISSUE_TEXT = Object.freeze({
  kind_missing: ({ n, label } = {}) => `รายการ ${n} · ${label}: ยังไม่เลือกว่าเป็น แพ็คเกจบริการรายรอบ หรือ ไม่ใช่งานบริการรายรอบ`,
  fg_missing: ({ n } = {}) => `รายการ ${n}: ยังไม่เลือกแพ็คเกจ (FG หมวด 02-001)`,
  fg_invalid: ({ n, fg } = {}) => `รายการ ${n}: แพ็คเกจ ${fg || '—'} ใช้ไม่ได้แล้ว (ปิดใช้งาน/ยังไม่อนุมัติ/ไม่ใช่หมวด 02-001) — เลือกใหม่`,
  fg_foreign: ({ n, fg } = {}) => `รายการ ${n}: แพ็คเกจ ${fg || '—'} เป็นของนิติบุคคลอื่น — เลือก FG ของลูกค้าในใบ`,
  zones_missing: ({ n } = {}) => `รายการ ${n}: ยังไม่เลือกไซต์ · โซน`,
  packs_missing: ({ n, zone } = {}) => `รายการ ${n} · ${zone || '—'}: ยังไม่ใส่แพ็คต่อรอบ`,
  zone_invalid: ({ n, text } = {}) => `รายการ ${n}: ${text || 'โซนที่เลือกใช้ไม่ได้ (ไม่พบ · ปิดใช้งาน · ไม่ใช่ไซต์ลูกค้าของใบนี้)'}`,
  zones_on_not_service: ({ n } = {}) => `รายการ ${n}: ตั้งเป็นไม่ใช่งานบริการรายรอบแต่ยังมีโซนค้าง — บันทึกงานบริการใหม่`,
  rounds_missing: ({ n } = {}) => `รายการ ${n}: ยังไม่ใส่รอบบริการ`,
  period_missing: () => 'ยังไม่ใส่ช่วงบริการ (วันเริ่ม–วันสิ้นสุด)',
  installments_missing: () => 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ที่แท็บการชำระ',
  /* สองข้อของวันงวดเรียง วันวางบิล → กำหนดชำระ (ลำดับคอลัมน์ · #1846) · วันวางบิลขึ้นเฉพาะลูกค้าเครดิต (D7/B3)
     ลูกค้าวางบิลได้ทุกวัน (ไม่มีรอบ) — ตัวแก้ของโหมดตั้งวันไม่มีไทล์ "ตามรอบ" ⇒ ห้ามพูดว่า "เลือกรอบ" */
  billing_missing: ({ seq, anyday = false } = {}) => (anyday
    ? `งวด ${seq}: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’`
    : `งวด ${seq}: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล)`),
  due_missing: ({ seq } = {}) => `งวด ${seq}: ยังไม่ใส่กำหนดชำระ — หรือเลือก ‘รอเหตุการณ์’`,
  coverage_missing: ({ seq } = {}) => `งวด ${seq}: ยังไม่ใส่ช่วงครอบบริการ`,
  /* งวดที่ขอบช่วงเป็นงวดที่บัญชีรับรองแล้ว (`confirmedSeq`) — ช่องของงวดนั้นล็อก ⇒ บอกทางที่ฝ่ายขายทำได้ (ปรับช่วงบริการ)
     หรือให้บัญชีแก้ · ข้อชี้ช่องช่วงบริการ ไม่ใช่เซลล์ที่ล็อก (installmentFindings) */
  coverage_start: ({ since, until, confirmedSeq = null, from, to } = {}) => (confirmedSeq !== null
    ? `งวด ${confirmedSeq} (บัญชีรับรองแล้ว): ครอบ ${dayText(from)}–${dayText(to)} ไม่ตรงวันเริ่มบริการ — ปรับช่วงบริการให้ตรง หรือให้ฝ่ายบัญชีแก้ช่วงครอบของงวดนั้น`
    : `งวดแรกครอบไม่ตรงวันเริ่มบริการ (${dayText(since)}–${dayText(until)})`),
  /* ช่องโหว่ที่ขนาบด้วยงวดรับรองแล้วทั้งสองข้าง (`between` = [a, b]) — ของบัญชี ฝ่ายขายแก้ไม่ได้ */
  coverage_gap: ({ since, until, between = null } = {}) => (between
    ? `ช่วงครอบขาด ${dayText(since)}–${dayText(until)} ระหว่างงวด ${between[0]} กับ งวด ${between[1]} ที่บัญชีรับรองแล้ว — ฝ่ายบัญชีแก้ที่แผงงวด`
    : `ช่วงครอบขาด ${dayText(since)}–${dayText(until)}`),
  coverage_end: ({ since, until, confirmedSeq = null, from, to } = {}) => (confirmedSeq !== null
    ? `งวด ${confirmedSeq} (บัญชีรับรองแล้ว): ครอบ ${dayText(from)}–${dayText(to)} ไม่ตรงวันสิ้นสุดบริการ — ปรับช่วงบริการให้ตรง หรือให้ฝ่ายบัญชีแก้ช่วงครอบของงวดนั้น`
    : `ช่วงครอบไม่ตรงวันสิ้นสุดบริการ (${dayText(since)}–${dayText(until)})`),
  unsaved: () => 'มีการแก้ไขงานบริการที่ยังไม่บันทึก — กด ‘บันทึกงานบริการ’ ก่อนยื่น',
  coverage_overlap: ({ a, b, since, until } = {}) => `งวด ${a} กับ งวด ${b} ครอบซ้อน ${dayText(since)}–${dayText(until)}`,
  fn_coverage_missing: ({ seq } = {}) => `งวด ${seq} (บัญชีรับรองแล้ว): ยังไม่มีช่วงครอบ — ฝ่ายบัญชีกรอกที่แผงงวด`,
});

/* แผงแดงหลังกดยื่น (ภาคผนวก A.1) — หัว/คำอธิบาย/หัวกลุ่ม/ป้าย · `SubmitGateNotice` อ่านจากที่นี่ */
export const SERVICE_SETUP_PANEL_TEXT = Object.freeze({
  title: (flow, k) => (flow === 'backfill' ? `ยื่นตรวจไม่ได้ — ยังขาด ${k} ข้อ` : `ยื่นอนุมัติไม่ได้ — ยังขาด ${k} ข้อ`),
  subtitle: (flow) => (flow === 'backfill'
    ? 'แก้ให้ครบแล้วกด “ยื่นตรวจงานบริการ” อีกครั้ง · กด “ไปแก้” เพื่อไปที่ช่องนั้น'
    : 'แก้ให้ครบแล้วกด “ยื่นอนุมัติ” อีกครั้ง · กด “ไปแก้” เพื่อไปที่ช่องนั้น'),
  checkedAt: (whenText) => `ตรวจเมื่อ ${whenText}`,
  groups: Object.freeze({ overview: 'รายการ (แท็บภาพรวม)', payment: 'งวดชำระ (แท็บการชำระ)' }),
  count: (n) => `${n} ข้อ`,
  /* กลุ่มที่มีแต่คำเตือน (ไม่มีข้อที่บล็อก) — ห้ามขึ้น "0 ข้อ" สีแดง */
  warnCount: (n) => `เตือน ${n} ข้อ`,
  /* ข้อเดียวกันหลายงวด (วันวางบิล/กำหนดชำระ/ช่วงครอบ) รวมเป็นแถวเดียว — "งวด 1–3, 5: … · 4 งวด" (submitGateGroups) */
  mergedSeqs: ({ seqs, rest, n }) => `งวด ${seqs}${rest} · ${n} งวด`,
  /* ข้อวันงวดที่รวมหลายงวด (วันวางบิล · กำหนดชำระ): โหมด "ตั้งวันงวด" ของแผงงวด → แผง "เติมวันงวดที่ว่าง…" เติมทุกงวดได้ในครั้งเดียว
     · ทุกชนิดของรอบ (#1846: รายเดือน · ทุกวัน + เครดิต · ไม่มีเครดิต · ยังไม่ตั้ง) — ปุ่ม "เติมตามรอบ เดือนละงวด…" เดิมมีแค่รายเดือน
       และไม่มีบนจอแล้ว ห้ามชี้ไปหา · ต่อท้ายกลุ่มวันงวดแรกที่เปิดแผงแบบค่าตั้งต้น ครั้งเดียวต่อแผง (submitGateGroups) · "ไปแก้" ของกลุ่มเปิดแผงนั้นให้เลย */
  dateFillHint: ' — เติมทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ',
  /* กลุ่มที่แผงเติมแตะได้ด้วย "จัดใหม่งวดที่มีวันแล้วด้วย" เท่านั้น (`dateFill: 'dated'` — backfill ลูกค้าเครดิต: งวดมีกำหนดชำระแล้ว
     ขาดวันวางบิล · SO-26090206-0) — "ไปแก้" เปิดแผงพร้อมสวิตช์นั้น ⇒ คำต้องบอกตรง ๆ ว่าวันเดิมถูกแทนด้วยวันที่คิดตามรอบของลูกค้า
     (ตัวจัดใหม่ของ #1846 ไม่คงวันเดิม) และคนตรวจในตารางก่อนบันทึก (แผงเติมเขียนร่างอย่างเดียว) */
  dateFillRedateHint: ' — จัดวันใหม่ทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ → ‘จัดใหม่งวดที่มีวันแล้วด้วย’ ที่แท็บการชำระ'
    + ' (วันเดิมถูกแทนด้วยวันที่คิดตามรอบวางบิลของลูกค้า · ตรวจในตารางก่อนบันทึก)',
  warningTag: 'เตือน · ไม่บล็อกการยื่น',
  fnTag: 'รอฝ่ายบัญชี',
  jump: 'ไปแก้',
});

/* การ์ดราง "งานบริการ (ใบเดิม)" — บรรทัดรองของแถวตรวจที่รอบรรทัดที่ยังไม่เลือกชนิด (ภาคผนวก A.7) · `backfillRailChecks` อ่านจากที่นี่
   `n` = จำนวนที่จัดรูปแล้ว (fmtNumber) · แถวโซน/ช่วงบริการยังไม่ยอมบอกว่าครบระหว่างที่มีบรรทัดยังไม่รู้ชนิด (อาจเป็นแพ็คเกจ)
   แต่ server ไม่ขึ้นข้อโซน/ช่วงบริการให้บรรทัดพวกนั้น ⇒ หลังกดยื่นแถวแดงโดยไม่มีข้อในแผง — บรรทัดรองต้องบอกว่าแดงเพราะอะไร */
export const SERVICE_BACKFILL_RAIL_TEXT = Object.freeze({
  waitKind: (n) => `รอเลือกชนิด ${n} รายการ`,
  /* ช่วงบริการบังคับเมื่อมีแพ็คเกจ (D6) — ยังไม่มีแพ็คเกจที่บันทึกแล้ว ⇒ แผงไม่มีข้อ "ยังไม่ใส่ช่วงบริการ" */
  periodWaitKind: (n) => `รอเลือกชนิด ${n} รายการ · ต้องใส่ถ้ามีแพ็คเกจ`,
});

/* ── ข้อความล็อกการแก้ (ภาคผนวก A.3) — ตัวเดียวกับที่ปุ่ม/ช่องบนจอบอกเหตุ และที่ API ตอบ 409 ─────────── */
export const SERVICE_SETUP_EDIT_TEXT = Object.freeze({
  noRight: 'ตั้งงานบริการได้เฉพาะฝ่ายขายที่ดูแลใบนี้',
  notService: 'ใบนี้ไม่ใช่ใบสายบริการ — ไม่มีงานบริการให้ตั้ง',
  pending: 'รออนุมัติ — ดึงกลับก่อนแก้',
  revoked: 'ย้อนการอนุมัติแล้ว — ออก Rev. แล้วแก้ที่ใบ Rev.',
  stamped: 'อนุมัติแล้ว — แพ็คเกจ/โซน/แพ็คต่อรอบ/ช่วงบริการล็อก · แก้ด้วยย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบแก้ได้)',
  backfillSubmitted: 'ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ (ตีกลับก่อนจึงแก้ได้)',
  /* ยื่นตรวจแล้วแต่สายของโครงการ/ดีลเปลี่ยนเป็นอย่างอื่นระหว่างรอตรวจ — RPC อนุมัติปฏิเสธ (ไม่เปิดอะไรให้ TS) ⇒ บอกทางออก */
  reviewNotService: 'ใบนี้ไม่ใช่ใบสายบริการแล้ว (สายของโครงการ/ดีลเปลี่ยน) — อนุมัติงานบริการไม่ได้ · ตีกลับเพื่อล้างคำขอตรวจ',
  closed: 'ใบนี้ปิดไปแล้ว — แก้งานบริการไม่ได้',
});

/* ══ บรรทัด: ชนิดของงาน ════════════════════════════════════════════════════════════════════════════════ */

const text = (value) => String(value ?? '').trim();
const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

/** บรรทัด "เพิ่มรายการเอง" ของใบเสนอราคา = ไม่มีทั้งรหัส FG และสินค้า
 *  ⚠️ ไม่ trim — ตรงกับ `NULLIF(x, '') IS NULL` ของฐาน (serviceSetupSqlParity) */
export const isManualSalesLine = (line) => !line?.fgCode && !line?.productId;

/* หมวดที่เก็บบนบรรทัดพิมพ์เอง — `metadata.categoryCode` หรือ alias ของ route รายการ · ว่าง = ไม่มี (ไม่ trim เหมือนฐาน) */
const manualCategoryRaw = (line) => {
  const raw = line?.metadata?.categoryCode ?? line?.categoryCode;
  return raw === null || raw === undefined || String(raw) === '' ? null : String(raw);
};

/** หมวดของบรรทัด — FG: จากรหัส FG · พิมพ์เอง: `metadata.categoryCode` (#1844) หรือ alias `categoryCode` ของ route รายการ
 *  (`categoryCode:metadata->>categoryCode` — ทะเบียนมีหลายพันบรรทัด ไม่ select metadata ทั้งก้อน) */
export function lineCategoryCode(line) {
  if (!isManualSalesLine(line)) return categoryOf(line?.fgCode);
  return categoryOf(manualCategoryRaw(line));
}

/* ชนิดที่ตัดสินได้เองจากบรรทัด (ไม่ดูค่าที่เก็บ) — `null` = ตัดสินเองไม่ได้ ต้องให้คนเลือก */
function derivedLineRole(line) {
  if (!isManualSalesLine(line)) return categoryOf(line?.fgCode) === PACKAGE_CATEGORY ? SERVICE_KIND_PACKAGE : SERVICE_KIND_NOT_SERVICE;
  const code = manualCategoryRaw(line);
  if (code !== null) return categoryOf(code) === PACKAGE_CATEGORY ? SERVICE_KIND_PACKAGE : SERVICE_KIND_NOT_SERVICE;
  return null;
}

const storedKindOf = (line) => (line?.serviceKind === SERVICE_KIND_PACKAGE || line?.serviceKind === SERVICE_KIND_NOT_SERVICE
  ? line.serviceKind : null);

/**
 * ⭐ ชนิดของบรรทัด (D2) — 'package' | 'not_service' | 'unset'
 *   1. ชนิดที่เก็บไว้ (`serviceKind` — มีได้เฉพาะบรรทัดพิมพ์เอง · CHECK ของ 0392)
 *   2. บรรทัด FG (`fgCode` หรือ `productId`): หมวด 02-001 = แพ็คเกจ · อื่น = ไม่ใช่งานบริการ
 *   3. บรรทัดพิมพ์เองที่มีหมวด (`metadata.categoryCode` · #1844): 02-001 = แพ็คเกจ · อื่น = ไม่ใช่งานบริการ
 *   4. ที่เหลือ = ยังไม่รู้ ต้องให้ฝ่ายขายเลือก
 * ⚠️ ฐานมีตัวคู่ `sales_order_line_service_role` — แก้ที่นี่ต้องแก้ที่ฐานด้วย (serviceSetupSqlParity.test.mjs)
 */
export function serviceLineRole(line) {
  return storedKindOf(line) || derivedLineRole(line) || SERVICE_ROLE_UNSET;
}

/** ชนิดมาจากไหน — 'stored' | 'fg' | 'category' | 'none' (จอเขียน "ตามหมวด" ให้ 'category') */
export function serviceLineRoleSource(line) {
  if (storedKindOf(line)) return 'stored';
  if (!isManualSalesLine(line)) return 'fg';
  return manualCategoryRaw(line) !== null ? 'category' : 'none';
}

const clip = (value, max) => {
  const chars = [...text(value).replace(/\s+/g, ' ')];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};

/** คำอธิบายสั้นของบรรทัด: "รหัส FG · 40 ตัวแรกของคำอธิบาย (หมายเหตุ)" — ใช้ในข้อที่ยังขาดและผลของการอนุมัติ */
export function serviceLineLabel(line) {
  const base = [text(line?.fgCode), clip(line?.description, 40)].filter(Boolean).join(' · ') || 'ไม่มีคำอธิบาย';
  const note = clip(line?.metadata?.note, 40);
  return note ? `${base} (${note})` : base;
}

/* ══ ใบ: ต้องตั้งไหม · อยู่ขั้นไหน · แก้ได้ไหม ══════════════════════════════════════════════════════════ */

/* สายธุรกิจของใบ — ตัวตัดสินเดียวของระบบ (`orderBusinessLineOf`: โครงการก่อนแล้วดีล)
   ⭐ รับ `order.businessLine` ที่ตัวโหลดบริบท (serviceSetupRepo) คิดมาให้แล้วด้วย เมื่อไม่มีก้อนโครงการ/ดีลแนบมา
     และไม่มี Map ของหลายใบใน ctx — ค่าเดียวกัน แค่คิดไว้ก่อน */
function businessLineOf(order, ctx = {}) {
  if (ctx?.projectsById || ctx?.dealsById) return orderBusinessLineOf(order, ctx);
  if (order && order.businessLine !== undefined && !order.project && !order.deal) return order.businessLine ?? null;
  return orderBusinessLineOf(order, ctx);
}

/** ⭐ ใบนี้ต้องตั้งงานบริการไหม (D4) — ใบ pipeline บนสาย SERVICE · ใบย้อนหลัง/สายสินค้า/ยังไม่ระบุสาย = ไม่แตะใน PR-A */
export function serviceSetupRequired(order, ctx = {}) {
  return !!order && !isHistoricalOrder(order) && businessLineOf(order, ctx) === 'SERVICE';
}

const linesFrom = (order, ctx = {}, lines = undefined) => {
  if (Array.isArray(lines)) return lines;
  if (Array.isArray(ctx?.lines)) return ctx.lines;
  return Array.isArray(order?.lines) ? order.lines : [];
};

/**
 * บรรทัดนี้ทำให้ใบที่อนุมัติแล้วต้อง "ตั้งงานบริการย้อนหลัง" ไหม (D25) — ถาม **ชนิดที่บรรทัดตัดสินได้เอง** (FG · หมวด)
 *   ไม่ใช่ชนิดที่ฝ่ายขายเลือกเก็บไว้: บรรทัดที่ยังไม่รู้ชนิด หรือตัดสินได้ว่าเป็นแพ็คเกจ = ต้องตั้ง · ฝ่ายขายเลือกทับเป็นแพ็คเกจ = ต้องตั้ง
 * 🔴 ฝ่ายขายเลือก "ไม่ใช่งานบริการ" ให้บรรทัดที่ต้องตัดสิน = **การตัดสินที่ผู้จัดการต้องตรวจ** (r3 B4) ไม่ใช่เหตุให้ใบหลุดจากทุกคิว
 *   (เดิมถามชนิดที่เก็บ ⇒ กดแผ่นผิดหนึ่งครั้ง + บันทึก = ใบหายจากเลน/ชิป/แท็บ TS และจอกลายเป็นโหมดอ่าน แก้กลับไม่ได้)
 */
export function serviceLineNeedsBackfill(line) {
  return derivedLineRole(line) !== SERVICE_KIND_NOT_SERVICE || storedKindOf(line) === SERVICE_KIND_PACKAGE;
}

/**
 * ⭐ ใบที่อนุมัติแล้วต้อง "ตั้งงานบริการย้อนหลัง" ไหม (D25) — pipeline · อนุมัติแล้ว · ยังไม่ถูก Rev. ทับ · ยังไม่ประทับ
 *   · สาย SERVICE · **และมีอย่างน้อยหนึ่งบรรทัดที่ชนิดที่ตัดสินได้เองไม่ใช่ "ไม่ใช่งานบริการ"** (`serviceLineNeedsBackfill`)
 * ⚠️ ใบที่ทุกบรรทัดตัดสินได้เองว่าไม่ใช่งานบริการ (เช่น FG หมวด 03 ล้วน) ไม่มีอะไรให้ TS ⇒ ไม่ขึ้นที่ไหนเลย
 *   (แบนเนอร์ · การ์ดราง · โหมดแก้ของตาราง · ชิปรายการ · เลน · แท็บ TS) — ทุกผิวถามตัวนี้ตัวเดียว
 * ⭐ ใบที่ฝ่ายขายเลือก "ไม่ใช่งานบริการ" ครบทุกบรรทัดยังอยู่ขั้นตั้งย้อนหลัง → ยื่นตรวจ → ผู้จัดการอนุมัติ (เปิด 0 โซน + ประทับ) จึงจบ
 */
export function serviceBackfillNeeded(order, lines, ctx = {}) {
  if (!order || isHistoricalOrder(order)) return false;
  if (order.status !== 'approved' || order.supersededById || order.serviceTermsOpenedAt) return false;
  if (businessLineOf(order, ctx) !== 'SERVICE') return false;
  return linesFrom(order, ctx, lines).some((line) => serviceLineNeedsBackfill(line));
}

/**
 * ⭐ "ผู้จัดการต้องตรวจงานบริการย้อนหลังของใบนี้" (D28) — ตัวเดียวของคำถามนี้ ห้ามอ่าน `serviceSetupState` เอง
 * ⚠️ ย้อนการอนุมัติ/ยกเลิก/ออก Rev. ไม่ล้างสถานะ 'submitted' (RPC เดิมไม่ได้แก้) ⇒ ค่าค้างบนใบที่ไม่ได้อนุมัติอยู่ต้อง
 *   ไม่มีผล: ไม่ขึ้นรายการ ไม่นับป้าย ไม่โชว์แถบ และ RPC อนุมัติก็ปฏิเสธ · ดูแค่แถวใบ ไม่ต้องใช้บรรทัด
 */
export function serviceBackfillAwaitingReview(order) {
  return !!order
    && !isHistoricalOrder(order)
    && order.status === 'approved'
    && !order.supersededById
    && !order.serviceTermsOpenedAt
    && order.serviceSetupState === 'submitted';
}

/** สถานะการตั้งย้อนหลัง (ชิปของรายการ/แท็บ TS) — 'submitted' | 'rejected' | 'editing' | 'not_started'
 *  @param hasDraftData ฝ่ายขายเริ่มตั้งแล้ว (มีช่วงบริการ/ชนิด/แพ็คเกจ/โซนที่บันทึก) — ผู้เรียกคิดจากข้อมูลที่ตัวเองมี */
export function serviceBackfillState(order, { hasDraftData = false } = {}) {
  if (serviceBackfillAwaitingReview(order)) return 'submitted';
  if (order?.serviceSetupState === 'rejected') return 'rejected';
  return hasDraftData ? 'editing' : 'not_started';
}

/**
 * ขั้นของงานบริการบนใบ
 *   'none'     ไม่ต้องตั้ง · หรืออนุมัติแล้วยังไม่ประทับแต่ไม่มีอะไรให้ตั้ง (D25)
 *   'pipeline' ร่าง / ถูกตีกลับ — ตั้งแล้วยื่นอนุมัติพร้อมใบ
 *   'backfill' อนุมัติแล้ว ยังไม่ประทับ และมีสิ่งที่ต้องตั้ง — ตั้งย้อนหลังแล้วยื่นตรวจ
 *   'stamped'  อนุมัติแล้วและเปิดงานให้ TS แล้ว
 *   'locked'   ที่เหลือ (รออนุมัติ · ย้อนการอนุมัติ · ถูก Rev. ทับ · ยกเลิก)
 * @param ctx `{ lines }` (หรือบริบทเต็มของ serviceSetupRepo) · `{ projectsById, dealsById }` เมื่อเรียกจากคิวหลายใบ
 */
export function serviceSetupFlow(order, ctx = {}) {
  if (!serviceSetupRequired(order, ctx)) return 'none';
  if (order.status === 'draft' || order.status === 'rejected') return 'pipeline';
  if (order.status === 'approved' && !order.supersededById) {
    if (order.serviceTermsOpenedAt) return 'stamped';
    return serviceBackfillNeeded(order, linesFrom(order, ctx), ctx) ? 'backfill' : 'none';
  }
  return 'locked';
}

/**
 * ⭐ แก้การตั้งงานบริการได้ไหม — คืนข้อความไทย (ภาคผนวก A.3) หรือ null
 * ⚠️ กติกาเดียวกับ `sales_order_service_setup_editable` ของฐาน + ด่าน origin/สายของ RPC บันทึก (D9):
 *   ร่าง/ถูกตีกลับ · หรืออนุมัติแล้วยังไม่ประทับ ไม่ถูก Rev. ทับ และยังไม่ยื่นตรวจ
 *   (ไม่ถามข้อ "มีสิ่งที่ต้องตั้งไหม" ของ D25 — ฐานไม่ถาม · จอซ่อนโหมดแก้เองผ่าน `serviceSetupFlow`)
 * @param canEdit มีสิทธิ์แก้ใบนี้ไหม (ผู้เรียกคิด: `canEditSalesPlanning && inSalesEditScope`)
 */
export function serviceSetupEditError(order, { canEdit = false } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (!canEdit) return SERVICE_SETUP_EDIT_TEXT.noRight;
  if (!serviceSetupRequired(order)) return SERVICE_SETUP_EDIT_TEXT.notService;
  if (order.status === 'draft' || order.status === 'rejected') return null;
  if (order.status === 'pending_approval') return SERVICE_SETUP_EDIT_TEXT.pending;
  if (order.status === 'approval_revoked') return SERVICE_SETUP_EDIT_TEXT.revoked;
  if (order.status === 'approved' && !order.supersededById) {
    if (order.serviceTermsOpenedAt) return SERVICE_SETUP_EDIT_TEXT.stamped;
    if (order.serviceSetupState === 'submitted') return SERVICE_SETUP_EDIT_TEXT.backfillSubmitted;
    return null;
  }
  return SERVICE_SETUP_EDIT_TEXT.closed;
}

/** ช่วงบริการของใบ — pipeline: หัวใบ (`servicePeriodFrom/To`) · ย้อนหลัง: ช่วงของสัญญา · ไม่ครบ = null */
export function servicePeriodOf(order, contract = null) {
  if (isHistoricalOrder(order)) {
    return contract?.effectiveDate && contract?.expiryDate ? { from: contract.effectiveDate, to: contract.expiryDate } : null;
  }
  return order?.servicePeriodFrom && order?.servicePeriodTo ? { from: order.servicePeriodFrom, to: order.servicePeriodTo } : null;
}

/* ══ ช่วงบริการ: ตัวช่วยของช่อง/ชิป ═══════════════════════════════════════════════════════════════════ */

const isoDay = (value) => {
  const day = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day ? day : null;
};
const validPeriod = (period) => {
  const from = isoDay(period?.from);
  const to = isoDay(period?.to);
  return from && to && from <= to ? { from, to } : null;
};

/** ความยาวของช่วง — `{ months, days, label }` เช่น '12 เดือน' · '12 เดือน 24 วัน' · ช่วงใช้ไม่ได้ = 0/0/'' */
export function periodSpan(period) {
  const p = validPeriod(period);
  if (!p) return { months: 0, days: 0, label: '' };
  const { months, remainderDays } = wholeMonthsIn(p.from, p.to);
  const parts = [months ? `${months} เดือน` : '', remainderDays ? `${remainderDays} วัน` : ''].filter(Boolean);
  return { months, days: remainderDays, label: parts.join(' ') || '0 วัน' };
}

/** ชิป "12 เดือน" / "24 เดือน" — วันสิ้นสุด = วันเริ่ม + n เดือนปฏิทิน − 1 วัน (`2026-01-31` +1 → `2026-02-28`) */
export function periodEndFromMonths(fromIso, n) {
  const from = isoDay(fromIso);
  const months = Number(n);
  if (!from || !Number.isInteger(months) || months < 1) return null;
  const edge = monthEdge(from, months);
  return edge ? addDays(edge, -1) : null;
}

/** ชิปจำนวนรอบจากช่วงบริการ — แตะแล้วใส่ค่าให้ (ไม่มีค่าตั้งต้นเงียบ ๆ) · ไม่มีช่วง = [] */
export function roundChipsFromPeriod(period) {
  const p = validPeriod(period);
  if (!p) return [];
  const months = wholeMonthsIn(p.from, p.to).months;
  const biweekly = Math.floor((daysBetween(p.from, p.to) + 1) / 14);
  const quarterly = Math.round(months / 3);
  return [
    { key: 'monthly', label: `ทุกเดือน ≈ ${months}`, rounds: months },
    { key: 'biweekly', label: `ทุก 2 สัปดาห์ ≈ ${biweekly}`, rounds: biweekly },
    { key: 'quarterly', label: `ทุกไตรมาส ≈ ${quarterly}`, rounds: quarterly },
  ].filter((chip) => chip.rounds >= 1);
}

const periodText = (period) => {
  const p = validPeriod(period);
  return p ? `${fmtDate(p.from)}–${fmtDate(p.to)}` : '—';
};

/* ══ ตัวรวมรายบรรทัด / ทั้งใบ ═════════════════════════════════════════════════════════════════════════ */

const lineNoOf = (line, index) => (Number.isInteger(line?.lineNo) && line.lineNo > 0 ? line.lineNo : index + 1);

/* บรรทัดเรียงตามลำดับบนใบ + เลขรายการ (1-based) — ตัวโหลดใส่ `lineNo` มาให้แล้ว ถ้าไม่มีคิดจาก sortOrder */
function orderedLines(ctx) {
  const lines = Array.isArray(ctx?.lines) ? [...ctx.lines] : [];
  const hasNo = lines.every((line) => Number.isInteger(line?.lineNo) && line.lineNo > 0);
  lines.sort((a, b) => (hasNo
    ? a.lineNo - b.lineNo
    : (Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0)) || (String(a?.id) < String(b?.id) ? -1 : String(a?.id) > String(b?.id) ? 1 : 0)));
  return lines.map((line, index) => ({ line, lineNo: lineNoOf(line, index) }));
}

function allocationsByLine(ctx) {
  const map = new Map();
  for (const row of Array.isArray(ctx?.allocations) ? ctx.allocations : []) {
    if (!map.has(row?.salesOrderLineId)) map.set(row.salesOrderLineId, []);
    map.get(row.salesOrderLineId).push(row);
  }
  /* ลำดับเดียวกับฐาน (`ORDER BY "sortOrder", "zoneId"`) — ข้อที่ยังขาดเรียงตรงกันทั้งสองฝั่ง */
  for (const rows of map.values()) {
    rows.sort((a, b) => (Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
      || (String(a?.zoneId) < String(b?.zoneId) ? -1 : String(a?.zoneId) > String(b?.zoneId) ? 1 : 0));
  }
  return map;
}

const mapGet = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || null;
const packsOf = (row) => {
  const n = Number(row?.packsPerRound);
  return row?.packsPerRound !== null && row?.packsPerRound !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};
const roundsOf = (line) => {
  const n = Number(line?.serviceRounds);
  return line?.serviceRounds !== null && line?.serviceRounds !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};

/** ตัวเลขของบรรทัดเดียว — `{ zones, sites, packsPerRound, packsTotal, rounds }` (packsTotal = null เมื่อยังไม่มีรอบ) */
export function lineSetupTotals(line, ctx = {}) {
  const allocs = allocationsByLine(ctx).get(line?.id) || [];
  const sites = new Set();
  let packsPerRound = 0;
  for (const row of allocs) {
    const siteId = mapGet(ctx?.zonesById, row?.zoneId)?.siteId;
    if (siteId) sites.add(siteId);
    packsPerRound += packsOf(row) || 0;
  }
  const rounds = roundsOf(line);
  return {
    zones: allocs.length,
    sites: sites.size,
    packsPerRound,
    packsTotal: rounds !== null ? packsPerRound * rounds : null,
    rounds,
  };
}

/* บรรทัด "ตั้งครบ" ในเชิงโครงสร้าง (ไม่ถามความถูกต้องของสินค้า/โซน — นั่นคือข้อที่ยังขาด) */
function lineStructurallyComplete(line, allocs) {
  const role = serviceLineRole(line);
  if (role === SERVICE_KIND_NOT_SERVICE) return allocs.length === 0;
  if (role !== SERVICE_KIND_PACKAGE) return false;
  const hasFg = !isManualSalesLine(line) || (!!text(line?.serviceFgCode) && !!text(line?.serviceProductId));
  return hasFg && roundsOf(line) !== null && allocs.length > 0 && allocs.every((row) => packsOf(row) !== null);
}

/** ตัวเลขทั้งใบ — ชิป "งานบริการครบ x/n รายการ" · ท้ายตาราง · หัวใบ · แถบผู้อนุมัติ
 *  zones/sites = นับไม่ซ้ำเฉพาะบรรทัดแพ็คเกจ · packsPerRound = Σ แพ็คต่อรอบทุกแถว · packsTotal = Σ (แพ็คต่อรอบของบรรทัด × รอบ) */
export function serviceSetupTotals(ctx = {}) {
  const byLine = allocationsByLine(ctx);
  const zones = new Set();
  const sites = new Set();
  const rounds = [];
  const out = {
    lineCount: 0, packageLines: 0, notServiceLines: 0, unsetLines: 0, completeLines: 0,
    zones: 0, sites: 0, packsPerRound: 0, packsTotal: 0, roundsMin: null, roundsMax: null, roundsMixed: false,
  };
  for (const { line } of orderedLines(ctx)) {
    out.lineCount += 1;
    const role = serviceLineRole(line);
    const allocs = byLine.get(line?.id) || [];
    if (lineStructurallyComplete(line, allocs)) out.completeLines += 1;
    if (role === SERVICE_KIND_NOT_SERVICE) { out.notServiceLines += 1; continue; }
    if (role !== SERVICE_KIND_PACKAGE) { out.unsetLines += 1; continue; }
    out.packageLines += 1;
    let linePacks = 0;
    for (const row of allocs) {
      zones.add(row?.zoneId);
      const siteId = mapGet(ctx?.zonesById, row?.zoneId)?.siteId;
      if (siteId) sites.add(siteId);
      linePacks += packsOf(row) || 0;
    }
    out.packsPerRound += linePacks;
    const r = roundsOf(line);
    if (r !== null) { rounds.push(r); out.packsTotal += linePacks * r; }
  }
  out.zones = zones.size;
  out.sites = sites.size;
  if (rounds.length) {
    out.roundsMin = Math.min(...rounds);
    out.roundsMax = Math.max(...rounds);
    out.roundsMixed = out.roundsMin !== out.roundsMax;
  }
  return out;
}

const roundsLabel = (totals) => {
  if (totals.roundsMin === null) return '—';
  return totals.roundsMixed ? `${totals.roundsMin}–${totals.roundsMax} รอบ/โซน` : `${totals.roundsMin} รอบ/โซน`;
};

/** เส้นประใต้บรรทัด (ภาคผนวก A.4): "ต่อรอบ x แพ็ค · y รอบ · ทั้งรายการ z แพ็ค" — ยังไม่มีรอบ = null */
export function lineDerivedText(lineTotals) {
  if (!lineTotals || lineTotals.rounds === null || lineTotals.rounds === undefined) return null;
  return `ต่อรอบ ${fmtNumber(lineTotals.packsPerRound)} แพ็ค · ${fmtNumber(lineTotals.rounds)} รอบ · ทั้งรายการ ${fmtNumber(lineTotals.packsTotal)} แพ็ค`;
}

/** ท้ายตาราง (ภาคผนวก A.4): "งานบริการทั้งใบ: k รายการแพ็คเกจ · z โซนใน s ไซต์ · ต่อรอบ p แพ็ค · ทั้งใบ t แพ็ค" */
export function serviceSetupFooterText(totals) {
  const t = totals || {};
  return `งานบริการทั้งใบ: ${fmtNumber(t.packageLines || 0)} รายการแพ็คเกจ · ${fmtNumber(t.zones || 0)} โซนใน ${fmtNumber(t.sites || 0)} ไซต์`
    + ` · ต่อรอบ ${fmtNumber(t.packsPerRound || 0)} แพ็ค · ทั้งใบ ${fmtNumber(t.packsTotal || 0)} แพ็ค`;
}

/**
 * จำนวนในใบเทียบจำนวนแพ็คที่ตั้ง (ภาคผนวก A.4) — **ไม่บังคับให้เท่า** (จำนวนในใบบางทีคือจำนวนเดือน)
 * → `{ tone: 'ok' | 'warn' | 'info' | 'none', text }`
 */
export function lineQtyCrossCheck(line, lineTotals) {
  if (serviceLineRole(line) !== SERVICE_KIND_PACKAGE) return { tone: 'none', text: '' };
  const qtyNumber = Number(line?.qty);
  const qty = Number.isFinite(qtyNumber) ? fmtNumber(qtyNumber) : text(line?.qty) || '—';
  const unit = text(line?.unit);
  const qtyUnit = unit ? `${qty} ${unit}` : qty;
  /* ⚠️ ท้ายประโยคต่างจากภาคผนวก A.4 (ความหมายเดิม) — คำว่า จำนวน ที่ติดกับ แพ็ค ถูก ICU ตัดกลางคำ (แพ็คไม่อยู่ในพจนานุกรม)
     ⇒ check:thaiwrap เกินเพดาน · ด่าน W2 เปลี่ยนคำแทนการเติมคำทับศัพท์ (ห้ามยกประโยคเดิมมาใส่คำพูดในคอมเมนต์ — ด่านอ่านด้วย) */
  if (unit.includes('เดือน')) return { tone: 'info', text: `จำนวนในใบ ${qty} เดือน = ระยะเวลา ไม่ได้นับเป็นแพ็ค` };
  if (!lineTotals?.zones) return { tone: 'none', text: `จำนวนในใบ ${qtyUnit} — ตรวจได้เมื่อเลือกโซนแล้ว` };
  if (lineTotals.packsTotal === null || lineTotals.packsTotal === undefined) {
    return { tone: 'none', text: `จำนวนในใบ ${qtyUnit} — ตรวจได้เมื่อใส่แพ็คต่อรอบและรอบบริการแล้ว` };
  }
  if (Number.isFinite(qtyNumber) && qtyNumber === lineTotals.packsTotal) {
    return { tone: 'ok', text: `จำนวนในใบ ${qtyUnit} · ตรงกับทั้งรายการ ✓` };
  }
  return { tone: 'warn', text: `จำนวนในใบ ${qtyUnit} ≠ ทั้งรายการ ${fmtNumber(lineTotals.packsTotal)} แพ็ค — ตรวจอีกครั้ง (ไม่บังคับให้เท่า)` };
}

/* ══ ข้อที่ยังขาด (ด่านยื่นอนุมัติ / ยื่นตรวจ) ═══════════════════════════════════════════════════════════ */

const ISSUE_PLACE = Object.freeze({
  kind_missing: ['lines', 'overview', 'kind'],
  fg_missing: ['lines', 'overview', 'fg'],
  fg_invalid: ['lines', 'overview', 'fg'],
  fg_foreign: ['lines', 'overview', 'fg'],
  zones_missing: ['lines', 'overview', 'zones'],
  packs_missing: ['lines', 'overview', 'packs'],
  zone_invalid: ['lines', 'overview', 'zones'],
  zones_on_not_service: ['lines', 'overview', 'zones'],
  rounds_missing: ['lines', 'overview', 'rounds'],
  period_missing: ['period', 'overview', 'period'],
  installments_missing: ['installments', 'payment', null],
  billing_missing: ['installments', 'payment', 'billingDate'],
  due_missing: ['installments', 'payment', 'dueDate'],
  coverage_missing: ['installments', 'payment', 'coverage'],
  coverage_start: ['installments', 'payment', 'coverage'],
  coverage_gap: ['installments', 'payment', 'coverage'],
  coverage_end: ['installments', 'payment', 'coverage'],
  /* ชี้ปุ่ม "บันทึกงานบริการ" (svc-save) — "ไปแก้" เลื่อนไปที่ปุ่มแล้วโฟกัส (แถบบันทึกลอยอยู่นอกการ์ด) */
  unsaved: ['lines', 'overview', 'save'],
});

function makeIssue(key, fields = {}, args = {}) {
  const [area, tab, field] = ISSUE_PLACE[key] || ['lines', 'overview', null];
  const textOf = SERVICE_SETUP_ISSUE_TEXT[key];
  return {
    key, area, tab, owner: 'SA', field,
    ...fields,
    message: textOf ? textOf(args) : SERVICE_SETUP_SQL_MESSAGES.sales_order_service_setup_incomplete.message,
  };
}

const zoneNameOf = (ctx, zoneId) => {
  const zone = mapGet(ctx?.zonesById, zoneId);
  return text(zone?.name) || text(zone?.code) || text(zoneId) || '—';
};

const productUsable = (product) => !!product
  && product.isActive !== false
  && (product.approvalStatus === null || product.approvalStatus === undefined || product.approvalStatus === 'approved')
  && categoryOf(product.fgCode) === PACKAGE_CATEGORY;

/* ข้อที่ยังขาดของบรรทัดเดียว — ลำดับเดียวกับ `sales_order_service_setup_errors` ของฐาน */
function lineIssues(line, lineNo, allocs, ctx) {
  const out = [];
  const role = serviceLineRole(line);
  const base = { lineId: line?.id ?? null, lineNo };
  const args = { n: lineNo, label: serviceLineLabel(line) };
  if (role === SERVICE_ROLE_UNSET) return [makeIssue('kind_missing', base, args)];
  if (role === SERVICE_KIND_NOT_SERVICE) {
    return allocs.length ? [makeIssue('zones_on_not_service', base, args)] : [];
  }
  if (isManualSalesLine(line)) {
    const fg = text(line?.serviceFgCode);
    const productId = text(line?.serviceProductId);
    /* D30: สินค้าถูกลบ ⇒ FK SET NULL ล้าง serviceProductId แต่ serviceFgCode ค้าง = ยังไม่มีแพ็คเกจ */
    if (!fg || !productId) out.push(makeIssue('fg_missing', base, args));
    else if (!productUsable(mapGet(ctx?.productsById, productId))) out.push(makeIssue('fg_invalid', base, { ...args, fg }));
    else if (!ctx.fgOptionIds.has(productId)) out.push(makeIssue('fg_foreign', base, { ...args, fg }));
  }
  if (roundsOf(line) === null) out.push(makeIssue('rounds_missing', base, args));
  if (!allocs.length) out.push(makeIssue('zones_missing', base, args));
  for (const row of allocs) {
    const zoneId = row?.zoneId ?? null;
    if (packsOf(row) === null) {
      out.push(makeIssue('packs_missing', { ...base, zoneId }, { ...args, zone: zoneNameOf(ctx, zoneId) }));
    }
    const zone = mapGet(ctx?.zonesById, zoneId);
    const site = zone ? mapGet(ctx?.sitesById, zone.siteId) : null;
    const why = bindTargetError({ order: ctx?.order, zone, site });
    if (why) out.push(makeIssue('zone_invalid', { ...base, zoneId }, { ...args, text: why }));
  }
  return out;
}

/* งวดที่ยังเป็นเงินของใบนี้ — ตัดงวดคืนเงินแล้ว · งวดโมฆะของใบที่ตายแล้ว · งวดยกมา (ใบย้อนหลัง) */
const liveInstallments = (ctx) => (Array.isArray(ctx?.installments) ? ctx.installments : [])
  .filter((row) => row && !installmentRefunded(row) && !installmentVoid(row, ctx?.order) && !isOpeningInstallment(row))
  .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));
const hasCover = (row) => !!isoDay(row?.coversFrom) && !!isoDay(row?.coversTo) && isoDay(row.coversFrom) <= isoDay(row.coversTo);

/* ช่วงครอบของงวดเรียงแบบเดียวกับตัวเทียบ (`coverageContinuityErrors`: coversFrom แล้ว coversTo) */
const byCoverSpan = (a, b) => {
  const [af, bf, at, bt] = [isoDay(a?.coversFrom), isoDay(b?.coversFrom), isoDay(a?.coversTo), isoDay(b?.coversTo)];
  if (af !== bf) return af < bf ? -1 : 1;
  return at === bt ? 0 : (at < bt ? -1 : 1);
};
const seqNo = (row) => Number(row?.seq);

/* งวดที่ครอบจบวันก่อนช่องโหว่ (งวดที่ไปไกลที่สุดก่อนช่อง — ตัวเทียบนับช่องต่อจากงวดนี้) */
const coveredBefore = (covered, since) => {
  const day = addDays(since, -1);
  return [...covered].reverse().find((row) => isoDay(row.coversTo) === day) || null;
};

/**
 * ข้อที่ขอบ/ช่องของช่วงบริการ **อธิบายได้ด้วยงวดที่บัญชีรับรองแล้วแต่ยังไม่มีช่วงครอบ** ไหม (D8 · ตัดเสียงรบกวน)
 *   · เริ่มช้า (ช่องต้นช่วงบริการ) — มีงวดที่ขาดช่วงครอบซึ่งมาก่อนงวดแรกที่ครอบ
 *   · จบสั้น (ช่องท้ายช่วงบริการ) — มีงวดที่ขาดช่วงครอบซึ่งมาหลังงวดที่ครอบไปไกลที่สุด
 *   · ช่องโหว่ — มีงวดที่ขาดช่วงครอบอยู่ระหว่างสองงวดที่ขนาบช่องนั้น (ตามลำดับงวด)
 *   เริ่มก่อน/ครอบเกินช่วงบริการ = งวดที่ขาดอธิบายไม่ได้ ⇒ ไม่ตัด
 */
function explainedByUncovered(item, { live, covered, uncovered, period }) {
  if (!uncovered.length || !covered.length) return false;
  if (item.kind === 'start') return item.since === period.from && uncovered.some((u) => u < seqNo(covered[0]));
  if (item.kind === 'end') {
    const tail = covered.reduce((far, row) => (isoDay(row.coversTo) > isoDay(far.coversTo) ? row : far));
    return item.until === period.to && uncovered.some((u) => u > seqNo(tail));
  }
  if (item.kind === 'gap') {
    const prev = coveredBefore(covered, item.since);
    const next = live[item.index] || null;
    if (!prev || !next) return false;
    const lo = Math.min(seqNo(prev), seqNo(next));
    const hi = Math.max(seqNo(prev), seqNo(next));
    return uncovered.some((u) => u > lo && u < hi);
  }
  return false;
}

/**
 * ข้อบล็อกของการเทียบช่วงบริการ → Issue · 🔴 **ห้ามชี้เซลล์ของงวดที่บัญชีรับรองแล้ว** (ช่วงครอบของงวดนั้นแก้ได้เฉพาะบัญชี —
 *   "ไปแก้" ของฝ่ายขายตกบนเซลล์ที่ล็อก) · ยังบล็อกเสมอ (D7) แค่ชี้ช่องที่คนกดแก้ได้:
 *   · เริ่ม/จบ ที่ขอบเป็นงวดรับรองแล้ว → ช่องช่วงบริการ (ของฝ่ายขาย) + บอกว่าให้บัญชีแก้ได้อีกทาง
 *   · ช่องโหว่ที่งวดถัดไปรับรองแล้ว → งวดก่อนช่อง (ขยายช่วงครอบ) · ก่อนช่องก็รับรองแล้ว → ของบัญชี (ป้าย "รอฝ่ายบัญชี" ไม่มี "ไปแก้")
 */
function coverageIssue(item, { live, covered }) {
  const row = live[item.index] || null;
  const args = { since: item.since, until: item.until };
  const key = `coverage_${item.kind}`;
  if (!row || !isConfirmed(row)) return makeIssue(key, { installmentId: row?.id ?? null, seq: item.seq ?? null }, args);
  if (item.kind === 'start' || item.kind === 'end') {
    return makeIssue(key, { installmentId: null, seq: item.seq ?? null, area: 'period', tab: 'overview', field: 'period' },
      { ...args, confirmedSeq: row.seq ?? '—', from: row.coversFrom, to: row.coversTo });
  }
  const prev = coveredBefore(covered, item.since);
  if (prev && !isConfirmed(prev)) return makeIssue(key, { installmentId: prev.id ?? null, seq: prev.seq ?? null }, args);
  return makeIssue(key, { installmentId: row.id ?? null, seq: item.seq ?? null, owner: 'FN', tag: SERVICE_SETUP_PANEL_TEXT.fnTag },
    { ...args, between: [prev?.seq ?? '—', row.seq ?? '—'] });
}

/* ด่านงวดของใบแพ็คเกจ (D7/D8) — ใช้ร่วมกันทั้งข้อที่ยังขาดและคำเตือน ให้สองฝั่งตัดสินจากชุดเดียวกัน */
function installmentFindings(ctx, totals) {
  const findings = { issues: [], warnings: [], live: [], unconfirmedCovered: 0, confirmedUncovered: 0 };
  if (!totals.packageLines || paymentNotRequired(ctx?.order?.totalAmount)) return findings;
  const live = liveInstallments(ctx);
  findings.live = live;
  if (!live.length) {
    findings.issues.push(makeIssue('installments_missing'));
    return findings;
  }
  /* D7/B3 ผ่านตัวถามรูปของรอบของ billingRule.js (อ่านด้วย `effectiveBillingRule` · มติ 28/09 ข้อ 17 ของ #1846) — ห้ามอ่านช่องของรอบเอง:
     วันวางบิลบังคับ **เฉพาะลูกค้าเครดิต** (ตั้งแล้วและมีเครดิต) · ไม่มีเครดิต (= ทุกวัน + ชำระวันวางบิล) / ยังไม่ตั้ง = กำหนดชำระหรือรอเหตุการณ์พอ
     🐞 เดิม `billingRuleOf(x).credit !== false` — รูปที่อ่านแล้วของ "ไม่มีเครดิต" (`noCredit` · ทุกวัน + เครดิต 0) ถูกนับเป็นลูกค้าเครดิต ⇒ ขอวันวางบิลทุกงวด */
  const needsBilling = billingRuleNeedsBillingDate(ctx?.customerBillingRule);
  /* รูปของรอบ — ข้อความ "เลือกรอบ" ใช้ได้เฉพาะลูกค้ารายเดือน (ทุกวัน = ไม่มีชิปรอบ) · แผงแดงรวมข้อซ้ำด้วยค่านี้ */
  const billingMode = billingRuleMonthly(ctx?.customerBillingRule) ? 'monthly' : 'anyday';
  /* ⭐ แผง "เติมวันงวดที่ว่าง…" ของ #1846 แตะงวดนี้แบบไหน — ถามตัวเลือกงวดของแผงเอง (`fillTargetsOf` บนแถวรูปเดียวกับที่แผงส่ง
       `fillInputRows` · ชนิดของแผง `fillKindOf`) ห้ามเขียนกติกาซ้ำที่นี่:
       'empty' = ค่าตั้งต้นของแผงเติมให้ · 'dated' = แตะเฉพาะเมื่อเปิด "จัดใหม่งวดที่มีวันแล้วด้วย" (มีวันแล้ว · ยังไม่รับเงิน/ไม่ใช่งวดยกมา/
       ไม่รอเหตุการณ์ — `installmentBillingRedatable`) · null = แผงไม่แตะเลย (แจ้งชำระแล้ว ฯลฯ)
     ⚠️ ด่านไม่เห็นคำร้องขอใบวางบิล (ก้อน ctx ไม่มี) — งวดที่ขอใบแล้วอาจได้ 'dated' ที่นี่ แต่แผงงวดตรวจเป้าซ้ำตอนรับคำขอด้วยล็อกบนจอ
       (ขอใบแล้ว = 'locked' ไม่อยู่ในเป้า) แล้วตอบ "เปิดไม่ได้" เมื่อไม่เหลืองวดให้แตะ (SalesOrderPaymentPanel) */
  const fillKind = fillKindOf(ctx?.customerBillingRule);
  const dateFillOf = (row) => {
    const input = fillInputRows([row]);
    if (fillTargetsOf(fillKind, input).length) return 'empty';
    return fillTargetsOf(fillKind, input, { includeDated: true }).length ? 'dated' : null;
  };
  let unconfirmedMissing = false;
  for (const row of live) {
    const at = { installmentId: row.id ?? null, seq: row.seq ?? null };
    if (isConfirmed(row)) {
      if (!hasCover(row)) {
        findings.confirmedUncovered += 1;
        findings.warnings.push({
          key: 'fn_coverage_missing', area: 'installments', tab: 'payment', field: 'coverage', owner: 'FN', ...at,
          tag: SERVICE_SETUP_PANEL_TEXT.fnTag,
          message: SERVICE_SETUP_ISSUE_TEXT.fn_coverage_missing({ seq: row.seq }),
        });
      }
      continue;
    }
    const event = text(row.billingEvent);
    /* ลำดับ วันวางบิล → กำหนดชำระ เสมอ (ลำดับคอลัมน์ของตารางงวด · เจ้าของทัก 28/09 ใน #1846) — แผงแดงเรียงกลุ่มตามข้อแรกที่เจอ
       ⭐ `dateFill` (`dateFillOf` ข้างบน) — แผงแดงรวมข้อหลายงวดแล้ว "ไปแก้" เปิดแผงเติมเมื่อทุกงวดของกลุ่มเป็น 'empty'/'dated'
         (มี 'dated' = เปิดพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย") · มี null = ไปที่ช่องของงวดแรก (submitGateGroups)
         🐞 เดิมธงบูลีน `dateFillable` (ค่าตั้งต้นของแผงเท่านั้น) ⇒ backfill ลูกค้าเครดิตที่งวดมีกำหนดชำระแล้ว ขาดแค่วันวางบิล
            (SO-26090206-0 · AR-015 · ~49 ใบ) "ไปแก้" ได้แค่ช่องงวด 1 แล้วต้องพิมพ์วันวางบิลเอง 12 งวด ทั้งที่สวิตช์จัดใหม่ทำให้ได้ในครั้งเดียว */
    if (needsBilling && !isoDay(row.billingDate) && !event) {
      findings.issues.push(makeIssue('billing_missing', { ...at, billingMode, dateFill: dateFillOf(row) }, { seq: row.seq, anyday: billingMode === 'anyday' }));
    }
    if (!isoDay(row.dueDate) && !event) {
      findings.issues.push(makeIssue('due_missing', { ...at, dateFill: dateFillOf(row) }, { seq: row.seq }));
    }
    if (!hasCover(row)) {
      unconfirmedMissing = true;
      findings.issues.push(makeIssue('coverage_missing', at, { seq: row.seq }));
    } else {
      findings.unconfirmedCovered += 1;
    }
  }
  /* เทียบกับช่วงบริการเมื่อทุกงวด **ที่ยังไม่รับรอง** มีช่วงครอบแล้ว — งวดของฝ่ายขายที่ยังไม่มีบอกรายงวด (ไม่มีช่องโหว่ปลอม · D7)
     ⭐ งวดที่บัญชีรับรองแล้วแต่ไม่มีช่วงครอบ (D8) **ไม่ปิดการเทียบทั้งชุด** — ตัดเฉพาะข้อที่งวดนั้นอธิบายได้ (ช่องของมันเอง)
       🐞 เดิมคืนก่อนเทียบเมื่อมีงวดแบบนี้แม้งวดเดียว ⇒ ช่องโหว่/จบสั้นของงวดที่ยังไม่รับรองผ่านเงียบ (SO-26080043-0 ฯลฯ
       งวด 1 รับรองแล้วไม่มีช่วงครอบ) แล้วอนุมัติย้อนหลังประทับตรา ⇒ ด่านเงินนับเดือนในช่องโหว่ว่าจ่ายแล้ว */
  const period = validPeriod(servicePeriodOf(ctx?.order));
  if (!period || unconfirmedMissing) return findings;
  const { blocking, warnings } = pipelineCoverageIssues(live, period);
  const covered = live.filter(hasCover).sort(byCoverSpan);
  const uncovered = live.filter((row) => isConfirmed(row) && !hasCover(row)).map(seqNo).filter(Number.isFinite);
  for (const item of blocking) {
    if (explainedByUncovered(item, { live, covered, uncovered, period })) continue;
    findings.issues.push(coverageIssue(item, { live, covered }));
  }
  for (const item of warnings) {
    /* ครอบซ้อนชี้งวดที่ถูกซ้อนเข้ามา — งวดนั้นรับรองแล้ว = ชี้งวดคู่ที่ยังแก้ได้ · รับรองทั้งคู่ = ของบัญชี (ไม่มี "ไปแก้") */
    const row = live[item.index] || null;
    const prev = Number.isInteger(item.prevIndex) ? live[item.prevIndex] || null : null;
    const fn = !!row && isConfirmed(row) && (!prev || isConfirmed(prev));
    const target = row && isConfirmed(row) && prev && !isConfirmed(prev) ? prev : row;
    findings.warnings.push({
      key: 'coverage_overlap', area: 'installments', tab: 'payment', field: 'coverage', owner: fn ? 'FN' : 'SA',
      installmentId: target?.id ?? null, seq: target?.seq ?? item.seq ?? null,
      ...(fn ? { tag: SERVICE_SETUP_PANEL_TEXT.fnTag } : {}),
      message: SERVICE_SETUP_ISSUE_TEXT.coverage_overlap({ a: item.prevSeq, b: item.seq, since: item.since, until: item.until }),
    });
  }
  return findings;
}

/**
 * ⭐ **ข้อที่ยังขาด (บล็อกการยื่น)** — ตัวเดียวกันทั้งจอ (ผ่าน GET) และด่านของ server · ว่าง = ผ่าน
 * Issue: `{ key, area, tab, owner: 'SA', lineId?, zoneId?, installmentId?, seq?, lineNo?, field, message }`
 * 🔴 **fail-closed**: ไม่มี `ctx.fgOptionIds` (Set) = throw — ข้อ "แพ็คเกจของนิติบุคคลอื่น" ตรวจที่ JS เท่านั้น
 *   ด่านที่ข้ามการโหลดตัวเลือก FG จะปล่อยผ่านสิ่งที่ GET ขึ้นแดงไว้ ⇒ ทุกด่านต้อง `withFgOptions: true`
 * ⭐ `ctx.unsaved` (จอตั้งเอง) = ข้อเดียว "ยังไม่บันทึก" — ตรวจของที่ยังไม่บันทึกไม่ได้ ไม่ตรวจอย่างอื่นต่อ
 */
export function serviceSetupIssues(ctx = {}) {
  if (ctx?.unsaved) return [makeIssue('unsaved')];
  if (!(ctx?.fgOptionIds instanceof Set)) {
    throw new Error('serviceSetupIssues: ctx.fgOptionIds ต้องโหลดมาก่อน (withFgOptions)');
  }
  const byLine = allocationsByLine(ctx);
  const issues = [];
  for (const { line, lineNo } of orderedLines(ctx)) {
    issues.push(...lineIssues(line, lineNo, byLine.get(line?.id) || [], ctx));
  }
  const totals = serviceSetupTotals(ctx);
  if (totals.packageLines && !validPeriod(servicePeriodOf(ctx?.order))) issues.push(makeIssue('period_missing'));
  issues.push(...installmentFindings(ctx, totals).issues);
  return issues;
}

/** คำเตือน (ไม่บล็อก) — `coverage_overlap` (ของฝ่ายขาย) · `fn_coverage_missing` (ของบัญชี · ป้าย "รอฝ่ายบัญชี" · ไม่มี "ไปแก้")
 *  Warning: `{ key, area, tab, field, owner: 'SA'|'FN', installmentId?, seq?, message, tag? }` — area/tab/field ให้แผงแดง
 *  จัดกลุ่มและ `serviceSetupFieldId` ชี้ช่องได้เหมือนข้อที่ยังขาด */
export function serviceSetupWarnings(ctx = {}) {
  return installmentFindings(ctx, serviceSetupTotals(ctx)).warnings;
}

/**
 * รหัสที่ฐานตีกลับ (`sales_order_service_setup_incomplete` · DETAIL = `'kind_missing:SOL-a','packs_missing:SOL-a:ZN-1','period_missing'`)
 * → Issue[] ภาษาไทยพร้อมเลขรายการ — ใช้ตอนของเปลี่ยนระหว่างการตรวจของ JS กับการเขียนของฐาน
 */
export function serviceSetupSqlIssues(detailCodes = [], ctx = {}) {
  const lineInfo = new Map(orderedLines(ctx).map(({ line, lineNo }) => [line?.id, { line, lineNo }]));
  const codes = (Array.isArray(detailCodes) ? detailCodes : String(detailCodes || '').split(','))
    .map((code) => text(code)).filter(Boolean);
  return codes.map((code) => {
    const [key, lineId = null, ...rest] = code.split(':');
    const zoneId = rest.length ? rest.join(':') : null;
    if (key === 'period_missing' || !lineId) return makeIssue(key);
    const info = lineInfo.get(lineId) || null;
    const line = info?.line || { id: lineId };
    const lineNo = info?.lineNo ?? '?';
    const base = { lineId, lineNo, ...(zoneId ? { zoneId } : {}) };
    const args = { n: lineNo, label: serviceLineLabel(line), fg: text(line?.serviceFgCode) || null, zone: zoneNameOf(ctx, zoneId) };
    if (key === 'zone_invalid') {
      const zone = mapGet(ctx?.zonesById, zoneId);
      const site = zone ? mapGet(ctx?.sitesById, zone.siteId) : null;
      args.text = zone || site ? bindTargetError({ order: ctx?.order, zone, site }) : null;
    }
    return makeIssue(key, base, args);
  });
}

/** id ของช่องบนจอที่ข้อนั้นชี้ — `svc-period` · `svc-save` (ปุ่มบันทึก) · `svc-line-<lineId>-<field>`
 *  · `svc-zone-<lineId>-<zoneId>-packs` · `inst-<id>-<field>`
 *  ข้อที่ไม่มีช่อง (ยังไม่มีงวด) = null (จอแค่สลับแท็บ) */
export function serviceSetupFieldId(issueOrKey) {
  if (typeof issueOrKey === 'string') {
    if (issueOrKey === 'unsaved' || issueOrKey === 'save') return 'svc-save';
    return issueOrKey === 'period' || issueOrKey === 'period_missing' ? 'svc-period' : null;
  }
  const issue = issueOrKey || {};
  if (issue.key === 'unsaved' || issue.field === 'save') return 'svc-save';
  if (!issue.field) return null;
  if (issue.field === 'period') return 'svc-period';
  if (issue.installmentId) return `inst-${issue.installmentId}-${issue.field}`;
  if (!issue.lineId) return null;
  if (issue.field === 'packs' && issue.zoneId) return `svc-zone-${issue.lineId}-${issue.zoneId}-packs`;
  return `svc-line-${issue.lineId}-${issue.field}`;
}

/** นับข้อรายแท็บ (ป้ายแดงบนแท็บหลังกดยื่น) */
export function issuesByTab(issues = []) {
  const out = { overview: 0, payment: 0 };
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (issue?.tab === 'payment') out.payment += 1;
    else out.overview += 1;
  }
  return out;
}

/* ══ ตรวจก้อนที่จอส่งมาบันทึก (PATCH) ═════════════════════════════════════════════════════════════════ */

const intIn = (value, lo, hi) => {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = typeof value === 'number' ? value : Number(text(value));
  return Number.isInteger(n) && n >= lo && n <= hi ? { ok: true, value: n } : { ok: false, value: null };
};
const DATE_MIN = '2000-01-01';
const DATE_MAX = '2100-12-31';

/** ข้อความของแพ็คเกจที่ไม่อยู่ในตัวเลือก (ไม่ใช่ FG 02-001 ที่ใช้ได้ของลูกค้าในใบ/นิติบุคคลเดียวกัน) */
export const SERVICE_SETUP_FG_NOT_OFFERED = 'แพ็คเกจที่เลือกใช้ไม่ได้ — ต้องเป็น FG หมวด 02-001 ของลูกค้าในใบ (หรือนิติบุคคลเดียวกัน) ที่อนุมัติแล้วและยังใช้งาน';

/**
 * ตรวจก้อนบันทึกงานบริการก่อนยิง RPC — กติกาเดียวกับ `save_sales_order_service_setup` ของฐาน + ข้อ "FG ของนิติบุคคลอื่น"
 * body: `{ expectedUpdatedAt, period?: {from,to}|null, lines?: [{ lineId, kind?, serviceProductId?, rounds?, zones?: [{zoneId, packsPerRound}] }] }`
 *   คีย์ที่ไม่ส่ง = ไม่เปลี่ยน · `zones` ที่ส่ง = แทนทั้งชุดของบรรทัดนั้น · `period: null` = ล้าง
 * → `{ value: rpcPayload | null, errors: [{ lineId, zoneId?, field, message }] }` — มี error = value null
 *   rpcPayload = ก้อนเดียวกันแบบทำรูปแล้ว (ตัวเลขเป็นจำนวนเต็ม · โซนพก sortOrder ตามลำดับที่ส่งมา) ไม่มี expectedUpdatedAt
 * 🔴 ส่ง serviceProductId มาแต่ ctx ไม่มี fgOptionIds = throw (fail-closed เหมือน serviceSetupIssues)
 */
export function validateServiceSetupPatch(body, ctx = {}) {
  const errors = [];
  const payloadError = (lineId = null) => errors.push({
    lineId, field: 'payload', message: SERVICE_SETUP_SQL_MESSAGES.service_setup_payload_invalid.message,
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    payloadError();
    return { value: null, errors };
  }
  const value = {};

  if (hasOwn(body, 'period')) {
    if (body.period === null) value.period = null;
    else {
      const from = isoDay(body.period?.from);
      const to = isoDay(body.period?.to);
      if (!from || !to || to < from || from < DATE_MIN || to > DATE_MAX) {
        errors.push({ lineId: null, field: 'period', message: SERVICE_SETUP_SQL_MESSAGES.service_setup_period_invalid.message });
      } else value.period = { from, to };
    }
  }

  if (hasOwn(body, 'lines') && !Array.isArray(body.lines)) payloadError();
  const entries = Array.isArray(body.lines) ? body.lines : [];
  const linesById = new Map((Array.isArray(ctx?.lines) ? ctx.lines : []).map((line) => [line?.id, line]));
  const seenLines = new Set();
  const outLines = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { payloadError(); continue; }
    const lineId = text(entry.lineId);
    const line = linesById.get(lineId);
    if (!lineId || !line) {
      errors.push({ lineId: lineId || null, field: 'line', message: SERVICE_SETUP_SQL_MESSAGES.service_setup_line_unknown.message });
      continue;
    }
    if (seenLines.has(lineId)) { payloadError(lineId); continue; }
    seenLines.add(lineId);
    const out = { lineId };
    const fail = (field, message, zoneId) => errors.push({ lineId, ...(zoneId ? { zoneId } : {}), field, message });

    const manual = isManualSalesLine(line);
    if (!manual && (hasOwn(entry, 'kind') || hasOwn(entry, 'serviceProductId'))) {
      fail('kind', SERVICE_SETUP_SQL_MESSAGES.service_setup_kind_on_fg_line.message);
      continue;
    }
    let kind = storedKindOf(line);
    if (hasOwn(entry, 'kind')) {
      if (entry.kind !== null && entry.kind !== SERVICE_KIND_PACKAGE && entry.kind !== SERVICE_KIND_NOT_SERVICE) {
        fail('kind', SERVICE_SETUP_SQL_MESSAGES.service_setup_kind_invalid.message);
        continue;
      }
      kind = entry.kind;
      out.kind = entry.kind;
    }
    const role = kind || derivedLineRole(line) || SERVICE_ROLE_UNSET;
    const notPackage = SERVICE_SETUP_SQL_MESSAGES.service_setup_not_package.message;

    if (hasOwn(entry, 'serviceProductId')) {
      const productId = entry.serviceProductId === null ? null : text(entry.serviceProductId) || null;
      if (productId && role !== SERVICE_KIND_PACKAGE) fail('fg', notPackage);
      else if (productId) {
        if (!(ctx?.fgOptionIds instanceof Set)) {
          throw new Error('validateServiceSetupPatch: ctx.fgOptionIds ต้องโหลดมาก่อน (withFgOptions)');
        }
        if (!ctx.fgOptionIds.has(productId)) fail('fg', SERVICE_SETUP_FG_NOT_OFFERED);
      }
      out.serviceProductId = productId;
    }

    if (hasOwn(entry, 'rounds')) {
      const rounds = intIn(entry.rounds, SERVICE_SETUP_LIMITS.roundsMin, SERVICE_SETUP_LIMITS.roundsMax);
      if (!rounds.ok) fail('rounds', SERVICE_SETUP_SQL_MESSAGES.service_setup_rounds_invalid.message);
      else if (rounds.value !== null && role !== SERVICE_KIND_PACKAGE) fail('rounds', notPackage);
      out.rounds = rounds.value;
    }

    if (hasOwn(entry, 'zones')) {
      if (!Array.isArray(entry.zones)) { payloadError(lineId); continue; }
      if (entry.zones.length && role !== SERVICE_KIND_PACKAGE) fail('zones', notPackage);
      else if (entry.zones.length > SERVICE_SETUP_LIMITS.zonesPerLine) {
        fail('zones', SERVICE_SETUP_SQL_MESSAGES.service_setup_zones_too_many.message);
      } else {
        const seenZones = new Set();
        out.zones = [];
        entry.zones.forEach((zoneEntry, sortOrder) => {
          const zoneId = text(zoneEntry?.zoneId);
          if (!zoneId) { fail('zones', SERVICE_SETUP_SQL_MESSAGES.service_setup_zone_invalid.message); return; }
          if (seenZones.has(zoneId)) { fail('zones', SERVICE_SETUP_SQL_MESSAGES.service_setup_zone_duplicate.message, zoneId); return; }
          seenZones.add(zoneId);
          const zone = mapGet(ctx?.zonesById, zoneId);
          const site = zone ? mapGet(ctx?.sitesById, zone.siteId) : null;
          const why = bindTargetError({ order: ctx?.order, zone, site });
          if (why) fail('zones', why, zoneId);
          const packs = intIn(zoneEntry?.packsPerRound, SERVICE_SETUP_LIMITS.packsMin, SERVICE_SETUP_LIMITS.packsMax);
          if (!packs.ok) fail('packs', SERVICE_SETUP_SQL_MESSAGES.service_setup_packs_invalid.message, zoneId);
          out.zones.push({ zoneId, packsPerRound: packs.value, sortOrder });
        });
      }
    }
    outLines.push(out);
  }
  if (hasOwn(body, 'lines')) value.lines = outLines;
  return { value: errors.length ? null : value, errors };
}

/* ══ ข้อความของโมดัล / แถบ / หัวใบ (ภาคผนวก A.5) ══════════════════════════════════════════════════════ */

const contractSigned = (ctx) => ctx?.contract?.status === 'signed';
const CONTRACT_WARNING = 'ยังไม่ผูกสัญญา — นัดบริการติดด่านสัญญาจนกว่าจะผูกสัญญาที่ลงนามแล้วที่แท็บ “สัญญา”';

const firstFew = (items, max = 3) => (items.length > max ? `${items.slice(0, max).join(', ')} ฯลฯ` : items.join(', '));

function handoffLine(totals) {
  return `เปิดงานบริการให้ TS: ${fmtNumber(totals.zones)} โซนใน ${fmtNumber(totals.sites)} ไซต์ · รวม ${fmtNumber(totals.packsPerRound)} แพ็ค/รอบ`
    + ` · ขายไว้ ${roundsLabel(totals)} — ขึ้นที่ “งานเข้าใหม่ › รอตั้งรอบ” ทันที ไม่ต้องผูกโซนอีก`;
}

/* โซนที่ตั้งในใบนี้ซึ่งมีรอบขายของใบอื่นที่ยังมีผล (ต่ออายุ) — Map zoneId → เลขใบ */
function liveTermsOnSetup(ctx) {
  const zoneIds = new Set((Array.isArray(ctx?.allocations) ? ctx.allocations : []).map((row) => row?.zoneId));
  const out = new Map();
  const source = ctx?.liveTermsByZone instanceof Map ? ctx.liveTermsByZone : new Map();
  for (const [zoneId, entries] of source) {
    if (!zoneIds.has(zoneId)) continue;
    const numbers = [...new Set((Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.order?.id !== ctx?.order?.id)
      .map((entry) => text(entry?.order?.orderNumber) || text(entry?.term?.salesOrderId))
      .filter(Boolean))];
    if (numbers.length) out.set(zoneId, numbers);
  }
  return out;
}

const siteIdsOfSetup = (ctx) => {
  const sites = new Set();
  for (const row of Array.isArray(ctx?.allocations) ? ctx.allocations : []) {
    const siteId = mapGet(ctx?.zonesById, row?.zoneId)?.siteId;
    if (siteId) sites.add(siteId);
  }
  return sites;
};

/** ผลของการอนุมัติ (บรรทัด "สิ่งที่จะเกิดขึ้นทันที") — flow: 'pipeline' (อนุมัติใบ) | 'backfill' (อนุมัติงานบริการย้อนหลัง) */
export function serviceSetupApprovalEffects(ctx = {}, { flow = 'pipeline' } = {}) {
  const totals = serviceSetupTotals(ctx);
  const money = installmentFindings(ctx, totals);
  const order = ctx?.order || {};
  const fnLine = money.confirmedUncovered > 0
    ? `งวดที่บัญชีรับรองแล้ว ${money.confirmedUncovered} งวดยังไม่มีช่วงครอบ — ช่างเข้าไซต์ได้เมื่อบัญชีกรอกช่วงครอบให้`
    : null;

  if (flow === 'backfill') {
    const live = liveInstallments(ctx);
    const month = order.approvedAt ? formatMonthLabel(fmtYearMonth(order.approvedAt)) || '—' : '—';
    /* ฝ่ายขายตัดสินว่าไม่มีแพ็คเกจเลย (D25 · เลือก "ไม่ใช่งานบริการ" ครบ) — อนุมัติ = ยืนยันว่าไม่มีงานบริการ (ประทับ 0 โซน)
       ⇒ ไม่พูดว่า "เปิด 0 โซนให้ TS ขึ้นรอตั้งรอบทันที" และด่านเงินไม่ขยาย (ไม่มีรหัสแพ็คเกจให้ตัวตัดสินเงินอ่าน) */
    const none = !totals.packageLines;
    return [
      none ? `ไม่มีแพ็คเกจบริการรายรอบ — ไม่เปิดโซนให้ TS (ยืนยันว่าใบนี้ไม่มีงานบริการ) · ไม่ใช่งานบริการรายรอบ ${totals.notServiceLines} รายการ`
        : handoffLine(totals),
      'ไม่แตะยอด Actual · ยอดใบ · เอกสารที่ออกแล้ว · สถานะใบ (อนุมัติแล้วเหมือนเดิม)'
        + ` — Actual ${month} ${fmtMoney(order.actualAmount)} · ยอดรวม ${fmtMoney(order.totalAmount)} · งวดชำระ ${live.length} งวด เท่าเดิม`,
      none ? null
        : `ด่านเงินของบัญชีเริ่มใช้กับใบนี้: งวดที่ยังไม่รับรองต้องมีช่วงครอบก่อนรับรอง (ครบแล้ว ${money.unconfirmedCovered} งวด)`,
      fnLine,
      contractSigned(ctx) ? null : CONTRACT_WARNING,
      'หลังอนุมัติล็อก — แก้ด้วยย้อนการอนุมัติใบแล้วออก Rev. (จำนวนรอบแก้ได้)',
    ].filter(Boolean);
  }

  if (!totals.packageLines) return ['ใบนี้ไม่มีแพ็คเกจบริการ — ไม่มีอะไรส่งให้ TS'];

  const period = periodText(servicePeriodOf(order));
  const zeroTotal = paymentNotRequired(order.totalAmount);
  const notService = orderedLines(ctx).filter(({ line }) => serviceLineRole(line) === SERVICE_KIND_NOT_SERVICE)
    .map(({ line }) => clip(line?.description, 24) || text(line?.fgCode) || 'ไม่มีคำอธิบาย');
  const renewals = liveTermsOnSetup(ctx);
  const renewalOrders = [...new Set([...renewals.values()].flat())];
  let moveLine = null;
  const planSites = [...new Set(Array.isArray(ctx?.predecessor?.activePlanSiteIds) ? ctx.predecessor.activePlanSiteIds : [])];
  if (ctx?.predecessor && planSites.length) {
    const sites = siteIdsOfSetup(ctx);
    const moved = planSites.filter((siteId) => sites.has(siteId)).length;
    const left = planSites.length - moved;
    moveLine = `ย้ายรอบบริการ ${moved} ไซต์จาก ${ctx.predecessor.orderNumber || '—'} มาใบนี้`
      + (left ? ` · ไซต์ที่ใบนี้ไม่มีแล้ว ${left} ไซต์ TS จะเห็นเป็นรอบของใบเดิมให้ตัดสิน` : '');
  }
  return [
    handoffLine(totals),
    zeroTotal
      ? `ช่วงบริการ ${period} · ใบยอด 0 บาท — ไม่มีงวด`
      : `ช่วงบริการ ${period} · งวด ${money.live.length} งวดครอบต่อเนื่อง — ช่างเข้าไซต์ได้เฉพาะวันที่บัญชีรับรองงวดที่ครอบแล้ว`,
    contractSigned(ctx) ? null : CONTRACT_WARNING,
    notService.length ? `ไม่ใช่งานบริการรายรอบ ${notService.length} รายการ (${firstFew(notService)}) — ไม่ส่งให้ TS` : null,
    renewals.size ? `${renewals.size} โซนมีรอบขายของ ${firstFew(renewalOrders)} ที่ยังมีผล (ต่ออายุ)` : null,
    moveLine,
    fnLine,
    'หลังอนุมัติ แพ็คเกจ/โซน/แพ็คต่อรอบ/ช่วงบริการล็อก — แก้ด้วยย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบแก้ได้)',
  ].filter(Boolean);
}

/** สิ่งที่ผู้อนุมัติควรตรวจก่อนกด */
export function serviceSetupApprovalChecklist(ctx = {}, { flow = 'pipeline' } = {}) {
  const tableCheck = 'ตรวจแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ ในตารางรายการ';
  if (flow === 'backfill') {
    const totals = serviceSetupTotals(ctx);
    if (!totals.packageLines) return ['ตรวจว่าทุกรายการไม่ใช่งานบริการรายรอบจริง (ดูคำอธิบาย/หมายเหตุของแต่ละรายการ)'];
    const { unconfirmedCovered } = installmentFindings(ctx, totals);
    return [tableCheck, 'ช่วงบริการตรงกับหมายเหตุของแต่ละสาขา', `งวดที่ยังไม่รับรองมีช่วงครอบครบ ${unconfirmedCovered} งวด`];
  }
  return serviceSetupTotals(ctx).packageLines ? [tableCheck] : [];
}

/** บรรทัดเสริมของโมดัลยืนยัน "ยื่นอนุมัติ" (ใบ pipeline) — ไม่มีแพ็คเกจ = null */
export function serviceSetupSubmitLine(ctx = {}) {
  const totals = serviceSetupTotals(ctx);
  if (!totals.packageLines) return null;
  return `ส่งการตั้งค่างานบริการ (${fmtNumber(totals.zones)} โซนใน ${fmtNumber(totals.sites)} ไซต์ · ช่วงบริการ ${periodText(servicePeriodOf(ctx?.order))})`
    + ' ให้ผู้อนุมัติตรวจ — ระหว่างรออนุมัติแก้ไม่ได้ ดึงกลับได้';
}

/** โมดัลยืนยัน "ยื่นตรวจงานบริการ" (ย้อนหลัง · ไม่มีช่องลายเซ็น · ถอนเองไม่ได้) — ส่งเข้า `approvalPrompt()` ได้ตรง ๆ */
export function serviceBackfillSubmitPrompt(ctx = {}) {
  const totals = serviceSetupTotals(ctx);
  return {
    title: 'ยื่นตรวจงานบริการ',
    subject: `งานบริการของ ${ctx?.order?.orderNumber || 'ใบสั่งขายนี้'}`,
    effects: [
      totals.packageLines
        ? `ส่งการตั้งค่างานบริการ (${fmtNumber(totals.zones)} โซนใน ${fmtNumber(totals.sites)} ไซต์ · ช่วงบริการ ${periodText(servicePeriodOf(ctx?.order))}) ให้ผู้จัดการฝ่ายขายตรวจ`
        : `ส่งการตัดสินว่าใบนี้ไม่มีแพ็คเกจบริการรายรอบ (ไม่ใช่งานบริการรายรอบ ${fmtNumber(totals.notServiceLines)} รายการ) ให้ผู้จัดการฝ่ายขายตรวจ`,
      'ระหว่างรอตรวจแก้ไม่ได้ และถอนเองไม่ได้ — ต้องให้ผู้จัดการตีกลับ',
      'ยอดใบ · Actual · เอกสาร · งวดชำระ ไม่เปลี่ยน',
    ],
    confirmLabel: 'ยื่นตรวจงานบริการ',
  };
}

/** แถบสรุปของผู้อนุมัติ: "งานบริการ: z โซน · s ไซต์ · p แพ็ค/รอบ · r รอบ/โซน · ช่วง … · สัญญา: …" */
export function serviceSetupStripText(ctx = {}) {
  const totals = serviceSetupTotals(ctx);
  if (!totals.packageLines) return 'งานบริการ: ใบนี้ไม่มีแพ็คเกจบริการ';
  const contract = text(ctx?.contract?.contractNo) || 'ยังไม่ผูก';
  return `งานบริการ: ${fmtNumber(totals.zones)} โซน · ${fmtNumber(totals.sites)} ไซต์ · ${fmtNumber(totals.packsPerRound)} แพ็ค/รอบ`
    + ` · ${roundsLabel(totals)} · ช่วง ${periodText(servicePeriodOf(ctx?.order))} · สัญญา: ${contract}`;
}

/** บรรทัดของโมดัลออก Rev. — ไม่มีอะไรตั้งไว้ = null */
export function serviceSetupRevisionLine(ctx = {}) {
  const byLine = allocationsByLine(ctx);
  const count = orderedLines(ctx).filter(({ line }) => storedKindOf(line) || text(line?.serviceFgCode)
    || (byLine.get(line?.id) || []).length).length;
  const period = validPeriod(servicePeriodOf(ctx?.order));
  if (!count && !period) return null;
  const totals = serviceSetupTotals(ctx);
  return `คัดลอกงานบริการ ${fmtNumber(count)} รายการ · ${fmtNumber(totals.zones)} โซน · ช่วงบริการ ${periodText(period)} ไปใบ Rev.`;
}

/** ช่อง "รอบบริการที่ขาย" ของหัวใบ → `{ label, value, sub, tone }` */
export function serviceSetupHeroFact(ctx = {}, { flow = null } = {}) {
  const label = 'รอบบริการที่ขาย';
  const order = ctx?.order || {};
  const totals = serviceSetupTotals(ctx);
  const awaiting = serviceBackfillAwaitingReview(order);
  if (!totals.packageLines && !totals.unsetLines) return { label, value: '—', sub: 'ใบนี้ไม่มีแพ็คเกจบริการ', tone: 'muted' };
  const complete = !!order.serviceTermsOpenedAt
    || (totals.completeLines === totals.lineCount && !!validPeriod(servicePeriodOf(order)));
  if (!complete) {
    const backfill = flow === 'backfill' || awaiting;
    return { label, value: 'ยังไม่ตั้ง', sub: backfill ? 'ตั้งที่ตารางรายการ แล้วยื่นตรวจ' : 'ตั้งที่ตารางรายการ แล้วยื่นอนุมัติ', tone: 'muted' };
  }
  return {
    label,
    value: roundsLabel(totals),
    sub: `${fmtNumber(totals.zones)} โซน · ${fmtNumber(totals.packsPerRound)} แพ็ค/รอบ${awaiting ? ' · รอตรวจ' : ''}`,
    tone: null,
  };
}

/** ก้อนก่อน/หลังของ audit log — ช่วงบริการ + ชนิด/แพ็คเกจ/รอบ/โซนรายบรรทัด */
export function serviceSetupAuditSnapshot(ctx = {}) {
  const byLine = allocationsByLine(ctx);
  return {
    period: servicePeriodOf(ctx?.order),
    lines: orderedLines(ctx).map(({ line }) => ({
      lineId: line?.id ?? null,
      kind: storedKindOf(line),
      serviceFgCode: text(line?.serviceFgCode) || null,
      rounds: roundsOf(line),
      zones: (byLine.get(line?.id) || []).map((row) => ({ zoneId: row?.zoneId ?? null, packsPerRound: packsOf(row) })),
    })),
  };
}

/* ══ ก้อน GET ของ /service-setup (pure — เทสต์ได้โดยไม่แตะฐาน) ═══════════════════════════════════════════ */

/**
 * ประกอบก้อนตอบของ `GET …/service-setup` (§2.4 ของแผน) จากบริบทที่ serviceSetupRepo โหลด (`withFgOptions: true`)
 * @param canEdit ผู้ขอแก้ใบนี้ได้ไหม (`canEditSalesPlanning && inSalesEditScope`) · role/userId = ผู้ขอ
 */
export function serviceSetupView(ctx = {}, { canEdit = false, userId = null, role = null } = {}) {
  const order = ctx?.order || {};
  const flow = serviceSetupFlow(order, ctx);
  const editBlockedReason = serviceSetupEditError(order, { canEdit });
  const mode = (flow === 'pipeline' || flow === 'backfill') && !editBlockedReason ? 'edit' : 'read';
  const awaiting = serviceBackfillAwaitingReview(order);
  const playFlow = flow === 'backfill' || awaiting ? 'backfill' : 'pipeline';
  const byLine = allocationsByLine(ctx);
  const reviewer = isSalesManager(role);
  const selfSubmitted = !!userId && order.serviceSetupSubmittedById === userId;
  const canReview = reviewer && !!canEdit && awaiting;
  const submitterName = playFlow === 'backfill' ? order.serviceSetupSubmittedByName : order.submittedByName;
  const submittedAt = playFlow === 'backfill' ? order.serviceSetupSubmittedAt : order.submittedAt;
  const orderNumber = order.orderNumber || '—';

  return {
    orderId: order.id ?? null,
    updatedAt: order.updatedAt ?? null,
    flow,
    mode,
    editBlockedReason: mode === 'edit' ? null : editBlockedReason,
    period: servicePeriodOf(order),
    state: {
      setupState: order.serviceSetupState ?? null,
      submittedAt: order.serviceSetupSubmittedAt ?? null,
      submittedByName: order.serviceSetupSubmittedByName ?? null,
      submittedById: order.serviceSetupSubmittedById ?? null,
      rejectedAt: order.serviceSetupRejectedAt ?? null,
      rejectedByName: order.serviceSetupRejectedByName ?? null,
      rejectedReason: order.serviceSetupRejectedReason ?? null,
      approvedAt: order.serviceSetupApprovedAt ?? null,
      approvedByName: order.serviceSetupApprovedByName ?? null,
      termsOpenedAt: order.serviceTermsOpenedAt ?? null,
    },
    lines: orderedLines(ctx).map(({ line, lineNo }) => ({
      lineId: line?.id ?? null,
      lineNo,
      role: serviceLineRole(line),
      roleSource: serviceLineRoleSource(line),
      kind: storedKindOf(line),
      serviceProductId: line?.serviceProductId ?? null,
      serviceFgCode: line?.serviceFgCode ?? null,
      rounds: line?.serviceRounds ?? null,
      fgCode: line?.fgCode ?? null,
      productId: line?.productId ?? null,
      description: line?.description ?? null,
      note: line?.metadata?.note ?? null,
      qty: line?.qty ?? null,
      unit: line?.unit ?? null,
      categoryCode: lineCategoryCode(line),
      categoryName: line?.metadata?.categoryName ?? null,
    })),
    allocations: [...byLine.values()].flat().map((row) => ({
      id: row?.id ?? null,
      lineId: row?.salesOrderLineId ?? null,
      zoneId: row?.zoneId ?? null,
      packsPerRound: row?.packsPerRound ?? null,
      sortOrder: row?.sortOrder ?? 0,
    })),
    zones: [...(ctx?.zonesById instanceof Map ? ctx.zonesById.values() : [])].map((zone) => ({
      id: zone?.id ?? null, code: zone?.code ?? null, name: zone?.name ?? null, siteId: zone?.siteId ?? null, isActive: zone?.isActive !== false,
    })),
    sites: [...(ctx?.sitesById instanceof Map ? ctx.sitesById.values() : [])].map((site) => ({
      id: site?.id ?? null, code: site?.code ?? null, name: site?.name ?? null, customerId: site?.customerId ?? null,
      isActive: site?.isActive !== false, kind: site?.kind ?? null,
    })),
    fgOptions: (Array.isArray(ctx?.fgOptions) ? ctx.fgOptions : []).map((option) => ({
      id: option?.id ?? null, fgCode: option?.fgCode ?? null, name: option?.name ?? null, ownerArCode: option?.ownerArCode ?? null,
    })),
    siblingSites: Array.isArray(ctx?.siblingSites) ? ctx.siblingSites : [],
    issues: serviceSetupIssues(ctx),
    warnings: serviceSetupWarnings(ctx),
    totals: serviceSetupTotals(ctx),
    approvalEffects: serviceSetupApprovalEffects(ctx, { flow: playFlow }),
    approvalChecklist: serviceSetupApprovalChecklist(ctx, { flow: playFlow }),
    approvalSubject: submitterName
      ? `${orderNumber} · ยื่นโดย ${submitterName}${submittedAt ? ` ${fmtDate(submittedAt)}` : ''}`
      : orderNumber,
    submitLine: serviceSetupSubmitLine(ctx),
    stripText: serviceSetupStripText(ctx),
    hero: serviceSetupHeroFact(ctx, { flow }),
    backfillSubmitPrompt: flow === 'backfill' ? serviceBackfillSubmitPrompt(ctx) : null,
    revisedFrom: ctx?.predecessor ? { id: ctx.predecessor.id ?? null, orderNumber: ctx.predecessor.orderNumber ?? null } : null,
    backfill: {
      canSubmit: !!canEdit && flow === 'backfill' && order.serviceSetupState !== 'submitted',
      canReview,
      reviewBlockedReason: canReview && role !== 'admin' && selfSubmitted ? 'ยื่นเองอนุมัติเองไม่ได้' : null,
      needsOverrideReason: canReview && role === 'admin' && selfSubmitted,
    },
    liveTermsInfo: [...liveTermsOnSetup(ctx)].map(([zoneId, orderNumbers]) => ({ zoneId, orderNumbers })),
  };
}
