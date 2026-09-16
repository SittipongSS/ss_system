"use client";
// ── จอจบหลังบันทึก — พาเดินขั้นสัญญา ไม่ใช่แค่ "บันทึกแล้ว" ─────────────────────────
//
// 🔴 บันทึกใบเสร็จแล้ว **ยังนัดงานไม่ได้สักจุด**: ด่านสัญญา (ข้อ①) ไม่มีทางยกเว้น และ TS
//    ต้องผูกโซนก่อน ⇒ จอนี้ต้องบอกว่าเหลืออะไรและใครทำ ไม่ใช่แค่ toast แล้วปิด
// ⭐ ทุกตัวเลขอ่านจาก response ของการบันทึกตรง ๆ (order · lines · installments · deal ·
//    dealCreated) — ไม่ยิง GET ตาม
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Square } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate, naText } from "@/lib/format";
import { EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS } from "@/lib/sales/contracts";
import { DOC_DATE_MAX, DOC_DATE_MIN } from "@/lib/sales/historicalOrders";
import { historicalDoneSummary } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalSalesOrderModal.module.css";

/* ⚠️ ข้อ ⑥ ของม็อก ("จุดที่ TS หาไม่เจอ") ไม่อยู่ในรอบนี้ — เป็นเฟส 2b ที่ต้องมี mig 0361 */
const NEXT_STEPS = [
  {
    key: "contract",
    label: "① เอกสารแทนสัญญา: สร้าง → แนบไฟล์ → อนุมัติ (วันเริ่ม + วันสิ้นสุดครอบวันที่ใบ) → ผูกกับใบ",
    sub: "ทำต่อได้ที่นี่ — ด่านสัญญาไม่มีทางยกเว้น",
    who: "ฝ่ายขาย / AE Sup",
  },
  {
    key: "zone",
    label: "② ผูกจุดติดตั้งเข้าโซนในงานเข้าใหม่ หรือเพิ่มไซต์ย้อนหลัง",
    sub: "ก่อนหน้านี้ด่านตอบว่า “ไซต์นี้ยังไม่มีโซนที่ผูกกับใบสั่งขาย”",
    who: "TS",
  },
  {
    key: "money",
    label: "③ ด่านเงิน: บัญชีรับรองงวดเมื่อแจ้งชำระ หรือยกเว้นแล้ว",
    sub: "แจ้งแล้วไม่ปลดด่าน — นับเฉพาะงวดที่บัญชีรับรอง",
    who: "บัญชี",
  },
  { key: "rounds", label: "④ ตั้งรอบบริการ (เติมน้ำหอมทุกกี่เดือน)", sub: null, who: "Planner" },
  { key: "assets", label: "⑤ ขึ้นทะเบียนเครื่องที่ติดตั้งอยู่จริง", sub: "นอกงานรอบนี้", who: "ฝ่ายบริการ" },
];

const DOC_KIND_TILES = EXTERNAL_DOC_KINDS.map((value) => ({ value, label: EXTERNAL_DOC_KIND_LABELS[value] }));

