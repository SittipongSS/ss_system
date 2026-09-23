// ── ยามของหน้าจัดคิวเจ้าหน้าที่ (มติผู้ใช้ 2026-09-22 · รายการงานคู่ตาราง) ─────────────
//
// 🐞 ของที่รีวิวก่อน merge จับได้ แล้วเทสต์หน่วยมองไม่เห็นเพราะอยู่ในจอ:
//   1. แถบบอกตำแหน่งเก็บ **สำเนาแถว** ไว้ ⇒ แก้ร่างแล้วกดปล่อยจากแถบ = ยิงค่าเก่าทับค่าใหม่
//   2. ปล่อยจากการ์ดส่ง **ทั้งฟอร์ม** จากสำเนา ⇒ ค่าที่ถูกแก้หลังการ์ดวาดถูกเขียนทับ
//   3. โหลดเบื้องหลังล้าง error ⇒ พังซ้ำแล้วจอดูเหมือน "ว่าง"
//   4. กลุ่มที่พับกินที่ในหน้า ⇒ มีหน้าที่เหลือแต่หัวกลุ่ม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');

test('แถบบอกตำแหน่งเก็บแค่ id แล้วอ่านของสดทุกครั้ง', () => {
  assert.match(page, /setFocus\(\{ visitId: row\.visit\.id, released: false \}\)/);
  assert.doesNotMatch(page, /focus\.row\b/, 'ห้ามอ่านสำเนาแถวจาก focus');
  assert.match(page, /queueView\.rows\.find\(\(r\) => r\.id === focus\.visitId\)/);
});

test('ปล่อยจากการ์ดส่งแค่สถานะ ไม่ส่งทั้งฟอร์มจากสำเนา', () => {
  assert.match(page, /body: JSON\.stringify\(\{ status: "scheduled" \}\)/);
  assert.doesNotMatch(page, /visitToForm\(row\.visit\)/);
});

test('โหลดเบื้องหลังไม่ล้าง error ของรอบก่อน', () => {
  assert.match(page, /if \(!opts\?\.background\) setLoadError\(""\);/);
  assert.match(page, /if \(!opts\?\.background\) setQueueError\(""\);/);
});

test('กลุ่มที่พับเป็นรายการเดียวในการแบ่งหน้า', () => {
  assert.match(page, /\? \[\{ head: true, groupKey: group\.key \}\]/);
});

test('หน้านี้วาง ไม่สร้าง — ไม่มีปุ่มสีแบรนด์ และร่างไม่ถูกวาดลงกริด', () => {
  assert.doesNotMatch(page, /tone="accent"/);
  // ชิปบนกริดมาจาก boardVisits (ไม่มีร่าง) เท่านั้น
  assert.match(page, /const boardVisits = useMemo\(\(\) => visits\.filter\(\(v\) => !isDraftVisit\(v\)\), \[visits\]\);/);
});

/* ═══ คำร้องรอลงคิว (มติเจ้าของ 23/09) ═══════════════════════════════════════════
   ⭐ ใบประเมินพื้นที่ที่ยังไม่มีนัดขึ้นเป็นการ์ดในแท็บรอจัด · รับเรื่อง/ลงคิวได้จากการ์ด
   ⚠️ ยามอ่านซอร์ส (จอเป็น JSX) — ตรรกะของการ์ด/ตัวเลขเทสต์ที่ scheduleQueueView.test.mjs */
const card = readFileSync(new URL('../../components/service/ScheduleQueueCard.js', import.meta.url), 'utf8');
const live = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('⭐ การ์ดคำร้องมาจาก API ตัวเดียวกับรายการงาน และส่งเข้าตัวประกอบรายการ', () => {
  assert.match(page, /surveyRequests: Array\.isArray\(data\?\.surveyRequests\) \? data\.surveyRequests : null,/);
  assert.match(page, /surveyRequestsError: data\?\.surveyRequestsError \|\| "",/);
  assert.match(page, /surveyRequests: queue\.surveyRequests \|\| \[\],\n\s*\}\), \[queue,/);
});

