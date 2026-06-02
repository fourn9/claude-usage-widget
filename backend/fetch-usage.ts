#!/usr/bin/env bun
/**
 * Claude Code 使用量フェッチャー (Übersicht widget backend)
 *
 * - macOS Keychain の "Claude Code-credentials" から OAuth トークンを読む（トークンは絶対に出力しない）
 * - 非公式エンドポイント GET https://api.anthropic.com/api/oauth/usage を叩く
 * - レート制限(429)を踏まないよう自前でスロットリング:
 *     通常は 5 分に 1 回だけ実体取得。429 を踏んだら次回まで 15 分空ける。
 * - 取得結果を usage.json にキャッシュし、stdout にも同じ JSON を出力（Übersicht が読む）
 * - エラー時は直近の良い値を stale フラグ付きで返す
 *
 * 出力 JSON 形:
 * {
 *   ok: boolean,
 *   stale: boolean,            // 直近取得に失敗し古い値を表示中
 *   error: string | null,
 *   fetched_at: string,        // ISO, 実体取得に成功した最後の時刻
 *   session:  { pct: number, resets_at: string|null } | null,
 *   weekly:   { pct: number, resets_at: string|null } | null,
 *   weekly_opus:   { pct: number, resets_at: string|null } | null,
 *   weekly_sonnet: { pct: number, resets_at: string|null } | null
 * }
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE = join(homedir(), ".claude-usage-widget", "usage.json");
const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const OK_INTERVAL_MS = 5 * 60 * 1000; // 通常: 5分に1回
const BACKOFF_MS = 15 * 60 * 1000; // 429後: 15分空ける

type Slot = { pct: number; resets_at: string | null } | null;
type Cache = {
  ok: boolean;
  stale: boolean;
  error: string | null;
  fetched_at: string | null;
  next_fetch_after: string | null;
  session: Slot;
  weekly: Slot;
  weekly_opus: Slot;
  weekly_sonnet: Slot;
};

function loadCache(): Cache | null {
  try {
    if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {}
  return null;
}

function emit(c: Cache) {
  const out = JSON.stringify(c);
  try {
    writeFileSync(CACHE, out);
  } catch {}
  process.stdout.write(out);
}

function readToken(): string {
  // 特定の1項目だけを読む。値は文字列としてのみ扱い、決して出力しない。
  const raw = execFileSync(
    "security",
    ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
    { encoding: "utf8" },
  );
  const json = JSON.parse(raw);
  const tok = json?.claudeAiOauth?.accessToken ?? json?.accessToken;
  if (!tok || typeof tok !== "string") throw new Error("no_access_token");
  return tok;
}

function slot(x: any): Slot {
  if (!x || typeof x.utilization !== "number") return null;
  return { pct: x.utilization, resets_at: x.resets_at ?? null };
}

async function main() {
  const prev = loadCache();
  const now = Date.now();

  // スロットリング: まだ取得タイミングでなければキャッシュをそのまま返す
  if (prev?.next_fetch_after && now < Date.parse(prev.next_fetch_after)) {
    process.stdout.write(JSON.stringify(prev));
    return;
  }

  let token: string;
  try {
    token = readToken();
  } catch (e: any) {
    // トークンが取れない（Keychain未許可/Claude未ログイン等）。古い値があれば stale で返す。
    emit({
      ...(prev ?? emptyCache()),
      ok: false,
      stale: !!prev,
      error: `token: ${e?.message ?? "unknown"}`,
      next_fetch_after: new Date(now + OK_INTERVAL_MS).toISOString(),
    });
    return;
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
  } catch (e: any) {
    emit({
      ...(prev ?? emptyCache()),
      ok: false,
      stale: !!prev,
      error: `network: ${e?.message ?? "unknown"}`,
      next_fetch_after: new Date(now + OK_INTERVAL_MS).toISOString(),
    });
    return;
  }

  if (res.status === 429) {
    // レート制限。直近の良い値を保ちつつ、次回を遠ざける。
    emit({
      ...(prev ?? emptyCache()),
      ok: !!prev?.ok,
      stale: true,
      error: "rate_limited(429)",
      next_fetch_after: new Date(now + BACKOFF_MS).toISOString(),
    });
    return;
  }

  if (!res.ok) {
    emit({
      ...(prev ?? emptyCache()),
      ok: !!prev?.ok,
      stale: !!prev,
      error: `http_${res.status}`,
      next_fetch_after: new Date(now + OK_INTERVAL_MS).toISOString(),
    });
    return;
  }

  const data: any = await res.json();
  emit({
    ok: true,
    stale: false,
    error: null,
    fetched_at: new Date(now).toISOString(),
    next_fetch_after: new Date(now + OK_INTERVAL_MS).toISOString(),
    session: slot(data.five_hour),
    weekly: slot(data.seven_day),
    weekly_opus: slot(data.seven_day_opus),
    weekly_sonnet: slot(data.seven_day_sonnet),
  });
}

function emptyCache(): Cache {
  return {
    ok: false,
    stale: false,
    error: null,
    fetched_at: null,
    next_fetch_after: null,
    session: null,
    weekly: null,
    weekly_opus: null,
    weekly_sonnet: null,
  };
}

main();
