// Claude Code 使用状況ウィジェット (Übersicht)
// 画面右上に「現在のセッション」「週間制限」の使用率%とリセットまでの時間を常時表示する。
// データ取得は ~/.claude-usage-widget/fetch-usage.ts が担当（5分スロットリング + 429バックオフ）。
// このウィジェットは取得済みの値を読み、リセットまでのカウントダウンはローカルで毎回再計算する。

// install.sh が __BUN_BIN__ → bun の絶対パス、__WIDGET_HOME__ → ~/.claude-usage-widget に置換する。
// 手動で配置する場合は両プレースホルダを実際の絶対パスに書き換えること。
// 例: "/Users/you/.bun/bin/bun run /Users/you/.claude-usage-widget/fetch-usage.ts"
export const command =
  "__BUN_BIN__ run __WIDGET_HOME__/fetch-usage.ts";

// 画面表示は30秒ごとに更新（API実体取得はフェッチャ側が5分に間引く）
export const refreshFrequency = 30000;

// ラッパは原点に固定。実パネルは render 内で position:fixed により配置する
export const className = `
  top: 0;
  left: 0;
  font-family: -apple-system, "Helvetica Neue", "Hiragino Sans", sans-serif;
  color: #e8e8ea;
  z-index: 9999;
`;

// --- 位置ロジック（lib/geometry.js のミラー。変更時は両方を同期し lib 側でテスト） ---
const PANEL_WIDTH = 320;
const MARGIN = 8; // 上端からのマージン(px)
const MARGIN_RIGHT = 8; // 右端からのマージン(px)
const DEFAULT_PANEL_HEIGHT = 120;
const POS_KEY = "claude-usage-pos";
const PANEL_ID = "claude-usage-panel";

// 初期位置（右上）。上=MARGIN, 右=MARGIN_RIGHT の非対称マージン
function initialPos(screenW, panelW = PANEL_WIDTH) {
  return { x: Math.max(0, screenW - panelW - MARGIN_RIGHT), y: MARGIN };
}

function clampPos(x, y, panelW, panelH, screenW, screenH, margin = 0) {
  const maxX = Math.max(margin, screenW - panelW - margin);
  const maxY = Math.max(margin, screenH - panelH - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

function serializePos(pos) {
  return JSON.stringify({ x: pos.x, y: pos.y });
}

function parsePos(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.x === "number" && typeof o.y === "number") {
      return { x: o.x, y: o.y };
    }
  } catch {}
  return null;
}

// 現在位置のモジュールキャッシュ。30秒ごとの再描画で失わないため module スコープで保持。
let pos = null;

function loadPos() {
  if (pos) return pos;
  try {
    const saved = parsePos(window.localStorage.getItem(POS_KEY));
    pos = saved || initialPos(window.innerWidth);
  } catch {
    pos = initialPos(window.innerWidth);
  }
  // 表示時クランプ: 画面サイズ変更・別ディスプレイ・不正な保存値でも必ず画面内に収める
  // （ドラッグ中だけでなくロード時も補正し、ハンドルに触れず復帰不能になるのを防ぐ）
  // MARGIN 付きで端ぴったりに張り付かないようにする
  pos = clampPos(
    pos.x,
    pos.y,
    PANEL_WIDTH,
    DEFAULT_PANEL_HEIGHT,
    window.innerWidth,
    window.innerHeight,
    MARGIN,
  );
  return pos;
}

function savePos() {
  try {
    window.localStorage.setItem(POS_KEY, serializePos(pos));
  } catch {}
}

function applyPos() {
  const el = document.getElementById(PANEL_ID);
  if (el) {
    el.style.left = pos.x + "px";
    el.style.top = pos.y + "px";
  }
}

let dragging = false;
let offsetX = 0;
let offsetY = 0;

function onDragMove(e) {
  if (!dragging) return;
  const el = document.getElementById(PANEL_ID);
  const panelW = el ? el.offsetWidth : PANEL_WIDTH;
  const panelH = el ? el.offsetHeight : DEFAULT_PANEL_HEIGHT;
  pos = clampPos(
    e.clientX - offsetX,
    e.clientY - offsetY,
    panelW,
    panelH,
    window.innerWidth,
    window.innerHeight,
    MARGIN,
  );
  applyPos();
}

