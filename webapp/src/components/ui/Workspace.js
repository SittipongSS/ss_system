"use client";

import thaiText from "@/components/ThaiText";
import { Children, useId } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SkeletonRows, { Skeleton } from "@/components/ui/Skeleton";
import { NA, naText } from "@/lib/format";

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
            {subtitle && <p>{thaiText(subtitle)}</p>}
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
  id,
  icon,
  title,
  subtitle,
  actions,
  children,
  bodyClassName = "",
  className = "",
}) {
  return (
    // `id` = จุดให้ลิงก์ในหน้าเดียวกันกระโดดมาหา (เช่น #unassigned ของหน้าจัดทีม)
    // 🐞 เดิมไม่รับ ⇒ ผู้เรียกส่งมาแล้วหายเงียบ ลิงก์ในหน้าไม่พาไปไหน
    <section id={id} className={`ui-section ${className}`.trim()}>
      {(icon || title || actions) && (
        <header className="ui-section-header">
          <SectionTitle icon={icon} title={title} subtitle={subtitle} />
          {actions && <div className="ui-section-actions">{actions}</div>}
        </header>
      )}
      <div className={`ui-section-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

/* หัวการ์ดชุดเดียวของ WorkspaceSection และ ListPanel — markup สองสำเนาจะเพี้ยนหากันเสมอ
   (AGENTS.md) · `titleId` มีเฉพาะ ListPanel (ผูก aria-labelledby) ⇒ WorkspaceSection
   ได้ DOM เดิมเป๊ะ ไม่มี id บน h2 */
function SectionTitle({ icon, title, subtitle, titleId }) {
  return (
    <div className="ui-section-title">
      {icon}
      <div>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p>{typeof subtitle === "string" ? thaiText(subtitle) : subtitle}</p>}
      </div>
    </div>
  );
}

/* ── แผงรายการ — รายการทุกชุดอยู่ในแผงเดียว (มติผู้ใช้ 2026-09-15) ──────────────
   หัว (ไอคอน · ชื่อ · คำอธิบาย | ป้ายจำนวนขวาสุด) → แถบเครื่องมือ → เนื้อ → Pager
   กติกาเต็มอยู่ที่ UI_DESIGN_SYSTEM.md §รายการ — ListPanel · ด่าน scripts/listPanelShape.mjs

   ⚠️ `count` เป็นของบังคับ (ข้อความพร้อมหน่วย) — ระหว่างโหลดส่ง `null` ได้ขีด "—"
   ⚠️ `loading` แทนที่ **เฉพาะเนื้อ** — หัวกับแถบเครื่องมือยังอยู่ ช่องค้นหาไม่หลุดโฟกัส
      ระหว่างโหลดใหม่ (ต่างจาก `Workspace loading` ที่ถอดทั้งหน้า)
   ⚠️ ป้ายจำนวนเป็น `role="status"` เฉพาะแผงที่มีแถบเครื่องมือ — ตัวเลขเปลี่ยนตามที่พิมพ์
      ค้นหา จึงต้องประกาศ · แผงที่ไม่มีเครื่องมือ ตัวเลขไม่ขยับเอง ไม่ต้องพูด */
export function ListPanel({
  id,
  icon,
  title,
  subtitle,
  count,
  actions = null,
  toolbar = null,
  loading = false,
  skeletonRows = 6,
  className = "",
  bodyClassName = "",
  children,
}) {
  const titleId = useId();
  if (process.env.NODE_ENV !== "production" && count === undefined) {
    console.error("ListPanel: ต้องส่ง count (ข้อความพร้อมหน่วย) — ระหว่างโหลดส่ง null");
  }
  const shown = count === null || count === undefined || count === "" ? NA : count;
  return (
    <section id={id} className={`ui-section ui-list-panel ${className}`.trim()} aria-labelledby={titleId}>
      <header className="ui-section-header ui-list-panel-header">
        <SectionTitle icon={icon} title={title} subtitle={subtitle} titleId={titleId} />
        {actions ? <div className="ui-section-actions">{actions}</div> : null}
        <span className="ui-badge ui-list-panel-count" role={toolbar ? "status" : undefined}>{shown}</span>
      </header>
      <div className={`ui-section-body ui-list-panel-body ${bodyClassName}`.trim()} aria-busy={loading || undefined}>
        {toolbar ? <div className="toolbar ui-list-panel-toolbar">{toolbar}</div> : null}
        {loading ? (
          <div className="ui-list-panel-skeleton" aria-hidden="true">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <Skeleton key={i} width={i % 3 === 2 ? "55%" : i % 2 ? "80%" : "100%"} />
            ))}
          </div>
        ) : children}
      </div>
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
        <strong>{naText(value)}</strong>
        {note && <em>{note}</em>}
      </span>
    </Element>
  );
}
