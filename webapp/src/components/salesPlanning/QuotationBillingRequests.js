"use client";
// ── เอกสารบัญชีตามงวด บนหน้าใบเสนอราคา (PR-2 · มติเจ้าของ 28/10/2026 ข้อ 4) ────────────────────────────────────────
//
// ⭐ อยู่ใต้ตารางงวดในการ์ด "งวดการชำระ" ของหน้า QT — รายแถว: งวด · สัดส่วน · ยอด · คำร้องที่ขอไปแล้ว · ปุ่ม "ขอเอกสารงวดนี้"
//   (ปุ่มรวม "ขอเอกสารบัญชี" อยู่ที่การ์ดจัดการใบ — หน้า QT ประกอบเอง)
// ⭐ แถวมาจาก `/api/sa/requests/billing-installments` (แหล่งเดียวกับไทล์ในฟอร์ม): มีงวดจริงบน SO = งวดจริง (เลขหลังปรับแผนอาจ
//   ไม่ตรงตารางแผนข้างบน — หัวบล็อกบอกว่าเป็นงวดของ SO ใบไหน) · ยังไม่มี = แผนของ QT (ผูกกับงวดจริงเมื่อออก SO)
// ⭐ งวดเดียวมีหลายคำร้องได้ (มติข้อ 3) ⇒ ปุ่มอยู่ทุกแถวที่ไม่ติดด่าน แม้มีคำร้องแล้ว · คำร้อง "ไม่ระบุงวด" รวมไว้แถวท้าย
// ⚠️ ไม่ใช่ช่องของตารางแผน (QuotationInstallments) — ตารางนั้นใช้ร่วมกับโหมดแก้/ปรับแผนของ SO และแก้ได้ระหว่างร่าง
//   ส่วนบล็อกนี้มีเฉพาะใบที่อนุมัติแล้ว (ด่านเดียวกับ POST เปิดคำร้อง: billingQuotationError)
import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import Button from "@/components/ui/Button";
import { apiJson } from "@/lib/apiFetch";
import { fmtNumber } from "@/lib/format";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/statuses";
import { quotationBillingRequestHref } from "@/lib/sales/billingRequestHref";
import styles from "./QuotationBillingRequests.module.css";

const money = (n) => fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => fmtNumber(n, { maximumFractionDigits: 2 });

function RequestChips({ requests }) {
  if (!requests?.length) return <span className={styles.none}>ยังไม่มีคำร้อง</span>;
  return (
    <span className={styles.chips}>
      {requests.map((r) => (
        <Link key={r.id} className="chip" href={`/requests/${r.id}`} prefetch={false}>
          {r.docNo || "ร่าง"} · {REQUEST_STATUS_LABELS[r.status] || r.status}
        </Link>
      ))}
    </span>
  );
}

/**
 * @param quotation  `{ id }` ของใบเสนอราคาที่อนุมัติแล้ว
 * @param canRequest ผู้ดูเปิดคำร้องได้ไหม (`costing:edit` — ด่านเดียวกับ POST) · ไม่ได้ = อ่านอย่างเดียว ไม่มีปุ่ม
 */
export default function QuotationBillingRequests({ quotation, canRequest = false }) {
  const [state, setState] = useState({ loading: true, error: "", choices: null });

  useEffect(() => {
    let alive = true;
    apiJson(`/api/sa/requests/billing-installments?quotationId=${encodeURIComponent(quotation.id)}`, {
      fallbackError: "โหลดคำร้องขอเอกสารของงวดไม่สำเร็จ",
    })
      .then((choices) => { if (alive) setState({ loading: false, error: "", choices }); })
      .catch((error) => { if (alive) setState({ loading: false, error: error.message || "โหลดไม่สำเร็จ", choices: null }); });
    return () => { alive = false; };
  }, [quotation.id]);

  const { choices } = state;
  const rows = choices?.rows || [];
  const unassigned = choices?.unassigned || [];

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <span className={styles.title}>เอกสารบัญชีของแต่ละงวด</span>
        <small className={styles.hint}>
          {state.loading ? "กำลังโหลด…"
            : state.error ? state.error
              : choices?.source === "order" ? `งวดของใบสั่งขาย ${choices.orderNumber}`
                : choices?.source === "plan" ? "งวดตามแผนของใบนี้ — ผูกกับงวดจริงให้เองเมื่อออกใบสั่งขาย"
                  : "ใบนี้ไม่มีแผนงวดชำระ — ขอเอกสารแบบไม่ระบุงวดได้จากการ์ดจัดการเอกสาร"}
        </small>
      </div>
      {rows.length || unassigned.length ? (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.key} className={styles.row}>
              <span className={styles.what}>
                <strong>งวด {row.seq}</strong>
                {row.label && row.label !== `งวดที่ ${row.seq}` ? <span> · {row.label}</span> : null}
                <small className={styles.hint}>{pct(row.percent)}% · {money(row.amount)} บาท</small>
              </span>
              <RequestChips requests={row.requests} />
              {row.blocked ? <small className={styles.hint}>{row.blocked}</small>
                : canRequest ? (
                  <Button as={Link} href={quotationBillingRequestHref(quotation, row)} prefetch={false}
                    tone="neutral" variant="outline" size="sm" icon={<Receipt size={13} aria-hidden="true" />}>
                    ขอเอกสารงวดนี้
                  </Button>
                ) : null}
            </li>
          ))}
          {unassigned.length ? (
            <li className={styles.row}>
              <span className={styles.what}><strong>ไม่ระบุงวด</strong></span>
              <RequestChips requests={unassigned} />
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
