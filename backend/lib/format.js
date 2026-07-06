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

// ---- オーケストレータ連携（claude-management） ----
// status.json（オーケストレータが毎ループ書くローカルファイル）を整形して
// ドロップダウン節にする。優先度変更はローカルCLI実行（API・トークン不要）。
// opts: { python, tasksDir } — クリックアクション用の絶対パス。
export function orchStatusFresh(status, now = Date.now(), maxAgeMs = 120000) {
  return !!(status && status.now && now - status.now * 1000 < maxAgeMs);
}

function fmtEpoch(sec) {
  if (sec == null) return "なし";
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
}

function priorityActions(taskId, opts) {
  const act = (label, n) =>
    `-- ${label} | bash=${opts.python} param1=-m param2=orchestrator.intake ` +
    `param3=priority param4=${taskId} param5=${n} param6=${opts.tasksDir} ` +
    `terminal=false refresh=true`;
  return [
    act("🔝 最優先にする（締切より先に実行）", 0),
    act("⬆️ 優先度高（50）", 50),
    act("➖ 標準（100）", 100),
    act("⬇️ 優先度低（200）", 200),
  ];
}

export function orchestratorRows(status, now = Date.now(), opts = null) {
  const rows = ["---"];
  if (!status) {
    rows.push("🤖 オーケストレータ  状態不明（status.json なし）");
    return rows;
  }
  if (!orchStatusFresh(status, now)) {
    const ageMin = status.now ? Math.round((now - status.now * 1000) / 60000) : null;
    rows.push(`🤖 オーケストレータ  ⚠️ 停止中?（最終更新 ${ageMin ?? "?"}分前）`);
    return rows;
  }
  rows.push("🤖 オーケストレータ  稼働中");
  if (status.running) {
    rows.push(`▶️ 実行中: ${status.running.task_id}`);
  }
  const queue = status.queue || [];
  if (queue.length === 0 && !status.running) {
    rows.push("キュー: なし");
  }
  for (const q of queue) {
    const prio = q.priority ?? 100;
    const mark = prio <= 0 ? "🔝" : prio !== 100 ? `優先度${prio} ` : "";
    rows.push(`⏳ ${q.task_id}（${mark}締切 ${fmtEpoch(q.deadline)}）`);
    if (opts) rows.push(...priorityActions(q.task_id, opts));
  }
  for (const c of status.needs_clarification || []) {
    rows.push(`❓ 要確認: ${c}（Slackスレッドで締切を返信）`);
  }
  return rows;
}
