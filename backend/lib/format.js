// Claude 使用状況の表示整形（純粋ロジック）。
// fetch-usage.ts が出力する usage JSON を受け取り、
//   - メニューバー1行（menuBarTitle）
//   - ドロップダウンの情報行（dropdownRows）
// に整形する。副作用なし。表示文言はすべて英語。
// 行内の SwiftBar パラメータ（| font= / color= 等）は「見た目の一部」としてここで付ける。
// アクション行（更新・リンク）はプラグイン側（swiftbar/claude-usage.30s.ts）の責務。

const BAR_WIDTH = 10;
const LABEL_WIDTH = 20; // ラベル列の幅（等幅フォント前提で桁を揃える）
const PCT_WIDTH = 4; // "100%" が入る幅

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// 等幅フォント指定。ラベル/％/ゲージの桁揃えはこの指定が前提。
export function mono(text, extra = "") {
  return `${text} | font=Menlo size=13${extra ? " " + extra : ""}`;
}

// 使用率のブロックゲージ（例: 35% → "▓▓▓▓░░░░░░"）。
// 0% 以外は必ず1マス塗る（1% が「空＝未使用」に見えるのを防ぐ）。
export function bar(pct, width = BAR_WIDTH) {
  const p = typeof pct === "number" && isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const raw = Math.round((p / 100) * width);
  const filled = Math.min(width, p > 0 ? Math.max(1, raw) : 0);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

// 使用率に応じた行の色（残量が少ないほど警戒色）。SwiftBar は light,dark の2色指定が可能。
export function levelColor(pct) {
  const p = typeof pct === "number" && isFinite(pct) ? pct : 0;
  if (p >= 90) return "#d13438,#ff6b6f";
  if (p >= 70) return "#b26a00,#ffb454";
  return "#3a7d44,#6fcf7f";
}

// "Session" などのラベルと％を1行に揃える（例: "Session                1%"）。
function labelRow(label, pct) {
  const p = `${Math.round(pct)}%`;
  return label.padEnd(LABEL_WIDTH) + p.padStart(PCT_WIDTH);
}

// ゲージ行（ゲージ＋補足テキスト）。使用率に応じて色を付ける。
function gaugeRow(pct, note) {
  return mono(`${bar(pct)}  ${note}`, `color=${levelColor(pct)}`);
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

// セッション向け: あと何時間何分か（英語表記）
export function countdown(resetsAt, now = Date.now()) {
  if (!resetsAt) return "—";
  const diff = Date.parse(resetsAt) - now;
  if (isNaN(diff)) return "—";
  if (diff <= 0) return "resetting soon";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

// ローカル時刻の H:MM
export function clockHM(resetsAt) {
  if (!resetsAt) return "—";
  const d = new Date(resetsAt);
  if (isNaN(d.getTime())) return "—";
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

// 週間向け: 何曜日の何時にリセットか（ローカル絶対時刻・英語表記）
export function resetClock(resetsAt) {
  if (!resetsAt) return "—";
  const d = new Date(resetsAt);
  if (isNaN(d.getTime())) return "—";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `resets ${wd} ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
}

// stale 時のラベル
export function staleLabel(d) {
  return d && d.error === "rate_limited(429)" ? "rate limited (429) — retrying later" : "refreshing…";
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
    const reason = d && d.error ? ` (${d.error})` : "";
    return [mono(`Waiting for data${reason} — make sure Claude Code is signed in`)];
  }

  const rows = [];

  if (d.session) {
    const pct = d.session.pct;
    rows.push(mono(labelRow("Session", pct)));
    const at = d.session.resets_at ? ` · resets ${clockHM(d.session.resets_at)}` : "";
    rows.push(gaugeRow(pct, `${countdown(d.session.resets_at, now)}${at}`));
  }

  if (d.weekly) {
    rows.push("---");
    rows.push(mono(labelRow("Weekly · All", d.weekly.pct)));
    rows.push(gaugeRow(d.weekly.pct, resetClock(d.weekly.resets_at)));
  }

  if (d.weekly_sonnet) {
    rows.push(mono(labelRow("Weekly · Sonnet", d.weekly_sonnet.pct)));
  }
  if (d.weekly_opus) {
    rows.push(mono(labelRow("Weekly · Opus", d.weekly_opus.pct)));
  }

  if (d.stale) {
    rows.push("---");
    rows.push(mono(`⟳ ${staleLabel(d)}`, "color=#8a8a8a,#a0a0a0"));
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
  if (sec == null) return "none";
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
}

function priorityActions(taskId, opts) {
  const act = (label, n) =>
    `-- ${label} | bash=${opts.python} param1=-m param2=orchestrator.intake ` +
    `param3=priority param4=${taskId} param5=${n} param6=${opts.tasksDir} ` +
    `terminal=false refresh=true`;
  return [
    act("🔝 Top priority (run before deadline)", 0),
    act("⬆️ High (50)", 50),
    act("➖ Normal (100)", 100),
    act("⬇️ Low (200)", 200),
  ];
}

export function orchestratorRows(status, now = Date.now(), opts = null) {
  const rows = ["---"];
  if (!status) {
    rows.push(mono("Orchestrator".padEnd(LABEL_WIDTH) + "unknown", "color=#8a8a8a,#a0a0a0"));
    return rows;
  }
  if (!orchStatusFresh(status, now)) {
    const ageMin = status.now ? Math.round((now - status.now * 1000) / 60000) : null;
    rows.push(
      mono("Orchestrator".padEnd(LABEL_WIDTH) + "stopped?", "color=#b26a00,#ffb454"),
    );
    rows.push(mono(`last update ${ageMin ?? "?"}m ago`, "size=11 color=#8a8a8a,#a0a0a0"));
    return rows;
  }
  rows.push(mono("Orchestrator".padEnd(LABEL_WIDTH) + "running", "color=#3a7d44,#6fcf7f"));
  if (status.running) {
    rows.push(mono(`▶︎ ${status.running.task_id}`));
  }
  const queue = status.queue || [];
  if (queue.length === 0 && !status.running) {
    rows.push(mono("queue empty", "size=11 color=#8a8a8a,#a0a0a0"));
  }
  for (const q of queue) {
    const prio = q.priority ?? 100;
    const mark = prio <= 0 ? "🔝 " : prio !== 100 ? `p${prio} ` : "";
    rows.push(mono(`⏳ ${mark}${q.task_id} · due ${fmtEpoch(q.deadline)}`));
    if (opts) rows.push(...priorityActions(q.task_id, opts));
  }
  for (const c of status.needs_clarification || []) {
    rows.push(mono(`❓ ${c} — reply with a deadline in the Slack thread`));
  }
  return rows;
}
