// ── ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" ฝั่งเบราว์เซอร์ (ประเมินจากแบบ · งวด S2b §2.4) ───────────────
//
// ⭐ สองจังหวะ: ① ให้ server คัดลอกไฟล์ของฝ่ายขายเป็นไฟล์ใหม่ (ได้ใบรับการอัปของคนกด) ② แนบไฟล์ใหม่ผ่านเส้นไฟล์แนบเส้นเดียวของระบบ
// 🔴 จังหวะ ② ล้ม = ต้องถอยไฟล์ที่เพิ่งคัดลอก (`DELETE /api/upload`) — ไม่งั้นเหลือไฟล์กำพร้าบน Drive ทุกครั้งที่ด่านแนบปฏิเสธ
// ⚠️ เทสต์ยัด `fetch` ปลอม — ไม่มีคำขอไหนออกเครือข่าย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reuseSalesFileAsPlan } from './surveyPlanReuse.js';
import { attachUploadedFile, uploadAttachment } from '../master/attachmentUpload.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const COPY = { url: 'https://drive.google.com/file/d/COPY1/view', driveFileId: 'COPY1', fileName: 'plan.png', mimeType: 'image/png', sizeBytes: 2048 };

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    return handler(call);
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('⭐ สำเร็จ: ยิงเส้นคัดลอกของพื้นที่นั้นด้วย ref ของไฟล์ แล้วแนบไฟล์ใหม่เป็นภาพแบบ (survey_plan) ของพื้นที่เดียวกัน', async () => {
  for (const ref of [{ kind: 'request', attachmentId: 'ATT-1' }, { kind: 'thread', updateId: 'EU-1', index: 2 }]) {
    const { result, calls } = await withFetch((call) => (call.url.includes('plan-from-sales')
      ? json(201, COPY)
      : json(201, { id: 'ATT-NEW', docType: 'survey_plan' })), () => reuseSalesFileAsPlan({ requestId: 'REQ 1', zoneId: 'SZ/1', ref }));
    assert.deepEqual(result, { ok: true, error: null, attachment: { id: 'ATT-NEW', docType: 'survey_plan' } });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      url: '/api/service/surveys/REQ%201/zones/SZ%2F1/plan-from-sales', method: 'POST', body: { source: ref },
    });
    assert.deepEqual(calls[1], {
      url: '/api/master/attachments',
      method: 'POST',
      body: {
        entityType: 'service_survey_zone', entityId: 'SZ/1', docType: 'survey_plan',
        fileUrl: COPY.url, driveFileId: 'COPY1', fileName: 'plan.png', mimeType: 'image/png', sizeBytes: 2048, metadata: null,
      },
    });
  }
});

test('🔴 เส้นคัดลอกปฏิเสธ: คืนข้อความของ server ตรงตัว · ไม่แนบ ไม่ถอยอะไร (ยังไม่มีไฟล์ใหม่)', async () => {
  const N28 = 'ใช้ไฟล์นี้จากเธรดไม่ได้ — เปิดไฟล์ บันทึกลงเครื่อง แล้วแนบที่ช่องภาพแบบเอง';
  const { result, calls } = await withFetch(() => json(409, { error: N28 }),
    () => reuseSalesFileAsPlan({ requestId: 'REQ1', zoneId: 'SZ1', ref: { kind: 'thread', updateId: 'EU-1', index: 0 } }));
  assert.deepEqual(result, { ok: false, error: N28, attachment: null });
  assert.equal(calls.length, 1);
});

test('🔴 แนบไม่ผ่าน: ถอยไฟล์ที่เพิ่งคัดลอกด้วย DELETE /api/upload แล้วคืนเหตุของเส้นไฟล์แนบ', async () => {
  const { result, calls } = await withFetch((call) => {
    if (call.url.includes('plan-from-sales')) return json(201, COPY);
    if (call.method === 'DELETE') return json(200, { ok: true });
    return json(403, { error: 'ไม่มีสิทธิ์แนบไฟล์ของพื้นที่นี้' });
  }, async () => {
    const out = await reuseSalesFileAsPlan({ requestId: 'REQ1', zoneId: 'SZ1', ref: { kind: 'request', attachmentId: 'ATT-1' } });
    await settle();
    return out;
  });
  assert.deepEqual(result, { ok: false, error: 'ไม่มีสิทธิ์แนบไฟล์ของพื้นที่นี้', attachment: null });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
    'POST /api/service/surveys/REQ1/zones/SZ1/plan-from-sales',
    'POST /api/master/attachments',
    'DELETE /api/upload',
  ]);
  assert.deepEqual(calls[2].body, { driveFileId: 'COPY1' });
});

