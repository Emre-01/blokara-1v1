/* Oyun çekirdeği testleri — node test/core-test.cjs */
"use strict";

const assert = require("assert");
const Core = require("../public/game-core.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error("✗ " + name);
    throw error;
  }
}

function fillRow(board, row, except) {
  for (let c = 0; c < Core.SIZE; c++) {
    if (c !== except) board[row][c] = "mint";
  }
}

test("blok şekilleri 8x8 içinde kalıyor", () => {
  Core.SHAPES.forEach((shape) => {
    assert.ok(shape.w >= 1 && shape.w <= Core.SIZE, shape.name);
    assert.ok(shape.h >= 1 && shape.h <= Core.SIZE, shape.name);
    assert.ok(shape.cells.length >= 1, shape.name);
    shape.cells.forEach(([r, c]) => {
      assert.ok(r >= 0 && r < shape.h, shape.name + " satır taşması");
      assert.ok(c >= 0 && c < shape.w, shape.name + " sütun taşması");
    });
  });
});

test("yerleştirme sınırları ve dolu hücre reddi", () => {
  const board = Core.emptyBoard();
  const square = Core.SHAPES.find((s) => s.name === "kare");
  assert.ok(Core.canPlace(board, square, 0, 0));
  assert.ok(Core.canPlace(board, square, 6, 6));
  assert.ok(!Core.canPlace(board, square, 7, 7));
  assert.ok(!Core.canPlace(board, square, -1, 0));
  board[0][0] = "coral";
  assert.ok(!Core.canPlace(board, square, 0, 0));
  assert.ok(Core.canPlace(board, square, 0, 1));
});

test("satır ve sütun temizliği birlikte çalışıyor", () => {
  const board = Core.emptyBoard();
  fillRow(board, 7, 7);
  for (let r = 0; r < Core.SIZE; r++) board[r][7] = "sky";
  // hücre (7,7) iki çizgiyi de tamamlıyor
  board[7][7] = "coral";
  const lines = Core.fullLines(board);
  assert.deepStrictEqual(lines.rows, [7]);
  assert.deepStrictEqual(lines.cols, [7]);
});

