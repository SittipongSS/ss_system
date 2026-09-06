"use client";
// ── ทะเบียนทีมขายฝั่งจอ — ป้ายและตัวเลือกอ่านจากทะเบียนจริง ─────────────────
//
// ⭐ **มติผู้ใช้ 2026-09-07**: ทีมขายที่สร้างใหม่ต้องขึ้น **ชื่อจริง** ทุกจอ ไม่ใช่รหัสดิบ
//   และต้องขึ้นในตัวกรอง/ตัวเลือกด้วย · ของเดิมทุกจออ่านค่าคงที่ `TEAM_LABELS`/`TEAMS`
//   ซึ่งมีแค่สามทีมที่ seed มาแต่แรก ⇒ ทีมที่สี่ "มีอยู่แต่มองไม่เห็น"
//
// ⚠️ **ค่าคงที่ยังอยู่ และยังจำเป็น** — เป็นค่าที่เรนเดอร์ได้ทันทีในรอบแรกก่อน fetch เสร็จ
//   และเป็นค่าถอยเมื่อโหลดไม่สำเร็จ · จอต้องไม่ว่างหรือกระพริบเพราะ API ช้า
//   (ทรงเดียวกับ `companyProfile` — ทะเบียนของจริง + ค่าสำรองในโค้ด)
//
// ⚠️ **ฝั่งเซิร์ฟเวอร์ห้ามใช้ไฟล์นี้** (เอกสารพิมพ์ · export · รายงาน) — มันเป็น client
//   cache · ฝั่งนั้นอ่าน `loadTeams` จากฐานตรง ๆ
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/apiCache";
import { TEAMS, TEAM_LABELS } from "@/lib/permissions";

/* ค่าตั้งต้นที่เรนเดอร์ได้ทันที — สามทีมที่ seed มาแต่แรก เรียงตามลำดับของระบบ */
export const FALLBACK_SALES_TEAMS = TEAMS.map((code, i) => ({
  code, name: TEAM_LABELS[code] || code, kind: "sales", isActive: true, sortOrder: (i + 1) * 10,
}));

const URL = "/api/teams?labels=1&kind=sales";

/* ⚠️ TTL ยาวได้ — ทะเบียนทีมเปลี่ยนปีละไม่กี่ครั้ง และหน้าจัดทีมรีเฟรชของตัวเองอยู่แล้ว
   (useTeamRegistry ยิง `/api/teams?department=` ตรง ไม่ผ่านแคชตัวนี้) */
const TTL_MS = 10 * 60 * 1000;

let lastGood = null;   // module-level: ข้ามหน้าแล้วยังได้ค่าเดิมทันทีโดยไม่กระพริบ

export async function fetchSalesTeams() {
  try {
    const data = await cachedFetchJson(URL, TTL_MS);
    const rows = Array.isArray(data?.teams) ? data.teams : [];
    if (rows.length) lastGood = rows;
    return rows.length ? rows : (lastGood || FALLBACK_SALES_TEAMS);
  } catch (error) {
    /* ⚠️ ล้มแล้ว **ต้องส่งเสียง** — การกลืน error เงียบตรงนี้คือเหตุที่ 403 ของด่าน proxy
       เคยรอดถึง production โดยไม่มีใครเห็น (บทเรียนของ companyProfile) */
    console.warn("[salesTeams] โหลดทะเบียนทีมไม่สำเร็จ — ใช้ค่าสำรองในโค้ด", error);
    return lastGood || FALLBACK_SALES_TEAMS;
  }
}

/* ทีมขายที่ยังใช้งานอยู่ เรียงตามลำดับของทะเบียน — สำหรับ "ตัวเลือก/ตัวกรอง"
   ⚠️ ทีมที่ปิดแล้วไม่อยู่ในนี้ แต่ `label()` ยังแปลรหัสของมันได้ (รายงานย้อนหลัง) */
export function activeSalesTeams(rows) {
  return (rows || []).filter((t) => t.isActive !== false);
}

export function salesTeamLabel(rows, code) {
  if (!code) return code;
  const hit = (rows || []).find((t) => t.code === code);
  return hit?.name || TEAM_LABELS[code] || code;
}

/* Hook สำหรับจอ — คืนค่าสำรองทันทีในรอบแรก แล้วสลับเป็นของจริงเมื่อโหลดเสร็จ
   ⚠️ **ห้ามคืน [] ระหว่างโหลด** — ชิปตัวกรองที่ว่างหนึ่งเฟรมทำให้ค่าที่ผู้ใช้เลือกไว้
      ถูกมองว่า "ไม่มีในตัวเลือก" แล้วโดนล้างทิ้ง */
export function useSalesTeams() {
  const [rows, setRows] = useState(() => lastGood || FALLBACK_SALES_TEAMS);
  useEffect(() => {
    let alive = true;
    fetchSalesTeams().then((next) => { if (alive) setRows(next); });
    return () => { alive = false; };
  }, []);
  return rows;
}
