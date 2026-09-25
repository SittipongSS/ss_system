"use client";
// ── ขั้น ① ลูกค้าและสัญญา ───────────────────────────────────────────────────────────────
//
// ⭐ **มติเจ้าของ 25/09 — รื้อหน้าตาให้เหมือนหน้าสร้างใบเสนอราคา** (ม็อก https://claude.ai/artifact/Tu6RVhUfoQb9kTNooknhoH
//    บอร์ด Step1New · เจ้าของขอแก้ข้อเดียว: ลูกค้ากับ AE วางคู่กัน)
//   · หัวเอกสาร = `DetailOverview` ตัวเดียวกับหัวของหน้าสร้างใบเสนอราคา: ชื่อขั้น + ป้าย (ไม่นับ Actual · สถานะใบ) +
//     ช่องสรุป 4 ช่อง (ลูกค้า · AE · ช่วงสัญญา · ไฟล์ — `historicalContractFacts`) **แทนแถบสรุปข้างขวา** ที่ขั้นนี้ขึ้นขีดเกือบทุกแถว
//   · การ์ดตามเรื่อง (หัวการ์ด = ไอคอน + ชื่อ + คำอธิบายบรรทัดเดียว แบบ "ที่มาของใบเสนอราคา"):
//     ที่มาของใบ (ลูกค้า | AE · ทีม) → เอกสารแทนสัญญา → อ้างอิงเดิม → หมายเหตุ
//   · ชนิดเอกสาร = `ChoiceChips` แถวเดียว (ห้าตัวเลือกคงที่ — เห็นทั้งหมด กดครั้งเดียว) แทนไทล์สูงห้าใบ
//   · คำอธิบายใต้ทุกช่องถูกถอด — เหลือคำอธิบายบรรทัดเดียวต่อการ์ด + ตัวอย่างในช่อง · ใต้ช่องเหลือแต่ของที่ต้องรู้ตรงนั้น
//     (ข้อผิด/คำเตือน · จำนวนเดือน · เหตุที่ล็อก)
//   · ก้อนแดงขึ้นหลังกด "ถัดไป" เท่านั้น (`summary` จากผู้เรียก — `historicalVisibleIssues`) · กล่องฟ้า "ไม่นับ Actual" → ป้ายบนหัว
//   🚫 ถอด: ช่อง VAT (ย้ายลงกล่องสรุปท้ายตารางของขั้น ② — มติเจ้าของ 25/09)
//
// ลำดับช่องตาม docs/form-design-rules.md §1: ตัวกำหนดบริบทบนสุด (ลูกค้า → AE → ทีม) ·
// ช่องที่โผล่ตามเงื่อนไขอยู่ **ใต้** ตัวที่ทำให้มันโผล่ (ทีมอยู่ใต้ AE) ·
// ค่าที่ระบบรู้อยู่แล้วเป็นช่องเส้นประอ่านอย่างเดียว (AE ที่ล็อกเป็นตัวเอง · ลูกค้า/AE หลังบันทึกครั้งแรก)
//
// ⭐ **เอกสารแทนสัญญากรอกที่นี่** (มติ 22/09 ข้อ 3) — ระบบสร้างสัญญาแทนให้แล้วผูกกับใบเอง
//   ไม่มีขั้นออกสัญญาแยก · AE Sup อนุมัติสัญญาพร้อมใบในคลิกเดียว
// ⚠️ **ลูกค้า/AE ล็อกหลังบันทึกครั้งแรก** — ดีลภาชนะ เลขใบ และทีม/เจ้าของของเอกสารแทนสัญญา
//   ผูกกับคู่นี้ไปแล้ว (เหตุผลด้านข้อมูล · ข้อยกเว้นของกฎ "ฟอร์มแก้ = ฟอร์มสร้าง" ที่ commit คอมเมนต์ไว้)
//
// 🔴 **สามข้อที่ขั้นนี้เคยพังเงียบ (UAT 23/09) — อย่าถอยกลับ**
//   ① สลับลูกค้าแล้วล้างแค่โซน ทิ้งงวดที่คิดจากโซนชุดนั้นไว้ ⇒ ขั้น ③ ยอดไม่ตรงโดยไม่มีเหตุผล
//      ⇒ `historicalDownstreamReset` ตอบทั้ง "ถามว่าอะไรจะหาย" และ "ล้างอะไร" ที่เดียว
//   ② ช่องวันมี min/max ที่ **กลืนค่าที่พิมพ์** แล้วเด้งกลับตอนเบลอ ⇒ ขอบเหลือช่วงเอกสาร
//      (2000–2100) · กฎ "ไม่เกินวันนี้ / ไม่ก่อนวันเริ่ม" เป็นข้อความใต้ช่องจาก local issues (ขึ้นทันทีแม้ยังไม่กดถัดไป)
//   ③ ป้าย "N เดือน" เคยปัดเศษลง ⇒ ช่วงที่ไม่ลงตัวเป็นเดือนต้องบอกตรง ๆ (`contractSpan.note`)
import { useMemo } from "react";
import { Building2, CalendarDays, FileCheck2, Link2, Lock, NotebookText, Paperclip, UserRound } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import TeamPickerField from "@/components/ui/TeamPickerField";
import { salesTeamLabel, useSalesTeams } from "@/lib/master/salesTeamRegistry";
import { EXTERNAL_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS } from "@/lib/sales/contracts";
import { DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_APPROVER_LABEL, HISTORICAL_STATUS_NOTE } from "@/lib/sales/historicalOrders";
import {
  HISTORICAL_REF_MAX, REGISTRY_LOAD_FAILED, charLength, contractSpan, historicalContractFacts, historicalCoverageWarning,
  historicalDownstreamReset, historicalFieldAnchorId, historicalStepIssueNotice,
} from "@/lib/sales/historicalIntakeForm";
import { fmtNumber, naText } from "@/lib/format";
import CardHeading from "./CardHeading";
import styles from "./HistoricalOrderWizard.module.css";

