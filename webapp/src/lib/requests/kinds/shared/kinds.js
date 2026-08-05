// ── หัวข้อที่ไม่ได้เป็นของฝ่ายไหน (`dept: null`) ─────────────────────────
// ผู้ขอเลือกฝ่ายเอง ⇒ โผล่ในลิสต์ของ **ทุกฝ่าย** · วางไว้ในบ้านฝ่ายใดฝ่ายหนึ่งเมื่อไร
// จะกลายเป็นของที่ฝ่ายนั้นดูแลทั้งที่ทุกฝ่ายใช้
import info from './info';
import documentKind from './document';

const SHARED_KINDS = [info, documentKind];

export default SHARED_KINDS;
