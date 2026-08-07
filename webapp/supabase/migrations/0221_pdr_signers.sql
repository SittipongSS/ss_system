-- ── 0221 · ชื่อผู้เซ็นบนแบบฟอร์ม PDR (ม-45) ─────────────────────────────
--
-- ตารางลายเซ็นของ FM-RD-01 มี 7 แถว · ระบบรู้จริงแค่ 2 แถว
--   Account Executive             ← `requestedByName`
--   Account Executive Supervisor  ← `approvedByName` (ประตูหัวหน้า mig 0216)
-- อีก 5 แถวไม่มีที่เก็บ ⇒ พิมพ์ออกมาเป็นเส้นว่างทุกใบ
--
-- ⭐ **มติผู้ใช้ 2026-08-07: "ตำแหน่งบนเอกสารก่อน ยังไม่ต้องเป็น role จริง"**
-- ⇒ เก็บเป็น **ชื่อบนกระดาษ** ไม่ใช่ role ในระบบ · ไม่แตะทะเบียนตำแหน่ง ไม่แตะสิทธิ์
-- ไม่แตะการมอบหมายงาน · วันที่สามตำแหน่งนี้กลายเป็น role จริง ค่อยย้ายเป็น id
--
-- ⚠️ **เก็บชื่อ ไม่ใช่ id โดยเจตนา (คราวนี้)** — Perfumer/PD Chemist/Project Coordinator
-- ยังไม่มีตัวตนในระบบ ผูก id ไปหาอะไรไม่ได้ · แต่ก็แปลว่า **ชื่อจะไม่ตามคนที่เปลี่ยน
-- ชื่อ/เปลี่ยนงาน** ซึ่งเป็นข้อแลกที่ตั้งใจ (โรค `person-name-copies-vs-identity`
-- ฉบับย่อ) ⇒ ยอมได้เพราะมันคือ *ใครเซ็นกระดาษใบนี้ ณ วันนั้น* ซึ่งเป็นข้อเท็จจริง
-- ที่ไม่ควรเปลี่ยนตามคนอยู่แล้ว
--
-- ⚠️ ไม่มีช่องไหนบังคับ และ **ไม่บล็อกการปิดเรื่อง** — แบบหน้าจอ §08 เขียนว่า
-- Final Approval "ปิดไม่ได้" แต่นั่นเป็นการเปลี่ยนสายงาน ไม่ใช่เรื่องของชื่อบนกระดาษ
-- ⇒ อยู่นอกขอบเขตรอบนี้โดยตั้งใจ
--
-- ⚠ รันมือบน Supabase SQL Editor · รันหลัง 0220

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "pdrSignSalesManager"  text
    CHECK ("pdrSignSalesManager"  IS NULL OR length("pdrSignSalesManager")  <= 200),
  ADD COLUMN IF NOT EXISTS "pdrSignPerfumer"      text
    CHECK ("pdrSignPerfumer"      IS NULL OR length("pdrSignPerfumer")      <= 200),
  ADD COLUMN IF NOT EXISTS "pdrSignChemist"       text
    CHECK ("pdrSignChemist"       IS NULL OR length("pdrSignChemist")       <= 200),
  ADD COLUMN IF NOT EXISTS "pdrSignCoordinator"   text
    CHECK ("pdrSignCoordinator"   IS NULL OR length("pdrSignCoordinator")   <= 200),
  ADD COLUMN IF NOT EXISTS "pdrSignFinalApprover" text
    CHECK ("pdrSignFinalApprover" IS NULL OR length("pdrSignFinalApprover") <= 200);

COMMENT ON COLUMN public.dept_requests."pdrSignPerfumer" IS
  'ชื่อผู้เซ็นบนกระดาษ ไม่ใช่ role ในระบบ (ม-45) — ระบบยังไม่มีตำแหน่ง Perfumer';
