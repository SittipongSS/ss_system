"use client";
import { useEffect, useMemo, useState } from "react";
import { History, Search, Eye } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import { ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";
import Modal from "@/components/Modal";

// ป้ายภาษาไทยของ entity / action ที่ audit log บันทึก (ตอนนี้ครอบ customer/product/order).
const ENTITY_LABELS = {
  customer: "ลูกค้า", product: "สินค้า", order: "ใบยื่น/ออเดอร์",
  registration: "ทะเบียนสรรพสามิต", project: "โครงการ", user: "ผู้ใช้งาน",
};
const ACTION_LABELS = { create: "สร้าง", update: "แก้ไข", delete: "ลบ" };
const ACTION_CLASS = { create: "success", update: "warning", delete: "danger" };

const MONTH_OPTS = [
  { v: "3", label: "3 เดือน" },
  { v: "6", label: "6 เดือน" },
  { v: "12", label: "12 เดือน" },
  { v: "all", label: "ทั้งหมด" },
];

// แสดงค่าให้อ่านง่าย: object/array → JSON, ว่าง → —.
function showVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPage() {
  const canView = useCan("audit:view");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("6");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null); // log ที่กำลังดู before/after

  // โหลดเมื่อ filter (นอกจาก q) เปลี่ยน + debounce q.
  useEffect(() => {
    if (!canView) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ months });
        if (entityType) sp.set("entityType", entityType);
        if (action) sp.set("action", action);
        if (actor) sp.set("actor", actor);
        if (q.trim()) sp.set("q", q.trim());
        const res = await fetch(`/api/audit?${sp.toString()}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = await res.json();
          setRows(data.rows || []);
        }
      } catch (e) {
        if (e.name !== "AbortError") setRows([]);
      } finally {
        setLoading(false);
      }
    }, q ? 300 : 0);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [canView, months, entityType, action, actor, q]);

  // ตัวเลือก "คนทำ" derive จากผลลัพธ์ปัจจุบัน (actorId → ชื่อ).
  const actorOpts = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.actorId && !m.has(r.actorId)) m.set(r.actorId, r.actorName || r.actorId);
    return [...m.entries()];
  }, [rows]);

  const sort = useSortableTable(rows, {
    createdAt: (r) => (r.createdAt ? new Date(r.createdAt).getTime() : null),
    actorName: (r) => r.actorName || "",
    action: (r) => r.action || "",
    entityType: (r) => r.entityType || "",
  });
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, { resetKey: `${rows.length}|${sort.sortKey}|${sort.sortDir}` });

  if (!canView) {
    return (
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><History size={22} /></span> บันทึกการใช้งาน</h1>
          <p>คุณไม่มีสิทธิ์เข้าถึงบันทึกการใช้งาน (เฉพาะผู้ดูแลระบบ)</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><History size={22} /></span> บันทึกการใช้งาน</h1>
          <p>ประวัติการสร้าง / แก้ไข / ลบ ข้อมูลในระบบ (ใครทำอะไรเมื่อไหร่)</p>
        </div>
        <div className="status-pill info">{total} รายการ</div>
      </div>

      {/* ตัวกรอง */}
      <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented">
            {MONTH_OPTS.map((o) => (
              <button
                key={o.v}
                className={months === o.v ? "active" : ""}
                onClick={() => setMonths(o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <select className="premium-select" value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ width: "auto" }}>
            <option value="">ทุกประเภทข้อมูล</option>
            {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          <select className="premium-select" value={action} onChange={(e) => setAction(e.target.value)} style={{ width: "auto" }}>
            <option value="">ทุกการกระทำ</option>
            {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          <select className="premium-select" value={actor} onChange={(e) => setActor(e.target.value)} style={{ width: "auto" }}>
            <option value="">ทุกคน</option>
            {actorOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>

          <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
            <Search size={16} className="icon-l" strokeWidth={2} />
            <input type="text" placeholder="ค้นหา รายละเอียด / รหัสข้อมูล..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-[var(--text-3)]">กำลังโหลด...</div>
      ) : (
        <div className="glass-panel">
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="เวลา" sortKey="createdAt" sort={sort} />
                  <SortTh label="ผู้ทำ" sortKey="actorName" sort={sort} />
                  <SortTh label="การกระทำ" sortKey="action" sort={sort} />
                  <SortTh label="ประเภท" sortKey="entityType" sort={sort} />
                  <th>รายละเอียด</th>
                  <th className="text-center">ดู</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-[var(--text-3)]">ไม่พบบันทึกตามเงื่อนไข</td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id}>
                      <td className="text-[var(--text-3)] text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td className="text-[var(--text-2)] text-sm">
                        <div className="font-medium text-[var(--text)]">{r.actorName || "—"}</div>
                        <div className="text-[var(--text-3)] text-xs">
                          {(ROLE_LABELS[r.actorRole] || r.actorRole || "")}{r.actorTeam ? ` · ${TEAM_LABELS[r.actorTeam] || r.actorTeam}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${ACTION_CLASS[r.action] || ""}`} style={{ height: "auto", padding: "2px 9px", fontSize: "11px", fontWeight: 600 }}>
                          {ACTION_LABELS[r.action] || r.action}
                        </span>
                      </td>
                      <td className="text-[var(--text-2)]">
                        {ENTITY_LABELS[r.entityType] || r.entityType}
                        <span className="text-[var(--text-3)] font-mono text-xs ml-1">{r.entityId}</span>
                      </td>
                      <td className="text-[var(--text-2)] text-sm">{r.summary || "—"}</td>
                      <td className="text-center">
                        <button onClick={() => setDetail(r)} className="text-[var(--accent)] hover:opacity-70" title="ดู before/after">
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {pageRows.length > 0 && (
            <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          )}
        </div>
      )}

      <AuditDetailModal log={detail} onClose={() => setDetail(null)} />
    </>
  );
}

// รายละเอียด before/after ของหนึ่งรายการ.
function AuditDetailModal({ log, onClose }) {
  if (!log) return null;
  const isUpdate = log.action === "update";
  const before = log.before || {};
  const after = log.after || {};
  const changed = Array.isArray(log.changedKeys) ? log.changedKeys : [];

  return (
    <Modal open={!!log} onClose={onClose} title="รายละเอียดการเปลี่ยนแปลง" size="lg">
      <div className="space-y-4">
        <div className="text-sm text-[var(--text-2)] space-y-1">
          <div><b>เวลา:</b> {fmtDateTime(log.createdAt)}</div>
          <div><b>ผู้ทำ:</b> {log.actorName || "—"} ({ROLE_LABELS[log.actorRole] || log.actorRole || "—"}{log.actorTeam ? ` · ${TEAM_LABELS[log.actorTeam] || log.actorTeam}` : ""})</div>
          <div><b>การกระทำ:</b> {ACTION_LABELS[log.action] || log.action} · {ENTITY_LABELS[log.entityType] || log.entityType} <span className="font-mono text-xs">{log.entityId}</span></div>
          {log.summary && <div><b>สรุป:</b> {log.summary}</div>}
          {log.ipAddress && <div><b>IP:</b> <span className="font-mono text-xs">{log.ipAddress}</span></div>}
        </div>

        {isUpdate ? (
          changed.length === 0 ? (
            <div className="text-[var(--text-3)] text-sm">ไม่มีฟิลด์ที่เปลี่ยนแปลง</div>
          ) : (
            <div className="premium-table-wrapper border-none">
              <table className="premium-table">
                <thead>
                  <tr><th>ฟิลด์</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr>
                </thead>
                <tbody>
                  {changed.map((k) => (
                    <tr key={k}>
                      <td className="font-mono text-xs text-[var(--text)]">{k}</td>
                      <td className="text-[var(--text-3)] text-xs break-all">{showVal(before[k])}</td>
                      <td className="text-[var(--text)] text-xs break-all">{showVal(after[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // create = แสดง after; delete = แสดง before (record ที่หายไป).
          <div>
            <div className="text-xs font-semibold text-[var(--text-2)] mb-1">
              {log.action === "delete" ? "ข้อมูลก่อนถูกลบ" : "ข้อมูลที่บันทึก"}
            </div>
            <pre className="text-xs bg-[var(--surface-2,rgba(0,0,0,0.04))] rounded p-3 overflow-auto max-h-80 break-all whitespace-pre-wrap">
              {JSON.stringify(log.action === "delete" ? before : after, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
}
