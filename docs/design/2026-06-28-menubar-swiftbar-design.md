# 設計: メニューバー（SwiftBar）への移行

- 日付: 2026-06-28
- ステータス: 承認済み（実装前）
- 関連: `docs/design/2026-05-28-draggable-widget-design.md`（旧 Übersicht 版・置き換え対象）

## 背景 / 目的

現在 Claude Code の使用状況は **Übersicht のデスクトップウィジェット**として画面右上に常時表示している。
これをやめ、**macOS のメニューバーに最小化表示**したい。デスクトップを占有せず、クリックで詳細を開ける形にする。

## 確定要件

| 項目 | 決定 |
|------|------|
| 入れ物 | **SwiftBar**（メニューバー常駐アプリ）プラグイン |
| 方針 | **メニューバーに一本化**。Übersicht 版は廃止・リポから削除 |
| 最小化表示 | **セッション使用率% ＋ リセットまでの残り時間**。コンパクト形式 `3% -2.2h` |
| ドロップダウン | フル情報（セッション・週間・週間Sonnet/Opus・stale/エラー）を旧ウィジェット同等で |
| バックエンド | `backend/fetch-usage.ts` は**変更なし**で再利用（Keychain・5分スロットリング・429バックオフ・usage.json キャッシュ） |

## アーキテクチャ

```
  SwiftBar（メニューバー常駐アプリ）
  ┌─────────────────────────────────┐   30秒ごとに plugin を実行
  │ Plugins/claude-usage.30s.ts     │ ──────────────┐
  │  ・JSON を整形してメニューバー出力 │ ←── stdout ───┤
  └─────────────────────────────────┘               │
         │ shell out (bun run)                        │
         ▼                                            │
  ~/.claude-usage-widget/fetch-usage.ts （変更なし）   │
   ├─ Keychain から OAuth トークン取得                  │
   ├─ 5分スロットリング＋429バックオフ                  │
   └─ usage.json にキャッシュ＋stdout に JSON 出力 ──────┘
```

- 取得・スロットリング・キャッシュ・認証はすべて既存 `fetch-usage.ts` の責務のまま。
- 新規はメニューバー文字列とドロップダウンへ整形する**薄いプラグイン1本**と、整形の**純粋関数**のみ。
- SwiftBar はファイル名の `.30s.` を見て30秒ごとに実行し、stdout の SwiftBar 記法
  （1行目＝メニューバー、`---` 以降＝ドロップダウン）を描画する。
- API 実体取得は引き続き5分に1回（フェッチャ側で間引く）。30秒は表示更新の周期。

## 表示仕様

### メニューバー（常時表示・1行）

```
3% -2.2h
```

- 形式: `{セッション%}% -{残り時間}h`
- 残り時間 = セッションの `resets_at` までを **小数1桁の時間**（例: 2時間13分 → `2.2h`）
- 残りが1時間未満も同じ単位で `0.2h`（単位を揺らさない）
- 残り ≤ 0: `0.0h`
- 色: 既存しきい値を流用し SwiftBar の `color=` で着色
  - `< 80%` 通常 / `>= 80%` 橙 (`#ffae42`) / `>= 95%` 赤 (`#ff5a52`)
- データ未取得（認証待ち等）: `Claude …`
- bun 実行失敗 / JSON パース失敗: `Claude ⚠`

### ドロップダウン（クリックで展開）

旧ウィジェット同等のフル情報:

```
現在のセッション            3%
あと 2時間13分（15:50 リセット）
─────────────────────────
週間制限（全体）            6%
7/3(金) 22:00 リセット
週間 Sonnet                 0%      ← データがあれば表示
週間 Opus                   —       ← 値があれば表示
─────────────────────────
⟳ 429待機中 / 更新待ち              ← stale 時のみ
🔄 今すぐ更新                       ← refresh=true
📄 usage.json を開く
🔗 リポジトリ
```

- リセット時刻の日本語表記 `M/D(曜) H:MM リセット`・カウントダウン `あと H時間M分`・stale 表示は
  既存 jsx のロジックを移植（`countdown` / `resetClock` 相当）。
- `weekly_sonnet` は旧 jsx では非表示だったが、データがあるためドロップダウンに追加する（情報追加のみ・害なし）。

