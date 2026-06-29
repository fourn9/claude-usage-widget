import { test, expect } from "bun:test";
import {
  WARN,
  DANGER,
  remainingHours,
  countdown,
  clockHM,
  resetClock,
  staleLabel,
  menuBarTitle,
  menuBarColor,
  dropdownRows,
} from "./format.js";

// テストは now を固定し、resets_at を now からの相対で生成して時刻依存を排除する。
const NOW = Date.parse("2026-06-28T11:13:17.547Z");
const inHours = (h) => new Date(NOW + h * 3600000).toISOString();
const inMin = (m) => new Date(NOW + m * 60000).toISOString();

test("WARN/DANGER の定数", () => {
  expect(WARN).toBe(80);
  expect(DANGER).toBe(95);
});

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

// --- countdown: あと H時間M分 ---
test("countdown: 2時間13分", () => {
  expect(countdown(inMin(133), NOW)).toBe("あと 2時間13分");
});
test("countdown: 1時間未満は分のみ", () => {
  expect(countdown(inMin(45), NOW)).toBe("あと 45分");
});
test("countdown: 過去はまもなくリセット", () => {
  expect(countdown(inMin(-5), NOW)).toBe("まもなくリセット");
});
test("countdown: 欠落は —", () => {
  expect(countdown(null, NOW)).toBe("—");
});

// --- clockHM / resetClock: ローカル時刻の整形（TZ非依存に自前Dateで生成） ---
test("clockHM: ローカルの H:MM", () => {
  const local = new Date(2026, 6, 3, 22, 5); // 7/3 22:05 ローカル
  expect(clockHM(local.toISOString())).toBe("22:05");
});
test("resetClock: M/D(曜) H:MM リセット", () => {
  const local = new Date(2026, 6, 3, 22, 0); // 2026/7/3(金) 22:00 ローカル
  const wd = ["日", "月", "火", "水", "木", "金", "土"][local.getDay()];
  expect(resetClock(local.toISOString())).toBe(`7/3(${wd}) 22:00 リセット`);
});
test("resetClock: 欠落は —", () => {
  expect(resetClock(null)).toBe("—");
});

// --- staleLabel: 429 とそれ以外 ---
test("staleLabel: 429 は待機中", () => {
  expect(staleLabel({ error: "rate_limited(429)" })).toBe("429待機中");
});
test("staleLabel: それ以外は更新待ち", () => {
  expect(staleLabel({ error: null })).toBe("更新待ち");
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

// --- menuBarColor: 基本は白、上限が近いときだけ警告色 ---
test("menuBarColor: 通常は白", () => {
  expect(menuBarColor({ session: { pct: 3 } })).toBe("white");
  expect(menuBarColor({ session: { pct: 79 } })).toBe("white");
});
test("menuBarColor: >=80% は橙、>=95% は赤", () => {
  expect(menuBarColor({ session: { pct: 80 } })).toBe("#ffae42");
  expect(menuBarColor({ session: { pct: 96 } })).toBe("#ff5a52");
});
test("menuBarColor: データ無しも白", () => {
  expect(menuBarColor({ session: null, weekly: null })).toBe("white");
});

// --- dropdownRows: 行の増減 ---
test("dropdownRows: session+weekly のみ", () => {
  const d = {
    stale: false,
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
    weekly_sonnet: null,
    weekly_opus: null,
  };
  const rows = dropdownRows(d, NOW);
  expect(rows).toContain("現在のセッション  3%");
  expect(rows).toContain("週間制限（全体）  6%");
  expect(rows.some((r) => r.startsWith("週間 Sonnet"))).toBe(false);
  expect(rows.some((r) => r.startsWith("週間 Opus"))).toBe(false);
  expect(rows.some((r) => r.startsWith("⟳"))).toBe(false);
});
test("dropdownRows: sonnet/opus があれば行が増える", () => {
  const d = {
    stale: false,
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
    weekly_sonnet: { pct: 0, resets_at: inHours(50) },
    weekly_opus: { pct: 12, resets_at: inHours(50) },
  };
  const rows = dropdownRows(d, NOW);
  expect(rows).toContain("週間 Sonnet  0%");
  expect(rows).toContain("週間 Opus  12%");
});
test("dropdownRows: stale なら ⟳ 行が出る", () => {
  const d = {
    stale: true,
    error: "rate_limited(429)",
    session: { pct: 3, resets_at: inMin(133) },
    weekly: { pct: 6, resets_at: inHours(50) },
  };
  const rows = dropdownRows(d, NOW);
  expect(rows.some((r) => r === "⟳ 429待機中")).toBe(true);
});
test("dropdownRows: データ無しは取得待ち1行", () => {
  const d = { stale: false, error: null, session: null, weekly: null };
  const rows = dropdownRows(d, NOW);
  expect(rows.length).toBe(1);
  expect(rows[0]).toContain("データ取得待ち");
});
