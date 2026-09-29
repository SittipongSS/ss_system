// ── ตัวรัน backfill "ต้องวางบิลไหม" ของลูกค้าเดิม (รอมติ ข้อ 4 · เจ้าของเลือกทาง 3 "ตามหลักฐาน" 29/09) ──────────────
//
// ⛔ **เตรียมไว้ ห้ามรันเอง** — รันจริงต้องได้คำยินยอมของเจ้าของก่อน (dev DB = prod DB) · ค่าตั้งต้น = ซ้อมแห้ง (ไม่เขียนอะไร)
// ⭐ ตัวคิดคือ `backfillPlan` + `backfillGate` ของ billingRuleV4.js (ตัวเดียวกับเทสต์ §10) — สคริปต์ node เป็นแค่เปลือกต่อฐาน
//    (system-design §5.3: "JS = ของที่รันจริง ไม่ต้องพิสูจน์ว่า SQL ตรงกับ JS") · รายชื่อหลักฐานอ่านจาก billingRuleFixtures.json
// ⭐ ลำดับ: โหลดลูกค้า + งวดเปิดที่มีวันวางบิล → วางแผน → **ด่านหยุด** (ลูกค้าที่จะเป็น "ไม่ต้องวางบิล" มีงวดเปิดที่มีวันวางบิล = ออก
//    ก่อนแตะแถวแรก) → ตรวจทุกค่าที่จะเขียนด้วยตัวตรวจโหมดบันทึก → สรุป → (เฉพาะ apply) เขียนทีละแถวแบบมีเงื่อนไข
//    `billingRuleUpdatedAt` เดิม (มีคนตอบเองระหว่างนั้น = ข้าม ไม่ทับคำตอบของคน) → audit ต่อแถว
// ⚠️ แตะเฉพาะ null กับ { credit:false } · 11 รายที่ตั้งแล้วไม่แตะทุกทาง · ข้ามสหมิตร AR-109 · ย้อนได้จาก audit_logs.before
// ⚠️ ไฟล์นี้ไม่ import ฐานเอง — ผู้เรียกส่ง `io` (ทดสอบด้วยของปลอมได้ · เปลือกจริงอยู่ที่ scripts/)
import { backfillGate, backfillPlan, describeRule, normalizeRule } from './billingRuleV4.js';

/* ตราผู้แก้ล่าสุดของแถวที่ระบบเขียน — การ์ดลูกค้าโชว์ "แก้ล่าสุดโดย …" · หาแถวที่ backfill เขียนได้จากค่านี้ (แบบ 'migration-0390') */
/* ตราของแถวที่ backfill เขียน — ชื่อแบบเดียวกับ 0390 ('migration-0390') ⇒ หาแถวที่ backfill เขียนได้ด้วยตราเดียว
   (ตัวเดียวที่สคริปต์ `scripts/backfill-billing-need-v4.mjs` ใช้ · ผู้รวมงาน 29/09 ถอดค่าเดิม 'backfill-billing-need') */
export const BACKFILL_STAMP_ID = 'migration-0393';
export const backfillStampName = (option) => `ระบบ · ต้องวางบิลไหม ตามมติข้อ 4 (ทาง ${option})`;

/**
 * หลักฐานจากไฟล์ตัวอย่าง (`billingRuleFixtures.json` → `backfill`) ในรูปที่ backfillPlan รับ
 * @returns `{ evidence: { billed: Set, prepaid: Set }, review: [AR], skipArCodes: [AR] }`
 */
export function backfillEvidenceOf(backfill) {
  const list = (group) => [...(group?.noCredit || []), ...(group?.unset || [])];
  return {
    evidence: { billed: new Set(list(backfill?.billed)), prepaid: new Set(list(backfill?.prepaid)) },
    review: [...(backfill?.review || [])],
    skipArCodes: [...(backfill?.skipArCodes || [])],
  };
}

/**
 * @param io `{ loadCustomers, loadDatedOpenInstallments, patchCustomer, audit, log }`
 *   loadCustomers()              → [{ id, arCode, billingRule, billingRuleUpdatedAt }] (ทุกแถว · `billingRuleUpdatedAt` = สตริงดิบจาก select)
 *   loadDatedOpenInstallments()  → [{ id, customerId, status, kind, billingDate }] งวดของใบที่ยังใช้ที่มีวันวางบิล (ด่านหยุดดูแค่นี้)
 *   patchCustomer({ id, after, baseUpdatedAt, stampId, stampName }) → true (เขียนแล้ว) | false (แถวเปลี่ยนไปแล้ว — ข้าม)
 *     ⚠️ เงื่อนไข: baseUpdatedAt null ⇒ `billingRuleUpdatedAt=is.null` · ไม่ null ⇒ `eq` สตริงดิบ (ห้ามผ่าน Date ของ JS)
 *   audit({ id, arCode, before, after, summary }) → void (audit_logs ต่อแถว · entityType 'customer' · before/after ทั้งแถวถ้าหาได้)
 *   log(line) → void
 * @param opts `{ option: 1|2|3|4, apply = false, backfill }` — backfill = ก้อน `backfill` ของ billingRuleFixtures.json
 * @returns `{ ok, error, plan, written, skippedChanged, noteLost, dryRun }` · ok false = หยุดก่อนเขียนแถวแรก (error บอกเหตุ)
 */
