#!/usr/bin/env bash
#
# claude-usage-widget installer (SwiftBar 版)
#   - backend（fetch-usage.ts / lib/format.js）を ~/.claude-usage-widget/ に配置
#   - SwiftBar のプラグインフォルダにメニューバープラグインを配置
#     （bun / WIDGET_HOME の絶対パスを自動置換し実行権限を付与）
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIDGET_HOME="$HOME/.claude-usage-widget"

echo "==> claude-usage-widget installer (SwiftBar)"

# 1. 前提チェック ---------------------------------------------------------
if [ "$(uname)" != "Darwin" ]; then
  echo "ERROR: macOS 専用です（SwiftBar は macOS のみ）。"
  exit 1
fi

BUN_BIN="$(command -v bun || true)"
if [ -z "$BUN_BIN" ]; then
  echo "ERROR: bun が見つかりません。"
  echo "       インストール: curl -fsSL https://bun.sh/install | bash"
  echo "       その後ターミナルを開き直すか PATH を通してから再実行してください。"
  exit 1
fi
echo "    bun: $BUN_BIN"

# SwiftBar のプラグインフォルダを取得（SwiftBar 初回起動時に設定される）
PLUGIN_DIR="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
PLUGIN_DIR="${PLUGIN_DIR/#\~/$HOME}" # 先頭の ~ を展開
if [ -z "$PLUGIN_DIR" ] || [ ! -d "$PLUGIN_DIR" ]; then
  echo "ERROR: SwiftBar のプラグインフォルダが見つかりません。"
  echo "       1) SwiftBar を導入: brew install --cask swiftbar"
  echo "       2) SwiftBar を起動し、初回ダイアログでプラグインフォルダを選択"
  echo "       3) もう一度このスクリプトを実行してください"
  exit 1
fi
echo "    SwiftBar plugins: $PLUGIN_DIR"

# 2. backend を配置 -------------------------------------------------------
echo "==> backend を $WIDGET_HOME に配置"
mkdir -p "$WIDGET_HOME/lib"
cp "$REPO_DIR/backend/fetch-usage.ts"  "$WIDGET_HOME/fetch-usage.ts"
cp "$REPO_DIR/backend/lib/format.js"   "$WIDGET_HOME/lib/format.js"

# 3. プラグインを生成（プレースホルダを実パスに置換し実行権限を付与） -----
echo "==> プラグインを SwiftBar に配置"
PLUGIN_DST="$PLUGIN_DIR/claude-usage.30s.ts"
sed -e "s|__BUN_BIN__|$BUN_BIN|g" \
    -e "s|__WIDGET_HOME__|$WIDGET_HOME|g" \
    "$REPO_DIR/swiftbar/claude-usage.30s.ts" > "$PLUGIN_DST"
chmod +x "$PLUGIN_DST"

cat <<EOF

✅ インストール完了

次の手順:
  1. SwiftBar のメニュー → "Refresh All"（または SwiftBar を再起動）
  2. メニューバーに "3% -2.2h" のような表示が出ます（クリックで詳細）

前提: Claude Code に一度ログインしておくこと
      （macOS Keychain の "Claude Code-credentials" の OAuth トークンを読みます）。
      初回はデータ取得まで最大5分ほどかかることがあります。
EOF
