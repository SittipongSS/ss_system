"use client";
// ── ช่องที่อยู่ไทยแบบแยกช่อง — ชุดเดียวทั้งระบบ ────────────────────────────────
//
// บ้านเลขที่/ถนน → จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์ (เติมจากตำบล)
// + บรรทัด "ข้อความที่จะใช้จริง" + ทางออกสำหรับที่อยู่ที่ไม่เข้าแบบ (พิมพ์ข้อความเอง ·
// แยกที่อยู่อัตโนมัติสำหรับข้อความก้อนเดียวยุคเก่า)
//
// ⭐ ยกออกจาก `database/AddressesEditor` (ทะเบียนลูกค้า) ตอนมีผู้ใช้ที่สอง — ฟอร์มไซต์บริการ
//   (มติผู้ใช้ 2026-09-24: *"การพิมพ์ไซต์อื่น อยากให้ฟอร์มเหมือนที่อยู่ของฐานข้อมูล"*)
//   ⇒ "เหมือน" ด้วยการเป็น **ตัวเดียวกัน** ไม่ใช่ก๊อปหน้าตา (กฎ AGENTS.md: ก๊อปแล้วเพี้ยนหากันเสมอ)
//
// ต่างกันได้แค่ "โหมด" ผ่าน props:
//   english   — ช่องอังกฤษคู่ (ที่อยู่ลูกค้าขึ้นเอกสารอังกฤษ) · ไซต์ไม่มี
//   legacy    — ผู้เรียกตัดสินเองว่าแถวไหนเป็นข้อความยุคเก่า (กติกาของลูกค้ากับไซต์ต่างกัน
//               หนึ่งข้อ: ไซต์มีจังหวัดทุกใบเพราะเป็นตัวตนของรหัส)
//   lockProvinceWhenLegacy — ลูกค้า: ล็อกจนกว่าจะแยก · ไซต์: เลือกได้เสมอ (บังคับกรอก)
//   children  — ช่องท้ายการ์ดของเจ้าของแต่ละราย (เลขสาขา · แผนที่ · ผู้ติดต่อ)
//
// ใช้ primitive กลางล้วน (Button/Input/Textarea/Select) — ratchet ของ audit:ui กันชั้นเก่างอก
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Wand2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { cachedFetchJson } from "@/lib/apiCache";
import { naText } from "@/lib/format";
import { addressText, addressTextEn } from "@/lib/master/addresses";
import {
  autoSplitAddressPatch, districtPickPatch, districtPrefix, provincePickPatch, subdistrictPickPatch,
  subdistrictPrefix,
} from "@/lib/master/thaiAddress";

const PROVINCES_URL = "/api/master/thai-address";
const DAY_MS = 24 * 60 * 60 * 1000;

// แถวที่ "ยังเป็นข้อความยุคเก่า" ของทะเบียนลูกค้า = มีข้อความ แต่ยังไม่เคยแยกฟิลด์เลย
export const isLegacyAddressRow = (row) => !!String(row?.address || "").trim()
  && !row?.province && !String(row?.line1 || "").trim();

/**
 * ทะเบียนจังหวัด/อำเภอ (โหลดครั้งเดียว แคช 24 ชม.) + ตำบลรายอำเภอ (โหลดตอนเลือก)
 *
 * ⚠️ ตำบลทั้งประเทศ 7,452 แถว = 650KB ไม่ควรยัดมาก้อนเดียว ⇒ โหลดรายอำเภอ
 * @param enabled       false = ยังไม่โหลด (โมดัลที่ปิดอยู่)
 * @param districtCodes อำเภอที่ถูกเลือกไว้แล้วตอนเปิดฟอร์ม — ต้องมีตำบลให้เห็นทันที
 *                      ไม่ใช่ช่องว่างที่ดูเหมือนข้อมูลหาย
 */
