"use client";
// ที่อยู่ของลูกค้าหนึ่งราย — หลายรายการ (migration 0202). Controlled:
// value = array, onChange(nextArray). แพตเทิร์นเดียวกับ ContactsEditor/BrandsEditor
// แต่แถวสูงกว่า (ตัวที่อยู่เป็น textarea) จึงห่อเป็นการ์ดต่อแถว ไม่ใช่แถวเดียวยาว
//
// "หลัก" ไม่ใช่ธงในข้อมูล แต่คือ **รายการแรกที่ใช้งานนั้นได้** (ดู addresses.js)
// จึงต้องมีปุ่มเลื่อนขึ้น/ลง ไม่งั้นจะเปลี่ยนที่อยู่หลักไม่ได้เลยนอกจากลบทิ้งแล้ว
// เพิ่มใหม่ (ปัญหาที่ ContactsEditor มีอยู่)
//
// ── ที่อยู่แบบมีโครงสร้าง (2026-08-06) ────────────────────────────────────
// จังหวัด/อำเภอ/ตำบล เลือกจากทะเบียนกรมการปกครอง (/api/master/thai-address) แล้ว
// ระบบประกอบข้อความที่พิมพ์ลงเอกสารให้เอง — ช่องข้อความยังอยู่ (กด "พิมพ์เอง" ได้)
// เพราะที่อยู่บางแห่งเขียนตามที่ลูกค้าให้มาเป๊ะ ๆ ไม่เข้าแม่แบบไหนเลย
//
// ⚠️ แถวยุคเก่ามีแต่ข้อความก้อนเดียว: ช่องเลือกถูกล็อกไว้ก่อน จนกว่าจะกด "แยก
// ที่อยู่อัตโนมัติ" — ถ้าปล่อยให้เลือกจังหวัดทับได้เลย ข้อความเดิมทั้งก้อน (บ้านเลขที่/
// ถนน) จะถูกแทนที่ด้วย "จังหวัดX 20000" ในการบันทึกครั้งเดียว
//
// ใช้ primitive กลางล้วน (Button/Input/Textarea/Select) ไม่เขียนคลาส btn/
// premium-input เอง — ratchet ของ audit:ui กันไม่ให้ชั้นเก่างอกเพิ่ม
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, MapPin, Plus, Trash2, Wand2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import PhoneInput from "@/components/ui/PhoneInput";
import { cachedFetchJson } from "@/lib/apiCache";
import { genId } from "@/lib/id";
import { naText } from "@/lib/format";
import {
  addressText,
  addressTextEn,
  asAddressRow,
  isBillingAddress,
  isShippingAddress,
  toggleAddressUse,
} from "@/lib/master/addresses";
import {
  buildAddressIndex, districtPrefix, isBranchCodeValid, matchSubdistrict, parseThaiAddress,
  subdistrictPrefix,
} from "@/lib/master/thaiAddress";

// ปุ่มติ๊ก "ใช้ทำอะไร" (มติผู้ใช้) — ติ๊กได้ทั้งสอง แต่ปิดหมดไม่ได้ (ดู toggleAddressUse)
const USES = [
  { key: "billing", label: "ออกเอกสาร", on: isBillingAddress },
  { key: "shipping", label: "จัดส่ง", on: isShippingAddress },
];

const PROVINCES_URL = "/api/master/thai-address";

// แถวที่ "ยังเป็นข้อความยุคเก่า" = มีข้อความที่อยู่ แต่ยังไม่เคยแยกฟิลด์เลย
const isLegacyRow = (row) => !!row.address.trim() && !row.province && !row.line1.trim();

