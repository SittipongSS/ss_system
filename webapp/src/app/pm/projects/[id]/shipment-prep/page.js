"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, PackageCheck, Printer, RefreshCcw } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";

const fmtDate = (value) => value ? new Date(value).toLocaleDateString("th-TH") : "-";
const num = (value) => Number(value || 0).toLocaleString("th-TH");

export default function ShipmentPrepPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEditPm = useCan("pm:edit");
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [prep, setPrep] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/pm/projects/${id}/shipment-prep`);
    if (res.ok) {
      const payload = await res.json();
      setProject(payload.project || null);
      setPrep(payload.shipmentPrep || null);
    } else {
      setToast({ kind: "error", msg: "โหลดเอกสารเตรียมส่งของไม่สำเร็จ" });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const createPrep = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/pm/projects/${id}/shipment-prep`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: payload.error || "สร้างเอกสารเตรียมส่งของไม่สำเร็จ" });
        return;
      }
      setPrep(payload);
      setToast({ kind: payload.reused ? "info" : "success", msg: payload.reused ? "เปิดเอกสารเดิมแล้ว" : "สร้างเอกสารเตรียมส่งของแล้ว" });
    } finally {
      setCreating(false);
    }
  };

  const title = useMemo(() => {
    if (!prep) return "เอกสารเตรียมส่งของ";
    return `${prep.prepNumber} · ${project?.code || prep.projectCode || ""}`.trim();
  }, [prep, project]);

  if (loading) return <SkeletonRows />;

  if (!project) {
    return <EmptyState icon={FileText}>ไม่พบโปรเจกต์</EmptyState>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <Link href={`/pm/projects/${project.code || project.id}`} className="linklike" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
          <ArrowLeft size={16} /> กลับไปโปรเจกต์
        </Link>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={load}>
            <RefreshCcw size={14} /> รีเฟรช
          </button>
          {prep && (
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={14} /> พิมพ์
            </button>
          )}
        </div>
      </div>

      {!prep ? (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>ยังไม่มีเอกสารเตรียมส่งของ</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: "13px" }}>
              ระบบจะสร้างรายการจาก FG ที่ผูกอยู่ในโปรเจกต์นี้ แล้วเปิดเป็นเอกสารพร้อมพิมพ์สำหรับคลัง
            </p>
          </div>
          {canEditPm && (
            <button type="button" className="btn btn-primary" onClick={createPrep} disabled={creating}>
              <PackageCheck size={14} /> {creating ? "กำลังสร้าง..." : "สร้างเอกสาร"}
            </button>
          )}
        </div>
      ) : (
        <main className="shipment-print-sheet" aria-labelledby="shipment-title">
          <header className="shipment-print-head">
            <div>
              <div className="shipment-print-kicker">Shipment Preparation</div>
              <h1 id="shipment-title">{title}</h1>
              <p>{project.name || "-"} · ลูกค้า: {prep.customerName || project.customerName || "-"}</p>
            </div>
            <div className="shipment-print-meta">
              <div><span>เลขที่</span><strong>{prep.prepNumber}</strong></div>
              <div><span>วันที่</span><strong>{fmtDate(prep.prepDate)}</strong></div>
              <div><span>กำหนดส่ง</span><strong>{fmtDate(prep.dueDate || project.dueDate)}</strong></div>
            </div>
          </header>

          <section className="shipment-print-info" aria-label="ข้อมูลโปรเจกต์">
            <div><span>Project</span><strong>{project.code || project.id}</strong></div>
            <div><span>AE</span><strong>{project.aeOwner || "-"}</strong></div>
            <div><span>PO</span><strong>{project.metadata?.poNumber || prep.metadata?.poNumber || "-"}</strong></div>
            <div><span>Quotation</span><strong>{project.metadata?.quotationNumber || prep.metadata?.quotationNumber || "-"}</strong></div>
          </section>

          <section>
            <table className="shipment-print-table">
              <thead>
                <tr>
                  <th style={{ width: "44px" }}>#</th>
                  <th>FG</th>
                  <th>สินค้า</th>
                  <th style={{ width: "110px" }}>จำนวน</th>
                  <th style={{ width: "150px" }}>หมายเหตุคลัง</th>
                </tr>
              </thead>
              <tbody>
                {(prep.lines || []).map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td className="shipment-mono">{line.fgCode || "-"}</td>
                    <td>{line.description || "-"}</td>
                    <td className="shipment-num">{num(line.qty)}</td>
                    <td>{line.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="shipment-signatures">
            <div><span>ผู้เตรียมเอกสาร</span></div>
            <div><span>คลังรับเรื่อง</span></div>
            <div><span>ผู้อนุมัติส่งมอบ</span></div>
          </footer>
        </main>
      )}
    </div>
  );
}
