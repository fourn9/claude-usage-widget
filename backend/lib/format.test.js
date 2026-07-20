import { test, expect } from "bun:test";
import {
  remainingHours,
  countdown,
  clockHM,
  resetClock,
  staleLabel,
  menuBarTitle,
  dropdownRows,
  bar,
  levelColor,
  mono,
} from "./format.js";

// テストは now を固定し、resets_at を now からの相対で生成して時刻依存を排除する。
const NOW = Date.parse("2026-06-28T11:13:17.547Z");
const inHours = (h) => new Date(NOW + h * 3600000).toISOString();
const inMin = (m) => new Date(NOW + m * 60000).toISOString();

// SwiftBar パラメータを落として表示テキストだけ取り出す
const text = (row) => row.split(" | ")[0];
const texts = (rows) => rows.map(text);

// --- remainingHours: 小数1桁の時間文字列 ---
test("remainingHours: 2時間13分は 2.2h", () => {
  expect(remainingHours(inMin(133), NOW)).toBe("2.2h");
});
test("remainingHours: 13分は 0.2h（単位は h のまま）", () => {
  expect(remainingHours(inMin(13), NOW)).toBe("0.2h");
});
test("remainingHours: リセット済み（過去）は 0.0h", () => {
  expect(remainingHours(inHours(-1), NOW)).toBe("0.0h");
});
test("remainingHours: 不正/欠落は ?", () => {
  expect(remainingHours(null, NOW)).toBe("?");
  expect(remainingHours("garbage", NOW)).toBe("?");
});

// --- countdown: "Hh Mm left" ---
test("countdown: 2時間13分は '2h 13m left'", () => {
  expect(countdown(inMin(133), NOW)).toBe("2h 13m left");
});
test("countdown: 1時間未満は分のみ", () => {
  expect(countdown(inMin(45), NOW)).toBe("45m left");
});
test("countdown: 過去は resetting soon", () => {
  expect(countdown(inMin(-5), NOW)).toBe("resetting soon");
});
test("countdown: 欠落は —", () => {
  expect(countdown(null, NOW)).toBe("—");
});

// --- clockHM / resetClock: ローカル時刻の整形（TZ非依存に自前Dateで生成） ---
test("clockHM: ローカルの H:MM", () => {
  const local = new Date(2026, 6, 3, 22, 5); // 7/3 22:05 ローカル
  expect(clockHM(local.toISOString())).toBe("22:05");
});
test("resetClock: 'resets Www M/D H:MM'", () => {
  const local = new Date(2026, 6, 3, 22, 0); // 2026/7/3 22:00 ローカル
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][local.getDay()];
  expect(resetClock(local.toISOString())).toBe(`resets ${wd} 7/3 22:00`);
});
test("resetClock: 欠落は —", () => {
  expect(resetClock(null)).toBe("—");
});

// --- bar / levelColor / mono: 見た目の部品 ---
test("bar: 使用率に応じてブロックを塗る（幅は固定）", () => {
  expect(bar(0)).toBe("░░░░░░░░░░");
  expect(bar(35)).toBe("▓▓▓▓░░░░░░");
  expect(bar(100)).toBe("▓▓▓▓▓▓▓▓▓▓");
});
test("bar: 0%超は必ず1マス塗る（空に見えない）", () => {
  expect(bar(1)).toBe("▓░░░░░░░░░");
  expect(bar(0.4)).toBe("▓░░░░░░░░░");
});
test("bar: 範囲外・不正値でも幅を保つ", () => {
  expect(bar(-10).length).toBe(10);
  expect(bar(999)).toBe("▓▓▓▓▓▓▓▓▓▓");
  expect(bar(null).length).toBe(10);
});
test("levelColor: 70% / 90% を境に警戒色へ", () => {
  expect(levelColor(10)).toBe(levelColor(69));
  expect(levelColor(75)).not.toBe(levelColor(10));
  expect(levelColor(95)).not.toBe(levelColor(75));
});
test("mono: 等幅フォント指定を付ける", () => {
  expect(mono("x")).toBe("x | font=Menlo size=13");
  expect(mono("x", "color=red")).toBe("x | font=Menlo size=13 color=red");
});

// --- staleLabel: 429 とそれ以外 ---
test("staleLabel: 429 は rate limited", () => {
  expect(staleLabel({ error: "rate_limited(429)" })).toContain("429");
});
test("staleLabel: それ以外は refreshing", () => {
  expect(staleLabel({ error: null })).toBe("refreshing…");
});

// --- menuBarTitle: セッション% -残りh ---
test("menuBarTitle: セッションがあれば '3% -2.2h'", () => {
  const d = { session: { pct: 3, resets_at: inMin(133) }, weekly: { pct: 6, resets_at: inHours(50) } };
  expect(menuBarTitle(d, NOW)).toBe("3% -2.2h");
});
test("menuBarTitle: pct は四捨五入", () => {
  const d = { session: { pct: 2.6, resets_at: inMin(133) } };
  expect(menuBarTitle(d, NOW)).toBe("3% -2.2h");
});
test("menuBarTitle: データ無しは 'Claude …'", () => {
  expect(menuBarTitle({ session: null, weekly: null }, NOW)).toBe("Claude …");
});