/* ไอคอนของช่องสรุปบนหัว — ลำดับ/ป้ายมาจาก `historicalContractFacts` (แถวชุดเดียวกับแถบสรุป) */
const FACT_ICONS = { customer: Building2, owner: UserRound, span: CalendarDays, files: Paperclip };

/* 🚫 ช่อง VAT ย้ายไปกล่องสรุปท้ายตารางรายการของขั้น ② แล้ว (มติเจ้าของ 25/09 — "ควรหน้าตาเหมือนใบเสนอราคา")
   ใบเสนอราคาเลือก VAT ที่กล่องสรุปใต้ตาราง ⇒ ขั้นนี้เหลือ ลูกค้า · AE · เอกสารแทนสัญญา · อ้างอิงเดิม · หมายเหตุ */

/* อ้างอิงเดิม — คำอธิบายรายช่องถูกถอด (มติ 25/09) เหลือตัวอย่างในช่อง · คำอธิบายของทั้งก้อนอยู่หัวการ์ด */
const REF_FIELDS = [
  { key: "quote", label: "ใบเสนอราคาเดิม", placeholder: "เช่น QT-2567-015" },
  { key: "express", label: "เลขเอกสาร Express", placeholder: "เลขในโปรแกรม Express" },
  { key: "invoice", label: "ใบกำกับเดิม", placeholder: "เลขใบกำกับจากระบบเดิม" },
];

