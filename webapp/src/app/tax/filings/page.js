"use client";
import { useEffect, useMemo, useState } from "react";
import { ReceiptText, Plus, Pencil, Wallet, Send, FileCheck } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, FILING_FILTERS } from "@/lib/excise/workflow";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RecordDrawer, { Field } from "@/components/excise/RecordDrawer";
import Timeline from "@/components/excise/Timeline";
import ConfirmDialog from "@/components/excise/ConfirmDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import OrderFormModal from "@/components/excise/OrderFormModal";
import ReceiveDialog from "@/components/excise/ReceiveDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));
const ORDER = ["pending", "received", "filing", "complete"];

function orderSteps(o) {
  const idx = ORDER.indexOf(o.status);
  const stateFor = (stage) => {
    if (o.status === "rejected") return ORDER.indexOf(stage) <= 0 ? "done" : "todo";
    const si = ORDER.indexOf(stage);
    if (si < idx) return "done";
    if (si === idx) return o.status === "complete" ? "done" : "current";
    return "todo";
  };
  const steps = [
    { label: "สร้างใบยื่นชำระ", at: o.createdAt, by: o.assignee, state: "done" },
    { label: "รับเงินแล้ว", state: stateFor("received") },
    { label: "ยื่นกรมสรรพสามิต", state: stateFor("filing") },
    { label: "ชำระภาษีแล้ว", at: o.filedAt, by: o.filedByName, state: stateFor("complete") },
  ];
  if (o.status === "rejected") steps.splice(1, 0, { label: "ตีกลับให้แก้ไข", state: "rejected", note: o.rejectionReason });
  return steps;
}