test('⭐ แถบต้นทางงาน: ตัวเลขคำร้อง = จำนวนการ์ด (requestCount) ไม่ใช่ป้ายเมนู "รอ TS ตอบ"', () => {
  const src = live(page);
  assert.doesNotMatch(src, /navCountFor\([^)]*"\/service\/requests"\)/, 'ป้ายเมนูนับผิดชุดสำหรับหน้านี้');
  assert.match(src, /queueReady && queueView\.requestCount > 0 \? \(/);
  assert.match(src, /\{fmtNumber\(queueView\.requestCount\)\}/);
  // นับไม่ได้ ≠ ศูนย์
  assert.match(src, /\{queue\.surveyRequestsError \? \(\s*<span className=\{styles\.upError\}>นับไม่สำเร็จ<\/span>/);
  // ป้ายงานเข้าใหม่บอกทั้งสองแท็บที่ตัวเลขนับรวม
  assert.match(src, /<Link href="\/service\/intake" className="linklike">งานเข้าใหม่<\/Link> · \{INTAKE_UPSTREAM_LABEL\}/);
  assert.doesNotMatch(src, /งานเข้าใหม่<\/Link> · รอตั้งไซต์\/โซน/);
  // กดตัวเลข → แท็บรอจัด + เลื่อนไปกลุ่มคำร้อง (id ของกลุ่มต้องมีจริง)
  assert.match(src, /onClick=\{showRequestCards\}/);
  assert.match(src, /id=\{`queue-group-\$\{group\.key\}`\}/);
  assert.match(src, /revealGroup\.current = "requests";/);
});

test('⭐ ไม่มีนัดแต่มีคำร้องรอลงคิว ≠ "ยังไม่มีงานให้วาง" · คำร้องพังบอกแยกจากนัด', () => {
  assert.match(page, /const queueColdStart = queueReady && !queue\.visits\.length && !\(queue\.surveyRequests \|\| \[\]\)\.length;/);
  assert.match(live(page), /\{!queueError && queue\.surveyRequestsError && bucket === "waiting" && \(\s*<StatusNotice tone="warning" title="โหลดคำร้องรอลงคิวไม่สำเร็จ"/);
});

test('⭐ รับเรื่องจากการ์ด: กล่องยืนยัน → PATCH action "acknowledge" · สำเร็จหรือพลาดก็โหลดใหม่', () => {
  const src = live(page);
  const ack = src.match(/const confirmAcknowledge = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(ack, 'หา confirmAcknowledge ไม่เจอ');
  assert.match(ack[0], /apiJson\(requestUrl\(row\), \{\s*method: "PATCH", json: \{ action: "acknowledge" \}/);
  assert.match(ack[0], /catch \(e\) \{\s*reloadAfterRequest\(\);\s*throw e;/, 'พลาดแล้วต้องโหลดใหม่ และค้างกล่องไว้พร้อมเหตุ');
  assert.match(ack[0], /await reloadAfterRequest\(\);\s*$/m);
  assert.match(src, /<ConfirmDialog\s+open=\{!!ackRow\}\s+\{\.\.\.\(ackRow \? acknowledgeConfirmCopy\(ackRow\.request\) : \{\}\)\}[\s\S]*?onConfirm=\{confirmAcknowledge\}/);
});

test('⭐ ลงคิวจากการ์ด: โมดัลกลาง → PATCH ก้อนที่โมดัลประกอบ · โหลดใหม่ทั้งสำเร็จและพลาด · พลาดค้างโมดัล', () => {
  const src = live(page);
  const submit = src.match(/const submitCommitDue = async \(payload\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(submit, 'หา submitCommitDue ไม่เจอ');
  assert.match(submit[0], /apiJson\(requestUrl\(row\), \{\s*method: "PATCH", json: payload,/);
  assert.match(submit[0], /setDueRow\(null\);/);
  assert.match(submit[0], /catch \(e\) \{\s*setToast\(\{ kind: "error", msg: e\.message \}\);\s*\}/, 'พลาด = บอก แต่ไม่ปิดโมดัล');
  assert.match(submit[0], /finally \{\s*setDueBusy\(false\);\s*\}\s*await reloadAfterRequest\(\);/);
  // สำเร็จครึ่งเดียว (นัดเป็นร่าง) ต้องไม่ขึ้นเขียว
  assert.match(submit[0], /responseWarningText\(data\)/);
  assert.match(src, /const reloadAfterRequest = \(\) => Promise\.all\(\[\s*load\(\{ background: true, keep: true \}\),\s*loadQueue\(\{ background: true, keep: true \}\),\s*\]\)/);
  assert.match(src, /<CommitDueDialog\s+open=\{!!dueRow\}\s+request=\{dueRow\?\.request\}[\s\S]*?onSubmit=\{submitCommitDue\}/);
});

test('⭐ รายชื่อเจ้าหน้าที่โหลดทั้งตอนเปิดโมดัลนัดและตอนเปิดโมดัลลงคิว', () => {
  assert.match(page, /const pickingPeople = formVisit !== undefined \|\| !!dueRow;/);
  assert.match(page, /if \(!pickingPeople \|\| technicians\.length\) return;/);
  assert.match(page, /\}, \[pickingPeople, technicians\.length\]\);/);
});

test('⭐ การ์ดคำร้อง: รหัสเป็นลิงก์ไปหน้าใบ · ไม่มีปุ่มปฏิทิน · ปุ่มโชว์เฉพาะคนที่ตอบคำร้องได้', () => {
  const src = live(card);
  assert.match(src, /\{isRequest \? \(\s*<Link href=\{row\.href\} className=\{`linklike \$\{styles\.code\}`\} data-queue-code=\{row\.id\}>/);
  assert.match(src, /\{row\.visit && \(\s*<Button[\s\S]*?ปฏิทิน\s*<\/Button>\s*\)\}/, 'ปฏิทินพาไปหานัด — ไม่มีนัดไม่มีปุ่ม');
  assert.match(src, /\{isRequest && canAnswer && row\.actions\.acknowledge && \(\s*<GatedAction[\s\S]*?blocker=\{row\.ackBlocker\}/);
  assert.match(src, /\{isRequest && canAnswer && row\.actions\.commitDue && \(/);
  assert.match(live(page), /canAnswer=\{canSeeRequests\}/);
  assert.match(live(page), /onAcknowledge=\{setAckRow\}/);
  assert.match(live(page), /onCommitDue=\{setDueRow\}/);
});

/* 🐞 UAT 24/09 (390px): กดตัวเลขคำร้องบนแถบแล้ว `revealPending` เลื่อน `#queue-group-requests` ด้วย
   `scrollIntoView({block:'start'})` ⇒ หัวกลุ่ม ("คำร้องรอลงคิว" + บรรทัด "รอลงคิว 1") ไปจอดใต้แถบเมนูที่ปักไว้
   (top=0 · แถบกิน ~56px) เห็นแต่ตัวการ์ด · บั๊กตระกูลเดียวกับ PerformanceTab 06/09 (globals.css `.scroll-anchor`)
   ⭐ เป้าของการเลื่อนต้องติดคลาสกลาง `.scroll-anchor` (เผื่อความสูงแถบตามชั้นจอ ไม่ใช่เลขดิบรายจุด) */
test('🐞 กลุ่มในรายการงาน (เป้าของตัวเลขคำร้องบนแถบ) เผื่อแถบเมนู — ติด .scroll-anchor', () => {
  const src = live(page);
  const section = src.match(/<section key=\{group\.key\} id=\{`queue-group-\$\{group\.key\}`\}[^>]*>/);
  assert.ok(section, 'หา <section> ของกลุ่มไม่เจอ');
  assert.match(section[0], /className=\{`\$\{styles\.group\} scroll-anchor`\}/,
    'ไม่มี scroll-margin-top ⇒ หัวกลุ่มจอดใต้แถบเมนูที่ปักไว้');
  // ยังเป็นเป้าเดียวกับที่ revealPending เลื่อนไปหา
  assert.match(src, /document\.getElementById\(`queue-group-\$\{revealGroup\.current\}`\)/);
});

test('🐞 การ์ดคำร้องนับคนว่างจากคนที่มอบหมายได้ (ชุดเดียวกับตัวเลือกในโมดัลลงคิว) ไม่ใช่แค่คนหน้างาน', () => {
  const src = live(page);
  // ทั้งฝ่าย TS (API ทีมกรองฝ่ายแล้ว) — ไม่ใช่ `isFieldCrewRole` แบบ crewPeople
  assert.match(src, /const assignablePeople = useMemo\(\s*\(\) => crew\.people\.filter\(\(p\) => p\?\.id\)\.map/);
  assert.match(src, /buildScheduleQueue\(\{[\s\S]*?\bassignablePeople,[\s\S]*?\}\), \[[^\]]*\bassignablePeople\b[^\]]*\]\)/);
});

/* ═══ มติเจ้าของ 24/09: "ไม่ปิดปุ่ม นอกรอบหรอ และไม่มี ปุ่มลบรอบนอกรอบด้วย" ═════════════════════
   1. ปิดปุ่ม "+ งานนอกรอบ" บนหัวหน้า (ทุก role) ระหว่างพักเรื่องงานนอกรอบ (มติ 23/09) — "ตั้งนัดรอบถัดไป" ยังอยู่
   2. ปุ่ม "ลบนัด" ของงานนอกรอบบนการ์ดรายการงาน + โมดัลแก้นัด — ด่านตัวเดียวกับ API (visitDelete.js) */
const modalSrc = readFileSync(new URL('../../components/service/ServiceVisitModal.js', import.meta.url), 'utf8');
const todaySrc = readFileSync(new URL('../../app/service/today/page.js', import.meta.url), 'utf8');
const siteSrc = readFileSync(new URL('../../app/database/sites/[id]/page.js', import.meta.url), 'utf8');

test('⛔ ปิดปุ่มงานนอกรอบ: หัวหน้าไม่มีปุ่มสร้างนัดเปล่า — เหลือแค่ "ตั้งนัดรอบถัดไป" (มี planId)', () => {
  const src = live(page);
  assert.doesNotMatch(src, /headerRight=/, 'หัวหน้าจัดคิวต้องไม่มีปุ่ม (ปุ่มเดียวที่เคยอยู่คือ + งานนอกรอบ)');
  assert.doesNotMatch(src, />\s*งานนอกรอบ\s*</, 'ไม่มีปุ่ม/ป้ายที่ชวนสร้างงานนอกรอบ');
  assert.doesNotMatch(src, /openNew\(\{ scheduledDate: todayIso \}\)/, 'ทางสร้างนัดเปล่าต้องไม่เหลือ');
  // ทางเดียวที่เปิดโมดัลโหมดสร้าง = คำแนะนำรอบถัดไปหลังปิดงาน (มี planId จาก server)
  const calls = src.match(/openNew\(([^)]*)\)/g) || [];
  assert.deepEqual(calls, ['openNew(pendingSuggestion)'], `openNew ถูกเรียกจาก: ${calls.join(' · ')}`);
  assert.match(src, /ตั้งนัดรอบถัดไป/);
  // ไอคอนของปุ่มที่ปิดไม่ค้างเป็น import ตาย
  assert.doesNotMatch(src, /\bPlus\b/);
  // เหตุผล + วันที่ + ทางเปิดคืน อยู่ในคอมเมนต์ (ให้คนมาเปิดคืนรู้ว่าต้องแก้อะไรบ้าง)
  assert.match(page, /ปิดปุ่ม "\+ งานนอกรอบ"[\s\S]{0,120}24\/09\/2569/);
  assert.match(page, /เปิดคืน/);
});

test('⛔ ข้อความบนจอไม่ชี้ไปหาปุ่มงานนอกรอบที่ปิดแล้ว (หน้าจัดคิว + หน้างานวันนี้)', () => {
  const src = live(page);
  assert.doesNotMatch(src, /งานนอกรอบที่มีต้นเรื่อง/, 'แถบ "วาง ไม่ได้สร้าง"');
  assert.doesNotMatch(src, /งานนอกรอบติดด่าน/, 'ข้อความว่างของแท็บรอจัด');
  assert.match(src, /นัดเกิดจากรอบบริการของไซต์\s*หรืองานถอนเครื่องเมื่อลูกค้าไม่ต่อสัญญา/);
  // หน้างานวันนี้เคยบอกให้ไป "สร้างนัด" ที่หน้าจัดคิว — ทางเดียวบนหน้านั้นคือปุ่มที่ปิดแล้ว
  assert.doesNotMatch(live(todaySrc), /สร้างนัดได้ที่หน้าจัดคิว/);
});

/* 🐞 รีวิว 24/09: toast รอบถัดไปเคยสัญญาว่า "ถ้ายังไม่มีนัดวันนั้น … ระบบจะเติมนัดให้" — วันแนะนำนับจากวันเข้าจริง
   (`nextAfterDone`) แต่ตัวเติมนัดเดินตามวันเริ่มของรอบ (`plannedDates`) ⇒ ไม่มีวันเติมนัด "วันนั้น" ให้ */
test('⭐ toast รอบถัดไปของงานวันนี้ไม่สัญญานัด "วันนั้น" — ชี้รายการงาน + แท็บครบรอบยังไม่มีนัด', async () => {
  const { INTAKE_TAB_LABELS } = await import('./intake.js');
  const src = live(todaySrc);
  const toast = src.match(/: suggestion\s*\? \{ kind: "success", msg: `([^`]*)` \}/)?.[1];
  assert.ok(toast, 'หา toast รอบถัดไปไม่เจอ');
  assert.doesNotMatch(toast, /วันนั้น/, 'ห้ามชี้ "วันนั้น" — นัดของรอบอยู่คนละวันกับวันแนะนำได้เสมอ');
  assert.doesNotMatch(toast, /ระบบจะเติมนัดให้/);
  assert.match(toast, /ราว \$\{suggestion\.scheduledDate\}/, 'วันแนะนำเป็นค่าประมาณ');
  assert.match(toast, /ผู้จัดคิวดูนัดรอบถัดไปของรอบนี้ได้ในรายการงาน/);
  // ชื่อแท็บต้องตรงของจริง (ชื่อเปลี่ยน = ข้อความชี้ไปแท็บที่ไม่มี)
  assert.ok(toast.includes(`“${INTAKE_TAB_LABELS.visit}”`), `ต้องเรียกแท็บ "${INTAKE_TAB_LABELS.visit}" ตามชื่อจริง`);
});

test('⭐ การ์ดรายการงาน: ปุ่ม "ลบนัด" = GatedAction สีแดงเส้นขอบ · เฉพาะคนแก้งานบริการได้ · เหตุจากด่านตัวเดียวกับ API', () => {
  const src = live(card);
  const btn = src.match(/\{canEdit && row\.actions\.delete && \(\s*<GatedAction[\s\S]*?<\/GatedAction>\s*\)\}/);
  assert.ok(btn, 'หาปุ่มลบนัดบนการ์ดไม่เจอ');
  assert.match(btn[0], /tone="danger" variant="outline" size="sm"/, 'สีแดงแบบรอง ไม่ใช่ปุ่มหลัก');
  assert.match(btn[0], /blocker=\{row\.deleteBlocker\}/);
  assert.match(btn[0], /onClick=\{\(\) => onDelete\?\.\(row\.visit\)\}/);
  assert.match(btn[0], /disabled=\{deleting\}/);
  assert.match(btn[0], /ลบนัด/);
  // หน้าจัดคิวส่งตัวลบ + สถานะกำลังลบรายใบ
  assert.match(live(page), /deleting=\{deletingId === row\.id\}/);
  assert.match(live(page), /onDelete=\{deleteVisit\}/);
});

test('⭐ โมดัลแก้นัด: ปุ่ม "ลบนัด" จาก visitDeleteButton ของใบที่บันทึกไว้ · จอแม่ส่งตัวลบเฉพาะคนแก้ได้', () => {
  const src = live(modalSrc);
  assert.match(src, /const deleteAction = editing && onDelete \? visitDeleteButton\(visit\) : null;/);
  assert.match(src, /\{deleteAction && \(\s*<GatedAction\s+tone="danger" variant="outline"\s+blocker=\{deleteAction\.blocker\}\s+onClick=\{remove\}/);
  assert.match(src, /await onDelete\(visit\);/);
  // ปุ่มลบอยู่นอกกลุ่มยกเลิก/บันทึก (กดพลาดจากปุ่มบันทึกไม่ได้)
  assert.ok(src.indexOf('{deleteAction && (') < src.indexOf('<div className="form-actions-buttons">'));
  // ชิปบนตารางเปิดโมดัลนี้ได้ทุกคน ⇒ กั้นสิทธิ์ที่จอแม่
  assert.match(live(page), /onDelete=\{canEdit \? deleteVisit : null\}/);
  // "กำลังลบ…" มาจากคำขอที่วิ่งจริง (จอแม่ถือ) ไม่ใช่ตั้งแต่กล่องยืนยันยังเปิดอยู่
  assert.match(live(page), /deleting=\{!!formVisit && deletingId === formVisit\.id\}/);
  assert.doesNotMatch(src, /setDeleting\(/, 'โมดัลไม่ถือสถานะลบเอง');
  assert.match(src, /deleting = false,/);
});

test('⭐ ลบจากหน้าจัดคิว: ยืนยันด้วย visitDeletePrompt → DELETE ไม่มี force → โหลดตาราง+รายการงานใหม่ · error เป็น toast', () => {
  const src = live(page);
  const fn = src.match(/const deleteVisit = async \(visit\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(fn, 'หา deleteVisit ไม่เจอ');
  const body = fn[0];
  assert.match(body, /const blocker = visitDeleteBlocker\(visit\);/);
  // กดซ้ำระหว่างกล่องยืนยันเปิด = คำขอยืนยันใบที่สองทับใบแรก ⇒ กันก่อนถาม
  assert.match(body, /if \(!visit\?\.id \|\| deleteAsking\.current\) return false;/);
  assert.ok(body.indexOf('deleteAsking.current = true;') < body.indexOf('confirmAction('));
  assert.match(body, /finally \{\s*deleteAsking\.current = false;\s*setDeletingId\(null\);/);
  assert.match(body, /await confirmAction\(visitDeletePrompt\(visit, \{ siteName: sitesById\.get\(visit\.siteId\)\?\.name, when, day \}\)\)/);
  assert.match(body, /apiJson\(`\/api\/service\/visits\/\$\{encodeURIComponent\(visit\.id\)\}`, \{\s*method: "DELETE"/);
  assert.doesNotMatch(body, /force/, 'เส้นข้ามด่านเป็นของแอดมินที่หน้าไซต์ ไม่ใช่ปุ่มนี้');
  // error ขึ้น toast ของหน้า (ชั้นเหนือโมดัล) ไม่ใช่กลืน
  assert.match(body, /catch \(e\) \{\s*setToast\(\{ kind: "error", msg: e\.message \}\);/);
  // ลบใบที่เปิดโมดัลอยู่ ⇒ ปิดโมดัล · แถบตำแหน่งที่ชี้ใบนั้นปิดด้วย
  assert.match(body, /if \(formVisit\?\.id === visit\.id\) closeModal\(\);/);
  assert.match(body, /if \(focus\?\.visitId === visit\.id\) setFocus\(null\);/);
  // สำเร็จหรือพลาดก็โหลดใหม่ — ท่าเดียวกับหลังบันทึก/ปล่อย
  assert.match(body, /await Promise\.all\(\[load\(\{ background: true, keep: true \}\), loadQueue\(\{ background: true, keep: true \}\)\]\);\s*return deleted;/);
});

test('⭐ หน้าไซต์ถามด่านลบตัวเดียวกับ API — ติดด่านโชว์เหตุ · แอดมินเดินเส้น force พร้อมบอกกติกาที่ข้าม', () => {
  const src = live(siteSrc);
  assert.match(src, /const deleteRule = visitDeleteBlocker\(visit\);\s*const forceDelete = isAdmin && !!deleteRule;/);
  assert.match(src, /<GatedAction iconOnly tone="danger" variant="quiet"[\s\S]*?blocker=\{forceDelete \? "" : deleteRule\}[\s\S]*?setPendingDelete\(\{ type: "visit", row: visit, force: forceDelete \}\)/);
  /* ⭐ รีวิว 24/09: กติกา **โชว์** ตัวเดียวกับหน้าจัดคิว (`visitDeleteButton`) — ไม่ใช่แอดมิน = ถังขยะเฉพาะงานนอกรอบ
     🐞 เดิมโชว์ทุกแถวแล้วติดด่าน ⇒ นัดของรอบ (แถวส่วนใหญ่) มีถังขยะที่ได้แต่ toast "ลบไม่ได้" และสองจอพูดคนละแบบ */
  assert.match(src, /const showDelete = isAdmin \|\| !!visitDeleteButton\(visit\);/);
  assert.match(src, /<td>\s*\{showDelete && \(\s*<div className=\{styles\.rowActions\}>\s*<GatedAction iconOnly tone="danger"/);
  // กล่องของแอดมินบอกกติกาที่กำลังข้ามจากด่านตัวเดียวกัน ไม่ใช่คำตายตัว "ลบนัดที่ปิดงานแล้ว"
  assert.match(src, /detail: \(row\) => \{\s*const rule = visitDeleteBlocker\(row\);/);
  assert.doesNotMatch(src, /title: "ลบนัดที่ปิดงานแล้ว"/);
  assert.match(src, /detail: typeof copy\.detail === "function" \? copy\.detail\(pendingDelete\.row\) : copy\.detail/);
});

/* ═══ รีวิว 24/09 ─ แถบปุ่มท้ายโมดัลนัดบนจอแคบ ══════════════════════════════════════════════════
   🐞 ≤680px: กลุ่มขวาไม่ตัดบรรทัด (ร่าง+หัวหน้า = สี่ปุ่มไทยยาวใน ~300px) · ปุ่มลบสูง 40 ข้างปุ่ม 44
   🐞 ระหว่างคำขอลบวิ่ง "ปล่อยขึ้นตาราง"/"ข้ามด่าน (หัวหน้า)" ยังกดได้ = ยิง PATCH ชนกับ DELETE */
const modalCss = readFileSync(new URL('../../components/service/ServiceSiteModal.module.css', import.meta.url), 'utf8');

test('📱 แถบปุ่มโมดัลนัด ≤680: กลุ่มขวาตัดบรรทัดสองคอลัมน์ · ปุ่มลบสูงเท่าปุ่มนิ้วแตะ', () => {
  const src = live(modalSrc);
  assert.match(src, /<div className=\{`form-actions \$\{styles\.visitFooter\}`\}>\s*\{deleteAction && \(/,
    'แถบหลักของโมดัล (ที่มีปุ่มลบ) ต้องติดคลาส visitFooter');
  const block = modalCss.match(/@media \(max-width: 680px\) \{\s*\.visitFooter[\s\S]*?\n\}/)?.[0];
  assert.ok(block, 'หา @media ≤680 ของ .visitFooter ไม่เจอ');
  assert.match(block, /\.visitFooter > :global\(\.btn\) \{ min-height: var\(--ctl-h-touch\); \}/);
  assert.match(block, /\.visitFooter :global\(\.form-actions-buttons\) \{ flex-wrap: wrap; \}/);
  assert.match(block, /\.visitFooter :global\(\.form-actions-buttons > \.btn\) \{ flex: 1 1 calc\(50% - var\(--space-2\)\); \}/);
});

test('⭐ ระหว่างลบ ปุ่มที่เขียนใบเดียวกันดับทุกตัว (ยกเลิก · ข้ามด่าน · ปล่อยขึ้นตาราง · บันทึก)', () => {
  const src = live(modalSrc);
  const start = src.indexOf('<div className="form-actions-buttons">');
  const end = src.indexOf('{overriding && (');
  assert.ok(start > 0 && end > start, 'หาแถบปุ่มท้ายโมดัลไม่เจอ');
  const footer = src.slice(start, end);
  const disabled = footer.match(/disabled=\{[^}]*\}/g) || [];
  assert.equal(disabled.length, 4, `ปุ่มในกลุ่มขวา: ${disabled.join(' · ')}`);
  for (const prop of disabled) assert.match(prop, /deleting/, `${prop} ต้องดับตอนกำลังลบด้วย`);
});
