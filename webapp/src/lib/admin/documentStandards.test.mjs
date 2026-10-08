import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discardDocumentStandardDraft, DocumentStandardError, loadDocumentStandardsAdmin, updateDocumentStandardDraft,
} from './documentStandards.js';
import {
  DEFAULT_NUMBERING_PATTERNS, DOCUMENT_STANDARD_KEYS, documentAccentKeysFor, normalizeDocumentStandardInput, resolveDocumentAccentKey,
} from '../documentStandards.js';
import { documentAudienceAccentKey } from '../documents/documentAudience.js';

const USER = { id: 'u1', name: 'ผู้ทดสอบ', role: 'ae_supervisor' };
const NOW = '2026-07-21T10:00:00.000Z';

const fakeSupabase = (result) => {
  const calls = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
};

test('discard เรียก discard_document_standard_draft พร้อม args ครบ และคืนแถวที่ถูกลบ', async () => {
  const row = { id: 'ds-draft', documentKey: 'quotation', formCode: 'FM-SA-01', versionNumber: 2, status: 'draft' };
  const supabase = fakeSupabase({ data: row, error: null });
  const result = await discardDocumentStandardDraft(supabase, 'ds-draft', NOW, USER);
  assert.deepEqual(result, row);
  assert.equal(supabase.calls[0].fn, 'discard_document_standard_draft');
  assert.deepEqual(supabase.calls[0].args, {
    p_version_id: 'ds-draft',
    p_expected_updated_at: NOW,
    p_actor_id: 'u1',
    p_actor_name: 'ผู้ทดสอบ',
    p_actor_role: 'ae_supervisor',
  });
});

test('discard ปฏิเสธ expectedUpdatedAt ที่ไม่ใช่เวลา — ไม่ยิง RPC', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  await assert.rejects(
    () => discardDocumentStandardDraft(supabase, 'ds-draft', 'x', USER),
    (error) => error instanceof DocumentStandardError && error.status === 400,
  );
  assert.equal(supabase.calls.length, 0);
});

test('discard แปล error: ไม่ใช่ร่าง/stale → 409, hide active → 409 ข้อความซ่อน', async () => {
  for (const [raw, check] of [
    ['document_standard_version_not_draft', (e) => e.status === 409],
    ['document_standard_draft_stale', (e) => e.status === 409],
    ['document_standard_version_hide_active_forbidden',
      (e) => e.status === 409 && e.message.includes('ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้')],
  ]) {
    const supabase = fakeSupabase({ data: null, error: { message: raw } });
    await assert.rejects(
      () => discardDocumentStandardDraft(supabase, 'ds-draft', NOW, USER),
      (error) => error instanceof DocumentStandardError && check(error),
    );
  }
});

