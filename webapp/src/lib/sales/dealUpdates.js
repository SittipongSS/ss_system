// ── เหตุการณ์ระบบของ "เธรดดีล" ที่เกิดจากตัวดีลเอง (ตรรกะล้วน) ───────────
//
// ⭐ จุดประสงค์ของเธรดดีลคือสมุดบันทึกความเคลื่อนไหวของดีล (มติผู้ใช้) — ไฟล์นี้
// ดูแลสองแหล่งที่ไม่ได้มาจากเอกสาร QT/SO (ดู documentUpdates/documentThread):
//   · ตัวเลขของดีลขยับ (มูลค่า · โอกาสปิด · เดือนที่คาดว่าจะปิด)
//   · งานที่ผูกดีล — เฉพาะจังหวะที่กระทบทิศทางดีล ไม่ใช่ทุกการเปลี่ยนสถานะ
//
// ⚠️ ทุกฟังก์ชันคืน `null` เมื่อไม่มีอะไรต้องเล่า — ผู้เรียกอยู่หลังจุดที่ DB เขียน
// สำเร็จแล้ว ห้าม throw

import { fmtMoney } from '@/lib/format';

const clip = (s, n = 300) => String(s ?? '').trim().slice(0, n) || null;
const money = (v) => (v == null || v === '' ? null : fmtMoney(Number(v) || 0));

// ── ตัวเลขของดีลขยับ ────────────────────────────────────────────────────
//
// 🐞 ก่อนหน้านี้การเปลี่ยนมูลค่า/โอกาสปิด/เดือน forecast ลง `sales_deal_forecasts`
// เพื่อคำนวณ KPI **แล้วไม่มีใครเห็นบนหน้าจอเลย** — คนเปิดดีลย้อนหลังไม่มีทางรู้ว่า
// ตัวเลขเคยเป็นเท่าไรและใครแก้
//
// รวมสามช่องไว้ในแถวเดียวเสมอ: แก้ทีเดียวกันคือการตัดสินใจครั้งเดียว ไม่ใช่สามเรื่อง
export function dealForecastUpdate(before, after) {
  if (!before || !after) return null;
  const parts = [];
  const meta = {};

  if (Number(before.projectValue ?? 0) !== Number(after.projectValue ?? 0)) {
    parts.push(`มูลค่า ${money(before.projectValue) || '-'} → ${money(after.projectValue) || '-'}`);
    meta.projectValue = { from: before.projectValue ?? null, to: after.projectValue ?? null };
  }
  if (Number(before.probability ?? 0) !== Number(after.probability ?? 0)) {
    parts.push(`โอกาสปิด ${before.probability ?? '-'}% → ${after.probability ?? '-'}%`);
    meta.probability = { from: before.probability ?? null, to: after.probability ?? null };
  }
  if ((before.forecastMonth || null) !== (after.forecastMonth || null)) {
    parts.push(`เดือนที่คาดว่าจะปิด ${before.forecastMonth || 'ไม่ระบุ'} → ${after.forecastMonth || 'ไม่ระบุ'}`);
    meta.forecastMonth = { from: before.forecastMonth || null, to: after.forecastMonth || null };
  }
  if (!parts.length) return null;

  return { kind: 'forecast', body: parts.join(' · '), meta };
}

// ── งานที่ผูกดีล ────────────────────────────────────────────────────────
//
// ⚠️ **เอาเฉพาะสามจังหวะ** (มติผู้ใช้ 2026-08-01): สร้างงาน · งานเสร็จ · เหตุผลที่
// เสร็จช้า — ไม่เอาการเปลี่ยนสถานะทุกครั้งและไม่เอาข้อความที่คนคุยกันในงาน
// เพราะเธรดงานคือเธรดที่เสียงดังที่สุดในระบบ (92% ของแถวเป็นเหตุการณ์ระบบ ·
// 305 จาก 338 งานไม่มีบทสนทนามนุษย์เลย) ยกมาทั้งหมดเมื่อไรเธรดดีลจมทันที
//
// ⚠️ **ห้ามยกเนื้อข้อความในเธรดงานมาด้วย** — ด่านของงาน (canViewPersonalTask) แคบ
// กว่าด่านของดีล · ที่ยกมาได้คือระดับหัวข้อ (ชื่องาน/ผู้รับผิดชอบ/เหตุผลที่ช้า)
export function dealTaskUpdate(action, task, { lateReason = null } = {}) {
  if (!task) return null;
  const title = clip(task.title, 200) || 'งาน';
  const who = clip(task.assigneeName || task.ownerName, 80);
  const meta = { taskId: task.id || null, action };

  if (action === 'created') {
    return {
      kind: 'task',
      body: `สร้างงาน: ${title}${who ? ` · ${who}` : ''}${task.dueDate ? ` · กำหนด ${task.dueDate}` : ''}`,
      meta,
    };
  }
  if (action === 'done') {
    return { kind: 'task', body: `งานเสร็จ: ${title}${who ? ` · ${who}` : ''}`, meta };
  }
  if (action === 'late') {
    // เหตุผลที่เสร็จช้าคือสิ่งที่อธิบายว่า "ทำไมดีลไม่ขยับ" — มีค่ากับดีลมากที่สุด
    const why = clip(lateReason, 300);
    return {
      kind: 'task',
      body: `งานเลยกำหนด: ${title}${why ? ` — ${why}` : ''}`,
      meta: { ...meta, lateReason: why },
    };
  }
  return null;
}
