// ตัวห่อ fetch กลางของฝั่งเบราว์เซอร์ — มีไว้แก้สองอาการที่เจอซ้ำบน production
//
// 1. **ข้อความดิบ** `TypeError: Failed to fetch` ของเบราว์เซอร์หลุดขึ้น toast ตรง ๆ
//    (เจอ 2026-08-28 ตอนกด "เพิ่มงาน" ที่ /pm/tasks) — คนใช้อ่านแล้วไม่รู้ว่าเกิดอะไร
//    และแยกไม่ออกจาก error ของระบบเราซึ่งเป็นภาษาไทยทั้งหมด
// 2. **ไม่มีการลองใหม่เลย** — คอนเนกชันสะดุดหนึ่งครั้ง (สลับ deployment, wifi กระตุก,
//    keep-alive ที่ปลายทางฝั่งโน้นถูกปิด) = งานที่พิมพ์ไว้ทั้งใบเด้งกลับให้กดเอง
//
// ⭐ **ค่าตั้งต้น: ลองใหม่เฉพาะ GET/HEAD** — เมธอดที่เขียนข้อมูลต้องขอ `retry: true` เอง
//
//    เพราะ `Failed to fetch` แปลว่า "ไม่ได้ response" **ไม่ได้แปลว่าเซิร์ฟเวอร์ไม่ได้ทำ**
//    ถ้าทำเสร็จแล้ว response หายกลางทาง การลองใหม่จะเจอผลของครั้งแรกเสมอ:
//      · POST create ⇒ ได้ของซ้ำ (เอกสาร/เลขที่ซ้ำ = เสียหายจริง)
//      · DELETE      ⇒ รอบสองได้ 404 · จอขึ้น error ทั้งที่ลบสำเร็จไปแล้ว
//      · PATCH ที่เป็น action (อนุมัติ/ยื่น) ⇒ รอบสองโดนตีกลับ "อนุมัติไปแล้ว" อาการเดียวกัน
//    ทั้งสามแบบทำให้ผู้ใช้อ่านหน้าจอผิดจากความจริง ซึ่งแย่กว่าการต้องกดเอง
//
//    เปิด `retry: true` เมื่อ **ของซ้ำถูกกว่าการเสียฟอร์มทั้งใบ** — เช่นโมดัลเพิ่มงาน
//    (งานซ้ำลบทิ้งได้ แต่ที่พิมพ์ไว้ทั้งใบหายแล้วต้องพิมพ์ใหม่)
//
// สถานะ 502/503/504 ลองใหม่ได้เฉพาะ GET/HEAD — มี response = เซิร์ฟเวอร์รับเรื่องไปแล้ว
// จะซ้ำหรือไม่เราไม่รู้ จึงไม่ลองซ้ำให้กับเมธอดที่เขียนข้อมูล

export const NETWORK_ERROR_MSG = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง";

// fetch โยนเอง = ไม่มี response (เน็ตขาด/คอนเนกชันถูกตัด/โดนส่วนขยายเบราว์เซอร์บล็อก)
export class ApiNetworkError extends Error {
  constructor(message = NETWORK_ERROR_MSG, options) {
    super(message, options);
    this.name = "ApiNetworkError";
  }
}

// มี response แต่ !res.ok — `status` และ body ที่ parse ได้ติดมาให้ตัดสินใจต่อ
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// body ที่ส่งซ้ำไม่ได้ = stream อ่านครั้งเดียวจบ · string/Blob/File/FormData/
// URLSearchParams/ArrayBuffer ส่งซ้ำได้หมด
const isReplayableBody = (body) =>
  body == null || typeof body !== "object" || typeof body.getReader !== "function";

/**
 * fetch + ลองใหม่ 1 ครั้งเมื่อ "ต่อไม่ติด" คืนค่าเป็น Response ตามเดิม
 * (ไม่แตะ body — คนเรียกอ่านเอง เหมือน fetch ปกติ)
 *
 * @param {string} url
 * @param {RequestInit & { retry?: boolean, retryDelayMs?: number }} options
 *   retry — `true`/`false` บังคับเอง · ไม่ส่ง = ลองใหม่เฉพาะ GET/HEAD (ดูหัวไฟล์)
 */
export async function apiFetch(url, options = {}) {
  const { retry, retryDelayMs = RETRY_DELAY_MS, ...init } = options;
  const method = (init.method || "GET").toUpperCase();
  const safe = SAFE_METHODS.has(method);
  const mayRetry = (retry ?? safe) && isReplayableBody(init.body);

  const send = async () => {
    try {
      return await fetch(url, init);
    } catch (err) {
      // คนเรียกยกเลิกเอง (AbortController) ไม่ใช่ความผิดของเน็ต — ส่งต่อดิบ ๆ
      // ไม่งั้นหน้าที่ยกเลิก request เก่าตอนพิมพ์ค้นหาจะเด้ง toast "เชื่อมต่อไม่ได้" รัว ๆ
      if (err?.name === "AbortError") throw err;
      throw new ApiNetworkError(NETWORK_ERROR_MSG, { cause: err });
    }
  };

  const canRetryNow = () => mayRetry && !init.signal?.aborted;

  let res;
  try {
    res = await send();
  } catch (err) {
    if (!(err instanceof ApiNetworkError) || !canRetryNow()) throw err;
    await sleep(retryDelayMs);
    return send();
  }

  if (safe && RETRY_STATUSES.has(res.status) && canRetryNow()) {
    await sleep(retryDelayMs);
    return send();
  }
  return res;
}

/**
 * apiFetch + อ่าน JSON + แปลง !ok เป็น ApiError — ทรงเดียวกับที่เขียนซ้ำกันอยู่ทุกหน้า
 * (`const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || "…")`)
 *
 * @param {string} url
 * @param {object} options — RequestInit + `retry` + สองตัวช่วย:
 *   json — ออบเจกต์ที่จะส่งเป็น body (ใส่ Content-Type + stringify ให้ · method ตั้งต้น POST)
 *   fallbackError — ข้อความเวลา API ไม่ได้ส่ง `error` มาให้
 * @returns {Promise<any>} body ที่ parse แล้ว ({} ถ้าไม่มี body)
 */
export async function apiJson(url, options = {}) {
  const { json, fallbackError, ...init } = options;
  const opts = { ...init };
  if (json !== undefined) {
    opts.method = init.method || "POST";
    opts.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
    opts.body = JSON.stringify(json);
  }

  const res = await apiFetch(url, opts);
  // body ว่าง/ไม่ใช่ JSON ต้องไม่กลืน status — อ่านเป็น text ก่อนแล้วค่อย parse
  const text = await res.text().catch(() => "");
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!res.ok) {
    throw new ApiError(data?.error || fallbackError || `ทำรายการไม่สำเร็จ (${res.status})`, res.status, data);
  }
  return data;
}
