"use client";
// ISO Timeline document view (ported from ss-cj ProjectDocumentView).
// แกนเวลาเป็น "รายวันต่อเนื่อง" + บาร์ลากย้าย/ยืด-หดได้แบบ Monday/ClickUp.
// การลากบนจอเป็นแค่ UI — commit ผ่าน onUpdateTask (server คำนวณ finishDate/เลื่อน
// downstream ด้วยวันทำการ แล้ว parent reload). หน้าพิมพ์ (ganttPrint.js) แยกขาด
// ใช้ตารางสัปดาห์เดิม ไม่ได้รับผลจากแกน/ซูมของหน้าจอนี้.
// ss-team ไม่มีตาราง employees → ช่องผู้รับผิดชอบ/ลายเซ็นเป็น text input/dropdown จาก users.
import { useState, useMemo, useEffect, useRef, useReducer, useLayoutEffect } from "react";
import { Flag, ChevronDown, ChevronRight, Minus, Plus, RotateCcw, Loader2 } from "lucide-react";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { PredecessorPopover } from "@/components/pm/PredecessorPicker";
import { useIsPortrait } from "@/lib/useResponsiveView";
import { fmtPhone } from "@/lib/format";
import Select from "@/components/ui/Select";

const DAY_MS = 86400000;
const ROW_H = 34;       // ความสูงแถวงาน (ให้บาร์ align กับช่องซ้าย)
const MONTH_H = 30;     // ความสูงแถบเดือน (= sticky offset ของแถววัน)
const DAY_BAND_H = 26;

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ── date helpers (อิงเวลาท้องถิ่น) ──
// ⚠️ ต้องกัน falsy เอง: new Date(null) = epoch 0 (ไม่ใช่ Invalid) → ถ้าไม่กัน
// dueDate=null จะถูกนับเป็น 1970 ทำให้ rangeStart เพี้ยน บาร์ถูกดันออกนอกจอ
const midnight = (v) => { if (!v) return NaN; const d = new Date(v); if (isNaN(d.getTime())) return NaN; d.setHours(0, 0, 0, 0); return d.getTime(); };
const mondayOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d.getTime(); };
const dayIndexOf = (v, rangeStartMs) => { const t = midnight(v); return isNaN(t) ? NaN : Math.round((t - rangeStartMs) / DAY_MS); };
const isoFromIndex = (rangeStartMs, idx) => toLocalISODate(new Date(rangeStartMs + idx * DAY_MS));

// gridline + weekend shading ของพื้นหลัง timeline (rangeStart = วันจันทร์เสมอ → เสาร์-อาทิตย์ = ช่อง 5,6)
const weekendShade = "color-mix(in srgb, var(--text-3) 9%, transparent)";
const buildGridBg = (px) => {
  const wk = px * 7;
  const layers = [
    // เส้นแบ่งสัปดาห์ (เข้มกว่า)
    `repeating-linear-gradient(90deg, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${wk}px)`,
  ];
  // เส้นแบ่งวัน (จางลง) เมื่อซูมเข้าพอ
  if (px >= 14) layers.push(`repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 45%, transparent) 0, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px, transparent ${px}px)`);
  // แรเงาวันหยุดสุดสัปดาห์ (ล่างสุด)
  layers.push(`repeating-linear-gradient(90deg, transparent 0, transparent ${px * 5}px, ${weekendShade} ${px * 5}px, ${weekendShade} ${wk}px)`);
  return layers.join(", ");
};

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

const statusFill = (status) =>
  status === "Completed" ? "var(--green)"
    : status === "In Progress" ? "var(--accent)"
      : "var(--text-3)";

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
    <Select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
      style={{ height: "30px", ...style }}
    >
      <option value="">— ไม่ระบุ —</option>
      {value && !hasValueInList && <option value={value}>{value}</option>}
      {users.map((u) => {
        const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
        return <option key={u.id} value={name}>{name}</option>;
      })}
    </Select>
  );
}

// ── ตัวควบคุมซูม (px ต่อวัน) — segmented presets + stepper ──
const ZOOM_MIN = 4, ZOOM_MAX = 48, ZOOM_DEFAULT = 13;
const ZOOM_PRESETS = [
  { key: "month", label: "เดือน", px: 5 },
  { key: "week", label: "สัปดาห์", px: 13 },
  { key: "day", label: "วัน", px: 34 },
];

