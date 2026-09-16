"use client";
// ── ขั้น ① ใบ — ลูกค้า · AE · ทีม · เลขเอกสารเดิม · วันที่และยอด · หมายเหตุ ──────────
//
// ลำดับช่องตาม docs/form-design-rules.md §1: ตัวกำหนดบริบทบนสุด (ลูกค้า → AE → ทีม) ·
// ช่องที่โผล่ตามเงื่อนไขอยู่ **ใต้** ตัวที่ทำให้มันโผล่ (ทีมอยู่ใต้ AE) · ค่าที่ระบบรู้อยู่แล้ว
// เป็นช่องเส้นประอ่านอย่างเดียว (ดีลภาชนะ · เลขที่ใบ · สามช่องเงิน)
//
// ⚠️ ดีล · ทีมจริง · ยอด **ยังไม่รู้ที่ขั้นนี้** — พรีวิวที่ยังมี error คืนแค่ `{ error, errors }`
//    (historicalOrderCommit.js ตอบ 400 ก่อนถึงสาขาพรีวิว) และขั้น ① ยังไม่มีจุดติดตั้งเสมอ
//    ⇒ ช่องดีลเป็นเส้นประ "รู้หลังตรวจก่อนบันทึก (ขั้น ④)" ไม่ใช่ดรอปดาวน์ที่จางลง
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import Segmented from "@/components/ui/Segmented";
import ChoiceChips from "@/components/ui/ChoiceChips";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { DOC_DATE_MIN } from "@/lib/sales/historicalOrders";
import { HISTORICAL_REF_MAX, charLength } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalSalesOrderModal.module.css";

const VAT_BASE_OPTIONS = [
  { value: "gross", label: "รวม VAT แล้ว" },
  { value: "net", label: "ยังไม่รวม VAT" },
];
const VAT_RATE_OPTIONS = [{ value: 0, label: "0%" }, { value: 7, label: "7%" }];
const DOC_LANGUAGE_OPTIONS = [{ value: "th", label: "ไทย" }, { value: "en", label: "English" }];

const REF_FIELDS = [
  { key: "quote", label: "ใบเสนอราคาเดิม", hint: "ข้อความอ้างอิง — ไม่ผูกกับทะเบียนใบเสนอราคา" },
  { key: "express", label: "เลขเอกสาร Express", hint: "เลขเอกสารในโปรแกรม Express · เว้นว่างได้" },
  { key: "invoice", label: "ใบกำกับเดิม", hint: "ไม่ใช่เลขที่ใบในระบบ" },
];

/** ยอดที่ได้จากพรีวิวที่ผ่านทั้งใบเท่านั้น — ไม่ผ่าน = ขีด (ไม่ใช่ 0.00 ที่อ่านเหมือนใบไม่มีมูลค่า) */
function MoneyBox({ label, value }) {
  const known = Number.isFinite(Number(value));
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <p className={styles.derived} data-mono="yes" data-empty={known ? undefined : "yes"}>
        {known ? fmtMoney(value) : NA}
      </p>
    </div>
  );
}

