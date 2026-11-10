import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── โมดัลนัด × "รายการงาน" บนจอจัดคิว (มติ 2026-09-22) ─────────────────────
   โมดัลเป็นไฟล์ JSX (import ใต้ raw Node ไม่ได้) ⇒ ยามอ่านซอร์ส · ส่วน visitToForm เป็น JS ล้วน
   จึงตัดออกมารันจริงได้ — ตัวนี้คือ body ของ PATCH "ปล่อยขึ้นตาราง" ลัดบนรายการ
   ช่องที่หลุดไปหนึ่งช่อง = ค่านั้นถูกล้างเงียบ ๆ ตอนปล่อย จึงต้องเทสต์ด้วยค่า ไม่ใช่ด้วยตา */
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const modal = read('./ServiceVisitModal.js');
/* ⭐ P3 (มติเจ้าของ 10–11/11/2026): วัน · เวลา · คน = ตารางช่าง × เวลาตัวเดียว (`CrewSlotPicker`) — CrewLoadPicker ถอดแล้ว */
const slotPicker = read('./CrewSlotPicker.js');
const slotLib = read('../../lib/service/crewSlotView.js');
const route = read('../../app/api/service/visits/[id]/route.js');

/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์ที่เล่าประวัติยังใช้คำเก่า ("เข้าคิว") ได้ตามมติ */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function loadVisitToForm() {
  const empty = modal.match(/const EMPTY = \{[\s\S]*?\n\};/);
  const fn = modal.match(/export function visitToForm\(visit\) \{[\s\S]*?\n\}/);
  assert.ok(empty && fn, 'หา EMPTY / visitToForm ในโมดัลไม่เจอ');
  return new Function(`${empty[0]}\n${fn[0].replace(/^export /, '')}\nreturn { visitToForm, EMPTY };`)();
}

test('visitToForm คืนทุกช่องของฟอร์ม — PATCH ลัดไม่ล้างช่องไหนทิ้ง', () => {
  const { visitToForm, EMPTY } = loadVisitToForm();
  const row = {
    siteId: 'S1', kind: 'inspect', scheduledDate: '2026-09-24', startTime: '09:00:00', endTime: '12:00:00',
    assigneeId: 'U1', assigneeName: 'สมชาย ใจดี', assistantIds: ['U2'], status: 'draft',
    actualDate: null, actualStartTime: null, actualEndTime: null, summary: null, note: 'ฝากกุญแจ รปภ.',
    unableReason: null, code: 'SV-26090014', id: 'V1',
  };
  const form = visitToForm(row);
  assert.deepEqual(Object.keys(form).sort(), Object.keys(EMPTY).sort());
  assert.equal(form.startTime, '09:00');
  assert.equal(form.endTime, '12:00');
  assert.deepEqual(form.assistantIds, ['U2']);
  assert.equal(form.note, 'ฝากกุญแจ รปภ.');
  assert.equal(form.summary, '');
  assert.equal(form.rescheduleReason, '', 'เหตุผลเลื่อนไม่ค้างจากรอบก่อน');
  // ปล่อยลัด = { ...visitToForm(v), status: 'scheduled' } — สถานะทับได้ ช่องอื่นอยู่ครบ
  assert.equal({ ...form, status: 'scheduled' }.status, 'scheduled');
});

test('visitToForm ทนค่าว่าง: ไม่มีใบ = ฟอร์มเปล่า · assistantIds ไม่ใช่อาเรย์ = []', () => {
  const { visitToForm, EMPTY } = loadVisitToForm();
  assert.deepEqual(visitToForm(null), EMPTY);
  assert.deepEqual(visitToForm({ assistantIds: null }).assistantIds, []);
  assert.equal(visitToForm({}).kind, 'refill');
  assert.equal(visitToForm({}).status, 'scheduled');
});

test('โมดัลใช้ visitToForm ตัวเดียวกับที่ export (ไม่มีแมปปิ้งชุดที่สอง)', () => {
  assert.match(modal, /setForm\(visitToForm\(visit\)\)/);
  assert.equal((modal.match(/assistantIds: Array\.isArray\(visit\.assistantIds\)/g) || []).length, 1);
});

