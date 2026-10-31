/* Blok İki — yerel ilerleme: XP, seviye, coin, rekorlar, başarımlar, günlük seri.
   Tamamen localStorage üzerinde çalışır; APK çevrimdışıyken de işler. */
(function (root) {
  "use strict";

  var KEY = "blokiki.profile.v1";
  var DAY = 24 * 60 * 60 * 1000;

  var ACHIEVEMENTS = [
    { id: "ilk-oyun", title: "İlk Adım", desc: "İlk oyununu bitir.", goal: 1, reward: 20,
      metric: function (p) { return p.games; }, value: function (p) { return p.games + " oyun"; } },
    { id: "satir-50", title: "Satır Ustası", desc: "Toplam 50 satır patlat.", goal: 50, reward: 40,
      metric: function (p) { return p.totalLines; }, value: function (p) { return p.totalLines + " satır"; } },
    { id: "satir-250", title: "Tahta Temizleyici", desc: "Toplam 250 satır patlat.", goal: 250, reward: 90,
      metric: function (p) { return p.totalLines; }, value: function (p) { return p.totalLines + " satır"; } },
    { id: "combo-3", title: "Combo Kralı", desc: "×3 combo yap.", goal: 3, reward: 30,
      metric: function (p) { return p.maxCombo; }, value: function (p) { return "en iyi ×" + p.maxCombo; } },
    { id: "combo-5", title: "Zincir Tepkimesi", desc: "×5 combo yap.", goal: 5, reward: 70,
      metric: function (p) { return p.maxCombo; }, value: function (p) { return "en iyi ×" + p.maxCombo; } },
    { id: "galibiyet-5", title: "Rakip Korkusu", desc: "5 maç kazan.", goal: 5, reward: 60,
      metric: function (p) { return p.wins; }, value: function (p) { return p.wins + " galibiyet"; } },
    { id: "seri-3", title: "Seri Galip", desc: "3 maç üst üste kazan.", goal: 3, reward: 80,
      metric: function (p) { return p.bestWinStreak; }, value: function (p) { return "en iyi " + p.bestWinStreak + " seri"; } },
    { id: "skor-1000", title: "Binlik", desc: "Bir turda 1000 puan topla.", goal: 1000, reward: 50,
      metric: function (p) { return p.bestAny; }, value: function (p) { return p.bestAny + " puan"; } },
    { id: "skor-3000", title: "Üç Bin", desc: "Bir turda 3000 puan topla.", goal: 3000, reward: 120,
      metric: function (p) { return p.bestAny; }, value: function (p) { return p.bestAny + " puan"; } },
    { id: "gunluk-3", title: "Sadık Oyuncu", desc: "3 gün üst üste günün tahtasını oyna.", goal: 3, reward: 60,
      metric: function (p) { return p.dailyStreak; }, value: function (p) { return p.dailyStreak + " gün"; } },
    { id: "gunluk-7", title: "Haftalık Ritüel", desc: "7 gün üst üste günün tahtasını oyna.", goal: 7, reward: 150,
      metric: function (p) { return p.dailyStreak; }, value: function (p) { return p.dailyStreak + " gün"; } },
    { id: "blok-500", title: "Blok Terzisi", desc: "Toplam 500 blok yerleştir.", goal: 500, reward: 100,
      metric: function (p) { return p.totalBlocks; }, value: function (p) { return p.totalBlocks + " blok"; } }
  ];

  function defaults() {
    return {
      xp: 0,
      coins: 0,
      games: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      bestWinStreak: 0,
      totalLines: 0,
      totalBlocks: 0,
      totalScore: 0,
      maxCombo: 0,
      bestAny: 0,
      best: { coop: 0, versus: 0, bot: 0, daily: 0 },
      dailyStreak: 0,
      dailyLast: "",
      dailyBest: 0,
      unlocked: {},
      muted: false,
      vibrate: true,
      timeMode: "shared",
      botLevel: "normal",
      createdAt: Date.now()
    };
  }

  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (error) { data = null; }
    var base = defaults();
    if (!data || typeof data !== "object") return base;
    Object.keys(base).forEach(function (key) {
      if (data[key] === undefined) data[key] = base[key];
    });
    if (!data.best || typeof data.best !== "object") data.best = base.best;
    Object.keys(base.best).forEach(function (key) {
      if (typeof data.best[key] !== "number") data.best[key] = 0;
    });
    if (!data.unlocked || typeof data.unlocked !== "object") data.unlocked = {};
    return data;
  }

  function save(profile) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (error) { /* yoksay */ }
  }

  function reset() {
    var fresh = defaults();
    save(fresh);
    return fresh;
  }

  /* Seviye n → n+1 için gereken XP. Erken seviyeler hızlı, sonra yavaşlar. */
  function xpForLevel(level) {
    return Math.round(80 * Math.pow(level, 1.18));
  }

  function levelInfo(xp) {
    var level = 1;
    var rest = Math.max(0, xp || 0);
    while (level < 60 && rest >= xpForLevel(level)) {
      rest -= xpForLevel(level);
      level += 1;
    }
    var need = xpForLevel(level);
    return { level: level, into: rest, need: need, percent: Math.min(100, Math.round((rest / need) * 100)) };
  }

  function todayKey(date) {
    var d = date || new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function yesterdayKey() {
    return todayKey(new Date(Date.now() - DAY));
  }

  function dailySeed(date) {
    var d = date || new Date();
    return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) >>> 0;
  }

  function dailyReady(profile) {
    return profile.dailyLast !== todayKey();
  }

  function completeDaily(profile, score) {
    var today = todayKey();
    var fresh = profile.dailyLast !== today;
    if (!fresh) {
      profile.dailyBest = Math.max(profile.dailyBest || 0, score);
      return { newDay: false, streak: profile.dailyStreak || 0, bonus: 0 };
    }
    var continued = profile.dailyLast === yesterdayKey();
    profile.dailyStreak = continued ? (profile.dailyStreak || 0) + 1 : 1;
    profile.dailyLast = today;
    profile.dailyBest = Math.max(profile.dailyBest || 0, score);
    return { newDay: true, streak: profile.dailyStreak, bonus: 20 + Math.min(30, profile.dailyStreak * 5) };
  }

  function refreshDailyStreak(profile) {
    // Gün atlandıysa seri görsel olarak sıfırlanır (oynanınca yeniden 1 olur).
    if (profile.dailyLast && profile.dailyLast !== todayKey() && profile.dailyLast !== yesterdayKey()) {
      profile.dailyStreak = 0;
    }
  }

  function checkAchievements(profile) {
    var unlocked = [];
    ACHIEVEMENTS.forEach(function (item) {
      if (profile.unlocked[item.id]) return;
      if (item.metric(profile) >= item.goal) {
        profile.unlocked[item.id] = Date.now();
        profile.coins += item.reward;
        profile.xp += Math.round(item.reward / 2);
        unlocked.push(item);
      }
    });
    return unlocked;
  }

  function emptyReward() {
    return {
      xp: 0, coins: 0, levelBefore: 1, levelAfter: 1, levelUp: false,
      unlocked: [], newRecord: false, newRecordValue: 0,
      daily: null, win: false
    };
  }

  /* Oyun sonucunu işler. Aynı tur iki kez sayılmamalı; çağıran taraf garanti eder. */
  function recordGame(profile, result) {
    var mode = result.mode || "versus";
    var key = mode === "daily" ? "daily" : (result.bot ? "bot" : (mode === "coop" ? "coop" : "versus"));
    var score = Math.max(0, Math.floor(result.score || 0));
    var lines = Math.max(0, Math.floor(result.lines || 0));
    var blocks = Math.max(0, Math.floor(result.blocks || 0));
    var combo = Math.max(0, Math.floor(result.combo || 0));
    var win = !!result.win;
    var reward = emptyReward();

    reward.levelBefore = levelInfo(profile.xp).level;

    var previousBest = profile.best[key] || 0;
    if (score > previousBest) {
      profile.best[key] = score;
      reward.newRecord = true;
      reward.newRecordValue = score;
    }

    if (mode === "daily") {
      reward.daily = completeDaily(profile, score);
    }

    profile.games += 1;
    profile.totalLines += lines;
    profile.totalBlocks += blocks;
    profile.totalScore += score;
    profile.maxCombo = Math.max(profile.maxCombo || 0, combo);
    profile.bestAny = Math.max(profile.bestAny || 0, score);

    if (mode !== "coop" && mode !== "daily") {
      if (win) {
        profile.wins += 1;
        profile.winStreak = (profile.winStreak || 0) + 1;
        profile.bestWinStreak = Math.max(profile.bestWinStreak || 0, profile.winStreak);
      } else {
        profile.losses += 1;
        profile.winStreak = 0;
      }
    }

    reward.win = win;
    /* Turu bitirmek de bir şey kazandırır: en az 5 XP / 2 coin. */
    reward.xp = 5 + Math.round(score / 8) + lines * 3 + (win ? 25 : 0) + (reward.daily && reward.daily.newDay ? 30 : 0);
    reward.coins = 2 + Math.round(score / 40) + lines * 2 + (win ? 10 : 0) + (reward.daily ? reward.daily.bonus : 0);
    profile.xp += reward.xp;
    profile.coins += reward.coins;

    reward.unlocked = checkAchievements(profile);
    reward.levelAfter = levelInfo(profile.xp).level;
    reward.levelUp = reward.levelAfter > reward.levelBefore;

    save(profile);
    return reward;
  }

  function addCoins(profile, amount) {
    profile.coins = Math.max(0, (profile.coins || 0) + amount);
    save(profile);
  }

  root.BlokProgress = {
    KEY: KEY,
    ACHIEVEMENTS: ACHIEVEMENTS,
    defaults: defaults,
    load: load,
    save: save,
    reset: reset,
    xpForLevel: xpForLevel,
    levelInfo: levelInfo,
    todayKey: todayKey,
    dailySeed: dailySeed,
    dailyReady: dailyReady,
    refreshDailyStreak: refreshDailyStreak,
    recordGame: recordGame,
    addCoins: addCoins
  };
})(typeof self !== "undefined" ? self : this);
