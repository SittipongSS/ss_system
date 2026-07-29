"use client";
import { TableScroll } from "@/components/ui/Table";
// รายงานความพร้อมลายเซ็นอิเล็กทรอนิกส์ (Phase 5B go-live gate)
//
// mig 0125 บังคับว่าผู้อนุมัติต้องมีลายเซ็นในบัญชีก่อน ไม่งั้นอนุมัติใบเสนอราคา/SO ไม่ได้ (409)
// ลายเซ็นเป็นของส่วนตัว — admin อัปแทนไม่ได้ตาม ADR 0006 หน้านี้จึงอ่านอย่างเดียว
// มีไว้เพื่อ "รู้ว่าต้องตามใคร" ก่อนเปิดใช้จริง ไม่มีปุ่มแก้ให้โดยตั้งใจ
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Signature, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { canViewSignatureCoverage, isGoLiveReady } from "@/lib/admin/signatureCoverage";
import { accessState } from "@/lib/accessGate";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import AccessDenied from "@/components/ui/AccessDenied";
import KpiCard from "@/components/ui/KpiCard";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";

const BACK_TO_SETTINGS = { href: "/settings", label: "กลับหน้าตั้งค่า" };

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

const EMPTY_SUMMARY = { cohort: 0, required: 0, requiredReady: 0, blocking: 0, blockedQuotations: 0, blockedSubmissions: 0 };

// ข้อความ error ดิบจาก API/ด่านสิทธิ์ที่ไม่ควรโผล่ให้ผู้ใช้เห็นเป็นภาษาอังกฤษ
const ERROR_TEXT = {
  forbidden: "ไม่มีสิทธิ์ดูรายงานนี้",
  unauthorized: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่",
};