/* 🔒 ขอบเขต "UI อย่างเดียว" (มติเจ้าของ 24/09 แบบ A) — รื้อหน้าตาทั้งโมดัล แต่ก้อนที่ส่งต้องเท่าเดิมทุกทาง
   ทางส่งทางเดียว (`submit` → `onSave`) · ปุ่มแต่ละปุ่มส่งอาร์กิวเมนต์ชุดเดิมของปุ่มเดิม:
     สร้างนัด / บันทึกการแก้ไข / บันทึกร่าง = ฟอร์มทั้งก้อน (ร่าง "บันทึก" เดิม = ฟอร์มที่สถานะยังเป็นร่าง)
     ปล่อยขึ้นตาราง = ฟอร์ม + status "scheduled" · ข้ามด่านและขึ้นตาราง = + gateOverrideReason */
test('🔒 ก้อนที่ส่งเท่าของเดิมทุกปุ่ม — ทางส่งทางเดียว · อาร์กิวเมนต์ของ submit ครบสามรูปเดิม', () => {
  const live = code(modal);
  assert.match(live, /const payload = override \? \{ \.\.\.form, \.\.\.override \} : form;/);
  assert.equal((live.match(/\bonSave\(/g) || []).length, 1);
  assert.match(live, /await onSave\(payload\);/);
  const args = [...live.matchAll(/\bsubmit\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(args)].sort(), [
    '',
    '{ status: "scheduled" }',
    '{ status: "scheduled", gateOverrideReason: overrideReason.trim() }',
  ]);
  // ตัวตรวจฝั่งจอถามด้วยอาร์กิวเมนต์ชุดเดียวกับ server (existingKind) · เลื่อนวันต้องมีเหตุผล — เหมือนเดิม
  /* 🔄 มติเจ้าของ 24/09 ข้อ 4 (mig 0386): ค่าที่ **ตรวจ** เติมวันที่เสร็จจริงของแถวเดิม (`visitFormCheckInput` —
     server ตรวจ `{...before, ...body}`) ไม่งั้นนัดที่ส่งงานข้ามวันแก้จากโมดัลไม่ได้ · ก้อนที่ **ส่ง** ยังเป็น `payload` เดิม */
  assert.match(live, /normalizeVisitInput\(\s*visitFormCheckInput\(payload, editing \? visit : null\),\s*editing && visit\?\.kind \? \{ existingKind: visit\.kind \} : \{\},\s*\)/);
  assert.match(live, /if \(rescheduling && !form\.rescheduleReason\.trim\(\)\) \{/);
  // จอแม่ยิงก้อนที่ได้ตรง ๆ (POST สร้าง · PATCH แก้) — ไม่แตะช่องในก้อน
  /* 🔄 รีวิว S2b ข้อ V17 (19/10): PATCH แนบ `expectedStatus` (สถานะตอนเปิดฟอร์ม · ไม่ใช่คอลัมน์ server ถอดทิ้ง) เพิ่มคีย์เดียว */
  const page = read('../../app/service/schedule/page.js');
  assert.match(page, /method: editing \? "PATCH" : "POST",\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(editing \? \{ \.\.\.form, expectedStatus: formVisit\.status \} : form\),/);
});

test('🔒 ทุกปุ่มที่ visitModalView ประกาศมีตัวกดในโมดัล (ไม่มีปุ่มที่กดแล้วไม่เกิดอะไร)', async () => {
  const { visitModalView } = await import('../../lib/service/scheduleModal.js');
  const live = code(modal);
  const block = (name) => live.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n  \\};`))[1];
  const secondaryBlock = block('secondaryActions');
  const primaryBlock = block('primaryActions');
  const blocked = [{ key: 'assignee', state: 'blocked', detail: 'ยังไม่มอบหมาย' }];
  const keys = { secondary: new Set(), primary: new Set() };
  const base = { siteId: 'S', kind: 'refill', scheduledDate: '2026-10-01', status: 'draft', unableReason: '' };
  for (const visit of [null, { id: 'V', status: 'draft', scheduledDate: '2026-10-01' }, { id: 'V', status: 'scheduled', scheduledDate: '2026-10-01' }]) {
    for (const overriding of [false, true]) {
      const view = visitModalView({
        visit, form: { ...base, status: visit?.status || 'scheduled' }, todayIso: '2026-09-24', gate: blocked,
        canOverride: true, deleteAction: { blocker: '' }, overriding,
      });
      view.secondary.forEach((a) => keys.secondary.add(a.key));
      keys.primary.add(view.primary.key);
    }
  }
  for (const key of keys.secondary) assert.match(secondaryBlock, new RegExp(`\\b${key}:`), `ปุ่มรอง ${key}`);
  for (const key of keys.primary) assert.match(primaryBlock, new RegExp(`\\b${key}:`), `ปุ่มหลัก ${key}`);
  assert.deepEqual([...keys.secondary].sort(), ['cancel', 'cancelOverride', 'delete', 'override', 'saveDraft']);
  assert.deepEqual([...keys.primary].sort(), ['create', 'override', 'release', 'save']);
  // ปุ่มแต่ละตัวกับอาร์กิวเมนต์ของมัน
  assert.match(secondaryBlock, /saveDraft: \(\) => submit\(\),/);
  assert.match(secondaryBlock, /delete: remove,/);
  assert.match(secondaryBlock, /cancel: onClose,/);
  assert.match(primaryBlock, /create: \(\) => submit\(\),/);
  assert.match(primaryBlock, /save: \(\) => submit\(\),/);
  assert.match(primaryBlock, /release: \(\) => submit\(\{ status: "scheduled" \}\),/);
  assert.match(primaryBlock, /override: async \(\) => \{\s*await submit\(\{ status: "scheduled", gateOverrideReason: overrideReason\.trim\(\) \}\);\s*setOverriding\(false\);/);
});

test('focusField พาโฟกัสไปช่องที่ขอ — ผ่าน ref ของกล่อง ไม่ใช่ตัวฟังทั้งหน้า', () => {
  const live = code(modal);
  // วัน · คน อยู่ในตารางตัวเดียว (แถบเต็มกว้าง) — ref ของกลุ่มปุ่มวัน / กลุ่มแถวช่าง ส่งเข้าไปในตัวเลือก
  const tag = live.match(/<CrewSlotPicker[\s\S]*?\/>/)[0];
  assert.match(tag, /dayRef=\{dateRef\}/);
  assert.match(tag, /crewRef=\{assigneeRef\}/);
  assert.match(slotPicker, /role="group" aria-label="วันนัด" ref=\{dayRef\}/);
  assert.equal((slotPicker.match(/ref=\{crewRef\} role="radiogroup"/g) || []).length, 2, 'ตารางจอกว้าง + รายชื่อมือถือ');
  assert.match(modal, /focusPending === "assignee" \? assigneeRef\.current/);
  assert.match(modal, /focusPending === "scheduledDate" \? dateRef\.current/);
  // ตัวพาโฟกัสตัวเดียวของสองโมดัล (รีวิว UAT 24/09 — เดิมก๊อปอยู่สองไฟล์คำต่อคำ) · แถบวัน = ปุ่มที่กดค้างก่อนปุ่มแรก
  assert.match(modal, /if \(focusFieldBox\(box\)\) setFocusPending\(null\);/);
  const parts = read('./ScheduleModalParts.js');
  assert.match(parts, /box\?\.querySelector\('input\[type="radio"\]:checked'\) \|\| box\?\.querySelector\('\[aria-pressed="true"\]'\)\s*\|\| box\?\.querySelector\(FIELD_FOCUSABLE\)/);
  assert.match(parts, /target\.focus\(/);
  assert.match(parts, /scrollIntoView\(/);
  assert.doesNotMatch(live, /(?:document|window)\.addEventListener/);
  // ⚠️ ไม่ผูกกับ visit — โหลดใหม่ระหว่างเปิดโมดัลต้องไม่ดึงโฟกัสกลับกลางคัน
  assert.match(modal, /setFocusPending\(open && focusField \? focusField : null\);\s*\}, \[open, focusField\]\);/);
  // ⭐ ลิงก์แก้บนแผงด่าน (③ เลือกเจ้าหน้าที่ · ④ แก้วัน/เวลา) ใช้ทางเดียวกัน
  assert.match(live, /<GatePanel view=\{gateView\} onFix=\{setFocusPending\}>/);
});

test('ตัวเลือกคนมีทรงเดียว — ตารางช่าง × เวลา · ภาระจากก้อนเดียวกับตาราง · ไม่มีดรอปดาวน์สำรอง', () => {
  const live = code(modal);
  /* ⭐ บรรทัดผลลัพธ์ (เกินภาระ) กับตารางอ่านก้อนเดียวกัน · นัดที่กำลังแก้ไม่นับเป็นภาระของตัวเอง */
  assert.match(live, /if \(crewLoad\) return crewLoadFromQueue\(crewLoad, form\.scheduledDate, \{ technicians, excludeVisitId: visit\?\.id \|\| "" \}\);/);
  assert.match(live, /return staffLoadFor \? staffLoadFor\(form\.scheduledDate\) : null;/);
  assert.equal((live.match(/<CrewSlotPicker\b/g) || []).length, 1);
  assert.doesNotMatch(live, /<CrewLoadPicker\b|<TimeWindowField\b/);
  assert.match(live, /<CrewSlotPicker[\s\S]*?load=\{crewLoad\}[\s\S]*?siteLoad=\{siteLoad\}[\s\S]*?excludeVisitId=\{visit\?\.id \|\| null\}[\s\S]*?rosterState=\{rosterState\}[\s\S]*?\/>/);
  assert.match(live, /band=\{band\}/, 'ตารางอยู่แถบเต็มกว้างของเปลือก (มติ 11/11)');
  // 🐞 ดรอปดาวน์เดิมไม่เห็นภาระ และสลับทรงกลางคัน (โฟกัสหลุด) — ต้องไม่กลับมา
  assert.doesNotMatch(live, /placeholder="ยังไม่มอบหมาย"/);
  assert.doesNotMatch(live, /ariaLabel="เจ้าหน้าที่ผู้รับผิดชอบ"/);
  // ภาระไม่มา (ยังโหลดไม่ได้) = ขีด ไม่ใช่ศูนย์ · ยังไม่มีวัน = บอกให้เลือกวันก่อน (ตัดสินใน crewSlotView)
  assert.match(code(slotLib), /const state = !dateIso \? 'nodate' : known \? 'ok' : 'unknown';/);
  // เจ้าของงานบอกข้างป้าย (ไม่ใช่คำใบ้ใต้รายชื่อที่ยาว)
  assert.match(live, /aside="เจ้าของงาน — ใบส่งงานและรอบถัดไปนับจากคนนี้"/);
  // หน้าจัดคิวส่งก้อนดิบเมื่อรายชื่อโหลดแล้วเท่านั้น (ก่อนนั้นคนที่ตั้งไว้จะอ่านว่า "ไม่อยู่ในรายชื่อแล้ว")
  assert.match(code(read('../../app/service/schedule/page.js')), /crewLoad=\{technicians\.length \? slotLoad : null\}/);
});

/* ⭐ ตัวเลือกวาดอย่างเดียว · กติกา (ว่าง/ทับ · ถ้าเลือก · เกินภาระ · ขีดแทนศูนย์) อยู่ที่ `crewSlotView`
   และเทสต์ด้วยค่าจริงที่ `lib/service/crewSlotView.test.mjs` */
test('CrewSlotPicker: radio จริงชื่อกลุ่มเดียว · วาดจาก crewSlotView · ไม่คิดกติกาเอง · ไม่มี inline style', () => {
  const src = code(slotPicker);
  assert.match(src, /const view = useMemo\(\(\) => crewSlotView\(\{/);
  assert.match(src, /type="radio" name=\{group\} value=\{row\.id\} checked=\{row\.selected\}/);
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /\{view\.notice \? <p className=\{styles\.notice\}>\{view\.notice\}<\/p> : null\}/);
  assert.doesNotMatch(src, /MAX_ASSETS_PER_DAY|isFreeRow|windowsOverlap|crewLoadPeople/);
  assert.doesNotMatch(src, /style=\{\{/);
  assert.doesNotMatch(src, /PersonLoadSelect/);
  // ไม่มี scroll แนวตั้งซ้อนใน scroll ของโมดัล (pain 3) — เลื่อนแค่แนวนอนของตาราง 24 ชม.
  assert.doesNotMatch(code(read('./CrewSlotPicker.module.css')), /max-height|overflow-y: auto/);
});

/* ⭐ มติเจ้าของ 23/09 — โมดัลลงคิวคำร้อง **บังคับ** เจ้าหน้าที่ · โมดัลนัดเลือก "ยังไม่มอบหมาย" ได้ (นัดไม่มีคน = ร่าง) */
test('CrewSlotPicker: allowUnassigned — ค่าตั้งต้น false · โมดัลนัดเปิดแถว "ยังไม่มอบหมาย" · aria-required', () => {
  const src = code(slotPicker);
  assert.match(src, /allowUnassigned = false,/);
  assert.match(src, /\{view\.unassigned \? \(/);
  assert.match(src, /aria-required=\{view\.unassigned \? undefined : "true"\}/);
  assert.match(code(slotLib), /unassigned: allowUnassigned \? \{ label: UNASSIGNED_LABEL, sub: UNASSIGNED_SUB, selected: !assigneeId \} : null/);
  assert.match(code(modal).match(/<CrewSlotPicker[\s\S]*?\/>/)[0], /\n\s*allowUnassigned\n/);
});

test('CrewSlotPicker: ผู้รับผิดชอบเดิมที่หลุดรายชื่อยังเป็นแถวที่ถูกเลือก · รายชื่อยังไม่พร้อม = สามข้อความ', () => {
  const src = code(slotPicker);
  assert.match(src, /\{view\.pinned \? \(/);
  assert.match(src, /value=\{view\.pinned\.id\} checked readOnly/);
  assert.match(src, /\{view\.pinned\.note\}/);
  assert.match(src, /if \(view\.roster\.state !== "ready"\) \{/);
  assert.match(src, /role=\{view\.roster\.state === "error" \? "alert" : undefined\}/);
});

test('คำบนจอ: ปล่อย "ขึ้นตาราง" ไม่ใช่ "เข้าคิว" (มติ 2026-09-22 ข้อ 3)', () => {
  const live = code(modal);
  /* คำของปุ่ม/แผง/ผลลัพธ์ของโมดัลนัด (`visitModalView` · `gatePanelView`) + คำของตารางช่าง × เวลา */
  const lib = code(read('../../lib/service/scheduleModal.js'));
  const shellLive = code(read('./ScheduleModalShell.js'));
  for (const src of [live, lib, shellLive, code(slotLib), code(slotPicker)]) assert.doesNotMatch(src, /เข้าคิว/);
  // คำของปุ่ม/แผง/ผลลัพธ์อยู่ใน lib ที่เดียว (`visitModalView` · `gatePanelView`)
  for (const text of ['ปล่อยขึ้นตาราง', 'ยังขึ้นตารางไม่ได้', 'ข้ามด่านและขึ้นตาราง', 'ข้ามด่าน (แอดมิน)']) {
    assert.ok(lib.includes(text), `ขาด "${text}"`);
  }
  // แผ่นข้ามด่านในโมดัล
  assert.match(live, /aria-label="ข้ามด่านขึ้นตาราง"/);
  assert.match(live, /ข้ามด่านขึ้นตาราง — ข้อที่จะข้าม/);
  // D9: ปุ่มเป็นสิทธิ์ของแอดมิน (canOverrideServiceGate) — ป้ายเดิม "หัวหน้า" ผิด
  assert.doesNotMatch(lib, /ข้ามด่าน \(หัวหน้า\)/);
});

test('ข้อความในเธรดของนัด: ปล่อยขึ้นตาราง', () => {
  const live = code(route);
  assert.match(live, /`ข้ามด่านแล้วปล่อยขึ้นตาราง \(ข้าม: \$\{gateTrail\.skipped\.join\(' · '\)\}\) — \$\{gateTrail\.gateOverrideReason\}`/);
  assert.match(live, /'ปล่อยขึ้นตาราง — ด่านครบ'/);
  assert.doesNotMatch(live, /ปล่อยเข้าคิว/);
});
