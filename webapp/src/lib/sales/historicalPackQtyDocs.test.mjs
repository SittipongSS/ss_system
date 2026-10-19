// ── ยามเอกสารของงวด PR-5 (ใบสั่งขายย้อนหลัง · คอลัมน์ "แพ็ค/เดือน" · mig 0409 · IMPL_PLAN_PR5 §6.4 T25) ──────────────────────
//
// 🔴 เอกสารมติของรีโปนี้เคยเน่ามาแล้ว (AGENTS.md: "สถานะที่หัวไฟล์เคยเน่า") — งวดนี้มีของที่ **เน่าแล้วแพง** เป็นพิเศษ:
//   1. สถานะ: 0409 ไม่เพิ่มคอลัมน์ ⇒ CI ไม่รู้ว่ารันหรือยัง · ที่บอกได้มีแต่เอกสาร — "รันแล้ว/ยังไม่ได้รัน" ที่พูดไม่ตรงกันสองที่
//      = คน merge ก่อนรัน (ใบร่างที่ไม่มีเลขแพ็คลงฐานจริงแล้วขวางการรัน) หรือคนรันซ้ำสองรอบ
//   2. ทางออกของ "โค้ดขึ้นก่อน 0409": ประโยคแรกของแผนเคยบอกให้ "เปิดใบร่างมาบันทึกใหม่หลังรัน" ซึ่งด่านของ migration เองทำให้เป็นไปไม่ได้
//      (ใบร่างนั้นคือสิ่งที่หยุดการรัน) — ประโยคแบบนั้นกลับมาใน DEPLOY.md วันไหน คนกด deploy จะติดวนอยู่กับคำแนะนำที่ทำไม่ได้
//   3. เกณฑ์ตรวจก่อน/หลังรัน: เลขที่พิมพ์ลอย ๆ ในเอกสาร ≠ บรรทัดเกณฑ์ในหัว migration = ผู้พัฒนาตอบ "ไปได้" กับแถวที่ผิด
//   4. ตาราง "ยามที่ย้ายโดยเจตนา": จำนวนที่เอกสารบอก ≠ จำนวนคอมเมนต์ย้ายยามในไฟล์เทสต์ = มียามถูกย้ายโดยไม่มีใครจด (หรือจดของที่ไม่มี)
//   5. ประตูทางเดียว: ประโยคใน AGENTS.md ต้องอ้างรหัส/ไฟล์/ข้อความที่มีอยู่จริง — คำสั่ง git ที่ชี้ path ผิด = worktree ทุกตัว "ผ่าน"
// ⭐ ยามอ่าน **ของจริงสองฝั่ง** (เอกสาร ↔ migration / โค้ด / ไฟล์เทสต์) แบบเดียวกับ historicalServiceAlignmentDocs.test.mjs —
//    เปลี่ยนโค้ดแล้วลืมเอกสาร (หรือกลับกัน) = แดง · ยามของเอกสาร PR-D (ไฟล์นั้น) ต้องเขียวคู่กันทุกครั้งที่แก้เอกสารสองฉบับนี้
// ⚠️ ไม่มีฐานข้อมูล ไม่มีเครือข่าย — อ่านไฟล์ในรีโปกับเรียกฟังก์ชันล้วนของ lib เท่านั้น
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HISTORICAL_MONEY_UNKNOWN, HISTORICAL_SERVICE_TEXT, historicalBulkConsequence, historicalLineQuoteLink, historicalSaveExit,
} from './historicalIntakeForm.js';
import { historicalSaveResultView } from './historicalReviewView.js';
import {
  HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED, HISTORICAL_PACK_QTY_NOT_STORED_SAVED, historicalQuoteServiceMismatch, quoteLineText,
} from './historicalOrderCopy.js';
import { HISTORICAL_LINE_MESSAGES } from './historicalOrderPlan.js';
import { WORKFLOW_ERROR_CODES, workflowErrorMessage } from './documentWorkflowErrors.js';
import { LINE_PACK_TEXT } from './linePacks.js';
import { PACK_COLUMN_LABEL } from './linePackView.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = join(HERE, '../../..');
const REPO = join(WEBAPP, '..');
const read = (path) => readFileSync(path, 'utf8');
const doc = (name) => read(join(REPO, 'docs', name));
const src = (rel) => read(join(WEBAPP, 'src', rel));
const MIGRATION_FILE = '0409_historical_so_line_pack_qty.sql';
const MIGRATION_PATH = join(WEBAPP, 'supabase/migrations', MIGRATION_FILE);
const MIGRATION = read(MIGRATION_PATH);

/* หัวข้อหนึ่งก้อน (ถึงหัวข้อระดับเดียวกันถัดไป) — หาไม่เจอ = แดง ไม่ใช่ตัดเงียบ · ท่าเดียวกับยามเอกสารของ PR-D */
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

const QT = doc('qt-pack-column.md');
const HIST = doc('historical-sales-orders.md');
const INDEX = doc('INDEX.md');
const AGENTS = read(join(WEBAPP, 'AGENTS.md'));
const DEPLOY = read(join(WEBAPP, 'DEPLOY.md'));

/* หาไม่เจอ = แดงรายเทสต์ (ไม่ใช่ทั้งไฟล์ล้มตอนโหลด) */
const qtHead = () => QT.slice(0, QT.indexOf('\n## '));
const pr5 = () => section(QT, '## งวด PR-5 —');
const pr5Part = (heading) => section(pr5(), heading, '### ');
const oneWay = () => section(section(QT, '## ประตูทางเดียว'), '### ใบสั่งขายย้อนหลัง — ประตูทางเดียวของ mig 0409', '### ');
const histHead = () => HIST.slice(0, HIST.indexOf('\n## 0.'));
const hist8f = () => section(HIST, '## 8F. งวด PR-5 · mig 0409');
const hist95 = () => section(HIST, '### 9.5 ลำดับ deploy ของ 0409', '### ');
const deploy0409 = () => section(DEPLOY, '### ใบสั่งขายย้อนหลัง "แพ็ค/เดือน" — migration 0409', '### ');
const agentsPack = () => section(AGENTS, '## ใบเสนอราคา "แพ็ค/เดือน"');
const indexRow = (file) => rowOf(INDEX, `| [${file}](${file}) |`);

const STATUS_WORDS = ['รอดำเนินการ', 'กำลังดำเนินการ', 'รอตรวจ', 'เสร็จสมบูรณ์', 'ระงับ'];
const MARKERS = ['H1', 'H2', 'W0', 'W1', 'W2', 'S1', 'A1'];
/* แถวปะของ $patch$ จบด้วยคอลัมน์ป้าย `'0409/XX')` */
const hasPatchRow = (marker) => MIGRATION.includes(`'0409/${marker}')`);

/* 🔴 ประโยคที่ห้ามมีในเอกสารของ 0409: บอกให้เปิด/บันทึกใบร่างนั้นอีกรอบ "หลังรัน" — การรันไม่เกิดขึ้นตราบที่ใบร่างนั้นยังอยู่
   (ประโยคปฏิเสธ "… ด้วยการบันทึกซ้ำไม่ได้" · "คีย์ใหม่หลังรัน" ไม่ใช่รูปนี้ — ตัวอย่างสองฝั่งอยู่ในเทสต์) */
const RESAVE_ADVICE = /บันทึก(?:ขั้น ②)?\s*(?:ใหม่|ซ้ำ|อีกครั้ง)\s*หลังรัน|หลังรัน(?: migration)?(?: 0409)?\s*(?:แล้ว)?\s*(?:ให้)?\s*เปิดใบร่าง/;
/* 🔴 รีวิว 12/10 (D1): regex ข้างบนจับได้แค่ห้ารูปของตัวอย่างในเทสต์ — "หลังรันแล้วให้ผู้คีย์เปิดใบร่างเดิมแล้วกดบันทึกอีกครั้ง" · "บันทึกใบร่างนั้นซ้ำหลังรัน" ·
   "รัน 0409 เสร็จแล้วเปิดใบร่างมากดบันทึกอีกรอบ" หลุดหมด (มีคำคั่นระหว่าง "บันทึก" กับ "ซ้ำ" · "อีกรอบ" · "รัน … เสร็จ") และข้อ 6 ที่ต่อท้ายรายการทางกู้ใน DEPLOY.md
   รอดทั้งชุดเทสต์ ⇒ เพิ่ม **ตัวจับระดับวรรค** (regex เดิมยังอยู่เป็นชั้นแรก): วรรคเดียวกันพูดถึงใบร่าง + "หลังรัน / รัน … เสร็จ / รัน … แล้ว / เมื่อรัน" + การบันทึกอีกรอบ
   (บันทึก … ใหม่ / ซ้ำ / อีกครั้ง / อีกรอบ / อีกที · เปิดใบร่าง … บันทึก · บันทึกใบร่าง …) = คำแนะนำต้องห้าม · เว้นเมื่อคำบอกซ้ำถูกปฏิเสธติดกัน ("บันทึกซ้ำไม่ได้" · "… ไม่ช่วย")
   วรรค = ท่อนระหว่างขึ้นบรรทัด · จุดกลาง · ขีดยาว · วงเล็บ · เส้นตาราง (ประโยคของเข็มขัด "บันทึกใบร่างแล้ว … (… migration 0409) — … · … คีย์ใบนี้ใหม่หลังรัน" จึงไม่ถูกจับ:
   "บันทึก" กับ "หลังรัน" อยู่คนละวรรค) · ⚠️ regex ของภาษาคนไม่มีวันครบ — ชั้นที่สามคือโครงของรายการทางกู้ (ห้าข้อพอดี ข้อสุดท้ายคือคีย์ใหม่) ในเทสต์ข้างล่าง */
