"use client";
// ── ขั้น ④ ตรวจและส่งอนุมัติ (มติเจ้าของ 25/09 — "ตรวจแบบผู้อนุมัติ" · ม็อก Step4New / Step4Dup) ──────────────
//
// ⭐ **ผู้คีย์ตรวจข้อเดียวกับที่ผู้จัดการฝ่ายขายจะตรวจ ด้วยประโยคเดียวกัน** — แถวของการ์ด "สิ่งที่ผู้อนุมัติจะตรวจ" มาจาก
//   `historicalReviewChecklist` ซึ่งใช้ตัวสร้างประโยคชุดเดียวกับหน้าต่างอนุมัติ (historicalOrderCopy) · ทุกแถวมีปุ่ม
//   "แก้ในขั้น ①/②/③" พาไปที่ช่องนั้น · คำเตือนรวมเป็นกลุ่มในแถวของมัน (เคยขึ้นทีละบรรทัด 10 ข้อ)
// ⭐ **ทุกอย่างมาจากแผนของ server** (`planHistoricalServiceOrder`) — ของที่ตรวจแล้ว = ของที่บันทึก (บทเรียน #1685)
//   ยกเว้นชื่อผู้คีย์และรายชื่อไฟล์ (ฟอร์มถืออยู่)
// ⭐ ลำดับ: หัวเอกสาร (แบบขั้น ①) → **ใบที่อาจซ้ำ** (บนสุด ด่านเดียวที่บล็อกการส่ง) → สิ่งที่ผู้อนุมัติจะตรวจ → รายการ
//   (ตารางฝั่งอ่านตัวเดียวกับหน้าใบ) → หลังกดส่ง (รางเดียวกับหน้าใบ)
// 🚫 ถอด (มติ 25/09): การ์ด 3 ใบที่พูดซ้ำขั้น ①–③ · "อนุมัติ: AE Sup" · รายการคำเตือนทีละบรรทัด · ลำดับหลังบันทึกแบบรหัสฝ่าย ·
//   กล่องเหลือง "ยังเข้าบริการไม่ได้…" ที่ขึ้นทุกใบ · คำอธิบายเรื่องจำนวน × เดือน (บางรายการใช้ 2 แพ็คต่อเดือน — มติข้อ 4)
import { AlertTriangle, CheckCircle2, ClipboardCheck, Coins, Copy, ExternalLink, Hash, ListChecks, Lock, Route, Building2, CalendarDays } from "lucide-react";
import Button from "@/components/ui/Button";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { WorkflowRail } from "@/components/ui/DocumentControlPanel";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import { QUOTE_VAT_OPTIONS } from "@/lib/salesPlanning";
import { fmtDate, naText, NA } from "@/lib/format";
import { HISTORICAL_CORRECTION_PATH, HISTORICAL_STATUS_NOTE } from "@/lib/sales/historicalOrders";
import { historicalAfterSendRail, historicalStatusCopy } from "@/lib/sales/historicalOrderCopy";
import {
  historicalLinesSummary, historicalReviewStaleNotice, historicalTotalsView,
} from "@/lib/sales/historicalIntakeForm";
import { historicalReviewChecklist, historicalReviewFacts } from "@/lib/sales/historicalReviewView";
import CardHeading from "./CardHeading";
import styles from "./HistoricalOrderWizard.module.css";

const FACT_ICONS = { customer: Building2, span: CalendarDays, total: Coins, number: Hash };
const STEP_NO = { contract: "①", zones: "②", money: "③" };

/* "ตรงกันที่ …" ของใบที่อาจซ้ำ — จากแผน (`matchedOn`) · แผนรุ่นก่อนไม่มี = ขีด */
const matchedText = (row) => {
  const parts = (Array.isArray(row?.matchedOn) ? row.matchedOn : []).map((item) => (item.kind === "startDate"
    ? "วันเริ่มสัญญา"
    : `เลขเอกสารเดิม ${item.value}`));
  return parts.join(" · ") || NA;
};

