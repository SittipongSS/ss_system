"use client";

import { Children } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";

// Canonical shell for every application module. Sales management established
// the visual hierarchy; keeping it here prevents module-specific drift.
export default function Workspace({
  icon,
  title,
  subtitle,
  headerRight,
  back,
  backActions,
  rail,
  toolbar,
  loading,
  hideHeader = false,
  className = "",
  children,
}) {
  return (
    <section className={`ui-workspace ${className}`.trim()}>
      {(back || backActions) && (
        <div className="ui-workspace-back-row">
          {back && (
            <Link href={back.href} className="ui-workspace-back">
              <ArrowLeft size={16} aria-hidden="true" /> {back.label}
            </Link>
          )}
          {backActions && <div className="ui-workspace-back-actions">{backActions}</div>}
        </div>
      )}

      {!hideHeader && (
        <header className="premium-header ui-workspace-header">
          <div className="header-content">
            <h1>
              {icon && <span className="premium-header-icon">{icon}</span>} {title}
            </h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerRight && <div className="ui-workspace-header-actions">{headerRight}</div>}
        </header>
      )}

      {rail && <div className="ui-workspace-rail">{rail}</div>}
      {toolbar && <div className="ui-workspace-toolbar">{toolbar}</div>}
      {loading ? <SkeletonRows rows={6} /> : children}
    </section>
  );
}

export function PageShell({ children, className = "" }) {
  return <div className={`ui-workspace ${className}`.trim()}>{children}</div>;
}

// Compatibility export for older pages. New loading surfaces use skeletons.
export function Spinner() {
  return <SkeletonRows rows={6} />;
}

export function WorkspaceSection({
  icon,
  title,
  subtitle,
  actions,
  children,
  bodyClassName = "",
  className = "",
}) {
  return (
    <section className={`ui-section ${className}`.trim()}>
      {(icon || title || actions) && (
        <header className="ui-section-header">
          <div className="ui-section-title">
            {icon}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="ui-section-actions">{actions}</div>}
        </header>
      )}
      <div className={`ui-section-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

/* แถบตัวเลขสรุป — **นับจำนวนช่องเอง** ไม่ต้องให้ผู้เรียกบอก
 *
 * 🐞 เดิม `.ui-metric-strip` ฮาร์ดโค้ด `repeat(4, …)` ⇒ หน้าไหนอยากได้ 5 ใบก็ทำไม่ได้
 * ต้องไปรื้อ CSS กลาง (หน้าคิวลีดติดเรื่องนี้อยู่ ใส่ SLA ครบสามด่านไม่ได้เลย) และถ้า
 * ใครเผลอใส่ 5 ใบ ใบที่ห้าจะไปห้อยเป็นแถวที่สองใบเดียวโดยไม่มีอะไรเตือน
 *
 * ⚠️ ใช้ `Children.toArray` ไม่ใช่ `Children.count` — toArray ทิ้ง null/false/undefined
 * ให้เอง ซึ่งจำเป็นเพราะการ์ดหลายใบเรนเดอร์แบบมีเงื่อนไข (`{canX && <Metric …/>}`)
 * ถ้านับรวมค่าเท็จเข้าไปด้วยจะได้คอลัมน์ว่างค้างไว้
 *
 * ⚠️ ส่งจำนวนผ่าน `data-cols` ไม่ใช่ inline style — `audit:ui` นับ inline style เป็นหนี้
 * ชั้นเก่าและงบของ "ส่วนกลาง" รูดขึ้นไม่ได้ · แอตทริบิวต์ยัง grep เจอง่ายกว่าด้วย
 * รองรับ 1–6 ช่อง (กฎอยู่ใน globals.css) เกินนั้นตกมาที่ 4 ให้เห็นว่าผิดทันที
 */
export function MetricStrip({ children, className = "", ...props }) {
  const cols = Children.toArray(children).length || 1;
  return (
    <section className={`ui-metric-strip ${className}`.trim()} data-cols={cols} {...props}>
      {children}
    </section>
  );
}

export function Metric({
  as: Element = "div",
  icon,
  label,
  value,
  note,
  tone,
  active = false,
  className = "",
  ...props
}) {
  return (
    <Element
      className={`ui-metric ${tone ? `is-${tone}` : ""} ${active ? "is-active" : ""} ${className}`.trim()}
      {...props}
    >
      {/* ไม่ส่ง icon = ไม่วาดกรอบไอคอน — .ui-metric-icon มีพื้นสี accent 11% ของตัวเอง
          ถ้าเรนเดอร์ทิ้งไว้เปล่า ๆ จะได้กล่องสีจาง ๆ ที่ไม่มีอะไรอยู่ข้างใน (เจอจริงที่
          การ์ด Funnel ลีด 8 ใบ ซึ่งตั้งใจไม่มีไอคอน) */}
      {icon ? <span className="ui-metric-icon">{icon}</span> : null}
      <span>
        <small>{label}</small>
        <strong>{value ?? "-"}</strong>
        {note && <em>{note}</em>}
      </span>
    </Element>
  );
}
