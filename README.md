# claude-usage-widget

macOS の**メニューバー**に、**Claude Code の使用状況**（現在の5時間セッションの使用率%とリセットまでの残り時間）を最小化表示する [SwiftBar](https://github.com/swiftbar/SwiftBar) プラグインです。クリックすると週間制限などの詳細をドロップダウンで開けます。

```
メニューバー:   3% -2.2h        ← セッション使用率% ＋ リセットまで残り時間

クリックで展開:
┌─────────────────────────────┐
│ 現在のセッション        3%   │
│ あと 2時間13分（15:50 リセット）│
│ ───────────────────────     │
│ 週間制限（全体）        6%   │
│ 7/3(金) 22:00 リセット        │
│ 週間 Sonnet             0%   │
│ ───────────────────────     │
│ 🔄 今すぐ更新                │
│ 📄 usage.json を開く         │
│ 🔗 リポジトリ                │
└─────────────────────────────┘
```

- メニューバーは使用率メーターのアイコン＋白文字でコンパクトに `{セッション%}% -{残り時間}h`（残りは小数1桁の時間）。
- 詳細ドロップダウンに週間制限（全体 / Sonnet / Opus）とリセット時刻を表示。

> **⚠️ 非公式ツールです。** このプラグインは Anthropic 非公式・非ドキュメントのエンドポイント
> (`https://api.anthropic.com/api/oauth/usage`) を利用しています。Anthropic 公式の製品ではなく、
> 提供・保証もありません。予告なく動かなくなる可能性があります。**自己責任でご利用ください。**
> 表示するのは自分のアカウントの使用率（%）とリセット時刻のみで、会話内容などは一切扱いません。

> **v2.0 で表示方式を Übersicht デスクトップウィジェット → SwiftBar メニューバーへ変更しました。**
> 旧版を使っていた方は、旧 Übersicht ウィジェットを削除のうえ再 install してください。

---

## 仕組み

```
  SwiftBar（メニューバー常駐）
  ┌─────────────────────────────────┐    30秒ごとに plugin を実行
  │ Plugins/claude-usage.30s.ts     │ ──────────────┐
  │ （JSONを整形しメニューバー出力） │ ←── stdout ───┤
  └─────────────────────────────────┘               │
         │ bun で fetch-usage.ts を再実行              │
         ▼                                            │
  ~/.claude-usage-widget/fetch-usage.ts （bun で実行） │
   ├─ macOS Keychain "Claude Code-credentials" から OAuth トークンを読む（出力しない）
   ├─ 5分に1回だけ API を実体取得（429 を踏んだら15分バックオフ）
   └─ 結果を usage.json にキャッシュし stdout に JSON を出力 ──────────┘
```

- **表示と取得を分離**：プラグインは30秒ごとに実行されるが、API への実アクセスはフェッチャ側で5分に間引く。これでレート制限を踏みにくくしている。
- **トークンは読むだけ**：`security find-generic-password` で Keychain の1項目だけを読み、`Bearer` ヘッダに載せるのみ。ファイルにも標準出力にも**書き出さない**。
- **整形は純粋関数＋テスト**：メニューバー文字列・残り時間・色判定・ドロップダウン行の整形は `backend/lib/format.js` に切り出し、`bun test` で担保（macOS や SwiftBar に非依存）。プラグインは取得結果を整形して SwiftBar 記法で出力するだけの薄い層。

---

## 必要なもの

| 要件 | 備考 |
|------|------|
| macOS | SwiftBar は macOS 専用 |
| [SwiftBar](https://github.com/swiftbar/SwiftBar) | メニューバープラグイン基盤。`brew install --cask swiftbar` で導入し、一度起動してプラグインフォルダを設定しておく |
| [bun](https://bun.sh/) | フェッチャ／プラグインの実行に使用（`curl -fsSL https://bun.sh/install \| bash`） |
| Claude Code にログイン済み | Keychain に `Claude Code-credentials` がある状態。`claude` を一度起動してログインしておく |

---

## インストール

```bash
# 1. SwiftBar を導入して一度起動し、プラグインフォルダを設定しておく
brew install --cask swiftbar

# 2. このリポジトリを取得して install
git clone https://github.com/fourn9/claude-usage-widget.git
cd claude-usage-widget
./install.sh
```

`install.sh` は次を自動で行います。

1. `bun` の絶対パスと SwiftBar のプラグインフォルダ（`defaults read com.ameba.SwiftBar PluginDirectory`）を検出
2. `backend/`（フェッチャ `fetch-usage.ts` と整形ロジック `lib/format.js`）を `~/.claude-usage-widget/` にコピー
3. `swiftbar/claude-usage.30s.ts` のプレースホルダ（bun と backend の絶対パス）を実パスに置換し、
   実行権限を付けて SwiftBar のプラグインフォルダに配置

インストール後、SwiftBar のメニューから **Refresh All** を実行するとメニューバーに表示が出ます。
（初回はデータ取得まで最大5分ほどかかることがあります。）

### アンインストール

```bash
./uninstall.sh
```

---

## 手動インストール（install.sh を使わない場合）

1. `backend/fetch-usage.ts` と `backend/lib/format.js` を `~/.claude-usage-widget/`（`lib/` を含む）にコピー。
2. `swiftbar/claude-usage.30s.ts` をコピーし、プレースホルダを実パスに置換：
   - 先頭の shebang `#!__BUN_BIN__` → `#!/Users/you/.bun/bin/bun`（`which bun` の結果）
   - `__WIDGET_HOME__` → `~/.claude-usage-widget` の絶対パス（例 `/Users/you/.claude-usage-widget`）
3. 置換後のファイルを `chmod +x` し、SwiftBar のプラグインフォルダに置く（ファイル名の `.30s.` が更新間隔30秒を表す）。
4. SwiftBar を Refresh。

> SwiftBar から起動されるプロセスは PATH が最小限のことがあるため、shebang には **bun の絶対パス**を入れます。

---

## カスタマイズ

| 変更したいこと | 場所 |
|----------------|------|
| メニューバーのアイコン | `swiftbar/claude-usage.30s.ts` の `sfimage=gauge.medium`（SF Symbol 名） |
| メニューバー/ドロップダウンの文言 | `backend/lib/format.js`（`menuBarTitle` / `dropdownRows`） |
| 表示の更新間隔 | プラグインのファイル名 `claude-usage.30s.ts` の `30s` を変更（例 `1m`） |
| オーケストレータ節の表示 | `ORCH_DIR="" ./install.sh` で非表示（節ごと出さない）。別の場所を見るなら `ORCH_DIR=/path/to/claude-management ./install.sh`。選択は `~/.claude-usage-widget/install.env` に保存され、次回以降の `./install.sh` でも維持される |
| API 取得の間隔 / バックオフ | `backend/fetch-usage.ts` の `OK_INTERVAL_MS` / `BACKOFF_MS` |

> 変更後は `~/.claude-usage-widget/` への再配置が必要です（`./install.sh` を再実行）。

---

## 開発

```bash
bun test backend/lib/
```

残り時間・色判定・メニューバー文字列・ドロップダウン行の整形ロジックの単体テストが走ります。
macOS や SwiftBar・Keychain には依存しないため、Linux の CI でもそのまま実行できます。

設計の経緯は [`docs/design/`](docs/design/) に残してあります（旧 Übersicht 版・SwiftBar 移行版）。

---

## ライセンス

[MIT](LICENSE)
