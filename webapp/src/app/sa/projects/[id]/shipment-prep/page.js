"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderX, PackageCheck, Printer, RefreshCcw } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import { SYSTEM_DOCUMENT_LOGO_URL } from "@/lib/documentBrand";
import { PageShell as SaPageShell } from "@/components/ui/Workspace";

const num = (value) => fmtNumber(value || 0);
const paginateShipmentLines = (lines = []) => {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];
  const pages = [];
  let remaining = lines.slice();
  while (remaining.length > 8) pages.push(remaining.splice(0, Math.min(12, remaining.length - 8)));
  pages.push(remaining);
  return pages;
};

export default function ShipmentPrepPage() {
  const { id } = useParams();
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
  const shipmentPages = useMemo(() => paginateShipmentLines(prep?.lines || []), [prep?.lines]);

  if (loading) return <SkeletonRows />;

  if (!project) {
    return <EmptyState icon={FolderX}>ไม่พบโครงการ</EmptyState>;
  }

  return (
    <SaPageShell className="shipment-prep-page">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="no-print">
        <Link href={`/sa/projects/${project.code || project.id}`} className="linklike" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "var(--fs-7)" }}>
          <ArrowLeft size={16} /> กลับไปโครงการ
        </Link>
        <DetailPageLayout
          asideLabel="สรุปและจัดการเอกสารเตรียมส่งของ"
          aside={(
            <>
              <DocumentSummaryCard
                title="สรุปเอกสารเตรียมส่ง"
                rows={[
                  { id: "project", label: "โครงการ", value: project.code || project.id },
                  { id: "items", label: "รายการสินค้า", value: `${prep?.lines?.length || 0} รายการ` },
                  { id: "qty", label: "จำนวนรวม", value: `${num((prep?.lines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0))} ชิ้น` },
                  { id: "due", label: "กำหนดส่ง", value: fmtDate(prep?.dueDate || project.dueDate) },
                ]}
                status={prep ? "พร้อมพิมพ์" : "ยังไม่สร้างเอกสาร"}
                statusColor={prep ? "var(--green)" : "var(--amber)"}
              />
              <DocumentControlCard
                status={prep ? "พร้อมพิมพ์" : "ยังไม่สร้างเอกสาร"}
                statusColor={prep ? "var(--green)" : "var(--amber)"}
                statusDescription="เอกสาร output สำหรับคลัง"
                primaryAction={prep
                  ? { id: "print", label: "พิมพ์เอกสาร", kind: "print", icon: Printer, onClick: () => window.print() }
                  : {
                    id: "create", label: creating ? "กำลังสร้าง..." : "สร้างเอกสาร",
                    kind: "create", icon: PackageCheck, onClick: createPrep,
                    visible: canEditPm, disabled: creating,
                  }}
                secondaryActions={[
                  { id: "refresh", label: "รีเฟรชข้อมูล", kind: "refresh", icon: RefreshCcw, onClick: load },
                ]}
                busy={creating}
              />
              <RelatedDocumentCard
                title="โครงการต้นทาง"
                meta={project.name || project.code || project.id}
                actions={<Link href={`/sa/projects/${project.code || project.id}`} className="btn ghost sm">เปิดโครงการ</Link>}
              >
                เอกสารสร้าง snapshot จาก FG ที่ผูกกับโครงการ ณ เวลาที่สร้าง
              </RelatedDocumentCard>
            </>
          )}
        >
          <div className="glass-panel" style={{ padding: "28px" }}>
            <h2 style={{ margin: 0, fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)" }}>
              {prep ? `${prep.prepNumber} พร้อมสำหรับคลัง` : "ยังไม่มีเอกสารเตรียมส่งของ"}
            </h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: "var(--fs-7)" }}>
              {prep
                ? `เอกสารมี ${prep.lines?.length || 0} รายการ · สร้างเมื่อ ${fmtDate(prep.prepDate)}`
                : "ระบบจะสร้างรายการจาก FG ที่ผูกอยู่ในโครงการนี้ แล้วเปิดเป็นเอกสารพร้อมพิมพ์สำหรับคลัง"}
            </p>
          </div>
        </DetailPageLayout>
      </div>

      {prep ? (
        <div className="shipment-print-document">
          {shipmentPages.map((pageLines, pageIndex) => (
          <main className="shipment-print-sheet" aria-labelledby={pageIndex === 0 ? "shipment-title" : undefined} key={pageIndex}>
          <header className="shipment-print-head">
            <div className="shipment-print-brand">
              <div
                className="shipment-print-logo"
              >
                {/* Plain img is intentional: the document logo is a colour-baked data URI, not a themed mark. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SYSTEM_DOCUMENT_LOGO_URL} alt="Scent & Sense" />
              </div>
              <div>
                <div className="shipment-print-kicker">Shipment Preparation</div>
                <h1 id={pageIndex === 0 ? "shipment-title" : undefined}>{title}</h1>
                <p>{naText(project.name)} · ลูกค้า: {prep.customerName || naText(project.customerName)}</p>
              </div>
            </div>
            <div className="shipment-print-meta">
              <div><span>เลขที่</span><strong>{prep.prepNumber}</strong></div>
              <div><span>วันที่</span><strong>{fmtDate(prep.prepDate)}</strong></div>
              <div><span>กำหนดส่ง</span><strong>{fmtDate(prep.dueDate || project.dueDate)}</strong></div>
            </div>
          </header>

          {pageIndex === 0 && <section className="shipment-print-info" aria-label="ข้อมูลโครงการ">
            <div><span>Project</span><strong>{project.code || project.id}</strong></div>
            <div><span>AE</span><strong>{naText(project.aeOwner)}</strong></div>
            <div><span>PO</span><strong>{project.metadata?.poNumber || naText(prep.metadata?.poNumber)}</strong></div>
            <div><span>Quotation</span><strong>{project.metadata?.quotationNumber || naText(prep.metadata?.quotationNumber)}</strong></div>
          </section>}

          <section>
            <TableScroll><table className="shipment-print-table">
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
                {pageLines.map((line, lineIndex) => {
                  const index = shipmentPages.slice(0, pageIndex).reduce((sum, page) => sum + page.length, 0) + lineIndex;
                  return (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td className="shipment-mono">{naText(line.fgCode)}</td>
                    <td>{naText(line.description)}</td>
                    <td className="shipment-num">{num(line.qty)}</td>
                    <td>{line.note || ""}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table></TableScroll>
          </section>

          {pageIndex === shipmentPages.length - 1 && <footer className="shipment-signatures">
            <div><span>ผู้เตรียมเอกสาร</span></div>
            <div><span>คลังรับเรื่อง</span></div>
            <div><span>ผู้อนุมัติส่งมอบ</span></div>
          </footer>}
          <div className="shipment-page-number">หน้า {pageIndex + 1} / {shipmentPages.length}</div>
        </main>
          ))}
        </div>
      ) : null}
      </div>
    </SaPageShell>
  );
}
