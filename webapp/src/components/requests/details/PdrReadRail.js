"use client";
// ── ฝั่งอ่านของแบบฟอร์ม PDR — รางหมวด + สรุป (ของกลางสองหัวข้อ) ───────────
//
// ⭐ **ยกออกมาเป็นของกลางตอนพัฒนาสูตรได้รูปแบบ NPD** (มติผู้ใช้ 2026-09-09) — ก่อนหน้านี้
// ก้อนนี้อยู่ในตัว `ScentDevDetail` และเป็นทางเดียวที่อ่าน PDR ที่กรอกไว้ได้ ⇒ หัวข้อที่สอง
// ที่ใช้แบบฟอร์มเดียวกันจะมีที่ *กรอก* แต่ไม่มีที่ *อ่าน* (ฟอร์มบันทึกได้ เอกสารพิมพ์ได้
// แต่บนหน้ารายละเอียดไม่เห็นอะไรเลย)
//
// ⚠️ **ฝั่งกรอกไม่ได้อยู่ที่นี่** — โหมดแก้ใช้ `RequestForm` ตัวเดียวกับตอนเปิดใบ
// (กฎ AGENTS.md "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" · และมี ratchet ห้าม
// `<PdrForm>` โผล่ในหน้ารายละเอียด — ดู `pdrFields.test.mjs`)
import { useState } from "react";
import SectionRail from "@/components/ui/SectionRail";
import PdrSummary from "@/components/requests/PdrSummary";
import { PDR_SECTIONS, pdrRailSectionsFromRequest } from "@/lib/requests/pdrFields";
import styles from "./details.module.css";

export default function PdrReadRail({ request }) {
  const [sectionKey, setSectionKey] = useState(PDR_SECTIONS[0].key);
  return (
    <div className={styles.pdrBlock}>
      <SectionRail
        // ⭐ รายชื่อหมวดมาจากที่เดียว (`pdrRailSections`) และมี "บรีฟกลิ่น"
        // เป็นหมวดของตัวเองเหมือนฝั่งกรอก — เดิมบรีฟถูกวาดค้างไว้บนสุดนอกราง
        // ⇒ เลือกหมวด 4 แล้วยังเห็นบรีฟอยู่ข้างบน อ่านเหมือนสองหน้ามาต่อกัน
        sections={pdrRailSectionsFromRequest(request, request.briefs || [], request.targets || [])}
        value={sectionKey}
        onChange={setSectionKey}
        ariaLabel="หมวดของแบบฟอร์ม"
      >
        {/* ⚠️ **ไม่มีปุ่มระดับใบตรงนี้** (มติผู้ใช้ 2026-08-09) — "ออกเอกสาร" กับ
            "แก้ไข" ทำอะไรกับ *ทั้งใบ* จึงอยู่ที่แผงจัดการ · ปุ่มระดับใบกระจายสองที่
            คือสิ่งที่ ม-49 ห้ามไว้ */}
        <PdrSummary request={request} briefs={request.briefs || []} section={sectionKey} />
      </SectionRail>
    </div>
  );
}