const RESAVE_AFTER_RUN = /หลัง\s*รัน|รัน(?: migration)?(?: 0409)?\s*(?:เสร็จ|แล้ว)|เมื่อรัน/;
const RESAVE_AGAIN = /บันทึก[^\n]{0,60}?(?:ใหม่|ซ้ำ|อีกครั้ง|อีกรอบ|อีกที)(\*{0,2}\s*(?:ไม่ได้|ไม่ช่วย|ไม่มีอยู่จริง))?/g;
const RESAVE_REOPEN = /เปิดใบร่าง[^\n]{0,60}?บันทึก|บันทึกใบร่าง(?!แล้ว)/;
/** วรรคที่บอกให้กลับไปบันทึก/เปิดใบร่างนั้นอีกรอบหลังรัน — คืนรายการวรรคที่เจอ (ว่าง = ไม่มี) */
function resaveAdvice(text) {
  const hits = [];
  if (RESAVE_ADVICE.test(text)) hits.push(text.match(RESAVE_ADVICE)[0]);
  for (const clause of String(text).split(/\n|·|—|;|\(|\)|\|/)) {
    if (!/ใบร่าง/.test(clause) || !RESAVE_AFTER_RUN.test(clause)) continue;
    const again = [...clause.matchAll(RESAVE_AGAIN)].some((match) => !match[1]);
    if (again || RESAVE_REOPEN.test(clause)) hits.push(clause.trim());
  }
  return hits;
}
/** ข้อที่ขึ้นต้นด้วยเลข ("1. …") ของก้อนข้อความ — [[เลข, ข้อความ]] ตามลำดับที่เขียน */
const numberedSteps = (text) => [...text.matchAll(/^[ \t]*(\d+)\.[ \t]+(.+)$/gm)].map((match) => [Number(match[1]), match[2].trim()]);
/** ตอบว่า 0409 ยังไม่รันไหม — ตัวอ่านเดียวกับเทสต์ "รันแล้วหรือยัง" (ใช้กับข้อที่มีอายุถึงวันรันเท่านั้น) */
const NOT_RUN = /0409 ยังไม่ได้รัน|ยังไม่ได้รัน\*\*|— ยังไม่ได้รัน/;

// ── 1. สถานะ: คำเดียวกันทุกที่ · "รันแล้ว/ยังไม่ได้รัน" พูดตรงกันทุกที่ ─────────────────────────────────────────

test('สถานะของงวด PR-5 เป็นคำสถานะของบ้าน และเป็นคำเดียวกันทุกที่ที่เอกสารพูดถึง (หัว qt-pack-column · หัวข้อ "งวด PR-5" · หัว/§8F ของเอกสารใบย้อนหลัง · สารบัญ)', () => {
  const stated = pr5().match(/> สถานะของงวด: \*\*([^*]+)\*\*/);
  assert.ok(stated, 'หัวข้อ "งวด PR-5" ต้องขึ้นต้นด้วยบรรทัด "> สถานะของงวด: **…**"');
  const status = stated[1];
  assert.ok(STATUS_WORDS.includes(status), `สถานะใช้ได้แค่ 5 คำ (${STATUS_WORDS.join(' · ')}) — เจอ "${status}"`);
  const places = {
    'หัว qt-pack-column.md': new RegExp(`\\*\\*งวด PR-5\\*\\*[^\\n]*— \\*\\*${status}\\*\\*`).test(qtHead()),
    'ตาราง "งวดถัดไป" ของ qt-pack-column.md': rowOf(section(QT, '## งวดถัดไป'), '| PR-5 |').includes(`**${status}**`),
    'หัว historical-sales-orders.md': new RegExp(`งวด PR-5[^\\n]*mig 0409[^\\n]*\`${status}\``).test(histHead()),
    '§8F ของ historical-sales-orders.md': new RegExp(`> สถานะ: \`${status}\``).test(hist8f()),
    'แถว qt-pack-column.md ของ INDEX.md': new RegExp(`\\*\\*งวด PR-5\\*\\*[^|]*\\*\\*${status}\\*\\*`).test(indexRow('qt-pack-column.md')),
    'แถว historical-sales-orders.md ของ INDEX.md': new RegExp(`งวด PR-5[^|]*\`${status}\``).test(indexRow('historical-sales-orders.md')),
  };
  for (const [place, ok] of Object.entries(places)) assert.ok(ok, `${place}: ต้องบอกสถานะของงวด PR-5 เป็น "${status}" เหมือนหัวข้อ "งวด PR-5" (แก้สถานะต้องแก้ครบทุกที่)`);
});

test('🔴 "0409 รันแล้วหรือยัง" — ทุกที่ที่เอกสารพูดต้องตอบตรงกัน (ไม่มีคอลัมน์ใหม่ CI จึงไม่รู้ · ที่บอกได้มีแต่เอกสาร) · เสร็จสมบูรณ์ = ต้องรันแล้ว', () => {
  const places = {
    'หัว qt-pack-column.md': qtHead(),
    'หัวข้อ "งวด PR-5" (บรรทัดสถานะ)': pr5().slice(0, pr5().indexOf('\nที่มา:')),
    'ตาราง "งวดถัดไป" แถว PR-5': rowOf(section(QT, '## งวดถัดไป'), '| PR-5 |'),
    'หัว historical-sales-orders.md': histHead(),
    '§8F': hist8f().slice(0, hist8f().indexOf('\n**ที่มา**')),
    '§9.5': hist95(),
    'แถว qt-pack-column.md ของ INDEX.md': indexRow('qt-pack-column.md'),
    'แถว historical-sales-orders.md ของ INDEX.md': indexRow('historical-sales-orders.md'),
    'DEPLOY.md': deploy0409(),
  };
  const notRun = Object.fromEntries(Object.entries(places).map(([place, text]) => [place, NOT_RUN.test(text)]));
  const answers = new Set(Object.values(notRun));
  assert.equal(answers.size, 1, `เอกสารตอบไม่ตรงกันว่า 0409 รันหรือยัง — "ยังไม่ได้รัน" อยู่ที่: ${JSON.stringify(notRun)}`);
  const status = pr5().match(/> สถานะของงวด: \*\*([^*]+)\*\*/)?.[1];
  if (status === 'เสร็จสมบูรณ์') assert.equal([...answers][0], false, 'งวดที่เสร็จสมบูรณ์ต้องไม่เหลือคำว่า "0409 ยังไม่ได้รัน"');
  /* ระหว่างที่ยังไม่ได้รัน เอกสารทุกฉบับต้องบอกลำดับด้วย: รันก่อน merge */
  if ([...answers][0]) {
    for (const [place, text] of [['หัวข้อ "งวด PR-5"', pr5()], ['§9.5', hist95()], ['DEPLOY.md', deploy0409()]]) {
      assert.match(text, /รัน 0409 ก่อน merge/, `${place}: ต้องบอก "รัน 0409 ก่อน merge"`);
    }
  }
});

// ── 2. ของที่เอกสารอ้างจาก migration มีอยู่จริง ───────────────────────────────────────────────────────────────

test('"งวด PR-5": ครบทั้ง 7 แถวปะของ 0409 (H1 · H2 · W0 · W1 · W2 · S1 · A1) และทุกป้ายที่เอกสารสองฉบับอ้างมีอยู่ใน migration จริง', () => {
  const mig = pr5Part('### mig 0409');
  for (const marker of MARKERS) {
    assert.ok(mig.includes(`\`0409/${marker}\``), `หัวข้อ "mig 0409" ต้องอธิบาย 0409/${marker}`);
    assert.ok(hasPatchRow(marker), `migration ไม่มีแถวปะ 0409/${marker} แต่เอกสารอ้าง`);
  }
  const cited = [...`${QT}\n${HIST}`.matchAll(/`0409\/([A-Z]\d)`/g)].map((match) => match[1]);
  assert.ok(cited.length >= MARKERS.length * 2, `อ่านป้ายจากเอกสารได้น้อยผิดปกติ: ${cited.length}`);
  for (const marker of cited) assert.ok(MARKERS.includes(marker), `เอกสารอ้าง 0409/${marker} ที่ไม่มีอยู่จริง`);
  /* ฟังก์ชันสี่ตัวที่เอกสารบอกว่าถูกปะ = ชื่อที่ migration เอ่ยจริง */
  for (const fn of ['historical_so_check_lines', 'historical_so_write_children', 'submit_historical_sales_order', 'approve_historical_sales_order']) {
    assert.ok(mig.includes(`\`${fn}\``), `หัวข้อ "mig 0409" ต้องบอกชื่อ ${fn}`);
    assert.ok(MIGRATION.includes(`'${fn}'`), `migration ไม่เอ่ยชื่อ ${fn}`);
    assert.ok(hist8f().includes(`\`${fn}\``), `§8F ต้องบอกชื่อ ${fn}`);
  }
});

