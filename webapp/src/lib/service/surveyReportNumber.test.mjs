// ── เลขที่รายงานการประเมินพื้นที่ `SU-YYMMXXXX-R` (mig 0401 · มติเจ้าของ 28/09–01/10) ───────────
//
// ⭐ ล็อกสามเรื่อง: ① รูปเลข = รูปเดียวกับ QT/SO (เลขฐาน + ขีด + ฉบับ) ② `YYMM` มาจากนาฬิกาไทย
//   ③ ตัวตัดรอบของเลขรันคือ **ปี** ไม่ใช่เดือนที่เห็นในเลข (กับดักเดียวกับ RQ · `requests/docNo.js`)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_REPORT_COUNTER_SCOPE,
  SURVEY_REPORT_RUNNING_WIDTH,
  formatSurveyReportNo,
  parseSurveyReportNo,
  surveyReportCounterYear,
  surveyReportFileName,
  surveyReportYymm,
} from './surveyReportNumber.js';

test('YYMM มาจากนาฬิกาไทย — ตีหนึ่งของวันที่ 1 ต.ค. (ไทย) ยังเป็น 30 ก.ย. ใน UTC', () => {
  // 2026-09-30T18:30Z = 2026-10-01 01:30 เวลาไทย
  assert.equal(surveyReportYymm(new Date('2026-09-30T18:30:00Z')), '2610');
  assert.equal(surveyReportYymm('2026-09-26T03:01:26.314+00:00'), '2609');
  // ข้ามปี: 31 ธ.ค. 18:00Z = 1 ม.ค. 01:00 ไทย ⇒ รอบเลขรันขึ้นปีใหม่
  assert.equal(surveyReportYymm(new Date('2026-12-31T18:00:00Z')), '2701');
  assert.equal(surveyReportCounterYear(new Date('2026-12-31T18:00:00Z')), '27');
});

test('คีย์ตัวนับ = SU + ปี (ไม่ใช่เดือน) · เลขรัน 4 หลัก', () => {
  assert.equal(SURVEY_REPORT_COUNTER_SCOPE, 'SU');
  assert.equal(SURVEY_REPORT_RUNNING_WIDTH, 4);
  assert.equal(surveyReportCounterYear('2026-09-26T03:01:26.314+00:00'), '26');
});

test('ประกอบเลข: SU-26090001-0 · ดึงกลับแล้วส่งใหม่ = R ถัดไปบนเลขฐานเดิม', () => {
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 1, rev: 0 }), 'SU-26090001-0');
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 1, rev: 1 }), 'SU-26090001-1');
  assert.equal(formatSurveyReportNo({ yymm: '2612', running: 9999, rev: 12 }), 'SU-26129999-12');
  // ไม่ส่ง rev = ฉบับแรก
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 42 }), 'SU-26090042-0');
});

test('ประกอบเลข: ค่าที่ออกเลขไม่ได้ = null (ไม่เดา ไม่ตัดหลัก)', () => {
  assert.equal(formatSurveyReportNo({ yymm: '2613', running: 1 }), null); // ไม่มีเดือน 13
  assert.equal(formatSurveyReportNo({ yymm: '269', running: 1 }), null);
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 0 }), null);
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 10000 }), null); // เกิน 4 หลัก = รอบเต็ม
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 1.5 }), null);
  assert.equal(formatSurveyReportNo({ yymm: '2609', running: 1, rev: -1 }), null);
  assert.equal(formatSurveyReportNo(), null);
});

test('แกะเลข: ได้เลขฐาน · ปี · เดือน · เลขรัน · ฉบับ', () => {
  assert.deepEqual(parseSurveyReportNo('SU-26090001-0'), {
    docNo: 'SU-26090001-0', baseNo: 'SU-26090001', yymm: '2609', year: '26', month: '09', running: 1, rev: 0,
  });
  assert.deepEqual(parseSurveyReportNo(' SU-26129999-12 '), {
    docNo: 'SU-26129999-12', baseNo: 'SU-26129999', yymm: '2612', year: '26', month: '12', running: 9999, rev: 12,
  });
});

test('แกะเลข: ของที่ไม่ใช่เลข SU = null', () => {
  for (const bad of ['', null, undefined, 'SU-26090001', 'SU-2609001-0', 'SU-26130001-0', 'RQ-AS-26090186',
    'QT-26090001-0', 'SU-26090001-', 'SU-26090001-0x', 'su-26090001-0']) {
    assert.equal(parseSurveyReportNo(bad), null, String(bad));
  }
});

test('ประกอบ ↔ แกะ กลับไปกลับมาได้ค่าเดิม', () => {
  const docNo = formatSurveyReportNo({ yymm: '2701', running: 137, rev: 3 });
  const parts = parseSurveyReportNo(docNo);
  assert.equal(formatSurveyReportNo(parts), docNo);
});

