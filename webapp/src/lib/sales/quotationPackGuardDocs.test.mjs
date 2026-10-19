// ── ยามเอกสารของงวด PR-G (ใบเสนอราคา · ยามในฐานของ "แพ็ค/เดือน" · mig 0410 · แผน IMPL_PLAN_PRG §4.1 K11 + §9) ─────────────────────
//
// 🔴 เอกสารของงวดนี้มีของที่ **เน่าแล้วแพง** สี่อย่าง (รีวิว 15/10 · ops-repo + false-negatives):
//   1. สถานะ: 0410 ไม่เพิ่มคอลัมน์ ⇒ CI ไม่รู้ว่ารันหรือยัง · ที่บอกได้มีแต่เอกสาร — "รันแล้ว/ยังไม่ได้รัน" ที่พูดไม่ตรงกันสองที่ = merge ก่อนรัน
//      (เอกสารบน main อ้างยามที่ production ไม่มี) · และข้อความของงวดนี้ต้องไม่ชนตัวจับ "0409 ยังไม่ได้รัน" ของยามเอกสารงวด PR-5
//   2. อ้างเกิน: ยามเห็นแค่ "ลบแล้วแทรก" ในทรานแซกชันเดียว — ประโยค "รุ่นเก่าทำเลขแพ็คหายไม่ได้อีก" ที่ไม่มีคำว่า "ครั้งเดียว" = คนถอยแอปลงไปเชื่อว่าปลอดภัย
//      ทั้งที่ลบบรรทัดแล้วเพิ่มกลับในการบันทึกครั้งถัดไปยังหายเงียบ
//   3. พื้นของการถอยแอป (มติ G11): DEPLOY.md เคยพูดสองอย่างที่ขัดกัน ("ไม่ต่ำกว่างวด PR-2" ของใบเสนอราคา กับ "รุ่นที่มีงวด PR-5 เท่านั้น")
//   4. สูตรทางออก / ลำดับถอยกับ 0407 / บรรทัดเกณฑ์ที่เอกสารยกมา ≠ หัว migration = เจ้าของแปะของที่ไฟล์ไม่ได้พิสูจน์
// ⭐ อ่าน **ของจริงสองฝั่ง** (เอกสาร ↔ ไฟล์ migration) ท่าเดียวกับ historicalPackQtyDocs.test.mjs — ยามตัวหนังสือของ SQL อยู่ที่ quotationPackGuardMigration.test.mjs
// ⚠️ ไม่มีฐานข้อมูล ไม่มีเครือข่าย — อ่านไฟล์ในรีโปล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = join(HERE, '../../..');
const REPO = join(WEBAPP, '..');
const read = (path) => readFileSync(path, 'utf8');
const MIGRATION_FILE = '0410_quotation_line_pack_guard.sql';
const MIGRATION_PATH = join(WEBAPP, 'supabase/migrations', MIGRATION_FILE);
const MIGRATION = read(MIGRATION_PATH);
const HEADER = MIGRATION.slice(0, MIGRATION.indexOf('\nBEGIN;'));

/* หัวข้อหนึ่งก้อน (ถึงหัวข้อระดับเดียวกันถัดไป) — หาไม่เจอ = แดง ไม่ใช่ตัดเงียบ · ท่าเดียวกับยามเอกสารของงวด PR-5 */
function section(text, heading, level = '## ') {
  const start = text.indexOf(`\n${heading}`);
  assert.ok(start >= 0, `หาหัวข้อ "${heading}" ไม่เจอ`);
  const next = text.indexOf(`\n${level}`, start + heading.length + 1);
  return text.slice(start, next < 0 ? undefined : next);
}
const rowOf = (text, head) => {
  const row = text.split('\n').find((line) => line.startsWith(head));
  assert.ok(row, `หาแถว "${head}" ไม่เจอ`);
  return row;
};

const QT = read(join(REPO, 'docs', 'qt-pack-column.md'));
const INDEX = read(join(REPO, 'docs', 'INDEX.md'));
const AGENTS = read(join(WEBAPP, 'AGENTS.md'));
const DEPLOY = read(join(WEBAPP, 'DEPLOY.md'));

