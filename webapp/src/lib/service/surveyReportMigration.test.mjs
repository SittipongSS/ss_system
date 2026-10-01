/* ยามกัน "โค้ดกับ migration หลุดจากกัน" ของรายงานการประเมินพื้นที่ (mig 0401)
 *
 * 🪤 `check:columns` เทียบกับ **schema จริงบนฐาน** — บอกได้แค่ว่ารัน migration แล้วหรือยัง ไม่ได้บอกว่าไฟล์ในรีโป
 *    ประกาศของที่โค้ดต้องใช้ครบไหม · 0401 ต้องรันมือบน SQL Editor และ **ไม่มี Postgres ให้ลองรัน** (dev DB = prod DB)
 *    ⇒ ไฟล์นี้คือด่านเดียวที่เห็นกติกาสำคัญของไฟล์ก่อนมีคนวางลง SQL Editor
 * 🪤 ค่าที่เดินผ่าน `p_row` jsonb ของ RPC ไม่มีด่านไหนมองเห็น — คีย์ที่ RPC ไม่อ่านถูกทิ้งเงียบ
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formatDocumentNumber, validateNumberingPattern } from '../documentStandards.js';
import {
  SURVEY_REPORT_COUNTER_SCOPE,
  SURVEY_REPORT_RUNNING_WIDTH,
  formatSurveyReportNo,
  parseSurveyReportNo,
} from './surveyReportNumber.js';

const sql = readFileSync(
  new URL('../../../supabase/migrations/0401_survey_report_documents.sql', import.meta.url), 'utf8',
);
// ตัดคอมเมนต์บรรทัดออก — ส่วนย้อนกลับท้ายไฟล์เป็นคอมเมนต์ที่มีคำสั่ง DROP อยู่ ห้ามนับ
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const between = (from, to) => {
  const start = code.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? code.indexOf(to, start + from.length) : code.length;
  assert.ok(end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return code.slice(start, end);
};

const table = between('CREATE TABLE IF NOT EXISTS public.service_survey_reports', '\n);');
const guard = between('CREATE OR REPLACE FUNCTION public.guard_service_survey_report()', '$$;');
const issue = between('CREATE OR REPLACE FUNCTION public.issue_survey_report(', '$$;');
const supersede = between('CREATE OR REPLACE FUNCTION public.supersede_survey_reports_on_unanswer()', '$$;');

/* ── โครงไฟล์ ─────────────────────────────────────────────────────── */

test('ทั้งไฟล์อยู่ในทรานแซกชันเดียว · NOTIFY หลัง COMMIT', () => {
  const begin = code.indexOf('BEGIN;');
  const commit = code.lastIndexOf('COMMIT;');
  assert.ok(begin >= 0 && commit > begin);
  assert.ok(code.indexOf("NOTIFY pgrst, 'reload schema';") > commit);
});

test('หัวไฟล์บอกว่ารันมือ · รันซ้ำได้ · เพิ่มอย่างเดียว · ต้องรันก่อน PR-2', () => {
  const header = sql.slice(0, sql.indexOf('BEGIN;'));
  assert.match(header, /SQL Editor/);
  assert.match(header, /รันซ้ำได้/);
  assert.match(header, /เพิ่มอย่างเดียว/);
  assert.match(header, /PR-2/);
});