function ZoomControl({ px, onChange }) {
  const clamp = (v) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v)));
  return (
    <div className="segmented" title="ปรับความละเอียดของแกนเวลา (เฉพาะบนจอ — ไม่กระทบหน้าพิมพ์)">
      <button type="button" className="icon" disabled={px <= ZOOM_MIN}
        onClick={() => onChange(clamp(px / 1.35))} aria-label="ซูมออก" title="ซูมออก">
        <Minus size={15} />
      </button>
      {ZOOM_PRESETS.map((p) => (
        <button key={p.key} type="button" className={px === p.px ? "active" : ""}
          onClick={() => onChange(p.px)}>
          {p.label}
        </button>
      ))}
      <button type="button" className="icon" disabled={px >= ZOOM_MAX}
        onClick={() => onChange(clamp(px * 1.35))} aria-label="ซูมเข้า" title="ซูมเข้า">
        <Plus size={15} />
      </button>
      <span className="divider" />
      <button type="button" className="icon" disabled={px === ZOOM_DEFAULT}
        onClick={() => onChange(ZOOM_DEFAULT)} aria-label="รีเซ็ตการซูม" title="รีเซ็ตการซูม">
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

export default function ProjectDocumentView({ project, canEdit, onUpdateProject, onUpdateTask, fgUI, statusLabel, statusColor }) {
  const isPortrait = useIsPortrait(); // จอตั้ง/แคบ → ลดคอลัมน์ที่แช่แข็ง ไม่ให้บังเนื้อหา
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

  // popover ตั้ง predecessors เมื่อคลิกบาร์ (ไม่ได้ลาก) — { task, x, y }
  const [depPopover, setDepPopover] = useState(null);
  // ติดเลขลำดับให้ทุกขั้น (เรียงตาม stepOrder) เพื่อให้ตัวเลือกใน popover อ่านง่าย
  const numberedTasks = useMemo(() => {
    const ordered = [...tasks].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    return ordered.map((t, i) => ({ ...t, displayNumber: i + 1 }));
  }, [tasks]);

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

  // เบอร์มือถือ + อีเมลของ AE ผู้ดูแล — ดึงจากข้อมูลผู้ใช้ (assignable-users) โดย
  // จับคู่ชื่อที่เลือกใน aeOwner. ไม่มีช่องกรอกในฟอร์ม (CR §3.2).
  const userDisplayName = (u) => (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
  const aeUser = users.find((u) => userDisplayName(u) === pv("aeOwner"));
  const aeMobile = aeUser?.phone ? fmtPhone(aeUser.phone) : "";
  const aeEmail = aeUser?.email || "";
  // ใบเสนอราคา (+ PO ในวงเล็บถ้ามี) — CR §3.3
  const quotationNo = project.metadata?.quotationNumber || "";
  const poNo = project.metadata?.poNumber || "";
  const quotationLine = quotationNo ? `${quotationNo}${poNo ? ` (${poNo})` : ""}` : (poNo ? `(${poNo})` : "-");

  // ── ซูม: px ต่อวัน (จำค่าใน localStorage) ──
  const [pxPerDay, setPxPerDay] = useState(ZOOM_DEFAULT);
  useEffect(() => {
    try {
      const saved = parseInt(localStorage.getItem("pm_gantt_pxPerDay") || "", 10);
      if (!isNaN(saved) && saved >= ZOOM_MIN && saved <= ZOOM_MAX) setPxPerDay(saved);
    } catch { /* ignore */ }
  }, []);
  const changePx = (v) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v)));
    setPxPerDay(clamped);
    try { localStorage.setItem("pm_gantt_pxPerDay", String(clamped)); } catch { /* ignore */ }
  };

  // ── ขอบเขตเวลา (แกนรายวัน) — rangeStart เป็นวันจันทร์เสมอ ──
  const { rangeStartMs, totalDays } = useMemo(() => {
    const starts = tasks.map((t) => midnight(t.startDate)).filter((n) => !isNaN(n));
    const finishes = tasks.map((t) => midnight(t.finishDate)).filter((n) => !isNaN(n));
    const projStart = midnight(project.startDate);
    let minMs = starts.length ? Math.min(...starts) : (isNaN(projStart) ? midnight(nowMs) : projStart);
    const maxMs = finishes.length ? Math.max(...finishes) : minMs + 30 * DAY_MS;
    const start = mondayOf(minMs - 7 * DAY_MS);             // เผื่อ 1 สัปดาห์ก่อนเริ่ม
    const endMon = mondayOf(maxMs + 10 * DAY_MS);           // เผื่อท้าย + ปัดเป็นสัปดาห์
    const end = endMon + 6 * DAY_MS;
    const days = Math.round((end - start) / DAY_MS) + 1;
    return { rangeStartMs: start, totalDays: Math.max(days, 14) };
  }, [tasks, project.startDate, nowMs]);

  const timelineWidth = totalDays * pxPerDay;
  const todayIdx = dayIndexOf(nowMs, rangeStartMs);
  const gridBg = useMemo(() => buildGridBg(pxPerDay), [pxPerDay]);

  // แกน: รายการวัน + การจัดกลุ่มเป็นเดือน
  const axis = useMemo(() => {
    const days = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStartMs + i * DAY_MS);
      days.push({ i, date: d.getDate(), dow: d.getDay() });
    }
    const months = [];
    let cur = null;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStartMs + i * DAY_MS);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!cur || cur.key !== key) { cur = { key, m0: d.getMonth(), year: d.getFullYear(), count: 0 }; months.push(cur); }
      cur.count++;
    }
    return { days, months };
  }, [rangeStartMs, totalDays]);

  // ── จัดกลุ่มตามเฟส (คงลำดับ) ──
  const phaseGroups = useMemo(() => {
    const order = [];
    tasks.forEach((t) => { const p = t.phase || "—"; if (!order.includes(p)) order.push(p); });
    return order.map((phase, i) => ({
      phase, phaseNum: i + 1,
      tasks: tasks.filter((t) => (t.phase || "—") === phase),
    }));
  }, [tasks]);

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
      // จอตั้ง: จำกัดความกว้างคอลัมน์ชื่องานให้แคบลง กันคอลัมน์แช่แข็งกินจอจนมองแกนเวลาไม่เห็น
      return isPortrait
        ? Math.min(200, Math.max(120, Math.ceil(maxPx) + 24))
        : Math.min(420, Math.max(160, Math.ceil(maxPx) + 24));
    } catch { return isPortrait ? 150 : 220; }
  }, [tasks, isPortrait]);

  // Freeze left offsets คำนวณจาก descW จริง
  // จอตั้ง: แช่แข็งเฉพาะ "no. + ชื่องาน" (คอลัมน์อื่นเลื่อนไปกับแกนเวลาได้) เพื่อให้เหลือพื้นที่ดูเนื้อหา
  const NO_W = 40, TEAM_W = 46, DAY_W = 64, START_W = 96, FINISH_W = 96;
  const freezeLeft = useMemo(() => isPortrait ? [
    0,
    NO_W,
    null, null, null, null,
  ] : [
    0,
    NO_W,
    NO_W + descW,
    NO_W + descW + TEAM_W,
    NO_W + descW + TEAM_W + DAY_W,
    NO_W + descW + TEAM_W + DAY_W + START_W,
  ], [descW, isPortrait]);

  const disabled = !canEdit;

  // ── เส้นเชื่อม dependency (predecessor → ลูก) แบบ Monday ──
  // วัดตำแหน่งบาร์จริงจาก DOM (กันคลาดเคลื่อนจาก border ตาราง) แล้ววาดเป็น SVG overlay
  // พิกัดอิง "เนื้อหา" (บวก scrollLeft/Top) → ไม่ต้องคำนวณใหม่ตอน scroll
  const scrollRef = useRef(null);
  const [links, setLinks] = useState([]);
  const [overlay, setOverlay] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    const map = new Map();
    cont.querySelectorAll("[data-bar-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      map.set(el.getAttribute("data-bar-id"), {
        x1: r.left - cr.left + cont.scrollLeft,
        x2: r.right - cr.left + cont.scrollLeft,
        yc: r.top - cr.top + cont.scrollTop + r.height / 2,
      });
    });
    const ls = [];
    tasks.forEach((t) => {
      const child = map.get(t.id);
      if (!child) return;
      (Array.isArray(t.predecessors) ? t.predecessors : []).forEach((pid) => {
        const par = map.get(String(pid));
        if (!par) return;
        ls.push({ key: `${pid}->${t.id}`, sx: par.x2, sy: par.yc, ex: child.x1, ey: child.yc });
      });
    });
    setLinks(ls);
    setOverlay({ w: cont.scrollWidth, h: cont.scrollHeight });
  }, [tasks, pxPerDay, collapsedPhases, timelineWidth, descW]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>เอกสาร Timeline (ISO)</span>
          <span style={{ fontSize: "13px", color: statusColor || "var(--text-2)", display: "flex", alignItems: "center", gap: "6px" }}>
            สถานะ: <strong>{statusLabel || project.status}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>· ลากบาร์เพื่อย้าย · ลากขอบเพื่อยืด-หด · อัปเดตวันทันที</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <ZoomControl px={pxPerDay} onChange={changePx} />
        </div>
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
          <div style={{ display: "grid", gridTemplateColumns: isPortrait ? "1fr" : "1fr 1fr", gap: isPortrait ? "12px" : "20px", padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
            {/* ซ้าย */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderRight: isPortrait ? "none" : "1px solid var(--border)", paddingRight: isPortrait ? 0 : "20px", paddingBottom: isPortrait ? "12px" : 0, borderBottom: isPortrait ? "1px solid var(--border)" : "none" }}>
              <Row label="Customer Name"><span style={{ fontSize: "13px", fontWeight: 600 }}>{project.customerName || "-"}</span></Row>
              <Row label="Brand"><span style={{ fontSize: "13px", fontWeight: 600 }}>{project.metadata?.brand || "-"}</span></Row>
              <div style={{ height: "6px" }} />
              <Row label="ผู้ตรวจสอบ (AE Supervisor)"><SelectUserField value={pv("aeSupervisor")} users={users.filter(u => u.role === "ae_supervisor")} disabled={disabled} onCommit={commitField("aeSupervisor")} /></Row>
              <Row label="ผู้ดูแล (Account Executive)"><SelectUserField value={pv("aeOwner")} users={users.filter(u => u.role === "ae" || u.role === "senior_ae")} disabled={disabled} onCommit={commitField("aeOwner")} /></Row>
              <Row label="เบอร์มือถือ"><span style={{ fontSize: "13px", color: "var(--text-2)" }}>{aeMobile || "—"}</span></Row>
              <Row label="Email"><span style={{ fontSize: "13px", color: "var(--text-2)" }}>{aeEmail || "—"}</span></Row>
            </div>
            {/* ขวา */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Row label="Project Name"><EditField value={pv("productName")} placeholder={project.name} disabled={disabled} onInput={onField("productName")} onCommit={commitField("productName")} /></Row>
              <Row label="ใบเสนอราคา"><span style={{ fontSize: "13px", fontWeight: 600 }}>{quotationLine}</span></Row>
              <Row label="วันที่"><span style={{ fontSize: "13px", fontWeight: 600 }}>{fmtDate(project.startDate)}</span></Row>
              {fgUI && <Row label="สินค้า (FG)">{fgUI}</Row>}
            </div>
          </div>
        )}
      </div>

      {/* Legend: ที่มาของบาร์ */}
      <div style={{ flexShrink: 0, display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", fontSize: "11px", color: "var(--text-2)" }}>
        <span style={{ color: "var(--text-3)" }}>ที่มาของขั้นตอน:</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "18px", height: "12px", borderRadius: "3px", background: "var(--accent)" }} /> จาก template
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "18px", height: "12px", borderRadius: "3px", border: "1.6px dashed var(--accent)", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Plus size={9} color="var(--accent)" /></span> เพิ่มใหม่
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ position: "relative", width: "18px", height: "12px", borderRadius: "3px", background: "var(--accent)", overflow: "hidden" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: "var(--origin-edited)" }} />
          </span> แก้ไขโดยผู้ใช้
        </span>
      </div>

      {/* ตาราง + ลายเซ็น */}
      <div style={{ height: "calc(100vh - 320px)", minHeight: "400px", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "10px", background: "var(--panel)", overflow: "hidden" }}>
        <div ref={scrollRef} style={{ flex: "1 1 auto", overflow: "auto", position: "relative" }}>
          {/* SVG overlay เส้น dependency — zIndex 0 อยู่เหนือบาร์ (td z0) แต่ใต้คอลัมน์แช่แข็ง/หัวตาราง (z1+) */}
          {links.length > 0 && (
            <svg width={overlay.w} height={overlay.h} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 0, overflow: "visible" }}>
              <defs>
                <marker id="pm-dep-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-3)" />
                </marker>
              </defs>
              {links.map((l) => {
                const gap = 9;
                let d;
                if (l.ex >= l.sx + gap) {
                  d = `M ${l.sx} ${l.sy} H ${l.sx + gap} V ${l.ey} H ${l.ex - 3}`;
                } else {
                  const ym = l.ey >= l.sy ? l.sy + ROW_H * 0.6 : l.sy - ROW_H * 0.6;
                  d = `M ${l.sx} ${l.sy} h ${gap} V ${ym} H ${l.ex - gap} V ${l.ey} H ${l.ex - 3}`;
                }
                return <path key={l.key} d={d} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeOpacity="0.5" markerEnd="url(#pm-dep-arrow)" />;
              })}
            </svg>
          )}
          <table style={{ borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed", width: "100%", minWidth: "max-content" }}>
            <colgroup>
              <col style={{ width: `${NO_W}px`, minWidth: `${NO_W}px` }} />
              <col style={{ width: `${descW}px`, minWidth: `${descW}px` }} />
              <col style={{ width: `${TEAM_W}px`, minWidth: `${TEAM_W}px` }} />
              <col style={{ width: `${DAY_W}px`, minWidth: `${DAY_W}px` }} />
              <col style={{ width: `${START_W}px`, minWidth: `${START_W}px` }} />
              <col style={{ width: `${FINISH_W}px`, minWidth: `${FINISH_W}px` }} />
              <col style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--panel-2)" }}>
                <Th w={NO_W} freeze={freezeLeft[0]}>no.</Th>
                <Th w={descW} align="left" freeze={freezeLeft[1]}>Work Description</Th>
                <Th w={TEAM_W} freeze={freezeLeft[2]}>Team</Th>
                <Th w={DAY_W} freeze={freezeLeft[3]}>Duration</Th>
                <Th w={START_W} freeze={freezeLeft[4]}>Start</Th>
                <Th w={FINISH_W} freeze={freezeLeft[5]}>Finish</Th>
                <th style={{ ...thStyle(0), padding: 0 }}>
                  <div style={{ display: "flex", width: timelineWidth, height: MONTH_H }}>
                    {axis.months.map((m) => (
                      <div key={m.key} style={{
                        width: m.count * pxPerDay, height: MONTH_H, lineHeight: `${MONTH_H}px`,
                        fontSize: "11px", fontWeight: 600, color: "var(--text-2)", textAlign: "center",
                        borderLeft: "1px solid var(--border)", overflow: "hidden", whiteSpace: "nowrap",
                      }}>
                        {m.count * pxPerDay >= 34 ? `${THAI_MONTHS_SHORT[m.m0]} ${String(m.year).slice(2)}` : ""}
                      </div>
                    ))}
                  </div>
                </th>
              </tr>
              <tr style={{ background: "var(--panel-2)" }}>
                <Th w={NO_W} top={MONTH_H} freeze={freezeLeft[0]}></Th>
                <Th w={descW} top={MONTH_H} freeze={freezeLeft[1]}></Th>
                <Th w={TEAM_W} top={MONTH_H} freeze={freezeLeft[2]}></Th>
                <Th w={DAY_W} top={MONTH_H} freeze={freezeLeft[3]}></Th>
                <Th w={START_W} top={MONTH_H} freeze={freezeLeft[4]}></Th>
                <Th w={FINISH_W} top={MONTH_H} freeze={freezeLeft[5]}></Th>
                <th style={{ ...thStyle(MONTH_H), padding: 0 }}>
                  <div style={{ display: "flex", width: timelineWidth, height: DAY_BAND_H }}>
                    {axis.days.map((d) => {
                      const weekend = d.dow === 0 || d.dow === 6;
                      const label = pxPerDay >= 22 ? String(d.date)
                        : (pxPerDay >= 11 && d.dow === 1 ? String(d.date) : "");
                      return (
                        <div key={d.i} style={{
                          width: pxPerDay, height: DAY_BAND_H, lineHeight: `${DAY_BAND_H}px`,
                          fontSize: "9.5px", fontWeight: weekend ? 400 : 500,
                          color: weekend ? "var(--text-3)" : "var(--text-2)", textAlign: "center",
                          background: weekend ? weekendShade : "transparent",
                          borderLeft: d.dow === 1 ? "1px solid var(--border)" : (pxPerDay >= 14 ? "1px solid color-mix(in srgb, var(--border) 40%, transparent)" : "none"),
                          overflow: "hidden",
                        }}>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {phaseGroups.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ border: "1px solid var(--border)", padding: "30px", textAlign: "center", color: "var(--text-3)" }}>
                    ยังไม่มีขั้นตอนในโปรเจกต์นี้
                  </td>
                </tr>
              )}
              {phaseGroups.map((group) => (
                <PhaseBlock
                  key={group.phase}
                  group={group}
                  rangeStartMs={rangeStartMs}
                  totalDays={totalDays}
                  pxPerDay={pxPerDay}
                  timelineWidth={timelineWidth}
                  gridBg={gridBg}
                  todayIdx={todayIdx}
                  freezeLeft={freezeLeft}
                  collapsed={collapsedPhases.has(group.phase)}
                  onToggleCollapse={() => togglePhase(group.phase)}
                  canEdit={canEdit}
                  onCommitTask={(taskId, updates) => onUpdateTask(taskId, updates)}
                  onPickDeps={(task, anchor) => setDepPopover({ task, ...anchor })}
                />
              ))}
            </tbody>
          </table>

          {/* ลายเซ็น */}
          <div style={{ position: "sticky", left: 0, display: "flex", flexWrap: "wrap", justifyContent: "space-around", gap: "32px", padding: "24px 20px", borderTop: "1px solid var(--border)", background: "var(--panel-2)", zIndex: 1, width: "100%", minWidth: "min-content" }}>
            <SignBlock label="ผู้จัดทำ" role="ตำแหน่ง ACCOUNT COORDINATOR" value={pv("preparedBy")} disabled={disabled} users={users.filter(u => u.role === "ac")} onCommit={commitField("preparedBy")} />
            {/* ผู้ตรวจสอบ = field เดียวกับฟอร์มและหัวเอกสาร (aeSupervisor) — เลิกใช้ reviewedBy เพื่อไม่ให้ข้อมูลแตกเป็นสองที่ */}
            <SignBlock label="ผู้ตรวจสอบ" role="ตำแหน่ง AE SUPERVISOR" value={pv("aeSupervisor") || pv("reviewedBy")} disabled={disabled} users={users.filter(u => u.role === "ae_supervisor")} onCommit={commitField("aeSupervisor")} />
          </div>
        </div>
      </div>

      {depPopover && (
        <PredecessorPopover
          task={depPopover.task}
          tasks={numberedTasks}
          anchor={{ x: depPopover.x, y: depPopover.y }}
          onClose={() => setDepPopover(null)}
          onSave={(predecessors) => { onUpdateTask(depPopover.task.id, { predecessors }); setDepPopover(null); }}
        />
      )}
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
  // left == null (จอตั้ง) → ไม่แช่แข็ง ให้คอลัมน์เลื่อนไปกับแกนเวลา
  ...(left != null ? { position: "sticky", left, zIndex: 1, background: "var(--panel)" } : {}),
  ...extra,
});