const qtHead = () => QT.slice(0, QT.indexOf('\n## '));
const headPRG = () => { const head = qtHead(); const at = head.indexOf('**งวด PR-G**'); assert.ok(at >= 0, 'หัว qt-pack-column.md ต้องพูดถึง **งวด PR-G**'); return head.slice(at); };
const oneWay = () => section(QT, '## ประตูทางเดียว');
const guardSub = () => section(oneWay(), '### ยามในฐาน — mig 0410 (งวด PR-G)', '### ');
const nextRow = () => rowOf(section(QT, '## งวดถัดไป'), '| PR-G');
const indexRow = () => rowOf(INDEX, '| [qt-pack-column.md](qt-pack-column.md) |');
const indexPRG = () => { const row = indexRow(); const at = row.indexOf('**งวด PR-G**'); assert.ok(at >= 0, 'สารบัญต้องมี **งวด PR-G**'); return row.slice(at, row.indexOf(' · **งวด PR-4**', at)); };
const deployQuote = () => section(DEPLOY, '### ช่อง "แพ็ค/เดือน" ของใบเสนอราคา — รุ่นที่ถอยกลับไปได้', '### ');
const deploy0409 = () => section(DEPLOY, '### ใบสั่งขายย้อนหลัง "แพ็ค/เดือน" — migration 0409', '### ');
const deploy0410 = () => section(DEPLOY, '### ยามในฐานของเลขแพ็คใบเสนอราคา — migration 0410', '### ');
const agentsPack = () => section(AGENTS, '## ใบเสนอราคา "แพ็ค/เดือน"');
const agentsWhy = () => agentsPack().slice(0, agentsPack().indexOf('\n- '));
const agents0410 = () => {
  const bullets = agentsPack().split('\n- ').slice(1).filter((bullet) => /0410/.test(bullet));
  assert.equal(bullets.length, 1, 'webapp/AGENTS.md: เรื่อง 0410 อยู่ในข้อเดียวใต้หัวข้อ "แพ็ค/เดือน"');
  return bullets[0];
};

const STATUS_WORDS = ['รอดำเนินการ', 'กำลังดำเนินการ', 'รอตรวจ', 'เสร็จสมบูรณ์', 'ระงับ'];
const NOT_RUN_0410 = /mig 0410 ยังไม่ได้รัน — รันก่อน merge/;
const RAN_0410 = /mig 0410 รันแล้ว \d{1,2}\/\d{1,2}\/\d{4}/;
/* ตัวจับของยามเอกสารงวด PR-5 (historicalPackQtyDocs.test.mjs) ตามตัวอักษร — ข้อความของงวดนี้ในสามที่ที่ตัวจับนั้นอ่านต้องไม่ชนมัน */
const NOT_RUN_0409 = /0409 ยังไม่ได้รัน|ยังไม่ได้รัน\*\*|— ยังไม่ได้รัน/;
/* บรรทัดเกณฑ์ของหัว migration — "--   <ป้าย>: k = v · …" + บรรทัดต่อที่ขึ้นต้นด้วย "·" */
function headerCriteria(label) {
  const lines = HEADER.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`--   ${label}: `));
  assert.ok(at >= 0, `หัว migration ต้องมีบรรทัด "${label}:"`);
  let text = lines[at].slice(`--   ${label}: `.length);
  for (let i = at + 1; /^--\s+· /.test(lines[i] || ''); i += 1) text += ` · ${lines[i].replace(/^--\s+·\s*/, '')}`;
  return text.trim();
}

// ── 1. สถานะของงวด PR-G · "0410 รันแล้วหรือยัง" ───────────────────────────────────────────────────────────

