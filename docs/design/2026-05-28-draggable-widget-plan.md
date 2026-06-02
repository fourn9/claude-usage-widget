# Claude 使用状況ウィジェット ドラッグ移動対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右上固定の Claude 使用状況 Übersicht ウィジェットを、ヘッダのドラッグで自由に移動でき位置を `localStorage` に記憶する（再起動後も維持）ように変更する。

**Architecture:** 座標計算・永続化の純粋関数は `~/.claude-usage-widget/lib/geometry.js` に正本＋bunテストを置く。ウィジェット `claude-usage.jsx` は Übersicht がバンドルなしで単独ロードする制約上1ファイル自己完結とし、同じ純粋関数をインライン展開する。ドラッグ状態は30秒ごとの再描画で壊れないようReact stateを使わずモジュール変数＋直接DOM操作で扱う。

**Tech Stack:** Übersicht 1.6.82 / React-JSX widget / `localStorage` / 純粋ロジックのテストは `bun test`（`~/.bun/bin/bun`）

---

## 補足: バージョン管理について

対象ディレクトリ（`~/.claude-usage-widget/` および Übersicht widgets フォルダ）はいずれも git リポジトリではない。本計画では `git commit` ステップを置かず、各タスクの完了は**テスト合格**または**Übersicht上の手動確認**で検証する。バージョン管理の導入は別タスク（スコープ外）。

## File Structure

- **Create**: `~/.claude-usage-widget/lib/geometry.js` — 純粋関数の正本（`initialPos` / `clampPos` / `serializePos` / `parsePos` ＋定数）
- **Create**: `~/.claude-usage-widget/lib/geometry.test.js` — 上記の bun テスト
- **Modify**: `~/Library/Application Support/Übersicht/widgets/claude-usage.jsx` — 固定配置→fixed配置＋純粋関数インライン（Task 2）、ドラッグ＆永続化＆リセット（Task 3）

---

## Task 1: 純粋ロジック（座標計算・永続化）を TDD で作る

**Files:**
- Create: `~/.claude-usage-widget/lib/geometry.js`
- Test: `~/.claude-usage-widget/lib/geometry.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`~/.claude-usage-widget/lib/geometry.test.js`:

```js
import { test, expect } from "bun:test";
import {
  PANEL_WIDTH,
  MARGIN,
  initialPos,
  clampPos,
  serializePos,
  parsePos,
} from "./geometry.js";

test("initialPos: 右上にマージン付きで配置", () => {
  expect(initialPos(1440)).toEqual({ x: 1440 - PANEL_WIDTH - MARGIN, y: MARGIN });
});

test("initialPos: 画面が狭いと x は 0 にクランプ", () => {
  expect(initialPos(100)).toEqual({ x: 0, y: MARGIN });
});

test("clampPos: 画面内ならそのまま", () => {
  expect(clampPos(50, 60, 320, 120, 1440, 900)).toEqual({ x: 50, y: 60 });
});

test("clampPos: 右下はみ出しを引き戻す", () => {
  expect(clampPos(2000, 2000, 320, 120, 1440, 900)).toEqual({ x: 1120, y: 780 });
});

test("clampPos: 負値は 0 にクランプ", () => {
  expect(clampPos(-30, -10, 320, 120, 1440, 900)).toEqual({ x: 0, y: 0 });
});

test("serializePos/parsePos: 往復で一致", () => {
  const p = { x: 12, y: 34 };
  expect(parsePos(serializePos(p))).toEqual(p);
});