export function useThaiAddressRegistry({ enabled = true, districtCodes = [] } = {}) {
  const [provinces, setProvinces] = useState([]);
  const [provinceError, setProvinceError] = useState("");
  const [subsByDistrict, setSubsByDistrict] = useState({});
  const loadingSubs = useRef(new Set());

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setProvinceError("");
    cachedFetchJson(PROVINCES_URL, DAY_MS)
      .then((d) => { if (alive) setProvinces(d?.provinces || []); })
      /* ผู้เรียกเลือกเองว่าจะพูดไหม — ที่อยู่ลูกค้ายังพิมพ์ข้อความเองได้ แต่ไซต์บังคับจังหวัด
         (โหลดไม่ได้ = สร้างไซต์ไม่ได้ทั้งระบบ ต้องบอก ไม่ใช่กลืนเงียบ) */
      .catch(() => { if (alive) setProvinceError("โหลดทะเบียนจังหวัดไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่"); });
    return () => { alive = false; };
  }, [enabled]);

  const loadSubs = useCallback(async (districtCode) => {
    if (!districtCode || loadingSubs.current.has(districtCode)) return subsByDistrict[districtCode];
    if (subsByDistrict[districtCode]) return subsByDistrict[districtCode];
    loadingSubs.current.add(districtCode);
    try {
      const data = await cachedFetchJson(`${PROVINCES_URL}?districtCode=${districtCode}`, DAY_MS);
      const list = data?.subdistricts || [];
      setSubsByDistrict((prev) => ({ ...prev, [districtCode]: list }));
      return list;
    } catch {
      return [];
    } finally {
      loadingSubs.current.delete(districtCode);
    }
  }, [subsByDistrict]);

  const districtKey = (districtCodes || []).filter(Boolean).join(",");
  useEffect(() => {
    if (!enabled) return;
    for (const code of districtKey.split(",")) if (code) loadSubs(code);
  }, [enabled, districtKey, loadSubs]);

  const subsOf = useCallback((code) => subsByDistrict[code] || [], [subsByDistrict]);
  return { provinces, provinceError, subsOf, loadSubs };
}

/**
 * ช่องที่อยู่หนึ่งชุด (ไม่มีกรอบการ์ด — ผู้เรียกห่อเอง)
 *
 * @param value      แถวที่อยู่ (รูปของ `asAddressRow` · ไซต์ส่งแถวไซต์ได้ตรง ๆ คีย์ตรงกัน)
 * @param onChange   `(patch) => void` — ผู้เรียกผสานเข้าแถวเอง
 * @param registry   ผลของ `useThaiAddressRegistry`
 * @param legacy     ข้อความยุคเก่าไหม (ไม่ส่ง = กติกาของทะเบียนลูกค้า)
 * @param previewText ข้อความเต็มที่จะใช้จริง (ไม่ส่ง = กติกาประกอบของทะเบียนลูกค้า)
 * @param previewLabel ป้ายหน้าข้อความเต็ม — "บนเอกสารจะพิมพ์ว่า" / "ที่อยู่ที่ช่างจะเห็น"
 * @param notice     ข้อความแทนบรรทัดพรีวิว (เช่นแถวที่ยังไม่เลือกว่าใช้ทำอะไร)
 * @param provinceWarning ข้อความเตือนตอนพิมพ์บ้านเลขที่แล้วยังไม่เลือกจังหวัด (null = ไม่เตือน)
 */
