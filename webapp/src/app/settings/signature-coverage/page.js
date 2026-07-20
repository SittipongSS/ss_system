"use client";
// รายงานความพร้อมลายเซ็นอิเล็กทรอนิกส์ (Phase 5B go-live gate)
//
// mig 0125 บังคับว่าผู้อนุมัติต้องมีลายเซ็นในบัญชีก่อน ไม่งั้นอนุมัติใบเสนอราคา/SO ไม่ได้ (409)
// ลายเซ็นเป็นของส่วนตัว — admin อัปแทนไม่ได้ตาม ADR 0006 หน้านี้จึงอ่านอย่างเดียว
// มีไว้เพื่อ "รู้ว่าต้องตามใคร" ก่อนเปิดใช้จริง ไม่มีปุ่มแก้ให้โดยตั้งใจ
import { useEffect, useMemo, useState } from "react";
import { Signature, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { can, ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { isGoLiveReady } from "@/lib/admin/signatureCoverage";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import KpiCard from "@/components/ui/KpiCard";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";

const FILTERS = [
  { v: "all", label: "ทั้งหมด" },
  { v: "missing", label: "ยังไม่มีลายเซ็น" },
  { v: "blocking", label: "บล็อกงานอยู่" },
];

const SEVERITY_PILL = {
  blocking: { cls: "danger", label: "บล็อกงานอยู่" },
  at_risk: { cls: "warning", label: "ยังไม่มีลายเซ็น" },
  optional: { cls: "info", label: "ยังไม่จำเป็น" },
  ready: { cls: "success", label: "พร้อม" },
};

const EMPTY_SUMMARY = { cohort: 0, required: 0, requiredReady: 0, blocking: 0, blockedQuotations: 0 };

export default function SignatureCoveragePage() {
  const role = useRole();
  const canUsersView = useCan("users:view");
  const canView = can(role, "users:manage") || canUsersView;

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!canView) return undefined;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/signature-coverage", { signal: ctrl.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
        setRows(data.rows || []);
        setSummary(data.summary || EMPTY_SUMMARY);
        setError("");
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message);
          setRows([]);
          setSummary(EMPTY_SUMMARY);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [canView]);

  const filtered = useMemo(() => {
    if (filter === "missing") return rows.filter((row) => !row.hasSignature);
    if (filter === "blocking") return rows.filter((row) => row.severity === "blocking");
    return rows;
  }, [rows, filter]);

  const sort = useSortableTable(filtered, {
    name: (r) => r.name || "",
    role: (r) => r.role || "",
    team: (r) => r.team || "",
    openDeals: (r) => r.openDeals,
    pendingQuotations: (r) => r.pendingQuotations,
    hasSignature: (r) => (r.hasSignature ? 1 : 0),
  });

  if (!canView) {
    return (
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><Signature size={22} /></span> ความพร้อมลายเซ็น</h1>
          <p>คุณไม่มีสิทธิ์เข้าถึงรายงานนี้ (เฉพาะผู้ดูแลระบบ)</p>
        </div>
      </div>
    );
  }

  const ready = isGoLiveReady(summary);

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><Signature size={22} /></span> ความพร้อมลายเซ็น</h1>
          <p>ใครยังเซ็นอนุมัติใบเสนอราคา / Sale Order ไม่ได้ เพราะยังไม่มีลายเซ็นอิเล็กทรอนิกส์ในบัญชี</p>
        </div>
        {!loading && !error && (
          <div className={`status-pill ${ready ? "success" : "warning"}`}>
            {ready ? "พร้อมเปิดใช้งาน" : `ยังขาด ${summary.required - summary.requiredReady} คน`}
          </div>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="ต้องมีลายเซ็น" value={summary.required} icon={ShieldCheck} tone="accent" hint="ผู้อนุมัติ + AE ที่ถือดีลอยู่" />
        <KpiCard label="พร้อมแล้ว" value={summary.requiredReady} icon={CheckCircle2} tone="success" hint={`จากทั้งหมด ${summary.required} คน`} />
        <KpiCard label="บล็อกงานอยู่ตอนนี้" value={summary.blocking} icon={AlertTriangle} tone="danger" hint="มีใบรออนุมัติแต่เซ็นไม่ได้" />
        <KpiCard label="ใบเสนอราคาที่ค้าง" value={summary.blockedQuotations} icon={AlertTriangle} tone="warning" hint="รออนุมัติจากคนที่ยังไม่มีลายเซ็น" />
      </div>

      {/* ทำไมไม่มีปุ่ม "เพิ่มลายเซ็นให้" — กันคนเข้าใจผิดว่าหน้านี้ยังทำไม่เสร็จ */}
      <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <ShieldCheck size={18} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <p style={{ margin: 0, color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>
          ลายเซ็นเป็นข้อมูลส่วนบุคคล — ผู้ดูแลระบบอัปโหลดแทนกันไม่ได้ และไม่ควรได้ ไม่งั้นหลักฐานการเซ็นบนเอกสารจะไม่มีความหมาย
          แต่ละคนต้องเพิ่มเองที่หน้า <strong>บัญชีของฉัน</strong> (/account) หน้านี้ใช้ติดตามว่าเหลือใครบ้างเท่านั้น
        </p>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.v} className={filter === f.v ? "active" : ""} onClick={() => setFilter(f.v)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="toolbar-label">{sort.sorted.length} คน</span>
      </div>

      {loading && <SkeletonRows rows={6} />}

      {!loading && error && (
        <div className="glass-panel" role="alert" style={{ padding: "14px 16px", borderColor: "var(--red)", color: "var(--red)" }}>
          {error}
        </div>
      )}

      {!loading && !error && !sort.sorted.length && (
        <EmptyState icon={CheckCircle2}>
          {filter === "all" ? "ไม่พบผู้ใช้ที่ต้องมีลายเซ็น" : "ไม่มีใครค้างในเงื่อนไขนี้ — เรียบร้อยทุกคน"}
        </EmptyState>
      )}

      {!loading && !error && !!sort.sorted.length && (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <SortTh sort={sort} sortKey="name">ชื่อ</SortTh>
                <SortTh sort={sort} sortKey="role">บทบาท</SortTh>
                <SortTh sort={sort} sortKey="team">ทีม</SortTh>
                <SortTh sort={sort} sortKey="openDeals" style={{ textAlign: "right" }}>ดีลที่ถืออยู่</SortTh>
                <SortTh sort={sort} sortKey="pendingQuotations" style={{ textAlign: "right" }}>ใบรออนุมัติ</SortTh>
                <SortTh sort={sort} sortKey="hasSignature">สถานะ</SortTh>
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((row) => {
                const pill = SEVERITY_PILL[row.severity] || SEVERITY_PILL.optional;
                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      {row.email && <div style={{ color: "var(--text-3)", fontSize: 12 }}>{row.email}</div>}
                    </td>
                    <td>{ROLE_LABELS[row.role] || row.role}</td>
                    <td>{TEAM_LABELS[row.team] || row.team || "—"}</td>
                    <td style={{ textAlign: "right" }}>{row.openDeals || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: row.pendingQuotations && !row.hasSignature ? 700 : 400, color: row.pendingQuotations && !row.hasSignature ? "var(--red)" : undefined }}>
                      {row.pendingQuotations || "—"}
                    </td>
                    <td><span className={`status-pill ${pill.cls}`}>{pill.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