test('สถานะของงวด PR-G เป็นคำสถานะของบ้าน และทุกที่ตอบตรงกันทั้งคำสถานะและ "mig 0410 รันแล้วหรือยัง" (หัว qt-pack-column · หัวข้อย่อย "ยามในฐาน" · ตาราง "งวดถัดไป" · สารบัญ · DEPLOY.md)', () => {
  const stated = guardSub().match(/> สถานะของงวด: \*\*([^*]+)\*\*/);
  assert.ok(stated, 'หัวข้อย่อย "ยามในฐาน — mig 0410" ต้องขึ้นต้นด้วยบรรทัด "> สถานะของงวด: **…**"');
  const status = stated[1];
  assert.ok(STATUS_WORDS.includes(status), `สถานะใช้ได้แค่ 5 คำ (${STATUS_WORDS.join(' · ')}) — เจอ "${status}"`);
  const places = {
    'หัว qt-pack-column.md': headPRG(),
    'หัวข้อย่อย "ยามในฐาน"': guardSub().slice(0, guardSub().indexOf('\n\n', guardSub().indexOf('> สถานะของงวด'))),
    'ตาราง "งวดถัดไป" แถว PR-G': nextRow(),
    'สารบัญ': indexPRG(),
    'DEPLOY.md': deploy0410().slice(0, deploy0410().indexOf('\n- ')),
  };
  for (const [place, text] of Object.entries(places)) {
    assert.ok(text.includes(`**${status}**`), `${place}: ต้องบอกสถานะของงวด PR-G เป็น "${status}" (แก้สถานะต้องแก้ครบทุกที่)`);
    const notRun = NOT_RUN_0410.test(text);
    const ran = RAN_0410.test(text);
    assert.ok(notRun !== ran, `${place}: ต้องบอกอย่างใดอย่างหนึ่ง — "mig 0410 ยังไม่ได้รัน — รันก่อน merge" หรือ "mig 0410 รันแล้ว <วันที่>"`);
  }
  const answers = new Set(Object.values(places).map((text) => NOT_RUN_0410.test(text)));
  assert.equal(answers.size, 1, 'เอกสารตอบไม่ตรงกันว่า 0410 รันหรือยัง');
  if (status === 'เสร็จสมบูรณ์') assert.equal([...answers][0], false, 'งวดที่เสร็จสมบูรณ์ต้องรัน 0410 แล้ว');
  if ([...answers][0]) {
    assert.notEqual(status, 'เสร็จสมบูรณ์');
    assert.match(deploy0410(), /\*\*draft\*\* ชื่อลงท้าย `\(⚠️ รัน 0410 ก่อน merge\)`/, 'ระหว่างยังไม่รัน: PR เป็น draft');
  }
});

test('🔴 ข้อความของงวด PR-G ไม่ชนตัวจับ "0409 ยังไม่ได้รัน" ของยามเอกสารงวด PR-5 (หัว qt-pack-column · แถวสารบัญ · หัวข้อ 0409 ของ DEPLOY.md)', () => {
  for (const [place, text] of [['หัว qt-pack-column.md', qtHead()], ['แถว qt-pack-column.md ของสารบัญ', indexRow()], ['หัวข้อ 0409 ของ DEPLOY.md', deploy0409()]]) {
    assert.doesNotMatch(text, NOT_RUN_0409, `${place}: ตัวจับของงวด PR-5 อ่านว่า 0409 ยังไม่รัน — เขียนสถานะของ 0410 ว่า "mig 0410 ยังไม่ได้รัน — รันก่อน merge" (ไม่ตัวหนา ไม่ตามหลังขีดยาว)`);
  }
});

// ── 2. อ้างเท่าที่ยามทำได้จริง ─────────────────────────────────────────────────────────────────────────

test('🔴 ทุกประโยคที่บอกว่า 0410 ปฏิเสธอะไรมีคำว่า "ครั้งเดียว" และมีข้อยกเว้นสองการบันทึก ("ครั้งถัดไป" · "หายเงียบ") — ไม่มีวรรคไหนพูด "หาย…ไม่ได้อีก" โดยไม่มี "ครั้งเดียว"', () => {
  const claims = {
    'หัว qt-pack-column.md': headPRG(), 'หัวข้อย่อย "ยามในฐาน"': guardSub(), 'ตาราง "งวดถัดไป"': nextRow(), 'สารบัญ': indexPRG(),
    'DEPLOY.md หัวข้อใบเสนอราคา': deployQuote(), 'DEPLOY.md บรรทัดพื้นของการถอยแอป': deploy0409(), 'DEPLOY.md หัวข้อ 0410': deploy0410(), 'AGENTS.md "ทำไม"': agentsWhy(),
  };
  for (const [place, text] of Object.entries(claims)) assert.match(text, /ครั้งเดียว/, `${place}: ต้องบอกว่ายามปฏิเสธการบันทึก/ออก Rev. "ครั้งเดียว"`);
  for (const [place, text] of [['หัวข้อย่อย "ยามในฐาน"', guardSub()], ['DEPLOY.md หัวข้อใบเสนอราคา', deployQuote()], ['DEPLOY.md บรรทัดพื้นของการถอยแอป', deploy0409()],
    ['DEPLOY.md หัวข้อ 0410', deploy0410()], ['AGENTS.md "ทำไม"', agentsWhy()]]) {
    assert.match(text, /ครั้งถัดไป/, `${place}: ต้องบอกทางสองการบันทึก (เพิ่มกลับในการบันทึกครั้งถัดไป)`);
    assert.match(text, /หายเงียบ/, `${place}: ต้องบอกว่าทางนั้นยังหายเงียบ`);
  }
  assert.match(guardSub(), /\*\*ไม่เห็นการทำหายที่แยกเป็นสองครั้ง\*\*/);
  /* ตัวจับวรรค: วรรค (ระหว่างขึ้นบรรทัด · จุดกลาง · เส้นตาราง) ที่พูดว่าเลขแพ็ค "หาย … ไม่ได้อีก" ต้องมี "ครั้งเดียว" ในวรรคเดียวกัน */
  for (const [place, text] of [['qt-pack-column.md', QT], ['DEPLOY.md', DEPLOY], ['AGENTS.md', AGENTS], ['INDEX.md', INDEX]]) {
    for (const clause of text.split(/\n|·|\|/)) {
      if (/เลขแพ็ค/.test(clause) && /หาย[^\n]{0,80}ไม่ได้อีก/.test(clause)) assert.match(clause, /ครั้งเดียว/, `${place}: อ้างเกิน — "${clause.trim()}"`);
    }
  }
});

