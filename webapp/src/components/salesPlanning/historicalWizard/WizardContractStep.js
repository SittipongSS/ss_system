"use client";
// ── ขั้น ① ลูกค้าและสัญญา (ม็อก Step1) ────────────────────────────────────────────
//
// ลำดับช่องตาม docs/form-design-rules.md §1: ตัวกำหนดบริบทบนสุด (ลูกค้า → AE → ทีม) ·
// ช่องที่โผล่ตามเงื่อนไขอยู่ **ใต้** ตัวที่ทำให้มันโผล่ (ทีมอยู่ใต้ AE) ·
// ค่าที่ระบบรู้อยู่แล้วเป็นช่องเส้นประอ่านอย่างเดียว (AE ที่ล็อกเป็นตัวเอง · จำนวนเดือนของสัญญา)
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
//      (2000–2100) · กฎ "ไม่เกินวันนี้ / ไม่ก่อนวันเริ่ม" เป็นข้อความใต้ช่องจาก local issues
//   ③ ป้าย "N เดือน" เคยปัดเศษลง ⇒ ช่วงที่ไม่ลงตัวเป็นเดือนต้องบอกตรง ๆ (`contractSpan.note`)
import { useMemo } from "react";
import { FileText } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import FormZone from "@/components/ui/FormZone";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import OptionTiles from "@/components/ui/OptionTiles";
import PendingFiles from "@/components/ui/PendingFiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import TeamPickerField from "@/components/ui/TeamPickerField";
import { salesTeamLabel, useSalesTeams } from "@/lib/master/salesTeamRegistry";
import { EXTERNAL_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS } from "@/lib/sales/contracts";
import { DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_STATUS_NOTE } from "@/lib/sales/historicalOrders";
import {
  HISTORICAL_REF_MAX, REGISTRY_LOAD_FAILED, charLength, contractSpan, historicalCoverageWarning,
  historicalDownstreamReset, historicalFieldAnchorId, historicalStepIssueNotice,
} from "@/lib/sales/historicalIntakeForm";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./HistoricalOrderWizard.module.css";

/* คำอธิบายใต้ชื่อชนิดเอกสาร — ป้ายมาจากทะเบียนสัญญา (EXTERNAL_DOC_KIND_LABELS) ที่เดียว */
const DOC_KIND_HINTS = {
  customer_po: "ใบสั่งซื้อที่ลูกค้าออกให้",
  email: "อีเมลตอบรับราคาและขอบเขต",
  paper_contract: "สัญญากระดาษก่อนเข้าระบบ",
  signed_quotation: "ใบเดิมที่มีลายเซ็นลูกค้า",
  other: "เอกสารอื่นที่ใช้ยืนยันข้อตกลง",
};

/* VAT สามแผ่น — หนึ่งคำถามหนึ่งคำตอบ (ม็อกมีสองแถว แต่ "ไม่มี VAT" ทำให้แถวอัตราไม่มีความหมาย)
   ⚠️ ไม่มีค่าตั้งต้น (form-design-rules §2) · ค่าที่ส่งขึ้น API เป็นคู่ (vatRate, amountsIncludeVat) */
const VAT_TILES = [
  { value: "net7", label: "ราคาไม่รวม VAT", description: "บวก VAT 7% ท้ายใบ" },
  { value: "gross7", label: "ราคารวม VAT แล้ว", description: "ถอด VAT 7% ออกจากราคา" },
  { value: "none", label: "ไม่มี VAT", description: "ไม่คิดภาษี" },
];
const vatTileOf = (state) => {
  if (state.vatRate === 0) return "none";
  if (state.vatRate === 7) return state.amountsIncludeVat === true ? "gross7" : (state.amountsIncludeVat === false ? "net7" : null);
  return null;
};
const VAT_TILE_VALUES = {
  net7: { vatRate: 7, amountsIncludeVat: false },
  gross7: { vatRate: 7, amountsIncludeVat: true },
  none: { vatRate: 0, amountsIncludeVat: false },
};

const REF_FIELDS = [
  { key: "quote", label: "ใบเสนอราคาเดิม", hint: "ข้อความอ้างอิง — ไม่ผูกกับทะเบียนใบเสนอราคา" },
  { key: "express", label: "เลขเอกสาร Express", hint: "เลขเอกสารในโปรแกรม Express · เว้นว่างได้" },
  { key: "invoice", label: "ใบกำกับเดิม", hint: "เลขใบกำกับที่ออกในระบบเดิม" },
];

