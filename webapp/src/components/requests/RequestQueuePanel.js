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
import StatusBadge from "@/components/ui/StatusBadge";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES, requestProgress } from "@/lib/deptRequests";
import {
  requestHasItems, requestKindLabel, requestKindMeta, requestShapeError,
} from "@/lib/master/requestTypes";

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [], materials = [], customers = [], products = [],
  // ทะเบียนที่ฟอร์มอ้างตามชนิดคำร้อง — ดีล (บรีฟ/mockup/เอกสาร) · กลิ่น (F) · สูตร (FB)
  deals = [], scents = [], formulas = [],
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
        kind: form.kind,
        // ฝ่ายส่งไปเฉพาะชนิดที่ไม่ล็อกฝ่ายไว้ — ที่เหลือ server อนุมานเองจากชนิด/รายการ
        dept: form.dept || null,
        title: form.title || null,
        body: form.body || null,
        urgent: !!form.urgent,
        requestedDueDate: form.requestedDueDate || null,
        dealId: form.dealId || null,
        scentId: form.scentId || null,
        formulaId: form.formulaId || null,
        customerId: form.customerId || null,
        customerName: customers.find((c) => c.id === form.customerId)?.name || null,
        productId: form.productId || null,
        productName: products.find((p) => p.id === form.productId)?.name || null,
        formulaCode: form.formulaCode || null,
        formulaName: form.formulaName || null,
        note: form.note,
        // ชนิดที่ไม่มีบรรทัดต้องไม่ส่ง items ไปเลย ไม่ใช่ส่ง [] — server ใช้ชนิด
        // เป็นตัวตัดสินอยู่แล้ว แต่ส่งของที่ไม่เกี่ยวไปด้วยทำให้ debug ยากขึ้นเปล่า ๆ
        ...(requestHasItems(form.kind) ? {
          items: (form.items || []).map((it) => ({
            kind: it.kind,
            materialId: it.material?.materialId || null,
            label: it.material?.label || "",
            spec: it.spec,
            componentId: it.componentId || null,
            tiers: it.tiers,
          })),
        } : {}),
      };
      const res = await fetch("/api/sa/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "เปิดคำร้องไม่สำเร็จ");
      router.push(`/sa/requests/${d.id}`);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setSaving(false);
    }
  };

  // ปุ่มบันทึกเปิดเมื่อกรอกครบตาม "ชนิด" — ใช้ requestShapeError ตัวเดียวกับ server
  // (ฟอร์มกับ API ตัดสินด้วยกฎชุดเดียว ไม่มีทางเพี้ยนหากัน) แล้วเติมด่านของ
  // รายการวัสดุซึ่ง server ตรวจอีกชั้นตอน normalizeRequestItems
  const formReady = !!form
    && !requestShapeError(form.kind, {
      title: form.title,
      dealId: form.dealId,
      scentId: form.scentId,
      formulaId: form.formulaId,
      items: requestHasItems(form.kind) ? form.items : undefined,
    })
    && (!requestHasItems(form.kind)
      || (form.items || []).every((it) => it.material?.materialId || (it.material?.label || "").trim()))
    // ชนิดที่ไม่ล็อกฝ่ายต้องเลือกฝ่ายก่อน ไม่งั้น server ตอบ 400 หลังกดไปแล้ว
    && (requestHasItems(form.kind) || !!requestKindMeta(form.kind)?.dept || !!form.dept);

  return (
    <>
      <div className="toolbar">
        <span className="spacer" />
        <button type="button" className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        <button type="button" className="btn btn-accent" onClick={() => setForm(emptyRequestForm())}>
          <Plus size={14} /> เปิดคำร้อง
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {scope === "queue"
            ? `ไม่มีคำร้องรอฝ่าย ${dept || "คุณ"} ตอบ`
            : "ยังไม่มีคำร้องของคุณ — กด \"เปิดคำร้อง\" เพื่อเริ่ม"}
        </EmptyState>
      ) : (
        <TableScroll>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>เลขที่</th>
                <th style={{ width: 170 }}>ชนิด</th>
                <th>เรื่อง / ลูกค้า</th>
                <th style={{ width: 90 }}>ถึงฝ่าย</th>
                <th style={{ width: 120 }}>ความคืบหน้า</th>
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
                    <td style={{ fontWeight: 500 }}>
                      {ask.docNo || "ร่าง"}
                      {ask.urgent && (
                        <span className="ui-badge" style={{ color: "var(--red)", marginLeft: 6 }}>ด่วน</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{requestKindLabel(ask.kind)}</td>
                    <td>
                      {/* ชนิดที่ไม่มีบรรทัดสื่อความด้วยหัวเรื่อง — ชนิดขอราคาสื่อด้วยลูกค้า/สูตร */}
                      <div>{ask.title || ask.customerName
                        || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}</div>
                      {ask.title && ask.customerName && (
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{ask.customerName}</div>
                      )}
                      {ask.formulaCode && (
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>สูตร {ask.formulaCode}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{ask.dept}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.total > 0
                        ? `${p.done}/${p.total} ตอบแล้ว`
                        : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                    <td>
                      <StatusBadge
                        tone={REQUEST_STATUS_TONES[ask.status] || "neutral"}
                        label={REQUEST_STATUS_LABELS[ask.status] || ask.status}
                      />
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
        title="เปิดคำร้องข้ามฝ่าย"
      >
        {form && (
          <>
            <RequestForm
              value={form} onChange={setForm} disabled={saving}
              materials={materials} customers={customers} products={products}
              deals={deals} scents={scents} formulas={formulas}
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
