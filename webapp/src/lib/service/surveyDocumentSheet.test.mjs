// ── จอใบประเมิน × เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU · PR-3 · สเปก §4 · §6 · §7 · §8) — ยามอ่านซอร์สจอ ──────────
//
// ⭐ ข้อความไทย · ปุ่มไหนขึ้น/จาง · ลิงก์ไหนมี อยู่ในตัวตัดสินที่มีเทสต์ของมันเอง (`surveyDocumentView.test.mjs` ·
//   `surveyControlDocument.test.mjs` · `surveySendClose.test.mjs`) · เทสต์ชุดนี้รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้)
//   ⇒ ตรึงเฉพาะ **การต่อสาย** ที่พังเงียบได้และไม่มีตัวตรวจไหนเห็น:
//     · POST เอกสารที่ถูกยิงซ้ำเอง / ถูกยิงโดยไม่ผ่านกล่องยืนยัน = เลข SU ถาวรที่ไม่มีใครสั่ง
//     · `seenWarnings` ที่ส่งเสมอ = แท็บที่ไม่ได้ประกาศว่าจะออกเอกสาร ออกเอกสารได้
//     · กล่องยืนยันที่อ่านเนื้อจากใบสด = กล่องว่างในจังหวะที่ต้องบอกเหตุที่ถูกตีกลับ
//     · การ์ดที่คิดกติกาเอง / ยิง API เอง / วาดลิงก์ของ Rev เก่า
// 🔑 ท้ายไฟล์มีเทสต์ "สัญญา" หนึ่งชุด: **รูปของก้อนที่หน้าเขียนลง `docLocal`** ต้องเป็นรูปที่ตัวตัดสินอ่าน
//   (เปลี่ยนชื่อคีย์ฝั่งใดฝั่งหนึ่ง = ส่วนเอกสารเงียบ ไม่มี error)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyControlView } from './surveyControl.js';
import { surveyFilesSignature, surveyRecheckToast } from './surveyDocumentView.js';
import { surveySendImageRefusal } from './surveySendClose.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const between = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start !== -1, `หา "${from}" ไม่เจอ`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end !== -1, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return src.slice(start, end);
};
const count = (src, needle) => src.split(needle).length - 1;

const PAGE_RAW = read('../../app/service/surveys/[id]/page.js');
const PAGE = code(PAGE_RAW);
const CARD = code(read('../../components/service/SurveyControlCard.js'));
const ZONE = code(read('../../components/service/SurveyZonePage.js'));
const PANEL = code(read('../../components/ui/DocumentControlPanel.js'));
const CARD_CSS = css('../../components/service/SurveyControlCard.module.css');
const PANEL_CSS = css('../../components/ui/DocumentControlPanel.module.css');

/* ── หน้า → ตัวตัดสิน ──────────────────────────────────────────────────────────────── */

test('หน้าส่ง `document` ของ GET กับ `docLocal` ให้ `surveyControlView` · ลายเซ็นไฟล์คิดจากก้อนเดียวกับที่ส่งให้ตัวตัดสิน', () => {
  const call = between(PAGE, 'const view = useMemo(() => surveyControlView({', '  const canDecide =');
  assert.match(call, /\n {4}document: data\?\.document \?\? null,\n {4}documentLocal: docLocal,/);
  assert.match(call, /\n {4}filesByZone,\n/, 'ไฟล์ชุดสดก้อนเดียวกับ `liveSig`');
  assert.match(call, /\}\), \[data, zones, filesByZone, [^\]]*\bdocLocal\b[^\]]*\]\);/,
    'ของที่จอจำไว้เปลี่ยน ตัวตัดสินต้องคิดใหม่ (ไม่อยู่ใน deps = ส่วนเอกสารค้างค่าเก่า)');
  /* กล่อง "ส่งผลรอบล่าสุดถูกตีกลับ" เทียบ `sendRefused.sig` กับลายเซ็นของ `filesByZone` ที่ตัวตัดสินได้รับ — คนละก้อน = กล่องไม่มีวันขึ้น */
  assert.match(PAGE, /const liveSig = useMemo\(\(\) => surveyFilesSignature\(filesByZone\), \[filesByZone\]\);/);
  assert.match(PAGE, /const baseSig = useMemo\(\(\) => surveyFilesSignature\(data\?\.filesByZone\), \[data\]\);/);
  assert.match(PAGE, /const \[filesByZone, reportFiles\] = useLiveZoneFiles\(data\?\.filesByZone\);/);
});

test('🔴 หน้าไม่ประกอบที่อยู่เอกสารเอง ไม่ถือกติกาของเอกสาร และไม่ลากโมดูลฝั่ง server เข้า bundle', () => {
  assert.doesNotMatch(PAGE_RAW, /\/document\?/, 'ลิงก์เปิด/ดาวน์โหลดมาจาก `surveyDocumentHref` ในตัวตัดสินที่เดียว');
  assert.doesNotMatch(PAGE, /version=|download=1|draft=1/);
  assert.doesNotMatch(PAGE, /surveyReport(State|Rows|Inputs|Issue|Paper)|pdfInspect/,
    '`surveyReportState` ลาก node:crypto — จออ่านได้แค่ตัวตัดสิน (`surveyDocumentView`)');
  /* "กดซ้ำไปก็ไม่ผ่าน" ตัดสินที่ตัวตัดสินตัวเดียว (`retry: true` ของ server ชนะรหัส) — หน้าไม่ถือรายการรหัสเอง */
  assert.match(PAGE, /surveyIssueErrorSticky\(prev\.issueError\)/);
  assert.match(PAGE, /surveyIssueErrorSticky\(prev\.sendFailed\)/);
  assert.doesNotMatch(PAGE, /SURVEY_ISSUE_STICKY_CODES|undecodable|paper_blocked|rpc_failed/);
  for (const src of [PAGE, CARD, ZONE]) assert.doesNotMatch(src, /AbortSignal\.timeout/);
});

/* ── POST เอกสาร ──────────────────────────────────────────────────────────────────── */

