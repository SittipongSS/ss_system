// ── หน้าโซน: เทียบยอดใช้กับมาตรฐาน **รวมทุกรอบขายที่มีผล** (PR-C · C-D10) ────────────────────────────
//
// 🐞 ของเดิมอ่านรอบขายที่มีผล **รอบแรกที่เจอ** (`activeTerm`) ทั้งที่โซนหนึ่งถือได้หลายรอบพร้อมกัน —
//    SO-26090247-0 มีสองบรรทัดลงโซน Office เดียวกัน ⇒ ตารางเทียบใช้มาตรฐานครึ่งเดียว แล้วฟ้อง "เกิน 100%"
// ⭐ ตัวอ่านเดียวคือ `zoneStandardMl` (lib/service/termStandardMl.js) · ไม่มีรอบที่มีผล = ถอยไปรอบล่าสุดเหมือนเดิม
// ⭐ หน่วยบนจอเป็นภาษาไทย "มล." ทั้งหน้า (ที่เหลือของระบบพูด มล. แล้ว)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
const PAGE = 'src/app/database/sites/[id]/zones/[zoneId]/page.js';
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('⭐ มาตรฐานของโซน = zoneStandardMl ของรอบขายทั้งหมด (วันนี้ตามนาฬิกาไทย)', () => {
  const src = code(PAGE);
  assert.match(src, /import \{[^}]*\bzoneStandardMl\b[^}]*\} from "@\/lib\/service\/termStandardMl";/);
  assert.match(src, /import \{ businessDate \} from "@\/lib\/businessDate";/);
  assert.match(src, /const zoneStd = useMemo\(\s*\(\) => zoneStandardMl\(data\?\.terms \|\| \[\], ordersById, businessDate\(\)\),\s*\[data\?\.terms, ordersById\],?\s*\);/);
});

test('⭐ ตารางเทียบกับหัวใบใช้ค่าเดียวกัน — มีรอบที่มีผล = ผลรวม · ไม่มี = รอบล่าสุด (ของเดิม)', () => {
  const src = code(PAGE);
  assert.match(src, /const standardMl = zoneStd\.live > 0 \? zoneStd\.value : \(latestTerm\?\.standardMlPerMonth \?\? null\);/);
  const usage = src.slice(src.indexOf('usageVsStandard({'), src.indexOf('}),', src.indexOf('usageVsStandard({')));
  assert.match(usage, /standardMlPerMonth: standardMl,/);
  assert.doesNotMatch(usage, /activeTerm\?\.standardMlPerMonth/, 'รอบแรกที่เจอไม่ใช่มาตรฐานของโซน');
  const fact = src.slice(src.indexOf('key: "std"'), src.indexOf('}', src.indexOf('key: "std"')));
  assert.match(fact, /value: standardMl != null \? standardMlText\(standardMl\) : null/);
  assert.match(fact, /sub: standardNote/);
  assert.doesNotMatch(fact, /saleTerm\.standardMlPerMonth/);
});

test('ตั้งไม่ครบทุกรอบ = บอกใต้ค่าว่ายอดเทียบยังไม่ครบ · หลายรอบครบ = บอกว่าเป็นผลรวม', () => {
  const src = code(PAGE);
  assert.match(src, /zoneStd\.live > 0 && zoneStd\.missing > 0\s*\?\s*ZONE_STANDARD_PARTIAL\(zoneStd\.missing, zoneStd\.live\)/);
  assert.match(src, /zoneStd\.live > 1\s*\?\s*ZONE_STANDARD_SUM\(zoneStd\.live\)/);
});

/* 🐞 review 29/09: "แพ็คที่ขาย" เล่ารอบเดียว (`saleTerm`) ข้างมาตรฐานที่รวมทุกรอบ — และขัดกับป้ายหน้าไซต์/แท็บลูกค้า
   ("ขายแล้ว 4 แพ็ค/รอบ") ของโซนเดียวกัน ⇒ ใช้ก้อนเดียวกับทะเบียน (`zoneSaleFacts`) เมื่อมีหลายรอบขายที่ขายอยู่ */
test('🔴 แพ็คที่ขาย: หลายรอบขายของใบที่ประทับ = ผลรวมต่อรอบจาก zoneSaleFacts (เลขเดียวกับป้ายหน้าไซต์)', () => {
  const src = code(PAGE);
  assert.match(src, /import \{[^}]*\bzoneSaleFacts\b[^}]*\} from "@\/lib\/service\/zoneRegistry";/);
  assert.match(src, /const sale = useMemo\(\s*\(\) => zoneSaleFacts\(zoneId, \{ terms: data\?\.terms \|\| \[\], ordersById, todayIso: businessDate\(\) \}\),/);
  const fact = src.slice(src.indexOf('key: "pack"'), src.indexOf('key: "std"'));
  assert.match(fact, /packFact/);
  const pack = src.slice(src.indexOf('const packFact ='), src.indexOf(';', src.indexOf('const packFact =')));
  assert.match(pack, /sale\.soldPerRound && zoneStd\.live > 1/);
  assert.match(pack, /fmtNumber\(sale\.soldPerRoundPackages\)\} แพ็ค\/รอบ/);
  assert.match(pack, /ZONE_STANDARD_SUM\(zoneStd\.live\)/);
  assert.match(pack, /ZONE_PACK_SINGLE\(zoneStd\.live\)/, 'ใบไม่ประทับหลายรอบ = บอกว่าเป็นรอบเดียว ไม่ใช่ยอดของโซน');
});

test('⭐ ไม่เหลือหน่วย "ml" บนจอ — ใช้ "มล." ทั้งหน้า', () => {
  const src = code(PAGE);
  assert.doesNotMatch(src, /\} ml\b/, 'ค่า `${…} ml` ต้องเป็น มล.');
  assert.doesNotMatch(src, /\bml`/);
  assert.doesNotMatch(src, /[฀-๿ ]ml[฀-๿ ]/, 'ข้อความไทยที่พูด ml');
  assert.match(src, /standardMlText\(term\.standardMlPerMonth\)/, 'คอลัมน์มาตรฐาน/เดือนของรอบขายใช้ตัวช่วยเดียวกับช่องแก้');
  assert.match(src, /\$\{fmtNumber\(row\.standardMl\)\} มล\./);
  assert.match(src, /\$\{fmtNumber\(row\.usedMl\)\} มล\./);
  assert.match(src, /\$\{fmtNumber\(row\.diffMl\)\} มล\./);
  assert.match(src, /หน่วยแปลงเป็น มล\. ไม่ได้/);
});

test('ยามเดิมของหน้าไม่ขยับ — ลิงก์ใบส่งงานยังผูก canViewVisitReport', () => {
  const src = code(PAGE);
  assert.match(src, /const canOpenVisit = useMemo\(\s*\(\) => canViewVisitReport\(/);
  assert.doesNotMatch(src, /style=\{\{/);
});
