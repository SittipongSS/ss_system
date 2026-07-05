"use client";

// fetch สำหรับ "การเขียน" ในโมดูลสหมิตร. ถ้าเจอ 401/403 (เซสชันหมดอายุ / โทเคน
// หลุดชั่วคราว — ดู [[auth-session-model]]) จะเด้งข้อความเป็นมิตร + เสนอโหลดหน้าใหม่
// (proxy จะต่ออายุ session ให้) แทนที่จะโชว์คำว่า "forbidden" ดิบๆ.
// คืน JSON ที่ parse แล้ว หรือ throw error ที่มีข้อความอ่านง่าย.
export async function sahamitFetch(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error("เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== "undefined" &&
        window.confirm("เซสชันหมดอายุ (ต้องเข้าสู่ระบบใหม่)\nโหลดหน้านี้ใหม่เพื่อต่ออายุแล้วลองอีกครั้งไหม?\n(ข้อมูลที่ยังไม่บันทึกจะหาย)")) {
      window.location.reload();
    }
    throw new Error("เซสชันหมดอายุ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "ไม่สำเร็จ");
  return json;
}
