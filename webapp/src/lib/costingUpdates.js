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

import { fmtDate } from '@/lib/format';
import submitScope from '@/lib/requests/submitScope';

const clip = (s, n = 1000) => String(s ?? '').trim().slice(0, n) || null;

// ── เคสขอราคาวัสดุ (PM-/RM-) ─────────────────────────────────────────────
// ชุด kind ต้องตรงกับ UPDATE_KINDS.dept_request ใน lib/master/updateTypes.js
export function askActionUpdate(action, ask, {
  reason = null, previousDueDate = null, assigneeName = null, pdrChanges = null, requeue = false,
} = {}) {
  if (!ask) return null;
  const dept = ask.dept || '';
  if (action === 'submit') {
    return {
      kind: 'submit',
      body: `ส่งเคสถึง ${dept} — ${submitScope(ask)}`,
      meta: { dept, docNo: ask.docNo || null },
    };
  }
  /* ⚠️ **ห้ามกลับไปใช้คำว่า "กำลังหาราคา"** (มติผู้ใช้ 2026-08-19) — คำนั้นเหลือมาจาก
     ตอนที่คำร้องมีแต่สายขอราคาวัสดุ · วันนี้ใบส่วนใหญ่เป็นกลิ่น/สูตร/เอกสารที่ไม่มี
     ราคาให้หา ⇒ เธรดเล่าเรื่องที่ไม่ได้เกิดขึ้น
     ⭐ และคำใหม่ต้องบอก **ก้าวถัดไปที่ค้างอยู่จริง** — รับเรื่องแล้วยังไม่ใช่การรับปาก
     วัน ตราบใดที่ยังไม่มีแถว `commitDue` ตามมา */
  if (action === 'acknowledge') {
    return { kind: 'acknowledge', body: `${dept} รับเรื่องแล้ว — รอแจ้งกำหนดส่ง`, meta: { dept } };
  }
  // ⭐ แจ้งกำหนดส่งครั้งแรก (มติผู้ใช้ 2026-08-19) — คนละแถวกับ `reschedule` ซึ่งเป็น
  // การ *แก้* คำสัญญาที่ให้ไปแล้ว · รวมสองอย่างเมื่อไร เธรดจะอ่านเหมือนใบนี้เลื่อนวัน
  // ตั้งแต่ยังไม่เคยให้วันสักครั้ง
  if (action === 'commit-due') {
    const due = ask.committedDueDate ? fmtDate(ask.committedDueDate) : '(ไม่ระบุ)';
    /* ⭐ **บอกด้วยว่าเป็นวันของรอบไหน** (เจอตอน UAT 2026-08-27) — ก้าวนี้เกิดซ้ำได้
       แล้วตั้งแต่รอบแก้เปิดขั้นนี้ใหม่ (#1406) ⇒ เธรดของใบที่เดินสองรอบมี
       "แจ้งกำหนดส่ง" สองบรรทัดที่หน้าตาเหมือนกันเป๊ะ อ่านย้อนหลังไม่ออกว่าทำไมมีสองครั้ง

       🐞 **คำอธิบายใน #1406 อ้างว่าเธรดบอกรอบอยู่แล้ว ซึ่งผิด** — ข้อความนั้นถูกใส่ไว้
       ที่ตัวแปร `summary` ของ route ซึ่งไปลง **audit log** ไม่ใช่เธรด · เธรดประกอบ
       ข้อความเองที่นี่ และที่นี่ไม่เคยรู้จักรอบเลย

       ⭐ **ไม่ต้องเพิ่มพารามิเตอร์ใหม่** — `previousDueDate` ที่ route ส่งมาให้อยู่แล้ว
       เป็นตัวแยกที่พอดีเป๊ะ: แจ้งครั้งแรก `before.committedDueDate` เป็น null ·
       แจ้งของรอบแก้มีวันของรอบก่อนค้างอยู่เสมอ (ด่าน `commitDueRequestError` ปล่อยผ่าน
       เฉพาะสองกรณีนี้ — ไม่มีวัน หรือวันที่มีเป็นของรอบที่ส่งไปแล้ว) */
    const prev = previousDueDate ? fmtDate(previousDueDate) : null;
    /* 🐞 **"ลงคิวใหม่" ไม่ใช่ "รอบแก้"** (เจอตอนซ้อม UAT 2026-08-30) — ใบที่นัดก่อนหน้า
       ปิดไปแล้ว (ไปแล้วเข้าไม่ได้ · ยกเลิก) หรือนัดหาย ลงคิวได้อีกครั้ง **ด้วยวันเดิม**
       ⇒ เธรดเคยขึ้นว่า "แจ้งกำหนดส่งรอบแก้ 14/10/2026 (รอบก่อน 14/10/2026)" ซึ่งอ่านแล้ว
       งงสองชั้น: วันซ้ำกันเป๊ะ และคำว่า "รอบแก้" หมายถึงผู้ขอขอแก้งาน ซึ่งไม่ได้เกิดขึ้นเลย */
    if (requeue) {
      return {
        kind: 'commitDue',
        body: `${dept} ลงคิวใหม่ ${due} — นัดก่อนหน้าไม่มีอยู่บนตารางแล้ว`
          + (clip(reason) ? ` · ${clip(reason)}` : ''),
        meta: { dept, due: ask.committedDueDate || null, previousDue: previousDueDate || null, requeue: true },
      };
    }
    return {
      kind: 'commitDue',
      body: (prev
        ? `${dept} แจ้งกำหนดส่งรอบแก้ ${due} (รอบก่อน ${prev})`
        : `${dept} แจ้งกำหนดส่ง ${due}`)
        + (clip(reason) ? ` — ${clip(reason)}` : ''),
      meta: { dept, due: ask.committedDueDate || null, previousDue: previousDueDate || null },
    };
  }
  // 🐞 เดิมไม่มีกรณีนี้ → ชนิดที่ไม่มีบรรทัด (สอบถาม/พัฒนากลิ่น/
  // ขอเอกสาร/ติดตามของเข้า) กด "ตอบแล้ว" แล้ว **ไม่มีอะไรลงเธรดเลย** และเพราะ
  // แจ้งเตือนรายคนเกาะอยู่กับแถวเธรด (appendUpdate → notifyThreadUpdate) ผู้ขอจึง
  // ไม่เคยรู้ว่ามีคนตอบแล้ว ต้องเข้ามาเปิดดูเอง
  if (action === 'answer') {
    // ⭐ ปุ่มนี้เป็น **ตราปิดฝั่งฝ่าย** (ปิดสองฝั่ง · 2026-08-20) — เธรดต้องบอกด้วยว่า
    // ยังเหลืออีกฝั่ง ไม่งั้นคนอ่านเข้าใจว่าใบจบแล้วทั้งที่ยังรอผู้ขอกดปิด
    return {
      kind: 'answer',
      body: ask.closedAt
        ? `${dept} ตอบเรื่องนี้แล้ว — ปิดครบสองฝั่ง`
        : `${dept} ตอบเรื่องนี้แล้ว — รอผู้ขอปิดเรื่อง`,
      meta: { dept },
    };
  }
  /* ⭐ **ยังไม่จบ** — ถอนตราปิด · ต้องมีเหตุผลเสมอ (ด่านที่ `closure.js`) ⇒ คนอ่าน
     ย้อนหลังรู้ว่าใบวนอีกรอบเพราะอะไร ไม่ใช่เห็นแค่สถานะเด้งกลับ */
  if (action === 'reopen') {
    return {
      kind: 'reopen',
      body: `ยังไม่จบ — เปิดเรื่องกลับมา${clip(reason) ? ` · ${clip(reason)}` : ''}`,
      meta: { dept },
    };
  }
  // ⭐ ตีกลับต้องลงเธรด **พร้อมเหตุผล** — ผู้ขอเปิดใบมาเห็นว่ากลับเป็นร่างแล้ว
  // แต่ถ้าไม่มีข้อความบอกว่าขาดอะไร เขาจะส่งใบเดิมกลับมาอีกรอบ
  if (action === 'bounce') {
    return {
      kind: 'bounce',
      body: `${dept} ตีกลับให้แก้ไข — ${clip(reason) || 'ไม่ระบุเหตุผล'}`,
      meta: { dept },
    };
  }
  // 🐞 **สี่ action ที่เคยไม่ลงเธรดเลย** (ตรวจ 2026-08-09) — route ประกอบข้อความ
  // สวยงามไว้แล้วแต่ส่งเข้า `recordAudit` อย่างเดียว ซึ่งไม่มีใครเปิดดู และไม่ยิง
  // แจ้งเตือน (แจ้งเตือนรายคนเกาะอยู่กับแถวเธรด) ⇒ เหตุการณ์เงียบสนิทบนจอ
  //
  // ⭐ `reschedule` แรงที่สุด — route เขียนคอมเมนต์สัญญาไว้เองว่า "ไม่แก้เงียบ ๆ —
  // วันกำหนดส่งคือคำสัญญาที่ให้ฝ่ายขายไปแล้ว … เลื่อนแล้วต้องเห็นในเธรด" แต่ไม่เคย
  // เห็นจริง · และเกิดกับใบที่ฝ่ายปลายทาง **รับเรื่องไปแล้ว** = ฝ่ายขายยังเชื่อวันเดิม
  if (action === 'reschedule') {
    const from = previousDueDate ? fmtDate(previousDueDate) : '(ไม่เคยระบุ)';
    const to = ask.committedDueDate ? fmtDate(ask.committedDueDate) : '(ไม่ระบุ)';
    return {
      kind: 'reschedule',
      body: `${dept} เลื่อนวันกำหนดส่ง ${from} → ${to}`
        + (clip(reason) ? ` — ${clip(reason)}` : ''),
      meta: { dept, from: previousDueDate || null, to: ask.committedDueDate || null },
    };
  }
  // ⚠️ สาขา `approve` (ประตูหัวหน้าสายงานขาย · mig 0216) เคยอยู่ตรงนี้ — ถอดพร้อมขั้น
  // ทั้งขั้น (มติผู้ใช้ 2026-08-16) · **ป้าย `approve` ใน `UPDATE_KINDS.dept_request`
  // ยังอยู่** เพราะเธรดของใบที่เคยยืนยันไว้ยังมีแถวชนิดนี้ค้างอยู่จริง
  // แก้ข้อมูลใบหลังส่งแล้ว — สถานะ `pending` แปลว่าใบอยู่บนคิวฝ่ายปลายทางแล้ว
  // คนที่กำลังจะรับเรื่องต้องรู้ว่าเนื้อในเปลี่ยน (ดู lib/requests/requestEdit.js)
  /* ⭐ มอบหมาย/ถอนมอบหมาย (mig 0230) — ต้องลงเธรดทั้งสองทาง · "ทำไมงานกลับมาอยู่
     กองกลาง" ตามไม่ได้เลยถ้าลงแค่ตอนมอบ */
  if (action === 'assign') {
    const name = String(assigneeName || '').trim();
    return {
      kind: 'assign',
      body: name ? `มอบหมายให้ ${name}` : 'ถอนการมอบหมาย — งานกลับไปอยู่กองกลางของฝ่าย',
      meta: { dept },
    };
  }
  if (action === 'update') {
    return {
      kind: 'update',
      body: 'ผู้ขอแก้ข้อมูลคำร้อง — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง',
      meta: {},
    };
  }
  // แบบฟอร์ม PDR แก้ได้ทั้งก่อนและหลังรับเรื่อง (สิทธิ์สลับมือที่จังหวะนั้น) ⇒
  // อีกฝ่ายอาจอ่านฉบับก่อนหน้าไปแล้ว
  /* ⭐ **บอกว่าเดิมเป็นอะไร ไม่ใช่แค่ "แก้แล้ว"** (มติผู้ใช้ 2026-08-12 · IS-26080021)
     พอฝ่ายปลายทางรับเรื่อง สิทธิ์แก้ PDR ย้ายไปเป็นของเขาทั้งใบ ⇒ RD แก้บรีฟที่ SA
     เขียนมาได้ทุกช่อง แต่เดิมเธรดขึ้นแค่ "แก้แบบฟอร์ม PDR" ⇒ ค่าที่หายไปไม่มีร่องรอย
     และเพราะแจ้งเตือนรายคนเกาะอยู่กับแถวเธรด ผู้ขอจึงรู้แค่ว่า *มีคนแก้* ไม่รู้ว่าแก้อะไร
     ⚠️ `pdrChanges` ว่าง = กดบันทึกโดยไม่ได้เปลี่ยนอะไร — ยังลงเธรดตามเดิมเพื่อไม่ให้
     พฤติกรรมหายไปเงียบ ๆ แต่ไม่ต้องมีรายการเปลี่ยนแปลงต่อท้าย */
  if (action === 'pdr') {
    return {
      kind: 'pdr',
      body: 'แก้แบบฟอร์ม PDR' + (clip(pdrChanges, 1800) ? `\n${clip(pdrChanges, 1800)}` : ''),
      meta: {},
    };
  }
  if (action === 'close') {
    // ปิดฝั่งผู้ขอ ≠ ใบจบ — ใบจบเมื่อฝ่ายมีตราด้วย (`answeredAt`)
    return {
      kind: 'close',
      body: ask.answeredAt ? 'ปิดเรื่อง — ครบสองฝั่ง' : `ผู้ขอปิดฝั่งตัวเอง — รอ ${dept} ตอบ`,
      meta: { dept },
    };
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