// แถบเวลาในเซลล์ timeline ของแต่ละแถว (พื้นหลัง gridline + เส้นวันนี้ + บาร์)
function TimelineCell({ children, pxPerDay, timelineWidth, gridBg, todayIdx, totalDays }) {
  // zIndex:0 ทำให้ td เป็น stacking context — บาร์/handle ภายในจะไม่ทับคอลัมน์แช่แข็ง (z1) หรือหัวตาราง (z2+) ตอน scroll
  // ใช้ backgroundImage อย่างเดียว (ไม่ผสม shorthand background) กัน React warning ตอน rerender
  return (
    <td style={{ border: "1px solid var(--border)", padding: 0, height: `${ROW_H}px`, position: "relative", zIndex: 0, backgroundImage: gridBg }}>
      <div style={{ position: "relative", width: timelineWidth, height: ROW_H }}>
        {todayIdx >= 0 && todayIdx < totalDays && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: todayIdx * pxPerDay + pxPerDay / 2 - 1, width: "2px", background: "var(--red)", opacity: 0.55, zIndex: 1, pointerEvents: "none" }} />
        )}
        {children}
      </div>
    </td>
  );
}

function PhaseBlock({ group, rangeStartMs, totalDays, pxPerDay, timelineWidth, gridBg, todayIdx, freezeLeft, collapsed, onToggleCollapse, canEdit, onCommitTask, onPickDeps }) {
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
        <td style={{ border: "1px solid var(--border)", padding: 0, background: phaseBg }}></td>
      </tr>
      {!collapsed && group.tasks.map((task, ti) => (
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
              <div style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic", padding: "0 8px", whiteSpace: "pre-wrap" }}>
                หมายเหตุ: {task.note}
              </div>
            )}
          </td>
          <td style={{ ...freezeTd(freezeLeft[2], { textAlign: "center" }) }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: roleColor(task.role) }}>{task.role}</span>
          </td>
          <td style={{ ...freezeTd(freezeLeft[3], { textAlign: "center" }) }}>
            <input
              key={`dur-${task.durationDays}`}
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
              onChange={(e) => { const f = e.target.value; if (f && f !== task.finishDate) onCommitTask(task.id, { finishDate: f }); }}
              title="เลือกวันจบ"
              style={{ border: "none", background: "transparent", fontSize: "11px", width: "100%", textAlign: "center", color: "var(--text-2)", cursor: canEdit ? "pointer" : "default" }}
            />
          </td>
          <TimelineCell pxPerDay={pxPerDay} timelineWidth={timelineWidth} gridBg={gridBg} todayIdx={todayIdx} totalDays={totalDays}>
            <TaskBar
              task={task}
              rangeStartMs={rangeStartMs}
              totalDays={totalDays}
              pxPerDay={pxPerDay}
              canEdit={canEdit}
              onCommit={onCommitTask}
              onPickDeps={onPickDeps}
            />
          </TimelineCell>
        </tr>
      ))}
    </>
  );
}

