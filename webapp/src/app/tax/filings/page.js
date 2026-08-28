"use client";
import { useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter } from "next/navigation";
import { ReceiptText, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney, naText } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, isTaxWaitingOnMe, ownedStages, FILING_FILTERS } from "@/lib/excise/workflow";
import { queueExportIds, queueStatusParam } from "@/lib/tax/exportUrl";
import ReportExportActions from "@/components/excise/ReportExportActions";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { Building2 } from "lucide-react";
import styles from "./page.module.css";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import SalesOrderFilingModal from "@/components/excise/SalesOrderFilingModal";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));

export default function FilingsPage() {
  const role = useRole();
  const router = useRouter();
  const canAct = useCan("sales:act");       // SA: create / receive / edit

  const { data: orders, loading, reload } = useApiList("/api/orders");

  /* เลนของผู้ใช้ (SA / RA) — ตัวเดียวกับที่ `?status=mine` และป้ายบนเมนูใช้ (ม-117)
     AD เห็นทั้งสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ชิป "รอฉันลงมือ" จะได้ 0 เสมอ จึงซ่อนทิ้ง */
  const myDept = deptOf(role);
  const filterOptions = useMemo(
    () => FILING_FILTERS.filter((f) => f.key !== "mine" || myDept === "SA" || myDept === "RA"),
    [myDept],
  );
  const [filter, setFilter] = useState(() => (deptOf(role) === "RA" ? "received" : deptOf(role) === "SA" ? "pending" : "all"));
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && FILING_FILTERS.some((f) => f.key === s)) setFilter(s);
    const openId = params.get("open");
    if (openId) router.replace(`/tax/filings/${openId}`);
  }, [router]);
  const [search, setSearch] = useStickyState("search", "");
  const [formOpen, setFormOpen] = useState(false);
  /* ⭐ ตัวกรอง + ปุ่มโหลดที่ย้ายมาจากหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29)
     — ชุดเดียวกับชิปและช่องค้นหา ไม่มีตัวกรอง "รายงาน" แยกอีกชุด */
  const [customerIds, setCustomerIds] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  // ลิสต์ลูกค้าโหลดตอนกางตัวกรองครั้งแรก ไม่ใช่ตอนเปิดหน้า (508 แถว)
  const [customersReady, setCustomersReady] = useState(false);
  const { data: customers } = useApiList(customersReady ? "/api/customers" : null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "mine") {
        if (!isTaxWaitingOnMe(o, "payment", myDept)) return false;
      } else if (filter !== "all" && o.status !== filter) return false;
      if (customerIds.length && !customerIds.includes(o.customerId)) return false;
      const day = (o.createdAt || "").slice(0, 10);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      if (!q) return true;
      return [o.quotationRef, o.poReference, o.customerName, o.exciseReceiptNumber].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [orders, filter, search, myDept, customerIds, from, to]);

  /* ตัวกรองขยับ → ที่เลือกอาจไม่อยู่บนจอแล้ว ⇒ ล้างทิ้ง ไม่งั้นโหลดแถวที่มองไม่เห็นออกไป */
  useEffect(() => { setSelected(new Set()); }, [filter, search, customerIds, from, to]);

  const allIds = useMemo(() => rows.map((o) => o.id), [rows]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const exportParams = useMemo(() => ({
    status: queueStatusParam(filter, ownedStages("payment", myDept)),
    customerId: customerIds,
    from,
    to,
  }), [filter, myDept, customerIds, from, to]);
  const exportIds = useMemo(
    () => queueExportIds({ selected, visibleIds: allIds, searching: !!search.trim() }),
    [selected, allIds, search],
  );

  const columns = [
    {
      key: "_sel",
      label: (
        <input
          type="checkbox"
          checked={allChecked}
          onChange={() => setSelected(allChecked ? new Set() : new Set(allIds))}
          aria-label="เลือกทั้งหมด"
        />
      ),
      sortValue: null,
      align: "center",
      thStyle: { width: 34 },
      // หยุด event ไม่ให้ไหลไปเปิดหน้ารายละเอียด (ทั้งแถวกดได้)
      render: (o) => (
        <span onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} aria-label={`เลือก ${o.quotationRef}`} />
        </span>
      ),
    },
    {
      key: "quotationRef", label: "เลขที่ใบเสนอราคา",
      render: (o) => (
        <div>
          <div className="font-semibold">{o.quotationRef}</div>
          {o.poReference && <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }} className="font-mono">PO: {o.poReference}</div>}
        </div>
      ),
    },
    { key: "customerName", label: "ลูกค้า", render: (o) => <span style={{ color: "var(--accent)" }}>{naText(o.customerName)}</span> },
    { key: "itemCount", label: "รายการ", align: "center", sortValue: (o) => o.items?.length || 0, render: (o) => o.items?.length || 0 },
    { key: "totalTax", label: "ยอดภาษีรวม", align: "right", sortValue: (o) => o.totalTax || 0, render: (o) => <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{taxText(o)}</span> },
    { key: "status", label: "สถานะ", render: (o) => <StatusBadge status={o.status} /> },
  ];

  const card = (o) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{o.quotationRef}</div>
          <div style={{ fontSize: "var(--fs-3)", color: "var(--accent)" }} className="truncate">{naText(o.customerName)}</div>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: "var(--fs-5)" }}>
        <span style={{ color: "var(--text-3)" }}>{o.items?.length || 0} รายการ</span>
        <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{taxText(o)}</span>
      </div>
    </div>
  );

  const customerName = customerIds.length === 1
    ? customers.find((c) => c.id === customerIds[0])?.name
    : (customerIds.length > 1 ? `ลูกค้า ${customerIds.length} ราย` : undefined);

  const headerRight = (
    <>
      <span className="ui-badge">
        {selected.size ? `เลือก ${selected.size}/${rows.length} รายการ` : `${orders.length} รายการ`}
      </span>
      <ReportExportActions
        type="filing"
        params={exportParams}
        ids={exportIds}
        rowCount={rows.length}
        printMeta={{ from, to, customerName }}
      />
      {canAct && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus size={16} /> ยื่นชำระ
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title="การยื่นชำระภาษีสรรพสามิต"
      subtitle="สร้างใบยื่น รับเงิน และยื่นชำระภาษีต่อกรมสรรพสามิต พร้อมบันทึกใบเสร็จ"
      headerRight={headerRight}
      loading={loading}
      toolbar={
        <FilterBar
          filters={filterOptions}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา Ref / PO / ลูกค้า / ใบเสร็จ..."
        >
          <FilterPopover
            count={customerIds.length}
            onOpen={() => setCustomersReady(true)}
            onClear={() => setCustomerIds([])}
            groups={[{
              key: "customer", label: "ลูกค้า", icon: Building2,
              options: customers.map((c) => ({ value: c.id, label: c.name })),
              selected: customerIds,
              onChange: setCustomerIds,
            }]}
          />
          <label className={styles.rangeLabel}>
            จาก <DateInput value={from} onChange={setFrom} />
          </label>
          <label className={styles.rangeLabel}>
            ถึง <DateInput value={to} onChange={setTo} />
          </label>
        </FilterBar>
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/tax/filings/${o.id}`)}
        card={card}
        initialSort={{ key: "quotationRef", dir: "asc" }}
        /* 🐞 RA ตกลงมาที่ชิป "รอยื่น" เป็นค่าตั้งต้น ⇒ เห็น "ไม่พบรายการ" เสมอ แม้ทั้ง
           ระบบยังไม่เคยมีใบยื่นสักใบ ซึ่งอ่านเหมือน "กรองแล้วไม่เจอ" ไม่ใช่ "ยังไม่มี"
           ⇒ ตัดสินจาก **ลิสต์ทั้งก้อน** ก่อน แล้วค่อยว่าด้วยตัวกรอง */
        empty={orders.length === 0
          ? "ยังไม่มีใบยื่นชำระ — ใบยื่นสร้างจากใบสั่งขายที่อนุมัติแล้ว โดยกด “ยื่นชำระ”"
          : "ไม่พบรายการตามตัวกรองที่เลือก"}
        emptyIcon={ReceiptText}
      />

      <SalesOrderFilingModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={async (filing) => {
          await reload();
          router.push(`/tax/filings/${filing.id}`);
        }}
      />
    </Workspace>
  );
}
