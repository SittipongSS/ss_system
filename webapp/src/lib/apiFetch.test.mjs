import test from "node:test";
import assert from "node:assert/strict";
import { apiFetch, apiJson, ApiError, ApiNetworkError, NETWORK_ERROR_MSG } from "./apiFetch.js";

// คิวคำตอบต่อการเรียกหนึ่งครั้ง: Error = fetch โยน · อย่างอื่น = Response
function stubFetch(queue) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const failedToFetch = () => new TypeError("Failed to fetch");

// ทุกเทสต์ส่ง retryDelayMs: 0 — ไม่ต้องรอ backoff จริง
const NO_WAIT = { retryDelayMs: 0 };

test("ต่อไม่ติดแล้วลองใหม่ผ่าน = คนเรียกไม่เห็น error เลย", async () => {
  const calls = stubFetch([failedToFetch(), jsonResponse({ id: "PST-1" }, 201)]);
  const saved = await apiJson("/api/pm/personal-tasks", { json: { title: "งาน" }, retry: true, ...NO_WAIT });
  assert.deepEqual(saved, { id: "PST-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.body, JSON.stringify({ title: "งาน" }));
});

// ⭐ ด่านของกติกาหลัก: เมธอดที่เขียนข้อมูลต้องไม่ลองใหม่เองโดยไม่มีใครสั่ง
test("ค่าตั้งต้น: GET ลองใหม่ · POST/PATCH/DELETE ไม่ลอง", async () => {
  const get = stubFetch([failedToFetch(), jsonResponse([1])]);
  assert.deepEqual(await apiJson("/api/products", NO_WAIT), [1]);
  assert.equal(get.length, 2);

  for (const method of ["POST", "PATCH", "DELETE"]) {
    const calls = stubFetch([failedToFetch(), jsonResponse({ id: "ซ้ำ" })]);
    await assert.rejects(
      () => apiFetch("/api/sales-planning/quotations", { method, ...NO_WAIT }),
      (e) => e instanceof ApiNetworkError,
      method,
    );
    assert.equal(calls.length, 1, method);
  }
});

test("ลองใหม่แค่ครั้งเดียว แล้วโยนข้อความไทยแทน Failed to fetch", async () => {
  const calls = stubFetch([failedToFetch(), failedToFetch()]);
  const err = await apiJson("/api/pm/personal-tasks", { json: {}, retry: true, ...NO_WAIT }).then(
    () => null,
    (e) => e,
  );
  assert.ok(err instanceof ApiNetworkError);
  assert.equal(err.message, NETWORK_ERROR_MSG);
  assert.equal(err.cause.message, "Failed to fetch");
  assert.equal(calls.length, 2);
});

test("retry: false ปิดการลองใหม่ได้แม้เป็น GET (คนเรียกสั่งเองชนะค่าตั้งต้น)", async () => {
  const calls = stubFetch([failedToFetch(), jsonResponse([1, 2])]);
  await assert.rejects(
    () => apiJson("/api/products", { retry: false, ...NO_WAIT }),
    (e) => e instanceof ApiNetworkError,
  );
  assert.equal(calls.length, 1);
});

test("คนเรียกยกเลิกเอง = ส่ง AbortError ต่อดิบ ๆ ไม่ลองใหม่", async () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  const calls = stubFetch([abort, jsonResponse({})]);
  const err = await apiFetch("/api/deals", { ...NO_WAIT }).then(() => null, (e) => e);
  assert.equal(err.name, "AbortError");
  assert.equal(calls.length, 1);
});

test("signal ถูกยกเลิกระหว่างรอ = ไม่ลองใหม่", async () => {
  const controller = new AbortController();
  const calls = stubFetch([failedToFetch(), jsonResponse({})]);
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    controller.abort();
    throw failedToFetch();
  };
  await assert.rejects(
    () => apiFetch("/api/deals", { signal: controller.signal, ...NO_WAIT }),
    (e) => e instanceof ApiNetworkError,
  );
  assert.equal(calls.length, 1);
});

test("error จาก API (มี response) ไม่ลองใหม่ — ใช้ข้อความของ API", async () => {
  const calls = stubFetch([
    jsonResponse({ error: "ทุกงานต้องผูกดีล" }, 400),
    jsonResponse({ id: "ไม่ควรถึงตัวนี้" }),
  ]);
  const err = await apiJson("/api/pm/personal-tasks", { json: {}, ...NO_WAIT }).then(
    () => null,
    (e) => e,
  );
  assert.ok(err instanceof ApiError);
  assert.equal(err.message, "ทุกงานต้องผูกดีล");
  assert.equal(err.status, 400);
  assert.equal(calls.length, 1);
});

test("502/503/504 ลองใหม่เฉพาะ GET — เมธอดที่เขียนข้อมูลไม่ลองซ้ำ", async () => {
  const getCalls = stubFetch([jsonResponse({ error: "bad gateway" }, 502), jsonResponse([1, 2])]);
  assert.deepEqual(await apiJson("/api/products", NO_WAIT), [1, 2]);
  assert.equal(getCalls.length, 2);

  const postCalls = stubFetch([jsonResponse({}, 503), jsonResponse({ id: "ซ้ำ" })]);
  await assert.rejects(
    () => apiJson("/api/pm/personal-tasks", { json: {}, fallbackError: "บันทึกไม่สำเร็จ", ...NO_WAIT }),
    (e) => e instanceof ApiError && e.status === 503 && e.message === "บันทึกไม่สำเร็จ",
  );
  assert.equal(postCalls.length, 1);
});

test("body ที่ส่งซ้ำไม่ได้ (stream) ไม่ลองใหม่", async () => {
  const stream = new ReadableStream({ start(c) { c.close(); } });
  const calls = stubFetch([failedToFetch(), jsonResponse({})]);
  await assert.rejects(
    () => apiFetch("/api/upload", { method: "POST", body: stream, duplex: "half", retry: true, ...NO_WAIT }),
    (e) => e instanceof ApiNetworkError,
  );
  assert.equal(calls.length, 1);
});

test("body ว่าง/ไม่ใช่ JSON = ได้ {} และยังอ่าน status ได้", async () => {
  stubFetch([new Response("", { status: 200 })]);
  assert.deepEqual(await apiJson("/api/ping", NO_WAIT), {});

  stubFetch([new Response("<html>gateway timeout</html>", { status: 504 })]);
  await assert.rejects(
    () => apiJson("/api/pm/personal-tasks", { json: {}, ...NO_WAIT }),
    (e) => e instanceof ApiError && e.status === 504 && e.message === "ทำรายการไม่สำเร็จ (504)",
  );
});
