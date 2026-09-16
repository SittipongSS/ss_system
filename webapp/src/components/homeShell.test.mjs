// ── เปลือกบน /home (ADR 0016 · PR3) — ด่านซอร์สของ AppLayout ────────────────
//
// AppLayout เป็น client component ที่ import มารันในเทสต์ไม่ได้ ⇒ ล็อกที่ซอร์ส
// (แพตเทิร์นเดียวกับ navMenuNames.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHELL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AppLayout.js'), 'utf8');
const codeOnly = SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('เปลือกอ่านธงของหน้าจากที่เดียว ไม่สะกดเงื่อนไข pathname เอง', () => {
  assert.match(SHELL, /import \{[^}]*shellFlagsFor[^}]*\} from '@\/config\/navigation'/);
  assert.match(codeOnly, /const flags = shellFlagsFor\(pathname\)/);
  /* ห้ามมีด่าน '/home' ที่ตัดสิน **รูปทรงของเปลือก** กระจายอยู่นอก shellFlagsFor
     ที่เหลือได้เฉพาะตัวไฮไลต์ลิงก์ "หน้าแรก" ว่ากำลังอยู่หน้านั้น (คนละเรื่องกับรูปทรง) */
  for (const hit of codeOnly.match(/[^\n]*pathname === '\/home'[^\n]*/g) || []) {
    assert.match(hit, /active/, `เงื่อนไข pathname === '/home' นอก shellFlagsFor: ${hit.trim()}`);
  }
});

/* 🔴 ต้อง **ไม่วาด** ไม่ใช่ซ่อนด้วย CSS — ซ่อนแล้วปุ่มยังอยู่ในลำดับ Tab และโปรแกรม
   อ่านจอยังอ่านตัวเลขบนเมนูย่อย ซึ่ง ADR 0016 ข้อ 4 ห้ามบนหน้าแรก */
test('⭐ หน้าแรกไม่วาดตัวสลับระบบและแถวระบบ — สองก้อนที่ถือตัวเลขบนหัว', () => {
  assert.match(codeOnly, /\{!flags\.hideSystemSwitcher && \(\s*<div className="topnav-sys"/);
  assert.match(codeOnly, /\{!flags\.hideSystemSwitcher && barGroups\.length > 0 && \(/);
});

test('แฮมเบอร์เกอร์ · แถวเมนูของระบบ · แถบล่างมือถือ อยู่ใต้ธงเดียวกัน', () => {
  assert.match(codeOnly, /const isBareShell = flags\.hideSystemMenu/);
  for (const marker of [/\{!isBareShell && \(\s*<button[\s\S]{0,200}sidenav-hamburger/,
    /\{!isBareShell && <nav className="topnav-menu"/,
    /\{!isBareShell && \(\s*<MobileBottomNav/]) {
    assert.match(codeOnly, marker);
  }
});

test('ตัวเลขบนหัวของหน้าอื่นไม่ถูกแตะ — ป้ายกระดิ่งก็ยังอยู่', () => {
  // navCountFor/navCountForSystem ยังถูกเรียกตามเดิม (ห้ามกลายเป็นชุดว่างทั้งระบบ)
  assert.ok([...codeOnly.matchAll(/navCountFor\(navCounts/g)].length >= 2);
  assert.ok([...codeOnly.matchAll(/navCountForSystem\(navCounts/g)].length >= 2);
  assert.match(codeOnly, /<NotificationBell/);
});

/* 🐞 `if (!role) return null` = จอว่างเปล่าไม่มีแม้แต่หัวเว็บ ทั้งตอนกำลังโหลดและ
   ตอนอ่าน session ไม่สำเร็จ · หน้าแรกเดิมมีสองสถานะนี้ของตัวเอง ซึ่งกำลังจะถูกลบ */
test('⭐ เปลือกมีสถานะโหลดและสถานะ error ของตัวเอง ไม่ใช่จอว่าง', () => {
  assert.doesNotMatch(codeOnly, /if \(!role\) return null/);
  assert.match(codeOnly, /if \(!role\) return <ShellState kind="loading" \/>/);
  assert.match(codeOnly, /if \(authError\)/);
  assert.match(codeOnly, /function ShellState\(/);
  // ทางออกสองทาง — ไม่มีทางตัน
  assert.match(SHELL, /ลองใหม่/);
  assert.match(SHELL, /กลับไปหน้าเข้าสู่ระบบ/);
});

test('ตัวตัดสินว่า "หมดสิทธิ์" กับ "เน็ตสะดุด" มาจากฟังก์ชันล้วนตัวเดียว', () => {
  assert.match(SHELL, /import \{ authOutcome \} from '@\/lib\/authOutcome'/);
  assert.match(codeOnly, /const outcome = authOutcome\(result\)/);
  // เด้งออกได้ทางเดียว: เมื่อ outcome บอกว่า login
  assert.match(codeOnly, /if \(outcome === 'login'\) \{ router\.replace\('\/'\); return; \}/);
});

test('ตัวเลขชุดเดียวต่อหน้า — เปลือกเป็นคนแจก หน้าไม่ยิงเอง', () => {
  assert.match(codeOnly, /<NavCountsContext\.Provider value=\{navCountsState\}>/);
  // DetailPinBar ต้องยังเป็นลูกตัวแรกของ .page (scrollAnchorOffset ล็อกไว้)
  assert.match(SHELL, /<div className="page">\s*\{\/\*[\s\S]*?\*\/\}\s*<DetailPinBar \/>/);
  // Provider ต้องอยู่ **ใน** .page ไม่ใช่ครอบทั้งเปลือก (ไม่งั้นมันไปกั้น DetailPinBar)
  assert.ok(SHELL.indexOf('<NavCountsContext.Provider') > SHELL.indexOf('<DetailPinBar />'));
});

test('หน้าแรกได้คลาสของตัวเองไว้ให้ CSS จับ', () => {
  assert.match(SHELL, /flags\.homeHub \? ' home-context' : ''/);
});

/* ── ผลตรวจหลังขึ้น production 16/09 ─────────────────────────────────────── */

test('จอ "อ่านตัวตนไม่สำเร็จ": ประกาศให้โปรแกรมอ่านจอรู้ และโฟกัสไม่หายตอนกดลองใหม่', () => {
  /* 🐞 เดิม role="status" อยู่ในสาขา loading ที่ถูก unmount ⇒ ตอนสลับเป็น error ไม่มีเสียงเลย
     และ setAuthError(null) บรรทัดแรกของ loadUser ทำให้ปุ่มที่กดหายไปกลางคัน โฟกัสตกไป <body> */
  assert.match(codeOnly, /<div className="page" role="status" aria-live="polite">/);
  assert.match(codeOnly, /errorRef\.current\?\.focus\(/);
  assert.match(codeOnly, /disabled=\{busy\}/);
  assert.doesNotMatch(codeOnly, /setAuthError\(null\)/);
});

test('วงโฟกัสบนพื้นกรมท่าใช้สีของพื้นนั้น ไม่ใช่สีเน้นของพื้นอ่อน', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.account-menu-trigger:focus-visible \{[\s\S]{0,200}outline: 2px solid var\(--navy-fg\)/);
});
