"use client";
// ── เธรดอัปเดตของกลาง (mig 0163) ─────────────────────────────────────────
// component เดียวสำหรับทุก entity — ก่อนหน้านี้ระบบมีเธรดแบบนี้ 4 ชุด (+ลีดอ่าน
// อย่างเดียว) ต่างคนต่างวาด ฟีเจอร์เลยไม่เท่ากันโดยไม่ได้ตั้งใจ
//
// props:
//   entityType/entityId  ตัวที่เธรดผูกอยู่ (ต้องลงทะเบียนใน lib/master/updateAccess)
//   extraItems           รายการ "อ่านอย่างเดียว" จากแหล่งอื่นที่อยากให้เรียงรวมใน
//                        ไทม์ไลน์เดียวกัน (ประวัติสถานะ/เหตุการณ์ลีด) —
//                        [{ id, at, label, color, body, href, linkLabel, threadKey }]
//                        `threadKey` = เรื่องเดียวกันแม้มาจากคนละตาราง (เช่น
//                        `task:<id>` ให้ความคืบหน้าของงานไปซ้อนใต้ "สร้างงาน")
//   pinned               บล็อกปักหมุดหัวเธรด (คำอธิบายของใบนี้) — ไม่เข้าไปเรียงตามเวลา
//   order                'asc' (เก่าก่อน — งาน/สอบถาม) | 'desc' (ใหม่ก่อน — ดีล)
//   onPosted             เรียกหลังโพสต์/แก้/ลบสำเร็จ (ให้หน้าแม่ refresh ตัวนับ)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, X, Pencil, Reply, Trash2, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import RichText from "@/components/ui/RichText";
import Select from "@/components/ui/Select";
import { fmtDateTime, fmtDayTime } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/permissions";
import {
  authorableKinds, DELETED_UPDATE_TEXT, defaultAuthorableKind,
  isNarrativeUpdateItem, isSystemUpdateItem,
  kindAcceptsDueDate, MAX_UPDATE_ATTACHMENTS, updateKindMeta,
} from "@/lib/master/updateTypes";
import {
  isPreviewableImage, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";
import { groupThreadItems } from "@/lib/master/updateGrouping";
import { canQuoteItem, quotedIdOf, quoteView } from "@/lib/master/updateQuote";
import styles from "./UpdateThread.module.css";
import Textarea from "@/components/ui/Textarea";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { postUpdateWithFiles } from "@/lib/master/updatePost";

const fileHref = (row, i) => `/api/updates/${row.id}/file?i=${i}`;

// สวิตช์ซ่อนเหตุการณ์ระบบจำรายชนิดเอกสาร ไม่ใช่รายใบ — คนที่ไม่อยากเห็นเหตุการณ์
// ระบบบนใบ QT ก็ไม่อยากเห็นบนทุกใบ QT ไม่ใช่แค่ใบที่เพิ่งกด
const hideSystemKey = (entityType) => `updateThread.hideSystem.${entityType}`;

export default function UpdateThread({
  entityType,
  entityId,
  extraItems = [],
  /* บล็อกปักหมุดหัวเธรด — "คำอธิบายของใบนี้" ที่ต้องอ่านก่อนไล่ไทม์ไลน์
     ต่างจาก `extraItems` ตรงที่ **ไม่มีเวลา ไม่เข้าไปเรียงในสาย** เพราะมันไม่ใช่
     เหตุการณ์ที่เกิดขึ้นตอนใดตอนหนึ่ง แต่เป็นค่าปัจจุบันของใบที่แก้ได้ตลอด
     (ถ้าเอาไปเรียงตามเวลา มันจะจมอยู่ก้นเธรดของดีลที่คุยกันมานาน) */
  pinned = null,
  order = "asc",
  allowAttachments = true,
  placeholder = "พิมพ์อัปเดต...",
  emptyText = "ยังไม่มีอัปเดต",
  /* ⭐ บอกปลายทางตอนกำลังจะพิมพ์ ไม่ใช่หลังกดส่ง — "จะแจ้งเตือนถึงใคร" เป็นสิ่งที่
     เปลี่ยนว่าคนจะพิมพ์อะไร · ผู้เรียกเป็นคนรู้ว่าใครกำลังถือขั้นนี้อยู่ เธรดกลาง
     ไม่รู้เรื่องสายงานของแต่ละ entity */
  composeHint = null,
  /* ⭐ `splitSystem` — เธรดเหลือเฉพาะ **บทสนทนา** ส่วนเหตุการณ์ระบบไปอยู่กล่อง log
     ที่หน้าเป็นคนวาง (`UpdateLog`) โดยอ่านจาก `onItemsChange` ก้อนเดียวกัน
     ⚠️ **opt-in รายชนิดเอกสาร** — component นี้มีผู้ใช้ 13 หน้า และ "อะไรคือบทสนทนา"
     เป็นเรื่องของแต่ละสาย · เปิดเมื่อทะเบียนของ entity นั้นประกาศธง `narrative`
     ครบแล้วเท่านั้น ไม่งั้นทุกแถวจะตกไปกล่อง log
     ⚠️ **ยิงครั้งเดียว ใช้สองที่** — ไม่ให้กล่อง log ยิง `/api/updates` ซ้ำ เพราะ
     การเปิดเธรดมีผลข้างเคียง (มาร์คแจ้งเตือนว่าอ่านแล้ว) ที่ต้องเกิดครั้งเดียว */
  splitSystem = false,
  onItemsChange,
  onPosted,
}) {
  const [items, setItems] = useState([]);
  const [canPost, setCanPost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);   // ไฟล์ที่เลือกไว้ ยังไม่อัป
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // { id, body }
  const [replyTo, setReplyTo] = useState(null);  // แถวที่กำลังยกคำพูดตอบ
  const [preview, setPreview] = useState(null); // { src, name }
  const [hideSystem, setHideSystem] = useState(false); // ตั้งต้น = เห็นครบ ไม่ซ่อนอะไรเงียบ
  const [kind, setKind] = useState(() => defaultAuthorableKind(entityType));
  const [dueDate, setDueDate] = useState("");
  const fileRef = useRef(null);
  // ── กล่าวถึงคน (@) ────────────────────────────────────────────────────
  // `picked` = คนที่เลือกจากรายการ (id + ชื่อ ณ ตอนพิมพ์) · ตอนส่งจะกรองอีกที
  // ให้เหลือเฉพาะชื่อที่ยัง**อยู่ในข้อความจริง** เผื่อผู้ใช้ลบชื่อออกหลังเลือกไปแล้ว
  const [people, setPeople] = useState(null);      // null = ยังไม่โหลด
  const [picked, setPicked] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null); // null = ไม่ได้กำลังพิมพ์ @
  const textRef = useRef(null);

  // ชนิดที่คนเลือกเองได้ของ entity นี้ — มีตัวเดียว (ส่วนใหญ่) = ไม่ต้องโชว์ dropdown
  const kinds = useMemo(() => authorableKinds(entityType), [entityType]);
  const showKindPicker = kinds.length > 1;
  const showDueDate = kindAcceptsDueDate(entityType, kind);

  /* ⚠️ **ผ่าน ref ไม่ใช่ dep ของ `load`** — ผู้เรียกส่ง arrow function ใหม่ทุกเรนเดอร์
     ถ้าเอาเข้า dependency array ของ `useCallback` จะได้ `load` ตัวใหม่ทุกรอบ แล้ว
     `useEffect(() => load())` จะยิง `/api/updates` ซ้ำไม่รู้จบ */
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;

  const load = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await fetch(
        `/api/updates?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" },
      );
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setItems(d?.items || []);
        setCanPost(!!d?.canPost);
        // ส่งก้อนดิบให้หน้าแม่ไปวาดกล่อง log — ห้ามให้กล่องนั้นยิง API เอง
        onItemsChangeRef.current?.(d?.items || []);
      }
    } catch { /* เธรดพังต้องไม่ทำหน้าพัง — แสดงเป็นว่าง */ }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  // เปิดเธรด = อ่านแจ้งเตือนของ entity นี้ทั้งก้อน (มติ 15 — ตั้งใจไม่ทำ watermark
  // ต่อข้อความแบบ Slack) · ทำที่นี่ที่เดียวจึงครอบทั้ง "กดจากกล่องแจ้งเตือน" และ
  // "เปิดหน้าตรงจาก URL" · พลาดแล้วเงียบได้ — แค่ตัวเลขบนกระดิ่งไม่ลด
  useEffect(() => {
    if (!entityType || !entityId) return;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_thread", entityType, entityId }),
    }).catch(() => {});
  }, [entityType, entityId]);

  // อ่านค่าที่จำไว้ใน effect (ไม่ใช่ตอน initial state) — ไม่งั้น server กับ client
  // render ไม่ตรงกัน
  useEffect(() => {
    if (!entityType) return;
    try { setHideSystem(localStorage.getItem(hideSystemKey(entityType)) === "1"); } catch { /* โหมดส่วนตัว */ }
  }, [entityType]);

  const toggleHideSystem = () => {
    setHideSystem((prev) => {
      const next = !prev;
      try { localStorage.setItem(hideSystemKey(entityType), next ? "1" : "0"); } catch { /* โหมดส่วนตัว */ }
      return next;
    });
  };

  // รวมของในเธรดกับรายการอ่านอย่างเดียวจากแหล่งอื่น แล้วเรียงตามเวลาชุดเดียว
  const timeline = useMemo(() => {
    const own = items.map((row) => ({
      id: row.id, at: row.createdAt, row, kind: "own",
      ...updateKindMeta(entityType, row.kind),
    }));
    const extra = (extraItems || []).map((e) => ({ ...e, kind: "extra" }));
    const all = [...own, ...extra];
    all.sort((a, b) => (order === "desc"
      ? String(b.at || "").localeCompare(String(a.at || ""))
      : String(a.at || "").localeCompare(String(b.at || ""))));
    return all;
  }, [items, extraItems, entityType, order]);

  // หาต้นทางจากชุดที่โหลดมาทั้งหมด **ไม่ใช่ `visible`** — ไม่งั้นตอนกดซ่อนเหตุการณ์
  // ระบบ คำตอบที่ตอบเหตุการณ์ระบบจะกลายเป็นข้อความลอยที่ไม่รู้ว่าตอบอะไร
  const byId = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);

  const systemCount = useMemo(
    () => timeline.filter((item) => isSystemUpdateItem(entityType, item)).length,
    [timeline, entityType],
  );
  // โชว์สวิตช์เฉพาะตอนที่มีทั้งสองอย่างจริง: ไม่มีเหตุการณ์ระบบ = ไม่มีอะไรให้ซ่อน ·
  // มีแต่เหตุการณ์ระบบ (เธรดลีดที่อ่านอย่างเดียว) = กดแล้วเธรดว่างเปล่า
  /* 🐞 สวิตช์นี้ **ไม่โผล่ตรงที่แย่ที่สุด** — ใบที่มีแต่เหตุการณ์ระบบล้วน (นับจริง
     2026-08-17: 16 ใบจาก 32 ของคำร้อง) เข้าเงื่อนไข `systemCount === timeline.length`
     ⇒ ไม่มีอะไรให้กด และไม่มีอะไรบอกว่าการ์ดที่พาดหัวว่า "พูดคุย" ไม่ใช่บทสนทนา
     ⇒ entity ที่เปิด `splitSystem` เลิกใช้สวิตช์ไปเลย (แยกกล่องแทนการซ่อน) */
  const canFilterSystem = !splitSystem && systemCount > 0 && systemCount < timeline.length;

  // ── คำตอบซ้อนใต้ข้อความที่ถูกตอบ (มติผู้ใช้ 2026-08-01) ─────────────────
  //
  // ⭐ **ไม่ต้องมี migration**: `meta.quotedId` ที่ปุ่มยกคำพูดเขียนไว้อยู่แล้ว คือ
  // ข้อมูลชุดเดียวกับที่การซ้อนชั้นต้องใช้ — เปลี่ยนแค่วิธีแสดงผล
  //
  // ⚠️ **ซ้อนชั้นเดียวเท่านั้น** (มติเดิม 2026-07-27 ที่ยังถือ): คำตอบของคำตอบถูก
  // ยกขึ้นมาอยู่ใต้ต้นเรื่องเดียวกัน ไม่ไล่ลึกแบบ Reddit — ลำดับเวลาระดับบนสุด
  // จึงไม่เพี้ยน ซึ่งเป็นเหตุผลที่ตอนแรกไม่เอา nested reply เลย
  //
  // ⚠️ คำตอบเรียง **เก่า→ใหม่** เสมอแม้เธรดหลักจะเรียงใหม่ก่อน เพราะในกลุ่มคำตอบ
  // คนอ่านเป็นบทสนทนา ไม่ใช่ไล่ดูของใหม่
  const { roots, repliesOf } = useMemo(
    () => groupThreadItems(timeline, { byId, order }),
    [timeline, byId, order],
  );

  // กรองเหตุการณ์ระบบทีหลังเสมอ — และถ้าต้นเรื่องถูกซ่อนแต่คำตอบยังอยู่
  // ให้คำตอบเลื่อนขึ้นมาเป็นระดับบนสุด ไม่ใช่หายตามแม่ไปด้วย
  const visibleGroups = useMemo(() => {
    /* ⭐ `splitSystem` = เหลือเฉพาะแถวที่ **มีคนพิมพ์อะไรลงไป** (ดู `isNarrativeUpdateItem`)
       ที่เหลือไปอยู่กล่อง log ที่หน้าเป็นคนวาง (`UpdateLog`) — **ย้าย ไม่ก๊อป**
       ⚠️ กรองตอนวาดเท่านั้น ทุกแถวยังลง `entity_updates` เหมือนเดิม ไม่งั้นแจ้งเตือน
       รายคนซึ่งเกาะอยู่กับแถวเธรดจะตายไปด้วย */
    const pass = (item) => (splitSystem
      ? isNarrativeUpdateItem(entityType, item)
      : !(hideSystem && canFilterSystem) || !isSystemUpdateItem(entityType, item));
    const out = [];
    for (const root of roots) {
      const replies = (repliesOf.get(root.id) || []).filter(pass);
      if (pass(root)) out.push({ root, replies });
      else if (replies.length) out.push({ root: null, replies });
    }
    return out;
  }, [roots, repliesOf, hideSystem, canFilterSystem, splitSystem, entityType]);
  const visibleCount = visibleGroups.reduce((n, g) => n + (g.root ? 1 : 0) + g.replies.length, 0);

  // รายชื่อที่ @ ได้ — โหลดครั้งแรกที่ผู้ใช้พิมพ์ @ เท่านั้น (server ต้องวนเช็ค
  // สิทธิ์ทีละคน จึงไม่ควรยิงตอนเปิดหน้าทุกครั้งทั้งที่ส่วนใหญ่ไม่ได้ใช้)
  const loadPeople = useCallback(async () => {
    if (people) return people;
    try {
      const res = await fetch(
        `/api/updates/mentionable?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" },
      );
      const d = await res.json().catch(() => null);
      const list = res.ok ? (d?.users || []) : [];
      setPeople(list);
      return list;
    } catch { setPeople([]); return []; }
  }, [people, entityType, entityId]);

  // หา "@คำที่กำลังพิมพ์" ตรงตำแหน่งเคอร์เซอร์ — ต้องอยู่ต้นข้อความหรือหลังช่องว่าง
  // เท่านั้น ไม่งั้นอีเมลในข้อความ (a@b.com) จะเปิดรายการทุกครั้ง
  const readMentionQuery = (value, caret) => {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(upto[at - 1])) return null;
    const q = upto.slice(at + 1);
    if (/[\n]/.test(q)) return null;
    return { at, q };
  };

  const onComposerChange = (value, caret) => {
    setText(value);
    const found = readMentionQuery(value, caret);
    setMentionQuery(found);
    if (found) loadPeople();
  };

  const insertMention = (person) => {
    const node = textRef.current;
    const caret = node?.selectionStart ?? text.length;
    const found = readMentionQuery(text, caret);
    if (!found) return;
    const next = `${text.slice(0, found.at)}@${person.name} ${text.slice(caret)}`;
    setText(next);
    setPicked((list) => (list.some((p) => p.id === person.id) ? list : [...list, person]));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      node?.focus();
      const pos = found.at + person.name.length + 2;
      node?.setSelectionRange(pos, pos);
    });
  };

  // เสนอเฉพาะคนที่ชื่อตรงกับที่พิมพ์ · จำกัด 8 คนให้รายการไม่ยาวจนบังข้อความ
  const mentionMatches = useMemo(() => {
    if (!mentionQuery || !people) return [];
    const q = mentionQuery.q.trim().toLowerCase();
    return people
      .filter((p) => !q || String(p.name || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, people]);

  const pickFiles = (list) => {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length) return;
    const room = MAX_UPDATE_ATTACHMENTS - pending.length;
    const next = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      if (f.size > MAX_UPLOAD_BYTES) { setErr(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (next.length) setPending((p) => [...p, ...next]);
  };

  /* 🐞 เดิมผูก onPaste ไว้ที่ `<textarea>` ตัวเดียว ⇒ แปะรูปได้เฉพาะตอนเคอร์เซอร์
     อยู่ในช่องพิมพ์ · จับภาพหน้าจอมาแล้วกด Ctrl+V ทันทีไม่ติด และลากไฟล์มาวางก็ไม่ได้
     ⇒ ใช้ทางเข้าไฟล์กลางคร่อมทั้งกล่องพิมพ์ (IS-26080013 · 2026-08-12) */
  const intake = useFileIntake({
    disabled: !allowAttachments || busy,
    onFiles: pickFiles,
    onOversize: setErr,
    // ⚠️ ถอยให้แผงเอกสารแนบเมื่อทั้งสองอยู่บนหน้าเดียวกัน — Ctrl+V ลอย ๆ บนหน้า
    // รายละเอียดหมายถึง "แนบเข้าเอกสาร" · จะแปะลงแชทก็ต่อเมื่อเคอร์เซอร์อยู่ในช่องพิมพ์
    // ซึ่งกติกาข้อแรกของ useFileIntake รับไปก่อนแล้ว
    weight: 1,
  });

  const post = async () => {
    if (!text.trim() && !pending.length) return;
    setBusy(true); setErr("");
    try {
      // อัปไฟล์ก่อน แล้วค่อยส่ง ref ไปกับข้อความ (แพตเทิร์นเดียวกับเธรดสอบถาม)
      // ⭐ ตัวส่งอยู่ที่ `lib/master/updatePost` — โมดัลรับลีดใหม่ใช้ตัวเดียวกัน
      await postUpdateWithFiles({
        entityType, entityId, body: text, files: pending.map((p) => p.file), kind,
        dueDate: showDueDate ? dueDate : "",
        quotedId: replyTo?.id || "",
        // ⚠️ ส่งเฉพาะคนที่ชื่อ **ยังอยู่ในข้อความจริง** — เลือกไปแล้วลบชื่อออก
        // ต้องไม่ถูกแจ้งเตือน (server กรองสิทธิ์ให้อีกชั้นอยู่แล้ว)
        mentions: picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id),
      });
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setText(""); setPending([]); setDueDate(""); setReplyTo(null); setPicked([]);
      await load();
      onPosted?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const mutate = async (id, init, okThen) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/updates/${id}`, {
        headers: { "Content-Type": "application/json" }, ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      okThen?.();
      await load();
      onPosted?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // ── วาดหนึ่งรายการ ───────────────────────────────────────────────────
  // ใช้ทั้งระดับบนสุดและคำตอบที่ซ้อนเข้ามา — ต่างกันแค่กรอบนอก (ดู .replies)
  const renderItem = (item, isReply) => {
    const key = `${item.kind}-${item.id}`;
    // ⭐ สีทำงานสองชั้น แยกหน้าที่กัน (มติผู้ใช้ 2026-08-02):
    //   · แถบซ้ายของ **ข้อความคน** = accent เสมอ → ทั้งเธรดอ่านเป็นชุดเดียว
    //     ไม่เปลี่ยนสีไปมาตามว่าเป็นบันทึก/โทร/ประชุม
    //   · แถบซ้ายของ **เหตุการณ์ระบบ** = สีชนิด → ยื่น/ตีกลับ/อนุมัติ ต่างกันชัด
    //   · **ป้ายชนิด** ในคอลัมน์ซ้าย = สีชนิดเสมอ (ดู updateTypes)
    // ของเดิมให้สีชนิดคุมทั้งแถบและป้าย ทำให้ "บันทึก" กับ "ขั้นถัดไป" ซึ่งสีใกล้กัน
    // แยกด้วยตาไม่ออก
    const systemItem = isSystemUpdateItem(entityType, item);
    const tint = {
      "--kind-color": (systemItem ? item.color : "var(--accent)") || "var(--border)",
      "--kind-label-color": item.color || "var(--text-3)",
    };
    const replyButton = canPost && canQuoteItem(item) ? (
      <Button
        iconOnly icon={<Reply size={13} />} aria-label="ตอบกลับข้อความนี้"
        title="ตอบกลับ" disabled={busy}
        onClick={() => setReplyTo(item.row)}
      />
    ) : null;

    // ── เหตุการณ์ระบบ ──────────────────────────────────────────────────
    // คอลัมน์ซ้าย = ชนิด + เวลา · ขวา = สิ่งที่เกิดขึ้น (ตัวอักษรจางกว่าข้อความคน)
    if (systemItem) {
      const body = item.kind === "extra" ? item.body : item.row.body;
      const who = item.kind === "extra" ? item.by : item.row.authorName;
      return (
        <div className={`${styles.row} ${styles.systemRow}`} key={key} style={tint}>
          <div className={styles.meta}>
            <span className={styles.metaName}>{item.label}</span>
            <span className={styles.metaSub} title={item.at ? fmtDateTime(item.at) : undefined}>
              {item.at ? fmtDayTime(item.at) : ""}
            </span>
          </div>
          <div className={styles.content}>
            <div className={styles.systemText}>
              {body ? <RichText text={body} lines={2} className={styles.systemBody} /> : null}
              {/* รายการจากแหล่งอื่นที่มีหน้าของตัวเอง ต้องกดเข้าไปได้ ไม่งั้น
                  ไทม์ไลน์บอกว่าเกิดอะไรแต่ไปต่อไม่ได้ */}
              {item.kind === "extra" && item.href && (
                <Link href={item.href} className="rich-link">{item.linkLabel || "เปิดดู"}</Link>
              )}
              {who && <span className={styles.systemWho}>{who}</span>}
              {replyButton && <span className={styles.rowActions}>{replyButton}</span>}
            </div>
          </div>
        </div>
      );
    }

    // ── ข้อความคน ──────────────────────────────────────────────────────
    // ⭐ ชื่อคนอยู่คอลัมน์ซ้ายชิดขวา (แบบ G): กวาดตาหาว่า "ใครพูด" ได้เร็วเพราะชื่อ
    // เรียงตรงกันเป็นแนวเดียว และเนื้อความได้พื้นที่เต็มโดยไม่มีกรอบมาเบียด
    const row = item.row;
    const isEditing = editing?.id === row.id;
    const orphanReply = quotedIdOf(row) && !byId.has(quotedIdOf(row));
    return (
      <article className={styles.row} key={key} style={tint}>
        <div className={styles.meta}>
          <span className={styles.metaName}>{row.authorName || "ระบบ"}</span>
          <span className={styles.metaSub} title={item.at ? fmtDateTime(item.at) : undefined}>
            {/* ฝ่ายของคนพูด — เธรดสองฝ่าย (เซลถาม ↔ RD/PC/ผู้บริหารตอบ) อ่านไม่รู้เรื่อง
                ถ้าไม่รู้ว่าใครพูดในฐานะอะไร · ใช้ชื่อจากทะเบียนฝ่าย ไม่ใช่รหัสดิบ
                · วันที่ตัดปีออกให้พอดีคอลัมน์ (ปียังอยู่ใน title ตอน hover) */}
            {row.authorDept ? `${DEPARTMENT_LABELS[row.authorDept] || row.authorDept} · ` : ""}
            {item.at ? fmtDayTime(item.at) : ""}
          </span>
          {/* ⭐ ป้ายชนิดอยู่ **คอลัมน์ซ้าย** ไม่ใช่ในเนื้อความ (มติผู้ใช้ 2026-08-02) —
              แนวเดียวกับที่เหตุการณ์ระบบแสดง "สถานะ/ผูกดีล" อยู่แล้ว ทั้งสองแบบจึง
              อ่านเป็นคอลัมน์เดียวกัน: ซ้าย = นี่คืออะไร/ใครพูด · ขวา = เนื้อหา
              · โผล่เฉพาะเธรดที่เลือกชนิดได้จริง (ฟีดดีล/ลีด) */}
          {showKindPicker && <span className={styles.kindBadge}>{item.label}</span>}
        </div>
        <div className={styles.content}>
          {row.deletedAt ? (
            <p className={styles.deleted}>{DELETED_UPDATE_TEXT}</p>
          ) : (
            <>
              {isEditing ? (
                <>
                  {(showKindPicker || kindAcceptsDueDate(entityType, editing.kind)) && (
                    <div className={styles.kindRow}>
                      {showKindPicker && (
                        <Select
                          className={`premium-select ${styles.kindSelect}`} disabled={busy}
                          value={editing.kind} aria-label="ชนิดอัปเดต"
                          onChange={(e) => setEditing((s) => ({ ...s, kind: e.target.value }))}
                        >
                          {kinds.map((k) => (
                            <option key={k} value={k}>{updateKindMeta(entityType, k).label}</option>
                          ))}
                        </Select>
                      )}
                      {kindAcceptsDueDate(entityType, editing.kind) && (
                        <DateInput
                          value={editing.dueDate} disabled={busy} ariaLabel="กำหนดวัน"
                          className={styles.dueInput}
                          onChange={(v) => setEditing((s) => ({ ...s, dueDate: v }))}
                        />
                      )}
                    </div>
                  )}
                  <Textarea rows={2} value={editing.body} disabled={busy}
                    aria-label="แก้ข้อความ"
                    onChange={(e) => setEditing((s) => ({ ...s, body: e.target.value }))}
                  />
                  <div className={styles.composerBar}>
                    <Button
                      variant="quiet" size="sm" disabled={busy} icon={<X size={13} />}
                      onClick={() => setEditing(null)}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      tone="primary" size="sm" disabled={busy || !editing.body.trim()}
                      onClick={() => mutate(row.id, {
                        method: "PATCH",
                        body: JSON.stringify({
                          action: "edit", body: editing.body.trim(),
                          kind: editing.kind, dueDate: editing.dueDate || "",
                        }),
                      }, () => setEditing(null))}
                    >
                      บันทึก
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* ปกติคำตอบจะซ้อนใต้ข้อความที่ถูกตอบอยู่แล้ว จึงไม่ต้องยกเนื้อมาซ้ำ —
                      ยกเว้นตอนที่ **หาต้นทางไม่เจอ** (ถูกลบ/อยู่นอกชุดที่โหลดมา)
                      ซึ่งต้องบอกว่าตอบอะไรอยู่ ไม่ใช่ปล่อยเป็นข้อความลอย */}
                  {orphanReply && <QuoteBlock quoted={null} />}
                  {row.body && (
                    <RichText
                      className={styles.body} text={row.body} lines={6}
                      // ชื่อ ณ ตอนพิมพ์ (เก็บคู่กับ id ตอนโพสต์) — ใช้จับคู่กับข้อความ
                      // ที่บันทึกไว้ ไม่ใช่ชื่อปัจจุบันซึ่งอาจเปลี่ยนไปแล้ว
                      mentionNames={row.meta?.mentionNames || []}
                    />
                  )}
                </>
              )}
              <ThreadAttachments row={row} onOpen={setPreview} />
            </>
          )}

          {/* สถานะ + ปุ่ม อยู่ **ท้ายข้อความ** ไม่ใช่หัวแถว — หัวแถวเป็นที่ของ
              เนื้อความล้วน ๆ และปุ่มอยู่ตรงที่สายตาหยุดพอดีหลังอ่านจบ */}
          <div className={styles.head}>
            {row.meta?.dueDate && <span className={styles.due}>กำหนด {row.meta.dueDate}</span>}
            {row.editedAt && <span>แก้ไขแล้ว</span>}
            {row.acknowledgedAt && (
              <span className={styles.ack}><Check size={11} aria-hidden="true" /> รับทราบแล้ว</span>
            )}
            <span className={styles.rowActions}>
              {replyButton}
              {/* รับทราบ = "เห็นแล้ว" ไม่ใช่การแก้เนื้อหา — ใครที่โพสต์ในเธรดได้ก็กดได้
                  (กติกาเดียวกับ API) · คอลัมน์มีมาตั้งแต่ mig 0163 แต่ไม่เคยมีปุ่ม
                  ให้กด ป้าย "รับทราบแล้ว" จึงไม่มีทางขึ้นเลย */}
              {canPost && !row.deletedAt && !row.acknowledgedAt && (
                <Button
                  iconOnly icon={<Check size={13} />} aria-label="รับทราบข้อความนี้"
                  title="รับทราบ" disabled={busy}
                  onClick={() => mutate(row.id, {
                    method: "PATCH", body: JSON.stringify({ action: "acknowledge" }),
                  })}
                />
              )}
              {canPost && !row.deletedAt && kinds.includes(row.kind) && (
                <>
                  <Button
                    iconOnly icon={<Pencil size={13} />} aria-label="แก้ข้อความ" disabled={busy}
                    onClick={() => setEditing({
                      id: row.id,
                      body: row.body || "",
                      kind: row.kind,
                      dueDate: row.meta?.dueDate || "",
                    })}
                  />
                  <Button
                    iconOnly icon={<Trash2 size={13} />} className={styles.danger}
                    aria-label="ลบข้อความ" disabled={busy}
                    onClick={() => mutate(row.id, { method: "DELETE" })}
                  />
                </>
              )}
            </span>
          </div>
        </div>
      </article>
    );
  };

  if (loading) return <div className={styles.empty}>กำลังโหลด...</div>;

  return (
    <>
      {pinned}

      {canFilterSystem && (
        <div className={styles.toolbar}>
          <Button
            variant="quiet" size="sm" onClick={toggleHideSystem} aria-pressed={hideSystem}
            icon={hideSystem ? <Eye size={13} /> : <EyeOff size={13} />}
          >
            {hideSystem ? `แสดงเหตุการณ์ระบบ (${systemCount})` : `ซ่อนเหตุการณ์ระบบ (${systemCount})`}
          </Button>
        </div>
      )}

      {visibleCount ? (
        <div className={styles.timeline}>
          {visibleGroups.map((group) => (
            <div className={styles.group} key={`g-${group.root?.id || group.replies[0]?.id}`}>
              {group.root && renderItem(group.root, false)}
              {/* คำตอบซ้อนเข้ามาหนึ่งขั้น มีเส้นเชื่อมทางซ้าย — **ชั้นเดียวเท่านั้น**
                  คำตอบของคำตอบถูกยกขึ้นมาอยู่กลุ่มเดียวกันแล้วตั้งแต่ตอนจัดกลุ่ม */}
              {group.replies.length > 0 && (
                <div className={styles.replies}>
                  {group.replies.map((reply) => renderItem(reply, true))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>{emptyText}</div>
      )}

      {canPost && (
        <div className={styles.composer} {...intake.zoneProps}>
          {/* กำลังตอบข้อความไหน — ต้องเห็นก่อนกดส่ง ไม่ใช่รู้ทีหลังว่ายกผิดอัน */}
          {replyTo && (
            <div className={styles.replyBar}>
              <QuoteBlock quoted={replyTo} />
              <Button
                iconOnly icon={<X size={13} />} aria-label="ยกเลิกการยกคำพูด"
                disabled={busy} onClick={() => setReplyTo(null)}
              />
            </div>
          )}
          {/* ชนิดของอัปเดต — โผล่เฉพาะ entity ที่มีให้เลือกจริง (ฟีดดีล) เธรดที่มี
              ชนิดเดียวไม่ต้องมี dropdown ที่เลือกอะไรไม่ได้ */}
          {(showKindPicker || showDueDate) && (
            <div className={styles.kindRow}>
              {showKindPicker && (
                <Select
                  className={`premium-select ${styles.kindSelect}`} value={kind} disabled={busy}
                  aria-label="ชนิดอัปเดต" onChange={(e) => setKind(e.target.value)}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>{updateKindMeta(entityType, k).label}</option>
                  ))}
                </Select>
              )}
              {showDueDate && (
                <DateInput
                  value={dueDate} onChange={setDueDate} disabled={busy}
                  ariaLabel="กำหนดวัน" className={styles.dueInput}
                />
              )}
            </div>
          )}
          <div className={styles.composerField}>
            <Textarea ref={textRef} rows={2} value={text} disabled={busy}
              placeholder={placeholder} aria-label="ข้อความอัปเดต"
              onChange={(e) => onComposerChange(e.target.value, e.target.selectionStart)}
              onKeyDown={(e) => { if (e.key === "Escape" && mentionQuery) setMentionQuery(null); }}
            />
            {/* รายชื่อที่ @ ได้ — กรองด้วยสิทธิ์ของเธรดนี้มาจาก server แล้ว
                (ดู /api/updates/mentionable) จึงไม่มีชื่อคนที่เปิดเธรดไม่ได้ */}
            {mentionQuery && mentionMatches.length > 0 && (
              <ul className={styles.mentionList}>
                {mentionMatches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button" className={styles.mentionItem}
                      onClick={() => insertMention(p)}
                    >
                      <span>{p.name}</span>
                      {p.department && <span className={styles.dept}>{p.department}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!!pending.length && (
            <div className={styles.pending}>
              {pending.map((p, i) => (
                <div className={styles.pendingItem} key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.file.name} />
                  <button
                    type="button" className={styles.pendingRemove} aria-label="เอาไฟล์ออก"
                    onClick={() => setPending((list) => list.filter((_, n) => n !== i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <div className={styles.error} role="alert">{err}</div>}
          {composeHint && <div className={styles.composeHint}>{composeHint}</div>}
          <div className={styles.composerBar}>
            {allowAttachments && (
              <>
                <Button
                  variant="quiet" size="sm" disabled={busy} icon={<Paperclip size={13} />}
                  onClick={() => fileRef.current?.click()} title="แนบไฟล์"
                >
                  แนบไฟล์
                </Button>
                <input
                  ref={fileRef} type="file" accept={UPLOAD_ACCEPT_ATTR} multiple hidden
                  onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
                />
              </>
            )}
            <Button
              tone="primary" size="sm" icon={<Send size={13} />}
              disabled={busy || (!text.trim() && !pending.length)} onClick={post}
            >
              {busy ? "กำลังส่ง..." : "ส่งอัปเดต"}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!preview} onClose={() => setPreview(null)}
        title={preview?.name || "รูปแนบ"} size="lg" closeOnOverlay
      >
        {preview && (
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.src} alt={preview.name || "รูปแนบ"}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)" }}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

// กล่องข้อความที่ยกมา — ใช้ทั้งบนคำตอบและในช่องพิมพ์ (ที่เดียวกัน หน้าตาต้องตรงกัน
// ไม่งั้นคนพิมพ์เห็นอย่างหนึ่ง คนอ่านเห็นอีกอย่าง)
function QuoteBlock({ quoted }) {
  const view = quoteView(quoted, { deletedText: DELETED_UPDATE_TEXT });
  return (
    <div className={`${styles.quote} ${view.state === "ok" ? "" : styles.quoteGone}`.trim()}>
      {view.author && <strong>{view.author}</strong>}
      <span>{view.text}</span>
    </div>
  );
}

// รูป = ตารางภาพย่อ · ไฟล์อื่น = ลิงก์ (ภาพย่อของ PDF ไม่บอกอะไร) — กติกาเดียวกับ
// AttachmentsPanel เพื่อให้ไฟล์แนบทั้งระบบหน้าตาเหมือนกัน
function ThreadAttachments({ row, onOpen }) {
  const list = Array.isArray(row.attachments) ? row.attachments : [];
  if (!list.length) return null;
  const photos = list.map((a, i) => ({ a, i })).filter(({ a }) => isPreviewableImage(a));
  const files = list.map((a, i) => ({ a, i })).filter(({ a }) => !isPreviewableImage(a));
  return (
    <>
      {photos.length > 0 && (
        <div className={styles.photos}>
          {photos.map(({ a, i }) => (
            <button
              key={i} type="button" className={styles.photoBtn} title={a.fileName || "ดูรูป"}
              onClick={() => onOpen({ src: fileHref(row, i), name: a.fileName })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileHref(row, i)} alt={a.fileName || "รูปแนบ"} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={styles.files}>
          {files.map(({ a, i }) => (
            <a key={i} className={styles.fileLink} href={fileHref(row, i)} target="_blank" rel="noreferrer">
              <Paperclip size={13} /> <span className="truncate">{a.fileName || "ไฟล์แนบ"}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