test('🔴 POST เอกสารมีเส้นเดียว · ไม่ลองใหม่เอง · ประกาศหลัง `recall` · เรียกจากสองที่เท่านั้น (ตามหลังส่งผลที่ออกเลขแล้ว · กล่องยืนยัน)', () => {
  assert.match(PAGE, /const postDocument = \(\) => apiJson\(`\/api\/service\/surveys\/\$\{id\}\/document`, \{\s*method: "POST", json: \{\}, fallbackError: "ออกเอกสารไม่สำเร็จ",\s*\}\);/);
  assert.equal(count(PAGE, '/document`'), 1, 'ที่อยู่ของ route เอกสารมีที่เดียวในหน้า');
  assert.doesNotMatch(PAGE, /retry: true/,
    '"ไม่ได้คำตอบ" ไม่ได้แปลว่า server ไม่ได้ทำ — ยิงซ้ำเอง = เสี่ยงออกเลขถาวรซ้อน (กติกา apiFetch ของ AGENTS.md)');
  assert.doesNotMatch(PAGE, /\bfetch\(|apiFetch\(/, 'จอเรียก API ผ่าน apiJson เท่านั้น');
  assert.equal(count(PAGE, 'postDocument()'), 2, 'ผู้เรียก: `finishPaper` กับ `issueDocument`');

  const recallAt = PAGE.indexOf('const recall = async');
  assert.ok(recallAt !== -1);
  for (const name of ['patchDocLocal', 'postDocument', 'finishPaper', 'afterSend', 'rememberSendRefusal', 'openIssueDialog', 'issueDocument', 'recheckDocument']) {
    const at = PAGE.indexOf(`const ${name} = `);
    assert.ok(at !== -1, `ไม่มี ${name}`);
    assert.ok(at > recallAt, `${name} ต้องประกาศหลัง recall — ช่วง send→recall ถูกตรึงว่าไม่มี toast โทน error`);
    assert.equal(count(PAGE, `const ${name} = `), 1);
  }
  const send = between(PAGE, 'const send = async', 'const recall = async');
  assert.doesNotMatch(send, /postDocument|\/document/, 'ส่งผลไม่ยิง POST เอกสารเอง — route ส่งผลเป็นคนออกเลข');
  assert.match(send, /setSending\(false\);\s*setToast\(surveySendDoneToast\(res, \{ expectedDocument: view\.send\.issuesDocument \}\)\);\s*afterSend\(res, seen\);\s*await load\(\{ background: true \}\);/);
});

test('หลังส่งผล: `failed` = เก็บเหตุ ไม่ยิง POST ตาม · `issued` = เก็บข้อที่ยังไม่ได้อ่าน แล้วจัดทำไฟล์ต่อโดยไม่ await · ส่งสำเร็จ = การตีกลับรอบก่อนหมดความหมาย', () => {
  const after = between(PAGE, 'const afterSend = ', 'const rememberSendRefusal = ');
  const failedAt = after.indexOf('if (report?.state === "failed") {');
  const issuedAt = after.indexOf('if (report?.state === "issued") {');
  assert.ok(failedAt !== -1 && issuedAt > failedAt);
  const failed = after.slice(failedAt, issuedAt);
  assert.doesNotMatch(failed, /finishPaper|postDocument/,
    '🔴 POST ตามหลังการส่งที่ออกเลขไม่สำเร็จ = ออกเลขใหม่ + แจ้งผู้ขอ โดยไม่ผ่านกล่องยืนยัน');
  assert.match(failed, /sendFailed: \{ code: report\.code \?\? null, reason: report\.reason \?\? null, retry: report\.retry \?\? null \},/,
    'ต้องเก็บ `retry` ด้วย — ตัวตัดสินใช้ตัดสินว่าปุ่มออกเอกสารกดซ้ำได้ไหม');
  assert.match(failed, /\bround,/);
  assert.match(failed, /return;\s*\}\s*$/);

  const issued = after.slice(issuedAt);
  assert.match(issued, /printed: surveySendUnseenWarnings\(report\.warnings, seen\),/,
    'ข้อที่ระบบพิมพ์ลงเอกสาร ลบชุดที่โมดัลกางให้อ่านแล้ว');
  assert.match(issued, /void finishPaper\(round, report\.docNo\);/);
  assert.equal(count(PAGE, 'finishPaper('), 1, 'เรียกจากสาขา `issued` ที่เดียว');
  assert.doesNotMatch(PAGE, /await finishPaper\(/, 'POST นี้วิ่งได้ ~270 วิ และ `sendBusy` ล็อกทั้งการ์ด');
  assert.match(after, /const round = res\?\.request\?\.answeredAt \?\? null;/, 'รอบ = เวลาตอบที่ route คืนมา (GET ยังไม่ตามมา)');
  assert.equal(count(after, 'sendRefused: null'), 2);
  assert.match(after, /setDocLocal\(null\);\s*\};\s*$/, 'สวิตช์ปิด/ไม่มีผลเอกสาร = ไม่มีอะไรต้องจำ');

  const paper = between(PAGE, 'const finishPaper = async', 'const afterSend = ');
  assert.match(paper, /patchDocLocal\(round, \{ paper: \{ busy: true, reason: null \} \}\);/);
  assert.match(paper, /reason = out\?\.report\?\.reason \?\? null;/);
  assert.match(paper, /catch \(e\) \{\s*reason = e\.message/, 'POST ตามหลังล้ม = บอกเหตุ ไม่เงียบ (ดาวน์โหลดยังใช้ได้ — GET จัดทำไฟล์เอง)');
  assert.match(paper, /patchDocLocal\(round, \{ paper: \{ busy: false, reason \} \}\);\s*if \(reason\) setToast\(surveyIssueDoneToast\(\{ docNo, reason \}\)\);\s*void load\(\{ background: true \}\);/);
});

test('ของที่จอจำไว้ผูกกับรอบ: คำตอบที่มาช้าของรอบเก่าไม่ทับรอบใหม่ · รอบเปลี่ยน = ล้าง (เว้นการตีกลับของการส่ง) · ชุดไฟล์เปลี่ยน = ล้างข้อที่กดซ้ำได้', () => {
  const patch = between(PAGE, 'const patchDocLocal = ', 'const postDocument = ');
  assert.match(patch, /if \(prev\?\.round && round && Date\.parse\(round\) < Date\.parse\(prev\.round\)\) return prev;/);
  assert.match(patch, /\.\.\.\(prev && sameInstant\(prev\.round, round\) \? prev : DOC_LOCAL_ROUND\),\s*sendRefused: prev\?\.sendRefused \?\? null,\s*round,\s*\.\.\.patch,/);
  assert.match(PAGE, /const sameInstant = \(a, b\) => \{[\s\S]{0,160}Date\.parse\(a\)[\s\S]{0,80}Date\.parse\(b\)/,
    'เทียบเป็นจุดเวลา ไม่เทียบสตริง (`+00:00` กับ `Z`)');
  assert.match(PAGE, /const answeredAt = data\?\.request\?\.answeredAt \?\? null;\s*useEffect\(\(\) => \{\s*setDocLocal\(\(prev\) => \{\s*if \(!prev\?\.round \|\| sameInstant\(prev\.round, answeredAt\)\) return prev;\s*return prev\.sendRefused \? \{ \.\.\.DOC_LOCAL_ROUND, round: null, sendRefused: prev\.sendRefused \} : null;\s*\}\);\s*\}, \[answeredAt\]\);/);
  assert.match(PAGE, /if \(sigSeen\.current === liveSig\) return;\s*sigSeen\.current = liveSig;/);
  assert.match(PAGE, /const DOC_LOCAL_ROUND = Object\.freeze\(\{ sendFailed: null, issueError: null, paper: null, printed: \[\] \}\);/);
});

test('🐞 ชุดไฟล์เปลี่ยนระหว่างที่ server ยังตอบ "กำลังออก": `sendFailed` ต้องอยู่ต่อ — ล้างได้เฉพาะตอน server ตอบ "ยังไม่มีเอกสาร" เอง', () => {
  /* หน้า: ตัวล้างของลายเซ็นไฟล์ถามสถานะเอกสาร **ของ server** (ไม่ใช่ของตัวตัดสิน ซึ่งเป็น `missing` อยู่แล้วเพราะ `sendFailed` เอง) */
  const effect = between(PAGE, 'const sigSeen = useRef(liveSig);', 'useEffect(() => {\n    if (!view.document.poll)');
  assert.match(PAGE, /const docServerState = data\?\.document\?\.state \?\? null;\s*const sigSeen = useRef\(liveSig\);/);
  assert.match(effect, /const sendFailed = prev\.sendFailed && \(docServerState !== "missing" \|\| surveyIssueErrorSticky\(prev\.sendFailed\)\)\s*\? prev\.sendFailed : null;/,
    'ล้างเมื่อ server ยังตอบ "กำลังออก" = ป้าย "กำลังออก" + ปุ่ม "ออกเอกสาร" จาง + อ่านใบซ้ำทุก 15 วิ ทั้งที่ไม่มีอะไรกำลังออก');
  assert.match(effect, /const issueError = prev\.issueError && surveyIssueErrorSticky\(prev\.issueError\) \? prev\.issueError : null;/,
    '`issueError` ไม่เกี่ยวกับนาฬิกา 180 วิ — ล้างตามเดิม');
  assert.match(effect, /\}, \[liveSig, docServerState\]\);/, 'effect อ่านสถานะของ server ชุดล่าสุด (ไม่ใช่ค่าที่ปิดไว้ตอน mount)');
  assert.doesNotMatch(effect, /view\.document\.state/, 'สถานะของตัวตัดสินหัก `sendFailed` แล้ว — ใช้ตัดสินว่าจะทิ้ง `sendFailed` ไม่ได้');

  /* ตัวตัดสิน: ของชิ้นเดียวที่กั้นระหว่าง "ยังไม่ออก + ปุ่มกดได้" กับ "กำลังออก + ปุ่มจาง + อ่านซ้ำทุก 15 วิ" คือ `sendFailed` */
  const document = { ...HEAD_DOC, state: 'issuing', issue: null };
  const sendFailed = { code: 'images_failed', reason: 'ดึงรูปไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true };
  const kept = sheet({ document, documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, sendFailed } });
  assert.equal(kept.document.badge.label, 'ยังไม่ออก');
  assert.equal(kept.document.status.text, sendFailed.reason);
  assert.equal(kept.document.issue.allowed, true);
  assert.equal(kept.document.poll, false);
  const dropped = sheet({ document, documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED } });
  assert.equal(dropped.document.badge.label, 'กำลังออก');
  assert.equal(dropped.document.issue.allowed, false);
  assert.equal(dropped.document.poll, true);
  /* server ตอบ "ยังไม่มีเอกสาร" เองแล้ว = ทิ้ง `sendFailed` ได้: สถานะไม่ถอยไปเป็น "กำลังออก" และเหตุชุดสดชนะเหตุที่จำไว้อยู่แล้ว */
  const missing = { ...HEAD_DOC, state: 'missing', issue: { blockers: [{ kind: 'system', text: 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ' }], warnings: [], unknown: false } };
  const fresh = sheet({ document: missing, documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, sendFailed } });
  assert.deepEqual(fresh.document.status.items, ['อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ']);
  assert.equal(sheet({ document: missing, documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED } }).document.state, 'missing');
});

/* ── กล่องยืนยัน "ออกเอกสาร" ─────────────────────────────────────────────────────────── */

test('⭐ กล่องยืนยันออกเอกสาร: เนื้อคือชุดที่คัดลอกตอนเปิด · ปุ่มเดินตามใบสด · ออกไม่ได้แล้ว = ปุ่มเดียว "ปิด" พร้อมสถานะล่าสุด', () => {
  const open = between(PAGE, 'const openIssueDialog = ', 'const issueDocument = ');
  assert.match(open, /const confirm = view\.document\.issue\?\.confirm;\s*if \(!confirm\) return;\s*setIssueDialog\(\{ \.\.\.confirm, warnings: textLines\(data\?\.document\?\.issue\?\.warnings\) \}\);/);

  const at = PAGE.indexOf('open={!!issueDialog}');
  assert.ok(at !== -1);
  const dialog = PAGE.slice(PAGE.lastIndexOf('<ConfirmDialog', at), PAGE.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /title=\{issueDialog\?\.title\}/);
  assert.match(dialog, /message=\{issueAllowed \? issueDialog\?\.message : issueBlockedLead\}/);
  assert.match(dialog, /detail=\{issueAllowed \? issueDialog\?\.detail : issueBlockedDetail\}/);
  assert.match(dialog, /confirmLabel=\{issueAllowed \? issueDialog\?\.confirmLabel : "ปิด"\}/);
  assert.match(dialog, /busyLabel=\{issueDialog\?\.busyLabel\}/);
  assert.match(dialog, /hideCancel=\{!issueAllowed\}/);
  assert.match(dialog, /onConfirm=\{issueAllowed \? issueDocument : undefined\}/,
    'ปุ่มที่เขียนว่า "ออกเอกสาร" แต่กดแล้วไม่ออก คือปุ่มที่โกหก');
  assert.match(dialog, /\{issueAllowed && issueDialog \? \(/);
  assert.match(dialog, /<p className=\{styles\.effectsTitle\}>กดแล้วเกิดขึ้นทันที<\/p>/);
  assert.match(dialog, /issueDialog\.effects\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)/);
  assert.doesNotMatch(dialog, /view\.document\.issue|\.confirm\b/,
    '🐞 ใบสดไม่มีเนื้อกล่องแล้วในจังหวะที่กล่องต้องบอกเหตุ (ผลถูกดึงกลับ · คำตอบเปลี่ยน) — อ่านจาก `issueDialog` เท่านั้น');
  assert.doesNotMatch(dialog, /closeOnSuccess/, 'หน้าเป็นคนปิดกล่องเอง — ล้มแล้วกล่องต้องยังอยู่');
  /* ระหว่างที่ POST ยังวิ่ง กล่องคงเนื้อเดิม (ใบที่อ่านใหม่เบื้องหลังเปลี่ยนสถานะไปแล้วก็ตาม) — จบแล้วค่อยเดินตามใบสด */
  assert.match(PAGE, /const issueAllowed = issueBusy \|\| view\.document\.issue\?\.allowed === true;/);
  assert.match(dialog, /busy=\{issueBusy\}/);
  assert.match(dialog, /onClose=\{\(\) => !issueBusy && setIssueDialog\(null\)\}/);
  assert.match(PAGE, /onIssueDocument=\{openIssueDialog\}/);
});

test('🐞 กล่องยืนยันที่ออกไม่ได้แล้ว: ป้ายของส่วนเอกสารนำเสมอ · ข้อความของกล่องสถานะเป็นบรรทัดรอง เว้นแต่มันคือประโยคที่กล่องแดงพิมพ์อยู่', () => {
  /* หน้า: บรรทัดนำ = ป้าย · บรรทัดรอง = ข้อความของกล่องสถานะ ที่ไม่ใช่ประโยคที่เพิ่งถูกโยนกลับมา (`docLocal.issueError.message`) */
  assert.match(PAGE, /const issueBlockedLead = view\.document\.badge\.label\s*\? `สถานะเอกสารตอนนี้: \$\{view\.document\.badge\.label\}` : "ออกเอกสารไม่ได้ตอนนี้";/);
  assert.match(PAGE, /const issueThrownText = typeof docLocal\?\.issueError\?\.message === "string" \? docLocal\.issueError\.message\.trim\(\) : "";/);
  /* 🐞 UAT PR-3 (S23 · S37): กล่องที่เหลือปุ่ม "ปิด" ต้องบอกทางออกด้วย — บรรทัดทางออกของกล่องสถานะ (`status.foot`) ตามมาเสมอ เป็นบรรทัดใหม่ */
  assert.match(PAGE, /const issueStatusText = view\.document\.status\?\.text \|\| "";\s*const issueBlockedDetail = \[\s*issueStatusText && issueStatusText !== issueThrownText \? issueStatusText : null,\s*view\.document\.status\?\.foot \|\| null,\s*\]\.filter\(Boolean\)\.join\("\\n"\) \|\| undefined;/);
  assert.doesNotMatch(PAGE, /issueBlockedText/, 'ข้อความของกล่องสถานะอย่างเดียวเป็นข้อความของกล่องยืนยันไม่ได้อีก');
  /* ประโยคที่กล่องแดงพิมพ์ = ข้อความที่ `issueDocument` เก็บลง `issueError` ในจังหวะเดียวกับที่โยน (ตัวเดียวกับที่หน้าใช้เทียบ) */
  const fn = between(PAGE, 'const issueDocument = async', 'const recheckDocument = async');
  assert.match(fn, /issueError: \{ code: e\.data\?\.code \?\? null, message: e\.message, retry: e\.data\?\.retry \?\? null \},\s*\}\);\s*throw e;/);

  /* ตัวตัดสิน ①: เหตุที่กดซ้ำไม่ผ่าน — ข้อความของกล่องสถานะ **คือ** ประโยคของ server ตัวเดียวกับที่ถูกโยน ⇒ พิมพ์เป็นข้อความของกล่องด้วย = ซ้ำสองครั้ง */
  const message = 'หน้ากระดาษล้น — ดึงผลกลับมาแก้';
  const missing = { ...HEAD_DOC, state: 'missing', issue: { blockers: [], warnings: [], unknown: false } };
  const refused = sheet({
    document: missing,
    documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, issueError: { code: 'paper_blocked', message: ` ${message} `, retry: false } },
  });
  assert.equal(refused.document.issue.allowed, false, 'กล่องเหลือปุ่ม "ปิด"');
  assert.equal(refused.document.status.text, message, 'ตัวตัดสินตัดช่องว่างหัวท้าย — หน้าเทียบกับ `message.trim()`');
  assert.equal(refused.document.badge.label, 'ยังไม่ออก');
  /* …และบรรทัดรองของกล่องยืนยันในกรณีนี้ = ทางออกอย่างเดียว (ประโยคของ server อยู่ในกล่องแดงที่เดียว ไม่ซ้ำ) */
  assert.equal(refused.document.status.foot, 'ดึงผลกลับมาแก้แล้วส่งใหม่ — ถ้าไม่มีอะไรให้แก้ หรือแก้แล้วยังออกไม่ได้ ให้แจ้งผู้ดูแลระบบ');
  assert.notEqual(refused.document.status.foot, refused.document.status.text);
  /* ตัวตัดสิน ②: อีกคนออกไปก่อน — กล่องสถานะพูดเรื่องไฟล์ ไม่มีคำว่าออกแล้ว ⇒ คำว่า "ออกแล้ว" ต้องมาจากป้าย */
  const issued = sheet({ document: { ...HEAD_DOC, state: 'issued', current: CURRENT } });
  assert.equal(issued.document.issue, null);
  assert.equal(issued.document.badge.label, 'ออกแล้ว');
  assert.doesNotMatch(issued.document.status.text, /ออกแล้ว/);
  /* ตัวตัดสิน ③: ถูกตีกลับเพราะมีเหตุชุดสด — ข้อความของกล่องสถานะไม่ใช่ประโยคที่ถูกโยน ⇒ ยังขึ้นเป็นบรรทัดรองได้ */
  const blocked = sheet({
    document: { ...missing, issue: { blockers: [{ kind: 'content', text: 'Studio 01 ยังไม่มีภาพผัง' }], warnings: [], unknown: false } },
    documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, issueError: { code: 'blocked', message: 'ออกเอกสารไม่ได้ — Studio 01 ยังไม่มีภาพผัง', retry: false } },
  });
  assert.equal(blocked.document.issue.allowed, false);
  assert.notEqual(blocked.document.status.text, 'ออกเอกสารไม่ได้ — Studio 01 ยังไม่มีภาพผัง');
});