export default function AddressesEditor({ value = [], onChange }) {
  const rows = (Array.isArray(value) ? value : []).map(asAddressRow);
  const [provinces, setProvinces] = useState([]);
  // ตำบลโหลดรายอำเภอตอนผู้ใช้เลือก (ทั้งประเทศ 7,452 แถว = 650KB ไม่ควรยัดมาก้อนเดียว)
  const [subsByDistrict, setSubsByDistrict] = useState({});
  const loadingSubs = useRef(new Set());

  useEffect(() => {
    let alive = true;
    cachedFetchJson(PROVINCES_URL, 24 * 60 * 60 * 1000)
      .then((d) => { if (alive) setProvinces(d?.provinces || []); })
      .catch(() => {}); // โหลดไม่ได้ = ช่องเลือกว่าง แต่ยังพิมพ์ข้อความที่อยู่เองได้
    return () => { alive = false; };
  }, []);

  const loadSubs = useCallback(async (districtCode) => {
    if (!districtCode || loadingSubs.current.has(districtCode)) return subsByDistrict[districtCode];
    if (subsByDistrict[districtCode]) return subsByDistrict[districtCode];
    loadingSubs.current.add(districtCode);
    try {
      const data = await cachedFetchJson(`${PROVINCES_URL}?districtCode=${districtCode}`, 24 * 60 * 60 * 1000);
      const list = data?.subdistricts || [];
      setSubsByDistrict((prev) => ({ ...prev, [districtCode]: list }));
      return list;
    } catch {
      return [];
    } finally {
      loadingSubs.current.delete(districtCode);
    }
  }, [subsByDistrict]);

  // อำเภอที่ถูกเลือกไว้แล้วตอนเปิดฟอร์ม (แถวที่บันทึกไว้) ต้องมีตำบลให้เห็นทันที
  // ไม่ใช่ช่องว่างที่ดูเหมือนข้อมูลหาย
  useEffect(() => {
    for (const row of rows) if (row.districtCode) loadSubs(row.districtCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.districtCode).join(","), loadSubs]);

  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // ── แถวใหม่ยังไม่ติ๊กอะไรให้ (มติผู้ใช้ 2026-08-06) ─────────────────────
  // "ใช้ทำอะไร" เก็บได้ 3 ค่า (both/billing/shipping) — **ไม่มีค่าว่างในข้อมูล**
  // เพราะที่อยู่ที่ใช้ทำอะไรไม่ได้เลยก็ไม่ใช่ที่อยู่ (ดู toggleAddressUse) · สถานะ
  // "ยังไม่ได้เลือก" จึงอยู่ที่หน้าจอเท่านั้น: จำ id ของแถวที่เพิ่งกดเพิ่มและยังไม่
  // แตะปุ่มไหนเลย แล้ววาดปุ่มเป็นยังไม่ติ๊ก
  //
  // ⭐ ทำแบบนี้แทนการใส่ค่าว่างลงข้อมูล เพราะ addressUse() ตีค่าที่ไม่รู้จักเป็น
  // 'both' โดยตั้งใจ — ที่อยู่ที่บันทึกไว้แล้วต้องไม่หายจาก dropdown ทั้งสองฝั่ง
  // เงียบ ๆ · ถ้าเปลี่ยนตรงนั้น แถวเก่าที่ข้อมูลไม่สมบูรณ์จะหลุดจากใบเสนอราคาทันที
  const [untouched, setUntouched] = useState(() => new Set());
  const isUntouched = (row) => untouched.has(row.id);
  const markTouched = (id) => setUntouched((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  const add = () => {
    const id = genId("ADR");
    setUntouched((prev) => new Set(prev).add(id));
    // ค่าที่บันทึกจริงถ้าผู้ใช้ไม่แตะปุ่มเลย = 'both' (ค่าตั้งต้นเดิมของระบบ) —
    // ไม่ติ๊กให้บนจอ แต่ก็ไม่บันทึกที่อยู่ที่ใช้ทำอะไรไม่ได้เลยลงฐานข้อมูล
    onChange([...rows, { id, label: "", address: "", addressEn: "", useFor: "both" }]);
  };
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const move = (i, delta) => {
    const to = i + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  // เลือกจังหวัด/อำเภอ/ตำบล — ล้างระดับล่างเสมอ (อำเภอของจังหวัดเดิมค้างอยู่ =
  // ที่อยู่ข้ามจังหวัดที่ไม่มีอยู่จริง แล้วไปโผล่บนใบกำกับภาษี)
  // ⭐ เก็บ **ชื่ออังกฤษของทะเบียนลงแถวด้วย** (mig 0283) — เหตุผลเดียวกับที่เก็บชื่อไทย:
  // เอกสาร/หน้าจอต้องประกอบข้อความได้เองโดยไม่ต้องเปิดตารางอ้างอิง (ทะเบียน 650KB
  // เป็น server-only) · ชื่ออังกฤษติดมากับตัวเลือกอยู่แล้ว ไม่มีคำขอเพิ่ม
  const pickProvince = (i, code) => {
    const province = provinces.find((p) => p.code === code);
    update(i, {
      provinceCode: province?.code || "", province: province?.th || "", provinceEn: province?.en || "",
      districtCode: "", district: "", districtEn: "",
      subdistrictCode: "", subdistrict: "", subdistrictEn: "", postcode: "",
    });
  };
  const pickDistrict = (i, code) => {
    const province = provinces.find((p) => p.code === rows[i].provinceCode);
    const district = province?.districts.find((d) => d.code === code);
    update(i, {
      districtCode: district?.code || "", district: district?.th || "", districtEn: district?.en || "",
      subdistrictCode: "", subdistrict: "", subdistrictEn: "", postcode: "",
    });
    if (district) loadSubs(district.code);
  };
  const pickSubdistrict = (i, code) => {
    const sub = (subsByDistrict[rows[i].districtCode] || []).find((s) => s.code === code);
    // รหัสไปรษณีย์เติมให้จากตำบล แต่ยังแก้มือได้ (ที่อยู่ในนิคม/หน่วยงานบางแห่งใช้รหัสเฉพาะ)
    update(i, {
      subdistrictCode: sub?.code || "", subdistrict: sub?.th || "", subdistrictEn: sub?.en || "",
      postcode: sub?.zip || "",
    });
  };

  // แยกข้อความเดิม → ฟิลด์ย่อย · สองเฟสเพราะชุดที่ฟอร์มโหลดมามีแค่จังหวัด+อำเภอ
  // (เฟสแรกได้จังหวัด/อำเภอ แล้วค่อยโหลดตำบลของอำเภอนั้นมาแมตช์ต่อ)
  const autoSplit = async (i) => {
    const row = rows[i];
    const { parts, rest } = parseThaiAddress(row.address, buildAddressIndex(provinces));
    if (!parts) return;
    // ชื่ออังกฤษของระดับที่แยกได้ — parseThaiAddress คืนเฉพาะชื่อไทย/รหัส
    const provinceHit = provinces.find((p) => p.code === parts.provinceCode);
    const districtHit = provinceHit?.districts.find((d) => d.code === parts.districtCode);
    let patch = {
      ...parts,
      addressOverride: false,
      provinceEn: provinceHit?.en || "",
      districtEn: districtHit?.en || "",
      subdistrictEn: "",
    };
    if (parts.districtCode) {
      const subs = await loadSubs(parts.districtCode);
      const { subdistrict, line1 } = matchSubdistrict(rest, subs || []);
      if (subdistrict) {
        patch = {
          ...patch,
          subdistrictCode: subdistrict.code,
          subdistrict: subdistrict.th,
          subdistrictEn: subdistrict.en || "",
          postcode: parts.postcode || subdistrict.zip,
          line1,
        };
      }
    }
    update(i, patch);
  };

  // แถวที่ยังไม่พิมพ์ที่อยู่ยังไม่นับเป็น "หลัก" — ไม่งั้นกดเพิ่มแถวเปล่าแล้ว
  // ป้าย "หลัก" กระโดดไปแถวว่างทันที
  // แถวที่ยังไม่ได้เลือก "ใช้ทำอะไร" ยังไม่นับเป็นหลักด้วย — ไม่งั้นป้าย "บิลหลัก"
  // ไปเกาะแถวที่ผู้ใช้ยังไม่ได้บอกเลยว่าจะใช้ออกบิลไหม
  const filled = (r) => addressText(r).trim().length > 0 && !isUntouched(r);
  const billingPrimary = rows.findIndex((r) => filled(r) && isBillingAddress(r));
  const shippingPrimary = rows.findIndex((r) => filled(r) && isShippingAddress(r));

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <div className="text-[11px] text-[var(--text-3)]">ยังไม่มีที่อยู่ — กด “เพิ่มที่อยู่”</div>
      )}
      {rows.map((a, i) => {
        const legacy = isLegacyRow(a);
        const province = provinces.find((p) => p.code === a.provinceCode);
        const subs = subsByDistrict[a.districtCode] || [];
        // ข้อความที่จะถูกบันทึกจริง — โชว์ให้เห็นก่อนเสมอ ไม่ใช่รู้ตอนใบพิมพ์ออกมาแล้ว
        const preview = addressText(a);
        // ข้อความอังกฤษที่จะถูกบันทึกจริง (mig 0283) — ประกอบจากชื่ออังกฤษของทะเบียน
        // ที่ติดมากับตัวเลือก · ว่าง = ลูกค้ารายนี้ยังไม่มีที่อยู่อังกฤษ (ไม่ใช่ขีด)
        const previewEn = addressTextEn(a);
        const typing = legacy || a.addressOverride;
        return (
          <div
            key={a.id || i}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 flex flex-col gap-2"
          >
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                className="text-xs flex-1 basis-[150px] min-w-[120px]"
                placeholder="ชื่อเรียก เช่น สำนักงานใหญ่ / คลังบางนา"
                value={a.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <div className="flex gap-1.5 items-center">
                  {USES.map(({ key, label, on }) => {
                  // แถวที่ยังไม่แตะ = วาดเป็นยังไม่ติ๊กทั้งคู่ และกดครั้งแรกได้
                  // "อันนั้นอันเดียว" ไม่ใช่ toggle จากค่า both ที่ซ่อนอยู่ (ซึ่งจะ
                  // กลายเป็นกดบิลแล้วได้จัดส่ง — ตรงข้ามกับที่เห็นบนจอ)
                  const pending = isUntouched(a);
                  const active = !pending && on(a);
                  return (
                    <Button
                      key={key}
                      size="sm"
                      tone={active ? "primary" : undefined}
                      variant={active ? "filled" : "outline"}
                      icon={active ? <Check size={13} /> : null}
                      onClick={() => {
                        markTouched(a.id);
                        update(i, { useFor: pending ? key : toggleAddressUse(a.useFor, key) });
                      }}
                      title={active ? `ที่อยู่นี้ใช้${label}` : `ติ๊กเพื่อใช้ที่อยู่นี้${label}`}
                      aria-pressed={active}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex gap-1 items-center ml-auto">
                {/* มีที่อยู่เดียว = เป็นหลักอยู่แล้วโดยปริยาย — ป้ายจึงไม่ได้บอกอะไร
                    นอกจากซ้ำกับปุ่มติ๊กที่อยู่ข้าง ๆ (ผู้ใช้: "มีป้ายซ้ำซ้อน") */}
                {rows.length > 1 && i === billingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่ออกเอกสาร">บิลหลัก</span>}
                {rows.length > 1 && i === shippingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่จัดส่ง">จัดส่งหลัก</span>}
                <Button iconOnly icon={<ChevronUp size={14} />} onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น" />
                <Button iconOnly icon={<ChevronDown size={14} />} onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="เลื่อนลง" aria-label="เลื่อนลง" />
                <Button iconOnly tone="danger" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(i)} title="ลบที่อยู่" aria-label="ลบที่อยู่" />
              </div>
            </div>

            {/* บ้านเลขที่/ถนน — แถวยุคเก่ายังพิมพ์ที่อยู่ทั้งก้อนในช่องนี้ตามเดิม
                ⭐ ช่องอังกฤษอยู่ **คู่กันเสมอ ไม่ซ่อน ไม่พับ** (มติ 2026-08-22) — ไฟล์นี้มีมติเดิม
                ว่าห้ามซ่อน/โผล่ตามสถานะ เพราะช่องที่เหลือจะเลื่อนตำแหน่งทุกครั้งที่กดปุ่ม
                (ผู้ใช้: "กดแล้วมันโดดไปโดดมา") · ว่างไว้ได้ทุกแถว — บังคับแค่ "อย่างน้อยหนึ่งภาษา"
                ⚠️ พิมพ์แค่ท่อนแรก: ตำบล/อำเภอ/จังหวัดภาษาอังกฤษประกอบให้เองจากทะเบียน */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Textarea
                rows={2}
                placeholder={typing ? "ที่อยู่เต็ม…" : "บ้านเลขที่ / หมู่ / ซอย / ถนน…"}
                value={typing ? a.address : a.line1}
                onChange={(e) => update(i, typing ? { address: e.target.value } : { line1: e.target.value })}
                className="w-full text-xs h-[60px] resize-none"
                aria-label="ที่อยู่ภาษาไทย"
              />
              <Textarea
                rows={2}
                placeholder={typing ? "ที่อยู่เต็ม ภาษาอังกฤษ…" : "บ้านเลขที่ / ถนน — ภาษาอังกฤษ…"}
                value={typing ? a.addressEn : a.line1En}
                onChange={(e) => update(i, typing ? { addressEn: e.target.value } : { line1En: e.target.value })}
                className="w-full text-xs h-[60px] resize-none"
                aria-label="ที่อยู่ภาษาอังกฤษ (สำหรับเอกสาร IFRA / MSDS)"
              />
            </div>

            {/* จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Select
                fullWidth
                compact
                className="text-xs"
                value={a.provinceCode}
                onChange={(e) => pickProvince(i, e.target.value)}
                disabled={legacy}
                aria-label="จังหวัด"
              >
                <option value="">— จังหวัด —</option>
                {provinces.map((p) => <option key={p.code} value={p.code}>{p.th}</option>)}
              </Select>
              <Select
                fullWidth
                compact
                className="text-xs"
                value={a.districtCode}
                onChange={(e) => pickDistrict(i, e.target.value)}
                disabled={legacy || !province}
                aria-label={districtPrefix(a.provinceCode)}
              >
                <option value="">— {districtPrefix(a.provinceCode)} —</option>
                {(province?.districts || []).map((d) => <option key={d.code} value={d.code}>{d.th}</option>)}
              </Select>
              <Select
                fullWidth
                compact
                className="text-xs"
                value={a.subdistrictCode}
                onChange={(e) => pickSubdistrict(i, e.target.value)}
                disabled={legacy || !a.districtCode}
                aria-label={subdistrictPrefix(a.provinceCode)}
              >
                <option value="">— {subdistrictPrefix(a.provinceCode)} —</option>
                {subs.map((s) => <option key={s.code} value={s.code}>{s.th}</option>)}
              </Select>
              {/* รหัสไปรษณีย์มาจากตำบลที่เลือก — อ่านอย่างเดียว (มติผู้ใช้ 2026-08-06)
                  พิมพ์เองได้เมื่อไหร่ก็มีทางที่รหัสไม่ตรงกับตำบลบนเอกสารใบเดียวกัน
                  ซึ่งไม่มีใครจับได้จนของไปส่งผิดที่ · ที่อยู่ยุคเก่าที่ยังไม่ได้เลือก
                  ตำบลยังโชว์รหัสเดิมที่ backfill มาได้ตามปกติ */}
              <Input
                className="text-xs"
                readOnly
                placeholder="รหัสไปรษณีย์"
                value={a.postcode}
                aria-label="รหัสไปรษณีย์ (มาจากตำบลที่เลือก)"
                title="มาจากตำบลที่เลือก — แก้ได้โดยเปลี่ยนตำบล"
              />
            </div>

            {/* ⚠️ ช่องชุดนี้ต้องอยู่ครบทุกช่องเสมอ ห้ามซ่อนตามปุ่มติ๊ก "ออกเอกสาร/จัดส่ง"
                — เดิมซ่อน/โผล่ตามสถานะ ทำให้ช่องที่เหลือเลื่อนตำแหน่งทุกครั้งที่กดปุ่ม
                (ผู้ใช้: "กดแล้วมันโดดไปโดดมา") · เลขสาขามีผลเฉพาะที่อยู่ที่ใช้ออกเอกสาร
                และผู้รับของมีผลเฉพาะที่อยู่จัดส่ง ซึ่งบอกด้วย placeholder ก็พอ ไม่ต้อง
                ย้ายของบนจอ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* ⚠️ ห้ามกรอง e.target.value ให้เหลือแต่ตัวเลข: ของจริงมีลูกค้าที่เก็บ
                  **ชื่อ** สาขาไว้ ('แจ้งวัฒนะ') — กรองทิ้งเมื่อไหร่ = แค่คลิกช่องนี้
                  แล้วบันทึก สาขาก็กลายเป็นสำนักงานใหญ่บนใบกำกับภาษี */}
              <Input
                mono
                className="text-xs"
                maxLength={50}
                placeholder="เลขสาขา (ว่าง = สำนักงานใหญ่)"
                value={a.branchCode}
                invalid={!!a.branchCode && !isBranchCodeValid(a.branchCode)}
                onChange={(e) => update(i, { branchCode: e.target.value })}
              />
              <Input
                className="text-xs"
                placeholder="ลิงก์แผนที่ (Google Maps)"
                value={a.mapUrl}
                onChange={(e) => update(i, { mapUrl: e.target.value })}
              />
              <Input
                className="text-xs"
                placeholder="ผู้รับของ"
                value={a.contactName}
                onChange={(e) => update(i, { contactName: e.target.value })}
              />
              <PhoneInput
                className="text-xs"
                placeholder="เบอร์ผู้รับ"
                value={a.contactPhone}
                onChange={(v) => update(i, { contactPhone: v })}
              />
            </div>
            {!!a.branchCode && !isBranchCodeValid(a.branchCode) && (
              <span className="text-[10px] text-[var(--red)]">
                ใบกำกับภาษีต้องใช้เลขสาขา 5 หลัก — แก้เป็นตัวเลขเมื่อทราบ
              </span>
            )}

            {/* ข้อความที่จะพิมพ์ลงเอกสารจริง + ทางออกสำหรับที่อยู่ที่ไม่เข้าแม่แบบ */}
            <div className="flex flex-wrap items-start gap-2 justify-between">
              <div className="text-[11px] text-[var(--text-3)] min-w-0 flex-1">
                {isUntouched(a) ? (
                  // บอกตรง ๆ ว่าไม่เลือกแล้วจะได้อะไร — ไม่งั้นคนเพิ่มคลังแล้วลืมติ๊ก
                  // จะได้ที่อยู่คลังโผล่ในช่อง "ออกบิล" ของใบเสนอราคาโดยไม่รู้ตัว
                  <span>เลือกด้วยว่าที่อยู่นี้ใช้ทำอะไร — ไม่เลือก = ใช้ได้ทั้งออกเอกสารและจัดส่ง</span>
                ) : legacy ? (
                  <span>ที่อยู่นี้ยังเป็นข้อความก้อนเดียว — กด “แยกที่อยู่อัตโนมัติ” แล้วตรวจก่อนบันทึก</span>
                ) : (
                  <>
                    <span className="break-words">บนเอกสารจะพิมพ์ว่า: <b className="text-[var(--text-2)]">{naText(preview)}</b></span>
                    {/* ⚠️ ไม่มีอังกฤษ = **ไม่มีบรรทัดนี้** ไม่ใช่ขีด — ที่อยู่ส่วนใหญ่ไม่ต้องใช้
                        อังกฤษ ขึ้นขีดใต้ทุกแถวคือเสียงรบกวน (แพตเทิร์นเดียวกับลิงก์แผนที่
                        และแถวเอกสารอ้างอิงบนใบเสนอราคาที่ "ว่าง = ตัดแถวทิ้ง") */}
                    {!!previewEn.trim() && (
                      <span className="break-words block">
                        ใบภาษาอังกฤษ: <b className="text-[var(--text-2)]">{previewEn}</b>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-1.5 items-center shrink-0">
                {a.mapUrl && /^https?:\/\//i.test(a.mapUrl) && (
                  <a href={a.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] inline-flex items-center gap-1 text-[var(--accent)]">
                    <MapPin size={12} /> เปิดแผนที่
                  </a>
                )}
                {legacy ? (
                  <Button size="sm" icon={<Wand2 size={13} />} onClick={() => autoSplit(i)} disabled={!provinces.length}>
                    แยกที่อยู่อัตโนมัติ
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={a.addressOverride ? "filled" : "outline"}
                    tone={a.addressOverride ? "primary" : undefined}
                    aria-pressed={a.addressOverride}
                    title="พิมพ์ข้อความที่อยู่เองทั้งก้อน (สำหรับที่อยู่ที่ลูกค้ากำหนดรูปแบบมา)"
                    onClick={() => update(i, {
                      addressOverride: !a.addressOverride,
                      // เปิดโหมดพิมพ์เอง = เริ่มจากข้อความที่ประกอบไว้ ไม่ใช่ช่องว่าง
                      address: a.addressOverride ? a.address : preview,
                    })}
                  >
                    พิมพ์ข้อความเอง
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <Button className="self-start" icon={<Plus size={14} />} onClick={add}>เพิ่มที่อยู่</Button>
    </div>
  );
}
