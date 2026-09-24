"use client";
// ── ภาระงาน AE สำหรับกล่องมอบหมาย ────────────────────────────────────────
//
// ⚠️ **ยิงเฉพาะคนที่มอบหมายได้จริง** — ด่านเดียวกับ route (superuser / ตำแหน่งที่เห็นระดับทีม)
// คนอื่นเปิดหน้าลีดแล้วไม่ต้องมีคำขอนี้เลย (AE ทุกคนเปิดคิวลีดทุกวัน)
//
// ⚠️ ล้มแล้วคืนก้อนว่าง ไม่โยนต่อ — ตัวเลขเป็นตัวช่วยตัดสินใจ ไม่ใช่เงื่อนไขของการมอบหมาย
// กล่องยังต้องเปิดได้และมอบหมายได้แม้ตัวเลขไม่มา (ขึ้น 0 ทุกช่อง)
import { useEffect, useState } from "react";
import { hasTeamScope, isSuperuser } from "@/lib/permissions";
import { apiFetch } from "@/lib/apiFetch";

export const canReadLeadWorkload = (role) =>
  isSuperuser(role) || hasTeamScope(role);

export default function useLeadWorkload(role) {
  const [workload, setWorkload] = useState(null);
  const allowed = canReadLeadWorkload(role);

  useEffect(() => {
    if (!allowed) { setWorkload(null); return undefined; }
    let alive = true;
    apiFetch("/api/sales-planning/leads/workload", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (alive) setWorkload(body?.workload || null); })
      .catch(() => { if (alive) setWorkload(null); });
    return () => { alive = false; };
  }, [allowed]);

  return workload;
}
