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

  /* Puanlama: yerleştirme puan vermez. Puan yalnızca patlayan çizgilerden gelir.
     Satır ve sütun aynı hamlede patlarsa "haç" bonusu eklenir; combo hepsini çarpar. */
  var LINE_POINTS = 25;    // patlayan her satır/sütun
  var CROSS_BONUS = 90;    // satır + sütun birlikte patlarsa sabit bonus
  var CROSS_POINTS = 35;   // kesişen her satır×sütun çifti

  function linePoints(lines, combo) {
    var rows = lines.rows.length;
    var cols = lines.cols.length;
    var total = rows + cols;
    if (!total) return 0;
    var base = total * LINE_POINTS;
    if (rows > 0 && cols > 0) base += CROSS_BONUS + rows * cols * CROSS_POINTS;
    return Math.round(base * Math.max(1, combo || 1));
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
      penalties: 0,
      alive: true,
      connected: true,
      board: withBoard ? emptyBoard() : null,
      tray: withBoard ? [] : null,
      trayIndex: 0
    };
  }

  var TIME_MODES = ["shared", "turn", "none"];
  var DEFAULT_TIME = 120;   // ortak sayaç (saniye)
  var DEFAULT_TURN = 30;    // sıra başına sayaç (saniye)
  var TURN_PENALTY = 15;    // süresi dolan oyuncunun puan cezası
  var LINE_TIME = 2;        // patlayan satır başına kazanılan saniye
  var COMBO_TIME = 0.75;    // combo başına ek saniye

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeTimeMode(value) {
    return TIME_MODES.indexOf(value) >= 0 ? value : "shared";
  }

  function maxClock(limit) {
    return Math.round(limit * 1.5 * 10) / 10;
  }

  /* Alt satırlara, iki delikli çöp satırlar ekler. Taşan blok varsa true döner. */
  function addGarbage(board, count, rng) {
    var overflow = false;
    for (var r = 0; r < count; r++) {
      if (board[r].some(function (cell) { return !!cell; })) overflow = true;
    }
    for (var i = 0; i < count; i++) {
      board.shift();
      var holes = {};
      var a = Math.floor((rng ? rng() : Math.random()) * SIZE);
      var b = Math.floor((rng ? rng() : Math.random()) * (SIZE - 1));
      if (b >= a) b += 1;
      holes[a] = true;
      holes[b] = true;
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(holes[c] ? null : "stone");
      board.push(row);
    }
    return overflow;
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
    this.timeMode = normalizeTimeMode(options.timeMode);
    this.timeLimit = options.timeLimit > 0 ? options.timeLimit : DEFAULT_TIME;
    this.turnLimit = options.turnLimit > 0 ? options.turnLimit : DEFAULT_TURN;
    this.turnPenalty = options.turnPenalty > 0 ? options.turnPenalty : TURN_PENALTY;
    this.timeLeft = this.timeMode === "shared" ? this.timeLimit : null;
    this.turnLeft = this.timeMode === "turn" && this.turnBased ? this.turnLimit : null;
    this.timeouts = { 0: 0, 1: 0 };
    var names = options.names || ["Oyuncu 1", "Oyuncu 2"];
    var withBoard = this.mode === "versus";
    this.players = [newPlayer(names[0], 0, withBoard), newPlayer(names[1], 1, withBoard)];
    var self = this;
    this.players.forEach(function (player) {
      player.timeLeft = self.timeMode === "turn" && !self.turnBased ? self.turnLimit : null;
    });

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
    var points = linePoints(lines, holder.combo);

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

    // Ödül: patlayan satır (ve combo) süre kazandırır.
    var timeBonus = 0;
    if (this.timeMode !== "none") {
      if (this.timeMode === "turn" && !this.turnBased) {
        // Eşzamanlı rakipte hamle yapmak kendi saatini yeniler.
        player.timeLeft = this.turnLimit;
      }
      if (lineCount) {
        timeBonus = lineCount * LINE_TIME + Math.max(0, holder.combo - 1) * COMBO_TIME;
        timeBonus = Math.round(timeBonus * 100) / 100;
        this.grantTime(playerIndex, timeBonus);
      }
    }

    // Rakip modunda baskı: 2 satır → 1, 3+ satır → 2 çöp satır.
    var garbage = null;
    if (this.mode === "versus" && lineCount >= 2 && this.phase === "playing") {
      var rivalIndex = 1 - playerIndex;
      var rival = this.players[rivalIndex];
      var rows = lineCount >= 3 ? 2 : 1;
      var overflow = addGarbage(rival.board, rows, this.rng);
      garbage = { to: rivalIndex, rows: rows, overflow: overflow };
      if (overflow) {
        this.finish(playerIndex, rival.name + " tahtasından taştı. " + player.name + " kazandı.");
      } else if (rival.alive && !hasAnyMove(rival.board, rival.tray)) {
        rival.alive = false;
        this.finish(playerIndex, rival.name + " tahtası çöple kapandı. " + player.name + " kazandı.");
      }
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
      refilled: refilled,
      timeBonus: timeBonus,
      garbage: garbage
    };
    this.seq++;

    if (this.mode === "coop") {
      if (!hasAnyMove(this.shared.board, this.shared.tray)) {
        this.finish(null, "Tahta tıkandı. Takım " + this.shared.score + " puanda kaldı.");
      } else if (this.turnBased) {
        this.advanceTurn();
      }
    } else if (this.phase === "playing") {
      if (!hasAnyMove(player.board, player.tray)) {
        player.alive = false;
        var winner = 1 - playerIndex;
        this.finish(winner, player.name + " tahtası doldu. " + this.players[winner].name + " kazandı.");
      } else if (this.turnBased) {
        this.advanceTurn();
      }
    }

    return { ok: true, lastMove: this.lastMove, phase: this.phase, winner: this.winner };
  };

  Game.prototype.advanceTurn = function () {
    this.turn = 1 - this.turn;
    if (this.timeMode === "turn" && this.turnBased) this.turnLeft = this.turnLimit;
  };

  /* Süre ödülünü doğru saate ekler. */
  Game.prototype.grantTime = function (playerIndex, seconds) {
    if (this.timeMode === "shared") {
      this.timeLeft = Math.min(maxClock(this.timeLimit), this.timeLeft + seconds);
    } else if (this.timeMode === "turn") {
      if (this.turnBased) {
        this.turnLeft = Math.min(maxClock(this.turnLimit), (this.turnLeft || 0) + seconds);
      } else {
        var player = this.players[playerIndex];
        if (player) player.timeLeft = Math.min(maxClock(this.turnLimit), (player.timeLeft || 0) + seconds);
      }
    }
  };

  Game.prototype.currentClock = function () {
    if (this.timeMode === "shared") return this.timeLeft;
    if (this.timeMode === "turn") {
      if (this.turnBased) return this.turnLeft;
      var player = this.players[this.turn];
      return player ? player.timeLeft : null;
    }
    return null;
  };

  /* Saati ilerletir. dt saniye. Sonuç: {over, penalty, timeBonus} */
  Game.prototype.tick = function (dt) {
    var out = { over: false, penalty: null };
    if (this.phase !== "playing" || this.timeMode === "none") return out;
    dt = Math.max(0, Math.min(30, Number(dt) || 0));
    if (!dt) return out;

    if (this.timeMode === "shared") {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this.finishByTime();
      out.over = this.phase === "over";
      return out;
    }

    if (this.turnBased) {
      this.turnLeft = Math.max(0, this.turnLeft - dt);
      if (this.turnLeft <= 0) {
        var idx = this.turn;
        this.applyTimeout(idx);
        out.penalty = idx;
        this.turnLeft = this.turnLimit;
        this.advanceTurn();
      }
      return out;
    }

    var self = this;
    this.players.forEach(function (player, index) {
      if (!player.alive) return;
      player.timeLeft = Math.max(0, player.timeLeft - dt);
      if (player.timeLeft <= 0) {
        self.applyTimeout(index);
        player.timeLeft = self.turnLimit;
        out.penalty = index;
      }
    });
    return out;
  };

  Game.prototype.applyTimeout = function (playerIndex) {
    var player = this.players[playerIndex];
    if (!player) return;
    player.penalties += 1;
    this.timeouts[playerIndex] = (this.timeouts[playerIndex] || 0) + 1;
    player.combo = 0;
    var holder = this.mode === "coop" ? this.shared : player;
    holder.combo = 0;
    player.score = Math.max(0, player.score - this.turnPenalty);
    if (this.mode === "coop") {
      this.shared.score = Math.max(0, this.shared.score - this.turnPenalty);
      this.shared.combo = 0;
    }
    this.seq++;
  };

  Game.prototype.finishByTime = function () {
    if (this.mode === "coop") {
      this.finish(null, "Süre doldu. Takım " + this.shared.score + " puanda kaldı.");
      return;
    }
    var a = this.players[0];
    var b = this.players[1];
    if (a.score === b.score) {
      this.finish(null, "Süre doldu. Skorlar eşit: " + a.score + ".");
      return;
    }
    var winner = a.score > b.score ? 0 : 1;
    this.finish(winner, "Süre doldu. " + this.players[winner].name + " " +
      Math.max(a.score, b.score) + " puanla kazandı.");
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
      timeMode: this.timeMode,
      timeLimit: this.timeLimit,
      timeLeft: this.timeLeft,
      turnLimit: this.turnLimit,
      turnLeft: this.turnLeft,
      turnPenalty: this.turnPenalty,
      players: this.players.map(function (player) {
        return {
          name: player.name,
          score: player.score,
          blocks: player.blocks,
          lines: player.lines,
          combo: player.combo,
          moves: player.moves,
          penalties: player.penalties,
          alive: player.alive,
          connected: player.connected,
          timeLeft: player.timeLeft,
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

  /* ------------------------------------------------------------------ */
  /* bot                                                                */
  /* ------------------------------------------------------------------ */

  var BOT_LEVELS = ["easy", "normal", "hard"];

  function normalizeBotLevel(value) {
    return BOT_LEVELS.indexOf(value) >= 0 ? value : "normal";
  }

  /* Tahtayı kopyalayıp hamleyi dener, sonucu puanlar. */
  function scorePlacement(board, piece, row, col) {
    if (!canPlace(board, piece, row, col)) return null;
    var next = cloneBoard(board);
    piece.cells.forEach(function (cell) {
      next[row + cell[0]][col + cell[1]] = piece.color || "mint";
    });
    var lines = fullLines(next);
    var cleared = lines.rows.length + lines.cols.length;
    if (cleared) {
      lines.rows.forEach(function (r) {
        for (var c = 0; c < SIZE; c++) next[r][c] = null;
      });
      lines.cols.forEach(function (c) {
        for (var r = 0; r < SIZE; r++) next[r][c] = null;
      });
    }

    var lineClear = linePoints(lines, 1) * 10;
    var score = lineClear + piece.cells.length * 1.2;

    // Komşuluk: yerleşen taşların dolu komşusu olması iyi.
    var neighbours = 0;
    piece.cells.forEach(function (cell) {
      var r = row + cell[0];
      var c = col + cell[1];
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (pair) {
        if (pair[0] < 0 || pair[1] < 0 || pair[0] >= SIZE || pair[1] >= SIZE) return;
        if (next[pair[0]][pair[1]]) neighbours++;
      });
    });
    score += neighbours * 2.2;

    // Delik: üstü dolu olan boş hücre cezalı.
    var holes = 0;
    var height = new Array(SIZE).fill(0);
    for (var c = 0; c < SIZE; c++) {
      var seen = false;
      for (var r = 0; r < SIZE; r++) {
        if (next[r][c]) {
          if (!seen) height[c] = SIZE - r;
          seen = true;
        } else if (seen) {
          holes++;
        }
      }
    }
    score -= holes * 6;

    // Pürüzlülük: sütun yükseklikleri arasındaki fark.
    var roughness = 0;
    for (var i = 0; i < SIZE; i++) {
      var diff = Math.abs(height[i] - height[(i + 1) % SIZE]);
      roughness += diff;
    }
    score -= roughness * 0.5;

    // Tahtayı doldurma cezası (sonraki hamle alanı).
    var filled = countCells(next);
    score -= filled * 0.35;

    return { score: score, piece: piece, row: row, col: col, cleared: cleared };
  }

  function botMove(board, tray, level, rng) {
    level = normalizeBotLevel(level);
    var random = rng || Math.random;
    var options = [];
    for (var p = 0; p < (tray || []).length; p++) {
      var piece = tray[p];
      if (!piece) continue;
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          var result = scorePlacement(board, piece, r, c);
          if (result) {
            result.pieceIndex = p;
            options.push(result);
          }
        }
      }
    }
    if (!options.length) return null;
    options.sort(function (a, b) { return b.score - a.score; });

    var pick;
    if (level === "easy") {
      pick = options[Math.floor(random() * Math.min(options.length, Math.max(1, Math.ceil(options.length * 0.6))))];
    } else if (level === "normal") {
      var pool = options.slice(0, Math.min(4, options.length));
      pick = pool[Math.floor(random() * pool.length)];
    } else {
      pick = options[0];
    }
    return {
      piece: pick.pieceIndex,
      row: pick.row,
      col: pick.col,
      cleared: pick.cleared,
      rank: options.indexOf(pick)
    };
  }

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
    linePoints: linePoints,
    LINE_POINTS: LINE_POINTS,
    CROSS_BONUS: CROSS_BONUS,
    CROSS_POINTS: CROSS_POINTS,
    hasAnyMove: hasAnyMove,
    countCells: countCells,
    cleanName: cleanName,
    addGarbage: addGarbage,
    botMove: botMove,
    BOT_LEVELS: BOT_LEVELS,
    TIME_MODES: TIME_MODES,
    DEFAULT_TIME: DEFAULT_TIME,
    DEFAULT_TURN: DEFAULT_TURN,
    TURN_PENALTY: TURN_PENALTY,
    player: newPlayer
  };
});
