"use client";
// ── บล็อก "สถานที่ + พื้นที่ที่ต้องประเมิน" ของใบประเมินพื้นที่ (mig 0314) ──
//
// ⭐ **หนึ่งใบ = หนึ่งสถานที่ · หนึ่งรายการ = หนึ่งพื้นที่ (โซน)** (มติผู้ใช้ 2026-08-29)
//    รายการเดียวมีของสองแบบปนกันได้: โซนเดิมที่มีรหัส ZN แล้ว กับพื้นที่ใหม่ที่ยัง
//    ไม่มีรหัสจนกว่าจะกดส่งใบ — **ลิสต์เดียว สองปุ่ม** ไม่ใช่สองบล็อกแยก
//    (ถ้าแยกบล็อก คนอ่านต้องบวกเลขเองว่าใบนี้ให้ไปวัดกี่จุด)
//
// ⚠️ ตัวตรวจอยู่ที่ `lib/service/surveyRequest.js` ตัวเดียว — ทั้งจอนี้และ handler
//    เรียกตัวเดียวกัน · ห้ามเขียนกฎชื่อซ้ำ/เพดานจำนวนขึ้นใหม่ตรงนี้
//
// ⚠️ **โหลดของเองในคอมโพเนนต์นี้** (ไม่รับผ่าน props เหมือนดีล/SO) — ทะเบียนไซต์
//    ผูกกับ *ลูกค้าของดีลที่เพิ่งเลือก* ⇒ ผู้เรียกทุกที่ (หน้าเปิดคำร้อง + โมดัลใน
//    หน้าอื่น) จะต้องรู้จัก /api/service/sites เหมือนกันหมดถ้าให้ส่งมาทางพรอป
import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import { apiJson } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { zoneNameKey } from "@/lib/service/surveyRequest";
import { sitePickSummary, zonePickList } from "@/lib/service/zonePickState";
import { floorLabel, normalizeFloor } from "@/lib/service/zoneCode";
import styles from "./requestForm.module.css";

// เกินเท่านี้แล้วแผ่นเลือกยาวกว่าหน้าจอ — ค่อยเปลี่ยนเป็นช่องค้นหา
// (กติกา "ชุดเล็กกางให้เห็น ชุดยาวค่อยเป็นดรอปดาวน์" — OptionTiles.js)
const TILE_LIMIT = 6;

