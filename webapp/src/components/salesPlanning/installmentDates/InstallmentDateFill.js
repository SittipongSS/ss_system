"use client";
// ── แผง "เติมวันงวดที่ว่าง…" ของโหมดตั้งวัน (แบบ C · มติเจ้าของ 28/09) — **เขียนร่างลงตารางอย่างเดียว** ──
//
// ⭐ แทนสองปุ่มเดิมบนการ์ด ("เติมตามรอบ เดือนละงวด…" · "จัดวันใหม่ตามรอบปัจจุบัน…") และโมดัลพรีวิวของมัน —
//   ตารางงวดคือพรีวิว (จุดบอก + "เดิม ~~วัน~~") · บันทึกครั้งเดียวที่แถบล่าง (`schedule-many`)
// ⭐ ตัวคิดวันทั้งหมดอยู่ที่ billingRule.js ผ่าน `planDateFill` (planMonthlyFill · planRedate · planDueCadence) ตามชนิดของแผง
//   (`fillKindOf` · รุ่นสี่ มติเจ้าของ 29/09):
//   · มีรอบ (rounds) — ไทล์ละรอบ (ลูกค้าหลายรอบ = ถามก่อนว่าใช้รอบไหน **ไม่เลือกให้** · มติ 26/09 ข้อ 15) · งวดที่ติ๊ก
//     "งวดนี้ไม่ต้องวางบิล" ไม่ถูกเติม (ตัวเติมตามรอบให้แต่วันวางบิล)
//   · ยึดกำหนดชำระ (cadence) — ข้อเสนอแรก "ต่อจากงวด X · กำหนดชำระทุกวันที่ D" (AR-015 ไม่ไหลเป็น 24/27 · ข้อ 1 ของกรรมการ)
//     + เลือกวันที่เอง 1–31 แล้ว "ตามเดือนในชื่องวด" (AR-622) หรือเดือนเริ่ม:
//       ทุกวัน + เครดิต N = วันวางบิล = กำหนดชำระ − N · ชำระวันวางบิล = ถามเป็น "วันวางบิลวันที่" (ลำดับวันวางบิล → กำหนดชำระ)
//       ไม่ต้องวางบิล · ยังไม่ระบุ · ยังไม่ตั้งรอบ · **รูปเดิม { credit:false }** = **เขียนกำหนดชำระอย่างเดียว** (ไม่มีวันวางบิลปลอม ·
//       รอบกรรมการ 29/09 · ชื่องวดเป็นแค่เบาะแส — ระบบไม่เดาวันเอง)
// ⭐ ทุกไทล์เห็นผลงวดแรก "○ → ●" ก่อนแตะ (ข้อ 3) · ไม่มีไทล์ไหนเลือกไว้ให้ (กฎบ้าน: ไม่มีค่าตั้งต้นให้การตัดสินใจ)
// ⭐ สวิตช์ "จัดใหม่งวดที่มีวันแล้วด้วย (N งวด)" = งานของ "จัดวันใหม่ตามรอบปัจจุบัน…" เดิม (ลูกค้าเปลี่ยนรอบถาวร)
// ⚠️ งวดที่ล็อก (แจ้งชำระ/ชำระแล้ว/ขอใบวางบิล/ยกมา) ส่งเข้าตัวคิดเป็นสถานะ 'locked' — ไม่ถูกแตะ แต่ยังกันไม่ให้งวดหลังย้อนแซง
// ⭐ รอบห้า (มติเจ้าของ 29/09 · ปฏิทินรายปีของลูกค้า · Q3 หยุด): ลูกค้าตามปฏิทินเติม "ตามปฏิทินลูกค้า" (รอบจริงของปี) —
//   งวดที่ตกปีที่ยังไม่มีปฏิทิน **ถูกข้ามพร้อมเหตุ** "งวด 4–12 ไม่ถูกเติม — ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" (งวดก่อนหน้ายังเติม) ·
//   ไม่มีรอบให้เติมเลย = บอกเหตุแทนไทล์ว่าง · ไม่มีประมาณการ
import { useEffect, useRef } from "react";
import { CalendarRange, CalendarX, Info, ListRestart, TriangleAlert, Undo2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import CustomerBillingRuleDayGrid from "@/components/database/CustomerBillingRuleDayGrid";
import { MONTH_END_DAY, billingRoundLabels, weekendNote } from "@/lib/sales/billingRule";
import {
  creditFillSuggestion, datedFillCount, fillInputRows, fillStartMonths, fillTargetsOf, isCalendarRule, planDateFill,
} from "@/lib/sales/installmentDateDrafts";
import { DateLegend, DateTile, pairLabel } from "./InstallmentDateParts";
import styles from "./InstallmentDates.module.css";

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthShort = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  return m ? `${MONTHS_SHORT[m - 1]} ${y}` : "";
};
const dayWord = (day) => (day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${day}`);
const seqRange = (rows) => {
  if (!rows.length) return "";
  return rows.length === 1 ? `งวด ${rows[0].seq}` : `งวด ${rows[0].seq}–${rows[rows.length - 1].seq}`;
};

/* ไทล์หนึ่งตัวเลือก — ผลงวดแรก + ช่วงงวด + จำนวนงวดที่ตรงเสาร์-อาทิตย์ (เตือน ไม่เลื่อน · มติ 26/09) */
function OptionTile({ plan, cap, on, onPick }) {
  const first = plan.rows[0] || null;
  if (!first) return null;
  const weekend = plan.rows.filter((row) => weekendNote(row.billingDate) || weekendNote(row.dueDate)).length;
  /* งวดที่ตัวคิดข้าม (ปีที่ปฏิทินยังไม่มี · รอบห้า) — บอกจำนวนบนไทล์ เหตุอยู่ใต้ไทล์ (`SkipNotes`) */
  const skipped = plan.skipNotes?.length ? plan.skipped?.length || 0 : 0;
  const meta = [
    plan.rows.length > 1 ? `${seqRange(plan.rows)} · ${plan.rows.length} งวด` : seqRange(plan.rows),
    weekend ? `ตรงเสาร์-อาทิตย์ ${weekend} งวด` : "",
    skipped ? `ข้าม ${skipped} งวด` : "",
  ].filter(Boolean).join(" · ");
  return (
    <DateTile role="radio" billingDate={first.billingDate} dueDate={first.dueDate} on={on}
      cap={cap} tags={<span className={styles.tileMeta}>{meta}</span>}
      ariaLabel={pairLabel(first.billingDate, first.dueDate, `${cap} · ${meta}`)} onClick={onPick} />
  );
}

/* งวดที่ตัวเติมข้ามพร้อมเหตุ (รอบห้า · ปีที่ปฏิทินยังไม่มี) — "งวด 4–12 ไม่ถูกเติม — ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้"
   · จัดใหม่ (includeDated) = งวดเหล่านั้นคงวันเดิม · คนตั้งเองในตาราง (แตะช่องวัน — ช่องกำหนดชำระพิมพ์ได้) */
function SkipNotes({ notes = [], keep = false }) {
  if (!notes.length) return null;
  return (
    <ul className={styles.warns}>
      {notes.map((note) => (
        <li key={note.text} className={styles.warn}>
          <CalendarX size={13} aria-hidden="true" />
          {`${note.label} ${keep ? "คงวันเดิม" : "ไม่ถูกเติม"} — ${note.text}`}
        </li>
      ))}
    </ul>
  );
}

export default function InstallmentDateFill({ mode }) {
  const headRef = useRef(null);
  const { fill, fillKind, ruleValue, todayIso, kind, creditDays } = mode;
  /* เติมวันวางบิลด้วยไหม (ทุกวัน + เครดิต/ชำระวันวางบิล) — ที่เหลือของแผงยึดกำหนดชำระเขียนกำหนดชำระอย่างเดียว */
  const writesBilling = kind === "cadence" && creditDays !== null;
  /* ลูกค้าตามปฏิทินรายปี (รอบห้า) — คำของแผงพูด "ตามปฏิทินลูกค้า" แทน "ตามรอบของลูกค้า" */
  const calendar = isCalendarRule(ruleValue);
  const opened = Boolean(fill);

  /* เปิดแผง = โฟกัสหัว (คนใช้คีย์บอร์ด/เสียงอ่านรู้ว่าแผงมาแล้ว) + เลื่อนให้เห็น (แผงอยู่เหนือตาราง ปุ่มเปิดอยู่แถบล่าง) */
  useEffect(() => {
    if (!opened) return;
    headRef.current?.focus({ preventScroll: true });
    headRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [opened]);

  if (!fill) return null;

  const includeDated = Boolean(fill.includeDated);
  const inputRows = fillInputRows(mode.rows, mode.fillCurrent, mode.fillLocked);
  const targets = fillTargetsOf(fillKind, inputRows, { includeDated });
  const dated = datedFillCount(fillKind, inputRows);
  const planOf = (option) => planDateFill(ruleValue, inputRows, { ...option, includeDated }, todayIso, { holidays: mode.holidays });
  /* `count` = งวดที่แผนนี้ลงตารางจริง (ตามเดือนในชื่องวดข้ามงวดที่ชื่อไม่บอกเดือน) */
  const pick = (key, plan) => mode.applyFill({ choice: key, count: plan.rows.length }, plan);
  const applied = fill.choice ? fill.count || 0 : 0;

  /* ── ตัวเลือกตามชนิดรอบ ── */
  let options = null;
  if (targets.length) {
    if (fillKind === "rounds") {
      const labels = billingRoundLabels(ruleValue);
      /* ป้ายรอบของรุ่นสี่ที่มีคำว่า "รอบ" อยู่แล้ว ("รอบที่ 1 (ตัดรอบราววันที่ 8)" · "ตัดรอบวันที่ 21") ไม่เติม "รอบ" ซ้ำหน้า */
      const capOf = (label) => (label.includes("รอบ") ? label : `รอบ${label}`);
      const rounds = labels.length > 1
        ? labels.map((label, index) => ({ key: `round:${index}`, roundIndex: index, cap: capOf(label) }))
        : [{ key: "round:0", roundIndex: null, cap: `${calendar ? "ตามปฏิทินลูกค้า" : "ตามรอบของลูกค้า"} · เดือนละงวด` }];
      const plans = rounds.map((round) => ({ ...round, plan: planOf({ kind: "rounds", roundIndex: round.roundIndex }) }));
      /* เหตุที่ข้าม = ของตัวเลือกที่ลงตารางอยู่ (ยังไม่เลือก = ของตัวเลือกแรกที่มีงวดข้าม — ทุกรอบหยุดที่ปีเดียวกัน) */
      const shown = plans.find((p) => p.key === fill.choice) || plans.find((p) => p.plan.skipNotes?.length) || null;
      const none = plans.every((p) => !p.plan.rows.length);
      options = (
        <div className={styles.fillQ}>
          <span>
            <span className={styles.stepNo} aria-hidden="true">1</span>
            {rounds.length > 1 ? `ลูกค้าวางบิลเดือนละ ${rounds.length} รอบ — งวดของใบนี้ใช้รอบไหน` : `งวด ${targets[0].seq} เริ่มรอบถัดไป แล้วเดือนละงวด`}
          </span>
          {none ? (
            /* ไม่มีรอบให้เติมเลย — บอกเหตุแทนไทล์ว่าง (ทุกงวดตกปีที่ปฏิทินยังไม่มี = รายการงวดที่ข้ามข้างล่างบอกเหตุแล้ว ไม่พูดซ้ำ) */
            shown ? null : (
              <p className={styles.hint} role="note">
                <Info size={14} aria-hidden="true" />
                {plans[0]?.plan.error || "ไม่มีรอบถัดไปให้เติม"}
              </p>
            )
          ) : (
            <>
              <p className={styles.lead}><DateLegend /></p>
              <div className={styles.fillTiles} role="radiogroup" aria-label="รอบที่ใช้เติม">
                {plans.map((round) => (
                  <OptionTile key={round.key} plan={round.plan} cap={round.cap}
                    on={fill.choice === round.key} onPick={() => pick(round.key, round.plan)} />
                ))}
              </div>
            </>
          )}
          <SkipNotes notes={shown?.plan.skipNotes || []} keep={includeDated} />
        </div>
      );
    } else {
      const suggestion = creditFillSuggestion(inputRows, { includeDated });
      const suggestionPlan = suggestion
        ? planOf({ kind: "cadence", dueDay: suggestion.dueDay, startMonth: suggestion.startMonth })
        : null;
      const day = fill.day;
      const months = fillStartMonths(inputRows, new Set(targets.map((row) => row.id)), todayIso);
      const optionOf = (startMonth) => ({ kind: "cadence", dueDay: day, startMonth });
      /* "ตามเดือนในชื่องวด" — ทุกแบบที่ยึดวันของกำหนดชำระ · ชื่องวดไม่บอกเดือน = ไม่มีไทล์ */
      const labelPlan = day ? planOf(optionOf(null)) : null;
      /* ชำระวันวางบิล = วันเดียวถามเป็นวันวางบิลก่อน (ลำดับวันวางบิล → กำหนดชำระ · ไม่พูด "− 0 วัน") */
      const dayQuestion = writesBilling && creditDays === 0
        ? "วันวางบิลวันที่ (ชำระวันวางบิล — กำหนดชำระวันเดียวกัน)"
        : writesBilling ? `กำหนดชำระวันที่ (วันวางบิล = กำหนดชำระ − ${creditDays} วัน)` : "กำหนดชำระวันที่ (ทุกงวด)";
      options = (
        <>
          {suggestionPlan && !suggestionPlan.error ? (
            <div className={styles.fillQ}>
              <span>ต่อจากงวดก่อน</span>
              <div className={styles.fillTiles} role="radiogroup" aria-label="ต่อจากงวดก่อน">
                <OptionTile plan={suggestionPlan} on={fill.choice === "suggest"}
                  cap={`${suggestion.keep ? "ยึดกำหนดชำระเดิมงวด" : "ต่อจากงวด"} ${suggestion.fromSeq} · กำหนดชำระทุก${dayWord(suggestion.dueDay)}`}
                  onPick={() => pick("suggest", suggestionPlan)} />
              </div>
              <p className={styles.or}>หรือเลือกวันเอง</p>
            </div>
          ) : null}
          <div className={styles.fillQ}>
            <span><span className={styles.stepNo} aria-hidden="true">1</span>{dayQuestion}</span>
            <CustomerBillingRuleDayGrid ariaLabel={dayQuestion} value={day} className={styles.dayGrid}
              onPick={(next) => mode.patchFill({ day: next })} />
          </div>
          <div className={styles.fillQ}>
            <span>
              <span className={styles.stepNo} aria-hidden="true">2</span>
              {writesBilling ? `งวด ${targets[0].seq} เริ่มเดือนไหน` : `งวด ${targets[0].seq} เดือนไหน`}
            </span>
            {day ? (
              <div className={styles.fillTiles} role="radiogroup" aria-label="เดือนของงวด">
                {labelPlan && !labelPlan.error ? (
                  <OptionTile plan={labelPlan} cap={`ตามเดือนในชื่องวด · ${dayWord(day)}`} on={fill.choice === `label:${day}`}
                    onPick={() => pick(`label:${day}`, labelPlan)} />
                ) : null}
                {months.map((month) => {
                  const plan = planOf(optionOf(month));
                  const key = `month:${day}:${month}`;
                  return (
                    <OptionTile key={key} plan={plan} cap={`เริ่ม ${monthShort(month)} · เดือนละงวด`} on={fill.choice === key}
                      onPick={() => pick(key, plan)} />
                  );
                })}
              </div>
            ) : (
              <p className={styles.hint}><Info size={14} aria-hidden="true" />เลือกวันที่ก่อน แล้วจะเห็นวันของงวดแรกบนแต่ละตัวเลือก</p>
            )}
            {labelPlan?.skipped?.length && fill.choice === `label:${day}` ? (
              <p className={styles.hint}>
                <TriangleAlert size={14} aria-hidden="true" />
                งวดที่ {labelPlan.skipped.join(", ")} ชื่อไม่บอกเดือน — ไม่ถูกเติม ตั้งเองในตาราง
              </p>
            ) : null}
          </div>
        </>
      );
    }
  }

  return (
    <section className={styles.fill} aria-labelledby="installment-fill-title">
      <div className={styles.fillHead}>
        <div>
          <h3 id="installment-fill-title" ref={headRef} tabIndex={-1}>
            <CalendarRange size={16} aria-hidden="true" /> เติมวันงวดที่ว่าง…
          </h3>
          <p>
            {targets.length ? `${seqRange(targets)} · ${targets.length} งวด` : "ไม่มีงวดที่ว่าง"}
            {fillKind === "rounds" ? (calendar ? " · ตามปฏิทินลูกค้า" : " · ตามรอบของลูกค้า")
              : writesBilling ? " · ยึดกำหนดชำระ" : " · กำหนดชำระอย่างเดียว"}
            {" · ลงร่างในตาราง ยังไม่บันทึก"}
          </p>
        </div>
        <Button iconOnly size="sm" variant="quiet" aria-label="ปิดแผงเติมวัน (ร่างที่ลงตารางแล้วยังอยู่)"
          icon={<X size={16} aria-hidden="true" />} onClick={mode.closeFill} />
      </div>

      {dated ? (
        <button type="button" role="switch" aria-checked={includeDated} className={styles.switch}
          onClick={() => mode.applyFill({ includeDated: !includeDated, choice: null }, null)}>
          <span className={styles.track} aria-hidden="true" />
          <span>
            <b>จัดใหม่งวดที่มีวันแล้วด้วย ({dated} งวด)</b>
            <small>ใช้เมื่อลูกค้าเปลี่ยนรอบ — วันเดิมของงวดเหล่านี้ถูกแทน (กำหนดชำระใหม่นับป้ายเลยกำหนดทันทีที่บันทึก)</small>
          </span>
        </button>
      ) : null}

      {targets.length ? options : (
        <p className={styles.hint}>
          <Info size={14} aria-hidden="true" />
          {dated
            ? "ทุกงวดที่แก้ได้มีวันแล้ว — แตะช่องวันเพื่อแก้รายงวด หรือเปิดสวิตช์ข้างบน"
            : mode.editable.length
              /* เหลือแต่งวดที่รอเหตุการณ์ — ตัวเติมไม่เดาวันให้งวดผูกเหตุการณ์ (มติ 25/09 ข้อ 3) */
              ? "ไม่มีงวดที่ว่างให้เติม — งวดที่รอเหตุการณ์ไม่ถูกเติม (ระบบไม่เดาวันให้) แตะช่องวันเพื่อเลือกวันเองเมื่อรู้วัน"
              : "ไม่มีงวดที่แก้วันได้ — งวดที่แจ้งชำระ/ชำระแล้ว/ขอใบวางบิลแล้ว/ยกมา ไม่ถูกแตะ"}
        </p>
      )}

      {fill.choice ? (
        <div className={styles.fillDone} role="status">
          <p>ลงตารางแล้ว {applied} งวด — ตรวจในตารางก่อนบันทึก</p>
          <Button size="sm" variant="quiet" icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={() => mode.applyFill({ choice: null }, null)}>ย้อนการเติม</Button>
          <Button size="sm" tone="neutral" icon={<ListRestart size={13} aria-hidden="true" />} onClick={mode.closeFill}>
            ปิดแผงนี้
          </Button>
        </div>
      ) : null}
      <p className={styles.hint}>
        <Info size={14} aria-hidden="true" />
        งวดที่ล็อก (แจ้งชำระ/ชำระแล้ว/ขอใบวางบิลแล้ว/ยกมา) และงวดที่แก้เองระหว่างแผงเปิดอยู่ ไม่ถูกแตะ
      </p>
      {fillKind !== "rounds" && !writesBilling ? (
        /* ไม่มีวันวางบิลปลอม (รอบกรรมการ 29/09) — ไม่ต้องวางบิล/ยังไม่ระบุ/รูปเดิม ได้แค่กำหนดชำระ */
        <p className={styles.hint}>
          <Info size={14} aria-hidden="true" />
          {kind === "dueOnly"
            ? "ลูกค้าไม่ต้องวางบิล — เติมกำหนดชำระอย่างเดียว"
            : "เติมกำหนดชำระอย่างเดียว — วันวางบิลไม่บังคับ ใส่รายงวดเองได้"}
        </p>
      ) : null}
    </section>
  );
}
