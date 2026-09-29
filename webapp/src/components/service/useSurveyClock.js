"use client";
// ── นาฬิกาของจอหน้างาน — "ตอนนี้" เวลาไทย เดินทีละนาที (แผน §10.5 S8 · §4 SurveyFieldBar) ─────────────────
//
// ⭐ แถบของช่างนับถอยหลังถึงเวลานัด ("นัด 10:00 · อีก 8 นาที") และกล่องส่งงานบอกช่วงที่จะปิด ("(10:12–11:46)")
//   ⇒ ทั้งสองอ่าน `nowKey` ตัวเดียวจากที่นี่ · ตัวตัดสิน (`surveyFieldView.js`) ไม่อ่านนาฬิกาเอง (ทดสอบด้วยค่าคงที่ได้)
// ⚠️ เดินตรงขอบนาที ไม่ใช่ทุก 60 วิ นับจากตอนเปิดหน้า — ไม่งั้นตัวเลขบนแถบช้ากว่านาฬิกาจริงได้เกือบนาที
//   (ขอบนาที UTC = ขอบนาทีไทย เพราะโซนไทยห่าง UTC เป็นชั่วโมงเต็ม)
// ⚠️ ค่าแรกเป็น `null` จนกว่าจะอยู่ฝั่งเบราว์เซอร์ — server กับ client ต้องวาดเหมือนกัน (หน้าโชว์โครงรอข้อมูลก่อนอยู่แล้ว)
import { useEffect, useState } from "react";
import { surveyNowKey } from "@/lib/service/surveyFieldView";

const MINUTE_MS = 60_000;

/** @returns {string|null} `'YYYY-MM-DD HH:MM'` เวลาไทย */
export default function useSurveyClock() {
  const [nowKey, setNowKey] = useState(null);
  useEffect(() => {
    let timer = null;
    const tick = () => {
      setNowKey(surveyNowKey(new Date().toISOString()));
      timer = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return nowKey;
}
