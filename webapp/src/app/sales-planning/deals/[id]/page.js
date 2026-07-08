"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, ClipboardList, ExternalLink, FileText, LineChart, PackageCheck, RefreshCcw } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { SALES_FEATURES, STAGE_LABELS } from "@/lib/salesPlanning";
import { fmtMoney, fmtDateTime } from "@/lib/format";

// ข้อความอธิบาย drift แต่ละรายการ (FC รอบล่าสุดต่างจากตอน map)
function driftText(it) {
  if (it.kind === "dropped") return `${it.fgCode}: ถูกตัดออกจาก FC ล่าสุด (เดิม ${it.month} · ${Number(it.fromQty || 0).toLocaleString("th-TH")})`;
  if (it.kind === "shifted") return `${it.fgCode}: เลื่อนเดือน ${it.month} → ${(it.toMonths || []).join(", ")}`;
  if (it.kind === "qtyChanged") return `${it.fgCode} (${it.month}): จำนวน ${Number(it.fromQty || 0).toLocaleString("th-TH")} → ${Number(it.toQty || 0).toLocaleString("th-TH")}`;
  return `${it.fgCode}: มีการเปลี่ยนแปลง`;
}

const money = (value) => fmtMoney(value);

function stageBadge(stage) {
  const color = {
    draft: "var(--text-3)",
    pending: "var(--amber)",
    sent: "var(--blue)",
    accepted: "var(--green)",
    received: "var(--green)",
    waived: "var(--text-3)",
    rejected: "var(--red)",
    cancelled: "var(--red)",
    lead: "var(--text-3)",
    qualified: "var(--blue)",
    quotation: "var(--amber)",
    timeline_proposed: "var(--blue)",
    awaiting_confirm: "var(--teal)",
    deposit_pending: "var(--violet)",
    won: "var(--green)",
    in_project: "var(--green)",
    lost: "var(--red)",
  }[stage] || "var(--text-3)";
  return (
    <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      {STAGE_LABELS[stage] || stage || "-"}
    </span>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="glass-panel" style={{ padding: 14 }}>
      <div style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div className="mono tabular-nums" style={{ marginTop: 8, fontSize: 20, fontWeight: 800 }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: 18, color: "var(--text-3)", fontSize: 13 }}>{children}</div>;
}

