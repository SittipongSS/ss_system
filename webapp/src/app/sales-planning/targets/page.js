"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, RefreshCcw, Save, Split, Target } from "lucide-react";
import Modal from "@/components/Modal";
import Workspace from "@/components/ui/Workspace";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES, money, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";

const TEAM_LABELS = { ODM: "New ODM", KA: "Key Account", SV: "Services" };
const thisYear = () => thisMonth().slice(0, 4);

export default function SalesPlanningTargetsPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const team = useTeam();
  const isSuper = role === "admin" || role === "ae_supervisor";

  const [periodType, setPeriodType] = useState("year");
  const [year, setYear] = useState(thisYear());
  const [month, setMonth] = useState(thisMonth());
  const period = periodType === "year" ? year : month;

  const [targets, setTargets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [editNode, setEditNode] = useState(null);
  const [editForm, setEditForm] = useState({ targetAmount: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = `periodType=${periodType}&period=${encodeURIComponent(period)}`;
      const [targetsRes, usersRes] = await Promise.all([
        fetch(`/api/sales-planning/targets?${q}`),
        fetch("/api/pm/assignable-users"),
      ]);
      if (!targetsRes.ok) throw new Error((await targetsRes.json()).error || "โหลด target ไม่สำเร็จ");
      setTargets(await targetsRes.json());
      setUsers(usersRes.ok ? await usersRes.json() : []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [periodType, period]);

  useEffect(() => {
    load();
  }, [load]);

  const findTarget = useCallback(
    (t, ownerId) => targets.find((x) => (x.team || null) === (t || null) && (x.ownerId || null) === (ownerId || null)),
    [targets],
  );

  const teamsToShow = useMemo(() => (isSuper ? SALES_TEAMS : team ? [team] : []), [isSuper, team]);

  // Build the SA → team → AE tree for the selected period.
  const tree = useMemo(() => {
    const saTgt = findTarget(null, null);
    const teams = teamsToShow.map((t) => {
      const teamTgt = findTarget(t, null);
      const members = users
        .filter((u) => TARGET_OWNER_ROLES.includes(u.role) && u.team === t)
        .map((u) => {
          const aeTgt = findTarget(t, u.id);
          return {
            level: "ae",
            team: t,
            ownerId: u.id,
            ownerName: u.name,
            role: u.role,
            id: aeTgt?.id || null,
            targetAmount: Number(aeTgt?.targetAmount || 0),
            notes: aeTgt?.notes || "",
          };
        });
      const allocated = members.reduce((s, m) => s + m.targetAmount, 0);
      return {
        level: "team",
        team: t,
        ownerId: null,
        ownerName: null,
        id: teamTgt?.id || null,
        targetAmount: Number(teamTgt?.targetAmount || 0),
        notes: teamTgt?.notes || "",
        members,
        allocated,
      };
    });
    const saAllocated = teams.reduce((s, t) => s + t.targetAmount, 0);
    return {
      sa: {
        level: "sa",
        team: null,
        ownerId: null,
        ownerName: null,
        id: saTgt?.id || null,
        targetAmount: Number(saTgt?.targetAmount || 0),
        notes: saTgt?.notes || "",
        allocated: saAllocated,
      },
      teams,
    };
  }, [findTarget, teamsToShow, users]);

  const canEditNode = useCallback(
    (node) => {
      if (!canTarget) return false;
      if (node.level === "sa") return isSuper;
      return isSuper || (role === "senior_ae" && node.team === team);
    },
    [canTarget, isSuper, role, team],
  );

  const openEdit = (node) => {
    setEditNode(node);
    setEditForm({ targetAmount: node.targetAmount || "", notes: node.notes || "" });
  };

  const saveNode = async (e) => {
    e.preventDefault();
    if (!editNode) return;
    setSubmitting(true);
    setError("");
    const payload = {
      period,
      periodType,
      team: editNode.team || null,
      ownerId: editNode.ownerId || null,
      ownerName: editNode.ownerName || null,
      targetAmount: editForm.targetAmount,
      notes: editForm.notes,
    };
    try {
      const res = await fetch(
        editNode.id ? `/api/sales-planning/targets/${editNode.id}` : "/api/sales-planning/targets",
        { method: editNode.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error((await res.json()).error || "บันทึก target ไม่สำเร็จ");
      setEditNode(null);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึก target ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  // Distribute a yearly node figure evenly into its 12 monthly rows.
  const autoSplit = async (node) => {
    if (!node.targetAmount || node.targetAmount <= 0) return;
    const label = node.level === "sa" ? "SA รวม" : node.ownerName || `ทีม ${node.team}`;
    if (!window.confirm(`เฉลี่ยเป้าปี ${year} ของ "${label}" (${money(node.targetAmount)}) ลง 12 เดือน?\nยอดรายเดือนเดิมของ node นี้จะถูกทับ`)) return;
    setError("");
    setInfo("");
    const per = Math.floor(node.targetAmount / 12);
    const items = monthsForYear(year).map((m, i) => ({
      period: m,
      periodType: "month",
      team: node.team || null,
      ownerId: node.ownerId || null,
      ownerName: node.ownerName || null,
      targetAmount: i === 11 ? node.targetAmount - per * 11 : per,
    }));
    try {
      const res = await fetch("/api/sales-planning/targets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "เฉลี่ยเป้าไม่สำเร็จ");
      setInfo(`เฉลี่ยเป้าของ "${label}" ลง 12 เดือนแล้ว — สลับไปมุมมอง "รายเดือน" เพื่อปรับแต่ละเดือน`);
    } catch (e2) {
      setError(e2.message || "เฉลี่ยเป้าไม่สำเร็จ");
    }
  };

  const yearOptions = useMemo(() => {
    const cy = Number(thisYear());
    return Array.from({ length: 7 }, (_, i) => String(cy - 3 + i));
  }, []);

  const headerRight = (
    <>
      <div className="segmented" role="tablist" aria-label="ช่วงเวลา">
        <button type="button" className={periodType === "year" ? "active" : ""} aria-pressed={periodType === "year"} onClick={() => setPeriodType("year")}>รายปี</button>
        <button type="button" className={periodType === "month" ? "active" : ""} aria-pressed={periodType === "month"} onClick={() => setPeriodType("month")}>รายเดือน</button>
      </div>
      {periodType === "year" ? (
        <select className="premium-select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="ปี" style={{ width: 104 }}>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      ) : (
        <>
          <select className="premium-select" value={month.slice(0, 4)} onChange={(e) => setMonth(`${e.target.value}-${month.slice(5, 7)}`)} aria-label="ปี" style={{ width: 104 }}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="premium-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="เดือน" style={{ width: 150 }}>
            {monthsForYear(month.slice(0, 4)).map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]} {month.slice(0, 4)}</option>)}
          </select>
        </>
      )}
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
    </>
  );

  const periodLabel = periodType === "year" ? `ปี ${year}` : `${MONTH_LABELS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  return (
    <Workspace
      icon={<Target size={22} />}
      title="แผนงานขาย — วางเป้าหมาย"
      subtitle="เป้าใหญ่ทั้งฝ่าย SA → แบ่งลงทีม (ODM / KA / SV) → แบ่งลง AE รายคน"
      back={{ href: "/sales-planning", label: "กลับไปภาพรวม" }}
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}
        {info && (
          <div className="glass-panel" style={{ padding: "12px 14px", borderColor: "var(--green)", color: "var(--green)" }}>{info}</div>
        )}
        {!canTarget && (
          <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
            เฉพาะ Senior AE / หัวหน้าฝ่ายขาย / admin ตั้งเป้าได้ — หน้านี้แสดงเป้าแบบอ่านอย่างเดียว
          </div>
        )}

        {/* SA-wide anchor */}
        <SaCard
          node={tree.sa}
          periodLabel={periodLabel}
          periodType={periodType}
          showGap={isSuper}
          canEdit={canEditNode(tree.sa)}
          onEdit={() => openEdit(tree.sa)}
          onSplit={() => autoSplit(tree.sa)}
        />

        {/* Team → AE breakdown */}
        <section className="flex flex-col gap-3" aria-busy={loading}>
          {tree.teams.map((t) => (
            <TeamPanel
              key={t.team}
              node={t}
              periodType={periodType}
              canEditTeam={canEditNode(t)}
              onEditTeam={() => openEdit(t)}
              onSplitTeam={() => autoSplit(t)}
              canEditMember={(m) => canEditNode(m)}
              onEditMember={(m) => openEdit(m)}
              onSplitMember={(m) => autoSplit(m)}
            />
          ))}
          {!teamsToShow.length && (
            <div className="glass-panel" style={{ padding: 18, color: "var(--text-3)" }}>ไม่พบทีมที่คุณดูแล</div>
          )}
        </section>
      </div>

      <Modal open={!!editNode} onClose={() => setEditNode(null)} title={editNode?.id ? "แก้ไขเป้าหมาย" : "ตั้งเป้าหมาย"} size="md">
        {editNode && (
          <form onSubmit={saveNode} className="form-grid" aria-busy={submitting} style={{ padding: 18 }}>
            <div style={{ gridColumn: "1 / -1", color: "var(--text-3)", fontSize: 13 }}>
              {editNode.level === "sa" ? "เป้ารวมทั้งฝ่าย SA" : editNode.level === "team" ? `เป้าทีม ${TEAM_LABELS[editNode.team] || editNode.team}` : `เป้ารายบุคคล — ${editNode.ownerName} (${editNode.team})`}
              {" · "}{periodLabel}
            </div>
            <label style={{ gridColumn: "1 / -1" }}>
              ยอดเป้าหมาย (บาท)
              <input type="number" min="0" step="0.01" className="premium-input mono" value={editForm.targetAmount} onChange={(e) => setEditForm({ ...editForm, targetAmount: e.target.value })} required autoFocus />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              หมายเหตุ
              <textarea className="premium-input" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </label>
            <div className="drawer-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="btn" onClick={() => setEditNode(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Workspace>
  );
}

function GapBar({ target, allocated }) {
  if (target <= 0 && allocated <= 0) return null;
  const remaining = target - allocated;
  const over = remaining < 0;
  const done = remaining === 0 && target > 0;
  const color = over ? "var(--red)" : done ? "var(--green)" : "var(--amber)";
  const label = target <= 0 ? "ยังไม่ตั้งเป้ารวม" : over ? `แบ่งเกิน ${money(-remaining)}` : done ? "แบ่งครบพอดี" : `เหลือแบ่ง ${money(remaining)}`;
  const pct = target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
      <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-3)" }}>
        <span>แบ่งแล้ว {money(allocated)}</span>
        <span style={{ marginLeft: "auto" }} />
        <span style={{ color, fontWeight: 700 }}>{label}</span>
      </div>
      <div className="progress">
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AmountButton({ node, canEdit, onEdit, big }) {
  return (
    <button
      type="button"
      className="linklike mono tabular-nums text-left"
      onClick={onEdit}
      disabled={!canEdit}
      title={canEdit ? "คลิกเพื่อแก้ไข" : "ไม่มีสิทธิ์แก้"}
      style={{ fontSize: big ? 30 : 18, fontWeight: 800 }}
    >
      {money(node.targetAmount)}
    </button>
  );
}

function RowActions({ node, canEdit, onEdit, onSplit, periodType }) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-1">
      {periodType === "year" && node.targetAmount > 0 && (
        <button type="button" className="btn icon-only ghost" onClick={onSplit} title="เฉลี่ยลง 12 เดือน" aria-label="เฉลี่ยลง 12 เดือน">
          <Split size={15} aria-hidden="true" />
        </button>
      )}
      <button type="button" className="btn icon-only ghost" onClick={onEdit} title="แก้ไขเป้า" aria-label="แก้ไขเป้า">
        <Pencil size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function SaCard({ node, periodLabel, periodType, showGap, canEdit, onEdit, onSplit }) {
  return (
    <section className="glass-panel" style={{ padding: 18 }}>
      <div className="flex items-start gap-3" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <div className="flex items-center gap-2" style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>
            <CalendarDays size={14} aria-hidden="true" /> เป้ารวมทั้งฝ่าย SA · {periodLabel}
          </div>
          <div style={{ marginTop: 8 }}>
            <AmountButton node={node} canEdit={canEdit} onEdit={onEdit} big />
          </div>
          {node.notes && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: 12 }}>{node.notes}</div>}
        </div>
        <div style={{ marginLeft: "auto" }} />
        <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
          {showGap && <GapBar target={node.targetAmount} allocated={node.allocated} />}
          <RowActions node={node} canEdit={canEdit} onEdit={onEdit} onSplit={onSplit} periodType={periodType} />
        </div>
      </div>
    </section>
  );
}

function TeamPanel({ node, periodType, canEditTeam, onEditTeam, onSplitTeam, canEditMember, onEditMember, onSplitMember }) {
  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 800 }}>{TEAM_LABELS[node.team] || node.team} <span style={{ color: "var(--text-3)", fontWeight: 600, fontSize: 12 }}>({node.team})</span></div>
          <AmountButton node={node} canEdit={canEditTeam} onEdit={onEditTeam} />
        </div>
        <div style={{ marginLeft: "auto" }} />
        <GapBar target={node.targetAmount} allocated={node.allocated} />
        <RowActions node={node} canEdit={canEditTeam} onEdit={onEditTeam} onSplit={onSplitTeam} periodType={periodType} />
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {node.members.map((m) => (
          <div key={m.ownerId} className="flex items-center gap-3" style={{ padding: "8px 10px", borderRadius: 10, background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.ownerName}{m.role === "senior_ae" ? " · หัวหน้า" : m.role === "ac" ? " · AC" : ""}
              </div>
            </div>
            <AmountButton node={m} canEdit={canEditMember(m)} onEdit={() => onEditMember(m)} />
            <RowActions node={m} canEdit={canEditMember(m)} onEdit={() => onEditMember(m)} onSplit={() => onSplitMember(m)} periodType={periodType} />
          </div>
        ))}
        {!node.members.length && (
          <div style={{ color: "var(--text-3)", fontSize: 12, padding: "4px 2px" }}>ยังไม่มีสมาชิก AE ในทีมนี้</div>
        )}
      </div>
    </div>
  );
}