// ── บาร์ลากได้แบบ Monday/ClickUp ──
function TaskBar({ task, rangeStartMs, totalDays, pxPerDay, canEdit, onCommit, onPickDeps }) {
  const dragRef = useRef(null);
  const [, force] = useReducer((x) => x + 1, 0);
  // pending = ตำแหน่ง optimistic หลังปล่อยเมาส์ (เก็บเป็น ISO) คงไว้จนข้อมูลจริงจาก server กลับมา
  // → กันบาร์เด้งกลับตำแหน่งเดิมแว้บหนึ่งระหว่างรอ reload
  const [pending, setPending] = useState(null);
  useEffect(() => { setPending(null); }, [task.startDate, task.finishDate, task.durationDays]);

  const baseStartIdx = dayIndexOf(task.startDate, rangeStartMs);
  const fIdxRaw = dayIndexOf(task.finishDate, rangeStartMs);
  const baseFinishIdx = isNaN(fIdxRaw) ? baseStartIdx : Math.max(fIdxRaw, baseStartIdx);

  const d = dragRef.current;
  const pendS = pending ? dayIndexOf(pending.s, rangeStartMs) : NaN;
  const pendF = pending ? dayIndexOf(pending.f, rangeStartMs) : NaN;
  const sIdx = d ? d.curS : (!isNaN(pendS) ? pendS : baseStartIdx);
  const fIdx = d ? d.curF : (!isNaN(pendF) ? pendF : baseFinishIdx);

  if (isNaN(baseStartIdx) && !pending) return null; // ยังไม่มีวันเริ่ม → ไม่วาดบาร์

  const commit = (st) => {
    if (st.mode === "move") {
      if (st.curS === st.origS) return;
      onCommit(task.id, { startDate: isoFromIndex(rangeStartMs, st.curS) });
    } else if (st.mode === "right") {
      if (st.curF === st.origF) return;
      // ลากขอบขวา = ยืด/หดถึงวันจบใหม่ → ส่งวันจบไปให้ server แปลงเป็น duration เอง
      onCommit(task.id, { finishDate: isoFromIndex(rangeStartMs, st.curF) });
    } else if (st.mode === "left") {
      if (st.curS === st.origS) return;
      // ลากขอบซ้าย = เลื่อนวันเริ่มโดยคงวันจบเดิม → server คำนวณ duration จาก (วันเริ่มใหม่ → วันจบเดิม)
      onCommit(task.id, { startDate: isoFromIndex(rangeStartMs, st.curS), finishDate: task.finishDate });
    }
  };

  const begin = (mode) => (e) => {
    if (!canEdit) return;
    if (task.isMilestone && mode !== "move") return;
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, origS: baseStartIdx, origF: baseFinishIdx, curS: baseStartIdx, curF: baseFinishIdx, moved: false };
    force();
    const onMove = (ev) => {
      const cur = dragRef.current; if (!cur) return;
      const dd = Math.round((ev.clientX - cur.startX) / pxPerDay);
      if (dd !== 0) cur.moved = true;
      if (cur.mode === "move") { cur.curS = cur.origS + dd; cur.curF = cur.origF + dd; }
      else if (cur.mode === "left") { cur.curS = Math.min(cur.origS + dd, cur.origF); }
      else if (cur.mode === "right") { cur.curF = Math.max(cur.origF + dd, cur.origS); }
      force();
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cur = dragRef.current;
      dragRef.current = null;
      const willChange = cur && cur.moved && (
        cur.mode === "right" ? cur.curF !== cur.origF : cur.curS !== cur.origS
      );
      if (willChange) {
        // ค้างบาร์ไว้ที่ตำแหน่งที่ลาก แล้วค่อย commit (effect จะเคลียร์ pending เมื่อ task อัปเดต)
        setPending({ s: isoFromIndex(rangeStartMs, cur.curS), f: isoFromIndex(rangeStartMs, cur.curF) });
        commit(cur);
      } else {
        // คลิกบนตัวบาร์ (ไม่ได้ลาก) → เปิด popover ตั้ง predecessors ที่ตำแหน่งเมาส์
        if (cur && !cur.moved && cur.mode === "move" && canEdit && onPickDeps) {
          onPickDeps(task, { x: ev.clientX, y: ev.clientY });
        }
        force();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const fill = statusFill(task.status);
  const isPending = task.status === "Pending";
  const dragging = !!d;
  const saving = !!pending && !d; // ปล่อยเมาส์แล้ว กำลังรอ server ตอบ → โชว์สถานะกำลังบันทึก
  const spinner = (color) => (
    <Loader2 size={13} color={color} style={{ animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
  );
  // ที่มาของขั้นตอน (เห็นได้ทุกความกว้างของบาร์):
  //   custom = เพิ่มใหม่ → ขอบประ ; edited = แก้ไขโดยผู้ใช้ → แถบสีซ้าย (amber)
  const kind = task.origin === "custom" ? "custom" : (task.userEdited ? "edited" : "template");

  // ── milestone = สี่เหลี่ยมขนมเปียกปูน (ลากย้ายอย่างเดียว) ──
  if (task.isMilestone) {
    const size = ROW_H - 16;
    const cx = sIdx * pxPerDay + pxPerDay / 2;
    const msBorder = kind === "custom"
      ? "1.6px dashed color-mix(in srgb, var(--amber) 75%, #000)"
      : kind === "edited"
        ? "2.5px solid var(--origin-edited)"
        : "1.5px solid color-mix(in srgb, var(--amber) 60%, #000)";
    return (
      <>
        <div
          data-bar-id={task.id}
          onPointerDown={begin("move")}
          title={`${task.name}\n${fmtDate(task.startDate)} (จุดสำคัญ)${kind === "custom" ? " · เพิ่มใหม่" : kind === "edited" ? " · แก้ไขแล้ว" : ""}${canEdit ? "\nคลิกเพื่อตั้งงานที่ต้องรอก่อน · ลากเพื่อย้าย" : ""}`}
          style={{
            position: "absolute", top: (ROW_H - size) / 2, left: cx - size / 2, width: size, height: size,
            background: "var(--amber)", transform: "rotate(45deg)", borderRadius: "3px",
            border: msBorder, zIndex: 2,
            cursor: canEdit ? (dragging ? "grabbing" : "grab") : "default",
            opacity: saving ? 0.7 : 1,
            boxShadow: dragging ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
          }}
        />
        {saving && (
          <span style={{ position: "absolute", top: "50%", left: cx + size / 2 + 4, transform: "translateY(-50%)", zIndex: 3, pointerEvents: "none" }}>
            {spinner("var(--amber)")}
          </span>
        )}
      </>
    );
  }

  const barH = ROW_H - 12;
  const left = sIdx * pxPerDay + 1;
  const width = Math.max(pxPerDay - 2, (fIdx - sIdx + 1) * pxPerDay - 2);
  const handle = (side) => ({
    position: "absolute", top: 0, bottom: 0, [side]: 0, width: "8px",
    cursor: canEdit ? "ew-resize" : "default", zIndex: 3,
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  const grip = { width: "2px", height: "45%", background: "rgba(255,255,255,0.75)", borderRadius: "2px" };

  const solidBorderColor = isPending ? fill : `color-mix(in srgb, ${fill} 65%, #000)`;
  const border = kind === "custom"
    ? `1.6px dashed ${isPending ? fill : `color-mix(in srgb, ${fill} 80%, #000)`}`
    : `${isPending ? "1.5px" : "1px"} solid ${solidBorderColor}`;
  const originNote = kind === "custom" ? " · เพิ่มใหม่" : kind === "edited" ? " · แก้ไขโดยผู้ใช้" : "";

  return (
    <div
      data-bar-id={task.id}
      onPointerDown={begin("move")}
      title={`${task.name}\n${fmtDate(task.startDate)} – ${fmtDate(task.finishDate)} · ${task.durationDays} วันทำการ${originNote}${canEdit ? "\nคลิกเพื่อตั้งงานที่ต้องรอก่อน · ลากเพื่อย้าย · ลากขอบเพื่อยืด-หด" : ""}`}
      style={{
        position: "absolute", top: (ROW_H - barH) / 2, left, width, height: barH,
        background: isPending ? "var(--panel-2)" : fill,
        border,
        borderRadius: "6px", zIndex: 2, overflow: "hidden",
        display: "flex", alignItems: "center", gap: "5px", padding: "0 9px",
        cursor: canEdit ? (dragging ? "grabbing" : "grab") : "default",
        userSelect: "none", touchAction: "none",
        opacity: saving ? 0.8 : 1,
        boxShadow: dragging ? "0 3px 10px rgba(0,0,0,0.25)" : "none",
        transition: dragging ? "none" : "box-shadow 0.15s, opacity 0.15s",
      }}
    >
      {kind === "edited" && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: "var(--origin-edited)", zIndex: 1, pointerEvents: "none" }} />}
      {canEdit && !saving && <div onPointerDown={begin("left")} style={handle("left")}><span style={grip} /></div>}
      <span style={{
        fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        color: isPending ? "var(--text-2)" : "#fff", pointerEvents: "none", flex: 1,
      }}>
        {width > 44 ? task.name : ""}
      </span>
      {saving && spinner(isPending ? "var(--text-2)" : "#fff")}
      {canEdit && !saving && <div onPointerDown={begin("right")} style={handle("right")}><span style={grip} /></div>}
    </div>
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
