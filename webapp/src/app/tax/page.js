"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, ReceiptText, BarChart3, ChevronRight } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, seesSA, seesLG } from "@/lib/excise/workflow";
import KpiCard from "@/components/excise/KpiCard";
import WorkQueue from "@/components/excise/WorkQueue";

// Excise command center — role-aware landing. KPI rails for both tracks +
// a single "งานของฉันตอนนี้" queue that deep-links into the list drawers.
export default function TaxDashboard() {
  const role = useRole();
  const dept = deptOf(role);
  const router = useRouter();
  const { data: regs, loading: l1 } = useApiList("/api/excise-registrations");
  const { data: orders, loading: l2 } = useApiList("/api/orders");

  const r = {
    draft: regs.filter((x) => x.status === "draft").length,
    pending_legal: regs.filter((x) => x.status === "pending_legal").length,
    approved: regs.filter((x) => x.status === "approved").length,
    rejected: regs.filter((x) => x.status === "rejected").length,
  };
  const o = {
    pending: orders.filter((x) => x.status === "pending").length,
    received: orders.filter((x) => x.status === "received").length,
    filing: orders.filter((x) => x.status === "filing").length,
    complete: orders.filter((x) => x.status === "complete").length,
    rejected: orders.filter((x) => x.status === "rejected").length,
  };

  const itemsLine = (ord) => {
    const n = ord.items?.length || 0;
    const tax = (ord.totalTax || 0) === 0 ? "ยกเว้นภาษี" : `ภาษี ${fmtMoney(ord.totalTax)}`;
    return `${n} รายการ · ${tax}`;
  };
  const goReg = (status) => router.push(`/tax/registrations?status=${status}`);
  const goFil = (status) => router.push(`/tax/filings?status=${status}`);

  // Build the role's action queue.
  const queue = [];
  if (seesSA(dept)) {
    regs.filter((x) => x.status === "draft").forEach((x) =>
      queue.push({ id: `rd-${x.id}`, status: "draft", title: `${x.fgCode} · ${x.productName}`, subtitle: `${x.customerName || "-"} — แนบเอกสารแล้วยื่นขึ้นทะเบียน`, cta: "แนบ/ยื่น", onClick: () => goReg("draft") }));
    regs.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `r-${x.id}`, status: "rejected", title: `${x.fgCode} · ${x.productName}`, subtitle: `${x.customerName || "-"} — ${x.rejectionReason || "ตีกลับให้แก้ไข"}`, cta: "แก้ไข", onClick: () => goReg("rejected") }));
    orders.filter((x) => x.status === "pending").forEach((x) =>
      queue.push({ id: `o-${x.id}`, status: "pending", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: itemsLine(x), cta: "รับเงิน", onClick: () => goFil("pending") }));
    orders.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `ox-${x.id}`, status: "rejected", title: `${x.quotationRef} · ${x.customerName || "-"}`, subtitle: `${itemsLine(x)} — ${x.rejectionReason || "ตีกลับ"}`, cta: "แก้ไข", onClick: () => goFil("rejected") }));
  }
  if (seesLG(dept)) {
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
      title="ศูนย์บัญชาการภาษีสรรพสามิต"
      subtitle="งานที่ต้องทำของคุณ + ภาพรวมทั้งสองสายงาน"
      loading={l1 || l2}
      headerRight={<Link href="/tax/reports" className="btn btn-secondary flex items-center gap-1.5"><BarChart3 size={16} /> รายงาน</Link>}
    >
      <div className="flex flex-col gap-6">
        {/* Track 1 */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <ClipboardCheck size={16} /> การขึ้นทะเบียน
            <Link href="/tax/registrations" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="ฉบับร่าง" value={r.draft} tone="neutral" icon={ClipboardCheck} onClick={() => goReg("draft")} />
            <KpiCard label="รออนุมัติ" value={r.pending_legal} tone="warning" onClick={() => goReg("pending_legal")} />
            <KpiCard label="ขึ้นทะเบียนแล้ว" value={r.approved} tone="success" onClick={() => goReg("approved")} />
            <KpiCard label="ตีกลับให้แก้ไข" value={r.rejected} tone="danger" onClick={() => goReg("rejected")} />
          </div>
        </section>

        {/* Track 2 */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <ReceiptText size={16} /> การยื่นชำระภาษี
            <Link href="/tax/filings" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="รอรับเงิน" value={o.pending} tone="danger" icon={ReceiptText} onClick={() => goFil("pending")} />
            <KpiCard label="รอยื่น" value={o.received} tone="warning" onClick={() => goFil("received")} />
            <KpiCard label="กำลังยื่น" value={o.filing} tone="info" onClick={() => goFil("filing")} />
            <KpiCard label="ชำระแล้ว" value={o.complete} tone="success" onClick={() => goFil("complete")} />
          </div>
        </section>

        {/* Action queue */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            งานของฉันตอนนี้ {queue.length > 0 && <span className="ui-badge danger">{queue.length}</span>}
          </div>
          <WorkQueue items={queue} />
        </section>
      </div>
    </Workspace>
  );
}