test('ทุกรหัสที่ 0409 RAISE มีในหัวข้อ "งวด PR-5" · ทุกรหัสที่เอกสารของงวดนี้อ้างมีอยู่จริง (ตารางกลาง / รหัสฝั่ง JS / ชื่อฟังก์ชัน)', () => {
  const body = MIGRATION.replace(/^--[^\n]*$/gm, '');
  const raised = new Set([...body.matchAll(/RAISE EXCEPTION '([a-z][a-z0-9_]+)/g)].map((match) => match[1]));
  assert.equal(raised.size, 8, `0409 โยน 8 รหัส (รหัสของสองตัวช่วย + ด่านของไฟล์เจ็ดตัว) — อ่านได้ ${[...raised]}`);
  for (const code of raised) {
    assert.ok(pr5().includes(`\`${code}\``), `หัวข้อ "งวด PR-5" ต้องบอกรหัส ${code}`);
    assert.ok(WORKFLOW_ERROR_CODES.includes(code), `รหัส ${code} ต้องมีข้อความไทยในตารางกลาง`);
  }
  /* รหัสที่ตัวบันทึกฝั่ง JS ตั้งเอง (ไม่ได้มาจากฐาน) — ต้องมีอยู่ในโค้ดจริง */
  const commit = src('lib/sales/historicalOrderCommit.js');
  const jsOnly = ['historical_pack_qty_not_stored', 'historical_so_line_money_rule', 'historical_service_alignment_missing'];
  for (const code of jsOnly) assert.ok(commit.includes(`'${code}'`), `historicalOrderCommit.js ต้องตั้งรหัส ${code}`);
  /* ชื่อฟังก์ชันของฐานขึ้นต้นเหมือนรหัส — ตัดออกด้วยรายชื่อจริงจาก migration ที่นิยามมัน */
  const functions = new Set(['0374_historical_so_approval_flow', '0379_historical_so_quote_lines']
    .flatMap((name) => [...read(join(WEBAPP, `supabase/migrations/${name}.sql`)).matchAll(/FUNCTION public\.([a-z0-9_]+)\(/g)])
    .map((match) => match[1]));
  assert.ok(functions.has('historical_so_check_lines') && functions.has('historical_so_write_children'));
  const scanned = `${pr5()}\n${oneWay()}\n${hist8f()}\n${hist95()}\n${deploy0409()}\n${agentsPack()}`;
  const cited = new Set([...scanned.matchAll(/`((?:historical_so|historical_pack|historical_service|mig_0409)_[a-z0-9_]+)`/g)]
    .map((match) => match[1]).filter((name) => !functions.has(name)));
  assert.ok(cited.size >= raised.size, `อ่านรหัสจากเอกสารได้น้อยผิดปกติ: ${[...cited]}`);
  for (const code of cited) {
    assert.ok(WORKFLOW_ERROR_CODES.includes(code) || jsOnly.includes(code), `เอกสารอ้างรหัส ${code} ที่ไม่มีข้อความไทย / ไม่มีในโค้ด`);
  }
});

test('🔴 บรรทัดเกณฑ์ก่อนรัน / หลังรันที่เอกสารยกมา = บรรทัดเกณฑ์ในหัว migration ทุกตัวอักษร (ผู้พัฒนาตอบ "ไปได้" จากบรรทัดนี้)', () => {
  const before = MIGRATION.match(/--\s+เกณฑ์ก่อนรันครั้งแรก: ([^\n]+)\n--\s+· ([^\n]+)/);
  assert.ok(before, 'หัว migration ต้องมีบรรทัด "เกณฑ์ก่อนรันครั้งแรก:" สองบรรทัด');
  const preflight = `${before[1].trim()} · ${before[2].trim()}`;
  assert.equal(preflight.split(' · ').length, 11, `เกณฑ์ก่อนรันมี 11 ช่อง: ${preflight}`);
  const after = MIGRATION.match(/--\s+เกณฑ์หลังรันทุกรอบ: ([^\n]+)/);
  assert.ok(after, 'หัว migration ต้องมีบรรทัด "เกณฑ์หลังรันทุกรอบ:"');
  const verify = after[1].trim();
  assert.equal(verify.split(' · ').length, 7, `เกณฑ์หลังรันมี 7 ช่อง: ${verify}`);
  const order = pr5Part('### ลำดับ deploy ของงวด PR-5');
  assert.ok(order.includes(`\`${preflight}\``), `"ลำดับ deploy ของงวด PR-5" ต้องยกเกณฑ์ก่อนรันชุดเดียวกับหัว migration: ${preflight}`);
  for (const [place, text] of [['"ลำดับ deploy ของงวด PR-5"', order], ['§9.5', hist95()], ['DEPLOY.md', deploy0409()]]) {
    assert.ok(text.includes(`\`${verify}\``), `${place}: ต้องยกเกณฑ์หลังรันชุดเดียวกับหัว migration: ${verify}`);
  }
  /* สองช่องที่ไม่ใช่เกณฑ์หลังรันครั้งแรกสุด ต้องไม่ถูกเขียนเป็นเกณฑ์ (รันซ้ำที่ได้มากกว่า 0 = ปกติ) */
  for (const text of [order, hist95(), deploy0409()]) assert.doesNotMatch(text, /`[^`\n]*(?:in_flight|packed_hist) = 0[^`\n]*note = t`/);
  assert.match(order, /`in_flight` · `packed_hist` เป็นข้อมูลประกอบ/);
});

test('🔒 sha256 และจำนวนบรรทัดของไฟล์ 0409 ที่เอกสารอ้าง = ไฟล์จริง · ไฟล์ส่งมอบสองตัวถูกเอ่ยตามลำดับ ตรวจก่อนรัน → รัน', () => {
  const sha = createHash('sha256').update(readFileSync(MIGRATION_PATH)).digest('hex');
  const lines = MIGRATION.split('\n').length - 1;
  const mig = pr5Part('### mig 0409');
  assert.ok(mig.includes(`\`${sha}\``), `หัวข้อ "mig 0409" ต้องบอก sha256 ของไฟล์จริง: ${sha}`);
  assert.ok(mig.includes(`${lines} บรรทัด`), `หัวข้อ "mig 0409" ต้องบอกจำนวนบรรทัดของไฟล์จริง: ${lines}`);
  assert.ok(mig.includes(`\`${MIGRATION_FILE}\``));
  for (const [place, text] of [['"ลำดับ deploy ของงวด PR-5"', pr5Part('### ลำดับ deploy ของงวด PR-5')], ['§9.5', hist95()], ['DEPLOY.md', deploy0409()]]) {
    const pre = text.indexOf('PREFLIGHT-0409.sql');
    const run = text.indexOf('RUN-0409.sql');
    assert.ok(pre >= 0 && run > pre, `${place}: ต้องเอ่ย PREFLIGHT-0409.sql ก่อน RUN-0409.sql (สองจังหวะ ตรวจก่อนแล้วจึงรัน)`);
  }
});

// ── 3. ตาราง "ยามที่ย้ายโดยเจตนา" = ไฟล์เทสต์จริง ─────────────────────────────────────────────────────────────

test('"ยามที่ย้ายโดยเจตนา" ของงวด PR-5: จำนวนจุดรายไฟล์ = จำนวนคอมเมนต์ย้ายยามในไฟล์เทสต์จริง · ไม่มีไฟล์ที่ย้ายยามแล้วไม่ถูกจด · แถว G1–G19 ของแผนถูกเอ่ยครบ', () => {
  /* ประกอบคำค้นจากสองท่อน — ไฟล์นี้เองต้องไม่ถูกนับเป็นไฟล์ที่ย้ายยาม */
  const NEEDLE = ['ย้ายความคาดหวังโดยเจตนา', '(งวด PR-5'].join(' ');
  const countIn = (text) => text.split(NEEDLE).length - 1;
  const moved = pr5Part('### ยามที่ย้ายโดยเจตนา');
  const rows = [...moved.matchAll(/^\| `([^`]+\.test\.mjs)` \| (\d+) \|/gm)].map((match) => [match[1], Number(match[2])]);
  assert.ok(rows.length >= 8, `อ่านแถวของตารางได้น้อยผิดปกติ: ${rows.length}`);
  for (const [file, count] of rows) {
    const path = join(WEBAPP, 'src', file);
    assert.ok(existsSync(path), `ตารางอ้างไฟล์เทสต์ที่ไม่มี: ${file}`);
    assert.equal(countIn(read(path)), count, `${file}: เอกสารบอก ${count} จุด แต่ไฟล์มีคอมเมนต์ "⭐ ${NEEDLE} …" คนละจำนวน — ย้ายยามเพิ่ม/ลดต้องแก้ตารางในคอมมิตเดียวกัน`);
  }
  /* ทุกไฟล์เทสต์ใต้ src/ ที่มีคอมเมนต์ย้ายยามของงวดนี้ต้องอยู่ในตาราง */
  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.test\.mjs$/.test(entry) && countIn(read(path)) > 0) found.push(path.slice(join(WEBAPP, 'src').length + 1));
    }
  })(join(WEBAPP, 'src'));
  assert.deepEqual(found.sort(), rows.map(([file]) => file).sort(), 'ไฟล์เทสต์ที่มีคอมเมนต์ย้ายยามของงวด PR-5 ≠ ไฟล์ในตารางของเอกสาร');
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  assert.ok(moved.includes(`**${total} จุด ใน ${rows.length} ไฟล์เทสต์**`), `ยอดรวมของตารางต้องเขียนว่า "${total} จุด ใน ${rows.length} ไฟล์เทสต์"`);
  assert.ok(indexRow('qt-pack-column.md').includes(`ยามที่ย้ายโดยเจตนา ${total} จุด`), `สารบัญต้องบอกจำนวนเดียวกัน (${total} จุด)`);
  const cited = new Set([...moved.matchAll(/(?<![\w/])G(\d+)\b/g)].map((match) => Number(match[1])));
  for (let row = 1; row <= 19; row += 1) assert.ok(cited.has(row), `"ยามที่ย้ายโดยเจตนา" ต้องเอ่ยแถว G${row} ของแผน`);
  assert.match(moved, /ไม่มีตัวไหนถูกลบ/);
});

// ── 4. ประโยคที่เอกสารยกมา = ค่าคงที่ / ผลของฟังก์ชันจริง ─────────────────────────────────────────────────────

test('หัวข้อ "งวด PR-5": ประโยคบนจอและประโยคของ server ที่ยกมาตรงกับ lib ทุกตัวอักษร (ไม่ใช่คำที่พิมพ์ลอย ๆ)', () => {
  const T = HISTORICAL_SERVICE_TEXT;
  const text = pr5();
  for (const quoted of [
    HISTORICAL_MONEY_UNKNOWN.pack,
    HISTORICAL_LINE_MESSAGES.packQtyMissing,
    HISTORICAL_LINE_MESSAGES.packQty,
    HISTORICAL_LINE_MESSAGES.packQtyStaleForm,
    HISTORICAL_PACK_QTY_NOT_STORED_SAVED,
    HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED,
    LINE_PACK_TEXT.moneyRule,
    T.bulk.packQtyLabel,
    T.bulk.packQtyHint,
    T.quoteLink.packsSeed(2),
    T.quoteLink.roundsSeed(12),
  ]) assert.ok(text.includes(`\`${quoted}\``), `หัวข้อ "งวด PR-5" ต้องยกประโยคตามโค้ด: ${quoted}`);
  assert.equal(HISTORICAL_LINE_MESSAGES.packQty, LINE_PACK_TEXT.invalid, 'ประโยคค่าผิดรูปของแผน = ของใบเสนอราคา');
  assert.ok(text.includes(`\`${PACK_COLUMN_LABEL} *\``), 'หัวคอลัมน์ที่ยกมา = ค่าคงที่ + ดอกจัน');
  /* คำเตือนสองคู่ไม่ตรง — ระดับแถว (ขั้น ②) และระดับใบ (ขั้น ④ / หน้าต่างอนุมัติ) */
  const link = historicalLineQuoteLink({ packQty: '2', qty: '12', packsPerRound: '1', rounds: '6' }, 'รายการ 1');
  assert.ok(text.includes(`\`⚠️ ${link.mismatch}\``), `ต้องยกบรรทัดเตือนของขั้น ② ตามโค้ด: ${link.mismatch}`);
  const pairs = historicalQuoteServiceMismatch([
    { packQty: 2, qty: 12, packsPerRound: 1, rounds: 12 }, { packQty: 2, qty: 12, packsPerRound: 2, rounds: 6 }, { packQty: 3, qty: 12, packsPerRound: 1, rounds: 12 },
  ]);
  assert.ok(text.includes(`\`⚠️ ${pairs.text}\``), `ต้องยกบรรทัดเตือนของหน้าต่างอนุมัติตามโค้ด: ${pairs.text}`);
  /* ประโยค "รายการ:" ของหน้าต่างอนุมัติ — บรรทัดที่มีเลขแพ็ค · มีส่วนลด · ไม่มีเลขแพ็ค (ข้อความเดิม) */
  const packLine = quoteLineText({ packQty: 2, qty: 12, unit: 'เดือน', unitPrice: 3500, discountAmount: 0, lineTotal: 84000 });
  const legacy = quoteLineText({ qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500, discountAmount: 0, lineTotal: 42000 });
  const discounted = quoteLineText({ packQty: 2, qty: 12, unit: 'เดือน', unitPrice: 3500, discountAmount: 14400, lineTotal: 69600 });
  for (const sentence of [packLine, legacy]) assert.ok(text.includes(`\`${sentence}\``), `ต้องยกประโยค "รายการ:" ตามโค้ด: ${sentence}`);
  const tail = discounted.slice(discounted.indexOf('× ฿3,500.00'));
  assert.ok(text.includes(`\`… ${tail}\``), `ต้องยกท่อนส่วนลดตามโค้ด: … ${tail}`);
  for (const [file, body] of [['historical-sales-orders.md §8A', section(HIST, '## 8A. ฟอร์มคีย์ใบ')], ['§8F', hist8f()]]) {
    assert.ok(body.includes(legacy) , `${file}: ต้องยกประโยคของบรรทัดที่ไม่มีเลขแพ็คตามโค้ด: ${legacy}`);
  }
  assert.ok(section(HIST, '## 8A. ฟอร์มคีย์ใบ').includes(packLine), `§8A ต้องยกประโยคของบรรทัดที่มีเลขแพ็คตามโค้ด: ${packLine}`);
  for (const quoted of [HISTORICAL_LINE_MESSAGES.packQtyStaleForm, T.quoteLink.packsSeed(2), T.quoteLink.roundsSeed(12)]) {
    assert.ok(hist8f().includes(quoted), `§8F ต้องยกประโยคตามโค้ด: ${quoted}`);
  }
});

test('หัวข้อ "หน้าต่างเพิ่มหลายโซน": แปดรูปของประโยคผลก่อนกดในตาราง = ผลของ historicalBulkConsequence · ฿ ขึ้นเมื่อรู้ครบสามตัวเท่านั้น', () => {
  const bulk = pr5Part('### หน้าต่าง "เพิ่มหลายโซน"');
  const ENDING = ' — ';
  const moneyPart = (input) => {
    const sentence = historicalBulkConsequence({ count: 3, ...input });
    const prefix = sentence.startsWith('จะเพิ่ม 3 บรรทัด · ') ? 'จะเพิ่ม 3 บรรทัด · ' : 'จะเพิ่ม 3 บรรทัด — ';
    assert.ok(sentence.startsWith(prefix), sentence);
    return sentence.slice(prefix.length);
  };
  let withBaht = 0;
  for (const packQty of ['2', '']) {
    for (const qty of ['12', '']) {
      for (const unitPrice of [1200, null]) {
        const part = moneyPart({ packQty, qty, unitPrice });
        const [body, ending] = part.includes(ENDING) ? [part.slice(0, part.indexOf(ENDING)), part.slice(part.indexOf(ENDING))] : [part, ''];
        assert.ok(bulk.includes(`\`${body}\``), `ตารางต้องมีรูป (แพ็ค "${packQty}" · จำนวน "${qty}" · ราคา ${unitPrice}): ${body}`);
        if (ending) assert.ok(bulk.includes(`\`${ending}\``), `ตารางต้องยกท่อนยังไม่ตั้งราคาตามโค้ด: ${ending}`);
        if (part.includes('฿')) withBaht += 1;
        assert.equal(part.includes('฿'), Boolean(packQty && qty && unitPrice), `฿ ขึ้นเมื่อรู้ครบสามตัวเท่านั้น: ${part}`);
      }
    }
  }
  assert.equal(withBaht, 1);
  /* ผู้รับปิดห้าตัวของช่องตั้งต้นที่เอกสารระบุ = ฟังก์ชันที่ lib export จริง (ยาม GE ยึดฝั่งจอ) */
  const lib = src('lib/sales/historicalIntakeForm.js');
  for (const sink of ['historicalBulkPackIssue', 'historicalBulkFieldsIssue', 'historicalBulkQtyUnit', 'historicalBulkConsequence', 'historicalBulkAddRows']) {
    assert.ok(bulk.includes(`\`${sink}\``), `ต้องระบุผู้รับ ${sink}`);
    assert.match(lib, new RegExp(`export function ${sink}\\(`));
  }
});

// ── 5. docs/historical-sales-orders.md ───────────────────────────────────────────────────────────────────

test('historical-sales-orders.md §1.1 A13: มีบันทึกลงวันที่ของงวด PR-5 และไม่บอกว่าฟอร์มนี้ยังไม่มีคอลัมน์ "แพ็ค/เดือน" แล้ว', () => {
  const a13 = rowOf(HIST, '| A13 |');
  assert.match(a13, /\*\*12\/10\/2026 \(งวด PR-5 · mig 0409[^)]*\)\*\*/, 'A13 ต้องมีบันทึกลงวันที่ของงวด PR-5');
  assert.match(a13, /ขั้น ② มีคอลัมน์ `แพ็ค\/เดือน` แล้ว/);
  assert.match(a13, /แพ็ค\/เดือน × จำนวน × ราคา\/หน่วย/, 'A13 ต้องบอกสูตรของวันนี้');
  assert.doesNotMatch(a13, /ฟอร์มนี้ยังไม่มี|เหมือนเดิมทุกอย่าง\*\* จนงวด PR-5|`WizardZonesStep` ไม่ส่ง/, 'ประโยคของ 09/10 ที่บอกว่าฟอร์มนี้ยังไม่มีคอลัมน์ต้องไม่เหลือเป็นปัจจุบัน');
  assert.match(a13, /`packsPerRound` ของแถวโซน = แพ็คต่อรอบของงานบริการ \*\*ยังไม่ใช่ตัวคูณเงิน\*\*/, 'ข้อที่ยังจริงต้องอยู่: packsPerRound ไม่คูณเงิน');
  /* เอกสารหลักของเรื่องช่องนี้ก็ต้องไม่พูดว่าฟอร์มใบย้อนหลังยังไม่เปลี่ยนเป็นปัจจุบัน */
  assert.doesNotMatch(QT, /^### ฟอร์มใบสั่งขายย้อนหลัง \(ขั้น ②\) — ไม่เปลี่ยนจนงวด PR-5$/m);
  assert.doesNotMatch(qtHead(), /งวด PR-5 … PR-6 ยังไม่เริ่ม/);
});

test('historical-sales-orders.md §6.1: ตัวอย่าง body · p_lines · ช่อง error ตรงกับคีย์ที่โค้ดส่งจริง — มี packQty และยังมี packsPerRound', () => {
  const api = section(HIST, '### 6.1', '### ');
  /* p_lines: รายการคีย์ในเอกสาร = คีย์ที่ historicalServiceRpcArgs ประกอบ (ลำดับเดียวกัน) */
  const documented = api.match(/`p_lines` = `\{ ([^`}]*) \}`/);
  assert.ok(documented, '§6.1 ต้องมี `p_lines` = `{ … }`');
  const plan = src('lib/sales/historicalOrderPlan.js');
  const from = plan.indexOf('p_lines: lines.map((line) => ({');
  assert.ok(from > 0, 'หาตัวประกอบ p_lines ใน historicalOrderPlan.js ไม่เจอ — ไฟล์เปลี่ยนท่าเขียน');
  const block = plan.slice(from, plan.indexOf('})),', from)).replace(/\/\*[\s\S]*?\*\//g, '');
  const sent = [...block.matchAll(/^\s*([A-Za-z]+):\s/gm)].map((match) => match[1]).filter((key) => key !== 'p_lines');
  assert.equal(sent.length, 12, `p_lines มี 12 คีย์ต่อบรรทัด — อ่านจากโค้ดได้ ${sent}`);
  assert.deepEqual(documented[1].split(', '), sent, '§6.1: รายการคีย์ของ p_lines ต้องตรงกับที่โค้ดส่ง');
  for (const key of ['packQty', 'unit', 'packsPerRound', 'serviceRounds']) assert.ok(sent.includes(key), key);
  /* body: คีย์ของบรรทัดในตัวอย่าง = คีย์ที่ historicalWizardBody ส่ง */
  const example = api.split('\n').find((line) => line.trimStart().startsWith('"zones":'));
  assert.ok(example, '§6.1 ต้องมีบรรทัดตัวอย่าง "zones"');
  const exampleKeys = [...example.slice(example.indexOf('[')).matchAll(/"([A-Za-z]+)":/g)].map((match) => match[1]);
  const form = src('lib/sales/historicalIntakeForm.js');
  const zonesFrom = form.indexOf('zones: list(state.zones).map((row) => ({');
  assert.ok(zonesFrom > 0, 'หาตัวประกอบ zones ของ body ใน historicalIntakeForm.js ไม่เจอ');
  const bodyKeys = [...form.slice(zonesFrom, form.indexOf('})),', zonesFrom)).matchAll(/^\s*([A-Za-z]+):\s/gm)].map((match) => match[1]).filter((key) => key !== 'zones');
  assert.deepEqual(exampleKeys, bodyKeys, '§6.1: คีย์ของบรรทัดในตัวอย่าง body ต้องตรงกับที่ฟอร์มส่ง (8 คีย์)');
  assert.equal(bodyKeys.length, 8);
  assert.match(api, /zones\.<i>\.<[^>]*packQty[^>]*packsPerRound[^>]*>/, 'ช่อง error ของบรรทัดต้องมีทั้ง packQty และ packsPerRound');
  assert.match(plan, /'packQty'/);
  assert.match(api, /`historical_pack_qty_not_stored`/);
});

test('historical-sales-orders.md §8F · §9.5 · §5: สองเลข "แพ็ค" ถูกแยกให้ชัด · ลำดับ deploy ของ 0409 · ตารางยามชี้ไฟล์เทสต์ที่มีอยู่จริง', () => {
  const f = hist8f();
  const pack = rowOf(f, '| คีย์ |');
  assert.match(pack, /`packQty` \| `packsPerRound`/, 'ตารางสองเลขต้องตั้งคีย์สองตัวคู่กัน');
  assert.match(rowOf(f, '| เก็บที่ |'), /`sales_order_lines\."packQty"`[^|]*\| `sales_order_line_zones`/);
  assert.match(rowOf(f, '| ใช้ทำอะไร |'), /\*\*ตัวคูณเงินของบรรทัด\*\*[^|]*\|[^|]*\*\*ไม่เคยคูณเงิน\*\*/);
  assert.match(f, /ไม่บังคับให้เท่า|ไม่กั้น/, 'มติ A8: ไม่ตรง = เตือน ไม่กั้น');
  const deploy = hist95();
  assert.ok(deploy.includes(MIGRATION_FILE));
  assert.match(deploy, /draft/);
  assert.match(deploy, /check:columns/);
  assert.ok(deploy.indexOf('freeze') >= 0 && deploy.indexOf('freeze') < deploy.indexOf('PREFLIGHT-0409.sql'), '§9.5: ประกาศ freeze ก่อนตรวจก่อนรัน');
  const guards = section(HIST, '## 5. ยามกันไหลกลับ');
  for (const file of ['historicalPackQtyMigration.test.mjs', 'historicalPackQtyDocs.test.mjs', 'linePackMigration.test.mjs']) {
    assert.ok(guards.includes(file), `§5 ต้องมี ${file}`);
    assert.ok(existsSync(join(HERE, file)), `${file} ไม่มีอยู่จริง`);
  }
  /* ตารางยามของ qt-pack-column.md ก็เช่นกัน */
  const qtGuards = section(QT, '## ยาม');
  for (const file of ['historicalPackQtyMigration.test.mjs', 'historicalPackQtyDocs.test.mjs']) assert.ok(qtGuards.includes(`\`${file}\``), `ตาราง "ยาม" ของ qt-pack-column.md ต้องมี ${file}`);
});

