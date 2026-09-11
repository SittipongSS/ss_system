"use client";
// ── ช่องของฟอร์มไซต์บริการ — ชุดเดียวที่ทุกโมดัลของไซต์ใช้ ─────────────────────
//
// กฎ AGENTS.md "ฟอร์มแก้ = ฟอร์มสร้าง": ยกออกจาก `ServiceSiteModal` ตอนมีผู้ใช้ที่สอง
// (โมดัล "เพิ่มไซต์ย้อนหลัง" — มติผู้ใช้ 2026-09-11) · ถ้าก๊อปช่องไปอีกไฟล์ วันที่เพิ่มช่อง
// ให้ไซต์ (เช่นจังหวัด mig 0315) ต้องแก้สองที่ด้วยมือ แล้วสักวันจะลืมที่หนึ่ง
//
// แบ่งเป็นสองชิ้น:
//   useServiceSiteForm(...) — state + กติกาของฟอร์ม (ไทล์ที่อยู่ · จังหวัด · ย้ายลูกค้า)
//   <ServiceSiteFields ctl={...} /> — วาดช่องอย่างเดียว
// ⇒ ผู้เรียกถือ state เอง (โมดัลหลายขั้นซ่อนขั้นนี้ไว้แล้วกลับมา ค่าต้องอยู่ครบ)
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TimeInput from "@/components/ui/TimeInput";
import { customerSelectOptions } from "@/components/master/customerOption";
import { RefreshCw } from "lucide-react";
import {
  WEEKDAY_LABELS, WEEKDAYS, siteAddressCarry, siteAddressDrift, toHHMM,
} from "@/lib/service/sites";
import { ADDRESS_USE_LABELS, addressText, addressUse } from "@/lib/master/addresses";
import { provinceFromText } from "@/lib/master/thaiProvinces";
import { cachedFetchJson } from "@/lib/apiCache";
import { SITE_CODE_HINT } from "@/lib/service/siteCode";
import styles from "./ServiceSiteModal.module.css";
import { apiFetch } from "@/lib/apiFetch";

// ไทล์ "ที่อยู่อื่น" = ตั้งใจไม่ก๊อปจากทะเบียน (ไซต์ที่ไม่ใช่สถานประกอบการทางภาษี)
const OWN_ADDRESS = "__own__";

/* ── ที่อยู่ของลูกค้าที่เอามาตั้งต้นไซต์ได้ ────────────────────────────────
   ⭐ ทางหลักคือ `addresses[]` (mig 0202/0217) ซึ่งลูกค้าจริงกรอกไว้ครบ — สุ่มวัด 60 ราย
      เมื่อ 30/08/2026: มีแถวทุกราย และ 59/60 มี `provinceCode` แบบมีโครงสร้างด้วย
   ⚠️ **แต่ต้องมีทางถอย** — แถวที่ไม่มี `provinceCode` มีจริง (เจอ 1/60) และลูกค้าที่
      ยังไม่มีแถวเลยก็เป็นไปได้ ⇒ สังเคราะห์ไทล์จาก `address`/`shippingAddress`
      (ช่องข้อความที่ทุกรายมี) แล้วให้ `provinceFromText` แกะจังหวัดจากข้อความแทน */
const SYNTHETIC_ADDRESS_IDS = new Set(["__main__", "__shipping__"]);
function customerAddressRows(customer) {
  if (!customer) return [];
  const rows = Array.isArray(customer.addresses) ? customer.addresses.filter(Boolean) : [];
  if (rows.length) return rows;
  const out = [];
  const main = String(customer.address || "").trim();
  if (main) out.push({ id: "__main__", label: "ที่อยู่จดทะเบียน", address: main, useFor: "billing" });
  const shipping = String(customer.shippingAddress || "").trim();
  if (shipping && shipping !== main) {
    out.push({ id: "__shipping__", label: "ที่อยู่จัดส่ง", address: shipping, useFor: "shipping" });
  }
  return out;
}

