#!/usr/bin/env bash
#
# claude-usage-widget installer
#   - backend を ~/.claude-usage-widget/ に配置
#   - Übersicht の widgets フォルダにウィジェットを配置（bun / backend の絶対パスを自動置換）
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIDGET_HOME="$HOME/.claude-usage-widget"
UEBERSICHT_WIDGETS="$HOME/Library/Application Support/Übersicht/widgets"

echo "==> claude-usage-widget installer"

# 1. 前提チェック ---------------------------------------------------------
if [ "$(uname)" != "Darwin" ]; then
  echo "ERROR: macOS 専用です（Übersicht は macOS のみ）。"
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

if [ ! -d "$UEBERSICHT_WIDGETS" ]; then
  echo "ERROR: Übersicht の widgets フォルダが見つかりません:"
  echo "       $UEBERSICHT_WIDGETS"
  echo "       Übersicht をインストールし一度起動してください: https://tracesof.net/uebersicht/"
  exit 1
fi
echo "    Übersicht widgets: $UEBERSICHT_WIDGETS"

# 2. backend を配置 -------------------------------------------------------
echo "==> backend を $WIDGET_HOME に配置"
mkdir -p "$WIDGET_HOME/lib"
cp "$REPO_DIR/backend/fetch-usage.ts"       "$WIDGET_HOME/fetch-usage.ts"
cp "$REPO_DIR/backend/lib/geometry.js"      "$WIDGET_HOME/lib/geometry.js"
cp "$REPO_DIR/backend/lib/geometry.test.js" "$WIDGET_HOME/lib/geometry.test.js"

# 3. ウィジェットを生成（プレースホルダを実パスに置換） -------------------
echo "==> ウィジェットを Übersicht に配置"
sed -e "s|__BUN_BIN__|$BUN_BIN|g" \
    -e "s|__WIDGET_HOME__|$WIDGET_HOME|g" \
    "$REPO_DIR/widget/claude-usage.jsx" > "$UEBERSICHT_WIDGETS/claude-usage.jsx"

cat <<'EOF'

✅ インストール完了

次の手順:
  1. Übersicht を起動（メニューバーから "Refresh All Widgets" でも可）
  2. デスクトップ右上に「CLAUDE 使用状況」パネルが表示されます
  3. ドラッグで動かしたい場合は README の「ドラッグ操作を有効にする」を参照

前提: Claude Code に一度ログインしておくこと
      （macOS Keychain の "Claude Code-credentials" の OAuth トークンを読みます）。
      初回はデータ取得まで最大5分ほどかかることがあります。
EOF
