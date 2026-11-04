"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, ReceiptText, Printer } from "lucide-react";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { useRole, useCan } from "@/lib/roleContext";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { deptOf, ownedStages, FILING_FILTERS } from "@/lib/excise/workflow";
import { customerNameIn } from "@/lib/master/customerName";
import { dayParam, withinDateRange } from "@/lib/tax/period";
import { raQueueText, raWorkHref } from "@/lib/excise/raQueueItem";
import { printFilingSummary } from "@/lib/excise/printFilingSummary";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import { downloadReportXlsx, reportXlsxFileName } from "@/lib/tax/reportXlsxDownload";
import { raFilingExcelReport, raFilingExportRows, raFilingPrintReport } from "@/lib/excise/raFilingExport";
import { notifyToast } from "@/lib/feedback";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { Building2 } from "lucide-react";
import styles from "./page.module.css";
import FilingLinesTable from "@/components/excise/FilingLinesTable";
import Select from "@/components/ui/Select";
import { filingMonthLabel } from "@/lib/excise/raFilingMonth";
import FilterBar from "@/components/excise/FilterBar";
import SalesOrderFilingModal from "@/components/excise/SalesOrderFilingModal";


/* ── งานหนึ่งแถวของรายการ (แผนรื้อสรรพสามิต v3 · มติเจ้าของ 02/11) ─────────────────────────────────────────
   รายการเดียวของ RA: แถวคิวที่ยังไม่มีบันทึก (กำลังมา · รอ RA — คำนวณสดจาก /api/tax/orders/queue) + บันทึกการยื่น
   (กำลังยื่น · ชำระแล้ว — /api/orders) · ไม่มีขั้นสร้างใบยื่น: กดงานรอ RA = เปิดงาน (`?start=`) แล้วกด "เริ่มยื่น"
   `printKey` = คีย์ของใบสรุปรายการยื่น (lib/excise/filingSummary) · แถวกำลังมายังไม่มี SO ค่าสรรพสามิต ⇒ พิมพ์ไม่ได้ */
const queueWorkRow = (row) => ({
  key: row.key,
  kind: "queue",
  status: row.ready === false ? "upcoming" : "queued",
  printKey: row.ready === false ? null : row.key,
  salesOrderNumber: row.salesOrder?.orderNumber || "",
  subtitle: raQueueText(row).subtitle,
  customerId: row.salesOrder?.customerId || null,
  customerName: row.salesOrder?.customerName || "",
  createdAt: row.since || null, // วันที่งานถึงขั้นปัจจุบัน — ช่องเดียวกับบันทึก ตัวกรองช่วงวันจะได้ถามคำถามเดียว
  href: raWorkHref(row),
  search: [row.salesOrder?.orderNumber, row.exciseOrder?.orderNumber, row.exciseQuote?.quoteNumber, row.salesOrder?.customerName],
});
const recordWorkRow = (o) => ({
  key: `order:${o.id}`,
  kind: "record",
  status: o.status,
  printKey: `order:${o.id}`,
  salesOrderNumber: o.poReference || o.quotationRef || o.id,
  subtitle: o.exciseReceiptNumber ? `ใบเสร็จกรม ${o.exciseReceiptNumber}` : o.taxNoticeNumber || "",
  customerId: o.customerId || null,
  customerName: o.customerName || "",
  createdAt: o.createdAt || null, // บันทึกเกิดตอนเริ่มยื่น ⇒ = วันเริ่มยื่น · ตรงกับไฟล์ Excel/พิมพ์ (reports.js ตัดด้วย createdAt)
  href: `/tax/filings/${o.id}`,
  order: o,
  search: [o.quotationRef, o.poReference, o.customerName, o.exciseReceiptNumber, o.taxNoticeNumber],
});

