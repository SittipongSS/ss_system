"use client";
// ── ทะเบียนทีมขายฝั่งจอ — **แหล่งเดียวของชื่อทีม** ────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-09-07**: ทีมขายที่สร้างใหม่ต้องขึ้นชื่อจริงทุกจอ และต้องขึ้นในตัวเลือกด้วย
//
// 🔴 **ไม่มีตารางชื่อสำรองในโค้ดอีกแล้ว** (รอบสอง 2026-09-07) — ของเดิมถอยไป `TEAM_LABELS`
//   ซึ่งเป็นสำเนาชื่อสามทีมที่ค้างอยู่ในโค้ด ⇒ ปัญหาสองข้อที่แก้ทีเดียวด้วยการลบมันทิ้ง:
//     ① **สองฝั่งตอบไม่เหมือนกัน** — เซิร์ฟเวอร์ (`teamNameOf`) ไม่ถอยไปค่าคงที่ คืนรหัสดิบ
//        ส่วนจอถอย ⇒ ตอนโหลดทะเบียนพลาดหลังเปลี่ยนชื่อ เบราว์เซอร์โชว์ **ชื่อเก่าอย่างมั่นใจ**
//        ส่วน Excel โชว์ **รหัสดิบ** — ไม่มีอันไหนจริง และขัดกันเอง
//     ② **ชื่อเก่าที่ดูเหมือนถูก แย่กว่ารหัสที่อ่านออกว่าเป็นรหัส** — รหัสยังตามไปหาต่อได้
//   ⇒ กติกาเดียวทั้งระบบ: **มีในทะเบียน = ชื่อจริง · ไม่มี = รหัสดิบ**
//
// ⚠️ **แต่ยังต้องมีรายการ "รหัส" สำรองสำหรับเฟรมแรก** — ไม่ใช่ชื่อ · ชิปตัวกรองที่ว่าง
//   หนึ่งเฟรมทำให้ค่าที่ผู้ใช้เลือกไว้ถูกมองว่า "ไม่มีในตัวเลือก" แล้วโดนล้างทิ้ง
//   สามรหัสที่ seed มาแต่แรกใช้เป็นค่าสำรองได้อย่างปลอดภัย เพราะ **ลบไม่ได้**
//   (`deleteTeamBlocker` กันไว้ + `check:teams` ยืนยันว่ายังอยู่)
//
// ⚠️ **ฝั่งเซิร์ฟเวอร์ห้ามใช้ไฟล์นี้** (เอกสารพิมพ์ · export · รายงาน) — มันเป็น client cache
//   ฝั่งนั้นใช้ `loadTeamNames` + `teamNameOf` ซึ่งอ่านฐานสดทุกคำขอ
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFetchJson, dropCache } from "@/lib/apiCache";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { TEAMS } from "@/lib/permissions";
import { teamNameOf } from "@/lib/master/teams";

/* ค่าสำรองของเฟรมแรก — **รหัสล้วน ไม่ใช่ชื่อ** (ดูเหตุผลหัวไฟล์)
   ชื่อจึงเท่ากับรหัสจนกว่าทะเบียนจะมาถึง แล้วสลับเป็นชื่อจริงเอง */
export const FALLBACK_SALES_TEAMS = TEAMS.map((code, i) => ({
  code, name: code, kind: "sales", isActive: true, sortOrder: (i + 1) * 10,
}));

const URL = "/api/teams?labels=1&kind=sales";

/* ⚠️ TTL เป็น **พื้น ไม่ใช่เพดาน** — แคชอยู่ระดับโมดูล มีชีวิตเท่าแท็บ ⇒ ของจะสดขึ้น
   ก็ต่อเมื่อมี mount ใหม่หลัง TTL หมด · ตัวที่ทำให้ "เปลี่ยนชื่อแล้วเห็นทันที" จริง ๆ คือ
   `invalidateSalesTeams()` ตอนบันทึกสำเร็จ + revalidate ตอนกลับมาที่แท็บ */
const TTL_MS = 10 * 60 * 1000;

let lastGood = null;   // ข้ามหน้าแล้วยังได้ค่าเดิมทันทีโดยไม่กระพริบ

/* เรียกหลังแก้ทะเบียนสำเร็จ — ไม่งั้นแท็บที่เปิดค้างไว้โชว์ชื่อเก่าไปเรื่อย ๆ
   ⚠️ ต้องล้าง `lastGood` ด้วย ไม่ใช่แค่แคชของ URL — ไม่งั้นรอบถัดไปที่โหลดพลาด
   จะเสิร์ฟชื่อเก่าซ้ำอีกโดยไม่มีใครรู้ */
export function invalidateSalesTeams() {
  lastGood = null;
  dropCache(URL);
}

