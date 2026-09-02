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
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Download, Layers, Link2, Pencil } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
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
/* ปีที่เลือกได้ในรายงาน — ปีนี้ ย้อนหลัง 2 ปี และปีหน้า (แผนผลิตมองข้ามปีเสมอ ·
   ของจริง: ดีลที่ปิดปีนี้แต่ส่งของปี 2027 มี 8,176,500 บาท)
   ⚠️ ห้ามอ่านนาฬิกาตอนเรนเดอร์ (กติกา thai-time) — คิดครั้งเดียวตอนโหลดโมดูล */
const THIS_YEAR = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));
const YEARS = [THIS_YEAR + 1, THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2].map(String);

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
  /* กองที่สาม: ของที่ต้องไปกรอกเอง ไม่ใช่ของที่กดรับได้ตรงนี้ — ปุ่มจึงเป็น "เปิดดีล"
     อย่างเดียว · รายงาน FC วางแผนผลิตอ่านเดือนจาก "วันที่สิ้นสุด" ⇒ ดีลที่ไม่มีวันนี้
     ทำให้ทั้งไฟล์ต้องเดาเดือนจากวันปิดการขายแทน */
  { key: "missingDates", label: "ยังไม่มีวันรับของ", icon: CalendarClock,
    lead: "รายงาน FC วางแผนผลิตอ่านเดือนจาก \"วันที่สิ้นสุด\" (วันที่ลูกค้าต้องการรับของ) — ดีลพวกนี้ยังไม่ได้กรอก รายงานจึงต้องเดาเดือนจากวันปิดการขายแทน · เปิดดีลแล้วกรอกให้ครบ",
    empty: "ทุกดีลมีวันเริ่มและวันรับของครบแล้ว 🎉" },
];

export default function ForecastReviewPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ total: 0, mismatch: 0, sync: 0, multiple: 0, missingDates: 0 });
  const [missingDates, setMissingDates] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [year, setYear] = useState(String(THIS_YEAR));
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
      setMissingDates(data?.missingDates || []);
      setCounts(data?.counts || { total: 0, mismatch: 0, sync: 0, multiple: 0, missingDates: 0 });
      setError("");
    } catch (loadError) {
      setError(loadError.message || "โหลดคิวไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const shown = useMemo(
    () => (kind === "missingDates" ? missingDates : rows.filter((row) => row.kind === kind)),
    [rows, missingDates, kind],
  );
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

  /* ⚠️ ต้องผ่าน `apiFetch` แล้วสร้าง blob เอง — เปิดแท็บใหม่ไปที่ URL ตรง ๆ ไม่ได้
     เพราะเส้นนี้ต้องมีเซสชัน แท็บใหม่ที่ถูกเด้งไปหน้า login จะดูเหมือนปุ่มพัง
     (แพตเทิร์นเดียวกับปุ่มดาวน์โหลดของทะเบียนชำระ) */
  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await apiFetch(`/api/sales-planning/forecast-report?year=${year}`, { cache: "no-store" });
      if (!res.ok) throw new Error("ดาวน์โหลดรายงานไม่สำเร็จ");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1]
        || "FC-by-category.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      setError("");
    } catch (downloadError) {
      setError(downloadError.message || "ดาวน์โหลดรายงานไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  };

  if (!canView) return <AccessDenied />;

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="ตรวจที่มาของ FC"
      subtitle="ดีลที่มีใบเสนอราคาอนุมัติแล้ว แต่ยอด FC ยังไม่ได้เดินตามใบ — กดรับทีละดีล"
      headerRight={(
        <div className={styles.reportBar}>
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="ปีของรายงาน">
            {YEARS.map((option) => <option key={option} value={option}>ปี {option}</option>)}
          </Select>
          <Button variant="ghost" size="sm" disabled={downloading} onClick={downloadReport}>
            <Download size={14} aria-hidden="true" /> {downloading ? "กำลังสร้างไฟล์…" : "รายงาน FC รายหมวด (Excel)"}
          </Button>
        </div>
      )}
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

      {/* กองวันที่ขาด = ตารางคนละทรง (ไม่มีใบให้เลือก มีแต่ปุ่มไปกรอก) ⇒ แยกตาราง
          ไม่ยัดเป็นคอลัมน์ว่างในตารางเดิม ซึ่งจะอ่านเหมือนข้อมูลหาย */}
      {kind === "missingDates" && shown.length ? (
        <TableScroll family="list" cells="stacked" minWidth={780}>
          <table>
            <thead>
              <tr>
                <th>ดีล</th>
                <th>ผู้รับผิดชอบ</th>
                <th className="num">FC</th>
                <th>ช่องที่ขาด</th>
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
                  </td>
                  <td>
                    {naText(row.ownerName)}
                    <small className={styles.sub}>{naText(row.team)}</small>
                  </td>
                  <td className="num">
                    {fmtMoney(row.currentValue)}
                    <small className={styles.sub}>{naText(row.stage)}</small>
                  </td>
                  <td>
                    <div className={styles.choices}>
                      {row.gaps.includes("startDate") ? <span className={styles.multi}>วันที่เริ่ม</span> : null}
                      {row.gaps.includes("endDate") ? <span className={styles.multi}>วันที่สิ้นสุด (ลูกค้ารับ)</span> : null}
                    </div>
                    <small className={styles.sub}>วันปิดการขาย {naText(row.expectedCloseDate)}</small>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Button as={Link} href={`/sa/deals/${row.id}`} variant="ghost" size="sm">
                        เปิดดีลไปกรอก <ArrowRight size={13} aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}

      {kind !== "missingDates" && shown.length ? (
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
