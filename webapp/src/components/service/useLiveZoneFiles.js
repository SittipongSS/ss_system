"use client";
// ── ไฟล์รายพื้นที่ "ชุดสด" ของจอใบประเมิน (แผน §10.5 S2 · §3.7 ของแผนจอหน้างานแบบ A) ──
//
// ⭐ **ทำไมต้องมี** — รูปขึ้นระบบทันทีที่แผงไฟล์แนบอัปเสร็จ (ไม่มีปุ่มบันทึก) แต่ `filesByZone`
//   ของหน้ามาจาก GET ก้อนเดียวตอนโหลด ⇒ หัวหน้าอัปผังที่ตารางสรุปแล้ว **ด่าน "ภาพผัง" บนการ์ด
//   จัดการผลยังขึ้น 0/3 · ปุ่มส่งผลยังติด** จนกว่าจะโหลดหน้าใหม่ · ของเดิมแก้ไว้เฉพาะในการ์ด
//   พื้นที่ (`liveFiles` ของมันเอง) ⇒ ตัวนับบนการ์ดขยับ แต่ส่วนอื่นของหน้าไม่รู้เรื่อง
//   ⇒ แผงทุกตัวรายงานรายการของมันขึ้นมาที่นี่ แล้ว **ทุกที่อ่านก้อนรวมก้อนเดียว** (ตาราง ·
//     การ์ดจัดการผล · กล่องส่งงาน · ด่านส่งผล)
//
// 🔑 กติกาสองข้อ (อยู่ในฟังก์ชันล้วนข้างล่าง เพื่อให้เทสต์ได้โดยไม่ต้องเรนเดอร์):
//   1. **รายงานที่ `loaded` ไม่จริงไม่นับ** — แผงยิง `[]` ตั้งแต่ก่อนโหลดเสร็จ และยิง `[]` ตอน
//      โหลดไม่สำเร็จด้วย ⇒ รับดิบ ๆ แล้วตัวนับกะพริบเป็น "ยังไม่มี" ทุกครั้งที่เปิดหน้า
//      (กติกาเดียวกับ `handleItems` ของการ์ดพื้นที่)
//   2. **GET ก้อนใหม่ = ล้างรายงานทิ้งทั้งหมด** — ก้อนใหม่อ่านจากฐานหลังการอัป/ลบนั้นแล้ว
//      ⇒ เป็นความจริงที่ใหม่กว่า · เก็บรายงานเก่าไว้ทับ = ไฟล์ที่อีกคนเพิ่งลบยังขึ้นอยู่
//      ⚠️ ก้อนใหม่หรือไม่ ดูจาก **ตัวตน (identity) ของก้อน** ไม่ใช่เนื้อใน — `setData(body)` ได้ก้อนใหม่
//         ทุกครั้งที่โหลด
//
// ⚠️ ตัวรายงาน (`reportFiles`) **คงที่ตลอดอายุหน้า** — แผงไฟล์แนบยิง `onItemsChange` ใน effect
//   ที่ขึ้นกับตัวตนของฟังก์ชัน ⇒ ถ้ามันเปลี่ยนทุกครั้งที่โหลด แผงทุกตัวจะยิงรายการเดิมของมันซ้ำ
//   ทันทีหลังโหลด แล้วกติกาข้อ 2 ไม่เคยได้ทำงาน
import { useCallback, useMemo, useRef, useState } from "react";

const EMPTY = Object.freeze({});

/**
 * รับรายงานจากแผงหนึ่งตัว → สถานะใหม่ (หรือตัวเดิมเป๊ะเมื่อไม่มีอะไรเปลี่ยน)
 * ⚠️ คืน **ตัวเดิม** เมื่อรายการเป็นตัวเดิม — ผู้เรียกส่งฟังก์ชันใหม่ทุกครั้งที่วาดได้ ⇒ แผงยิงซ้ำ
 *   ด้วยรายการเดิม · สถานะใหม่ทุกครั้ง = วาดใหม่ไม่รู้จบ
 * @param state  `{ base, byZone }` หรือ null
 * @param event  `{ base, zoneId, items, meta }` — `base` = ก้อน GET ที่หน้าถืออยู่ตอนรายงาน
 */
export function liveZoneFilesReport(state, { base, zoneId, items, meta } = {}) {
  if (!meta?.loaded) return state;
  if (zoneId === null || zoneId === undefined || zoneId === "") return state;
  const key = String(zoneId);
  const list = Array.isArray(items) ? items : [];
  const same = !!state && state.base === base;
  const byZone = same ? state.byZone : EMPTY;
  if (same && byZone[key] === list) return state;
  return { base, byZone: { ...byZone, [key]: list } };
}

/**
 * ก้อนรวมที่ทุกที่อ่าน — รายงานของแผงทับค่าของ GET **เฉพาะพื้นที่ที่แผงรายงานมา**
 * ⚠️ รายงานที่ผูกกับ GET ก้อนก่อน = ไม่นับ (กติกาข้อ 2)
 */
export function liveZoneFilesMerge(state, base) {
  const server = base && typeof base === "object" ? base : EMPTY;
  if (!state || state.base !== base) return server;
  const keys = Object.keys(state.byZone || EMPTY);
  if (!keys.length) return server;
  return { ...server, ...state.byZone };
}

/**
 * `const [filesByZone, reportFiles] = useLiveZoneFiles(data?.filesByZone)`
 * `reportFiles(zoneId, items, meta)` — ต่อเข้ากับ `onItemsChange` ของแผงไฟล์แนบ
 */
export default function useLiveZoneFiles(serverFilesByZone) {
  const base = serverFilesByZone && typeof serverFilesByZone === "object" ? serverFilesByZone : EMPTY;
  const [live, setLive] = useState(null);
  /* ก้อน GET ที่หน้าถืออยู่ตอนนี้ — ตัวรายงานคงที่ (ดูหัวไฟล์) จึงอ่านผ่าน ref ไม่ใช่ปิดทับค่าไว้ */
  const baseRef = useRef(base);
  baseRef.current = base;
  const filesByZone = useMemo(() => liveZoneFilesMerge(live, base), [live, base]);
  const reportFiles = useCallback((zoneId, items, meta) => {
    setLive((prev) => liveZoneFilesReport(prev, { base: baseRef.current, zoneId, items, meta }));
  }, []);
  return [filesByZone, reportFiles];
}
