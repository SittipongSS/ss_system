// ── เหตุการณ์ระบบในเธรดของระบบขอราคา (entity_updates, mig 0163) ──────────
//
// แพตเทิร์นเดียวกับ lib/pm/taskUpdates.js: ไฟล์นี้ตอบแค่ "ควรบันทึกอะไรลงเธรด"
// เป็นตรรกะล้วนที่เทสต์ได้ ส่วน I/O เป็นของ lib/master/updates.js
//
// ⭐ **เหตุผลที่ต้องมีเธรดที่นี่จริง ๆ**: เหตุผลที่ผู้บริหารตีกลับถูกเก็บใน
// `costing_request_items.returnReason` ช่องเดียว และ /submit ล้างเป็น null ทุกครั้ง
// ที่เซลยื่นใหม่ — ตีกลับรอบที่ 2 จึงลบเหตุผลรอบที่ 1 ทิ้งถาวร ไม่มีใครย้อนดูได้ว่า
// ทำไมใบนี้วนสามรอบ · เขียนลงเธรดด้วยทำให้เหตุผลอยู่ครบทุกรอบ (คอลัมน์เดิมยังอยู่
// เพราะหน้าจอใช้แสดงสถานะ "รอบนี้ติดอะไร" ซึ่งเป็นคนละคำถามกับ "เคยติดอะไรมาบ้าง")
//
// ⚠️ ทุกฟังก์ชันต้องทนของไม่ครบ (คืน null) — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จ
// แล้ว การโยน error ตรงนั้นจะทำให้ action ที่สำเร็จแล้วตอบ 500

const clip = (s, n = 1000) => String(s ?? '').trim().slice(0, n) || null;

// ── เคสขอราคาวัสดุ (PM-/RM-) ─────────────────────────────────────────────
// ชุด kind ต้องตรงกับ UPDATE_KINDS.dept_request ใน lib/master/updateTypes.js
export function askActionUpdate(action, ask, { reason = null } = {}) {
  if (!ask) return null;
  const dept = ask.dept || '';
  if (action === 'submit') {
    return {
      kind: 'submit',
      body: `ส่งเคสถึงฝ่าย ${dept} — ${(ask.items || []).length} รายการ`,
      meta: { dept, docNo: ask.docNo || null },
    };
  }
  if (action === 'acknowledge') {
    return { kind: 'acknowledge', body: `ฝ่าย ${dept} รับเรื่องแล้ว — กำลังหาราคา`, meta: { dept } };
  }
  // 🐞 เดิมไม่มีกรณีนี้ → ชนิดที่ไม่มีบรรทัด (5 ใน 8: สอบถาม/บรีฟกลิ่น/mockup/
  // ขอเอกสาร/ติดตามของเข้า) กด "ตอบแล้ว" แล้ว **ไม่มีอะไรลงเธรดเลย** และเพราะ
  // แจ้งเตือนรายคนเกาะอยู่กับแถวเธรด (appendUpdate → notifyThreadUpdate) ผู้ขอจึง
  // ไม่เคยรู้ว่ามีคนตอบแล้ว ต้องเข้ามาเปิดดูเอง
  if (action === 'answer') {
    return { kind: 'answer', body: `ฝ่าย ${dept} ตอบเรื่องนี้แล้ว`, meta: { dept } };
  }
  // ⭐ ตีกลับต้องลงเธรด **พร้อมเหตุผล** — ผู้ขอเปิดใบมาเห็นว่ากลับเป็นร่างแล้ว
  // แต่ถ้าไม่มีข้อความบอกว่าขาดอะไร เขาจะส่งใบเดิมกลับมาอีกรอบ
  if (action === 'bounce') {
    return {
      kind: 'bounce',
      body: `ฝ่าย ${dept} ตีกลับให้แก้ไข — ${clip(reason) || 'ไม่ระบุเหตุผล'}`,
      meta: { dept },
    };
  }
  if (action === 'close') {
    return { kind: 'close', body: 'ปิดเคส', meta: {} };
  }
  if (action === 'cancel') {
    // เหตุผลยกเลิกบังคับกรอกอยู่แล้วที่ API — เอาลงเธรดให้คนอ่านเห็นในสายเดียว
    return { kind: 'cancel', body: `ยกเลิกเคส — ${clip(reason) || 'ไม่ระบุเหตุผล'}`, meta: {} };
  }
  return null;
}

