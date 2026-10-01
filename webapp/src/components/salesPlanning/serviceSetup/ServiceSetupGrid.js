"use client";
// ── ตาราง "งานบริการ" ของใบสั่งขายสาย SERVICE — หนึ่งแถวต่อรายการ (มติเจ้าของ 30/09 · ม็อก BindGridEdit/BindGridMulti · ทาง A) ──
//
// ⭐ เจ้าของ 30/09: "มันต้องเลือกว่า รายการ เป็นงานบริการมั้ย ถ้าเป็น ก็มาเลือกว่า FG ไหน / Site Zone อะไร / ต้องไปกี่รอบ
//   รอบละกี่แพ็ค ผลรวมแพ็คที่ใช้ทั้งหมด รายบรรทัด รวมทุกบรรทัด" ⇒ คอลัมน์ ①→⑥ ตามลำดับนี้เท่านั้น (`SERVICE_SETUP_GRID_TEXT.steps`)
//     ① งานบริการ? (ใช่/ไม่ใช่) → ② แพ็คเกจ FG → ③ ไซต์ · โซน → ④ จำนวนรอบบริการ → ⑤ รอบละกี่แพ็ค (ต่อโซน) → ⑥ รวมแพ็ค
// ⭐ ช่วงบริการของรายการอยู่ **ใต้คำตอบในคอลัมน์ ①** (mig 0400 · มติเจ้าของ 01/10: "ช่วงบริการ เอาไว้ คอลัมน์ 1 งานบริการดีกว่า
//   ถ้าใช่ก็ให้กรอก ไม่ใช่ก็ปิด") — หน้าตาอยู่ที่ `ServiceLinePeriod` · โหมดแยกรายรายการ: ชิป "ทุกเดือน ≈ n" และคำเตือนรอบน้อย
//   คิดจาก **ช่วงของรายการนั้น** (ก้อนโซนรับ `period={linePeriod}`) · โหมดทั้งใบ: ช่วงของใบเหมือนเดิม
//   + แถวท้าย "รวมทุกรายการ" (โซน · ไซต์ · รอบ · รอบละ · รวมแพ็คทั้งใบ) — 01/10 เจ้าของเลือกทาง A (ตารางแยกใต้ตารางราคา)
// ⭐ หน้าตาตามชนิดของบรรทัด:
//   · พิมพ์เอง — ① ปุ่มสองทาง **ไม่มีค่าตั้งต้น** (หมวดของบรรทัดตอบให้ได้ พร้อมบอก "ตามหมวด …") · ใช่ = ② เลือก FG 02-001 ของลูกค้า
//   · FG 02-001 — ① ใช่ / ② FG มาจากใบเสนอราคา (เส้นประ แก้ไม่ได้) เหลือ ③–⑤
//   · FG หมวดอื่น — ① ไม่ใช่ (ตามหมวด) · แถบจางแถบเดียว "ไม่ต้องตั้ง"
// ⭐ วางผังด้วย CSS grid ล้วน (ห้าม style={{ }} ในโฟลเดอร์นี้) — แถวของรายการมี 6 ช่อง: # · รายการ · ① · ② · ก้อนโซน · ⑥
//   ก้อนโซนเป็น grid ของตัวเอง `โซน | รอบ | แพ็ค` (กว้างเท่าคอลัมน์ ③④⑤ ของหัว) ⇒ แถวโซนที่ i กับช่องแพ็คของโซนนั้นอยู่แถวเดียวกันเสมอ
//   ช่อง ④ มีค่าเฉพาะแถวโซนแรก (แถวอื่นช่องว่าง) = หน้าตาเดียวกับ rowspan ของม็อก
// ⭐ คอลัมน์เอกสารแคบ (@container) — แถวพับเป็นการ์ดเรียง ①→⑥: ก้อนโซน `display: contents` แล้วใช้ `order`
//   ให้ ③ โซนทั้งหมด → ④ รอบ → ⑤ แพ็ครายโซน (ช่องแพ็คบอกชื่อโซนของตัวเอง) — ลำดับเดียวกับหัวคอลัมน์
// 🔴 กฎ 3: ไม่มีสีแดงก่อนกด — แดงมาจาก `highlightOf` (แผงแดงหลังกดยื่น · บันทึกไม่ผ่าน) เท่านั้น
// ⚠️ ข้อความข้อมูล (รอบขายของใบอื่นที่ยังมีผล · อยู่รายการอื่นด้วย · ผลประเมิน) ไม่เคยแดง
// ⚠️ ไม่เติมจำนวนแพ็คจากผลประเมินให้เอง — ปุ่ม "ใช้" ข้างผลประเมินคือการเลือกของคน (ไม่มีค่าตั้งต้นเงียบ ๆ)
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, Lock, Pencil, Plus, Sigma, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { NA, fmtNumber, naText } from "@/lib/format";
import {
  SERVICE_KIND_NOT_SERVICE, SERVICE_KIND_OPTIONS, SERVICE_KIND_PACKAGE, SERVICE_PERIOD_MODE_LINE, SERVICE_PERIOD_TEXT, SERVICE_ROLE_UNSET,
  SERVICE_SETUP_GRID_TEXT, SERVICE_SETUP_LIMITS, SERVICE_SETUP_LINE_TEXT, lineQtyCrossCheck, lineRoundsLowText, lineSetupTotals,
  roundChipsFromPeriod, serviceRoundsText, validServicePeriod,
} from "@/lib/sales/serviceSetup";
import { SERVICE_ROUNDS_EDIT_TEXT, normalizeServiceRounds } from "@/lib/sales/serviceRoundsEntry";
import { zonePickerOptions, zoneTakenMap } from "@/lib/service/zonePickerOptions";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";
import { zonesBulkCapText } from "@/components/service/zonesBulkPlan";
import ServiceFgPicker from "./ServiceFgPicker";
import ServiceLinePeriod from "./ServiceLinePeriod";
import {
  SERVICE_SETUP_REVEAL_EVENT, ctxLineOf, lineFieldId, lineFieldIds, lineMissing, positiveIntOrNull, sameSourceOf, zonePacksFieldId,
} from "./serviceSetupDraft";
import styles from "./ServiceSetupGrid.module.css";

