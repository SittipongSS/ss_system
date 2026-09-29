"use client";
// ── กล่อง "งานบริการของรายการนี้" ใต้แต่ละบรรทัด (ม็อก SoSetupTable / SoLineKindChoice / SoMultiZoneLine) ───────────
//
// ⭐ หน้าตาตามชนิดของบรรทัด (D2/D3):
//   · พิมพ์เอง  — แผ่น "ชนิดรายการ" สองแผ่น **ไม่มีค่าตั้งต้น** (หมวดของบรรทัดเลือกให้ได้ พร้อมบอก "ตามหมวด …")
//                 แพ็คเกจ = เลือก FG หมวด 02-001 ของลูกค้า · ไม่ใช่งานบริการ = แถบจางแถบเดียว + "เปลี่ยนชนิด"
//   · FG 02-001 — ชนิด/แพ็คเกจมาจากใบเสนอราคา (เส้นประ แก้ไม่ได้) เหลือโซน + รอบ
//   · FG อื่น   — แถบจาง "ไม่ใช่งานบริการรายรอบ · หมวด … — ไม่ต้องตั้ง"
// ⭐ ป้ายสถานะ "ตั้งครบ / ยังขาด n ข้อ / ยังไม่เลือกชนิด" **เป็นกลางก่อนกดยื่น** (กฎ 3) — แดงเมื่อแผงแดงชี้เข้าบรรทัดนี้แล้วเท่านั้น
// ⭐ ตัวเลขใต้บรรทัด (ต่อรอบ x แพ็ค · y รอบ · ทั้งรายการ z แพ็ค) และการเทียบจำนวนในใบ มาจากตัวรวมของ serviceSetup.js
//   ด้วยบริบทบนจอ (ร่าง) — เปลี่ยนทันทีที่พิมพ์ ไม่ต้องรอบันทึก
// ⭐ โหมดอ่าน (รออนุมัติ · อนุมัติแล้ว · ล็อกระหว่างรอตรวจ): "แพ็คเกจ FG-… · 12 รอบ/โซน" + รายการโซน · ใบที่ประทับแล้ว
//   แก้ "จำนวนรอบ" ได้ที่ดินสอ (≥ 1) ผ่าน action เดิมของหน้า (`set_service_rounds`)
import { useEffect, useMemo, useState } from "react";
import { Package, Pencil, Repeat } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Tag from "@/components/ui/Tag";
import { fmtNumber, naText } from "@/lib/format";
import {
  SERVICE_KIND_NOT_SERVICE, SERVICE_KIND_OPTIONS, SERVICE_KIND_PACKAGE, SERVICE_ROLE_UNSET,
  lineQtyCrossCheck, lineSetupTotals, roundChipsFromPeriod,
} from "@/lib/sales/serviceSetup";
import { SERVICE_ROUNDS_EDIT_TEXT, normalizeServiceRounds } from "@/lib/sales/serviceRoundsEntry";
import ServiceFgPicker from "./ServiceFgPicker";
import ServiceZoneRows from "./ServiceZoneRows";
import { SERVICE_SETUP_REVEAL_EVENT, ctxLineOf, lineFieldId, lineFieldIds, lineMissing, positiveIntOrNull } from "./serviceSetupDraft";
import styles from "./ServiceLineSetupBlock.module.css";

const KIND_LABEL = Object.freeze({ package: "แพ็คเกจบริการรายรอบ", not_service: "ไม่ใช่งานบริการรายรอบ" });

/* ป้ายสถานะของบรรทัด — tone กลางก่อนกด · แดงเฉพาะเมื่อแผงแดง/การบันทึกชี้เข้าบรรทัดนี้ */
function StatusTag({ missing, pressed }) {
  if (!missing?.label) return null;
  if (missing.state === "complete") return <Tag tone="success">{missing.label}</Tag>;
  return <Tag tone={pressed ? "danger" : "neutral"}>{missing.label}</Tag>;
}