export default function DealOverviewPage() {
  const params = useParams();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${id}/overview`);
      if (!res.ok) throw new Error((await res.json()).error || "load project center failed");
      setData(await res.json());
    } catch (e) {
      setError(e.message || "load project center failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const acceptedQuote = useMemo(() => (data?.quotations || []).find((quote) => quote.status === "accepted"), [data]);
  const pendingDocs = useMemo(() => (data?.documents || []).filter((doc) => doc.status === "pending"), [data]);

  const deal = data?.deal;
  const headerRight = (
    <>
      {deal?.projectId && (
        <a className="btn" href={`/pm/projects/${deal.projectId}`}>
          <ExternalLink size={15} aria-hidden="true" /> โครงการ PM
        </a>
      )}
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
    </>
  );

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title={deal?.title || "ศูนย์รวมโครงการ"}
      subtitle={deal ? `${deal.customerName || deal.customer?.name || "ไม่มีลูกค้า"} · ${deal.forecastMonth || "ไม่มีเดือนพยากรณ์"}` : "ศูนย์รวมโครงการ"}
      back={{ href: "/sales-planning", label: "กลับไปแผนงานขาย" }}
      headerRight={headerRight}
      loading={loading}
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {deal && (
        <div className="flex flex-col gap-5">
          {!!data?.warnings?.length && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", color: "var(--amber)", borderColor: "var(--amber)" }}>
              {data.warnings.join(" · ")}
            </div>
          )}

          {data?.forecastDrift?.hasDrift && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", borderColor: "var(--amber)", borderLeft: "3px solid var(--amber)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--amber)", fontWeight: 700 }}>
                <AlertTriangle size={16} aria-hidden="true" />
                FC สหมิตรรอบล่าสุด (#{data.forecastDrift.latestRoundNo}) ต่างจากตอนสร้างดีล
              </div>
              <ul style={{ margin: "8px 0 4px", paddingLeft: 20, fontSize: 13 }}>
                {data.forecastDrift.items.map((it, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{driftText(it)}</li>
                ))}
              </ul>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                คำแนะนำ: ดีลถูกล็อกตัวเลขไว้ตอน map — ปรับ “เดือนคาดได้รับ PO” / มูลค่าดีลเองหากต้องการให้ตรงกับ FC ล่าสุด
              </div>
            </div>
          )}

          <section className="kpi-grid">
            <Stat label="สถานะ" value={stageBadge(deal.stage)} hint={deal.depositPaid ? "ได้รับมัดจำ" : "ยังไม่ยืนยันมัดจำ"} />
            <Stat label="มูลค่าโครงการ" value={money(deal.projectValue)} hint={deal.forecastMonth || "-"} />
            {SALES_FEATURES.quotations && (
              <Stat label="ใบเสนอที่รับแล้ว" value={acceptedQuote ? money(acceptedQuote.totalAmount) : "-"} hint={acceptedQuote?.quoteNumber || "ยังไม่มีใบเสนอที่รับ"} />
            )}
            {SALES_FEATURES.documents && (
              <Stat label="เอกสารค้าง" value={pendingDocs.length} hint={`${data.documents?.length || 0} รายการ`} />
            )}
          </section>

          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>งานผลิต (PM)</h2>
              <div className="spacer" />
              {data.project && <a className="btn ghost" href={`/pm/projects/${data.project.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>}
            </div>
            {data.project ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <Stat label="โครงการ" value={data.project.code || data.project.id} hint={data.project.status || "-"} />
                <Stat label="ประเภท" value={data.project.type || "-"} hint={data.project.dueDate ? `กำหนด ${data.project.dueDate}` : "ไม่มีกำหนด"} />
                <Stat label="รายการ FG" value={data.projectProducts?.length || 0} hint={(data.projectProducts || []).slice(0, 2).map((row) => row.product?.fgCode).filter(Boolean).join(", ") || "-"} />
                {SALES_FEATURES.shipment && (
                  <Stat label="เอกสารส่งของ" value={data.shipmentPrep ? data.shipmentPrep.status : "-"} hint={data.shipmentPrep ? `${data.shipmentPrep.lines?.length || 0} รายการ` : "ยังไม่สร้าง"} />
                )}
              </div>
            ) : <Empty>ยังไม่ได้ผูกโครงการ PM</Empty>}
          </section>

          {(SALES_FEATURES.quotations || SALES_FEATURES.documents) && (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {SALES_FEATURES.quotations && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ใบเสนอราคา</h2>
              </div>
              {(data.quotations || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th>เลขที่</th><th>สถานะ</th><th>อนุมัติ</th><th className="num">ยอดรวม</th></tr>
                    </thead>
                    <tbody>
                      {data.quotations.map((quote) => (
                        <tr key={quote.id} className="premium-row">
                          <td className="mono">{quote.quoteNumber}</td>
                          <td>{stageBadge(quote.status)}</td>
                          <td>{stageBadge(quote.approvalStatus || "not_required")}</td>
                          <td className="num mono">{money(quote.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>ยังไม่มีใบเสนอราคา</Empty>}
            </section>
            )}

            {SALES_FEATURES.documents && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>เอกสาร</h2>
              </div>
              {(data.documents || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th>เอกสาร</th><th>สถานะ</th><th>กำหนด</th></tr>
                    </thead>
                    <tbody>
                      {data.documents.map((doc) => (
                        <tr key={doc.id} className="premium-row">
                          <td>{doc.title}<span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{doc.kind}</span></td>
                          <td>{stageBadge(doc.status)}</td>
                          <td className="mono">{doc.dueDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>ยังไม่มีรายการเอกสาร</Empty>}
            </section>
            )}
          </div>
          )}

          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <section className="glass-panel" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>งานปลายน้ำ</h2>
              <div className="grid gap-3">
                <Stat label="ทะเบียนภาษี" value={data.exciseRegistrations?.length || 0} hint={(data.exciseRegistrations || []).map((row) => row.status).filter(Boolean).slice(0, 3).join(", ") || "-"} />
                <Stat label="PO สหมิตร" value={data.sahamitPo?.poNumber || "-"} hint={data.sahamitPo ? `${data.sahamitPo.lines?.length || 0} รายการ PO` : "ยังไม่ผูก"} />
              </div>
            </section>

            <section className="glass-panel" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>ความเคลื่อนไหวล่าสุด</h2>
              {(data.stageHistory || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.stageHistory.slice(0, 6).map((row) => (
                    <li key={row.id} style={{ marginBottom: 8 }}>
                      {STAGE_LABELS[row.fromStage] || row.fromStage || "เริ่ม"} → {STAGE_LABELS[row.toStage] || row.toStage}
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                        {row.changedByName || "-"} · {row.changedAt ? fmtDateTime(row.changedAt) : "-"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>ยังไม่มีการเปลี่ยนสถานะ</Empty>}
            </section>
          </div>
        </div>
      )}
    </Workspace>
  );
}
