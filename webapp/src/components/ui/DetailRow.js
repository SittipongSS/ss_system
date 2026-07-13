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
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && href && !isInteractiveTarget(event.target)) navigate();
      }}
      onKeyDown={(event) => {
        if (href && (event.key === "Enter" || event.key === " ") && !isInteractiveTarget(event.target)) {
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