const COLLAPSE_AT = 8;
const NO_SITE_TEXT = "ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้";
const STEPS = SERVICE_SETUP_GRID_TEXT.steps;
const STEP_LABEL = Object.fromEntries(STEPS.map((step, index) => [step.key, `${index + 1}. ${step.label}`]));

let rowSeq = 0;
/** key ของแถวโซนใหม่ (ยังไม่มีโซน) — แถวจากฐานใช้ `z:<zoneId>` */
export const newZoneRowKey = () => {
  rowSeq += 1;
  return `n:${rowSeq}`;
};

const siteText = (site) => [site?.code, site?.name].filter(Boolean).join(" ") || null;
/** "ST-… ชื่อไซต์ · ชื่อโซน" — ป้ายของโซนที่ทะเบียนไม่มี (ตัวเลือกค้างของแถว) */
export const zoneReadLabel = (zone, site, zoneId) => `${siteText(site) || NA} · ${zone?.name || zone?.code || zoneId || NA}`;

function selectOption(option) {
  if (option.group) return option;
  return {
    ...option,
    label: option.missing ? option.label : `${option.siteName || option.siteCode || NA} · ${option.zoneName}`,
    title: option.why || undefined,
    render: (
      <span className={styles.zoneOption}>
        <span>{option.zoneName}</span>
        {option.zoneCode ? <span className={styles.zoneOptionCode}>{option.zoneCode}</span> : null}
        {option.why ? <span className={styles.zoneOptionWhy}>· {option.why}</span> : null}
      </span>
    ),
  };
}

/* ป้ายของช่องตอนแถวพับเป็นการ์ด (คอลัมน์แคบ) — จอกว้างซ่อน เพราะหัวคอลัมน์บอกแล้ว */
function StackLabel({ step, children }) {
  return <span className={styles.stackLabel}>{children ?? STEP_LABEL[step]}</span>;
}

/* ── หัวตาราง: # · รายการ · ①…⑥ (ลำดับจากแคตตาล็อก — ห้ามเรียงเองในไฟล์นี้) ── */
function GridHead({ editable }) {
  return (
    <div className={styles.head} aria-hidden="true">
      <span className={styles.headIdx}>#</span>
      <span className={styles.headCell}>
        <span className={styles.headLabel}>รายการ</span>
        <small className={styles.headHint}>จากตารางราคา</small>
      </span>
      {STEPS.map((step, index) => (
        <span key={step.key} className={styles.headCell} data-step={step.key}>
          <span className={styles.stepRow}><span className={styles.step}>{index + 1}</span></span>
          <span className={styles.headLabel}>
            {step.label}
            {editable && step.required ? <span className={styles.req}>*</span> : null}
          </span>
          <small className={styles.headHint}>{step.hint}</small>
        </span>
      ))}
    </div>
  );
}

/* ป้ายสถานะของรายการ — กลางก่อนกดยื่น (กฎ 3) · แดงเมื่อแผงแดง/การบันทึกชี้เข้ารายการนี้แล้วเท่านั้น · ตั้งครบ = เขียว */
function LineStatus({ missing, pressed }) {
  if (!missing?.label) return null;
  const tone = missing.state === "complete" ? "ok" : pressed ? "error" : "neutral";
  return <span className={styles.status} data-tone={tone}>{missing.label}</span>;
}

/* ── ช่อง "รายการ" (อ่านอย่างเดียว — ราคา/จำนวนอยู่การ์ดข้างบน) ── */
function ItemCell({ line, status }) {
  const qty = Number(line.qty);
  const qtyText = line.qty === null || line.qty === undefined || line.qty === ""
    ? null
    : `${Number.isFinite(qty) ? fmtNumber(qty) : String(line.qty)}${line.unit ? ` ${line.unit}` : ""}`;
  return (
    <div className={styles.item}>
      <span className={styles.itemTop}>
        <span className={styles.idxInline}>รายการ {line.lineNo}</span>
        <span className={styles.itemTag}>{line.manual ? "พิมพ์เอง" : "FG"}</span>
        {qtyText ? <span className={styles.itemQty}>ในใบ {qtyText}</span> : null}
      </span>
      <span className={styles.itemDesc}>{line.manual ? naText(line.description) : naText(line.fgCode)}</span>
      {!line.manual && line.description ? <span className={styles.itemSub}>{line.description}</span> : null}
      {line.note ? <span className={styles.itemNote} title={line.note}>{line.note}</span> : null}
      {status}
    </div>
  );
}

/* ── ปุ่มคำตอบของ ① — สองปุ่มแยก ✓ ใช่ / ✕ ไม่ใช่ (ม็อก PeriodSwitch · เจ้าของ 01/10) ──
   🐞 เดิมเป็นแถบสองช่องในกรอบเดียว (Segmented): ตอนยังไม่ตอบดูเป็นแถบเทาแถบเดียวเหมือนกดไม่ได้ และ "ไม่ใช่" ชนขอบคอลัมน์
   ⭐ ยังไม่ตอบ = ทั้งสองปุ่มขอบชัดพื้นขาว + คำชวน "เลือกคำตอบ" · ตอบแล้ว = ปุ่มที่เลือกเติมสี อีกปุ่มจางลง (ยังกดเปลี่ยนได้)
   ⚠️ ลูกศรย้ายโฟกัสอย่างเดียว ไม่เปลี่ยนคำตอบ — ตอบ "ไม่ใช่" ล้างแพ็คเกจ/โซนของบรรทัด ห้ามเปลี่ยนตอนกดลูกศรผ่าน */
