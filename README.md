# claude-usage-widget

macOS のデスクトップ右上に、**Claude Code の使用状況**（現在の5時間セッション・週間制限の使用率%とリセット時刻）を常時表示する [Übersicht](https://tracesof.net/uebersicht/) ウィジェットです。

```
┌──────────────────────────────────┐
│ CLAUDE 使用状況                    │
│ 現在のセッション             42%   │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░               │
│ あと 2時間13分                     │
│ 週間制限（全体）             18%   │
│ ▓▓▓░░░░░░░░░░░░░░░░░░               │
│ 6/5(金) 22:00 リセット             │
└──────────────────────────────────┘
```

- 使用率に応じてバーの色が変わる（〜80% 青 / 80%〜 橙 / 95%〜 赤）。
- セッションは「あと◯時間◯分」、週間は「何曜日の何時にリセット」を表示。
- パネルはドラッグで好きな位置に移動でき、位置を記憶する（再起動後も維持）。

> **⚠️ 非公式ツールです。** このウィジェットは Anthropic 非公式・非ドキュメントのエンドポイント
> (`https://api.anthropic.com/api/oauth/usage`) を利用しています。Anthropic 公式の製品ではなく、
> 提供・保証もありません。予告なく動かなくなる可能性があります。**自己責任でご利用ください。**
> 表示するのは自分のアカウントの使用率（%）とリセット時刻のみで、会話内容などは一切扱いません。

---

## 仕組み

```
  Übersicht
  ┌─────────────────────────┐    30秒ごとに command を実行
  │ widgets/claude-usage.jsx│ ──────────────┐
  │ （表示・ドラッグ・%バー）│ ←── stdout ───┤
  └─────────────────────────┘               │
                                             ▼
  ~/.claude-usage-widget/fetch-usage.ts （bun で実行）
   ├─ macOS Keychain "Claude Code-credentials" から OAuth トークンを読む（出力しない）
   ├─ 5分に1回だけ API を実体取得（429 を踏んだら15分バックオフ）
   └─ 結果を usage.json にキャッシュし stdout に JSON を出力
```

- **表示と取得を分離**：ウィジェットは30秒ごとに再描画されるが、API への実アクセスはフェッチャ側で5分に間引く。これでレート制限を踏みにくくしている。
- **トークンは読むだけ**：`security find-generic-password` で Keychain の1項目だけを読み、`Bearer` ヘッダに載せるのみ。ファイルにも標準出力にも**書き出さない**。
- **座標計算は純粋関数＋テスト**：ドラッグ位置のクランプ・永続化ロジックは `backend/lib/geometry.js` に切り出し、`bun test` で担保（macOS や Übersicht に非依存）。

---

## 必要なもの

| 要件 | 備考 |
|------|------|
| macOS | Übersicht は macOS 専用 |
| [Übersicht](https://tracesof.net/uebersicht/) | デスクトップウィジェット基盤。インストールして一度起動しておく |
| [bun](https://bun.sh/) | フェッチャの実行に使用（`curl -fsSL https://bun.sh/install \| bash`） |
| Claude Code にログイン済み | Keychain に `Claude Code-credentials` がある状態。`claude` を一度起動してログインしておく |

---

## インストール

```bash
git clone https://github.com/fourn9/claude-usage-widget.git
cd claude-usage-widget
./install.sh
```

`install.sh` は次を自動で行います。

1. `bun` の絶対パスと Übersicht の widgets フォルダを検出
2. `backend/`（フェッチャ・純粋ロジック）を `~/.claude-usage-widget/` にコピー
3. `widget/claude-usage.jsx` のプレースホルダ（bun と backend の絶対パス）を実パスに置換して
   `~/Library/Application Support/Übersicht/widgets/claude-usage.jsx` に配置

インストール後、Übersicht のメニューから **Refresh All Widgets** を実行すると右上にパネルが出ます。
（初回はデータ取得まで最大5分ほどかかることがあります。）

### アンインストール

```bash
./uninstall.sh
```

---

## 手動インストール（install.sh を使わない場合）

1. `backend/fetch-usage.ts` と `backend/lib/` を `~/.claude-usage-widget/` 配下にコピー。
2. `widget/claude-usage.jsx` をコピーし、先頭の `command` のプレースホルダを実パスに置換：
   - `__BUN_BIN__` → `which bun` の結果（例 `/Users/you/.bun/bin/bun`）
   - `__WIDGET_HOME__` → `~/.claude-usage-widget` の絶対パス（例 `/Users/you/.claude-usage-widget`）
3. 置換後の `claude-usage.jsx` を `~/Library/Application Support/Übersicht/widgets/` に置く。
4. Übersicht を Refresh。

> Übersicht のプロセスは PATH が最小限のことが多いため、`command` には **bun の絶対パス**を入れます（`bun` だけだと見つからないことがある）。

---

## ドラッグ操作を有効にする（任意）

Übersicht のウィジェットは既定で「クリックスルー」（マウス操作が背後のデスクトップに抜ける）です。
パネルをドラッグで動かすには、Übersicht のインタラクションモードを使います。

1. Übersicht メニュー > **Preferences** > インタラクション用ショートカットを任意のキーに割り当てる。
2. システム設定 > プライバシーとセキュリティ > **アクセシビリティ** で Übersicht を許可。
3. 運用：ショートカットでインタラクションモードを ON → ヘッダ「CLAUDE 使用状況」をドラッグで移動 → OFF（位置は記憶される）。
   - ヘッダを**ダブルクリック**で初期位置（右上）にリセット。

---

## カスタマイズ

`widget/claude-usage.jsx`（インストール後は Übersicht widgets 内のファイル）の定数を編集します。

| 変更したいこと | 場所 |
|----------------|------|
| 色のしきい値（橙/赤になる%） | `const WARN = 80;` / `const DANGER = 95;` |
| パネル幅 | `const PANEL_WIDTH = 320;` と `shellStyle.width`（両方そろえる） |
| 画面端からの余白 | `const MARGIN = 8;` / `const MARGIN_RIGHT = 8;` |
| 表示の更新間隔 | `export const refreshFrequency = 30000;`（ms） |
| API 取得の間隔 / バックオフ | `backend/fetch-usage.ts` の `OK_INTERVAL_MS` / `BACKOFF_MS` |

> 座標計算のロジックは `backend/lib/geometry.js`（テスト正本）とウィジェット内インラインの**二重定義**です。
> Übersicht がウィジェットをバンドルなしで単独ロードする制約によるもので、変更時は両方を同期してください。

---

## 開発

```bash
bun test backend/lib/
```

座標クランプ・初期位置・永続化シリアライズの単体テスト（10件）が走ります。macOS や Übersicht・Keychain には依存しないため、Linux の CI でもそのまま実行できます。

設計の経緯は [`docs/design/`](docs/design/) に残してあります（設計書・実装計画）。

---

## ライセンス

[MIT](LICENSE)