test('กด "ออกเอกสาร": ล้ม = อ่านใบใหม่ก่อน ไม่ยิงซ้ำ · ใบมีฉบับแล้ว = ประโยคกลาง · ยังไม่มี = เก็บรหัส+retry แล้วโยนกลับให้กล่อง', () => {
  const fn = between(PAGE, 'const issueDocument = async', 'const recheckDocument = async');
  const catchAt = fn.indexOf('} catch (e) {');
  assert.ok(catchAt !== -1);
  const tried = fn.slice(0, catchAt);
  assert.match(tried, /out = await postDocument\(\);/);
  const tail = fn.slice(catchAt);
  const caught = tail.slice(0, tail.indexOf('throw e;') + 'throw e;'.length);
  assert.doesNotMatch(caught, /postDocument/, 'POST ไม่ถูกยิงซ้ำอย่างตาบอด — ใบที่เพิ่งอ่านเป็นคนบอกว่าเลขออกไปแล้วหรือยัง');
  assert.match(caught, /const fresh = await load\(\{ background: true \}\);\s*const current = fresh\?\.document\?\.current;\s*if \(current\?\.docNo && DOC_ISSUED_STATES\.includes\(fresh\.document\.state\)\) \{/);
  assert.match(caught, /setToast\(surveyIssueDoneToast\(\{ docNo: current\.docNo \}\)\);\s*return;/,
    'จอแยกไม่ออกว่าการกดครั้งไหนออกเลข ⇒ ไม่ส่ง `reused` (ไม่อ้างว่า "ไม่ได้ออกเลขใหม่" และไม่อ้างว่าแจ้งผู้ขอ)');
  assert.match(caught, /issueError: \{ code: e\.data\?\.code \?\? null, message: e\.message, retry: e\.data\?\.retry \?\? null \},\s*\}\);\s*throw e;/);
  const done = tail.slice(caught.length);
  assert.match(done, /setIssueDialog\(null\);/);
  assert.match(done, /paper: \{ busy: false, reason: report\.reason \?\? null \},/);
  assert.match(done, /printed: surveySendUnseenWarnings\(report\.warnings, acknowledged\),/);
  assert.match(done, /setToast\(surveyIssueDoneToast\(report\)\);\s*await load\(\{ background: true \}\);/);
  assert.match(fn, /const acknowledged = issueDialog\?\.warnings \|\| \[\];/);
  assert.match(fn, /setIssueBusy\(true\);\s*try \{/);
  assert.match(fn, /\} finally \{\s*setIssueBusy\(false\);\s*\}\s*\};/, 'ล้มหรือสำเร็จ ธงกำลังทำงานต้องดับ (ค้าง = กล่องปิดไม่ได้)');
  assert.match(PAGE, /const DOC_ISSUED_STATES = \["issued", "frozen", "ready"\];/);
  /* `load` คืนใบที่อ่านได้ (หรือ null เมื่ออ่านไม่สำเร็จ) — ทางเดียวที่ `issueDocument` รู้ผลโดยไม่ต้องรอจอวาดรอบใหม่ */
  const load = between(PAGE, 'const load = useCallback(async (opts) => {', '}, [id, startRun]);');
  assert.match(load, /setData\(body\);\s*return body;/);
  assert.match(load, /catch \(e\) \{[\s\S]*?return null;\s*\} finally \{/);
});

/* ── โมดัลส่งผล · ดึงผลกลับ ─────────────────────────────────────────────────────────── */

test('โมดัลส่งผลเปิดจากใบล่าสุดเสมอ · การตีกลับที่พกรายชื่อไฟล์อยู่ต่อบนการ์ด (ผูกกับลายเซ็นของชุดไฟล์)', () => {
  assert.match(PAGE, /onSend=\{\(\) => \{ setSending\(true\); load\(\{ background: true \}\); \}\}/,
    'อ่านใบใหม่ทุกครั้งที่เปิด ไม่มีเงื่อนไข — แท็บที่เปิดค้างข้ามการเปิดสวิตช์ต้องเห็นบรรทัดเอกสารก่อนกด');
  const at = PAGE.indexOf('title="ส่งผลประเมินให้ฝ่ายขาย"');
  const dialog = PAGE.slice(at, PAGE.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /onError=\{rememberSendRefusal\}/);
  const remember = between(PAGE, 'const rememberSendRefusal = ', 'const openIssueDialog = ');
  assert.match(remember, /if \(!surveySendRefusalKeeps\(e\?\.message\)\) return;/, 'เก็บเฉพาะการตีกลับที่ไม่มี GET ไหนวาดให้ได้');
  assert.match(remember, /sendRefused: \{ message: e\.message, sig: liveSig \},/);
});

