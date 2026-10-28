"use client";
// ── ไทล์เลือกงวดชำระของคำร้องขอเอกสารการเงิน (ขอเอกสารจากหน้า QT · PR-2 · มติเจ้าของ 28/10/2026) ───────────────
//
// ⭐ มติข้อ 1: เลือกงวด หรือ "ไม่ระบุงวด" ก็ได้ · ข้อ 2: เลือกงวดแล้วเติมยอดงวดให้ แก้ได้อิสระ (ผู้เรียกเขียนยอดลงฟอร์ม) ·
//   ข้อ 3: งวดที่มีคำร้องแล้วยังเลือกได้ (บอกเลขคำร้องที่มีอยู่ใต้ไทล์)
// ⭐ ตัวเลือกมาจาก `/api/sa/requests/billing-installments` (แหล่งตัดสินที่ lib/requests/billingInstallmentChoices.js ตัวเดียว:
//   มีงวดจริงบน SO = งวดจริง · ยังไม่มี = แผนของ QT) · ไทล์ ไม่ใช่ dropdown (งวด 1–12 ตัวเลือก — memory direct-controls)
// ⭐ ค่าที่ผู้เรียกเก็บ = `{ key, installmentId, installmentSeq, amount }` | null — หน้าเปิดคำร้องแปลงเป็นช่องของ POST เอง
//   (`linkInstallmentId` = งวดจริง · `installmentSeq` = แผน QT)
// ⚠️ ผู้เรียก remount ด้วย `key={quotationId}` — เปลี่ยนใบ = ตัวเลือกชุดใหม่ ไม่ต้อง sync state ด้วย effect
import { useEffect, useRef, useState } from "react";
import OptionTiles from "@/components/ui/OptionTiles";
import { apiJson } from "@/lib/apiFetch";
import { fmtNumber } from "@/lib/format";
import { installmentChoiceKey } from "@/lib/requests/billingInstallmentChoices";
import styles from "./requestForm.module.css";

const NONE = "";
const money = (n) => fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => fmtNumber(n, { maximumFractionDigits: 2 });

/* ป้ายของไทล์ — "งวด 2 · ก่อนส่งสินค้า" (ป้ายที่แค่ซ้ำเลขงวดไม่พูดซ้ำ) */
const tileLabel = (row) => {
  const label = String(row.label || "").trim();
  return !label || label === `งวดที่ ${row.seq}` ? `งวด ${row.seq}` : `งวด ${row.seq} · ${label}`;
};

/* บรรทัดรอง — สัดส่วน · ยอด · คำร้องที่ขอไปแล้ว (งวดเดียวมีหลายคำร้องได้) · เหตุที่เลือกไม่ได้ */
const tileDescription = (row) => {
  if (row.blocked) return row.blocked;
  const asked = (row.requests || []).map((r) => r.docNo || "ร่าง").join(", ");
  return [`${pct(row.percent)}% · ${money(row.amount)} บาท`, asked ? `ขอแล้ว: ${asked}` : ""].filter(Boolean).join(" · ");
};

/**
 * @param quotationId ใบเสนอราคาที่เลือกในฟอร์ม
 * @param value       งวดที่เลือก (`{ key, … }`) | null = ไม่ระบุ
 * @param onPick      `(pick | null) => void`
 * @param prefill     ค่าที่มากับลิงก์ `{ quotationId, installmentId, installmentSeq }` — ใช้ครั้งเดียวเมื่อเป็นใบเดียวกัน
 */
export default function BillingInstallmentPicker({ quotationId, value = null, onPick, prefill = null, disabled = false }) {
  const [state, setState] = useState({ loading: true, error: "", choices: null });
  const prefilled = useRef(false);

  useEffect(() => {
    let alive = true;
    apiJson(`/api/sa/requests/billing-installments?quotationId=${encodeURIComponent(quotationId)}`, {
      fallbackError: "โหลดงวดชำระของใบเสนอราคาไม่สำเร็จ",
    })
      .then((choices) => { if (alive) setState({ loading: false, error: "", choices }); })
      .catch((error) => { if (alive) setState({ loading: false, error: error.message || "โหลดงวดชำระไม่สำเร็จ", choices: null }); });
    return () => { alive = false; };
  }, [quotationId]);

  const rows = state.choices?.rows || [];
  const pickOf = (key) => {
    const row = rows.find((r) => r.key === key && !r.blocked);
    return row ? { key: row.key, installmentId: row.installmentId, installmentSeq: row.installmentId ? null : row.seq, amount: row.amount } : null;
  };

  /* ⭐ ค่าที่มากับลิงก์ (ปุ่ม "ขอเอกสารงวดนี้" บนหน้า QT · "ขอใบวางบิลงวดนี้" บนแผงงวด SO) — เลือกให้ครั้งเดียวเมื่อตัวเลือกมาถึง
     และผู้ใช้ยังไม่ได้เลือกเอง · ใบเปลี่ยนแล้ว (ไม่ใช่ใบที่กดมา) = ไม่เติม */
  useEffect(() => {
    if (prefilled.current || !state.choices || value || prefill?.quotationId !== quotationId) return;
    prefilled.current = true;
    const key = installmentChoiceKey(state.choices, prefill);
    const pick = key ? pickOf(key) : null;
    if (pick) onPick?.(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.choices]);

  const options = [
    { value: NONE, label: "ไม่ระบุงวด", description: "พิมพ์ % หรือยอดเองในแท็บรายละเอียด" },
    ...rows.map((row) => ({ value: row.key, label: tileLabel(row), description: tileDescription(row), disabled: !!row.blocked })),
  ];
  const source = state.choices?.source;

  return (
    <>
      <OptionTiles
        value={value?.key || NONE}
        onChange={(key) => onPick?.(key ? pickOf(key) : null)}
        options={options}
        disabled={disabled || state.loading}
        ariaLabel="งวดชำระของคำร้อง"
      />
      <small className={styles.hint}>
        {state.loading ? "กำลังโหลดงวดชำระของใบเสนอราคา…"
          : state.error ? `${state.error} — ยังเลือก "ไม่ระบุงวด" ได้`
            : source === "order" ? `งวดของใบสั่งขาย ${state.choices.orderNumber} — เลือกงวดแล้วเติมยอดของงวดให้ แก้ได้`
              : source === "plan" ? "งวดตามแผนของใบเสนอราคา — ผูกกับงวดจริงให้เองเมื่อออกใบสั่งขาย · เลือกงวดแล้วเติมยอดให้ แก้ได้"
                : "ใบเสนอราคานี้ไม่มีแผนงวดชำระ"}
      </small>
    </>
  );
}
