import { useState, useMemo, useEffect } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";

/* ============================================================
   SIDEKICK v0.4 demo — アイドル運営と制作の、相棒AI
   v0.3 → v0.4【データモデル転換: テキスト → アイテム配列】
   - セットリスト = ビルダー化
     曲マスタからタップ追加 → 番手付きリスト → 並び替え
     （デスクトップ: ドラッグ&ドロップ / モバイル: ↑↓ボタン）
   - キッカケ・退場処理・total をリアルタイム再計算（解析ボタン廃止）
   - テキスト貼り付けは「インポート」機能に降格（従来運用も維持)
   - モバイルファースト: 入力16px、total/フェーダーは下部固定バー
   ※永続化(localStorage)はレクス実装担当:
     対象 = items / catalog / settings / (旧rawは廃止)
   ※本実装ではドラッグを dnd-kit に置き換え推奨
     （タッチドラッグ対応。デモは HTML5 DnD + ↑↓ボタンで骨格提示）
   ============================================================ */

/* ---------- テーマ ---------- */
const THEMES = {
  dark: {
    "--bg": "#0E1015", "--surface": "#14171F", "--surface2": "#191D27",
    "--border": "#232734", "--border-soft": "#1C202B",
    "--ink": "#E7E9EF", "--dim": "#9BA1B2", "--faint": "#5B6172",
    "--accent": "#FFB454", "--accent-ink": "#0E1015",
    "--go": "#3DD68C", "--alert": "#F0635C", "--purple": "#A78BFA", "--pink": "#F492C8",
    "--radius": "8px", "--radius-lg": "10px",
    "--row-pad": "9px 12px", "--card-pad": "16px",
    "--shadow": "none", "--tc-size": "26px", "--fader-h": "5px",
  },
  light: {
    "--bg": "#F6F7F9", "--surface": "#FFFFFF", "--surface2": "#FAFBFC",
    "--border": "#E4E7ED", "--border-soft": "#EDEFF3",
    "--ink": "#1B1F2A", "--dim": "#5F6675", "--faint": "#9AA1AF",
    "--accent": "#E8940A", "--accent-ink": "#FFFFFF",
    "--go": "#189A5C", "--alert": "#D9403A", "--purple": "#7C5CE0", "--pink": "#D6559A",
    "--radius": "12px", "--radius-lg": "14px",
    "--row-pad": "12px 14px", "--card-pad": "20px",
    "--shadow": "0 1px 3px rgba(16,20,30,.05), 0 4px 16px rgba(16,20,30,.04)",
    "--tc-size": "28px", "--fader-h": "8px",
  },
};

/* ---------- KOURiNプリセット ---------- */
const KOURIN_PRESET = [
  { name: "SE", sec: 57, aliases: [] },
  { name: "Shine", sec: 187, aliases: [] },
  { name: "覚醒Destiny", sec: 201, aliases: [] },
  { name: "OVERDRIVE", sec: 230, aliases: [] },
  { name: "Kiss me", sec: 194, aliases: [] },
  { name: "New World", sec: 223, aliases: ["New Word"] },
  { name: "TOO YOUNG TOOOO DIE!", sec: 291, aliases: ["TOOOO YOUNG TOOOO DIE!"] },
  { name: "Glory Rain", sec: 200, aliases: [] },
  { name: "KOURiN ROCK 'n' ROLL", sec: 226, aliases: ["KOURiN ROCK'n'ROLL"] },
  { name: "restart", sec: 217, aliases: [] },
  { name: "ユメクイ", sec: 224, aliases: [] },
  { name: "IMAGINATION", sec: 212, aliases: [] },
  { name: "FANFARE", sec: 236, aliases: [] },
  { name: "FANFARE long", sec: 257, aliases: ["FANFARE long ver"] },
  { name: "Manifesto", sec: 234, aliases: [] },
  { name: "manifest 1:00", sec: 60, aliases: ["Manifesto 1:00ver", "Manifesto short"] },
  { name: "SHOWTIME", sec: 209, aliases: ["SHOW TiME", "SHOWTiME"] },
  { name: "Never ever", sec: 209, aliases: ["Never Ever"] },
  { name: "未来は呼んでいる", sec: 236, aliases: [] },
];

