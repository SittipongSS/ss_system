"use client";
/* ── ภาพรวมการตั้งค่า ────────────────────────────────────────────────────
 *
 * ⭐ มติผู้ใช้ 2026-08-20 (ปรับ 2026-08-22): มีรายการตั้งค่าค้างข้างทุกหน้าแล้ว —
 * ตอนนี้อยู่บน **แถบเมนูของระบบ** ชุดเดียวกับทุกระบบ (ไม่ใช่เปลือกเฉพาะของตั้งค่า
 * อีกแล้ว · ดู `settingsMenuItems`) ⇒ หน้านี้ **เลิกเป็นสารบัญ** — สารบัญอยู่บนแถบ
 * แล้ว การทำซ้ำอีกหน้าคือรายการสองชุดที่ต้องมาไล่แก้ให้ตรงกัน · หน้านี้ตอบคำถาม
 * ที่แถบตอบไม่ได้แทน:
 *   "ตอนนี้ระบบตั้งค่าไว้ว่าอะไร และมีอะไรค้างให้ดูแลบ้าง"
 *
 * ⚠️ ตัวเลขทุกใบมาจาก API ของหน้านั้น ๆ เอง — ห้ามคำนวณสูตรใหม่ที่นี่ ไม่งั้น
 * เลขบนภาพรวมกับเลขในหน้าจริงจะเพี้ยนกัน (บทเรียนเดียวกับ handoffQueue ที่รวม
 * ตัวตัดสินไว้ที่เดียวแล้วให้ทุกหน้าจอยืมไปแสดง)
 *
 * ⚠️ โหลดเฉพาะที่ผู้ใช้คนนี้มีสิทธิ์เปิดหน้านั้นจริง — ยิงทุกใบทุกคนจะได้ 403
 * เต็มคอนโซล และการ์ดว่างที่อธิบายตัวเองไม่ได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, FileWarning, Settings, Signature, Workflow } from "lucide-react";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import DeniedNotice from "@/components/ui/DeniedNotice";
import { useCapUser } from "@/lib/roleContext";
import { settingsNavForUser } from "@/config/settingsNav";
import { canUser } from "@/lib/permissions";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const jsonOrNull = async (url, signal) => {
  try {
    const res = await apiFetch(url, { cache: "no-store", signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export default function SettingsOverviewPage() {
  const user = useCapUser();
  const groups = useMemo(() => settingsNavForUser(user), [user]);

  const seesSignatures = canUser(user, "users:view") || canUser(user, "users:manage");
  const seesTemplates = canUser(user, "master:manage");

  const [signature, setSignature] = useState(null);
  const [templates, setTemplates] = useState(null);

  const load = useCallback(async (signal) => {
    const [signatureData, templateData] = await Promise.all([
      seesSignatures ? jsonOrNull("/api/admin/signature-coverage", signal) : null,
      seesTemplates ? jsonOrNull("/api/workflow-templates", signal) : null,
    ]);
    setSignature(signatureData?.summary || null);
    setTemplates(Array.isArray(templateData) ? templateData : templateData?.templates || null);
  }, [seesSignatures, seesTemplates]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /* งานค้างที่ "มีคนต้องไปกด" เท่านั้น — ตัวเลขที่เป็นศูนย์ยังโชว์ เพราะศูนย์คือ
     คำตอบที่มีความหมาย ("ไม่มีอะไรค้าง") ต่างจากการซ่อนซึ่งอ่านเป็น "ไม่รู้" */
  const missingSignatures = signature ? Math.max(0, (signature.required || 0) - (signature.requiredReady || 0)) : null;
  const blockedDocuments = signature ? (signature.blockedQuotations || 0) + (signature.blockedSubmissions || 0) : null;
  const draftTemplates = templates ? templates.filter((row) => row?.draft).length : null;

  const attention = [
    missingSignatures !== null && {
      key: "signature",
      href: "/settings/signature-coverage",
      icon: <Signature size={16} />,
      label: "คนที่ยังไม่มีลายเซ็น",
      value: missingSignatures,
      note: missingSignatures ? "อนุมัติเอกสารไม่ได้จนกว่าจะอัปโหลด" : "ผู้อนุมัติมีลายเซ็นครบแล้ว",
      tone: missingSignatures ? "warning" : undefined,
    },
    blockedDocuments !== null && {
      key: "blocked",
      href: "/settings/signature-coverage",
      icon: <FileWarning size={16} />,
      label: "เอกสารที่ค้างเพราะลายเซ็น",
      value: blockedDocuments,
      note: blockedDocuments ? "ใบเสนอราคา/ใบสั่งขายที่รออนุมัติอยู่" : "ไม่มีใบไหนติดเรื่องลายเซ็น",
      tone: blockedDocuments ? "warning" : undefined,
    },
    draftTemplates !== null && {
      key: "drafts",
      href: "/settings/workflow-templates",
      icon: <Workflow size={16} />,
      label: "แม่แบบที่มีฉบับร่างค้าง",
      value: draftTemplates,
      note: draftTemplates ? "ร่างยังไม่มีผลจนกว่าจะเผยแพร่" : "ไม่มีร่างค้างในระบบ",
      tone: draftTemplates ? "warning" : undefined,
    },
  ].filter(Boolean);

  return (
    <Workspace
      icon={<Settings size={22} />}
      title="ตั้งค่าระบบ"
      // จอแคบรางอยู่ "ด้านบน" ไม่ใช่ซ้าย — ข้อความจึงเรียกชื่อแถบ ไม่ระบุทิศ
      subtitle="ค่ากลางที่มีผลกับทุกระบบ — เลือกเรื่องที่จะแก้จากแถบเมนู"
    >
      {/* ⚠️ `.ui-section` และ `.ui-metric-strip` ไม่มี margin ของตัวเอง — ระยะห่าง
          ระหว่างก้อนมาจากตัวห่อ `flex flex-col gap-4` เหมือนหน้าอื่นที่ใช้คู่นี้
          (RD · ใบสั่งขาย · โครงการ) ไม่มีตัวห่อ = ขอบสองกล่องชนกันเป็นเส้นคู่ */}
      <div className="flex flex-col gap-4">
      <DeniedNotice />
      {attention.length > 0 && (
        <WorkspaceSection
          icon={<AlertTriangle size={18} />}
          title="ที่ต้องดูแล"
          subtitle="ค่าที่ตั้งไว้แล้วแต่ยังไม่พร้อมใช้จริง — กดที่ใบเพื่อไปหน้าที่แก้ได้"
        >
          <MetricStrip>
            {attention.map((item) => (
              <Metric
                key={item.key}
                as={Link}
                href={item.href}
                icon={item.icon}
                label={item.label}
                value={item.value}
                note={item.note}
                tone={item.tone}
              />
            ))}
          </MetricStrip>
        </WorkspaceSection>
      )}

      {groups.map((group) => (
        <WorkspaceSection key={group.key} title={group.title} subtitle={group.blurb}>
          <div className={styles.itemList}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={styles.itemRow}>
                  <span className={styles.itemIcon} aria-hidden="true"><Icon size={18} /></span>
                  <span className={styles.itemCopy}>
                    <strong>{item.title}</strong>
                    <span>{item.blurb}</span>
                  </span>
                  <ChevronRight size={16} className={styles.itemChevron} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </WorkspaceSection>
      ))}
      </div>
    </Workspace>
  );
}
