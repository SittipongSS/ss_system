// ── RD · ขอราคาหัวน้ำหอม / เนื้อสาร ────────────────────────────────────
//
// ⚠️ **ยังเปิดใบใหม่ได้อยู่ (ไม่ใช่ legacy)** — แผนสั่งตัดทั้งคู่เพราะราคากลายเป็น
// *ขั้นสุดท้ายของสองหัวข้อพัฒนา* แล้ว (ดู lib/requests/rowStage.js `canPriceRow`)
// แต่ **ยังไม่ถอด**: ถอดความสามารถก่อนที่ทางใหม่จะเดินจริงครบวงสักรอบ = ตัดทางออก
// ของคนที่ต้องขอราคากลิ่นเก่าในทะเบียนซึ่งยังไม่มีที่รองรับ (มติผู้ใช้: กรณีนั้น
// "ยังไม่ต้องคิดรอบนี้") · ติดธง `legacy` เมื่อไร ให้ย้ายไป legacy.js พร้อมกัน
const priceF = {
  key: 'price_f',
  label: 'ขอราคาหัวน้ำหอม (F)',
  dept: 'RD', scope: 'RM', hasItems: true, hasTiers: false,
  needs: ['scent'],
  hint: 'อ้างกลิ่นที่ลูกค้าคอนเฟิร์มแล้ว — ราคาเดียว ไม่มีชั้นจำนวน',
};

const priceFb = {
  key: 'price_fb',
  label: 'ขอราคาเนื้อสาร (FB)',
  dept: 'RD', scope: 'RM', hasItems: true, hasTiers: false,
  needs: ['formula'],
  hint: 'อ้างสูตรที่ลูกค้าคอนเฟิร์มแล้ว — ราคาเดียว ไม่มีชั้นจำนวน',
};

const RD_PRICING_KINDS = [priceF, priceFb];

export default RD_PRICING_KINDS;
