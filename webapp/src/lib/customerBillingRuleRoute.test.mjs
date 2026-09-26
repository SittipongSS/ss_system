// ยามของเส้น PATCH /api/customers/[id]/billing-rule (mig 0389 · มติเจ้าของ 25/09 ข้อ 4)
// ⭐ แก้รอบวางบิล **ไม่ต้องอนุมัติใหม่** — วันไหนใครยุบเส้นนี้กลับเข้า PATCH ของลูกค้า หรือเติมด่านอนุมัติ
//    ลูกค้าที่อนุมัติแล้วจะตกกลับ "รออนุมัติ" และหลุดจาก picker ทุกหน้าทันทีที่ตั้งรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจ — หัวไฟล์ของ route เขียนคำเตือนที่เอ่ยชื่อสิ่งต้องห้ามไว้เอง */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROUTE = 'src/app/api/customers/[id]/billing-rule/route.js';
const ALIAS = 'src/app/api/master/customers/[id]/billing-rule/route.js';

test('⭐ เส้นรอบวางบิลไม่แตะด่านอนุมัติของลูกค้าเลย', () => {
  const src = code(ROUTE);
  for (const banned of ['approvalStatus', 'resetApprovalOnEdit', 'changedFieldsAgainst', 'masterReapprovalUpdate']) {
    assert.equal(src.includes(banned), false, `route ต้องไม่เอ่ย ${banned}`);
  }
});

test('ด่านสิทธิ์ + ตัวตรวจรูป = ตัวเดียวกับที่จอใช้ · ลงประวัติเต็มแถว before/after', () => {
  const src = code(ROUTE);
  assert.match(src, /canEditCustomerBillingRule\(user, customer\)/, 'ด่านสิทธิ์ต้องเป็นตัวเดียวกับปุ่มบนหน้าลูกค้า');
  assert.match(src, /normalizeBillingRule\(body\.billingRule\)/, 'ตรวจรูปด้วยตัวเดียวกับโมดัล');
  assert.match(src, /recordAudit\(\{[\s\S]*?before: customer, after: updated/, 'ต้องลง audit_logs เต็มแถวแบบ PATCH ของลูกค้า');
  // เขียนเฉพาะช่องรอบวางบิล + updatedAt — ห้ามรับคีย์อื่นจาก body ไปเขียน
  const update = src.match(/\.update\(\{([\s\S]*?)\}\)/);
  assert.ok(update, 'ต้องเขียนด้วย object literal (ให้ check:columns ตรวจชื่อคอลัมน์ได้)');
  const keys = [...update[1].matchAll(/^\s*([A-Za-z]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['billingRule', 'billingRuleUpdatedAt', 'billingRuleUpdatedById', 'billingRuleUpdatedByName', 'updatedAt']);
  assert.equal(/\.\.\.body/.test(src), false, 'ห้าม spread body ลงแถวลูกค้า');
});

test('จอเรียกผ่าน /api/master/customers/* — ไฟล์ alias ต้อง re-export PATCH ตัวเดียวกัน', () => {
  const src = fs.readFileSync(path.join(WEBAPP, ALIAS), 'utf8');
  assert.match(src, /export \{ PATCH \} from ["']\.\.\/\.\.\/\.\.\/\.\.\/customers\/\[id\]\/billing-rule\/route["']/);
});

/* ── แถว "ความเคลื่อนไหว" ของลูกค้า (มติเจ้าของ 26/09 ข้อ 7) ─────────────────────────────── */
test('⭐ ตั้ง/แก้/ล้างรอบ = ลงเธรดลูกค้าหลัง audit_logs ผ่านตัวช่วยกลาง · ลงไม่สำเร็จต้องไม่ทำให้บันทึกพัง', () => {
  // ตัวสัญญาเอง (error/throw → false · kind quiet · ผูกผู้กด) เทสต์ด้วยพฤติกรรมที่ master/customerBillingRuleUpdate.test
  // ตรงนี้ตรวจแค่ว่า route ต่อสายถูก: ลำดับ · ค่าเดิม/ใหม่ · ผู้กด · ไม่มีทางออก error หลังเขียนสำเร็จ
  const src = code(ROUTE);
  const audit = src.indexOf('recordAudit({');
  const log = src.search(/logBillingRuleActivity\(supabase, \{/);
  assert.ok(audit > 0 && log > audit, 'ต้องลง audit_logs ก่อนเธรด — เธรดพังแล้ว audit ต้องยังอยู่');
  const call = src.slice(log, src.indexOf('});', log));
  assert.match(call, /customerId: id/);
  assert.match(call, /\bbefore\b/, 'ค่าเดิม = รอบก่อนบันทึก');
  assert.match(call, /after: rule/, 'ค่าใหม่ = รอบที่เพิ่งเขียน (null = ล้าง)');
  assert.match(call, /\buser\b/, 'ต้องผูกผู้กด — เธรดโชว์ว่าใครเปลี่ยน');
  assert.equal(/appendUpdate/.test(src), false, 'route ห้ามเขียนเธรดเอง — ทางเดียวคือตัวช่วยที่กลืน error ทุกทาง');
  const tail = src.slice(audit);
  assert.equal(/Response\.json\(\{ error/.test(tail), false, 'หลังเขียนสำเร็จห้ามตอบ error เพราะเธรด');
  assert.match(tail, /const activityLogged = await logBillingRuleActivity/, 'บอกโมดัลว่าลงเธรดสำเร็จไหม');
  assert.match(tail, /unchanged: false, activityLogged/);
});

test('ป้ายยืนยันการล้างรอบสัญญาว่ารอบเดิมอยู่ใน "ความเคลื่อนไหว" · ไม่อ้างประวัติที่แอดมินเท่านั้นเปิดได้', () => {
  const src = fs.readFileSync(path.join(WEBAPP, 'src/components/database/CustomerBillingRuleModal.js'), 'utf8');
  const detail = src.match(/detail: "([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1] || '';
  assert.match(detail, /ความเคลื่อนไหว/);
  assert.equal(/บันทึกการแก้ไขของระบบ|ประวัติการแก้ไข/.test(detail), false);
  // route บอกว่าลงเธรดไม่สำเร็จ ⇒ โมดัลต้องไม่ขึ้น "ลงความเคลื่อนไหวแล้ว"
  assert.match(src, /activityLogged === false/);
});

test('ลงเธรดไม่สำเร็จ ⇒ ทักพิมพ์รอบเดิมให้เห็นเลย · ไม่ชี้ไปบันทึกของระบบที่ฝ่ายขาย/บัญชีเปิดไม่ได้', () => {
  const src = code('src/components/database/CustomerBillingRuleModal.js');
  const branch = src.slice(src.indexOf('activityLogged === false'), src.indexOf('} else {', src.indexOf('activityLogged === false')));
  assert.match(branch, /describeBillingRule\(customer\?\.billingRule\)/, 'รอบเดิม = แถวก่อนบันทึก (หน้าแม่เติมค่าใหม่ทีหลัง)');
  assert.match(branch, /RESPONSE_WARNING_TOAST/, 'ค้างนานพอให้จดทัน — ทักปกติหาย 3.6 วิ');
  assert.equal(/บันทึกการแก้ไขของระบบ|ประวัติการแก้ไข|audit/.test(src), false, 'ห้ามสัญญาที่ที่คนกดเปิดไม่ได้');
  // สำเร็จ = พูดแบบเดียวกับป้ายยืนยัน ("รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว")
  assert.match(src, /"ล้างรอบวางบิลแล้ว · รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว"/);
});
