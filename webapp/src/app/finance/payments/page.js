"use client";
// ── ทะเบียนการชำระ รวมทุกใบสั่งขาย (โมดูลบัญชีและการเงิน) ─────────────────
//
// > *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว ซึ่งราคาต้องมีการอ้างอิง
// >  QT SO และสามารถดาวน์โหลด"* (มติผู้ใช้ 2026-08-13)
//
// ⭐ **หน้านี้อ่านอย่างเดียว** — ปุ่มคอนเฟิร์ม/ตีกลับงวดอยู่ที่ใบ SO ตามเดิม แถวจึงกด
// แล้วเด้งไปที่ใบ · เปิดทางกดที่นี่อีกชุดเมื่อไรก็ได้ด่านสองชุดที่เพี้ยนหากัน และคนกด
// คอนเฟิร์มจะมองไม่เห็นหลักฐานที่แนบมากับงวดซึ่งอยู่บนใบ
//
// ⚠️ ตัวกรองเก็บใน URL — บัญชีส่งลิงก์ "งวดที่เลยกำหนดของเดือนนี้" ให้กันได้ และ
// ปุ่มดาวน์โหลดใช้ query ชุดเดียวกัน ⇒ ไฟล์ที่ได้ตรงกับที่เห็นบนจอเสมอ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, CircleDollarSign, FileSpreadsheet, Search, Wallet } from "lucide-react";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { fmtDate, fmtMoney } from "@/lib/format";
import { LEDGER_STATUS, LEDGER_STATUS_KEYS } from "@/lib/finance/paymentLedger";