// ── 6. ประตูทางเดียว · AGENTS.md · DEPLOY.md ─────────────────────────────────────────────────────────────

test('🚪 ประตูทางเดียวของใบสั่งขายย้อนหลัง: ประโยคหลักอยู่ในเอกสาร และข้อใน webapp/AGENTS.md อ้างรหัส · ไฟล์ · ข้อความที่มีอยู่จริง (ข้อเดียว)', () => {
  const door = oneWay();
  assert.match(door, /\*\*หลังรัน migration 0409 โค้ดรุ่นก่อนงวด PR-5 บันทึกใบสั่งขายย้อนหลังไม่ได้อีกเลย\*\*/, 'ประโยคหลักของประตูทางเดียว');
  assert.match(door, /ห้ามถอย 0409 ขณะมีใบสั่งขายย้อนหลังที่ยังไม่อนุมัติถือเลขแพ็ค/);
  assert.match(door, /ไม่มีตัวจับเลขแพ็คที่หายสำหรับบรรทัดใบสั่งขายย้อนหลัง/, 'ต้องบอกตรง ๆ ว่าไม่มีตัวจับ — ตัวกันคือตัวเขียนของฐาน');
  const bullets = agentsPack().split('\n- ').slice(1).filter((bullet) => /0409/.test(bullet));
  assert.equal(bullets.length, 1, 'webapp/AGENTS.md: เรื่อง 0409 อยู่ในข้อเดียวใต้หัวข้อ "แพ็ค/เดือน"');
  const [bullet] = bullets;
  assert.match(bullet, /หลังรัน 0409 โค้ดรุ่นที่ยังไม่มีไฟล์ migration นั้น \*\*บันทึกใบสั่งขายย้อนหลังไม่ได้เลย\*\*/);
  assert.match(bullet, /`historical_so_line_pack_qty_invalid`/);
  assert.ok(WORKFLOW_ERROR_CODES.includes('historical_so_line_pack_qty_invalid'));
  assert.match(bullet, /ดัง ไม่ใช่ยอดหดเงียบ/);
  assert.match(bullet, /\*\*ห้ามถอย migration 0409 ขณะมีใบสั่งขายย้อนหลังที่ยังไม่อนุมัติถือเลข "แพ็ค\/เดือน"\*\*/);
  /* 🔴 รีวิว 12/10 (D2): คำสั่ง git ของข้อนี้ตอบ "ผ่าน" บนแบรนช์งวด PR-5 เอง ตั้งแต่ไฟล์ migration ถูก commit จนถึงวันที่เจ้าของรัน — ช่วงเดียวที่การบันทึกใบสั่งขายย้อนหลัง
     จาก dev server อันตรายจริง (ใบร่างจริงที่ไม่มีเลขแพ็ค ซึ่งขวางการรันครั้งแรก) · AGENTS.md คือไฟล์เดียวที่ทุกเซสชันโหลด ⇒ ตราบที่เอกสารยังตอบว่า 0409 ยังไม่รัน
     ข้อนี้ต้องพกวรรคห้ามนั้นด้วย · จดว่ารันแล้วเมื่อไร วรรคต้องถูกถอดในคอมมิตเดียวกัน (ค้างไว้ = ห้ามในสิ่งที่ปลอดภัยแล้ว และสถานะสองไฟล์พูดไม่ตรงกัน) */
  if (NOT_RUN.test(deploy0409())) {
    assert.match(bullet, /\*\*จนกว่า 0409 จะรัน\*\*/, 'AGENTS.md: ระหว่างยังไม่รัน ต้องมีวรรค "จนกว่า 0409 จะรัน"');
    assert.match(bullet, /\*\*ห้ามบันทึกใบสั่งขายย้อนหลังจาก dev server\s+ของโค้ดที่มีไฟล์นี้\*\*/, 'AGENTS.md: ห้ามบันทึกจาก dev server ของโค้ดที่มีไฟล์ migration ก่อนรัน');
    assert.match(bullet, /คำสั่งข้างบน "ผ่าน" ทั้งที่ฐานยังไม่พร้อม/, 'ต้องบอกว่าคำสั่งตรวจรุ่นตอบ "ผ่าน" ในช่วงนี้');
    assert.match(bullet, /ใบร่างนั้นขวางการรัน/);
    assert.match(bullet, /\[DEPLOY\.md\]\(DEPLOY\.md\)/, 'ชี้ไปที่ที่จดสถานะ');
    assert.ok(bullet.indexOf('git cat-file -e HEAD:') < bullet.indexOf('จนกว่า 0409 จะรัน'), 'วรรคห้ามอยู่หลังคำสั่งที่มันพูดถึง');
  } else {
    assert.doesNotMatch(bullet, /จนกว่า 0409 จะรัน/, 'AGENTS.md: เอกสารจดว่ารันแล้ว — วรรค "จนกว่า 0409 จะรัน" ต้องถูกถอดในคอมมิตเดียวกัน');
  }
  /* คำสั่งตรวจรุ่น: path ที่อ้างต้องเป็นไฟล์ migration ตัวจริงนับจากรากของรีโป (path ผิด = ทุก worktree "ไม่ผ่าน" หรือ "ผ่าน" มั่ว) */
  const command = bullet.match(/`git cat-file -e HEAD:([^`]+)`/);
  assert.ok(command, 'ข้อใน AGENTS.md ต้องมีคำสั่ง git cat-file -e HEAD:<ไฟล์ migration>');
  assert.equal(command[1], `webapp/supabase/migrations/${MIGRATION_FILE}`);
  assert.ok(existsSync(join(REPO, command[1])), `${command[1]} ไม่มีอยู่จริง`);
  for (const text of [door, deploy0409()]) assert.ok(text.includes(command[0]) || text.includes(MIGRATION_FILE), 'เอกสารอื่นอ้างไฟล์เดียวกัน');
  /* ข้อความกลางที่รุ่นเก่าโชว์ = ข้อความของรหัสที่ตารางกลางไม่รู้จัก (ตัดท้ายได้ ห้ามพิมพ์เอง) */
  const generic = workflowErrorMessage('zz_code_that_does_not_exist');
  for (const [place, text] of [['AGENTS.md', bullet], ['ประตูทางเดียว', door], ['DEPLOY.md', deploy0409()]]) {
    const quoted = text.match(/["`“](ดำเนินการกับเอกสารไม่สำเร็จ[^"`”…]*)/);
    assert.ok(quoted, `${place}: ต้องยกข้อความกลางที่รุ่นเก่าโชว์`);
    assert.ok(generic.startsWith(quoted[1].trim()), `${place}: ข้อความกลางที่ยกมาต้องเป็นต้นประโยคของข้อความจริง ("${generic}") — เจอ "${quoted[1]}"`);
  }
});