export const SITE_FORM_EMPTY = {
  customerId: "", name: "", routeZone: "", address: "", mapUrl: "",
  // จังหวัด (mig 0315) — ไม่ใช่ที่อยู่ แต่เป็นท่อนหนึ่งของ **รหัสไซต์**
  provinceCode: "", province: "",
  contactName: "", contactPhone: "",
  accessFrom: "", accessTo: "", accessDays: [], accessNote: "",
  note: "", isActive: true,
  // ที่มาของที่อยู่ (mig 0313) — ไม่ใช่ช่องกรอก ไทล์ข้างล่างเป็นคนตั้ง
  customerAddressId: null,
};

function formFromSite(site) {
  return {
    customerId: site.customerId || "",
    name: site.name || "",
    routeZone: site.routeZone || "",
    address: site.address || "",
    mapUrl: site.mapUrl || "",
    contactName: site.contactName || "",
    contactPhone: site.contactPhone || "",
    // Postgres คืน time เป็น '10:00:00' — ช่องกรอกรับ 'HH:MM'
    accessFrom: toHHMM(site.accessFrom),
    accessTo: toHHMM(site.accessTo),
    accessDays: Array.isArray(site.accessDays) ? site.accessDays : [],
    accessNote: site.accessNote || "",
    note: site.note || "",
    isActive: site.isActive !== false,
    provinceCode: site.provinceCode || "",
    province: site.province || "",
    customerAddressId: site.customerAddressId || null,
  };
}

/**
 * state + กติกาของฟอร์มไซต์
 *
 * @param open              โมดัลเปิดอยู่ไหม — เปิดใหม่ทุกครั้ง = ตั้งค่าใหม่จาก `site`/`defaults`
 * @param site              แถวไซต์ (โหมดแก้) · `null` = โหมดสร้าง
 * @param defaults          ค่าตั้งต้นของโหมด **สร้าง** (ผู้เรียกที่รู้คำตอบอยู่แล้ว เช่นรู้ลูกค้า)
 * @param customerAddresses ที่อยู่ของลูกค้า ถ้าผู้เรียกมีอยู่แล้ว — ไม่ส่ง = ดึงเองตามลูกค้าที่เลือก
 * @param resetOnOpen       false = ไม่ล้างฟอร์มทุกครั้งที่เปิด (ผู้เรียกเรียก `reset()` เอง)
 */
