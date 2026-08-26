// ── รายงานลีดสำหรับดาวน์โหลด (Excel) ────────────────────────────────────────
//
// ⭐ **แถวดิบ ไม่ใช่ตัวเลขสรุป** (มติผู้ใช้ 2026-08-27) — ตัวเลขสรุปดูบนแท็บ KPI ได้อยู่แล้ว
// สิ่งที่ดูบนจอไม่ได้คือการเอาไปหั่นเอง (pivot ตามช่องทาง/ทีม/คนกรอก) ⇒ ไฟล์นี้จึงเป็น
// หนึ่งลีดหนึ่งแถว ไม่มีการรวมยอดใด ๆ มาให้
//
// ⚠️ **ตัวจัดรูปอยู่ที่นี่ไฟล์เดียว** ไม่ใช่ในไฟล์ที่ต่อกับ exceljs — คอลัมน์กับการแปลงค่า
// เป็นกติกาของรายงาน ส่วนการวาดชีตเป็นเรื่องของเครื่องมือ แยกกันแล้วเทสต์ได้โดยไม่ต้อง
// สร้างไฟล์จริง (ท่าเดียวกับ productCategoryWorkbook ที่แยก import จาก workbook)

import { businessDate } from '@/lib/businessDate';
import {
  LEAD_CHANNEL_LABELS, LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS, leadLostText,
} from '@/lib/sales/leads';
import { TEAM_LABELS } from '@/lib/permissions';

/* 🔴 ไฟล์นี้มี **ชื่อ เบอร์โทร อีเมล ของลูกค้า** — ต่างจากแท็บ KPI ที่เห็นแต่ตัวเลขรวม
   "ดูตัวเลขรวมได้" กับ "โหลดรายชื่อลูกค้าออกไปได้" เป็นคนละสิทธิ์ (มติผู้ใช้ 2026-08-27:
   เฉพาะ Marketing กับ Admin) ⇒ ผู้สังเกตการณ์/ผู้บริหารที่เห็นแท็บ KPI **ไม่ได้ไฟล์นี้**
   ⚠️ `ae_supervisor` ก็ไม่ได้ ทั้งที่เป็น superuser ในด่านอื่น — จึงห้ามเขียนเป็น
   `isSuperuser(role) || role === 'marketing'` ที่จะกว้างกว่าที่ตกลงไว้เงียบ ๆ */
export function canExportLeadReport(role) {
  return role === 'admin' || role === 'marketing';
}

/* วันที่ในไฟล์เป็นสตริง `YYYY-MM-DD` **ของวันไทย** ไม่ใช่ค่าวันที่ของ Excel
   ⚠️ เขียนเป็นชนิดวันที่เมื่อไร Excel จะตีความใหม่ตามเครื่องที่เปิด (และ timestamptz
   ที่เก็บเป็น UTC จะเลื่อนวันช่วงเที่ยงคืนถึง 7 โมงเช้าเวลาไทย — โรคเดียวกับที่แก้ไปทั้งระบบ)
   สตริงรูปนี้เรียงลำดับถูกต้องอยู่แล้วเมื่อ sort แบบข้อความ และไม่มีทางถูกอ่านเป็นวันอื่น */
const day = (value) => (value ? businessDate(value) : '');

const money = (value) => (value == null || value === '' ? null : Number(value));

/** คอลัมน์ของรายงาน — ลำดับนี้คือลำดับในไฟล์
 *  `width` เป็นหน่วยของ exceljs (ประมาณจำนวนตัวอักษร) */
export const LEAD_REPORT_COLUMNS = [
  { key: 'code', label: 'รหัสลีด', width: 20 },
  { key: 'contactName', label: 'ชื่อผู้ติดต่อ', width: 26 },
  { key: 'company', label: 'บริษัท', width: 26 },
  { key: 'phone', label: 'โทรศัพท์', width: 14 },
  { key: 'email', label: 'อีเมล', width: 26 },
  { key: 'channel', label: 'ช่องทาง', width: 14 },
  { key: 'serviceInterest', label: 'บริการที่สนใจ', width: 20 },
  { key: 'budget', label: 'งบต่ำสุด', width: 14, money: true },
  { key: 'budgetMax', label: 'งบสูงสุด', width: 14, money: true },
  { key: 'team', label: 'ทีม', width: 14 },
  { key: 'assigneeName', label: 'ผู้รับผิดชอบ', width: 22 },
  { key: 'status', label: 'สถานะ', width: 16 },
  { key: 'createdAt', label: 'วันที่รับ', width: 12 },
  { key: 'screenedAt', label: 'คัดกรองเมื่อ', width: 12 },
  { key: 'assignedAt', label: 'มอบหมายเมื่อ', width: 12 },
  { key: 'firstContactAt', label: 'ติดต่อครั้งแรก', width: 12 },
  { key: 'followUpAt', label: 'วันติดตามต่อ', width: 12 },
  { key: 'meetingAt', label: 'นัดถัดไป', width: 12 },
  { key: 'lostReason', label: 'เหตุผลที่ไม่ไปต่อ', width: 30 },
  { key: 'revisitAt', label: 'วันกลับมาถามใหม่', width: 14 },
  { key: 'createdByName', label: 'ผู้กรอก', width: 22 },
];

/**
 * ลีดหนึ่งใบ → หนึ่งแถวของรายงาน
 * ⚠️ ป้ายทุกตัวมาจากทะเบียนกลาง (`LEAD_STATUS_LABELS` ฯลฯ) ไม่ใช่สะกดเองที่นี่ —
 * ไม่งั้นไฟล์ที่ส่งออกจะใช้คำคนละชุดกับหน้าจอ แล้วคนอ่านสองที่จะเถียงกันว่าอันไหนถูก
 */
export function leadReportRow(lead = {}) {
  return {
    code: lead.id || '',
    contactName: lead.contactName || '',
    company: lead.company || '',
    phone: lead.phone || '',
    email: lead.email || '',
    channel: LEAD_CHANNEL_LABELS[lead.channel] || lead.channel || '',
    serviceInterest: SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest || '',
    budget: money(lead.budget),
    budgetMax: money(lead.budgetMax),
    team: TEAM_LABELS[lead.team] || lead.team || '',
    assigneeName: lead.assigneeName || '',
    status: LEAD_STATUS_LABELS[lead.status] || lead.status || '',
    createdAt: day(lead.createdAt),
    screenedAt: day(lead.screenedAt),
    assignedAt: day(lead.assignedAt),
    firstContactAt: day(lead.firstContactAt),
    followUpAt: day(lead.followUpAt),
    meetingAt: day(lead.meetingAt),
    /* ใช้ตัวเดียวกับหน้ารายละเอียด — อ่านออกทั้งใบใหม่ (รหัส + ข้อความ) และใบเก่า
       ที่มีแต่ข้อความ · ใบที่ยังไม่ปิดจะได้ค่าว่าง ไม่ใช่ขีด (ในไฟล์ ช่องว่าง = ยังไม่มี) */
    lostReason: lead.status === 'disqualified' ? (leadLostText(lead) || '') : '',
    revisitAt: day(lead.revisitAt),
    createdByName: lead.createdByName || '',
  };
}

/** ชื่อไฟล์ — วันไทยเสมอ และบอกช่วงที่ขอไว้ในชื่อ เพื่อไม่ให้ไฟล์สองช่วงชนกันในโฟลเดอร์เดียว */
export function leadReportFilename({ from, to } = {}) {
  const span = from && to ? `${from}_${to}` : 'ทั้งหมด';
  return `leads_${span}.xlsx`;
}