test('webapp/DEPLOY.md: สามอย่างที่คนกดปุ่ม deploy ต้องรู้ — PR เป็น draft จนรัน 0409 · ประกาศหยุดคีย์ก่อนตรวจก่อนรัน · ทางกู้เมื่อโค้ดขึ้นก่อน 0409 (ยกเลิก → รัน → คีย์ใหม่)', () => {
  const text = deploy0409();
  /* ① ตัวล็อก */
  assert.match(text, /รัน 0409 ก่อน merge/);
  assert.match(text, /\*\*draft\*\*/);
  assert.match(text, /ไม่มีด่าน CI กัน/);
  assert.match(text, /ห้ามบันทึกใบสั่งขายย้อนหลังจาก dev server ของแบรนช์งวด PR-5 ก่อนรัน/);
  /* ② ประกาศหยุดคีย์ **ก่อน** จังหวะที่หนึ่ง · มีเพดานเวลาและทางออก */
  const announce = text.indexOf('ประกาศหยุดคีย์ก่อน');
  const preflight = text.indexOf('PREFLIGHT-0409.sql');
  const run = text.indexOf('RUN-0409.sql');
  assert.ok(announce >= 0 && announce < preflight && preflight < run, 'ลำดับใน DEPLOY.md: ประกาศหยุดคีย์ → PREFLIGHT-0409.sql → RUN-0409.sql');
  assert.match(text, /ไม่เกิน 30 นาที/);
  assert.match(text, /อย่ากดซ้ำ — ไม่มีอะไรถูกบันทึก/);
  assert.match(text, /แถวนี้มีอายุ/);
  /* ③ ทางกู้: ยกเลิก … คีย์ใหม่ — และไม่มีประโยคที่บอกให้บันทึกใบร่างนั้นอีกรอบหลังรัน */
  const recovery = text.slice(text.indexOf('🧯'), text.indexOf('- **ตัวเลขฐานของสคริปต์เทียบ**'));
  assert.ok(recovery.length > 200, 'หาข้อ "ทางกู้" ใน DEPLOY.md ไม่เจอ');
  assert.match(recovery, /ยกเลิกใบนั้น/);
  assert.match(recovery, /คีย์ใหม่/);
  assert.ok(recovery.indexOf('ยกเลิกใบนั้น') < recovery.indexOf('วาง `RUN-0409.sql`') && recovery.indexOf('วาง `RUN-0409.sql`') < recovery.lastIndexOf('คีย์ใหม่'), 'ทางกู้เรียง ยกเลิก → รัน → คีย์ใหม่');
  assert.ok(recovery.includes(HISTORICAL_PACK_QTY_NOT_STORED_SAVED.slice(0, HISTORICAL_PACK_QTY_NOT_STORED_SAVED.indexOf(' — '))), 'อาการที่ยกมา = ต้นประโยคของเข็มขัดตามโค้ด');
  /* 🔴 รีวิว 12/10 (D1): โครงของรายการทางกู้ — ห้าข้อพอดี ข้อสุดท้ายคือ "คีย์ใหม่" ล้วน ๆ · ข้อ 6 ที่ชวนกลับไปหาใบร่างเดิม หรือข้อ 5 ที่ถูกต่อท้ายด้วย "หรือ …"
     เคยรอดทั้งชุดเทสต์ (ตัวตรวจลำดับดูแค่ตำแหน่งของคำสุดท้าย · regex ของประโยคต้องห้ามจับได้ไม่กี่รูป) */
  const steps = numberedSteps(recovery);
  assert.deepEqual(steps.map(([n]) => n), [1, 2, 3, 4, 5], `ทางกู้ใน DEPLOY.md มีห้าข้อพอดี — เจอ ${JSON.stringify(steps)}`);
  assert.match(steps[0][1], /^หยุดคีย์ใบสั่งขายย้อนหลัง/);
  assert.match(steps[1][1], /^เจ้าของวาง `PREFLIGHT-0409\.sql`/);
  assert.match(steps[2][1], /^เจ้าของตัดสินทีละใบ: \*\*ยกเลิกใบนั้น\*\*/);
  assert.equal(steps[3][1], 'วาง `RUN-0409.sql`');
  assert.equal(steps[4][1], 'คีย์ใหม่', 'ข้อสุดท้ายของทางกู้คือคีย์ใบใหม่ — ไม่มีทางเลือก "หรือ …" ต่อท้าย');
  /* ④ ตัวเลขฐานของสคริปต์เทียบ + ไม่มีตัวจับของบรรทัดใบย้อนหลัง */
  assert.match(text, /`--expect-min-packed=<QT>,<SO>`[^\n]*นับบรรทัดของใบสั่งขายย้อนหลังด้วย/);
  assert.match(text, /"ต้องดู"/);
  assert.match(text, /ไม่มีตัวจับเลขแพ็คที่หายสำหรับบรรทัดใบสั่งขายย้อนหลัง/);
  /* ⑤ ใครทำการตรวจหลัง deploy */
  assert.match(text, /ทำโดยเจ้าของหรือคนที่เจ้าของระบุ/);
});

