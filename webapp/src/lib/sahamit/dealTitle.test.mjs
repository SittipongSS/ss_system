// ── ชื่อดีลสหมิตร: SHM_แบรนด์_ชื่อสินค้า ปริมาตร (เดือนส่งของ) ──────────────────
//
// 🐞 2026-10-15 สินค้าเดียวกันคนละเดือนส่งได้ชื่อดีลตรงกันทุกใบ — มติเจ้าของ: เติมเดือนส่งท้ายชื่อ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sahamitDealTitle } from './dealTitle.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const coze = { name: 'นอร์ไนท์ เออเดอเพอร์ฟูม', brandNameEn: 'COZE', volume: 34, volumeUnit: 'ml' };

test('ฟอร์แมตเดิม (มติ 2026-07-19) ไม่เปลี่ยนเมื่อไม่ส่งเดือน', () => {
  assert.equal(sahamitDealTitle(coze), 'SHM_COZE_นอร์ไนท์ เออเดอเพอร์ฟูม 34ml');
  // แบรนด์ไทยเมื่อไม่มี EN · ไม่มีแบรนด์ = ไม่มี underscore ค้าง
  assert.equal(sahamitDealTitle({ name: 'เลิฟ มี', brandNameTh: 'ฮานาโซล' }), 'SHM_ฮานาโซล_เลิฟ มี');
  assert.equal(sahamitDealTitle({ name: 'เลิฟ มี' }), 'SHM_เลิฟ มี');
  // ชื่อจากไฟล์มีปริมาตรอยู่แล้ว = ไม่เติมซ้ำ
  assert.equal(sahamitDealTitle(coze, 'นอร์ไนท์ 34ml'), 'SHM_COZE_นอร์ไนท์ 34ml');
  assert.equal(sahamitDealTitle(null, null), 'SHM_สินค้า');
});

test('เดือนส่งของต่อท้ายชื่อ — สินค้าเดียวกันคนละเดือนแยกชื่อกันได้', () => {
  assert.equal(sahamitDealTitle(coze, null, { month: '2027-02' }), 'SHM_COZE_นอร์ไนท์ เออเดอเพอร์ฟูม 34ml (2027-02)');
  // รับวันที่เต็มได้ — ตัดเหลือเดือน
  assert.equal(sahamitDealTitle(coze, null, { month: '2027-02-15' }), 'SHM_COZE_นอร์ไนท์ เออเดอเพอร์ฟูม 34ml (2027-02)');
  assert.notEqual(sahamitDealTitle(coze, null, { month: '2027-01' }), sahamitDealTitle(coze, null, { month: '2027-02' }));
  // เดือนอ่านไม่ออก = ไม่มีวงเล็บว่าง
  assert.equal(sahamitDealTitle(coze, null, { month: '' }), 'SHM_COZE_นอร์ไนท์ เออเดอเพอร์ฟูม 34ml');
  assert.equal(sahamitDealTitle(coze, null, { month: '2027-2' }), 'SHM_COZE_นอร์ไนท์ เออเดอเพอร์ฟูม 34ml');
});

test('ปุ่มสร้างดีลจาก FC ส่งเดือนส่งของเข้าชื่อ · server.js ส่งออกตัวเดียวกัน ไม่ก๊อปสูตร', () => {
  const route = codeOnly(read('../../app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js'));
  assert.match(route, /sahamitDealTitle\(product, productName, \{ month: demandMonth \}\)/);
  const server = codeOnly(read('./server.js'));
  assert.match(server, /export \{ sahamitDealTitle \} from '@\/lib\/sahamit\/dealTitle'/);
  assert.doesNotMatch(server, /function sahamitDealTitle/);
});
