// ยามของการ์ด/โมดัล/จอ "งวดที่วันจะเปลี่ยน" ฝั่งลูกค้า (รุ่นสี่ · แบบ A · มติเจ้าของ 29/09)
// ⭐ ตรรกะของฟอร์มเทสต์ด้วยพฤติกรรมที่ CustomerBillingRuleState.test.mjs — ไฟล์นี้อ่านซอร์สเฉพาะสิ่งที่พฤติกรรมจับไม่ได้:
//    คำบนจอ (ห้ามสัญญาสิ่งที่ระบบไม่ทำ) · ทางที่จอยิง API · ของที่ต้องไม่อยู่บนจอรอบนี้ · หมุดที่หน้าอื่นลิงก์มา
// (ย้ายมาจาก lib/customerBillingRuleRoute.test.mjs — ยามฝั่งจอของรุ่นสองที่ผูกกับสวิตช์เครดิต ซึ่งรุ่นสี่ถอดแล้ว)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจ — หัวไฟล์เขียนคำเตือนที่เอ่ยชื่อสิ่งต้องห้ามไว้เอง */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const DIR = 'src/components/database';
const card = () => code(`${DIR}/CustomerBillingRuleCard.js`);
const modal = () => code(`${DIR}/CustomerBillingRuleModal.js`);
const redate = () => code(`${DIR}/CustomerBillingRuleRedate.js`);
const parts = () => code(`${DIR}/CustomerBillingRuleRounds.js`);
const state = () => code(`${DIR}/CustomerBillingRuleState.js`);

test('⭐ ห้ามพูด "เครดิต 0 วัน" ทุกจอของลูกค้า · รูปเดิมใช้คำกลาง NO_CREDIT_TEXT ตัวเดียว', () => {
  for (const src of [card(), modal(), redate(), parts(), state()]) {
    assert.doesNotMatch(src, /เครดิต 0 วัน/);
  }
  for (const src of [card(), modal(), parts()]) assert.match(src, /NO_CREDIT_TEXT/);
});

