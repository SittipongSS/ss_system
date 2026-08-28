// ── ประวัติและค่าตั้งของเครื่องหนึ่งตัว (จอ asset) ────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { assetTimeline, settingOutlier, settingText } from './assetHistory.js';

const visits = [
  { id: 'V1', actualDate: '2026-06-10' },
  { id: 'V2', actualDate: '2026-07-08' },
  { id: 'V3', actualDate: '2026-08-05' },
];
const assetsById = new Map([
  ['A1', { id: 'A1', label: 'เครื่องที่ 1' }],
  ['A9', { id: 'A9', label: 'เครื่องสำรอง' }],
]);

test('ประวัติเรียงใหม่สุดก่อน และรวมวันติดตั้ง/ถอดจากคอลัมน์ของเครื่องเอง', () => {
  const rows = assetTimeline({
    asset: { id: 'A1', installedAt: '2026-01-15', removedAt: '2026-08-05' },
    results: [{ id: 'R1', visitId: 'V2', assetId: 'A1', outcome: 'done' }],
    visits, assetsById,
  });
  assert.deepEqual(rows.map((r) => r.date), ['2026-08-05', '2026-07-08', '2026-01-15']);
  assert.equal(rows[0].kind, 'removed');
  assert.equal(rows[2].kind, 'installed');
});

test('⭐ เครื่องที่ "ถูกเปลี่ยน" กับเครื่องที่ "เอามาแทน" ต้องอ่านออกว่าคนละเรื่อง', () => {
  const swap = { id: 'R2', visitId: 'V3', assetId: 'A1', outcome: 'swapped', reason: 'เครื่องชำรุด', replacedByAssetId: 'A9' };
  const onOld = assetTimeline({ asset: { id: 'A1' }, results: [swap], visits, assetsById });
  assert.equal(onOld[0].kind, 'swapped');
  assert.equal(onOld[0].replacedBy, 'เครื่องสำรอง');
  assert.equal(onOld[0].detail, 'เครื่องชำรุด');

  const onNew = assetTimeline({ asset: { id: 'A9' }, results: [swap], visits, assetsById });
  assert.equal(onNew[0].kind, 'installed_as_replacement');
  assert.match(onNew[0].label, /เอามาแทน เครื่องที่ 1/);
});

test('ของที่ใช้ในนัดนั้นติดมากับเหตุการณ์', () => {
  const rows = assetTimeline({
    asset: { id: 'A1' },
    results: [{ id: 'R1', visitId: 'V2', assetId: 'A1', outcome: 'done' }],
    items: [{ id: 'I1', visitId: 'V2', assetId: 'A1', label: 'A Breath of Dream', qty: 300, unit: 'ml' }],
    visits, assetsById,
  });
  assert.match(rows[0].used, /A Breath of Dream 300 ml/);
});

test('ไม่มีเครื่อง = ไม่มีประวัติ ต้องไม่ระเบิด', () => {
  assert.deepEqual(assetTimeline({}), []);
});

const peer = (id, workSec, pauseSec, over = {}) => ({ id, zoneId: 'Z1', settings: { workSec, pauseSec }, ...over });

test('⭐ เตือนเมื่อเครื่องตั้งต่างจากเพื่อนในโซนเดียวกันมาก — บอกว่าต่าง ไม่บอกว่าผิด', () => {
  const target = peer('A1', 60, 180);            // duty 25%
  const out = settingOutlier(target, [peer('A2', 30, 225), peer('A3', 30, 225)]);  // duty 11.8%
  assert.ok(out);
  assert.ok(out.pct > 20);
  assert.match(out.text, /พ่นถี่กว่า/);
  assert.doesNotMatch(out.text, /ผิด|แก้/);
});

test('ต่างกันน้อยกว่า 20% ไม่เตือน — ป้ายที่ขึ้นทุกเครื่องคือป้ายที่ไม่มีใครอ่าน', () => {
  assert.equal(settingOutlier(peer('A1', 30, 220), [peer('A2', 30, 225)]), null);
});

test('ไม่มีค่าตั้ง หรือไม่มีเพื่อนในโซน = ไม่เตือน ไม่ใช่เดา', () => {
  assert.equal(settingOutlier({ id: 'A1', settings: {} }, [peer('A2', 30, 225)]), null);
  assert.equal(settingOutlier(peer('A1', 30, 225), []), null);
  assert.equal(settingOutlier(peer('A1', 30, 225), [{ id: 'A2', settings: {} }]), null);
});

test('เครื่องที่ถอดออกแล้วไม่ถูกนับเป็นตัวเทียบ', () => {
  assert.equal(settingOutlier(peer('A1', 60, 180), [peer('A2', 30, 225, { status: 'removed' })]), null);
});

test('ค่าตั้งอ่านออกเป็นภาษาคน ไม่ใช่ 30/225', () => {
  assert.equal(settingText({ workSec: 30, pauseSec: 225 }), 'พ่น 30 วินาที · พัก 3 นาที 45 วินาที');
  assert.equal(settingText({ workSec: 30, pauseSec: 120 }), 'พ่น 30 วินาที · พัก 2 นาที');
  assert.equal(settingText({ workSec: 30, pauseSec: 45 }), 'พ่น 30 วินาที · พัก 45 วินาที');
  assert.equal(settingText({}), null);
});
