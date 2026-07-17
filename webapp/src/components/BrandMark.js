import { BRAND_LOGO_INNER, BRAND_LOGO_VIEWBOX } from "@/lib/brandLogo";

// โลโก้ในหน้าจอ — วาดเป็น inline SVG เพื่อให้เส้นรับสีจาก CSS (`color`) ได้
// จึงเปลี่ยนตามธีมเองโดยไม่ต้องมีไฟล์ภาพหลายเวอร์ชัน: กรมท่าบนพื้นสว่าง, ขาวบนพื้นเข้ม/บนแถบบน
export default function BrandMark({ height = 36, className, title = "Scent & Sense", style }) {
  return (
    <svg
      viewBox={BRAND_LOGO_VIEWBOX}
      height={height}
      className={className}
      role="img"
      aria-label={title}
      style={{ width: "auto", display: "block", ...style }}
      dangerouslySetInnerHTML={{ __html: BRAND_LOGO_INNER }}
    />
  );
}