test("parsePos: 不正入力は null", () => {
  expect(parsePos("not json")).toBeNull();
  expect(parsePos('{"x":"a","y":1}')).toBeNull();
  expect(parsePos(null)).toBeNull();
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `~/.bun/bin/bun test ~/.claude-usage-widget/lib/geometry.test.js`
Expected: FAIL（`Cannot find module './geometry.js'` または import エラー）

- [ ] **Step 3: 最小実装を書く**

`~/.claude-usage-widget/lib/geometry.js`:

```js
// Claude 使用状況ウィジェットの純粋ロジック（座標計算・位置の永続化）。
// この関数群は claude-usage.jsx にも同一実装がインライン展開されている。
// （Übersicht はウィジェットをバンドルなしで単独ロードするため import 不可）
// ロジックを変更したら両方を同期し、ここのテストで担保すること。

export const PANEL_WIDTH = 320; // パネル幅(px)。widget の width と一致させる
export const MARGIN = 14; // 画面端からの初期マージン(px)
export const DEFAULT_PANEL_HEIGHT = 120; // DOM 高さ取得不可時のフォールバック(px)

// 初期位置（現状と同じ右上）
export function initialPos(screenW, panelW = PANEL_WIDTH, margin = MARGIN) {
  return { x: Math.max(0, screenW - panelW - margin), y: margin };
}

// パネルが画面外に消えないようクランプ
export function clampPos(x, y, panelW, panelH, screenW, screenH) {
  const maxX = Math.max(0, screenW - panelW);
  const maxY = Math.max(0, screenH - panelH);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

export function serializePos(pos) {
  return JSON.stringify({ x: pos.x, y: pos.y });
}

export function parsePos(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.x === "number" && typeof o.y === "number") {
      return { x: o.x, y: o.y };
    }
  } catch {}
  return null;
}
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `~/.bun/bin/bun test ~/.claude-usage-widget/lib/geometry.test.js`
Expected: PASS（7 tests pass）

---

## Task 2: ウィジェットを fixed 配置化（純粋関数インライン・ドラッグ無し）

このタスク完了時点では**まだドラッグは出来ない**。保存位置（無ければ右上）に `position: fixed` で表示されることを確認する中間チェックポイント。

**Files:**
- Modify: `~/Library/Application Support/Übersicht/widgets/claude-usage.jsx`

- [ ] **Step 1: `className` の固定配置を外す**

現在（13-20行目）:

```js
export const className = `
  top: 14px;
  right: 14px;
  font-family: -apple-system, "Helvetica Neue", "Hiragino Sans", sans-serif;
  color: #e8e8ea;
  width: 320px;
  z-index: 9999;
`;
```

を次に置換（`top:14px; right:14px;` → `top:0; left:0;`。実際の配置は render 内の fixed パネルで行う）:

```js
// ラッパは原点に固定。実パネルは render 内で position:fixed により配置する
export const className = `
  top: 0;
  left: 0;
  font-family: -apple-system, "Helvetica Neue", "Hiragino Sans", sans-serif;
  color: #e8e8ea;
  z-index: 9999;
`;
```

- [ ] **Step 2: 純粋関数とモジュール定数をインライン追加**

`const WARN = 80;` の**直前**（21行目あたり、`className` ブロックの直後）に挿入:

```js
// --- 位置ロジック（lib/geometry.js のミラー。変更時は両方を同期し lib 側でテスト） ---
const PANEL_WIDTH = 320;
const MARGIN = 14;
const DEFAULT_PANEL_HEIGHT = 120;
const POS_KEY = "claude-usage-pos";
const PANEL_ID = "claude-usage-panel";

function initialPos(screenW, panelW = PANEL_WIDTH, margin = MARGIN) {
  return { x: Math.max(0, screenW - panelW - margin), y: margin };
}

function clampPos(x, y, panelW, panelH, screenW, screenH) {
  const maxX = Math.max(0, screenW - panelW);
  const maxY = Math.max(0, screenH - panelH);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

function serializePos(pos) {
  return JSON.stringify({ x: pos.x, y: pos.y });
}

function parsePos(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.x === "number" && typeof o.y === "number") {
      return { x: o.x, y: o.y };
    }
  } catch {}
  return null;
}

// 現在位置のモジュールキャッシュ。30秒ごとの再描画で失わないため module スコープで保持。
let pos = null;

function loadPos() {
  if (pos) return pos;
  try {
    const saved = parsePos(window.localStorage.getItem(POS_KEY));
    pos = saved || initialPos(window.innerWidth);
  } catch {
    pos = initialPos(window.innerWidth);
  }
  return pos;
}
// --- /位置ロジック ---
```

- [ ] **Step 3: `render` の `shellStyle` に fixed 配置を追加**

現在（106-114行目）:

```js
  const shellStyle = {
    background: "rgba(28,28,30,0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "8px 12px",
    boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
  };
```

を次に置換（先頭で位置を読み、fixed 配置と幅を付与）:

```js
  const p = loadPos();
  const shellStyle = {
    position: "fixed",
    left: p.x + "px",
    top: p.y + "px",
    width: 320,
    background: "rgba(28,28,30,0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "8px 12px",
    boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
  };
```

- [ ] **Step 4: 3つの return の外側 `div` に `id={PANEL_ID}` を付与**

`render` 内には `<div style={shellStyle}>` が3箇所ある（読み込み中・データ取得待ち・通常表示）。**それぞれ**を `<div id={PANEL_ID} style={shellStyle}>` に変更する。

該当箇所:
1. 読み込み中（118行目付近）: `return (\n      <div style={shellStyle}>` → `<div id={PANEL_ID} style={shellStyle}>`
2. データ取得待ち（127行目付近）: `return (\n      <div style={shellStyle}>` → `<div id={PANEL_ID} style={shellStyle}>`
3. 通常表示（142行目付近）: `return (\n    <div style={shellStyle}>` → `<div id={PANEL_ID} style={shellStyle}>`

- [ ] **Step 5: Übersicht で手動確認（中間チェックポイント）**

確認手順:
1. Übersicht メニュー > "Refresh All Widgets"（または該当ウィジェットを更新）。
2. ウィジェットが**従来どおり右上**に表示されること（`localStorage` 未保存なので `initialPos` の右上）。
3. 表示内容（セッション%・週間%・バー）が従来どおり描画されていること。

期待: 見た目は変更前と実質同じ（右上固定）。ドラッグはまだ出来ない。

---

## Task 3: ドラッグ移動・位置永続化・ダブルクリックでリセット

**Files:**
- Modify: `~/Library/Application Support/Übersicht/widgets/claude-usage.jsx`

- [ ] **Step 1: ドラッグ用のモジュール関数を追加**

Task 2 の Step 2 で追加した `// --- /位置ロジック ---` の**直前**（`loadPos` 関数の直後）に挿入:

```js
function savePos() {
  try {
    window.localStorage.setItem(POS_KEY, serializePos(pos));
  } catch {}
}

function applyPos() {
  const el = document.getElementById(PANEL_ID);
  if (el) {
    el.style.left = pos.x + "px";
    el.style.top = pos.y + "px";
  }
}

let dragging = false;
let offsetX = 0;
let offsetY = 0;

function onDragMove(e) {
  if (!dragging) return;
  const el = document.getElementById(PANEL_ID);
  const panelW = el ? el.offsetWidth : PANEL_WIDTH;
  const panelH = el ? el.offsetHeight : DEFAULT_PANEL_HEIGHT;
  pos = clampPos(
    e.clientX - offsetX,
    e.clientY - offsetY,
    panelW,
    panelH,
    window.innerWidth,
    window.innerHeight,
  );
  applyPos();
}

function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  savePos();
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
}

function onHandleMouseDown(e) {
  e.preventDefault();
  loadPos();
  const el = document.getElementById(PANEL_ID);
  const rect = el ? el.getBoundingClientRect() : { left: pos.x, top: pos.y };
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
  dragging = true;
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
}

function resetPos(e) {
  if (e) e.preventDefault();
  try {
    window.localStorage.removeItem(POS_KEY);
  } catch {}
  pos = initialPos(window.innerWidth);
  applyPos();
}
```

- [ ] **Step 2: `render` 先頭でドラッグハンドル props を定義**

Task 2 Step 3 で置換した `shellStyle` ブロックの**直後**に追加:

```js
  // ヘッダをドラッグハンドル兼リセット操作にする
  const handleProps = {
    onMouseDown: onHandleMouseDown,
    onDoubleClick: resetPos,
  };
  const handleCursor = { cursor: "move" };
```

- [ ] **Step 3: 通常表示のヘッダ行にハンドルを適用**

通常表示のヘッダ（現状142-159行目付近）は次の形:

```js
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: 0.4 }}>
          CLAUDE 使用状況
        </span>
```

これを次に置換（`{...handleProps}` 追加・`style` に `cursor:"move"` を合成）:

```js
      <div
        {...handleProps}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          ...handleCursor,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: 0.4 }}>
          CLAUDE 使用状況
        </span>
```

- [ ] **Step 4: データ取得待ち表示のタイトルにハンドルを適用**

データ取得待ち表示（現状129-131行目付近）:

```js
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Claude 使用状況
        </div>
```

を次に置換:

```js
        <div
          {...handleProps}
          style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, ...handleCursor }}
        >
          Claude 使用状況
        </div>
```

- [ ] **Step 5: 読み込み中表示をドラッグ可能にする**

読み込み中表示（現状118-121行目付近）はヘッダが無いので、ボックス自体をハンドルにする:

```js
    return (
      <div id={PANEL_ID} style={shellStyle}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Claude 使用状況: 読み込み中…</div>
      </div>
    );
```

を次に置換（内側テキストに `{...handleProps}` と `cursor:move`）:

```js
    return (
      <div id={PANEL_ID} style={shellStyle}>
        <div {...handleProps} style={{ fontSize: 12, opacity: 0.7, ...handleCursor }}>
          Claude 使用状況: 読み込み中…
        </div>
      </div>
    );
```

- [ ] **Step 6: 純粋ロジックの回帰テスト（変更が無いことの確認）**

ウィジェットにインラインした関数は lib と同一実装。lib テストが引き続き合格することを確認。

Run: `~/.bun/bin/bun test ~/.claude-usage-widget/lib/geometry.test.js`
Expected: PASS（7 tests pass）

- [ ] **Step 7: Übersicht で手動GUI確認**

前提セットアップ（未実施なら先に実施。Task 4 参照）後:
1. Übersicht のインタラクションモードを ON にする（割り当てたショートカット）。
2. ウィジェットの**ヘッダ "CLAUDE 使用状況" をドラッグ** → 任意位置へ移動できること。
3. 画面の右端・下端へ強くドラッグ → パネルが画面外に消えず端で止まること（clamp）。
4. インタラクションモードを OFF → 位置が維持され、クリックはデスクトップへ抜ける（通常表示）こと。
5. ヘッダを**ダブルクリック** → 右上の初期位置へ戻ること。
6. Übersicht を再起動（quit → 起動） → 直近のドラッグ位置が復元されること（`localStorage` 永続）。

期待: 1〜6 すべて成立。

---

## Task 4: インタラクションモードのセットアップ手順（ユーザ作業・一度きり）

ドラッグ操作には Übersicht がマウスイベントを受け取れる状態が必要。以下はユーザが一度だけ行う設定（コードではない）。実装担当はこの手順をユーザに案内する。

- [ ] **Step 1: インタラクション用ショートカットを割り当てる**

Übersicht メニューバーアイコン > Preferences（環境設定）> 操作（Interaction）用ショートカットを任意のキーに割り当てる。

- [ ] **Step 2: アクセシビリティ許可を与える**

システム設定 > プライバシーとセキュリティ > アクセシビリティ で Übersicht を ON にする。

- [ ] **Step 3: 動作確認**

Task 3 Step 7 の手動GUI確認を実施し、ドラッグ・リセット・永続が成立することを確認する。

---

## Self-Review メモ

- **Spec coverage**: 位置永続化(Task1/2/3) / fixed配置(Task2) / ドラッグ(Task3) / clamp純粋関数+テスト(Task1) / リセット(Task3) / 前提セットアップ(Task4) / 検証(各Task手動・自動) — 設計書 §3〜§5 を網羅。
- **Placeholder scan**: TBD/TODO 無し。全コードブロックは実コード。
- **Type consistency**: `pos={x,y}` 形・`clampPos(x,y,panelW,panelH,screenW,screenH)`・`PANEL_ID`/`POS_KEY`/`PANEL_WIDTH`/`MARGIN`/`DEFAULT_PANEL_HEIGHT` は lib とウィジェットで一致。
- **既知の割り切り**: 純粋関数は lib（テスト正本）とウィジェット（実行）の二重定義。Übersicht のノーバンドル単独ロード制約による。両者同期はコメントで明示。
- **スコープ外**: 四隅スナップ・マルチディスプレイ補正・バージョン管理導入。
