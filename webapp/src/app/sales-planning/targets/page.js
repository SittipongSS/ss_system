"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Save, Target, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Workspace from "@/components/ui/Workspace";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { MonthPicker, SALES_TEAMS, TARGET_OWNER_ROLES, initialTargetForm, money, thisMonth } from "@/components/salesPlanning/ui";

export default function SalesPlanningTargetsPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const team = useTeam();
  const isSuper = role === "admin" || role === "ae_supervisor";
  const [month, setMonth] = useState(thisMonth());
  const [allMonths, setAllMonths] = useState(false);
  const [targets, setTargets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetModal, setTargetModal] = useState(false);
  const [targetForm, setTargetForm] = useState({ ...initialTargetForm, targetMonth: thisMonth(), team: team || "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [targetsRes, usersRes] = await Promise.all([
        fetch(allMonths ? "/api/sales-planning/targets" : `/api/sales-planning/targets?month=${encodeURIComponent(month)}`),
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
  }, [month, allMonths]);

  useEffect(() => {
    load();
  }, [load]);

  // Owner picker: SA users on the selected team (super picks the team; senior_ae
  // is locked to their own team).
  const ownerOptions = useMemo(() => {
    const scopeTeam = isSuper ? targetForm.team : team;
    return users.filter((u) => TARGET_OWNER_ROLES.includes(u.role) && (!scopeTeam || u.team === scopeTeam));
  }, [users, isSuper, targetForm.team, team]);

  // Team members (senior view) without a per-person target this month.
  const missingTargetUsers = useMemo(() => {
    if (isSuper || !team) return [];
    const owned = new Set(targets.filter((tg) => tg.ownerId).map((tg) => tg.ownerId));
    return users.filter((u) => TARGET_OWNER_ROLES.includes(u.role) && u.team === team && !owned.has(u.id));
  }, [users, targets, isSuper, team]);

  const openNewTarget = () => {
    setTargetForm({ ...initialTargetForm, targetMonth: month, team: team || "" });
    setTargetModal(true);
  };

  const openTargetForUser = (u) => {
    setTargetForm({ ...initialTargetForm, targetMonth: month, team: u.team || team || "", ownerId: u.id, ownerName: u.name });
    setTargetModal(true);
  };

  const openEditTarget = (target) => {
    setTargetForm({
      id: target.id,
      targetMonth: target.targetMonth || month,
      team: target.team || "",
      ownerId: target.ownerId || "",
      ownerName: target.ownerName || "",
      targetAmount: target.targetAmount ?? "",
      notes: target.notes || "",
    });
    setTargetModal(true);
  };

  const saveTarget = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const selectedOwner = users.find((u) => u.id === targetForm.ownerId);
    const payload = {
      targetMonth: targetForm.targetMonth,
      team: isSuper ? targetForm.team : team || null,
      ownerId: targetForm.ownerId || null,
      ownerName: targetForm.ownerId ? selectedOwner?.name || targetForm.ownerName || null : null,
      targetAmount: targetForm.targetAmount,
      notes: targetForm.notes,
    };
    try {
      const res = await fetch(targetForm.id ? `/api/sales-planning/targets/${targetForm.id}` : "/api/sales-planning/targets", {
        method: targetForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "บันทึก target ไม่สำเร็จ");
      setTargetModal(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึก target ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTarget = async (target) => {
    if (!window.confirm(`ลบ target ${target.targetMonth}?`)) return;
    setError("");
    const res = await fetch(`/api/sales-planning/targets/${target.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "ลบ target ไม่สำเร็จ");
    await load();
  };

  const headerRight = (
    <>
      <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
      {canTarget && (
        <button type="button" className="btn btn-primary" onClick={openNewTarget}>
          <Plus size={15} aria-hidden="true" /> เพิ่ม target
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<Target size={22} />}
      title="แผนงานขาย — เป้าหมาย"
      subtitle="ตั้งเป้ารายเดือน: ระดับทีม และรายบุคคล (SA)"
      back={{ href: "/sales-planning", label: "กลับไปภาพรวม" }}
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {!canTarget && (
          <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
            เฉพาะ Senior AE / หัวหน้าฝ่ายขาย / admin ตั้งเป้าได้ — หน้านี้แสดงเป้าของทีมแบบอ่านอย่างเดียว
          </div>
        )}

        <section className="glass-panel" style={{ padding: 16 }} aria-busy={loading}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {targets.map((target) => (
              <div key={target.id} className="glass-panel" style={{ padding: 14 }}>
                <div className="flex items-start gap-2">
                  <div>
                    <div style={{ fontWeight: 700 }}>{target.ownerName || (target.team ? `เป้าทีม ${target.team}` : "Team target")}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>{target.targetMonth}{target.ownerName && target.team ? ` · ${target.team}` : ""}</div>
                  </div>
                  <div className="spacer" />
                  {canTarget && (
                    <button type="button" className="btn icon-only ghost" onClick={() => deleteTarget(target)} aria-label={`ลบ target ${target.targetMonth}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button type="button" className="linklike mono tabular-nums text-left" onClick={() => openEditTarget(target)} disabled={!canTarget} style={{ marginTop: 12, fontSize: 22, fontWeight: 800 }}>
                  {money(target.targetAmount)}
                </button>
                {target.notes && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: 12 }}>{target.notes}</div>}
              </div>
            ))}
            {!targets.length && (
              <div className="glass-panel" style={{ padding: 18, color: "var(--text-3)" }}>
                ยังไม่มี target สำหรับเดือนนี้ {canTarget ? "เพิ่ม target เพื่อเริ่มวัด gap กับ forecast" : ""}
              </div>
            )}
          </div>
          {canTarget && missingTargetUsers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginBottom: 6 }}>ยังไม่ได้ตั้งเป้ารายบุคคลเดือนนี้</div>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                {missingTargetUsers.map((u) => (
                  <button key={u.id} type="button" className="btn ghost" onClick={() => openTargetForUser(u)}>
                    <Plus size={14} aria-hidden="true" /> {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={targetModal} onClose={() => setTargetModal(false)} title={targetForm.id ? "แก้ไข target" : "เพิ่ม target"} size="md">
        <form onSubmit={saveTarget} className="form-grid" aria-busy={submitting} style={{ padding: 18 }}>
          <label>
            เดือนเป้าหมาย
            <input type="month" className="premium-input" value={targetForm.targetMonth} onChange={(e) => setTargetForm({ ...targetForm, targetMonth: e.target.value })} required />
          </label>
          <label>
            ทีม
            {isSuper ? (
              <select
                className="premium-select"
                value={targetForm.team}
                onChange={(e) => setTargetForm({ ...targetForm, team: e.target.value, ownerId: "", ownerName: "" })}
                required
              >
                <option value="">เลือกทีม</option>
                {SALES_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <input className="premium-input" value={team || ""} readOnly disabled title="senior ตั้งได้เฉพาะทีมตัวเอง" />
            )}
          </label>
          <label>
            เจ้าของเป้า
            <select
              className="premium-select"
              value={targetForm.ownerId}
              onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value);
                setTargetForm({ ...targetForm, ownerId: e.target.value, ownerName: u?.name || "" });
              }}
            >
              <option value="">ทั้งทีม (เป้าทีม)</option>
              {ownerOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.role === "senior_ae" ? " (หัวหน้า)" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            ยอดเป้าหมาย
            <input type="number" min="0" step="0.01" className="premium-input mono" value={targetForm.targetAmount} onChange={(e) => setTargetForm({ ...targetForm, targetAmount: e.target.value })} required />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            หมายเหตุ
            <textarea className="premium-input" rows={3} value={targetForm.notes} onChange={(e) => setTargetForm({ ...targetForm, notes: e.target.value })} />
          </label>
          <div className="drawer-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn" onClick={() => setTargetModal(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </Modal>
    </Workspace>
  );
}
