// ── ฉลากของทะเบียนสรรพสามิต = Artwork ของสินค้า (ศูนย์กลางเอกสารของสินค้า P1 · มติเจ้าของ 09/11/2026) ──────────────
// 🐞 ที่มา: ฉลากที่อัปจากแท็บสรรพสามิตเก็บที่ทะเบียน ไม่ขึ้นแท็บเอกสารของสินค้า · FG 46 ตัวขึ้น "ยังขาด Artwork" ทั้งที่ไฟล์มีอยู่
// สิ่งที่ล็อก: ตัวตัดสินชุดเดียว (ร่าง/ตีกลับ = ชุดปัจจุบัน · ยื่นแล้ว = ชุดที่ตรึง) · ด่านยื่น/คิว/ZIP ถามตัวนี้ ·
// ไฟล์ที่ถูกตรึงลบไม่ได้ (ปลดระวาง) · ตรึงตอนยื่นแล้วตรวจซ้ำ (ถอยเมื่อไฟล์หาย) · แผงไม่โชว์ไฟล์ปลดระวาง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARTWORK_MISSING_LABEL, LEGACY_LABEL_DOC_TYPE, PRODUCT_ARTWORK_DOC_TYPE,
  MIGRATION_DUPLICATE_RETIRED_BY, artworkSnapshotIds, currentProductArtwork, isArtworkReferenced, loadRegistrationArtwork,
  registrationArtworkFiles, registrationHasArtwork, retiredArtworkNote, usesLiveArtwork,
} from './registrationArtwork.js';
import { registrationMissing } from '../tax/requirements.js';
import { ATTACHMENT_TYPES, requiredDocKeys, unsatisfiedRequiredDocs } from '../master/attachmentTypes.js';
import { panelVisibleItems } from '../../components/attachmentsPanelItems.js';

const art = (id, createdAt, extra = {}) => ({ id, docType: PRODUCT_ARTWORK_DOC_TYPE, createdAt, metadata: {}, ...extra });
const retired = (row) => ({ ...row, metadata: { ...(row.metadata || {}), retiredAt: '2026-11-09T00:00:00Z' } });
const legacy = (id, createdAt) => ({ id, docType: LEGACY_LABEL_DOC_TYPE, createdAt, metadata: {} });

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('ร่าง/ตีกลับใช้ Artwork ปัจจุบันของสินค้า · สถานะอื่นใช้ชุดที่ตรึงไว้', () => {
  assert.equal(usesLiveArtwork('draft'), true);
  assert.equal(usesLiveArtwork('rejected'), true);
  assert.equal(usesLiveArtwork('pending_legal'), false);
  assert.equal(usesLiveArtwork('approved'), false);
});

test('Artwork ปัจจุบัน = ชนิด artwork ที่ยังไม่ปลดระวาง เรียงตามเวลาที่แนบ · ไฟล์ชนิดอื่นของสินค้าไม่นับ', () => {
  const rows = [
    art('B', '2026-11-02'),
    retired(art('OLD', '2026-10-01')),
    art('A', '2026-11-01'),
    { id: 'S', docType: 'spec_illustration', createdAt: '2026-11-03', metadata: {} },
  ];
  assert.deepEqual(currentProductArtwork(rows).map((r) => r.id), ['A', 'B']);
  assert.deepEqual(artworkSnapshotIds(rows), ['A', 'B']);
  assert.deepEqual(currentProductArtwork(null), []);
});

test('ร่าง: ฉลาก = Artwork ปัจจุบัน (ไม่สนตัวชี้เก่า) + ฉลากแบบเดิมที่ยังค้างที่ทะเบียน', () => {
  const productRows = [art('A', '2026-11-01'), retired(art('OLD', '2026-10-01'))];
  const files = registrationArtworkFiles({
    registration: { status: 'draft', labelArtworkIds: ['OLD'] },
    productRows,
    legacyRows: [legacy('L1', '2026-09-01'), { id: 'X', docType: 'approval_letter', createdAt: '2026-09-02' }],
  });
  assert.deepEqual(files.map((f) => f.id), ['A', 'L1']);
});