// คำตอบราคาจาก RD/PC — หนึ่งรายการต่อหนึ่งแถวในเธรด (คนอ่านต้องรู้ว่าตัวไหนตอบว่าอะไร)
// entries = [{ item, noQuote?, reason?, tiers?, note? }] (รูปเดียวกับ validated ใน route)
export function askAnswerUpdates(entries = []) {
  const out = [];
  for (const entry of entries || []) {
    const item = entry?.item;
    if (!item) continue;
    const label = item.label || 'วัสดุ';
    if (entry.noQuote) {
      out.push({
        kind: 'no_quote',
        body: `ตอบไม่ได้ "${label}" — ${clip(entry.reason) || 'ไม่ระบุเหตุผล'}`,
        meta: { itemId: item.id, label },
      });
      continue;
    }
    const tiers = Array.isArray(entry.tiers) ? entry.tiers.length : 0;
    const note = clip(entry.note);
    out.push({
      kind: 'quoted',
      body: `ตอบราคา "${label}"${tiers ? ` — ${tiers} ชั้นจำนวน` : ''}${note ? ` · ${note}` : ''}`,
      meta: { itemId: item.id, label, tiers },
    });
  }
  return out;
}

// ── ใบขอราคาผลิต (CR-) ───────────────────────────────────────────────────
// ชุด kind ต้องตรงกับ UPDATE_KINDS.costing_request ใน lib/master/updateTypes.js
export function costingSubmitUpdate(request) {
  if (!request) return null;
  const count = (request.items || []).length;
  return {
    kind: 'submit',
    body: `ยื่นขออนุมัติราคาผลิต — ${count} รายการ`,
    meta: { items: count },
  };
}

// ผู้ยื่นดึงใบกลับมาแก้เอง — ต้องอยู่ในเธรดเหมือนการยื่น ไม่งั้นคนอ่านจะเห็นใบยื่นแล้ว
// เงียบหายไปเฉย ๆ แล้วโผล่ยื่นใหม่อีกรอบโดยไม่มีอะไรอธิบายช่วงที่หายไป
export function costingWithdrawUpdate(request, reason) {
  if (!request) return null;
  return {
    kind: 'withdraw',
    body: `ดึงกลับมาแก้ไข — ${clip(reason) || 'ไม่ระบุเหตุผล'}`,
    meta: { items: (request.items || []).length },
  };
}

// ผู้บริหารตัดสินรายรายการ — ตีกลับคือเหตุการณ์ที่ต้องเก็บให้ครบทุกรอบ (ดูหัวไฟล์)
export function costingDecisionUpdate(decision, item, { reason = null } = {}) {
  if (!item) return null;
  const label = item.productLabel || 'รายการ';
  if (decision === 'return') {
    return {
      kind: 'returned',
      body: `ตีกลับให้แก้ไข "${label}" — ${clip(reason) || 'ไม่ระบุเหตุผล'}`,
      meta: { itemId: item.id, label },
    };
  }
  return {
    kind: 'approve',
    body: `อนุมัติราคาผลิต "${label}"`,
    meta: { itemId: item.id, label },
  };
}

// ออก Rev. = ใบใหม่คนละ id → ต้องเขียน **สองเธรด** ไม่ใช่เธรดเดียว: ใบเก่าจะได้ไม่
// จบห้วนเหมือนถูกทิ้ง และใบใหม่จะได้บอกที่มาของตัวเองตั้งแต่บรรทัดแรก
export function costingReviseUpdates(before, created) {
  if (!created) return { onBase: null, onNew: null };
  const rev = created.revisionNo ?? null;
  return {
    onBase: {
      kind: 'revise',
      body: `ออก Rev. ${rev ?? ''} เป็นใบใหม่ — ใบนี้ปิดเป็นหลักฐาน`.replace('  ', ' '),
      meta: { toId: created.id, revisionNo: rev },
    },
    onNew: {
      kind: 'revise',
      body: `ออก Rev. ${rev ?? ''} จากใบ ${before?.docNo || before?.id || ''}`.trim(),
      meta: { fromId: before?.id || null, revisionNo: rev },
    },
  };
}
