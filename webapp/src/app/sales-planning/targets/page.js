"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import Link from "next/link";
import { ChevronDown, ChevronRight, Save, Sparkles, Target, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import MoneyInput from "@/components/ui/MoneyInput";
import { useCan, useRole, useTeams } from "@/lib/roleContext";
import { userTeams } from "@/lib/permissions";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES, money, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import { fmtNumber, naText, NA } from "@/lib/format";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";

const TEAM_LABELS = { ODM: "New ODM", KA: "Key Account", SV: "Services" };
const thisYear = () => thisMonth().slice(0, 4);
const compact = (n) => fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nodeKey = (n) => (n.level === "sa" ? "sa" : n.level === "team" ? `team:${n.team}` : `ae:${n.ownerId}`);
const sum = (arr) => arr.reduce((s, v) => s + v, 0);

export default function SalesPlanningTargetsPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const myTeams = useTeams();
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

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async () => {
    const isLatest = startRun();
    setLoading(true);
    setError("");
    try {
      const [targetsRes, users] = await Promise.all([
        fetch(`/api/sales-planning/targets?year=${encodeURIComponent(year)}`),
        cachedFetchJson("/api/pm/assignable-users").catch(() => []),
      ]);
      if (!targetsRes.ok) throw new Error((await targetsRes.json()).error || "โหลด target ไม่สำเร็จ");
      const rows = await targetsRes.json();
      if (!isLatest()) return; // เปลี่ยนปีระหว่างรอ — เป้าที่โชว์ต้องเป็นของปีที่เลือกอยู่
      setTargets(rows);
      setUsers(users || []);
    } catch (e) {
      if (isLatest()) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [year, startRun]);

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

  // คนอยู่หลายทีมได้ ⇒ กางเป้าของทุกทีมที่สังกัด ไม่ใช่แค่ทีมหลัก
  const teamsToShow = useMemo(() => (isSuper ? SALES_TEAMS : myTeams), [isSuper, myTeams]);

  const baseTree = useMemo(() => {
    const teams = teamsToShow.map((t) => {
      const members = users
        .filter((u) => TARGET_OWNER_ROLES.includes(u.role) && userTeams(u).includes(t))
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
        // ชื่อจากบัญชีจริงก่อน — `x.ownerName` ที่ค้างในแถวเป็นชื่อ ณ ตอนวางเป้า
        // (ของจริงบน prod: 12 แถวยังเป็นนามสกุลเดิมของคนที่เปลี่ยนชื่อไปแล้ว)
        const node = buildNode("ae", t, { id, name: still?.name || name });
        node.ghost = still ? `ย้ายไปทีม ${naText(userTeams(still).join(" + "))} แล้ว` : "ออกจากระบบแล้ว";
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

  /* สิทธิ์แก้เป้า = capability `salesplan:target` ล้วน ๆ
     🐞 ของเดิมคืน `isSuper` (รายชื่อ role ที่หน้านี้เดาเอง) ซึ่งวันนี้บังเอิญตรงกับ cap
     พอดีเพราะ cap นี้มีแค่ admin กับ ae_supervisor — วันไหนเปิดให้ senior_ae ผู้ใช้จะ
     ได้ตารางที่ทุกช่องกดไม่ได้ **โดยไม่มีข้อความอธิบาย** (กล่องเตือนโผล่เฉพาะ !canTarget)
     ⚠️ `isSuper` ยังใช้ต่อสำหรับ *ขอบเขตข้อมูล* (เห็นทุกทีม + แถว SA รวมทั้งฝ่าย)
     ซึ่งเป็นคนละเรื่องกับสิทธิ์แก้ — อย่ายุบสองอย่างนี้กลับเป็นตัวเดียวกันอีก */
  const canEditNode = useCallback(() => canTarget, [canTarget]);

  const labelOf = (node) =>
    node.level === "sa" ? "SA รวมทั้งฝ่าย" : node.level === "team" ? `ทีม ${TEAM_LABELS[node.team] || node.team}` : node.ownerName;

  const startEdit = (node, field, current) => {
    if (!canEditNode(node)) return;
    cancelRef.current = false;
    setEditing({ key: nodeKey(node), field });
    setDraft(String(current || ""));
  };

  /* เดือนที่ตั้งไว้ "ไม่เท่ากัน" = มีของให้เสียตอนเกลี่ยทับ
     ⚠️ เทียบด้วยส่วนต่าง max-min > 12 ไม่ใช่ "ค่าไม่ตรงกันเป๊ะ" — การเกลี่ยของระบบเอง
     ทิ้งเศษไว้ที่เดือนสุดท้าย (annual - per*11) ต่างได้ไม่เกิน 11 บาท ถ้าเช็คแบบเป๊ะ
     แถวที่เพิ่งเกลี่ยไปจะโดนถามซ้ำทุกครั้งทั้งที่ไม่มีอะไรให้เสีย
     อ่านจากค่าที่บันทึกแล้วเท่านั้น (serverAmounts) ไม่รวม pending — ของที่ยังไม่บันทึก
     ผู้ใช้เพิ่งพิมพ์เอง ไม่ต้องเตือนซ้ำ */
  const hasUnevenMonths = (node) => {
    const values = node.serverAmounts || [];
    if (values.length !== 12) return false;
    return Math.max(...values) - Math.min(...values) > 12;
  };

  // Commit only stages the edit into `pending` (no API call). The big Save button
  // flushes everything at once. Enter triggers blur → single commit path.
  const commit = async (node, field) => {
    const wasCancel = cancelRef.current;
    setEditing(null);
    if (wasCancel) return;
    const amount = Math.max(0, Number(draft) || 0);
    /* ⚠️ กรอก "รวมทั้งปี" = เกลี่ยเท่ากัน 12 เดือน **ทับของเดิมทั้งแถว** — ถ้าแถวนี้เคย
       ตั้งรายเดือนไม่เท่ากันไว้ (เดือนพีค/เดือนปิดโรงงาน) ค่านั้นจะหายทันที
       ของเดิมทับเงียบ ๆ ไม่มีอะไรบอก (มติผู้ใช้ 2026-08-05: ให้เตือนก่อน)
       เตือนเฉพาะตอนที่ "มีอะไรให้เสีย" จริง — เดือนที่ตั้งไว้ไม่เท่ากัน · ถ้าเท่ากันอยู่แล้ว
       หรือยังว่าง การเกลี่ยไม่ได้ทำให้ข้อมูลไหนหาย จึงไม่ต้องถาม */
    if (field === "total" && hasUnevenMonths(node)
      && !(await confirmAction("แถวนี้ตั้งเป้ารายเดือนไม่เท่ากันไว้ — กรอกยอดทั้งปีจะเกลี่ยเท่ากันทับทั้ง 12 เดือน ยืนยันไหม?"))) {
      return;
    }
    setPending((p) => ({ ...p, [`${nodeKey(node)}|${field}`]: amount }));
  };

  const pendingCount = Object.keys(pending).length;

  const discard = () => {
    setPending({});
    setInfo("");
  };

  const guardPending = async (proceed) => {
    if (pendingCount && !(await confirmAction("มีการแก้ไขที่ยังไม่บันทึก จะทิ้งการแก้ไขไหม?"))) return;
    setPending({});
    proceed();
  };

  // แถวเป้าของโหนดหนึ่ง ๆ ในรูปแบบที่ API รับ — ใช้ร่วมทั้งการเกลี่ยทั้งปีและแก้รายเดือน
  const itemFor = (node, period, targetAmount) => ({
    period,
    periodType: "month",
    team: node.team || null,
    ownerId: node.ownerId || null,
    ownerName: node.ownerName || null,
    targetAmount,
  });

  // เกลี่ยยอดทั้งปีเท่ากัน 12 เดือน (เศษไปลงเดือนสุดท้าย) → 12 แถวของโหนดนั้น
  const yearItems = (node, annual) => {
    const per = Math.floor(annual / 12);
    return monthsForYear(year).map((m, i) => itemFor(node, m, i === 11 ? annual - per * 11 : per));
  };

  /* ยิงผ่าน bulk (upsert ตาม period/team/ownerId) ไม่ตัดสินใจ POST/PATCH จาก snapshot
     เดิม — กันเคส "กรอกเป้าปี (สร้าง 12 แถวไปแล้ว) + แก้เดือนทับ" ยิง POST ซ้ำชน unique 409.

     ⚡ ส่งเป็นก้อนละ ≤24 แถว (เพดานของ API) — ของเดิมยิงทีละแถว แก้ 10 ช่อง = 10 คำขอ
     เรียงกัน และถ้าพังกลางทางจะบันทึกไปแล้วบางส่วนโดยบอกแค่ error เดียว
     ⚠️ ลำดับสำคัญ: ยอดทั้งปีต้องไปก่อนเสมอ เพราะมันเขียนทับทั้ง 12 เดือน — ถ้าปนก้อน
     เดียวกับการแก้รายเดือนของโหนดเดียวกัน ค่าที่แก้ทีหลังจะถูกค่าเฉลี่ยทับ */
  const BULK_LIMIT = 24;
  const postItems = async (items) => {
    for (let i = 0; i < items.length; i += BULK_LIMIT) {
      const res = await fetch("/api/sales-planning/targets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.slice(i, i + BULK_LIMIT) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกเป้าไม่สำเร็จ");
    }
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
      const totalItems = [];
      const monthItems = [];
      for (const [key, amount] of entries) {
        const [nk, field] = key.split("|");
        const node = nodeMap.get(nk);
        if (!node) continue;
        if (field === "total") totalItems.push(...yearItems(node, amount));
        else monthItems.push(itemFor(node, `${year}-${String(Number(field.slice(1)) + 1).padStart(2, "0")}`, amount));
      }
      await postItems(totalItems);
      await postItems(monthItems);
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
        <>
          {/* ทางเข้าหน้ากรอกยอดย้อนหลังอยู่ที่นี่ที่เดียว — แท็บผลงานขายเป็นหน้าอ่านผล */}
          <Link href="/sa/targets/history" className="btn ghost" title="กรอกยอดขายจริงของช่วงที่ยังไม่ได้ใช้ระบบ (ปีก่อน ๆ และเดือนต้นปีนี้)">
            ยอดขายย้อนหลัง
          </Link>
          <Link href="/sa/targets/plan" className={`btn btn-primary ${styles.saveBarLabel}`}>
            <Sparkles size={16} aria-hidden="true" /> วางแผนเป้าใหม่
          </Link>
        </>
      )}
      <Select
        className={styles.yearSelect}
        value={year}
        onChange={(e) => { const y = e.target.value; guardPending(() => setYear(y)); }}
        aria-label="ปี"
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
    <tr key={nodeKey(node)} className={`premium-row ${extra.rowClass || ""}`.trim()}>
      <td className={`fz-c1 ${styles.nameCell}`} data-indent={indent}>
        <div className={styles.nameInner}>
          {extra.collapsible && (
            <button
              type="button"
              className={`btn icon-only ghost ${styles.toggleBtn}`}
              onClick={extra.onToggle}
              aria-label={extra.collapsed ? "ขยายทีม" : "ย่อทีม"}
              aria-expanded={!extra.collapsed}
              title={extra.collapsed ? "ขยายทีม" : "ย่อทีม"}
            >
              {extra.collapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </button>
          )}
          <div className={`${styles.rowLabel} ${extra.bold ? styles.rowLabelBold : ""}`.trim()}>{extra.label ?? labelOf(node)}</div>
        </div>
        {extra.gap && <GapNote target={node.annual} allocated={node.allocated} allocLabel={extra.allocLabel} />}
        {node.role === "senior_ae" && <div className={styles.subNote}>หัวหน้าทีม</div>}
        {node.ghost && <div className={styles.ghostNote}>{node.ghost} — เป้ายังนับเข้ายอดทีม เกลี่ยออก/ปรับเป็น 0 ได้</div>}
      </td>
      {node.monthAmounts.map((amt, i) => (
        <td key={i} className={`num ${styles.monthCell}`}>
          <NumCell {...cellProps(node, `m${i}`, amt)} display={amt ? compact(amt) : NA} />
        </td>
      ))}
      <td className={`fz-cr num ${styles.totalCell}`}>
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
      <div className={`flex flex-col gap-4 ${pendingCount ? styles.pageWithBar : ""}`.trim()}>
        {error && <div className={`glass-panel ${styles.errorBox}`} role="alert">{error}</div>}
        {info && <div className={`glass-panel ${styles.infoBox}`}>{info}</div>}
        {!canTarget && (
          <div className={`glass-panel ${styles.readOnlyBox}`}>
            บัญชีของคุณไม่มีสิทธิ์ตั้งเป้า — หน้านี้แสดงเป้าแบบอ่านอย่างเดียว
          </div>
        )}

        <div className={`glass-panel ${styles.tableCard}`} aria-busy={loading}>
          <div className="fz-box">
            <TableScroll surface="embedded" family="editable"><table className="fz-table">
              <thead>
                <tr>
                  <th className={`fz-c1 ${styles.nameCell}`}>ทีม / รายบุคคล</th>
                  {MONTH_LABELS.map((m) => <th key={m} className={`num ${styles.monthCell}`}>{m}</th>)}
                  <th className={`fz-cr num ${styles.totalCell}`}>รวมทั้งปี</th>
                </tr>
              </thead>
              <tbody>
                {isSuper && renderRow(view.sa, 0, { bold: true, gap: true, allocLabel: "รวมเป้าทีม", rowClass: styles.rowSa })}
                {view.teams.map((t) => {
                  const isCollapsed = !!collapsed[t.team];
                  return (
                    <FragmentRows key={t.team}>
                      {renderRow(t, isSuper ? 1 : 0, {
                        bold: true, gap: true, allocLabel: "รวมราย AE",
                        label: `${TEAM_LABELS[t.team] || t.team} (${t.team})`,
                        collapsible: true, collapsed: isCollapsed, onToggle: () => toggleTeam(t.team),
                        rowClass: styles.rowTeam,
                      })}
                      {!isCollapsed && t.members.map((m) => renderRow(m, isSuper ? 2 : 1))}
                      {!isCollapsed && !t.members.length && (
                        <tr><td colSpan={14} className={styles.emptyTeam}>ยังไม่มี AE ในทีมนี้</td></tr>
                      )}
                    </FragmentRows>
                  );
                })}
                {!teamsToShow.length && (
                  <tr><td colSpan={14} className={styles.emptyTable}>ไม่พบทีมที่คุณดูแล</td></tr>
                )}
              </tbody>
              {teamsToShow.length > 0 && (
                <tfoot>
                  {/* สองแถวรวมตรึงซ้อนกันท้ายตาราง — ความสูง/ระยะตรึง/พื้น อยู่ใน
                      page.module.css (.footRow / .footTop / .footBottom) แถวบนต้องรู้
                      ความสูงของแถวล่างจึงตรึงที่ 34px พอดี */}
                  {[
                    { label: "รวมเป้าทีมที่ตั้ง", months: grandMonths, total: grandTotal, cls: styles.footTop },
                    { label: "รวมราย AE (ทุกทีม)", months: grandMemberMonths, total: grandMemberTotal, cls: styles.footBottom },
                  ].map((r) => (
                    <tr key={r.label} className={`${styles.footRow} ${r.cls}`}>
                      <td className={`fz-c1 fz-foot ${styles.nameCell}`}>{r.label}</td>
                      {r.months.map((v, i) => (
                        <td key={i} className={`num mono tabular-nums fz-foot ${styles.monthCell} ${v ? "" : styles.footZero}`}>
                          {v ? compact(v) : NA}
                        </td>
                      ))}
                      <td className={`fz-cr num mono tabular-nums fz-foot ${styles.totalCell}`}>
                        {money(r.total)}
                      </td>
                    </tr>
                  ))}
                </tfoot>
              )}
            </table></TableScroll>
          </div>
        </div>

        <div className={styles.hint}>
          คลิกที่ตัวเลขเพื่อแก้ · Enter/Tab เพื่อยืนยันช่อง · Esc ยกเลิกช่อง · ช่องที่แก้จะไฮไลต์ไว้จนกด “บันทึก” · สถานะ “เหลือแบ่ง/เกิน” เป็นการเตือน ไม่บังคับให้ผลรวมเท่ากัน
        </div>
      </div>

      {/* Big confirm-save bar — appears only when there are unsaved edits. */}
      {canTarget && pendingCount > 0 && (
        <div className={`glass-panel form-action-bar is-page ${styles.saveBar}`} role="region" aria-label="ยืนยันการบันทึก">
          <span className={styles.saveBarLabel}>
            มีการแก้ไข {pendingCount} รายการ ที่ยังไม่บันทึก
          </span>
          <div className={styles.saveBarActions}>
            <button type="button" className="btn" onClick={discard} disabled={saving}>
              <X size={16} aria-hidden="true" /> ยกเลิก
            </button>
            <button type="button" className={`btn btn-primary ${styles.saveBtn}`} onClick={saveAll} disabled={saving}>
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
        className={`mono ${styles.numInput} ${bold ? styles.numInputBold : ""}`.trim()}
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
      className={[
        "linklike mono tabular-nums",
        styles.numBtn,
        bold ? styles.numBtnBold : "",
        dirty ? styles.numBtnDirty : "",
      ].filter(Boolean).join(" ")}
      disabled={!canEdit}
      onClick={onStart}
      title={canEdit ? "คลิกเพื่อแก้ไข" : undefined}
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
  const tone = over ? styles.gapOver : done ? styles.gapDone : styles.gapPending;
  const text = target <= 0 ? "ยังไม่ตั้งเป้ารวม" : over ? `เกินเป้า ${money(-remaining)}` : done ? "ครบพอดี" : `เหลืออีก ${money(remaining)}`;
  return (
    <div className={`${styles.gapNote} ${tone}`}>
      {allocLabel} {money(allocated)} · {text}
    </div>
  );
}
