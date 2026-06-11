"use client";
// ISO Timeline document view (ported from ss-cj ProjectDocumentView).
// ss-team ไม่มีตาราง employees → ช่องผู้รับผิดชอบ/ลายเซ็นเป็น text input ธรรมดา
// (ss-cj ใช้ dropdown จาก employees). ฟิลด์หัว/ท้ายเอกสาร commit ผ่าน onUpdateProject,
// แถวงาน (Day/Start/Finish/ชื่อ) commit ผ่าน onUpdateTask.
import { useState, useMemo, useEffect } from "react";
import { Printer, Flag, ChevronDown, ChevronRight } from "lucide-react";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { buildWeekColumns, autoCellsForTask, cellKey, weekOfDay } from "@/lib/pm/weekGrid";
import { isBusinessDay } from "@/lib/pm/dateHelpers";

// นับวันทำการจาก start ถึง finish ให้ตรงกับ addBusinessDays(start, durationDays-1)
const businessDaysBetween = (startISO, finishISO) => {
  const s = new Date(startISO); const f = new Date(finishISO);
  if (isNaN(s.getTime()) || isNaN(f.getTime()) || f <= s) return 1;
  let count = 0; const d = new Date(s);
  let guard = 0;
  while (d < f && guard < 2000) { d.setDate(d.getDate() + 1); if (isBusinessDay(d)) count++; guard++; }
  return count + 1;
};

// ค่าคงที่ของบริษัท (header ฝั่งซ้าย)
const COMPANY_TEL = "02-000-7722, 092-646-8682";
const COMPANY_LINE = "@perfumefactory";

const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const roleColor = (role) => ({
  SA: "var(--accent)", RD: "var(--purple)", PC: "var(--blue)", PD: "var(--blue)",
  QC: "var(--green)", LG: "var(--amber)", WH: "var(--text-2)", ALL: "var(--red)",
}[role] || "var(--text-2)");

function EditField({ value, onInput, onCommit, placeholder, disabled, style }) {
  return (
    <input
      className="premium-input"
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onInput(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ height: "30px", fontSize: "13px", padding: "4px 10px", borderRadius: "6px", ...style }}
    />
  );
}

function SelectUserField({ value, onCommit, users, disabled, style }) {
  const hasValueInList = users.some(u => {
    const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
    return name === value;
  });
  return (
    <select
      className="premium-input"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
      style={{ height: "30px", fontSize: "13px", padding: "4px 10px", borderRadius: "6px", ...style }}
    >
      <option value="">— ไม่ระบุ —</option>
      {value && !hasValueInList && <option value={value}>{value}</option>}
      {users.map((u) => {
        const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
        return <option key={u.id} value={name}>{name}</option>;
      })}
    </select>
  );
}

