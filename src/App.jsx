import { useState, useMemo } from "react";

/* ============================================================
   SIDEKICK v0 demo — アイドル運営と制作の、相棒AI
   舞台袖のプロダクションデスクをコンセプトにしたUI。
   セトリのテキストを貼る → キッカケ/退場処理/total/直近使用を自動解析。
   制作モードはタイムテーブルの自動組み。
   ============================================================ */

/* ---------- 曲カタログ（KOURiN実データ） ---------- */
const CATALOG = [
  { name: "SE", sec: 57 },
  { name: "Shine", sec: 187 },
  { name: "覚醒Destiny", sec: 201 },
  { name: "OVERDRIVE", sec: 230 },
  { name: "Kiss me", sec: 194 },
  { name: "New World", sec: 223 },
  { name: "TOO YOUNG TOOOO DIE!", sec: 291 },
  { name: "Glory Rain", sec: 200 },
  { name: "KOURiN ROCK 'n' ROLL", sec: 226 },
  { name: "restart", sec: 217 },
  { name: "ユメクイ", sec: 224 },
  { name: "IMAGINATION", sec: 212 },
  { name: "FANFARE", sec: 236 },
  { name: "FANFARE long", sec: 257 },
  { name: "Manifesto", sec: 234 },
  { name: "manifest 1:00", sec: 60 },
  { name: "SHOWTIME", sec: 209 },
  { name: "Never ever", sec: 209 },
  { name: "未来は呼んでいる", sec: 236 },
];

/* ---------- 直近公演DB（実履歴） ---------- */
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

/* ---------- サンプル入力（7/29 アニバ想定） ---------- */
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