test('ดึงผลกลับ: กล่องยืนยันกับ toast เอ่ยเอกสารที่ถูกแทนที่จากตัวตัดสิน/คำตอบของ route · 409 = อ่านใบใหม่', () => {
  const recall = between(PAGE, 'const recall = async', 'const patchDocLocal = ');
  assert.match(recall, /const res = await apiJson\(`\/api\/service\/surveys\/\$\{id\}\/recall`/);
  assert.match(recall, /setToast\(\{ kind: "success", msg: surveyRecallDoneText\(res\?\.supersededReport\) \}\);/);
  assert.match(recall, /setToast\(\{ kind: "error", msg: e\.message \}\);\s*if \(e\.status === 409\) await load\(\{ background: true \}\);/);
  const at = PAGE.indexOf('title="ดึงผลประเมินกลับมาแก้"');
  const dialog = PAGE.slice(at, PAGE.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /detail=\{view\.recallAction\.detail\}/,
    'บรรทัดใต้ปุ่มบนการ์ดถูกซ่อนที่จอ ≤1050 — กล่องยืนยันต้องพกเรื่องเอกสารเองทุกขนาดจอ');
  assert.doesNotMatch(PAGE, /ตอนส่งรอบใหม่ ระบบจะบอกส่วนต่างให้เขาเห็น/, 'ประโยคย้ายไปอยู่ที่ตัวตัดสินแล้ว (ที่เดียว)');
});

/* ── อ่านใบซ้ำ ────────────────────────────────────────────────────────────────────── */

/* `load` ของหน้า กับ effect ของนาฬิกา "กำลังออก" ตัดจากซอร์สมารันกับตัวแทนของ state/ref (ไม่มี React ไม่มีเครือข่าย)
   `apiJson` เป็นคิวที่เทสต์ตอบเอง · `poll.run(on)` = effect หนึ่งรอบ คืน `{ cb, delay }` ของนาฬิกาที่ตั้ง หรือ `null` เมื่อไม่ตั้ง */
function makeSheetLoad() {
  const body = between(PAGE, 'const load = useCallback(async (opts) => {', '}, [id, startRun]);')
    .replace('const load = useCallback(', '');
  const calls = [];
  const state = { data: null, loading: true, loadError: '', settled: 0 };
  const failedRuns = { current: 0 };
  let run = 0;
  const startRun = () => { run += 1; const mine = run; return () => mine === run; };
  const apiJson = (url, init) => new Promise((resolve, reject) => { calls.push({ url, init, resolve, reject }); });
  const load = new Function(
    'startRun', 'failedRuns', 'setLoading', 'setLoadError', 'setData', 'setLoadSettled', 'apiJson', 'id',
    `return (${body}});`,
  )(
    startRun, failedRuns,
    (v) => { state.loading = v; },
    (v) => { state.loadError = v; },
    (v) => { state.data = v; },
    (fn) => { state.settled = fn(state.settled); },
    apiJson, 's1',
  );
  const effect = between(PAGE, 'if (!view.document.poll) return undefined;', '}, [view.document.poll, loadSettled, load]);');
  const MAX = Number(/const DOC_POLL_MAX_FAILS = (\d+);/.exec(PAGE)?.[1]);
  const poll = (on) => {
    let timer = null;
    new Function('view', 'failedRuns', 'DOC_POLL_MAX_FAILS', 'load', 'setTimeout', 'clearTimeout', effect)(
      { document: { poll: on } }, failedRuns, MAX, load, (cb, delay) => { timer = { cb, delay }; return 1; }, () => {},
    );
    return timer;
  };
  return { load, state, calls, failedRuns, poll, MAX };
}

test('🐞 นาฬิกา "กำลังออก": อ่านใบพังติดกันครบเพดาน = เลิกตั้งรอบใหม่ (ไม่ยิงทุก 15 วิตลอดที่แท็บเปิดอยู่) · รอบที่ได้ใบพาเดินต่อเอง', { timeout: 5000 }, async () => {
  const a = makeSheetLoad();
  assert.equal(a.MAX, 8, '8 รอบ × 15 วินาที ≈ 2 นาที — เพดานเดียวกับหน้าคำร้อง');
  const issuing = { document: { state: 'issuing' } };
  const open = a.load();
  a.calls[0].resolve(issuing);
  assert.equal(await open, issuing);
  assert.deepEqual([a.state.data, a.failedRuns.current, a.state.settled], [issuing, 0, 1]);

  /* หนึ่งรอบของนาฬิกา: effect ตั้ง → ครบ 15 วินาที → อ่านใบเบื้องหลัง → เทสต์ตอบแทน server */
  const round = async (answer) => {
    const timer = a.poll(true);
    assert.ok(timer, 'ยังไม่ครบเพดาน — ต้องตั้งนาฬิกา');
    assert.equal(timer.delay, 15000);
    const run = timer.cb();
    answer(a.calls.at(-1));
    return run;
  };
  const fail = (call) => call.reject(Object.assign(new Error('โหลดใบประเมินไม่สำเร็จ'), { status: 500 }));

  // พังเกือบครบเพดาน แล้วได้ใบหนึ่งรอบ (ยังกำลังออก) = ตัวนับกลับเป็นศูนย์ — เน็ตสะดุดเป็นช่วง ๆ ไม่ทำให้เลิกตรวจ
  for (let i = 0; i < a.MAX - 1; i += 1) assert.equal(await round(fail), null);
  assert.equal(a.failedRuns.current, a.MAX - 1);
  assert.equal(a.state.loadError, '', 'รอบเบื้องหลังที่พังไม่พาหน้าไปกล่องแดง');
  assert.equal(a.state.data, issuing, 'ใบเดิมยังอยู่บนจอ');
  assert.equal(await round((call) => call.resolve(issuing)), issuing);
  assert.equal(a.failedRuns.current, 0);

  // พังทุกรอบ: ตั้งได้ครบเพดานแล้วหยุด — ไม่มีคำขอเพิ่มอีก
  const before = a.calls.length;
  for (let i = 0; i < a.MAX; i += 1) await round(fail);
  assert.equal(a.calls.length, before + a.MAX);
  assert.equal(a.poll(true), null, 'ครบเพดาน — ไม่ตั้งนาฬิกาอีก');
  assert.equal(a.calls.length, before + a.MAX);

  // การอ่านที่สำเร็จครั้งถัดไป (กลับมาที่แท็บ · กด "ตรวจอีกครั้ง") ล้างตัวนับ ⇒ นาฬิกากลับมาเดินเอง
  const manual = a.load({ background: true });
  a.calls.at(-1).resolve(issuing);
  await manual;
  assert.equal(a.failedRuns.current, 0);
  assert.ok(a.poll(true), 'ได้ใบแล้วยังกำลังออก — ตั้งนาฬิกาต่อ');
  assert.equal(a.poll(false), null, 'ออกจากสถานะกำลังออก = ไม่ตั้ง');

  // รอบที่ถูกแซงไม่นับ — ทั้งพังและสำเร็จ (ตัวนับเป็นของรอบล่าสุดเท่านั้น)
  const b = makeSheetLoad();
  const first = b.load({ background: true });
  const second = b.load({ background: true });
  b.calls[0].reject(new Error('ช้าแล้วพัง'));
  assert.equal(await first, null);
  assert.equal(b.failedRuns.current, 0, 'รอบที่ถูกแซงพัง ไม่นับ');
  b.calls[1].reject(new Error('พัง'));
  await second;
  assert.equal(b.failedRuns.current, 1);
  // ตำแหน่งในซอร์ส: ล้างตัวนับหลังเช็กรอบล่าสุด · เพดานอ่านตัวนับ ไม่ใช่นาฬิกา
  const load = between(PAGE, 'const load = useCallback(async (opts) => {', '}, [id, startRun]);');
  assert.ok(load.indexOf('if (!isLatest()) return body;') < load.indexOf('failedRuns.current = 0;'));
  assert.match(load, /catch \(e\) \{\s*if \(isLatest\(\)\) failedRuns\.current \+= 1;/);
  assert.match(PAGE, /const failedRuns = useRef\(0\);/);
  assert.ok(PAGE.indexOf('const failedRuns = useRef(0);') < PAGE.indexOf('const load = useCallback('));
});

test('นาฬิกาสองตัว: "กำลังออก" อ่านใบใหม่ทุก 15 วิ (ตั้งใหม่หลังทุกรอบโหลด) · ชุดไฟล์เปลี่ยน = ตรวจเอกสารซ้ำหนึ่งรอบต่อหนึ่งลายเซ็น', () => {
  assert.match(PAGE, /useEffect\(\(\) => \{\s*if \(!view\.document\.poll\) return undefined;\s*if \(failedRuns\.current >= DOC_POLL_MAX_FAILS\) return undefined;\s*const t = setTimeout\(\(\) => load\(\{ background: true \}\), 15000\);\s*return \(\) => clearTimeout\(t\);\s*\}, \[view\.document\.poll, loadSettled, load\]\);/,
    '`loadSettled` นับรอบที่พังด้วย ⇒ โหลดเบื้องหลังพังครั้งเดียวไม่ทำให้หยุดตรวจ · เพดานรอบที่พังติดกันอยู่ก่อนการตั้งนาฬิกา');
  assert.match(PAGE, /const rechecked = useRef\(null\);\s*useEffect\(\(\) => \{\s*if \(!view\.document\.recheckOnFiles \|\| uploadsBusy !== 0 \|\| liveSig === baseSig \|\| rechecked\.current === liveSig\) \{\s*return undefined;\s*\}\s*const t = setTimeout\(\(\) => \{\s*rechecked\.current = liveSig;\s*load\(\{ background: true \}\);\s*\}, 1500\);\s*return \(\) => clearTimeout\(t\);\s*\}, \[view\.document\.recheckOnFiles, uploadsBusy, liveSig, baseSig, load\]\);/,
    'จำลายเซ็นที่ตรวจแล้ว — รอบนั้นพัง (ลายเซ็นยังต่าง) ก็ไม่วนยิง');
  assert.doesNotMatch(PAGE, /setInterval\(/);
});

test('🐞 "ตรวจอีกครั้ง" / "โหลดใหม่" ของเอกสารบอกผลของการกดเสมอ: อ่านไม่สำเร็จ = toast แดง · ตรวจแล้วคำตอบเดิม = toast บอกว่ายังติดกี่ข้อ', () => {
  /* หน้า: ตัวจัดการของตัวเอง (ไม่ใช่ `reloadSheet` ที่เงียบทั้งสองทาง) — ประกาศหลัง `issueDocument` ⇒ อยู่นอกช่วง send→recall ที่ห้ามมี toast แดง */
  const fn = between(PAGE, 'const recheckDocument = async', 'const addZone = async');
  assert.match(fn, /const before = JSON\.stringify\(data\?\.document \?\? null\);/, 'เทียบก้อน `document` ดิบของ GET — หน้าไม่ตีความเองว่าข้อไหนขวาง');
  /* ถ้อยคำของ toast เป็นของตัวตัดสิน (`surveyRecheckToast`) — หน้าส่งส่วนเอกสาร **ก่อนกด** (คำบนปุ่ม · จำนวนข้อ · อ่านสถานะไม่สำเร็จ) กับผลของการกด */
  assert.match(fn, /const section = view\.document;\s*try \{/, 'ส่วนเอกสารก่อนกด — จับไว้ก่อน `load` (หลังโหลด `view` เป็นของใบใหม่)');
  assert.match(fn, /const fresh = await load\(\{ background: true \}\);\s*if \(!fresh\) \{\s*setToast\(surveyRecheckToast\(section, "failed"\)\);/,
    '`load` คืน null เมื่ออ่านไม่สำเร็จ — โหลดเบื้องหลังไม่ตั้ง error เองบนจอ');
  assert.match(fn, /\} else if \(JSON\.stringify\(fresh\.document \?\? null\) === before\) \{\s*setToast\(surveyRecheckToast\(section, "same"\)\);\s*\}\s*\} finally \{/,
    'คำตอบเปลี่ยน = จอเปลี่ยนให้เห็นเอง ไม่ต้องมี toast');
  assert.doesNotMatch(fn, /ตรวจแล้ว|ไม่สำเร็จ — ลองใหม่|kind: "/, 'หน้าไม่แต่งประโยคของ toast เอง');
  assert.match(PAGE, /const recheckBusy = useRef\(false\);/);
  assert.match(fn, /if \(recheckBusy\.current\) return;\s*recheckBusy\.current = true;/, 'กดรัว = รอบเดียว');
  assert.match(fn, /\} finally \{\s*recheckBusy\.current = false;\s*\}\s*\};/, 'ล้มหรือสำเร็จ ธงต้องดับ (ค้าง = ปุ่มตรวจซ้ำตายทั้งหน้า)');
  assert.doesNotMatch(fn, /postDocument|\/document`|retry: true/, 'ตรวจซ้ำ = อ่านใบ (GET) เท่านั้น ไม่ยิง POST เอกสาร');
  assert.match(PAGE, /onReload=\{reloadSheet\}\s*onRecheckDocument=\{recheckDocument\}/, 'การ์ดได้สองตัว: อ่านใบใหม่เงียบ ๆ (ทะเบียนขนาด) · ตรวจเอกสารซ้ำแล้วบอกผล');

  /* การ์ด: กล่องสถานะของส่วนเอกสาร + ปุ่มในบรรทัดเหตุใต้ปุ่มส่งผล (เว้นเหตุอ่านทะเบียนขนาดไม่ขึ้น) ไปที่ตัวจัดการที่บอกผล */
  assert.match(CARD, /\n {2}onRecheckDocument,\n/);
  assert.match(CARD, /const recheckDocument = onRecheckDocument \|\| onReload;\s*const reasonReload = sendReason\?\.key === "registry-unread" \? onReload : recheckDocument;/);
  const reason = between(CARD, 'disabledReason: sendReason ? (', 'onClick: onSend,');
  assert.match(reason, /<JumpButton\s+target=\{sendReason\.target\}\s+onOpenZone=\{onOpenZone\}\s+onGoTab=\{onGoTab\}\s+onReload=\{reasonReload\}\s+className=\{styles\.reasonJump\}\s+\/>/);

  /* ตัวตัดสิน: ปุ่มสองที่ของเหตุเดียวกัน — ใบที่ติดเฉพาะเอกสาร บรรทัดเหตุมี `reload` "ตรวจอีกครั้ง" และ key ไม่ใช่ของทะเบียนขนาด ·
     กล่องสถานะมีรายการข้อ (จำนวนข้อของ toast) กับทางออกคำเดียวกัน */
  const blockers = ['Studio 01: ภาพผังเปิดไม่ได้', 'ลูกค้ายังไม่มีที่อยู่'];
  const stuck = sheet({ request: REQUEST, document: { ...HEAD_DOC, send: { blockers, warnings: [], unknown: false } } });
  assert.equal(stuck.send.allowed, false);
  assert.deepEqual(stuck.send.reason.target, { kind: 'reload', label: 'ตรวจอีกครั้ง' });
  assert.notEqual(stuck.send.reason.key, 'registry-unread');
  assert.deepEqual(stuck.document.status.items, blockers);
  assert.deepEqual(stuck.document.status.action, { kind: 'reload', label: 'ตรวจอีกครั้ง' });
  assert.equal(stuck.document.placement, 'fold', 'ก่อนส่งผล ส่วนเอกสารพับอยู่ที่จอ ≤1050 — ปุ่มในบรรทัดเหตุคือทางตรวจซ้ำเดียวที่ตาเห็น');
  /* อ่านทะเบียนขนาดไม่ขึ้น = เหตุของ `onReload` ตัวเดิม (ยามของมันอยู่ที่ packageSizeScreens.test.mjs) */
  const registry = sheet({ request: REQUEST, packageSizes: null, document: { ...HEAD_DOC, send: { blockers: [], warnings: [], unknown: false } } });
  assert.equal(registry.send.reason.key, 'registry-unread');
  assert.equal(registry.send.reason.target.kind, 'reload');
  /* อ่านสถานะเอกสารไม่สำเร็จ = ทางออก "โหลดใหม่" ไม่มีรายการข้อ ⇒ toast ใช้คำของปุ่ม แล้วบอกว่ายังอ่านไม่สำเร็จ
     (🐞 UAT PR-3 S29: เดิมได้ "ตรวจแล้ว — ผลยังเหมือนเดิม" ทั้งที่กล่องยังบอกว่าอ่านสถานะไม่สำเร็จ) */
  const unknown = sheet({ document: { access: 'none', unknown: true } });
  assert.deepEqual(unknown.document.status.action, { kind: 'reload', label: 'โหลดใหม่' });
  assert.deepEqual(unknown.document.status.items, []);
  /* สัญญา หน้า → ตัวตัดสิน: ก้อนที่หน้าส่ง (`view.document`) คือรูปที่ `surveyRecheckToast` อ่าน */
  assert.deepEqual(surveyRecheckToast(unknown.document, 'same'), { kind: 'warning', msg: 'โหลดใหม่แล้ว — ยังอ่านสถานะเอกสารไม่สำเร็จ' });
  assert.deepEqual(surveyRecheckToast(unknown.document, 'failed'), { kind: 'error', msg: 'โหลดใหม่ไม่สำเร็จ — ลองใหม่' });
  assert.deepEqual(surveyRecheckToast(stuck.document, 'same'), { kind: 'info', msg: 'ตรวจแล้ว — ยังติด 2 ข้อ' });
  assert.deepEqual(surveyRecheckToast(stuck.document, 'failed'), { kind: 'error', msg: 'ตรวจอีกครั้งไม่สำเร็จ — ลองใหม่' });
});

test('ออกเอกสารสำเร็จ: โฟกัสที่หลุดไป body ย้ายมาที่ส่วนเอกสาร (รอกล่องยืนยันปิดก่อน) · หน้าพื้นที่ได้บรรทัดเรื่องผูกรูปจากตัวตัดสิน', () => {
  assert.match(PAGE, /documentRef=\{docSectionRef\}/);
  assert.match(PAGE, /if \(was === "missing" && DOC_ISSUED_STATES\.includes\(view\.document\.state\)\) docFocusDue\.current = true;\s*if \(!docFocusDue\.current \|\| issueDialog\) return;\s*docFocusDue\.current = false;\s*if \(document\.activeElement === document\.body\) docSectionRef\.current\?\.focus\(\);/);
  assert.match(CARD, /<section\s+ref=\{documentRef\}\s+tabIndex=\{-1\}/);

  assert.match(PAGE, /spotsNote=\{canLinkSpots && view\.flags\.sent \? view\.document\.relinkNote : null\}/,
    'เฉพาะคนที่ผูกรูปได้บนใบที่ส่งผลแล้ว — ช่างและใบที่ยังไม่ส่งไม่มีบรรทัดนี้');
  assert.match(ZONE, /\n {2}spotsNote = null,\n/);
  const spots = between(ZONE, '<Section area="spots"', '<Section area="note"');
  const noteAt = spots.indexOf('{spotsNote ? <StatusNotice tone="info">{spotsNote}</StatusNotice> : null}');
  assert.ok(noteAt !== -1, 'หน้าพื้นที่วาดสตริงที่ได้มา ไม่แต่งประโยคเอง');
  assert.ok(noteAt < spots.indexOf('<AttachmentsPanel'), 'บนสุดของหัวข้อจุด — ก่อนแผงรูป');
  assert.doesNotMatch(ZONE, /relinkNote|เอกสาร SU|ออกเอกสาร/);
});

/* ── การ์ดจัดการผล ─────────────────────────────────────────────────────────────────── */

test('🔑 การ์ดวาดส่วนเอกสารจาก `view.document` อย่างเดียว — ไม่ยิง API ไม่ประกอบลิงก์ ไม่ถือสถานะของเอกสาร', () => {
  assert.doesNotMatch(CARD, /apiFetch|apiJson|\bfetch\(/);
  assert.doesNotMatch(CARD, /\/api\/|surveyDocumentHref|version=/);
  assert.doesNotMatch(CARD, /surveyDocumentView|surveyReport|localStorage|sessionStorage/);
  assert.doesNotMatch(CARD, /doc\.state|"missing"|"issuing"|"recalled"|"not_sent"|"stale"|issueAtSend|storeAllowed|\.access\b/,
    'สถานะ → ปุ่ม/ข้อความ ตัดสินที่ตัวตัดสินแล้ว · การ์ดอ่านแค่ผล');
  assert.match(CARD, /const doc = view\.document;/);
  assert.match(CARD, /const docShown = doc\.versions\.find\(\(v\) => v\.key === docVersion\) \|\| doc\.versions\[0\] \|\| null;/);
  assert.match(CARD, /const docStatus = docShown \? docShown\.status : doc\.status;/,
    '🐞 อ่านแต่ `doc.status` = สลับฉบับแล้วกล่องสถานะยังเป็นของฉบับลูกค้า (ใบที่ตรึงแล้วมีไฟล์ฉบับเดียว)');
  assert.match(CARD, /const \[docVersion, setDocVersion\] = useState\("customer"\);/);
  assert.match(CARD, /const documentSection = doc\.show \? \(/);
});

test('ส่วนเอกสาร: ลำดับตามสเปก §4.1 · สองฉบับ = แถบสองปุ่มที่เห็นทั้งคู่ · กล่องสถานะถือ id ที่ปุ่มจางชี้ไป', () => {
  const section = between(CARD, 'const documentSection = doc.show ? (', 'const fold = view.fold;');
  assert.match(section, /aria-label="เอกสารประเมินพื้นที่"/);
  const order = [
    'className={styles.secTitle}',
    '<Segmented',
    '{thaiText(docShown.note)}',
    'doc.rows.map(',
    '<div id={docStatusId}',
    'doc.printed.items.map(',
    '<DocumentActionGroup',
    '{doc.hint ?',
    '{doc.history ? (',
  ].map((needle) => {
    const at = section.indexOf(needle);
    assert.ok(at !== -1, `ส่วนเอกสารไม่มี ${needle}`);
    return at;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'หัว → แถบฉบับ → คำกำกับ → แถวข้อมูล → สถานะ → ข้อที่พิมพ์ → ปุ่ม → คำใบ้ → Rev');

  assert.match(section, /\{doc\.versions\.length > 1 \? \(\s*<Segmented\s+className=\{styles\.docSeg\}\s+ariaLabel="ฉบับของเอกสาร"\s+value=\{docShown\.key\}\s+onChange=\{setDocVersion\}/);
  assert.doesNotMatch(CARD, /<select|SelectField|Dropdown/, 'ตัวเลือกน้อย = ปุ่มที่มองเห็น ไม่ใช่ดรอปดาวน์');
  assert.match(section, /\{doc\.badge\.label \? <StatusBadge size="sm" tone=\{doc\.badge\.tone\}>\{doc\.badge\.label\}<\/StatusBadge> : null\}/,
    'ป้ายมีคำเสมอ ไม่พึ่งสีอย่างเดียว');

  /* กล่องสถานะ: id อยู่ที่ div ที่ห่อ (StatusNotice ไม่รับ id) · โทน/ข้อความ/รายการ/บรรทัดท้าย/ทางออก จากตัวตัดสิน */
  assert.match(section, /<div id=\{docStatusId\} className=\{styles\.docBlock\}>\s*<StatusNotice tone=\{docStatus\.tone\} className=\{styles\.compactNotice\}>/);
  assert.match(section, /docStatus\.items\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)/);
  assert.match(section, /\{docStatus\.foot \? /);
  assert.match(section, /<JumpButton target=\{docStatus\.action\} onReload=\{recheckDocument\} \/>/,
    '"ตรวจอีกครั้ง" / "โหลดใหม่" = อ่านใบใหม่ **แล้วบอกผล** (ตัวจัดการของหน้า) — ไม่ใช่ `onReload` ที่เงียบ');
  assert.doesNotMatch(section, /docStatus\.(items|action|foot)[^\n]*doc\.state/, 'ไม่ผูกรายการ/ทางออกกับสถานะ (สถานะดึงผลกลับก็มีรายการ)');
  assert.match(section, /describedBy=\{docStatus \? docStatusId : undefined\}/);
  assert.match(section, /label=\{docShown \? `เอกสาร\$\{docShown\.label\}` : "เอกสารประเมินพื้นที่"\}/,
    'ชื่อกลุ่มพกชื่อฉบับ — "ดูตัวอย่าง" เฉย ๆ บอกไม่ได้ว่าของฉบับไหน');
  assert.match(CARD, /const docStatusId = `\$\{uid\}-doc-status`;/);
});

test('ปุ่มของส่วนเอกสาร: ลิงก์และการจางมาจากตัวตัดสิน · "ออกเอกสาร" เปิดกล่องยืนยันของหน้า · ไม่มีสิทธิ์ = ไม่มีปุ่ม', () => {
  const actions = between(CARD, 'const docActions = [', '].filter(Boolean);');
  assert.match(actions, /docShown\?\.preview \? \{\s*id: "doc-preview",\s*kind: "open",\s*icon: Eye,\s*label: docShown\.preview\.label,\s*variant: "outline",\s*href: docShown\.preview\.href,\s*external: true,\s*disabled: docShown\.preview\.blocked,\s*\} : null,/);
  assert.match(actions, /docShown\?\.download \? \{\s*id: "doc-download",\s*kind: "download",\s*label: docShown\.download\.label,\s*variant: docShown\.download\.blocked \? "outline" : "filled",\s*href: docShown\.download\.href,\s*external: true,\s*disabled: docShown\.download\.blocked,\s*\} : null,/);
  assert.match(actions, /doc\.issue \? \{\s*id: "doc-issue",\s*kind: "print",\s*label: "ออกเอกสาร",\s*variant: "filled",\s*disabled: !doc\.issue\.allowed,\s*onClick: onIssueDocument,\s*\} : null,/,
    'กำลังออก/ติดเหตุ = วาดแล้วจาง (มีสิทธิ์อยู่) · ไม่มี `doc.issue` = ไม่มีสิทธิ์ = ไม่วาด');
  assert.doesNotMatch(actions, /href: `|href: "/, 'การ์ดไม่มีที่อยู่ของตัวเอง');
  assert.doesNotMatch(CARD, /\sdisabled=\{/, 'ปุ่มที่กดไม่ได้เป็น aria-disabled (ยัง Tab ถึง) ไม่ใช่ disabled');
});

test('🔴 รายการ Rev ก่อนหน้าไม่มีลิงก์สักแถว (มติเจ้าของ 01/10 ข้อ 5) · ปุ่มคลี่บอกสถานะกาง/หุบ', () => {
  const history = between(CARD, '{doc.history ? (', 'const fold = view.fold;');
  assert.doesNotMatch(history, /href|<a[\s>]|<Link|onClick=\{\(\) => on/, 'ฉบับที่ถูกแทนที่เปิดไม่ได้ (GET ตอบ 409) — มีไว้ให้รู้ว่าเคยออกอะไร');
  assert.match(history, /aria-expanded=\{historyOpen\}\s+aria-controls=\{docHistoryId\}/);
  assert.match(history, /\{historyOpen \? doc\.history\.hideLabel : doc\.history\.label\}/);
  assert.match(history, /<div id=\{docHistoryId\} className=\{styles\.docBlock\} hidden=\{!historyOpen\}>/);
  assert.match(history, /<ul className=\{styles\.gateList\}>/);
  /* 🐞 UAT PR-3: บรรทัดของแถว ("… · ดึงผลกลับมาแก้") เคยขึ้นบรรทัดใหม่กลางคำ ("ดึงผลก" / "ลับมาแก้") — ต้องผ่าน `thaiText` */
  assert.match(history, /<span className=\{styles\.gateBody\}>\s*<b className="num">\{row\.docNo\}<\/b>\s*<small>\{thaiText\(row\.line\)\}<\/small>/);
  assert.match(history, /\{doc\.history\.foot\}/);
});

test('ตำแหน่งของส่วนเอกสาร: ก่อนส่งผลอยู่ในส่วนรอง ต่อใต้ด่าน (มติเจ้าของ 08/10 ชุดสุดท้าย) · ส่งแล้วปักเหนือปุ่มคลี่ · เป็นตำแหน่งจริงใน DOM ทั้งคู่', () => {
  const footer = between(CARD, 'const footer = (', '  return (\n    <DocumentControlCard');
  const pinned = footer.indexOf('{doc.placement === "pinned" ? documentSection : null}');
  const disclosure = footer.indexOf('className={styles.disclosure}');
  const extra = footer.indexOf('className={styles.extra}');
  const gates = footer.indexOf('{gatesSection}');
  const fold = footer.indexOf('{doc.placement === "fold" ? documentSection : null}');
  const steps = footer.indexOf('{stepsSection}');
  const refs = footer.indexOf('{refsSection}');
  for (const at of [pinned, disclosure, extra, gates, fold, steps, refs]) assert.ok(at !== -1);
  assert.ok(pinned < disclosure && disclosure < extra, 'ปักไว้ = เหนือปุ่มคลี่ (เห็นเสมอทุกขนาดจอ)');
  assert.ok(extra < gates && gates < fold && fold < steps && steps < refs,
    'ในส่วนรอง: ด่าน → ส่วนเอกสาร → ขั้นตอน → เอกสารที่เกี่ยวข้อง — ลำดับเดียวกันทุกขนาดจอ (จอกว้างด่านอยู่ที่เดิมเหมือนก่อน PR-3)');
  assert.equal(count(footer, 'documentSection'), 2);
  assert.doesNotMatch(CARD_CSS, /\border\s*:/, 'ไม่สลับลำดับด้วย CSS — ลำดับ Tab ต้องตรงกับที่ตาเห็น');
  /* ส่วนเอกสารเป็น `.sec` ธรรมดา — ในส่วนรองได้เส้นคั่นจาก `.sec + .sec` เหมือนก้อนอื่น · ปักไว้ = ปิดท้ายด้วยเส้นของ `.docPinned` เอง */
  assert.match(CARD, /className=\{`\$\{styles\.sec\} \$\{doc\.placement === "pinned" \? styles\.docPinned : ""\}`\.trim\(\)\}/);
  assert.doesNotMatch(CARD, /styles\.doc\b/, 'คลาสที่ไม่มีในโมดูล CSS = `undefined` ในชื่อคลาส');
  /* กล่องเตือนของข้อความบนฉบับลูกค้าอยู่ในกล่องแจ้งของการ์ด (นอกส่วนที่พับ) — กางครบทุกข้อ แล้วปิดด้วยบรรทัด "แก้ได้ที่ไหน" */
  const notices = between(CARD, 'const noticeNodes = ', 'const sendReason = ');
  assert.match(notices, /\{notice\.items\?\.length \? \(/);
  assert.match(notices, /notice\.items\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)/);
  assert.ok(notices.indexOf('notice.items.map(') < notices.indexOf('{thaiText(notice.text)}'), '`text` เป็นบรรทัดปิดท้ายของรายการ');
  assert.doesNotMatch(notices, /slice\(|\.length > \d/, 'ไม่ตัดจำนวนข้อ — โมดัลเปิดไม่ได้ขณะด่านติด ข้อที่ถูกตัดคือข้อที่ไม่มีใครได้อ่าน');
});

/* ⭐ มติเจ้าของ 08/10 (ชุดสุดท้าย) — แทนรุ่น "จอกว้างพับสามก้อนท้ายทุกการ์ดที่มีส่วนเอกสาร" ของรอบแก้ UAT:
   · ราง (≥1200) ก่อนส่งผล: ไม่มีปุ่มคลี่ ด่านกางที่เดิมเหมือนก่อน PR-3 ส่วนเอกสารต่อใต้ด่าน (รางเลื่อนเองได้)
   · ส่งผลแล้ว (`fold.wide` · ทุกความกว้าง): ส่วนเอกสารอยู่บน · ด่าน · ขั้นตอน · เอกสารที่เกี่ยวข้อง พับหลังปุ่มคลี่ ปิดตั้งต้น
   · ไม่มีราง (1051–1199) ก่อนส่งผล (`fold.belowRail`): พับเหมือนแท็บเล็ต — "จอกว้าง" ของมติคือราง ซึ่งมีตั้งแต่ 1200
     (🐞 UAT: ช่วงนี้เคยได้กติกาของราง การ์ดสูง 974–1158px ดันตารางสรุป/รายการพื้นที่ตกจอ)
   · จอ ≤1050: เหมือนคำตอบเดิมของเจ้าของ (ข้อ 2) — ลำดับในส่วนที่พับเป็น ด่าน → ส่วนเอกสาร → ขั้นตอน → เอกสารที่เกี่ยวข้อง
   · การ์ดที่ไม่มีส่วนเอกสาร (ช่าง · คนดู) เหมือนเดิมทุก px */
test('ปุ่มคลี่ของส่วนรอง: ตัวเดียว คุมก้อนเดียว · ขึ้นเฉพาะที่ที่มีของพับ (จอ ≤1050 เสมอ · กว้างกว่านั้นตาม `fold.wide` กับ `fold.belowRail` + จอนี้มีรางไหม)', () => {
  const footer = between(CARD, 'const footer = (', '  return (\n    <DocumentControlCard');
  assert.match(CARD, /const fold = view\.fold;/, 'พับจอกว้างไหม · ปุ่มพูดว่าอะไร มาจากตัวตัดสิน — การ์ดไม่มีกติกาเอง');
  assert.doesNotMatch(CARD, /const foldWide|flags\.sent \? `|data-at=|styles\.rest\b/, 'ไม่เหลือกติกาพับ/ปุ่มคู่ของรุ่นก่อนในการ์ด');
  /* 🔑 การ์ดรู้อย่างเดียวว่าจอนี้มีรางไหม — เส้นเดียวกับที่หน้าใช้ย้ายการ์ดเข้าราง (`SURVEY_RAIL_QUERY` · ค่าตรึงใน surveyFieldView.test.mjs)
     ส่วน "พับไหม" เป็นสองธงของตัวตัดสิน · สูตรบรรทัดเดียว ไม่อ่านสถานะของใบ/ของเอกสารเอง */
  assert.match(CARD, /import \{ SURVEY_RAIL_QUERY \} from "@\/lib\/service\/surveyFieldView";/);
  assert.match(CARD, /import useMediaQuery from "@\/lib\/ui\/useMediaQuery";/);
  assert.match(PAGE, /const railWide = useMediaQuery\(SURVEY_RAIL_QUERY\);/, 'หน้ากับการ์ดอ่านเส้นเดียวกัน');
  assert.match(CARD, /const atRailWidth = useMediaQuery\(SURVEY_RAIL_QUERY\);/);
  assert.ok(CARD.indexOf('const atRailWidth = useMediaQuery(') < CARD.indexOf('if (!view) return null;'), 'hook ต้องถูกเรียกก่อนทางออกเร็ว (rules of hooks)');
  assert.match(CARD, /const fold = view\.fold;\s*const foldsOnWide = fold\.wide \|\| \(fold\.belowRail && !atRailWidth\);/);
  assert.equal(count(CARD, 'atRailWidth'), 2, 'ใช้ที่เดียว — ไม่มีชิ้นไหนของการ์ดเปลี่ยนตามรางนอกจากการพับ');
  assert.doesNotMatch(CARD, /1200|min-width|matchMedia/, 'เส้นจอของรางไม่ถูกเขียนซ้ำในการ์ด');
  assert.equal(count(footer, 'className={styles.disclosure}'), 1, 'ปุ่มเดียว — ทุกผังมีของพับก้อนเดียว อยู่ใต้ปุ่มทันที');
  assert.match(footer, /<button\s+type="button"\s+className=\{styles\.disclosure\}\s+data-wide=\{foldsOnWide \? "1" : undefined\}\s+aria-expanded=\{moreOpen\}\s+aria-controls=\{extraId\}\s+onClick=\{\(\) => setMoreOpen\(\(v\) => !v\)\}/,
    'สถานะกาง/หุบตัวเดียว · ชี้ไปที่ก้อนที่มันคุมจริง');
  assert.match(footer, /<div\s+className=\{styles\.extra\}\s+id=\{extraId\}\s+data-compact-hidden=\{moreOpen \? undefined : "1"\}\s+data-wide-hidden=\{foldsOnWide && !moreOpen \? "1" : undefined\}\s*>\s*\{gatesSection\}\s*\{doc\.placement === "fold" \? documentSection : null\}\s*\{stepsSection\}\s*\{refsSection\}\s*<\/div>/,
    'ก้อนที่ปุ่มคุม = ลูกตรงทั้งสี่ ไม่มีกล่องซ้อน (เส้นคั่น `.sec + .sec` ทำงานเอง)');
  assert.equal(count(footer, 'fold.wide'), 0, 'ปุ่มกับก้อนอ่านคำตอบเดียวกัน (`foldsOnWide`) — อ่านคนละตัวเมื่อไร ปุ่มขึ้นแต่ของไม่พับ');
  assert.match(CARD, /const \[moreOpen, setMoreOpen\] = useState\(false\);/, 'ปิดไว้ตั้งต้น');
  /* บรรทัดคำอธิบายใต้ปุ่มดึงกลับ (31–50px) ไม่วาดบนการ์ดที่มีส่วนเอกสาร (กระดาน S-1) — เรื่องเดียวกันอยู่ในกล่องยืนยันดึงกลับครบทุกขนาดจอ
     รวมเลขเอกสารที่จะถูกแทนที่ · การ์ดที่ไม่มีส่วนเอกสารยังได้บรรทัดนี้เหมือนเดิม */
  assert.match(footer, /\{recallAction\.show && recallAction\.allowed && !doc\.show\s*\? <p className=\{styles\.hint\}>\{recallAction\.hint\}<\/p> : null\}/);
  assert.match(PAGE, /detail=\{view\.recallAction\.detail\}/, 'กล่องยืนยันดึงกลับพกเรื่องเอกสารเอง');
  const sentReady = sheet({ document: { ...HEAD_DOC, state: 'ready', current: { ...CURRENT, ready: { customer: true, internal: true } } } });
  assert.equal(sentReady.document.show, true);
  assert.match(sentReady.recallAction.detail, /เอกสาร SU-26100001-0 จะถูกแทนที่ — ใช้ไม่ได้ทันที/, 'ของที่บรรทัดใต้ปุ่มเคยบอก อยู่ในกล่องยืนยันครบ');

  /* คำบนปุ่ม: ชื่อจากตัวตัดสินเรียงตามลำดับที่กางออกมา · การ์ดตัดได้แค่ชื่อของก้อนที่ตัวเองไม่ได้วาด (เอกสารที่เกี่ยวข้อง) */
  assert.match(CARD, /const foldParts = \[\s*fold\.labels\.gates,\s*fold\.labels\.document,\s*fold\.labels\.steps,\s*refsSection \? fold\.labels\.refs : null,\s*\]\.filter\(Boolean\);/);
  assert.doesNotMatch(CARD, /ขั้นตอน · เอกสาร|"เอกสารประเมิน"|" \(ผ่านครบ\)"/, 'ถ้อยคำของปุ่มคลี่อยู่ที่ตัวตัดสิน');
  /* ป้ายที่ยาวเกินบรรทัด (จอ 360 ก่อนส่งผล) ขึ้นบรรทัดใหม่ระหว่างชื่อเท่านั้น — ช่องว่างอยู่นอกชิ้นที่ห้ามตัด */
  assert.match(footer, /<span className=\{styles\.disclosureLabel\}>\s*\{foldParts\.map\(\(part, index\) => \(\s*<Fragment key=\{part\}>\s*\{index \? " " : null\}\s*<span className=\{styles\.disclosurePart\}>\{index < foldParts\.length - 1 \? `\$\{part\} ·` : part\}<\/span>\s*<\/Fragment>\s*\)\)\}\s*<\/span>/);
  assert.match(CARD_CSS, /\.disclosurePart \{\s*white-space: nowrap;\s*\}/);
  /* สัญญา การ์ด ↔ ตัวตัดสิน: รูปของ `view.fold` ที่การ์ดอ่าน (ค่าของแต่ละสถานะตรึงใน surveyControlDocument.test.mjs) */
  assert.deepEqual(Object.keys(sentReady.fold), ['wide', 'belowRail', 'labels']);
  assert.deepEqual(Object.keys(sentReady.fold.labels), ['gates', 'document', 'steps', 'refs']);

  /* CSS: ไม่มีเส้นจอใหม่ (ข้อนี้ตรึงอยู่ในเทสต์ CSS ข้างล่าง — เส้น 1200 ของรางเป็นของ JS การ์ดใส่ `data-wide` เอง)
     ⇒ กฎของจอกว้างคือกฎฐาน แล้วมีเดีย ≤1050 เปิดปุ่มให้ทุกการ์ด */
  const base = CARD_CSS.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  const narrowCss = [...CARD_CSS.matchAll(/@media \(max-width: 1050px\) \{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
  assert.match(base, /\.disclosure \{\s*display: none;/, 'จอกว้าง: ไม่มีปุ่ม (ไม่อยู่ในลำดับ Tab) — ก่อนส่งผลและการ์ดที่ไม่มีส่วนเอกสารกางทุกก้อน');
  assert.match(base, /\.disclosure\[data-wide\] \{\s*display: flex;\s*\}/, 'จอกว้าง: มีปุ่มเฉพาะการ์ดที่ตัวตัดสินสั่งพับ');
  assert.match(base, /\.extra\[data-wide-hidden\] \{\s*display: none;\s*\}/);
  assert.match(base, /\.disclosure\[data-wide\] \+ \.extra \{\s*margin-top: var\(--space-3\);\s*\}/);
  assert.doesNotMatch(base, /\.extra\[data-compact-hidden\]/, 'ธงของจอแคบไม่มีผลที่จอกว้าง — ไม่งั้นด่านของใบที่ยังไม่ส่งหายไปหลังปุ่มที่ไม่มีอยู่');
  assert.match(narrowCss, /\.disclosure \{\s*display: flex;\s*min-height: var\(--ctl-h-touch\);\s*\}/, 'จอ ≤1050: ทุกการ์ดมีปุ่ม');
  assert.match(narrowCss, /\.extra\[data-compact-hidden\] \{\s*display: none;\s*\}/);
  assert.doesNotMatch(CARD_CSS, /data-at|\.rest\b|data-after-doc/, 'ไม่เหลือปุ่มคู่/กล่องซ้อนของรุ่นก่อน');
  for (const name of ['disclosure', 'disclosureLabel', 'disclosurePart', 'chev', 'extra']) {
    assert.match(CARD, new RegExp(`styles\\.${name}\\b`));
    assert.match(CARD_CSS, new RegExp(`\\.${name}\\b`));
  }
});

/* 🐞 UAT PR-3 (S02 · S28 · S36): "ตรวจข้อความบนฉบับลูกค้าก่อนส่งผล" อยู่ใต้ปุ่ม "ส่งผลให้ฝ่ายขาย" ที่จอ 360 และ 1024 (จอกว้างอยู่เหนือปุ่ม) */
test('กล่องแจ้งของการ์ดขึ้นก่อนปุ่มระดับใบทุกขนาดจอ: การ์ดขอ `noticesFirst` · การ์ดกลางสลับเฉพาะการ์ดที่ขอ', () => {
  assert.match(CARD, /notices=\{noticeNodes\}\s+noticesFirst\s+primaryAction=\{primaryAction\}/);
  assert.match(PANEL, /\n {2}noticesFirst = false,\n/, 'ไม่ส่งมา = เหมือนเดิมทุกหน้าที่ใช้การ์ดนี้');
  assert.match(PANEL, /\{notices \? <div className=\{`\$\{styles\.notices\} \$\{noticesFirst \? styles\.noticesFirst : ""\}`\.trim\(\)\}>\{notices\}<\/div> : null\}/);
  /* ลำดับใน DOM ของการ์ดกลางคือ กล่องแจ้ง → ปุ่ม อยู่แล้ว ⇒ ให้ `order` เท่ากับของปุ่ม แล้ว DOM ตัดสิน (ลำดับ Tab ตรงกับที่ตาเห็น) */
  assert.ok(PANEL.indexOf('styles.notices}') < PANEL.indexOf('<div className={styles.actionStack}>'));
  const narrow = [...PANEL_CSS.matchAll(/@media \(max-width: 1050px\) \{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
  assert.match(narrow, /\.controlBody \.actionStack \{\s*order: -2;/);
  assert.match(narrow, /\.controlBody \.notices\.noticesFirst \{ order: -2; \}/);
  assert.equal(count(PANEL_CSS, '.noticesFirst'), 1, 'กฎเดียว ในมีเดียจอแคบ — จอกว้างไม่แตะ');
});

/* 🐞 UAT PR-3 (S03 · S09 · S15): เหตุของเอกสารต่อกันด้วย " | " ดิบ — กล่องเหตุใต้ปุ่มส่งผล · โมดัลที่เหลือปุ่ม "ปิด" · ใต้แถวด่าน */
test('เหตุหลายข้อวาดเป็นรายการจากตัวตัดสิน (`reason.lead` + `reason.items` · `gate.reasons`) — การ์ดและโมดัลไม่ผ่าประโยคเอง', () => {
  const reason = between(CARD, 'disabledReason: sendReason ? (', 'onClick: onSend,');
  assert.match(reason, /\{sendReason\.items\?\.length \? \(\s*<>\s*\{thaiText\(sendReason\.lead\)\}\s*<span className=\{`\$\{styles\.noticeList\} \$\{styles\.reasonItems\}`\} role="list">\s*\{sendReason\.items\.map\(\(line\) => <span key=\{line\} role="listitem">\{thaiText\(line\)\}<\/span>\)\}\s*<\/span>\s*<\/>\s*\) : thaiText\(sendReason\.text\)\}/);
  /* 🐞 จับได้ตอนถ่ายจอ: การ์ดกลางวาดเหตุของปุ่มใน `<p role="status">` — `ul`/`li`/`div` ข้างในคือ HTML ผิด (hydration error ทั้งหน้า)
     ⇒ ของที่การ์ดส่งเป็นเหตุของปุ่มต้องเป็น phrasing content ล้วน */
  assert.match(PANEL, /<p className=\{styles\.blockedReason\} id=\{reasonId\} role="status">\{action\.disabledReason\}<\/p>/);
  assert.doesNotMatch(reason, /<(ul|ol|li|div|p)[\s>]/, 'เหตุของปุ่มอยู่ใน <p> — ห้ามมี block element');
  assert.match(CARD_CSS, /\.reasonItems > span \{\s*display: list-item;\s*\}/, 'ข้อของรายการเป็น span — ต้องบอกเองว่าเป็นข้อ จุดหน้าข้อถึงจะขึ้น');
  const gateList = between(CARD, 'const gateFullList = (', 'const gapRow = ');
  assert.match(gateList, /\{!gate\.ok && gate\.reasons\?\.length > 1 \? \(\s*<ul className=\{`\$\{styles\.noticeList\} \$\{styles\.gateReasons\}`\}>\s*\{gate\.reasons\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)\}\s*<\/ul>\s*\) : !gate\.ok && gate\.reason\s*\? <small>\{thaiText\(gate\.reason\)\}<\/small>/);
  for (const src of [CARD, PAGE]) assert.doesNotMatch(src, /split\(\s*['"`] \| ['"`]\s*\)|split\(\/[^/]*\\\|/, 'ห้ามผ่าประโยคด้วย " | " ที่จอ — รายการมาจากตัวตัดสิน');

  /* 🐞 UAT PR-3 (S03 · S25 · S26 ที่ 1440×900 หลังมติเรื่องผัง): เดิมจอกว้างซ่อนรายการในกล่องเหตุ (รายการเดียวกันเคยกางอยู่ติดใต้ปุ่มในส่วนเอกสาร)
     · มติย้ายส่วนเอกสารไปใต้บล็อกด่าน ⇒ รายการตกขอบจอแรก กล่องเหตุเหลือแค่ "ติด 2 ข้อ" ⇒ **รายการกางในกล่องเหตุทุกขนาดจอ**
     (กล่องรายการได้ `display: grid` จาก `.noticeList` · ไม่มีกฎ `display` ของ `.reasonItems` เองที่ไหนเลย — ทั้งกฎฐานและในมีเดีย) */
  assert.doesNotMatch(CARD_CSS, /\.reasonItems \{/, 'กฎซ่อน/โชว์รายการตามขนาดจอ = เหตุหายจากจอแรกอีก');
  assert.doesNotMatch(CARD_CSS, /\.reasonItems[^{]*\{[^}]*display: none/);
  assert.match(CARD_CSS, /\.noticeList \{\s*display: grid;/, 'รายการเป็นกล่อง (ข้อละบรรทัด) ทุกขนาดจอ');
  /* ปุ่ม "ตรวจอีกครั้ง" ต่อท้ายรายการ = ขึ้นบรรทัดใหม่เอง ⇒ ชิดซ้ายแนวเดียวกับบรรทัดนำ (ช่องไฟของ `.reasonJump` มีไว้ตอนต่อท้ายข้อความ) */
  assert.match(CARD_CSS, /\.reasonItems \+ \.reasonJump \{\s*margin-inline-start: 0;\s*\}/);
  assert.ok(reason.indexOf('styles.reasonItems') < reason.indexOf('<JumpButton'), 'ปุ่มเป็นพี่น้องถัดจากรายการ — ตัวเลือก `+` ถึง');
  assert.match(CARD_CSS, /\.gateReasons \{[^}]*overflow-wrap: anywhere;/);

  /* โมดัลส่งผลที่เหลือปุ่ม "ปิด": บรรทัดนำของตัวตัดสินเป็นข้อความ รายการเป็นข้อ ๆ ข้างล่าง · ใบที่ล็อกไปแล้วไม่มีรายการ */
  assert.match(PAGE, /const sendBlockedItems = view\.send\.show && !view\.send\.allowed \? view\.send\.reason\?\.items \|\| \[\] : \[\];/);
  const at = PAGE.indexOf('title="ส่งผลประเมินให้ฝ่ายขาย"');
  const dialog = PAGE.slice(at, PAGE.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /: sendBlockedItems\.length \? view\.send\.reason\.lead\s*: view\.send\.reason\?\.detail \|\| view\.send\.reason\?\.text/);
  assert.match(dialog, /\) : sendBlockedItems\.length \? \(\s*<ul className=\{styles\.effectList\}>\s*\{sendBlockedItems\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)\}\s*<\/ul>\s*\) : null\}/);

  /* ตัวตัดสิน: ติดเฉพาะเอกสารสองข้อ = มีบรรทัดนำกับรายการ · แถวด่านมี `reasons` ชุดเดียวกัน */
  const blockers = ['Studio 01: ภาพผังเปิดไม่ได้', 'นัดประเมินไม่มีวันที่ประเมิน'];
  const stuck = sheet({ request: REQUEST, document: { ...HEAD_DOC, send: { blockers, warnings: [], unknown: false } } });
  assert.equal(stuck.send.reason.lead, 'ออกเอกสารไม่ได้ — ติด 2 ข้อ · ยังไม่ได้ส่งผล');
  assert.deepEqual(stuck.send.reason.items, blockers);
  assert.deepEqual(stuck.gates.find((g) => g.key === 'document').reasons, blockers);
  assert.doesNotMatch(stuck.send.reason.lead, / \| /);
});

/* 🐞 UAT PR-3: ทรงปกติของกล่องแจ้ง (13px · วงไอคอน 32px) เหลือคอลัมน์ข้อความ 224px ในราง 330px ⇒ กล่องคำเตือน 3–5 ข้อสูง 345–460px
   กล่องสถานะที่มีรายการสูง ~200px — ดันปุ่มส่งผลกับปุ่มของส่วนเอกสารพ้นรางที่ปักหมุด ⇒ ทรงกะทัดรัดของกระดาน S-1 */
test('กล่องแจ้งทรงกะทัดรัด: ทุกกล่องแจ้งของการ์ด (กล่องแจ้ง · กล่องของส่วนเอกสาร) ทรงเดียวกัน · โทนและ role ยังมาจากตัวกลาง', () => {
  const section = between(CARD, 'const documentSection = doc.show ? (', 'const fold = view.fold;');
  assert.equal(count(section, '<StatusNotice'), 2, 'กล่องสถานะ · กล่องข้อที่พิมพ์');
  assert.equal(count(section, 'className={styles.compactNotice}'), 2);
  assert.match(section, /<StatusNotice tone="info" title=\{doc\.printed\.title\} className=\{styles\.compactNotice\}>/);
  const notices = between(CARD, 'const noticeNodes = ', 'const sendReason = ');
  assert.match(notices, /<StatusNotice key=\{notice\.key\} tone=\{notice\.tone\} title=\{notice\.title\} className=\{styles\.compactNotice\}>/,
    'ทรงเดียวกันทั้งการ์ด — กล่องแจ้งสองขนาดในราง 330px อ่านเป็นของสองระบบ');
  assert.equal(count(CARD, '<StatusNotice'), count(CARD, 'className={styles.compactNotice}'), 'ไม่มีกล่องแจ้งไหนของการ์ดหลุดทรง');
  /* CSS: สองคลาส (ชนะกฎของตัวกลางโดยไม่พึ่งลำดับไฟล์) · ไอคอนเล็กชิดบรรทัดแรก ไม่มีวง · ไม่มีสีใหม่ (ตรึงอยู่ในเทสต์ CSS ข้างล่าง) */
  assert.match(CARD_CSS, /\.card \.compactNotice \{\s*align-items: flex-start;\s*gap: var\(--space-2\);\s*padding: var\(--space-2-5\) var\(--space-3\);\s*font-size: var\(--fs-5\);\s*\}/);
  assert.match(CARD_CSS, /\.card \.compactNotice > span:first-child \{\s*width: 18px;\s*height: 18px;\s*flex-basis: 18px;\s*margin-top: var\(--space-0-5\);\s*border-radius: 0;\s*background: none;\s*\}/);
  /* กฎข้างบนเล็งไอคอนด้วยตำแหน่ง (`span` ลูกคนแรกของกล่อง) — ตัวกลางเปลี่ยนโครงเมื่อไร ต้องมาแก้ตัวเล็งด้วย */
  const NOTICE = code(read('../../components/ui/StatusNotice.js'));
  assert.match(NOTICE, /<div className=\{`\$\{styles\.notice\} \$\{styles\[key\] \|\| styles\.info\} \$\{className\}`\.trim\(\)\} role=\{resolvedRole\}>\s*<span className=\{styles\.icon\} aria-hidden="true"><Icon size=\{18\} \/><\/span>/,
    '`className` ลงที่รากของกล่อง · ไอคอน 18px เป็นลูกคนแรก');
});

test('ป้ายด่านของใบที่ส่งผลแล้วบอกแถวเอกสารที่ยังติด (`view.gatesSentFailed`) — การ์ดไม่นับเอง', () => {
  assert.match(CARD, /const gateBadge = flags\.sent\s*\? view\.gatesSentFailed\s*\? <StatusBadge size="sm" tone="warning">\{`ติด \$\{view\.gatesSentFailed\} \/ \$\{gates\.length\} ข้อ`\}<\/StatusBadge>\s*: <StatusBadge size="sm" tone="success">\{`ผ่านครบ \$\{gates\.length\} ข้อตอนส่ง`\}<\/StatusBadge>/);
  /* ปุ่มคลี่อ่านจำนวนเดียวกันผ่านตัวตัดสิน (`view.fold.labels.gates` — ตรึงใน surveyControlDocument.test.mjs) */
  assert.doesNotMatch(CARD, /gates\.filter\(/, 'จำนวนที่ติดมาจากตัวตัดสิน');
});

/* 🐞 UAT PR-3 (S03 · S25 · S26 ที่ราง): ป้าย "ติด 1 / 8 ข้อ" ไม่มีแถวไหนบอกว่าข้อไหน อยู่ระหว่าง "ติด 2 ข้อ" ของกล่องเหตุกับของส่วนเอกสาร */
test('บล็อกด่านเอ่ยชื่อด่านที่ติดซึ่งไม่มีแถวรายพื้นที่ (`view.gateNotes` — แถวเอกสารประเมิน) · การ์ดวาดอย่างเดียว ทั้งก่อนและหลังส่งผล', () => {
  const gatesBlock = between(CARD, 'const gatesSection = flags.cancelled ? null : (', 'const railSteps = workflowStepsFromIndex(');
  assert.match(gatesBlock, /\{view\.gateNotes\.length \? \(\s*<ul className=\{styles\.gapList\}>\s*\{view\.gateNotes\.map\(\(row\) => \(\s*<li key=\{row\.key\} className=\{styles\.gapRow\}>\s*<span className=\{styles\.mark\} aria-hidden="true"><X size=\{12\} \/><\/span>\s*<div>\s*<p className=\{styles\.gapName\}><b>\{row\.label\}<\/b><\/p>\s*<small>\{thaiText\(row\.note\)\}<\/small>\s*<\/div>\s*<\/li>\s*\)\)\}\s*<\/ul>\s*\) : null\}/,
    'ทรงเดียวกับแถวรายพื้นที่ (เครื่องหมาย · ชื่อ · บรรทัดรอง) — ไม่มีปุ่ม ไม่มีรายการเหตุ');
  /* ลำดับในบล็อก: แถวรายพื้นที่ → แถวนี้ → ลิงก์ (ส่งกลับ · ดูด่านทั้ง n ข้อ) → รายการด่านเต็ม */
  const at = ['{gapFirst.length ?', '{view.gateNotes.length ?', 'className={styles.secLinks}', '{gateFullList}'].map((needle) => gatesBlock.indexOf(needle));
  assert.ok(at.every((i) => i !== -1));
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal(count(CARD, 'view.gateNotes'), 2, 'ที่เดียวในการ์ด');
  /* ไม่ผูกกับ "ยังไม่ส่ง" (แถวรายพื้นที่มีเฉพาะก่อนส่ง — ใบที่ส่งแล้วด่านที่ติดได้มีแถวนี้แถวเดียว) และการ์ดไม่เลือกด่านเอง */
  assert.doesNotMatch(gatesBlock, /flags\.sent \? \[\] : view\.gateNotes|gate\.key === "document"|key === "document"/);
  assert.doesNotMatch(CARD, /ดูเหตุที่ส่วน/, 'ถ้อยคำอยู่ที่ตัวตัดสิน');
  /* สัญญา การ์ด ↔ ตัวตัดสิน: รูปของแถว */
  const stuck = sheet({ request: REQUEST, document: { ...HEAD_DOC, send: { blockers: ['ก', 'ข'], warnings: [], unknown: false } } });
  assert.deepEqual(stuck.gateNotes, [{ key: 'document', label: 'เอกสารประเมินออกได้', note: 'ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”' }]);
  for (const name of ['gapList', 'gapRow', 'gapName', 'mark']) assert.match(CARD_CSS, new RegExp(`\\.${name}\\b`));
});

/* ── การ์ดกลาง + CSS ──────────────────────────────────────────────────────────────── */

test('`DocumentActionGroup`: ปุ่มตัวเดียวกับช่องปุ่มของการ์ด · ปุ่มจางชี้ไปที่กล่องสถานะ · แถวไม่ถูกสลับลำดับที่จอแคบ', () => {
  const group = between(PANEL, 'export function DocumentActionGroup(', '\n}\n');
  assert.match(group, /^export function DocumentActionGroup\(\{ actions = \[\], busy = false, label, describedBy \}\) \{/);
  assert.match(group, /const shown = actions\.filter\(\(action\) => action && action\.visible !== false\);\s*if \(!shown\.length\) return null;/);
  assert.match(group, /<div className=\{styles\.actionGroup\} role="group" aria-label=\{label\}>/);
  assert.match(group, /<DocumentAction\s+key=\{action\.id\}\s+action=\{action\}\s+slot="secondary"\s+busy=\{busy\}\s+describedBy=\{action\.disabled \|\| busy \? describedBy : undefined\}/);
  assert.match(PANEL, /aria-disabled=\{unavailable \|\| undefined\}\s+aria-describedby=\{describedBy\}/, 'ปุ่มที่กดไม่ได้ยังอยู่ในลำดับ Tab');
  assert.match(CARD, /import \{ DocumentActionGroup, DocumentControlCard, WorkflowRail \} from "@\/components\/ui\/DocumentControlPanel";/);

  const rules = [...PANEL_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes('.actionGroup'));
  assert.equal(rules.length, 2, 'กฎของแถวปุ่มมีสองข้อ (กล่อง · ปุ่มข้างใน)');
  for (const [, selector, body] of rules) {
    assert.doesNotMatch(body, /\border\s*:/, `${selector.trim()}: ปุ่มที่โฟกัสได้ห้ามสลับลำดับด้วย CSS (ลำดับ Tab ต้องตรงกับที่ตาเห็น)`);
  }
  assert.match(PANEL_CSS, /\.actionGroup \{\s*display: flex;\s*flex-wrap: wrap;\s*gap: var\(--space-2\);\s*\}/);
  /* 🐞 UAT PR-3: ฐาน 132px แบ่งแถว 296–298px ให้สองปุ่มเท่ากัน ⇒ "ดูตัวอย่าง (ฉบับร่าง)" (ต้องการ 148px) ตัดสองบรรทัด ปุ่มสูง 59px
     ⇒ ฐานตามป้ายของปุ่มเอง (`auto`): ป้ายอยู่บรรทัดเดียว ปุ่มที่ไม่พอแถวตกไปแถวใหม่ทั้งปุ่ม */
  assert.match(PANEL_CSS, /\.actionGroup > \.action \{\s*flex: 1 1 auto;\s*width: auto;\s*\}/);
  assert.doesNotMatch(PANEL_CSS, /\.actionGroup[^{]*\{[^}]*flex: 1 1 \d/, 'ฐานตายตัวเป็น px = ป้ายยาวตัดบรรทัดในปุ่ม');
  const media = [...PANEL_CSS.matchAll(/@media[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(media, /\.actionGroup/, 'ไม่มีกฎของแถวนี้ในมีเดียไหนเลย');
});

test('ผังสองคอลัมน์ของการ์ดกลาง (`tabletSplit`): กฎส่วนรองที่จอ ≤680 เป็นของทุกการ์ดที่ขอผังนี้และส่ง `footer` — ไม่ใช่ของใบประเมินใบเดียว', () => {
  /* การ์ดกลาง: ทุกผู้เรียกที่ขอ `tabletSplit` ได้ `.bodySplit` · ทุกผู้เรียกที่ส่ง `footer` ได้ `.footer` เป็นลูกตรงของกล่องเดียวกัน
     ⇒ ตัวเลือก `.bodySplit > .footer` ถึงทุกการ์ดแบบนั้น (การ์ดใบประเมินไม่มีคลาสของตัวเองในกฎนี้) */
  assert.match(PANEL, /<div className=\{`\$\{styles\.controlBody\} \$\{tabletSplit \? styles\.bodySplit : ""\}`\.trim\(\)\}>/);
  assert.match(PANEL, /\{footer \? <div className=\{styles\.footer\}>\{footer\}<\/div> : null\}\s*<\/div>\s*<\/DetailCard>/);
  const narrow = PANEL_CSS.slice(PANEL_CSS.lastIndexOf('@media (max-width: 680px)'));
  assert.match(narrow, /\.bodySplit > \.footer \{\s*align-self: stretch;\s*\}/);
  assert.equal(count(PANEL_CSS, 'align-self: stretch'), 1);
  /* 🐞 บันทึกของผู้สร้างเคยเขียนว่า "มีแต่การ์ดใบประเมินที่ใช้ `tabletSplit`" — ไม่จริง (มีผู้เรียกอีกสามหน้า ซึ่งวันนี้ยังไม่ส่ง `footer`)
     ⇒ คำกำกับเหนือกฎต้องบอกขอบเขตจริง: หน้าไหนเพิ่ม `footer` วันหน้าก็ได้กฎนี้ทันที */
  const raw = read('../../components/ui/DocumentControlPanel.module.css');
  const noteAt = raw.lastIndexOf('/*', raw.lastIndexOf('.bodySplit > .footer {'));
  const note = raw.slice(noteAt, raw.indexOf('*/', noteAt));
  assert.match(note, /ทุกการ์ดที่ขอ `tabletSplit` และส่ง `footer`/);
});

test('CSS ของส่วนเอกสาร: ของที่กดได้สูง 44px ที่จอ ≤1050 · เส้นจอเดียว · ไม่มีสีใหม่ ไม่มี inline style', () => {
  const queries = [...new Set((CARD_CSS.match(/@media[^{]*/g) || []).map((m) => m.trim()))];
  assert.deepEqual(queries, ['@media (max-width: 1050px)'], 'ไม่เพิ่มเส้นจอใหม่');
  /* 🐞 `.reasonJump` (ปุ่มพาไปในบรรทัดเหตุใต้ปุ่มส่งผล) อยู่นอก `.doc` — ก่อนส่งผลส่วนเอกสารพับอยู่ ⇒ "ตรวจอีกครั้ง" ตัวที่ตาเห็นคือตัวนี้ ต้อง 44px ด้วย */
  /* 🐞 UAT PR-3: ของส่วนเอกสาร 44px ยืนข้างปุ่มรุ่นก่อนที่เตี้ยกว่า (ส่งผล/ดึงกลับ 40px · ปุ่มคลี่ 40px · ปุ่มข้อความ 19.5px)
     ⇒ กฎเดียว **ทั้งการ์ด** (`.card`) ไม่ใช่เฉพาะ `.doc` — ครอบ `.reasonJump` (ปุ่มข้อความในกล่องเหตุ) และปุ่มของส่วนเอกสารไปด้วย */
  assert.match(CARD_CSS, /@media \(max-width: 1050px\) \{\s*\.docSeg:global\(\.segmented\) > button,\s*\.card :global\(\.btn\),\s*\.card :global\(\.text-action\) \{\s*min-height: var\(--ctl-h-touch\);\s*\}\s*\.card :global\(\.text-action\) \{\s*display: inline-flex;\s*align-items: center;\s*justify-content: center;\s*min-width: var\(--ctl-h-touch\);\s*\}/,
    'ปุ่มข้อความสูง 44px ได้ต่อเมื่อเป็นกล่อง (inline-flex) — `min-height` บน inline เฉย ๆ ไม่มีผล · ป้ายสั้น ("ซ่อน") กว้างอย่างน้อย 44px ด้วย');
  assert.doesNotMatch(CARD_CSS, /\.doc :global\(\.(btn|text-action)\)/, 'กฎ 44px เฉพาะส่วนเอกสาร = ปุ่มที่เหลือของการ์ดเตี้ยกว่าเพื่อนบ้าน');
  /* ปุ่มคลี่ที่จอ ≤1050 สูง 44px — ประกาศ **หลัง** กฎฐาน `.disclosure { min-height: 40px }` (ความจำเพาะเท่ากัน ตัวหลังชนะ)
     🐞 จับได้ตอนถ่ายจอ: ใส่ไว้ในกฎรวมข้างบน (ก่อนกฎฐาน) แล้วปุ่มคลี่ยังสูง 40px */
  assert.match(CARD_CSS, /@media \(max-width: 1050px\) \{\s*\.disclosure \{\s*display: flex;\s*min-height: var\(--ctl-h-touch\);\s*\}/);
  assert.ok(CARD_CSS.lastIndexOf('.disclosure {') > CARD_CSS.indexOf('min-height: 40px;'));
  assert.match(CARD, /<DocumentControlCard\s+className=\{styles\.card\}/, 'กฎ `.card :global(...)` ถึงทุกปุ่มได้เพราะการ์ดกลางถือคลาสนี้ที่ราก');
  /* 🐞 UAT PR-3 (S03 ที่ 360): ปุ่มพาไป 44px ในบรรทัดเดียวกับข้อความดันบรรทัดสุดท้ายให้สูงกว่าบรรทัดอื่น (ช่องไฟไม่เท่ากัน)
     ⇒ ลงบรรทัดของตัวเอง (flex กว้างเท่าป้าย) · แม่กุญแจยังเกาะเส้นฐานของบรรทัดแรก */
  assert.match(CARD_CSS, /\.card \.reasonJump \{\s*display: flex;\s*width: fit-content;\s*margin-inline-start: 0;\s*\}\s*\.reason \{\s*align-items: baseline;\s*\}\s*\.reason > svg \{\s*margin-top: 0;\s*transform: translateY\(var\(--space-1\)\);\s*\}\s*\}/);
  assert.doesNotMatch(CARD_CSS, /\.reasonJump \{[^}]*display: inline-flex/, 'ปุ่ม 44px ที่อยู่ในบรรทัดเดียวกับข้อความ = บรรทัดนั้นสูงกว่าเพื่อน');
  assert.match(CARD_CSS, /\.reason \{\s*display: flex;\s*align-items: flex-start;\s*gap: var\(--space-2\);\s*\}/, 'จอกว้างเหมือนเดิม');
  assert.match(CARD_CSS, /\.reasonJump \{\s*margin-inline-start: var\(--space-2\);\s*\}/, 'จอกว้างเหมือนเดิม — ช่องไฟอย่างเดียว');
  assert.match(CARD, /onReload=\{reasonReload\}\s+className=\{styles\.reasonJump\}/, 'ปุ่มในบรรทัดเหตุถือคลาสนี้');
  assert.match(CARD_CSS, /\.docSeg:global\(\.segmented\) \{\s*display: flex;/);
  assert.match(CARD_CSS, /\.docSeg:global\(\.segmented\) > button \{\s*flex: 1 1 0;\s*min-width: 0;\s*\}/);
  assert.match(CARD_CSS, /\.docPinned \{\s*margin-bottom: var\(--space-4\);\s*padding-bottom: var\(--space-3-5\);\s*border-bottom: 1px solid var\(--border\);\s*\}/);
  assert.match(CARD_CSS, /\.noticeList \{[^}]*list-style: disc;/, 'ข้อยาวหลายบรรทัดในรางแคบ — จุดหน้าข้อต้องเห็น');
  for (const sheet of [CARD_CSS, PANEL_CSS]) {
    assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'ใช้โทเคนสีที่มีอยู่เท่านั้น');
  }
  /* คลาสที่การ์ดเรียกต้องมีอยู่จริงในโมดูล — คลาสที่ไม่มี = `undefined` ในชื่อคลาส เงียบ ไม่มี error */
  for (const name of ['sec', 'docPinned', 'docTitle', 'docBlock', 'docSeg', 'noticeList', 'noticeLine', 'gateList', 'gateRow', 'gateBody', 'refs', 'more', 'secLinks']) {
    assert.match(CARD, new RegExp(`styles\\.${name}\\b`), `การ์ดไม่ได้ใช้ ${name}`);
    assert.match(CARD_CSS, new RegExp(`\\.${name}\\b`), `โมดูล CSS ไม่มี .${name}`);
  }
  assert.doesNotMatch(between(CARD, 'const documentSection = doc.show ? (', 'const fold = view.fold;'), /style=\{/);
});

/* ── สัญญา: ก้อนที่หน้าเขียนลง `docLocal` คือรูปที่ตัวตัดสินอ่าน ──────────────────────────────── */

const SIZES = [
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
];
const ANSWERED = '2026-10-01T03:04:00.000Z';
const ZONE_ROW = {
  id: 'z1', zoneId: 'SZN-z1', zoneName: 'Studio 01', floor: '02', status: 'ok',
  parts: [{ widthM: 4, lengthM: 5, heightM: 3, label: null }],
  spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '',
};
const FILES = {
  z1: [
    { id: 'F-wide', docType: 'survey_wide' },
    { id: 'F-plan', docType: 'survey_plan' },
    { id: 'F-spot', docType: 'survey_spot', fileName: 'spot.jpg', metadata: { spotId: 's1' } },
  ],
};
const REQUEST = {
  id: 'DR-1', docNo: 'RQ-AS-26090106', title: 'S&S ประเมินพื้นที่', kind: 'site_survey', dept: 'TS',
  status: 'acknowledged', siteId: 'SS-1', customerId: 'CU-1', committedDueDate: '2026-10-05',
};
const SENT = { ...REQUEST, status: 'answered', answeredAt: ANSWERED, answeredByName: 'หัวหน้า ก' };
const HEAD_DOC = {
  access: { customer: true, internal: true, issue: true, draft: true, history: true },
  issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, history: [], nextDocNo: null, send: null, issue: null,
};
const CURRENT = {
  docNo: 'SU-26100001-0', rev: 0, issuedAt: ANSWERED, issuedByName: 'หัวหน้า ก', ready: { customer: false, internal: false },
};
const sheet = (args = {}) => surveyControlView({
  request: SENT, zones: [ZONE_ROW], filesByZone: FILES, viewer: { canWrite: true, canDecide: true },
  today: '2026-10-01', packageSizes: SIZES, ...args,
});
/* รูปเดียวกับ `DOC_LOCAL_ROUND` ของหน้า (เทสต์ข้างบนตรึงตัวอักษรไว้) */
const ROUND = { sendFailed: null, issueError: null, paper: null, printed: [] };

test('สัญญา `afterSend` → ตัวตัดสิน: ส่งผลแล้วเลขไม่ออก = ส่วนเอกสารเป็น "ยังไม่ออก" พร้อมเหตุของ server · กดซ้ำได้ตาม retry', () => {
  /* server ยังเดาว่า "กำลังออก" (นาฬิกา 180 วิ) — จอนี้รู้แล้วว่าการส่งรอบนี้ออกเลขไม่สำเร็จ */
  const document = { ...HEAD_DOC, state: 'issuing', issue: { blockers: [], warnings: [], unknown: false } };
  const local = (sendFailed) => ({ ...ROUND, sendRefused: null, round: ANSWERED, sendFailed });
  const retry = sheet({ document, documentLocal: local({ code: 'images_failed', reason: 'ดึงรูปไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true }) });
  assert.equal(retry.document.state, 'missing');
  assert.equal(retry.document.status.text, 'ดึงรูปไม่สำเร็จ — กดออกเอกสารอีกครั้ง');
  assert.equal(retry.document.issue.allowed, true);
  assert.equal(retry.document.poll, false, 'รู้ผลแล้ว ไม่ต้องตรวจทุก 15 วิ');
  const stuck = sheet({ document, documentLocal: local({ code: 'undecodable', reason: 'รูปเปิดไม่ได้ — ดึงผลกลับมาแก้', retry: false }) });
  assert.equal(stuck.document.issue.allowed, false);
  /* เวลาตอบคนละรูปสตริง จุดเวลาเดียวกัน = ยังเป็นของรอบนี้ · รอบอื่น = ไม่ใช้ */
  const offset = sheet({ document, documentLocal: { ...local({ code: 'internal', reason: 'x', retry: true }), round: '2026-10-01T03:04:00+00:00' } });
  assert.equal(offset.document.state, 'missing');
  const other = sheet({ document, documentLocal: { ...local({ code: 'internal', reason: 'x', retry: true }), round: '2026-09-30T03:04:00.000Z' } });
  assert.equal(other.document.state, 'issuing');
  assert.equal(other.document.poll, true);
});

test('สัญญา `finishPaper` / `issueDocument` → ตัวตัดสิน: ระหว่างจัดทำไฟล์ลิงก์จาง · เหตุของกระดาษขึ้นตามที่ได้มา · ข้อที่ยังไม่ได้อ่านขึ้นหลังออก', () => {
  const document = { ...HEAD_DOC, state: 'issued', current: CURRENT };
  const busy = sheet({ document, documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, paper: { busy: true, reason: null } } });
  const [customer] = busy.document.versions;
  assert.equal(customer.download.blocked, true);
  assert.equal(customer.download.href, null);
  assert.equal(customer.status.text, 'กำลังจัดทำไฟล์ PDF…');

  const reason = 'จัดหน้าเอกสารไม่สำเร็จ — แจ้งผู้ดูแลระบบ';
  const failed = sheet({
    document,
    documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, paper: { busy: false, reason }, printed: ['Studio 01: มีภาพผัง 3 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว'] },
  });
  assert.equal(failed.document.versions[0].status.text, reason);
  assert.equal(failed.document.versions[0].download.blocked, false, 'ดาวน์โหลด = ลองใหม่ (GET จัดทำไฟล์ที่ขาดเอง)');
  assert.deepEqual(failed.document.printed.items, ['Studio 01: มีภาพผัง 3 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว']);

  /* `issueError` ของกล่องยืนยัน: `{ code, message, retry }` */
  const missing = { ...HEAD_DOC, state: 'missing', issue: { blockers: [], warnings: [], unknown: false } };
  const refused = sheet({
    document: missing,
    documentLocal: { ...ROUND, sendRefused: null, round: ANSWERED, issueError: { code: 'paper_blocked', message: 'หน้ากระดาษล้น — ดึงผลกลับมาแก้', retry: false } },
  });
  assert.equal(refused.document.status.text, 'หน้ากระดาษล้น — ดึงผลกลับมาแก้');
  assert.equal(refused.document.issue.allowed, false);
  assert.ok(refused.document.issue.confirm, 'กล่องยืนยันยังมีเนื้อให้คัดลอก');
});

test('สัญญา `rememberSendRefusal` → ตัวตัดสิน: กล่อง "ส่งผลรอบล่าสุดถูกตีกลับ" ขึ้นเมื่อ sig ตรงกับลายเซ็นของ `filesByZone` ก้อนเดียวกัน', () => {
  const message = surveySendImageRefusal([{ attId: 'F-plan', fileName: 'plan.heic', reason: 'x', permanent: true }]);
  const document = { ...HEAD_DOC, send: { blockers: [], warnings: [], unknown: false } };
  /* รูปที่หน้าเขียนเมื่อยังไม่มีก้อนของรอบ: `{ ...DOC_LOCAL_ROUND, round: null, sendRefused }` */
  const kept = { ...ROUND, round: null, sendRefused: { message, sig: surveyFilesSignature(FILES) } };
  const shown = sheet({ request: REQUEST, document, documentLocal: kept });
  assert.equal(shown.notices.find((n) => n.key === 'send-refused')?.text, message);
  const changed = { ...FILES, z1: FILES.z1.filter((f) => f.id !== 'F-plan') };
  const gone = sheet({ request: REQUEST, filesByZone: changed, document, documentLocal: kept });
  assert.equal(gone.notices.find((n) => n.key === 'send-refused'), undefined, 'ชุดไฟล์เปลี่ยน = หัวหน้าแก้แล้ว กล่องหายเอง');
});
