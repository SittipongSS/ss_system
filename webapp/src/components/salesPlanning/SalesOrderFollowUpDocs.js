"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Files } from "lucide-react";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { useCan } from "@/lib/roleContext";
import { fmtDate, naText } from "@/lib/format";
import { revLabel, specLineAction } from "@/lib/sales/productSpecView";
import styles from "./SalesOrderFollowUpDocs.module.css";

/**
 * การ์ด "เอกสารต่อเนื่อง" บนหน้าใบสั่งขาย (mig 0364)
 *
 * ⭐ **หน้า SO เป็นด่านปลดล็อกกับทางเข้า ไม่ใช่บ้านของใบ** (มติผู้ใช้ 2026-09-17) —
 * ใบสเปคเป็นใบของสินค้า หนึ่งสินค้าหนึ่งใบตลอดอายุ · ที่นี่ตอบแค่ "บรรทัดไหนต้องทำอะไรต่อ"
 *
 * ⚠️ **สถานะทุกบรรทัดมาจาก API** (`productSpecLineState`) ไม่ใช่คิดที่จอ — จอที่คิดเอง
 * จะยอมคนละอย่างกับที่ API ยอม (กับดักเดียวกับที่ form-design-rules §2 เตือน)
 *
 * ⚠️ **บรรทัดที่ยังออกเอกสารไม่ได้ก็ขึ้น** พร้อมเหตุติดปุ่ม — ซ่อนเมื่อไร คนจะไปหา
 * ทางออกเอกสารที่อื่นแทนที่จะรู้ว่าติดอะไร (กฎ ui-visibility-rule)
 */