export async function runNeedBackfill(io, { option, apply = false, backfill } = {}) {
  const log = io.log || (() => {});
  const n = Number(option);
  if (![1, 2, 3, 4].includes(n)) return { ok: false, error: `ต้องระบุทางเลือกข้อ 4 (1–4) — ได้ ${option}`, plan: null, written: 0, skippedChanged: [], noteLost: [], dryRun: !apply };
  const { evidence, review, skipArCodes } = backfillEvidenceOf(backfill);
  const customers = await io.loadCustomers();
  const installments = await io.loadDatedOpenInstallments();
  const plan = backfillPlan(customers, installments, n, evidence, { review, skipArCodes });
  log(`ทาง ${n}: ไม่ต้องวางบิล ${plan.counts.none} · ต้องวางบิล ${plan.counts.required} · ยังไม่ระบุ ${plan.counts.unknown} · ตั้งแล้วไม่แตะ ${plan.counts.untouched} · จะเขียน ${plan.changes.length} แถว`);
  if (plan.review.length) log(`ต้องให้คนตรวจตามหลังเขียน: ${plan.review.join(', ')}`);
  /* รูปเดิมที่มีหมายเหตุแล้วกลายเป็น "ยังไม่ระบุ" (null) = หมายเหตุหายจากการ์ด (ยังอยู่ใน audit_logs.before) — บอกชื่อให้คนตาม */
  const noteLost = plan.changes.filter((c) => c.after === null && c.before && typeof c.before === 'object' && c.before.note).map((c) => c.arCode);
  if (noteLost.length) log(`หมายเหตุเดิมจะหายจากการ์ด (ยังอยู่ใน audit_logs): ${noteLost.join(', ')}`);

  /* ⭐ ด่านหยุดก่อนแถวแรก — ตัวเดียวกับเทสต์ (ไม่มี RAISE ของ SQL ให้พึ่ง) */
  const gate = backfillGate(plan);
  if (!gate.ok) {
    log(gate.error);
    return { ok: false, error: gate.error, plan, written: 0, skippedChanged: [], noteLost, dryRun: !apply };
  }
  /* ทุกค่าที่จะเขียนต้องผ่านตัวตรวจโหมดบันทึก (ไม่รับรูปเดิม · ไม่รับธง legacyNoCredit) — ตรวจครบก่อนเขียนแถวแรก */
  for (const change of plan.changes) {
    if (change.after === null) continue;
    const { error } = normalizeRule(change.after, { allowLegacy: false });
    if (error) {
      const message = `หยุด: ${change.arCode} ค่าที่จะเขียนไม่ผ่านตัวตรวจ — ${error}`;
      log(message);
      return { ok: false, error: message, plan, written: 0, skippedChanged: [], noteLost, dryRun: !apply };
    }
  }
  if (!apply) {
    log('ซ้อมแห้ง — ไม่มีอะไรถูกเขียน (ใส่ --apply หลังเจ้าของยินยอมเท่านั้น)');
    return { ok: true, error: null, plan, written: 0, skippedChanged: [], noteLost, dryRun: true };
  }

  const byId = new Map(customers.map((c) => [c.id, c]));
  const stampName = backfillStampName(n);
  let written = 0;
  const skippedChanged = [];
  for (const change of plan.changes) {
    const base = byId.get(change.id)?.billingRuleUpdatedAt ?? null;
    const ok = await io.patchCustomer({ id: change.id, after: change.after, baseUpdatedAt: base, stampId: BACKFILL_STAMP_ID, stampName });
    if (!ok) { skippedChanged.push(change.id); log(`ข้าม ${change.arCode}: มีคนแก้ระหว่างรัน`); continue; }
    written += 1;
    const said = change.after === null ? 'ยังไม่ระบุ' : describeRule(change.after);
    await io.audit({ id: change.id, arCode: change.arCode, before: change.before, after: change.after, summary: `${stampName}: ${change.arCode} → ${said}` });
  }
  log(`เขียนแล้ว ${written} แถว${skippedChanged.length ? ` · ข้าม ${skippedChanged.length} แถวที่มีคนแก้ระหว่างรัน` : ''}`);
  return { ok: true, error: null, plan, written, skippedChanged, noteLost, dryRun: false };
}
