"use client";
// หน้ารายการใบขอราคาต้นทุน (mig 0141) — ทุกฝ่ายที่เกี่ยวข้องใช้หน้าเดียวกัน
// แต่เห็นคนละชุด: ฝ่ายขายเห็นตาม scope ดีล, RD/PC เห็นคิวทั้งฝ่ายตน,
// ผู้บริหาร/viewer เห็นทั้งหมด (กรองจริงที่ API ผ่าน canViewCostingRequest)
//
// ตัวเลข "อนุมัติแล้ว x/y" และ "ราคา x/y" นับสดจากลูกทุกครั้ง ไม่ได้อ่านจาก
// คอลัมน์ที่เก็บไว้ (มติ 2026-07-22 — กันเลขเพี้ยนจากของจริง)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Plus, RefreshCw } from "lucide-react";
import FilterPopover from "@/components/ui/FilterPopover";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import CostingRequestForm, {
  costingFormFromRequest, costingPayloadFrom,
} from "@/components/costing/CostingRequestForm";
import { useCan } from "@/lib/roleContext";
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
  const router = useRouter();
  const canCreate = useCan("costing:edit");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [teamFilter, setTeamFilter] = useState([]);
  const [search, setSearch] = useState("");

  // ฟอร์มเปิดใบใหม่ — component เดียวกับตอนแก้ (กฎ AGENTS.md) ต่างกันแค่ mode
  const [form, setForm] = useState(null);
  const [deals, setDeals] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [templateCategories, setTemplateCategories] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [toast, setToast] = useState(null);

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

  // ข้อมูลของฟอร์มโหลดตอนกดเปิดใบ ไม่ใช่ตอนเข้าหน้า — คนส่วนใหญ่เข้ามาเพื่อดูคิว
  const openCreate = async () => {
    setForm(costingFormFromRequest(null));
    try {
      const [dealRes, typeRes, tplRes] = await Promise.all([
        fetch("/api/sales-planning/deals", { cache: "no-store" }),
        fetch("/api/product-types", { cache: "no-store" }),
        fetch("/api/cost-templates", { cache: "no-store" }),
      ]);
      const dealRows = await dealRes.json().catch(() => []);
      // เปิดใบได้เฉพาะดีลที่ตัวเองแก้ได้ — ตรงกับด่านฝั่ง server
      setDeals((Array.isArray(dealRows) ? dealRows : []).filter((d) => d.canEdit));
      setProductTypes(await typeRes.json().catch(() => []));
      const templates = await tplRes.json().catch(() => []);
      setTemplateCategories(new Set((Array.isArray(templates) ? templates : []).map((t) => t.categoryCode)));
    } catch {
      setToast({ kind: "error", msg: "โหลดข้อมูลสำหรับเปิดใบไม่สำเร็จ" });
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sa/costing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costingPayloadFrom(form)),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "เปิดใบไม่สำเร็จ");
      router.push(`/sa/costing/${d.id}`);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setPendingSave(false);
      setSaving(false);
    }
  };

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
        {canCreate && (
          <button type="button" className="btn btn-accent" onClick={openCreate}>
            <Plus size={16} /> เปิดใบขอราคา
          </button>
        )}
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
                  <tr key={row.id} className="clickable-row">
                    <td>
                      <Link href={`/sa/costing/${row.id}`} style={{ fontWeight: 600 }}>
                        {row.docNo || "ร่าง"}
                      </Link>
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

      <Modal
        open={!!form}
        onClose={() => { setForm(null); setPendingSave(false); }}
        title="เปิดใบขอราคาต้นทุน"
        size="lg"
        dismissible={!saving}
      >
        {form && (
          <>
            <CostingRequestForm
              mode="create"
              form={form}
              setForm={setForm}
              deals={deals}
              productTypes={productTypes}
              templateCategories={templateCategories}
            />
            <div className="action-bar" style={{ marginTop: 20 }}>
              <button
                type="button" className="btn ghost" disabled={saving}
                onClick={() => { setForm(null); setPendingSave(false); }}
              >
                ยกเลิก
              </button>
              <button
                type="button" className="btn btn-accent" disabled={saving}
                onClick={() => {
                  if (!form.dealId) { setToast({ kind: "error", msg: "กรุณาเลือกดีล" }); return; }
                  setPendingSave(true);
                }}
              >
                เปิดใบ
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingSave}
        title="ยืนยันเปิดใบขอราคา"
        description="ระบบจะกางบรรทัดต้นทุนจากแม่แบบของประเภทสินค้าที่เลือกให้อัตโนมัติ"
        detail="ใบยังเป็นร่าง — เลขที่เอกสารจะออกตอนกดส่งขอราคาให้ RD/PC"
        confirmLabel="เปิดใบ"
        busy={saving}
        onConfirm={create}
        onClose={() => setPendingSave(false)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