test('🔴 ไม่มีเอกสารของ 0409 ฉบับไหนบอกให้เปิด/บันทึกใบร่างที่ไม่มีเลขแพ็คอีกรอบ "หลังรัน" — ใบร่างนั้นคือสิ่งที่หยุดการรัน (ตัวจับถูกป้อนตัวอย่างสองฝั่ง)', () => {
  for (const bad of [
    'หลังรัน 0409 เปิดใบร่างบันทึกขั้น ② ใหม่',
    'เปิดใบร่างบันทึกขั้น ② ใหม่หลังรันแล้ว',
    'ให้ผู้คีย์บันทึกใหม่หลังรัน migration',
    'หลังรัน migration 0409 แล้วให้เปิดใบร่างเดิม',
    'เปิดใบร่างมาบันทึกซ้ำหลังรัน',
  ]) assert.match(bad, RESAVE_ADVICE, `ตัวจับต้องจับ: ${bad}`);
  for (const fine of [
    HISTORICAL_PACK_QTY_NOT_STORED_SAVED, HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED,
    'ใบร่างแบบนี้แก้ด้วยการบันทึกซ้ำไม่ได้ ทั้งก่อนรันและหลังรัน', 'ยกเลิกใบนั้น แล้วคีย์ใหม่หลังรัน', 'ก่อนรัน บันทึกกี่ครั้งก็ยังไม่มีเลข',
  ]) assert.doesNotMatch(fine, RESAVE_ADVICE, `ตัวจับต้องไม่จับ: ${fine}`);
  /* 🔴 รีวิว 12/10 (D1) — ตัวจับระดับวรรค: รูปที่ regex ชั้นแรกปล่อยหลุด (สี่รูปแรกคือของรีวิว · ข้อ 6 / ข้อ 5 คือตัวกลายพันธุ์ของเอกสารที่เคยรอด) */
  const MISSED_BEFORE = [
    'หลังรันแล้วให้ผู้คีย์เปิดใบร่างเดิมแล้วกดบันทึกอีกครั้ง',
    'บันทึกใบร่างนั้นซ้ำหลังรัน',
    'รัน 0409 เสร็จแล้วเปิดใบร่างมากดบันทึกอีกรอบ',
    'หลังรัน 0409 ผู้คีย์เปิดใบร่างแล้วบันทึกขั้น ② ใหม่',
    'หลังรันเสร็จ ให้เปิดใบร่างนั้นแล้วกดบันทึก',
    'เมื่อรัน 0409 แล้ว ให้ผู้คีย์บันทึกใบร่างอีกครั้งเพื่อเก็บเลข',
    'คำแนะนำให้บันทึกใบร่างซ้ำหลังรัน',
    '  6. หลังรันแล้วให้ผู้คีย์เปิดใบร่างเดิมแล้วกดบันทึกอีกครั้ง',
    '5. คีย์ใบใหม่ — หรือบันทึกใบร่างนั้นซ้ำหลังรัน',
    'ถ้ายกเลิกไม่ได้ ให้บันทึกใบร่างนั้นอีกทีหลังรัน 0409',
  ];
  for (const bad of MISSED_BEFORE) assert.ok(resaveAdvice(bad).length > 0, `ตัวจับระดับวรรคต้องจับ: ${bad}`);
  assert.ok(MISSED_BEFORE.filter((bad) => !RESAVE_ADVICE.test(bad)).length >= 8, 'ตัวอย่างชุดนี้คือรูปที่ regex ชั้นแรกจับไม่ได้ (ไม่งั้นเทสต์นี้ไม่ได้พิสูจน์ชั้นที่สอง)');
  for (const bad of ['หลังรัน 0409 เปิดใบร่างบันทึกขั้น ② ใหม่', 'ให้ผู้คีย์บันทึกใหม่หลังรัน migration']) assert.ok(resaveAdvice(bad).length > 0, `ชั้นแรกยังอยู่ในตัวจับรวม: ${bad}`);
  for (const fine of [
    HISTORICAL_PACK_QTY_NOT_STORED_SAVED, HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED,
    'ใบร่างแบบนี้แก้ด้วยการบันทึกซ้ำไม่ได้ ทั้งก่อนรันและหลังรัน', 'ยกเลิกใบนั้น แล้วคีย์ใหม่หลังรัน', 'ก่อนรัน บันทึกกี่ครั้งก็ยังไม่มีเลข',
    'ใบร่างที่ถูกเก็บโดยไม่มีเลขแพ็ค **ซ่อมด้วยการบันทึกซ้ำไม่ได้** — ก่อนรัน บันทึกกี่ครั้งก็ยังไม่มีเลข และการรันจะไม่เกิดขึ้นตราบที่ใบร่างนั้นยังอยู่',
    'ใบร่างนี้ส่งอนุมัติไม่ได้ และต้องยกเลิกก่อนผู้ดูแลจึงรัน migration ได้ แล้วคีย์ใบนี้ใหม่หลังรัน',
    'หลังรัน migration 0409 โค้ดรุ่นก่อนงวด PR-5 บันทึกใบสั่งขายย้อนหลังไม่ได้อีกเลย',
    'ใบร่างนั้นหลังรันแล้วบันทึกซ้ำไม่ช่วย',
  ]) assert.deepEqual(resaveAdvice(fine), [], `ตัวจับระดับวรรคต้องไม่จับ: ${fine}`);
  const places = {
    'หัวข้อ "งวด PR-5"': pr5(), 'ประตูทางเดียว › ใบสั่งขายย้อนหลัง': oneWay(), '§8F': hist8f(), '§9.5': hist95(), 'DEPLOY.md': deploy0409(), 'AGENTS.md': agentsPack(),
  };
  for (const [place, text] of Object.entries(places)) {
    assert.doesNotMatch(text, RESAVE_ADVICE, `${place}: ห้ามบอกให้บันทึก/เปิดใบร่างนั้นอีกรอบหลังรัน — ทางออกคือยกเลิกแล้วคีย์ใหม่`);
    assert.deepEqual(resaveAdvice(text), [], `${place}: วรรคนี้อ่านได้ว่าให้กลับไปบันทึก/เปิดใบร่างนั้นอีกรอบหลังรัน — ทางออกคือยกเลิกแล้วคีย์ใหม่ (ถ้าเป็นประโยคปฏิเสธ ให้คำปฏิเสธติดกับคำว่าซ้ำ)`);
  }
  /* และทุกที่ที่พูดถึงการสลับลำดับต้องบอกทางออกจริง */
  for (const [place, text] of [['"ถ้าสลับลำดับ"', pr5Part('### ถ้าสลับลำดับ')], ['§9.5', hist95()]]) {
    assert.match(text, /ยกเลิกใบนั้น/, `${place}: ต้องบอกทางออก (ยกเลิก)`);
    assert.match(text, /คีย์(?:ใบ)?ใหม่/, `${place}: ต้องบอกทางออก (คีย์ใหม่)`);
  }
  /* โครงของทางกู้ในเอกสารหลัก: ห้าข้อพอดี ข้อสุดท้ายคือคีย์ใบใหม่ล้วน ๆ (ของ DEPLOY.md ยึดที่เทสต์ของมันข้างบน) · §9.5 เขียนเป็นสายลูกศรห้าท่อน */
  const swapped = numberedSteps(pr5Part('### ถ้าสลับลำดับ'));
  assert.deepEqual(swapped.map(([n]) => n), [1, 2, 3, 4, 5], `"ถ้าสลับลำดับ" มีห้าข้อพอดี — เจอ ${JSON.stringify(swapped)}`);
  assert.match(swapped[2][1], /^เจ้าของตัดสินทีละใบ: \*\*ยกเลิกใบนั้น\*\*/);
  assert.equal(swapped[3][1], 'วาง `RUN-0409.sql`');
  assert.equal(swapped[4][1], 'คีย์ใบใหม่', 'ข้อสุดท้ายคือคีย์ใบใหม่ — ไม่มี "หรือ …" ต่อท้าย');
  const chain = hist95().match(/\*\*(หยุดคีย์ → [^\n]*?)\*\*/);
  assert.ok(chain, '§9.5 ต้องมีสายทางกู้ "หยุดคีย์ → … → คีย์ใหม่" เป็นตัวหนา');
  const links = chain[1].split(' → ');
  assert.equal(links.length, 5, `สายทางกู้ของ §9.5 มีห้าท่อน — เจอ ${JSON.stringify(links)}`);
  assert.deepEqual([links[0], links[1], links[3], links[4]], ['หยุดคีย์', '`PREFLIGHT-0409.sql`', '`RUN-0409.sql`', 'คีย์ใหม่']);
  assert.match(links[2], /^เจ้าของตัดสินทีละใบ: ยกเลิกใบนั้น/);
});

