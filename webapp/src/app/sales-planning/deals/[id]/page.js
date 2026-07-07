"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Circle, ClipboardList, ExternalLink, FileText, LineChart, Lock, PackageCheck, RefreshCcw, Trophy } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import { SALES_FEATURES, STAGE_LABELS } from "@/lib/salesPlanning";
import { dealLifecycle } from "@/lib/salesPlanningLifecycle";

// ข้อความอธิบาย drift แต่ละรายการ (FC รอบล่าสุดต่างจากตอน map)
function driftText(it) {
  if (it.kind === "dropped") return `${it.fgCode}: ถูกตัดออกจาก FC ล่าสุด (เดิม ${it.month} · ${Number(it.fromQty || 0).toLocaleString("th-TH")})`;
  if (it.kind === "shifted") return `${it.fgCode}: เลื่อนเดือน ${it.month} → ${(it.toMonths || []).join(", ")}`;
  if (it.kind === "qtyChanged") return `${it.fgCode} (${it.month}): จำนวน ${Number(it.fromQty || 0).toLocaleString("th-TH")} → ${Number(it.toQty || 0).toLocaleString("th-TH")}`;
  return `${it.fgCode}: มีการเปลี่ยนแปลง`;
}

const money = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });

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

// แถบ lifecycle: ลีด → … → เข้าโครงการ (lost = แถบแดงแทน)
function DealStepper({ steps, lost }) {
  if (lost) {
    return (
      <div className="glass-panel" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center" }}>
        <Ban size={16} aria-hidden="true" /> ดีลนี้ปิดแบบไม่สำเร็จ (Lost)
      </div>
    );
  }
  return (
    <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5,
            fontWeight: s.state === "current" ? 700 : 500,
            color: s.state === "done" ? "var(--green)" : s.state === "current" ? "var(--accent)" : "var(--text-3)",
          }}>
            {s.state === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} fill={s.state === "current" ? "currentColor" : "none"} aria-hidden="true" />}
            {s.label}
          </span>
          {i < steps.length - 1 && <ArrowRight size={12} aria-hidden="true" style={{ color: "var(--text-3)", opacity: 0.5 }} />}
        </div>
      ))}
    </div>
  );
}