test('⭐ หลักของเจ้าของ 28/09: ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล — การ์ด/โมดัลไม่สัญญากระดิ่งวางบิลให้ทุกราย', () => {
  for (const src of [card(), modal()]) {
    assert.doesNotMatch(src, /กระดิ่งเตือนก่อนถึงวันวางบิล|เหมือนลูกค้าทุกราย/);
    assert.match(src, /reminderChipsOf\(/, 'ชิปการเตือนมาจากตัวเดียวกับ cron (reminderKinds) ไม่เขียนเอง');
  }
});

test('⭐ รุ่นห้า: ข้อ ② มีทางที่สาม "ตามปฏิทินลูกค้า" · ข้อ ③ ของปฏิทิน = วันจ่ายตามปฏิทิน + เครดิต (ไม่มีค่าตั้งต้น · Q1) · วันจ่ายรายสัปดาห์ยังไม่มีจอ', () => {
  const src = modal();
  const bill = src.slice(src.indexOf('ariaLabel="วางบิลได้เมื่อไร"'), src.indexOf('value={form.bill}'));
  assert.deepEqual([...bill.matchAll(/value: "(\w+)"/g)].map((m) => m[1]), ['anyday', 'monthly', 'calendar']);
  const pay = src.slice(src.indexOf('ariaLabel="กำหนดชำระเมื่อไร"'), src.indexOf('value={form.pay}'));
  assert.deepEqual([...pay.matchAll(/value: "(\w+)"/g)].map((m) => m[1]), ['same', 'credit', 'runs'], 'ข้อ ③ ของทุกวัน/ทุกวันที่… สามทาง (มติ 29/09)');
  const calPay = src.slice(src.indexOf('ariaLabel="วันจ่ายตามปฏิทิน — มีเครดิตไหม"'), src.indexOf('value={form.calPay}'));
  assert.deepEqual([...calPay.matchAll(/value: "(\w+)"/g)].map((m) => m[1]), ['same', 'credit']);
  assert.match(src, /value=\{form\.calPay\}/, 'ค่าของข้อ ③ ปฏิทินมาจากฟอร์ม (blankForm = null) ไม่มีค่าตั้งต้น');
  assert.doesNotMatch(src, /weekday|วันในสัปดาห์/, 'วันจ่ายรายสัปดาห์ (AR-035) ไม่มีจอรอบนี้');
  assert.match(src, /<CalendarEditor[\s\S]*onUpdate=\{editCalendar\}/, 'ตัวแก้ตารางส่งตัวปรับ (prev → next) ไม่ใช่ค่าที่คิดจาก render เก่า');
  assert.match(src, /setForm\(\(prev\) => updateCalendar\(prev, fn\)\)/);
  assert.match(src, /<CutoffTimeField /, 'เวลาตัดรอบ (ไม่บังคับ) อยู่ในข้อ ②');
});

test('⭐ Q3 หยุดรอปฏิทินใหม่ — ไม่มีคำ "ประมาณการ"/estimate บนจอของลูกค้าเลย · ปฏิทินหมด = บรรทัดช่องว่างจาก lib (`missing.text`)', () => {
  const calendarFiles = ['CalendarEditor.js', 'CalendarPicture.js', 'CutoffTimeField.js'].map((f) => code(`${DIR}/billingCalendar/${f}`));
  calendarFiles.push(code('src/lib/useHolidayMap.js'));
  for (const src of [card(), modal(), redate(), parts(), state(), ...calendarFiles]) {
    assert.doesNotMatch(src, /ประมาณการ|estimate|dueEstimatedAs/i);
  }
  assert.match(modal(), /pv\.missing \? <p className=\{styles\.pvGap\}>/);
  assert.match(card(), /preview\.missing \? <p className=\{styles\.pvGap\}>/);
});

test('⭐ ตัวแก้ปฏิทิน: สถานะ/ด่านมาจาก lib ของ CORE ตัวเดียว · กริดเดือนจาก ui/MonthGrid · รูปแนบผ่านทางเดียวของระบบ', () => {
  const ed = code(`${DIR}/billingCalendar/CalendarEditor.js`);
  assert.match(ed, /from "@\/lib\/sales\/billingCalendarEdit"/);
  assert.match(ed, /import MonthGrid from "@\/components\/ui\/MonthGrid"/, 'ปฏิทินเล็ก อา–ส = MonthGrid (monthGridSingleSource)');
  assert.match(ed, /draftCalendarFromPattern\(/);
  assert.match(ed, /confirmCalendarMonth\(/, 'ปุ่ม "ตรงกับรูป" รายเดือน');
  assert.match(ed, /ตรงกับรูป/);
  assert.match(ed, /calendarPastMonths\(/, 'เดือนที่ผ่านแล้วพับ');
  assert.match(ed, /calendarYearTabs\(/, 'แท็บปี (ปีนี้ · ปีหน้า "ยังไม่มี")');
  assert.match(ed, /ลงเฉพาะช่องที่ว่าง/, 'ร่างลงเฉพาะช่องว่างเป็นทางแรก · ทับทั้งปีเป็นอีกทางที่คนเลือก');
  const st = state();
  assert.match(st, /calendarEditorIssues\(form\.calendar\)/, 'ด่านบันทึกของตาราง = ตัวเดียวกับ CORE');
  const pic = code(`${DIR}/billingCalendar/CalendarPicture.js`);
  assert.match(pic, /uploadAttachment\(\{/, 'ไบต์ขึ้น Drive + แถว attachments ทางเดียวของระบบ');
  assert.match(pic, /useFileIntake\(/, 'กดเลือก · ลากวาง · Ctrl+V (form-design-rules "แนบไฟล์")');
  assert.match(pic, /BILLING_CALENDAR_DOC_TYPE/);
  assert.doesNotMatch(pic, /export const BILLING_CALENDAR_DOC_TYPE|"billing_calendar"/, 'ชนิดเอกสารมาจากทะเบียนกลาง ไม่พิมพ์ซ้ำ');
  for (const src of [ed, pic, code(`${DIR}/billingCalendar/CutoffTimeField.js`)]) {
    assert.doesNotMatch(src, /new Date\(|Date\.UTC|setDate\(|getDate\(/, 'ไม่มีเลขคณิตวันที่ในจอ');
    assert.doesNotMatch(src, /<input type="file"|fetch\(/, 'ไม่เขียนทางเข้าไฟล์/fetch ดิบเอง');
  }
});

test('⭐ การ์ด: แถบ "ขอปฏิทิน YYYY" + ปุ่ม "ใส่ปฏิทิน YYYY" (คนแก้ได้เท่านั้น · เปิดโมดัลที่แท็บปีนั้น) · ตัวตัดสินช่วงเตือนตัวเดียวกับกระดิ่ง', () => {
  const src = card();
  assert.match(src, /calendarCardOf\(value, today/);
  assert.match(src, /\{canEdit \? \(\s*<Button[\s\S]{0,200}onClick=\{\(\) => setEditing\(\{ year: calendar\.banner\.year \}\)\}/, 'ไม่มีสิทธิ์ = ไม่วาดปุ่ม');
  assert.match(src, /ใส่ปฏิทิน \{calendar\.banner\.year\}/);
  assert.match(src, /calendarYear=\{editing\.year \|\| null\}/);
  assert.match(modal(), /initialYear=\{calendarYear\}/);
  const st = state();
  assert.match(st, /calendarStatus\(value, todayIso, \{ holidays \}\)/, 'การ์ด = calendarStatus ตัวเดียวกับ calendarReminder ของ cron');
});

test('⭐ ข้อ ① ไม่มีค่าตั้งต้น — แผ่นสามทาง · ค่าตั้งต้นของฟอร์มมาจากค่าที่เก็บ (formFromStored) เท่านั้น', () => {
  const src = modal();
  const options = src.slice(src.indexOf('const NEED_OPTIONS'), src.indexOf('];', src.indexOf('const NEED_OPTIONS')));
  assert.deepEqual([...options.matchAll(/value: "(\w+)"/g)].map((m) => m[1]), ['required', 'none', 'unknown']);
  assert.match(src, /useState\(\(\) => formFromStored\(customer\?\.billingRule\)\)/);
});

test('⭐ บันทึกผ่าน /api/master/customers/…/billing-rule ด้วยตัวล็อก (savePayloadOf → baseUpdatedAt) · ด่านเดียวกับ API', () => {
  const src = modal();
  assert.match(src, /apiJson\(`\/api\/master\/customers\/\$\{encodeURIComponent\(customer\.id\)\}\/billing-rule`, \{\s*method: "PATCH",\s*json: payload,/);
  assert.match(src, /send\(savePayloadOf\(result, base\.at\)\)/);
  assert.match(src, /billingRuleUpdatedAt \?\? null/, 'ตัวล็อก = สตริงดิบของแถวลูกค้าตอนเปิด');
  assert.doesNotMatch(src, /new Date\(base|Date\.parse\(base/, 'ห้ามแปลงตัวล็อกผ่าน Date (ไมโครวินาทีหาย = 409 ตลอด)');
  const st = state();
  assert.match(st, /normalizeRule\(input, \{ allowLegacy: false \}\)/, 'ตัวตัดสิน = normalizeRule โหมดบันทึกตัวเดียวกับ route');
  assert.doesNotMatch(st, /normalizeBillingRule|billingRuleOf/, 'ตัวอ่านรุ่นสองทิ้งรุ่นสี่เป็น null — ห้ามใช้บนจอนี้');
  for (const src2 of [card(), modal(), redate()]) assert.doesNotMatch(src2, /normalizeBillingRule|billingRuleOf|effectiveBillingRule/);
});

test('⭐ 409 ไม่ทิ้งที่กรอก — สองทาง "ใช้ค่าที่เขาบันทึก" / "บันทึกของฉันทับ" · ฟอร์มถูกแทนเฉพาะทางแรก', () => {
  const src = modal();
  const keep = src.slice(src.indexOf('const keepMine'), src.indexOf('const takeTheirs'));
  assert.doesNotMatch(keep, /setForm/, 'บันทึกทับ = ฟอร์มเดิมของคนกด');
  assert.match(keep, /send\(savePayloadOf\(result, current\.billingRuleUpdatedAt\)\)/, 'ส่งซ้ำด้วยตัวล็อกใหม่');
  const theirs = src.slice(src.indexOf('const takeTheirs'), src.indexOf('/* ── ผลก่อนบันทึก'));
  assert.match(theirs, /setForm\(formFromStored\(current\.billingRule\)\)/);
  assert.match(src, /ใช้ค่าที่เขาบันทึก/);
  assert.match(src, /บันทึกของฉันทับ/);
});

test('ลงเธรดไม่สำเร็จ ⇒ ทักพิมพ์ค่าเดิมให้เห็นเลย · ไม่ชี้ไปบันทึกของระบบที่ฝ่ายขาย/บัญชีเปิดไม่ได้ · ล้าง = ค่าเดิมดูย้อนได้ในความเคลื่อนไหว', () => {
  const src = modal();
  const branch = src.slice(src.indexOf('activityLogged === false'), src.indexOf('} else if (cleared)'));
  assert.match(branch, /describeRule\(stored\)/, 'ค่าเดิม = ค่าที่เก็บก่อนบันทึก');
  assert.match(branch, /RESPONSE_WARNING_TOAST/, 'ค้างนานพอให้จดทัน');
  for (const src2 of [card(), modal()]) assert.equal(/บันทึกการแก้ไขของระบบ|ประวัติการแก้ไข|audit/.test(src2), false, 'ห้ามสัญญาที่ที่คนกดเปิดไม่ได้');
  assert.match(src, /ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว/);
});

test('⭐ ระบบไม่ย้ายวันของงวดเอง — การ์ดเปิดจอ "งวดที่วันจะเปลี่ยน" จาก ruleChange · จอนั้นยิง redate ผ่าน alias ของ master', () => {
  const c = card();
  assert.match(c, /hasRuleChange\(ruleChange\)\) setRedate/);
  const r = redate();
  assert.match(r, /apiJson\(`\/api\/master\/customers\/\$\{encodeURIComponent\(customer\.id\)\}\/billing-rule\/redate`, \{\s*method: "POST",\s*json: redatePayloadOf\(change, selected\),/);
  assert.match(r, /useState\(\(\) => new Set\(\)\)/, 'ไม่มีค่าตั้งต้น — เปิดมาไม่ติ๊กสักงวด');
  const alias = fs.readFileSync(path.join(WEBAPP, 'src/app/api/master/customers/[id]/billing-rule/redate/route.js'), 'utf8');
  assert.match(alias, /export \{ POST \} from/, 'จอเรียกผ่าน /api/master — ไม่มี alias = 404');
});

test('ปุ่มตั้ง/แก้ + โมดัล = เฉพาะคนมีสิทธิ์ (canEdit จากผู้เรียก) · หมุด #billing-rule ที่หน้าสร้าง SO/แผงงวดลิงก์มา', () => {
  const src = card();
  assert.match(src, /const editButton = canEdit \?/);
  assert.match(src, /\{canEdit && editing \? \(/);
  assert.match(src, /\{canEdit && redate \? \(/);
  assert.match(src, /id="billing-rule"/);
  const page = code('src/app/database/customers/[id]/page.js');
  assert.match(page, /canEdit=\{canEditBillingRule\}/);
  assert.match(page, /canEditCustomerBillingRule\(\{ \.\.\.capUser, department, teams: myTeams \}, customer\)/);
});

test('⭐ ตารางวันที่ไม่ใช่ปฏิทินรายสัปดาห์ — จอกว้าง 8 คอลัมน์ · มือถือ 6 · ห้าม 7', () => {
  const css = fs.readFileSync(path.join(WEBAPP, `${DIR}/CustomerBillingRule.module.css`), 'utf8');
  assert.deepEqual([...css.matchAll(/--cols:\s*(\d+)/g)].map((m) => Number(m[1])), [8, 6]);
  const grid = code(`${DIR}/CustomerBillingRuleDayGrid.js`);
  assert.equal(/อา\.|จ\.|weekday|getUTCDay|getDay/.test(grid), false);
});

test('วันที่บนจอมาจากตัวคิดของ lib ตัวเดียว (policyPreview · sourceLabel) — ไม่มีเลขคณิตวันที่ในจอ', () => {
  for (const src of [card(), modal(), redate(), parts()]) {
    assert.doesNotMatch(src, /new Date\(|Date\.UTC|setDate\(|getDate\(/);
  }
  assert.match(card(), /policyPreview\(value, today/);
  assert.match(modal(), /policyPreview\(result\.rule, today/);
});