export default function ThaiAddressFields({
  value,
  onChange,
  registry,
  english = true,
  legacy: legacyProp,
  lockProvinceWhenLegacy = true,
  previewText: previewProp,
  previewLabel = "บนเอกสารจะพิมพ์ว่า",
  notice = null,
  provinceWarning = "ยังไม่ได้เลือกจังหวัด — บันทึกได้ แต่เอกสารจะพิมพ์ที่อยู่ไม่ครบ",
  line1Placeholder = "บ้านเลขที่ / หมู่ / ซอย / ถนน…",
  children = null,
}) {
  const a = value || {};
  const text = (field) => String(a[field] ?? "");
  const { provinces = [], subsOf, loadSubs } = registry || {};
  const legacy = legacyProp ?? isLegacyAddressRow(a);
  const typing = legacy || a.addressOverride === true;
  const province = provinces.find((p) => p.code === a.provinceCode);
  const subs = subsOf ? subsOf(a.districtCode) : [];
  // ข้อความที่จะถูกบันทึกจริง — โชว์ให้เห็นก่อนเสมอ ไม่ใช่รู้ตอนใบพิมพ์ออกมาแล้ว
  const preview = previewProp ?? addressText(a);
  // ข้อความอังกฤษที่จะถูกบันทึกจริง (mig 0283) · ว่าง = ยังไม่มีที่อยู่อังกฤษ (ไม่ใช่ขีด)
  const previewEn = english ? addressTextEn(a) : "";
  const [splitMiss, setSplitMiss] = useState(false);
  const showSplitMiss = splitMiss && !legacy && !a.districtCode;

  const pickProvince = (code) => onChange(provincePickPatch(provinces, code));
  const pickDistrict = (code) => {
    onChange(districtPickPatch(provinces, a.provinceCode, code));
    if (code && loadSubs) loadSubs(code);
  };
  const pickSubdistrict = (code) => onChange(subdistrictPickPatch(subs, code));

  /* แยกข้อความเดิม → ฟิลด์ย่อย · จับจังหวัดไม่ได้ = ข้อความทั้งก้อนย้ายไปช่องบ้านเลขที่
     ให้เลือกเอง (บอกตรง ๆ ไม่ใช่กดแล้วเหมือนปุ่มเสีย) */
  const autoSplit = async () => {
    const patch = await autoSplitAddressPatch(text("address"), provinces, loadSubs);
    if (!patch) return;
    setSplitMiss(!patch.provinceCode);
    onChange(patch);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* บ้านเลขที่/ถนน — แถวยุคเก่ายังพิมพ์ที่อยู่ทั้งก้อนในช่องนี้ตามเดิม
          ⭐ ช่องอังกฤษอยู่ **คู่กันเสมอ ไม่ซ่อน ไม่พับ** (มติ 2026-08-22) — ห้ามซ่อน/โผล่ตามสถานะ
          เพราะช่องที่เหลือจะเลื่อนตำแหน่งทุกครั้งที่กดปุ่ม (ผู้ใช้: "กดแล้วมันโดดไปโดดมา")
          ⚠️ พิมพ์แค่ท่อนแรก: ตำบล/อำเภอ/จังหวัดภาษาอังกฤษประกอบให้เองจากทะเบียน */}
      <div className={`grid grid-cols-1 gap-2 ${english ? "sm:grid-cols-2" : ""}`}>
        <Textarea
          rows={2}
          placeholder={typing ? "ที่อยู่เต็ม…" : line1Placeholder}
          value={typing ? text("address") : text("line1")}
          onChange={(e) => onChange(typing ? { address: e.target.value } : { line1: e.target.value })}
          className="w-full text-xs h-[60px] resize-none"
          aria-label={english ? "ที่อยู่ภาษาไทย" : "ที่อยู่"}
        />
        {english && (
          <Textarea
            rows={2}
            placeholder={typing ? "ที่อยู่เต็ม ภาษาอังกฤษ…" : "บ้านเลขที่ / ถนน — ภาษาอังกฤษ…"}
            value={typing ? text("addressEn") : text("line1En")}
            onChange={(e) => onChange(typing ? { addressEn: e.target.value } : { line1En: e.target.value })}
            className="w-full text-xs h-[60px] resize-none"
            aria-label="ที่อยู่ภาษาอังกฤษ (ขึ้นบนเอกสารภาษาอังกฤษ)"
          />
        )}
      </div>
      {/* ช่องอังกฤษไม่เคยมีคำอธิบายที่ "ตาเห็น" เลย มีแต่ aria-label ⇒ คนกรอกไม่รู้ว่า
          ว่างได้ และไม่รู้ว่ามันไปโผล่ที่ไหน · ฝั่งชื่อมี hint มาตั้งแต่ mig 0283 แล้ว */}
      {english && (
        <span className="text-[length:var(--fs-3)] text-[var(--text-3)]">
          ช่องขวาขึ้นบนเอกสารภาษาอังกฤษ — ว่างได้ ถ้าลูกค้ารายนี้ไม่ต้องใช้เอกสารอังกฤษ
          (ว่างแล้วใบอังกฤษจะพิมพ์ที่อยู่ไทยแทน)
        </span>
      )}

      {/* จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Select
          fullWidth
          compact
          className="text-xs"
          value={text("provinceCode")}
          onChange={(e) => pickProvince(e.target.value)}
          disabled={legacy && lockProvinceWhenLegacy}
          aria-label="จังหวัด"
        >
          <option value="">— จังหวัด —</option>
          {provinces.map((p) => <option key={p.code} value={p.code}>{p.th}</option>)}
        </Select>
        <Select
          fullWidth
          compact
          className="text-xs"
          value={text("districtCode")}
          onChange={(e) => pickDistrict(e.target.value)}
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
          value={text("subdistrictCode")}
          onChange={(e) => pickSubdistrict(e.target.value)}
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
          value={text("postcode")}
          aria-label="รหัสไปรษณีย์ (มาจากตำบลที่เลือก)"
          title="มาจากตำบลที่เลือก — แก้ได้โดยเปลี่ยนตำบล"
        />
      </div>

      {children}

      {/* ข้อความที่จะใช้จริง + ทางออกสำหรับที่อยู่ที่ไม่เข้าแม่แบบ */}
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="text-[11px] text-[var(--text-3)] min-w-0 flex-1">
          {notice || (legacy ? (
            <span>ที่อยู่นี้ยังเป็นข้อความก้อนเดียว — กด “แยกที่อยู่อัตโนมัติ” แล้วตรวจก่อนบันทึก</span>
          ) : (
            <>
              <span className="break-words">{previewLabel}: <b className="text-[var(--text-2)]">{naText(preview)}</b></span>
              {/* ⚠️ ไม่มีอังกฤษ = **ไม่มีบรรทัดนี้** ไม่ใช่ขีด — ที่อยู่ส่วนใหญ่ไม่ต้องใช้
                  อังกฤษ ขึ้นขีดใต้ทุกแถวคือเสียงรบกวน (แพตเทิร์นเดียวกับลิงก์แผนที่
                  และแถวเอกสารอ้างอิงบนใบเสนอราคาที่ "ว่าง = ตัดแถวทิ้ง") */}
              {!!previewEn.trim() && (
                <span className="break-words block">
                  ใบภาษาอังกฤษ: <b className="text-[var(--text-2)]">{previewEn}</b>
                </span>
              )}
            </>
          ))}
          {/* แยกอัตโนมัติแล้วจับจังหวัดไม่ได้ — ข้อความย้ายไปช่องบ้านเลขที่แล้ว ต้องบอกว่าทำอะไรต่อ
              (หายเองเมื่อเลือกอำเภอแล้ว) */}
          {showSplitMiss && (
            <span className="break-words block text-[var(--amber)] mt-0.5">
              แยกอัตโนมัติไม่ออก — ข้อความทั้งก้อนย้ายไปช่องบ้านเลขที่แล้ว เลือกจังหวัด/อำเภอ/ตำบลเอง แล้วลบท่อนท้ายที่ซ้ำ
            </span>
          )}
          {/* ⚠️ **เตือน ไม่บล็อก** — ที่อยู่ต่างประเทศไม่มีจังหวัดไทยให้เลือกจริง ๆ
              และแถวที่พิมพ์บ้านเลขที่ไว้ก็บันทึกผ่านได้แล้ว (ดู addressText)
              แต่ที่อยู่ไทยที่ขาดจังหวัดจะพิมพ์ลงเอกสารแบบไม่ครบ ⇒ บอกตรงจุดที่คน
              กำลังกรอกอยู่ ดีกว่าไปเจอตอนเปิดใบเสนอราคาแล้วที่อยู่ห้วน
              🪤 อยู่ **นอก** ทางแยกข้างบนโดยตั้งใจ — แถวที่ผู้เรียกแทนพรีวิวด้วย `notice`
                 คือแถวที่คนกำลังกรอกอยู่พอดี ถ้าไปแปะไว้ในทางสุดท้าย คำเตือนจะไม่โผล่ตอนที่ต้องการ */}
          {!!provinceWarning && !showSplitMiss && !text("province").trim() && !!text("line1").trim() && !a.addressOverride && (
            <span className="break-words block text-[var(--amber)] mt-0.5">{provinceWarning}</span>
          )}
        </div>
        <div className="flex gap-1.5 items-center shrink-0">
          {a.mapUrl && /^https?:\/\//i.test(a.mapUrl) && (
            <a href={a.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] inline-flex items-center gap-1 text-[var(--accent)]">
              <MapPin size={12} /> เปิดแผนที่
            </a>
          )}
          {legacy ? (
            <Button size="sm" icon={<Wand2 size={13} />} onClick={autoSplit} disabled={!provinces.length}>
              แยกที่อยู่อัตโนมัติ
            </Button>
          ) : (
            <Button
              size="sm"
              variant={a.addressOverride ? "filled" : "outline"}
              tone={a.addressOverride ? "primary" : undefined}
              aria-pressed={a.addressOverride === true}
              title="พิมพ์ข้อความที่อยู่เองทั้งก้อน (สำหรับที่อยู่ที่ไม่เข้าแบบฟอร์ม)"
              onClick={() => onChange({
                addressOverride: !a.addressOverride,
                // เปิดโหมดพิมพ์เอง = เริ่มจากข้อความที่ประกอบไว้ ไม่ใช่ช่องว่าง
                address: a.addressOverride ? text("address") : preview,
              })}
            >
              พิมพ์ข้อความเอง
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