const HISTORY = [
  { date: "6/30", event: "ドルモン 3rd ANNIV.", venue: "SHIBUYA THE GAME",
    songs: ["SE","Shine","Glory Rain","KOURiN ROCK 'n' ROLL","SHOWTIME","Never ever","New World","restart","ユメクイ","覚醒Destiny","IMAGINATION","FANFARE long","Manifesto"] },
  { date: "6/28", event: "アイドル甲子園 DAY2", venue: "TFTホール500",
    songs: ["SE","restart","New World","ユメクイ","IMAGINATION","覚醒Destiny","FANFARE long"] },
  { date: "6/27", event: "アイドル甲子園 DAY1", venue: "TFTホール500",
    songs: ["SE","Glory Rain","覚醒Destiny","IMAGINATION","New World","Shine"] },
  { date: "6/22", event: "ニキプレ 六式。-改", venue: "渋谷音楽堂",
    songs: ["SE","IMAGINATION","覚醒Destiny","SHOWTIME","New World","Glory Rain","FANFARE","Shine","ユメクイ"] },
  { date: "6/15", event: "@JAM", venue: "近未来会館",
    songs: ["SE","IMAGINATION","New World","ユメクイ","Shine","覚醒Destiny","FANFARE"] },
];

const SAMPLE = `SE 0:57
Shine 3:07
覚醒Destiny 3:21
OVERDRIVE 3:50
Kiss me 3:14
New World 3:43
TOO YOUNG TOOOO DIE! 4:51
MC 2:00
Glory Rain 3:20
KOURiN ROCK'n'ROLL 3:46
restart 3:37
ユメクイ 3:45
IMAGINATION 3:32
FANFARE 3:56
未来は呼んでいる 3:56
MC（くじ引き） 2:00
くじ曲 4:00
Manifesto 3:54
MC 1:00`;

const SAMPLE_TT = `KOURiN 25
アキストゼネコ 25
SEKAIE☆ 20
Chuu♡Cute 20
クマリデパート 30`;

/* ---------- 永続化(localStorage) ----------
   items / catalog / settings の3値のみ対象。初回訪問(保存値なし)は
   呼び出し側のfallback(KOURiNプリセット等)を使う。
   v0.3までの raw(セトリ入力途中テキスト)キーはv0.4のitems配列化で
   廃止したため、起動時に一度だけ掃除する。 */
const LS_PREFIX = "sidekick.";
function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveLS(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* private mode / quota超過などは無視して継続 */
  }
}