test('G11 — พื้นของการถอยแอปพูดอย่างเดียวทุกที่: ใบเสนอราคา = รุ่นของงวด PR-2 · ก่อนงวด PR-5 = คีย์ใบสั่งขายย้อนหลังไม่ได้ (ดัง) · หลัง 0410 รุ่นก่อนงวด PR-1 ยังต่ำกว่าพื้น · ประโยคเก่าที่ขัดกัน/ล้าสมัยหายไปแล้ว', () => {
  assert.ok(!DEPLOY.includes('รุ่นที่มีงวด PR-5 เท่านั้น'), 'DEPLOY.md: "รุ่นที่ใช้ถอยแอปได้ = รุ่นที่มีงวด PR-5 เท่านั้น" ขัดกับพื้นของใบเสนอราคา (PR-2) — มติ G11');
  assert.ok(!DEPLOY.includes('ยอดหดเงียบเหมือนกันทุกประการ'), 'DEPLOY.md: หลัง 0410 การบันทึกครั้งเดียวจากรุ่นก่อน PR-1 ถูกปฏิเสธ ไม่ใช่ "เหมือนกันทุกประการ"');
  assert.ok(!DEPLOY.includes('คนขายจะลบเลขแพ็คด้วยมือตามข้อความของระบบ แล้วยอดหด)'), 'DEPLOY.md: หลัง 0410 การลบเลขด้วยมือถูกปฏิเสธ — คนขายติด');
  const floor = deploy0409();
  for (const part of ['พื้นของการถอยแอป: **ใบเสนอราคา = รุ่นของงวด PR-2** (ไม่เปลี่ยน — หัวข้อบน)', 'รุ่นก่อนงวด PR-5 บันทึกใบสั่งขายย้อนหลังไม่ได้ (ดัง ไม่ใช่ยอดหดเงียบ)',
    'ถอยต่ำกว่างวด PR-5 ได้เมื่อหยุดคีย์ใบย้อนหลังได้', 'หลังรัน 0410: รุ่นก่อนงวด PR-1 ทำเลขแพ็คของใบเสนอราคาหาย**ในการบันทึกหรือออก Rev. ครั้งเดียว**ไม่ได้อีก', 'รุ่นนั้นยังต่ำกว่าพื้น']) {
    assert.ok(floor.includes(part), `DEPLOY.md (บรรทัดสถานะของหัวข้อ 0409): ต้องมี "${part}"`);
  }
  assert.ok(deployQuote().includes('**ห้าม rollback production ไปรุ่นที่ต่ำกว่า deployment ของงวด PR-2 ข้างล่าง**'), 'พื้นของใบเสนอราคาในหัวข้อบนยังอยู่');
  assert.ok(deployQuote().includes('**ยังต่ำกว่าพื้น**'), 'หัวข้อใบเสนอราคา: รุ่นก่อนงวด PR-1 ยังต่ำกว่าพื้นหลัง 0410');
  assert.ok(deploy0410().includes('**พื้นของการถอยแอปไม่เปลี่ยน**: ใบเสนอราคา = รุ่นของงวด PR-2'));
  assert.ok(AGENTS.includes('ห้าม rollback production ต่ำกว่า deployment ของงวด PR-2'), 'AGENTS.md: พื้นของใบเสนอราคาไม่เปลี่ยน');
  /* หัว migration พูดชุดเดียวกัน (ไฟล์ตรึง sha — ถ้าไฟล์ใหม่เปลี่ยนคำ เอกสารต้องตามด้วย) */
  for (const part of ['· ใบเสนอราคา: พื้นคือรุ่นของงวด PR-2 — ไม่เปลี่ยน', '· รุ่นก่อนงวด PR-5: บันทึกใบสั่งขายย้อนหลังไม่ได้ (0409 — ดัง ไม่ใช่ยอดผิด)', '⇒ ยังไม่ใช่รุ่นที่ถอยไปได้']) {
    assert.ok(HEADER.includes(part), `หัว migration: ${part}`);
  }
});

