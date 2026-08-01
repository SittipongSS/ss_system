"use client";
// ── ข้อความของผู้ใช้ที่มีลิงก์ในตัว ──────────────────────────────────────
//
// ⚠️ ประกอบจาก **ชิ้นส่วน** ที่ `parseRichText` คืนมา ไม่ใช่แปลงเป็น HTML —
// ข้อความมาจากผู้ใช้ การใช้ `dangerouslySetInnerHTML` คือช่อง XSS ตรง ๆ
// ทุกตัวอักษรที่ผู้ใช้พิมพ์ลงไปจึงถูกใส่ผ่าน text node ของ React เสมอ
//
// ห่อ `ReadableText` ไว้อีกชั้น (ย่อ/ขยายตามความสูงจริง) — คนละหน้าที่กัน:
// ที่นี่ตัดสิน "อะไรเป็นลิงก์" ส่วนนั่นตัดสิน "ยาวเกินไหม"
import Link from "next/link";
import ReadableText from "@/components/ui/ReadableText";
import { parseRichText } from "@/lib/master/richText";

export default function RichText({ text, lines = 6, className = "", style }) {
  const parts = parseRichText(text);
  // ไม่มีอะไรให้ทำเป็นลิงก์ = ใช้ของเดิมตรง ๆ (ทางเดินปกติของเธรดส่วนใหญ่)
  if (!parts.some((part) => part.type !== "text")) {
    return <ReadableText text={text} lines={lines} className={className} style={style} />;
  }

  return (
    <ReadableText text={text} lines={lines} className={className} style={style}>
      {parts.map((part, i) => {
        if (part.type === "url") {
          return (
            // rel ครบชุด: ลิงก์ภายนอกที่ผู้ใช้พิมพ์เอง ห้ามให้หน้าปลายทางเข้าถึง
            // window.opener ได้ และไม่ส่ง referrer ของระบบภายในออกไป
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="linklike">
              {part.text}
            </a>
          );
        }
        if (part.type === "doc") {
          // เส้นทางกลาง /go/<รหัส> — resolve เป็นหน้าจริงตอนกด (ดู lib/master/docRefs)
          return (
            <Link key={i} href={part.href} prefetch={false} className="linklike mono">
              {part.text}
            </Link>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </ReadableText>
  );
}
