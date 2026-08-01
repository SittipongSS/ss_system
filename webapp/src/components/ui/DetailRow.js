"use client";

import { useRouter } from "next/navigation";
import { isInteractiveTarget } from "@/lib/uiRules";

export default function DetailRow({ href, children, className = "", onClick, ...props }) {
  const router = useRouter();
  const navigate = () => { if (href) router.push(href); };
  return (
    <tr
      className={`detail-row ${className}`.trim()}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      /* ส่ง currentTarget (= <tr> ตัวนี้) เป็นขอบเขตเสมอ — ไม่งั้น role="link" ที่อยู่บน
         <tr> เองจะทำให้ isInteractiveTarget คืน true ทุกครั้ง แล้วแถวกดไม่ได้เลย */
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && href && !isInteractiveTarget(event.target, event.currentTarget)) navigate();
      }}
      onKeyDown={(event) => {
        if (href && (event.key === "Enter" || event.key === " ") && !isInteractiveTarget(event.target, event.currentTarget)) {
          event.preventDefault();
          navigate();
        }
      }}
      {...props}
    >
      {children}
    </tr>
  );
}

