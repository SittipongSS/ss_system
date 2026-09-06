"use client";

import { createContext, useContext, useMemo, useState } from "react";

/* ── แถบระบุตัวใบที่ปักใต้แถบเมนู (2026-09-06) ────────────────────────────────
   คำขอจากผู้ใช้: บนหน้ารายละเอียดคำร้อง เลื่อนลงไปอ่านข้อความยาว ๆ แล้ว **ลืมว่า
   กำลังดูใบไหน** เพราะหัวใบเลื่อนหายไปหมด

   ⭐ สิ่งที่ตรึงคือ **ตัวตนของใบ + ทางกลับ** เท่านั้น ไม่ใช่หัวใบทั้งใบ
   วัดจริง 2026-09-06: หัวใบสูง 208–337px ⇒ ตรึงทั้งใบกินจอ 41–81% (มือถือ 390×740
   เหลือพื้นที่อ่าน **18.9px**) และทำให้เงื่อนไข `จุดจอด + กล่อง + 24 ≤ สูงจอ`
   ตก 7 จาก 11 ขนาดจอ = หัวตารางที่เพิ่งปักได้จะพังกลับ · แถบ 49px ตก 0/11

   🚫 **ไม่มีป้ายสถานะบนแถบใน v1 — จงใจ**
   สถานะอยู่บน Control Panel ที่รางขวาซึ่งตรึงได้จริงแล้วตั้งแต่ #1630 · การใส่ซ้ำบน
   แถบคือ "พูดสองที่" ซึ่งผู้ใช้ทักมาแล้วสองรอบ (ม-101.2) และเป็นเหตุผลที่หน้าคำร้อง
   จงใจไม่มีป้ายสถานะบนหัวใบตั้งแต่แรก · ที่จอ ≤1050px รางไหลลงท้ายหน้า ตรงนั้นป้าย
   บนแถบจะมีค่าจริง — แต่ยังไม่ทำ เพราะ `badges` ที่หน้าส่งมาเป็น React node ไม่ใช่
   ข้อความ จะดึง "ป้ายตัวแรก" ออกมาแบบเชื่อถือได้ไม่ได้ · ต้องเปลี่ยนสัญญาของ
   DetailOverview ก่อน ซึ่งเป็นงานคนละรอบ

   ⚠️ ห้ามใส่ปุ่มระดับใบลงแถบ — ม-49/ม-57 บังคับว่าปุ่มระดับใบอยู่ Control Panel
   ที่เดียว · วัดแล้ว 13 ใน 17 หน้าที่ใช้ DetailOverview มี `actions` เป็น 0 ปุ่มอยู่แล้ว */

const DetailPinContext = createContext(null);

export function DetailPinProvider({ children }) {
  /* `null` = หน้านี้ไม่มีหัวใบ ⇒ ไม่มีแถบ · ออบเจ็กต์ = มีหัวใบและกำลังบอกว่าปักอยู่ไหม */
  const [record, setRecord] = useState(null);
  const value = useMemo(() => ({ record, setRecord }), [record]);
  return <DetailPinContext.Provider value={value}>{children}</DetailPinContext.Provider>;
}

/* คืน `null` เมื่ออยู่นอก provider — คอมโพเนนต์ที่เรียกต้องรับมือได้ ไม่ใช่พัง
   (หน้าเดี่ยว/หน้าพิมพ์ที่ไม่ได้ห่อด้วย AppLayout ก็ต้องเรนเดอร์ผ่าน) */
export function useDetailPin() {
  return useContext(DetailPinContext);
}

/* ── ตัวแถบ ────────────────────────────────────────────────────────────────
   🔴 **ที่แขวนคือจุดตายของงานนี้** — แถบต้องเป็นลูกของ `.page` เท่านั้น
   1) sticky ถูกจำกัดด้วยกล่องแม่ · ถ้าห่อรวมกับหัวใบ แถบจะหลุดปักพอดีตอนที่หัวใบ
      พ้นจอ = ตรงข้ามกับที่ต้องการ
   2) กล่องแม่ของ `<DetailOverview>` **ไม่เหมือนกันสักหน้า** (`.ui-workspace` ·
      `div.flex.flex-col.gap-5` ของหน้าดีล · `.documentColumn` ของใบเสนอราคา ·
      `styles.page` ของงาน/ลีด) ⇒ วางข้างหัวใบต้องแก้ 16 หน้าและได้ระยะคนละค่า
   3) `.ui-workspace.ui-workspace > * { margin-block: 0 }` (0,2,0) จะกลืนระยะที่
      แถบพยายามหักออก · `.page` เป็นบล็อกเปล่ามีแต่ padding จึงไม่มีปัญหานั้น

   ที่แขวนสูง **0** (`position: sticky` + `height: 0`) ตัวแถบเป็น `absolute` ข้างใน
   ⇒ ไม่กินที่ในโฟลว์เลย · ความสูงที่ "บัง" ถูกจองไว้ล่วงหน้าผ่าน `--detail-pin-h`
   ซึ่งเข้าสูตร `--scroll-anchor-top` แล้ว จึงไม่มีการกระตุกตอนแถบโผล่/หาย */
export function DetailPinBar() {
  const pin = useDetailPin();
  const record = pin?.record;
  return (
    <div className="ui-detail-pin" aria-hidden={record?.pinned ? undefined : "true"}>
      {record ? (
        <div className={`ui-detail-pin-bar${record.pinned ? " is-on" : ""}`}>
          {/* ทางกลับใช้ประวัติเบราว์เซอร์ ไม่ใช่ href — หน้ารายละเอียดเข้าได้จากหลายทาง
              (ทะเบียน · กระดิ่ง · ลิงก์ในใบอื่น) ท่าเดียวกับหน้าสินค้าที่ทำไปแล้ว
              ⚠️ ต้องเป็น <button> จริง ไม่ใช่ <a href="#"> — คลาส button.ui-workspace-back
              คืนค่า UA ให้ครบแล้ว (globals.css) */}
          <button
            type="button"
            className="ui-workspace-back"
            onClick={() => {
              if (typeof window === "undefined") return;
              if (window.history.length > 1) window.history.back();
            }}
          >
            <span aria-hidden="true">←</span> กลับ
          </button>
          <span className="ui-detail-pin-id">
            {record.eyebrow ? <small>{record.eyebrow}</small> : null}
            <strong>{record.title}</strong>
          </span>
          {record.description ? <span className="ui-detail-pin-sum">{record.description}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