/* ชิปจำนวนรอบจากช่วงบริการ — แตะแล้วใส่ค่า (ไม่มีค่าตั้งต้นเงียบ ๆ) · ตัวที่เท่าค่าในช่องขึ้นเป็นตัวที่เลือก */
function RoundsField({ line, period, error, onChange }) {
  const chips = roundChipsFromPeriod(period);
  const current = positiveIntOrNull(line.rounds);
  const chipValue = chips.find((chip) => chip.rounds === current)?.key ?? null;
  return (
    <div className={styles.field}>
      <span className={styles.label}>รอบบริการ (ต่อโซน)<span className={styles.req} aria-hidden="true">*</span></span>
      <div className={styles.roundsControls}>
        <span className={styles.numField}>
          <Input
            id={lineFieldId(line.lineId, "rounds")}
            type="number" min="1" max="999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
            value={line.rounds}
            invalid={!!error}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`รอบบริการ รายการ ${line.lineNo}`}
          />
          <span className={styles.numUnit}>รอบ ตลอดช่วงบริการ</span>
        </span>
        {chips.length ? (
          <ChoiceChips
            value={chipValue}
            onChange={(key) => {
              const chip = chips.find((item) => item.key === key);
              if (chip) onChange(String(chip.rounds));
            }}
            options={chips.map((chip) => ({ value: chip.key, label: chip.label }))}
            ariaLabel={`ตั้งจำนวนรอบจากช่วงบริการ รายการ ${line.lineNo}`}
          />
        ) : null}
      </div>
      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
    </div>
  );
}

function Derived({ line, ctx }) {
  const ctxLine = ctxLineOf(line);
  const totals = lineSetupTotals(ctxLine, ctx);
  const cross = lineQtyCrossCheck(ctxLine, totals);
  const dash = (value) => (value === null || value === undefined || value === 0 ? "—" : fmtNumber(value));
  return (
    <div className={styles.derived}>
      <span className={styles.dchip}>
        ต่อรอบ <b>{dash(totals.packsPerRound)}</b> แพ็ค · <b>{dash(totals.rounds)}</b> รอบ · ทั้งรายการ <b>{dash(totals.packsTotal)}</b> แพ็ค
      </span>
      {cross.text ? <span className={styles.xcheck} data-tone={cross.tone}>{cross.text}</span> : null}
    </div>
  );
}

/* ดินสอแก้ "จำนวนรอบ" ของใบที่ประทับแล้ว — ≥ 1 (ล้างเป็นว่างไม่ได้ · trigger ของฐานตอบ rounds_required) */
function StampedRoundsEdit({ line, onRoundsSave }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button
        iconOnly size="sm" variant="quiet" icon={<Pencil size={14} aria-hidden="true" />}
        aria-label={`แก้จำนวนรอบ รายการ ${line.lineNo}`}
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
      <span className={styles.numField}>
        <Input
          type="number" min="1" max="999" step="1" inputMode="numeric" autoComplete="off"
          value={value} invalid={!!error} disabled={busy}
          onChange={(event) => { setValue(event.target.value); setError(""); }}
          aria-label={`จำนวนรอบ รายการ ${line.lineNo}`}
        />
        <span className={styles.numUnit}>รอบ/โซน</span>
      </span>
      <Button size="sm" tone="primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกรอบ"}</Button>
      <Button size="sm" tone="neutral" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</Button>
      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
    </span>
  );
}

/**
 * @param line บรรทัดที่จอวาด (`mergedLines`) · @param editable โหมดแก้ · @param period ช่วงบริการบนจอ (ชิปจำนวนรอบ)
 * @param ctx บริบทบนจอ (`localSetupCtx`) · @param fgOptions `view.fgOptions`
 * @param zonesById / sitesById / registry / takenLines / liveTerms / zoneErrors / noSites — ส่งต่อให้ตารางโซน
 * @param highlightOf `(fieldId) => ข้อความ|null` — ช่องที่แดง (หลังกดเท่านั้น)
 * @param onLineChange `(patch, touchedFieldIds) => void` · @param onLineReplace `(draftLine, touchedFieldIds) => void`
 * @param onOpenBulk · @param canEditRounds / onRoundsSave ดินสอจำนวนรอบของใบที่ประทับแล้ว
 */
