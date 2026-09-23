"use client";
// ── ภาระรายคนของวันหนึ่ง สำหรับจอที่ **ไม่ได้** ถือรายการงานไว้เอง (มติเจ้าของ 23/09) ──
//
// ⭐ ผู้ใช้หลัก: โมดัลลงคิวคำร้องประเมินพื้นที่ (`components/requests/CommitDueDialog`) ตอนเปิดจาก
//    **หน้าใบคำร้อง** — หน้านั้นไม่มีนัดในมือ แต่ต้องเลือกเจ้าหน้าที่ด้วยตัวเลือกเดียวกับหน้าจัดคิว
//    (`CrewLoadPicker`) ซึ่งตอบคำถาม "วันนั้นใครยังรับไหว" ไม่ได้ถ้าไม่มีตัวเลข
//    · หน้าจัดคิวถือรายการงานอยู่แล้ว ⇒ ส่ง `staffLoadFor` ของตัวเองเข้าโมดัล และฮุกนี้ไม่ยิงอะไรเลย
// ⭐ **สูตรเดียวของสองจอ** — ตัวเลขรายคนมาจาก `crewLoadPeople` ตัวเดียวกับหน้าจัดคิว
//    ⇒ ภาระของคนเดียวกันวันเดียวกันต้องเท่ากันไม่ว่าจะเปิดโมดัลจากหน้าไหน
// ⚠️ **ไม่รู้ = บอกว่าไม่รู้** (`state: 'unknown'`) ไม่ใช่ศูนย์ — ยังโหลดไม่เสร็จ · โหลดพัง ·
//    หรือวันที่เก่ากว่าที่รายการงานเก็บ (ปิดแล้วเกิน 14 วัน) · ศูนย์ที่เดาเองอ่านว่า "ว่าง"
//    แล้วงานจะถูกยัดให้คนที่เต็มอยู่แล้ว (กติกาเดียวกับ `CrewLoadPicker`)
// ⚠️ ยิงใหม่ทุกครั้งที่โมดัลเปิด (ตัวฟอร์มเมานต์ใหม่ทุกรอบ ฮุกจึงเริ่มจากศูนย์) — ภาระเปลี่ยน
//    ตลอดวัน ตัวเลขค้างจากรอบก่อนคือตัวเลขที่โกหก
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { teamByUser } from "./crewTeams";
import { crewLoadPeople } from "./scheduleQueue";

const IDLE = Object.freeze({ status: "idle", visits: [], workload: {}, closedSince: "", teams: [], members: [] });

/**
 * ผลของ `staffLoadFor(dateIso)` จากก้อนที่โหลดมาแล้ว — ตรรกะล้วน (เทสต์ได้โดยไม่มี React)
 *
 * @param data     `{ status: 'idle'|'loading'|'ok'|'error', visits, workload, closedSince, teams, members }`
 * @param dateIso  วันที่ที่ตัวเลือกกำลังถาม · ว่าง = null (ตัวเลือกบอกให้เลือกวันก่อนเอง)
 * @returns `{ state: 'ok'|'unknown', people }` รูปเดียวกับ `staffLoadFor` ของหน้าจัดคิว
 */
export function crewLoadFromQueue(data, dateIso, { technicians = [] } = {}) {
  if (!dateIso) return null;
  const d = data || IDLE;
  if (d.status !== "ok" || (d.closedSince && dateIso < d.closedSince)) return { state: "unknown", people: [] };
  return {
    state: "ok",
    people: crewLoadPeople({
      visits: d.visits,
      dateIso,
      workload: d.workload,
      technicians,
      crewByUser: teamByUser(d.members),
      teamNames: new Map((d.teams || []).map((team) => [team.code, team.name])),
    }),
  };
}

/**
 * @param enabled     ยิงเมื่อ true เท่านั้น (โมดัลเปิด + โหมดลงคิวเข้าพื้นที่ + ผู้เรียกไม่ได้ส่งภาระมาเอง)
 * @param technicians รายชื่อที่ตัวเลือกจะโชว์ [{ id, name }]
 * @returns `staffLoadFor(dateIso)` — เรียกแบบ synchronous ได้ทุกเรนเดอร์
 */
export default function useCrewLoad({ enabled = false, technicians = [] } = {}) {
  const [data, setData] = useState(IDLE);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    /* ⚠️ ไม่ตั้ง "กำลังโหลด" ตรงนี้ — สถานะตั้งต้น (idle) ก็อ่านว่า "ไม่รู้" อยู่แล้ว และโมดัลเมานต์
       ตัวฟอร์มใหม่ทุกครั้งที่เปิด ⇒ ฮุกเริ่มจาก idle ทุกรอบโดยไม่ต้องล้างเอง */
    (async () => {
      try {
        /* `view=load` — ขอแค่ภาระ: ไม่เอาการ์ดคำร้อง · ไม่โหลดบริบทด่าน · ไม่ส่งร่าง (`queueRouteMode`)
           🐞 รีวิว 24/09: เคยขอ `requests=0` แล้วได้บริบทด่านเต็มของทุกไซต์ที่มีร่างมาทิ้งทุกครั้งที่เปิดโมดัล
           · ทีมเป็นป้ายในแถว ไม่ใช่ด่าน: โหลดทีมไม่ได้ = ไม่มีชื่อทีม แต่ตัวเลขยังใช้ได้ */
        const [queueRes, teamsRes] = await Promise.all([
          apiFetch("/api/service/visits/queue?view=load"),
          apiFetch("/api/teams?department=TS").catch(() => null),
        ]);
        const queue = await queueRes.json().catch(() => null);
        const teams = teamsRes?.ok ? await teamsRes.json().catch(() => null) : null;
        if (!alive) return;
        if (!queueRes.ok || !queue) { setData({ ...IDLE, status: "error" }); return; }
        setData({
          status: "ok",
          visits: Array.isArray(queue.visits) ? queue.visits : [],
          workload: queue.workload && typeof queue.workload === "object" ? queue.workload : {},
          closedSince: queue.closedSince || "",
          teams: Array.isArray(teams?.teams) ? teams.teams : [],
          members: Array.isArray(teams?.members) ? teams.members : [],
        });
      } catch {
        if (alive) setData({ ...IDLE, status: "error" });
      }
    })();
    return () => { alive = false; };
  }, [enabled]);

  const list = useMemo(() => technicians || [], [technicians]);
  return useCallback((dateIso) => crewLoadFromQueue(data, dateIso, { technicians: list }), [data, list]);
}