test('🔴 เพิ่มอย่างเดียว: ไม่มี DROP TABLE / DROP COLUMN / DELETE / TRUNCATE / ALTER ตารางเดิม', () => {
  assert.doesNotMatch(code, /DROP\s+TABLE/i);
  assert.doesNotMatch(code, /DROP\s+COLUMN/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  assert.doesNotMatch(code, /DELETE\s+FROM/i);
  // ALTER TABLE มีได้ตัวเดียว = เปิด RLS ของตารางใหม่
  const alters = code.match(/ALTER\s+TABLE[^;]+;/gi) || [];
  assert.deepEqual(alters.map((s) => s.replace(/\s+/g, ' ')), [
    'ALTER TABLE public.service_survey_reports ENABLE ROW LEVEL SECURITY;',
  ]);
  // DROP ที่มีได้ = DROP TRIGGER IF EXISTS ก่อนสร้างใหม่ (รันซ้ำได้)
  const drops = code.match(/\bDROP\s+\w+/gi) || [];
  assert.ok(drops.length > 0 && drops.every((d) => /^DROP\s+TRIGGER$/i.test(d)), drops.join(', '));
});

test('รันซ้ำได้: ทุกของที่สร้างมี IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS / ON CONFLICT', () => {
  assert.match(code, /CREATE TABLE IF NOT EXISTS public\.service_survey_reports/);
  for (const idx of code.match(/CREATE\s+(UNIQUE\s+)?INDEX[^\n]*/gi) || []) assert.match(idx, /IF NOT EXISTS/);
  for (const fn of code.match(/CREATE\s+(OR REPLACE\s+)?FUNCTION/gi) || []) assert.match(fn, /OR REPLACE/);
  for (const name of ['service_survey_reports_guard', 'dept_requests_supersede_survey_report']) {
    const drop = code.indexOf(`DROP TRIGGER IF EXISTS ${name}`);
    const create = code.indexOf(`CREATE TRIGGER ${name}`);
    assert.ok(drop >= 0 && create > drop, name);
  }
  assert.match(between('INSERT INTO storage.buckets', ';'), /ON CONFLICT \(id\)/);
});

/* ── ตาราง ────────────────────────────────────────────────────────── */

test('🔴 ไม่มี FK — ลบคำร้องแล้วแถวเอกสารต้องอยู่ (เลขที่ออกไปแล้วห้ามหาย)', () => {
  assert.doesNotMatch(table, /REFERENCES/i);
  assert.match(table, /"requestId"\s+text NOT NULL/);
});

test('รูปเลขที่: เลขฐาน SU-8 หลัก · docNo = เลขฐาน-ฉบับ · ไม่ซ้ำ', () => {
  assert.match(table, /"baseNo"\s+text NOT NULL CHECK \("baseNo" ~ '\^SU-\[0-9\]\{8\}\$'\)/);
  assert.match(table, /rev\s+integer NOT NULL CHECK \(rev >= 0\)/);
  assert.match(table, /"docNo"\s+text NOT NULL UNIQUE/);
  assert.match(table, /CHECK \("docNo" = "baseNo" \|\| '-' \|\| rev::text\)/);
  assert.match(table, /UNIQUE \("requestId", rev\)/);
  // เลขที่ JS ประกอบต้องผ่าน CHECK ของตาราง
  const parts = parseSurveyReportNo(formatSurveyReportNo({ yymm: '2609', running: 1, rev: 0 }));
  assert.match(parts.baseNo, /^SU-[0-9]{8}$/);
  assert.equal(parts.docNo, `${parts.baseNo}-${parts.rev}`);
});

test('สถานะมีสองค่า · ใบที่ใช้อยู่มีได้ใบเดียวต่อคำร้อง (partial unique index)', () => {
  assert.match(table, /status\s+text NOT NULL DEFAULT 'current' CHECK \(status IN \('current', 'superseded'\)\)/);
  assert.match(table, /CHECK \(\(status = 'superseded'\) = \("supersededAt" IS NOT NULL\)\)/);
  assert.match(table, /"supersededReason"\s+text CHECK \("supersededReason" IN \('recall', 'reopen'\)\)/);
  assert.match(
    code.replace(/\s+/g, ' '),
    /CREATE UNIQUE INDEX IF NOT EXISTS service_survey_reports_current_uidx ON public\.service_survey_reports \("requestId"\) WHERE status = 'current';/,
  );
});

test('ภาพนิ่ง + รูป + กระดาษตรึงสองฉบับ + ผู้อนุมัติ/ผู้ออก ครบทุกคอลัมน์', () => {
  assert.match(table, /snapshot\s+jsonb NOT NULL CHECK \(jsonb_typeof\(snapshot\) = 'object'\)/);
  assert.match(table, /images\s+jsonb NOT NULL DEFAULT '\[\]'::jsonb CHECK \(jsonb_typeof\(images\) = 'array'\)/);
  for (const col of ['customerHtml', 'internalHtml', 'rendererVersion', 'customerPdfPath', 'internalPdfPath',
    'approvedById', 'approvedByName', 'issuedById', 'issuedByName']) {
    assert.match(table, new RegExp(`"${col}"\\s+text`), col);
  }
  assert.match(table, /"frozenAt"\s+timestamptz/);
  assert.match(table, /"approvedAt"\s+timestamptz NOT NULL/);
  assert.match(table, /"issuedAt"\s+timestamptz NOT NULL DEFAULT now\(\)/);
});

/* ── ยามเขียนครั้งเดียว ───────────────────────────────────────────── */

const tableColumns = () => table.split('\n')
  .map((line) => line.trim().match(/^"?([A-Za-z]+)"?\s+(text|integer|jsonb|timestamptz)\b/))
  .filter(Boolean).map((m) => m[1]);

test('🔴 ยามของแถว: ห้ามลบ · คอลัมน์ที่เขียนได้ทีหลังถูกเอ่ยชื่อครบ (คอลัมน์ใหม่ = แก้ไม่ได้จนกว่าจะเอ่ยชื่อ)', () => {
  assert.match(guard, /IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION 'survey_report_delete_forbidden/);
  const once = guard.match(/v_once text\[\] := ARRAY\[([^\]]+)\]/);
  assert.ok(once, 'หา v_once ไม่เจอ');
  const writeOnce = once[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  assert.deepEqual(writeOnce, [
    'customerHtml', 'customerPdfPath', 'frozenAt', 'internalHtml', 'internalPdfPath',
    'rendererVersion', 'supersededAt', 'supersededReason',
  ]);
  // สองตัวที่เปลี่ยนได้เสมอ: status (ทางเดียวด้วย CHECK คู่กับ supersededAt) · updatedAt
  assert.match(guard, /to_jsonb\(OLD\) - 'status' - 'updatedAt'/);
  assert.match(guard, /to_jsonb\(NEW\) - 'status' - 'updatedAt'/);
  // NULL → ค่า ได้ครั้งเดียว
  assert.match(guard, /k = ANY \(v_once\) AND o->k = 'null'::jsonb/);
  assert.match(guard, /RAISE EXCEPTION 'survey_report_immutable/);
  // ทุกชื่อใน v_once เป็นคอลัมน์จริงของตาราง — พิมพ์ผิดตัวเดียว = คอลัมน์นั้นเขียนไม่ได้เลยตลอดไป
  const cols = tableColumns();
  for (const name of writeOnce) assert.ok(cols.includes(name), `${name} ไม่ใช่คอลัมน์ของตาราง`);
  // ตัวตน · ภาพนิ่ง · ผู้อนุมัติ · ผู้ออก ต้อง **ไม่** อยู่ในลิสต์
  for (const frozen of ['id', 'requestId', 'baseNo', 'rev', 'docNo', 'snapshot', 'images',
    'approvedById', 'approvedByName', 'approvedAt', 'issuedById', 'issuedByName', 'issuedAt']) {
    assert.ok(cols.includes(frozen), `${frozen} หายจากตาราง`);
    assert.ok(!writeOnce.includes(frozen), `${frozen} ต้องแก้ไม่ได้`);
  }
  assert.match(
    code.replace(/\s+/g, ' '),
    /CREATE TRIGGER service_survey_reports_guard BEFORE UPDATE OR DELETE ON public\.service_survey_reports FOR EACH ROW EXECUTE FUNCTION public\.guard_service_survey_report\(\);/,
  );
});

/* ── RPC ออกเลข ───────────────────────────────────────────────────── */

test('RPC: ล็อกคำร้องก่อนอ่าน · ต้องเป็นใบประเมินที่ส่งผลแล้วและยังเป็นคำตอบเดิม', () => {
  assert.match(issue, /SECURITY DEFINER/);
  assert.match(issue, /SET search_path = public/);
  assert.match(issue, /FROM public\.dept_requests WHERE id = p_request_id FOR UPDATE/);
  assert.match(issue, /v_req\.kind <> 'site_survey'/);
  assert.match(issue, /v_req\."cancelledAt" IS NOT NULL/);
  assert.match(issue, /v_req\."answeredAt" IS NULL OR v_req\."answeredAt" IS DISTINCT FROM p_answered_at/);
  assert.match(issue, /RAISE EXCEPTION 'survey_answer_changed/);
  // การล็อกต้องมาก่อนการอ่านแถวเอกสารและตัวนับ
  assert.ok(issue.indexOf('FOR UPDATE') < issue.indexOf('FROM public.service_survey_reports'));
  assert.ok(issue.indexOf('FOR UPDATE') < issue.indexOf('entity_number_counters'));
});

test('RPC: ฉบับแก้ไขใช้เลขฐานเดิม R ถัดไป — ไม่กินเลขรันใหม่', () => {
  assert.match(issue, /SELECT "baseNo", rev \+ 1 INTO v_base, v_rev FROM public\.service_survey_reports\s+WHERE "requestId" = p_request_id ORDER BY rev DESC LIMIT 1;/);
  // ตัวนับอยู่ในกิ่ง "ยังไม่มีเลขฐาน" เท่านั้น
  const branch = issue.slice(issue.indexOf('IF v_base IS NULL THEN'), issue.indexOf('INSERT INTO public.service_survey_reports'));
  assert.match(branch, /entity_number_counters/);
  assert.match(branch, /v_rev := 0;/);
  assert.ok(!issue.slice(0, issue.indexOf('IF v_base IS NULL THEN')).includes('INSERT INTO public.entity_number_counters'));
});

test('🔴 RPC: ตัวนับ scope SU ตัดรอบรายปี · แถวตัวนับหาย = seed จากเลขของทั้งปี (ทุกเดือน)', () => {
  assert.equal(SURVEY_REPORT_COUNTER_SCOPE, 'SU');
  assert.match(issue, /v_year text := left\(p_yymm, 2\);/);
  assert.match(issue, /WHERE scope = 'SU' AND month = v_year\)/);
  assert.match(issue, /VALUES \('SU', v_year, v_seed \+ 1\)/);
  assert.match(issue, /ON CONFLICT \(scope, month\) DO UPDATE SET "lastNo" = c\."lastNo" \+ 1/);
  // seed ผูกกับ **ปี** ไม่ใช่ YYMM — ผูกกับเดือนเมื่อไร เลขของเดือนก่อนในปีเดียวกันถูกออกซ้ำ
  assert.match(issue, /WHERE "baseNo" LIKE 'SU-' \|\| v_year \|\| '%'/);
  assert.doesNotMatch(issue, /LIKE 'SU-' \|\| p_yymm/);
  assert.match(issue, /max\(right\("baseNo", 4\)::integer\)/);
});

test('RPC: รูปเลข SU-YYMM + เลขรัน 4 หลัก · เกิน 9999 ล้มให้เห็น · เดือนผิดล้มก่อนแตะอะไร', () => {
  assert.equal(SURVEY_REPORT_RUNNING_WIDTH, 4);
  assert.match(issue, /p_yymm !~ '\^\[0-9\]\{2\}\(0\[1-9\]\|1\[0-2\]\)\$'/);
  assert.match(issue, /RAISE EXCEPTION 'survey_report_month_invalid/);
  assert.ok(issue.indexOf('survey_report_month_invalid') < issue.indexOf('FOR UPDATE'));
  assert.match(issue, /IF v_no > 9999 THEN RAISE EXCEPTION 'survey_report_sequence_exhausted/);
  assert.match(issue, /v_base := 'SU-' \|\| p_yymm \|\| lpad\(v_no::text, 4, '0'\);/);
  assert.match(issue, /RETURN v_base \|\| '-' \|\| v_rev::text;/);
});

test('RPC: ใบที่ใช้อยู่ยังมี = ไม่ออกซ้อน (ข้อความชัดกว่าปล่อยชน unique index)', () => {
  assert.match(issue, /WHERE "requestId" = p_request_id AND status = 'current'/);
  assert.match(issue, /RAISE EXCEPTION 'survey_report_already_current/);
});

test('RPC: ผู้อนุมัติมาจากคำตอบบนหัวใบ ไม่ใช่จากผู้กดออกเอกสาร · อ่านคีย์ของ p_row ครบสี่ตัว', () => {
  assert.match(issue, /v_req\."answeredById", v_req\."answeredByName", v_req\."answeredAt"/);
  const keys = [...issue.matchAll(/p_row->>?'([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['images', 'issuedById', 'issuedByName', 'snapshot']);
  assert.match(issue, /RAISE EXCEPTION 'survey_report_snapshot_required/);
});

test('RPC: เรียกได้เฉพาะ service_role', () => {
  const sig = 'public.issue_survey_report(text, text, timestamptz, text, jsonb)';
  const flat = code.replace(/\s+/g, ' ');
  assert.ok(flat.includes(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`));
  assert.ok(flat.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`));
  // ลายเซ็นใน REVOKE/GRANT ต้องตรงกับพารามิเตอร์จริง — ไม่ตรง = คำสั่งล้มกลางไฟล์ตอนวางลง SQL Editor
  const params = between('public.issue_survey_report(', ')').split(',').map((p) => p.trim().split(/\s+/).slice(-1)[0]);
  assert.deepEqual(params, ['text', 'text', 'timestamptz', 'text', 'jsonb']);
});

/* ── ดึงกลับ / เปิดใบกลับ = ใบเดิมถูกแทนที่ ───────────────────────── */

test('🔴 ทริกเกอร์บนคำร้อง: ยิงเฉพาะตอน answeredAt ถูกล้างของใบประเมินพื้นที่', () => {
  const flat = code.replace(/\s+/g, ' ');
  assert.ok(flat.includes(
    'CREATE TRIGGER dept_requests_supersede_survey_report AFTER UPDATE OF "answeredAt" ON public.dept_requests '
    + 'FOR EACH ROW WHEN (OLD."answeredAt" IS NOT NULL AND NEW."answeredAt" IS NULL AND NEW.kind = \'site_survey\') '
    + 'EXECUTE FUNCTION public.supersede_survey_reports_on_unanswer();',
  ));
});

test('ทริกเกอร์: แทนที่เฉพาะใบที่ใช้อยู่ · เหตุ = เปิดใบกลับเมื่อ reopenedAt เปลี่ยน ไม่งั้นดึงกลับ', () => {
  assert.match(supersede, /SET status = 'superseded', "supersededAt" = now\(\)/);
  assert.match(supersede, /CASE WHEN NEW\."reopenedAt" IS DISTINCT FROM OLD\."reopenedAt"\s+THEN 'reopen' ELSE 'recall' END/);
  assert.match(supersede, /WHERE "requestId" = NEW\.id AND status = 'current'/);
  assert.match(supersede, /RETURN NULL;/);
});

/* ── ที่เก็บไฟล์ + สิทธิ์ ─────────────────────────────────────────── */

test('bucket survey-report: ส่วนตัว · 50 MB · JPEG กับ PDF เท่านั้น', () => {
  const bucket = between('INSERT INTO storage.buckets', ';');
  assert.match(bucket, /'survey-report', 'survey-report', false, 52428800, ARRAY\['image\/jpeg', 'application\/pdf'\]/);
  assert.match(bucket, /public = false/);
});

test('🔴 ตารางเข้าได้เฉพาะ service_role — RLS เปิด ไม่มี policy · anon/authenticated ถูกถอนสิทธิ์', () => {
  const flat = code.replace(/\s+/g, ' ');
  assert.ok(flat.includes('ALTER TABLE public.service_survey_reports ENABLE ROW LEVEL SECURITY;'));
  assert.ok(flat.includes('REVOKE ALL ON TABLE public.service_survey_reports FROM anon, authenticated;'));
  assert.ok(flat.includes('GRANT ALL ON TABLE public.service_survey_reports TO service_role;'));
  assert.doesNotMatch(code, /CREATE POLICY/i);
});

/* ── มาตรฐานเอกสาร FM-TS-01 ───────────────────────────────────────── */

test('มาตรฐานเอกสาร siteSurvey: FM-TS-01 Rev.00 · seed เฉพาะเมื่อยังไม่มี · ชี้ฉบับที่เผยแพร่', () => {
  const seed = between('INSERT INTO public.document_standard_versions', ');');
  assert.match(seed, /'document-standard-siteSurvey-v1', 'siteSurvey', 1, 'published'/);
  assert.match(seed, /'รายงานการประเมินพื้นที่', 'SITE SURVEY REPORT'/);
  assert.match(seed, /'FM-TS-01', '00', DATE '2026-09-29', 'teal'/);
  assert.match(seed, /WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.document_standard_versions WHERE "documentKey" = 'siteSurvey'/);
  assert.match(between('INSERT INTO public.document_standards ("documentKey")', ';'), /VALUES \('siteSurvey'\)\s+ON CONFLICT \("documentKey"\) DO NOTHING/);
  const flat = code.replace(/\s+/g, ' ');
  assert.match(flat, /UPDATE public\.document_standards SET "publishedVersionId" = \( SELECT id FROM public\.document_standard_versions WHERE "documentKey" = 'siteSurvey' AND status = 'published'/);
  assert.match(flat, /WHERE "documentKey" = 'siteSurvey' AND "publishedVersionId" IS NULL;/);
});

test('รูปแบบเลขที่ที่ seed ผ่านด่านของทะเบียนมาตรฐาน และประกอบได้เลขเดียวกับตัวประกอบของเรา', () => {
  const pattern = code.match(/'(SU-\{YY\}\{MM\}\{RUNNING:4\}-\{REVISION\})'/)?.[1];
  assert.ok(pattern, 'หารูปแบบเลขที่ใน seed ไม่เจอ');
  const checked = validateNumberingPattern(pattern);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(
    formatDocumentNumber(pattern, { date: new Date('2026-09-26T03:01:26Z'), running: 1, revision: 0 }),
    formatSurveyReportNo({ yymm: '2609', running: 1, rev: 0 }),
  );
});