export function useServiceSiteForm({
  open, site = null, defaults = null, customerAddresses = [], resetOnOpen = true,
}) {
  const editing = !!site;
  const [form, setForm] = useState(SITE_FORM_EMPTY);
  const [pickedAddressId, setPickedAddressId] = useState("");
  /* ⭐ ที่อยู่ของลูกค้าที่เลือกอยู่ — ผู้เรียกส่งมาก็ได้ (wizard รู้ลูกค้าอยู่แล้ว)
     ไม่ส่งก็ดึงเองเมื่อผู้ใช้เลือกลูกค้าในฟอร์ม ⇒ ทุกทางเข้าได้ไทล์เหมือนกัน
     ไม่ใช่ฟีเจอร์ที่มีเฉพาะบางหน้า (โรคเดียวกับฟอร์มสร้าง/แก้ที่เพี้ยนหากัน) */
  const [fetchedAddresses, setFetchedAddresses] = useState([]);
  // ทะเบียนจังหวัด (~60KB) — แคชไว้ 24 ชม. แบบเดียวกับฟอร์มที่อยู่ลูกค้า
  const [provinces, setProvinces] = useState([]);
  const [provinceError, setProvinceError] = useState("");

  /* ตั้งค่าใหม่ทั้งฟอร์ม — เปิดโมดัล หรือผู้เรียกขอเริ่มใบใหม่ (เช่น "เพิ่มอีกแห่ง") */
  const reset = useCallback((nextDefaults = null) => {
    setForm(site ? formFromSite(site) : { ...SITE_FORM_EMPTY, ...(nextDefaults || {}) });
    // โหมดแก้: ไทล์ที่ถูกเลือกไว้คือที่มาที่บันทึกไว้เมื่อครั้งก่อน (ไม่มี = ไม่รู้ที่มา
    // ซึ่งเป็นเรื่องปกติของไซต์ยุคก่อน mig 0313 — ไม่ใช่ "ที่อยู่อื่น")
    setPickedAddressId(site?.customerAddressId || (nextDefaults?.customerAddressId ?? ""));
  }, [site]);

  /* `resetOnOpen = false` = ผู้เรียกคุมการเริ่มใหม่เอง (โมดัลหลายขั้นที่เก็บร่างข้ามการปิด/เปิด) */
  useEffect(() => {
    if (!open || !resetOnOpen) return;
    reset(defaults);
  }, [open, reset, defaults, resetOnOpen]);

  /* ทะเบียนจังหวัดโหลดครั้งเดียวตอนเปิดโมดัล — ห้าม import ทะเบียน 650KB ตรง ๆ
     (server-only) · โหลดไม่ได้ = ช่องว่างแล้วบันทึกไม่ผ่านด่าน ซึ่งบอกเหตุอยู่แล้ว */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setProvinceError("");
    cachedFetchJson("/api/master/thai-address", 24 * 60 * 60 * 1000)
      .then((d) => { if (alive) setProvinces(d?.provinces || []); })
      /* 🐞 โหลดทะเบียนจังหวัดไม่ได้ = **สร้างไซต์ไม่ได้ทั้งระบบ** (จังหวัดบังคับ) ·
         ของเดิมกลืน error เงียบ ⇒ ช่องจังหวัดว่าง ป้ายบอก "เลือกจังหวัด" แล้วกดบันทึก
         เจอ "ต้องเลือกจังหวัด" วนไม่จบ โดยไม่มีอะไรบอกว่าโหลดพลาด */
      .catch(() => { if (alive) setProvinceError("โหลดทะเบียนจังหวัดไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่"); });
    return () => { alive = false; };
  }, [open]);

  const addressOptions = customerAddresses.length ? customerAddresses : fetchedAddresses;
  const sourceAddress = pickedAddressId && pickedAddressId !== OWN_ADDRESS
    ? addressOptions.find((a) => a.id === pickedAddressId) || null
    : null;
  // เตือนเฉพาะโหมดแก้ — ในโหมดสร้าง ค่าที่ต่างคือค่าที่เพิ่งพิมพ์ทับไปเมื่อครู่
  const stale = editing ? siteAddressDrift(form, sourceAddress) : [];

  /* กดไทล์ = เติมสี่ช่องที่ก๊อปได้ให้ครั้งเดียว แล้วปล่อยให้แก้ต่อ
     ⚠️ `|| prev.x` ทุกช่อง — ทะเบียนไม่มีค่า **ห้ามล้างของที่กรอกไว้เอง** (ไซต์จริง
        ใบแรกบน production มี mapUrl แต่ไม่มี address ⇒ ดึงใหม่แล้วหมุดหายไม่ได้)
     ⭐ เก็บ id ที่มาลงแถวไซต์ด้วย (mig 0313) — ปุ่ม "ดึงใหม่" ในโหมดแก้อาศัยค่านี้ */
  const applyCustomerAddress = (id) => {
    setPickedAddressId(id);
    if (id === OWN_ADDRESS) {
      setForm((prev) => ({ ...prev, customerAddressId: null }));
      return;
    }
    const row = addressOptions.find((a) => a.id === id);
    if (!row) return;
    /* ⭐ **จังหวัดมาจากที่อยู่ที่เลือกด้วย** (มติผู้ใช้ 2026-08-30: "ต้องดึงมาจาก
       ฐานข้อมูลลูกค้าก่อน") — ใช้ค่าที่กรอกแบบมีโครงสร้างก่อน (mig 0217) ไม่มีก็แกะจาก
       **ข้อความที่อยู่** ซึ่งเป็นรูปเดียวที่ลูกค้าจริงทุกรายมีอยู่วันนี้
       ⚠️ แกะไม่ได้ = ไม่เติม ปล่อยให้คนเลือกเอง (จังหวัดผิดถูกตรึงในรหัสถาวร)
       ⚠️ **โหมดสร้างเท่านั้น** — ไซต์ที่ออกรหัสไปแล้วตรึงจังหวัดไว้ในรหัส ดึงใหม่ทับ
          เมื่อไรจะได้ช่องที่ขัดกับรหัสของตัวเอง (จึงไม่อยู่ใน SITE_ADDRESS_FIELDS) */
    const detected = row.provinceCode
      ? { code: String(row.provinceCode), th: row.province || "" }
      : provinceFromText(addressText(row), provinces);
    const carried = editing || !detected ? {} : {
      provinceCode: detected.code,
      province: detected.th || provinces.find((p) => p.code === detected.code)?.th || "",
    };
    /* 🐞 **ไทล์สังเคราะห์ห้ามลงฐานเป็นที่มา** — `__main__`/`__shipping__` ไม่ใช่แถวใน
       `addresses[]` ⇒ `checkSiteReferences` ตีกลับ "ไม่พบที่อยู่ต้นทาง" ทุกครั้ง = ลูกค้าที่
       ยังไม่มีแถวที่อยู่ สร้างไซต์ด้วยไทล์นั้นไม่ได้เลย · ก๊อปข้อความได้ แต่ที่มา = ไม่รู้ (null) */
    const sourceId = SYNTHETIC_ADDRESS_IDS.has(id) ? null : id;
    setForm((prev) => ({
      ...prev, customerAddressId: sourceId, ...siteAddressCarry(prev, row), ...carried,
    }));
  };

  /* ⭐ **ย้ายลูกค้า = ที่มาเดิมใช้ไม่ได้แล้ว** — id ชี้เข้า addresses[] ของคนเดิม
     ล้างที่นี่ให้ตรงกับด่านฝั่ง server (PATCH /api/service/sites/[id]) · ข้อความที่
     ก๊อปไว้แล้วยังอยู่ครบ หายแค่ "ที่มา" ซึ่งคนกรอกแก้ต่อได้ตามจริง */
  const changeCustomer = (value) => {
    setPickedAddressId("");
    setForm((prev) => (prev.customerId === value
      ? prev
      : { ...prev, customerId: value, customerAddressId: null }));
  };

  useEffect(() => {
    // ⭐ โหมดแก้ก็เสนอไทล์ (มติ 2026-08-29) — ของเดิมปิดไว้ ⇒ ไซต์ที่สร้างไปแล้ว
    //    ดึงที่อยู่จากทะเบียนมาเติมทีหลังไม่ได้เลย ต้องพิมพ์เองทั้งชุด
    if (!open) return;
    if (customerAddresses.length) return;         // ผู้เรียกส่งมาแล้ว
    const customerId = form.customerId;
    if (!customerId) { setFetchedAddresses([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/customers/${customerId}`);
        const body = await res.json().catch(() => null);
        /* 🐞 **เคยอ่าน `body.addresses` ตรง ๆ แล้วได้ undefined เสมอ** — endpoint นี้
           คืน `{ customer, products, orders }` ไม่ใช่แถวลูกค้า ⇒ ไทล์ที่อยู่ไม่เคยขึ้น
           เลยในทุกที่ที่ผู้เรียกไม่ได้ส่ง `customerAddresses` มาเอง (เช่นฟอร์มในใบคำร้อง)
           · รองรับทั้งสองรูป เผื่อ endpoint เปลี่ยนกลับ */
        if (alive && res.ok) setFetchedAddresses(customerAddressRows(body?.customer || body));
      } catch {
        if (alive) setFetchedAddresses([]);       // ดึงไม่ได้ = ไม่มีไทล์ ไม่ใช่ฟอร์มพัง
      }
    })();
    return () => { alive = false; };
  }, [open, site, form.customerId, customerAddresses.length]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const days = prev.accessDays.includes(day)
        ? prev.accessDays.filter((d) => d !== day)
        : [...prev.accessDays, day];
      return { ...prev, accessDays: days.sort((a, b) => a - b) };
    });
  };

  const pickProvince = (code) => {
    const row = provinces.find((p) => p.code === code);
    setForm((prev) => ({ ...prev, provinceCode: code, province: row?.th || "" }));
  };

  return {
    editing, form, setForm, reset, change, toggleDay, pickProvince,
    provinces, provinceError, addressOptions, pickedAddressId, applyCustomerAddress,
    changeCustomer, stale,
  };
}

/**
 * ช่องทั้งหมดของไซต์ — วาดอย่างเดียว state อยู่ที่ `useServiceSiteForm`
 *
 * @param ctl         ผลของ `useServiceSiteForm`
 * @param customers   รายชื่อลูกค้าสำหรับ dropdown
 * @param identityExtra ของที่ผู้เรียกแทรกต่อจากช่องตัวตน (ลูกค้า · ชื่อ · จังหวัด) — เช่น
 *                    รหัสที่จะออก + ไซต์ที่ลูกค้ามีอยู่แล้วของโมดัลย้อนหลัง
 * @param provinceHint ข้อความใต้ช่องจังหวัดในโหมดสร้าง (ผู้เรียกที่โชว์รหัสเองไม่ต้องพูดซ้ำ)
 */
export default function ServiceSiteFields({ ctl, customers = [], identityExtra = null, provinceHint = null }) {
  const {
    editing, form, change, toggleDay, pickProvince, provinces, provinceError, addressOptions,
    pickedAddressId, applyCustomerAddress, changeCustomer, stale, setForm,
  } = ctl;

  /* ป้าย/ลำดับ/ชุดค้นของ dropdown ลูกค้ามาจากที่เดียวทั้งระบบ — ประกอบเองแล้วลูกค้าที่มี
     แต่ชื่ออังกฤษได้ป้าย " (AR-630)" ชื่อหาย และพิมพ์ชื่ออังกฤษหาไม่เจอ */
  const customerOptions = useMemo(() => customerSelectOptions(customers), [customers]);
  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.code, label: p.th, search: `${p.th} ${p.en}` })),
    [provinces],
  );

  return (
    <div className={styles.grid}>
      <label className={`${styles.field} ${styles.wide}`}>
        <span>ลูกค้า *</span>
        <SearchableSelect
          value={form.customerId}
          onChange={changeCustomer}
          options={customerOptions}
          entity="customer"
          placeholder="เลือกลูกค้า"
          ariaLabel="ลูกค้าเจ้าของไซต์"
        />
      </label>

      {/* ⭐ **ตั้งจากที่อยู่ในทะเบียนลูกค้า** (มติ 2026-08-28) — เลิกพิมพ์ที่อยู่
          ซ้ำสองที่ · กดไทล์แล้วชื่อ/จังหวัด/ที่อยู่ถูกเติมให้ แล้วแก้ต่อได้เอง
          ⚠️ **ก๊อปมาตั้งต้นเท่านั้น ไม่ผูกให้เปลี่ยนตามกัน** — ที่อยู่ทางภาษีกับ
          ที่อยู่หน้างานเป็นคนละความจริง เครื่องย้ายชั้นไม่ได้แปลว่าบริษัทย้าย
          ⚠️ ที่นี่ **เลือกได้อย่างเดียว** เพิ่มที่อยู่ต้องไปทะเบียนลูกค้า — ไม่งั้น
          ที่อยู่หน้างานจะไหลกลับเข้าไปอยู่ในเอกสารภาษี
          ⭐ **โหมดแก้ก็เห็นไทล์** (มติ 2026-08-29) — ไซต์ที่พิมพ์เองไว้ก่อน ผูกกลับ
          เข้าทะเบียนทีหลังได้ · ไทล์ที่ติดอยู่คือที่มาที่บันทึกไว้ (mig 0313)
          ⭐ **อยู่เหนือช่องกรอกทุกช่องตั้งแต่ 2026-08-30** (มติผู้ใช้: "ต้องดึงมาจาก
          ฐานข้อมูลลูกค้าก่อน ถ้านอกเหนือค่อยเพิ่มเอง") — ลำดับบนจอคือลำดับที่อยากให้คิด:
          หาที่อยู่ที่ลูกค้ามีอยู่แล้วก่อน แล้วค่อยตกลงมาที่ "ที่อยู่อื่น — พิมพ์เอง" */}
      {addressOptions.length > 0 && (
        <div className={`${styles.field} ${styles.wide}`}>
          <span>{editing ? "ที่อยู่ต้นทางจากทะเบียนลูกค้า" : "ตั้งจากที่อยู่ในทะเบียนลูกค้า"}</span>
          <OptionTiles
            value={pickedAddressId}
            onChange={applyCustomerAddress}
            ariaLabel="ที่อยู่จากทะเบียนลูกค้า"
            options={[
              ...addressOptions.map((row) => ({
                value: row.id,
                label: row.label || row.branchCode || "ที่อยู่",
                description: [ADDRESS_USE_LABELS[addressUse(row)], addressText(row)]
                  .filter(Boolean).join(" · ").slice(0, 120),
              })),
              { value: OWN_ADDRESS, label: "ที่อยู่อื่น — พิมพ์เอง", description: "ไซต์ที่ไม่ใช่สถานประกอบการทางภาษี เช่น ล็อบบี้ห้างที่เช่าพื้นที่" },
            ]}
          />
          {editing && !pickedAddressId && (
            <small>ยังไม่รู้ที่มา — เลือกไทล์เพื่อผูกกับทะเบียน หรือปล่อยไว้ถ้าที่อยู่นี้พิมพ์เอง</small>
          )}
        </div>
      )}

      <label className={styles.field}>
        <span>ชื่อไซต์ *</span>
        <Input value={form.name} onChange={change("name")} placeholder="สาขาเอ็มควอเทียร์ ชั้น 3" maxLength={150} />
      </label>

      {/* ── จังหวัด (mig 0315) ────────────────────────────────────────────
          ⭐ **ไม่ใช่ช่องที่อยู่ แต่เป็นตัวตน** — รหัสไซต์ `ST-XXXX-AA-BBB-CCCC`
             ประกอบจากภาคและจังหวัด ⇒ ขาดไม่ได้ตอนสร้าง
          ⚠️ **แก้ทีหลังไม่เปลี่ยนรหัสที่ออกไปแล้ว** — บอกไว้ใต้ช่องในโหมดแก้
             ไม่งั้นคนจะคาดหวังว่าแก้จังหวัดแล้วรหัสตามไปด้วย */}
      <label className={styles.field}>
        <span>จังหวัด {editing ? "" : "*"}</span>
        <SearchableSelect
          value={form.provinceCode}
          onChange={pickProvince}
          options={provinceOptions}
          placeholder="เลือกจังหวัด"
          ariaLabel="จังหวัดของไซต์"
        />
        <small>
          {provinceError
            || (editing
              ? "แก้ได้ แต่รหัสไซต์ที่ออกไปแล้วไม่เปลี่ยนตาม — รหัสคือตัวตน ไม่ใช่สรุปที่อยู่ปัจจุบัน"
              : provinceHint || `ใช้ประกอบรหัสไซต์ ${SITE_CODE_HINT} — เลือกแล้วเปลี่ยนภายหลังได้ แต่รหัสจะไม่เปลี่ยนตาม`)}
        </small>
      </label>

      {identityExtra}

      <label className={styles.field}>
        <span>เขตวิ่งงาน</span>
        <Input value={form.routeZone} onChange={change("routeZone")} placeholder="BKK-E / ปริมณฑล" maxLength={50} />
        <small>ใช้จัดรอบวิ่งให้เจ้าหน้าที่ไม่ต้องข้ามเมืองในวันเดียว</small>
      </label>

      {/* ── ทะเบียนขยับหลังไซต์ถูกสร้าง ────────────────────────────────
          ไม่อัปเดตให้เอง (ที่อยู่ทางภาษี ≠ ที่อยู่หน้างาน) แต่ต้อง **บอกว่าต่าง**
          แล้วให้คนตัดสิน · กดแล้วทับเฉพาะช่องที่ทะเบียนมีค่า ไม่ล้างของที่กรอกเอง */}
      {stale.length > 0 && (
        <div className={`${styles.field} ${styles.wide} ${styles.stale}`} role="status">
          <span>ทะเบียนลูกค้าเปลี่ยนไปจากที่ก๊อปไว้ — {stale.map((f) => f.label).join(" · ")}</span>
          <Button size="sm" tone="neutral" onClick={() => applyCustomerAddress(pickedAddressId)}
            icon={<RefreshCw size={14} aria-hidden="true" />}>
            ดึงค่าจากทะเบียนมาทับ
          </Button>
          <small>ไม่กดก็ได้ — ที่อยู่หน้างานต่างจากที่อยู่จดทะเบียนเป็นเรื่องปกติ</small>
        </div>
      )}

      <label className={`${styles.field} ${styles.wide}`}>
        <span>ที่อยู่</span>
        <Input as="textarea" rows={2} value={form.address} onChange={change("address")} maxLength={500} />
        {pickedAddressId && pickedAddressId !== OWN_ADDRESS && (
          <small>ก๊อปมาจากทะเบียนลูกค้าเป็นค่าตั้งต้น — แก้ต่อได้ ไม่กระทบทะเบียน</small>
        )}
      </label>

      <label className={styles.field}>
        <span>ลิงก์แผนที่</span>
        <Input value={form.mapUrl} onChange={change("mapUrl")} placeholder="https://maps.app.goo.gl/..." maxLength={500} />
      </label>

      <label className={styles.field}>
        <span>ผู้ติดต่อหน้างาน</span>
        <Input value={form.contactName} onChange={change("contactName")} maxLength={100} />
      </label>

      <label className={styles.field}>
        <span>เบอร์ผู้ติดต่อ</span>
        <Input value={form.contactPhone} onChange={change("contactPhone")} maxLength={50} />
      </label>

      {/* ── ช่วงเวลาที่ไซต์ยอมให้เข้า ─────────────────────────────────── */}
      <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
        <legend>ช่วงเวลาที่เข้าไซต์ได้</legend>
        <p className={styles.hint}>
          ข้อจำกัดถาวรของไซต์ (ห้างเปิด 10:00 · โรงงานพัก 12:00–13:00) กรอกครั้งเดียวใช้ตลอด —
          คนละเรื่องกับเวลานัดแต่ละครั้ง · เว้นว่าง = เข้าได้ตลอดเวลาทำการ
        </p>
        <div className={styles.timeRow}>
          <label className={styles.timeField}>
            <span>ตั้งแต่</span>
            <TimeInput value={form.accessFrom} onChange={(value) => setForm((prev) => ({ ...prev, accessFrom: value }))} />
          </label>
          <label className={styles.timeField}>
            <span>ถึง</span>
            <TimeInput value={form.accessTo} onChange={(value) => setForm((prev) => ({ ...prev, accessTo: value }))} />
          </label>
        </div>
        <div className={styles.dayRow} role="group" aria-label="วันที่เข้าไซต์ได้">
          {WEEKDAYS.map((day) => (
            <label key={day} className={styles.dayChip}>
              <input type="checkbox" checked={form.accessDays.includes(day)} onChange={() => toggleDay(day)} />
              <span>{WEEKDAY_LABELS[day]}</span>
            </label>
          ))}
        </div>
        <p className={styles.hint}>ไม่ติ๊กเลย = เข้าได้ทุกวัน</p>
        <label className={styles.field}>
          <span>เงื่อนไขอื่น</span>
          <Input value={form.accessNote} onChange={change("accessNote")} placeholder="ต้องแลกบัตร · จอดรถชั้น B2" maxLength={1000} />
        </label>
      </fieldset>

      <label className={`${styles.field} ${styles.wide}`}>
        <span>หมายเหตุ</span>
        <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
      </label>

      {/* โหมดสร้างไม่มีช่องสถานะ — ของใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
      {editing && (
        <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
          <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
          <span>เปิดใช้งาน</span>
          <small>ปิดใช้งาน = ไซต์และประวัติยังอยู่ แต่ไม่ขึ้นในคิวจัดนัดอีก</small>
        </label>
      )}
    </div>
  );
}