/* 🔴 รีวิว 12/10 (M2 · D3) — สองประโยคของเอกสารที่ไม่จริง/กำลังจะไม่จริง:
   ① "เข็มขัดตอบ 503 ที่จังหวะนั้นทุกครั้ง" — บนทางแก้ใบ การกดครั้งที่สองจากแท็บเดิมได้ 409 workflow_stale (503 ไม่พกเวลาใหม่ของใบ) · ที่จริงเสมอคือ "จังหวะบันทึกไม่เคยผ่าน"
      ⇒ เอกสารต้องบอกสิ่งที่คนคีย์เห็นจริงด้วยคำของแผงบันทึกตามโค้ด (ลำดับ 503 → 409 ยึดด้วย handler ตัวจริงที่ historicalOrderCommit.test.mjs)
   ② บรรทัดสถานะ "ยังไม่ merge · 0409 ยังไม่ได้รัน" ทั้งเก้าที่กลายเป็นเท็จบน main ในนาทีที่ merge (PR นี้ merge ได้หลังรันเท่านั้น) และไม่มีข้อไหนของลำดับ deploy
      บอกให้แก้ ⇒ ลำดับ deploy ทั้งสามฉบับต้องมีข้อ "พลิกสถานะในเอกสาร" อยู่ระหว่างแถวตรวจหลังรันกับการกด ready */
