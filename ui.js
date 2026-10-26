/* =========================================================
 *  ui.js —— 界面渲染与交互
 * ========================================================= */
(function (global) {
  'use strict';
  var C = global.Core, DB = global.DB, Sync = global.Sync;

  var TABS = [
    { k: 'today', t: '今日', i: 'i-today' },
    { k: 'board', t: '看板', i: 'i-board' },
    { k: 'week', t: '周报', i: 'i-week' },
    { k: 'me', t: '我的', i: 'i-me' }
  ];

  var S = { tab: 'today', weekCursor: null, editing: null };

  /* ---------- 基础工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function ic(id, w) {
    w = w || 16;
    return '<svg width="' + w + '" height="' + w + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }
  function $(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var toastTimer = [];
  function toast(msg) {
    var box = $('toasts');
    var d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    box.appendChild(d);
    var t = setTimeout(function () { d.remove(); }, 2600);
    toastTimer.push(t);
  }

  /* ---------- 弹层 ---------- */
  function openSheet(title, bodyHtml, footHtml) {
    var root = $('modalRoot');
    root.innerHTML =
      '<div class="mask" data-mask="1">' +
      '<div class="sheet">' +
      '<div class="grab"></div>' +
      '<div class="sheet-head"><h3>' + esc(title) + '</h3>' +
      '<button class="icon-btn" data-close="1" aria-label="关闭">' + ic('i-x', 20) + '</button></div>' +
      bodyHtml +
      (footHtml ? '<div class="sheet-foot">' + footHtml + '</div>' : '') +
      '</div></div>';
    var mask = root.querySelector('.mask');
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-close]')) closeSheet();
    });
    return root.querySelector('.sheet');
  }
  function closeSheet() { $('modalRoot').innerHTML = ''; }

  function confirmSheet(title, text, okText, danger) {
    return new Promise(function (resolve) {
      var sheet = openSheet(title,
        '<div style="font-size:13.5px;line-height:1.7;color:var(--ink-2);padding:4px 0 6px">' + text + '</div>',
        '<button class="btn" data-no="1">取消</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-yes="1">' + esc(okText) + '</button>');
      sheet.querySelector('[data-no]').onclick = function () { closeSheet(); resolve(false); };
      sheet.querySelector('[data-yes]').onclick = function () { closeSheet(); resolve(true); };
    });
  }

  /* ---------- 彩带 ---------- */
  function confetti(text) {
    var root = $('fxRoot');
    var colors = ['#6d5ef8', '#a78bfa', '#16a34a', '#e59410', '#ec4899', '#0ea5e9', '#3b82f6'];
    var html = '<div class="confetti">';
    for (var i = 0; i < 70; i++) {
      var left = Math.random() * 100;
      var delay = (Math.random() * 0.7).toFixed(2);
      var dur = (1.7 + Math.random() * 1.4).toFixed(2);
      var c = colors[(Math.random() * colors.length) | 0];
      html += '<i style="left:' + left.toFixed(2) + '%;background:' + c +
        ';animation-delay:' + delay + 's;animation-duration:' + dur + 's"></i>';
    }
    html += '</div>';
    if (text) html += '<div class="confetti-banner">' + esc(text) + '</div>';
    root.innerHTML = html;
    setTimeout(function () { root.innerHTML = ''; }, 3600);
  }

  /* =========================================================
   *  同步状态条
   * ========================================================= */
  function syncBarHtml() {
    var st = Sync.state, cls = 'load', txt = '正在连接云端…', btn = '';
    if (st === 'ready') {
      cls = 'ok';
      txt = '已同步 · ' + (Sync.lastSyncAt ? new Date(Sync.lastSyncAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '');
      if (Sync.label) txt += ' · ' + Sync.label;
    } else if (st === 'syncing') {
      cls = 'load'; txt = '正在同步到云端…';
    } else if (st === 'offline') {
      cls = 'warn'; txt = Sync.lastError || '离线，数据已存本机';
      btn = '<button data-retry="1">重试</button>';
    } else if (st === 'error') {
      cls = 'err'; txt = Sync.lastError || '云端连接失败';
      btn = '<button data-retry="1">重试</button>';
    }
    return '<div class="syncbar ' + cls + '"><span class="dot"></span><span class="txt">' + esc(txt) + '</span>' + btn + '</div>';
  }

  /* =========================================================
   *  组件片段
   * ========================================================= */
  function threeStats(g) {
    var pctTxt = Math.round(g.pct * 100) + '%';
    var fc = g.forecast;
    var fcV, fcCls = '';
    if (g.finished) { fcV = '已达成'; fcCls = 'ok'; }
    else if (!fc) { fcV = '暂无推算'; fcCls = ''; }
    else {
      fcV = C.mdShort(fc.eta);
      if (fc.gap > 0) fcCls = 'ok';
      else if (fc.gap < 0) fcCls = 'bad';
    }
    return '<div class="stats">' +
      '<div class="stat"><div class="k">完成率</div><div class="v">' + pctTxt + '</div></div>' +
      '<div class="stat"><div class="k">连续打卡</div><div class="v">' + g.streak + '<span style="font-size:11px;font-weight:600;color:var(--ink-3)"> 天</span></div></div>' +
      '<div class="stat"><div class="k">预计完成</div><div class="v ' + fcCls + '">' + esc(fcV) + '</div></div>' +
      '</div>';
  }

  function forecastLine(g) {
    if (g.finished) return '<span style="color:var(--ok)">已达成目标</span>';
    if (!g.forecast) return '<span style="color:var(--ink-3)">近 7 天样本不足 · 暂无推算</span>';
    var f = g.forecast;
    var tail = f.gap > 0 ? '<b style="color:var(--ok)">比截止日提前 ' + f.gap + ' 天</b>'
      : f.gap < 0 ? '<b style="color:var(--danger)">比截止日拖后 ' + (-f.gap) + ' 天</b>'
        : '<b>刚好卡在截止日</b>';
    return '按近 7 天速度（约 ' + (Math.round(f.speed * 10) / 10) + ' ' + esc(g.goal.unit) + '/天）推算 ' +
      C.mdCn(f.eta) + '，' + tail;
  }

  function planHtml(g) {
    var o = g.goal.obstacle, p = g.goal.plan;
    if (!o && !p) {
      return '<div class="plan"><div style="color:var(--ink-3);font-size:12.5px">' +
        '还没写预案。写下最容易拦住你的事，和它出现时你要做的动作。' +
        ' <button class="link-btn" data-act="edit" data-id="' + g.goal.id + '" style="color:var(--brand)">去补上</button></div></div>';
    }
    var h = '<div class="plan">';
    if (o) h += '<div class="row"><span class="lb rest">' + ic('i-shield', 14) + '</span><span><b>拦路虎：</b>' + esc(o) + '</span></div>';
    if (p) h += '<div class="row"><span class="lb act">' + ic('i-bolt', 14) + '</span><span><b>对策：</b>' + esc(p) + '</span></div>';
    return h + '</div>';
  }
  function planHtmlInline(g) {
    var o = g.goal.obstacle, p = g.goal.plan;
    if (!o && !p) return '<div class="plan"><span style="color:var(--ink-3)">未设置预案</span></div>';
    var h = '<div class="plan">';
    if (o) h += '<div class="row"><span class="lb rest">拦路虎</span><span>' + esc(o) + '</span></div>';
    if (p) h += '<div class="row"><span class="lb act">对策</span><span>' + esc(p) + '</span></div>';
    return h + '</div>';
  }

  function goalHeadHtml(g, withEdit) {
    var dl = g.overdueDays > 0
      ? '<span style="color:var(--danger);font-weight:700">已逾期 ' + g.overdueDays + ' 天</span>'
      : (g.finished ? '已完成' : '还剩 ' + g.daysLeft + ' 天 · 截止 ' + C.mdCn(g.goal.deadline));
    return '<div class="goal-top">' +
      '<div style="flex:1;min-width:0">' +
      '<div class="goal-name">' + esc(g.goal.name) +
      (g.goal.demo ? '<span class="demo-tag">示例</span>' : '') + '</div>' +
      '<div class="goal-meta">' + dl + ' · 目标 ' + g.goal.total + ' ' + esc(g.goal.unit) + '</div>' +
      '</div>' +
      (withEdit ? '<button class="icon-btn" data-act="edit" data-id="' + g.goal.id + '" title="编辑">' + ic('i-edit', 17) + '</button>' : '') +
      '</div>';
  }

  function barHtml(g) {
    return '<div class="bar"><i style="width:' + (g.pct * 100).toFixed(1) + '%"></i></div>' +
      '<div class="bar-row"><span><b>' + g.done + '</b> / ' + g.goal.total + ' ' + esc(g.goal.unit) + '</span>' +
      '<span>还差 <b>' + g.remain + '</b> ' + esc(g.goal.unit) + '</span></div>';
  }

  /* =========================================================
   *  今日
   * ========================================================= */
  function todayCard(g) {
    var h = '<div class="goal ' + (g.missedYesterday ? (g.missKind === 'rest' ? 'is-miss' : 'is-broken') : (g.finished ? 'is-done' : '')) + '" style="--gc:' + g.color + '">';
    h += goalHeadHtml(g, true);
    h += barHtml(g);
    h += '<div style="font-size:12px;color:var(--ink-2);margin-top:6px">预计完成：' + forecastLine(g) + '</div>';
    h += threeStats(g);

    /* 提示条 */
    if (g.overdueDays > 0 && !g.finished) {
      h += '<div class="notice bad">' + ic('i-alert', 15) + '<div><b>已逾期 ' + g.overdueDays + ' 天</b>，还差 ' + g.remain + ' ' + esc(g.goal.unit) + '。' +
        '<div style="margin-top:7px;display:flex;gap:7px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-primary" data-act="checkin" data-id="' + g.goal.id + '">' + ic('i-check', 14) + '立即打卡</button>' +
        '<button class="btn btn-sm" data-act="edit" data-id="' + g.goal.id + '">' + ic('i-edit', 14) + '调整计划</button>' +
        '</div></div></div>';
    } else if (g.missedYesterday && g.missKind === 'rest') {
      h += '<div class="notice warn">' + ic('i-coffee', 15) +
        '<div><b>昨天没打卡，已自动用掉本周的 1 个休息日。</b><br>连续 ' + g.streak + ' 天没有中断，本周再漏一次就会断。' +
        '<div style="margin-top:7px;display:flex;gap:7px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-primary" data-act="checkin" data-id="' + g.goal.id + '">今天补上</button>' +
        '<button class="btn btn-sm" data-act="makeup" data-id="' + g.goal.id + '">补记昨天</button>' +
        '</div></div></div>';
    } else if (g.missedYesterday && g.missKind === 'break') {
      h += '<div class="notice bad">' + ic('i-alert', 15) +
        '<div><b>本周休息日已用完，昨天又漏了一次，连续天数已中断。</b><br>昨天该做的 ' + g.rolled + ' ' + esc(g.goal.unit) + ' 已滚入今日，今天共需约 <b>' + g.suggest + ' ' + esc(g.goal.unit) + '</b>。' +
        '<div style="margin-top:7px;display:flex;gap:7px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-primary" data-act="checkin" data-id="' + g.goal.id + '">今天先做</button>' +
        '<button class="btn btn-sm" data-act="makeup" data-id="' + g.goal.id + '">补记昨天</button>' +
        '<button class="btn btn-sm" data-act="edit" data-id="' + g.goal.id + '">调整计划</button>' +
        '</div></div></div>';
    }

    h += planHtml(g);

    /* 打卡区 */
    if (g.finished) {
      h += '<div class="done-flag">' + ic('i-checkcircle', 17) + '<span>目标已达成，共 ' + g.done + ' ' + esc(g.goal.unit) + '</span></div>';
    } else if (g.todayDone > 0) {
      h += '<div class="done-flag">' + ic('i-checkcircle', 17) +
        '<span>今天已记 ' + g.todayDone + ' ' + esc(g.goal.unit) + (g.todayLeft > 0 ? '，还差 ' + g.todayLeft + ' ' + esc(g.goal.unit) : '，今日建议已完成') + '</span>' +
        '<button class="link-btn" data-act="checkin" data-id="' + g.goal.id + '" style="margin-left:auto">再记一次</button></div>';
      h += '<div class="checkin-row">' + quickInput(g) + '</div>';
    } else {
      h += '<div class="checkin-row">' + quickInput(g) + '</div>';
      h += '<div style="font-size:11.5px;color:var(--ink-3);margin-top:6px">今日建议 ' + g.suggest + ' ' + esc(g.goal.unit) +
        '（剩余 ' + g.remain + ' ÷ 剩余 ' + g.daysLeft + ' 天），可改</div>';
    }

    h += '<div class="goal-acts">' +
      '<button class="link-btn" data-act="makeup" data-id="' + g.goal.id + '">补记最近 6 天</button>' +
      '<span class="sp"></span>' +
      '<button class="link-btn" data-act="board" data-id="' + g.goal.id + '">看板</button>' +
      '<button class="link-btn danger" data-act="del" data-id="' + g.goal.id + '">删除</button>' +
      '</div>';
    return h + '</div>';
  }

  function quickInput(g) {
    var v = g.todayLeft > 0 ? g.todayLeft : g.suggest;
    if (v <= 0) v = g.suggest > 0 ? g.suggest : 1;
    return '<div class="mini-inp"><input type="number" inputmode="decimal" id="amt_' + g.goal.id + '" value="' + v + '" min="0" step="1" aria-label="数量"><span class="u">' + esc(g.goal.unit) + '</span></div>' +
      '<div class="mini-inp mini-inp-sm"><input type="number" inputmode="numeric" id="min_' + g.goal.id + '" placeholder="分钟" min="0" step="1" aria-label="分钟"><span class="u">分</span></div>' +
      '<button class="btn btn-primary btn-sm" data-act="quicklog" data-id="' + g.goal.id + '">' + ic('i-check', 15) + '打卡</button>';
  }

  function renderToday() {
    var today = C.todayStr();
    var goals = DB.goals();
    var all = DB.checkins();
    var items = goals.map(function (g) { return C.compute(g, all, today); });

    var miss = items.filter(function (g) { return g.missedYesterday && !g.finished; });
    var overdue = items.filter(function (g) { return g.overdueDays > 0 && !g.finished && !g.missedYesterday; });
    var rest = items.filter(function (g) { return !g.finished && !g.missedYesterday && g.overdueDays <= 0; });
    var done = items.filter(function (g) { return g.finished; });

    var h = syncBarHtml();
    h += '<button class="newgoal-hero" data-act="new">' +
      '<span class="plus">' + ic('i-plus', 18) + '</span>' +
      '<span style="flex:1;text-align:left">新建学习目标' +
      '<span class="hint" style="display:block">有终点、有总量的那种：背完 2000 个单词、读完 440 页</span></span></button>';

    h += '<div style="height:18px"></div>';

    if (!items.length) {
      h += '<div class="empty">' + ic('i-empty', 44) + '<div>还没有目标。<br>先立一个有终点、有总量的目标吧。</div></div>';
    }

    if (overdue.length) {
      h += '<div class="sec-title">' + ic('i-alert', 15) + '已逾期<span class="cnt">' + overdue.length + '</span></div>';
      overdue.forEach(function (g) { h += todayCard(g); });
    }
    if (miss.length) {
      h += '<div class="sec-title">' + ic('i-coffee', 15) + '昨天没打卡<span class="cnt">' + miss.length + '</span></div>';
      miss.forEach(function (g) { h += todayCard(g); });
    }
    if (rest.length) {
      h += '<div class="sec-title">' + ic('i-today', 15) + '今天要推进<span class="cnt">' + rest.length + '</span></div>';
      rest.forEach(function (g) { h += todayCard(g); });
    }
    if (done.length) {
      h += '<div class="sec-title">' + ic('i-checkcircle', 15) + '已达成<span class="cnt">' + done.length + '</span></div>';
      done.forEach(function (g) { h += todayCard(g); });
    }

    if (items.length) {
      h += '<div style="height:20px"></div>';
      h += '<button class="newgoal-dashed" data-act="new">' + ic('i-plus', 18) + '再加一个目标</button>';
    }
    return h;
  }

  /* =========================================================
   *  看板
   * ========================================================= */
  function ringSvg(pct, color) {
    var r = 38, cir = 2 * Math.PI * r;
    var off = cir * (1 - Math.min(1, Math.max(0, pct)));
    return '<svg width="92" height="92" viewBox="0 0 92 92">' +
      '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="#eef1fa" stroke-width="9"/>' +
      '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="' + cir.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 46 46)"/>' +
      '</svg>';
  }

  function boardCard(g) {
    var h = '<div class="goal" style="--gc:' + g.color + '">';
    h += goalHeadHtml(g, true);
    h += '<div class="ring-wrap" style="margin-top:12px">' +
      '<div class="ring">' + ringSvg(g.pct, g.color) +
      '<div class="pct"><b>' + Math.round(g.pct * 100) + '%</b><span>' + g.done + '/' + g.goal.total + '</span></div></div>' +
      '<div style="flex:1;min-width:0">' + threeStats(g) +
      '<div style="font-size:11.5px;color:var(--ink-3);margin-top:8px">' + forecastLine(g) + '</div>' +
      '</div></div>';

    if (g.overdueDays > 0 && !g.finished) {
      h += '<div class="notice bad">' + ic('i-alert', 15) + '<div><b>已逾期 ' + g.overdueDays + ' 天</b>，还差 ' + g.remain + ' ' + esc(g.goal.unit) + '。</div></div>';
    }
    h += planHtmlInline(g);

    /* 最近 10 条记录 */
    var recs = g.list.slice().sort(function (a, b) {
      if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
      return a.date < b.date ? 1 : -1;
    }).slice(0, 10);

    h += '<div class="reclist"><div style="font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:4px">最近 ' + recs.length + ' 条记录</div>';
    if (!recs.length) {
      h += '<div style="font-size:12.5px;color:var(--ink-3);padding:8px 0">还没有记录</div>';
    } else {
      recs.forEach(function (c) {
        h += '<div class="rec">' +
          '<span class="d">' + C.mdShort(c.date) + '</span>' +
          (c.makeup ? '<span class="tag-mk">补</span>' : '') +
          '<span class="a">' + c.amount + ' ' + esc(g.goal.unit) + '</span>' +
          '<span class="m">' + (c.minutes != null && c.minutes !== '' ? c.minutes + ' 分钟' : '') + '</span>' +
          '<button class="del" data-act="delrec" data-id="' + c.id + '" title="删除这条记录">' + ic('i-trash', 14) + '</button>' +
          '</div>';
      });
    }
    h += '</div>';

    if (!g.finished) {
      h += '<div class="checkin-row">' + quickInput(g) +
        '<button class="btn btn-sm" data-act="makeup" data-id="' + g.goal.id + '">补记</button></div>';
    }
    return h + '</div>';
  }

  /* ---------- 近 14 天投入分钟 · 分目标堆叠柱状图（手写 SVG） ---------- */
  function chartSvg(goals, matrix) {
    var W = 680, H = 232;
    var padL = 38, padR = 12, padT = 14, padB = 42;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = matrix.length;
    var band = plotW / n, bw = Math.min(28, band * 0.62);

    var max = 0;
    matrix.forEach(function (d) { if (d.total > max) max = d.total; });
    if (max <= 0) {
      return '<div class="chart-note" style="padding:26px 0;text-align:center;color:var(--ink-3)">' +
        '最近 14 天还没有填过分钟数。<br>打卡时填上分钟，这里会自动画出来。</div>';
    }
    // 取整刻度
    var step = max <= 60 ? 15 : max <= 150 ? 30 : max <= 300 ? 60 : 120;
    var top = Math.ceil(max / step) * step;

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="近14天投入分钟堆叠柱状图" font-family="inherit">';
    // 网格线与刻度
    for (var v = 0; v <= top; v += step) {
      var y = padT + plotH - (v / top) * plotH;
      s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#eceefa" stroke-width="1"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (y + 4).toFixed(1) + '" font-size="10" fill="#8b91a8" text-anchor="end">' + v + '</text>';
    }
    // 柱
    for (var i = 0; i < n; i++) {
      var d = matrix[i];
      var cx = padL + band * i + band / 2;
      var x = cx - bw / 2;
      var acc = 0;
      for (var j = 0; j < d.seg.length; j++) {
        var seg = d.seg[j];
        if (!seg.minutes) continue;
        var hh = (seg.minutes / top) * plotH;
        var y2 = padT + plotH - acc;
        acc += hh;
        var y1 = y2 - hh;
        s += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, hh).toFixed(1) +
          '" fill="' + seg.color + '" rx="2"><title>' + esc(C.mdShort(d.date) + ' · ' + seg.goal.name + ' · ' + seg.minutes + ' 分钟') + '</title></rect>';
      }
      if (!d.has) {
        // 当天有打卡但没填分钟 → 画一个淡淡的占位，不硬凑数字
        s += '<rect x="' + x.toFixed(1) + '" y="' + (padT + plotH - 3) + '" width="' + bw.toFixed(1) + '" height="3" fill="#dfe3f3" rx="1.5"><title>' + esc(C.mdShort(d.date) + ' 有打卡，未填分钟') + '</title></rect>';
      }
      // x 轴标签
      var lbl = C.mdShort(d.date);
      s += '<text x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 15) + '" font-size="9.5" fill="#8b91a8" text-anchor="middle">' + lbl + '</text>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 27) + '" font-size="9" fill="#c0c5d6" text-anchor="middle">' + C.weekdayCn(d.date).slice(1) + '</text>';
    }
    s += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#dfe3f3" stroke-width="1"/>';
    s += '</svg>';
    return s;
  }

  function renderBoard() {
    var today = C.todayStr();
    var goals = DB.goals(), all = DB.checkins();
    var h = syncBarHtml();
    if (!goals.length) {
      return h + '<div class="empty">' + ic('i-empty', 44) + '<div>还没有目标，先去「今日」建一个。</div></div>';
    }
    var items = goals.map(function (g) { return C.compute(g, all, today); });

    var h2 = '<div class="card chart-card"><div class="chart-head">' +
      '<h3>近 14 天投入分钟</h3><span class="sub">按目标堆叠 · 未填分钟不计入</span></div>' +
      chartSvg(goals, C.minutesMatrix(goals, all, today, 14)) +
      '<div class="legend">' + goals.map(function (g) {
        return '<span><i style="background:' + (C.COLORS[g.color] || C.COLORS.purple) + '"></i>' + esc(g.name) + '</span>';
      }).join('') + '</div></div>';

    return h + h2 + '<div style="height:14px"></div>' + items.map(boardCard).join('');
  }

  /* =========================================================
   *  周报
   * ========================================================= */
  function renderWeek() {
    var today = C.todayStr();
    var cur = S.weekCursor || C.mondayOf(today);
    var goals = DB.goals(), all = DB.checkins();

    var st = C.weekStats(goals, all, cur);
    var prev = C.weekStats(goals, all, C.addDays(cur, -7));

    var dAmount = C.delta(st.totalAmount, prev.totalAmount);
    var dDays = C.delta(st.days, prev.days);
    var dMin = C.delta(st.minutes, prev.minutes);

    var isThis = cur === C.mondayOf(today);

    var h = syncBarHtml();
    h += '<div class="week-nav">' +
      '<button class="icon-btn" data-wk="-1" aria-label="上一周">' + ic('i-left', 19) + '</button>' +
      '<div class="label">' + C.mdCn(cur) + ' — ' + C.mdCn(st.weekEnd) +
      '<small>' + (isThis ? '本周（周一至周日）' : '历史周') + '</small></div>' +
      '<button class="icon-btn" data-wk="1" aria-label="下一周" ' + (isThis ? 'disabled style="opacity:.3"' : '') + '>' + ic('i-right', 19) + '</button>' +
      '</div>';

    h += '<div class="wk-grid">' +
      '<div class="kpi"><div class="k">' + ic('i-target', 13) + '投入量</div><div class="v">' + st.totalAmount + '</div>' +
      '<div class="cmp ' + dAmount.cls + '">' + ic(dAmount.icon, 12) + esc(dAmount.text) + '</div></div>' +
      '<div class="kpi"><div class="k">' + ic('i-calendar', 13) + '打卡天数</div><div class="v">' + st.days + '<small> 天</small></div>' +
      '<div class="cmp ' + dDays.cls + '">' + ic(dDays.icon, 12) + esc(dDays.text) + '</div></div>' +
      '<div class="kpi"><div class="k">' + ic('i-clock', 13) + '投入时长</div><div class="v">' + st.minutes + '<small> 分</small></div>' +
      '<div class="cmp ' + dMin.cls + '">' + ic(dMin.icon, 12) + esc(dMin.text) + '</div></div>' +
      '</div>';

    /* 分目标明细 */
    h += '<div class="card wk-detail"><h4>本周分目标投入</h4>';
    if (!st.rows.length) {
      h += '<div style="font-size:12.5px;color:var(--ink-3)">这一周还没有任何记录。</div>';
    } else {
      st.rows.forEach(function (r) {
        var cg = C.compute(r.goal, all, today);
        h += '<div class="wk-row"><span class="nm"><i style="background:' + r.color + '"></i>' + esc(r.goal.name) + '</span>' +
          '<span class="vv"><b>+' + r.amount + '</b> ' + esc(r.goal.unit) + ' · 累计 ' + Math.round(cg.pct * 100) + '%</span></div>';
      });
    }
    h += '</div>';

    /* 四栏复盘 */
    var rv = DB.getReview(cur) || { keep: '', problem: '', tryIt: '', nextPlan: '' };
    h += '<div class="card wk-detail" style="margin-top:14px"><h4>本周复盘（四栏）</h4>' +
      '<div class="four-grid">' +
      fld('keep', '保持', '这周哪件事做对了，下周继续', rv.keep) +
      fld('problem', '问题', '哪里卡住了，具体是什么情况', rv.problem) +
      fld('tryIt', '尝试', '下周想换个什么做法', rv.tryIt) +
      fld('nextPlan', '下周预案', '如果____出现，我就____', rv.nextPlan) +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px">' +
      '<button class="btn btn-primary btn-block" data-act="saverv">保存复盘</button>' +
      '<button class="btn btn-block" data-act="genrep">' + ic('i-sparkle', 15) + '生成周报文本</button>' +
      '</div>' +
      '<div id="repOut"></div>' +
      '</div>';

    return h;

    function fld(k, t, ph, v) {
      return '<div class="field"><label>' + t + ' <span class="sub">' + esc(ph) + '</span></label>' +
        '<textarea id="rv_' + k + '" placeholder="' + esc(ph) + '">' + esc(v || '') + '</textarea></div>';
    }
  }

  function buildReportText() {
    var today = C.todayStr();
    var cur = S.weekCursor || C.mondayOf(today);
    var goals = DB.goals(), all = DB.checkins();
    var st = C.weekStats(goals, all, cur);
    var prev = C.weekStats(goals, all, C.addDays(cur, -7));
    var rv = DB.getReview(cur) || {};

    function cmp(a, b) {
      if (b === 0 && a === 0) return '与上周持平';
      if (b === 0) return '上周为 0，本周新增 ' + a;
      var d = a - b, p = Math.round(Math.abs(d) / b * 100);
      if (d === 0) return '与上周持平';
      return (d > 0 ? '较上周 +' + d : '较上周 ' + d) + '（' + (d > 0 ? '+' : '-') + p + '%）';
    }

    var L = [];
    L.push('【学习周报】' + C.mdCn(cur) + ' - ' + C.mdCn(st.weekEnd));
    L.push('');
    L.push('— 本周总览 —');
    L.push('投入量：' + st.totalAmount + '（' + cmp(st.totalAmount, prev.totalAmount) + '）');
    L.push('打卡天数：' + st.days + ' 天（' + cmp(st.days, prev.days) + '）');
    L.push('投入时长：' + st.minutes + ' 分钟（' + cmp(st.minutes, prev.minutes) + '）');
    L.push('');
    L.push('— 分目标进展 —');
    if (!st.rows.length) L.push('（本周暂无记录）');
    st.rows.forEach(function (r) {
      var cg = C.compute(r.goal, all, today);
      var line = '· ' + r.goal.name + '：本周 +' + r.amount + ' ' + r.goal.unit +
        '，累计 ' + cg.done + '/' + r.goal.total + '（' + Math.round(cg.pct * 100) + '%）';
      if (cg.forecast) {
        line += '，按近 7 天速度预计 ' + C.mdCn(cg.forecast.eta) +
          (cg.forecast.gap > 0 ? '，比截止日提前 ' + cg.forecast.gap + ' 天' :
            cg.forecast.gap < 0 ? '，比截止日拖后 ' + (-cg.forecast.gap) + ' 天' : '，刚好卡线');
      } else if (!cg.finished) {
        line += '，近 7 天样本不足，暂无推算';
      }
      L.push(line);
      if (cg.overdueDays > 0 && !cg.finished) L.push('  注意：已逾期 ' + cg.overdueDays + ' 天');
    });
    L.push('');
    L.push('— 复盘 —');
    L.push('保持：' + (rv.keep || '（未填写）'));
    L.push('问题：' + (rv.problem || '（未填写）'));
    L.push('尝试：' + (rv.tryIt || '（未填写）'));
    L.push('下周预案：' + (rv.nextPlan || '（未填写）'));
    return L.join('\n');
  }

  /* =========================================================
   *  我的
   * ========================================================= */
  function renderMe() {
    var st = Sync.state;
    var map = {
      ready: ['ok', '已连接', '#16a34a'],
      syncing: ['load', '同步中', '#6d5ef8'],
      loading: ['load', '连接中', '#6d5ef8'],
      offline: ['warn', '离线（本机已保存）', '#e59410'],
      error: ['err', '连接失败', '#e0484d']
    };
    var m = map[st] || map.loading;

    var h = '';
    /* 同步卡片 */
    h += '<div class="card" style="padding:16px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:11px">' +
      '<span class="ico" style="width:38px;height:38px;border-radius:11px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center">' + ic('i-sync', 19) + '</span>' +
      '<div style="flex:1;min-width:0"><b style="font-size:14.5px">在线同步</b>' +
      '<div style="font-size:12px;color:var(--ink-3)">' + (Sync.label || '正在探测可用通道') + '</div></div>' +
      '<span style="font-size:12px;font-weight:700;color:' + m[2] + ';padding:4px 9px;border-radius:999px;background:' + m[2] + '1a">' + m[1] + '</span>' +
      '</div>' +
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-2);line-height:1.8">' +
      '<div>最近同步：<b>' + (Sync.lastSyncAt ? new Date(Sync.lastSyncAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '尚未同步') + '</b></div>' +
      '<div>在线数据表：目标表 / 打卡记录表 / 周复盘表</div>' +
      (Sync.lastError ? '<div style="color:var(--danger);margin-top:4px">' + esc(Sync.lastError) + '</div>' : '') +
      '</div>' +
      '<button class="btn btn-block" style="margin-top:12px" data-act="resync">' + ic('i-refresh', 15) + '手动重新同步</button>' +
      '</div>';

    /* 同步 ID（换设备用） */
    h += '<div class="card" style="padding:14px 16px;margin-bottom:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">换设备 / 换浏览器</div>' +
      '<div style="font-size:12px;color:var(--ink-3);line-height:1.6;margin-bottom:10px">在新设备上打开同一个链接即可继续；也可以在这里复制同步 ID，在新设备粘贴恢复。</div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn btn-sm" data-act="copylink">' + ic('i-copy', 14) + '复制同步链接</button>' +
      '<button class="btn btn-sm" data-act="pasteid">粘贴同步 ID</button>' +
      '</div>' +
      '<div style="margin-top:9px;font-size:11px;color:var(--ink-3);word-break:break-all">ID：' + esc(Sync.spaceId || '（未生成）') + '</div>' +
      '</div>';

    /* 本地文件方式打开时的提示 */
    if (location.protocol === 'file:') {
      h += '<div class="card" style="padding:13px 16px;margin-bottom:14px;font-size:12px;line-height:1.75;color:var(--ink-2);background:var(--warn-soft);border-color:#f5d9a6">' +
        ic('i-alert', 15) + ' 当前是<b>本地文件方式</b>打开（file://）。数据仍会尝试写入云端，但部分网络会拦住本地页面的跨域写入。' +
        '如果同步一直失败，用下面的「切换通道」换成 ExtendsClass，或把这个页面放到任意静态托管上用 https 打开。</div>';
    }

    /* 云端通道（自动探测失败时可手动切换） */
    h += '<div class="card" style="margin-bottom:14px">' +
      '<div class="row-item"><span class="ico" style="background:var(--brand-soft);color:var(--brand)">' + ic('i-shield', 17) + '</span>' +
      '<span class="tx"><b>云端通道</b><span>当前：' + esc(Sync.label || '未连接') + '；默认自动探测，连不上可手动切换</span></span>' +
      '<span class="act"><button class="btn btn-sm" data-act="chan">切换通道</button></span></div>' +
      '</div>';

    /* 数据管理 */
    h += '<div class="card" style="margin-bottom:14px">' +
      '<div class="row-item"><span class="ico">' + ic('i-sparkle', 17) + '</span>' +
      '<span class="tx"><b>清空示例数据</b><span>只删带「示例」标签的 3 个目标和它们的记录</span></span>' +
      '<span class="act"><button class="btn btn-sm" data-act="cleardemo">清空示例</button></span></div>' +
      '<div class="row-item"><span class="ico" style="background:var(--danger-soft);color:var(--danger)">' + ic('i-trash', 17) + '</span>' +
      '<span class="tx"><b>清空全部数据</b><span>需要输入「清空」两个字确认，操作会同步到云端</span></span>' +
      '<span class="act"><button class="btn btn-sm btn-danger" data-act="clearall">清空全部</button></span></div>' +
      '</div>';

    /* 加到主屏 */
    h += '<div class="card steps">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:7px">' + ic('i-phone', 16) + '添加到手机主屏幕</div>' +
      '<div class="step"><span class="n">1</span><span class="c">用手机浏览器打开这个页面（<b>iPhone 用 Safari，安卓用 Chrome</b>）。</span></div>' +
      '<div class="step"><span class="n">2</span><span class="c">点底部或右上角的<b>分享 / 菜单</b>按钮。</span></div>' +
      '<div class="step"><span class="n">3</span><span class="c">选择<b>「添加到主屏幕」</b>，之后点桌面图标就能全屏打开，和 App 一样。</span></div>' +
      '<div style="margin-top:12px;font-size:11.5px;color:var(--ink-3);line-height:1.6">建议顺手把当前链接存成书签：链接里带着同步 ID，换设备打开同一个链接即可看到同样的数据。</div>' +
      '</div>';

    h += '<div style="height:10px"></div>' +
      '<div style="text-align:center;font-size:11.5px;color:var(--ink-3);line-height:1.7">' +
      '数据写在线上资料库，换设备、换浏览器都在<br>不需要手动导出备份</div>';

    return h;
  }

  /* =========================================================
   *  目标编辑弹窗
   * ========================================================= */
  function goalSheet(goal) {
    var isNew = !goal;
    var g = goal || {
      name: '', unit: '', total: '', deadline: C.addDays(C.todayStr(), 30),
      color: 'purple', obstacle: '', plan: ''
    };
    var sw = C.COLOR_KEYS.map(function (k) {
      return '<button class="swatch' + (g.color === k ? ' on' : '') + '" data-color="' + k + '" style="background:' + C.COLORS[k] + '" aria-label="配色 ' + k + '"></button>';
    }).join('');

    var body =
      '<div class="field"><label>目标名称</label><input id="f_name" value="' + esc(g.name) + '" placeholder="例如：背完考研核心单词"></div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="field" style="flex:1"><label>总量</label><input id="f_total" type="number" inputmode="numeric" min="1" step="1" value="' + esc(g.total) + '" placeholder="2000"></div>' +
      '<div class="field" style="flex:1"><label>单位</label><input id="f_unit" value="' + esc(g.unit) + '" placeholder="个 / 页 / 节"></div>' +
      '</div>' +
      '<div class="field"><label>截止日</label><input id="f_dl" type="date" value="' + esc(g.deadline) + '"></div>' +
      '<div class="field"><label>配色</label><div class="swatches">' + sw + '</div></div>' +
      '<div class="field"><label>最容易拦住我的障碍 <span class="sub">选填</span></label>' +
      '<textarea id="f_obs" placeholder="例如：晚上一躺下刷手机，就把背单词忘了">' + esc(g.obstacle) + '</textarea></div>' +
      '<div class="field"><label>如果它出现，我就…… <span class="sub">选填</span></label>' +
      '<textarea id="f_plan" placeholder="例如：如果 21:30 还没开始，就先背 20 个再刷手机">' + esc(g.plan) + '</textarea></div>';

    var sheet = openSheet(isNew ? '新建目标' : '编辑目标', body,
      '<button class="btn" data-close="1">取消</button>' +
      '<button class="btn btn-primary" data-save="1">' + (isNew ? '创建目标' : '保存修改') + '</button>');

    var color = g.color;
    qsa('.swatch', sheet).forEach(function (b) {
      b.onclick = function () {
        color = b.getAttribute('data-color');
        qsa('.swatch', sheet).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });

    sheet.querySelector('[data-save]').onclick = function () {
      var name = $('f_name').value.trim();
      var total = parseFloat($('f_total').value);
      var unit = $('f_unit').value.trim();
      var dl = $('f_dl').value;
      if (!name) { toast('请填目标名称'); return; }
      if (!(total > 0)) { toast('总量要大于 0'); return; }
      if (!unit) { toast('请填单位，比如「个」「页」'); return; }
      if (!dl) { toast('请选择截止日'); return; }
      var patch = {
        name: name, total: total, unit: unit, deadline: dl, color: color,
        obstacle: $('f_obs').value.trim(), plan: $('f_plan').value.trim()
      };
      if (isNew) {
        patch.createdAt = Date.now();
        patch.updatedAt = Date.now();
        DB.addGoal(patch);
        toast('目标已创建，正在同步到云端');
      } else {
        DB.updateGoal(goal.id, patch);
        toast('已保存，正在同步到云端');
      }
      closeSheet(); render();
    };
  }

  /* ---------- 补记弹窗（最近 6 天） ---------- */
  function makeupSheet(goal, presetDate) {
    var today = C.todayStr();
    var days = [];
    for (var i = 1; i <= 6; i++) days.push(C.addDays(today, -i));
    if (presetDate && days.indexOf(presetDate) < 0) days.unshift(presetDate);
    var sel = presetDate || days[0];

    var cg = C.compute(goal, DB.checkins(), today);
    var body =
      '<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:10px">补记会按<b>真实日期</b>参与连续天数和完成日推算，记录上会带「补」标。</div>' +
      '<div class="field"><label>补哪一天</label><div class="days-pick" id="mk_days">' +
      days.map(function (d) {
        return '<button class="day-opt' + (d === sel ? ' on' : '') + '" data-d="' + d + '">' +
          '<div class="w">' + C.weekdayCn(d) + '</div><div class="dd">' + C.mdShort(d) + '</div>' +
          '<div class="mk">补</div></button>';
      }).join('') + '</div></div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="field" style="flex:1"><label>数量</label>' +
      '<div class="mini-inp" style="width:100%"><input id="mk_amt" type="number" inputmode="decimal" min="0" step="1" value="' + (cg.suggest || 1) + '"><span class="u">' + esc(goal.unit) + '</span></div></div>' +
      '<div class="field" style="flex:1"><label>分钟 <span class="sub">选填</span></label>' +
      '<div class="mini-inp" style="width:100%"><input id="mk_min" type="number" inputmode="numeric" min="0" step="1" placeholder="不填就不画进柱状图"><span class="u">分</span></div></div>' +
      '</div>';

    var sheet = openSheet('补记 · ' + goal.name, body,
      '<button class="btn" data-close="1">取消</button>' +
      '<button class="btn btn-primary" data-save="1">保存补记</button>');

    qsa('.day-opt', sheet).forEach(function (b) {
      b.onclick = function () {
        sel = b.getAttribute('data-d');
        qsa('.day-opt', sheet).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    sheet.querySelector('[data-save]').onclick = function () {
      var amt = parseFloat($('mk_amt').value);
      if (!(amt > 0)) { toast('请填大于 0 的数量'); return; }
      var mv = $('mk_min').value.trim();
      var rec = {
        goalId: goal.id, date: sel, amount: amt, makeup: true,
        minutes: mv === '' ? null : (parseFloat(mv) || 0)
      };
      DB.addCheckin(rec);
      toast('已补记到 ' + C.mdCn(sel));
      closeSheet(); render();
    };
  }

  /* =========================================================
   *  渲染主控
   * ========================================================= */
  function renderNav() {
    var html = TABS.map(function (t) {
      return '<button data-tab="' + t.k + '" class="' + (S.tab === t.k ? 'on' : '') + '">' + ic(t.i, 20) + '<span>' + t.t + '</span></button>';
    }).join('');
    var desk = TABS.map(function (t) {
      return '<button data-tab="' + t.k + '" class="' + (S.tab === t.k ? 'on' : '') + '">' + ic(t.i, 19) + '<span>' + t.t + '</span></button>';
    }).join('');
    $('navPhone').innerHTML = html;
    $('navTab').innerHTML = desk;
    $('navDesk').innerHTML = desk;
  }

  function render() {
    renderNav();
    var v = $('view');
    var html = '';
    if (S.tab === 'today') html = renderToday();
    else if (S.tab === 'board') html = renderBoard();
    else if (S.tab === 'week') html = renderWeek();
    else html = renderMe();

    if (S.tab === 'me') {
      $('deskHead').innerHTML = '<div class="desktop-head"><div><h1>我的</h1><div class="sub">同步状态与数据管理</div></div></div>';
      v.innerHTML = html;
    } else {
      var titles = { today: '今日', board: '看板', week: '周报' };
      var subs = {
        today: C.mdCn(C.todayStr()) + ' ' + C.weekdayCn(C.todayStr()),
        board: '进度、记录与近 14 天投入',
        week: '周一到周日汇总与复盘'
      };
      $('deskHead').innerHTML = '<div class="desktop-head"><div><h1>' + titles[S.tab] + '</h1>' +
        '<div class="sub">' + subs[S.tab] + '</div></div></div>';
      v.innerHTML = html;
    }

    var mTitle = $('mTitle'), mSub = $('mSub');
    if (mTitle) {
      var tt = { today: '今日', board: '看板', week: '周报', me: '我的' }[S.tab];
      mTitle.textContent = tt;
      mSub.textContent = S.tab === 'today' ? (C.mdCn(C.todayStr()) + ' ' + C.weekdayCn(C.todayStr())) : subsOf(S.tab);
    }
  }
  function subsOf(t) {
    return {
      today: C.mdCn(C.todayStr()) + ' ' + C.weekdayCn(C.todayStr()),
      board: '进度、记录与近 14 天投入',
      week: '周一到周日汇总与复盘',
      me: '同步状态与数据管理'
    }[t] || '';
  }

  /* =========================================================
   *  事件
   * ========================================================= */
  document.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-tab]');
    if (tb) { S.tab = tb.getAttribute('data-tab'); render(); window.scrollTo(0, 0); return; }

    var wk = e.target.closest('[data-wk]');
    if (wk && !wk.disabled) {
      var cur = S.weekCursor || C.mondayOf(C.todayStr());
      var nx = C.addDays(cur, 7 * parseInt(wk.getAttribute('data-wk'), 10));
      if (C.diffDays(C.mondayOf(C.todayStr()), nx) > 0) { toast('还没到那一周'); return; }
      S.weekCursor = nx; render(); return;
    }

    var btn = e.target.closest('[data-act]');
    if (!btn) {
      if (e.target.closest('[data-retry]')) { Sync.retry(); toast('正在重试同步'); }
      return;
    }
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    if (act === 'new') { goalSheet(null); return; }
    if (act === 'edit') {
      var g = DB.goals().filter(function (x) { return x.id === id; })[0];
      if (g) goalSheet(g);
      return;
    }
    if (act === 'del') {
      var gd = DB.goals().filter(function (x) { return x.id === id; })[0];
      if (!gd) return;
      confirmSheet('删除目标？', '将删除「<b>' + esc(gd.name) + '</b>」以及它的全部打卡记录，云端也会同步删除，无法恢复。', '确认删除', true)
        .then(function (ok) {
          if (!ok) return;
          DB.removeGoal(id); toast('已删除，正在同步'); render();
        });
      return;
    }
    if (act === 'delrec') {
      confirmSheet('删除这条记录？', '删除后目标进度会随之回退，云端同步删除。', '删除记录', true)
        .then(function (ok) { if (ok) { DB.removeCheckin(id); toast('记录已删除'); render(); } });
      return;
    }
    if (act === 'quicklog') {
      var gq = DB.goals().filter(function (x) { return x.id === id; })[0];
      if (!gq) return;
      var ai = $('amt_' + id), mi = $('min_' + id);
      var amt = parseFloat(ai && ai.value);
      if (!(amt > 0)) { toast('填一个大于 0 的数量'); if (ai) ai.focus(); return; }
      var mvs = mi && mi.value.trim();
      var before = C.compute(gq, DB.checkins(), C.todayStr());
      DB.addCheckin({
        goalId: id, date: C.todayStr(), amount: amt,
        minutes: mvs === '' ? null : (parseFloat(mvs) || 0)
      });
      var after = C.compute(gq, DB.checkins(), C.todayStr());
      toast('已记录 ' + amt + ' ' + gq.unit);
      render();
      if (!before.finished && after.finished) {
        confetti('目标达成：' + gq.name);
      }
      return;
    }
    if (act === 'checkin' || act === 'makeup') {
      var gm = DB.goals().filter(function (x) { return x.id === id; })[0];
      if (!gm) return;
      if (act === 'checkin') {
        // 今日打卡弹窗（可改数量 / 补记）
        var cg = C.compute(gm, DB.checkins(), C.todayStr());
        var body = '<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:10px">今日建议 <b style="color:var(--brand)">' +
          cg.suggest + ' ' + esc(gm.unit) + '</b>（剩余 ' + cg.remain + ' ÷ 剩余 ' + cg.daysLeft + ' 天），可以改。</div>' +
          '<div style="display:flex;gap:10px">' +
          '<div class="field" style="flex:1"><label>数量</label><div class="mini-inp" style="width:100%"><input id="mk_amt" type="number" inputmode="decimal" min="0" step="1" value="' + (cg.todayLeft || cg.suggest) + '"><span class="u">' + esc(gm.unit) + '</span></div></div>' +
          '<div class="field" style="flex:1"><label>分钟 <span class="sub">选填</span></label><div class="mini-inp" style="width:100%"><input id="mk_min" type="number" inputmode="numeric" min="0" step="1" placeholder="选填"><span class="u">分</span></div></div>' +
          '</div>';
        var sh = openSheet('打卡 · ' + gm.name, body,
          '<button class="btn" data-close="1">取消</button>' +
          '<button class="btn btn-primary" data-save="1">' + ic('i-check', 15) + '记录</button>');
        sh.querySelector('[data-save]').onclick = function () {
          var a = parseFloat($('mk_amt').value);
          if (!(a > 0)) { toast('填一个大于 0 的数量'); return; }
          var mv = $('mk_min').value.trim();
          DB.addCheckin({ goalId: gm.id, date: C.todayStr(), amount: a, minutes: mv === '' ? null : (parseFloat(mv) || 0) });
          toast('已记录 ' + a + ' ' + gm.unit);
          closeSheet(); render();
          if (C.compute(gm, DB.checkins(), C.todayStr()).finished) confetti('目标达成：' + gm.name);
        };
      } else {
        makeupSheet(gm, null);
      }
      return;
    }
    if (act === 'board') { S.tab = 'board'; render(); window.scrollTo(0, 0); return; }
    if (act === 'saverv') {
      var cur = S.weekCursor || C.mondayOf(C.todayStr());
      DB.saveReview(cur, {
        keep: $('rv_keep').value.trim(),
        problem: $('rv_problem').value.trim(),
        tryIt: $('rv_tryIt').value.trim(),
        nextPlan: $('rv_nextPlan').value.trim()
      });
      toast('复盘已保存并同步到云端');
      return;
    }
    if (act === 'genrep') {
      var txt = buildReportText();
      $('repOut').innerHTML = '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
        '<b style="font-size:12.5px">周报文本</b>' +
        '<button class="btn btn-sm" data-act="copyrep" style="margin-left:auto">' + ic('i-copy', 14) + '复制</button></div>' +
        '<div class="report-out" id="repText">' + esc(txt) + '</div>';
      return;
    }
    if (act === 'copyrep') {
      var t = ($('repText') || {}).textContent || '';
      copyText(t);
      return;
    }
    if (act === 'resync') {
      btn.disabled = true; btn.textContent = '同步中…';
      Sync.retry().then(function () {
        render();
        toast(Sync.state === 'ready' ? '已同步到云端' : (Sync.lastError || '同步未完成'));
      });
      return;
    }
    if (act === 'copylink') {
      copyText(Sync.shareUrl());
      return;
    }
    if (act === 'pasteid') {
      var sid = prompt('粘贴同步 ID（在新设备或新浏览器上恢复数据）：', Sync.spaceId || '');
      if (!sid) return;
      sid = sid.trim();
      var mm = sid.match(/^([a-z]+):(.+)$/);
      var key = mm ? mm[1] : 'jsonblob', rid = mm ? mm[2] : sid;
      Sync.useProvider(key, rid, '').then(function () {
        toast('已切换到该同步空间'); render();
      }, function (err) {
        toast('连接失败：' + (err && err.message ? err.message : '请检查 ID'));
      });
      return;
    }
    if (act === 'chan') {
      var body = '<div style="font-size:12.5px;color:var(--ink-3);line-height:1.75;margin-bottom:12px">' +
        '默认会自动探测可用的免费云端通道。如果你的网络把默认通道拦了，可以换成下面两种：</div>' +
        '<div class="field"><label>① ExtendsClass（免费账号，最稳）</label>' +
        '<input id="ch_api" placeholder="粘贴 Api-key（extendsclass.com 注册后免费获取）"></div>' +
        '<div class="field"><label>Security-key <span class="sub">选填，建议填一个，别人就不能读</span></label>' +
        '<input id="ch_sec" placeholder="选填，例如 my-study-2026"></div>' +
        '<div class="field"><label>② 自定义同步接口（你自己的地址，支持 GET 读取 / PUT 写入）</label>' +
        '<input id="ch_url" placeholder="https://你的接口地址"></div>';
      var shc = openSheet('切换云端通道', body,
        '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn" data-act2="reprobe">重新探测默认通道</button>' +
        '<button class="btn btn-primary" data-act2="apply">应用</button>');
      shc.querySelector('[data-act2="reprobe"]').onclick = function () {
        closeSheet();
        try { localStorage.removeItem('lms.space.v1'); } catch (e) { }
        Sync.provider = null; Sync.spaceId = '';
        Sync.retry().then(function () { toast(Sync.state === 'ready' ? '已重新连接云端' : (Sync.lastError || '仍未连上')); render(); });
      };
      shc.querySelector('[data-act2="apply"]').onclick = function () {
        var api = ($('ch_api') || {}).value ? $('ch_api').value.trim() : '';
        var sec = ($('ch_sec') || {}).value ? $('ch_sec').value.trim() : '';
        var url = ($('ch_url') || {}).value ? $('ch_url').value.trim() : '';
        if (!api && !url) { toast('填一个 Api-key 或接口地址'); return; }
        closeSheet();
        var job = api
          ? Sync.createSpace('extendsclass', api, sec)
          : Sync.useProvider('custom', url, '');
        job.then(function () {
          toast(Sync.state === 'ready' ? '云端通道已切换并同步' : (Sync.lastError || '已切换，但同步未完成'));
          render();
        }, function (err) {
          toast('切换失败：' + (err && err.message ? err.message : '请检查填写内容'));
          render();
        });
      };
      return;
    }
    if (act === 'cleardemo') {
      confirmSheet('清空示例数据？', '会删除带「示例」标签的 3 个目标及其记录，你自己建的目标不受影响。', '清空示例', true)
        .then(function (ok) {
          if (!ok) return;
          var n = global.Seed.clearDemo();
          toast(n ? '已清空 ' + n + ' 个示例目标' : '没有示例数据了');
          render();
        });
      return;
    }
    if (act === 'clearall') {
      var body = '<div style="font-size:13px;color:var(--ink-2);line-height:1.7">这会删除<b>全部目标、全部打卡记录和全部周复盘</b>，并同步清空云端，无法恢复。<br><br>如果确定，请输入 <b style="color:var(--danger)">清空</b> 两个字：</div>' +
        '<div class="field"><input id="cfm" placeholder="在这里输入：清空"></div>';
      var sh2 = openSheet('清空全部数据', body,
        '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn btn-danger" data-ok="1">确认清空</button>');
      sh2.querySelector('[data-ok]').onclick = function () {
        var v = ($('cfm').value || '').trim();
        if (v !== '清空') { toast('请输入「清空」两个字'); return; }
        DB.replaceAll([], [], []);
        closeSheet(); toast('已清空全部数据'); render();
      };
      return;
    }
  });

  function copyText(t) {
    if (!t) { toast('没有可复制的内容'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请长按选择'); }
      ta.remove();
    }
  }

  /* =========================================================
   *  启动：先渲染界面，再拉云端
   * ========================================================= */
  function boot() {
    // 1) 先用本地缓存渲染，绝不白屏
    renderNav();
    render();
    Sync.onChange(function () {
      // 同步状态变化时只更新状态条，避免打断输入
      var bars = qsa('.syncbar');
      if (bars.length) {
        var tmp = document.createElement('div');
        tmp.innerHTML = syncBarHtml();
        var fresh = tmp.firstChild;
        bars.forEach(function (b) { b.className = fresh.className; b.innerHTML = fresh.innerHTML; });
      }
    });
    // 2) 首次使用写入示例数据
    global.Seed.ensureSeed(false);
    render();
    // 3) 连接云端
    Sync.init().then(function () {
      global.Seed.ensureSeed(false);
      render();
    }, function () {
      render();
    });
    // 4) 回到前台 / 网络恢复时补一次同步
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) Sync.push(true).catch(function () { });
    });
    window.addEventListener('online', function () { Sync.retry(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.App = { render: render, S: S };
})(window);