function FilingsPageInner() {
  const role = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canFile = useCan("ra:approve");     // RA: งานรอ RA · เริ่มยื่น · บันทึกผลชำระ (ฝ่ายขายไม่มีขั้นบนเส้นนี้)

  const { data: orders, loading, error: ordersError, staleError: ordersStale, errorDetail: ordersDetail, loaded: ordersLoaded, reload } = useApiList("/api/orders");

  /* "รอฉันลงมือ" = รอ RA + กำลังยื่น (ชุดเดียวกับป้ายเมนู) — มีแต่เลน RA · ฝ่ายขาย/แอดมินไม่เป็นเจ้าของขั้นไหน ⇒ ซ่อนชิป */
  const myDept = deptOf(role);
  const filterOptions = useMemo(
    () => FILING_FILTERS.filter((f) => f.key !== "mine" || myDept === "RA"),
    [myDept],
  );
  const [filter, setFilter] = useState(() => (deptOf(role) === "RA" ? "mine" : "all"));
  const [search, setSearch] = useStickyState("search", "");
  /* ⭐ ตัวกรอง + ปุ่มโหลดที่ย้ายมาจากหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29)
     — ชุดเดียวกับชิปและช่องค้นหา ไม่มีตัวกรอง "รายงาน" แยกอีกชุด */
  const [customerIds, setCustomerIds] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(""); // "" · "print" · "xlsx"
  useEffect(() => {
    const params = searchParams;
    const s = params.get("status");
    if (s && FILING_FILTERS.some((f) => f.key === s)) setFilter(s);
    /* ⭐ ช่วงวันจากการ์ดบนภาพรวม (`?from=&to=` · ตรวจตัวเลข M7) — ลงช่องจาก–ถึงที่มองเห็นและล้างได้ · ค่าผิดรูปถูกเมิน */
    const fromParam = dayParam(params.get("from"));
    const toParam = dayParam(params.get("to"));
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
    const openId = params.get("open");
    if (openId) router.replace(`/tax/filings/${openId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อ่านพารามิเตอร์ตั้งต้นครั้งเดียวตอนเปิดหน้า (`?start=` อ่านสดข้างล่าง)
  }, []);
  // ลิสต์ลูกค้าโหลดตอนกางตัวกรองครั้งแรก ไม่ใช่ตอนเปิดหน้า (508 แถว)
  const [customersReady, setCustomersReady] = useState(false);
  const { data: customers, loading: lCustomers, error: customersError, staleError: customersStale, errorDetail: customersDetail, loaded: customersLoaded, reload: reloadCustomers } = useApiList(customersReady ? "/api/customers" : null);
  /* คิวงานของ RA ที่ยังไม่มีบันทึก (PR5 + มติเจ้าของ 29/10 + v3) — กำลังมา (ใบเสนอราคาค่าสรรพสามิตอนุมัติแล้ว) + รอ RA
     ⇒ RA เห็นงานบนหน้านี้ตั้งแต่ใบเสนอราคาอนุมัติ ไม่ใช่ตารางว่าง "0 ใบ" · โหลดเฉพาะฝ่าย RA */
  const { data: raQueue, loading: lQueue, error: queueError, staleError: queueStale, errorDetail: queueDetail, loaded: queueLoaded, reload: reloadQueue } = useApiList(canFile ? "/api/tax/orders/queue" : null);
  /* ⭐ ตารางแบบตารางเดิมของ RA (มติเจ้าของ 03/11 V20–V23): รายการสินค้า + วันที่ส่งของของทุกงาน ติดกับแถวงานด้วยคีย์
     (`lib/excise/raFilingTable`) · สิทธิ์เดียวกับใบสรุปรายการยื่น */
  const canReadTable = useCan("ra:view") || canFile;
  const { data: tableRows, loading: lTable, error: tableError, staleError: tableStale, errorDetail: tableDetail, loaded: tableLoaded, reload: reloadTable } = useApiList(canReadTable ? "/api/tax/orders/table" : null);
  const detailByKey = useMemo(() => new Map((tableRows || []).map((row) => [row.key, row])), [tableRows]);
  /* เดือนที่ยื่นทำจ่าย (หัวตารางเดิม "M.10/69" · มติ 03/11 V24: ยื่นแล้ว = เดือนที่เริ่มยื่น · ยังไม่ยื่น = เดือนนี้) — "all" = ทุกเดือน */
  const [month, setMonth] = useState("all");

  /* ── งานที่เปิดอยู่ (`?start=<คีย์งาน>`) — มาจากแถวในรายการ หรือคิวบนภาพรวม /tax · `?create=` คือคีย์เดิมของ PR5 ── */
  const startKey = searchParams.get("start") || searchParams.get("create") || "";
  const startRow = useMemo(() => raQueue.find((row) => row.key === startKey) || null, [raQueue, startKey]);
  const closeWork = () => router.replace("/tax/filings", { scroll: false });

  /* ── โหลดพัง ≠ ไม่มีงาน · และรายชื่อลูกค้าที่ดึงไม่ได้ ≠ "ไม่มีลูกค้าให้เลือก" ─────────────────────
     ป้ายเดียวของจอ (ท่าเดียวกับ /tax · /database) — ทุก useApiList ของหน้านี้อยู่ในก้อน sources ⇒ ได้ประโยคเดียวกัน
     ปุ่มลองใหม่ตัวเดียวกัน และรอบเบื้องหลังที่ล้ม (`staleError`) ถึงป้ายทุกสาย

     ⭐ **มติของจอนี้: สายไหนกระทบอะไร**
        · บันทึกการยื่น (ลิสต์หลัก · `blocks: "list"`) — ไม่เคยโหลดสำเร็จ = ซ่อนตาราง เหลือป้ายอย่างเดียว
          มีแคชอยู่ = ตารางยังอยู่ ป้ายบอกว่าเป็นของรอบก่อน
        · คิวงาน RA (`blocks: "queue"`) — ไม่เคยโหลดสำเร็จ = แถวกำลังมา/รอ RA ขาดไปทั้งกอง ⇒ ป้ายนับจำนวนต้องเป็นขีด
        · รายชื่อลูกค้า (picker ของตัวกรอง · `blocks: "filter"` — โหลดตอนกางแผงครั้งแรก) ⇒ **ตารางไม่ต้องหลบ**
     ⚠️ ป้ายกับการซ่อนคนละคำถาม: มี `error`/`staleError` = ขึ้นป้ายเสมอ · ซ่อนเฉพาะตอนไม่เคยโหลดสำเร็จ (`loaded`)
        — ห้ามวัดด้วย `!orders.length`: ลิสต์ที่ตอบ `200 []` คือรู้แล้วว่าไม่มีบันทึก ต้องยังอ่านว่าว่าง */
  const sources = [
    {
      label: "บันทึกการยื่น", error: ordersError || ordersStale, empty: !ordersLoaded, detail: ordersDetail, reload, blocks: "list",
      blockedNote: "รายการงานยื่นชำระยังแสดงไม่ได้ (ไม่ได้แปลว่ายังไม่มีงาน)",
      staleNote: "รายการที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "รายชื่อลูกค้า", error: customersError || customersStale, empty: !customersLoaded, detail: customersDetail, reload: reloadCustomers, blocks: "filter",
      blockedNote: "ตัวกรองลูกค้ายังใช้ไม่ได้ (ไม่ได้แปลว่าไม่มีลูกค้าให้เลือก)",
      staleNote: "รายชื่อลูกค้าในตัวกรองเป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "คิวงาน RA", error: queueError || queueStale, empty: !queueLoaded, detail: queueDetail, reload: reloadQueue, blocks: "queue",
      blockedNote: "งานกำลังมา/รอ RA ยังแสดงไม่ได้ (ไม่ได้แปลว่าไม่มีงานรอ)",
      staleNote: "งานกำลังมา/รอ RA เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "รายการสินค้าของงาน", error: tableError || tableStale, empty: !tableLoaded, detail: tableDetail, reload: reloadTable, blocks: "detail",
      blockedNote: "รายการสินค้าและวันที่ส่งของยังแสดงไม่ได้ (งานยังอยู่ครบ)",
      staleNote: "รายการสินค้าเป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const listBlocked = blocked.some((s) => s.blocks === "list");
  const filterBlocked = blocked.some((s) => s.blocks === "filter");
  const queueBlocked = blocked.some((s) => s.blocks === "queue");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — สองสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set(failing.map((s) => (s.empty ? s.blockedNote : s.staleNote))),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  const retrying = loading || lCustomers || lQueue || lTable;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;
  /* หัวหมวดในแผงตัวกรอง — แผงวาด "ไม่มีตัวเลือก" เองเมื่อลิสต์ว่าง (FilterPopover ยังไม่มีช่องให้บอกเหตุ)
     ⇒ ป้ายหมวดบอกแทนว่าว่างเพราะอะไร · ป้ายเต็มพร้อมปุ่มลองใหม่อยู่ใต้แถบเครื่องมือ */
  const customerGroupLabel = customersLoaded ? "ลูกค้า" : filterBlocked ? "ลูกค้า (ดึงไม่ได้)" : "ลูกค้า (กำลังโหลด…)";

  const allRows = useMemo(
    () => [...raQueue.map(queueWorkRow), ...orders.map(recordWorkRow)]
      .map((row) => ({ ...row, detail: detailByKey.get(row.key) || null })),
    [raQueue, orders, detailByKey],
  );
  const monthOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.detail?.month).filter(Boolean))].sort().reverse(),
    [allRows],
  );
  const mineStatuses = useMemo(() => new Set(["queued", ...ownedStages("payment", myDept)]), [myDept]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (filter === "mine") {
        if (!mineStatuses.has(r.status)) return false;
      } else if (filter !== "all" && r.status !== filter) return false;
      if (customerIds.length && !customerIds.includes(r.customerId)) return false;
      // วันไทยของวันที่งานเริ่ม (คิว = วันที่ถึงขั้นนั้น · บันทึก = วันเริ่มยื่น) — ตัวตัดสินเดียวกับการ์ดบนภาพรวม
      if (!withinDateRange(r.createdAt, from, to)) return false;
      // เดือนที่ยื่นทำจ่าย (V24) — งานที่ยังโหลดรายการไม่ขึ้นไม่อยู่ในเดือนไหน
      if (month !== "all" && r.detail?.month !== month) return false;
      if (!q) return true;
      return r.search.some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [allRows, filter, search, mineStatuses, customerIds, from, to, month]);

  /* ตัวกรองขยับ → ที่เลือกอาจไม่อยู่บนจอแล้ว ⇒ ล้างทิ้ง ไม่งั้นพิมพ์/โหลดแถวที่มองไม่เห็นออกไป */
  useEffect(() => { setSelected(new Set()); }, [filter, search, customerIds, from, to, month]);

  // ติ๊กได้เฉพาะแถวที่พิมพ์ใบสรุปได้ (ไม่ใช่กำลังมา)
  const selectableKeys = useMemo(() => rows.filter((r) => r.printKey).map((r) => r.key), [rows]);
  const allChecked = selectableKeys.length > 0 && selectableKeys.every((key) => selected.has(key));
  const toggleOne = (key) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  /* ⭐ Excel / พิมพ์ (มติเจ้าของ 04/11 "Excel แบน · พิมพ์ตามจอ") — ประกอบจาก **แถวที่จอวาดอยู่** (`lib/excise/raFilingExport`)
     ติ๊กไว้ = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกแถวบนจอ (รวมงานกำลังมา/รอ RA) — ไม่มีตัวกรองชุดที่สองฝั่ง server
     🐞 เดิม (ReportExportActions type="filing") อ่านเฉพาะบันทึกการยื่น ⇒ ปุ่มดับทั้งที่ตารางมีงาน · ติ๊ก/ค้นหาแล้วไฟล์ว่าง
        (ส่งรหัสบันทึกไป แต่ server เทียบกับรหัสรายการสินค้า) · คอลัมน์เป็นของรุ่นก่อนตารางแบบเดิม (V20) */
  const exportRows = useMemo(() => raFilingExportRows(rows, selected), [rows, selected]);
  const filterLabel = filterOptions.find((f) => f.key === filter)?.label || "";
  const exportMeta = () => ({
    from,
    to,
    customerName,
    extraRows: [
      { label: "เดือนที่ยื่น", value: month === "all" ? "ทุกเดือน" : `${filingMonthLabel(month).short} · ${filingMonthLabel(month).long}` },
      { label: "สถานะ", value: filterLabel },
      search.trim() ? { label: "ค้นหา", value: search.trim() } : null,
      selected.size ? { label: "เลือก", value: `${exportRows.length} งาน` } : null,
    ].filter(Boolean),
  });
  /* กดได้เสมอเมื่อมีงานบนจอ — รายการสินค้ายังโหลดไม่ขึ้น = บอกเหตุตอนกด (ไฟล์ที่ไม่มีรายการ = ไฟล์ที่ผิด) */
  const exportBlocker = !tableLoaded
    ? (lTable ? "รายการสินค้ายังโหลดไม่เสร็จ — รอสักครู่แล้วกดใหม่" : "รายการสินค้าของงานยังโหลดไม่ได้ — กด “ลองใหม่” ที่ป้ายด้านบนก่อน")
    : null;
  const runExport = async (kind) => {
    if (exportBlocker) {
      notifyToast.error(exportBlocker);
      return;
    }
    setExporting(kind);
    try {
      if (kind === "print") await openReportPrintWindow(raFilingPrintReport(exportRows), exportMeta());
      else await downloadReportXlsx(raFilingExcelReport(exportRows), reportXlsxFileName("filing"));
    } catch (error) {
      notifyToast.error(error?.message || (kind === "print" ? "พิมพ์ไม่สำเร็จ" : "สร้างไฟล์ Excel ไม่สำเร็จ"));
    } finally {
      setExporting("");
    }
  };
  /* ใบสรุปรายการยื่น (V9): ติ๊กไว้ = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกแถวบนจอที่พิมพ์ได้ */
  const printKeys = useMemo(() => {
    const picked = rows.filter((r) => r.printKey && (selected.size ? selected.has(r.key) : true));
    return picked.map((r) => r.printKey);
  }, [rows, selected]);
  const printSummary = async () => {
    setPrinting(true);
    try {
      await printFilingSummary(printKeys);
    } finally {
      setPrinting(false);
    }
  };

  const customerName = customerIds.length === 1
    ? customerNameIn(customers.find((c) => c.id === customerIds[0]))
    : (customerIds.length > 1 ? `ลูกค้า ${customerIds.length} ราย` : undefined);

  /* ⭐ ป้ายจำนวนอยู่ในหัวแผงรายการ (มติผู้ใช้ 2026-09-15 · ด่าน LP9) — นับ **งานที่เหลือหลังกรอง**
     ยังไม่มีข้อมูล (โหลดครั้งแรก/โหลดพัง) = null ⇒ ขีด · คิวของ RA ไม่เคยโหลดสำเร็จ = กองกำลังมา/รอ RA ขาด ⇒ ขีดด้วย */
  const noData = !ordersLoaded || (canFile && queueBlocked);
  const count = noData ? null
    : selected.size ? `เลือก ${selected.size}/${rows.length} งาน` : `${rows.length} งาน`;

  const headerRight = (
    <>
      <Button tone="neutral" onClick={() => runExport("print")} disabled={!exportRows.length || !!exporting} icon={<Printer size={16} />}>
        {exporting === "print" ? "กำลังเตรียม..." : "พิมพ์ / PDF"}
      </Button>
      <Button tone="primary" onClick={() => runExport("xlsx")} disabled={!exportRows.length || !!exporting} icon={<FileSpreadsheet size={16} />}>
        {exporting === "xlsx" ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel"}
      </Button>
      {canFile && (
        <Button tone="neutral" onClick={printSummary} disabled={printing || !printKeys.length} icon={<Printer size={16} />}>
          {printing ? "กำลังเตรียม..." : selected.size ? `พิมพ์ใบสรุปรายการยื่น (${printKeys.length})` : "พิมพ์ใบสรุปรายการยื่น"}
        </Button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title="การยื่นชำระภาษีสรรพสามิต"
      subtitle="งานของฝ่าย RA — ข้อมูลจากใบสั่งขายค่าสรรพสามิตที่อนุมัติแล้ว · เริ่มยื่น · บันทึกผลชำระ · พิมพ์ใบสรุปรายการยื่น"
      headerRight={headerRight}
    >
      {/* แผงรายการ (มติผู้ใช้ 2026-09-15) — `FilterBar` คืน fragment เข้า `toolbar` · `loading`
          แทนที่เฉพาะเนื้อ ⇒ ช่องค้นหา/ชิปยังอยู่ระหว่างโหลด ไม่หลุดโฟกัส */}
      <ListPanel
        icon={<ReceiptText size={17} aria-hidden="true" />}
        title="งานยื่นชำระภาษี"
        subtitle="กำลังมา · รอ RA · กำลังยื่น · ชำระแล้ว — กดงานเพื่อดูข้อมูลจากใบสั่งขายและดำเนินการต่อ"
        count={count}
        loading={loading && !ordersLoaded}
        toolbar={(
        <FilterBar
          filters={filterOptions}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหาเลขใบสั่งขาย / ลูกค้า / ใบเสร็จ..."
          searchLabel="ค้นหางานยื่นชำระภาษี"
        >
          <FilterPopover
            count={customerIds.length}
            onOpen={() => setCustomersReady(true)}
            onClear={() => setCustomerIds([])}
            groups={[{
              key: "customer", label: customerGroupLabel, icon: Building2,
              /* ป้ายต้องผ่านกติกาสองภาษา — ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้ตัวเลือกว่างเปล่า
                 (ป้ายที่นี่เป็นชื่อเปล่า ไม่ใช่ "รหัส · ชื่อ" แบบ dropdown เลือกลูกค้า) */
              options: customers.map((c) => ({ value: c.id, label: customerNameIn(c) })),
              selected: customerIds,
              onChange: setCustomerIds,
            }]}
          />
          {/* เดือนที่ยื่นทำจ่าย (หัวตารางเดิม "M.10/69" · มติ 03/11 V24) */}
          <label className={styles.rangeLabel}>
            เดือนที่ยื่น
            <Select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="เดือนที่ยื่น">
              <option value="all">ทุกเดือน</option>
              {monthOptions.map((key) => {
                const label = filingMonthLabel(key);
                return <option key={key} value={key}>{label.short} · {label.long}</option>;
              })}
            </Select>
          </label>
          {/* จาก–ถึง เป็นก้อนเดียว — แถบเครื่องมือในแผงแคบกว่าเดิม ถ้าตัดบรรทัดต้องลงไปทั้งคู่
              ไม่ใช่ "จาก" ค้างแถวบนแล้ว "ถึง" ห้อยแถวล่าง */}
          <span className={styles.rangeGroup}>
            <label className={styles.rangeLabel}>
              จาก <DateInput value={from} onChange={setFrom} />
            </label>
            <label className={styles.rangeLabel}>
              ถึง <DateInput value={to} onChange={setTo} />
            </label>
          </span>
        </FilterBar>
        )}
      >
      {notice}
      {/* โหลดพังและยังไม่มีข้อมูลเลย = โชว์แค่ข้อความผิดพลาด — สถานะว่างใต้ข้อความนั้นอ่านได้ว่าระบบว่างจริง
          ⚠️ ถามสายบันทึกการยื่นสายเดียว — รายชื่อลูกค้าล้มไม่ได้ทำให้ตารางผิด (ดูมติที่ก้อน sources) */}
      {!listBlocked && (
      <FilingLinesTable
        rows={rows}
        selected={selected}
        onToggle={toggleOne}
        allChecked={allChecked}
        onToggleAll={() => setSelected(allChecked ? new Set() : new Set(selectableKeys))}
        selectable={canFile}
        detailLoading={lTable && !tableLoaded}
        /* ตัดสินจาก **ลิสต์ทั้งก้อน** ก่อน แล้วค่อยว่าด้วยตัวกรอง — RA ตกลงมาที่ "รอฉันลงมือ" เป็นค่าตั้งต้น */
        empty={allRows.length === 0
          ? "ยังไม่มีงานยื่นชำระ — งานเข้ามาเองเมื่อใบเสนอราคาค่าสรรพสามิตอนุมัติ (กำลังมา) และเมื่อใบสั่งขายค่าสรรพสามิตอนุมัติ (รอ RA)"
          : "ไม่พบรายการตามตัวกรองที่เลือก"}
      />
      )}
      </ListPanel>

      {canFile && startKey && queueLoaded && !startRow && (
        <StatusNotice tone="warning" className="mt-4" action={<Button size="sm" variant="ghost" onClick={closeWork}>ปิด</Button>}>
          ไม่พบงานนี้ในคิวรอ RA แล้ว — อาจเริ่มยื่นไปแล้ว หรือใบสั่งขายถูกยกเลิก (ดูในรายการด้านบน)
        </StatusNotice>
      )}
      <SalesOrderFilingModal
        open={!!startRow}
        row={startRow}
        onClose={closeWork}
        onStarted={async (record) => {
          await Promise.all([reload(), reloadQueue(), reloadTable()]);
          router.push(`/tax/filings/${record.id}`);
        }}
      />
    </Workspace>
  );
}

/* useSearchParams ต้องอยู่ใต้ Suspense (Next) — `?start=` เปลี่ยนได้ระหว่างอยู่หน้านี้ (กดแถวงานรอ RA) จึงอ่านสด ไม่ใช่ครั้งเดียว */
export default function FilingsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={7} />}>
      <FilingsPageInner />
    </Suspense>
  );
}
