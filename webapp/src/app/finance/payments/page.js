"use client";
// ── ทะเบียนการชำระ รวมทุกใบสั่งขาย (โมดูลบัญชีและการเงิน) ─────────────────
//
// > *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว ซึ่งราคาต้องมีการอ้างอิง
// >  QT SO และสามารถดาวน์โหลด"* (มติผู้ใช้ 2026-08-13)
//
// ⭐ **สองส่วน: คิวงานอยู่บน · ทะเบียนอยู่ล่าง** (มติผู้ใช้ 2026-08-13)
// หน้านี้ถูกใช้เป็น "คิว" มาตลอดทั้งที่ชื่อ "ทะเบียน" ⇒ แยกของที่ **ต้องทำวันนี้**
// ออกมาไว้บนสุดและกดรับรองได้จากตรงนั้น ส่วนทะเบียนเต็มไว้ค้นและดาวน์โหลด
//
// ⚠️ **เดิมหน้านี้อ่านอย่างเดียว** โดยตั้งใจ (กฎสามชั้น: ทางลงมืออยู่บนเอกสารต้นทาง)
// ผู้ใช้ตัดสินให้เปิดทางกดที่นี่ด้วย · ความเสี่ยงสองข้อที่ยกไว้ตอนนั้นถูกปิดแล้ว:
//   · **ด่านยังชุดเดียว** — ปุ่มเรียก API ตัวเดิม (`installmentActionError` ที่ route ของใบ)
//     ไม่มีทางเขียนที่สอง ไม่มีด่านที่สอง
//   · **คนกดเห็นหลักฐานก่อน** — `InstallmentConfirmDialog` โชว์ไฟล์/วันจ่าย/ผู้แจ้ง
//     และเป็นโมดัล **ตัวเดียวกับ**ที่การ์ดบนใบ SO ใช้ (AGENTS.md: หนึ่งฟอร์ม สองทางเรียก)
// ⇒ กฎในเอกสารถูกแก้ให้ตรงกับของจริงแล้ว (docs/module-ownership-rule.md §ข้อ 3)
//
// ⚠️ ตัวกรองเก็บใน URL — บัญชีส่งลิงก์ "งวดที่เลยกำหนดของเดือนนี้" ให้กันได้ และ
// ปุ่มดาวน์โหลดใช้ query ชุดเดียวกัน ⇒ ไฟล์ที่ได้ตรงกับที่เห็นบนจอเสมอ
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, ChevronRight, CircleDollarSign, ExternalLink, FileSpreadsheet, Search, Wallet } from "lucide-react";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { LEDGER_STATUS, LEDGER_STATUS_KEYS, groupAsOrder, groupLedgerByOrder, groupNote, pendingConfirmations } from "@/lib/finance/paymentLedger";
import { salesOrderListTrack } from "@/lib/sales/salesOrderListTrack";
import SalesOrderTrack from "@/components/salesPlanning/SalesOrderTrack";
import InstallmentConfirmDialog from "@/components/salesPlanning/InstallmentConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import { MIN_REJECT_REASON } from "@/lib/sales/salesOrderPayments";
import styles from "./page.module.css";

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

  /* ⭐ **จับกลุ่มตามใบ แล้วแบ่งหน้าที่ระดับ "ใบ" ไม่ใช่ระดับ "งวด"** (มติผู้ใช้ 2026-08-13)
     แบ่งหน้าที่ระดับงวดเมื่อไร ใบที่มี 3 งวดจะถูกหั่นคาหน้า — กางแล้วเห็นไม่ครบ
     โดยไม่มีอะไรบนจอบอกว่าที่เหลืออยู่หน้าถัดไป */
  const groups = useMemo(() => groupLedgerByOrder(rows), [rows]);
  const { page, setPage, pageCount, pageSize, setPageSize, pageRows, total } = usePagination(groups);

  /* ยุบทั้งหมดตอนเปิดหน้า (มติผู้ใช้) — คนเปิดมาถามว่า "ใบไหนต้องตามบ้าง" ก่อน
     แล้วค่อยเจาะดูงวด · เก็บเป็น Set ของ key ที่ "กางอยู่" ไม่ใช่ที่ยุบอยู่
     ⚠️ รีเซ็ตเมื่อผลลัพธ์เปลี่ยน — ไม่งั้นกางใบหนึ่งไว้ พอกรองใหม่แล้ว key ค้างอยู่
     จะกางใบที่คนไม่ได้สั่งกาง */
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => { setExpanded(new Set()); }, [query]);
  const toggle = useCallback((key) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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

  /* ── คิวงานของบัญชี ────────────────────────────────────────────────────
     ⚠️ นับจาก **แถวที่กรองแล้ว** — ตัวกรองบนหน้าคุมทั้งคิวและทะเบียน ไม่งั้นกรองดู
     ลูกค้ารายเดียวแล้วคิวยังโชว์ของคนอื่น = สองส่วนบนหน้าเดียวพูดคนละเรื่อง */
  const queue = useMemo(() => pendingConfirmations(rows), [rows]);
  const [queueOpen, setQueueOpen] = useState(false);   // "ดูอีก n งวด"
  const [confirmFor, setConfirmFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");

  /* ⭐ เรียก **API ตัวเดิมของใบ** — ด่านจริงคือ `installmentActionError` ใน route นั้น
     ไม่สร้างเส้นเขียนที่สองให้ทะเบียน (ดูหัวไฟล์) */
  const runAction = useCallback(async (row, action, extra = {}) => {
    setActing(true); setActionError("");
    try {
      const res = await fetch(`/api/sales-planning/sales-orders/${row.orderId}/installments`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installmentId: row.id, action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(body.error || "ดำเนินการไม่สำเร็จ"); return false; }
      await load();
      return true;
    } catch (runError) {
      setActionError(runError.message);
      return false;
    } finally {
      setActing(false);
    }
  }, [load]);

  const filtering = Boolean(status || from || to || q || overdue);
  const QUEUE_PREVIEW = 3;
  const queueShown = queueOpen ? queue : queue.slice(0, QUEUE_PREVIEW);
  const queueTotal = queue.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

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

        {/* ── คิวงาน: สิ่งที่ต้องทำวันนี้ (มติผู้ใช้ 2026-08-13 · แบบ ข) ──────────
            ⚠️ ขึ้นเฉพาะตอนมีของให้ทำ — คิวว่างที่โชว์อยู่ตลอดคือเสียงรบกวน
            ⚠️ อยู่ **เหนือ** ทะเบียน เพราะคนเปิดหน้ามาเพื่อทำงาน ไม่ได้มาค้น */}
        {queue.length > 0 && (
          <WorkspaceSection
            icon={<Wallet size={17} />}
            title={`รอคุณรับรอง ${queue.length} งวด · ${fmtMoney(queueTotal)}`}
            subtitle="ฝ่ายขายแจ้งว่าเงินเข้าแล้ว รอบัญชียืนยัน — กดดูหลักฐานก่อนรับรองได้"
          >
            {actionError ? <StatusNotice tone="error" role="alert">{actionError}</StatusNotice> : null}
            <div className={styles.queue}>
              {queueShown.map((row) => (
                <div key={row.id} className={`${styles.qrow} ${row.overdue ? styles.qrowLate : ""}`.trim()}>
                  <div className={styles.qmain}>
                    <div>
                      <Link
                        prefetch={false}
                        href={`/sa/sales-orders/${row.orderId}#payment`}
                        target="_blank" rel="noreferrer"
                        className={`linklike mono ${styles.openLink}`}
                        title="เปิดใบในแท็บใหม่"
                      >
                        <strong>{row.orderNumber}</strong>
                        <ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
                      </Link>
                      <span className={styles.qsep}>·</span>
                      <span>{row.label || `งวดที่ ${row.seq}`}</span>
                      {row.overdue ? <span className={styles.qlate}>เลยกำหนด</span> : null}
                    </div>
                    <span className="cell-sub">
                      {row.customerName}
                      {row.reportedByName ? ` · แจ้งโดย ${row.reportedByName}` : ""}
                      {row.paidOn ? ` · จ่ายจริง ${fmtDate(row.paidOn)}` : ""}
                      {` · หลักฐาน ${row.evidenceCount} ไฟล์`}
                    </span>
                  </div>
                  <span className={styles.qamt}>{fmtMoney(row.amount)}</span>
                  <Button size="sm" tone="accent" disabled={acting} onClick={() => setConfirmFor(row)}>
                    ยืนยันว่าเงินเข้า
                  </Button>
                  {/* ตีกลับเป็นการถอย ไม่ใช่ก้าวถัดไป ⇒ ปุ่มรอง ไม่ใช่ปุ่มเด่น */}
                  <Button size="sm" variant="quiet" disabled={acting} onClick={() => setRejectFor({ row, reason: "" })}>
                    ตีกลับ
                  </Button>
                </div>
              ))}
              {queue.length > QUEUE_PREVIEW && (
                <div className={styles.qmore}>
                  <Button size="sm" variant="quiet" onClick={() => setQueueOpen((v) => !v)}>
                    {queueOpen ? "ย่อคิว" : `ดูอีก ${queue.length - QUEUE_PREVIEW} งวด`}
                  </Button>
                </div>
              )}
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection
          icon={<Wallet size={17} />}
          title="งวดชำระทั้งหมด"
          subtitle="รวมงวดของใบเดียวกันไว้ด้วยกัน กดที่แถวเพื่อกางดูรายงวด — เรียงใบที่ต้องตามก่อน"
          actions={<span className="ui-badge">{groups.length} ใบ · {rows.length} งวด{filtering && data.totalRows ? ` จาก ${data.totalRows}` : ""}</span>}
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
                  {/* ⭐ 9 → 6 คอลัมน์ (มติผู้ใช้ 2026-08-13 · แบบ ก)
                      · "งวด" กับ "ยอดงวด" เคยพูดเรื่องเดียวกันสองครั้ง ⇒ ยุบเป็นช่องเดียว
                        ที่ **ยอดค้างรับเป็นตัวเด่น** ซึ่งเป็นเลขที่บัญชีตามจริง
                      · "จ่ายจริง" กับ "ผู้รับรอง" เป็นของ **รายงวด** ⇒ อยู่ในแถวที่กางเท่านั้น
                      · ตัดคอลัมน์ "สถานะ" — สเตจบอกอยู่แล้ว สองอย่างซ้อนกันอ่านเหมือนขัดกัน */}
                  <tr>
                    <th>เอกสาร / ความคืบหน้า</th>
                    <th>ลูกค้า</th>
                    <th className="num">งวด</th>
                    <th className="num">ค้างรับ</th>
                    <th className="num">กำหนดถัดไป</th>
                    <th aria-label="เปิดใบ" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((group) => {
                    const open = expanded.has(group.key);
                    const note = groupNote(group);
                    const shaped = groupAsOrder(group);
                    const track = shaped ? salesOrderListTrack(shaped) : null;
                    return (
                      <Fragment key={group.key}>
                        {/* ── หัวใบ: ยุบอยู่โดยตั้งต้น (มติผู้ใช้ 2026-08-13) ──
                            ⚠️ ทั้งแถวกดเพื่อกาง **ไม่ใช่ลิงก์ไปใบ** — ปุ่มกางกับลิงก์
                            ในแถวเดียวกันจะแย่งการคลิกกัน · ทางไปใบอยู่ที่เลขที่ SO
                            ซึ่งเป็นลิงก์จริงและหยุด event ไม่ให้กางตาม */}
                        <tr
                          className={styles.groupRow}
                          onClick={() => toggle(group.key)}
                        >
                          <td>
                            <button
                              type="button"
                              className={styles.toggle}
                              aria-expanded={open}
                              aria-label={`${open ? "ยุบ" : "กาง"}งวดของ ${group.orderNumber}`}
                              onClick={(e) => { e.stopPropagation(); toggle(group.key); }}
                            >
                              <ChevronRight size={15} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`.trim()} aria-hidden="true" />
                            </button>
                            {" "}
                            {/* เลขที่ SO เป็นข้อความ ไม่ใช่ลิงก์ — ทางไปใบอยู่ที่ปุ่ม "เปิดใบ"
                                ท้ายแถว · ลิงก์ในเซลล์ที่ทั้งแถวกดกางได้ทำให้กดพลาดกันเอง */}
                            <span className="mono"><strong>{naText(group.orderNumber)}</strong></span>
                            {/* อ้างอิง QT เป็นบรรทัดรอง — เป็นที่มาของใบ ไม่ใช่ตัวใบเอง
                                (เลิกเป็นคอลัมน์ของตัวเองตอนยุบ 9 → 6) */}
                            <span className="cell-sub mono">{naText(group.quoteNumber)}</span>
                            {/* ⭐ รางสามขั้นชุดเดียวกับตารางรายการ SO (`salesOrderListTrack`)
                                — สองหน้านี้ตอบคำถามเดียวกัน จึงต้องใช้ตรรกะตัวเดียวกัน */}
                            {track ? <SalesOrderTrack steps={track.steps} /> : null}
                          </td>
                          <td>
                            {group.customerCode ? <span className="ar-code ar-code-block">{group.customerCode}</span> : null}
                            {naText(group.customerName)}
                          </td>
                          {/* เก็บแล้ว x/y — นับเฉพาะงวดที่บัญชีคอนเฟิร์ม (กติกา mig 0245) */}
                          <td className="num mono">
                            {group.paidCount}/{group.count}
                            <span className="cell-sub">{group.count === 1 ? "ชำระครั้งเดียว" : `แบ่ง ${group.count} งวด`}</span>
                          </td>
                          {/* ⭐ **ยอดค้างรับเป็นตัวเด่น** — เลขที่บัญชีตามจริง ของเดิมมีแต่
                              ยอดรวมกับเก็บแล้ว ต้องลบเอาเอง · แถบสัดส่วนอ่านความคืบหน้าด้วยตาเดียว */}
                          <td className="num mono">
                            {group.complete
                              ? <span className="cell-num-ok">เก็บครบ</span>
                              : <strong>{fmtMoney(group.summary.outstandingAmount)}</strong>}
                            <span className="cell-sub">
                              {fmtMoney(group.summary.collectedAmount)} / {fmtMoney(group.summary.totalAmount)}
                            </span>
                            {/* ⚠️ ใช้ <progress> ไม่ใช่ div+`style={{width}}` แบบที่อื่นในระบบ —
                                สัดส่วนมาทาง attribute ⇒ ไม่เพิ่มชั้น inlineStyle ที่ audit:ui
                                ล็อกเพดานไว้ (ratchet ขึ้นไม่ได้) และ semantic ตรงกว่า
                                ⚠️ ใบยอด 0 ไม่มีแถบ — รางเปล่าที่เติมไม่ได้อ่านเหมือนระบบค้าง */}
                            {group.summary.totalAmount > 0 ? (
                              <progress className={styles.mbar} aria-hidden="true"
                                value={group.summary.collectedAmount} max={group.summary.totalAmount} />
                            ) : null}
                          </td>
                          {/* ใบหนึ่งมีหลายงวดจึงมีหลายวัน — สิ่งที่ตอบ "ต้องตามใบนี้เมื่อไร"
                              คือวันของงวดที่ **ยังเก็บไม่ได้** ที่ใกล้ที่สุด (`nextDue`)
                              ⚠️ **เปิดแท็บใหม่** (มติผู้ใช้ 2026-08-13 · "ทำให้ลงมือได้เร็วขึ้น") —
                              บัญชีไล่ทีละใบจากหน้านี้ เด้งออกแล้วกดย้อนกลับทุกครั้งคือเสียตัวกรอง
                              · `#payment` พาไปยืนที่การ์ดการชำระพอดี ไม่ต้องเลื่อนหา */}
                          <td className={`num ${group.overdue ? "cell-num-bad" : ""}`.trim()}>
                            {group.nextDue ? fmtDate(group.nextDue) : <span className="cell-quiet">{NA}</span>}
                            {note ? <span className="cell-sub">{note.label}</span> : null}
                          </td>
                          <td>
                            <Link
                              prefetch={false}
                              href={`/sa/sales-orders/${group.orderId}#payment`}
                              target="_blank" rel="noreferrer"
                              className={`linklike ${styles.openLink}`}
                              title="เปิดใบในแท็บใหม่ ไปที่การ์ดการชำระ"
                              onClick={(e) => e.stopPropagation()}
                            >
                              เปิดใบ<ExternalLink size={12} aria-hidden="true" className={styles.openIcon} />
                            </Link>
                          </td>
                        </tr>

                        {open ? group.rows.map((row) => (
                          <tr key={row.id} className={styles.childRow}>
                            <td colSpan={2} />
                            <td className={`num ${styles.childLead}`.trim()}>
                              {row.label || `งวดที่ ${row.seq}`}
                              <span className="cell-sub">งวดที่ {row.seq} · {row.percent}%</span>
                            </td>
                            <td className="num mono">
                              {fmtMoney(row.amount)}
                              <span className="cell-sub">{row.confirmedByName || (row.reportedByName ? `แจ้งโดย ${row.reportedByName}` : "")}</span>
                            </td>
                            {/* เลยกำหนดย้อมที่ **ช่องวันที่** ไม่ใช่ทั้งแถว — ทั้งแถวแดงอ่านเหมือน
                                ข้อมูลผิด ส่วนช่องเดียวบอกว่า "วันนี้แหละที่มีปัญหา" */}
                            <td className={`num ${row.overdue ? "cell-num-bad" : ""}`.trim()} title={row.overdue ? "เลยกำหนดแล้วและยังไม่ถูกคอนเฟิร์ม" : undefined}>
                              {row.dueDate ? fmtDate(row.dueDate) : <span className="cell-quiet">ยังไม่กำหนด</span>}
                              <span className="cell-sub">{row.paidOn ? `จ่าย ${fmtDate(row.paidOn)}` : ""}</span>
                            </td>
                            <td><StatusBadge tone={LEDGER_STATUS[row.status]?.tone} size="sm">{row.statusLabel}</StatusBadge></td>
                          </tr>
                        )) : null}
                      </Fragment>
                    );
                  })}
                  {!rows.length && !loading && (
                    <TableEmpty
                      colSpan={6}
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

        <InstallmentConfirmDialog
          open={!!confirmFor}
          row={confirmFor}
          order={confirmFor ? { id: confirmFor.orderId, orderNumber: confirmFor.orderNumber, customerName: confirmFor.customerName } : null}
          multi={Boolean(confirmFor && groups.find((g) => g.orderId === confirmFor.orderId)?.count > 1)}
          busy={acting}
          error={actionError}
          onClose={() => { setConfirmFor(null); setActionError(""); }}
          onConfirm={async (row) => { if (await runAction(row, "confirm")) setConfirmFor(null); }}
        />

        {/* ตีกลับใช้ ReasonDialog ตัวเดียวกับการ์ดบนใบ — เหตุผลบังคับชุดเดียวกัน */}
        <ReasonDialog
          open={!!rejectFor}
          title="ตีกลับการแจ้งชำระ"
          description="งวดนี้จะกลับไปให้ฝ่ายขายแก้แล้วแจ้งใหม่"
          label="เหตุผลที่ตีกลับ"
          value={rejectFor?.reason || ""}
          onChange={(reason) => setRejectFor((f) => ({ ...f, reason }))}
          onClose={() => { setRejectFor(null); setActionError(""); }}
          onConfirm={async () => {
            if (await runAction(rejectFor.row, "reject", { reason: rejectFor.reason })) setRejectFor(null);
          }}
          confirmLabel="ยืนยันตีกลับ"
          placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
          minLength={MIN_REJECT_REASON}
          maxLength={500}
          tone="danger"
          busy={acting}
          error={actionError}
        />

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