test('🔴 เอกสารบอกสิ่งที่คนคีย์เห็นจริงเมื่อกดซ้ำบนทางแก้ใบ (409 workflow_stale ไม่ใช่ 503 ทุกครั้ง) · ลำดับ deploy ทั้งสามฉบับมีข้อพลิกสถานะก่อนกด ready · วันที่ "ตรวจกับโค้ด" ของหัวไฟล์ไม่เก่ากว่าของงวด', () => {
  /* ① */
  for (const [place, text] of [['หัวข้อ "งวด PR-5"', pr5()], ['§8F', hist8f()], ['§9.5', hist95()], ['DEPLOY.md', deploy0409()]]) {
    assert.doesNotMatch(text, /503[^\n·|]{0,40}ที่จังหวะ[^\n·|]{0,20}ทุกครั้ง/, `${place}: "503 ที่จังหวะนั้นทุกครั้ง" ไม่จริงกับการกดครั้งที่สองของทางแก้ใบ`);
  }
  const stale = historicalSaveResultView(historicalSaveExit({ status: 409, data: { code: 'workflow_stale', error: 'x' } }), { stage: 'persist' });
  assert.deepEqual([stale.title, stale.action?.label], ['ส่งไม่สำเร็จ — ใบถูกแก้จากที่อื่นหลังคุณเปิด', 'โหลดใบล่าสุด']);
  const swappedOrder = pr5Part('### ถ้าสลับลำดับ');
  assert.match(swappedOrder, /\*\*จังหวะบันทึกไม่เคยผ่าน\*\*/, '"ถ้าสลับลำดับ": ข้อที่จริงทุกกด = จังหวะบันทึกไม่ผ่าน (จึงส่งอนุมัติไม่ถึง)');
  for (const [place, text] of [['"ถ้าสลับลำดับ"', swappedOrder], ['§8F', hist8f()], ['"แผนและ server"', pr5Part('### แผนและ server')]]) {
    assert.match(text, /409 `workflow_stale`/, `${place}: ต้องบอกว่าการกดซ้ำบนทางแก้ใบได้ 409 workflow_stale`);
    assert.ok(text.includes(stale.title), `${place}: ต้องยกหัวของแผงบันทึกตามโค้ด: ${stale.title}`);
    assert.ok(text.includes(stale.action.label), `${place}: ต้องยกชื่อปุ่มตามโค้ด: ${stale.action.label}`);
  }
  assert.ok(deploy0409().includes(stale.title) && deploy0409().includes(stale.action.label), 'DEPLOY.md: คนกด deploy ต้องรู้จักอาการที่สองของทางแก้ใบ');
  /* กฎเทียบของการส่งซ้ำ (M1) ถูกเขียนไว้ทั้งสองฉบับ */
  for (const [place, text] of [['"แผนและ server"', pr5Part('### แผนและ server')], ['§8F', hist8f()]]) {
    assert.match(text, /รายตำแหน่ง/, `${place}: การเขียนรอบนี้เทียบรายตำแหน่ง`);
    assert.match(text, /มีแถวที่ใบถืออยู่ตอนนี้ซึ่งเลขว่าง/, `${place}: การส่งซ้ำตัดสินจากแถวที่ใบถืออยู่`);
  }
  /* ② ข้อพลิกสถานะอยู่ระหว่างเกณฑ์หลังรันกับ ready ในทั้งสามฉบับ */
  const verify = MIGRATION.match(/--\s+เกณฑ์หลังรันทุกรอบ: ([^\n]+)/)[1].trim();
  for (const [place, text] of [['"ลำดับ deploy ของงวด PR-5"', pr5Part('### ลำดับ deploy ของงวด PR-5')], ['§9.5', hist95()], ['DEPLOY.md', deploy0409()]]) {
    const at = [text.indexOf(`\`${verify}\``), text.indexOf('พลิกสถานะในเอกสาร'), text.indexOf('PR → ready → merge')];
    assert.ok(at.every((index) => index >= 0), `${place}: ต้องมีเกณฑ์หลังรัน · ข้อ "พลิกสถานะในเอกสาร" · "PR → ready → merge" — เจอ ${at}`);
    const flip = text.slice(text.indexOf('**พลิกสถานะในเอกสาร'), at[2]);
    assert.ok(flip.length > 0, `${place}: ข้อพลิกสถานะต้องเป็นข้อของมันเอง (ตัวหนา) อยู่ก่อน "PR → ready → merge"`);
    assert.ok(text.indexOf(`\`${verify}\``) < text.indexOf('**พลิกสถานะในเอกสาร'), `${place}: ข้อพลิกสถานะอยู่หลังแถวตรวจหลังรัน`);
    assert.match(flip, /ก่อนกด ready/, place);
    assert.match(flip, /AGENTS\.md/, `${place}: ข้อพลิกสถานะต้องบอกให้ถอดวรรคของ AGENTS.md ด้วย`);
    assert.match(flip, /CI ของ PR/, `${place}: ต้องบอกว่ารอ CI ของ PR อีกรอบ (เวลานับในช่วงหยุดคีย์)`);
    assert.match(flip, /นับอยู่ใน/, place);
  }
  assert.match(pr5Part('### ลำดับ deploy ของงวด PR-5'), /\*\*ทั้งเก้าที่\*\*/, 'ฉบับเต็มบอกจำนวนที่ที่ต้องแก้ (เท่ากับจำนวนที่ที่เทสต์ "รันแล้วหรือยัง" อ่าน)');
  /* หัวไฟล์: วันที่ "ตรวจกับโค้ดเมื่อ" ไม่เก่ากว่าวันที่ของงวดล่าสุดที่หัวไฟล์เองพูดถึง */
  const headDate = qtHead().match(/ตรวจกับโค้ดเมื่อ (\d{4}-\d{2}-\d{2})/)?.[1];
  const sectionDate = pr5().match(/ตรวจกับโค้ด (\d{4}-\d{2}-\d{2})/)?.[1];
  assert.ok(headDate && sectionDate, 'หัวไฟล์และบรรทัดสถานะของงวด PR-5 ต้องมีวันที่ตรวจกับโค้ด');
  assert.ok(headDate >= sectionDate, `หัว qt-pack-column.md ตรวจกับโค้ดเมื่อ ${headDate} — เก่ากว่าของงวด PR-5 (${sectionDate})`);
});
