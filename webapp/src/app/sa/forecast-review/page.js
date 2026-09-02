"use client";

/* คิว "FC ยังไม่ตรงใบเสนอราคา" (mig 0337 · มติผู้ใช้ 2026-09-02)
 *
 * ⭐ เหตุผลที่หน้านี้มีอยู่ = **มติว่าจะไม่ backfill** · ตอนตัดสินใจวัดของจริงแล้ว:
 *    ถ้าย้าย FC ตามใบให้เองทั้งหมด ยอดรวมดีลเปิดจะกระโดด 11,787,687 → 18,562,464
 *    (+6,774,777) โดยไม่มีใครกด และ 6 ดีลใน 23 ดีลนั้น FC จะ **ลดลง** — เคสจริงที่
 *    แย่ที่สุดคือ ODM_NOURA FC 250,000 แต่ใบเดียวที่อนุมัติคือใบตัวอย่าง 500 บาท
 *    ⇒ ตัวเลขระดับนี้ต้องมีคนรับผิดชอบต่อใบ ไม่ใช่ผลข้างเคียงของการ deploy
 *
 * สองกองในหน้าเดียว:
 *   ไม่ตรงใบ   ใบอนุมัติฉบับเดียว แต่ FC ยังเป็นยอดที่กรอกไว้ → กดรับยอดใบ
 *   หลายฉบับ   ใบอนุมัติหลายเลขที่ → ระบบไม่เดา เลือกเองว่าใบไหนคือ FC
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Layers, Link2, Pencil } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, naText } from "@/lib/format";
import AccessDenied from "@/components/ui/AccessDenied";
import styles from "./page.module.css";

/* สามกอง ไม่ใช่สอง — 27 ใน 50 ดีลของกองแรกตอนวัดจริงคือ "ยอดตรงอยู่แล้ว ต่างแค่ที่มา"
   ถ้าเหมารวมกัน คนอ่านจะนึกว่ามีตัวเลขต้องแก้ 50 ที่ ทั้งที่จริงมี 23 */
/* สองกอง — ต่างกันที่ "กดแล้วตัวเลขขยับมั้ย" ห้ามยุบรวม (ของจริงตอนวัด 23 vs 27)
   ⚠️ กอง "มีหลายฉบับ" ถูกถอดออกแล้ว (มติผู้ใช้ 2026-09-02 รอบสาม) — ระบบเดินตาม
      ใบยอดต่ำสุดให้เอง ไม่มีอะไรรอคนตัดสิน · ดีลพวกนั้นติดป้าย `multiple` ในแถวแทน */
const KINDS = [
  { key: "mismatch", label: "ยอดต่างจากใบ", icon: ClipboardCheck,
    lead: "ยอดบนใบที่อนุมัติแล้วต่างจากยอด FC ที่กรอกไว้ — กดแล้วตัวเลข FC จะขยับจริง ระบบไม่เปลี่ยนให้เอง เพราะบางดีล FC จะลดลง",
    empty: "ไม่มีดีลที่ยอด FC ต่างจากใบแล้ว 🎉" },
  { key: "sync", label: "ยอดตรงแล้ว", icon: Link2,
    lead: "ยอดตรงกันอยู่แล้ว — กดแล้ว FC ไม่ขยับสักบาท เปลี่ยนแค่ให้ดีลเดินตามใบ ฉบับแก้ครั้งหน้าจะตามเองโดยไม่ต้องมากดอีก",
    empty: "ไม่มีดีลที่รอผูกกับใบแล้ว 🎉" },
];