function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  savePos();
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
}

function onHandleMouseDown(e) {
  e.preventDefault();
  loadPos();
  const el = document.getElementById(PANEL_ID);
  const rect = el ? el.getBoundingClientRect() : { left: pos.x, top: pos.y };
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
  dragging = true;
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
}

function resetPos(e) {
  if (e) e.preventDefault();
  try {
    window.localStorage.removeItem(POS_KEY);
  } catch {}
  pos = initialPos(window.innerWidth);
  applyPos();
}
// --- /位置ロジック ---

const WARN = 80; // この%以上で橙
const DANGER = 95; // この%以上で赤

function barColor(pct) {
  if (pct >= DANGER) return "#ff5a52";
  if (pct >= WARN) return "#ffae42";
  return "#4a8cff";
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// セッション向け: あと何時間何分か
function countdown(resetsAt) {
  if (!resetsAt) return "—";
  const diff = Date.parse(resetsAt) - Date.now();
  if (isNaN(diff)) return "—";
  if (diff <= 0) return "まもなくリセット";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `あと ${h}時間${m}分`;
  return `あと ${m}分`;
}

// 週間向け: 何曜日の何時にリセットか（JST絶対時刻）
function resetClock(resetsAt) {
  if (!resetsAt) return "—";
  const d = new Date(resetsAt);
  if (isNaN(d.getTime())) return "—";
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${pad(d.getMinutes())} リセット`;
}

function Row({ label, slot, sub, last }) {
  const pct = slot ? Math.round(slot.pct) : 0;
  return (
    <div style={{ marginBottom: last ? 0 : 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
          {slot ? `${pct}%` : "—"}
        </span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 2.5,
          background: "rgba(255,255,255,0.14)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            background: barColor(pct),
            borderRadius: 2.5,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export const render = ({ output }) => {
  let d = null;
  try {
    d = JSON.parse(output);
  } catch (e) {
    d = null;
  }

  const p = loadPos();
  const shellStyle = {
    position: "fixed",
    left: p.x + "px",
    top: p.y + "px",
    width: 320,
    boxSizing: "border-box", // padding/border を幅に含める。位置計算の PANEL_WIDTH(320) と実幅を一致させ右端のはみ出しを防ぐ
    background: "rgba(28,28,30,0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "8px 12px",
    boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
  };

  // ヘッダをドラッグハンドル兼リセット操作にする
  const handleProps = {
    onMouseDown: onHandleMouseDown,
    onDoubleClick: resetPos,
  };
  const handleCursor = { cursor: "move" };

  if (!d) {
    return (
      <div id={PANEL_ID} style={shellStyle}>
        <div {...handleProps} style={{ fontSize: 12, opacity: 0.7, ...handleCursor }}>
          Claude 使用状況: 読み込み中…
        </div>
      </div>
    );
  }

  // データが一度も取れていない（認証待ち等）
  const noData = !d.session && !d.weekly;
  if (noData) {
    return (
      <div id={PANEL_ID} style={shellStyle}>
        <div
          {...handleProps}
          style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, ...handleCursor }}
        >
          Claude 使用状況
        </div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          データ取得待ち {d.error ? `(${d.error})` : ""}
          <br />
          Claude Code が起動中か確認してください
        </div>
      </div>
    );
  }

  return (
    <div id={PANEL_ID} style={shellStyle}>
      <div
        {...handleProps}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          ...handleCursor,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: 0.4 }}>
          CLAUDE 使用状況
        </span>
        {d.stale && (
          <span style={{ fontSize: 10, opacity: 0.5 }}>
            ⟳ {d.error === "rate_limited(429)" ? "待機中" : "更新待ち"}
          </span>
        )}
      </div>

      <Row label="現在のセッション" slot={d.session} sub={countdown(d.session && d.session.resets_at)} />
      <Row
        label="週間制限（全体）"
        slot={d.weekly}
        sub={resetClock(d.weekly && d.weekly.resets_at)}
        last={!d.weekly_opus}
      />

      {d.weekly_opus && (
        <Row label="週間 Opus" slot={d.weekly_opus} sub={resetClock(d.weekly_opus.resets_at)} last />
      )}
    </div>
  );
};
