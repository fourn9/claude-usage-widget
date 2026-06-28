#!/usr/bin/env bash
#
# claude-usage-widget uninstaller (SwiftBar 版)
#   - SwiftBar プラグインと ~/.claude-usage-widget/ を削除する
#
set -euo pipefail

WIDGET_HOME="$HOME/.claude-usage-widget"

echo "==> claude-usage-widget をアンインストール"

PLUGIN_DIR="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
PLUGIN_DIR="${PLUGIN_DIR/#\~/$HOME}"
if [ -n "$PLUGIN_DIR" ]; then
  rm -f "$PLUGIN_DIR/claude-usage.30s.ts"
fi

rm -rf "$WIDGET_HOME"
echo "✅ 削除しました。SwiftBar を Refresh してください（必要なら再起動）。"