## ファイル構成

| ファイル | 変更 | 内容 |
|----------|------|------|
| `swiftbar/claude-usage.30s.ts` | 新規 | 整形プラグイン本体（bun shebang・SwiftBar 記法を出力） |
| `backend/lib/format.js` | 新規 | 残り時間→`h` 文字列・色判定・メニューバー1行・ドロップダウン行の純粋関数 |
| `backend/lib/format.test.js` | 新規 | `format.js` のユニットテスト |
| `backend/fetch-usage.ts` | 変更なし | 再利用 |
| `backend/lib/geometry.js` / `geometry.test.js` | 削除 | Übersicht ドラッグ専用のため不要 |
| `widget/claude-usage.jsx` | 削除 | Übersicht 版を廃止 |
| `install.sh` | 更新 | SwiftBar プラグイン配置に変更 |
| `uninstall.sh` | 更新 | SwiftBar プラグイン削除に変更 |
| `README.md` | 更新 | SwiftBar 前提に書き換え |
| `package.json` | 更新 | `description` と `test` パスを調整 |
| `docs/design/2026-05-28-*.md` | 残置 | 旧設計は履歴として保持 |

### プラグインの責務（`claude-usage.30s.ts`）

1. `bun run <WIDGET_HOME>/fetch-usage.ts` を実行し stdout の JSON を受け取る（取得・throttle は既存任せ）。
2. JSON を `format.js` の純粋関数でメニューバー文字列とドロップダウン行に整形。
3. SwiftBar 記法で stdout に出力。色は `| color=`、更新は `| refresh=true`、リンクは `| href=`。
4. プレースホルダ `__BUN_BIN__` / `__WIDGET_HOME__` は install.sh が絶対パスに置換（旧 jsx と同方式）。

### install.sh（更新方針）

- macOS 前提チェック（既存）。
- `bun` 検出（既存）。
- **SwiftBar 検出**: プラグインフォルダを `defaults read com.ameba.SwiftBar PluginDirectory` で取得。
  - 未設定/未導入なら案内して中断（`brew install --cask swiftbar` → 起動 → プラグインフォルダ設定）。
- backend を `~/.claude-usage-widget/` に配置（`fetch-usage.ts` のみ。geometry は廃止）。
- `swiftbar/claude-usage.30s.ts` をプラグインフォルダへコピー、`chmod +x`、`__BUN_BIN__`/`__WIDGET_HOME__` を置換。
- 完了後 SwiftBar の "Refresh all" を案内。

### uninstall.sh（更新方針）

- プラグインフォルダの `claude-usage.30s.ts` を削除。
- `~/.claude-usage-widget/` を削除。

## エラー / エッジケース

| 状況 | メニューバー | ドロップダウン |
|------|--------------|----------------|
| データ未取得（認証待ち） | `Claude …` | 取得待ちの理由・Claude Code 起動確認 |
| stale（429 バックオフ中） | 最後の値 | `429待機中` |
| stale（更新待ち） | 最後の値 | `更新待ち` |
| bun 実行失敗 / JSON 異常 | `Claude ⚠` | エラー文 |

## テスト方針（TDD）

`format.js` の純粋関数を `format.test.js` で先に固める:

- 残り時間 → `h` 文字列: 2時間13分→`2.2h`、13分→`0.2h`、0以下→`0.0h`、`resets_at` 欠落時の扱い。
- 色判定: 79/80/94/95% の境界で 通常/橙/赤。
- メニューバー1行の組み立て: 正常・データ無し・stale。
- ドロップダウン行: session/weekly/weekly_sonnet/weekly_opus の有無で行が増減。

副作用（Keychain・API・SwiftBar I/O・bun 実行）はテスト対象外（既存 `fetch-usage.ts` の責務）。
`package.json` の `test` は `bun test backend/lib/` のまま（新 `format.test.js` を拾う）。

## スコープ外（YAGNI）

- ドラッグによる位置記憶（メニューバーでは不要）。
- 週間 Opus/Sonnet のメニューバー常時表示（ドロップダウンのみ）。
- Übersicht と SwiftBar の併存（一本化方針のため）。