test('ยื่นแล้ว: ฉลาก = ชุดที่ตรึงไว้ แม้ไฟล์นั้นถูกปลดระวางไปแล้ว · Artwork ใหม่ที่เพิ่มทีหลังไม่ปนเข้ามา', () => {
  const productRows = [retired(art('OLD', '2026-10-01')), art('NEW', '2026-11-05')];
  const files = registrationArtworkFiles({
    registration: { status: 'approved', labelArtworkIds: ['OLD'] },
    productRows,
    legacyRows: [],
  });
  assert.deepEqual(files.map((f) => f.id), ['OLD']);
  // ไม่มีตัวชี้ (ทะเบียนเก่าก่อน 0427) = ใช้ฉลากแบบเดิมของทะเบียนเอง
  assert.deepEqual(registrationArtworkFiles({
    registration: { status: 'pending_legal' },
    productRows,
    legacyRows: [legacy('L1', '2026-09-01')],
  }).map((f) => f.id), ['L1']);
});

test('ด่านยื่น: ไม่มีฉลาก = ขาด "Artwork สินค้า" (ชี้ไปที่สินค้า ไม่ใช่ไฟล์ของทะเบียน) · มี = ไม่ขาด', () => {
  const base = { registration: { productId: 'P1', customerId: 'C1', isExciseTaxable: false }, customerDocTypes: new Set(['address_map']) };
  const without = registrationMissing({ ...base, hasArtwork: false });
  assert.deepEqual(without.missing.map((m) => [m.entity, m.docType, m.label]), [['product', PRODUCT_ARTWORK_DOC_TYPE, ARTWORK_MISSING_LABEL]]);
  assert.equal(registrationMissing({ ...base, hasArtwork: true }).ready, true);
  // การ์ดฉลากแบบเดิมของทะเบียนไม่บังคับแล้ว — บังคับเมื่อไรทุกใบยื่นไม่ได้ (ไม่มีจอไหนแนบชนิดนี้อีก)
  assert.deepEqual(requiredDocKeys('registration'), []);
  assert.ok(ATTACHMENT_TYPES.registration.some((t) => t.key === LEGACY_LABEL_DOC_TYPE), 'คงป้ายให้แถวเก่า');
});

test('registrationHasArtwork ตอบตามตัวตัดสินเดียวกัน — Artwork ที่ปลดระวางหมดแล้ว = ร่างยื่นไม่ได้', () => {
  assert.equal(registrationHasArtwork({ registration: { status: 'draft' }, productRows: [retired(art('A', '1'))], legacyRows: [] }), false);
  assert.equal(registrationHasArtwork({ registration: { status: 'draft' }, productRows: [art('A', '1')], legacyRows: [] }), true);
});

test('🔴 isArtworkReferenced: ถามทะเบียนที่ตรึง id นี้ · อ่านพัง = { error } ไม่ใช่ "ไม่มีใครชี้"', async () => {
  const calls = [];
  const fake = (result) => ({
    from(table) {
      calls.push(['from', table]);
      const q = {
        select(cols) { calls.push(['select', cols]); return q; },
        contains(col, val) { calls.push(['contains', col, val]); return q; },
        limit(n) { calls.push(['limit', n]); return Promise.resolve(result); },
      };
      return q;
    },
  });
  assert.deepEqual(await isArtworkReferenced(fake({ data: [{ id: 'REG-1' }], error: null }), 'A1'), { referenced: true });
  assert.deepEqual(calls.slice(0, 4), [['from', 'excise_registrations'], ['select', 'id'], ['contains', 'labelArtworkIds', ['A1']], ['limit', 1]]);
  assert.deepEqual(await isArtworkReferenced(fake({ data: [], error: null }), 'A1'), { referenced: false });
  assert.deepEqual(await isArtworkReferenced(fake({ data: null, error: { message: 'boom' } }), 'A1'), { error: 'boom' });
});

