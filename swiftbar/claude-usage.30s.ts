#!__BUN_BIN__
// Claude 使用状況 SwiftBar プラグイン
//
// メニューバーにセッション使用率＋リセットまでの残り時間（例: "3% -2.2h"）を表示し、
// クリックで週間制限などの詳細をドロップダウン表示する。
//
// 表示は常に __WIDGET_HOME__/usage.json（キャッシュ）を直読みして即描画する。
// データの更新は __WIDGET_HOME__/fetch-usage.ts に任せるが、それを「タイムアウト付き」で
// 実行し、固まっても（SwiftBar から実行すると Keychain 許可待ちで固まる場合がある）
// 表示はキャッシュにフォールバックしてブロックしない。
// 取得・5分スロットリング・429バックオフ・Keychain は fetch-usage.ts の責務。
// 整形ロジックは __WIDGET_HOME__/lib/format.js（純粋関数・テスト済み）に委譲する。
//
// install.sh が __BUN_BIN__ / __WIDGET_HOME__ を絶対パスに置換し、実行権限を付与する。
//
// <swiftbar.title>Claude Usage</swiftbar.title>
// <swiftbar.version>2.0.0</swiftbar.version>
// <swiftbar.author>fourn9</swiftbar.author>
// <swiftbar.desc>Claude Code のセッション/週間使用率をメニューバーに表示</swiftbar.desc>
// <swiftbar.refreshOnOpen>true</swiftbar.refreshOnOpen>

import { readFileSync } from "node:fs";

const WIDGET_HOME = "__WIDGET_HOME__";
const FETCH = `${WIDGET_HOME}/fetch-usage.ts`;
const CACHE = `${WIDGET_HOME}/usage.json`;
const REPO_URL = "https://github.com/fourn9/claude-usage-widget";
const FETCH_TIMEOUT_MS = 5000; // フェッチャがこれ以上かかったら諦めてキャッシュ表示

// メニューバー1行＋区切り＋ドロップダウン行を SwiftBar 記法で出力する。
function emit(menuBar: string, color: string | null, rows: string[]) {
  console.log(color ? `${menuBar} | color=${color}` : menuBar);
  console.log("---");
  for (const r of rows) console.log(r); // "---" はそのまま区切りとして出力される
  console.log("---");
  console.log("🔄 今すぐ更新 | refresh=true");
  console.log(`📄 usage.json を開く | href=file://${CACHE}`);
  console.log(`🔗 リポジトリ | href=${REPO_URL}`);
}

// fetch-usage.ts をタイムアウト付きで実行し、最新の JSON 文字列を取得（失敗時は null）。
function runFetch(): string | null {
  try {
    const proc = Bun.spawnSync({
      cmd: [process.execPath, "run", FETCH],
      timeout: FETCH_TIMEOUT_MS,
      stderr: "ignore",
    });
    if (proc.exitCode === 0) {
      const out = proc.stdout.toString().trim();
      if (out) return out;
    }
  } catch {}
  return null;
}

// キャッシュ usage.json を直読み（失敗時は null）。
function readCache(): any {
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function safeParse(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  // まずキャッシュを直読み（高速・サブプロセス無し）。
  let d: any = readCache();

  // キャッシュが無い／5分窓を過ぎているときだけフェッチャを起動して更新を試みる。
  // 固まっても（SwiftBar 実行時の Keychain 待ち等）タイムアウトしてキャッシュ表示にフォールバック。
  const stale = !d || !d.next_fetch_after || Date.now() >= Date.parse(d.next_fetch_after);
  if (stale) {
    const fresh = safeParse(runFetch());
    if (fresh) d = fresh;
  }

  if (!d) {
    // 一度もデータが無い（初回・未ログイン等）
    emit("Claude …", null, [
      "データ取得待ち — Claude Code が起動中か確認してください",
      "（初回は最大5分ほどかかります）",
    ]);
    return;
  }

  const fmt = await import(`file://${WIDGET_HOME}/lib/format.js`);
  const now = Date.now();
  emit(fmt.menuBarTitle(d, now), fmt.menuBarColor(d), fmt.dropdownRows(d, now));
}

await main();
