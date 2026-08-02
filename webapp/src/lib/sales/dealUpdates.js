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
import { requestKindLabel } from '@/lib/master/requestTypes';

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
// ⚠️ เนื้อข้อความในเธรดงาน**ไม่ได้เขียนลงที่นี่** — ด่านของงาน (canViewPersonalTask)
// แคบกว่าด่านของดีล เขียนลงเธรดดีลเมื่อไรก็ข้ามด่านทันที · ความคืบหน้าที่คนพิมพ์ใน
// งานถูก "ยืมมาแสดง" ที่หน้าดีลแทน โดยกรองสิทธิ์รายใบตอนอ่าน (ดู overview route)
export function dealTaskUpdate(action, task, { lateReason = null } = {}) {
  if (!task) return null;
  const title = clip(task.title, 200) || 'งาน';
  const who = clip(task.assigneeName || task.ownerName, 80);
  const meta = { taskId: task.id || null, action };

  if (action === 'created') {
    /* รายละเอียดงานอยู่บรรทัดที่สอง — หัวข้ออย่างเดียวบอกไม่ได้ว่าต้องทำอะไร
       ⚠️ เป็น **บันทึก ณ ตอนสร้าง** ไม่ใช่กระจกของงาน · แก้รายละเอียดทีหลังแล้ว
       บรรทัดนี้ไม่เปลี่ยนตาม (ตั้งใจ — เธรดคือประวัติ ไม่ใช่หน้าแสดงข้อมูลปัจจุบัน)
       ของปัจจุบันดูได้ที่หน้างานผ่านลิงก์ในบรรทัดเดียวกัน */
    const detail = clip(task.note, 300);
    const head = `สร้างงาน: ${title}${who ? ` · ${who}` : ''}${task.dueDate ? ` · กำหนด ${task.dueDate}` : ''}`;
    return {
      kind: 'task',
      body: detail ? `${head}\n${detail}` : head,
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

// ── คำร้องข้ามฝ่ายที่ผูกดีล (มติผู้ใช้ 2026-08-03) ────────────────────────
//
// ⭐ เจตนาของผู้ใช้: "ระบบคล้าย ๆ เธรด เพราะต้องการให้รวมเข้าเธรดของดีล" — คำร้อง
// ทุกใบผูกดีลแล้ว (บังคับ) ดีลจึงต้องเล่าได้ว่าเคยขออะไรไปฝ่ายไหน ได้คำตอบเมื่อไร
// โดยไม่ต้องเดินไปเปิดหน้าคำร้องทีละใบ
//
// 🔴 **เอาแค่พาดหัว ไม่เอาเนื้อ** — ด่านของเธรดคำร้องคือ `canViewCosting` ส่วนเธรด
// ดีลคือขอบเขตดีล สองด่านนี้ไม่ครอบกันทั้งสองทาง (คนเห็นดีลแต่ไม่มี costing:view
// ก็มี) · ยกเนื้อที่คุยกันเรื่องราคา/ต้นทุนไปกองในเธรดดีลเมื่อไรคือข้ามด่านทันที
// กับดักเดียวกับที่ `dealTaskUpdate` เตือนไว้ข้างบน — บรรทัดนี้จึงมีแค่ ชนิด ·
// เลขที่ · ฝ่าย · สถานะ แล้วให้คนกดลิงก์เข้าไปอ่านของจริงซึ่งมีด่านของตัวเอง
//
// ⚠️ ไม่เล่าตอน "สร้างร่าง" โดยเจตนา: ร่างยังไม่ใช่งานของใคร (กฎเดียวกับที่คิว
// ฝ่ายกรองร่างของคนอื่นออก) · เริ่มเล่าตอนกดส่งเท่านั้น
export function dealRequestUpdate(action, request, { reason = null } = {}) {
  if (!request) return null;
  // ชื่อชนิดมาจากทะเบียนชนิดตัวเดียวของระบบ ไม่ให้ผู้เรียกส่งข้อความมาเอง —
  // ไม่งั้นเธรดดีลกับหน้าคำร้องเรียกชนิดเดียวกันคนละชื่อ
  const head = `${requestKindLabel(request.kind)}${request.docNo ? ` ${request.docNo}` : ''}`;
  const dept = request.dept || '';
  const meta = {
    requestId: request.id || null,
    requestKind: request.kind || null,
    docNo: request.docNo || null,
    dept: dept || null,
    action,
  };

  const text = {
    submit: `เปิด${head} ถึงฝ่าย ${dept}`,
    answer: `${head} — ฝ่าย ${dept} ตอบแล้ว`,
    close: `ปิด${head}`,
    cancel: `ยกเลิก${head}${clip(reason) ? ` — ${clip(reason)}` : ''}`,
  }[action];
  if (!text) return null;

  return { kind: 'request', body: text, meta };
}
