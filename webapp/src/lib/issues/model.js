// ── กติกาของเรื่องแจ้งปัญหาระบบ — logic ล้วน ไม่แตะ DB (mig 0219) ────────
//
// ⭐ **ลำดับขั้นบังคับที่นี่ ไม่ใช่ที่ trigger** — ต่างจาก `dept_requests` ที่ใช้
// `guard_dept_request` · CHECK ของ 0219 ตอบได้แค่ "แถวนี้สอดคล้องในตัวเองไหม"
// ส่วน "เปลี่ยนจากสถานะนี้ไปสถานะนั้นได้ไหม" อยู่ในไฟล์นี้พร้อมเทสต์
//
// ทุกฟังก์ชันคืน `{ error }` หรือ `{ patch, summary }` — ไม่ throw ไม่ยิง I/O
// ผู้เรียก (route handler) เอา patch ไป update แล้วบันทึก audit เอง

import {
  ISSUE_OPEN_STATUSES,
  normalizeIssueImpact,
  normalizeIssueKind,
  issueImpactLabel,
} from '@/lib/issues/statuses';
import { isIssueReporter, isSystemAdmin } from '@/lib/issues/access';

// ผู้แจ้งเงียบกี่วันแล้วระบบปิดให้เอง — นับจาก `resolvedAt` ไม่ใช่ `createdAt`
// (เรื่องที่ใช้เวลาแก้ 3 สัปดาห์ต้องได้ 7 วันเต็มให้ผู้แจ้งยืนยันเหมือนกันทุกใบ)
export const AUTO_CLOSE_DAYS = 7;

const MAX_DETAIL = 5000;
const MAX_TITLE = 200;
const MAX_URL = 500;
const MAX_UA = 500;
const MAX_STACK = 8000;
const MAX_REASON = 1000;

const trimTo = (value, max) => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// หัวข้อว่าง = ตัดจากบรรทัดแรกของรายละเอียด (มติ Q13 — บังคับกรอกช่องเดียว)
// ⚠️ ตัดที่ **บรรทัด** ไม่ใช่ที่จำนวนอักษร เพราะคนพิมพ์อาการมาเป็นย่อหน้าแรกเสมอ
// การตัดกลางประโยคทำให้หัวข้อในคิวอ่านไม่รู้เรื่อง
export function titleFromDetail(detail) {
  const firstLine = String(detail || '').split('\n').find((line) => line.trim());
  if (!firstLine) return null;
  const clean = firstLine.trim();
  return clean.length <= MAX_TITLE ? clean : `${clean.slice(0, MAX_TITLE - 1)}…`;
}

// ── สร้างเรื่องใหม่ ──────────────────────────────────────────────────────
// `user` ถูกใช้เป็น snapshot ผู้แจ้ง — ไม่รับ reportedById จาก body เด็ดขาด
// (ไม่งั้นใครก็เปิดเรื่องในนามคนอื่นได้)
export function normalizeIssueInput(body = {}, user = null) {
  const detail = trimTo(body.detail, MAX_DETAIL);
  if (!detail) return { error: 'กรุณาอธิบายปัญหาที่เจอ' };
  if (!user?.id) return { error: 'ต้องเข้าสู่ระบบก่อนจึงจะแจ้งเรื่องได้' };

  return {
    value: {
      kind: normalizeIssueKind(body.kind),
      impact: normalizeIssueImpact(body.impact),
      title: trimTo(body.title, MAX_TITLE) || titleFromDetail(detail),
      detail,
      status: 'pending',
      reportedById: String(user.id),
      reportedByName: user.name || null,
      reporterRole: user.role || null,
      reporterDepartment: user.department || null,
      reporterTeam: user.team || null,
      pageUrl: trimTo(body.pageUrl, MAX_URL),
      userAgent: trimTo(body.userAgent, MAX_UA),
      errorStack: trimTo(body.errorStack, MAX_STACK),
    },
  };
}

// ── การกระทำบนเรื่องที่เปิดแล้ว ─────────────────────────────────────────
//
// ตารางเดียวที่บอกว่าใครทำอะไรได้ตอนไหน — เพิ่ม action ใหม่ต้องมาที่นี่
// (`from` = สถานะที่ทำได้ · `who` = 'admin' | 'reporter' | 'both')
const ACTIONS = {
  acknowledge: { from: ['pending'], who: 'admin' },
  assign: { from: ['pending', 'acknowledged', 'resolved'], who: 'admin' },
  impact: { from: ISSUE_OPEN_STATUSES, who: 'admin' },
  resolve: { from: ['acknowledged'], who: 'admin' },
  reject: { from: ['pending', 'acknowledged'], who: 'admin' },
  // ⭐ ยืนยัน/ดีดกลับเป็นของ **ผู้แจ้ง** — แอดมินก็กดได้เผื่อผู้แจ้งบอกปากเปล่า
  // แต่ตัวที่ระบบคาดหวังคือผู้แจ้ง (มติ Q8 ปิดสองฝ่าย)
  confirm: { from: ['resolved'], who: 'both' },
  reopen: { from: ['resolved'], who: 'both' },
};

export const ISSUE_ACTIONS = Object.keys(ACTIONS);

function actorAllowed(who, user, row) {
  if (who === 'admin') return isSystemAdmin(user);
  if (who === 'reporter') return isIssueReporter(user, row);
  return isSystemAdmin(user) || isIssueReporter(user, row);
}