// ── ตัวโหลด + ด่านสีรายชนิด (คีย์ siteSurvey · PR-3 ส่วน A) ─────────────────────────────────
//
// ฐานปลอมแบบ query builder — พอสำหรับสองรูปที่ไฟล์นี้ใช้: `select()` ที่ await ตรง ๆ (หลายแถว)
// และ `…eq().maybeSingle()` (แถวเดียว · มี `update()` นำหน้า = เขียน แล้วจดไว้ใน `updates`)
function fakeDb({ roots = [], versions = [] } = {}) {
  const updates = [];
  return {
    updates,
    from(table) {
      const filters = [];
      let patch = null;
      const rows = () => (table === 'document_standards' ? roots : versions)
        .filter((row) => filters.every(([column, value]) => row[column] === value));
      const builder = {
        select() { return builder; },
        order() { return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        update(values) { patch = values; return builder; },
        async maybeSingle() {
          const hit = rows()[0] || null;
          if (!patch || !hit) return { data: hit, error: null };
          updates.push({ id: hit.id, patch });
          return { data: { ...hit, ...patch }, error: null };
        },
        then(resolve, reject) { return Promise.resolve({ data: rows(), error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

const rootOf = (documentKey) => ({ documentKey, publishedVersionId: `${documentKey}-v1`, updatedAt: NOW });
const publishedOf = (documentKey) => ({
  id: `${documentKey}-v1`, documentKey, versionNumber: 1, status: 'published', formCode: 'FM-X-01', updatedAt: NOW,
});

test('ตัวโหลดคืนครบทุกคีย์ในลิสต์ รวม siteSurvey — แถวของคีย์ที่ไม่อยู่ในลิสต์ถูกข้าม', async () => {
  const supabase = fakeDb({
    roots: [...DOCUMENT_STANDARD_KEYS.map(rootOf), rootOf('retiredKey')],
    versions: [
      ...DOCUMENT_STANDARD_KEYS.map(publishedOf),
      { id: 'siteSurvey-v2', documentKey: 'siteSurvey', versionNumber: 2, status: 'draft', formCode: 'FM-TS-01', updatedAt: NOW },
    ],
  });
  const rows = await loadDocumentStandardsAdmin(supabase);
  assert.deepEqual(rows.map((row) => row.documentKey), [...DOCUMENT_STANDARD_KEYS]);
  const survey = rows.find((row) => row.documentKey === 'siteSurvey');
  assert.equal(survey.published.id, 'siteSurvey-v1');
  assert.equal(survey.draft.id, 'siteSurvey-v2');
  assert.equal(survey.versions.length, 2);
});

/* 🔴 คีย์ที่อยู่ในลิสต์แต่ไม่มีแถวตั้งต้น = ตัวโหลดโยนทั้งก้อน — และ `/api/document-standards/active` ใช้ตัวโหลดนี้
   ⇒ ผู้ใช้ทุกคนโหลดมาตรฐานไม่ได้ เอกสารทุกชนิดตกไปค่าสำรอง · ลงทะเบียนคีย์ใหม่ต้องมี migration ที่ seed แถวขึ้นก่อน
   (siteSurvey: mig 0401 ⑦ — ตรวจด้วย SELECT อ่านอย่างเดียวก่อน merge ตามสเปก PR-3 §2) */
test('ตัวโหลดโยน root_missing เมื่อคีย์ในลิสต์ไม่มีแถวตั้งต้น', async () => {
  const withoutSurvey = DOCUMENT_STANDARD_KEYS.filter((key) => key !== 'siteSurvey');
  const supabase = fakeDb({ roots: withoutSurvey.map(rootOf), versions: withoutSurvey.map(publishedOf) });
  await assert.rejects(
    () => loadDocumentStandardsAdmin(supabase),
    (error) => error instanceof DocumentStandardError && error.code === 'root_missing' && error.status === 500
      && error.message.includes('siteSurvey'),
  );
});

const draftOf = (documentKey, accentKey) => ({
  id: `${documentKey}-draft`, documentKey, versionNumber: 2, status: 'draft', accentKey, updatedAt: NOW,
  numberingPattern: 'XX-{YY}{MM}{RUNNING:4}-{REVISION}',
});
const accentInvalid = (error) => error instanceof DocumentStandardError && error.status === 400
  && error.code === 'accent_invalid' && error.message === 'Accent ที่เลือกไม่ถูกต้อง';

/* ⭐ สีของ FM-TS-01 เดินตามผู้อ่านของฉบับ (มติเจ้าของ 08/10/2026) — ไม่มีสีให้เลือก · คอลัมน์ `accentKey` ของชนิดนี้ถือค่าเดียว
   คือค่าที่ฟอร์มส่งกลับมาเอง (`resolveDocumentAccentKey` = สีของฉบับลูกค้า) · teal ไม่ผ่านกับชนิดไหนแล้ว
   ⚠️ แถวที่เผยแพร่ (seed ของ mig 0401) ถือ teal และแก้ไม่ได้ — ร่างที่ RPC คัดลอกมาจึงถือ teal ด้วย: ต้องบันทึกผ่านได้โดยไม่มีใครเลือก teal */
test('แก้ร่าง siteSurvey: รับค่าเดียวคือสีที่ฟอร์ม resolve ให้ · ตีกลับ teal และสีอื่นทุกสีโดยไม่เขียนอะไร', async () => {
  const supabase = fakeDb({ versions: [draftOf('siteSurvey', 'teal')] });
  const accepted = resolveDocumentAccentKey({ accentKey: 'teal' }, 'siteSurvey');
  assert.equal(accepted, documentAudienceAccentKey('external'));
  assert.deepEqual(documentAccentKeysFor('siteSurvey'), [accepted]);
  for (const accentKey of ['teal', 'navy', 'steel', 'amber', 'green', '', null]) {
    await assert.rejects(
      () => updateDocumentStandardDraft(supabase, 'siteSurvey-draft', { accentKey, changeNote: 'x' }, NOW, USER),
      accentInvalid,
      JSON.stringify(accentKey),
    );
  }
  assert.equal(supabase.updates.length, 0);

  const { before, after } = await updateDocumentStandardDraft(
    supabase, 'siteSurvey-draft', { accentKey: accepted, revision: '01', changeNote: 'ขึ้น Rev.01' }, NOW, USER,
  );
  // ร่างที่คัดลอก teal มา ถูกเขียนทับด้วยค่าที่ resolve แล้วตอนบันทึก — ไม่มีแถวใหม่ไหนถือ teal ต่อ
  assert.equal(before.accentKey, 'teal');
  assert.equal(after.accentKey, accepted);
  assert.notEqual(after.accentKey, 'teal');
  assert.equal(after.revision, '01');
  assert.equal(after.updatedById, 'u1');
  assert.deepEqual(supabase.updates.map((u) => u.id), ['siteSurvey-draft']);
});

/* ทั้งเส้นของปุ่ม "บันทึก" บนหน้าตั้งค่า: ร่างที่ถือ teal → ฟอร์ม (`versionForm` resolve สีด้วยชนิดของแถว) → ด่านรูปร่างของ body
   (ไม่รู้ชนิด) → ด่านรายชนิด · ต้องผ่านทั้งสองด่านโดยไม่มีจุดไหนเสนอหรือรับ teal */
test('⭐ ออกเวอร์ชันใหม่ของ FM-TS-01 จากแถวที่เผยแพร่ซึ่งถือ teal: ค่าที่ฟอร์มส่งผ่านทั้งด่านรูปร่างและด่านรายชนิด', async () => {
  const draft = {
    ...draftOf('siteSurvey', 'teal'),
    titleTh: 'รายงานการประเมินพื้นที่', titleEn: 'SITE SURVEY REPORT', formCode: 'FM-TS-01', revision: '00',
    effectiveDate: '2026-09-29', numberingPattern: DEFAULT_NUMBERING_PATTERNS.siteSurvey, changeNote: null,
  };
  const supabase = fakeDb({ versions: [draft] });
  // สิ่งที่ฟอร์มส่ง: ช่องของแถว + สีที่ resolve แล้ว + สิ่งที่ผู้ใช้แก้ (Rev · วันที่มีผล · หมายเหตุ)
  const body = {
    titleTh: draft.titleTh, titleEn: draft.titleEn, formCode: draft.formCode, numberingPattern: draft.numberingPattern,
    accentKey: resolveDocumentAccentKey(draft, draft.documentKey),
    revision: '01', effectiveDate: '2026-12-01', changeNote: 'ปรับแบบฟอร์มรอบแรก',
  };
  const normalized = normalizeDocumentStandardInput(body);
  assert.deepEqual(normalized.errors, []);
  const { after } = await updateDocumentStandardDraft(supabase, draft.id, normalized.value, NOW, USER);
  assert.equal(after.revision, '01');
  assert.equal(after.effectiveDate, '2026-12-01');
  assert.equal(after.accentKey, documentAudienceAccentKey('external'));

  // ถ้าฟอร์มส่งค่าดิบของแถว (teal) กลับไป — ตกตั้งแต่ด่านรูปร่าง ก่อนถึงฐาน
  const raw = normalizeDocumentStandardInput({ ...body, accentKey: draft.accentKey });
  assert.match(raw.errors.join(' | '), /Accent/);
});

test('แก้ร่างชนิดอื่น: teal ถูกตีกลับ (ไม่มีชนิดไหนใช้แล้ว) · สี่สีเดิมยังผ่าน', async () => {
  const supabase = fakeDb({ versions: [draftOf('quotation', 'terracotta'), draftOf('productSpec', 'teal')] });
  await assert.rejects(
    () => updateDocumentStandardDraft(supabase, 'quotation-draft', { accentKey: 'teal' }, NOW, USER),
    accentInvalid,
  );
  // FM-SA-04 รุ่นเก่าถือ teal อยู่ในฐาน — บันทึกทับด้วย teal ไม่ได้ (ฟอร์มส่งสีที่ resolve แล้วคือ terracotta)
  await assert.rejects(
    () => updateDocumentStandardDraft(supabase, 'productSpec-draft', { accentKey: 'teal' }, NOW, USER),
    accentInvalid,
  );
  assert.equal(supabase.updates.length, 0);

  for (const accentKey of ['terracotta', 'steel', 'amber', 'navy']) {
    const { after } = await updateDocumentStandardDraft(supabase, 'quotation-draft', { accentKey }, NOW, USER);
    assert.equal(after.accentKey, accentKey);
  }
  const { after } = await updateDocumentStandardDraft(supabase, 'productSpec-draft', { accentKey: 'terracotta' }, NOW, USER);
  assert.equal(after.accentKey, 'terracotta');
});

test('ด่านสีใช้ชนิดเอกสารจากแถวในฐาน ไม่เชื่อ documentKey ใน body', async () => {
  const supabase = fakeDb({ versions: [draftOf('quotation', 'terracotta'), draftOf('siteSurvey', 'teal')] });
  // body อ้างว่าเป็นใบเสนอราคา (ชนิดที่เลือก navy ได้) เพื่อขอ navy ให้ FM-TS-01 — ตัดสินด้วยชนิดของแถว จึงถูกตีกลับ
  await assert.rejects(
    () => updateDocumentStandardDraft(supabase, 'siteSurvey-draft', { documentKey: 'quotation', accentKey: 'navy' }, NOW, USER),
    accentInvalid,
  );
  assert.equal(supabase.updates.length, 0);
  /* และกลับกัน: body อ้างว่าเป็น siteSurvey (ชนิดที่รับค่าเดียว) ขณะแก้ร่างใบเสนอราคา — ยังตั้ง steel ได้ตามชนิดจริงของแถว
     (ถ้าเชื่อ body ข้อนี้จะถูกตีกลับ) · เราต์จริงส่งเฉพาะช่องที่ normalize แล้ว `documentKey` จึงไม่เคยไปถึง update */
  const { before, after } = await updateDocumentStandardDraft(
    supabase, 'quotation-draft', { documentKey: 'siteSurvey', accentKey: 'steel' }, NOW, USER,
  );
  assert.equal(before.documentKey, 'quotation');
  assert.equal(after.accentKey, 'steel');
  // teal ไม่ผ่านไม่ว่า body จะอ้างชนิดไหน
  for (const documentKey of ['siteSurvey', 'quotation', 'productSpec']) {
    await assert.rejects(
      () => updateDocumentStandardDraft(supabase, 'quotation-draft', { documentKey, accentKey: 'teal' }, NOW, USER),
      accentInvalid,
      documentKey,
    );
  }
});

test('ด่านเดิมยังอยู่ครบและมาก่อนด่านสี: ไม่พบแถว · ไม่ใช่ร่าง · รูปแบบเลขที่ตามรอบตัดของชนิด', async () => {
  const supabase = fakeDb({
    versions: [{ ...draftOf('quotation', 'terracotta'), id: 'published-row', status: 'published' }, draftOf('pdr', 'terracotta')],
  });
  await assert.rejects(
    () => updateDocumentStandardDraft(supabase, 'missing', { accentKey: 'teal' }, NOW, USER),
    (error) => error instanceof DocumentStandardError && error.status === 404,
  );
  await assert.rejects(
    () => updateDocumentStandardDraft(supabase, 'published-row', { accentKey: 'teal' }, NOW, USER),
    (error) => error instanceof DocumentStandardError && error.status === 409 && error.code === 'version_not_draft',
  );
  // PDR ตัดรอบรายเดือน ⇒ รูปแบบที่ไม่มี {MM} ถูกตีกลับด้วยด่านเลขที่ ไม่ใช่ด่านสี
  await assert.rejects(
    () => updateDocumentStandardDraft(
      supabase, 'pdr-draft', { accentKey: 'teal', numberingPattern: 'PDR-{YY}{RUNNING:4}-{REVISION}' }, NOW, USER,
    ),
    (error) => error instanceof DocumentStandardError && error.code === 'numbering_pattern_invalid',
  );
  // ไม่ได้ส่ง accentKey มา = ไม่ได้แก้สี (คอลัมน์คงค่าเดิม) — ไม่ถูกตีกลับด้วยด่านสี
  const { after } = await updateDocumentStandardDraft(supabase, 'pdr-draft', { changeNote: 'แก้หมายเหตุอย่างเดียว' }, NOW, USER);
  assert.equal(after.accentKey, 'terracotta');
  assert.equal(supabase.updates.length, 1);
});
