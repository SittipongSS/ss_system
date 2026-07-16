"use client";
// บริบทของเรื่องสอบถาม: ลูกค้า › โครงการ › ดีล — บังคับครบทุกช่อง (มติผู้ใช้ 2026-07-16)
// เพื่อให้ RD เปิดดูงานต้นทางได้เสมอ. ใช้ร่วม 2 จุด (โมดัลสร้าง + การ์ดแก้ไขบริบทใน
// หน้ารายละเอียดเรื่อง) เพื่อไม่ให้ฟอร์มเพี้ยนหากันแบบที่เคยเกิดกับฟอร์มดีล.
import SearchableSelect from "@/components/ui/SearchableSelect";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

export const EMPTY_INQUIRY_CONTEXT = { customerId: "", projectId: "", dealId: "" };

export const isInquiryContextComplete = (ctx) => !!(ctx?.customerId && ctx?.projectId && ctx?.dealId);

// ดีลที่สอบถามได้ต้องเชื่อมโครงการแล้ว (บริบทจึงครบ) และยังไม่ Lost
export const inquiryDealOptions = (deals, projectId) =>
  (deals || []).filter((deal) => deal.projectId && deal.projectId === projectId && deal.stage !== "lost");

const labelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
const hintStyle = { color: "var(--text-3)", fontSize: 12 };

export default function InquiryContextFields({ value, onChange, customers = [], projects = [], deals = [], disabled = false }) {
  const { customerId, projectId, dealId } = value || EMPTY_INQUIRY_CONTEXT;
  const customerProjects = projects.filter((project) => project.customerId === customerId);
  const projectDeals = inquiryDealOptions(deals, projectId);

  return (
    <>
      <label style={labelStyle}>
        {CUSTOMER_NAME_LABEL} <span style={{ color: "var(--red)" }}>*</span>
        <SearchableSelect
          entity="customer"
          value={customerId}
          disabled={disabled}
          onChange={(next) => onChange({ customerId: next, projectId: "", dealId: "" })}
          placeholder="ค้นหารหัส / ชื่อลูกค้า..."
          options={customers.map((customer) => ({
            value: customer.id,
            label: customer.arCode ? `${customer.arCode} — ${customer.name}` : customer.name,
            search: `${customer.arCode || ""} ${customer.name || ""}`,
          }))}
        />
      </label>

      <label style={labelStyle}>
        โครงการ <span style={{ color: "var(--red)" }}>*</span>
        <SearchableSelect
          entity="project"
          value={projectId}
          disabled={disabled || !customerId}
          onChange={(next) => onChange({ customerId, projectId: next, dealId: "" })}
          placeholder={customerId ? "ค้นหารหัส / ชื่อโครงการ..." : "เลือกลูกค้าก่อน"}
          options={customerProjects.map((project) => ({
            value: project.id,
            label: [project.code, project.name].filter(Boolean).join(" — ") || project.id,
            search: `${project.code || ""} ${project.name || ""}`,
          }))}
        />
        {customerId && !customerProjects.length && (
          <small style={hintStyle}>ลูกค้ารายนี้ยังไม่มีโครงการ — สร้างโครงการก่อนจึงสอบถามได้</small>
        )}
      </label>

      <label style={labelStyle}>
        ดีล <span style={{ color: "var(--red)" }}>*</span>
        <SearchableSelect
          entity="deal"
          value={dealId}
          disabled={disabled || !projectId}
          onChange={(next) => onChange({ customerId, projectId, dealId: next })}
          placeholder={projectId ? "ค้นหารหัส / ชื่อดีล..." : "เลือกโครงการก่อน"}
          options={projectDeals.map((deal) => ({
            value: deal.id,
            label: [deal.code, deal.title].filter(Boolean).join(" — ") || deal.id,
            search: `${deal.code || ""} ${deal.title || ""}`,
          }))}
        />
        {projectId && !projectDeals.length && (
          <small style={hintStyle}>โครงการนี้ยังไม่มีดีลที่เชื่อมไว้ — เชื่อมดีลเข้าโครงการที่หน้าดีลก่อน</small>
        )}
      </label>
    </>
  );
}
