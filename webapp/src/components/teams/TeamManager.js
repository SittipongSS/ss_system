"use client";
// ── จัดทีม — component เดียวที่ทุกฝ่ายใช้ร่วมกัน ─────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28**: จัดทีมเองได้ไม่ต้องรอแอดมิน · แยกเฉพาะฝ่าย
//   + *"TS ก็มีแยกทีม"*
//
// ⚠️ **หน้าเดียว ไม่ใช่หน้าละฝ่าย** — `/sa/teams` กับ `/service/teams` ส่ง
//   `department` คนละค่าเข้ามาที่ตัวเดียวกัน · เขียนสองไฟล์เมื่อไรมันเพี้ยนหากัน
//   ภายในสองเดือน (กฎ AGENTS.md ข้อแรกของ repo)
//
// ⚠️ สิ่งที่จอนี้ **ไม่มี** โดยตั้งใจ: สร้าง/ลบบัญชี · เปลี่ยน role · เปลี่ยนฝ่าย ·
//   รีเซ็ตรหัสผ่าน — ยังเป็นของแอดมินที่ /users เหมือนเดิม
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Shield, UserRound, Users } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Select from "@/components/ui/Select";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { TEAM_KIND_HINTS, TEAM_KIND_LABELS, sortTeams } from "@/lib/master/teams";
import { ROLE_LABELS } from "@/lib/permissions";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./TeamManager.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function TeamManager({ department, title, subtitle }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editTeam, setEditTeam] = useState(null);      // ทีมที่กำลังแก้ชื่อ/หัวหน้า
  const [movingUser, setMovingUser] = useState(null);   // คนที่กำลังย้าย
  const [moveTarget, setMoveTarget] = useState([]);
  const [moveImpact, setMoveImpact] = useState([]);
  const [closing, setClosing] = useState(null);
  const [crewTeam, setCrewTeam] = useState(null);   // ทีมปฏิบัติงานที่กำลังจัดสมาชิก
  const [crewIds, setCrewIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/teams?department=${encodeURIComponent(department)}`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || "โหลดทะเบียนทีมไม่สำเร็จ");
      setData(body);
    } catch (e) {
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดทะเบียนทีมไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [department, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const canManage = !!data?.canManage;
  const teams = useMemo(() => sortTeams(data?.teams || []), [data?.teams]);

  /* สมาชิกของทีม — ทีมขายอ่านจาก `teams[]` ของบัญชี · ทีมปฏิบัติงานอ่านจากตาราง
     ⚠️ สองแกนนี้ห้ามปนกัน (docs/team-management-plan.md §2) */
  const membersOf = useCallback((team) => {
    if (team.kind === "sales") {
      return (data?.people || []).filter((p) => (p.teams || []).includes(team.code));
    }
    const ids = new Set((data?.members || []).filter((m) => m.teamCode === team.code).map((m) => m.userId));
    return (data?.people || []).filter((p) => ids.has(p.id));
  }, [data]);

  const assigned = useMemo(() => {
    const ids = new Set();
    for (const team of teams) for (const person of membersOf(team)) ids.add(person.id);
    return ids;
  }, [teams, membersOf]);

  const unassigned = useMemo(
    () => (data?.people || []).filter((p) => !assigned.has(p.id)),
    [data?.people, assigned],
  );

  const call = async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await apiFetch(url, options);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setToast({ kind: "success", msg: okMsg });
      await load({ background: true });
      return body;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openMove = async (person) => {
    setMovingUser(person);
    setMoveTarget(person.teams || []);
    setMoveImpact([]);
    /* ⭐ บอกของที่จะค้างอยู่ทีมเดิม **ก่อนกด** — ปุ่มย้ายที่แก้แค่บัญชีจะทิ้งดีล/เป้า
       ค้างโดยไม่มีอะไรฟ้อง (คู่มือบอกว่าย้ายทีมมี 4 ขั้น 3 ขั้นเป็นงานมือ) */
    try {
      const res = await apiFetch(`/api/users/${person.id}/team/impact`);
      const body = await res.json().catch(() => null);
      if (res.ok && Array.isArray(body?.effects)) setMoveImpact(body.effects);
    } catch { /* ดูผลข้างเคียงไม่ได้ ไม่ใช่เหตุให้ย้ายไม่ได้ — แค่ไม่มีตัวเลขให้ดู */ }
  };

  return (
    <Workspace
      icon={<Users size={20} aria-hidden="true" />}
      title={title}
      subtitle={subtitle}
      headerRight={canManage ? (
        <Button tone="primary" onClick={() => { setNewName(""); setCreating(true); }}
          icon={<Plus size={15} aria-hidden="true" />}>
          สร้างทีม
        </Button>
      ) : null}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        <>
          {teams.length === 0 ? (
            <EmptyState icon={Users}>
              ฝ่ายนี้ยังไม่มีทีม — สร้างทีมแรกได้ที่ปุ่มมุมขวาบน
            </EmptyState>
          ) : teams.map((team) => {
            const members = membersOf(team);
            return (
              <section key={team.code} className={styles.team} data-inactive={team.isActive === false ? "yes" : undefined}>
                <header className={styles.head}>
                  <div>
                    <h2>
                      {team.name}
                      <span className={styles.code}>{team.code}</span>
                      {team.isActive === false && <span className="ui-badge">ปิดใช้งาน</span>}
                      <span className={`ui-badge ${team.kind === "sales" ? "violet" : ""}`.trim()}>
                        {TEAM_KIND_LABELS[team.kind]}
                      </span>
                    </h2>
                    <p className={styles.meta}>
                      {fmtNumber(members.length)} คน
                      {" · หัวหน้าทีม: "}
                      {team.leadName ? team.leadName : <span className={styles.warn}>ยังไม่ตั้ง</span>}
                      {team.note ? ` · ${team.note}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <div className={styles.headActions}>
                      {team.kind === "crew" && team.isActive !== false && (
                        <Button tone="neutral" variant="quiet" size="sm"
                          onClick={() => { setCrewTeam(team); setCrewIds(members.map((m) => m.id)); }}>
                          จัดสมาชิก
                        </Button>
                      )}
                      <Button tone="neutral" variant="quiet" size="sm" onClick={() => setEditTeam(team)}>แก้ทีม</Button>
                      {team.isActive !== false && (
                        <Button tone="neutral" variant="quiet" size="sm"
                          onClick={() => setClosing({ team, members: members.length })}>
                          ปิดทีม
                        </Button>
                      )}
                    </div>
                  )}
                </header>

                {members.length === 0 ? (
                  <p className={styles.empty}>ยังไม่มีคนในทีมนี้</p>
                ) : (
                  <ul className={styles.members}>
                    {members.map((person) => (
                      <li key={person.id}>
                        <UserRound size={14} aria-hidden="true" />
                        <span className={styles.name}>
                          {person.name}
                          {team.leadId === person.id && (
                            <span className={styles.leadTag}><Shield size={12} aria-hidden="true" /> หัวหน้าทีม</span>
                          )}
                        </span>
                        <span className={styles.role}>{ROLE_LABELS[person.role] || person.role}</span>
                        {/* ทีมหลักบอกว่ายอดของคนนี้เข้าทีมไหน — โผล่เฉพาะคนที่อยู่หลายทีม */}
                        {(person.teams || []).length > 1 && (
                          <span className={styles.role}>ทีมหลัก {person.team}</span>
                        )}
                        {canManage && team.kind === "sales" && (
                          <Button tone="neutral" variant="quiet" size="sm" onClick={() => openMove(person)}>ย้าย</Button>
                        )}
                        {/* ทีมปฏิบัติงานย้ายคนทีละคนไม่ได้ — จัดทั้งทีมทีเดียวจากปุ่ม
                            "จัดสมาชิก" บนหัวการ์ด (คนจัดคิดเป็น "ทีมนี้มีใครบ้าง") */}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {/* ⭐ ถังนี้ต้องมีเสมอแม้ว่าง — ถังที่หายไปคือคนที่หายไปจากสายตา */}
          <section className={styles.team} data-bucket="unassigned">
            <header className={styles.head}>
              <div>
                <h2>ยังไม่อยู่ทีมไหน<span className={styles.code}>{fmtNumber(unassigned.length)} คน</span></h2>
                <p className={styles.meta}>คนของฝ่ายนี้ที่ยังไม่ถูกจัดเข้าทีม</p>
              </div>
            </header>
            {unassigned.length === 0 ? (
              <p className={styles.empty}>ทุกคนในฝ่ายอยู่ทีมครบแล้ว</p>
            ) : (
              <ul className={styles.members}>
                {unassigned.map((person) => (
                  <li key={person.id}>
                    <UserRound size={14} aria-hidden="true" />
                    <span className={styles.name}>{person.name}</span>
                    <span className={styles.role}>{ROLE_LABELS[person.role] || person.role}</span>
                    {canManage && department === "SA" && (
                      <Button tone="neutral" variant="quiet" size="sm" onClick={() => openMove(person)}>จัดเข้าทีม</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ── สร้างทีม ─────────────────────────────────────────────────── */}
      <Modal open={creating} onClose={() => setCreating(false)} title="สร้างทีม" size="sm">
        <label className={styles.field}>
          <span>ชื่อทีม *</span>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100}
            placeholder="เช่น ทีมกรุงเทพตะวันออก" />
          <small>{TEAM_KIND_HINTS[department === "SA" ? "sales" : "crew"]}</small>
        </label>
        <div className="form-actions">
          <Button tone="neutral" onClick={() => setCreating(false)} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" disabled={saving || !newName.trim()}
            onClick={async () => {
              const done = await call("/api/teams", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim(), department }),
              }, `สร้างทีม ${newName.trim()} แล้ว`);
              if (done) setCreating(false);
            }}>
            สร้างทีม
          </Button>
        </div>
      </Modal>

      {/* ── แก้ทีม + ตั้งหัวหน้า ─────────────────────────────────────── */}
      <Modal open={!!editTeam} onClose={() => setEditTeam(null)} title={`แก้ทีม ${editTeam?.name || ""}`} size="sm">
        {editTeam && (
          <>
            <label className={styles.field}>
              <span>ชื่อทีม *</span>
              <Input value={editTeam.name} maxLength={100}
                onChange={(e) => setEditTeam({ ...editTeam, name: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>หัวหน้าทีม</span>
              {/* ⚠️ เลือกได้เฉพาะคนในทีมนั้น — หัวหน้าที่ไม่ได้อยู่ในทีมคือข้อมูลที่ผิด */}
              <Select
                value={editTeam.leadId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const person = membersOf(editTeam).find((p) => p.id === id);
                  setEditTeam({ ...editTeam, leadId: id || null, leadName: person?.name || null });
                }}
              >
                <option value="">ยังไม่ตั้ง</option>
                {membersOf(editTeam).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
            <label className={styles.field}>
              <span>หมายเหตุ</span>
              <Input as="textarea" rows={2} value={editTeam.note || ""} maxLength={500}
                onChange={(e) => setEditTeam({ ...editTeam, note: e.target.value })} />
            </label>
            <div className="form-actions">
              <Button tone="neutral" onClick={() => setEditTeam(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="primary" disabled={saving || !editTeam.name.trim()}
                onClick={async () => {
                  const done = await call(`/api/teams/${encodeURIComponent(editTeam.code)}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: editTeam.name.trim(), leadId: editTeam.leadId, leadName: editTeam.leadName,
                      note: editTeam.note, sortOrder: editTeam.sortOrder,
                    }),
                  }, "บันทึกทีมแล้ว");
                  if (done) setEditTeam(null);
                }}>
                บันทึก
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── ย้ายคน ───────────────────────────────────────────────────── */}
      <Modal open={!!movingUser} onClose={() => setMovingUser(null)}
        title={`ย้ายทีมของ ${movingUser?.name || ""}`} size="md">
        {movingUser && (
          <>
            <p className={styles.meta}>
              ตอนนี้อยู่: {(movingUser.teams || []).length ? movingUser.teams.join(" · ") : naText(null)}
            </p>
            <div className={styles.field}>
              <span>ทีมที่สังกัด *</span>
              {/* คนหนึ่งอยู่ได้หลายทีม — ทีมขายคือ "ขอบเขตการเห็นข้อมูล" ซ้อนกันได้ */}
              <OptionTiles
                multiple
                value={moveTarget}
                onChange={setMoveTarget}
                ariaLabel="ทีมที่สังกัด"
                options={teams.filter((t) => t.isActive !== false && t.kind === "sales")
                  .map((t) => ({ value: t.code, label: t.name, description: t.code }))}
              />
            </div>
            {/* ⭐ ของที่จะค้างอยู่ทีมเดิม — ระบบไม่ย้ายให้ ต้องบอกให้ครบก่อนกด */}
            {moveImpact.length > 0 && (
              <ul className={styles.impact}>
                {moveImpact.map((row) => <li key={row.key}>{row.text}</li>)}
              </ul>
            )}
            <div className="form-actions">
              <Button tone="neutral" onClick={() => setMovingUser(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="primary" disabled={saving || !moveTarget.length}
                onClick={async () => {
                  const done = await call(`/api/users/${movingUser.id}/team`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ teams: moveTarget, team: moveTarget[0] }),
                  }, `ย้าย ${movingUser.name} แล้ว`);
                  if (done) setMovingUser(null);
                }}>
                ย้ายทีม
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── จัดสมาชิกทีมปฏิบัติงาน ─────────────────────────────────────
          ⚠️ ติ๊กทั้งทีมแล้วกดครั้งเดียว ไม่ใช่ย้ายทีละคน — คนจัดคิดเป็น "ทีมนี้มีใครบ้าง"
          และการยิงทีละคนแล้วล้มกลางทางจะเหลือทีมครึ่ง ๆ ที่คนกดไม่รู้ว่าถึงไหน */}
      <Modal open={!!crewTeam} onClose={() => setCrewTeam(null)}
        title={`จัดสมาชิก ${crewTeam?.name || ""}`} size="md">
        {crewTeam && (
          <>
            <p className={styles.meta}>
              ติ๊กคนที่อยู่ทีมนี้ · คนหนึ่งอยู่ได้ทีมเดียวในฝ่ายเดียวกัน
              (ต่างจากทีมขายที่ซ้อนได้ เพราะทีมขายคือขอบเขตการเห็นข้อมูล)
            </p>
            <div className={styles.field}>
              <span>สมาชิก</span>
              <OptionTiles
                multiple
                value={crewIds}
                onChange={setCrewIds}
                ariaLabel="สมาชิกทีม"
                options={(data?.people || []).map((p) => ({
                  value: p.id,
                  label: p.name,
                  description: ROLE_LABELS[p.role] || p.role,
                }))}
              />
            </div>
            <div className="form-actions">
              <Button tone="neutral" onClick={() => setCrewTeam(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="primary" disabled={saving}
                onClick={async () => {
                  const done = await call(`/api/teams/${encodeURIComponent(crewTeam.code)}/members`, {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userIds: crewIds }),
                  }, `จัดสมาชิกทีม ${crewTeam.name} แล้ว`);
                  if (done) setCrewTeam(null);
                }}>
                บันทึกสมาชิก
              </Button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!closing}
        title={`ปิดทีม ${closing?.team?.name || ""}`}
        message={closing?.members
          ? `ทีมนี้ยังมีสมาชิก ${closing.members} คน — ย้ายคนออกให้หมดก่อนจึงจะปิดได้`
          : "ทีมที่ปิดแล้วจะไม่ขึ้นให้เลือกใหม่ แต่ยังอ่านชื่อได้ในรายงานย้อนหลัง"}
        confirmLabel="ปิดทีม"
        tone="danger"
        onClose={() => setClosing(null)}
        onConfirm={closing?.members ? undefined : async () => {
          const done = await call(`/api/teams/${encodeURIComponent(closing.team.code)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: false }),
          }, `ปิดทีม ${closing.team.name} แล้ว`);
          if (done) setClosing(null);
        }}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