export default function SignatureCoveragePage() {
  const role = useRole();
  const canUsersView = useCan("users:view");
  // ด่านเดียวกับฝั่ง API (canViewSignatureCoverage) — เดิมสองฝั่งเขียนกติกาแยกกันแล้วเพี้ยน
  const canView = canViewSignatureCoverage({ role, extraCaps: canUsersView ? ["users:view"] : [] });

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/signature-coverage", { signal, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(ERROR_TEXT[data.error] || data.error || "โหลดข้อมูลไม่สำเร็จ");
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
  }, []);

  useEffect(() => {
    if (!canView) return undefined;
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [canView, load]);

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
    submittableDocs: (r) => r.submittableDocs || 0,
    hasSignature: (r) => (r.hasSignature ? 1 : 0),
  });

  const gate = accessState(role, canView);
  if (gate === "loading") return <SkeletonRows rows={6} />;
  if (gate === "denied") {
    return (
      <AccessDenied
        icon={<Signature size={22} />}
        title="ความพร้อมลายเซ็น"
        message="รายงานนี้เปิดให้ผู้ดูแลระบบ และผู้ที่ได้รับสิทธิ์ดูรายชื่อผู้ใช้เท่านั้น"
        back={BACK_TO_SETTINGS}
      />
    );
  }

  const ready = isGoLiveReady(summary);

  return (
    <Workspace hideHeader back={BACK_TO_SETTINGS}>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><Signature size={22} /></span> ความพร้อมลายเซ็น</h1>
          <p>ใครยังเซ็นอนุมัติใบเสนอราคา / Sale Order ไม่ได้ เพราะยังไม่มีลายเซ็นอิเล็กทรอนิกส์ในบัญชี</p>
        </div>
        {/* required = 0 ไม่ใช่ "พร้อม" (isGoLiveReady คืน false โดยเจตนา — ไม่มีใครใน cohort
            เลยแปลว่าข้อมูลผิดปกติ) แต่ก็ไม่ใช่ "ยังขาด 0 คน" ที่อ่านแล้วขัดกัน */}
        {!loading && !error && (
          <div className={`status-pill ${ready ? "success" : "warning"}`}>
            {ready ? "พร้อมเปิดใช้งาน"
              : (summary.required > 0 ? `ยังขาด ${summary.required - summary.requiredReady} คน` : "ยังไม่มีข้อมูล")}
          </div>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="ต้องมีลายเซ็น" value={summary.required} icon={ShieldCheck} tone="accent" hint="ผู้อนุมัติ + คนที่ถือดีลหรือมีเอกสารรอยื่น" />
        <KpiCard label="พร้อมแล้ว" value={summary.requiredReady} icon={CheckCircle2} tone="success" hint={`จากทั้งหมด ${summary.required} คน`} />
        <KpiCard label="บล็อกงานอยู่ตอนนี้" value={summary.blocking} icon={AlertTriangle} tone="danger" hint="มีใบรออนุมัติแต่เซ็นไม่ได้" />
        <KpiCard label="ใบเสนอราคาที่ค้าง" value={summary.blockedQuotations} icon={AlertTriangle} tone="warning" hint="รออนุมัติจากคนที่ยังไม่มีลายเซ็น" />
        <KpiCard label="เอกสารรอยื่น" value={summary.blockedSubmissions} icon={AlertTriangle} tone="warning" hint="ผู้สร้างยังไม่มีลายเซ็น จะยื่นอนุมัติไม่ได้" />
      </div>

      {/* ทำไมไม่มีปุ่ม "เพิ่มลายเซ็นให้" — กันคนเข้าใจผิดว่าหน้านี้ยังทำไม่เสร็จ */}
      <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <ShieldCheck size={18} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <p style={{ margin: 0, color: "var(--text-2)", fontSize: "var(--fs-7)", lineHeight: 1.6 }}>
          ลายเซ็นเป็นข้อมูลส่วนบุคคล — ผู้ดูแลระบบอัปโหลดแทนกันไม่ได้ และไม่ควรได้ ไม่งั้นหลักฐานการเซ็นบนเอกสารจะไม่มีความหมาย
          แต่ละคนต้องเพิ่มเองที่หน้า <Link href="/account" className="linklike"><strong>บัญชีของฉัน</strong></Link> หน้านี้ใช้ติดตามว่าเหลือใครบ้างเท่านั้น
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
        <button type="button" className="btn ghost sm" onClick={() => load()} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" /> โหลดใหม่
        </button>
      </div>

      {loading && <SkeletonRows rows={6} />}

      {!loading && error && (
        <div className="glass-panel" role="alert" style={{ padding: "14px 16px", borderColor: "var(--red)", color: "var(--red)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="btn ghost sm" onClick={() => load()}>ลองอีกครั้ง</button>
        </div>
      )}

      {!loading && !error && !sort.sorted.length && (
        <EmptyState icon={CheckCircle2}>
          {filter === "all" ? "ไม่พบผู้ใช้ที่ต้องมีลายเซ็น" : "ไม่มีใครค้างในเงื่อนไขนี้ — เรียบร้อยทุกคน"}
        </EmptyState>
      )}

      {!loading && !error && !!sort.sorted.length && (
        <TableScroll>
          <table className="premium-table">
            <thead>
              <tr>
                <SortTh sort={sort} sortKey="name">ชื่อ</SortTh>
                <SortTh sort={sort} sortKey="role">บทบาท</SortTh>
                <SortTh sort={sort} sortKey="team">ทีม</SortTh>
                <SortTh sort={sort} sortKey="openDeals" style={{ textAlign: "right" }}>ดีลที่ถืออยู่</SortTh>
                <SortTh sort={sort} sortKey="pendingQuotations" style={{ textAlign: "right" }}>ใบรออนุมัติ</SortTh>
                {/* เส้นผู้ยื่น: เอกสารที่ตัวเองสร้างและยังค้างต้องยื่น — การกดยื่นบันทึกหลักฐาน
                    ลายเซ็นเช่นกัน คนไม่มีลายเซ็นจะยื่นไม่ได้ */}
                <SortTh sort={sort} sortKey="submittableDocs" style={{ textAlign: "right" }}>เอกสารรอยื่น</SortTh>
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
                      {row.email && <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{row.email}</div>}
                    </td>
                    <td>{ROLE_LABELS[row.role] || row.role}</td>
                    <td>{TEAM_LABELS[row.team] || row.team || "—"}</td>
                    <td style={{ textAlign: "right" }}>{row.openDeals || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: row.pendingQuotations && !row.hasSignature ? 700 : 400, color: row.pendingQuotations && !row.hasSignature ? "var(--red)" : undefined }}>
                      {row.pendingQuotations || "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: row.submittableDocs && !row.hasSignature ? 700 : 400, color: row.submittableDocs && !row.hasSignature ? "var(--red)" : undefined }}>
                      {row.submittableDocs || "—"}
                    </td>
                    <td><span className={`status-pill ${pill.cls}`}>{pill.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Workspace>
  );
}
