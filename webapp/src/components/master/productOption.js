// มาตรฐาน dropdown สินค้าทั้งระบบ (มติผู้ใช้ 2026-07-15):
// รหัส (ตัวหนา) · แบรนด์ · ชื่อสินค้า · ปริมาตร
// ใช้ได้ทั้ง product master (/api/products: productDescription/brandName/volume)
// และ shape อื่นที่มี fgCode+name (เช่น /api/sahamit/products, ทะเบียนสรรพสามิต).

export function productOptionDisplay(p) {
  const code = p?.fgCode || "";
  const brand = p?.brandName || p?.brandNameEn || "";
  const name = p?.productDescription || p?.productDescriptionEn || p?.name || "";
  const volume = p?.volume ? `${p.volume} ${p.volumeUnit || "ml"}` : "";
  const rest = [brand, name, volume].filter(Boolean).join(" · ");
  return {
    // สำหรับ native <option> / ที่ทำตัวหนาไม่ได้
    text: [code, rest].filter(Boolean).join(" · ") || "-",
    search: [code, p?.brandName, p?.brandNameEn, p?.productDescription, p?.productDescriptionEn, p?.name, volume]
      .filter(Boolean).join(" "),
    // สำหรับ SearchableSelect (option.render) — รหัสตัวหนา
    render: code ? (<><strong>{code}</strong>{rest ? <> · {rest}</> : null}</>) : (rest || "-"),
  };
}

// สร้าง options ให้ SearchableSelect: เรียงตามรหัส FG (ตัวไม่มีรหัสไปท้ายลิสต์)
// getValue กำหนดค่า value ต่อระบบ (default = product.id; สหมิตรใช้ fgCode)
export function productSelectOptions(products = [], getValue = (p) => p.id) {
  return products
    .map((p) => {
      const d = productOptionDisplay(p);
      return { value: getValue(p), fgCode: p?.fgCode || "", label: d.text, search: d.search, render: d.render };
    })
    .sort((a, b) => (a.fgCode || "￿").localeCompare(b.fgCode || "￿", "en")
      || a.label.localeCompare(b.label, "th"));
}