test('ต่อไม่ติด / คำตอบของเส้นคัดลอกไม่มีไฟล์ = ไม่สำเร็จพร้อมข้อความไทย ไม่โยน · ไม่มี ref หรือ id = ไม่ยิงอะไรเลย', async () => {
  const down = await withFetch(() => { throw new TypeError('Failed to fetch'); },
    () => reuseSalesFileAsPlan({ requestId: 'REQ1', zoneId: 'SZ1', ref: { kind: 'request', attachmentId: 'ATT-1' } }));
  assert.equal(down.result.ok, false);
  assert.match(down.result.error, /เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/);
  assert.doesNotMatch(down.result.error, /Failed to fetch/);

  const empty = await withFetch(() => json(201, {}),
    () => reuseSalesFileAsPlan({ requestId: 'REQ1', zoneId: 'SZ1', ref: { kind: 'request', attachmentId: 'ATT-1' } }));
  assert.deepEqual(empty.result, { ok: false, error: 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง', attachment: null });
  assert.equal(empty.calls.length, 1, 'ไม่มีไฟล์ใหม่ = ไม่แนบ');

  for (const args of [{ requestId: '', zoneId: 'SZ1', ref: { kind: 'request', attachmentId: 'A' } }, { requestId: 'R', zoneId: null, ref: { kind: 'request', attachmentId: 'A' } }, { requestId: 'R', zoneId: 'SZ1', ref: null }]) {
    const none = await withFetch(() => json(500, {}), () => reuseSalesFileAsPlan(args));
    assert.equal(none.result.ok, false);
    assert.equal(none.calls.length, 0);
  }
});

test('attachUploadedFile: ขั้นสองตัวเดียวของทุกผู้เรียก — uploadAttachment เรียกมัน (ไม่ก๊อปก้อน POST) · ล้ม = ถอยไฟล์ · ไม่มี id ไฟล์ = ไม่ถอย', async () => {
  const src = readFileSync(new URL('../master/attachmentUpload.js', import.meta.url), 'utf8');
  assert.equal(src.split("apiFetch('/api/master/attachments'").length - 1, 1, 'ก้อน POST มีชุดเดียว');
  assert.match(src, /export async function uploadAttachment\([\s\S]*?return attachUploadedFile\(\{/);
  assert.equal(typeof uploadAttachment, 'function');

  const fail = await withFetch((call) => (call.method === 'DELETE' ? json(200, {}) : json(400, { error: 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณ' })), async () => {
    const out = await attachUploadedFile({
      entityType: 'service_survey_zone', entityId: 'SZ1', docType: 'survey_plan', url: 'u', driveFileId: 'D1', fileName: 'a.png', mimeType: '', sizeBytes: 1,
    });
    await settle();
    return out;
  });
  assert.deepEqual(fail.result, { ok: false, error: 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณ' });
  assert.deepEqual(fail.calls.map((c) => c.method), ['POST', 'DELETE']);
  assert.equal(fail.calls[0].body.mimeType, null, 'ชนิดว่าง = null เหมือนเดิม');

  const noId = await withFetch(() => json(500, { error: 'พัง' }), async () => {
    const out = await attachUploadedFile({ entityType: 'x', entityId: '1', docType: 'other', url: 'u', driveFileId: null, fileName: 'a', mimeType: null, sizeBytes: 1 });
    await settle();
    return out;
  });
  assert.equal(noId.calls.length, 1);
  // แถวที่ route สร้างอ่านไม่ออก = บันทึกแล้ว ไม่ใช่ error
  const ok = await withFetch(() => new Response('ok', { status: 201 }), () => attachUploadedFile({ entityType: 'x', entityId: '1', docType: 'other', url: 'u', driveFileId: 'D', fileName: 'a', mimeType: null, sizeBytes: 1 }));
  assert.deepEqual(ok.result, { ok: true, error: null, attachment: null });
});

test('ไฟล์ฝั่งเบราว์เซอร์: เรียก API ผ่านตัวห่อกลางเท่านั้น · ไม่ดึงโมดูลของ server (Drive · ใบรับ · ตัวคัดลอก)', () => {
  const src = readFileSync(new URL('./surveyPlanReuse.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /(?<![\w.])fetch\(/);
  assert.match(src, /apiJson\(/);
  assert.doesNotMatch(src, /lib\/drive|upload\/receipts|surveyPlanCopy|supabase/);
  assert.match(src, /SURVEY_DOC_PLAN/);
});
