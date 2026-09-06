"use client";
// ── ตัวโหลดทะเบียนทีม — ทะเบียนกับหน้าทีมอ่านชุดเดียวกัน ────────────────────
//
// ⚠️ **หน้ารายละเอียดทีมไม่มี endpoint ของตัวเอง** โดยตั้งใจ: `GET /api/teams?department=`
//   คืนทั้งทะเบียน + สมาชิก + คนทั้งฝ่ายในคำขอเดียวอยู่แล้ว (ฝ่ายหนึ่งไม่กี่สิบคน)
//   ⇒ เพิ่มเส้นใหม่ = เพิ่มด่าน proxy อีกสองชั้นและอีกที่ที่กติกาจะเพี้ยนกันได้
//
// ⚠️ สมาชิกของทีมมาจาก **สองแหล่ง** ตาม `kind` — ทีมขายอ่านจาก `teams[]` ของบัญชี
//   (Supabase Auth) · ทีมปฏิบัติงานอ่านจากตาราง `team_members` · ห้ามปนกัน
//   (docs/team-management-plan.md §2)
import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { notifyToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/apiFetch";
import { sortTeams } from "@/lib/master/teams";

export default function useTeamRegistry(department) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

  const teams = useMemo(() => sortTeams(data?.teams || []), [data?.teams]);
  const people = useMemo(() => data?.people || [], [data?.people]);

  const membersOf = useCallback((team) => {
    if (!team) return [];
    if (team.kind === "sales") return people.filter((p) => (p.teams || []).includes(team.code));
    const ids = new Set((data?.members || []).filter((m) => m.teamCode === team.code).map((m) => m.userId));
    return people.filter((p) => ids.has(p.id));
  }, [data?.members, people]);

  /* ⚠️ ชื่อหัวหน้าทีมบนทะเบียนเป็น **สำเนาที่ถ่ายไว้ตอนตั้ง** (`leadName`) — เปลี่ยนชื่อ
     บัญชีแล้วมันไม่ตามไปด้วย และย้ายหัวหน้าออกจากทีมแล้วมันยังค้างอยู่
     ⇒ ทุกจอต้องอ่านชื่อ **สด** จากทะเบียนคน แล้วถอยไปใช้สำเนาเมื่อหาไม่เจอ
     (กติกาเดียวกับ `person-name-copies`: ช่องไหนซิงก์ตามบัญชีได้ให้ซิงก์) */
  const leadOf = useCallback((team) => {
    if (!team?.leadId) return null;
    const live = people.find((p) => p.id === team.leadId);
    const member = membersOf(team).some((p) => p.id === team.leadId);
    return { id: team.leadId, name: live?.name || team.leadName || null, stale: !member };
  }, [people, membersOf]);

  /* ทีมปฏิบัติงานที่คนแต่ละคนสังกัดอยู่ตอนนี้ — ใช้บอกบนจอ **ก่อนติ๊ก** ว่าคนนี้จะถูก
     ย้ายมาจากทีมไหน · ของเดิมไม่บอกเลย แล้วเซิร์ฟเวอร์ตีกลับทั้งชุดพร้อมรายชื่อตอนกดบันทึก */
  const crewTeamByUser = useMemo(() => {
    const map = new Map();
    for (const m of data?.members || []) map.set(m.userId, m.teamCode);
    return map;
  }, [data?.members]);

  const assignedIds = useMemo(() => {
    const ids = new Set();
    for (const team of teams) for (const person of membersOf(team)) ids.add(person.id);
    return ids;
  }, [teams, membersOf]);

  const unassigned = useMemo(
    () => people.filter((p) => !assignedIds.has(p.id)),
    [people, assignedIds],
  );

  /* ทางเดียวที่จอนี้เขียนข้อมูล — toast + reload อยู่ที่เดียว ไม่ต้องจำว่าใครต้องรีเฟรช
     ⚠️ ใช้ `notifyToast` ไม่ใช่ `<Toast toast>` ที่เป็น API เข้ากันได้ของหน้าเก่า */
  const call = useCallback(async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await apiFetch(url, options);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      notifyToast.success(okMsg);
      await load({ background: true });
      return body ?? true;
    } catch (e) {
      notifyToast.error(e.message || "บันทึกไม่สำเร็จ");
      return null;
    } finally {
      setSaving(false);
    }
  }, [load]);

  return {
    data, teams, people, loading, loadError, saving,
    canManage: !!data?.canManage,
    membersOf, leadOf, unassigned, crewTeamByUser, call, reload: load,
  };
}
