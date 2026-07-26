"use client";

import { useEffect, useState } from "react";

// ลูกค้าของ "เอกสาร/ทะเบียนที่มีอยู่แล้ว" ต้องอ่านรายตัวจาก /api/customers/[id]
// ห้าม find จากลิสต์ /api/customers เพราะลิสต์นั้นกรอง 3 ชั้นโดยเจตนา (ทีมที่ดูแล +
// เฉพาะที่อนุมัติ + ซ่อนลูกค้าพัก) เพื่อให้ picker สั้น — มติผู้ใช้ 2026-07-26: **คงการ
// กรองไว้เหมือนเดิม** ลิสต์จึงใช้ได้แค่ตอน "เลือก" ไม่ใช่ตอน "อ่านของเอกสารที่ผูกแล้ว"
//
// ถ้าใช้ลิสต์ ผลคือคนที่มองลูกค้ารายนั้นไม่เห็นจะได้ {} → ที่อยู่/ชื่อบนหน้าจอและบน
// เอกสารที่พิมพ์กลายเป็น "-" เงียบ ๆ ขึ้นกับว่าใครเปิด (เจอจริงที่ใบยื่นสรรพสามิต)
// GET รายตัวเปิดให้ทุกบทบาทอ่านได้ (record-level) จึงได้ข้อมูลครบเสมอ
//
// fallback = แถวที่ค้นจากลิสต์ได้ (ถ้ามี) ใช้แสดงระหว่างรอโหลดเพื่อไม่ให้จอกระพริบ
export function useCustomerRecord(customerId, fallback = null) {
  const [record, setRecord] = useState(null);

  useEffect(() => {
    if (!customerId) {
      setRecord(null);
      return undefined;
    }
    let alive = true;
    fetch(`/api/customers/${encodeURIComponent(customerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive) setRecord(data?.customer || null); })
      .catch(() => { if (alive) setRecord(null); });
    return () => { alive = false; };
  }, [customerId]);

  return record || fallback || {};
}

export default useCustomerRecord;
