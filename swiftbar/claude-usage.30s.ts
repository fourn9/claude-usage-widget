#!__BUN_BIN__
// Claude 使用状況 SwiftBar プラグイン
//
// メニューバーにセッション使用率＋リセットまでの残り時間（例: "3% -2.2h"）を表示し、
// クリックで週間制限などの詳細をドロップダウン表示する。
//
// データ取得・5分スロットリング・429バックオフ・usage.json キャッシュは
// __WIDGET_HOME__/fetch-usage.ts が担当（ここでは再実行して stdout の JSON を読むだけ）。
// 整形ロジックは __WIDGET_HOME__/lib/format.js（純粋関数・テスト済み）に委譲する。
//
// install.sh が __BUN_BIN__ / __WIDGET_HOME__ を絶対パスに置換し、実行権限を付与する。
//
// <swiftbar.title>Claude Usage</swiftbar.title>
// <swiftbar.version>2.0.0</swiftbar.version>
// <swiftbar.author>fourn9</swiftbar.author>
// <swiftbar.desc>Claude Code のセッション/週間使用率をメニューバーに表示</swiftbar.desc>
// <swiftbar.refreshOnOpen>true</swiftbar.refreshOnOpen>

const WIDGET_HOME = "__WIDGET_HOME__";
const FETCH = `${WIDGET_HOME}/fetch-usage.ts`;
const REPO_URL = "https://github.com/fourn9/claude-usage-widget";

// メニューバー1行＋区切り＋ドロップダウン行を SwiftBar 記法で出力する。
function emit(menuBar: string, color: string | null, rows: string[]) {
  console.log(color ? `${menuBar} | color=${color}` : menuBar);
  console.log("---");
  for (const r of rows) console.log(r); // "---" はそのまま区切りとして出力される
  console.log("---");
  console.log("🔄 今すぐ更新 | refresh=true");
  console.log(`📄 usage.json を開く | href=file://${WIDGET_HOME}/usage.json`);
  console.log(`🔗 リポジトリ | href=${REPO_URL}`);
}

async function main() {
  // 1. fetch-usage.ts を再実行（取得・throttle は向こうの責務）
  let out = "";
  try {
    const proc = Bun.spawnSync({ cmd: [process.execPath, "run", FETCH] });
    if (proc.exitCode !== 0) throw new Error(`fetch exit ${proc.exitCode}`);
    out = proc.stdout.toString().trim();
  } catch (e) {
    emit("Claude ⚠", "#ff5a52", [`取得失敗: ${(e as Error).message}`]);
    return;
  }

  // 2. JSON パース
  let d: any = null;
  try {
    d = JSON.parse(out);
  } catch {
    emit("Claude ⚠", "#ff5a52", ["usage JSON の解析に失敗しました"]);
    return;
  }

  // 3. 整形（純粋関数に委譲）して出力
  const fmt = await import(`file://${WIDGET_HOME}/lib/format.js`);
  const now = Date.now();
  emit(fmt.menuBarTitle(d, now), fmt.menuBarColor(d), fmt.dropdownRows(d, now));
}

await main();
