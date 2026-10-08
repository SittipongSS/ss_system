import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timeoutSignal } from './timeoutSignal.js';

test('timeoutSignal: ยิงเมื่อครบเพดาน แม้ไม่มีงานอื่นยึด event loop (promise ที่ไม่มีวันจบ)', async () => {
  const { signal, clear } = timeoutSignal(30);
  try {
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason?.name, 'TimeoutError');
  } finally {
    clear();
  }
});

test('timeoutSignal: clear() ก่อนครบเพดาน = ไม่ยิง', async () => {
  const { signal, clear } = timeoutSignal(20);
  clear();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(signal.aborted, false);
});

test('ซอร์ส: โมดูลเอกสารประเมินไม่ใช้ AbortSignal.timeout() (ตัวจับเวลา unref — เทสต์ค้างถูกยกเลิกบน Node 22)', () => {
  for (const file of ['service/surveyReportImages.js', 'service/surveyReportPaper.js']) {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/AbortSignal\.timeout\(/.test(code), false, file);
  }
});

test('ซอร์ส: timeoutSignal.js ไม่ import อะไรเลย — โมดูลที่ห้ามลากของหนักเรียกใช้ได้', () => {
  const src = readFileSync(new URL('./timeoutSignal.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/^\s*import\s|\bimport\(|\brequire\(/m.test(code), false);
});