export default function ForecastReviewPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ total: 0, mismatch: 0, sync: 0, multiple: 0 });
  const [kind, setKind] = useState("mismatch");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson("/api/sales-planning/forecast-review");
      setRows(data?.rows || []);
      setCounts(data?.counts || { total: 0, mismatch: 0, sync: 0, multiple: 0 });
      setError("");
    } catch (loadError) {
      setError(loadError.message || "โหลดคิวไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const shown = useMemo(() => rows.filter((row) => row.kind === kind), [rows, kind]);
  const active = KINDS.find((item) => item.key === kind) || KINDS[0];

  /* ⚠️ ทุกการกดต้องบอกตัวเลข **ก่อน → หลัง** ในโมดัล (กฎ approvalPrompt ของระบบ:
     การอนุมัติทุกชนิดต้องบอกผลลัพธ์ก่อนกด) · ที่นี่สำคัญเป็นพิเศษเพราะบางแถว FC ลดลง */
  const choose = useCallback(async (row, quotation) => {
    const delta = quotation.value - row.currentValue;
    /* ⚠️ กอง sync ส่วนต่างเป็นศูนย์ — เขียนว่า "เพิ่มขึ้น ฿0.00" คนอ่านจะสะดุด
       และเข้าใจผิดว่ากำลังจะมีตัวเลขขยับ ทั้งที่ไม่มี */
    const effect = Math.abs(delta) < 0.005
      ? `FC คงที่ ${fmtMoney(row.currentValue)} บาท — เปลี่ยนแค่ที่มาให้เดินตามใบ ฉบับแก้ครั้งหน้าจะตามเอง`
      : `FC ${fmtMoney(row.currentValue)} → ${fmtMoney(quotation.value)} บาท (${delta >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${fmtMoney(Math.abs(delta))})`;
    const okToGo = await confirmAction({
      title: "เปลี่ยนที่มาของ FC",
      description: `ดีล "${row.title}" จะให้ FC เดินตามใบ ${quotation.quoteNumber}\n\n${effect}\n\nยอดที่กรอกไว้เดิม ${fmtMoney(row.manualValue)} บาท ยังถูกเก็บไว้ กลับไปใช้ได้ตลอด`,
      confirmLabel: "ใช้ยอดใบนี้",
    });
    if (!okToGo) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/sales-planning/deals/${row.id}/forecast-source`, {
        method: "POST",
        json: { source: "quotation", quotationId: quotation.id },
        fallbackError: "เปลี่ยนที่มาของ FC ไม่สำเร็จ",
      });
      setInfo(`ดีล "${row.title}" — FC เดินตามใบ ${quotation.quoteNumber} แล้ว`);
      await load();
    } catch (saveError) {
      setError(saveError.message || "เปลี่ยนที่มาของ FC ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }, [load]);

  const keepManual = useCallback(async (row) => {
    const okToGo = await confirmAction({
      title: "คงยอดที่กรอกเอง",
      description: `ดีล "${row.title}" จะใช้ยอดที่กรอกไว้ ${fmtMoney(row.manualValue)} บาท ต่อไป และ **ไม่** เดินตามใบเสนอราคาให้อัตโนมัติอีก\n\nเปลี่ยนใจได้ที่หน้าดีล`,
      confirmLabel: "คงยอดเดิม",
    });
    if (!okToGo) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/sales-planning/deals/${row.id}/forecast-source`, {
        method: "POST",
        json: { source: "manual" },
        fallbackError: "บันทึกไม่สำเร็จ",
      });
      setInfo(`ดีล "${row.title}" — คงยอดที่กรอกเองไว้`);
      await load();
    } catch (saveError) {
      setError(saveError.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }, [load]);

  if (!canView) return <AccessDenied />;

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="ตรวจที่มาของ FC"
      subtitle="ดีลที่มีใบเสนอราคาอนุมัติแล้ว แต่ยอด FC ยังไม่ได้เดินตามใบ — กดรับทีละดีล"
      loading={loading}
      toolbar={(
        <div className={styles.tabs} role="tablist">
          {KINDS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={kind === item.key}
                className={styles.tab}
                data-active={kind === item.key ? "true" : undefined}
                onClick={() => setKind(item.key)}
              >
                <Icon size={15} aria-hidden="true" />
                {item.label}
                <span className={styles.count}>{counts[item.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}
    >
      {error ? <StatusNotice tone="danger" onDismiss={() => setError("")}>{error}</StatusNotice> : null}
      {info ? <StatusNotice tone="success" onDismiss={() => setInfo("")}>{info}</StatusNotice> : null}

      <p className={styles.lead}>{active.lead}</p>

      {!loading && !shown.length ? (
        <EmptyState icon={CheckCircle2}>{active.empty}</EmptyState>
      ) : null}

      {shown.length ? (
        <TableScroll family="list" cells="stacked" minWidth={880}>
          <table>
            <thead>
              <tr>
                <th>ดีล</th>
                <th>ผู้รับผิดชอบ</th>
                <th className="num">FC ตอนนี้</th>
                <th>ยอดตามใบ</th>
                <th aria-label="การทำงาน" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/sa/deals/${row.id}`} className="linklike mono">{naText(row.code)}</Link>
                    <small className={styles.sub}>{naText(row.title)}</small>
                    <small className={styles.sub}>{naText(row.customerName)}</small>
                    {row.multiple ? (
                      <small className={styles.multi}>
                        <Layers size={11} aria-hidden="true" /> มี {row.candidates.length} ใบ — ระบบใช้ใบยอดต่ำสุด
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {naText(row.ownerName)}
                    <small className={styles.sub}>{naText(row.team)}</small>
                  </td>
                  <td className="num">
                    {fmtMoney(row.currentValue)}
                    <small className={styles.sub}>{row.source === "quotation" ? "ตามใบ" : "กรอกเอง"}</small>
                  </td>
                  <td>
                    <div className={styles.choices}>
                      {row.candidates.map((quotation) => {
                        const delta = quotation.value - row.currentValue;
                        return (
                          <button
                            key={quotation.id}
                            type="button"
                            className={styles.choice}
                            disabled={!row.canEdit || busyId === row.id}
                            onClick={() => choose(row, quotation)}
                          >
                            <span className="mono">{quotation.quoteNumber}</span>
                            <strong>{fmtMoney(quotation.value)}</strong>
                            {Math.abs(delta) < 0.005
                              ? <small data-dir="same">ยอดเท่าเดิม</small>
                              : (
                                <small data-dir={delta >= 0 ? "up" : "down"}>
                                  {delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(delta))}
                                </small>
                              )}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  {/* ⚠️ display:flex ต้องอยู่บน div ใน td ไม่ใช่บน td เอง — กฎระยะห่าง
                      ของตารางอยู่ที่ `.scroll[data-family] td` ถ้าเปลี่ยน display ของ td
                      เอง แถวจะหลุดจากกติกาการจัดชิดบน/ระยะในของตารางกลางทั้งชุด */}
                  <td>
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!row.canEdit || busyId === row.id}
                        onClick={() => keepManual(row)}
                        title={row.canEdit ? "" : "ดีลนี้ไม่ได้อยู่ในขอบเขตที่คุณแก้ได้"}
                      >
                        <Pencil size={13} aria-hidden="true" /> คงยอดเดิม
                      </Button>
                      <Button as={Link} href={`/sa/deals/${row.id}`} variant="ghost" size="sm">
                        เปิดดีล <ArrowRight size={13} aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
    </Workspace>
  );
}
