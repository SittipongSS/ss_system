// ── "โหลดไม่สำเร็จ" หนึ่งครั้ง = ประโยคไทยนำ + ข้อความดิบเป็นบรรทัดเล็ก ────────────────
//
// ⭐ **มติเจ้าของ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก"** — กล่องแจ้งโหลดพังเคยขึ้นข้อความดิบของ
//    เซิร์ฟเวอร์เป็นตัวเนื้อ (`column orders.updatedAt does not exist`) ซึ่งคนหน้างานอ่านไม่ออก
//    ⇒ ประโยคไทยขึ้นก่อน และข้อความดิบย้ายไปบรรทัดรอง "รายละเอียดสำหรับแจ้งปัญหา: …"
//    (`StatusNotice` prop `detail`)
// 🔴 **ห้ามทิ้งข้อความดิบ** — สตริงนั้นคือสิ่งที่ชี้ต้นเหตุ `orders.updatedAt` ได้ในไม่กี่นาที หลังจอ
//    /tax เงียบไป 26 วัน · คนแจ้งปัญหาก๊อปบรรทัดนั้นมาวางในเธรดได้ตรง ๆ
//
// ⚠️ ไฟล์นี้ไม่แตะ React ไม่แตะ DOM — `useApiList` (lib/excise) เรียกตัวแยกที่นี่ และเทสต์ไล่ได้ใต้ node
// ⚠️ **ไม่ผ่าซอยสตริงของเซิร์ฟเวอร์** — ประโยคไทยมาจาก HTTP status ที่นี่ ข้อความดิบไปทั้งก้อน
//    (เราต์หลายตัวต่อ `อ่าน…ไม่สำเร็จ: ${error.message}` เอง ตัดตรง `:` ได้ผิดวันหนึ่งแน่นอน)
// ⚠️ **ไฟล์นี้ไม่ import อะไรเลย** — `StatusNotice` (primitive กลางที่ทุกจอใช้) ดึงป้าย `LOAD_FAILURE_DETAIL_LABEL`
//    จากที่นี่ ⇒ import อะไรเข้ามา = ทุกผู้เรียก StatusNotice พ่วงของนั้นไปด้วย (เคยพ่วงตัวห่อเครือข่าย apiFetch
//    มาเพื่อ `instanceof ApiNetworkError` ตัวเดียว) · แยกเน็ตหลุดด้วย `name` ที่ apiFetch ตั้งไว้แทน
//    (ยาม: apiListErrorVisible.test.mjs)

/** ป้ายของบรรทัดรอง — ที่เดียวทั้งระบบ (StatusNotice ใช้เป็นค่าตั้งต้นของ `detailLabel`) */
export const LOAD_FAILURE_DETAIL_LABEL = "รายละเอียดสำหรับแจ้งปัญหา";

/* ข้อความดิบยาวได้ไม่จำกัด (stack/HTML ทั้งหน้า) — ตัดที่เพดานเดียว ให้กล่องยังเป็นกล่อง
   ⚠️ เพดานสูงพอให้ข้อความของ PostgREST/Postgres ทั้งประโยคผ่านไปครบ (ปกติไม่ถึง 200 ตัว) */
const DETAIL_MAX = 500;

const THAI = /[\u0E00-\u0E7F]/;

function clip(text) {
  const value = String(text).trim();
  return value.length > DETAIL_MAX ? `${value.slice(0, DETAIL_MAX)}…` : value;
}

/* ช่อง `error` ของคำตอบ API — ปกติเป็นสตริง · บางเราต์ส่งก้อน ({ message, code }) ⇒ ห้ามกลายเป็น "[object Object]" */
function serverTextOf(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value?.message === "string" && value.message) return value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/* ประโยคไทยตาม HTTP status — บอก "เกิดอะไร" และ "ต้องทำอะไร" ไม่ใช่รหัส */
function leadOf(status) {
  if (status === 401) return "หมดเวลาการเข้าสู่ระบบ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง";
  if (status === 403) return "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลชุดนี้";
  if (status === 404) return "ไม่พบข้อมูลชุดนี้ในระบบ";
  if (status >= 500) return "ระบบขัดข้องระหว่างดึงข้อมูล";
  return "ดึงข้อมูลไม่สำเร็จ";
}

/**
 * คำตอบที่ไม่ ok (มี response แต่ status ไม่ใช่ 2xx)
 *
 * ⭐ 4xx ที่เซิร์ฟเวอร์พูดเป็นภาษาไทยมาแล้ว = ประโยคที่คนเขียนให้คนอ่าน (เช่นเหตุของสิทธิ์) ⇒ ใช้เป็นตัวนำเลย
 *    ส่วน 5xx **ไม่เชื่อแม้ขึ้นต้นเป็นไทย** — เราต์ส่วนใหญ่ต่อข้อความดิบของฐานไว้ท้ายประโยคไทย
 *    (`อ่าน…ไม่สำเร็จ: column … does not exist`) ⇒ ทั้งก้อนไปอยู่บรรทัดรอง ตัวนำเป็นประโยคกลาง
 * @param {number} status
 * @param {unknown} serverError ช่อง `error` ของ body (ถ้า parse ได้)
 * @returns {{ message: string, detail: string }}
 */
export function httpLoadFailure(status, serverError) {
  const code = `HTTP ${status}`;
  const text = serverTextOf(serverError);
  if (text && status < 500 && THAI.test(text)) {
    return { message: text.trim(), detail: code };
  }
  return { message: leadOf(status), detail: text ? `${code} — ${clip(text)}` : code };
}

/**
 * ของที่ถูกโยนระหว่างโหลด — เน็ตหลุด (ApiNetworkError · ข้อความไทยของ apiFetch อยู่แล้ว) หรือ body อ่านไม่ออก
 * @returns {{ message: string, detail: string|null }}
 */
export function thrownLoadFailure(error) {
  if (error?.name === "ApiNetworkError") {
    // ข้อความดิบของเบราว์เซอร์ (`Failed to fetch`) ไม่ช่วยใครแจ้งปัญหา — apiFetch ตั้งใจซ่อนมันไว้แล้ว
    return { message: error.message, detail: null };
  }
  const raw = error?.message ? clip(error.message) : null;
  if (error instanceof SyntaxError) {
    return { message: "ระบบตอบกลับในรูปแบบที่อ่านไม่ได้", detail: raw };
  }
  return { message: "ดึงข้อมูลไม่สำเร็จ", detail: raw };
}

/**
 * บรรทัดรองของจอที่อ่านหลายแหล่งพร้อมกัน — **ทุกแหล่งที่ล้ม** ไม่ใช่แหล่งแรก
 * (สองสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้ — บทเรียนเดียวกับ `causes` ของจอ)
 * @param {{ label: string, detail?: string|null }[]} failing แหล่งที่ล้ม (ก้อน `sources` ของจอ)
 * @returns {string|null} `null` = ไม่มีข้อความดิบให้แจ้ง (เช่นเน็ตหลุดล้วน)
 */
export function sourcesFailureDetail(failing = []) {
  const lines = [...new Set((failing || [])
    .filter((source) => source?.detail)
    // ชื่อสายในวงเล็บเหลี่ยม — ป้ายของบรรทัดจบด้วย ":" อยู่แล้ว ต่อ "ชื่อสาย:" ซ้ำอีกชั้นอ่านเป็นหัวซ้อนหัว
    .map((source) => (source.label ? `[${source.label}] ${source.detail}` : source.detail)))];
  return lines.length ? lines.join(" · ") : null;
}
