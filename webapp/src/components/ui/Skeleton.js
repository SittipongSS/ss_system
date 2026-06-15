"use client";

// แถบ skeleton เดี่ยว — ใช้ .skeleton (มี shimmer) จาก globals.css
export function Skeleton({ height = 16, width = "100%", radius = 6, style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius, ...style }} />;
}

// บล็อกโหลดมาตรฐาน — หลายแถบใน glass-panel แทนข้อความ "กำลังโหลด..."
export default function SkeletonRows({ rows = 6 }) {
  return (
    <div className="glass-panel" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i % 3 === 2 ? "55%" : i % 2 ? "80%" : "100%"} />
      ))}
    </div>
  );
}