export default function HistoricalOrderDoneStep({ result }) {
  const order = result?.order || {};
  const dealId = result?.deal?.id || order.dealId || null;

  /* ⭐ ไม่มีค่าตั้งต้น และไม่มีตัวเลือก "ไม่มีสัญญา" — ด่านสัญญายกเว้นไม่ได้ */
  const [docKind, setDocKind] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [contractDate, setContractDate] = useState(order.orderDate || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contract, setContract] = useState(null);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await apiJson("/api/sales-planning/contracts", {
        method: "POST",
        json: {
          dealId,
          kind: "service",
          source: "external",
          externalDocKind: docKind,
          externalRef: externalRef.trim() || null,
          contractDate: contractDate || null,
        },
        fallbackError: "สร้างเอกสารแทนสัญญาไม่สำเร็จ",
      });
      setContract(created);
    } catch (err) {
      setError(err?.message || "สร้างเอกสารแทนสัญญาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.doneHead}>
        <b>{result?.replayed ? "ใบนี้ถูกบันทึกไว้แล้ว (ส่งซ้ำได้ใบเดิม)" : "บันทึกใบสั่งขายย้อนหลังแล้ว"}</b>
        <span>{historicalDoneSummary(result)}</span>
      </div>

      <h4 className={styles.section}>ขั้นต่อไป — ยังไม่มีข้อไหนเสร็จตอนบันทึก</h4>
      <ul className={styles.checklist}>
        {NEXT_STEPS.map((item) => (
          <li key={item.key}>
            <Square size={15} aria-hidden="true" />
            <span>{item.label}{item.sub ? <small>{item.sub}</small> : null}</span>
            <span className={styles.who}>{item.who}</span>
          </li>
        ))}
      </ul>

      <h4 className={styles.section}>① เอกสารแทนสัญญา</h4>
      {contract ? (
        /* 🪤 ร่างยังไม่มีเลขที่ — `POST /contracts` ไม่เขียน `contractNo` เลย (0278 ออกเลขให้
           ตอน issue/approve-external เท่านั้น) ⇒ เคยขึ้นเป็นขีดลอย ๆ ทุกครั้งตรงที่ควรเป็นเลข */
        <StatusNotice
          tone="success"
          title="สร้างร่างเอกสารแทนสัญญาแล้ว — เลขที่ออกตอน AE Sup อนุมัติ"
          action={(
            <Button size="sm" tone="neutral" as={Link} href={`/sa/contracts/${contract.id}`} target="_blank"
              icon={<ExternalLink size={14} aria-hidden="true" />}>
              เปิดเอกสาร
            </Button>
          )}
        >
          ยังไม่จบ — แนบไฟล์ชนิด “เอกสารที่ใช้แทนสัญญา” แล้วให้ AE Sup/แอดมินอนุมัติพร้อมวันเริ่มและวันสิ้นสุด
          จากนั้นผูกกับใบ {naText(order.orderNumber)}
        </StatusNotice>
      ) : (
        <>
          <div className={styles.field}>
            <span>ชนิดเอกสารที่ใช้แทนสัญญา <b className={styles.req}>*</b></span>
            <OptionTiles
              ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"
              options={DOC_KIND_TILES}
              value={docKind}
              onChange={setDocKind}
              disabled={busy}
            />
            <small>ไม่มีค่าตั้งต้น · ไม่มีตัวเลือก “ไม่มีสัญญา”</small>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <span>เลขอ้างอิงของเอกสาร</span>
              <Input value={externalRef} autoComplete="off" disabled={busy}
                onChange={(e) => setExternalRef(e.target.value)} aria-label="เลขอ้างอิงของเอกสารแทนสัญญา" />
            </div>
            <div className={styles.field}>
              <span>วันที่เอกสาร</span>
              <DateInput value={contractDate} onChange={setContractDate} min={DOC_DATE_MIN} max={DOC_DATE_MAX}
                disabled={busy} ariaLabel="วันที่ของเอกสารแทนสัญญา" />
            </div>
          </div>
          <p className={styles.hint}>
            สร้างเป็นร่าง (ชนิดบริการ ผูกกับดีลของใบ) → แนบไฟล์ชนิด “เอกสารที่ใช้แทนสัญญา” (ต้องมีก่อนอนุมัติ) →
            AE Sup/แอดมินอนุมัติพร้อมวันเริ่ม + วันสิ้นสุด ที่ครอบวันที่ใบ {fmtDate(order.orderDate)} →
            ผูกกับใบ {naText(order.orderNumber)}
          </p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className={styles.inlineActions}>
            {/* ปุ่มเติมสีตัวเดียวของจอนี้ = ขั้นที่ต้องทำต่อ · ติดด่านแล้วบอกเหตุติดปุ่ม */}
            <Button tone="accent" size="sm" disabled={busy || !docKind || !dealId}
              title={!docKind ? "เลือกชนิดเอกสารที่ใช้แทนสัญญาก่อน" : undefined}
              onClick={create} icon={<Plus size={15} aria-hidden="true" />}>
              {busy ? "กำลังสร้าง…" : "สร้างเอกสารแทนสัญญา"}
            </Button>
            {!docKind && <span className={styles.muted}>เลือกชนิดเอกสารก่อนจึงสร้างได้</span>}
          </div>
        </>
      )}
    </>
  );
}
