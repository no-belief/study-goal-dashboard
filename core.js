/* =========================================================
 *  core.js —— 日期工具 + 核心算法
 * ========================================================= */
(function (global) {
  'use strict';

  var COLORS = {
    purple: '#6d5ef8', indigo: '#6366f1', blue: '#3b82f6',
    cyan: '#0ea5e9', green: '#16a34a', amber: '#e59410',
    pink: '#ec4899', slate: '#64748b'
  };
  var COLOR_KEYS = Object.keys(COLORS);
  var WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayStr() { return dstr(new Date()); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
  /** b - a，单位天 */
  function diffDays(a, b) {
    var da = parseD(a), db = parseD(b);
    return Math.round((db - da) / 86400000);
  }
  /** 周一为一周起点 */
  function mondayOf(s) {
    var d = parseD(s);
    var w = d.getDay();            // 0=周日
    var back = (w === 0) ? 6 : w - 1;
    d.setDate(d.getDate() - back);
    return dstr(d);
  }
  function weekdayCn(s) {
    var w = parseD(s).getDay();
    return WEEK_CN[(w === 0 ? 6 : w - 1)];
  }
  function mdCn(s) { var p = String(s).split('-'); return +p[1] + '月' + (+p[2]) + '日'; }
  function mdShort(s) { var p = String(s).split('-'); return (+p[1]) + '/' + (+p[2]); }

  /* ---------- 汇总 ---------- */
  function amountOn(list, date) {
    var s = 0;
    for (var i = 0; i < list.length; i++) if (list[i].date === date) s += Number(list[i].amount) || 0;
    return s;
  }
  function hasOn(list, date) {
    for (var i = 0; i < list.length; i++) if (list[i].date === date) return true;
    return false;
  }
  function minutesOn(list, date) {
    var s = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].date === date && list[i].minutes != null && list[i].minutes !== '') {
        s += Number(list[i].minutes) || 0;
      }
    }
    return s;
  }

  /* =========================================================
   *  连续打卡天数：每周（周一起算）自动使用 1 个休息日
   *  本周第一次漏不断，第二次才断
   * ========================================================= */
  function computeStreak(list, today, startDate) {
    var days = {};
    for (var i = 0; i < list.length; i++) days[list[i].date] = true;
    var streak = 0, missByWeek = {}, d = today;
    // 今天还没打卡不算中断，只从昨天往前数
    if (days[today]) { streak++; }
    d = addDays(today, -1);
    var guard = 0;
    while (guard++ < 800) {
      if (startDate && diffDays(startDate, d) < 0) break;   // 早于目标创建日，停止
      if (days[d]) { streak++; }
      else {
        var wk = mondayOf(d);
        missByWeek[wk] = (missByWeek[wk] || 0) + 1;
        if (missByWeek[wk] >= 2) break;                      // 本周第二次漏 → 中断
      }
      d = addDays(d, -1);
    }
    return streak;
  }

  /* 昨天所属周，周一到昨天的漏打卡天数（只统计不早于起始日的日期） */
  function missCountInWeek(list, yesterday, startDate) {
    var days = {};
    for (var i = 0; i < list.length; i++) days[list[i].date] = true;
    var mon = mondayOf(yesterday), n = 0, d = mon;
    var guard = 0;
    while (diffDays(d, yesterday) >= 0 && guard++ < 10) {
      if (!startDate || diffDays(startDate, d) >= 0) {
        if (!days[d]) n++;
      }
      d = addDays(d, 1);
    }
    return n;
  }

  /* 目标起始日：createdAt 可能是时间戳，也可能是日期字符串 */
  function startDateOf(goal) {
    var v = goal.createdAt != null ? goal.createdAt : goal.startDate;
    if (v == null || v === '') return null;
    if (typeof v === 'number') return dstr(new Date(v));
    var s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  /* =========================================================
   *  单个目标的全部派生指标
   * ========================================================= */
  function compute(goal, allCheckins, today) {
    var list = allCheckins.filter(function (c) { return c.goalId === goal.id; });
    today = today || todayStr();

    var total = Number(goal.total) || 0;
    var done = 0;
    for (var i = 0; i < list.length; i++) done += Number(list[i].amount) || 0;
    var remain = Math.max(0, total - done);
    var pct = total > 0 ? Math.min(1, done / total) : 0;
    var finished = remain <= 0;

    var daysLeftRaw = diffDays(today, goal.deadline);      // 今天到截止日还剩几天（不含今天）
    var overdueDays = daysLeftRaw < 0 ? -daysLeftRaw : 0;   // 逾期天数
    var daysLeft = Math.max(0, daysLeftRaw) + 1;            // 含今天

    /* 今日建议量 = 剩余量 ÷ 剩余天数 */
    var suggest;
    if (finished) suggest = 0;
    else if (overdueDays > 0) suggest = remain;             // 已逾期：剩下的全算今天的
    else suggest = Math.ceil(remain / daysLeft);

    var todayDone = amountOn(list, today);
    var todayLeft = Math.max(0, suggest - todayDone);

    /* 连续打卡（含每周 1 个休息日） */
    var startDate = startDateOf(goal);
    var streak = computeStreak(list, today, startDate);

    /* 预计完成日：近 7 天平均速度 */
    var win7 = 0, activeDays = 0, j, dk, amt;
    for (j = 0; j < 7; j++) {
      dk = addDays(today, -j);
      amt = amountOn(list, dk);
      if (amt > 0) { win7 += amt; activeDays++; }
    }
    var forecast = null;
    if (!finished && activeDays >= 2 && win7 > 0) {
      var speed = win7 / 7;
      var need = Math.ceil(remain / speed);
      var eta = addDays(today, need);
      var gap = diffDays(eta, goal.deadline);   // >0 提前，<0 拖后
      forecast = { eta: eta, speed: speed, gap: gap, samples: activeDays };
    }

    /* 昨日漏打卡 → 黄卡（休息日）/红卡（中断） */
    var y = addDays(today, -1);
    var missedYesterday = false, missKind = 'rest', rolled = 0;
    if (!finished && (startDate ? diffDays(startDate, y) >= 0 : list.length > 0)) {
      if (!hasOn(list, y)) {
        missedYesterday = true;
        var mc = missCountInWeek(list, y, startDate);
        missKind = mc <= 1 ? 'rest' : 'break';
        // 滚入今日的量 = 昨天应做的量
        var doneBeforeY = 0;
        for (var k = 0; k < list.length; k++) {
          if (diffDays(list[k].date, y) > 0) doneBeforeY += Number(list[k].amount) || 0;
        }
        var remainY = Math.max(0, total - doneBeforeY);
        var dlY = diffDays(y, goal.deadline);
        rolled = dlY < 0 ? remainY : Math.ceil(remainY / Math.max(1, dlY + 1));
      }
    }

    return {
      goal: goal, list: list, done: done, remain: remain, pct: pct, finished: finished,
      daysLeft: daysLeft, overdueDays: overdueDays, suggest: suggest,
      todayDone: todayDone, todayLeft: todayLeft,
      streak: streak, forecast: forecast,
      missedYesterday: missedYesterday, missKind: missKind, rolled: rolled,
      color: COLORS[goal.color] || COLORS.purple
    };
  }

  /* =========================================================
   *  周报：周一到周日汇总
   * ========================================================= */
  function weekStats(goals, allCheckins, weekStart) {
    var end = addDays(weekStart, 6);
    var perGoal = {}, daySet = {}, minutes = 0, totalAmount = 0;
    var i, c, gid;
    for (i = 0; i < allCheckins.length; i++) {
      c = allCheckins[i];
      if (diffDays(weekStart, c.date) < 0 || diffDays(c.date, end) < 0) continue;
      gid = c.goalId;
      perGoal[gid] = (perGoal[gid] || 0) + (Number(c.amount) || 0);
      daySet[c.date] = true;
      if (c.minutes != null && c.minutes !== '') minutes += Number(c.minutes) || 0;
      totalAmount += Number(c.amount) || 0;
    }
    var rows = [];
    for (i = 0; i < goals.length; i++) {
      var g = goals[i];
      if (perGoal[g.id] != null) {
        rows.push({ goal: g, amount: perGoal[g.id], color: COLORS[g.color] || COLORS.purple });
      }
    }
    rows.sort(function (a, b) { return b.amount - a.amount; });
    return {
      weekStart: weekStart, weekEnd: end,
      days: Object.keys(daySet).length,
      minutes: minutes,
      rows: rows,
      totalAmount: totalAmount
    };
  }

  function delta(cur, prev) {
    if (prev === 0 && cur === 0) return { text: '与上周持平', cls: 'flat', icon: 'i-flat' };
    if (prev === 0) return { text: '上周为 0，本周新增 ' + cur, cls: 'up', icon: 'i-up' };
    var d = cur - prev;
    var p = Math.round(Math.abs(d) / prev * 100);
    if (d === 0) return { text: '与上周持平', cls: 'flat', icon: 'i-flat' };
    if (d > 0) return { text: '较上周 +' + d + '（+' + p + '%）', cls: 'up', icon: 'i-up' };
    return { text: '较上周 ' + d + '（-' + p + '%）', cls: 'down', icon: 'i-down' };
  }

  /* ---------- 近 14 天分钟堆叠 ---------- */
  function minutesMatrix(goals, allCheckins, today, days) {
    days = days || 14;
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = addDays(today, -i);
      var seg = [], sum = 0, hasAny = false;
      for (var j = 0; j < goals.length; j++) {
        var g = goals[j];
        var m = 0, has = false;
        for (var k = 0; k < allCheckins.length; k++) {
          var c = allCheckins[k];
          if (c.goalId !== g.id || c.date !== d) continue;
          if (c.minutes != null && c.minutes !== '') { m += Number(c.minutes) || 0; has = true; }
        }
        if (has) { hasAny = true; }
        seg.push({ goal: g, minutes: m, color: COLORS[g.color] || COLORS.purple });
        sum += m;
      }
      out.push({ date: d, seg: seg, total: sum, has: hasAny });
    }
    return out;
  }

  global.Core = {
    COLORS: COLORS, COLOR_KEYS: COLOR_KEYS, WEEK_CN: WEEK_CN,
    pad: pad, dstr: dstr, parseD: parseD, todayStr: todayStr, addDays: addDays,
    diffDays: diffDays, mondayOf: mondayOf, weekdayCn: weekdayCn, mdCn: mdCn, mdShort: mdShort,
    amountOn: amountOn, hasOn: hasOn, minutesOn: minutesOn,
    computeStreak: computeStreak, missCountInWeek: missCountInWeek, startDateOf: startDateOf,
    compute: compute, weekStats: weekStats, delta: delta, minutesMatrix: minutesMatrix
  };
})(window);
