// ── แผนที่ของเปลือกตั้งค่า — รายการเดียวที่ทั้งแถบข้างและหน้าภาพรวมใช้ร่วมกัน ──
//
// ⭐ มติผู้ใช้ 2026-08-20: ทุกหน้าตั้งค่ามีแถบรายการค้างซ้ายมือ
// ⚠️ ข้อที่เทสต์ชุดนี้กันจริง ๆ คือ "รายการสองชุด" — เดิมหน้ารวมสะกดรายการไว้เอง
// ทั้งชื่อ ไอคอน และเงื่อนไขสิทธิ์ · มีแถบข้างเพิ่มมาอีกที่แล้วจะเพี้ยนหากันทันที
// ที่ใครเพิ่มหน้าใหม่แล้วแก้ที่เดียว
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SETTINGS_NAV,
  activeSettingsHref,
  matchesSettingsQuery,
  settingsNavForUser,
  settingsNavItems,
} from './settingsNav.js';
import { SETTINGS_PATHS } from './navigation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const ADMIN = { role: 'admin', extraCaps: [] };
const AE = { role: 'ae', extraCaps: [] };

test('ทุกรายการมีครบทั้งชื่อ ชื่อสั้น ไอคอน คำอธิบาย และด่านสิทธิ์', () => {
  const hrefs = new Set();
  for (const group of SETTINGS_NAV) {
    assert.ok(group.key && group.title, 'กลุ่มต้องมี key และชื่อ');
    assert.ok(group.items.length, `กลุ่ม ${group.key} ว่าง — กลุ่มเปล่าอ่านเป็นหัวข้อลอย`);
    for (const item of group.items) {
      assert.ok(item.href.startsWith('/'), item.href);
      assert.ok(item.icon, `${item.href} ไม่มีไอคอน`);
      assert.ok(item.title && item.shortTitle && item.blurb, `${item.href} ข้อความไม่ครบ`);
      assert.equal(typeof item.visible, 'function', `${item.href} ไม่มีด่านสิทธิ์`);
      assert.ok(!hrefs.has(item.href), `${item.href} ซ้ำ`);
      hrefs.add(item.href);
    }
  }
});

test('ทุกปลายทางอยู่ในบริบทตั้งค่า — ไม่งั้นกดแล้วแถบข้างหายทั้งแถบ', () => {
  for (const item of settingsNavItems(ADMIN)) {
    assert.ok(
      SETTINGS_PATHS.some((path) => item.href === path || item.href.startsWith(`${path}/`)),
      `${item.href} ไม่อยู่ใน SETTINGS_PATHS ⇒ เปลือกตั้งค่าจะไม่ครอบหน้านั้น`,
    );
  }
});

test('สิทธิ์: แอดมินเห็นครบ · คนที่ไม่ได้ดูแลระบบเห็นเฉพาะของสาธารณะ', () => {
  const adminHrefs = settingsNavItems(ADMIN).map((item) => item.href);
  assert.equal(adminHrefs.length, SETTINGS_NAV.flatMap((group) => group.items).length);
  // AE ไม่มี master:manage / users:* / audit:view ⇒ เหลือปฏิทินทำการกับต้นแบบดีไซน์
  assert.deepEqual(settingsNavItems(AE).map((item) => item.href), ['/settings/holidays', '/settings/design-preview']);
  // กลุ่มที่ไม่เหลือรายการต้องหายไปทั้งกลุ่ม ไม่ใช่หัวข้อที่ไม่มีลูก
  for (const group of settingsNavForUser(AE)) assert.ok(group.items.length > 0, group.key);
});

test('activeSettingsHref: ยาวสุดชนะ — ไม่งั้น /settings ไฮไลต์ทับทุกหน้าย่อย', () => {
  assert.equal(activeSettingsHref('/settings/company', ADMIN), '/settings/company');
  assert.equal(activeSettingsHref('/settings/workflow-templates', ADMIN), '/settings/workflow-templates');
  // หน้าลูกของหน้าย่อยยังนับเป็นหน้านั้น
  assert.equal(activeSettingsHref('/users/42', ADMIN), '/users');
  // หน้าภาพรวมเองไม่ใช่รายการในราง ⇒ ไม่มีตัวไหนถูกไฮไลต์
  assert.equal(activeSettingsHref('/settings', ADMIN), null);
  // หน้าที่ไม่มีสิทธิ์ = ไม่ไฮไลต์ (ไม่ใช่ไฮไลต์ของคนอื่น)
  assert.equal(activeSettingsHref('/audit', AE), null);
});