export default function SalesOrderFollowUpDocs({ orderId, onChanged }) {
  /* ⚠️ **ไม่ใช่ `canEdit` ของใบสั่งขาย** — ใบที่อนุมัติแล้วแก้เนื้อไม่ได้ (ตามที่ควรเป็น)
     แต่ *นั่นคือจังหวะเดียว* ที่ออกเอกสารต่อเนื่องได้ ⇒ ส่งด่านของใบมาที่นี่เท่ากับปิดปุ่ม
     ไว้ตลอดกาล · ด่านของงานนี้คือ cap ของฝ่ายขาย ส่วนขอบเขตรายแถวบังคับที่ API */
  const canEdit = useCan("salesplan:edit");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyLine, setBusyLine] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await apiJson(`/api/sales-planning/sales-orders/${orderId}/spec-issues`, {
        fallbackError: "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ",
      });
      setRows(next?.rows || []);
      setError("");
    } catch (loadError) {
      /* ใบย้อนหลังตอบ 400 พร้อมเหตุ — เป็นคำตอบ ไม่ใช่ความผิดพลาด จึงโชว์เป็นข้อความ
         ธรรมดา ไม่ใช่แถบแดง (ดู `loadOrder` ของเส้น spec-issues) */
      setError(loadError.message || "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ");
    } finally {
      setLoaded(true);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const issue = async (lineId) => {
    setBusyLine(lineId);
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${orderId}/spec-issues`, {
        method: "POST",
        json: { salesOrderLineId: lineId },
        fallbackError: "ออกเอกสารไม่สำเร็จ",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "ออกเอกสารไม่สำเร็จ");
      await load();
      onChanged?.();
    } catch (issueError) {
      setError(issueError.message || "ออกเอกสารไม่สำเร็จ");
    } finally {
      setBusyLine("");
    }
  };

  if (!loaded) return null;
  // ไม่มีบรรทัดในขอบเขตเลย (ใบที่ขายแต่ค่าออกแบบ/รายได้อื่น) = ไม่มีการ์ดนี้ทั้งใบ
  const inScope = rows.filter((row) => row.state?.kind !== "out_of_scope");
  if (!inScope.length && !error) return null;

  return (
    <DetailCard
      icon={Files}
      eyebrow="FOLLOW-UP DOCS"
      title="เอกสารต่อเนื่อง"
      meta="ใบที่ออกต่อจากใบสั่งขายที่อนุมัติแล้ว — ใบสเปคเป็นใบของสินค้า ออกซ้ำได้ทุกรอบขาย"
    >
      {error ? <div className={styles.notice}><StatusNotice tone="info">{error}</StatusNotice></div> : null}

      {inScope.length ? (
        <TableScroll family="list" surface="embedded">
          <table>
            <thead>
              <tr>
                <th className={styles.colForm}>แบบฟอร์ม</th>
                <th>ผูกกับ</th>
                <th className={styles.colDoc}>เลขที่เอกสารรอบนี้</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={styles.colAction} aria-label="การกระทำ" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = row.state || {};
                const action = specLineAction(state, { canEdit });
                return (
                  <tr key={row.line.id}>
                    <td className="mono">FM-SA-04</td>
                    <td>
                      <div className={styles.lineName}>{naText(row.line.description)}</div>
                      <div className={`mono ${styles.lineCode}`}>{naText(row.line.fgCode)}</div>
                    </td>
                    <td>
                      {state.docNo ? (
                        <>
                          <div className="mono">{state.docNo}</div>
                          <div className={styles.lineCode}>สเปก {state.revLabel}</div>
                        </>
                      ) : (
                        <>
                          <div className={styles.lineCode}>{naText(null)}</div>
                          {state.revLabel ? <div className={styles.lineCode}>สเปก {state.revLabel} · มีอยู่แล้ว</div> : null}
                        </>
                      )}
                    </td>
                    <td>
                      <div>{naText(state.label)}</div>
                      {state.reason && state.kind === "out_of_scope"
                        ? <div className={styles.lineCode}>{state.reason}</div>
                        : null}
                    </td>
                    <td>
                      {action ? (
                        <div className={styles.actionCell}>
                          {/* ⚠️ "เปิดใบ" กับ "สร้างใบสเปค" เป็นการ **เดินทาง** ไม่ใช่การเขียน
                              ⇒ เป็นลิงก์จริง (เปิดแท็บใหม่/ก๊อป URL ได้) · มีแต่ "ออกเอกสารรอบนี้"
                              ที่เป็นปุ่ม POST เพราะมันกินเลขจากตัวนับ */}
                          {action.kind === "issue" ? (
                            <Button
                              tone="primary"
                              variant="outline"
                              size="sm"
                              disabled={action.disabled || busyLine === row.line.id}
                              title={action.reason || undefined}
                              onClick={() => issue(row.line.id)}
                            >
                              {busyLine === row.line.id ? "กำลังออกเอกสาร…" : action.label}
                            </Button>
                          ) : action.disabled ? (
                            <Button tone="primary" variant="outline" size="sm" disabled title={action.reason || undefined}>
                              {action.label}
                            </Button>
                          ) : (
                            /* ⚠️ ปุ่มในตารางเป็น **เส้นขอบ** ทุกใบ — terracotta แบบทึบสงวนไว้
                               หน้าละหนึ่งปุ่ม (กติกาสีของดีไซน์ซิสเต็ม) และตารางนี้มีได้
                               หลายแถว ⇒ ทึบทุกแถวคือหน้าที่มีปุ่ม "เริ่มของใหม่" สามปุ่ม */
                            <Button as={Link} href={`/database/products/${row.line.productId}/spec`}
                              tone={action.kind === "create" ? "accent" : "primary"}
                              variant="outline"
                              size="sm" icon={action.kind === "open" ? <ExternalLink size={13} /> : undefined}>
                              {action.label}
                            </Button>
                          )}
                          {action.disabled && action.reason
                            ? <p className={styles.blockedReason} role="status">{action.reason}</p>
                            : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      ) : null}

      <p className={`form-note ${styles.footNote}`}>
        FM-SA-04 หนึ่งใบต่อหนึ่งสินค้า — Rev. ขยับเมื่อสเปกเปลี่ยน ส่วนเลขที่เอกสารออกใหม่
        ทุกครั้งที่ออกตามใบสั่งขาย · ขึ้นเฉพาะบรรทัดหมวด 01 และ 02 ·
        FM-SA-07 (รายงานติดตามคำสั่งซื้อ) จะมาในรอบถัดไป
      </p>
    </DetailCard>
  );
}