export default function WizardContractStep({
  state, onChange, issues = [], warnings = [], customerOptions = [], customersError = "",
  ownerOptions = [], lockedOwner = null,
  teamOptions = [], lockedTeam = null, contractFiles = [], onContractFiles, contractId = null,
  contractFilesVersion = 0, onContractPanelItems, busy = false, onOversize,
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
  const { months, note: spanNote } = contractSpan(state.contract?.startDate, state.contract?.endDate);
  const coverageWarning = historicalCoverageWarning(state);
  const customerLabel = useMemo(
    () => customerOptions.find((option) => option.value === state.customerId)?.label || null,
    [customerOptions, state.customerId],
  );

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
    <>
      {issues.length > 0 && (
        /* ⭐ ก้อนเดียวบอกทุกช่องที่ขาด ไม่ใช่ให้กดแล้วเจอทีละช่อง (form-design-rules §2)
           ข้อความมาจากตัวตัดสินตัวเดียวกับ server — ห้ามตั้งคำใหม่ที่นี่
           🐞 UAT 23/09: หัวก้อนเคยเขียน "ยังกรอกไม่ครบ 3 ข้อ" บนฟอร์มเปล่าที่มีช่องดาวแดงว่างอยู่
              อีกราว 7 ช่อง (ช่องพวกนั้นเป็นหน้าที่ของพรีวิว) ⇒ ตัวเลขอ่านเป็นคำสัญญาที่ผิด */
        <StatusNotice tone="error" title={historicalStepIssueNotice(issues.length).title} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
          <p className={styles.hint}>{historicalStepIssueNotice(issues.length).note}</p>
        </StatusNotice>
      )}

      <div className={styles.grid2}>
        <div className={styles.field} id={historicalFieldAnchorId("customerId")}>
          <span>ลูกค้า <b className={styles.req}>*</b></span>
          {locked ? (
            /* 🐞 รีวิว R9: โหมดแก้ใบที่ทะเบียนลูกค้าโหลดไม่ขึ้น เคยขึ้นขีด ⇒ อ่านเหมือนใบนี้
               เสียลูกค้าไปแล้ว · ของที่หายคือ "ชื่อ" ไม่ใช่ "ลูกค้า" ⇒ บอกตรง ๆ แล้วโชว์รหัสที่ใบถืออยู่ */
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
          <small>
            {locked
              ? "ล็อกหลังบันทึกครั้งแรก — ดีลและเอกสารแทนสัญญาผูกกับคู่ลูกค้า × AE นี้แล้ว (คีย์ผิดคู่ = ลบใบแล้วคีย์ใหม่)"
              : "ต้องมีในทะเบียนลูกค้าและอนุมัติแล้ว · โซนที่เลือกได้ในขั้นถัดไปมาจากทะเบียนไซต์ของลูกค้ารายนี้"}
          </small>
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
          <small>
            {lockedOwner
              ? "AE / Senior AE คีย์ใบย้อนหลังของตัวเองเท่านั้น — ใบของคนอื่นให้ AC ของทีมหรือ AE Sup คีย์"
              : "ผู้คีย์และผู้ดูแลใบหลังบันทึก · ลูกค้าเดียวกันคนละ AE = คนละดีล"}
          </small>
        </div>
      </div>

      {/* ช่องทีมโผล่เฉพาะตอน **มีคำตอบให้เลือกจริง** (ตัวเลือกตั้งแต่ 2 — ตัวห่อกลางคืน null เอง)
          🪤 AE อยู่หลายทีมแต่ผู้คีย์ดูแลร่วมทีมเดียว = ไม่มีอะไรให้เลือก แต่ **ห้ามเงียบ**:
          ฟอร์มเติมทีมนั้นให้แล้ว (lockedTeam) และช่องล็อกคือที่ที่ผู้คีย์เห็นว่าใบเข้าทีมไหน
          — ไม่ส่งทีมขึ้นไป server จะถอยไปทีมหลักของ AE ซึ่งอาจเป็นทีมที่ผู้คีย์ไม่ได้ดูแล */}
      {/* จุดยึดคลุมทั้งสองรูป (ช่องล็อก / ช่องเลือก) — ปุ่มที่ติดด่านพาไปที่ id เดียวเสมอ */}
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

      <FormZone title="เอกสารแทนสัญญา" note="ใช้เอกสารที่ลูกค้าตกลงไว้ก่อนเข้าระบบ — ระบบสร้างสัญญาแทนและอนุมัติพร้อมใบนี้" />

      <div className={styles.field}>
        <span>ชนิดเอกสาร <b className={styles.req}>*</b></span>
        <OptionTiles
          ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"
          options={EXTERNAL_DOC_KINDS.map((kind) => ({
            value: kind,
            label: EXTERNAL_DOC_KIND_LABELS[kind] || kind,
            description: DOC_KIND_HINTS[kind] || null,
          }))}
          value={state.contract?.docKind || null}
          onChange={(value) => setContract({ docKind: value })}
          disabled={busy || locked}
        />
        <small>ไม่มีค่าตั้งต้น · ชนิดที่เลือกขึ้นบนสัญญาแทนและในโมดัลอนุมัติของ AE Sup</small>
      </div>

      <div className={styles.grid3}>
        <div className={styles.field} id={historicalFieldAnchorId("contract.ref")}>
          <span>เลขที่เอกสาร</span>
          <Input
            mono
            autoComplete="off"
            value={state.contract?.ref || ""}
            invalid={has("contract.ref")}
            disabled={busy}
            onChange={(event) => setContract({ ref: event.target.value })}
            aria-label="เลขที่เอกสารแทนสัญญา"
          />
          <small>
            เว้นว่างได้ · ≤{HISTORICAL_REF_MAX} ตัวอักษร
            {charLength(state.contract?.ref) > HISTORICAL_REF_MAX ? ` — ยาวเกินแล้ว` : ""}
          </small>
        </div>
        {/* 🐞 ขอบของช่องวันเคย **กลืนค่าที่พิมพ์** — `DateInput` ไม่เรียก onChange เมื่อค่าหลุด
            min/max แล้วเด้งกลับค่าเดิมตอนเบลอ โดยไม่มีข้อความสักบรรทัด (UAT 23/09)
            ⇒ ขอบเหลือแค่ช่วงเอกสารที่ระบบรองรับ (2000–2100) · กฎ "ไม่เกินวันนี้ / ไม่ก่อนวันเริ่ม"
              ย้ายไปเป็น **ข้อความใต้ช่อง** จากตัวตัดสินตัวเดียวกับที่ server ตีกลับ */}
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
          <small data-bad={noteOf("contract.startDate") ? "yes" : undefined}>
            {noteOf("contract.startDate")
              || "ต้องไม่เกินวันนี้ — ใบย้อนหลังคือสัญญาที่เริ่มไปแล้ว · วันที่ใบ = วันนี้เอง"}
          </small>
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
              ว่าปุ่มลัดยอดโซนใช้ไม่ได้ ไม่ใช่ปัดเศษเดือนแล้วเสนอยอดผิด */}
          {/* 🔴 มติข้อ 9 มีสองหน้า: ใบใหม่ที่สัญญาสิ้นสุดไปแล้ว = ด่าน · ใบที่คีย์ค้างไว้แล้ว
              สิ้นสุดระหว่างทาง = **คำเตือน** (ฝั่ง server คือ `ctx.editing`) — กระจกที่ลืมข้อนี้
              ทำให้ใบที่ถูกตีกลับหลังสัญญาหมดอายุ แก้และส่งใหม่ไม่ได้อีกเลย */}
          <small data-bad={noteOf("contract.endDate") ? "yes" : undefined}>
            {noteOf("contract.endDate")
              || warnOf("contract.endDate")
              || (months ? `${fmtNumber(months)} เดือน` : null)
              || spanNote
              || "ต้องไม่ก่อนวันเริ่ม · งานที่สิ้นสุดไปแล้วยังไม่รับเข้าระบบ"}
          </small>
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
          /* หลังใบเกิดแล้ว ไฟล์อยู่บนเซิร์ฟเวอร์จริง ⇒ แผงไฟล์แนบ (ลบ/พรีวิว/ประวัติ) ไม่ใช่ตะกร้ารอ
             🔴 **สองข้อที่ขาดไปแล้วกลายเป็นทางตันถาวร** (รีวิว R6):
               ① `docTypes` ชุดเดียว = แผงทั้งอัปและกรองด้วย `external_doc` — ชนิดเดียวที่ RPC
                  ส่งอนุมัติของ 0374 ยอมรับ · ไม่แคบไว้ = แผงอัปเป็น `signed_contract` (ตัวแรกของ
                  ทะเบียน contract) โดยไม่มีตัวเลือกให้เห็น ⇒ ไฟล์อยู่ตรงหน้าแต่ RPC ตีกลับ
                  `historical_so_contract_file_missing` ตลอดกาล และมันคือชนิด "สัญญาที่ลงนามแล้ว"
                  ของสัญญาที่ไม่มีสัญญาระบบให้ลงนาม
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
            note="AE Sup อนุมัติจากไฟล์ที่อยู่ในนี้ — ส่งอนุมัติแล้วไฟล์ถูกตรึง (ดึงกลับก่อนจึงเปลี่ยนได้)"
          />
        ) : (
          <PendingFiles
            files={contractFiles}
            onChange={onContractFiles}
            disabled={busy}
            invalid={has("contract.file")}
            onOversize={onOversize}
            label="แนบไฟล์เอกสารแทนสัญญา"
          />
        )}
        <small data-bad={has("contract.file") ? "yes" : undefined}>
          {noteOf("contract.file")
            || (contractId
              ? "ไฟล์อยู่กับเอกสารแทนสัญญาแล้ว — แนบหรือลบที่แผงนี้ได้เลย ด่านของฟอร์มนับตามของจริงในแผง"
              : "อัปหลังกดบันทึก — ระบบสร้างเอกสารแทนสัญญาก่อน แล้วแนบไฟล์ให้ในจังหวะเดียวกัน")}
        </small>
      </div>

      <FormZone title="อ้างอิงเดิม" note={`ไม่บังคับ · ≤${HISTORICAL_REF_MAX} ตัวอักษร — ค้นหาได้และใช้เตือนใบซ้ำ`} />
      <div className={styles.grid3}>
        {REF_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className={styles.field}>
            <span>{label}</span>
            <Input
              mono
              autoComplete="off"
              value={state.refs?.[key] || ""}
              invalid={has(`refs.${key}`)}
              disabled={busy}
              onChange={(event) => patch({ refs: { ...state.refs, [key]: event.target.value } })}
              aria-label={label}
            />
            <small>{hint}</small>
          </div>
        ))}
      </div>

      <FormZone title="ราคาและภาษี" note="ใช้กับยอดทุกโซนในขั้นถัดไป" />
      <div className={styles.field} id={historicalFieldAnchorId("vatRate")}>
        <span>ยอดที่กรอก <b className={styles.req}>*</b></span>
        <OptionTiles
          ariaLabel="ยอดที่กรอกรวม VAT แล้วหรือยัง"
          options={VAT_TILES}
          value={vatTileOf(state)}
          onChange={(value) => {
            const next = VAT_TILE_VALUES[value];
            /* ยอดใบคิดใหม่ตามโหมดที่เลือก ⇒ งวดที่คีย์ไว้ไม่ตรงยอดอีก — ถามแล้วล้างเป็นชุดเดียว */
            if (next) changeUpstream("vat", next);
          }}
          disabled={busy}
        />
        <small>ไม่มีค่าตั้งต้น · ระบบคิดยอดก่อน VAT / VAT / ยอดรวมให้เองจากยอดโซน · เปลี่ยนโหมดแล้วงวดในขั้น ③ ถูกล้าง</small>
      </div>

      <div className={styles.field}>
        <span>หมายเหตุ</span>
        <Textarea
          value={state.notes}
          invalid={has("notes")}
          disabled={busy}
          onChange={(event) => patch({ notes: event.target.value })}
          aria-label="หมายเหตุของใบ"
        />
        <small>เช่นเงื่อนไขเก็บเงินเดิม · บังคับเมื่อยอดใบเป็น 0 บาท</small>
      </div>

      <StatusNotice tone="info" title="ใบย้อนหลังไม่นับ Actual / FC / เป้า" icon={FileText}>
        {HISTORICAL_STATUS_NOTE} — ยอดออกบิลผ่านระบบเดิมไปแล้ว ใบนี้มีไว้ให้งานบริการเดินต่อในระบบ
      </StatusNotice>
    </>
  );
}