function AnswerButtons({ line, onPick }) {
  const buttons = useRef([]);
  const value = line.role === SERVICE_ROLE_UNSET ? null : line.role;
  const answered = value !== null;
  const moveFocus = (event, index) => {
    const next = nextEnabledIndex(SERVICE_KIND_OPTIONS, index, event.key);
    if (next < 0) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };
  return (
    <>
      <div
        className={styles.answer}
        role="radiogroup"
        aria-label={`${SERVICE_SETUP_GRID_TEXT.kindQuestion} รายการ ${line.lineNo}`}
        data-answered={answered ? "" : undefined}
      >
        {SERVICE_KIND_OPTIONS.map((option, index) => {
          const on = option.value === value;
          const Icon = option.value === SERVICE_KIND_PACKAGE ? Check : X;
          return (
            <button
              key={option.value}
              ref={(node) => { buttons.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={on}
              className={styles.answerButton}
              data-answer={option.value}
              title={option.description}
              tabIndex={on || (!answered && index === 0) ? 0 : -1}
              onClick={() => onPick(option.value)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {answered ? null : <span className={styles.answerAsk}>{SERVICE_SETUP_GRID_TEXT.pickAnswer}</span>}
    </>
  );
}

/* ── ① งานบริการ? ── */
/* ใต้คำตอบทุกแบบ (FG · อ่าน · แก้) = ช่วงบริการของรายการ (`period` — props ของ ServiceLinePeriod ที่แถวรายการประกอบให้) */
function KindCell({ line, editable, error, onPick, period }) {
  const category = line.categoryCode || null;
  const periodBlock = <ServiceLinePeriod line={line} editable={editable} {...period} />;
  /* FG: ระบบตัดสินจากหมวดของรหัส (แก้ไม่ได้) */
  if (!line.manual) {
    const yes = line.role === SERVICE_KIND_PACKAGE;
    return (
      <div className={styles.kind}>
        <StackLabel step="kind" />
        <span className={styles.kindRead}>
          <b>{yes ? SERVICE_SETUP_GRID_TEXT.yes : SERVICE_SETUP_GRID_TEXT.no}</b>
          <small>{category ? `หมวด ${category}` : "ตามหมวดของ FG"}</small>
        </span>
        {periodBlock}
      </div>
    );
  }
  if (!editable) {
    const answer = line.role === SERVICE_KIND_PACKAGE ? SERVICE_SETUP_GRID_TEXT.yes
      : line.role === SERVICE_KIND_NOT_SERVICE ? SERVICE_SETUP_GRID_TEXT.no : SERVICE_SETUP_GRID_TEXT.unanswered;
    return (
      <div className={styles.kind} id={lineFieldId(line.lineId, "kind")}>
        <StackLabel step="kind" />
        <span className={styles.kindRead} data-unset={line.role === SERVICE_ROLE_UNSET ? "" : undefined}>
          <b>{answer}</b>
          <small>พิมพ์เอง</small>
        </span>
        {periodBlock}
      </div>
    );
  }
  const derivedHint = line.roleSource === "category" && category ? `ตามหมวด ${category} ของรายการ` : null;
  return (
    <div className={styles.kind} id={lineFieldId(line.lineId, "kind")} data-invalid={error ? "" : undefined}>
      <StackLabel step="kind" />
      <AnswerButtons line={line} onPick={onPick} />
      {derivedHint ? <span className={styles.hint}>{derivedHint}</span> : null}
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
      {periodBlock}
    </div>
  );
}

/* ── ② แพ็คเกจ FG ── */
function FgCell({ line, editable, fgOptions, error, onChange }) {
  if (line.manual && editable) {
    return (
      <div className={styles.fg}>
        <StackLabel step="fg" />
        <ServiceFgPicker
          lineId={line.lineId}
          lineNo={line.lineNo}
          value={line.serviceProductId}
          fgCode={line.serviceFgCode}
          options={fgOptions}
          error={error}
          onChange={onChange}
        />
      </div>
    );
  }
  const picked = line.manual ? (fgOptions || []).find((option) => option.id === line.serviceProductId) || null : null;
  const code = line.manual ? line.serviceFgCode : line.fgCode;
  const name = line.manual ? picked?.name : line.description;
  return (
    <div className={styles.fg} id={line.manual ? lineFieldId(line.lineId, "fg") : undefined}>
      <StackLabel step="fg" />
      <span className={styles.fgBox} data-locked={line.manual ? undefined : ""}>
        <b className={styles.fgCode}>{naText(code)}</b>
        {name ? <small className={styles.fgName}>{name}</small> : null}
        {line.manual ? null : (
          <small className={styles.fgSource}><Lock size={11} aria-hidden="true" />จากใบเสนอราคา</small>
        )}
      </span>
    </div>
  );
}

/* ── ④ จำนวนรอบบริการ — ช่อง + ชิป "ทุกเดือน ≈ n" จากช่วงบริการ (แตะแล้วใส่ค่า · ไม่มีค่าตั้งต้นเงียบ ๆ)
   ⚠️ ชิปเดียว (รายเดือน) ตามม็อก — คอลัมน์ ④ แคบ ชิปราย 2 สัปดาห์/ไตรมาสตัดบรรทัดกลางคำ · ความถี่อื่นพิมพ์เลขเอง
   ⭐ โหมดแยกรายรายการที่รายการยังไม่มีช่วง (`periodWait`): ชิปเส้นประ "ทุกเดือน ≈ —" กดไม่ได้ + บอกเหตุที่ title (ม็อก PeriodSwitchPerLine) ── */
function RoundsEdit({ line, period, periodWait, error, onChange }) {
  const chips = roundChipsFromPeriod(period).filter((chip) => chip.key === "monthly");
  const current = positiveIntOrNull(line.rounds);
  const chipValue = chips.find((chip) => chip.rounds === current)?.key ?? null;
  return (
    <>
      <span className={styles.num}>
        <Input
          id={lineFieldId(line.lineId, "rounds")}
          type="number" min="1" max="999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
          value={line.rounds}
          invalid={!!error}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${SERVICE_SETUP_LINE_TEXT.roundsLabel} รายการ ${line.lineNo}`}
        />
        <span className={styles.unit}>{SERVICE_SETUP_LINE_TEXT.roundUnit}</span>
      </span>
      {chips.length ? (
        <span className={styles.chips}>
          <ChoiceChips
            value={chipValue}
            onChange={(key) => {
              const chip = chips.find((item) => item.key === key);
              if (chip) onChange(String(chip.rounds));
            }}
            options={chips.map((chip) => ({ value: chip.key, label: chip.label }))}
            ariaLabel={`ตั้งจำนวนรอบจากช่วงบริการ รายการ ${line.lineNo}`}
          />
        </span>
      ) : periodWait ? (
        <span className={styles.chips}>
          <span className={styles.chipWait} title={SERVICE_PERIOD_TEXT.roundsChipWaitTitle}>{SERVICE_PERIOD_TEXT.roundsChipWait}</span>
        </span>
      ) : null}
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
    </>
  );
}

/* ดินสอแก้ "จำนวนรอบบริการ" ของใบที่ประทับแล้ว — ≥ 1 (ล้างเป็นว่างไม่ได้ · trigger ของฐานตอบ rounds_required) */
function StampedRoundsEdit({ line, onRoundsSave }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button
        iconOnly size="sm" variant="quiet" icon={<Pencil size={14} aria-hidden="true" />}
        aria-label={`แก้${SERVICE_SETUP_LINE_TEXT.roundsLabel} รายการ ${line.lineNo}`}
        onClick={() => { setValue(line.rounds); setError(""); setOpen(true); }}
      />
    );
  }
  const save = async () => {
    const rounds = normalizeServiceRounds(value);
    if (rounds === null) { setError(SERVICE_ROUNDS_EDIT_TEXT.required); return; }
    setBusy(true);
    try {
      const ok = await onRoundsSave?.({ [line.lineId]: rounds });
      if (ok !== false) setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={styles.roundsEdit}>
      <span className={styles.num}>
        <Input
          type="number" min="1" max="999" step="1" inputMode="numeric" autoComplete="off"
          value={value} invalid={!!error} disabled={busy}
          onChange={(event) => { setValue(event.target.value); setError(""); }}
          aria-label={`${SERVICE_SETUP_LINE_TEXT.roundsLabel} รายการ ${line.lineNo}`}
        />
        <span className={styles.unit}>{SERVICE_SETUP_LINE_TEXT.roundUnit}</span>
      </span>
      <Button size="sm" tone="primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกรอบ"}</Button>
      <Button size="sm" tone="neutral" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</Button>
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
    </span>
  );
}

function RoundsRead({ line, canEditRounds, onRoundsSave }) {
  const rounds = positiveIntOrNull(line.rounds);
  return (
    <span className={styles.roundsRead}>
      <span className={styles.readValue}>
        {rounds === null ? <span className={styles.muted}>{SERVICE_SETUP_LINE_TEXT.noRounds}</span> : (
          <><b>{fmtNumber(rounds)}</b> {SERVICE_SETUP_LINE_TEXT.roundUnit}</>
        )}
      </span>
      {canEditRounds ? <StampedRoundsEdit line={line} onRoundsSave={onRoundsSave} /> : null}
    </span>
  );
}

/* ── ⑥ รวมแพ็คของรายการ = รอบละ (Σ ทุกโซน) × จำนวนรอบบริการ + เทียบจำนวนในใบ (ไม่บังคับให้เท่า) ── */
const CROSS_SHORT = Object.freeze({
  ok: () => "ตรงกับจำนวนในใบ",
  warn: (line) => `≠ ในใบ ${naText(line.qty === null || line.qty === undefined ? null : fmtNumber(Number(line.qty)))} · ตรวจอีกครั้ง`,
  info: () => "ในใบ = เดือน · ไม่เทียบแพ็ค",
});

function TotalCell({ line, ctx }) {
  const ctxLine = ctxLineOf(line);
  const totals = lineSetupTotals(ctxLine, ctx);
  const cross = lineQtyCrossCheck(ctxLine, totals);
  const blank = totals.packsTotal === null || !totals.packsPerRound;
  const short = CROSS_SHORT[cross.tone]?.(line) || null;
  return (
    <div className={styles.total}>
      <StackLabel step="total" />
      <span className={styles.totalNum}>
        <b>{blank ? NA : fmtNumber(totals.packsTotal)}</b>
        <span className={styles.unit}>แพ็ค</span>
      </span>
      <span className={styles.totalFormula}>
        {`${totals.packsPerRound ? fmtNumber(totals.packsPerRound) : NA} × ${totals.rounds ? fmtNumber(totals.rounds) : NA} รอบ`}
      </span>
      {short ? <span className={styles.cross} data-tone={cross.tone} title={cross.text}>{short}</span> : null}
    </div>
  );
}

/* ── ③ ช่องเลือกโซนของแถวหนึ่ง (แก้) ── */
function ZonePick({
  line, row, index, zone, site, registry, takenLines, liveOrders, otherLineNos, zoneError, blockedNote, packsText, onPick, onPacks, onRemove,
}) {
  const registryNote = registry.loading ? " (กำลังโหลดทะเบียนไซต์…)" : registry.error ? " (โหลดทะเบียนไซต์ไม่สำเร็จ)" : "";
  const missingNote = row.zoneId ? `${zoneReadLabel(zone, site, row.zoneId)}${registryNote}` : null;
  const options = useMemo(() => zonePickerOptions({
    registrySites: registry.sites,
    taken: zoneTakenMap({ lines: takenLines, lineId: line.lineId, rowIndex: index }),
    currentZoneId: row.zoneId || null,
    missingNote,
  }).map(selectOption), [registry.sites, takenLines, line.lineId, index, row.zoneId, missingNote]);

  const zoneName = zone?.name || zone?.code || row.zoneId || "";
  const assessed = positiveIntOrNull(zone?.assessedPackages);
  const codes = [site?.code, zone?.code].filter(Boolean).join(" · ");
  const emptyText = registry.loading
    ? "กำลังโหลดทะเบียนไซต์…"
    : registry.error
      ? "โหลดทะเบียนไซต์ไม่สำเร็จ — กด “ลองโหลดอีกครั้ง” ด้านบนตาราง"
      : (query) => (query ? `ไม่พบไซต์หรือโซนที่ตรง “${query}”` : "ลูกค้ารายนี้ยังไม่มีโซนในทะเบียน");

  return (
    <>
      <div className={styles.zonePick}>
        <div className={styles.zoneSelect} data-invalid={zoneError ? "" : undefined}>
          <SearchableSelect
            size="sm"
            value={row.zoneId || ""}
            onChange={(next) => onPick(index, next)}
            options={options}
            placeholder="เลือกไซต์ · โซน"
            searchPlaceholder="ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน"
            ariaLabel={`ไซต์ · โซน รายการ ${line.lineNo} แถว ${index + 1}`}
            emptyText={emptyText}
          />
          {codes ? <span className={styles.zoneCodes}>{codes}</span> : null}
        </div>
        <Button
          iconOnly size="sm" variant="quiet"
          icon={<Trash2 size={14} aria-hidden="true" />}
          onClick={() => onRemove(index)}
          aria-label={`เอาโซน ${zoneName || `แถว ${index + 1}`} ออกจากรายการ ${line.lineNo}`}
        />
      </div>
      {assessed !== null ? (
        <span className={styles.note}>
          ผลประเมิน {fmtNumber(assessed)} แพ็ค
          {String(assessed) !== packsText ? (
            <Button size="sm" variant="quiet" onClick={() => onPacks(index, String(assessed))}>ใช้เป็นรอบละ</Button>
          ) : null}
        </span>
      ) : null}
      {blockedNote ? <span className={styles.note} role="status">{blockedNote}</span> : null}
      {zoneError ? <span className={styles.error} role="alert">{zoneError}</span> : null}
      {liveOrders?.length ? (
        <span className={styles.note}>โซนนี้มีรอบขายของ {liveOrders.join(", ")} ที่ยังมีผล — ถ้าเป็นการต่อสัญญาไม่เป็นไร</span>
      ) : null}
      {otherLineNos?.length ? <span className={styles.note}>โซนนี้อยู่ในรายการ {otherLineNos.join(", ")} ของใบนี้ด้วย</span> : null}
    </>
  );
}

/* ── ก้อนโซน ③④⑤ ของรายการที่เป็นงานบริการ ── */
function ZoneBlock({
  line, editable, period, periodWait, zonesById, sitesById, registry, takenLines, liveTerms, zoneErrors, noSites,
  highlightOf, onChange, onRoundsChange, onOpenBulk, canEditRounds, onRoundsSave, roundsLowStage,
}) {
  const [expanded, setExpanded] = useState(false);
  const [capHit, setCapHit] = useState(false);
  /* แถวที่กดลบระหว่างทะเบียนโหลดไม่ขึ้น — บอกเหตุที่แถวนั้น (ปุ่มยังโชว์ · บอกเหตุตอนกด) */
  const [blockedRow, setBlockedRow] = useState(null);
  const rows = useMemo(() => (Array.isArray(line?.zones) ? line.zones : []), [line?.zones]);
  const lineId = line.lineId;
  const zonesFieldId = lineFieldId(lineId, "zones");
  const packsErrorOf = (row) => (row.zoneId ? highlightOf(zonePacksFieldId(lineId, row.zoneId)) : null);
  const zoneErrorOf = (row) => (row.zoneId ? zoneErrors.get(`${lineId}:${row.zoneId}`) || null : null);

  /* ปุ่ม "ไปแก้" ชี้เข้าแถวที่ซ่อนอยู่ = กางก่อน (ผู้ยิงรอเฟรมถัดไปแล้วค่อยโฟกัส) */
  useEffect(() => {
    const onReveal = (event) => {
      const fieldId = event?.detail?.fieldId;
      if (!fieldId) return;
      if (fieldId === zonesFieldId || rows.some((row) => row.zoneId && zonePacksFieldId(lineId, row.zoneId) === fieldId)) setExpanded(true);
    };
    window.addEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
  }, [lineId, zonesFieldId, rows]);

  const hiddenHasError = rows.slice(COLLAPSE_AT).some((row) => packsErrorOf(row) || zoneErrorOf(row));
  const showAll = expanded || hiddenHasError || rows.length <= COLLAPSE_AT;
  const visible = showAll ? rows : rows.slice(0, COLLAPSE_AT);
  const hidden = rows.length - visible.length;

  const picked = rows.filter((row) => row.zoneId);
  const siteCount = new Set(picked.map((row) => zonesById.get(row.zoneId)?.siteId).filter(Boolean)).size;
  const countText = `${fmtNumber(picked.length)} โซน · ${fmtNumber(siteCount)} ไซต์`;

  /* โซนเดียวกันในบรรทัดอื่นของใบ → เลขรายการ (แค่บอก ไม่ห้าม) */
  const otherLinesByZone = useMemo(() => {
    const map = new Map();
    for (const other of takenLines) {
      if (other.lineId === lineId) continue;
      for (const row of other.zones || []) {
        if (!row.zoneId) continue;
        if (!map.has(row.zoneId)) map.set(row.zoneId, []);
        if (!map.get(row.zoneId).includes(other.lineNo)) map.get(row.zoneId).push(other.lineNo);
      }
    }
    return map;
  }, [takenLines, lineId]);

  const cap = SERVICE_SETUP_LIMITS.zonesPerLine;
  const emit = (next, touched = []) => {
    setCapHit(false);
    onChange?.(next, touched);
  };
  const addRow = () => {
    if (picked.length >= cap) { setCapHit(true); return; }
    emit([...rows, { key: newZoneRowKey(), zoneId: "", packsPerRound: "" }]);
  };
  const openBulk = () => {
    if (picked.length >= cap) { setCapHit(true); return; }
    setCapHit(false);
    onOpenBulk?.();
  };
  const pick = (index, zoneId) => emit(rows.map((row, i) => (i === index ? { ...row, zoneId: zoneId || "" } : row)), [zonesFieldId]);
  const setPacks = (index, value) => emit(
    rows.map((row, i) => (i === index ? { ...row, packsPerRound: value } : row)),
    rows[index]?.zoneId ? [zonePacksFieldId(lineId, rows[index].zoneId)] : [],
  );
  /* 🔴 ทะเบียนโหลดไม่ขึ้น/ยังโหลด = ลบแถวไม่ได้ — แถวที่ลบแล้วเลือกกลับไม่ได้เพราะตัวเลือกว่าง (ทางเดียวคือทิ้งร่างทั้งหมด)
     ⭐ ปุ่มยังโชว์ กดแล้วบอกเหตุที่แถว (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") */
  const removeBlocked = registry.error
    ? "โหลดทะเบียนไซต์ไม่สำเร็จ — ลองโหลดอีกครั้งก่อนลบโซน"
    : (registry.loading && !(registry.sites || []).length ? "กำลังโหลดทะเบียนไซต์… — รอก่อนลบโซน" : null);
  const remove = (index) => {
    if (removeBlocked) {
      setBlockedRow(rows[index]?.key ?? null);
      return;
    }
    setBlockedRow(null);
    emit(
      rows.filter((_, i) => i !== index),
      [zonesFieldId, ...(rows[index]?.zoneId ? [zonePacksFieldId(lineId, rows[index].zoneId)] : [])],
    );
  };
  const zonesError = highlightOf(zonesFieldId);
  const roundsLow = lineRoundsLowText(positiveIntOrNull(line.rounds), period, { stage: editable ? "submit" : roundsLowStage });

  const roundsCell = editable ? (
    <RoundsEdit
      line={line}
      period={period}
      periodWait={periodWait}
      error={highlightOf(lineFieldId(lineId, "rounds"))}
      onChange={onRoundsChange}
    />
  ) : (
    <RoundsRead line={line} canEditRounds={canEditRounds} onRoundsSave={onRoundsSave} />
  );

  /* ไม่มีโซนเลย = แถวเดียวที่บอกว่ายังไม่เลือก (ช่อง ④ ยังอยู่แถวนี้ — ใส่รอบก่อนเลือกโซนได้) */
  const zoneRows = visible.length ? visible : [null];

  return (
    <div className={styles.zoneBlock} data-invalid={zonesError ? "" : undefined}>
      {zoneRows.map((row, index) => {
        const zone = row?.zoneId ? zonesById.get(row.zoneId) : null;
        const site = zone ? sitesById.get(zone.siteId) : null;
        const packsError = row ? packsErrorOf(row) : null;
        const packs = row ? positiveIntOrNull(row.packsPerRound) : null;
        const zoneName = zone?.name || zone?.code || row?.zoneId || "";
        return (
          <div key={row?.key ?? "empty"} className={styles.zoneRow}>
            <div className={styles.zoneCell} data-first={index === 0 ? "" : undefined} id={!editable && index === 0 ? zonesFieldId : undefined}>
              {index === 0 ? <StackLabel step="zones" /> : null}
              {!row ? (
                <span className={styles.zoneEmpty}>{noSites ? NO_SITE_TEXT : "ยังไม่เลือกโซน"}</span>
              ) : editable ? (
                <ZonePick
                  line={line}
                  row={row}
                  index={index}
                  zone={zone}
                  site={site}
                  registry={registry}
                  takenLines={takenLines}
                  liveOrders={row.zoneId ? liveTerms.get(row.zoneId) : null}
                  otherLineNos={row.zoneId ? otherLinesByZone.get(row.zoneId) : null}
                  zoneError={zoneErrorOf(row)}
                  blockedNote={removeBlocked && blockedRow === row.key ? removeBlocked : null}
                  packsText={String(row.packsPerRound ?? "").trim()}
                  onPick={pick}
                  onPacks={setPacks}
                  onRemove={remove}
                />
              ) : (
                <span className={styles.zoneRead}>
                  {site?.code ? <small>{site.code}</small> : null}
                  <span className={styles.zoneReadSite}>{site?.name || (site ? NA : zoneReadLabel(zone, site, row.zoneId))}</span>
                  {zone ? <b>{zone.name || zone.code || NA}{zone.code ? <small>{zone.code}</small> : null}</b> : null}
                </span>
              )}
            </div>
            <div className={styles.roundsCell} data-first={index === 0 ? "" : undefined}>
              {index === 0 ? (
                <>
                  <StackLabel step="rounds" />
                  {roundsCell}
                </>
              ) : null}
            </div>
            <div className={styles.packsCell} data-first={index === 0 ? "" : undefined}>
              {index === 0 ? <StackLabel step="packs" /> : null}
              {row && zoneName ? <span className={styles.packsZone}>{zoneName}</span> : null}
              {!row ? <span className={styles.muted}>{NA}</span> : editable ? (
                <>
                  <span className={styles.num}>
                    <Input
                      id={row.zoneId ? zonePacksFieldId(lineId, row.zoneId) : undefined}
                      type="number" min="1" max="9999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
                      value={row.packsPerRound}
                      invalid={!!packsError}
                      onChange={(event) => setPacks(index, event.target.value)}
                      aria-label={`${SERVICE_SETUP_LINE_TEXT.packsLabel} ${zoneName || `แถว ${index + 1}`} รายการ ${line.lineNo}`}
                    />
                    <span className={styles.unit}>{SERVICE_SETUP_LINE_TEXT.packUnit}</span>
                  </span>
                  {packsError ? <span className={styles.error} role="alert">{packsError}</span> : null}
                </>
              ) : (
                <span className={styles.readValue}>
                  {packs === null ? <span className={styles.muted}>{SERVICE_SETUP_LINE_TEXT.noPacks}</span> : (
                    <><b>{fmtNumber(packs)}</b> {SERVICE_SETUP_LINE_TEXT.packUnit}</>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {editable || hidden > 0 || roundsLow ? (
        <div className={styles.zoneFoot} id={editable ? zonesFieldId : undefined}>
          {hidden > 0 ? (
            <Button size="sm" variant="quiet" className={styles.zoneMore} onClick={() => setExpanded(true)}>
              แสดงอีก {fmtNumber(hidden)} โซน
            </Button>
          ) : null}
          {editable ? (
            <span className={styles.zoneAdd}>
              <Button size="sm" icon={<Plus size={14} aria-hidden="true" />} disabled={noSites} onClick={addRow}>เพิ่มโซน</Button>
              <Button size="sm" icon={<ListPlus size={14} aria-hidden="true" />} disabled={noSites} onClick={openBulk}>เพิ่มหลายโซน…</Button>
              <span className={styles.zoneCount}>{countText}</span>
            </span>
          ) : null}
          {editable && noSites && rows.length ? <span className={styles.note}>{NO_SITE_TEXT}</span> : null}
          {capHit ? <span className={styles.error} role="alert">{zonesBulkCapText(cap)}</span> : null}
          {zonesError ? <span className={styles.error} role="alert">{zonesError}</span> : null}
          {roundsLow ? <span className={styles.note} role="status">{roundsLow}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── แถวของรายการหนึ่ง ── */
function GridLine({
  line, editable, period, periodMode, sameSource, ctx, fgOptions, zonesById, sitesById, registry, takenLines, liveTerms, zoneErrors, noSites,
  highlightOf, onLineChange, onLineReplace, onOpenBulk, canEditRounds, onRoundsSave, roundsLowStage,
}) {
  const kindError = highlightOf(lineFieldId(line.lineId, "kind"));
  const zonesError = highlightOf(lineFieldId(line.lineId, "zones"));
  const isPackage = line.role === SERVICE_KIND_PACKAGE;
  /* ช่วงที่ใช้กับรายการนี้ (ชิป "ทุกเดือน ≈ n" · คำเตือนรอบน้อย) — แยกรายรายการ = ช่วงของรายการเอง · ทั้งใบ = ช่วงของใบ */
  const byLine = periodMode === SERVICE_PERIOD_MODE_LINE;
  const linePeriod = periodMode === "line" ? line.period : period;
  const periodField = lineFieldId(line.lineId, "period");
  const periodProps = {
    periodMode,
    orderPeriod: period,
    sameSource,
    error: highlightOf(periodField),
    onChange: (next) => onLineChange?.({ period: next }, [periodField]),
  };

  const pickKind = (value) => {
    if (value === line.role) return;
    const baseRole = line.baseKind || line.derivedRole || SERVICE_ROLE_UNSET;
    const kind = value === baseRole ? line.baseKind : (value === line.derivedRole ? null : value);
    const touched = [lineFieldId(line.lineId, "kind")];
    /* ตอบ "ไม่ใช่" = ล้างแพ็คเกจ/รอบ/โซนของบรรทัดไปพร้อมกัน (RPC ตีกลับของค้างบนบรรทัดที่ไม่ใช่งานบริการ)
       กลับเป็น "ใช่" = คืนค่าที่บันทึกไว้ทั้งหมด (ร่างของบรรทัดเหลือแค่คำตอบ) */
    if (value === SERVICE_KIND_NOT_SERVICE) {
      onLineReplace?.({ kind, serviceProductId: null, rounds: "", zones: [] }, [...touched, lineFieldId(line.lineId, "zones")]);
    } else {
      onLineReplace?.({ kind }, touched);
    }
  };

  let rest;
  if (isPackage) {
    rest = (
      <>
        <FgCell
          line={line}
          editable={editable}
          fgOptions={fgOptions}
          error={highlightOf(lineFieldId(line.lineId, "fg"))}
          onChange={(productId) => onLineChange?.({ serviceProductId: productId }, [lineFieldId(line.lineId, "fg")])}
        />
        <ZoneBlock
          line={line}
          editable={editable}
          period={linePeriod}
          periodWait={byLine && !validServicePeriod(linePeriod)}
          zonesById={zonesById}
          sitesById={sitesById}
          registry={registry}
          takenLines={takenLines}
          liveTerms={liveTerms}
          zoneErrors={zoneErrors}
          noSites={noSites}
          highlightOf={highlightOf}
          onChange={(zones, touched) => onLineChange?.({ zones }, touched)}
          onRoundsChange={(rounds) => onLineChange?.({ rounds }, [lineFieldId(line.lineId, "rounds")])}
          onOpenBulk={onOpenBulk}
          canEditRounds={canEditRounds}
          onRoundsSave={onRoundsSave}
          roundsLowStage={roundsLowStage}
        />
        <TotalCell line={line} ctx={ctx} />
      </>
    );
  } else {
    const category = line.categoryCode || null;
    const text = line.role === SERVICE_ROLE_UNSET
      ? (editable ? SERVICE_SETUP_GRID_TEXT.unsetHint : SERVICE_SETUP_GRID_TEXT.unsetRead)
      : !line.manual
        ? `ไม่ใช่งานบริการรายรอบ${category ? ` · หมวด ${category}` : ""} — ไม่ต้องตั้ง`
        : SERVICE_SETUP_GRID_TEXT.notService;
    /* ⚠️ id ของช่องโซน (`svc-line-<id>-zones`) อยู่ที่แถบนี้เมื่อบรรทัดที่ตอบ "ไม่ใช่" ยังมีโซนค้าง (zones_on_not_service)
       ⇒ "ไปแก้" มีที่ให้เลื่อนไปถึง (ก้อนโซนวาดเฉพาะงานบริการ ⇒ id ไม่ชนกัน) */
    rest = (
      <div
        className={styles.strip}
        data-unset={line.role === SERVICE_ROLE_UNSET ? "" : undefined}
        id={line.role === SERVICE_KIND_NOT_SERVICE && zonesError ? lineFieldId(line.lineId, "zones") : undefined}
        tabIndex={line.role === SERVICE_KIND_NOT_SERVICE && zonesError ? -1 : undefined}
      >
        <span>{text}</span>
        {line.role === SERVICE_KIND_NOT_SERVICE && zonesError ? <span className={styles.error} role="alert">{zonesError}</span> : null}
      </div>
    );
  }

  /* ป้ายสถานะเฉพาะโหมดแก้ของบรรทัดที่ต้องตอบ/ตั้ง (FG หมวดอื่นไม่มีอะไรให้ตั้ง) */
  const needsSetup = line.manual || isPackage;
  const pressed = lineFieldIds(line).some((fieldId) => highlightOf(fieldId));
  const status = editable && needsSetup ? <LineStatus missing={lineMissing(line, { periodMode })} pressed={pressed} /> : null;

  return (
    <div className={styles.line} data-kind={line.role}>
      <span className={styles.idx}>{line.lineNo}</span>
      <ItemCell line={line} status={status} />
      <KindCell line={line} editable={editable} error={kindError} onPick={pickKind} period={periodProps} />
      {rest}
    </div>
  );
}

/* ── แถวท้าย "รวมทุกรายการ" ── */
function GridFoot({ totals }) {
  const t = totals || {};
  const extra = [
    t.notServiceLines ? `ไม่ใช่งานบริการ ${fmtNumber(t.notServiceLines)} รายการ` : "",
    t.unsetLines ? `ยังไม่ตอบ ${fmtNumber(t.unsetLines)} รายการ` : "",
  ].filter(Boolean).join(" · ");
  const rounds = t.roundsMin === null || t.roundsMin === undefined ? null
    : t.roundsMixed ? `${fmtNumber(t.roundsMin)}–${fmtNumber(t.roundsMax)}` : fmtNumber(t.roundsMin);
  return (
    <div className={styles.foot}>
      <span className={styles.footLabel}>
        <Sigma size={15} aria-hidden="true" className={styles.footIcon} />
        <b>{SERVICE_SETUP_GRID_TEXT.allLines}</b>
        <span className={styles.sep}>·</span>
        <span><b>{fmtNumber(t.packageLines || 0)}</b> รายการเป็นงานบริการ</span>
        <span className={styles.sep}>·</span>
        <span><b>{fmtNumber(t.zones || 0)}</b> โซนใน <b>{fmtNumber(t.sites || 0)}</b> ไซต์</span>
        {extra ? <span className={styles.footExtra}>({extra})</span> : null}
      </span>
      <span className={styles.footNum} data-col="rounds" title={serviceRoundsText(t) || undefined}>
        <small>{t.roundsMixed ? "ต่างกันรายรายการ" : "ทุกรายการ"}</small>
        <span><b>{rounds ?? NA}</b> <span className={styles.unit}>รอบ</span></span>
      </span>
      <span className={styles.footNum} data-col="packs">
        <small>รอบละ</small>
        <span><b>{fmtNumber(t.packsPerRound || 0)}</b> <span className={styles.unit}>แพ็ค</span></span>
      </span>
      <span className={styles.footNum} data-col="total">
        <small>รวม</small>
        <span><b>{fmtNumber(t.packsTotal || 0)}</b> <span className={styles.unit}>แพ็ค</span></span>
      </span>
    </div>
  );
}

/**
 * @param lines บรรทัดที่จอวาด (`mergedLines` — ฐาน + ร่าง) · @param editable โหมดแก้
 * @param period ช่วงบริการของทั้งใบบนจอ (โหมดทั้งใบ: ชิปจำนวนรอบ + ช่วงอ่านอย่างเดียวใต้คำตอบ ‘ใช่’)
 * @param periodMode โหมดช่วงบริการบนจอ ('whole' | 'line') — 'line' = ช่วงของรายการกรอกใต้คำตอบ ‘ใช่’ (`lines[i].period`)
 * @param ctx บริบทบนจอ (`localSetupCtx`) · @param totals `serviceSetupTotals(ctx)` · @param fgOptions `view.fgOptions`
 * @param zonesById / sitesById / registry / takenLines / liveTerms / zoneErrors / noSites — ของก้อนโซน
 * @param highlightOf `(fieldId) => ข้อความ|null` — ช่องที่แดง (หลังกดเท่านั้น)
 * @param onLineChange `(lineId, patch, touchedFieldIds) => void` · @param onLineReplace `(lineId, draftLine, touchedFieldIds) => void`
 * @param onOpenBulk `(lineId) => void` · @param canEditRounds / onRoundsSave ดินสอ "จำนวนรอบบริการ" ของใบที่ประทับแล้ว
 * @param roundsLowStage ท้ายคำเตือนรอบน้อยในโหมดอ่าน — 'approved' | 'read' · โหมดแก้ใช้ 'submit' เสมอ
 */
export default function ServiceSetupGrid({
  lines = [], editable = false, period = null, periodMode = "whole", ctx, totals, fgOptions = [],
  zonesById = new Map(), sitesById = new Map(), registry, takenLines = [], liveTerms = new Map(), zoneErrors = new Map(), noSites = false,
  highlightOf = () => null, onLineChange, onLineReplace, onOpenBulk, canEditRounds = false, onRoundsSave, roundsLowStage = "read",
}) {
  /* ต้นทางของปุ่ม "เหมือนรายการ n" — รายการงานบริการแรกที่มีช่วงแล้ว (คิดครั้งเดียวทั้งตาราง) */
  const sameSource = useMemo(() => (periodMode === SERVICE_PERIOD_MODE_LINE && editable ? sameSourceOf(lines) : null), [periodMode, editable, lines]);
  return (
    <div className={styles.wrap}>
      <div className={styles.grid} role="group" aria-label="งานบริการรายรายการ">
        <GridHead editable={editable} />
        {lines.map((line) => (
          <GridLine
              key={line.lineId}
              line={line}
              editable={editable}
              period={period}
              periodMode={periodMode}
              sameSource={sameSource}
              ctx={ctx}
              fgOptions={fgOptions}
              zonesById={zonesById}
              sitesById={sitesById}
              registry={registry}
              takenLines={takenLines}
              liveTerms={liveTerms}
              zoneErrors={zoneErrors}
              noSites={noSites}
              highlightOf={highlightOf}
              onLineChange={(patch, touched) => onLineChange?.(line.lineId, patch, touched)}
              onLineReplace={(next, touched) => onLineReplace?.(line.lineId, next, touched)}
              onOpenBulk={() => onOpenBulk?.(line.lineId)}
              canEditRounds={canEditRounds}
              onRoundsSave={onRoundsSave}
              roundsLowStage={roundsLowStage}
            />
        ))}
        <GridFoot totals={totals} />
      </div>
    </div>
  );
}
