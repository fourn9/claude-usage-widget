// Claude 使用状況の表示整形（純粋ロジック）。
// fetch-usage.ts が出力する usage JSON を受け取り、
//   - メニューバー1行（menuBarTitle / menuBarColor）
//   - ドロップダウンの情報行（dropdownRows）
// に整形する。副作用なし。SwiftBar 記法の組み立て（| color= 等）と
// アクション行（更新・リンク）はプラグイン側（swiftbar/claude-usage.30s.ts）の責務。

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// リセットまでを小数1桁の時間文字列に（例: 2時間13分→"2.2h"、13分→"0.2h"）。
// 過去/0は "0.0h"、欠落/不正は "?"。
export function remainingHours(resetsAt, now = Date.now()) {
  if (!resetsAt) return "?";
  const t = Date.parse(resetsAt);
  if (isNaN(t)) return "?";
  const diff = t - now;
  const h = diff <= 0 ? 0 : diff / 3600000;
  return h.toFixed(1) + "h";
}

// セッション向け: あと何時間何分か
export function countdown(resetsAt, now = Date.now()) {
  if (!resetsAt) return "—";
  const diff = Date.parse(resetsAt) - now;
  if (isNaN(diff)) return "—";
  if (diff <= 0) return "まもなくリセット";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `あと ${h}時間${m}分`;
  return `あと ${m}分`;
}

// ローカル時刻の H:MM
export function clockHM(resetsAt) {
  if (!resetsAt) return "—";
  const d = new Date(resetsAt);
  if (isNaN(d.getTime())) return "—";
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

// 週間向け: 何曜日の何時にリセットか（ローカル絶対時刻）
export function resetClock(resetsAt) {
  if (!resetsAt) return "—";
  const d = new Date(resetsAt);
  if (isNaN(d.getTime())) return "—";
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${pad(d.getMinutes())} リセット`;
}

// stale 時のラベル
export function staleLabel(d) {
  return d && d.error === "rate_limited(429)" ? "429待機中" : "更新待ち";
}

// メニューバー常時表示の主スロット（セッション優先、無ければ週間、どちらも無ければ null）
function primarySlot(d) {
  if (d && d.session) return d.session;
  if (d && d.weekly) return d.weekly;
  return null;
}

// メニューバー1行: "3% -2.2h"。データ未取得は "Claude …"
export function menuBarTitle(d, now = Date.now()) {
  const slot = primarySlot(d);
  if (!slot) return "Claude …";
  const pct = Math.round(slot.pct);
  const rest = slot.resets_at ? ` -${remainingHours(slot.resets_at, now)}` : "";
  return `${pct}%${rest}`;
}

// ドロップダウンの情報行。区切りは "---"（プラグインが SwiftBar の区切りに変換）。
// アクション行（更新・リンク）はプラグインが付加する。
export function dropdownRows(d, now = Date.now()) {
  if (!d || (!d.session && !d.weekly)) {
    const reason = d && d.error ? `（${d.error}）` : "";
    return [`データ取得待ち${reason} — Claude Code が起動中か確認してください`];
  }

  const rows = [];

  if (d.session) {
    rows.push(`現在のセッション  ${Math.round(d.session.pct)}%`);
    const cd = countdown(d.session.resets_at, now);
    const at = d.session.resets_at ? `（${clockHM(d.session.resets_at)} リセット）` : "";
    rows.push(`${cd}${at}`);
  }

  if (d.weekly) {
    rows.push("---");
    rows.push(`週間制限（全体）  ${Math.round(d.weekly.pct)}%`);
    rows.push(resetClock(d.weekly.resets_at));
  }

  if (d.weekly_sonnet) {
    rows.push(`週間 Sonnet  ${Math.round(d.weekly_sonnet.pct)}%`);
  }
  if (d.weekly_opus) {
    rows.push(`週間 Opus  ${Math.round(d.weekly_opus.pct)}%`);
  }

  if (d.stale) {
    rows.push("---");
    rows.push(`⟳ ${staleLabel(d)}`);
  }

  return rows;
}