test('ค้นหา: เทียบทั้งชื่อไทย ชื่อสั้น คำอธิบาย และ path ภาษาอังกฤษ', () => {
  const drive = settingsNavItems(ADMIN).find((item) => item.href === '/settings/storage');
  assert.ok(matchesSettingsQuery(drive, 'drive'));      // อยู่ในชื่อ
  assert.ok(matchesSettingsQuery(drive, 'storage'));    // อยู่ใน path
  assert.ok(matchesSettingsQuery(drive, 'ไฟล์'));
  assert.ok(matchesSettingsQuery(drive, ''), 'ค้นว่าง = เห็นทุกอัน');
  assert.ok(!matchesSettingsQuery(drive, 'ลายเซ็น'));
});

test('แถบข้างกับหน้าภาพรวมอ่านแผนที่เดียวกัน ไม่มีใครสะกดรายการเอง', () => {
  const shell = read('src/components/settings/SettingsShell.js');
  const overview = read('src/app/settings/page.js');
  for (const [name, source] of [['SettingsShell', shell], ['หน้าภาพรวม', overview]]) {
    assert.match(source, /settingsNavForUser/, `${name} ต้องอ่านจาก config/settingsNav`);
    /* คานารี: ทั้งสองไฟล์ไม่มีเหตุผลอื่นเลยที่จะเอ่ยถึงหน้าใดหน้าหนึ่งตรง ๆ
       (ลิงก์ของแถบข้าง/หน้าภาพรวมมาจากแผนที่ทั้งหมด) — เจอเมื่อไรแปลว่าเริ่มมี
       รายการชุดที่สองงอกขึ้นมา
       ⚠️ ยกเว้นการ์ด "ที่ต้องดูแล" ที่ลิงก์ไปหน้าปลายทางของตัวเลขนั้น ๆ ซึ่งเป็น
       คนละเรื่องกับสารบัญ จึงเลือกหน้าที่ไม่มีตัวเลขบนภาพรวมมาเป็นคานารี */
    assert.doesNotMatch(source, /\/settings\/company/, `${name} สะกดรายการตั้งค่าไว้เอง — รายการสองชุดจะเพี้ยนหากัน`);
  }
});

test('เปลือกตั้งค่าถูกครอบที่ AppLayout — ไม่ใช่ layout ของ /settings อย่างเดียว', () => {
  const layout = read('src/components/AppLayout.js');
  assert.match(layout, /isSettingsContext\s*\?\s*<SettingsShell/,
    '/users และ /audit อยู่คนละราก ⇒ ครอบที่ app/settings/layout.js จะไม่ได้แถบข้าง');
});

test('หน้าตั้งค่าเลิกมีปุ่ม "กลับหน้าตั้งค่า" — แถบข้างทำหน้าที่นั้นแล้ว', () => {
  const pages = [
    'src/app/settings/page.js', 'src/app/settings/company/page.js', 'src/app/settings/holidays/page.js',
    'src/app/settings/document-standards/page.js', 'src/app/settings/commercial-presets/page.js',
    'src/app/settings/workflow-templates/page.js', 'src/app/settings/cost-templates/page.js',
    'src/app/settings/signature-coverage/page.js', 'src/app/settings/storage/page.js',
    'src/app/settings/design-preview/page.js', 'src/app/users/page.js', 'src/app/audit/page.js',
  ];
  for (const rel of pages) {
    const source = read(rel);
    // AccessDenied ยังมี back ได้ — คนที่ไม่มีสิทธิ์ไม่เห็นแถบข้างของหน้านั้น
    const body = source.slice(source.indexOf('<Workspace'));
    assert.doesNotMatch(body, /กลับหน้าตั้งค่า/, `${rel} ยังมีปุ่มถอยกลับซ้ำกับแถบข้าง`);
  }
});

test('หัวหน้าทุกใบมาจาก Workspace ตัวเดียว ไม่ใช่ .premium-header ที่เขียนเอง', () => {
  const pages = [
    'src/app/settings/company/page.js', 'src/app/settings/holidays/page.js',
    'src/app/settings/document-standards/page.js', 'src/app/settings/commercial-presets/page.js',
    'src/app/settings/workflow-templates/page.js', 'src/app/settings/cost-templates/page.js',
    'src/app/settings/signature-coverage/page.js', 'src/app/settings/storage/page.js',
    'src/app/users/page.js', 'src/app/audit/page.js',
  ];
  for (const rel of pages) {
    const source = read(rel);
    assert.doesNotMatch(source, /hideHeader/, `${rel} ยังปิดหัวของ Workspace แล้ววาดเอง`);
    assert.doesNotMatch(source, /className="premium-header"/, `${rel} ยังเขียนหัวหน้าเอง`);
  }
});