export default function WizardReviewStep({
  plan, keyerMode = "keyer", keyerName = null, customerLabel = null, orderNumber = null, statusLabel = null,
  contractFiles = {}, evidenceFileCount = 0, duplicates = [], acknowledged = false, onAcknowledge, dupNote = null,
  switchRef = null, busy = false, onEditStep, todayIso = null,
}) {
  if (!plan) {
    /* 🐞 UAT 23/09: ของเดิมสั่งให้กด “ตรวจอีกครั้ง” ซึ่ง **ไม่มีปุ่มนั้นอยู่บนจอ** — ปุ่มจริงคือปุ่มบันทึก
       และการกดครั้งแรกตอนยังไม่มีแผนคือการตรวจ (ฟอร์มยิงพรีวิวก่อน ยังไม่บันทึก)
       ⇒ ถ้อยคำมาจากตัวตัดสินที่อ้างป้ายปุ่มตัวเดียวกับแถบท้าย ⇒ เปลี่ยนป้ายปุ่มแล้วคำสั่งเปลี่ยนตาม */
    const stale = historicalReviewStaleNotice();
    return <StatusNotice tone="warning" title={stale.title}>{stale.body}</StatusNotice>;
  }

  const { header, lines } = plan;
  const vatLabel = QUOTE_VAT_OPTIONS.find((option) => option.value === Number(header.vatRate))?.label || null;
  /* กล่องสรุปท้ายตาราง — ตัวเดียวกับท้ายตารางรายการของขั้น ② (แผนมาถึงขั้นนี้ได้ = เงินผ่านด่านแล้ว ⇒ ok)
     ⭐ ที่เดียวของขั้น ④ ที่พูดยอดเงินเป็นกล่อง — หัวเอกสารบอกยอดรวมทั้งสิ้นคำเดียว */
  const totals = historicalTotalsView({ ok: true, ...header }, header.vatRate);
  const facts = historicalReviewFacts(plan, { customerLabel, keyerName, orderNumber, vatLabel })
    .map((fact) => ({ ...fact, icon: FACT_ICONS[fact.key] }));
  const checklist = historicalReviewChecklist(plan, { contractFiles, evidenceFileCount, todayIso });
  const rail = historicalAfterSendRail(plan, { keyerMode, orderNumber });
  const dupes = Array.isArray(duplicates) ? duplicates : [];
  const edit = (step, field) => { if (!busy) onEditStep?.(step, field); };

  return (
    <div className={styles.cardStack}>
      <DetailOverview
        pin={false}
        eyebrow="SO ย้อนหลัง · งานบริการ · ขั้น 4/4"
        title="ตรวจและส่งอนุมัติ"
        description="ตรวจข้อเดียวกับที่ผู้อนุมัติจะดู — ถูกแล้วกด “บันทึกและส่งอนุมัติ” · ข้อไหนผิด กด “แก้ในขั้น …” กลับไปแก้"
        badges={(
          <>
            {/* ที่เดียวของขั้น ④ ที่พูด "ไม่นับ Actual" — ของเดิมพูดสามที่ */}
            <span title={HISTORICAL_STATUS_NOTE}>
              <DetailStateBadge label="ไม่นับ Actual / FC / เป้า" color="var(--blue)" />
            </span>
            {statusLabel ? <DetailStateBadge label={statusLabel} color="var(--accent)" /> : null}
          </>
        )}
        facts={facts}
      />

      {dupes.length > 0 && (
        /* 🔴 ด่านเดียวของขั้น ④ — อยู่บนสุด ปุ่มส่งบอกเหตุชี้มาที่การ์ดนี้ (`historicalReviewFootNote`) */
        <section className={styles.card} aria-labelledby="hist-card-dup">
          <CardHeading
            icon={Copy}
            title={<span id="hist-card-dup">{`ใบที่อาจซ้ำ ${dupes.length} ใบ`}</span>}
            note="วันเริ่มสัญญาหรือเลขเอกสารเดิมตรงกับใบนี้ — เปิดดูในแท็บใหม่ แล้วยืนยันว่าเป็นคนละใบ"
          />
          <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={560}>
            <table className="w-full text-sm">
              <thead><tr><th>เลขที่ใบ</th><th>สถานะ</th><th>วันเริ่มสัญญา</th><th>ตรงกันที่</th><th>เลขเอกสารเดิม</th></tr></thead>
              <tbody>
                {dupes.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {/* แท็บใหม่ = ยามงานยังไม่บันทึกไม่ถาม (มันข้ามลิงก์ target=_blank) และฟอร์มนี้ไม่หาย */}
                      <a className={styles.dupLink} href={`/sa/sales-orders/${row.id}`} target="_blank" rel="noreferrer">
                        {naText(row.orderNumber)} <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </td>
                    <td>{historicalStatusCopy(row.status).label}</td>
                    <td>{row.orderDate ? fmtDate(row.orderDate) : NA}</td>
                    <td>{matchedText(row)}</td>
                    <td>{naText((row.refs || []).join(" · "))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className={styles.switchRow}>
            <button
              ref={switchRef}
              type="button"
              className="ui-switch"
              data-on={acknowledged ? "1" : undefined}
              aria-pressed={acknowledged}
              aria-label="ตรวจแล้ว ไม่ใช่ใบซ้ำ"
              disabled={busy}
              onClick={() => onAcknowledge?.(!acknowledged)}
            >
              <i aria-hidden="true" />
            </button>
            <span className={styles.switchText}>
              <b>ตรวจแล้ว ไม่ใช่ใบซ้ำ</b>
              <small data-blocked={dupNote && !acknowledged ? "yes" : undefined}>
                {acknowledged ? "ยืนยันแล้ว — ส่งได้" : (dupNote || "ยังไม่เปิด = ยังส่งไม่ได้")}
              </small>
            </span>
          </div>
        </section>
      )}

      <section className={styles.card} aria-labelledby="hist-card-check">
        <CardHeading
          icon={ClipboardCheck}
          title={<span id="hist-card-check">สิ่งที่ผู้อนุมัติจะตรวจ</span>}
          note="ข้อเดียวกับหน้าต่างอนุมัติ — ผิดตรงไหน กด “แก้ในขั้น …”"
        />
        <div className={styles.checkList}>
          {checklist.map((row) => (
            <div key={row.key} className={styles.checkRow}>
              <span className={styles.checkLabel}>{row.label}</span>
              <div className={styles.checkValue} data-tone={row.tone || undefined}>
                {row.tone === "ok" ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
                <span>
                  {row.value}
                  {row.sub ? <small>{row.sub}</small> : null}
                  {row.warn ? (
                    <em className={styles.checkWarn}><AlertTriangle size={13} aria-hidden="true" />{row.warn}</em>
                  ) : null}
                </span>
              </div>
              <div className={styles.checkAction}>
                {row.step ? (
                  <Button size="sm" variant="quiet" tone="neutral" disabled={busy} onClick={() => edit(row.step, row.field)}>
                    {`แก้ในขั้น ${STEP_NO[row.step] || ""}`}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="hist-card-lines">
        <CardHeading
          icon={ListChecks}
          title={<span id="hist-card-lines">รายการ</span>}
          note={historicalLinesSummary(lines)}
          actions={(
            <Button size="sm" variant="quiet" tone="neutral" disabled={busy} onClick={() => edit("zones", "zones")}>แก้ในขั้น ②</Button>
          )}
        />
        {/* ⭐ ตารางรายการฝั่งอ่านตัวเดียวกับหน้าใบสั่งขาย/ใบเสนอราคา · ไซต์ · โซน กับรอบที่ขายไว้ขึ้นใต้คำอธิบาย */}
        <QuotationReadOnlyLineItems
          lines={lines}
          showServiceRounds
          showInstallationPoint
          summaryRows={totals.rows}
          grandTotal={totals.grandTotal}
        />
      </section>

      <section className={styles.card} aria-labelledby="hist-card-after">
        <CardHeading icon={Route} title={<span id="hist-card-after">หลังกดส่ง</span>} note="ใบเดินต่อตามลำดับนี้" />
        {/* รางแบบหน้าสร้างใบสั่งขาย · ป้ายขั้นชุดเดียวกับรางบนหน้าใบย้อนหลัง (ผู้คีย์เห็นรางเดิมต่อหลังระบบพาไปหน้าใบ) */}
        <WorkflowRail steps={rail} label="ลำดับหลังกดส่ง" />
        <p className={styles.lockLine}>
          <Lock size={12} aria-hidden="true" />
          {`อนุมัติแล้วแก้ในฟอร์มไม่ได้ — ${HISTORICAL_CORRECTION_PATH}`}
        </p>
      </section>
    </div>
  );
}