/* `force` = ข้าม TTL ไปถามใหม่
   🐞 **ของจริงที่จับได้ตอน UAT**: ใส่ revalidate-on-focus แล้วป้ายยังไม่อัปเดต เพราะ
      `cachedFetchJson` เห็นว่ายังไม่ครบ TTL แล้วคืนของเดิมทันที ⇒ ตัว revalidate
      กลายเป็นของประดับ · TTL มีไว้กัน "mount ซ้ำ ๆ" ไม่ใช่กัน "คนกลับมามองแท็บ" */
export async function fetchSalesTeams({ force = false } = {}) {
  if (force) dropCache(URL);
  try {
    const data = await cachedFetchJson(URL, TTL_MS);
    const rows = Array.isArray(data?.teams) ? data.teams : [];
    if (rows.length) lastGood = rows;
    return rows.length ? rows : (lastGood || FALLBACK_SALES_TEAMS);
  } catch (error) {
    /* ⚠️ ล้มแล้ว **ต้องส่งเสียง** — การกลืน error เงียบตรงนี้คือเหตุที่ 403 ของด่าน proxy
       เคยรอดถึง production โดยไม่มีใครเห็น (บทเรียนของ companyProfile) */
    console.warn("[salesTeams] โหลดทะเบียนทีมไม่สำเร็จ — ป้ายจะขึ้นเป็นรหัสทีม", error);
    return lastGood || FALLBACK_SALES_TEAMS;
  }
}

/* ทีมขายที่ยังใช้งานอยู่ เรียงตามลำดับของทะเบียน — สำหรับ "ตัวเลือก/ตัวกรอง"
   ⚠️ ทีมที่ปิดแล้วไม่อยู่ในนี้ แต่ `salesTeamLabel()` ยังแปลรหัสของมันได้ (รายงานย้อนหลัง) */
export function activeSalesTeams(rows) {
  return (rows || []).filter((t) => t.isActive !== false);
}

/* ป้ายของรหัสทีม — กติกาเดียวกับฝั่งเซิร์ฟเวอร์เป๊ะ (`teamNameOf`):
   มีในทะเบียน = ชื่อจริง · ไม่มี = รหัสดิบ */
export function salesTeamLabel(rows, code) {
  if (!code) return code;
  return teamNameOf(new Map((rows || []).map((t) => [t.code, t.name])), code);
}

/* ป้ายทีมสำหรับโค้ดที่ **เรียก hook ไม่ได้** — ตัวช่วยระดับโมดูล (personSearchText ·
   leadLifecycle · ตัวประกอบข้อความ) อ่านสแนปช็อตล่าสุดที่โหลดมาแล้ว
   ⚠️ ตัวนี้ **ไม่ทำให้ component เรนเดอร์ใหม่** เมื่อทะเบียนมาถึง — คนที่ทำให้ทั้งเปลือก
   เรนเดอร์ใหม่คือ `useSalesTeams()` ที่ `AppLayout` เรียกไว้ตัวเดียว (เปลือกอยู่ทุกหน้า)
   ⇒ อย่าถอด hook ตัวนั้นออกจาก AppLayout ไม่งั้นทุกจอที่ใช้ `teamLabelNow` จะค้างที่รหัส
   จนกว่าจะมีอย่างอื่นบังคับให้เรนเดอร์ใหม่ */
export function teamLabelNow(code) {
  return salesTeamLabel(lastGood, code);
}

/* Hook สำหรับจอ — คืนค่าสำรองทันทีในรอบแรก แล้วสลับเป็นของจริงเมื่อโหลดเสร็จ
   ⚠️ **ห้ามคืน [] ระหว่างโหลด** — ชิปตัวกรองที่ว่างหนึ่งเฟรมทำให้ค่าที่ผู้ใช้เลือกไว้
      ถูกมองว่า "ไม่มีในตัวเลือก" แล้วโดนล้างทิ้ง
   ⭐ revalidate ตอนกลับมาที่แท็บ — คนแก้ชื่อทีมในอีกแท็บแล้วสลับกลับมา ต้องเห็นของใหม่ */
export function useSalesTeams() {
  const [rows, setRows] = useState(() => lastGood || FALLBACK_SALES_TEAMS);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  /* identity คงที่ — `useRevalidateOnFocus` ผูกกับ identity ของตัวโหลด
     (เปลี่ยนทุกเรนเดอร์ = ผูก/ถอด listener รัว ๆ) */
  const load = useCallback((opts) => {
    /* กลับมาที่แท็บ = ถามใหม่จริง ๆ (ข้าม TTL) · ตอน mount ใช้แคชได้ตามปกติ */
    fetchSalesTeams({ force: !!opts?.background }).then((next) => {
      if (alive.current) setRows(next);
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);
  return rows;
}
