"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ReceiptText, Package, Pencil, Trash2 } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import StagePill from "@/components/tax/StagePill";
import StatusTimeline from "@/components/tax/StatusTimeline";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { TaxSpinner } from "@/components/tax/TaxWorkspace";
import ApproveProductModal from "@/components/ApproveProductModal";
import RejectModal from "@/components/RejectModal";
import EditRegistrationModal from "@/components/EditRegistrationModal";

// Detail of one excise registration (product + customer + approval state).
// Redesigned: StagePill + a StatusTimeline of the registration workflow, and a
// branded ConfirmModal in place of window.confirm. Logic/API unchanged.
export default function RegistrationDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canApprove = useCan("legal:approve");
  const canEdit = useCan("products:edit");

  const [reg, setReg] = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchReg = async () => {
    try {
      const res = await fetch(`/api/excise-registrations/${id}`);
      if (res.ok) {
        const r = await res.json();
        setReg(r);
        if (r.productId) {
          const pr = await fetch(`/api/products/${r.productId}`);
          if (pr.ok) setProduct(await pr.json());
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "ไม่พบทะเบียนนี้");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) fetchReg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleReject = async (reason) => {
    const res = await fetch(`/api/excise-registrations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
    if (res.ok) { setShowReject(false); await fetchReg(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "เกิดข้อผิดพลาดในการทำรายการ"); }
  };

  const handleResubmit = async () => {
    const res = await fetch(`/api/excise-registrations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_legal" }),
    });
    if (res.ok) await fetchReg();
    else { const d = await res.json().catch(() => ({})); alert(d.error || "ไม่สามารถส่งกลับได้"); }
  };

  const doDelete = async () => {
    const res = await fetch(`/api/excise-registrations/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/tax/register");
    else { const d = await res.json().catch(() => ({})); alert(d.error || "ไม่สามารถลบได้"); }
  };

  if (loading) return <TaxSpinner />;

  if (error || !reg) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{error || "ไม่พบทะเบียนนี้"}</h2>
        <Link href="/tax/register" className="btn btn-primary px-6 inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> กลับไปรายการขึ้นทะเบียน
        </Link>
      </div>
    );
  }

  const isExempt = reg.isExciseTaxable === false;
  const taxPerUnit = isExempt ? 0 : (reg.exciseTax || 0) + (reg.localTax || 0);

  // Build the workflow timeline from the registration state.
  const reviewState = reg.status === "pending_legal" ? "current" : reg.status === "rejected" ? "rejected" : "done";
  const steps = [
    { label: "ยื่นขึ้นทะเบียน (SA)", state: "done", meta: `${reg.assignee || "-"} · ${fmtDateTime(reg.createdAt)}` },
    {
      label: "ตรวจสอบโดยฝ่ายกฎหมาย (LG)",
      state: reviewState,
      meta: reg.status === "rejected"
        ? `ตีกลับ: ${reg.rejectionReason || "-"}`
        : reg.status === "approved"
          ? `${reg.approvedByName || ""}${reg.approvedAt ? ` · ${fmtDateTime(reg.approvedAt)}` : ""}`
          : "รอตรวจสอบ",
    },
    reg.status === "rejected"
      ? { label: "รอ SA แก้ไขและส่งกลับ", state: "current", meta: "อยู่ในวงแก้ไข" }
      : { label: "ขึ้นทะเบียนเสร็จสมบูรณ์", state: reg.status === "approved" ? "done" : "upcoming", meta: reg.status === "approved" ? `เลขที่อนุมัติ ${reg.approvalNumber || "-"}` : undefined },
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-[14px]">
        <button
          type="button"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/tax/register"))}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--text-2)", fontSize: "13px", fontWeight: 500, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <ArrowLeft size={16} /> กลับ
        </button>

        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowEdit(true)} className="btn px-3 flex items-center gap-1.5 text-[var(--text-2)] hover:text-[var(--accent)] text-xs">
              <Pencil size={14} /> แก้ไข
            </button>
            <button onClick={() => setShowDelete(true)} className="btn px-3 flex items-center gap-1.5 text-[var(--red)] hover:bg-[var(--red-soft)] text-xs">
              <Trash2 size={14} /> ลบ
            </button>
          </div>
        )}
      </div>

      <div className="premium-header flex justify-between items-center mb-6">
        <div className="header-content">
          <h1 className="flex items-center gap-2 flex-wrap">
            <span className="premium-header-icon"><ReceiptText size={20} /></span>
            {reg.productName}
            <span className="pill font-mono text-xs">{reg.fgCode}</span>
          </h1>
          <p>ลูกค้า: {reg.customerName} | แบรนด์: {reg.brandName}</p>
        </div>

        <div className="flex gap-2">
          {canApprove && reg.status === "pending_legal" && (
            <>
              <button onClick={() => setShowApprove(true)} className="btn btn-primary px-6 py-2 text-xs font-semibold rounded-lg">อนุมัติขึ้นทะเบียน</button>
              <button onClick={() => setShowReject(true)} className="btn border border-[var(--border)] text-[var(--red)] px-4 py-2 text-xs font-semibold rounded-lg">ตีกลับ</button>
            </>
          )}
          {canEdit && reg.status === "rejected" && (
            <button onClick={handleResubmit} className="btn btn-primary px-5 py-2 text-xs font-semibold rounded-lg">ส่งกลับให้ตรวจอีกครั้ง</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[22px]">
        <div className="lg:col-span-2 space-y-6">
          {/* Linked master product */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <Package size={16} className="text-[var(--accent)]" /> ข้อมูลสินค้า (จากฐานข้อมูลกลาง)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-[var(--text-3)] block mb-1">รหัสสำเร็จรูป FG Code</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">{reg.fgCode}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">แบรนด์</span>
                <span className="font-semibold text-[var(--text)] text-sm">{reg.brandName}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">ปริมาตร</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product ? `${product.volume} ml` : "-"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">ราคาขายปลีก (รวม VAT)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product ? fmtMoney(product.retailPriceIncVat) : "-"}</span>
              </div>
            </div>
            {product && (
              <Link href={`/database/products/${product.id}`} className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-[var(--accent)] hover:underline">
                เปิดดูสินค้าในฐานข้อมูล →
              </Link>
            )}
          </div>

          {/* Customer */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">ลูกค้าที่ขึ้นทะเบียนให้</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-[var(--text-3)] block mb-1">ชื่อลูกค้า</span>
                <span className="font-semibold text-[var(--text)] text-sm">{reg.customerName || "-"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">เลขผู้เสียภาษี</span>
                <span className="font-mono text-[var(--text)] text-sm">{reg.taxId || "-"}</span>
              </div>
            </div>
          </div>

          {/* Workflow timeline */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">สายงานการขึ้นทะเบียน</h3>
            <StatusTimeline steps={steps} />
          </div>
        </div>

        {/* Status + tax */}
        <div className="space-y-6">
          <div className="glass-panel p-[20px]">
            <span className="text-[var(--text-3)] text-[10px] block mb-1">สถานะขึ้นทะเบียน</span>
            <div className="mt-1">
              <StagePill status={reg.status} />
              {reg.status === "approved" && reg.approvalNumber && (
                <div className="mt-2 text-xs font-mono bg-[var(--panel-2)] p-2 rounded border border-[var(--border)]">
                  <span className="text-[var(--text-3)]">เลขที่อนุมัติ: </span>{reg.approvalNumber}
                  {reg.approvedByName && (
                    <div className="font-sans text-[var(--text-3)] mt-1">
                      โดย {reg.approvedByName}{reg.approvedAt && ` · ${new Date(reg.approvedAt).toLocaleDateString("th-TH")}`}
                    </div>
                  )}
                </div>
              )}
              {reg.status === "rejected" && reg.rejectionReason && (
                <div className="mt-2 text-xs bg-[var(--red-soft)] p-2 rounded border border-[var(--border)] text-[var(--text-2)]">
                  <span className="text-[var(--red)] font-semibold">เหตุผลที่ตีกลับ: </span>{reg.rejectionReason}
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-3)] mt-2">ยื่นเมื่อ: {new Date(reg.createdAt).toLocaleString("th-TH")}</p>
          </div>

          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">ภาษีสรรพสามิตต่อหน่วย</h3>
            {isExempt ? (
              <div className="bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)] text-center text-xs">
                <span className="font-bold text-[var(--green)] block text-sm">ได้รับการยกเว้นภาษีสรรพสามิต</span>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีสรรพสามิต (8%)</span>
                  <span className="font-semibold font-mono text-[var(--text)]">{fmtMoney(reg.exciseTax)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีบำรุงท้องถิ่น (10%)</span>
                  <span className="font-semibold font-mono text-[var(--text)]">{fmtMoney(reg.localTax)}</span>
                </div>
                <div className="bg-[var(--red-soft)] p-4 rounded-xl border border-[var(--border)] mt-2">
                  <span className="text-[var(--red)] font-semibold block text-[10px] uppercase tracking-wider">รวมภาษีต่อชิ้น</span>
                  <div className="text-2xl font-bold font-mono text-[var(--red)] mt-1">{fmtMoney(taxPerUnit)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ApproveProductModal open={showApprove} registration={reg} onClose={() => setShowApprove(false)} onApproved={fetchReg} />
      <RejectModal open={showReject} onClose={() => setShowReject(false)} onConfirm={handleReject} title="ตีกลับการขึ้นทะเบียน" entityLabel="ทะเบียนนี้" />
      <EditRegistrationModal open={showEdit} onClose={() => setShowEdit(false)} onSaved={fetchReg} registration={reg} />
      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={doDelete}
        title="ลบรายการขึ้นทะเบียน"
        message={`ยืนยันการลบทะเบียนของ ${reg.fgCode} (${reg.customerName || "-"})? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
      />
    </>
  );
}