// --- dropdownRows: 行の増減と整形 ---
test("dropdownRows: session+weekly のみ", () => {
  const d = {
    stale: false,
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
    weekly_sonnet: null,
    weekly_opus: null,
  };
  const t = texts(dropdownRows(d, NOW));
  expect(t).toContain("Session" + " ".repeat(13) + "  3%");
  expect(t).toContain("Weekly · All" + " ".repeat(8) + "  6%");
  expect(t.some((r) => r.startsWith("Weekly · Sonnet"))).toBe(false);
  expect(t.some((r) => r.startsWith("Weekly · Opus"))).toBe(false);
  expect(t.some((r) => r.startsWith("⟳"))).toBe(false);
});
test("dropdownRows: セッション行にゲージと残り時間が出る", () => {
  const d = { stale: false, session: { pct: 3, resets_at: inMin(133) }, weekly: null };
  const t = texts(dropdownRows(d, NOW));
  const gauge = t.find((r) => r.startsWith("▓") || r.startsWith("░"));
  expect(gauge).toContain("2h 13m left");
  expect(gauge).toContain("· resets ");
});
test("dropdownRows: 各行に等幅フォント指定が付く", () => {
  const d = { stale: false, session: { pct: 3, resets_at: inMin(133) }, weekly: null };
  for (const row of dropdownRows(d, NOW)) {
    if (row === "---") continue;
    expect(row).toContain("font=Menlo");
  }
});
test("dropdownRows: 使用率が高いゲージ行は警戒色になる", () => {
  const low = dropdownRows({ session: { pct: 3, resets_at: inMin(133) } }, NOW);
  const high = dropdownRows({ session: { pct: 95, resets_at: inMin(133) } }, NOW);
  expect(low[1]).toContain(`color=${levelColor(3)}`);
  expect(high[1]).toContain(`color=${levelColor(95)}`);
});
test("dropdownRows: sonnet/opus があれば行が増える", () => {
  const d = {
    stale: false,
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
    weekly_sonnet: { pct: 0, resets_at: inHours(50) },
    weekly_opus: { pct: 12, resets_at: inHours(50) },
  };
  const t = texts(dropdownRows(d, NOW));
  expect(t.some((r) => r.startsWith("Weekly · Sonnet") && r.endsWith("0%"))).toBe(true);
  expect(t.some((r) => r.startsWith("Weekly · Opus") && r.endsWith("12%"))).toBe(true);
});
test("dropdownRows: stale なら ⟳ 行が出る", () => {
  const d = {
    stale: true,
    error: "rate_limited(429)",
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
  };
  const t = texts(dropdownRows(d, NOW));
  expect(t.some((r) => r.startsWith("⟳") && r.includes("429"))).toBe(true);
});
test("dropdownRows: データ無しは取得待ち1行", () => {
  const d = { stale: false, error: null, session: null, weekly: null };
  const rows = dropdownRows(d, NOW);
  expect(rows.length).toBe(1);
  expect(text(rows[0])).toContain("Waiting for data");
});

// ---- orchestratorRows ----
import { orchestratorRows, orchStatusFresh } from "./format.js";

test("orchestratorRows: 稼働中はキュー・実行中・要確認と優先度アクションを出す", () => {
  const now = Date.now();
  const st = {
    now: now / 1000 - 30,
    running: { task_id: "r1" },
    queue: [{ task_id: "q1", deadline: now / 1000 + 3600, priority: 0 }],
    needs_clarification: ["c1"],
  };
  const rows = orchestratorRows(st, now, { python: "/x/py", tasksDir: "/x/t" });
  const joined = rows.join("\n");
  expect(joined).toContain("Orchestrator");
  expect(joined).toContain("running");
  expect(joined).toContain("▶︎ r1");
  expect(joined).toContain("🔝");
  expect(joined).toContain("param3=priority param4=q1 param5=0");
  expect(joined).toContain("❓ c1");
});

test("orchestratorRows: statusが無い/古いときは実行アクションを出さない", () => {
  const now = Date.now();
  expect(orchestratorRows(null, now).join("\n")).toContain("unknown");
  const stale = orchestratorRows({ now: now / 1000 - 600, queue: [{ task_id: "q" }] }, now);
  expect(stale.join("\n")).toContain("stopped?");
  expect(stale.join("\n")).not.toContain("bash=");
});

test("orchStatusFresh: 120秒閾値", () => {
  const now = Date.now();
  expect(orchStatusFresh({ now: now / 1000 - 60 }, now)).toBe(true);
  expect(orchStatusFresh({ now: now / 1000 - 300 }, now)).toBe(false);
  expect(orchStatusFresh(null, now)).toBe(false);
});
