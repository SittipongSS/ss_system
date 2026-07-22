"use client";
// ศูนย์รวมการตั้งค่าระบบ — เมนู "ตั้งค่า" เดียวใน top nav ชี้มาที่นี่
// โชว์เฉพาะการ์ดที่สิทธิ์ของผู้ใช้เข้าถึงได้ (ปฏิทินเห็นทุกคนเพราะเป็นข้อมูลอ่านได้ทั้งระบบ)
import Link from "next/link";
import { Settings, CalendarDays, BellRing, Users, History, ChevronRight, Building2, Workflow, FileBadge2, FileSearch, WalletCards, Signature, Layers } from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { can, canManageCommercialPresets, canManageDocumentStandards } from "@/lib/permissions";
import styles from "./page.module.css";

export default function SettingsPage() {
  const role = useRole();
  const canChat = useCan("master:manage");
  const canAudit = useCan("audit:view");
  // เรียก hook ก่อนเสมอ (ห้ามอยู่หลัง || ที่ short-circuit ได้ — ลำดับ hook ต้องคงที่)
  const canUsersView = useCan("users:view");
  const canUsers = can(role, "users:manage") || canUsersView;
  const canDocuments = canManageDocumentStandards(role);
  const canCommercial = canManageCommercialPresets(role);

  const sections = [
    {
      title: "ข้อมูลองค์กร",
      desc: "ข้อมูลกลางที่มีผลกับทั้งระบบและต้องมีผู้รับผิดชอบชัดเจน",
      items: [
        {
          href: "/settings/company",
          icon: Building2,
          title: "ข้อมูลบริษัท",
          desc: "จัดการชื่อนิติบุคคล ที่อยู่ เลขผู้เสียภาษี และช่องทางติดต่อแบบมีเวอร์ชัน",
          show: canChat,
        },
      ],
    },
    {
      title: "มาตรฐานเอกสาร",
      desc: "ข้อมูลควบคุมที่ใช้ร่วมกันทุกระบบและต้องรักษาประวัติเมื่อมีการเปลี่ยนแปลง",
      items: [
        {
          href: "/settings/document-standards",
          icon: FileBadge2,
          title: "มาตรฐานเอกสาร",
          desc: "จัดการชื่อเอกสาร รหัสแบบฟอร์ม Revision วันที่มีผล สี Accent และรูปแบบเลขที่แบบมีเวอร์ชัน",
          show: canDocuments,
        },
        {
          href: "/settings/document-standards/quotation-preview",
          icon: FileSearch,
          title: "ตัวอย่างแม่แบบใบเสนอราคา",
          desc: "ตรวจ A4 ฟอนต์ สี ตารางงวด หมายเหตุ และลายเซ็นของ Master Template V2 โดยไม่กระทบเอกสารจริง",
          show: canDocuments,
        },
        {
          href: "/settings/commercial-presets",
          icon: WalletCards,
          title: "Commercial Preset",
          desc: "จัดการวิธีชำระ เงื่อนไข หมายเหตุ และงวดชำระตามทีมและประเภทดีลแบบมีเวอร์ชัน",
          show: canCommercial,
        },
      ],
    },
    {
      title: "การทำงานและการแจ้งเตือน",
      desc: "ค่ากลางที่กระทบปฏิทินและการสื่อสารของระบบ",
      items: [
        {
          href: "/settings/holidays",
          icon: CalendarDays,
          title: "วันหยุด (ปฏิทินทำการ)",
          desc: "วันหยุดบริษัทและวันหยุดนักขัตฤกษ์ที่ใช้คำนวณไทม์ไลน์โครงการ",
          show: true,
        },
        {
          href: "/settings/workflow-templates",
          icon: Workflow,
          title: "Workflow และ Timeline Template",
          desc: "จัดการขั้นตอน ระยะเวลา ผู้รับผิดชอบ และ dependency ของงานแต่ละประเภทแบบมีเวอร์ชัน",
          show: canChat,
        },
        {
          href: "/settings/cost-templates",
          icon: Layers,
          title: "แม่แบบต้นทุนตามประเภทสินค้า",
          desc: "โครงบรรทัดต้นทุน (หัวน้ำหอม เนื้อสาร บรรจุภัณฑ์ ค่าดำเนินการ) ที่ใบขอราคาจะกางให้อัตโนมัติ",
          show: canChat,
        },
        {
          href: "/settings/chat-webhooks",
          icon: BellRing,
          title: "แจ้งเตือน Google Chat",
          desc: "Webhook ของแต่ละ Space ที่ระบบใช้ส่งการ์ดแจ้งเตือน",
          show: canChat,
        },
      ],
    },
    {
      title: "การเข้าถึงและการตรวจสอบ",
      desc: "บัญชีผู้ใช้ สิทธิ์ และหลักฐานการเปลี่ยนแปลงข้อมูล",
      items: [
        {
          href: "/users",
          icon: Users,
          title: "ผู้ใช้งาน",
          desc: "บัญชีผู้ใช้ บทบาท ทีม และสิทธิ์เพิ่มเติมรายคน",
          show: canUsers,
        },
        {
          href: "/settings/signature-coverage",
          icon: Signature,
          title: "ความพร้อมลายเซ็น",
          desc: "ใครยังไม่มีลายเซ็นอิเล็กทรอนิกส์ทั้งที่ต้องอนุมัติใบเสนอราคา/Sale Order",
          show: canUsers,
        },
        {
          href: "/audit",
          icon: History,
          title: "บันทึกการใช้งาน",
          desc: "ประวัติการเพิ่ม แก้ และเปลี่ยนสถานะข้อมูลทั้งระบบ",
          show: canAudit,
        },
      ],
    },
  ].map((section) => ({ ...section, items: section.items.filter((item) => item.show) }))
    .filter((section) => section.items.length);

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Settings size={22} /></span>{" "}
            ตั้งค่าระบบ
          </h1>
          <p>การตั้งค่าและเครื่องมือดูแลระบบทั้งหมด รวมไว้ที่เดียว</p>
        </div>
      </div>

      <div className={styles.sectionList}>
        {sections.map((section) => (
          <section key={section.title} aria-labelledby={`settings-${section.title}`}>
            <header className={styles.sectionHeader}>
              <h2 id={`settings-${section.title}`}>{section.title}</h2>
              <p>{section.desc}</p>
            </header>
            <div className={styles.cardGrid}>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`glass-panel hover-card ${styles.navCard}`}>
                    <span className={styles.icon} aria-hidden="true"><Icon size={22} /></span>
                    <span className={styles.copy}>
                      <strong>{item.title}</strong>
                      <span>{item.desc}</span>
                    </span>
                    <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