// ── 3. ของที่เอกสารยกจาก migration = หัว migration ตามตัวอักษร ───────────────────────────────────────────────

test('🔴 บรรทัดเกณฑ์ก่อนรัน / หลังรันที่เอกสารยกมา = บรรทัดเกณฑ์ในหัว migration ทุกตัวอักษร · PREFLIGHT ก่อน RUN · sha256 / จำนวนบรรทัดที่เอกสารอ้าง = ไฟล์จริง', () => {
  const before = headerCriteria('เกณฑ์ก่อนรันครั้งแรก');
  const after = headerCriteria('เกณฑ์หลังรันทุกรอบ');
  assert.equal(before.split(' · ').length, 11, before);
  assert.equal(after.split(' · ').length, 7, after);
  for (const [place, text] of [['หัวข้อย่อย "ยามในฐาน"', guardSub()], ['DEPLOY.md หัวข้อ 0410', deploy0410()]]) {
    assert.ok(text.includes(`\`${before}\``), `${place}: ต้องยกเกณฑ์ก่อนรันชุดเดียวกับหัว migration: ${before}`);
    assert.ok(text.includes(`\`${after}\``), `${place}: ต้องยกเกณฑ์หลังรันชุดเดียวกับหัว migration: ${after}`);
    assert.match(text, /`save_md5` เท่ากับแถว/, `${place}: save_md5 หลังรันต้องเท่าแถวก่อนรัน`);
  }
  const pre = deploy0410().indexOf('PREFLIGHT-0410.sql');
  const run = deploy0410().indexOf('RUN-0410.sql');
  assert.ok(pre >= 0 && run > pre, 'DEPLOY.md: เอ่ย PREFLIGHT-0410.sql ก่อน RUN-0410.sql');
  const sha = createHash('sha256').update(readFileSync(MIGRATION_PATH)).digest('hex');
  const lines = MIGRATION.split('\n').length - 1;
  assert.ok(guardSub().includes(`sha256 \`${sha}\``), `หัวข้อย่อย "ยามในฐาน" ต้องบอก sha256 ของไฟล์จริง: ${sha}`);
  assert.ok(guardSub().includes(`(${lines} บรรทัด`), `หัวข้อย่อย "ยามในฐาน" ต้องบอกจำนวนบรรทัดของไฟล์จริง: ${lines}`);
  assert.ok(deploy0410().includes(`head -n ${lines} RUN-0410.sql | shasum -a 256`), 'DEPLOY.md: เทียบหัวของ RUN-0410.sql กับไฟล์ด้วยจำนวนบรรทัดจริง');
});