/* ---------- ユーティリティ ---------- */
const norm = (s) =>
  s.toLowerCase().replace(/[\s'’!！・．.]/g, "").replace(/ー/g, "");

const fmt = (sec) => {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? "-" : ""}${m}:${String(s).padStart(2, "0")}`;
};

function findCatalog(title) {
  const n = norm(title);
  let hit = CATALOG.find((c) => norm(c.name) === n);
  if (hit) return { hit, fuzzy: false };
  hit = CATALOG.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  if (hit && n.length >= 3) return { hit, fuzzy: true };
  return { hit: null, fuzzy: false };
}

function findHistory(title) {
  const n = norm(title);
  for (const show of HISTORY) {
    if (show.songs.some((s) => norm(s) === n)) return show;
  }
  return null;
}

/* ---------- セトリ解析エンジン ---------- */
function parseSetlist(text) {
  const rows = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^total/i.test(line) || /^合計/.test(line)) continue;
    const m = line.match(/^(?:\d+[.．]\s*)?(.+?)\s*(\d{1,2}):(\d{2})\s*$/);
    let title, sec = null;
    if (m) {
      title = m[1].trim();
      sec = parseInt(m[2]) * 60 + parseInt(m[3]);
    } else {
      title = line.replace(/^\d+[.．]\s*/, "").trim();
    }
    const isMC = /^MC/.test(title);
    const isSE = /^SE\b/i.test(title) || norm(title) === "se";
    let catalogNote = null;
    if (!isMC) {
      const { hit, fuzzy } = findCatalog(title);
      if (hit && sec === null) sec = hit.sec;
      if (hit && fuzzy) catalogNote = hit.name;
      if (!hit && !isSE && sec === null) sec = 0;
    }
    if (sec === null) sec = 0;
    rows.push({ title, sec, isMC, isSE, catalogNote });
  }
  /* キッカケ判定（KOURiNルール） */
  const withCue = rows.map((r, i) => {
    let cue;
    if (i === 0) cue = "音先";
    else if (r.isMC) cue = "inst BGM";
    else if (rows[i - 1].isMC) cue = "曲振";
    else cue = "連続";
    return { ...r, cue };
  });
  /* 退場処理：最終ブロックのみ */
  if (withCue.length > 0) {
    const last = withCue[withCue.length - 1];
    last.exit = last.isMC ? "退場BGMあり" : "アウトロで退場します";
  }
  /* 直近使用照合 */
  const final = withCue.map((r) => ({
    ...r,
    recent: !r.isMC && !r.isSE ? findHistory(r.title) : null,
  }));
  return final;
}

/* ---------- TT生成エンジン ---------- */
function buildTimetable(text, startTime, changeover) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const acts = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+(\d{1,3})\s*(?:min|分)?$/);
    if (m) acts.push({ name: m[1].trim(), min: parseInt(m[2]) });
  }
  const [sh, sm] = startTime.split(":").map(Number);
  let t = sh * 60 + sm;
  const slots = [];
  acts.forEach((a, i) => {
    slots.push({ from: t, to: t + a.min, name: a.name, min: a.min, type: "act", no: i + 1 });
    t += a.min;
    if (i < acts.length - 1) {
      slots.push({ from: t, to: t + changeover, name: "転換", min: changeover, type: "change" });
      t += changeover;
    }
  });
  return slots;
}
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* ---------- キッカケバッジ ---------- */
const CUE_STYLE = {
  "音先":     { bg: "rgba(255,180,84,.16)", fg: "#FFB454", bd: "rgba(255,180,84,.4)" },
  "連続":     { bg: "rgba(138,145,166,.14)", fg: "#AEB4C6", bd: "rgba(138,145,166,.35)" },
  "曲振":     { bg: "rgba(74,222,128,.13)", fg: "#4ADE80", bd: "rgba(74,222,128,.4)" },
  "inst BGM": { bg: "rgba(167,139,250,.15)", fg: "#B9A6FB", bd: "rgba(167,139,250,.4)" },
};

const MEMBER_COLORS = ["#A78BFA", "#FDE047", "#4ADE80", "#F1F5F9", "#FB923C", "#F9A8D4"];

/* ============================================================ */
export default function App() {
  const [mode, setMode] = useState("setlist");
  const [raw, setRaw] = useState("");
  const [limit, setLimit] = useState(65);
  const [parsed, setParsed] = useState(null);
  const [toast, setToast] = useState(null);

  const [ttRaw, setTtRaw] = useState("");
  const [ttStart, setTtStart] = useState("18:00");
  const [ttChange, setTtChange] = useState(10);
  const [ttRows, setTtRows] = useState(null);

  const total = useMemo(
    () => (parsed ? parsed.reduce((a, r) => a + r.sec, 0) : 0),
    [parsed]
  );
  const limitSec = limit * 60;
  const ratio = parsed ? Math.min(total / limitSec, 1.15) : 0;
  const over = total > limitSec;

  const ping = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#12151E", color: "#EDEFF5", fontFamily: "'Noto Sans JP', sans-serif" }}>
      <style>{`
        ::selection { background: rgba(255,180,84,.3); }
        textarea:focus, input:focus { outline: 2px solid rgba(255,180,84,.5); outline-offset: 1px; }
        .fadein { animation: fi .35s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .fadein { animation: none; } }
      `}</style>

      {/* ===== ヘッダー ===== */}
      <header style={{ borderBottom: "1px solid #262C3F", padding: "18px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "'Chakra Petch'", fontWeight: 700, fontSize: 26, letterSpacing: ".08em", color: "#FFB454" }}>
            SIDEKICK
          </span>
          <span style={{ fontSize: 12, color: "#8A91A6", letterSpacing: ".05em" }}>
            アイドル運営と制作の、相棒AI
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
          {MEMBER_COLORS.map((c, i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: c, opacity: 0.85 }} />
          ))}
        </div>
      </header>

      {/* ===== モード切替 ===== */}
      <nav style={{ display: "flex", gap: 8, padding: "16px 24px 0" }}>
        {[
          { id: "setlist", label: "セットリスト", sub: "運営" },
          { id: "tt", label: "タイムテーブル", sub: "制作" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            style={{
              padding: "9px 18px", borderRadius: 8, cursor: "pointer",
              border: mode === t.id ? "1px solid rgba(255,180,84,.55)" : "1px solid #262C3F",
              background: mode === t.id ? "rgba(255,180,84,.1)" : "#1C2130",
              color: mode === t.id ? "#FFB454" : "#AEB4C6",
              fontFamily: "'Noto Sans JP'", fontWeight: 700, fontSize: 14,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {t.label}
            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, border: "1px solid currentColor", borderRadius: 4, padding: "1px 5px" }}>
              {t.sub}
            </span>
          </button>
        ))}
      </nav>

      {/* ================= セットリストモード ================= */}
      {mode === "setlist" && (
        <main style={{ display: "grid", gridTemplateColumns: "minmax(300px, 420px) 1fr", gap: 20, padding: 24, alignItems: "start" }}
          className="grid-main">
          <style>{`@media (max-width: 860px){ .grid-main { grid-template-columns: 1fr !important; } }`}</style>

          {/* --- 入力パネル --- */}
          <section style={{ background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 10, letterSpacing: ".04em" }}>
              セットリストを貼り付け
            </div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"曲名と尺を1行ずつ\n例）New World 3:43\n　　MC 2:00\n尺を省略すればカタログから自動補完"}
              rows={14}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F",
                borderRadius: 8, padding: 12, fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13, lineHeight: 1.7,
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#8A91A6" }}>持ち時間</label>
              <input
                type="number" value={limit} min={5} max={120}
                onChange={(e) => setLimit(Number(e.target.value))}
                style={{ width: 64, background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F", borderRadius: 6, padding: "6px 8px", fontFamily: "'JetBrains Mono'", fontSize: 14 }}
              />
              <span style={{ fontSize: 12, color: "#8A91A6" }}>分</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  onClick={() => setRaw(SAMPLE)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#8A91A6", fontSize: 12, cursor: "pointer" }}
                >
                  サンプル読込
                </button>
                <button
                  onClick={() => setParsed(parseSetlist(raw))}
                  disabled={!raw.trim()}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: "none", cursor: raw.trim() ? "pointer" : "not-allowed",
                    background: raw.trim() ? "#FFB454" : "#3A4157", color: "#12151E",
                    fontWeight: 700, fontSize: 13, fontFamily: "'Noto Sans JP'",
                  }}
                >
                  解析する
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: "#5C6378", lineHeight: 1.8 }}>
              キッカケ（音先・連続・曲振・inst BGM）と退場処理は自動判定。
              <br />尺の合計はプログラム計算 — 暗算ミスは起きません。
            </div>
          </section>

          {/* --- 結果パネル --- */}
          <section>
            {!parsed ? (
              <div style={{ border: "1px dashed #262C3F", borderRadius: 12, padding: 48, textAlign: "center", color: "#5C6378", fontSize: 13 }}>
                左にセットリストを貼って「解析する」を押すと、
                <br />キッカケ・total・直近使用がここに出ます
              </div>
            ) : (
              <div className="fadein">
                {/* ==== タイムコード + フェーダー（シグネチャー） ==== */}
                <div style={{ background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, fontSize: 40, color: over ? "#F87171" : "#EDEFF5", letterSpacing: ".02em" }}>
                      {fmt(total)}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 16, color: "#5C6378" }}>/ {fmt(limitSec)}</span>
                    <span style={{
                      marginLeft: "auto", fontFamily: "'JetBrains Mono'", fontSize: 14, fontWeight: 700,
                      color: over ? "#F87171" : "#4ADE80",
                    }}>
                      {over ? `+${fmt(total - limitSec)} オーバー` : `残り ${fmt(limitSec - total)}`}
                    </span>
                  </div>
                  {/* フェーダー */}
                  <div style={{ marginTop: 12, height: 10, borderRadius: 99, background: "#12151E", overflow: "hidden", position: "relative" }}>
                    <div style={{
                      width: `${Math.min(ratio * 100, 100)}%`, height: "100%",
                      background: over ? "#F87171" : ratio > 0.93 ? "#FFB454" : "#4ADE80",
                      transition: "width .4s ease", borderRadius: 99,
                    }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#5C6378", display: "flex", justifyContent: "space-between" }}>
                    <span>{parsed.length} ブロック</span>
                    <span>{over ? "曲か MC の調整が必要です" : ratio > 0.93 ? "枠ギリギリ — 押しに注意" : "枠に収まっています"}</span>
                  </div>
                </div>

                {/* ==== セトリ表 ==== */}
                <div style={{ background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12, overflow: "hidden" }}>
                  {parsed.map((r, i) => {
                    const cs = CUE_STYLE[r.cue];
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                        borderBottom: i < parsed.length - 1 ? "1px solid #232941" : "none",
                      }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#5C6378", width: 22, textAlign: "right" }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: r.isMC ? 500 : 700, fontSize: 14, color: r.isMC ? "#AEB4C6" : "#EDEFF5" }}>
                            {r.title}
                            {r.exit && (
                              <span style={{ marginLeft: 10, fontSize: 11, color: "#FFB454", border: "1px solid rgba(255,180,84,.4)", borderRadius: 4, padding: "1px 6px" }}>
                                {r.exit}
                              </span>
                            )}
                          </div>
                          {r.catalogNote && (
                            <div style={{ fontSize: 11, color: "#FFB454", marginTop: 2 }}>
                              ⚠ カタログ表記: {r.catalogNote}
                            </div>
                          )}
                          {r.recent && (
                            <div style={{ fontSize: 11, color: "#8A91A6", marginTop: 2 }}>
                              <span style={{ color: "#F9A8D4" }}>●</span> 直近使用 — {r.recent.date} {r.recent.event}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                          background: cs.bg, color: cs.fg, border: `1px solid ${cs.bd}`, whiteSpace: "nowrap",
                        }}>{r.cue}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#AEB4C6", width: 44, textAlign: "right" }}>
                          {fmt(r.sec)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ==== アクション ==== */}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    onClick={() => ping("PDF出力はβで提供予定 — 書式テンプレートは運営ごとにカスタムできます")}
                    style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#FFB454", color: "#12151E", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}
                  >
                    PDFに出力
                  </button>
                  <button
                    onClick={() => ping("音源・歌割まとめ機能はβで提供予定 — Dropboxに1クリック共有")}
                    style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#AEB4C6", fontWeight: 500, fontSize: 13, cursor: "pointer" }}
                  >
                    音源・歌割をまとめる
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ================= タイムテーブルモード ================= */}
      {mode === "tt" && (
        <main style={{ display: "grid", gridTemplateColumns: "minmax(300px, 420px) 1fr", gap: 20, padding: 24, alignItems: "start" }}
          className="grid-main2">
          <style>{`@media (max-width: 860px){ .grid-main2 { grid-template-columns: 1fr !important; } }`}</style>

          <section style={{ background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#AEB4C6", marginBottom: 10 }}>
              出演リスト（グループ名 持ち時間）
            </div>
            <textarea
              value={ttRaw}
              onChange={(e) => setTtRaw(e.target.value)}
              placeholder={"1行に1組\n例）KOURiN 25\n　　アキストゼネコ 25"}
              rows={9}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F",
                borderRadius: 8, padding: 12, fontFamily: "'JetBrains Mono'", fontSize: 13, lineHeight: 1.7,
              }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#8A91A6" }}>START</label>
              <input value={ttStart} onChange={(e) => setTtStart(e.target.value)}
                style={{ width: 66, background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F", borderRadius: 6, padding: "6px 8px", fontFamily: "'JetBrains Mono'", fontSize: 14 }} />
              <label style={{ fontSize: 12, color: "#8A91A6" }}>転換</label>
              <input type="number" value={ttChange} onChange={(e) => setTtChange(Number(e.target.value))}
                style={{ width: 54, background: "#12151E", color: "#EDEFF5", border: "1px solid #262C3F", borderRadius: 6, padding: "6px 8px", fontFamily: "'JetBrains Mono'", fontSize: 14 }} />
              <span style={{ fontSize: 12, color: "#8A91A6" }}>分</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setTtRaw(SAMPLE_TT)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #262C3F", background: "transparent", color: "#8A91A6", fontSize: 12, cursor: "pointer" }}>
                サンプル読込
              </button>
              <button
                onClick={() => setTtRows(buildTimetable(ttRaw, ttStart, ttChange))}
                disabled={!ttRaw.trim()}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: ttRaw.trim() ? "#FFB454" : "#3A4157", color: "#12151E",
                  fontWeight: 700, fontSize: 13, cursor: ttRaw.trim() ? "pointer" : "not-allowed", fontFamily: "'Noto Sans JP'",
                }}>
                TTを組む
              </button>
            </div>
          </section>

          <section>
            {!ttRows ? (
              <div style={{ border: "1px dashed #262C3F", borderRadius: 12, padding: 48, textAlign: "center", color: "#5C6378", fontSize: 13 }}>
                出演リストを入れて「TTを組む」を押すと、
                <br />転換込みのタイムテーブルが自動で並びます
              </div>
            ) : (
              <div className="fadein">
                <div style={{ background: "#1C2130", border: "1px solid #262C3F", borderRadius: 12, overflow: "hidden" }}>
                  {ttRows.map((s, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 14, padding: s.type === "act" ? "13px 16px" : "7px 16px",
                      borderBottom: i < ttRows.length - 1 ? "1px solid #232941" : "none",
                      background: s.type === "change" ? "rgba(138,145,166,.05)" : "transparent",
                    }}>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: s.type === "act" ? "#FFB454" : "#5C6378", width: 104 }}>
                        {clock(s.from)} – {clock(s.to)}
                      </span>
                      <span style={{
                        flex: 1, fontWeight: s.type === "act" ? 700 : 400,
                        fontSize: s.type === "act" ? 14 : 12,
                        color: s.type === "act" ? "#EDEFF5" : "#5C6378",
                      }}>
                        {s.type === "act" ? `${s.no}. ${s.name}` : "転換"}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#8A91A6" }}>{s.min}分</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#8A91A6", display: "flex", justifyContent: "space-between" }}>
                  <span>終演 {clock(ttRows[ttRows.length - 1].to)}</span>
                  <button
                    onClick={() => ping("進行表PDF・スタッフ共有はβで提供予定")}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#FFB454", color: "#12151E", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                    進行表PDFに出力
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ===== トースト ===== */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#262C3F", border: "1px solid rgba(255,180,84,.4)", color: "#EDEFF5",
          padding: "12px 20px", borderRadius: 10, fontSize: 13, maxWidth: "88vw",
          boxShadow: "0 8px 32px rgba(0,0,0,.45)",
        }} className="fadein">
          {toast}
        </div>
      )}

      <footer style={{ padding: "28px 24px", fontSize: 11, color: "#3A4157", textAlign: "center", letterSpacing: ".05em" }}>
        SIDEKICK v0 demo — built on 1 year of real production data
      </footer>
    </div>
  );
}
