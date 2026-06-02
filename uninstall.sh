#!/usr/bin/env bash
#
# claude-usage-widget uninstaller
#   - Übersicht のウィジェットと ~/.claude-usage-widget/ を削除する
#
set -euo pipefail

WIDGET_HOME="$HOME/.claude-usage-widget"
UEBERSICHT_WIDGETS="$HOME/Library/Application Support/Übersicht/widgets"

echo "==> claude-usage-widget をアンインストール"
rm -f  "$UEBERSICHT_WIDGETS/claude-usage.jsx"
rm -rf "$WIDGET_HOME"
echo "✅ 削除しました。Übersicht を Refresh してください（必要なら再起動）。"