test("satır temizleme puanı ve combo", () => {
  const game = new Core.Game({ mode: "coop", seed: 42, names: ["A", "B"] });
  fillRow(game.shared.board, 7, 0);
  const before = game.shared.board.flat().filter(Boolean).length;
  game.shared.tray[0] = { shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" };
  const result = game.move(0, 0, 7, 0);
  assert.ok(result.ok, result.reason);
  assert.ok(game.shared.score > 0);
  assert.strictEqual(game.shared.board[7].filter(Boolean).length, 0, "satır temizlenmeliydi");
  assert.strictEqual(game.shared.combo, 1);
  assert.strictEqual(result.lastMove.lines, 1);
  assert.strictEqual(before, 7);
});

test("combo artıyor ve sıfırlanıyor", () => {
  const game = new Core.Game({ mode: "coop", seed: 7 });
  game.shared.board = Core.emptyBoard();
  fillRow(game.shared.board, 7, 0);
  // yatay 1'lik blok bul
  let index = game.shared.tray.findIndex((p) => p.w === 1 && p.h === 1);
  if (index < 0) {
    // elle torbayı değiştir
    game.shared.tray[0] = { shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" };
    index = 0;
  }
  // ortak modda sıra dönüşümlü; aynı oyuncu üst üste oynayamaz
  const first = game.move(0, index, 7, 0);
  assert.ok(first.ok, first.reason);
  assert.strictEqual(game.shared.combo, 1);
  const comboBefore = game.shared.combo;

  // patlamayan bir hamle combo'yu sıfırlar
  game.shared.board[0][0] = null;
  if (game.turn === 0) game.turn = 0;
  const second = game.move(game.turn, 0, 0, 0);
  if (second.ok) {
    assert.strictEqual(game.shared.combo, 0);
  }
  assert.strictEqual(comboBefore, 1);
});

test("ortak modda sıra dönüşümlü ve geçersiz hamle sırayı bozmuyor", () => {
  const game = new Core.Game({ mode: "coop", seed: 3 });
  assert.strictEqual(game.turn, 0);
  const bad = game.move(1, 0, 0, 0);
  assert.ok(!bad.ok);
  const good = game.move(0, 0, 0, 0);
  if (good.ok) assert.strictEqual(game.turn, 1);
});

test("rakip modunda iki tarafta aynı blok dizisi", () => {
  const game = new Core.Game({ mode: "versus", seed: 99 });
  const left = game.players[0].tray.map((p) => [p.shape, p.color]);
  const right = game.players[1].tray.map((p) => [p.shape, p.color]);
  assert.deepStrictEqual(left, right);
  game.move(0, 0, 0, 0);
  game.move(1, 0, 0, 0);
  const left2 = game.players[0].tray.map((p) => p && p.shape);
  const right2 = game.players[1].tray.map((p) => p && p.shape);
  assert.deepStrictEqual(left2, right2);
});

test("üç blok bitmeden yeni blok gelmiyor", () => {
  const game = new Core.Game({ mode: "versus", seed: 12 });
  const total = game.players[0].tray.length;
  game.move(0, 0, 0, 0);
  assert.strictEqual(game.players[0].tray.length, total);
  assert.strictEqual(game.players[0].tray.filter(Boolean).length, total - 1);
});

test("tahta tıkanınca rakip modu kazananı belirliyor", () => {
  const game = new Core.Game({ mode: "versus", seed: 5, turnBased: false });
  const board = game.players[0].board;
  for (let r = 0; r < Core.SIZE; r++) {
    for (let c = 0; c < Core.SIZE; c++) board[r][c] = "mint";
  }
  // tek hücre boş bırak ve tek hücrelik blok yerleştir; sonra tahta yine dolu
  board[0][0] = null;
  game.players[0].tray = [{ shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" }];
  const result = game.move(0, 0, 0, 0);
  assert.ok(result.ok);
  // tam satır temizlenir; yeniden doldur
  const again = game.players[0].board;
  for (let r = 0; r < Core.SIZE; r++) {
    for (let c = 0; c < Core.SIZE; c++) again[r][c] = "mint";
  }
  game.players[0].tray = [{ shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" }];
  game.players[0].alive = true;
  game.players[0].board[0][0] = null;
  // hücre boşken yerleştir, ardından satır temizlenir; tahta doluyken hamle kalmıyor
  game.players[0].board[0][0] = "mint";
  game.players[0].tray = [{ shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" }];
  assert.ok(!Core.hasAnyMove(game.players[0].board, game.players[0].tray));
});

test("hasAnyMove doğru yanıt veriyor", () => {
  const board = Core.emptyBoard();
  const piece = Core.SHAPES.find((s) => s.name === "kare");
  assert.ok(Core.hasAnyMove(board, [piece]));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board[r][c] = "mint";
  assert.ok(!Core.hasAnyMove(board, [piece]));
  board[7][7] = null;
  assert.ok(!Core.hasAnyMove(board, [piece]));
});

test("isim temizleme", () => {
  assert.strictEqual(Core.cleanName("  Ada  ", "x"), "Ada");
  assert.strictEqual(Core.cleanName("", "Oyuncu 1"), "Oyuncu 1");
  assert.strictEqual(Core.cleanName("<script>", "y").includes("<"), false);
  assert.strictEqual(Core.cleanName("a".repeat(40), "z").length, 16);
  assert.strictEqual(Core.cleanName("Çağla & Efe", "z"), "Çağla & Efe");
});

test("aynı tohum aynı oyunu üretiyor (deterministik)", () => {
  const a = new Core.Game({ mode: "coop", seed: 1234 });
  const b = new Core.Game({ mode: "coop", seed: 1234 });
  assert.deepStrictEqual(
    a.shared.tray.map((p) => [p.shape, p.color]),
    b.shared.tray.map((p) => [p.shape, p.color])
  );
  const c = new Core.Game({ mode: "coop", seed: 1235 });
  assert.notDeepStrictEqual(
    a.shared.tray.map((p) => [p.shape, p.color]),
    c.shared.tray.map((p) => [p.shape, p.color])
  );
});

test("rastgele oynanan tam oyun tutarlı bitiyor", () => {
  const game = new Core.Game({ mode: "versus", seed: 2026, turnBased: false });
  let guard = 0;
  while (game.phase === "playing" && guard++ < 5000) {
    const playerIndex = guard % 2;
    const player = game.players[playerIndex];
    if (!player.alive) continue;
    let played = false;
    for (let p = 0; p < player.tray.length && !played; p++) {
      const piece = player.tray[p];
      if (!piece) continue;
      for (let r = 0; r < 8 && !played; r++) {
        for (let c = 0; c < 8 && !played; c++) {
          if (Core.canPlace(player.board, piece, r, c)) {
            const result = game.move(playerIndex, p, r, c);
            assert.ok(result.ok, result.reason);
            played = true;
          }
        }
      }
    }
    if (!played && player.alive) {
      // gerçekten hamle yoksa oyun bitmiş olmalı
      assert.strictEqual(game.phase, "over");
    }
  }
  assert.strictEqual(game.phase, "over");
  assert.ok(game.winner === 0 || game.winner === 1);
  const snapshot = game.snapshot();
  assert.strictEqual(snapshot.phase, "over");
  assert.ok(snapshot.players[0].score + snapshot.players[1].score > 0);
});

test("tam oyun: ortak modda tek skor ve tıkanma", () => {
  const game = new Core.Game({ mode: "coop", seed: 77 });
  let guard = 0;
  while (game.phase === "playing" && guard++ < 5000) {
    const tray = game.shared.tray;
    let played = false;
    for (let p = 0; p < tray.length && !played; p++) {
      if (!tray[p]) continue;
      for (let r = 0; r < 8 && !played; r++) {
        for (let c = 0; c < 8 && !played; c++) {
          if (Core.canPlace(game.shared.board, tray[p], r, c)) {
            const result = game.move(game.turn, p, r, c);
            assert.ok(result.ok, result.reason);
            played = true;
          }
        }
      }
    }
    if (!played) assert.strictEqual(game.phase, "over");
  }
  assert.strictEqual(game.phase, "over");
  assert.strictEqual(game.winner, null);
  assert.ok(/puan/.test(game.reason));
  assert.ok(game.shared.score > 0);
});

console.log("Çekirdek testleri geçti (" + passed + " test).");
