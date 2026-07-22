"use client";
// หน้ารายการใบขอราคาต้นทุน (mig 0141) — ทุกฝ่ายที่เกี่ยวข้องใช้หน้าเดียวกัน
// แต่เห็นคนละชุด: ฝ่ายขายเห็นตาม scope ดีล, RD/PC เห็นคิวทั้งฝ่ายตน,
// ผู้บริหาร/viewer เห็นทั้งหมด (กรองจริงที่ API ผ่าน canViewCostingRequest)
//
// ตัวเลข "อนุมัติแล้ว x/y" และ "ราคา x/y" นับสดจากลูกทุกครั้ง ไม่ได้อ่านจาก
// คอลัมน์ที่เก็บไว้ (มติ 2026-07-22 — กันเลขเพี้ยนจากของจริง)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw } from "lucide-react";
import FilterPopover from "@/components/ui/FilterPopover";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Workspace from "@/components/ui/Workspace";
import { fmtDate } from "@/lib/format";
import { TEAMS, TEAM_LABELS } from "@/lib/permissions";
import {
  COSTING_STATUSES,
  COSTING_STATUS_LABELS,
  COSTING_STATUS_TONES,
  approvalProgress,
  pricingProgress,
} from "@/lib/costing";

export default function CostingListPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [teamFilter, setTeamFilter] = useState([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/sa/costing", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดรายการไม่สำเร็จ");
      setRows(Array.isArray(d) ? d : []);
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // กรองฝั่ง client: ชุดข้อมูลต่อผู้ใช้เล็ก (ใบขอราคาไม่ใช่ข้อมูลรายวันจำนวนมาก)
  // และทำให้สลับตัวกรองไม่ต้องรอ network
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (teamFilter.length && !teamFilter.includes(r.team)) return false;
      if (!q) return true;
      const haystack = [
        r.docNo, r.customerName,
        ...(r.items || []).map((i) => i.productLabel),
        ...(r.items || []).map((i) => i.fragranceName),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, statusFilter, teamFilter, search]);

  const filterCount = statusFilter.length + teamFilter.length;

  return (
    <Workspace hideHeader>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Calculator size={22} /></span>{" "}
            ใบขอราคาต้นทุน
          </h1>
          <p>
            รวมราคาวัตถุดิบจาก RD และบรรจุภัณฑ์จาก PC ตามแม่แบบของประเภทสินค้า
            แล้วส่งผู้บริหารอนุมัติราคาผลิตรายสินค้า
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-glass"
          placeholder="ค้นหาเลขที่ ลูกค้า หรือชื่อสินค้า"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ค้นหาใบขอราคา"
        />
        <FilterPopover
          count={filterCount}
          onClear={() => { setStatusFilter([]); setTeamFilter([]); }}
          groups={[
            {
              key: "status",
              label: "สถานะ",
              options: COSTING_STATUSES.map((s) => ({ value: s, label: COSTING_STATUS_LABELS[s] })),
              selected: statusFilter,
              onChange: setStatusFilter,
            },
            {
              key: "team",
              label: "ทีม",
              options: TEAMS.map((t) => ({ value: t, label: TEAM_LABELS[t] || t })),
              selected: teamFilter,
              onChange: setTeamFilter,
            },
          ]}
        />
        <span className="spacer" />
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Calculator}>
          {rows.length === 0
            ? "ยังไม่มีใบขอราคาต้นทุน — เปิดใบจากหน้าดีลที่ต้องการขอราคา"
            : "ไม่มีใบที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>เลขที่</th>
                <th>ลูกค้า / สินค้า</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 120 }}>ราคา RD/PC</th>
                <th style={{ width: 120 }}>อนุมัติแล้ว</th>
                <th style={{ width: 100 }}>MOQ</th>
                <th style={{ width: 110 }}>สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const items = row.items || [];
                const approval = approvalProgress(items);
                const pricing = pricingProgress(items.flatMap((i) => i.components || []));
                const productNames = items.map((i) => i.productLabel).filter(Boolean);
                return (
                  <tr key={row.id}>
                    {/* หน้ารายละเอียดมาใน PR3b — ยังไม่ทำเป็นลิงก์ กันคลิกแล้ว 404 */}
                    <td style={{ fontWeight: 600 }}>
                      {row.docNo || <span style={{ color: "var(--text-3)", fontWeight: 400 }}>ร่าง</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.customerName || "—"}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                        {productNames.length
                          ? productNames.slice(0, 2).join(" · ")
                            + (productNames.length > 2 ? ` +${productNames.length - 2}` : "")
                          : "ยังไม่มีรายการสินค้า"}
                      </div>
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{ color: COSTING_STATUS_TONES[row.status], borderColor: "currentColor" }}
                      >
                        {COSTING_STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td>
                      {pricing.total === 0
                        ? <span style={{ color: "var(--text-3)" }}>—</span>
                        : `${pricing.quoted}/${pricing.total}`}
                    </td>
                    <td>
                      {approval.total === 0
                        ? <span style={{ color: "var(--text-3)" }}>—</span>
                        : (
                          <span style={{ color: approval.returned > 0 ? "var(--red)" : undefined }}>
                            {approval.approved}/{approval.total}
                            {approval.returned > 0 ? ` · ตีกลับ ${approval.returned}` : ""}
                          </span>
                        )}
                    </td>
                    <td>{Number(row.moq).toLocaleString("th-TH")}</td>
                    <td>{fmtDate(row.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Workspace>
  );
}
