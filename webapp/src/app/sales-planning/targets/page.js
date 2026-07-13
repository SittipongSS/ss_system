"use client";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Save, Sparkles, Target, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import MoneyInput from "@/components/ui/MoneyInput";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES, money, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";

const TEAM_LABELS = { ODM: "New ODM", KA: "Key Account", SV: "Services" };
const thisYear = () => thisMonth().slice(0, 4);
const compact = (n) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
const nodeKey = (n) => (n.level === "sa" ? "sa" : n.level === "team" ? `team:${n.team}` : `ae:${n.ownerId}`);
const sum = (arr) => arr.reduce((s, v) => s + v, 0);

export default function SalesPlanningTargetsPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const team = useTeam();
  const isSuper = role === "admin" || role === "ae_supervisor";

  const [year, setYear] = useState(thisYear());
  const [targets, setTargets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [editing, setEditing] = useState(null); // { key, field } field = 'total' | 'm0'..'m11'
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState({}); // `${nodeKey}|total` | `${nodeKey}|m<i>` -> amount (unsaved)
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState({}); // teamKey -> true (default: all expanded)
  const cancelRef = useRef(false);

  const toggleTeam = (t) => setCollapsed((c) => ({ ...c, [t]: !c[t] }));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [targetsRes, usersRes] = await Promise.all([
        fetch(`/api/sales-planning/targets?year=${encodeURIComponent(year)}`),
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
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  // 12 monthly rows (or null) for one org node in the selected year.
  const rowsFor = useCallback(
    (t, ownerId) => {
      const arr = Array(12).fill(null);
      for (const x of targets) {
        if (x.periodType !== "month") continue;
        if ((x.team || null) !== (t || null)) continue;
        if ((x.ownerId || null) !== (ownerId || null)) continue;
        const mi = Number(String(x.period).slice(5, 7)) - 1;
        if (mi >= 0 && mi < 12) arr[mi] = x;
      }
      return arr;
    },
    [targets],
  );

  const buildNode = useCallback(
    (level, t, u) => {
      const months = rowsFor(t, u?.id || null);
      return {
        level,
        team: t,
        ownerId: u?.id || null,
        ownerName: u?.name || null,
        role: u?.role || null,
        months, // server rows (for save: find existing id)
        serverAmounts: months.map((r) => Number(r?.targetAmount || 0)),
      };
    },
    [rowsFor],
  );

  const teamsToShow = useMemo(() => (isSuper ? SALES_TEAMS : team ? [team] : []), [isSuper, team]);

  const baseTree = useMemo(() => {
    const teams = teamsToShow.map((t) => {
      const members = users
        .filter((u) => TARGET_OWNER_ROLES.includes(u.role) && u.team === t)
        .map((u) => buildNode("ae", t, u));
      // เป้าค้างของคนที่ไม่อยู่ในทีมแล้ว (ลาออก/ย้ายทีม/เปลี่ยนบทบาท) — target ผูกทีม
      // ตอนสร้าง จึงยังถูกบวกเข้ายอดทีมในภาพรวมอยู่ ต้องโชว์แถวให้เห็น + เกลี่ยออกได้
      // ไม่งั้นกลายเป็น "เป้าผี" ที่มองไม่เห็นแต่ยังนับยอด. โชว์เฉพาะคนที่มีเป้า > 0 ในปีนี้.
      const memberIds = new Set(members.map((m) => m.ownerId));
      const ghostOwners = new Map();
      for (const x of targets) {
        if (x.periodType !== "month" || (x.team || null) !== t || !x.ownerId) continue;
        if (memberIds.has(x.ownerId) || !Number(x.targetAmount)) continue;
        if (!ghostOwners.has(x.ownerId)) ghostOwners.set(x.ownerId, x.ownerName || x.ownerId);
      }
      const ghosts = [...ghostOwners].map(([id, name]) => {
        const still = users.find((u) => u.id === id);
        const node = buildNode("ae", t, { id, name });
        node.ghost = still ? `ย้ายไปทีม ${still.team || "-"} แล้ว` : "ออกจากระบบแล้ว";
        return node;
      });
      const node = buildNode("team", t, null);
      node.members = [...members, ...ghosts];
      return node;
    });
    return { sa: buildNode("sa", null, null), teams };
  }, [teamsToShow, users, targets, buildNode]);

  // Overlay unsaved edits on top of server data so the grid shows a live preview
  // (a pending yearly total redistributes to 12 months; pending months override).
  const effMonths = useCallback(
    (node) => {
      const nk = nodeKey(node);
      let arr = node.serverAmounts.slice();
      const totalKey = `${nk}|total`;
      if (totalKey in pending) {
        const annual = pending[totalKey];
        const per = Math.floor(annual / 12);
        arr = arr.map((_, i) => (i === 11 ? annual - per * 11 : per));
      }
      for (let i = 0; i < 12; i++) {
        const k = `${nk}|m${i}`;
        if (k in pending) arr[i] = pending[k];
      }
      return arr;
    },
    [pending],
  );

  const view = useMemo(() => {
    const decorate = (node) => {
      const monthAmounts = effMonths(node);
      return { ...node, monthAmounts, annual: sum(monthAmounts) };
    };
    const teams = baseTree.teams.map((t) => {
      const members = t.members.map(decorate);
      const tv = decorate(t);
      // Bottom-up roll-up of the team's AE targets (per month + annual), shown
      // alongside the (independently editable) team target.
      const memberMonths = Array(12).fill(0);
      members.forEach((m) => m.monthAmounts.forEach((v, i) => { memberMonths[i] += v; }));
      return { ...tv, members, memberMonths, allocated: sum(memberMonths) };
    });
    const sa = { ...decorate(baseTree.sa), allocated: sum(teams.map((t) => t.annual)) };
    return { sa, teams };
  }, [baseTree, effMonths]);

  // Footer row 1: sum of the (editable) team-level targets.
  const grandMonths = useMemo(() => {
    const arr = Array(12).fill(0);
    view.teams.forEach((t) => t.monthAmounts.forEach((v, i) => { arr[i] += v; }));
    return arr;
  }, [view]);
  const grandTotal = sum(grandMonths);

  // Footer row 2: bottom-up sum of every AE target across all teams — the true
  // total being planned when targets are entered per person.
  const grandMemberMonths = useMemo(() => {
    const arr = Array(12).fill(0);
    view.teams.forEach((t) => t.memberMonths.forEach((v, i) => { arr[i] += v; }));
    return arr;
  }, [view]);
  const grandMemberTotal = sum(grandMemberMonths);

  const nodeMap = useMemo(() => {
    const m = new Map();
    m.set("sa", baseTree.sa);
    baseTree.teams.forEach((t) => {
      m.set(`team:${t.team}`, t);
      t.members.forEach((mem) => m.set(`ae:${mem.ownerId}`, mem));
    });
    return m;
  }, [baseTree]);

  const canEditNode = useCallback(
    (node) => {
      if (!canTarget) return false;
      if (node.level === "sa") return isSuper;
      return isSuper;
    },
    [canTarget, isSuper],
  );

  const labelOf = (node) =>
    node.level === "sa" ? "SA รวมทั้งฝ่าย" : node.level === "team" ? `ทีม ${TEAM_LABELS[node.team] || node.team}` : node.ownerName;

  const startEdit = (node, field, current) => {
    if (!canEditNode(node)) return;
    cancelRef.current = false;
    setEditing({ key: nodeKey(node), field });
    setDraft(String(current || ""));
  };

  // Commit only stages the edit into `pending` (no API call). The big Save button
  // flushes everything at once. Enter triggers blur → single commit path.
  const commit = (node, field) => {
    const wasCancel = cancelRef.current;
    setEditing(null);
    if (wasCancel) return;
    const amount = Math.max(0, Number(draft) || 0);
    setPending((p) => ({ ...p, [`${nodeKey(node)}|${field}`]: amount }));
  };

  const pendingCount = Object.keys(pending).length;

  const discard = () => {
    setPending({});
    setInfo("");
  };

  const guardPending = (proceed) => {
    if (pendingCount && !window.confirm("มีการแก้ไขที่ยังไม่บันทึก จะทิ้งการแก้ไขไหม?")) return;
    setPending({});
    proceed();
  };

  // Distribute a yearly amount evenly across a node's 12 months (last month takes
  // the rounding remainder), upserted in one bulk call.
  const distributeYear = async (node, annual) => {
    const per = Math.floor(annual / 12);
    const items = monthsForYear(year).map((m, i) => ({
      period: m,
      periodType: "month",
      team: node.team || null,
      ownerId: node.ownerId || null,
      ownerName: node.ownerName || null,
      targetAmount: i === 11 ? annual - per * 11 : per,
    }));
    const res = await fetch("/api/sales-planning/targets/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "เฉลี่ยเป้าไม่สำเร็จ");
  };

  // ยิงผ่าน bulk (upsert ตาม period/team/ownerId) ไม่ตัดสินใจ POST/PATCH จาก snapshot
  // เดิม — กันเคส "กรอกเป้าปี (สร้าง 12 แถวไปแล้ว) + แก้เดือนทับ" ยิง POST ซ้ำชน unique 409.
  const saveMonth = async (node, mi, amount) => {
    const res = await fetch("/api/sales-planning/targets/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          period: `${year}-${String(mi + 1).padStart(2, "0")}`,
          periodType: "month",
          team: node.team || null,
          ownerId: node.ownerId || null,
          ownerName: node.ownerName || null,
          targetAmount: amount,
        }],
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกเดือนไม่สำเร็จ");
  };

  // Flush all staged edits: yearly totals first (they redistribute 12 months),
  // then individual month overrides on top.
  const saveAll = async () => {
    if (!pendingCount || saving) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const entries = Object.entries(pending);
      const totals = entries.filter(([k]) => k.endsWith("|total"));
      const months = entries.filter(([k]) => !k.endsWith("|total"));
      for (const [k, amt] of totals) {
        const node = nodeMap.get(k.split("|")[0]);
        if (node) await distributeYear(node, amt);
      }
      for (const [k, amt] of months) {
        const [nk, f] = k.split("|");
        const node = nodeMap.get(nk);
        if (node) await saveMonth(node, Number(f.slice(1)), amt);
      }
      const n = entries.length;
      setPending({});
      await load();
      setInfo(`บันทึกแล้ว ${n} รายการ`);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = useMemo(() => {
    const cy = Number(thisYear());
    return Array.from({ length: 7 }, (_, i) => String(cy - 3 + i));
  }, []);

  const headerRight = (
    <>
      {isSuper && canTarget && (
        <Link href="/sa/targets/plan" className="btn btn-primary" style={{ fontWeight: 700 }}>
          <Sparkles size={16} aria-hidden="true" /> วางแผนเป้าใหม่
        </Link>
      )}
      <Select
        className="premium-select"
        value={year}
        onChange={(e) => { const y = e.target.value; guardPending(() => setYear(y)); }}
        aria-label="ปี"
        style={{ width: 110 }}
      >
        {yearOptions.map((y) => <option key={y} value={y}>ปี {y}</option>)}
      </Select>
    </>
  );

  const isDirty = (node, field) => {
    const nk = nodeKey(node);
    if (field === "total") return Object.keys(pending).some((k) => k.startsWith(`${nk}|`));
    return `${nk}|${field}` in pending || `${nk}|total` in pending;
  };

  const cellProps = (node, field, current) => ({
    editing: editing?.key === nodeKey(node) && editing?.field === field,
    canEdit: canEditNode(node),
    dirty: isDirty(node, field),
    draft,
    setDraft,
    onStart: () => startEdit(node, field, current),
    onCommit: () => commit(node, field),
    onCancel: () => { cancelRef.current = true; },
  });

  const renderRow = (node, indent, extra = {}) => (
    <tr key={nodeKey(node)} className="premium-row" style={{ background: extra.bg }}>
      <td className="fz-c1" style={{ background: extra.stickyBg || "var(--bg)", paddingLeft: 10 + indent * 16, minWidth: 210 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {extra.collapsible && (
            <button
              type="button"
              className="btn icon-only ghost"
              onClick={extra.onToggle}
              aria-label={extra.collapsed ? "ขยายทีม" : "ย่อทีม"}
              aria-expanded={!extra.collapsed}
              title={extra.collapsed ? "ขยายทีม" : "ย่อทีม"}
              style={{ padding: 2, minWidth: 0, height: "auto" }}
            >
              {extra.collapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </button>
          )}
          <div style={{ fontWeight: extra.bold ? 800 : 500, whiteSpace: "nowrap" }}>{extra.label ?? labelOf(node)}</div>
        </div>
        {extra.gap && <GapNote target={node.annual} allocated={node.allocated} allocLabel={extra.allocLabel} />}
        {node.role === "senior_ae" && <div style={{ fontSize: 11, color: "var(--text-3)" }}>หัวหน้าทีม</div>}
        {node.ghost && <div style={{ fontSize: 11, color: "var(--amber)" }}>{node.ghost} — เป้ายังนับเข้ายอดทีม เกลี่ยออก/ปรับเป็น 0 ได้</div>}
      </td>
      {node.monthAmounts.map((amt, i) => (
        <td key={i} className="num" style={{ minWidth: 76, padding: "4px 6px" }}>
          <NumCell {...cellProps(node, `m${i}`, amt)} display={amt ? compact(amt) : "–"} />
        </td>
      ))}
      <td className="fz-cr num" style={{ minWidth: 130, padding: "4px 8px", background: extra.stickyBg || "var(--bg)" }}>
        <NumCell {...cellProps(node, "total", node.annual)} display={money(node.annual)} bold />
      </td>
    </tr>
  );

  return (
    <Workspace
      icon={<Target size={22} />}
      title="บริหารงานขาย — วางเป้าหมาย"
      subtitle="กรอกเป้าทั้งปีในคอลัมน์ขวาสุด ระบบเฉลี่ยลง 12 เดือนให้อัตโนมัติ แล้วกด “บันทึก” เพื่อยืนยัน"
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-4" style={{ paddingBottom: pendingCount ? 90 : 0 }}>
        {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>}
        {info && <div className="glass-panel" style={{ padding: "12px 14px", borderColor: "var(--green)", color: "var(--green)" }}>{info}</div>}
        {!canTarget && (
          <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
            เฉพาะ AE Supervisor / admin ตั้งเป้าได้ — หน้านี้แสดงเป้าแบบอ่านอย่างเดียว
          </div>
        )}

        <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }} aria-busy={loading}>
          <div className="fz-box">
            <table className="fz-table premium-glass-table w-full text-sm">
              <thead>
                <tr>
                  <th className="fz-c1" style={{ background: "var(--bg)", textAlign: "left", minWidth: 210 }}>ทีม / รายบุคคล</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 76 }}>{m}</th>)}
                  <th className="fz-cr num" style={{ background: "var(--bg)", minWidth: 130 }}>รวมทั้งปี</th>
                </tr>
              </thead>
              <tbody>
                {isSuper && renderRow(view.sa, 0, { bold: true, gap: true, allocLabel: "รวมเป้าทีม", stickyBg: "color-mix(in srgb, var(--accent) 10%, var(--bg))", bg: "color-mix(in srgb, var(--accent) 5%, transparent)" })}
                {view.teams.map((t) => {
                  const isCollapsed = !!collapsed[t.team];
                  return (
                    <FragmentRows key={t.team}>
                      {renderRow(t, isSuper ? 1 : 0, {
                        bold: true, gap: true, allocLabel: "รวมราย AE",
                        label: `${TEAM_LABELS[t.team] || t.team} (${t.team})`,
                        collapsible: true, collapsed: isCollapsed, onToggle: () => toggleTeam(t.team),
                        stickyBg: "color-mix(in srgb, var(--text) 5%, var(--bg))", bg: "color-mix(in srgb, var(--text) 3%, transparent)",
                      })}
                      {!isCollapsed && t.members.map((m) => renderRow(m, isSuper ? 2 : 1))}
                      {!isCollapsed && !t.members.length && (
                        <tr><td colSpan={14} style={{ paddingLeft: 40, color: "var(--text-3)", fontSize: 12 }}>ยังไม่มี AE ในทีมนี้</td></tr>
                      )}
                    </FragmentRows>
                  );
                })}
                {!teamsToShow.length && (
                  <tr><td colSpan={14} style={{ padding: 18, color: "var(--text-3)" }}>ไม่พบทีมที่คุณดูแล</td></tr>
                )}
              </tbody>
              {teamsToShow.length > 0 && (
                <tfoot>
                  {(() => {
                    const FOOT_H = 34; // fixed row height so the two stacked sticky rows line up
                    const rows = [
                      { label: "รวมเป้าทีมที่ตั้ง", months: grandMonths, total: grandTotal, accent: 12, top: true },
                      { label: "รวมราย AE (ทุกทีม)", months: grandMemberMonths, total: grandMemberTotal, accent: 20, top: false },
                    ];
                    return rows.map((r, ri) => {
                      const bg = `color-mix(in srgb, var(--accent) ${r.accent}%, var(--bg))`;
                      const border = r.top ? "2px solid var(--border)" : "1px solid var(--border)";
                      const bottom = (rows.length - 1 - ri) * FOOT_H;
                      const cell = { background: bg, borderTop: border, height: FOOT_H, bottom };
                      return (
                        <tr key={r.label} style={{ fontWeight: 800 }}>
                          <td className="fz-c1 fz-foot" style={{ ...cell, paddingLeft: 10, minWidth: 210 }}>{r.label}</td>
                          {r.months.map((v, i) => (
                            <td key={i} className="num mono tabular-nums fz-foot" style={{ ...cell, minWidth: 76, padding: "0 6px", color: v ? "var(--text)" : "var(--text-3)" }}>
                              {v ? compact(v) : "–"}
                            </td>
                          ))}
                          <td className="fz-cr num mono tabular-nums fz-foot" style={{ ...cell, minWidth: 130, padding: "0 8px" }}>
                            {money(r.total)}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          คลิกที่ตัวเลขเพื่อแก้ · Enter/Tab เพื่อยืนยันช่อง · Esc ยกเลิกช่อง · ช่องที่แก้จะไฮไลต์ไว้จนกด “บันทึก” · สถานะ “เหลือแบ่ง/เกิน” เป็นการเตือน ไม่บังคับให้ผลรวมเท่ากัน
        </div>
      </div>

      {/* Big confirm-save bar — appears only when there are unsaved edits. */}
      {canTarget && pendingCount > 0 && (
        <div className="glass-panel form-action-bar page" role="region" aria-label="ยืนยันการบันทึก"
          style={{ borderColor: "var(--amber)" }}>
          <span style={{ fontWeight: 700 }}>
            มีการแก้ไข {pendingCount} รายการ ที่ยังไม่บันทึก
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" className="btn" onClick={discard} disabled={saving}>
              <X size={16} aria-hidden="true" /> ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving}
              style={{ fontSize: 16, fontWeight: 800, padding: "12px 28px", minWidth: 200 }}>
              <Save size={18} aria-hidden="true" /> {saving ? "กำลังบันทึก..." : "บันทึกเป้าหมาย"}
            </button>
          </div>
        </div>
      )}
    </Workspace>
  );
}

function FragmentRows({ children }) {
  return <>{children}</>;
}

function NumCell({ editing, canEdit, dirty, draft, setDraft, onStart, onCommit, onCancel, display, bold }) {
  if (editing) {
    return (
      <MoneyInput
        autoFocus
        className="mono"
        style={{ width: "100%", textAlign: "right", padding: "4px 6px", fontWeight: bold ? 800 : 500 }}
        value={draft}
        onChange={(value) => setDraft(value ?? "")}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") { onCancel(); e.currentTarget.blur(); }
        }}
        onBlur={onCommit}
      />
    );
  }
  return (
    <button
      type="button"
      className="linklike mono tabular-nums"
      disabled={!canEdit}
      onClick={onStart}
      title={canEdit ? "คลิกเพื่อแก้ไข" : undefined}
      style={{
        width: "100%",
        textAlign: "right",
        fontWeight: bold ? 800 : 500,
        color: dirty ? "var(--amber)" : bold ? "var(--text)" : "var(--text-2)",
        background: dirty ? "color-mix(in srgb, var(--amber) 16%, transparent)" : "transparent",
        borderRadius: 6,
        padding: "2px 4px",
        outline: dirty ? "1px solid color-mix(in srgb, var(--amber) 45%, transparent)" : "none",
      }}
    >
      {display}
    </button>
  );
}

function GapNote({ target, allocated, allocLabel = "แบ่งแล้ว" }) {
  if (target <= 0 && allocated <= 0) return null;
  const remaining = target - allocated;
  const over = remaining < 0;
  const done = remaining === 0 && target > 0;
  const color = over ? "var(--red)" : done ? "var(--green)" : "var(--amber)";
  const text = target <= 0 ? "ยังไม่ตั้งเป้ารวม" : over ? `เกินเป้า ${money(-remaining)}` : done ? "ครบพอดี" : `เหลืออีก ${money(remaining)}`;
  return (
    <div style={{ fontSize: 11, color, fontWeight: 600, whiteSpace: "nowrap" }}>
      {allocLabel} {money(allocated)} · {text}
    </div>
  );
}