test('สูตรทางออก · ยอมรับรายการ · ล็อก · ลำดับถอยกับ 0407 ในเอกสาร = หัว migration (ชื่อตัวแปร · SET LOCAL ภายใน BEGIN … COMMIT · 2BP01 · 55P03)', () => {
  /* บล็อกทางออกของหัว migration (บรรทัดคำสั่ง ไม่นับคอมเมนต์) */
  const at = HEADER.indexOf('── ทางออก');
  const block = HEADER.slice(HEADER.indexOf('--      BEGIN;\n', at), HEADER.indexOf('--      COMMIT;\n', at) + '--      COMMIT;'.length)
    .split('\n').map((l) => l.replace(/^-- {6}/, '')).filter((l) => !l.startsWith('--'));
  assert.deepEqual(block, ['BEGIN;', "SET LOCAL app.quotation_pack_unlock = 'on';", 'COMMIT;']);
  const sql = /```sql\n([\s\S]*?)```/.exec(guardSub());
  assert.ok(sql, 'หัวข้อย่อย "ยามในฐาน" ต้องมีบล็อก ```sql ของทางออก');
  assert.deepEqual(sql[1].split('\n').filter((l) => l && !l.startsWith('--')), block, 'บล็อกทางออกในเอกสาร = ของหัว migration');
  assert.ok(MIGRATION.includes("current_setting('app.quotation_pack_unlock', true)"), 'ชื่อตัวแปรของทางออก = ที่ trigger อ่านจริง');
  for (const [place, text] of [['DEPLOY.md หัวข้อ 0410', deploy0410()], ['AGENTS.md', agents0410()]]) {
    for (const part of ['`BEGIN;`', "`SET LOCAL app.quotation_pack_unlock = 'on';`", '`COMMIT;`', 'ห้าม']) assert.ok(text.includes(part), `${place}: สูตรทางออกต้องมี ${part}`);
    assert.match(text, /`SET` เฉย ๆ/, `${place}: ต้องห้าม SET แบบไม่มี LOCAL`);
  }
  /* ยอมรับรายการ (เปิดแค่สองด่านของรันครั้งแรก) */
  assert.ok(HEADER.includes("SET app.mig_0410_accept = 'mixed=QT-…,QT-… rev_bare=QT-…';"));
  for (const [place, text] of [['หัวข้อย่อย "ยามในฐาน"', guardSub()], ['DEPLOY.md หัวข้อ 0410', deploy0410()]]) {
    assert.match(text, /`SET app\.mig_0410_accept = '/, `${place}: ต้องบอกบรรทัดยอมรับรายการ`);
    assert.match(text, /ก่อน `BEGIN`/, `${place}: บรรทัดยอมรับวางก่อน BEGIN`);
    assert.match(text, /ยอมเฉพาะรายการเต็มที่ตรงทุกใบ/);
    /* ล็อกสองระดับ + เพดานรอ */
    for (const part of ['SHARE ROW EXCLUSIVE', 'ACCESS EXCLUSIVE', '55P03', "`lock_timeout = '5s'`"]) assert.ok(text.includes(part), `${place}: ต้องบอก ${part}`);
    /* ลำดับถอยกับ 0407 */
    assert.ok(text.includes('**ถอย 0410 ก่อนเสมอ**'), `${place}: ต้องบอกลำดับถอย 0410 ก่อน 0407`);
    assert.match(text, /2BP01/);
  }
  assert.ok(HEADER.includes('**ถอย 0410 ก่อนเสมอ** แล้วจึงถอย 0407') && HEADER.includes('= ERROR 2BP01'), 'หัว migration พูดลำดับเดียวกัน');
  assert.ok(agents0410().includes('**ถอย 0410 ก่อน 0407 เสมอ** (กลับลำดับ = ERROR 2BP01)'));
});

test('ข้อความไทยที่เอกสารยก = ข้อความใน trigger (ต้นประโยคและท้ายประโยค) · รหัสเครื่องและรหัสด่านที่เอกสารอ้างมีอยู่ใน migration จริง', () => {
  const literals = [...MIGRATION.matchAll(/'(ไม่ได้บันทึก:(?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
  assert.equal(literals.length, 3);
  const fill = (text, ...values) => values.reduce((out, value) => out.replace('%s', value), text);
  const [rewrite, revision, cleared] = literals;
  const sub = guardSub();
  const head = (text) => text.slice(0, text.indexOf(' — '));
  assert.ok(sub.includes(head(fill(rewrite, '<เลขใบ>', '<n>'))), 'ต้นข้อความ rewrite');
  assert.ok(sub.includes(rewrite.slice(rewrite.indexOf('อย่าลบรายการนี้'))), 'ท้ายข้อความ rewrite (คำเตือนสองการบันทึก + รหัสเครื่อง)');
  assert.ok(sub.includes(head(fill(revision, '<เลข>', '<n>', '<เลข>'))), 'ต้นข้อความ revision');
  assert.ok(sub.includes(cleared.slice(0, cleared.indexOf(' ('))), 'ต้นข้อความห้ามล้าง');
  const docs = `${QT}\n${DEPLOY}\n${AGENTS}\n${INDEX}`;
  const tokens = new Set([...docs.matchAll(/\[(quotation_line_pack_[a-z]+)\]/g)].map((m) => m[1]));
  assert.ok(tokens.has('quotation_line_pack_lost') && tokens.has('quotation_line_pack_cleared'));
  for (const token of tokens) assert.ok(MIGRATION.includes(`[${token}]`), `เอกสารอ้างรหัสเครื่อง ${token} ที่ไม่มีใน migration`);
  const codes = new Set([...docs.matchAll(/`(mig_0410_[a-z_]+)`/g)].map((m) => m[1]));
  assert.ok(codes.size >= 5, `อ่านรหัสด่านจากเอกสารได้น้อยผิดปกติ: ${[...codes]}`);
  for (const code of codes) assert.ok(MIGRATION.includes(`RAISE EXCEPTION '${code}`), `เอกสารอ้างรหัสด่าน ${code} ที่ไฟล์ไม่โยน`);
  assert.ok(agents0410().includes('`[quotation_line_pack_lost]`') && agentsWhy().includes('`[quotation_line_pack_lost]`'));
});

// ── 4. เนื้อหาที่ต้องมี ─────────────────────────────────────────────────────────────────────────────────

test('หัวข้อย่อย "ยามในฐาน": trigger สามตัว · กติกา "ห้ามหาย" (มติ A4 · G8) · ข้อ (ข) สินค้าเดียวกัน · รายการ "ไม่ได้กัน" ครบตามหัว migration · ไม่แตะเนื้อของ save_quotation_content · ยามของ repo', () => {
  const sub = guardSub();
  for (const name of ['quotation_lines_pack_held_trg', 'quotation_lines_pack_keep_trg', 'quotation_lines_pack_no_clear_trg']) {
    assert.ok(sub.includes(`\`${name}\``), `ต้องเอ่ย ${name}`);
    assert.ok(MIGRATION.includes(`CREATE TRIGGER ${name}\n`), `${name} ไม่มีใน migration`);
  }
  for (const part of ['**กติกา "ห้ามหาย" เท่านั้น** (มติ G8)', 'มติ A4', '**สินค้าเดียวกัน**', '**ไม่ปฏิเสธอะไรเลย**', 'SQLSTATE `P0001` (ไม่ใช่ 23514)',
    'ไฟล์ **ไม่แตะเนื้อนั้น** (มติ G1', '**รุ่นปัจจุบัน (งวด PR-3 ขึ้นไป) ไม่ชนยามในการใช้งานปกติ**']) {
    assert.ok(sub.includes(part), `หัวข้อย่อย "ยามในฐาน" ต้องมี: ${part}`);
  }
  const notGuarded = sub.slice(sub.indexOf('**ไม่ได้กัน**'), sub.indexOf('ไม่มีโค้ดแอปรุ่นไหน'));
  for (const shape of ['ข้ามทรานแซกชัน', 'INSERT ก่อน DELETE', 'writable CTE', 'MERGE', 'UPDATE ที่ทำให้บรรทัดกลายเป็นหมวด 02-001', '`revisedFromId` หลังแทรก',
    '`fgCode` ของตัวเองไม่ใช่หมวด 02-001', '`mixed`', 'เปลี่ยนสินค้าหมวด 02-001 ที่มีเลขแพ็คเป็นสินค้าหมวด 02-001 ตัวอื่น', 'คำขอแก้ VAT', 'TRUNCATE', 'BYPASSRLS', 'ภายใต้ทางออก']) {
    assert.ok(notGuarded.includes(shape), `รายการ "ไม่ได้กัน" ต้องมี: ${shape}`);
  }
  for (const test of ['quotationPackGuardMigration.test.mjs', 'quotationPackGuardDocs.test.mjs', 'linePacks.test.mjs', 'linePackRoutes.test.mjs', 'quoteLinePackGuardCases.json']) {
    assert.ok(sub.includes(`\`${test}\``), `ต้องบอกยามของ repo: ${test}`);
  }
  /* ตาราง "ยาม" ของเอกสารรู้จักเทสต์สองไฟล์ใหม่ */
  const guards = section(QT, '## ยาม');
  for (const test of ['quotationPackGuardMigration.test.mjs', 'quotationPackGuardDocs.test.mjs']) assert.ok(guards.includes(`| \`${test}\` (งวด PR-G`), `ตาราง "ยาม" ต้องมีแถวของ ${test}`);
});

test('ประตูทางเดียว: ตารางพูดถึงผลหลัง 0410 ทุกแถวที่เปลี่ยน · ตัวจับ ⑥ / ⑧ หลัง 0410 · ไม่มีประโยค "ยังไม่ได้เขียน" ของยามในฐานเหลือ · Rev. หลังย้ายรหัสเข้าหมวดผ่าน (ไม่ใช่ทางตัน) · เช็กลิสต์ข้อ 4', () => {
  const door = oneWay();
  assert.doesNotMatch(door, /งวดแยกของมันเอง ยังไม่ได้เขียน/, 'ยามในฐานเขียนแล้ว (0410)');
  for (const head of ['| ถอยแอปไปรุ่น **ก่อนงวด PR-1**', '| 🔴 **รันรุ่นก่อนงวด PR-1 ที่ไหนก็ตามที่ต่อฐานนี้**', '| **Redeploy รุ่นของงวด PR-2**', '| ตั้ง `QUOTE_PACK_INPUT_OPEN` กลับเป็น `false`']) {
    assert.match(rowOf(door, head), /\*\*หลังรัน 0410\*\*/, `แถว "${head}" ต้องบอกผลหลังรัน 0410`);
  }
  assert.match(rowOf(door, '| ถอย migration 0407'), /2BP01[^|]*\*\*ถอย 0410 ก่อนเสมอ\*\*/);
  assert.match(rowOf(door, '| ถอย migration 0410'), /ไม่ใช่ปฏิกิริยาแรก/);
  assert.match(rowOf(door, '| **Redeploy รุ่นของงวด PR-2**'), /\*\*ห้ามทำแบบนี้กับสินค้าเดิม\*\*/, 'คำแนะนำของช่วงถอยไปงวด PR-2 ต้องไม่กลายเป็นสูตรสองการบันทึกของสินค้าเดิม');
  assert.match(rowOf(door, '| ⑥ ฉบับ Rev. พกเลขแพ็คครบ'), /หลังรัน 0410 สิ่งที่ ⑥ เจอ/);
  assert.match(rowOf(door, '| ⑧ การบันทึกที่ทำเลขแพ็คของบรรทัดหาย'), /⑧ \*\*ไม่\*\* รายงานเป็นเลขแพ็คหาย/);
  const limits = section(QT, '### ข้อจำกัดที่รู้ (งวด PR-3)', '## ');
  assert.match(limits, /ออก Rev\. หลังรหัสสินค้าของรายการอื่นถูกย้ายเข้าหมวด 02-001[^\n]*= ผ่าน/, 'Rev. หลังย้ายรหัสเข้าหมวด 02-001 ผ่าน (ข้อ (ข) เทียบสินค้าเดียวกัน)');
  const checklist = section(QT, '### เช็กลิสต์', '## ');
  assert.match(checklist, /\*\*4\. งวด PR-G — ยามในฐาน/);
  const four = checklist.slice(checklist.indexOf('**4. งวด PR-G'));
  const order = ['เจ้าของวาง `PREFLIGHT-0410.sql`', 'เจ้าของวาง `RUN-0410.sql`', 'พลิกสถานะ', '→ ready → merge', 'หลัง merge'].map((needle) => four.indexOf(needle));
  assert.ok(order.every((at, k) => at >= 0 && (k === 0 || at > order[k - 1])), `เช็กลิสต์ข้อ 4 เรียง PREFLIGHT → RUN → พลิกสถานะ → merge → สคริปต์เทียบหลัง merge — เจอ ${order}`);
});

test('webapp/DEPLOY.md หัวข้อ 0410: รันได้ทุกเวลา (ไม่หยุดคีย์) · ลำดับหกข้อ (ผู้พัฒนาเตรียม → PREFLIGHT → RUN → พลิกสถานะก่อน ready → merge → สคริปต์เทียบ) · ไม่ใช่ agent ที่รันสคริปต์ · ถอยไม่ใช่ปฏิกิริยาแรก', () => {
  const text = deploy0410();
  assert.match(text, /\*\*รันได้ทุกเวลา ไม่ต้องหยุดคีย์งาน\*\*/);
  assert.match(text, /ไม่ต้อง "บังคับรีเฟรชทุกคน"/);
  const steps = [...text.matchAll(/^ {2}(\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(steps.map(([n]) => n), [1, 2, 3, 4, 5, 6], `ลำดับหกข้อ — เจอ ${JSON.stringify(steps.map(([n]) => n))}`);
  assert.match(steps[0][1], /^\*\*ผู้พัฒนา ก่อนส่งให้เจ้าของ\*\*/);
  assert.match(steps[1][1], /^\*\*เจ้าของ\*\*: วาง `PREFLIGHT-0410\.sql`/);
  assert.match(steps[2][1], /^\*\*เจ้าของ\*\*: วาง `RUN-0410\.sql` ทั้งก้อน/);
  assert.match(steps[3][1], /^\*\*พลิกสถานะในเอกสารก่อนกด ready/);
  assert.match(steps[4][1], /PR → ready → merge/);
  assert.match(steps[5][1], /\(ไม่ใช่ agent\)/);
  assert.match(text, /แถวนี้มีอายุ/);
  assert.match(text, /ไม่ใช่ปฏิกิริยาแรก/);
});
