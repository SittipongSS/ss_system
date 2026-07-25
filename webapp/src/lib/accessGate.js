// กติกาเดียวของทั้งระบบสำหรับ "หน้านี้ให้เข้าไหม" ฝั่ง UI
//
// ทำไมต้องมี: RoleContext ตั้งต้นเป็น null และ AppLayout เพิ่งเซ็ต role หลัง
// supabase.auth.getUser() กลับมา — หน้าที่เขียน `if (!canManage) return <ไม่มีสิทธิ์/>`
// ตรง ๆ จึงฟ้องแอดมินตัวจริงว่า "ไม่มีสิทธิ์" แวบหนึ่งทุกครั้งที่เปิดหน้า เพราะ useCan()
// แยกไม่ออกระหว่าง "ยังไม่รู้ว่าใครเข้ามา" กับ "รู้แล้วว่าไม่มีสิทธิ์"
//
// role ว่าง = 'loading' เสมอ ไม่ว่า allowed จะเป็นอะไร — ห้ามฟ้องก่อนรู้
export function accessState(role, allowed) {
  if (!String(role || '').trim()) return 'loading';
  return allowed ? 'allowed' : 'denied';
}