test('ชื่อไฟล์ PDF: เลขที่_ลูกค้า_ประเมินพื้นที่ · ฉบับภายในต่อท้าย _ภายใน', () => {
  assert.equal(
    surveyReportFileName('SU-26090001-0', 'บริษัท เอสล่า จำกัด', 'customer'),
    'SU-26090001-0_บริษัท เอสล่า จำกัด_ประเมินพื้นที่',
  );
  assert.equal(
    surveyReportFileName('SU-26090001-0', 'บริษัท เอสล่า จำกัด', 'internal'),
    'SU-26090001-0_บริษัท เอสล่า จำกัด_ประเมินพื้นที่_ภายใน',
  );
  // 🔴 ชื่อลูกค้ายาวจนเกินเพดานไบต์ของชื่อไฟล์ — ป้ายฉบับต้องรอด (ไม่งั้นสองฉบับได้ชื่อไฟล์เดียวกัน) ชื่อลูกค้าถูกตัดแทน
  const long = 'บริษัท ตัวอย่าง แอนด์ สปอร์ต บางกอก เทนนิส คลับ จำกัด';
  const customerFile = surveyReportFileName('SU-26090001-0', long, 'customer');
  const internalFile = surveyReportFileName('SU-26090001-0', long, 'internal');
  // 🔑 ชื่อลูกค้าถูกตัดที่ **ขอบคำ** และ **ที่เดียวกันทั้งสองฉบับ** (งบคิดจากฉบับภายใน) — สองไฟล์ต่างกันแค่ `_ภายใน`
  //    เดิม: ฉบับลูกค้า "…เทนนิส คลั" · ฉบับภายใน "…เทนน" (ตัดกลางคำ คนละจุด)
  assert.equal(customerFile, 'SU-26090001-0_บริษัท ตัวอย่าง แอนด์ สปอร์ต บางกอก_ประเมินพื้นที่');
  assert.equal(internalFile, `${customerFile}_ภายใน`);
  for (const name of [customerFile, internalFile]) assert.ok(new TextEncoder().encode(name).length <= 180, name);
  // ชื่อไทยไม่มีเว้นวรรค: ตัดที่ขอบคำตามพจนานุกรม ไม่ผ่ากลางคำ ไม่ทิ้งสระหน้า (เ แ โ ใ ไ) หรือสระบน/ล่างค้างท้าย
  const glued = 'บริษัทเอเชียแปซิฟิกอินเตอร์เนชั่นแนลโฮลดิ้งแอนด์ดีเวลลอปเมนต์คอร์ปอเรชั่นจำกัดมหาชน';
  const gluedFile = surveyReportFileName('SU-26090001-0', glued, 'customer');
  assert.equal(surveyReportFileName('SU-26090001-0', glued, 'internal'), `${gluedFile}_ภายใน`);
  const kept = gluedFile.slice('SU-26090001-0_'.length, -'_ประเมินพื้นที่'.length);
  assert.ok(glued.startsWith(kept) && kept.length >= 20, kept);
  assert.doesNotMatch(kept, /[เแโใไ]$/);
  assert.doesNotMatch(glued[kept.length], /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/);
  // คำเดียวยาวเกินงบทั้งคำ (ไม่มีขอบคำให้ตัด) = ตัดที่ขอบอักขระ — ป้ายฉบับยังรอด ทั้งสองฉบับตัดเท่ากัน
  const solid = surveyReportFileName('SU-26090001-0', 'ก'.repeat(200), 'customer');
  assert.match(solid, /^SU-26090001-0_ก+_ประเมินพื้นที่$/);
  assert.equal(surveyReportFileName('SU-26090001-0', 'ก'.repeat(200), 'internal'), `${solid}_ภายใน`);
  assert.ok(new TextEncoder().encode(`${solid}_ภายใน`).length <= 180);
  // ชื่อที่ลงได้ทั้งชื่อไม่ถูกแตะ (รวมชื่อที่ลงท้ายด้วยวงเล็บ)
  assert.equal(surveyReportFileName('SU-26090001-0', 'บริษัท เอ (ประเทศไทย)', 'internal'), 'SU-26090001-0_บริษัท เอ (ประเทศไทย)_ประเมินพื้นที่_ภายใน');
  // ชื่อลูกค้าว่าง/อักขระต้องห้าม ไม่ทำให้ชื่อไฟล์พัง
  assert.equal(surveyReportFileName('SU-26090001-0', '', 'customer'), 'SU-26090001-0_ประเมินพื้นที่');
  assert.equal(
    surveyReportFileName('SU-26090001-0', 'A/B: "C"', 'customer'),
    'SU-26090001-0_A B C_ประเมินพื้นที่',
  );
});