export default function ProjectDocumentView({ project, canEdit, onUpdateProject, onUpdateTask, fgUI, statusLabel, statusColor }) {
  const [headerExpanded, setHeaderExpanded] = useState(false); // default: ย่อ เพื่อให้เห็น chart เต็ม
  const [nowMs] = useState(() => Date.now());
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const togglePhase = (phase) => setCollapsedPhases((prev) => {
    const next = new Set(prev);
    next.has(phase) ? next.delete(phase) : next.add(phase);
    return next;
  });

  const [users, setUsers] = useState([]);
  const tasks = project.tasks || [];

  useEffect(() => {
    fetch("/api/pm/assignable-users").then(r => r.ok ? r.json() : []).then(d => setUsers(d || [])).catch(() => {});
  }, []);

  // draft overlay สำหรับฟิลด์หัว/ท้ายเอกสาร — พิมพ์ลื่น + ปุ่มพิมพ์ใช้ค่าล่าสุดทันที
  const [draft, setDraft] = useState({});
  useEffect(() => { setDraft({}); }, [project.id]);
  const pv = (field) => (field in draft ? draft[field] : (project[field] || ""));
  const onField = (field) => (v) => setDraft((d) => ({ ...d, [field]: v }));
  const commitField = (field) => (v) => {
    setDraft((d) => ({ ...d, [field]: v }));
    if ((v ?? "") !== (project[field] || "")) onUpdateProject({ [field]: v });
  };
  const printProject = { ...project, ...draft };

  // ── ขอบเขตเวลา → คอลัมน์สัปดาห์ ──
  const { columns, months } = useMemo(() => {
    const starts = tasks.map((t) => new Date(t.startDate).getTime()).filter((t) => !isNaN(t));
    const finishes = tasks.map((t) => new Date(t.finishDate).getTime()).filter((t) => !isNaN(t));
    const startMs = starts.length ? Math.min(...starts) : (project.startDate ? new Date(project.startDate).getTime() : nowMs);
    const endMs = finishes.length ? Math.max(...finishes) : startMs + 30 * 86400000;
    return buildWeekColumns(startMs, endMs);
  }, [tasks, project.startDate, nowMs]);

  // ── จัดกลุ่มตามเฟส (คงลำดับ) ──
  const phaseGroups = useMemo(() => {
    const order = [];
    tasks.forEach((t) => { const p = t.phase || "—"; if (!order.includes(p)) order.push(p); });
    return order.map((phase, i) => ({
      phase, phaseNum: i + 1,
      tasks: tasks.filter((t) => (t.phase || "—") === phase),
    }));
  }, [tasks]);

  const cellW = 20; // px ต่อช่องสัปดาห์

  // ── วัดความกว้างข้อความจริงด้วย Canvas API ──
  const descW = useMemo(() => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return 220;
      ctx.font = "12px IBM Plex Sans Thai, system-ui, sans-serif";
      const maxPx = tasks.reduce((max, t) => {
        const nameW = ctx.measureText(t.name || "").width;
        const iconW = t.isMilestone ? 18 : 0;
        return Math.max(max, nameW + iconW);
      }, 140);
      return Math.min(420, Math.max(160, Math.ceil(maxPx) + 24));
    } catch { return 220; }
  }, [tasks]);

  // Freeze left offsets คำนวณจาก descW จริง
  const NO_W = 40, TEAM_W = 46, DAY_W = 64, START_W = 96;
  const freezeLeft = useMemo(() => [
    0,
    NO_W,
    NO_W + descW,
    NO_W + descW + TEAM_W,
    NO_W + descW + TEAM_W + DAY_W,
    NO_W + descW + TEAM_W + DAY_W + START_W,
  ], [descW]);

  const disabled = !canEdit;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>เอกสาร Timeline (ISO)</span>
          <span style={{ fontSize: "13px", color: statusColor || "var(--text-2)", display: "flex", alignItems: "center", gap: "6px" }}>
            สถานะ: <strong>{statusLabel || project.status}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>· แถบสัปดาห์คำนวณจากวันที่อัตโนมัติ · แก้ Day/วันที่แล้วอัพเดททันที</span>
        </div>
        <button
          onClick={() => openGanttPrintWindow(printProject)}
          className="btn btn-primary"
          style={{ padding: "6px 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "8px", whiteSpace: "nowrap" }}
          title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF"
        >
          <Printer size={14} /> พิมพ์เอกสาร
        </button>
      </div>

      {/* Document Header — ย่อ/ขยายได้ */}
      <div style={{ flexShrink: 0, border: "1px solid var(--border)", borderRadius: "10px", background: "var(--panel)" }}>
        <button
          onClick={() => setHeaderExpanded((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "var(--panel-2)", border: "none", cursor: "pointer", textAlign: "left", overflow: "hidden", borderRadius: headerExpanded ? "10px 10px 0 0" : "10px" }}
          title={headerExpanded ? "ย่อข้อมูลเอกสาร" : "ขยายข้อมูลเอกสาร"}
        >
          {headerExpanded ? <ChevronDown size={18} color="var(--accent)" /> : <ChevronRight size={18} color="var(--accent)" />}
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>ข้อมูลเอกสารประจำโปรเจกต์</span>
          {!headerExpanded && (
            <span style={{ fontSize: "13px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8, marginLeft: "8px" }}>
              {[project.customerName, pv("productName") || project.name, project.metadata?.brand, fmtDate(project.startDate)].filter(Boolean).join("   ·   ")}
            </span>
          )}
          <span style={{ fontSize: "12px", color: "var(--text-3)", marginLeft: "auto", fontWeight: 500 }}>(คลิกเพื่อ{headerExpanded ? "ย่อ" : "ขยาย"})</span>
        </button>
        {headerExpanded && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
            {/* ซ้าย */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderRight: "1px solid var(--border)", paddingRight: "20px" }}>
              <Row label="Customer Name"><span style={{ fontSize: "13px", fontWeight: 600 }}>{project.customerName || "-"}</span></Row>
              <Row label="ผู้ตรวจสอบ (AE Supervisor)"><SelectUserField value={pv("aeSupervisor")} users={users.filter(u => u.role === "ae_supervisor")} disabled={disabled} onCommit={commitField("aeSupervisor")} /></Row>
              <Row label="ผู้ดูแล (Account Executive)"><SelectUserField value={pv("aeOwner")} users={users.filter(u => u.role === "ae" || u.role === "senior_ae")} disabled={disabled} onCommit={commitField("aeOwner")} /></Row>
              <Row label="เบอร์ติดต่อ"><span style={{ fontSize: "13px", color: "var(--text-2)" }}>{COMPANY_TEL}</span></Row>
              <Row label="Line Official"><span style={{ fontSize: "13px", color: "var(--text-2)" }}>{COMPANY_LINE}</span></Row>
              <Row label="Email"><EditField value={pv("customerEmail")} disabled={disabled} onInput={onField("customerEmail")} onCommit={commitField("customerEmail")} /></Row>
            </div>
            {/* ขวา */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Row label="แบรนด์"><span style={{ fontSize: "13px", fontWeight: 600 }}>{project.metadata?.brand || "-"}</span></Row>
              <Row label="เลขที่ PO"><span style={{ fontSize: "13px", fontWeight: 600 }}>{project.metadata?.poNumber || "-"}</span></Row>
              <Row label="วันที่"><span style={{ fontSize: "13px", fontWeight: 600 }}>{fmtDate(project.startDate)}</span></Row>
              <Row label="Product Name"><EditField value={pv("productName")} placeholder={project.name} disabled={disabled} onInput={onField("productName")} onCommit={commitField("productName")} /></Row>
              {fgUI && <Row label="สินค้า (FG)">{fgUI}</Row>}
            </div>
          </div>
        )}
      </div>

      {/* ตาราง + ลายเซ็น */}
      <div style={{ height: "calc(100vh - 280px)", minHeight: "400px", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "10px", background: "var(--panel)", overflow: "hidden" }}>
        <div style={{ flex: "1 1 auto", overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed", width: "100%", minWidth: "max-content" }}>
            <colgroup>
              <col style={{ width: `${NO_W}px`, minWidth: `${NO_W}px` }} />
              <col style={{ width: `${descW}px`, minWidth: `${descW}px` }} />
              <col style={{ width: `${TEAM_W}px`, minWidth: `${TEAM_W}px` }} />
              <col style={{ width: `${DAY_W}px`, minWidth: `${DAY_W}px` }} />
              <col style={{ width: `${START_W}px`, minWidth: `${START_W}px` }} />
              <col style={{ width: "96px", minWidth: "96px" }} />
              {columns.map((c) => <col key={c.key} style={{ width: `${cellW}px`, minWidth: `${cellW}px` }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: "var(--panel-2)" }}>
                <Th w={NO_W} freeze={freezeLeft[0]}>no.</Th>
                <Th w={descW} align="left" freeze={freezeLeft[1]}>Work Description</Th>
                <Th w={TEAM_W} freeze={freezeLeft[2]}>Team</Th>
                <Th w={DAY_W} freeze={freezeLeft[3]}>Duration</Th>
                <Th w={START_W} freeze={freezeLeft[4]}>Start</Th>
                <Th w={96} freeze={freezeLeft[5]}>Finish</Th>
                {months.map((m) => (
                  <th key={m.key} colSpan={m.weeks.length} style={thStyle(0)}>{m.label}</th>
                ))}
              </tr>
              <tr style={{ background: "var(--panel-2)" }}>
                <Th w={NO_W} top={HROW1} freeze={freezeLeft[0]}></Th><Th w={descW} top={HROW1} freeze={freezeLeft[1]}></Th><Th w={TEAM_W} top={HROW1} freeze={freezeLeft[2]}></Th><Th w={DAY_W} top={HROW1} freeze={freezeLeft[3]}></Th><Th w={START_W} top={HROW1} freeze={freezeLeft[4]}></Th><Th w={96} top={HROW1} freeze={freezeLeft[5]}></Th>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...thStyle(HROW1), width: cellW, minWidth: cellW, fontSize: "10px" }}>W{c.week}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {phaseGroups.map((group) => (
                <PhaseBlock
                  key={group.phase}
                  group={group}
                  columns={columns}
                  cellW={cellW}
                  freezeLeft={freezeLeft}
                  collapsed={collapsedPhases.has(group.phase)}
                  onToggleCollapse={() => togglePhase(group.phase)}
                  canEdit={canEdit}
                  onCommitTask={(taskId, updates) => onUpdateTask(taskId, updates)}
                />
              ))}
            </tbody>
          </table>

          {/* ลายเซ็น */}
          <div style={{ position: "sticky", left: 0, display: "flex", flexWrap: "wrap", justifyContent: "space-around", gap: "32px", padding: "24px 20px", borderTop: "1px solid var(--border)", background: "var(--panel-2)", zIndex: 1, width: "100%", minWidth: "min-content" }}>
            <SignBlock label="ผู้จัดทำ" role="ตำแหน่ง ACCOUNT COORDINATOR" value={pv("preparedBy")} disabled={disabled} users={users.filter(u => u.role === "ac")} onCommit={commitField("preparedBy")} />
            <SignBlock label="ผู้ตรวจสอบ" role="ตำแหน่ง AE SUPERVISOR" value={pv("reviewedBy")} disabled={disabled} users={users.filter(u => u.role === "ae_supervisor")} onCommit={commitField("reviewedBy")} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──
function Row({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "12px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 500 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

const HROW1 = 30;
const thStyle = (top = 0) => ({
  border: "1px solid var(--border)", padding: "6px 10px", fontSize: "12px",
  fontWeight: 600, color: "var(--text-2)", textAlign: "center", whiteSpace: "nowrap",
  position: "sticky", top, background: "var(--panel-2)", zIndex: 2,
});
function Th({ children, w, align = "center", top = 0, freeze }) {
  const freezeStyle = freeze != null ? { position: "sticky", left: freeze, zIndex: 4, background: "var(--panel-2)" } : {};
  return <th style={{ ...thStyle(top), width: w ? `${w}px` : undefined, minWidth: w ? `${w}px` : undefined, textAlign: align, ...freezeStyle }}>{children}</th>;
}

const freezeTd = (left, extra = {}) => ({
  border: "1px solid var(--border)", padding: "4px 8px", verticalAlign: "middle",
  position: "sticky", left, zIndex: 1, background: "var(--panel)", ...extra,
});

function PhaseBlock({ group, columns, cellW, freezeLeft, collapsed, onToggleCollapse, canEdit, onCommitTask }) {
  const tdBase = { border: "1px solid var(--border)", padding: "4px 8px", verticalAlign: "middle" };
  const phaseBg = "color-mix(in srgb, var(--accent) 8%, var(--panel))";
  return (
    <>
      <tr style={{ background: phaseBg, cursor: "pointer" }} onClick={onToggleCollapse} title={collapsed ? "ขยายรายการ" : "ย่อรายการ"}>
        <td style={{ ...freezeTd(freezeLeft[0], { textAlign: "center", fontWeight: 600, background: phaseBg }) }}>{group.phaseNum}</td>
        <td style={{ ...freezeTd(freezeLeft[1], { fontWeight: 600, background: phaseBg }) }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {collapsed ? <ChevronRight size={16} color="var(--text-2)" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="var(--text-2)" style={{ flexShrink: 0 }} />}
            {group.phase}
            {collapsed && <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 400 }}>({group.tasks.length} รายการ)</span>}
          </div>
        </td>
        <td style={{ ...freezeTd(freezeLeft[2], { background: phaseBg }) }}></td>
        <td style={{ ...freezeTd(freezeLeft[3], { background: phaseBg }) }}></td>
        <td style={{ ...freezeTd(freezeLeft[4], { background: phaseBg }) }}></td>
        <td style={{ ...freezeTd(freezeLeft[5], { background: phaseBg }) }}></td>
        <td style={{ ...tdBase, background: phaseBg }} colSpan={columns.length}></td>
      </tr>
      {!collapsed && group.tasks.map((task, ti) => {
        const filled = autoCellsForTask(task);
        const statusColor = task.status === "Completed" ? "var(--green)"
          : task.status === "In Progress" ? "var(--accent)" : "var(--text-3)";
        const sd = task.startDate ? new Date(task.startDate) : null;
        const startCellKey = sd && !isNaN(sd.getTime()) ? cellKey(sd.getFullYear(), sd.getMonth(), weekOfDay(sd.getDate())) : null;
        const startDay = sd && !isNaN(sd.getTime()) ? sd.getDate() : null;
        return (
          <tr key={task.id}>
            <td style={{ ...freezeTd(freezeLeft[0], { textAlign: "center", color: "var(--text-3)", fontSize: "12px" }) }}>{group.phaseNum}.{ti + 1}</td>
            <td style={{ ...freezeTd(freezeLeft[1]) }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {task.isMilestone && <Flag size={14} color="var(--amber)" style={{ flexShrink: 0 }} />}
                <input
                  className="premium-input"
                  defaultValue={task.name}
                  disabled={!canEdit}
                  onBlur={(e) => { if (e.target.value !== task.name) onCommitTask(task.id, { name: e.target.value }); }}
                  style={{ height: "30px", fontSize: "13px", padding: "2px 8px", border: "none", background: "transparent", width: "100%", whiteSpace: "nowrap" }}
                />
              </div>
              {task.showNoteInPrint && task.note && (
                <div style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic", padding: "0 8px", whiteSpace: "normal" }}>
                  หมายเหตุ: {task.note}
                </div>
              )}
            </td>
            <td style={{ ...freezeTd(freezeLeft[2], { textAlign: "center" }) }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: roleColor(task.role) }}>{task.role}</span>
            </td>
            <td style={{ ...freezeTd(freezeLeft[3], { textAlign: "center" }) }}>
              <input
                type="number" min="1"
                className="premium-input"
                defaultValue={task.durationDays}
                disabled={!canEdit}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                onBlur={(e) => { const n = parseInt(e.target.value, 10) || 1; if (n !== task.durationDays) onCommitTask(task.id, { durationDays: n }); }}
                title="พิมพ์จำนวนวันแล้วกด Enter เพื่ออัพเดท"
                style={{ height: "30px", fontSize: "13px", padding: "2px 4px", width: "48px", textAlign: "center", border: "none", background: "transparent" }}
              />
            </td>
            <td style={{ ...freezeTd(freezeLeft[4], { textAlign: "center", padding: "2px 4px" }) }}>
              <input
                key={`s-${task.startDate || ""}`}
                type="date"
                defaultValue={task.startDate || ""}
                disabled={!canEdit}
                onChange={(e) => { const v = e.target.value; if (v && v !== task.startDate) onCommitTask(task.id, { startDate: v }); }}
                title="เลือกวันเริ่ม"
                style={{ border: "none", background: "transparent", fontSize: "11px", width: "100%", textAlign: "center", color: "var(--text-2)", cursor: canEdit ? "pointer" : "default" }}
              />
            </td>
            <td style={{ ...freezeTd(freezeLeft[5], { textAlign: "center", padding: "2px 4px" }) }}>
                <input
                  key={`f-${task.finishDate || ""}`}
                  type="date"
                  defaultValue={task.finishDate || ""}
                  disabled={!canEdit}
                  min={task.startDate || undefined}
                  onChange={(e) => { const f = e.target.value; if (f && f !== task.finishDate) onCommitTask(task.id, { durationDays: businessDaysBetween(task.startDate, f) }); }}
                  title="เลือกวันจบ"
                  style={{ border: "none", background: "transparent", fontSize: "11px", width: "100%", textAlign: "center", color: "var(--text-2)", cursor: canEdit ? "pointer" : "default" }}
                />
            </td>
            {columns.map((c) => {
              const on = filled.has(c.key);
              const isStart = on && c.key === startCellKey;
              return (
                <td
                  key={c.key}
                  style={{
                    border: "1px solid var(--border)", width: cellW, minWidth: cellW, height: "32px", padding: 0,
                    background: on
                      ? (task.isMilestone && !isStart ? "transparent" : `color-mix(in srgb, ${statusColor} 55%, transparent)`)
                      : "transparent",
                    textAlign: "center",
                  }}
                >
                  {isStart
                    ? <span style={{ fontSize: "10.5px", fontWeight: 600, color: task.status === "Pending" ? "var(--text)" : "#fff" }}>{startDay}</span>
                    : (on && task.isMilestone && <span style={{ color: "var(--amber)", fontSize: "13px" }}>◆</span>)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function SignBlock({ label, role, value, disabled, users, onCommit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
      <SelectUserField value={value} users={users} disabled={disabled} onCommit={onCommit} style={{ width: "220px" }} />
      <span style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 500 }}>({role})</span>
    </div>
  );
}
