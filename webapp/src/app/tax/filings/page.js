"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, FILING_FILTERS } from "@/lib/excise/workflow";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import OrderFormModal from "@/components/excise/OrderFormModal";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));

export default function FilingsPage() {
  const role = useRole();
  const router = useRouter();
  const canAct = useCan("sales:act");       // SA: create / receive / edit

  const { data: orders, loading, reload } = useApiList("/api/orders");
  const { data: registrations } = useApiList("/api/excise-registrations");
  const { data: customers } = useApiList("/api/customers");
  const { data: products } = useApiList("/api/products");

  const [userName, setUserName] = useState("");
  const [filter, setFilter] = useState(() => (deptOf(role) === "LG" ? "received" : deptOf(role) === "SA" ? "pending" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "Sales User");
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && FILING_FILTERS.some((f) => f.key === s)) setFilter(s);
    const openId = params.get("open");
    if (openId) router.replace(`/tax/filings/${openId}`);
  }, [router]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return [o.quotationRef, o.poReference, o.customerName, o.exciseReceiptNumber].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [orders, filter, search]);

  const columns = [
    {
      key: "quotationRef", label: "เลขที่ใบเสนอราคา",
      render: (o) => (
        <div>
          <div className="font-semibold">{o.quotationRef}</div>
          {o.poReference && <div style={{ fontSize: 11, color: "var(--text-3)" }} className="font-mono">PO: {o.poReference}</div>}
        </div>
      ),
    },
    { key: "customerName", label: "ลูกค้า", render: (o) => <span style={{ color: "var(--accent)" }}>{o.customerName || "-"}</span> },
    { key: "itemCount", label: "รายการ", align: "center", sortValue: (o) => o.items?.length || 0, render: (o) => o.items?.length || 0 },
    { key: "totalTax", label: "ยอดภาษีรวม", align: "right", sortValue: (o) => o.totalTax || 0, render: (o) => <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{taxText(o)}</span> },
    { key: "status", label: "สถานะ", render: (o) => <StatusBadge status={o.status} /> },
  ];

  const card = (o) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{o.quotationRef}</div>
          <div style={{ fontSize: 11, color: "var(--accent)" }} className="truncate">{o.customerName || "-"}</div>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-3)" }}>{o.items?.length || 0} รายการ</span>
        <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{taxText(o)}</span>
      </div>
    </div>
  );

  const headerRight = (
    <>
      <span className="ui-badge">{orders.length} รายการ</span>
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
          filters={FILING_FILTERS}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา Ref / PO / ลูกค้า / ใบเสร็จ..."
        />
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/tax/filings/${o.id}`)}
        card={card}
        initialSort={{ key: "quotationRef", dir: "asc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีใบยื่นชำระ"}
        emptyIcon={ReceiptText}
      />

      <OrderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        order={null}
        registrations={registrations}
        customers={customers}
        products={products}
        userName={userName}
      />
    </Workspace>
  );
}
