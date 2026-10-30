/* Blok İki — ortak oyun çekirdeği.
   Tarayıcıda window.BlokIki, Node'da module.exports olarak çalışır. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BlokIki = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SIZE = 8;

  var PALETTE = ["coral", "cobalt", "mustard", "mint", "grape", "sky"];

  // rows: "X" dolu hücre, "." boş. weight: torbaya girme ağırlığı.
  var RAW_SHAPES = [
    { name: "nokta", rows: ["X"], weight: 3 },
    { name: "ikili-y", rows: ["XX"], weight: 7 },
    { name: "ikili-d", rows: ["X", "X"], weight: 7 },
    { name: "uclu-y", rows: ["XXX"], weight: 6 },
    { name: "uclu-d", rows: ["X", "X", "X"], weight: 6 },
    { name: "dortlu-y", rows: ["XXXX"], weight: 3 },
    { name: "dortlu-d", rows: ["X", "X", "X", "X"], weight: 3 },
    { name: "kare", rows: ["XX", "XX"], weight: 6 },
    { name: "kose-a", rows: ["XX", "X."], weight: 4 },
    { name: "kose-b", rows: ["XX", ".X"], weight: 4 },
    { name: "kose-c", rows: ["X.", "XX"], weight: 4 },
    { name: "kose-d", rows: [".X", "XX"], weight: 4 },
    { name: "T-a", rows: ["XXX", ".X."], weight: 2 },
    { name: "T-b", rows: [".X.", "XXX"], weight: 2 },
    { name: "T-c", rows: ["X.", "XX", "X."], weight: 2 },
    { name: "T-d", rows: [".X", "XX", ".X"], weight: 2 },
    { name: "S-a", rows: [".XX", "XX."], weight: 2 },
    { name: "S-b", rows: ["XX.", ".XX"], weight: 2 },
    { name: "S-c", rows: ["X.", "XX", ".X"], weight: 2 },
    { name: "S-d", rows: [".X", "XX", "X."], weight: 2 },
    { name: "L-a", rows: ["X..", "XXX"], weight: 2.5 },
    { name: "L-b", rows: ["XXX", "..X"], weight: 2.5 },
    { name: "L-c", rows: ["XX", "X.", "X."], weight: 2.5 },
    { name: "L-d", rows: ["X.", "X.", "XX"], weight: 2.5 },
    { name: "J-a", rows: ["..X", "XXX"], weight: 2.5 },
    { name: "J-b", rows: ["XXX", "X.."], weight: 2.5 },
    { name: "J-c", rows: ["X.", "X.", "XX"], weight: 2.5 },
    { name: "J-d", rows: ["XX", ".X", ".X"], weight: 2.5 },
    { name: "kose-3x3-a", rows: ["X..", "X..", "XXX"], weight: 1.4 },
    { name: "kose-3x3-b", rows: ["..X", "..X", "XXX"], weight: 1.4 },
    { name: "kose-3x3-c", rows: ["XXX", "X..", "X.."], weight: 1.4 },
    { name: "kose-3x3-d", rows: ["XXX", "..X", "..X"], weight: 1.4 },
    { name: "U-a", rows: ["X.X", "XXX"], weight: 1.2 },
    { name: "U-b", rows: ["XXX", "X.X"], weight: 1.2 },
    { name: "U-c", rows: ["XX", "X.", "XX"], weight: 1.2 },
    { name: "U-d", rows: ["XX", ".X", "XX"], weight: 1.2 },
    { name: "arti", rows: [".X.", "XXX", ".X."], weight: 0.8 },
    { name: "dikdortgen-2x3", rows: ["XXX", "XXX"], weight: 1.1 },
    { name: "dikdortgen-3x2", rows: ["XX", "XX", "XX"], weight: 1.1 },
    { name: "kare-3", rows: ["XXX", "XXX", "XXX"], weight: 0.35 },
    { name: "capraz-2-a", rows: ["X.", ".X"], weight: 1.1 },
    { name: "capraz-2-b", rows: [".X", "X."], weight: 1.1 },
    { name: "capraz-3", rows: ["X..", ".X.", "..X"], weight: 0.45 }
  ];

  var SHAPES = RAW_SHAPES.map(function (shape, index) {
    var cells = [];
    var width = 0;
    shape.rows.forEach(function (row, r) {
      width = Math.max(width, row.length);
      for (var c = 0; c < row.length; c++) {
        if (row[c] === "X") cells.push([r, c]);
      }
    });
    return {
      index: index,
      name: shape.name,
      weight: shape.weight,
      cells: cells,
      w: width,
      h: shape.rows.length
    };
  });

  var TOTAL_WEIGHT = SHAPES.reduce(function (sum, s) { return sum + s.weight; }, 0);

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickShape(rng) {
    var roll = rng() * TOTAL_WEIGHT;
    for (var i = 0; i < SHAPES.length; i++) {
      roll -= SHAPES[i].weight;
      if (roll <= 0) return SHAPES[i];
    }
    return SHAPES[SHAPES.length - 1];
  }

  function pickColor(rng) {
    return PALETTE[Math.floor(rng() * PALETTE.length)];
  }

  function makePiece(rng) {
    var shape = pickShape(rng);
    return {
      shape: shape.index,
      name: shape.name,
      cells: shape.cells,
      w: shape.w,
      h: shape.h,
      color: pickColor(rng)
    };
  }

  function makeGroup(rng) {
    return [makePiece(rng), makePiece(rng), makePiece(rng)];
  }

  function emptyBoard() {
    var board = [];
    for (var r = 0; r < SIZE; r++) {
      board.push(new Array(SIZE).fill(null));
    }
    return board;
  }

  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function canPlace(board, piece, row, col) {
    if (!board || !piece) return false;
    for (var i = 0; i < piece.cells.length; i++) {
      var r = row + piece.cells[i][0];
      var c = col + piece.cells[i][1];
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
      if (board[r][c]) return false;
    }
    return true;
  }

  function fullLines(board) {
    var rows = [];
    var cols = [];
    var r, c, full;
    for (r = 0; r < SIZE; r++) {
      full = true;
      for (c = 0; c < SIZE; c++) {
        if (!board[r][c]) { full = false; break; }
      }
      if (full) rows.push(r);
    }
    for (c = 0; c < SIZE; c++) {
      full = true;
      for (r = 0; r < SIZE; r++) {
        if (!board[r][c]) { full = false; break; }
      }
      if (full) cols.push(c);
    }
    return { rows: rows, cols: cols };
  }

  function hasAnyMove(board, tray) {
    if (!tray) return false;
    for (var p = 0; p < tray.length; p++) {
      if (!tray[p]) continue;
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          if (canPlace(board, tray[p], r, c)) return true;
        }
      }
    }
    return false;
  }

  function countCells(board) {
    var n = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (board[r][c]) n++;
    }
    return n;
  }

  function cleanName(name, fallback) {
    var value = String(name == null ? "" : name)
      .replace(/[\u0000-\u001f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 16);
    return value || fallback;
  }

  function newPlayer(name, index, withBoard) {
    return {
      name: cleanName(name, "Oyuncu " + (index + 1)),
      score: 0,
      blocks: 0,
      lines: 0,
      combo: 0,
      moves: 0,
      alive: true,
      connected: true,
      board: withBoard ? emptyBoard() : null,
      tray: withBoard ? [] : null,
      trayIndex: 0
    };
  }

  function Game(options) {
    options = options || {};
    this.mode = options.mode === "coop" ? "coop" : "versus";
    this.turnBased = this.mode === "coop" ? true : !!options.turnBased;
    this.seed = (options.seed == null ? Date.now() ^ (Math.random() * 1e9) : options.seed) >>> 0;
    this.rng = mulberry32(this.seed);
    this.groups = [];
    this.phase = "playing";
    this.turn = 0;
    this.winner = null;
    this.reason = "";
    this.lastMove = null;
    this.seq = 0;
    var names = options.names || ["Oyuncu 1", "Oyuncu 2"];
    var withBoard = this.mode === "versus";
    this.players = [newPlayer(names[0], 0, withBoard), newPlayer(names[1], 1, withBoard)];

    if (this.mode === "coop") {
      this.shared = {
        board: emptyBoard(),
        tray: this.groupAt(0),
        trayIndex: 0,
        score: 0,
        blocks: 0,
        lines: 0,
        combo: 0,
        moves: 0
      };
    } else {
      this.players.forEach(function (player) {
        player.tray = this.groupAt(0).slice();
      }, this);
    }
  }

  Game.prototype.groupAt = function (index) {
    while (this.groups.length <= index) {
      this.groups.push(makeGroup(this.rng));
    }
    return this.groups[index].map(function (piece) {
      // Torbadaki parçalar paylaşılır; kopya döndür ki kimse yerinde değiştirmesin.
      return { shape: piece.shape, name: piece.name, cells: piece.cells, w: piece.w, h: piece.h, color: piece.color };
    });
  };

  Game.prototype.refill = function (holder) {
    holder.trayIndex++;
    holder.tray = this.groupAt(holder.trayIndex);
  };

  Game.prototype.move = function (playerIndex, pieceIndex, row, col) {
    if (this.phase !== "playing") return { ok: false, reason: "Oyun bitti." };
    var player = this.players[playerIndex];
    if (!player) return { ok: false, reason: "Oyuncu bulunamadı." };
    if (this.mode === "versus" && !player.alive) return { ok: false, reason: "Tahtan doldu." };
    if (this.turnBased && playerIndex !== this.turn) return { ok: false, reason: "Sıra sende değil." };

    var holder = this.mode === "coop" ? this.shared : player;
    var piece = holder.tray[pieceIndex];
    if (!piece) return { ok: false, reason: "Blok bulunamadı." };
    row = Math.floor(row);
    col = Math.floor(col);
    if (!canPlace(holder.board, piece, row, col)) return { ok: false, reason: "Buraya sığmıyor." };

    var placedCells = piece.cells.map(function (cell) {
      return [row + cell[0], col + cell[1]];
    });

    placedCells.forEach(function (cell) {
      holder.board[cell[0]][cell[1]] = piece.color;
    });

    var lines = fullLines(holder.board);
    var lineCount = lines.rows.length + lines.cols.length;
    var cleared = [];
    if (lineCount) {
      lines.rows.forEach(function (r) {
        for (var c = 0; c < SIZE; c++) {
          if (holder.board[r][c]) cleared.push([r, c]);
          holder.board[r][c] = null;
        }
      });
      lines.cols.forEach(function (c) {
        for (var r = 0; r < SIZE; r++) {
          if (holder.board[r][c]) cleared.push([r, c]);
          holder.board[r][c] = null;
        }
      });
    }

    holder.combo = lineCount ? holder.combo + 1 : 0;
    var blockPoints = piece.cells.length;
    var clearPoints = lineCount ? lineCount * 10 * holder.combo : 0;
    var points = blockPoints + clearPoints;

    holder.score += points;
    holder.blocks += piece.cells.length;
    holder.lines += lineCount;
    holder.moves = (holder.moves || 0) + 1;
    // Ortak modda kişisel katkı da görünsün.
    if (this.mode === "coop") {
      player.score += points;
      player.blocks += piece.cells.length;
      player.lines += lineCount;
      player.moves += 1;
    }

    holder.tray[pieceIndex] = null;
    var refilled = false;
    if (holder.tray.every(function (item) { return !item; })) {
      this.refill(holder);
      refilled = true;
    }

    this.lastMove = {
      by: playerIndex,
      piece: { name: piece.name, cells: piece.cells, w: piece.w, h: piece.h, color: piece.color },
      row: row,
      col: col,
      placed: placedCells,
      rows: lines.rows,
      cols: lines.cols,
      cleared: cleared,
      lines: lineCount,
      points: points,
      combo: holder.combo,
      refilled: refilled
    };
    this.seq++;

    if (this.mode === "coop") {
      if (!hasAnyMove(this.shared.board, this.shared.tray)) {
        this.finish(null, "Tahta tıkandı. Takım " + this.shared.score + " puanda kaldı.");
      } else if (this.turnBased) {
        this.turn = 1 - this.turn;
      }
    } else {
      if (!hasAnyMove(player.board, player.tray)) {
        player.alive = false;
        var rival = 1 - playerIndex;
        this.finish(rival, player.name + " tahtası doldu. " + this.players[rival].name + " kazandı.");
      } else if (this.turnBased) {
        this.turn = 1 - this.turn;
      }
    }

    return { ok: true, lastMove: this.lastMove, phase: this.phase, winner: this.winner };
  };

  Game.prototype.finish = function (winner, reason) {
    this.phase = "over";
    this.winner = winner;
    this.reason = reason || "";
    this.seq++;
  };

  Game.prototype.snapshot = function () {
    var mode = this.mode;
    return {
      mode: mode,
      phase: this.phase,
      turn: this.turn,
      turnBased: this.turnBased,
      seq: this.seq,
      winner: this.winner,
      reason: this.reason,
      lastMove: this.lastMove,
      players: this.players.map(function (player) {
        return {
          name: player.name,
          score: player.score,
          blocks: player.blocks,
          lines: player.lines,
          combo: player.combo,
          moves: player.moves,
          alive: player.alive,
          connected: player.connected,
          board: mode === "versus" ? player.board : null,
          tray: mode === "versus" ? player.tray : null
        };
      }),
      shared: mode === "coop" ? {
        board: this.shared.board,
        tray: this.shared.tray,
        score: this.shared.score,
        combo: this.shared.combo,
        blocks: countCells(this.shared.board),
        lines: this.shared.lines,
        moves: this.shared.moves
      } : null
    };
  };

  return {
    SIZE: SIZE,
    PALETTE: PALETTE,
    SHAPES: SHAPES,
    Game: Game,
    mulberry32: mulberry32,
    makeGroup: makeGroup,
    emptyBoard: emptyBoard,
    cloneBoard: cloneBoard,
    canPlace: canPlace,
    fullLines: fullLines,
    hasAnyMove: hasAnyMove,
    countCells: countCells,
    cleanName: cleanName,
    player: newPlayer
  };
});