export default function FilingsPage() {
  const role = useRole();
  const dept = deptOf(role);
  const canAct = useCan("sales:act");       // SA: create / receive / edit
  const canApprove = useCan("legal:approve"); // LG: file / reject / due date

  const { data: orders, loading, reload } = useApiList("/api/orders");
  const { data: registrations } = useApiList("/api/excise-registrations");
  const { data: customers } = useApiList("/api/customers");

  const [userName, setUserName] = useState("");
  const [filter, setFilter] = useState(() => (deptOf(role) === "LG" ? "received" : deptOf(role) === "SA" ? "pending" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "Sales User");
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && FILING_FILTERS.some((f) => f.key === s)) setFilter(s);
  }, []);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [fileTarget, setFileTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [startTarget, setStartTarget] = useState(null);

  const refreshAll = async () => { const list = await reload(); if (list && selected) setSelected(list.find((o) => o.id === selected.id) || null); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return [o.quotationRef, o.poReference, o.customerName, o.exciseReceiptNumber].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [orders, filter, search]);

  const setDue = async (id, value) => {
    await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxDueDate: value }) });
    await refreshAll();
  };
  const reject = async (reason) => {
    const res = await fetch(`/api/orders/${rejectTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected", rejectionReason: reason }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await refreshAll();
    setSelected(null);
  };
  const startFiling = async () => {
    const res = await fetch(`/api/orders/${startTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "filing" }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await refreshAll();
  };

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
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus size={16} /> ยื่นชำระ
        </button>
      )}
    </>
  );

  const o = selected;
  const isExempt = (o?.totalTax || 0) === 0;
  const drawerFooter = o && (
    <>
      {canAct && o.status === "pending" && (
        <>
          <button className="btn btn-secondary flex items-center gap-1.5" onClick={() => { setEditTarget(o); setFormOpen(true); }}><Pencil size={15} /> แก้ไข</button>
          <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setReceiveTarget(o)}><Wallet size={15} /> {isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว"}</button>
        </>
      )}
      {canAct && o.status === "rejected" && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => { setEditTarget(o); setFormOpen(true); }}><Pencil size={15} /> แก้ไขและส่งกลับ</button>
      )}
      {canApprove && o.status === "received" && (
        <>
          <button className="btn btn-danger" onClick={() => setRejectTarget(o)}>ตีกลับ</button>
          {isExempt
            ? <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setFileTarget(o)}><FileCheck size={15} /> ยืนยันชำระ</button>
            : <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setStartTarget(o)}><Send size={15} /> เริ่มยื่น</button>}
        </>
      )}
      {canApprove && o.status === "filing" && (
        <>
          <button className="btn btn-danger" onClick={() => setRejectTarget(o)}>ตีกลับ</button>
          <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setFileTarget(o)}><FileCheck size={15} /> บันทึกชำระภาษี</button>
        </>
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
        onRowClick={setSelected}
        card={card}
        initialSort={{ key: "quotationRef", dir: "asc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีใบยื่นชำระ"}
        emptyIcon={ReceiptText}
      />

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={o?.quotationRef}
        subtitle={o?.customerName}
        badge={o && <StatusBadge status={o.status} />}
        footer={drawerFooter}
      >
        {o && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="PO Reference">{o.poReference || "-"}</Field>
              <Field label="วันที่คาดว่าจะส่ง">{o.deliveryDate && o.deliveryDate !== "-" ? o.deliveryDate : "-"}</Field>
              <Field label="ยอดภาษีรวม">{taxText(o)}</Field>
              <Field label="ใบเสร็จสรรพสามิต">{o.exciseReceiptNumber || "-"}</Field>
              {o.taxPaidDate && <Field label="วันที่ชำระจริง">{fmtDate(o.taxPaidDate)}</Field>}
              {o.taxFormRef && <Field label="แบบ ภส.">{o.taxFormRef}</Field>}
            </div>

            {canApprove && o.status === "received" && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>กำหนดยื่น (Due date)</label>
                <input type="date" className="premium-input" style={{ maxWidth: 180 }}
                  value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""}
                  onChange={(e) => setDue(o.id, e.target.value)} />
              </div>
            )}

            <div>
              <div className="drawer-section-title" style={{ marginBottom: 8 }}>รายการสินค้า ({o.items?.length || 0})</div>
              <div className="flex flex-col gap-1.5">
                {(o.items || []).map((it) => {
                  const p = it.product || it.registration || {};
                  return (
                    <div key={it.id} className="flex items-center justify-between" style={{ fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                      <span style={{ minWidth: 0 }} className="truncate">
                        <span className="font-mono">{p.fgCode || "-"}</span> · {p.productDescription || p.productName || ""}
                      </span>
                      <span className="font-mono" style={{ flexShrink: 0, color: "var(--text-3)" }}>×{it.quantity} · {fmtMoney(it.totalTax || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="drawer-section-title" style={{ marginBottom: 10 }}>สถานะการดำเนินการ</div>
              <Timeline steps={orderSteps(o)} />
            </div>

            <AttachmentsPanel
              entityType="order"
              entityId={o.id}
              canEdit={canApprove}
              title="เอกสารการชำระสรรพสามิต"
            />
          </div>
        )}
      </RecordDrawer>

      <OrderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
        order={editTarget}
        registrations={registrations}
        customers={customers}
        userName={userName}
      />
      <ReceiveDialog open={!!receiveTarget} onClose={() => setReceiveTarget(null)} onDone={refreshAll} order={receiveTarget} />
      <FileTaxDialog open={!!fileTarget} onClose={() => setFileTarget(null)} onDone={refreshAll} order={fileTarget} />
      <RejectDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={reject} title="ตีกลับใบยื่นชำระ" entityLabel="ใบยื่นนี้" />
      <ConfirmDialog
        open={!!startTarget}
        onClose={() => setStartTarget(null)}
        onConfirm={startFiling}
        title="เริ่มยื่นภาษี"
        message={`เริ่มดำเนินการยื่นภาษีสำหรับ ${startTarget?.quotationRef || "รายการนี้"}?`}
        confirmLabel="เริ่มยื่น"
      />
    </Workspace>
  );
}
