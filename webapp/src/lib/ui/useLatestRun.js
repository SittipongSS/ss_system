"use client";
import { useRef } from "react";
import { createLatestRun } from "./latestRun";

/**
 * ตัวกันคำตอบมาผิดลำดับสำหรับหน้ารายการที่โหลดใหม่ตามตัวกรอง
 *
 * ```js
 * const startRun = useLatestRun();
 * const load = useCallback(async () => {
 *   const isLatest = startRun();          // ← จองรอบ **ก่อน** ยิง
 *   const rows = await fetchRows(month);
 *   if (!isLatest()) return;              // ← ตัวกรองขยับไปแล้ว ทิ้งคำตอบนี้เงียบ ๆ
 *   setRows(rows);
 * }, [month]);
 * ```
 *
 * ⚠️ **ต้องเช็คก่อนทุก `setState` ที่เป็นผลของคำขอนั้น** ไม่ใช่แค่ตัวแถว — รวมถึง
 * `setError` / `setLoading` / ป้ายที่อ่านจากเฮดเดอร์ · เช็คแค่บางตัวแปลว่าจอจะกลาย
 * เป็นลูกผสมของสองรอบ ซึ่งอ่านไม่ออกยิ่งกว่าเดิม
 *
 * ⚠️ **ตัวนับผูกกับ component ไม่ใช่กับ URL** — หนึ่งหน้าที่โหลดหลายรายการอิสระ
 * (เช่นตารางกับ KPI ที่มีตัวกรองคนละชุด) ต้องเรียก hook นี้แยกชุดกัน ไม่งั้นการโหลด
 * ของรายการหนึ่งจะไปทิ้งคำตอบของอีกรายการ
 *
 * เหตุผลที่ไม่ใช้ AbortController อยู่ใน `latestRun.js`
 */
export default function useLatestRun() {
  const ref = useRef(null);
  // สร้างครั้งเดียวต่อ component แล้วคงตัวเดิมตลอด — ผู้เรียกเอาไปใส่ deps ได้ปลอดภัย
  if (!ref.current) ref.current = createLatestRun();
  return ref.current;
}