/**
 * ตรวจ + คำนวณ patch ของหนึ่ง action
 * @returns {{error: string} | {patch: object, summary: string}}
 */
export function issueAction(action, row, { user, payload = {}, now = new Date() } = {}) {
  const conf = ACTIONS[action];
  if (!conf) return { error: 'คำสั่งไม่ถูกต้อง' };
  if (!row) return { error: 'ไม่พบเรื่องที่ระบุ' };
  if (!actorAllowed(conf.who, user, row)) return { error: 'ไม่มีสิทธิ์ทำรายการนี้' };
  if (!conf.from.includes(String(row.status || ''))) {
    return { error: `เรื่องนี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้แล้ว` };
  }

  const at = now.toISOString();
  const code = row.code || row.id;

  switch (action) {
    // "รับเรื่อง" = self-assign + ขยับสถานะในปุ่มเดียว — แยกสองปุ่มเมื่อไรจะมีเรื่อง
    // ที่ acknowledged แต่ไม่มีเจ้าภาพ ซึ่ง CHECK ของ DB ปฏิเสธอยู่แล้ว
    case 'acknowledge':
      return {
        patch: {
          status: 'acknowledged',
          acknowledgedAt: at,
          assigneeId: String(user.id),
          assigneeName: user.name || null,
        },
        summary: `รับเรื่อง ${code}`,
      };

    case 'assign': {
      const id = trimTo(payload.assigneeId, 100);
      if (!id) return { error: 'ต้องระบุผู้รับผิดชอบ' };
      return {
        patch: { assigneeId: id, assigneeName: trimTo(payload.assigneeName, 200) },
        summary: `มอบหมาย ${code} ให้ ${payload.assigneeName || id}`,
      };
    }

    case 'impact': {
      const impact = normalizeIssueImpact(payload.impact);
      if (impact === row.impact) return { error: 'ผลกระทบเดิมอยู่แล้ว' };
      return {
        patch: { impact },
        summary: `ปรับผลกระทบ ${code} เป็น ${issueImpactLabel(impact)}`,
      };
    }

    case 'resolve':
      return {
        patch: { status: 'resolved', resolvedAt: at },
        summary: `แจ้งว่าแก้แล้ว ${code} — รอผู้แจ้งยืนยัน`,
      };

    case 'reject': {
      const reason = trimTo(payload.reason, MAX_REASON);
      // บังคับสองชั้น (ที่นี่ + CHECK ของ DB) เพราะ "ไม่ทำ" เฉย ๆ ทำให้ผู้แจ้ง
      // ไม่รู้ว่าควรทำอะไรต่อ และเป็นสาเหตุที่คนเลิกแจ้ง
      if (!reason) return { error: 'ต้องระบุเหตุผลที่ไม่ใช่บั๊ก / ไม่ทำ' };
      return {
        patch: { status: 'rejected', rejectReason: reason, closedAt: at },
        summary: `ปิดเรื่อง ${code} — ไม่ใช่บั๊ก/ไม่ทำ`,
      };
    }

    case 'confirm':
      return {
        patch: { status: 'closed', closedAt: at, autoClosed: false },
        summary: `ผู้แจ้งยืนยันว่าหายแล้ว ${code}`,
      };

    // "ยังไม่หาย" — กลับไป acknowledged ไม่ใช่ pending เพราะเจ้าภาพยังเป็นคนเดิม
    // และล้าง resolvedAt ทิ้ง ไม่งั้น cron จะยังนับ 7 วันจากรอบก่อนแล้วปิดเรื่อง
    // ที่เพิ่งถูกดีดกลับ
    case 'reopen':
      return {
        patch: { status: 'acknowledged', resolvedAt: null },
        summary: `ผู้แจ้งแจ้งว่ายังไม่หาย ${code}`,
      };

    default:
      return { error: 'คำสั่งไม่ถูกต้อง' };
  }
}

// ── ปิดอัตโนมัติ (cron — ต่อจริงในก้อนที่ 3) ────────────────────────────
export function autoCloseDueAt(row) {
  if (!row?.resolvedAt || row.status !== 'resolved') return null;
  const base = new Date(row.resolvedAt).getTime();
  if (!Number.isFinite(base)) return null;
  return new Date(base + AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isDueForAutoClose(row, now = new Date()) {
  const due = autoCloseDueAt(row);
  return !!due && new Date(due).getTime() <= now.getTime();
}

export function autoClosePatch(now = new Date()) {
  return { status: 'closed', closedAt: now.toISOString(), autoClosed: true };
}

// ── เรียงคิวแอดมิน ──────────────────────────────────────────────────────
// ⚠️ **ผลกระทบมาก่อนเวลา** — เรื่อง blocked ของเมื่อวานต้องอยู่เหนือเรื่องเล็ก
// ที่เพิ่งแจ้งเมื่อเช้า · เรียง "ใหม่สุดก่อน" ล้วน ๆ ทำให้คนที่ทำงานไม่ได้อยู่
// ถูกดันลงล่างทุกครั้งที่มีคนแจ้งเรื่องเล็ก
export function sortIssueQueue(rows = []) {
  const order = { blocked: 0, workaround: 1, minor: 2 };
  return [...rows].sort((a, b) => {
    const impact = (order[a.impact] ?? 9) - (order[b.impact] ?? 9);
    if (impact !== 0) return impact;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}
