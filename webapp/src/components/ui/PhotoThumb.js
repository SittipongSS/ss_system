"use client";
/* ── ภาพย่อที่ "พูด" เมื่อเปิดไม่ได้ ────────────────────────────────────────
 *
 * 🐞 ที่มา: ไฟล์แนบอยู่บน Google Drive · โทเคนหมดอายุ/สิทธิ์หลุดเมื่อไร `/file`
 * ตอบ 502 แล้ว `<img>` ที่พังจะเหลือกรอบว่าง (หรือไอคอนรูปแตกของเบราว์เซอร์)
 * ซึ่งอ่านเหมือนระบบกำลังโหลดค้าง — ผู้ใช้ถ่ายจอมาถาม 2026-08-19
 *
 * ⚠️ **ตัวเดียวใช้ทุกที่ที่โชว์ภาพย่อ** (ไฟล์แนบ + เธรดอัปเดต) — เดิมมีตัวรับรูปพัง
 * อยู่ที่ไฟล์แนบที่เดียว ส่วนเธรดปล่อยรูปแตกล้วน · เขียนสองที่เมื่อไรมันเลื่อนหากัน
 * (กฎเดียวกับฟอร์มสร้าง/แก้ใน AGENTS.md)
 *
 * ⚠️ **`onError` อย่างเดียวไม่พอ** — หน้าเรนเดอร์จากเซิร์ฟเวอร์ ⇒ รูปเริ่มโหลด
 * (และพัง) ตั้งแต่ก่อน React ผูก handler · เหตุการณ์ error ผ่านไปแล้วตอน hydrate
 * ⇒ ถามสภาพจริงตอนผูก ref ด้วย (`complete` = จบแล้ว · `naturalWidth === 0` = จบแบบพัง)
 *
 * ⚠️ จำ **src ที่พัง** ไม่ใช่ธง true/false — เปลี่ยนรูปในช่องเดิม (rev ใหม่ · เลื่อน
 * lightbox) แล้วธงค้างจะทำให้รูปที่ยังดีอยู่ขึ้นว่าเปิดไม่ได้
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";

export default function PhotoThumb({
  src, alt, className = "", style, label = "เปิดรูปไม่ได้", loading = "lazy",
}) {
  const [brokenSrc, setBrokenSrc] = useState(null);

  if (brokenSrc && brokenSrc === src) {
    /* ⚠️ คลาสยูทิลิตี้ ไม่ใช่ inline style — เพดานชั้นเก่าของ `audit:ui` นับ inline
       style ทั้งระบบและรูดลงอย่างเดียว */
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[var(--text-3)]">
        <ImageOff size={18} aria-hidden="true" />
        <span className="text-[11px]">{label}</span>
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      style={style}
      onError={() => setBrokenSrc(src)}
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setBrokenSrc(src);
      }}
    />
  );
}