// การ์ดปลายทางส่งต่อ 1 ระบบ (PM / สรรพสามิต / ส่งของ / PO)
function RouteCard({ route, onCreateProject, onCreateExcise, busy, canEdit }) {
  const color = route.status === "done" ? "var(--green)" : route.status === "available" ? "var(--accent)" : "var(--text-3)";
  const badge = route.status === "done" ? "เสร็จแล้ว" : route.status === "available" ? "พร้อมทำ" : "ล็อก";
  return (
    <div className="glass-panel" style={{ padding: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{route.label}</span>
        <span className="ui-badge" style={{ marginLeft: "auto", color }}>{badge}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 10px" }}>{route.hint}</div>
      {route.status === "locked" ? (
        <button type="button" className="btn ghost sm" disabled><Lock size={13} aria-hidden="true" /> ล็อก</button>
      ) : route.action === "create-project" && canEdit ? (
        <button type="button" className="btn btn-primary sm" onClick={onCreateProject} disabled={busy}><PackageCheck size={13} aria-hidden="true" /> สร้างโครงการ</button>
      ) : route.action === "create-excise" && canEdit ? (
        <button type="button" className="btn btn-primary sm" onClick={onCreateExcise} disabled={busy}><FileText size={13} aria-hidden="true" /> สร้างทะเบียน</button>
      ) : route.href ? (
        <a className="btn sm" href={route.href}><ExternalLink size={13} aria-hidden="true" /> เปิด</a>
      ) : null}
    </div>
  );
}

export default function DealOverviewPage() {
  const params = useParams();
  const router = useRouter();
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
  const canEdit = !!data?.canEdit;
  const lc = useMemo(
    () => (deal ? dealLifecycle(deal, {
      projectProducts: data?.projectProducts,
      exciseRegistrations: data?.exciseRegistrations,
      sahamitPo: data?.sahamitPo,
      shipmentPrep: data?.shipmentPrep,
    }) : null),
    [deal, data],
  );

  const [actionBusy, setActionBusy] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  const runAction = useCallback(async (key, url, opts) => {
    setActionBusy(key);
    setError("");
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setActionBusy("");
    }
  }, [load]);

  const doWin = () => runAction("win", `/api/sales-planning/deals/${id}/win`, { method: "POST" });
  const doCreateProject = () => runAction("project", `/api/sales-planning/deals/${id}/create-project`, { method: "POST" });

  // สร้างทะเบียนสรรพสามิตจากโครงการ (reuse action เดียวกับหน้า PM) แล้วพาไปหน้าทะเบียน
  const doCreateExcise = async () => {
    if (!deal?.projectId) return;
    setActionBusy("excise");
    setError("");
    try {
      const res = await fetch(`/api/excise-registrations/from-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: deal.projectId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "สร้างทะเบียนสรรพสามิตไม่สำเร็จ");
      if (payload.id) router.push(`/tax/registrations/${payload.id}`);
      else await load();
    } catch (e) {
      setError(e.message || "สร้างทะเบียนสรรพสามิตไม่สำเร็จ");
    } finally {
      setActionBusy("");
    }
  };
  const doLost = async () => {
    const okDone = await runAction("lost", `/api/sales-planning/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "lost", lostReason: lostReason.trim() || null }),
    });
    if (okDone) { setLostOpen(false); setLostReason(""); }
  };

  // ปุ่มหลักของการ์ด "ขั้นต่อไป" ตาม nextAction.kind
  const nextPrimary = () => {
    if (!canEdit || !lc?.nextAction) return null;
    const k = lc.nextAction.kind;
    if (k === "win") return <button type="button" className="btn btn-primary" onClick={doWin} disabled={!!actionBusy}><Trophy size={14} aria-hidden="true" /> ปิดได้ (Won)</button>;
    if (k === "create_project") return <button type="button" className="btn btn-primary" onClick={doCreateProject} disabled={!!actionBusy}><PackageCheck size={14} aria-hidden="true" /> สร้างโครงการ</button>;
    if (k === "open_project" && deal.projectId) return <a className="btn btn-primary" href={`/pm/projects/${deal.projectId}`}><ExternalLink size={14} aria-hidden="true" /> เปิดโครงการ</a>;
    return null;
  };
  const headerRight = (
    <>
      {canEdit && lc?.canGo && (
        <button type="button" className="btn btn-primary" onClick={doWin} disabled={!!actionBusy}>
          <Trophy size={15} aria-hidden="true" /> ปิดได้ (Won)
        </button>
      )}
      {canEdit && lc?.canNoGo && (
        <button type="button" className="btn ghost" onClick={() => setLostOpen(true)} disabled={!!actionBusy}>
          <Ban size={15} aria-hidden="true" /> ไม่ไปต่อ
        </button>
      )}
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
          {lc && <DealStepper steps={lc.steps} lost={deal.stage === "lost"} />}

          {lc?.nextAction && (
            <div className="glass-panel" style={{ padding: 16, borderLeft: "3px solid var(--accent)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>ขั้นต่อไป</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{lc.nextAction.label}</div>
                {lc.nextAction.hint && <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{lc.nextAction.hint}</div>}
              </div>
              {nextPrimary()}
            </div>
          )}

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

          {lc && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ส่งต่อ (Routing)</h2>
              </div>
              {lc.routes.length ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {lc.routes.map((route) => (
                    <RouteCard key={route.kind} route={route} onCreateProject={doCreateProject} onCreateExcise={doCreateExcise} busy={!!actionBusy} canEdit={canEdit} />
                  ))}
                </div>
              ) : <Empty>ยังไม่มีปลายทางที่ต้องส่งต่อ</Empty>}
            </section>
          )}

          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <section className="glass-panel" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>ความเคลื่อนไหวล่าสุด</h2>
              {(data.stageHistory || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.stageHistory.slice(0, 6).map((row) => (
                    <li key={row.id} style={{ marginBottom: 8 }}>
                      {STAGE_LABELS[row.fromStage] || row.fromStage || "เริ่ม"} → {STAGE_LABELS[row.toStage] || row.toStage}
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                        {row.changedByName || "-"} · {row.changedAt ? new Date(row.changedAt).toLocaleString("th-TH") : "-"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>ยังไม่มีการเปลี่ยนสถานะ</Empty>}
            </section>
          </div>
        </div>
      )}

      <Modal open={lostOpen} onClose={() => !actionBusy && setLostOpen(false)} title="ปิดดีลแบบไม่สำเร็จ (Lost)" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            เหตุผล (ไม่บังคับ)
            <textarea
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="เช่น ลูกค้าเลือกคู่แข่ง / ราคาสูงเกิน / เลื่อนโครงการ"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-1)", fontSize: 13, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setLostOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={doLost} disabled={!!actionBusy}>
              <Ban size={14} aria-hidden="true" /> {actionBusy === "lost" ? "กำลังบันทึก..." : "ยืนยัน Lost"}
            </button>
          </div>
        </div>
      </Modal>
    </Workspace>
  );
}