export default function HistoricalOrderDocStep({
  state, onChange, customerOptions, ownerOptions, ownerTeams = [],
  issues = [], plan = null, orderNumberPreview, todayIso, busy = false,
}) {
  const has = (field) => issues.some((issue) => issue.field === field);
  const patch = (next) => onChange(next);
  const header = plan?.header || null;

  return (
    <>
      {issues.length > 0 && (
        /* ⭐ ก้อนเดียวบอกทุกช่องที่ขาด ไม่ใช่ให้กดแล้วเจอทีละช่อง (form-design-rules §2)
           ข้อความมาจาก server ตรง ๆ — ห้ามตั้งคำใหม่ที่นี่ ไม่งั้นสองฝั่งพูดคนละเรื่อง */
        <StatusNotice tone="error" title={`ยังกรอกไม่ครบ ${issues.length} ข้อ`} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        </StatusNotice>
      )}

      <div className={styles.field}>
        <span>ลูกค้า <b className={styles.req}>*</b></span>
        <SearchableSelect
          entity="customer"
          ariaLabel="ลูกค้าของใบสั่งขายย้อนหลัง"
          options={customerOptions}
          value={state.customerId}
          onChange={(value) => patch({ customerId: value })}
          disabled={busy}
          placeholder="เลือกลูกค้า"
          searchPlaceholder="ค้นหารหัส AR หรือชื่อลูกค้า"
        />
        <small>
          เลือกจากทะเบียนลูกค้าเท่านั้น · ต้องเป็นลูกค้าที่อนุมัติแล้วและไม่ถูกพักใช้
          (ไม่งั้น “ลูกค้ารายนี้ยังไม่อนุมัติหรือถูกพักใช้ — ออกใบไม่ได้”)
        </small>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <span>AE ผู้รับผิดชอบ <b className={styles.req}>*</b></span>
          <SearchableSelect
            ariaLabel="AE ผู้รับผิดชอบของใบสั่งขายย้อนหลัง"
            options={ownerOptions}
            value={state.ownerId}
            onChange={(value) => patch({ ownerId: value, team: "" })}
            disabled={busy}
            placeholder="เลือก AE"
            searchPlaceholder="ค้นหาชื่อ AE"
          />
          <small>เลือกได้เฉพาะ AE/Senior AE ที่ใช้งานอยู่ · ไม่มีค่าตั้งต้น · ลูกค้าเดียวกันคนละ AE = คนละดีล</small>
        </div>

        {/* ⭐ ช่องทีมโผล่เฉพาะตอน **มีคำตอบให้เลือกจริง** (AE อยู่ตั้งแต่ 2 ทีม) —
            กติกาเดียวกับ TeamPickerField ทั้งระบบ · AE ทีมเดียว = ช่องเส้นประอ่านอย่างเดียว */}
        <div className={styles.field}>
          <span>ทีม {ownerTeams.length >= 2 ? <b className={styles.req}>*</b> : null}</span>
          {ownerTeams.length >= 2 ? (
            <ChoiceChips
              ariaLabel="ทีมของดีลใบนี้"
              options={ownerTeams.map((team) => ({ value: team, label: team }))}
              value={state.team}
              onChange={(value) => patch({ team: value })}
              disabled={busy}
            />
          ) : (
            <p className={styles.derived} data-empty={ownerTeams.length ? undefined : "yes"}>
              {ownerTeams[0] || (state.ownerId ? "AE คนนี้ยังไม่มีทีม" : "เลือก AE ก่อน")}
            </p>
          )}
          <small>
            ขึ้นเฉพาะเมื่อ AE อยู่หลายทีม · ตัวเลือก = ทีมที่ AE สังกัด · ไม่มีค่าตั้งต้น ·
            AE ทีมเดียว = ช่องเส้นประอ่านอย่างเดียว · ทีมจริงของดีลเห็นที่ขั้น ④
          </small>
        </div>
      </div>

      <div className={styles.field}>
        <span>ดีลงานบริการย้อนหลัง</span>
        <p className={styles.derived} data-empty="yes">รู้หลังตรวจก่อนบันทึก (ขั้น ④)</p>
        <small>
          ระบบหาดีลของคู่ลูกค้า × AE นี้ หรือสร้างใหม่ตอนบันทึก · 1 ดีลต่อลูกค้า × AE ·
          Won มูลค่า 0 ไม่นับยอดขายและ FC
        </small>
      </div>

      <h4 className={styles.section}>
        เลขเอกสารเดิม
        <span className={styles.sectionKind}>(ไม่บังคับ · ≤{HISTORICAL_REF_MAX} ตัวอักษร · ค้นหาได้และใช้ตรวจใบซ้ำ)</span>
      </h4>
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
              onChange={(e) => patch({ refs: { ...state.refs, [key]: e.target.value } })}
              aria-label={label}
            />
            <small>
              {hint}
              {charLength(state.refs?.[key]) > HISTORICAL_REF_MAX
                ? ` · ยาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษรแล้ว`
                : ""}
            </small>
          </div>
        ))}
      </div>

      <div className={styles.field}>
        <span>เลขที่ใบในระบบ</span>
        <p className={styles.derived} data-mono="yes" data-empty="yes">{orderNumberPreview}</p>
        <small>
          ระบบออกเลขตอนกดบันทึก รูปแบบ SO-{"{YY}{MM}"}{"{เลขรัน 4 หลัก}"}-0 ·
          YYMM = เดือนที่คีย์ ไม่ใช่วันที่ใบ · ตัวนับรายปี
        </small>
      </div>

      <h4 className={styles.section}>วันที่และยอด</h4>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <span>วันที่ใบ = วันเริ่มสัญญาจริง <b className={styles.req}>*</b></span>
          <DateInput
            value={state.orderDate}
            onChange={(value) => patch({ orderDate: value })}
            min={DOC_DATE_MIN}
            max={todayIso}
            disabled={busy}
            ariaLabel="วันที่ใบ (วันเริ่มสัญญาจริง)"
          />
          <small>01/01/2000 ถึงวันนี้ · วันสิ้นสุดสัญญาอยู่ที่เอกสารแทนสัญญาหลังบันทึก</small>
        </div>
        <div className={styles.field}>
          <span>ภาษาเอกสาร <b className={styles.req}>*</b></span>
          <Segmented
            ariaLabel="ภาษาเอกสารของใบ"
            options={DOC_LANGUAGE_OPTIONS}
            value={state.docLanguage}
            onChange={(value) => patch({ docLanguage: value })}
          />
          <small>กำหนดคำอธิบายสินค้าบนบรรทัด · พิมพ์ใบย้อนหลังยังไม่รองรับ</small>
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <span>ยอดที่คีย์ <b className={styles.req}>*</b></span>
          <Segmented
            ariaLabel="ยอดบรรทัดที่คีย์รวม VAT แล้วหรือยัง"
            options={VAT_BASE_OPTIONS}
            value={state.amountsIncludeVat === null ? undefined : (state.amountsIncludeVat ? "gross" : "net")}
            onChange={(value) => patch({ amountsIncludeVat: value === "gross" })}
          />
          <small>ยอดบรรทัดในขั้น ② ใช้ฐานนี้ · ไม่มีค่าตั้งต้น</small>
        </div>
        <div className={styles.field}>
          <span>อัตรา VAT <b className={styles.req}>*</b></span>
          <Segmented
            ariaLabel="อัตรา VAT ของใบ"
            options={VAT_RATE_OPTIONS}
            value={state.vatRate === null ? undefined : state.vatRate}
            onChange={(value) => patch({ vatRate: value })}
          />
          <small>มีแค่สองค่า · ไม่มีค่าตั้งต้น</small>
        </div>
      </div>
      <div className={styles.grid3}>
        <MoneyBox label="ก่อน VAT" value={header?.subtotal} />
        <MoneyBox label="VAT" value={header?.vatAmount} />
        <MoneyBox label="รวม" value={header?.totalAmount} />
      </div>
      <p className={styles.hint}>
        ไม่มีช่องพิมพ์ยอดรวม — ระบบคิดจากยอดบรรทัดในขั้น ② · สามช่องนี้ขึ้นเมื่อตรวจทั้งใบผ่าน
        (มีจุดติดตั้งแล้ว) · ใบยอด 0 = ต้องมีหมายเหตุ + ยกเว้นด่านเงินอัตโนมัติ
      </p>

      <div className={styles.field}>
        <span>หมายเหตุ</span>
        <Textarea
          value={state.notes}
          invalid={has("notes")}
          disabled={busy}
          onChange={(e) => patch({ notes: e.target.value })}
          aria-label="หมายเหตุของใบ"
        />
        <small>เช่นเงื่อนไขเก็บเงินเดิม · บังคับเมื่อยอดใบ = 0</small>
      </div>

      {/* ขอบเขตของรอบนี้ — โมดัลส่ง `running: true` ตายตัว ไม่มีสวิตช์ให้กด */}
      <StatusNotice tone="info" title="รอบนี้รับเฉพาะงานบริการที่ยังเดินอยู่ — งานที่จบแล้วยังไม่รับเข้าระบบ">
        ใบนี้ไม่นับ Actual / FC / เป้า · ยอดออกบิลผ่าน Express ไปแล้ว ใบย้อนหลังมีไว้ให้งานบริการเดิน
      </StatusNotice>
    </>
  );
}

