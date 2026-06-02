import { test, expect } from "bun:test";
import {
  PANEL_WIDTH,
  MARGIN,
  MARGIN_RIGHT,
  initialPos,
  clampPos,
  serializePos,
  parsePos,
} from "./geometry.js";

test("initialPos: 右上に配置（上=MARGIN, 右=MARGIN_RIGHT）", () => {
  expect(initialPos(1440)).toEqual({ x: 1440 - PANEL_WIDTH - MARGIN_RIGHT, y: MARGIN });
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

test("clampPos: margin 指定で右下も余白を残して止まる（端ぴったりにしない）", () => {
  expect(clampPos(2000, 2000, 320, 120, 1440, 900, 14)).toEqual({
    x: 1440 - 320 - 14,
    y: 900 - 120 - 14,
  });
});

test("clampPos: margin 指定で左上も余白を残す", () => {
  expect(clampPos(0, 0, 320, 120, 1440, 900, 14)).toEqual({ x: 14, y: 14 });
});

test("clampPos: margin 既定値は 0（従来挙動）", () => {
  expect(clampPos(2000, 2000, 320, 120, 1440, 900)).toEqual({ x: 1120, y: 780 });
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
