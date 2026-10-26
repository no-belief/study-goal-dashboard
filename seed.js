/* =========================================================
 *  seed.js —— 预置示例数据（相对「今天」动态生成，覆盖各种状态）
 * ========================================================= */
(function (global) {
  'use strict';
  var C = global.Core;

  function mk(gid, off, amount, minutes, makeup, today) {
    var c = {
      id: 'sd' + gid + '_' + Math.abs(off) + '_' + Math.random().toString(36).slice(2, 6),
      goalId: gid,
      date: C.addDays(today, off),
      amount: amount,
      createdAt: Date.now() - Math.abs(off) * 86400000
    };
    if (minutes != null) c.minutes = minutes;
    if (makeup) c.makeup = true;
    return c;
  }

  function build(today) {
    today = today || C.todayStr();
    var goals = [], checkins = [], reviews = [];

    /* ---------- 目标 1：背英语单词（健康推进，含补记） ---------- */
    var g1 = {
      id: 'demo_words',
      name: '背完考研核心单词',
      unit: '个',
      total: 2000,
      deadline: C.addDays(today, 45),
      color: 'purple',
      obstacle: '晚上一躺下刷手机，就把背单词忘了',
      plan: '如果 21:30 还没开始，就先背 20 个再刷手机',
      demo: true,
      createdAt: Date.now() - 12 * 86400000,
      updatedAt: Date.now() - 12 * 86400000
    };
    goals.push(g1);
    var a1 = [30, 35, 42, 28, 45, 32, 38, 25, 40, 36, 30, 34];
    var m1 = [22, 26, 31, 20, 34, 24, 28, null, 30, 25, 21, 27];
    for (var i = 0; i < 12; i++) {
      var off = -12 + i;                       // -12 … -1
      checkins.push(mk(g1.id, off, a1[i], m1[i], off === -2, today));   // 前天是补记
    }
    checkins.push(mk(g1.id, 0, 22, 16, false, today));                  // 今天已打卡

    /* ---------- 目标 2：读《人类简史》（昨天漏 → 用掉本周休息日） ---------- */
    var g2 = {
      id: 'demo_book',
      name: '读完《人类简史》',
      unit: '页',
      total: 440,
      deadline: C.addDays(today, 30),
      color: 'cyan',
      obstacle: '地铁上人多，读两页就走神',
      plan: '如果发现走神超过两段，就切换成听书 10 分钟',
      demo: true,
      createdAt: Date.now() - 12 * 86400000,
      updatedAt: Date.now() - 12 * 86400000
    };
    goals.push(g2);
    var a2 = [18, 22, 15, 20, 26, 12, 19, 24, 16, 21, 17];
    var m2 = [30, 35, null, 32, 40, 20, 28, 36, null, 33, 27];
    for (var j = 0; j < 11; j++) {
      checkins.push(mk(g2.id, -12 + j, a2[j], m2[j], false, today));    // -12 … -2，昨天(-1)缺
    }

    /* ---------- 目标 3：Python 入门课（连续漏 + 已逾期） ---------- */
    var g3 = {
      id: 'demo_py',
      name: '刷完 Python 入门课',
      unit: '节',
      total: 60,
      deadline: C.addDays(today, -3),
      color: 'amber',
      obstacle: '环境配置一报错就想放弃',
      plan: '如果报错卡住超过 15 分钟，就先跳过，用小例子继续往下学',
      demo: true,
      createdAt: Date.now() - 20 * 86400000,
      updatedAt: Date.now() - 20 * 86400000
    };
    goals.push(g3);
    var dayOff = [-20, -19, -17, -16, -15, -13, -12, -10, -9, -8, -7, -6, -5, -4, -3];
    var a3 = [3, 2, 3, 2, 4, 3, 2, 3, 3, 2, 4, 3, 2, 3, 3];
    var m3 = [45, 30, 50, 35, 60, 40, null, 45, 42, 30, 55, 38, null, 40, 36];
    for (var k = 0; k < dayOff.length; k++) {
      checkins.push(mk(g3.id, dayOff[k], a3[k], m3[k], false, today));  // 最近两天连续空缺
    }

    /* ---------- 本周复盘示例 ---------- */
    var ws = C.mondayOf(today);
    reviews.push({
      id: 'demo_review_' + ws,
      weekStart: ws,
      keep: '早上通勤前先背 20 个单词，这个时间段最稳，本周保持了 5 天。',
      problem: '《人类简史》连着两天没推进，晚上总被别的事挤掉。',
      tryIt: '把读书挪到午休后 20 分钟，先看目录再决定读哪一节。',
      nextPlan: '如果晚上 21:30 还没翻开书，就只读 5 页，读完就算完成。',
      updatedAt: Date.now() - 3600000
    });

    return { goals: goals, checkins: checkins, reviews: reviews };
  }

  /** 首次进入时写入示例；已存在数据则不覆盖 */
  function ensureSeed(force) {
    var has = global.Sync && global.Sync.doc &&
      (Sync.doc.goals.length || Sync.doc.checkins.length || Sync.doc.reviews.length);
    if (has && !force) return false;
    var s = build(C.todayStr());
    global.DB.replaceAll(s.goals, s.checkins, s.reviews);
    return true;
  }

  /** 只清掉带示例标记的目标及其记录 */
  function clearDemo() {
    var keepGoals = [], killIds = {};
    Sync.doc.goals.forEach(function (g) {
      if (g.demo) killIds[g.id] = true; else keepGoals.push(g);
    });
    var keepCk = Sync.doc.checkins.filter(function (c) { return !killIds[c.goalId]; });
    DB.replaceAll(keepGoals, keepCk, Sync.doc.reviews);
    return Object.keys(killIds).length;
  }

  global.Seed = { build: build, ensureSeed: ensureSeed, clearDemo: clearDemo };
})(window);