/** แถบบริบทของขั้น ② — สรุปสิ่งที่ตัดสินไปแล้วในขั้น ① (ใช้ที่โมดัลแม่) */
export function historicalDocSummary(state, { customerLabel, ownerLabel }) {
  return [
    customerLabel || naText(null),
    ownerLabel || naText(null),
    state.team ? `ทีม ${state.team}` : null,
    [state.refs?.quote, state.refs?.express, state.refs?.invoice].map((v) => String(v || "").trim()).filter(Boolean).join(" · ") || null,
    /* 🪤 `state.orderDate` เป็น ISO ที่ DateInput คายออกมา — แถบนี้มีไว้ให้ผู้คีย์ยืนยัน
       สิ่งที่เพิ่งพิมพ์ไป ⇒ ต้องเป็นรูปเดียวกับที่พิมพ์ (DD/MM/YYYY) และเดียวกับขั้น ④ */
    state.orderDate ? `วันที่ใบ ${fmtDate(state.orderDate)}` : null,
    state.amountsIncludeVat === null ? null : (state.amountsIncludeVat ? "ยอดรวม VAT แล้ว" : "ยอดยังไม่รวม VAT"),
    state.vatRate === null ? null : `VAT ${state.vatRate}%`,
    state.docLanguage === "en" ? "English" : "ไทย",
  ].filter(Boolean).join(" · ");
}