test('loadRegistrationArtwork อ่านไฟล์ของสินค้า + ของทะเบียน ผ่านตัวอ่านที่ส่งเข้ามา (เทสต์ไม่แตะฐาน)', async () => {
  const seen = [];
  const list = async (entityType, entityId) => {
    seen.push(`${entityType}:${entityId}`);
    return entityType === 'product' ? [art('A', '1')] : [legacy('L', '0')];
  };
  const out = await loadRegistrationArtwork({ id: 'REG-1', productId: 'P1', status: 'draft' }, list);
  assert.deepEqual(seen.sort(), ['product:P1', 'registration:REG-1']);
  assert.deepEqual(out.files.map((f) => f.id), ['A', 'L']);
  await assert.rejects(() => loadRegistrationArtwork({ id: 'R', productId: 'P' }, async () => { throw new Error('db'); }), /db/);
});

test('แผงไฟล์แนบไม่โชว์ไฟล์ปลดระวาง · ด่านเอกสารบังคับไม่นับไฟล์ปลดระวาง (จอกับด่านนับชุดเดียวกัน)', () => {
  const rows = [retired(art('OLD', '1')), art('A', '2')];
  assert.deepEqual(panelVisibleItems(rows, 'product', undefined).map((r) => r.id), ['A']);
  const types = [{ key: PRODUCT_ARTWORK_DOC_TYPE, label: 'Artwork สินค้า', required: true }];
  assert.deepEqual(unsatisfiedRequiredDocs('product', types, [retired(art('OLD', '1'))], '2026-11-09').map((m) => m.reason), ['absent']);
  assert.deepEqual(unsatisfiedRequiredDocs('product', types, rows, '2026-11-09'), []);
});

test('🔴 DELETE ไฟล์แนบ: Artwork ของสินค้าผ่านด่านปลดระวางก่อนลบแถว/ปล่อยไฟล์ · ประทับก่อนตรวจซ้ำ · ตรวจพัง = 500', () => {
  const src = code('../../app/api/attachments/[id]/route.js');
  const del = src.slice(src.indexOf('export async function DELETE('));
  const gate = del.indexOf('retireReferencedArtwork(');
  const recheck = del.indexOf('retireArtworkBeforeDelete(');
  const rowDelete = del.indexOf(".from('attachments').delete()");
  const release = del.indexOf('releaseAttachmentFile(att)');
  assert.ok(gate > 0 && recheck > gate, 'ต้องเรียกสองด่านตามลำดับ');
  assert.ok(recheck < rowDelete && recheck < release, 'ด่านต้องมาก่อนลบแถวและปล่อยไฟล์');
  assert.match(del, /att\.entityType === 'product' && att\.docType === PRODUCT_ARTWORK_DOC_TYPE/);
  assert.match(del, /const handledArtwork = await retireReferencedArtwork\([^)]*\);\s*if \(handledArtwork\) return handledArtwork;/);
  assert.match(del, /const racedArtwork = await retireArtworkBeforeDelete\([^)]*\);\s*if \(racedArtwork\) return racedArtwork;/);

  const fn = (name) => { const at = src.indexOf(`async function ${name}(`); return src.slice(at, src.indexOf('\n}\n', at)); };
  const first = fn('retireReferencedArtwork');
  assert.ok(first.indexOf('if (ref.error)') > 0 && first.indexOf('if (ref.error)') < first.indexOf('if (!ref.referenced) return null;'));
  assert.match(first.slice(first.indexOf('if (ref.error)'), first.indexOf('if (!ref.referenced)')), /status: 500/);
  assert.doesNotMatch(first, /\.delete\(|releaseAttachmentFile/);
  const second = fn('retireArtworkBeforeDelete');
  assert.ok(second.indexOf('retiredMetadataOf(att, user)') < second.indexOf('isArtworkReferenced(supabase, att.id)'), 'ประทับก่อนตรวจซ้ำ');
  assert.match(second.slice(second.indexOf('if (again.error)'), second.indexOf('if (again.referenced)')), /status: 500/);
  assert.doesNotMatch(second, /\.delete\(|releaseAttachmentFile/);
});

