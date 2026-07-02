import { useState, useMemo } from "react";

/* ============================================================
   SIDEKICK v0.2 demo — アイドル運営と制作の、相棒AI
   v0.1からの追加:
   - 曲マスタ（登録/一括インポート/別名=表記ゆれ対応/削除）
   - セトリ入力ハイブリッド（テキスト貼付 + 検索選択 + クイックチップ）
   - グループ設定（グループ名 / 項目ON・OFF）→ 解析表示に連動
   ※永続化はPhase 2（今はリロードで初期状態に戻る。移植後に
     localStorage → Supabase の順で永続化する）
   ============================================================ */

/* ---------- KOURiNプリセット（デモ初期データ） ---------- */
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

/* ---------- utils ---------- */
const norm = (s) => s.toLowerCase().replace(/[\s'’!！・．.（）()]/g, "").replace(/ー/g, "");
const fmt = (sec) => {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? "-" : ""}${m}:${String(s).padStart(2, "0")}`;
};

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

/* ---------- セトリ解析（カタログ・設定連動版） ---------- */
function parseSetlist(text, catalog, settings) {
  const rows = [];
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
    rows.push({ title, sec, isMC, isSE, catalogNote, unknown });
  }
  const withCue = rows.map((r, i) => {
    let cue;
    if (i === 0) cue = "音先";
    else if (r.isMC) cue = "inst BGM";
    else if (rows[i - 1].isMC) cue = "曲振";
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
}

function parseImport(text, existing) {
  const out = []; let skipped = 0;
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (/^total/i.test(line)) continue;
    const m = line.match(/^(?:\d+[.．]\s*)?(.+?)\s*(\d{1,2}):(\d{2})\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    if (/^MC/.test(name)) continue;
    const n = norm(name);
    if (existing.some((c) => norm(c.name) === n) || out.some((c) => norm(c.name) === n)) { skipped++; continue; }
    out.push({ name, sec: parseInt(m[2]) * 60 + parseInt(m[3]), aliases: [] });
  }
  return { out, skipped };
}

/* ---------- TT ---------- */
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

const CUE_STYLE = {
  "音先": { bg: "rgba(255,180,84,.16)", fg: "#FFB454", bd: "rgba(255,180,84,.4)" },
  "連続": { bg: "rgba(138,145,166,.14)", fg: "#AEB4C6", bd: "rgba(138,145,166,.35)" },
  "曲振": { bg: "rgba(74,222,128,.13)", fg: "#4ADE80", bd: "rgba(74,222,128,.4)" },
  "inst BGM": { bg: "rgba(167,139,250,.15)", fg: "#B9A6FB", bd: "rgba(167,139,250,.4)" },
};
const MEMBER_COLORS = ["#A78BFA", "#FDE047", "#4ADE80", "#F1F5F9", "#FB923C", "#F9A8D4"];

/* ---------- 小物 ---------- */
const inputStyle = {
  background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F",
  borderRadius: 6, padding: "7px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
};
const cardStyle = { background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12 };

function Toggle({ on, onChange, label, desc }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
      background: "transparent", border: "none", cursor: "pointer", padding: "14px 0",
      borderBottom: "1px solid #232941",
    }}>
      <span style={{
        width: 40, height: 22, borderRadius: 99, flexShrink: 0, position: "relative",
        background: on ? "rgba(255,180,84,.9)" : "#262C3F", transition: "background .2s",
      }}>
        <span style={{
          position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16,
          borderRadius: 99, background: "#12151E", transition: "left .2s",
        }} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#EDEFF5" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "#8A91A6", marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}

/* ============================================================ */
export default function Sidekick() {
  const [mode, setMode] = useState("setlist");
  const [toast, setToast] = useState(null);
  const ping = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  /* 設定 */
  const [settings, setSettings] = useState({
    groupName: "KOURiN",
    showCue: true,
    autoExit: true,
    showRecent: true,
  });
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  /* 曲マスタ */
  const [catalog, setCatalog] = useState(KOURIN_PRESET);
  const [newName, setNewName] = useState("");
  const [newLen, setNewLen] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [importText, setImportText] = useState("");

  /* セトリ */
  const [raw, setRaw] = useState("");
  const [limit, setLimit] = useState(65);
  const [parsed, setParsed] = useState(null);
  const [query, setQuery] = useState("");

  /* TT */
  const [ttRaw, setTtRaw] = useState("");
  const [ttStart, setTtStart] = useState("18:00");
  const [ttChange, setTtChange] = useState(10);
  const [ttRows, setTtRows] = useState(null);

  const total = useMemo(() => (parsed ? parsed.reduce((a, r) => a + r.sec, 0) : 0), [parsed]);
  const limitSec = limit * 60;
  const ratio = parsed ? Math.min(total / limitSec, 1.15) : 0;
  const over = total > limitSec;

  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return catalog.filter((c) => norm(c.name).includes(q) || (c.aliases || []).some((a) => norm(a).includes(q))).slice(0, 6);
  }, [query, catalog]);

  const appendLine = (line) => setRaw((p) => (p ? p.replace(/\n*$/, "\n") : "") + line);
  const addSong = (song) => { appendLine(`${song.name} ${fmt(song.sec)}`); setQuery(""); };

  const addToCatalog = () => {
    const m = newLen.match(/^(\d{1,2}):(\d{2})$/);
    if (!newName.trim() || !m) { ping("曲名と尺（例 3:43）を入れてください"); return; }
    const n = norm(newName);
    if (catalog.some((c) => norm(c.name) === n)) { ping("同名の曲が登録済みです"); return; }
    setCatalog((c) => [...c, {
      name: newName.trim(),
      sec: parseInt(m[1]) * 60 + parseInt(m[2]),
      aliases: newAlias.split(",").map((a) => a.trim()).filter(Boolean),
    }]);
    setNewName(""); setNewLen(""); setNewAlias("");
    ping("曲を登録しました");
  };

  const runImport = () => {
    const { out, skipped } = parseImport(importText, catalog);
    if (out.length === 0) { ping(skipped ? "すべて登録済みでした" : "「曲名 M:SS」形式の行が見つかりません"); return; }
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

  return (
    <div style={{ minHeight: "100vh", background: "#12151E", color: "#EDEFF5", fontFamily: "'Noto Sans JP', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
        ::selection { background: rgba(255,180,84,.3); }
        textarea:focus, input:focus { outline: 2px solid rgba(255,180,84,.5); outline-offset: 1px; }
        .fadein { animation: fi .35s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .fadein { animation: none; } }
        .two-col { display: grid; grid-template-columns: minmax(300px, 420px) 1fr; gap: 20px; align-items: start; }
        @media (max-width: 860px) { .two-col { grid-template-columns: 1fr; } }
      `}</style>

      {/* ===== ヘッダー ===== */}
      <header style={{ borderBottom: "1px solid #262C3F", padding: "18px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "'Chakra Petch'", fontWeight: 700, fontSize: 26, letterSpacing: ".08em", color: "#FFB454" }}>SIDEKICK</span>
          <span style={{ fontSize: 12, color: "#8A91A6" }}>for <b style={{ color: "#AEB4C6" }}>{settings.groupName || "あなたのグループ"}</b></span>
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {MEMBER_COLORS.map((c, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: c, opacity: .85 }} />)}
        </div>
      </header>

      {/* ===== タブ ===== */}
      <nav style={{ display: "flex", gap: 8, padding: "16px 24px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            border: mode === t.id ? "1px solid rgba(255,180,84,.55)" : "1px solid #262C3F",
            background: mode === t.id ? "rgba(255,180,84,.1)" : "#1C2130",
            color: mode === t.id ? "#FFB454" : "#AEB4C6",
            fontFamily: "'Noto Sans JP'", fontWeight: 700, fontSize: 14,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {t.label}
            {t.sub && <span style={{ fontSize: 10, fontWeight: 500, opacity: .7, border: "1px solid currentColor", borderRadius: 4, padding: "1px 5px" }}>{t.sub}</span>}
          </button>
        ))}
      </nav>

      {/* ================= セットリスト ================= */}
      {mode === "setlist" && (
        <main className="two-col" style={{ padding: 24 }}>
          <section style={{ ...cardStyle, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 10 }}>セットリストを作る</div>

            {/* 曲マスタから追加 */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="曲マスタから検索して追加（例: fan）"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Noto Sans JP'" }}
              />
              {candidates.length > 0 && (
                <div style={{ position: "absolute", zIndex: 5, top: "calc(100% + 4px)", left: 0, right: 0, ...cardStyle, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}>
                  {candidates.map((c, i) => (
                    <button key={i} onClick={() => addSong(c)} style={{
                      display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 14px",
                      background: "transparent", border: "none", borderBottom: i < candidates.length - 1 ? "1px solid #232941" : "none",
                      color: "#EDEFF5", cursor: "pointer", fontSize: 13, fontFamily: "'Noto Sans JP'", textAlign: "left",
                    }}>
                      <span style={{ flex: 1, fontWeight: 700 }}>{c.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#8A91A6" }}>{fmt(c.sec)}</span>
                      <span style={{ fontSize: 11, color: "#FFB454" }}>＋追加</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* クイックチップ */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {[
                { label: "＋SE", line: () => { const se = catalog.find((c) => norm(c.name) === "se"); return se ? `SE ${fmt(se.sec)}` : "SE"; } },
                { label: "＋MC 0:30", line: () => "MC 0:30" },
                { label: "＋MC 1:00", line: () => "MC 1:00" },
                { label: "＋MC 2:00", line: () => "MC 2:00" },
              ].map((chip, i) => (
                <button key={i} onClick={() => appendLine(chip.line())} style={{
                  padding: "5px 10px", borderRadius: 99, border: "1px solid #262C3F",
                  background: "#12151E", color: "#AEB4C6", fontSize: 12, cursor: "pointer",
                }}>{chip.label}</button>
              ))}
            </div>

            <textarea
              value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder={"テキストをそのまま貼ってもOK\n例）New World 3:43\n尺を省略すれば曲マスタから自動補完"}
              rows={12}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.7, padding: 12 }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#8A91A6" }}>持ち時間</label>
              <input type="number" value={limit} min={5} max={180} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...inputStyle, width: 60 }} />
              <span style={{ fontSize: 12, color: "#8A91A6" }}>分</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setRaw(SAMPLE)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#8A91A6", fontSize: 12, cursor: "pointer" }}>サンプル</button>
                <button onClick={() => setParsed(parseSetlist(raw, catalog, settings))} disabled={!raw.trim()} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: raw.trim() ? "#FFB454" : "#3A4157", color: "#12151E",
                  fontWeight: 700, fontSize: 13, cursor: raw.trim() ? "pointer" : "not-allowed", fontFamily: "'Noto Sans JP'",
                }}>解析する</button>
              </div>
            </div>
          </section>

          <section>
            {!parsed ? (
              <div style={{ border: "1px dashed #262C3F", borderRadius: 12, padding: 48, textAlign: "center", color: "#5C6378", fontSize: 13 }}>
                貼り付け・検索追加・チップ、どの入れ方でも同じ解析に落ちます
              </div>
            ) : (
              <div className="fadein">
                <div style={{ ...cardStyle, padding: "18px 20px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, fontSize: 40, color: over ? "#F87171" : "#EDEFF5" }}>{fmt(total)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 16, color: "#5C6378" }}>/ {fmt(limitSec)}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono'", fontSize: 14, fontWeight: 700, color: over ? "#F87171" : "#4ADE80" }}>
                      {over ? `+${fmt(total - limitSec)} オーバー` : `残り ${fmt(limitSec - total)}`}
                    </span>
                  </div>
                  <div style={{ marginTop: 12, height: 10, borderRadius: 99, background: "#12151E", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(ratio * 100, 100)}%`, height: "100%", background: over ? "#F87171" : ratio > .93 ? "#FFB454" : "#4ADE80", transition: "width .4s ease", borderRadius: 99 }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#5C6378", display: "flex", justifyContent: "space-between" }}>
                    <span>{parsed.length} ブロック</span>
                    <span>{over ? "曲かMCの調整が必要です" : ratio > .93 ? "枠ギリギリ — 押しに注意" : "枠に収まっています"}</span>
                  </div>
                </div>

                <div style={{ ...cardStyle, overflow: "hidden" }}>
                  {parsed.map((r, i) => {
                    const cs = CUE_STYLE[r.cue];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < parsed.length - 1 ? "1px solid #232941" : "none" }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#5C6378", width: 22, textAlign: "right" }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: r.isMC ? 500 : 700, fontSize: 14, color: r.isMC ? "#AEB4C6" : "#EDEFF5" }}>
                            {r.title}
                            {r.exit && <span style={{ marginLeft: 10, fontSize: 11, color: "#FFB454", border: "1px solid rgba(255,180,84,.4)", borderRadius: 4, padding: "1px 6px" }}>{r.exit}</span>}
                          </div>
                          {r.catalogNote && <div style={{ fontSize: 11, color: "#FFB454", marginTop: 2 }}>⚠ 曲マスタ表記: {r.catalogNote}</div>}
                          {r.unknown && <div style={{ fontSize: 11, color: "#F87171", marginTop: 2 }}>？ 曲マスタ未登録 — 曲マスタタブから登録できます</div>}
                          {r.recent && <div style={{ fontSize: 11, color: "#8A91A6", marginTop: 2 }}><span style={{ color: "#F9A8D4" }}>●</span> 直近使用 — {r.recent.date} {r.recent.event}</div>}
                        </div>
                        {settings.showCue && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: cs.bg, color: cs.fg, border: `1px solid ${cs.bd}`, whiteSpace: "nowrap" }}>{r.cue}</span>}
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#AEB4C6", width: 44, textAlign: "right" }}>{fmt(r.sec)}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={() => ping("PDF出力はβで提供予定 — 書式テンプレートは運営ごとにカスタムできます")} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#FFB454", color: "#12151E", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>PDFに出力</button>
                  <button onClick={() => ping("音源・歌割まとめ機能はβで提供予定")} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#AEB4C6", fontSize: 13, cursor: "pointer" }}>音源・歌割をまとめる</button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ================= タイムテーブル ================= */}
      {mode === "tt" && (
        <main className="two-col" style={{ padding: 24 }}>
          <section style={{ ...cardStyle, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 10 }}>出演リスト（グループ名 持ち時間）</div>
            <textarea value={ttRaw} onChange={(e) => setTtRaw(e.target.value)} placeholder={"1行に1組\n例）KOURiN 25"} rows={9}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.7, padding: 12 }} />
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#8A91A6" }}>START</label>
              <input value={ttStart} onChange={(e) => setTtStart(e.target.value)} style={{ ...inputStyle, width: 62 }} />
              <label style={{ fontSize: 12, color: "#8A91A6" }}>転換</label>
              <input type="number" value={ttChange} onChange={(e) => setTtChange(Number(e.target.value))} style={{ ...inputStyle, width: 52 }} />
              <span style={{ fontSize: 12, color: "#8A91A6" }}>分</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setTtRaw(SAMPLE_TT)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#8A91A6", fontSize: 12, cursor: "pointer" }}>サンプル</button>
                <button onClick={() => setTtRows(buildTimetable(ttRaw, ttStart, ttChange))} disabled={!ttRaw.trim()} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: ttRaw.trim() ? "#FFB454" : "#3A4157", color: "#12151E", fontWeight: 700, fontSize: 13,
                  cursor: ttRaw.trim() ? "pointer" : "not-allowed", fontFamily: "'Noto Sans JP'",
                }}>TTを組む</button>
              </div>
            </div>
          </section>
          <section>
            {!ttRows ? (
              <div style={{ border: "1px dashed #262C3F", borderRadius: 12, padding: 48, textAlign: "center", color: "#5C6378", fontSize: 13 }}>
                出演リストを入れて「TTを組む」を押すと転換込みで自動生成
              </div>
            ) : (
              <div className="fadein">
                <div style={{ ...cardStyle, overflow: "hidden" }}>
                  {ttRows.map((s, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: s.type === "act" ? "13px 16px" : "7px 16px",
                      borderBottom: i < ttRows.length - 1 ? "1px solid #232941" : "none",
                      background: s.type === "change" ? "rgba(138,145,166,.05)" : "transparent",
                    }}>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: s.type === "act" ? "#FFB454" : "#5C6378", width: 104 }}>{clock(s.from)} – {clock(s.to)}</span>
                      <span style={{ flex: 1, fontWeight: s.type === "act" ? 700 : 400, fontSize: s.type === "act" ? 14 : 12, color: s.type === "act" ? "#EDEFF5" : "#5C6378" }}>
                        {s.type === "act" ? `${s.no}. ${s.name}` : "転換"}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#8A91A6" }}>{s.min}分</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#8A91A6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>終演 {clock(ttRows[ttRows.length - 1].to)}</span>
                  <button onClick={() => ping("進行表PDF・スタッフ共有はβで提供予定")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#FFB454", color: "#12151E", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>進行表PDFに出力</button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ================= 曲マスタ ================= */}
      {mode === "catalog" && (
        <main className="two-col" style={{ padding: 24 }}>
          <section>
            {/* 個別追加 */}
            <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 12 }}>曲を登録</div>
              <div style={{ display: "grid", gap: 10 }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="曲名" style={{ ...inputStyle, fontFamily: "'Noto Sans JP'" }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={newLen} onChange={(e) => setNewLen(e.target.value)} placeholder="尺 3:43" style={{ ...inputStyle, width: 90 }} />
                  <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="別名（表記ゆれ、カンマ区切り）" style={{ ...inputStyle, flex: 1, fontFamily: "'Noto Sans JP'" }} />
                </div>
                <button onClick={addToCatalog} style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "#FFB454", color: "#12151E", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>登録する</button>
              </div>
            </div>

            {/* 一括インポート */}
            <div style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 8 }}>一括インポート</div>
              <div style={{ fontSize: 11, color: "#5C6378", marginBottom: 10, lineHeight: 1.7 }}>
                「曲名 M:SS」を1行ずつ貼るだけで全曲登録。<br />新しいグループの導入は30秒で終わります。
              </div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"例）\nはじまりの鐘 4:02\n真夜中シグナル 3:28"} rows={6}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.7, padding: 12 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setCatalog([]); ping("曲マスタを空にしました — 自分のグループの曲を登録してください"); }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#F87171", fontSize: 12, cursor: "pointer" }}>全削除</button>
                <button onClick={runImport} disabled={!importText.trim()} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: importText.trim() ? "#FFB454" : "#3A4157", color: "#12151E", fontWeight: 700, fontSize: 12,
                  cursor: importText.trim() ? "pointer" : "not-allowed", fontFamily: "'Noto Sans JP'",
                }}>インポート</button>
              </div>
            </div>
          </section>

          {/* 曲リスト */}
          <section style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #232941", fontSize: 12, color: "#8A91A6", display: "flex", justifyContent: "space-between" }}>
              <span>登録曲 {catalog.length}</span>
              <span>セトリ解析の尺補完・表記ゆれ解決に使われます</span>
            </div>
            {catalog.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#5C6378", fontSize: 13 }}>まだ曲がありません — 左から登録 or 一括インポート</div>
            ) : catalog.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < catalog.length - 1 ? "1px solid #232941" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                  {(c.aliases || []).length > 0 && <div style={{ fontSize: 11, color: "#5C6378", marginTop: 2 }}>別名: {c.aliases.join(" / ")}</div>}
                </div>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#AEB4C6" }}>{fmt(c.sec)}</span>
                <button onClick={() => setCatalog((cat) => cat.filter((_, j) => j !== i))}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #262C3F", background: "transparent", color: "#5C6378", fontSize: 11, cursor: "pointer" }}>削除</button>
              </div>
            ))}
          </section>
        </main>
      )}

      {/* ================= 設定 ================= */}
      {mode === "config" && (
        <main style={{ padding: 24, maxWidth: 560 }}>
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 6 }}>グループ設定</div>
            <div style={{ fontSize: 11, color: "#5C6378", marginBottom: 16, lineHeight: 1.7 }}>
              セトリの流儀はグループごとに違う。使う項目だけONにして、あなたの書式に合わせられます。
            </div>
            <label style={{ display: "block", fontSize: 12, color: "#8A91A6", marginBottom: 6 }}>グループ名</label>
            <input value={settings.groupName} onChange={(e) => set("groupName", e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Noto Sans JP'", marginBottom: 8 }} />
            <Toggle on={settings.showCue} onChange={(v) => set("showCue", v)}
              label="キッカケの自動判定" desc="音先・連続・曲振・inst BGM を順番から自動で付与" />
            <Toggle on={settings.autoExit} onChange={(v) => set("autoExit", v)}
              label="退場処理の自動付与" desc="末尾がMCなら「退場BGMあり」、楽曲なら「アウトロで退場します」" />
            <Toggle on={settings.showRecent} onChange={(v) => set("showRecent", v)}
              label="直近使用チェック" desc="過去公演でやった曲に「直近使用」を表示（被り防止）" />
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "rgba(255,180,84,.06)", border: "1px solid rgba(255,180,84,.2)", fontSize: 11, color: "#8A91A6", lineHeight: 1.8 }}>
              <b style={{ color: "#FFB454" }}>β予定:</b> 独自列の追加（track・衣装・立ち位置など）／キッカケ用語のカスタム／PDFテンプレートのデザイン変更／曲マスタと公演履歴のクラウド保存
            </div>
          </div>
        </main>
      )}

      {toast && (
        <div className="fadein" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#262C3F", border: "1px solid rgba(255,180,84,.4)", color: "#EDEFF5",
          padding: "12px 20px", borderRadius: 10, fontSize: 13, maxWidth: "88vw",
          boxShadow: "0 8px 32px rgba(0,0,0,.45)", zIndex: 50,
        }}>{toast}</div>
      )}

      <footer style={{ padding: "28px 24px", fontSize: 11, color: "#3A4157", textAlign: "center", letterSpacing: ".05em" }}>
        SIDEKICK v0.2 demo — song master / hybrid input / per-group settings
      </footer>
    </div>
  );
}