export default function ServiceLineSetupBlock({
  line, editable = false, period = null, ctx, fgOptions = [],
  zonesById, sitesById, registry, takenLines, liveTerms, zoneErrors, noSites = false,
  highlightOf = () => null, onLineChange, onLineReplace, onOpenBulk,
  canEditRounds = false, onRoundsSave,
}) {
  const [showKinds, setShowKinds] = useState(false);
  const fieldIds = useMemo(() => lineFieldIds(line), [line]);
  const pressed = fieldIds.some((id) => highlightOf(id));
  const kindError = highlightOf(lineFieldId(line.lineId, "kind"));
  const zonesError = highlightOf(lineFieldId(line.lineId, "zones"));

  /* "ไปแก้" ชี้ชนิด/โซนของบรรทัดพิมพ์เองที่ย่อเป็นแถบจางอยู่ = กางแผ่นเลือกชนิดก่อน */
  useEffect(() => {
    const onReveal = (event) => {
      const fieldId = event?.detail?.fieldId;
      if (fieldId === lineFieldId(line.lineId, "kind") || fieldId === lineFieldId(line.lineId, "zones")) setShowKinds(true);
    };
    window.addEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
  }, [line.lineId]);

  const category = line.categoryCode || null;
  const roleIsPackage = line.role === SERVICE_KIND_PACKAGE;

  /* ── FG หมวดอื่น: ไม่ต้องตั้งอะไร ── */
  if (!line.manual && !roleIsPackage) {
    return (
      <div className={`${styles.block} ${styles.muted}`}>
        <span>ไม่ใช่งานบริการรายรอบ{category ? ` · หมวด ${category}` : ""} — ไม่ต้องตั้ง</span>
      </div>
    );
  }

  /* ── โหมดอ่าน ── */
  if (!editable) {
    if (line.role === SERVICE_KIND_NOT_SERVICE) {
      return (
        <div className={`${styles.block} ${styles.muted}`}>
          <span>ชนิดรายการ: <b>{KIND_LABEL.not_service}</b> — ไม่ส่งให้ TS</span>
        </div>
      );
    }
    if (line.role === SERVICE_ROLE_UNSET) {
      return (
        <div className={`${styles.block} ${styles.muted}`}>
          <span>ยังไม่เลือกชนิดรายการ</span>
        </div>
      );
    }
    const fg = naText(line.fgCode || line.serviceFgCode);
    const rounds = positiveIntOrNull(line.rounds);
    return (
      <div className={styles.block}>
        <div className={styles.readHead}>
          <Repeat size={15} aria-hidden="true" className={styles.headIcon} />
          <span>แพ็คเกจ <b>{fg}</b> · <b>{rounds ? `${fmtNumber(rounds)} รอบ/โซน` : "ยังไม่ใส่รอบ"}</b></span>
          {canEditRounds ? <StampedRoundsEdit line={line} onRoundsSave={onRoundsSave} /> : null}
        </div>
        <ServiceZoneRows line={line} editable={false} zonesById={zonesById} sitesById={sitesById} registry={registry} />
      </div>
    );
  }

  /* ── โหมดแก้ ── */
  const derivedHint = line.roleSource === "category" && category ? `ตามหมวด ${category} ของรายการ` : null;
  const pickKind = (value) => {
    if (value === line.role) return;
    setShowKinds(true);   // เลือกแล้วแผ่นยังอยู่ให้เห็น (ไม่ยุบเป็นแถบจางใต้เคอร์เซอร์)
    const baseRole = line.baseKind || line.derivedRole || SERVICE_ROLE_UNSET;
    const kind = value === baseRole ? line.baseKind : (value === line.derivedRole ? null : value);
    const touched = [lineFieldId(line.lineId, "kind")];
    /* เปลี่ยนเป็น "ไม่ใช่งานบริการ" = ล้างแพ็คเกจ/รอบ/โซนของบรรทัดไปพร้อมกัน (RPC ตีกลับของค้างบนบรรทัดที่ไม่ใช่แพ็คเกจ)
       กลับเป็นแพ็คเกจ = คืนค่าที่บันทึกไว้ทั้งหมด (ร่างของบรรทัดเหลือแค่ชนิด) */
    if (value === SERVICE_KIND_NOT_SERVICE) {
      onLineReplace?.({ kind, serviceProductId: null, rounds: "", zones: [] }, [...touched, lineFieldId(line.lineId, "zones")]);
    } else {
      onLineReplace?.({ kind }, touched);
    }
  };

  const kindTiles = (
    <div className={styles.field} id={lineFieldId(line.lineId, "kind")}>
      <span className={styles.label}>ชนิดรายการ<span className={styles.req} aria-hidden="true">*</span></span>
      <OptionTiles
        value={line.role === SERVICE_ROLE_UNSET ? null : line.role}
        onChange={pickKind}
        options={SERVICE_KIND_OPTIONS}
        invalid={!!kindError}
        ariaLabel={`ชนิดรายการ รายการ ${line.lineNo}`}
      />
      {derivedHint ? <span className={styles.hint}>{derivedHint}</span> : null}
      {kindError ? <span className={styles.fieldError} role="alert">{kindError}</span> : null}
    </div>
  );

  /* พิมพ์เองที่ไม่ใช่งานบริการ — แถบจาง · กาง "เปลี่ยนชนิด" ได้ (กางเองเมื่อมีของค้างที่แผงแดงชี้) */
  if (line.role === SERVICE_KIND_NOT_SERVICE && !showKinds && !kindError && !zonesError) {
    return (
      <div className={`${styles.block} ${styles.muted}`} id={lineFieldId(line.lineId, "kind")}>
        <span>ชนิดรายการ: <b>{KIND_LABEL.not_service}</b> — ไม่ส่งให้ TS{derivedHint ? ` (${derivedHint})` : ""}</span>
        <span className={styles.grow} />
        <Button size="sm" variant="quiet" onClick={() => setShowKinds(true)}>เปลี่ยนชนิด</Button>
      </div>
    );
  }

  const missing = lineMissing(line);
  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <Repeat size={15} aria-hidden="true" className={styles.headIcon} />
        <span>งานบริการของรายการนี้</span>
        <span className={styles.grow} />
        <StatusTag missing={missing} pressed={pressed} />
      </div>

      {line.manual ? (
        <div className={styles.grid2}>
          {kindTiles}
          {roleIsPackage ? (
            <ServiceFgPicker
              lineId={line.lineId}
              lineNo={line.lineNo}
              value={line.serviceProductId}
              fgCode={line.serviceFgCode}
              options={fgOptions}
              error={highlightOf(lineFieldId(line.lineId, "fg"))}
              onChange={(productId) => onLineChange?.({ serviceProductId: productId }, [lineFieldId(line.lineId, "fg")])}
            />
          ) : null}
        </div>
      ) : (
        <span className={styles.auto}>
          <Package size={14} aria-hidden="true" className={styles.autoIcon} />
          แพ็คเกจบริการ · จากใบเสนอราคา (หมวด 02-001)
        </span>
      )}

      {/* ⚠️ id ของช่องโซน (`svc-line-<id>-zones`) อยู่ที่ข้อความนี้ — บรรทัดที่ไม่ใช่แพ็คเกจไม่มีตารางโซน
          ⇒ "ไปแก้" ของข้อ zones_on_not_service ต้องมีที่ให้เลื่อนไปถึง (ตารางโซนวาดเฉพาะแพ็คเกจ ⇒ id ไม่ชนกัน) */}
      {line.role === SERVICE_KIND_NOT_SERVICE && zonesError ? (
        <span className={styles.fieldError} role="alert" id={lineFieldId(line.lineId, "zones")} tabIndex={-1}>{zonesError}</span>
      ) : null}

      {roleIsPackage ? (
        <>
          <ServiceZoneRows
            line={line}
            editable
            zonesById={zonesById}
            sitesById={sitesById}
            registry={registry}
            takenLines={takenLines}
            liveTerms={liveTerms}
            highlightOf={highlightOf}
            zoneErrors={zoneErrors}
            noSites={noSites}
            onChange={(zones, touched) => onLineChange?.({ zones }, touched)}
            onOpenBulk={onOpenBulk}
          />
          <div className={styles.roundsRow}>
            <RoundsField
              line={line}
              period={period}
              error={highlightOf(lineFieldId(line.lineId, "rounds"))}
              onChange={(rounds) => onLineChange?.({ rounds }, [lineFieldId(line.lineId, "rounds")])}
            />
            <Derived line={line} ctx={ctx} />
          </div>
        </>
      ) : null}
    </div>
  );
}