test('🔴 PATCH ทะเบียน: ออกจากร่าง/ตีกลับ = ตรึง Artwork ปัจจุบันในคำสั่งเขียนเดียวกับสถานะ แล้วตรวจซ้ำ — ไฟล์หาย = ถอยทั้งก้อน 409', () => {
  const src = code('../../app/api/excise-registrations/[id]/route.js');
  const patch = src.slice(src.indexOf('export async function PATCH('), src.indexOf('export async function DELETE('));
  assert.match(patch, /const pinsArtwork = usesLiveArtwork\(reg\.status\) && !usesLiveArtwork\(updated\.status\);/);
  const pin = patch.indexOf('updated.labelArtworkIds = artworkSnapshotIds(');
  const write = patch.indexOf(".from('excise_registrations').update(updated)");
  const verify = patch.indexOf('loadRegistrationArtwork(data, listAttachments)');
  const revert = patch.indexOf(".from('excise_registrations').update(reg)");
  assert.ok(pin > 0 && pin < write, 'ตัวชี้ต้องอยู่ในคำสั่งเขียนเดียวกับสถานะ');
  assert.ok(verify > write && revert > verify, 'ตรวจซ้ำหลังเขียน แล้วถอยเมื่อไฟล์หาย');
  assert.match(patch.slice(revert, revert + 600), /status: 409/);
  // ตรวจซ้ำต้องมาก่อนเหตุการณ์ลงเธรด/แจ้งเตือน — ถอยแล้วต้องไม่มีใครได้รับแจ้งว่ายื่นแล้ว
  assert.ok(revert < patch.indexOf('appendUpdate(supabase, { entityType: \'excise_registration\', entityId: id, ...threadEvent'));
  assert.ok(revert < patch.indexOf('notifyRegistration(supabase, {\n        action, registration: data'));
});

test('labelArtworkIds ไม่อยู่ในช่องที่ client ส่งได้ — server เขียนคนเดียว', () => {
  const perms = read('../permissions.js');
  const legal = perms.slice(perms.indexOf('LEGAL_REGISTRATION_FIELDS'), perms.indexOf('LEGAL_REGISTRATION_FIELDS') + 800);
  assert.doesNotMatch(legal.slice(0, legal.indexOf(']') + 1), /labelArtworkIds/);
  const route = code('../../app/api/excise-registrations/[id]/route.js');
  assert.match(route, /const salesEditable = \['assignee', 'metadata', 'productId', 'customerId'\];/);
});

test('แผงทะเบียนของฝ่ายขาย: ร่าง/ตีกลับแนบ Artwork ที่สินค้า · ยื่นแล้วโชว์ชุดที่ตรึง · ไม่มีปุ่มคัดลอกแบบเดิม', () => {
  const panel = code('../../components/excise/RegistrationWorkModal.js');
  assert.match(panel, /entityType="product"\s+entityId=\{productId\}/);
  assert.match(panel, /<SubmittedArtwork files=\{reg\.labelArtwork\}/);
  assert.doesNotMatch(panel, /registrationArtworkReuse|reuseProductArtwork|artwork-from-product/);
  const ra = code('../../app/tax/registrations/[id]/page.js');
  assert.match(ra, /<SubmittedArtwork files=\{s\.labelArtwork\}/);
});

test('ป้ายไฟล์ที่ทะเบียนยื่นแต่ไม่ใช่ของปัจจุบัน: สำเนาซ้ำที่ mig 0427 ซ่อน ≠ สินค้าเปลี่ยน Artwork (เจอบนจอหลังย้าย 09/11)', () => {
  assert.equal(retiredArtworkNote(art('A', '1')), null, 'ของปัจจุบันไม่มีป้าย');
  assert.match(retiredArtworkNote(retired(art('B', '1'))), /สินค้าเปลี่ยน Artwork แล้ว/);
  const dup = { ...art('C', '1'), metadata: { retiredAt: '2026-11-09', retiredBy: MIGRATION_DUPLICATE_RETIRED_BY } };
  assert.match(retiredArtworkNote(dup), /สำเนาที่ทะเบียนถือไว้/);
  // ค่าคงที่ต้องตรงกับที่ 0427 ประทับจริง
  const sql = read('../../../supabase/migrations/0427_move_registration_artwork_to_product.sql');
  assert.match(sql, new RegExp(`'retiredBy', '${MIGRATION_DUPLICATE_RETIRED_BY}'`));
  assert.match(code('../../components/excise/RegistrationWorkModal.js'), /retiredArtworkNote\(file\)/);
});