/* ---------- utils ---------- */
const norm = (s) => s.toLowerCase().replace(/[\s'’!！・．.（）()]/g, "").replace(/ー/g, "");
const fmt = (sec) => {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? "-" : ""}${m}:${String(s).padStart(2, "0")}`;
};
const parseLen = (str) => {
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
};
let _uid = 0;
const uid = () => `i${Date.now().toString(36)}${(_uid++).toString(36)}`;

function findCatalog(title, catalog) {
  const n = norm(title);
  let hit = catalog.find((c) => norm(c.name) === n || (c.aliases || []).some((a) => norm(a) === n));
  if (hit) return { hit, exact: norm(hit.name) === n };
  hit = catalog.find((c) => n.length >= 3 && (norm(c.name).includes(n) || n.includes(norm(c.name))));
  if (hit) return { hit, exact: false };
  return { hit: null, exact: false };
}
function findHistory(title) {
  const n = norm(title);
  for (const show of HISTORY) if (show.songs.some((s) => norm(s) === n)) return show;
  return null;
}

/* テキスト → アイテム配列（インポート用） */
function textToItems(text, catalog) {
  const items = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (/^total/i.test(line) || /^合計/.test(line)) continue;
    const m = line.match(/^(?:\d+[.．]\s*)?(.+?)\s*(\d{1,2}):(\d{2})\s*$/);
    let title, sec = null;
    if (m) { title = m[1].trim(); sec = parseInt(m[2]) * 60 + parseInt(m[3]); }
    else { title = line.replace(/^\d+[.．]\s*/, "").trim(); }
    const isMC = /^MC/.test(title);
    const isSE = /^SE\b/i.test(title) || norm(title) === "se";
    let catalogNote = null, unknown = false;
    if (!isMC) {
      const { hit, exact } = findCatalog(title, catalog);
      if (hit && sec === null) sec = hit.sec;
      if (hit && !exact) catalogNote = hit.name;
      if (!hit && !isSE) unknown = true;
    }
    if (sec === null) sec = 0;
    items.push({ id: uid(), title, sec, isMC, isSE, catalogNote, unknown });
  }
  return items;
}

function buildTimetable(text, startTime, changeover) {
  const acts = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(.+?)\s+(\d{1,3})\s*(?:min|分)?$/);
    if (m) acts.push({ name: m[1].trim(), min: parseInt(m[2]) });
  }
  const [sh, sm] = startTime.split(":").map(Number);
  let t = sh * 60 + sm;
  const slots = [];
  acts.forEach((a, i) => {
    slots.push({ from: t, to: t + a.min, name: a.name, min: a.min, type: "act", no: i + 1 });
    t += a.min;
    if (i < acts.length - 1) { slots.push({ from: t, to: t + changeover, name: "転換", min: changeover, type: "change" }); t += changeover; }
  });
  return slots;
}
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const CUE_VAR = { "音先": "--accent", "連続": "--dim", "曲振": "--go", "inst BGM": "--purple" };
const MEMBER_COLORS = ["#A78BFA", "#FDE047", "#4ADE80", "#F1F5F9", "#FB923C", "#F9A8D4"];

/* ---------- 共通スタイル ---------- */
const inputStyle = {
  background: "var(--surface2)", color: "var(--ink)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", padding: "8px 10px",
  fontFamily: "'JetBrains Mono', monospace",
};
const cardStyle = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)",
};
const btnStyle = (enabled = true) => ({
  padding: "9px 18px", borderRadius: "var(--radius)", border: "none",
  background: enabled ? "var(--accent)" : "var(--border)",
  color: enabled ? "var(--accent-ink)" : "var(--faint)",
  fontWeight: 700, fontSize: 13, cursor: enabled ? "pointer" : "not-allowed",
  fontFamily: "'Noto Sans JP'",
});
const ghostBtn = {
  padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "transparent", color: "var(--dim)", fontSize: 12, cursor: "pointer",
};
const iconBtn = (disabled = false) => ({
  width: 30, height: 30, borderRadius: 7, border: "1px solid var(--border)",
  background: "transparent", color: disabled ? "var(--border)" : "var(--dim)",
  fontSize: 13, cursor: disabled ? "default" : "pointer", flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
});

function Badge({ cue }) {
  const v = CUE_VAR[cue];
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0,
      background: `color-mix(in srgb, var(${v}) 12%, transparent)`,
      color: `var(${v})`,
      border: `1px solid color-mix(in srgb, var(${v}) 32%, transparent)`,
    }}>{cue}</span>
  );
}

function Toggle({ on, onChange, label, desc }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
      background: "transparent", border: "none", cursor: "pointer", padding: "14px 0",
      borderBottom: "1px solid var(--border-soft)",
    }}>
      <span style={{
        width: 40, height: 22, borderRadius: 99, flexShrink: 0, position: "relative",
        background: on ? "var(--accent)" : "var(--border)", transition: "background .2s",
      }}>
        <span style={{
          position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16,
          borderRadius: 99, background: "var(--surface)", transition: "left .2s",
        }} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}

/* セットリストの1行。ドラッグ(dnd-kit, タッチ対応)と ↑↓ボタン(モバイル用)の両方で並び替え可能 */
function SortableRow({ r, i, total, settings, editingId, editLen, setEditLen, startEdit, commitEdit, setEditingId, move, removeItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  return (
    <div ref={setNodeRef} className="sk-row" style={{
      display: "flex", alignItems: "center", gap: 8, padding: "var(--row-pad)",
      borderBottom: i < total - 1 ? "1px solid var(--border-soft)" : "none",
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      transition,
      opacity: isDragging ? 0.5 : 1,
      position: "relative",
      zIndex: isDragging ? 10 : "auto",
      background: isDragging ? "var(--surface2)" : undefined,
    }}>
      <span {...attributes} {...listeners} className="drag-handle" title="ドラッグで並び替え"
        style={{ color: "var(--faint)", fontSize: 14, flexShrink: 0, userSelect: "none" }}>⠿</span>
      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "var(--faint)", width: 20, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: r.isMC ? 500 : 600, fontSize: 13.5, color: r.isMC ? "var(--dim)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.title}
          {r.exit && <span style={{ marginLeft: 8, fontSize: 10.5, color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{r.exit}</span>}
        </div>
        {r.catalogNote && <div style={{ fontSize: 10.5, color: "var(--accent)", marginTop: 2 }}>⚠ 曲マスタ表記: {r.catalogNote}</div>}
        {r.unknown && <div style={{ fontSize: 10.5, color: "var(--alert)", marginTop: 2 }}>？ 曲マスタ未登録</div>}
        {r.recent && <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}><span style={{ color: "var(--pink)" }}>●</span> {r.recent.date} {r.recent.event}で使用</div>}
      </div>
      {settings.showCue && <Badge cue={r.cue} />}
      {editingId === r.id ? (
        <input autoFocus value={editLen} onChange={(e) => setEditLen(e.target.value)}
          onBlur={() => commitEdit(r.id)}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(r.id); if (e.key === "Escape") setEditingId(null); }}
          style={{ ...inputStyle, width: 58, padding: "4px 6px", textAlign: "right" }} />
      ) : (
        <button onClick={() => startEdit(r)} title="尺を編集"
          style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "var(--dim)", width: 46, textAlign: "right", flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
          {fmt(r.sec)}
        </button>
      )}
      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={() => move(i, -1)} disabled={i === 0} style={iconBtn(i === 0)}>↑</button>
        <button onClick={() => move(i, +1)} disabled={i === total - 1} style={iconBtn(i === total - 1)}>↓</button>
        <button onClick={() => removeItem(r.id)} style={{ ...iconBtn(), color: "var(--faint)" }}>✕</button>
      </span>
    </div>
  );
}

/* ============================================================ */
export default function Sidekick() {
  const [mode, setMode] = useState("setlist");
  const [toast, setToast] = useState(null);
  const ping = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => { localStorage.removeItem(LS_PREFIX + "raw"); }, []);

  const [settings, setSettings] = useState(() => loadLS("settings", {
    groupName: "KOURiN", theme: "dark",
    showCue: true, autoExit: true, showRecent: true,
  }));
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  useEffect(() => { saveLS("settings", settings); }, [settings]);

  const [catalog, setCatalog] = useState(() => loadLS("catalog", KOURIN_PRESET));
  useEffect(() => { saveLS("catalog", catalog); }, [catalog]);
  const [newName, setNewName] = useState("");
  const [newLen, setNewLen] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [importText, setImportText] = useState("");

  /* ===== セトリ = アイテム配列（v0.4のコア） ===== */
  const [items, setItems] = useState(() => loadLS("items", []));
  useEffect(() => { saveLS("items", items); }, [items]);
  const [limit, setLimit] = useState(30);
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [setlistImport, setSetlistImport] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editLen, setEditLen] = useState("");
  /* MouseSensor(マウスのみ・distance) + TouchSensor(タッチのみ・delay) を分離。
     PointerSensorはmousedown/touchstart両方の代わりにpointerdownを使うため
     タッチでもdistance制約が先に成立してしまい、TouchSensorのdelayが無効化される。
     MouseSensorはonMouseDownのみを見るためタッチ操作では原則発火せず競合しない。 */
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const [ttRaw, setTtRaw] = useState("");
  const [ttStart, setTtStart] = useState("18:00");
  const [ttChange, setTtChange] = useState(10);
  const [ttRows, setTtRows] = useState(null);

  /* ===== リアルタイム派生計算（解析ボタン廃止） ===== */
  const computed = useMemo(() => {
    const withCue = items.map((r, i) => {
      let cue;
      if (i === 0) cue = "音先";
      else if (r.isMC) cue = "inst BGM";
      else if (items[i - 1].isMC) cue = "曲振";
      else cue = "連続";
      return { ...r, cue };
    });
    if (withCue.length > 0 && settings.autoExit) {
      const last = withCue[withCue.length - 1];
      last.exit = last.isMC ? "退場BGMあり" : "アウトロで退場します";
    }
    return withCue.map((r) => ({
      ...r,
      recent: settings.showRecent && !r.isMC && !r.isSE ? findHistory(r.title) : null,
    }));
  }, [items, settings]);

  const total = useMemo(() => items.reduce((a, r) => a + r.sec, 0), [items]);
  const limitSec = limit * 60;
  const ratio = items.length ? Math.min(total / limitSec, 1.15) : 0;
  const over = total > limitSec;

  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return catalog.filter((c) => norm(c.name).includes(q) || (c.aliases || []).some((a) => norm(a).includes(q))).slice(0, 6);
  }, [query, catalog]);

  /* ===== 操作 ===== */
  const addSong = (song) => {
    setItems((p) => [...p, { id: uid(), title: song.name, sec: song.sec, isMC: false, isSE: norm(song.name) === "se", catalogNote: null, unknown: false }]);
    setQuery("");
  };
  const addMC = (sec) => setItems((p) => [...p, { id: uid(), title: "MC", sec, isMC: true, isSE: false }]);
  const addSE = () => {
    const se = catalog.find((c) => norm(c.name) === "se");
    setItems((p) => [...p, { id: uid(), title: "SE", sec: se ? se.sec : 57, isMC: false, isSE: true }]);
  };
  const removeItem = (id) => setItems((p) => p.filter((r) => r.id !== id));
  const move = (index, dir) => {
    setItems((p) => {
      const to = index + dir;
      if (to < 0 || to >= p.length) return p;
      const next = [...p];
      const [x] = next.splice(index, 1);
      next.splice(to, 0, x);
      return next;
    });
  };
  /* ドラッグ中はページの touch-action を止めてブラウザの追従スクロールを抑止。
     overflow:hidden は端でのdnd-kit autoScroll(window.scrollBy)自体も殺してしまうため使わない。 */
  const lockPageScroll = () => { document.body.style.touchAction = "none"; };
  const unlockPageScroll = () => { document.body.style.touchAction = ""; };
  const handleDragStart = () => { lockPageScroll(); };
  const handleDragEnd = ({ active, over }) => {
    unlockPageScroll();
    if (!over || active.id === over.id) return;
    setItems((p) => {
      const from = p.findIndex((r) => r.id === active.id);
      const to = p.findIndex((r) => r.id === over.id);
      if (from === -1 || to === -1) return p;
      return arrayMove(p, from, to);
    });
  };
  const handleDragCancel = () => { unlockPageScroll(); };
  const startEdit = (r) => { setEditingId(r.id); setEditLen(fmt(r.sec)); };
  const commitEdit = (id) => {
    const sec = parseLen(editLen);
    if (sec !== null) setItems((p) => p.map((r) => (r.id === id ? { ...r, sec } : r)));
    setEditingId(null);
  };
  const runSetlistImport = () => {
    const parsed = textToItems(setlistImport, catalog);
    if (!parsed.length) { ping("「曲名 M:SS」形式の行が見つかりません"); return; }
    setItems(parsed);
    setSetlistImport(""); setShowImport(false);
    ping(`${parsed.length}ブロックを読み込みました（既存は置き換え）`);
  };

  const addToCatalog = () => {
    const m = newLen.match(/^(\d{1,2}):(\d{2})$/);
    if (!newName.trim() || !m) { ping("曲名と尺（例 3:43）を入れてください"); return; }
    const n = norm(newName);
    if (catalog.some((c) => norm(c.name) === n)) { ping("同名の曲が登録済みです"); return; }
    setCatalog((c) => [...c, {
      name: newName.trim(), sec: parseInt(m[1]) * 60 + parseInt(m[2]),
      aliases: newAlias.split(",").map((a) => a.trim()).filter(Boolean),
    }]);
    setNewName(""); setNewLen(""); setNewAlias("");
    ping("曲を登録しました");
  };
  const runImport = () => {
    const out = []; let skipped = 0;
    for (const line of importText.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const m = line.match(/^(?:\d+[.．]\s*)?(.+?)\s*(\d{1,2}):(\d{2})\s*$/);
      if (!m) continue;
      const name = m[1].trim();
      if (/^MC/.test(name)) continue;
      const n = norm(name);
      if (catalog.some((c) => norm(c.name) === n) || out.some((c) => norm(c.name) === n)) { skipped++; continue; }
      out.push({ name, sec: parseInt(m[2]) * 60 + parseInt(m[3]), aliases: [] });
    }
    if (!out.length) { ping(skipped ? "すべて登録済みでした" : "「曲名 M:SS」形式の行が見つかりません"); return; }
    setCatalog((c) => [...c, ...out]);
    setImportText("");
    ping(`${out.length}曲をインポートしました${skipped ? `（重複${skipped}件はスキップ）` : ""}`);
  };

  const tabs = [
    { id: "setlist", label: "セットリスト", sub: "運営" },
    { id: "tt", label: "タイムテーブル", sub: "制作" },
    { id: "catalog", label: "曲マスタ", sub: `${catalog.length}曲` },
    { id: "config", label: "設定", sub: null },
  ];

  const showDock = mode === "setlist" && items.length > 0;

  return (
    <div style={{
      ...THEMES[settings.theme],
      minHeight: "100vh", background: "var(--bg)", color: "var(--ink)",
      fontFamily: "'Inter','Noto Sans JP',sans-serif", transition: "background .25s",
      paddingBottom: showDock ? 110 : 0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
        ::selection { background: color-mix(in srgb, #FFB454 35%, transparent); }
        input, textarea { font-size: 13px; }
        @media (max-width: 860px) { input, textarea { font-size: 16px; } }
        textarea:focus, input:focus { outline: 2px solid color-mix(in srgb, #FFB454 55%, transparent); outline-offset: 1px; }
        .fadein { animation: fi .3s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .fadein { animation: none; } }
        .two-col { display: grid; grid-template-columns: minmax(300px, 420px) 1fr; gap: 18px; align-items: start; }
        @media (max-width: 860px) { .two-col { grid-template-columns: 1fr; } }
        .sk-row:hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
        .drag-handle { cursor: grab; touch-action: none; }
      `}</style>

      {/* ===== ヘッダー ===== */}
      <header style={{ borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Chakra Petch'", fontWeight: 700, fontSize: 21, letterSpacing: ".08em", color: "var(--accent)" }}>SIDEKICK</span>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>for <b style={{ color: "var(--ink)", fontWeight: 600 }}>{settings.groupName || "あなたのグループ"}</b></span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {MEMBER_COLORS.map((c, i) => <i key={i} style={{ width: 6, height: 6, borderRadius: 99, background: c, opacity: .85, display: "block" }} />)}
        </span>
      </header>

      {/* ===== タブ ===== */}
      <nav style={{ display: "flex", gap: 6, padding: "12px 20px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            padding: "8px 14px", borderRadius: "var(--radius)", cursor: "pointer",
            border: mode === t.id ? "1px solid var(--accent)" : "1px solid var(--border)",
            background: mode === t.id ? "color-mix(in srgb, var(--accent) 9%, var(--surface))" : "var(--surface)",
            color: mode === t.id ? "var(--accent)" : "var(--dim)",
            fontFamily: "'Noto Sans JP'", fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            {t.sub && <span style={{ fontSize: 10, fontWeight: 500, opacity: .75, border: "1px solid currentColor", borderRadius: 4, padding: "1px 5px" }}>{t.sub}</span>}
          </button>
        ))}
      </nav>

      {/* ================= セットリスト（ビルダー） ================= */}
      {mode === "setlist" && (
        <main style={{ padding: "16px 20px", maxWidth: 760, margin: "0 auto" }}>

          {/* --- 追加パレット --- */}
          <section style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="曲マスタから検索して追加（例: fan）"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Noto Sans JP'" }} />
              {candidates.length > 0 && (
                <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0, ...cardStyle, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}>
                  {candidates.map((c, i) => (
                    <button key={i} onClick={() => addSong(c)} style={{
                      display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "11px 14px",
                      background: "transparent", border: "none",
                      borderBottom: i < candidates.length - 1 ? "1px solid var(--border-soft)" : "none",
                      color: "var(--ink)", cursor: "pointer", fontSize: 14, fontFamily: "'Noto Sans JP'", textAlign: "left",
                    }}>
                      <span style={{ flex: 1, fontWeight: 700 }}>{c.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "var(--dim)" }}>{fmt(c.sec)}</span>
                      <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>＋追加</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              {[
                { label: "＋SE", fn: addSE },
                { label: "＋MC 0:30", fn: () => addMC(30) },
                { label: "＋MC 1:00", fn: () => addMC(60) },
                { label: "＋MC 2:00", fn: () => addMC(120) },
              ].map((chip, i) => (
                <button key={i} onClick={chip.fn} style={{
                  padding: "6px 12px", borderRadius: 99, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--dim)", fontSize: 12, cursor: "pointer",
                }}>{chip.label}</button>
              ))}
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => { setItems(textToItems(SAMPLE, catalog)); ping("サンプル（19ブロック）を読み込みました"); }} style={ghostBtn}>サンプル</button>
                <button onClick={() => setShowImport((v) => !v)} style={{ ...ghostBtn, color: showImport ? "var(--accent)" : "var(--dim)", borderColor: showImport ? "var(--accent)" : "var(--border)" }}>
                  テキスト読込
                </button>
              </span>
            </div>
            {showImport && (
              <div className="fadein" style={{ marginTop: 10 }}>
                <textarea value={setlistImport} onChange={(e) => setSetlistImport(e.target.value)}
                  placeholder={"従来どおりテキストを貼って読み込めます\n例）New World 3:43（現在のリストは置き換え）"}
                  rows={6}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.8, padding: 12 }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button onClick={runSetlistImport} disabled={!setlistImport.trim()} style={btnStyle(!!setlistImport.trim())}>読み込む（置き換え）</button>
                </div>
              </div>
            )}
          </section>

          {/* --- セトリリスト（並び替え可能） --- */}
          {items.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: 44, textAlign: "center", color: "var(--faint)", fontSize: 13, lineHeight: 2 }}>
              曲マスタから検索して追加するか、<br />「テキスト読込」でいつものセトリを貼り付け。<br />並び替えるたびにキッカケとtotalが自動で追いつきます。
            </div>
          ) : (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
              <SortableContext items={computed.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <section style={{ ...cardStyle, overflow: "hidden" }}>
                  {computed.map((r, i) => (
                    <SortableRow key={r.id} r={r} i={i} total={computed.length} settings={settings}
                      editingId={editingId} editLen={editLen} setEditLen={setEditLen}
                      startEdit={startEdit} commitEdit={commitEdit} setEditingId={setEditingId}
                      move={move} removeItem={removeItem} />
                  ))}
                </section>
              </SortableContext>
            </DndContext>
          )}

          {items.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => ping("PDF出力はβで提供予定 — 書式テンプレートは運営ごとにカスタムできます")} style={btnStyle()}>PDFに出力</button>
              <button onClick={() => ping("音源・歌割まとめ機能はβで提供予定")} style={{ ...ghostBtn, padding: "9px 18px", fontSize: 13 }}>音源・歌割をまとめる</button>
              <button onClick={() => { setItems([]); ping("セトリをクリアしました"); }} style={{ ...ghostBtn, marginLeft: "auto", color: "var(--alert)" }}>クリア</button>
            </div>
          )}
        </main>
      )}

      {/* ===== 下部固定 totalドック（セトリ作成中は常時表示） ===== */}
      {showDock && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
          ...THEMES[settings.theme],
          background: "color-mix(in srgb, var(--surface) 92%, transparent)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          borderTop: "1px solid var(--border)",
          padding: "10px 20px calc(10px + env(safe-area-inset-bottom, 0px))",
        }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, fontSize: "var(--tc-size)", color: over ? "var(--alert)" : "var(--ink)" }}>{fmt(total)}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "var(--faint)" }}>/</span>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                <input type="number" value={limit} min={5} max={180} onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ ...inputStyle, width: 52, padding: "3px 6px", textAlign: "right" }} />
                <span style={{ fontSize: 11, color: "var(--faint)" }}>分</span>
              </span>
              <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono'", fontSize: 12.5, fontWeight: 700, color: over ? "var(--alert)" : "var(--go)" }}>
                {over ? `+${fmt(total - limitSec)} オーバー` : `残り ${fmt(limitSec - total)}`}
              </span>
            </div>
            <div style={{ marginTop: 8, height: "var(--fader-h)", borderRadius: 99, background: "var(--border-soft)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(ratio * 100, 100)}%`, height: "100%", background: over ? "var(--alert)" : ratio > .93 ? "var(--accent)" : "var(--go)", transition: "width .3s ease", borderRadius: 99 }} />
            </div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--faint)", display: "flex", justifyContent: "space-between" }}>
              <span>{items.length} ブロック</span>
              <span>{over ? "曲かMCの調整が必要です" : ratio > .93 ? "枠ギリギリ — 押しに注意" : "枠に収まっています"}</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= タイムテーブル ================= */}
      {mode === "tt" && (
        <main className="two-col" style={{ padding: "16px 20px" }}>
          <section style={{ ...cardStyle, padding: "var(--card-pad)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", marginBottom: 10 }}>出演リスト（グループ名 持ち時間）</div>
            <textarea value={ttRaw} onChange={(e) => setTtRaw(e.target.value)} placeholder={"1行に1組\n例）KOURiN 25"} rows={9}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.8, padding: 12 }} />
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--dim)" }}>START</label>
              <input value={ttStart} onChange={(e) => setTtStart(e.target.value)} style={{ ...inputStyle, width: 62 }} />
              <label style={{ fontSize: 12, color: "var(--dim)" }}>転換</label>
              <input type="number" value={ttChange} onChange={(e) => setTtChange(Number(e.target.value))} style={{ ...inputStyle, width: 52 }} />
              <span style={{ fontSize: 12, color: "var(--dim)" }}>分</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setTtRaw(SAMPLE_TT)} style={ghostBtn}>サンプル</button>
                <button onClick={() => setTtRows(buildTimetable(ttRaw, ttStart, ttChange))} disabled={!ttRaw.trim()} style={btnStyle(!!ttRaw.trim())}>TTを組む</button>
              </div>
            </div>
          </section>
          <section>
            {!ttRows ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: 48, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                出演リストを入れて「TTを組む」を押すと転換込みで自動生成
              </div>
            ) : (
              <div className="fadein">
                <div style={{ ...cardStyle, overflow: "hidden" }}>
                  {ttRows.map((s, i) => (
                    <div key={i} className="sk-row" style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: s.type === "act" ? "var(--row-pad)" : "6px 16px",
                      borderBottom: i < ttRows.length - 1 ? "1px solid var(--border-soft)" : "none",
                      background: s.type === "change" ? "color-mix(in srgb, var(--dim) 4%, transparent)" : "transparent",
                    }}>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: s.type === "act" ? "var(--accent)" : "var(--faint)", width: 100, flexShrink: 0 }}>{clock(s.from)} – {clock(s.to)}</span>
                      <span style={{ flex: 1, fontWeight: s.type === "act" ? 700 : 400, fontSize: s.type === "act" ? 13.5 : 11.5, color: s.type === "act" ? "var(--ink)" : "var(--faint)" }}>
                        {s.type === "act" ? `${s.no}. ${s.name}` : "転換"}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "var(--dim)" }}>{s.min}分</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--dim)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>終演 {clock(ttRows[ttRows.length - 1].to)}</span>
                  <button onClick={() => ping("進行表PDF・スタッフ共有はβで提供予定")} style={{ ...btnStyle(), padding: "8px 16px", fontSize: 12 }}>進行表PDFに出力</button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ================= 曲マスタ ================= */}
      {mode === "catalog" && (
        <main className="two-col" style={{ padding: "16px 20px" }}>
          <section>
            <div style={{ ...cardStyle, padding: "var(--card-pad)", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>曲を登録</div>
              <div style={{ display: "grid", gap: 10 }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="曲名" style={{ ...inputStyle, fontFamily: "'Noto Sans JP'" }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={newLen} onChange={(e) => setNewLen(e.target.value)} placeholder="尺 3:43" style={{ ...inputStyle, width: 90 }} />
                  <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="別名（表記ゆれ、カンマ区切り）" style={{ ...inputStyle, flex: 1, fontFamily: "'Noto Sans JP'" }} />
                </div>
                <button onClick={addToCatalog} style={{ ...btnStyle(), padding: "9px 0" }}>登録する</button>
              </div>
            </div>
            <div style={{ ...cardStyle, padding: "var(--card-pad)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", marginBottom: 8 }}>一括インポート</div>
              <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 10, lineHeight: 1.7 }}>
                「曲名 M:SS」を1行ずつ貼るだけで全曲登録。<br />新しいグループの導入は30秒で終わります。
              </div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"例）\nはじまりの鐘 4:02\n真夜中シグナル 3:28"} rows={6}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.8, padding: 12 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setCatalog([]); ping("曲マスタを空にしました — 自分のグループの曲を登録してください"); }}
                  style={{ ...ghostBtn, color: "var(--alert)" }}>全削除</button>
                <button onClick={runImport} disabled={!importText.trim()} style={{ ...btnStyle(!!importText.trim()), padding: "8px 16px", fontSize: 12 }}>インポート</button>
              </div>
            </div>
          </section>
          <section style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-soft)", fontSize: 12, color: "var(--dim)", display: "flex", justifyContent: "space-between" }}>
              <span>登録曲 {catalog.length}</span>
              <span>検索追加・尺補完・表記ゆれ解決に使われます</span>
            </div>
            {catalog.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>まだ曲がありません — 左から登録 or 一括インポート</div>
            ) : catalog.map((c, i) => (
              <div key={i} className="sk-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "var(--row-pad)", borderBottom: i < catalog.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                  {(c.aliases || []).length > 0 && <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>別名: {c.aliases.join(" / ")}</div>}
                </div>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "var(--dim)" }}>{fmt(c.sec)}</span>
                <button onClick={() => setCatalog((cat) => cat.filter((_, j) => j !== i))}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--faint)", fontSize: 11, cursor: "pointer" }}>削除</button>
              </div>
            ))}
          </section>
        </main>
      )}

      {/* ================= 設定 ================= */}
      {mode === "config" && (
        <main style={{ padding: "16px 20px", maxWidth: 560 }}>
          <div style={{ ...cardStyle, padding: "var(--card-pad)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", marginBottom: 6 }}>グループ設定</div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 16, lineHeight: 1.7 }}>
              セトリの流儀はグループごとに違う。使う項目だけONにして、あなたの書式に合わせられます。
            </div>
            <label style={{ display: "block", fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>グループ名</label>
            <input value={settings.groupName} onChange={(e) => set("groupName", e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Noto Sans JP'", marginBottom: 12 }} />

            <label style={{ display: "block", fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>テーマ</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[
                { id: "dark", label: "ダーク", desc: "夜の袖・楽屋向き" },
                { id: "light", label: "ライト", desc: "昼の事務所向き" },
              ].map((t) => (
                <button key={t.id} onClick={() => set("theme", t.id)} style={{
                  flex: 1, padding: "12px 10px", borderRadius: "var(--radius)",
                  border: settings.theme === t.id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: settings.theme === t.id ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface2)",
                  color: settings.theme === t.id ? "var(--accent)" : "var(--dim)",
                  cursor: "pointer", fontFamily: "'Noto Sans JP'", fontWeight: 700, fontSize: 13, textAlign: "center",
                }}>
                  {t.label}
                  <span style={{ display: "block", fontSize: 10, fontWeight: 400, marginTop: 3, opacity: .8 }}>{t.desc}</span>
                </button>
              ))}
            </div>

            <Toggle on={settings.showCue} onChange={(v) => set("showCue", v)}
              label="キッカケの自動判定" desc="音先・連続・曲振・inst BGM を順番から自動で付与" />
            <Toggle on={settings.autoExit} onChange={(v) => set("autoExit", v)}
              label="退場処理の自動付与" desc="末尾がMCなら「退場BGMあり」、楽曲なら「アウトロで退場します」" />
            <Toggle on={settings.showRecent} onChange={(v) => set("showRecent", v)}
              label="直近使用チェック" desc="過去公演でやった曲に「直近使用」を表示（被り防止）" />

            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", fontSize: 11, color: "var(--dim)", lineHeight: 1.8 }}>
              <b style={{ color: "var(--accent)" }}>β予定:</b> 独自列の追加（track・衣装・立ち位置など）／キッカケ用語のカスタム／PDFテンプレートのデザイン変更／曲マスタと公演履歴のクラウド保存
            </div>
          </div>
        </main>
      )}

      {toast && (
        <div className="fadein" style={{
          position: "fixed", bottom: showDock ? 120 : 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--surface2)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
          color: "var(--ink)", padding: "12px 20px", borderRadius: 10, fontSize: 13, maxWidth: "88vw",
          boxShadow: "0 8px 32px rgba(0,0,0,.35)", zIndex: 50,
        }}>{toast}</div>
      )}

      <footer style={{ padding: "26px 20px", fontSize: 10.5, color: "var(--faint)", textAlign: "center", letterSpacing: ".06em" }}>
        SIDEKICK v0.4 demo — setlist builder / realtime cue / mobile-first
      </footer>
    </div>
  );
}