/* หัวการ์ด = `CardHeading` (ไฟล์ของตัวเอง — ขั้น ③ ใช้ด้วย · รูปเดียวกับ `.sectionHeading` ของหน้าสร้างใบเสนอราคา) */
export default function WizardContractStep({
  state, onChange, issues = [], summary = true, warnings = [], customerOptions = [], customersError = "",
  ownerOptions = [], lockedOwner = null,
  teamOptions = [], lockedTeam = null, contractFiles = [], onContractFiles, contractId = null,
  contractFilesVersion = 0, onContractPanelItems, busy = false, onOversize,
  facts = [], statusLabel = null,
}) {
  const teamRegistry = useSalesTeams();
  const has = (field) => issues.some((issue) => issue.field === field);
  /* ข้อความรายช่อง — ก้อนเดียวกับที่หัวขั้นลิสต์ไว้ แต่แปะไว้ **ใต้ช่องของมัน** ด้วย
     (สองช่องวันสัญญาเคยกลืนค่าเงียบ ๆ ⇒ เหตุผลต้องอยู่ตรงที่ผู้คีย์กำลังพิมพ์) */
  const noteOf = (field) => issues.find((issue) => issue.field === field)?.message || null;
  /* คำเตือนรายช่อง — ไม่บล็อกอะไร แต่ต้องอยู่ใต้ช่องเดียวกัน (error ชนะเสมอถ้ามีทั้งคู่) */
  const warnOf = (field) => warnings.find((issue) => issue.field === field)?.message || null;
  const patch = (next) => onChange(next);
  const setContract = (next) => onChange({ contract: { ...state.contract, ...next } });
  const locked = Boolean(state.orderId);
  const { months, monthsText, note: spanNote } = contractSpan(state.contract?.startDate, state.contract?.endDate);
  const coverageWarning = historicalCoverageWarning(state);
  const customerLabel = useMemo(
    () => customerOptions.find((option) => option.value === state.customerId)?.label || null,
    [customerOptions, state.customerId],
  );
  const overviewFacts = historicalContractFacts(facts).map((fact) => ({ ...fact, icon: FACT_ICONS[fact.key] }));
  const refTooLong = (value) => charLength(value) > HISTORICAL_REF_MAX;

  /* ⭐ ช่องต้นน้ำเปลี่ยน = ล้างของปลายน้ำ **เป็นชุดเดียว** และถามก่อนเมื่อมีของจะหาย
     (ของเดิมล้างแค่โซน แล้วทิ้งงวดที่คิดจากโซนชุดนั้นไว้ — ดูหัว `historicalDownstreamReset`)
     ⚠️ ตัวตัดสินตัวเดียวตอบทั้ง "ถามว่าอะไรจะหาย" และ "ล้างอะไรจริง" ⇒ สองฝั่งไม่มีทางเพี้ยนกัน */
  const changeUpstream = async (field, next) => {
    const reset = historicalDownstreamReset(state, field);
    if (reset.ask) {
      const go = await confirmAction({
        title: reset.title,
        description: reset.description,
        detail: reset.detail,
        confirmLabel: reset.confirmLabel,
        tone: "danger",
      });
      if (!go) return;
    }
    patch({ ...next, ...reset.patch });
  };

  return (
    <div className={styles.cardStack}>
      {/* หัวเอกสาร = หัวของหน้าสร้างใบเสนอราคา (`DetailOverview`) — ช่องสรุป 4 ช่องแทนแถบสรุปข้างขวา
          ป้าย "ไม่นับ Actual" แทนกล่องฟ้าท้ายฟอร์มเดิม (ข้อความเต็มอยู่ใน title ของป้าย) */}
      {/* 🔴 `pin={false}`: แถบหัวลอยของเปลือกมีปุ่ม "กลับ" (history.back) ที่ **ข้ามยาม useUnsavedChanges** — ในฟอร์มคีย์ใบ
          กดแล้วของที่คีย์ไว้ทั้งใบหายโดยไม่ถาม (รีวิว 25/09) · หัว Workspace บอกอยู่แล้วว่าอยู่ฟอร์มไหน */}
      <DetailOverview
        pin={false}
        eyebrow="SO ย้อนหลัง · งานบริการ · ขั้น 1/4"
        title="ลูกค้าและสัญญา"
        description="ใครคือลูกค้า ใครดูแล และเอกสารอะไรที่ลูกค้าตกลงไว้ก่อนเข้าระบบ"
        badges={(
          <>
            <span title={`${HISTORICAL_STATUS_NOTE} — ยอดออกบิลผ่านระบบเดิมไปแล้ว ใบนี้มีไว้ให้งานบริการเดินต่อในระบบ`}>
              <DetailStateBadge label="ไม่นับ Actual / FC / เป้า" color="var(--blue)" />
            </span>
            <DetailStateBadge label={statusLabel} color="var(--accent)" />
          </>
        )}
        facts={overviewFacts}
      />

      {summary && issues.length > 0 && (
        /* ⭐ ก้อนเดียวบอกทุกช่องที่ขาด — ขึ้นหลังกด "ถัดไป" เท่านั้น (มติ 25/09 · ผู้เรียกตัดสินผ่าน `summary`)
           ข้อความมาจากตัวตัดสินตัวเดียวกับ server — ห้ามตั้งคำใหม่ที่นี่ */
        <StatusNotice tone="error" title={historicalStepIssueNotice(issues.length).title} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
          <p className={styles.hint}>{historicalStepIssueNotice(issues.length).note}</p>
        </StatusNotice>
      )}

      <section className={styles.card} aria-labelledby="hist-card-source">
        <CardHeading icon={Building2} title={<span id="hist-card-source">ที่มาของใบ</span>} note="ลูกค้าคู่กับ AE — ลูกค้าเดียวกันคนละ AE = คนละดีล" />
        <div className={styles.grid2}>
          <div className={styles.field} id={historicalFieldAnchorId("customerId")}>
            <span>ลูกค้า <b className={styles.req}>*</b></span>
            {locked ? (
              /* 🐞 รีวิว R9: โหมดแก้ใบที่ทะเบียนลูกค้าโหลดไม่ขึ้น เคยขึ้นขีด ⇒ อ่านเหมือนใบนี้
                 เสียลูกค้าไปแล้ว · ของที่หายคือ "ชื่อ" ไม่ใช่ "ลูกค้า" ⇒ บอกตรง ๆ แล้วโชว์รหัสที่มี */
              <p className={styles.derived}>
                {customerLabel || (customersError ? `โหลดชื่อลูกค้าไม่ขึ้น · ${state.customerId}` : naText(customerLabel))}
              </p>
            ) : (
              <SearchableSelect
                entity="customer"
                ariaLabel="ลูกค้าของใบสั่งขายย้อนหลัง"
                options={customerOptions}
                value={state.customerId}
                onChange={(value) => changeUpstream("customer", { customerId: value })}
                disabled={busy}
                placeholder="เลือกลูกค้า"
                searchPlaceholder="ค้นหารหัส AR หรือชื่อลูกค้า"
                emptyText={customersError ? REGISTRY_LOAD_FAILED : undefined}
              />
            )}
            {noteOf("customerId") ? <small data-bad="yes">{noteOf("customerId")}</small> : null}
          </div>

          <div className={styles.field} id={historicalFieldAnchorId("ownerId")}>
            <span>AE ผู้ดูแล <b className={styles.req}>*</b></span>
            {/* ล็อกดีกว่าซ่อน — AE/Senior AE ต้องเห็นว่าใบไปอยู่กับใคร (form-design-rules §2) */}
            {lockedOwner || locked ? (
              <p className={styles.derived}>
                {naText(lockedOwner?.name || ownerOptions.find((o) => o.value === state.ownerId)?.label)}
                {lockedOwner ? <span className={styles.muted}>(ตัวเอง)</span> : null}
              </p>
            ) : (
              <SearchableSelect
                ariaLabel="AE ผู้ดูแลของใบสั่งขายย้อนหลัง"
                options={ownerOptions}
                value={state.ownerId}
                onChange={(value) => patch({ ownerId: value, team: "" })}
                disabled={busy}
                placeholder="เลือก AE"
                searchPlaceholder="ค้นหาชื่อ AE"
              />
            )}
            {noteOf("ownerId") ? <small data-bad="yes">{noteOf("ownerId")}</small> : null}
          </div>
        </div>

        {/* ช่องทีมโผล่เฉพาะตอน **มีคำตอบให้เลือกจริง** (ตัวเลือกตั้งแต่ 2 — ตัวห่อกลางคืน null เมื่อน้อยกว่า)
            🪤 AE อยู่หลายทีมแต่ผู้คีย์ดูแลร่วมทีมเดียว = ไม่มีอะไรให้เลือก แต่ **ห้ามเงียบ**:
            ฟอร์มเติมทีมนั้นให้แล้ว (lockedTeam) และช่องล็อกคือที่ที่ผู้คีย์เห็นว่าใบเข้าทีมไหน
            — ไม่ส่งทีมขึ้นไป server จะถอยไปทีมหลักของ AE ซึ่งอาจเป็นทีมที่ผู้คีย์ไม่ได้ดูแล */}
        {/* จุดยึดคลุมทั้งสองรูป (ช่องล็อก / ช่องเลือก) — ปุ่มที่ติดด่านพาไปที่ id เดียวเสมอ */}
        {/* 🐞 UAT 25/09: กล่องจุดยึดที่ว่าง (ตัวเลือก < 2 = TeamPickerField คืน null) กินช่องว่างหนึ่งช่วงในการ์ด
            ⇒ วาดกล่องเฉพาะตอนมีของให้เห็นจริง — เงื่อนไขเดียวกับที่ TeamPickerField ใช้ (ตัวเลือกตั้งแต่ 2) หรือทีมที่ล็อกให้ */}
        {lockedTeam || teamOptions.length >= 2 ? (
          <div id={historicalFieldAnchorId("team")}>
            {lockedTeam ? (
              <div className={styles.field}>
                <span>ทีมของดีลใบนี้</span>
                <p className={styles.derived}>{salesTeamLabel(teamRegistry, lockedTeam)}</p>
                <small>AE คนนี้อยู่หลายทีม แต่คุณกับเขาดูแลร่วมกันทีมเดียว — ดีลของใบนี้เข้าทีมนี้</small>
              </div>
            ) : (
              <TeamPickerField
                teams={teamOptions}
                value={state.team}
                onChange={(value) => patch({ team: value })}
                disabled={busy || locked}
                label="ทีมของดีลใบนี้"
                hint="AE คนนี้อยู่หลายทีม — เลือกทีมที่ดีลของใบย้อนหลังใบนี้เข้า"
                className={styles.field}
              />
            )}
          </div>
        ) : null}

        {/* เหตุที่ล็อก — บรรทัดเดียวของทั้งการ์ด (เดิมเป็นคำอธิบายยาวใต้ทั้งสองช่อง) */}
        <p className={styles.lockLine}>
          <Lock size={12} aria-hidden="true" />
          {locked
            ? "ล็อกแล้ว — ดีลและเอกสารแทนสัญญาผูกกับคู่ลูกค้า × AE นี้ (คีย์ผิดลูกค้าทั้งใบให้ยกเลิกใบแล้วคีย์ใหม่)"
            : (lockedOwner
              ? "คุณคีย์ได้เฉพาะใบของตัวเอง · ลูกค้าล็อกหลังบันทึกครั้งแรก"
              : "ลูกค้าและ AE ล็อกหลังบันทึกครั้งแรก")}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="hist-card-contract">
        <CardHeading
          icon={FileCheck2}
          title={<span id="hist-card-contract">เอกสารแทนสัญญา</span>}
          note={`เอกสารที่ลูกค้าตกลงไว้ก่อนเข้าระบบ — ระบบออกสัญญาแทนให้ตอน${HISTORICAL_APPROVER_LABEL}อนุมัติ`}
        />
        <div className={styles.field} id={historicalFieldAnchorId("contract.docKind")}>
          <span>ชนิดเอกสาร <b className={styles.req}>*</b></span>
          {/* ⭐ ห้าตัวเลือกคงที่ = ชิปแถวเดียว (form-design-rules: ชุดสั้น เห็นครบแล้วจิ้ม) · ไม่มีค่าตั้งต้น */}
          <ChoiceChips
            ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"
            options={EXTERNAL_DOC_KINDS.map((kind) => ({ value: kind, label: EXTERNAL_DOC_KIND_LABELS[kind] || kind }))}
            value={state.contract?.docKind || null}
            onChange={(value) => setContract({ docKind: value })}
            /* แก้ได้ในโหมดแก้ใบด้วย (รีวิว 25/09) — RPC แก้ใบเขียน externalDocKind ใหม่ให้ · ที่ล็อกหลังบันทึกคือลูกค้า × AE เท่านั้น */
            disabled={busy}
          />
          {noteOf("contract.docKind") ? <small data-bad="yes">{noteOf("contract.docKind")}</small> : null}
        </div>

        <div className={styles.grid3}>
          <div className={styles.field} id={historicalFieldAnchorId("contract.ref")}>
            <span>เลขที่เอกสาร</span>
            <Input
              mono
              autoComplete="off"
              value={state.contract?.ref || ""}
              invalid={has("contract.ref") || refTooLong(state.contract?.ref)}
              disabled={busy}
              placeholder="ไม่บังคับ"
              onChange={(event) => setContract({ ref: event.target.value })}
              aria-label="เลขที่เอกสารแทนสัญญา"
            />
            {noteOf("contract.ref") || refTooLong(state.contract?.ref) ? (
              <small data-bad="yes">{noteOf("contract.ref") || `ยาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษร`}</small>
            ) : null}
          </div>
          {/* 🐞 ขอบของช่องวันเคย **กลืนค่าที่พิมพ์** — `DateInput` ไม่เรียก onChange เมื่อค่าหลุด
              min/max แล้วเด้งกลับค่าเดิมตอนเบลอ โดยไม่มีข้อความสักบรรทัด (UAT 23/09)
              ⇒ ขอบเหลือแค่ช่วงเอกสารที่ระบบรองรับ (2000–2100) · กฎ "ไม่เกินวันนี้ / ไม่ก่อนวันเริ่ม"
                ย้ายไปเป็น **ข้อความใต้ช่อง** จากตัวตัดสินตัวเดียวกับที่ server ตีกลับ (ขึ้นทันที — ข้อ `live: true` ของ historicalContractDateIssues) */}
          <div className={styles.field} id={historicalFieldAnchorId("contract.startDate")}>
            <span>วันเริ่มสัญญา <b className={styles.req}>*</b></span>
            <DateInput
              value={state.contract?.startDate || ""}
              onChange={(value) => setContract({ startDate: value })}
              min={DOC_DATE_MIN}
              max={DOC_DATE_MAX}
              disabled={busy}
              ariaLabel="วันเริ่มสัญญา"
            />
            {noteOf("contract.startDate") ? <small data-bad="yes">{noteOf("contract.startDate")}</small> : null}
          </div>
          <div className={styles.field} id={historicalFieldAnchorId("contract.endDate")}>
            <span>วันสิ้นสุด <b className={styles.req}>*</b></span>
            <DateInput
              value={state.contract?.endDate || ""}
              onChange={(value) => setContract({ endDate: value })}
              min={DOC_DATE_MIN}
              max={DOC_DATE_MAX}
              disabled={busy}
              ariaLabel="วันสิ้นสุดสัญญา"
            />
            {/* ⚠️ "N เดือน" ขึ้นเฉพาะช่วงที่ลงตัวเป็นเดือนจริง ๆ — ช่วงที่ไม่ลงตัวบอกไปตรง ๆ
                ว่าแบ่งงวดอัตโนมัติไม่ได้ ไม่ใช่ปัดเศษเดือนแล้วเสนอยอดผิด
                🔴 มติข้อ 9 มีสองหน้า: ใบใหม่ที่สัญญาสิ้นสุดไปแล้ว = ด่าน · ใบที่คีย์ค้างไว้แล้ว
                สิ้นสุดระหว่างทาง = **คำเตือน** (ฝั่ง server คือ `ctx.editing`) */}
            {noteOf("contract.endDate") || warnOf("contract.endDate") ? (
              <small data-bad={noteOf("contract.endDate") ? "yes" : undefined}>
                {noteOf("contract.endDate") || warnOf("contract.endDate")}
              </small>
            ) : (months ? (
              /* มติเจ้าของ 25/09 ข้อ 3: สัญญาที่จบตรงวันครบรอบนับเป็น n เดือน (งวดสุดท้ายยาวขึ้นหนึ่งวัน) */
              <span className={styles.monthsChip}>{monthsText}</span>
            ) : (spanNote ? <small>{spanNote}</small> : null))}
          </div>
        </div>

        {warnings.length > 0 && (
          <StatusNotice tone="warning" title={`ขั้นนี้มีคำเตือน ${warnings.length} ข้อ — ไม่บล็อกการบันทึก`} className={styles.notice}>
            <ul className={styles.warnList}>
              {warnings.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
            </ul>
          </StatusNotice>
        )}

        {/* วันสัญญาไม่ล้างงวดให้เอง (พิมพ์ทีละตัว = ถามไม่ได้) ⇒ บอกว่าต้องกลับไปตรวจอะไร */}
        {coverageWarning ? (
          <StatusNotice tone="warning" title="งวดชำระในขั้น ③ ผูกกับช่วงสัญญานี้" className={styles.notice}>
            {coverageWarning}
          </StatusNotice>
        ) : null}

        {/* 🐞 UAT 23/09: ช่องนี้เป็นตัวบล็อก "ถัดไป" บ่อยที่สุด แต่ตะกร้าไฟล์ **หน้าตาเหมือนช่องไม่บังคับ**
            (ไม่มีกรอบผิด ไม่มีข้อความใต้ช่อง) และปุ่มก็ไม่พาไปไหน ⇒ ติดด่านต้องเห็นได้จากตัวช่องเอง */}
        <div className={styles.field} id={historicalFieldAnchorId("contract.file")}>
          <span>ไฟล์เอกสาร <b className={styles.req}>*</b></span>
          {contractId ? (
            /* หลังใบเกิดแล้ว ไฟล์อยู่บนเซิร์ฟเวอร์จริง ⇒ แผงไฟล์แนบ (ลบ/พรีวิว/ประวัติ) ไม่ใช่ตะกร้าในเครื่อง
               🔴 **สองข้อที่ขาดไปแล้วกลายเป็นทางตันถาวร** (รีวิว R6):
                 ① `docTypes` ชุดเดียว = แผงทั้งอัปและกรองด้วย `external_doc` — ชนิดเดียวที่ RPC
                    ส่งอนุมัติของ 0374 ยอมรับ · ไม่แคบไว้ = แผงอัปเป็น `signed_contract` (ตัวแรกของ
                    ทะเบียน contract) โดยไม่มีตัวเลือกให้เห็น ⇒ ไฟล์อยู่ตรงหน้าแต่ RPC ตีกลับ
                    `historical_so_contract_file_missing` ตลอดกาล
                 ② `onItemsChange` = ตัวนับของฟอร์มเดินตามของจริง ทั้งตอนแนบและตอนลบ
               ⚠️ `key` บังคับให้แผงอ่านรายการใหม่หลังฟอร์มอัปไฟล์เอง (แผงโหลดตอน mount เท่านั้น) */
            <AttachmentsPanel
              key={`contract-files-${contractFilesVersion}`}
              entityType="contract"
              entityId={contractId}
              canEdit={!busy}
              inlineUpload
              docTypes={[{ key: EXTERNAL_DOC_TYPE, label: "เอกสารที่ใช้แทนสัญญา" }]}
              onItemsChange={onContractPanelItems}
              title="ไฟล์เอกสารแทนสัญญา"
              note={`${HISTORICAL_APPROVER_LABEL}อนุมัติจากไฟล์ที่อยู่ในนี้ — ส่งอนุมัติแล้วไฟล์ถูกตรึง (ดึงกลับก่อนจึงแก้ได้)`}
            />
          ) : (
            <PendingFiles
              files={contractFiles}
              onChange={onContractFiles}
              disabled={busy}
              invalid={has("contract.file")}
              onOversize={onOversize}
              label="แนบไฟล์"
              hint={`ลากมาวาง หรือ Ctrl+V ได้ · อัปขึ้นตอนกดบันทึก · ${HISTORICAL_APPROVER_LABEL}อนุมัติจากไฟล์นี้`}
            />
          )}
          {noteOf("contract.file") ? <small data-bad="yes">{noteOf("contract.file")}</small> : null}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="hist-card-refs" id={historicalFieldAnchorId("refs")}>
        <CardHeading
          icon={Link2}
          title={<span id="hist-card-refs">อ้างอิงเดิม</span>}
          note={`ไม่บังคับ — ใช้ค้นหาและเตือนใบซ้ำ ไม่ผูกกับทะเบียน · ช่องละไม่เกิน ${HISTORICAL_REF_MAX} ตัวอักษร`}
        />
        <div className={styles.grid3}>
          {REF_FIELDS.map(({ key, label, placeholder }) => {
            const value = state.refs?.[key] || "";
            const bad = noteOf(`refs.${key}`) || (refTooLong(value) ? `ยาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษร` : null);
            return (
              <div key={key} className={styles.field}>
                <span>{label}</span>
                <Input
                  mono
                  autoComplete="off"
                  value={value}
                  invalid={Boolean(bad)}
                  disabled={busy}
                  placeholder={placeholder}
                  onChange={(event) => patch({ refs: { ...state.refs, [key]: event.target.value } })}
                  aria-label={label}
                />
                {bad ? <small data-bad="yes">{bad}</small> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="hist-card-notes" id={historicalFieldAnchorId("notes")}>
        <CardHeading icon={NotebookText} title={<span id="hist-card-notes">หมายเหตุ</span>} note="บังคับเมื่อยอดใบเป็น 0 บาท" />
        <Textarea
          value={state.notes}
          invalid={has("notes")}
          disabled={busy}
          placeholder="เช่น เงื่อนไขเก็บเงินเดิม"
          onChange={(event) => patch({ notes: event.target.value })}
          aria-label="หมายเหตุของใบ"
        />
        {noteOf("notes") ? <small className={styles.cellBad}>{noteOf("notes")}</small> : null}
      </section>
    </div>
  );
}