export default function SurveySiteFields({
  customerId = "",
  customerName = "",
  value,
  onChange,
  disabled = false,
  canCreateSite = false,
  /* โหมดอ่านอย่างเดียว (ทางแก้ใบ) — บล็อกนี้แสดงของที่ใบถืออยู่ แต่แก้ไม่ได้
     ⚠️ เหตุผลอยู่ที่ผู้เรียก (`RequestForm`) — ทางแก้ใบเขียนได้แค่หัวใบ */
  readOnly = false,
}) {
  const siteId = value.siteId || "";
  const zones = value.zones || [];
  const [sites, setSites] = useState([]);
  const [siteZones, setSiteZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  // `adding` แยกจากเนื้อของร่าง — ช่องเปล่ากับ "ยังไม่เปิดช่อง" คนละสถานะ
  const [adding, setAdding] = useState(false);
  // โมดัลสร้างสถานที่ — **ฟอร์มตัวเดียวกับทะเบียนไซต์** (กฎ AGENTS.md) ไม่ใช่ฟอร์มที่สอง
  const [creatingSite, setCreatingSite] = useState(false);
  const [draft, setDraft] = useState({ name: "", floor: "", note: "" });
  // สถานที่ที่กำลังจะสลับไป — ค้างไว้จนกว่าจะยืนยัน (null = ไม่ได้ถามอยู่)
  const [switchTo, setSwitchTo] = useState(null);

  const set = (patch) => onChange({ ...value, ...patch });

  // ทะเบียนไซต์ของลูกค้าเจ้าของดีล — เปลี่ยนดีลข้ามลูกค้าแล้วต้องล้างที่เลือกไว้
  // (ไม่ล้าง = ใบไปเกาะไซต์ของลูกค้าคนก่อน แล้วโดน handler ตีกลับตอนกดบันทึก)
  useEffect(() => {
    if (!customerId) { setSites([]); return undefined; }
    let alive = true;
    setLoading(true);
    apiJson(`/api/service/sites?customerId=${encodeURIComponent(customerId)}&includeInactive=0`)
      .then((rows) => { if (alive) setSites(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setSites([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customerId]);

  /* 🐞 **เปลี่ยนดีลข้ามลูกค้าแล้วไซต์เดิมค้างอยู่** — ใบจะเกาะไซต์ของลูกค้าคนก่อน
     แล้วโดน handler ตีกลับตอนกดบันทึก โดยที่จอยังโชว์ชื่อไซต์เดิมอยู่
     ⚠️ ตัดสินจาก **ลิสต์ที่โหลดมาแล้ว** ไม่ใช่จากการที่ customerId เปลี่ยน — โหมดแก้
        โหลดใบก่อนแล้ว customerId ตามมาทีหลัง ถ้าล้างทันทีจะลบของที่บันทึกไว้ทิ้ง
     🐞 **effect นี้เคยไม่มี dependency array** ⇒ รันทุกเรนเดอร์ · พอ `/api/service/sites`
        ล้มชั่วคราว (หรือคืนลิสต์ว่างจังหวะหนึ่ง) มันจะล้างไซต์ **และพื้นที่ที่พิมพ์ไว้ทั้งหมด**
        ทิ้งกลางที่คนกำลังกรอก · ตอนนี้ผูกกับ [sites, siteId, loading, customerId] และ
        ไม่แตะอะไรเลยในโหมดอ่านอย่างเดียว
     ⚠️ ลิสต์ว่างไม่ใช่หลักฐานว่าไซต์ผิดลูกค้า — โหลดพลาดก็ว่างเหมือนกัน ⇒ ล้างเฉพาะตอน
        ลิสต์ **มีของ** แล้วไม่มีไซต์นี้อยู่ในนั้น */
  useEffect(() => {
    if (readOnly) return;
    if (!siteId || loading || !customerId) return;
    if (!sites.length) return;
    if (sites.some((row) => row.id === siteId)) return;
    set({ siteId: "", zones: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, siteId, loading, customerId, readOnly]);

  /* ── ทะเบียนพื้นที่ของลูกค้าทั้งราย (เฟส 3A · §5A) ────────────────────────
     ⭐ **คำขอเดียวจบ** — เดิมยิงโซนรายไซต์ ซึ่งตอบได้แค่ "ไซต์นี้มีพื้นที่อะไร"
        แต่จังหวะแรกของฟอร์มต้องพูดว่า *"ลูกค้ารายนี้เคยประเมินไว้แล้ว N พื้นที่ ใน M
        สถานที่"* และแต่ละพื้นที่ต้องบอกด้วยว่า **วัดแล้วไหม ขายแล้วไหม มีใบสั่งวัดค้างไหม**
        ⇒ ข้อมูลชุดเดียวกับแท็บ "พื้นที่บริการ" บนหน้าลูกค้า · เส้นเดียว สองจอ
     ⚠️ ดึงตอนรู้ลูกค้าแล้วเท่านั้น — ลูกค้ามาจากดีล ก่อนเลือกดีลยังไม่มีอะไรให้ดึง
     🔴 **ดึงไม่ได้ห้ามบล็อกการเปิดใบ** (ม็อก §12) — เพิ่มพื้นที่ใหม่ได้ตามปกติ
        แค่บอกว่าดึงของเดิมไม่ได้ พร้อมปุ่มลองใหม่ */
  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState("");
  const [registryTick, setRegistryTick] = useState(0);

  useEffect(() => {
    if (!customerId) { setRegistry(null); setRegistryError(""); return undefined; }
    let alive = true;
    setRegistryError("");
    apiJson(`/api/service/customers/${encodeURIComponent(customerId)}/zones`)
      .then((d) => { if (alive) setRegistry(d); })
      .catch((e) => {
        if (!alive) return;
        setRegistry(null);
        setRegistryError(e?.message || "ดึงพื้นที่เดิมไม่สำเร็จ");
      });
    return () => { alive = false; };
  }, [customerId, registryTick]);

  /* พื้นที่ของไซต์ที่เลือก — อ่านจากทะเบียนที่โหลดมาแล้ว ไม่ยิงซ้ำ
     ⚠️ ต้องคง `siteZones` ไว้เป็นรูปเดิม (id/name/code) เพราะยามชื่อซ้ำและป้ายบนแถว
        ใช้มันอยู่ · เปลี่ยนรูปเมื่อไรต้องไล่แก้ทั้งไฟล์ */
  const siteEntry = useMemo(
    () => (registry?.sites || []).find((s) => s.id === siteId) || null,
    [registry, siteId],
  );
  useEffect(() => {
    setSiteZones(siteEntry ? siteEntry.zones : []);
    setPicking(false);
  }, [siteEntry]);

  /* ⭐ **สร้างสถานที่ได้ตรงนี้เลย** (มติผู้ใช้ 2026-08-29 — เปิดสิทธิ์ให้ SA สร้างไซต์)
     จังหวะที่คนขายรู้ว่าลูกค้าจะติดตั้งที่ไหนคือตอนกำลังเปิดใบประเมินนี่เอง ⇒ ให้เดิน
     ต่อได้โดยไม่ต้องออกไปทะเบียนแล้วกลับมาเปิดใบใหม่
     ⚠️ ยิง POST เส้นเดียวกับทะเบียน (`/api/service/sites`) ⇒ ด่านสิทธิ์/ด่านรหัสเป็น
        ตัวเดียวกันเป๊ะ ไม่มีทางลัดที่ตรวจน้อยกว่า */
  const createSite = async (payload) => {
    const created = await apiJson("/api/service/sites", {
      method: "POST",
      json: { ...payload, customerId },
      fallbackError: "สร้างสถานที่ไม่สำเร็จ",
    });
    setSites((prev) => [...prev, created]);
    set({ siteId: created.id, zones: [] });
    return created;
  };

  const applySite = (id) => {
    set({ siteId: id, zones: [] });
    setAdding(false);
    setDraft({ name: "", floor: "", note: "" });
  };

  const pickSite = (id) => {
    if (id === siteId) return;
    /* ⚠️ เปลี่ยนสถานที่ = ล้างพื้นที่ทั้งลิสต์ — ของที่เลือกไว้เป็นของสถานที่เดิมทั้งชุด
       (handler ตรวจซ้ำอยู่แล้ว แต่ให้ผู้ใช้เห็นผลทันทีดีกว่าถูกตีกลับตอนกดส่ง)
       🔴 **ถามก่อนถ้ากรอกไว้แล้ว** — เป็นงานที่หายทั้งชุด ไม่ใช่ค่าเดียว (ม็อก §12) */
    if (zones.length) { setSwitchTo(id); return; }
    applySite(id);
  };

  const addZone = (row) => set({ zones: [...zones, row] });
  const dropZone = (index) => set({ zones: zones.filter((_, i) => i !== index) });

  const takenZoneIds = new Set(zones.map((z) => z.zoneId).filter(Boolean));
  const takenNames = new Set([
    ...zones.filter((z) => z.name).map((z) => zoneNameKey(z.name)),
    ...siteZones.map((z) => zoneNameKey(z.name)),
  ]);
  const restZones = siteZones.filter((z) => !takenZoneIds.has(z.id));
  /* ไทล์พื้นที่เดิมพร้อมสถานะสองแกน — เรียงตามความสำคัญที่ม็อกกำหนด
     (⭐ วัดแล้วยังไม่ขาย ขึ้นก่อน · 🔒 ที่ล็อกอยู่ล่างสุด แต่ยังต้องเห็น) */
  const pickTiles = zonePickList(restZones, takenZoneIds);
  const lockedCount = pickTiles.filter((t) => t.locked).length;
  const pickableCount = pickTiles.length - lockedCount;

  /* จังหวะแรกของฟอร์มต้องพูดว่า "ลูกค้ารายนี้เคยประเมินไว้แล้วเท่าไร" ไม่ใช่ช่องเปล่า
     ⚠️ ลูกค้าใหม่ที่ยังไม่มีพื้นที่เลย = **ซ่อนทั้งบรรทัด** ไม่ใช่โชว์เลขศูนย์ */
  const customerSummary = registry && registry.measuredCount > 0
    ? `ลูกค้ารายนี้ประเมินไว้แล้ว ${registry.measuredCount} พื้นที่ ใน ${registry.siteCount} สถานที่`
      + (registry.soldCount ? ` · ขายแล้ว ${registry.soldCount}` : "")
    : null;
  const zoneName = (row) => row.name
    || siteZones.find((z) => z.id === row.zoneId)?.name
    || row.zoneId;

  const submitDraft = () => {
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (takenNames.has(zoneNameKey(name))) return;   // ปุ่มจางอยู่แล้ว — กันซ้ำอีกชั้น
    const floor = normalizeFloor(draft.floor);
    if (floor.error) return;
    addZone({ name, floor: floor.value, note: draft.note.trim() || null });
    setDraft({ name: "", floor: "", note: "" });
    setAdding(false);
  };

  const draftName = draft.name.trim().replace(/\s+/g, " ");
  const draftClash = !!draftName && takenNames.has(zoneNameKey(draftName));
  // ชั้นของพื้นที่ใหม่ (mig 0315) — เป็นท่อนหนึ่งของรหัสโซนที่จะออกตอนกดส่ง
  const draftFloor = normalizeFloor(draft.floor);

  /* ⚠️ **`defaults` ต้องเป็นตัวเดิมข้ามเรนเดอร์** — `ServiceSiteModal` มีมันอยู่ใน deps
     ของ effect ที่ `setForm(...)` ⇒ object literal ใหม่ทุกเรนเดอร์ = ฟอร์มถูกล้าง
     ทุกครั้งที่ผู้ใช้พิมพ์ (state ของพ่อขยับ → พ่อเรนเดอร์ใหม่ → defaults ใหม่ → รีเซ็ต) */
  const siteDefaults = useMemo(() => ({ customerId }), [customerId]);
  const siteCustomers = useMemo(
    () => (customerId ? [{ id: customerId, name: customerName || customerId }] : []),
    [customerId, customerName],
  );

  /* บรรทัดสรุปใต้ชื่อสถานที่ — "4 พื้นที่ · วัดแล้ว 2 · ขายแล้ว 1" (ม็อก §11)
     ⭐ ทำให้คนเลือกไซต์ได้ถูกตั้งแต่ก่อนกด ไม่ต้องกดเข้าไปดูทีละใบ */
  const summaryOf = (siteRow) => {
    const entry = (registry?.sites || []).find((x) => x.id === siteRow.id);
    if (!entry || !entry.zoneCount) return null;
    const sum = sitePickSummary(entry);
    return [
      `${sum.zones} พื้นที่`,
      sum.measured ? `วัดแล้ว ${sum.measured}` : null,
      sum.sold ? `ขายแล้ว ${sum.sold}` : null,
      sum.pending ? `มีใบสั่งวัดค้าง ${sum.pending}` : null,
    ].filter(Boolean).join(" · ");
  };

  const siteOptions = sites.map((s) => ({
    value: s.id,
    label: s.name || s.code || s.id,
    description: [[s.code, s.address].filter(Boolean).join(" · "), summaryOf(s)]
      .filter(Boolean).join(" — ") || undefined,
    // ค้นด้วยรหัส SS หรือที่อยู่ได้ด้วย — คนจำสาขาจากถนน ไม่ใช่จากชื่อในทะเบียน
    search: [s.name, s.code, s.address, s.routeZone].filter(Boolean).join(" "),
  }));

  /* ── โหมดอ่านอย่างเดียว ─────────────────────────────────────────────────
     ⭐ แสดง **ของจริงที่ใบถืออยู่** ไม่ใช่ช่องเปล่า — ช่องเปล่าอ่านว่า "ยังไม่ได้เลือก"
        ทั้งที่ใบมีสถานที่อยู่ และถ้ากดบันทึกทับจะดูเหมือนของหาย */
  if (readOnly) {
    const picked = sites.find((row) => row.id === siteId) || null;
    return (
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>สถานที่และพื้นที่ที่ต้องประเมิน</span>
        <small className={styles.hint}>
          {loading ? "กำลังโหลด…" : naText([picked?.code, picked?.name].filter(Boolean).join(" · "))}
        </small>
        {zones.length > 0 && (
          <ol className={styles.zoneList}>
            {zones.map((row, index) => (
              <li key={row.zoneId || `ro-${index}`} className={styles.zoneRow}>
                <span className={styles.zoneNo}>{index + 1}</span>
                <span className={styles.zoneBody}>
                  <b>{zoneName(row)}</b>
                  <small className={styles.hint}>
                    {row.zoneId
                      ? (siteZones.find((z) => z.id === row.zoneId)?.code || "พื้นที่เดิม")
                      : `พื้นที่ใหม่ · ${floorLabel(row.floor) || "ยังไม่ระบุชั้น"}`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        )}
        <small className={styles.hint}>
          สถานที่และพื้นที่แก้ที่นี่ไม่ได้ — ร่างที่ยังไม่ส่งลบแล้วเปิดใหม่ได้ (ยังไม่กินเลขที่)
        </small>
      </div>
    );
  }

  return (
    <>
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>สถานที่ที่จะให้เข้าไปประเมิน</span>
        {!customerId ? (
          /* ⚠️ **ต้องบอกว่าดีลอยู่ที่ไหน ไม่ใช่แค่ว่าต้องมีดีล** — บล็อกนี้ย้ายมาอยู่แท็บ
             "รายละเอียด" แล้ว (มติ 2026-09-02) ส่วนช่องดีลอยู่แท็บ "งาน" ⇒ ข้อความเดิม
             ("เลือกดีลก่อน") อ่านบนแท็บนี้แล้วไม่รู้ว่าต้องไปเลือกที่ไหน */
          <small className={styles.hint}>
            เลือกดีลในแท็บ “งาน” ก่อน — รายการสถานที่มาจากลูกค้าของดีลนั้น
          </small>
        ) : loading ? (
          <small className={styles.hint}>กำลังโหลดทะเบียนไซต์ของ {customerName || "ลูกค้ารายนี้"}…</small>
        ) : !sites.length ? (
          /* ทางตันต้องบอกทางออก ไม่ใช่ช่องว่าง — คนที่สร้างไม่ได้ต้องรู้ว่าไปขอใคร */
          <small className={styles.hint}>
            {customerName || "ลูกค้ารายนี้"} ยังไม่มีสถานที่ในทะเบียนไซต์บริการ —
            {canCreateSite
              ? ' กดปุ่ม "สร้างสถานที่ใหม่" ข้างล่างได้เลย'
              : " บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว — ให้ฝ่ายขายหรือฝ่ายบริการเป็นคนสร้าง"}
          </small>
        ) : siteOptions.length > TILE_LIMIT ? (
          <SearchableSelect
            options={siteOptions.map((o) => ({
              value: o.value, label: o.label, search: o.search,
              render: (
                <span className={styles.siteOption}>
                  <b>{o.label}</b>
                  {o.description ? <small className={styles.hint}>{o.description}</small> : null}
                </span>
              ),
            }))}
            value={siteId}
            onChange={pickSite}
            disabled={disabled}
            placeholder="เลือกสถานที่"
            ariaLabel="สถานที่ที่จะให้เข้าไปประเมิน"
          />
        ) : (
          <OptionTiles
            options={siteOptions}
            value={siteId}
            onChange={pickSite}
            disabled={disabled}
            ariaLabel="สถานที่ที่จะให้เข้าไปประเมิน"
          />
        )}
        {/* ⭐ จังหวะแรกต้องบอกว่าลูกค้ารายนี้มีของเดิมเท่าไร ไม่ใช่เริ่มที่ช่องเปล่า
            (แผน §5A: *"การจะไปรอบสองหรือถัดไป ก็จะสามารถดูได้ว่าที่เดิมหรือเพิ่มที่ใหม่"*) */}
        {customerSummary && <small className={styles.hint}>{customerSummary}</small>}
        {/* 🔴 ดึงของเดิมไม่ได้ ห้ามบล็อกการเปิดใบ — เพิ่มที่ใหม่ได้ตามปกติ */}
        {!!registryError && !!customerId && (
          <div className={styles.zoneActions}>
            <small className={styles.hint}>ดึงพื้นที่เดิมไม่ได้ · เพิ่มที่ใหม่ได้ตามปกติ</small>
            <Button type="button" size="sm" variant="ghost" disabled={disabled}
              onClick={() => setRegistryTick((n) => n + 1)}>
              ลองใหม่
            </Button>
          </div>
        )}
        {canCreateSite && !!customerId && (
          <div className={styles.zoneActions}>
            <Button
              type="button" size="sm" variant="outline" disabled={disabled}
              icon={<Plus size={16} />}
              onClick={() => setCreatingSite(true)}
            >
              สร้างสถานที่ใหม่
            </Button>
          </div>
        )}
      </div>

      {/* ⚠️ ล้างพื้นที่ที่เลือกไว้ทั้งชุด = งานที่หายไปทั้งก้อน ⇒ ต้องบอกจำนวนที่จะหาย
          ไม่ใช่ถามลอย ๆ ว่า "ยืนยันไหม" */}
      <ConfirmDialog
        open={!!switchTo}
        title="เปลี่ยนสถานที่ของใบนี้"
        message={`พื้นที่ที่เลือกไว้ ${zones.length} รายการจะถูกล้างทั้งหมด — พื้นที่เหล่านั้นเป็นของสถานที่เดิม`}
        detail="เลือกใหม่จากพื้นที่ของสถานที่ที่เพิ่งเลือกได้ทันที"
        confirmLabel="เปลี่ยนสถานที่"
        onConfirm={() => { applySite(switchTo); setSwitchTo(null); }}
        onClose={() => setSwitchTo(null)}
      />

      {/* ฟอร์มไซต์ตัวเดียวกับทะเบียน — ล็อกลูกค้าไว้ที่ลูกค้าของดีล (ใบนี้เป็นของเขา) */}
      <ServiceSiteModal
        open={creatingSite}
        customers={siteCustomers}
        defaults={siteDefaults}
        /* ⚠️ ใบคำร้องเรียกของสิ่งนี้ว่า **สถานที่** ทั้งฟอร์ม — โมดัลต้องพูดคำเดียวกัน
           ไม่งั้นกดปุ่ม "สร้างสถานที่ใหม่" แล้วเจอหัวเรื่อง "เพิ่มไซต์บริการ" */
        noun="สถานที่"
        onClose={() => setCreatingSite(false)}
        onSave={createSite}
      />

      {!!siteId && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>
            พื้นที่ที่ต้องประเมิน{" "}
            <span className={styles.hint}>(1 รายการ = 1 พื้นที่)</span>
          </span>

          {zones.length ? (
            <ol className={styles.zoneList}>
              {zones.map((row, index) => (
                <li key={row.zoneId || `new-${index}-${row.name}`} className={styles.zoneRow}>
                  <span className={styles.zoneNo}>{index + 1}</span>
                  <span className={styles.zoneBody}>
                    <b>{zoneName(row)}</b>
                    <small className={styles.hint}>
                      {row.zoneId
                        ? `${siteZones.find((z) => z.id === row.zoneId)?.code || row.zoneId} · วัดซ้ำพื้นที่เดิม`
                        : `พื้นที่ใหม่ · ${floorLabel(row.floor) || "ยังไม่ระบุชั้น"} — ได้รหัส ZN ตอนกดส่งใบ`}
                      {row.note ? ` · ${row.note}` : ""}
                    </small>
                  </span>
                  <Button
                    type="button" iconOnly variant="ghost" size="sm" disabled={disabled}
                    icon={<X size={16} />} aria-label={`เอา ${zoneName(row)} ออก`}
                    onClick={() => dropZone(index)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <small className={styles.hint}>ยังไม่มีพื้นที่ในใบนี้ — เพิ่มอย่างน้อย 1 รายการก่อนส่ง</small>
          )}

          <div className={styles.zoneActions}>
            <Button
              type="button" tone="accent" size="sm" disabled={disabled}
              icon={<Plus size={16} />}
              onClick={() => { setPicking(false); setAdding(true); }}
            >
              เพิ่มพื้นที่ใหม่
            </Button>
            {/* ⚠️ ปุ่มจางต้องบอกเหตุ (กติกาของรีโป) — "ไม่มีพื้นที่เดิมให้เลือก" กับ
                "เลือกครบแล้ว" คนละเรื่องกัน และทางแก้คนละทาง */}
            {/* ⚠️ นับเฉพาะที่ **ติ๊กได้จริง** — รวมที่ล็อกเข้าไปด้วยแล้วปุ่มจะบอกว่ามี 5 ให้เลือก
                แต่กดเข้าไปติ๊กได้ 2 · ที่ล็อกยังโชว์อยู่ในแผ่น พร้อมเหตุผล */}
            <Button
              type="button" size="sm" disabled={disabled || !pickTiles.length}
              icon={<Layers size={16} />}
              onClick={() => setPicking((on) => !on)}
            >
              เลือกจากพื้นที่เดิม{pickableCount ? ` (${pickableCount})` : ""}
            </Button>
            {/* ปุ่มจางต้องบอกเหตุ และสามเหตุนี้แก้คนละทาง */}
            {!pickTiles.length && (
              <small className={styles.hint}>
                {siteZones.length
                  ? "เลือกพื้นที่เดิมครบทุกรายการแล้ว"
                  : "สถานที่นี้ยังไม่มีพื้นที่ในทะเบียน — เริ่มที่ “เพิ่มพื้นที่ใหม่”"}
              </small>
            )}
            {!!pickTiles.length && !pickableCount && (
              <small className={styles.hint}>
                พื้นที่เดิมของสถานที่นี้มีใบสั่งวัดค้างอยู่ทั้งหมด {lockedCount} รายการ
              </small>
            )}
          </div>

          {/* พื้นที่ใหม่ — ชื่ออย่างเดียวพอ (อาคาร/ชั้นเป็นของทะเบียนที่ TS กรอกหน้างาน) */}
          {adding && (
            <div className={styles.zoneDraft}>
              <Input
                value={draft.name}
                disabled={disabled}
                autoFocus
                placeholder="ชื่อพื้นที่ เช่น ล็อบบี้ชั้น G"
                aria-label="ชื่อพื้นที่ใหม่"
                invalid={draftClash}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
              />
              {/* ⚠️ ชั้นบังคับ — เป็นท่อน FF ของรหัสโซน (ไม่มีชั้นก็ออกรหัสไม่ได้ตอนกดส่ง) */}
              <Input
                value={draft.floor}
                disabled={disabled}
                placeholder="ชั้น เช่น 4 หรือ G"
                aria-label="ชั้นของพื้นที่"
                invalid={!!draft.floor && !!draftFloor.error}
                onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
              />
              <Input
                value={draft.note}
                disabled={disabled}
                placeholder="สิ่งที่อยากให้เจ้าหน้าที่รู้ก่อนไป (ไม่บังคับ)"
                aria-label="หมายเหตุของพื้นที่"
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              <Button
                type="button" tone="primary" size="sm"
                disabled={disabled || !draftName || draftClash || !!draftFloor.error}
                onClick={submitDraft}
              >
                เพิ่ม
              </Button>
              <Button
                type="button" variant="ghost" size="sm" disabled={disabled}
                onClick={() => { setAdding(false); setDraft({ name: "", floor: "", note: "" }); }}
              >
                ยกเลิก
              </Button>
              {/* 🔴 ชื่อชน = ทางตัน ⇒ ต้องมี **ปุ่มพาไปทางที่ถูก** ไม่ใช่บอกเฉย ๆ
                  (ปล่อยไปถึง insert จะได้ error ดิบจาก UNIQUE ของ mig 0297) */}
              {draftClash && (
                <>
                  <small className={styles.hint}>
                    สถานที่นี้มีพื้นที่ชื่อนี้อยู่แล้ว — ต้องการวัดพื้นที่เดิมใช่ไหม
                  </small>
                  <Button
                    type="button" size="sm" variant="outline" disabled={disabled || !pickTiles.length}
                    icon={<Layers size={16} />}
                    onClick={() => {
                      setAdding(false);
                      setDraft({ name: "", floor: "", note: "" });
                      setPicking(true);
                    }}
                  >
                    สลับไปติ๊กพื้นที่เดิม
                  </Button>
                </>
              )}
              {/* ⚠️ ปุ่มจางต้องบอกเหตุเสมอ — ช่องชั้นว่างอยู่ก็เข้าข่าย ไม่ใช่เฉพาะตอนพิมพ์ผิด */}
              {!draftClash && !!draftFloor.error && (!!draft.floor || !!draftName) && (
                <small className={styles.hint}>{draftFloor.error}</small>
              )}
            </div>
          )}

          {/* ── ไทล์พื้นที่เดิม พร้อมสถานะสองแกน (ประเมิน × ขาย) ──────────────
              🔴 **โชว์ทั้งหมด แต่ไม่ติ๊กให้** — ไม่โชว์ = คนพิมพ์ชื่อซ้ำแล้วชน UNIQUE
                 ของ mig 0297 · ติ๊กให้ = สั่งช่างไปเสียเที่ยว
              ⚠️ เหตุผลเป็น **ตัวหนังสือ ไม่ใช่ tooltip** — จอสัมผัสไม่มีวันเห็น title */}
          {picking && (
            <div className={styles.zonePick}>
              {pickTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className={styles.zoneTile}
                  data-kind={tile.kind}
                  disabled={disabled || tile.locked}
                  aria-disabled={tile.locked ? "true" : undefined}
                  onClick={() => {
                    if (tile.locked) return;
                    addZone({ zoneId: tile.id, note: null });
                    setPicking(false);
                  }}
                >
                  <b>{tile.name}</b>
                  <small className={styles.hint}>
                    {[tile.code, floorLabel(tile.floor)].filter(Boolean).join(" · ")}
                  </small>
                  <small className={styles.tileWhy}>{tile.reason}</small>
                  {tile.surveyState === "done" && (
                    <small className={styles.hint}>
                      {[
                        tile.areaSqm !== null ? `${tile.areaSqm} ตร.ม.` : null,
                        tile.assessedPackages ? `${tile.assessedPackages} แพ็คเกจ` : null,
                      ].filter(Boolean).join(" · ")}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
