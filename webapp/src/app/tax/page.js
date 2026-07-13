"use client";
import Select from "@/components/ui/Select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { LayoutDashboard, ClipboardCheck, ReceiptText, BarChart3, ChevronRight, Calendar } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan } from "@/lib/roleContext";
import { useApiList } from "@/lib/excise/useApiList";
import KpiCard from "@/components/excise/KpiCard";
import WorkQueue from "@/components/excise/WorkQueue";
import { RegsDonutChart, OrdersComposedChart } from "@/components/excise/TaxDashboardCharts";

// Helper for date filtering
function isWithinRange(dateStr, range) {
  if (!dateStr || range === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  
  if (range === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (range === "quarter") {
    const currentQ = Math.floor(now.getMonth() / 3);
    const dateQ = Math.floor(d.getMonth() / 3);
    return currentQ === dateQ && d.getFullYear() === now.getFullYear();
  }
  return true;
}

export default function TaxDashboard() {
  const canSA = useCan("sales:act");
  const canLG = useCan("legal:approve");
  const router = useRouter();
  
  const { data: rawRegs, loading: l1 } = useApiList("/api/excise-registrations");
  const { data: rawOrders, loading: l2 } = useApiList("/api/orders");

  const [timeRange, setTimeRange] = useState("all"); // 'all', 'month', 'quarter'

  // Filter data based on selected time range
  const regs = useMemo(() => rawRegs.filter(r => isWithinRange(r.createdAt, timeRange)), [rawRegs, timeRange]);
  const orders = useMemo(() => rawOrders.filter(o => isWithinRange(o.createdAt, timeRange)), [rawOrders, timeRange]);

  const r = {
    draft: regs.filter((x) => x.status === "draft").length,
    pending_legal: regs.filter((x) => x.status === "pending_legal").length,
    approved: regs.filter((x) => x.status === "approved").length,
    rejected: regs.filter((x) => x.status === "rejected").length,
  };
  
  const o = {
    pending: orders.filter((x) => x.status === "pending"),
    received: orders.filter((x) => x.status === "received"),
    filing: orders.filter((x) => x.status === "filing"),
    complete: orders.filter((x) => x.status === "complete"),
  };

  const getCountAndTax = (list) => {
    return {
      count: list.length,
      tax: list.reduce((sum, item) => sum + (item.totalTax || 0), 0)
    };
  };

  const itemsLine = (ord) => {
    const n = ord.items?.length || 0;
    const tax = (ord.totalTax || 0) === 0 ? "ยกเว้นภาษี" : `ภาษี ฿${(ord.totalTax || 0).toLocaleString("th-TH")}`;
    return `${n} รายการ · ${tax}`;
  };

  const goReg = (status) => router.push(`/tax/registrations?status=${status}`);
  const goFil = (status) => router.push(`/tax/filings?status=${status}`);

  // Build the role's action queue.
  const queue = [];
  if (canSA) {
    regs.filter((x) => x.status === "draft").forEach((x) =>
      queue.push({ id: `rd-${x.id}`, status: "draft", title: `${x.fgCode} · ${x.productName}`, subtitle: `${x.customerName || "-"} — แนบเอกสารแล้วยื่นขึ้นทะเบียน`, cta: "แนบ/ยื่น", onClick: () => goReg("draft") }));
    regs.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `r-${x.id}`, status: "rejected", title: `${x.fgCode} · ${x.productName}`, subtitle: `${x.customerName || "-"} — ${x.rejectionReason || "ตีกลับให้แก้ไข"}`, cta: "แก้ไข", onClick: () => goReg("rejected") }));
    orders.filter((x) => x.status === "pending").forEach((x) =>
      queue.push({ id: `o-${x.id}`, status: "pending", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: itemsLine(x), cta: "รับเงิน", onClick: () => goFil("pending") }));
    orders.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `ox-${x.id}`, status: "rejected", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: `${itemsLine(x)} — ${x.rejectionReason || "ตีกลับ"}`, cta: "แก้ไข", onClick: () => goFil("rejected") }));
  }
  if (canLG) {
    regs.filter((x) => x.status === "pending_legal").forEach((x) =>
      queue.push({ id: `rl-${x.id}`, status: "pending_legal", title: `${x.fgCode} · ${x.productName}`, subtitle: `${x.customerName || "-"} — รอตรวจขึ้นทะเบียน`, cta: "ตรวจอนุมัติ", onClick: () => goReg("pending_legal") }));
    orders.filter((x) => x.status === "received").forEach((x) =>
      queue.push({ id: `or-${x.id}`, status: "received", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: `${itemsLine(x)} — รอยื่นกรมสรรพสามิต`, cta: "ไปยื่น", onClick: () => goFil("received") }));
    orders.filter((x) => x.status === "filing").forEach((x) =>
      queue.push({ id: `of-${x.id}`, status: "filing", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: `${itemsLine(x)} — กำลังยื่น`, cta: "บันทึกชำระ", onClick: () => goFil("filing") }));
  }

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="งานที่ต้องทำของคุณ + ภาพรวมทั้งสองสายงาน"
      loading={l1 || l2}
      headerRight={
        <div className="flex items-center gap-3">
          <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-md flex items-center p-1 shadow-sm">
            <Calendar size={14} className="mx-2 text-[var(--text-3)]" />
            <Select
              value={timeRange} 
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent text-sm border-none outline-none text-[var(--text-2)] font-medium pr-2 cursor-pointer"
            >
              <option value="all">ทั้งหมด (All Time)</option>
              <option value="month">เดือนนี้ (This Month)</option>
              <option value="quarter">ไตรมาสนี้ (This Quarter)</option>
            </Select>
          </div>
          <Link href="/tax/reports" className="btn btn-secondary flex items-center gap-1.5"><BarChart3 size={16} /> รายงาน</Link>
        </div>
      }
    >
      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Track 1: การขึ้นทะเบียน */}
        <section>
          <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text-1)", fontWeight: 600, fontSize: 16 }}>
            <ClipboardCheck size={20} className="text-[var(--accent)]" /> การขึ้นทะเบียน (Registrations)
            <Link href="/tax/registrations" className="flex items-center ml-auto text-sm text-[var(--accent)] hover:underline">
              เปิดหน้างาน <ChevronRight size={16} />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1 glass-panel p-4 h-[220px]">
              <div className="text-sm font-semibold text-[var(--text-2)] mb-2">สัดส่วนสถานะการขึ้นทะเบียน</div>
              <RegsDonutChart regs={regs} />
            </div>
            <div className="lg:col-span-3 kpi-grid">
              <KpiCard label="ฉบับร่าง" value={r.draft} tone="neutral" icon={ClipboardCheck} onClick={() => goReg("draft")} />
              <KpiCard label="รออนุมัติ" value={r.pending_legal} tone="warning" onClick={() => goReg("pending_legal")} />
              <KpiCard label="ขึ้นทะเบียนแล้ว" value={r.approved} tone="success" onClick={() => goReg("approved")} />
              <KpiCard label="ตีกลับให้แก้ไข" value={r.rejected} tone="danger" onClick={() => goReg("rejected")} />
            </div>
          </div>
        </section>

        {/* Track 2: การยื่นชำระภาษี */}
        <section>
          <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text-1)", fontWeight: 600, fontSize: 16 }}>
            <ReceiptText size={20} className="text-[var(--accent)]" /> การยื่นชำระภาษี (Tax Filings)
            <Link href="/tax/filings" className="flex items-center ml-auto text-sm text-[var(--accent)] hover:underline">
              เปิดหน้างาน <ChevronRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 glass-panel p-4 h-[260px]">
              <div className="text-sm font-semibold text-[var(--text-2)] mb-2">สรุปรายการและยอดเงินภาษี</div>
              <OrdersComposedChart orders={orders} />
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 gap-4">
              <KpiCard 
                label="รอรับเงิน" 
                value={getCountAndTax(o.pending).count} 
                taxValue={getCountAndTax(o.pending).tax}
                tone="danger" 
                icon={ReceiptText} 
                onClick={() => goFil("pending")} 
              />
              <KpiCard 
                label="รอยื่น" 
                value={getCountAndTax(o.received).count} 
                taxValue={getCountAndTax(o.received).tax}
                tone="warning" 
                onClick={() => goFil("received")} 
              />
              <KpiCard 
                label="กำลังยื่น" 
                value={getCountAndTax(o.filing).count} 
                taxValue={getCountAndTax(o.filing).tax}
                tone="info" 
                onClick={() => goFil("filing")} 
              />
              <KpiCard 
                label="ชำระแล้ว" 
                value={getCountAndTax(o.complete).count} 
                taxValue={getCountAndTax(o.complete).tax}
                tone="success" 
                onClick={() => goFil("complete")} 
              />
            </div>
          </div>
        </section>

        {/* Action queue */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-1)", fontWeight: 600, fontSize: 16 }}>
            งานของฉันตอนนี้ {queue.length > 0 && <span className="ui-badge danger">{queue.length}</span>}
          </div>
          <WorkQueue items={queue} />
        </section>
      </div>
    </Workspace>
  );
}
