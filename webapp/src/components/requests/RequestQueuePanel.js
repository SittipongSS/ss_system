"use client";
import { TableScroll } from "@/components/ui/Table";
// คำร้องข้ามฝ่าย (mig 0173) — คำร้องของฉัน / คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/materials (คู่กับ MaterialRegistryPanel) — หน้าแม่
// เป็นเจ้าของข้อมูลและตัวนับบนแท็บ พาเนลนี้เลือกแสดงตาม scope ที่ส่งมา
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, RefreshCw, Plus } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import { fmtDate } from "@/lib/format";
import { REQUEST_STATUS_LABELS, requestProgress } from "@/lib/deptRequests";

const STATUS_TONE = {
  draft: "var(--text-3)",
  pending: "var(--amber)",
  acknowledged: "var(--blue)",
  answered: "var(--green)",
  closed: "var(--text-3)",
  cancelled: "var(--text-3)",
};

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [], materials = [], customers = [], products = [],
  loading = false, loadError = "", reload,
}) {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const create = async () => {
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId || null,
        customerName: customers.find((c) => c.id === form.customerId)?.name || null,
        productId: form.productId || null,
        productName: products.find((p) => p.id === form.productId)?.name || null,
        formulaCode: form.formulaCode || null,
        formulaName: form.formulaName || null,
        note: form.note,
        items: (form.items || []).map((it) => ({
          kind: it.kind,
          materialId: it.material?.materialId || null,
          label: it.material?.label || "",
          spec: it.spec,
          componentId: it.componentId || null,
          tiers: it.tiers,
        })),
      };
      const res = await fetch("/api/sa/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "เปิดเคสไม่สำเร็จ");
      router.push(`/sa/requests/${d.id}`);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setSaving(false);
    }
  };

  const formReady = form
    && (form.items || []).length > 0
    && (form.items || []).every((it) => it.material?.materialId || (it.material?.label || "").trim());

  return (
    <>
      <div className="toolbar">
        <span className="spacer" />
        <button type="button" className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        <button type="button" className="btn btn-accent" onClick={() => setForm(emptyRequestForm())}>
          <Plus size={14} /> เปิดเคสขอราคา
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {scope === "queue"
            ? `ไม่มีเคสรอฝ่าย ${dept || "คุณ"} ตอบ`
            : "ยังไม่มีเคสของคุณ — กด \"เปิดเคสขอราคา\" เพื่อเริ่ม"}
        </EmptyState>
      ) : (
        <TableScroll>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>เลขที่</th>
                <th>ลูกค้า / หมายเหตุ</th>
                <th style={{ width: 90 }}>ถึงฝ่าย</th>
                <th style={{ width: 120 }}>รายการ</th>
                <th style={{ width: 190 }}>สถานะ</th>
                <th style={{ width: 110 }}>อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                return (
                  <tr
                    key={ask.id} style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/sa/requests/${ask.id}`)}
                  >
                    <td style={{ fontWeight: 500 }}>{ask.docNo || "ร่าง"}</td>
                    <td>
                      <div>{ask.customerName || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}</div>
                      {ask.formulaCode && (
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>สูตร {ask.formulaCode}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{ask.dept}</td>
                    <td style={{ fontSize: 12 }}>{p.done}/{p.total} ตอบแล้ว</td>
                    <td>
                      <span className="status-pill" style={{ color: STATUS_TONE[ask.status], borderColor: "currentColor" }}>
                        {REQUEST_STATUS_LABELS[ask.status] || ask.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(ask.updatedAt || ask.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg" dismissible={!saving}
        title="เปิดเคสขอราคาวัสดุ"
      >
        {form && (
          <>
            <RequestForm
              value={form} onChange={setForm} disabled={saving}
              materials={materials} customers={customers} products={products}
            />
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
              เคสจะถูกสร้างเป็น <b>ร่าง</b> ก่อน — เลขที่จะออกตอนกดส่ง (ร่างที่ทิ้งไว้จะไม่กินเลข)
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={create} disabled={saving || !formReady}>
                สร้างเคส (ร่าง)
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