export default function FinancePaymentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState({ rows: [], summary: null, totalRows: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  // ── ตัวกรองอยู่ใน URL ─────────────────────────────────────────────────
  const status = params.get("status") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const q = params.get("q") || "";
  const overdue = params.get("overdue") === "1";

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (q) sp.set("q", q);
    if (overdue) sp.set("overdue", "1");
    return sp;
  }, [status, from, to, q, overdue]);

  const setFilter = useCallback((key, value) => {
    const sp = new URLSearchParams(query);
    if (value) sp.set(key, value); else sp.delete(key);
    router.replace(`/finance/payments${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }, [query, router]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/finance/payments?${query}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "โหลดทะเบียนการชำระไม่สำเร็จ");
      setData({ rows: body.rows || [], summary: body.summary, totalRows: body.totalRows || 0 });
    } catch (loadError) { setError(loadError.message); }
    setLoading(false);
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const rows = data.rows;
  const summary = data.summary;
  const { page, setPage, pageCount, pageSize, setPageSize, pageRows, total } = usePagination(rows);

  /* ⚠️ ดาวน์โหลดผ่าน blob ไม่ใช่เปิดแท็บใหม่ — endpoint ต้องการ cookie เซสชัน
     และแท็บใหม่ที่ถูกเด้งไปหน้า login จะดูเหมือนปุ่มพัง */
  const download = async () => {
    setDownloading(true); setError("");
    try {
      const sp = new URLSearchParams(query);
      sp.set("format", "xlsx");
      const res = await fetch(`/api/finance/payments?${sp}`, { cache: "no-store" });
      if (!res.ok) throw new Error("ดาวน์โหลดไม่สำเร็จ");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1]
        || "payment-ledger.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); }
    setDownloading(false);
  };

  const filtering = Boolean(status || from || to || q || overdue);

  return (
    <Workspace
      icon={<Wallet size={22} />}
      title="ทะเบียนการชำระ"
      subtitle="งวดชำระของทุกใบสั่งขายในที่เดียว — อ้างอิงเลขที่ SO และ QT ทุกยอด"
      headerRight={(
        <Button onClick={download} disabled={downloading || !rows.length}>
          <FileSpreadsheet size={16} /> {downloading ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลด Excel"}
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error" role="alert" action={<Button size="sm" onClick={load}>ลองใหม่</Button>}>{error}</StatusNotice>}

        {/* ⚠️ **แยก "เก็บได้แล้ว" ออกจาก "รอบัญชีรับรอง"** — ยอดที่ SA แจ้งว่าเข้าแล้ว
            แต่บัญชียังไม่คอนเฟิร์ม ไม่ใช่เงินที่เก็บได้ (กติกาจาก mig 0245) · รวมช่อง
            เดียวเมื่อไรเท่ากับให้ฝ่ายขายกดเองแล้วตัวเลขขึ้นเอง */}
        {summary && (
          <MetricStrip aria-label="สรุปยอดของงวดที่กำลังแสดง">
            <Metric icon={<CircleDollarSign />} label="เก็บได้แล้ว" value={fmtMoney(summary.collectedAmount)} note="เฉพาะงวดที่บัญชีคอนเฟิร์ม" tone="good" />
            <Metric
              as="button" type="button"
              icon={<Wallet />} label="รอบัญชีรับรอง" value={fmtMoney(summary.awaitingAmount)}
              note={`${summary.awaitingCount} งวดที่ฝ่ายขายแจ้งแล้ว`}
              tone={summary.awaitingCount ? "warning" : undefined}
              onClick={() => setFilter("status", "reported")}
            />
            <Metric icon={<Wallet />} label="ค้างรับทั้งหมด" value={fmtMoney(summary.outstandingAmount)} note="ทุกงวดที่ยังไม่ถูกคอนเฟิร์ม" />
            <Metric
              as="button" type="button"
              icon={<AlarmClock />} label="เลยกำหนด" value={`${summary.overdueCount} งวด`}
              note={fmtMoney(summary.overdueAmount)}
              tone={summary.overdueCount ? "danger" : "good"}
              onClick={() => setFilter("overdue", overdue ? "" : "1")}
            />
          </MetricStrip>
        )}

        <WorkspaceSection
          icon={<Wallet size={17} />}
          title="งวดชำระทั้งหมด"
          subtitle="เรียงของที่ต้องตามก่อน — เลยกำหนด แล้วรอบัญชีตรวจ แล้วตามกำหนดชำระ"
          actions={<span className="ui-badge">{rows.length} งวด{filtering && data.totalRows ? ` จาก ${data.totalRows}` : ""}</span>}
        >
          <div className="toolbar">
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" />
              <input
                defaultValue={q}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="ค้นหาเลข SO / QT / ลูกค้า / ชื่องวด"
              />
            </div>
            <Select value={status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">ทุกสถานะ</option>
              {LEDGER_STATUS_KEYS.map((key) => <option key={key} value={key}>{LEDGER_STATUS[key].label}</option>)}
            </Select>
            {/* ⚠️ ช่วงวันกรองที่ **กำหนดชำระ** ไม่ใช่วันจ่ายจริง — คำถามของบัญชีคือ
                "เดือนนี้ต้องเก็บอะไรบ้าง" · ป้ายจึงต้องบอกให้ชัดว่ากรองอะไรอยู่ */}
            <DateInput value={from} onChange={(v) => setFilter("from", v)} ariaLabel="กำหนดชำระตั้งแต่" title="กรองที่กำหนดชำระ — ตั้งแต่" />
            <DateInput value={to} onChange={(v) => setFilter("to", v)} ariaLabel="กำหนดชำระถึง" title="กรองที่กำหนดชำระ — ถึง" />
            {filtering && (
              <Button size="sm" variant="quiet" onClick={() => router.replace("/finance/payments", { scroll: false })}>
                ล้างตัวกรอง ×
              </Button>
            )}
            <div className="spacer" />
          </div>

          <TableScroll surface="embedded" cells="stacked" minWidth={1080} aria-busy={loading}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>เลขที่ SO</th>
                    <th>อ้างอิง QT</th>
                    <th>ลูกค้า</th>
                    <th>งวด</th>
                    <th className="num">ยอดงวด</th>
                    <th>กำหนดชำระ</th>
                    <th>จ่ายจริง</th>
                    <th>สถานะ</th>
                    <th>ผู้รับรอง</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    /* กดแถวแล้วไปที่ **ใบ** ไม่ใช่หน้ารายละเอียดงวด — งวดไม่มีหน้าของ
                       ตัวเอง และสิ่งที่คนกดต้องการต่อคือหลักฐานกับปุ่มคอนเฟิร์มซึ่งอยู่บนใบ */
                    <DetailRow key={row.id} href={`/sa/sales-orders/${row.orderId}`} className="premium-row">
                      <td><Link prefetch={false} href={`/sa/sales-orders/${row.orderId}`} className="linklike mono"><strong>{row.orderNumber || "-"}</strong></Link></td>
                      <td>
                        {row.quotationId
                          ? <Link prefetch={false} href={`/sa/quotations/${row.quotationId}`} className="linklike mono">{row.quoteNumber || "-"}</Link>
                          : <span className="mono">{row.quoteNumber || "-"}</span>}
                      </td>
                      <td>
                        {row.customerCode ? <span className="ar-code ar-code-block">{row.customerCode}</span> : null}
                        {row.customerName || "-"}
                      </td>
                      <td>
                        {row.label || `งวดที่ ${row.seq}`}
                        <span className="cell-sub">งวดที่ {row.seq} · {row.percent}%</span>
                      </td>
                      <td className="num mono">{fmtMoney(row.amount)}</td>
                      {/* เลยกำหนดย้อมที่ **ช่องวันที่** ไม่ใช่ทั้งแถว — ทั้งแถวแดงอ่านเหมือน
                          ข้อมูลผิด ส่วนช่องเดียวบอกว่า "วันนี้แหละที่มีปัญหา" */}
                      <td className={row.overdue ? "cell-num-bad" : undefined} title={row.overdue ? "เลยกำหนดแล้วและยังไม่ถูกคอนเฟิร์ม" : undefined}>
                        {row.dueDate ? fmtDate(row.dueDate) : <span className="cell-quiet">ยังไม่กำหนด</span>}
                      </td>
                      <td>{row.paidOn ? fmtDate(row.paidOn) : "-"}</td>
                      <td><StatusBadge tone={LEDGER_STATUS[row.status]?.tone}>{row.statusLabel}</StatusBadge></td>
                      <td>{row.confirmedByName || (row.reportedByName ? <span className="cell-quiet">แจ้งโดย {row.reportedByName}</span> : "-")}</td>
                    </DetailRow>
                  ))}
                  {!rows.length && !loading && (
                    <TableEmpty
                      colSpan={9}
                      title={filtering ? "ไม่มีงวดที่ตรงกับตัวกรอง" : "ยังไม่มีงวดชำระในระบบ"}
                      description={filtering
                        ? "ลองขยายช่วงวันหรือล้างตัวกรอง"
                        : "งวดเกิดขึ้นเองตอน AE Supervisor อนุมัติใบสั่งขาย"}
                      action={filtering
                        ? <Button size="sm" onClick={() => router.replace("/finance/payments", { scroll: false })}>ล้างตัวกรอง</Button>
                        : undefined}
                    />
                  )}
                </tbody>
              </table>
          </TableScroll>

          {rows.length > 0 && (
            <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          )}
        </WorkspaceSection>

        {/* ⚠️ บอกตรง ๆ ว่าไฟล์ที่ได้คือของที่กรองไว้ — คนกดปุ่มขณะกรองอยู่แล้วได้ทั้ง
            ทะเบียนมาคือไฟล์ที่เอาไปกระทบยอดผิด และไม่มีอะไรบนจอบอกว่าต่างกัน */}
        <p className="form-note">
          ไฟล์ Excel ที่ดาวน์โหลดคือ<strong>รายการที่กรองไว้ตอนนี้</strong> ({rows.length} งวด)
          คอลัมน์ชุดเดียวกับตารางบนจอ
        </p>
      </div>
    </Workspace>
  );
}
