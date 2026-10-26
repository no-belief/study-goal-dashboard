/* =========================================================
 *  sync.js —— 在线资料库同步层
 *  三张线上数据表：goals（目标）/ checkins（打卡）/ reviews（周复盘）
 *  页面读写全部走这里，本地只做离线兜底缓存。
 * ========================================================= */
(function (global) {
  'use strict';

  var SCHEMA = 1;
  var LS_DATA = 'lms.data.v1';
  var LS_SPACE = 'lms.space.v1';
  var LS_CUSTOM = 'lms.custom.v1';

  /* ---------- 小工具 ---------- */
  function now() { return Date.now(); }
  function uid() {
    return 'x' + now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function fetchJSON(url, opt) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, (opt && opt.timeout) || 12000);
    return fetch(url, {
      method: (opt && opt.method) || 'GET',
      headers: (opt && opt.headers) || {},
      body: (opt && opt.body) !== undefined ? opt.body : undefined,
      signal: ctrl.signal,
      cache: 'no-store'
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') >= 0) return r.json();
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('bad json'); } });
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }

  /* =========================================================
   *  通道（在线存储 Provider）
   *  每个通道 = 一个可公网读写的 JSON 空间
   * ========================================================= */
  var Providers = {
    jsonblob: {
      key: 'jsonblob',
      label: 'JSONBlob 云端空间',
      order: 1,
      create: function () {
        // 该服务用 Location 头回传新建空间地址
        return fetch('https://jsonblob.com/api/jsonBlob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goals: [], checkins: [], reviews: [] })
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var loc = res.headers.get('Location') || '';
          var m = loc.match(/([A-Za-z0-9\-_]{6,})\s*$/) || loc.match(/jsonBlob\/([A-Za-z0-9\-_]+)/);
          if (!m) throw new Error('无法创建云端空间');
          return m[1];
        });
      },
      read: function (id) {
        return fetchJSON('https://jsonblob.com/api/jsonBlob/' + encodeURIComponent(id));
      },
      write: function (id, data) {
        return fetch('https://jsonblob.com/api/jsonBlob/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
      }
    },

    npoint: {
      key: 'npoint',
      label: 'nPoint 云端空间',
      order: 2,
      create: function () {
        return fetchJSON('https://api.npoint.io/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goals: [], checkins: [], reviews: [] })
        }).then(function (r) {
          var id = r && (r.id || r.uri || r.url);
          if (!id) throw new Error('无法创建云端空间');
          return String(id).replace(/^.*\//, '');
        });
      },
      read: function (id) {
        return fetchJSON('https://api.npoint.io/' + encodeURIComponent(id));
      },
      write: function (id, data) {
        return fetch('https://api.npoint.io/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
      }
    },

    /* ExtendsClass：免费账号即可拿 Api-key，读写稳定、CORS 全开 */
    extendsclass: {
      key: 'extendsclass',
      label: 'ExtendsClass 云端空间',
      order: 3,
      needKey: true,
      create: function (id, key) {
        return fetchJSON('https://json.extendsclass.com/bin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-key': key,
            'Security-key': Sync.secret2 || ''
          },
          body: JSON.stringify({ goals: [], checkins: [], reviews: [] })
        }).then(function (r) {
          var bid = r && (r.id || (r.uri ? String(r.uri).replace(/^.*\//, '') : null));
          if (!bid) throw new Error('无法创建云端空间');
          return bid;
        });
      },
      read: function (id, key) {
        return fetchJSON('https://json.extendsclass.com/bin/' + encodeURIComponent(id), {
          headers: { 'Security-key': Sync.secret2 || '' }
        });
      },
      write: function (id, data, key) {
        return fetch('https://json.extendsclass.com/bin/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Security-key': Sync.secret2 || ''
          },
          body: JSON.stringify(data)
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
      }
    },

    jsonbin: {
      key: 'jsonbin',
      label: 'JSONBin（需填密钥）',
      order: 5,
      needKey: true,
      create: function (id, key) {
        return fetchJSON('https://api.jsonbin.io/v3/b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
          body: JSON.stringify({ goals: [], checkins: [], reviews: [] })
        }).then(function (r) {
          var bid = r && r.metadata && r.metadata.id;
          if (!bid) throw new Error('无法创建云端空间');
          return bid;
        });
      },
      read: function (id, key) {
        return fetchJSON('https://api.jsonbin.io/v3/b/' + encodeURIComponent(id) + '/latest', {
          headers: { 'X-Master-Key': key }
        }).then(function (r) { return r && r.record ? r.record : r; });
      },
      write: function (id, data, key) {
        return fetch('https://api.jsonbin.io/v3/b/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
          body: JSON.stringify(data)
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
      }
    },

    custom: {
      key: 'custom',
      label: '自定义同步接口',
      order: 6,
      needUrl: true,
      create: function () { return Promise.reject(new Error('请在「我的」里填写同步接口地址')); },
      read: function (id) { return fetchJSON(id); },
      write: function (id, data) {
        return fetch(id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) {
          if (r.ok) return true;
          // 部分接口只接受 POST
          return fetch(id, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(function (r2) { if (!r2.ok) throw new Error('HTTP ' + r2.status); return true; });
        });
      }
    }
  };

  /* =========================================================
   *  空数据结构
   * ========================================================= */
  function emptyDoc() {
    return {
      v: SCHEMA,
      updatedAt: now(),
      goals: [],
      checkins: [],
      reviews: [],
      tombstones: { goals: {}, checkins: {}, reviews: {} }
    };
  }

  function normalize(d) {
    var o = emptyDoc();
    if (!d || typeof d !== 'object') return o;
    o.updatedAt = Number(d.updatedAt) || now();
    o.goals = Array.isArray(d.goals) ? d.goals : [];
    o.checkins = Array.isArray(d.checkins) ? d.checkins : [];
    o.reviews = Array.isArray(d.reviews) ? d.reviews : [];
    var t = d.tombstones || {};
    o.tombstones = {
      goals: t.goals || {}, checkins: t.checkins || {}, reviews: t.reviews || {}
    };
    return o;
  }

  /* ---------- 双向合并：按 id 取新，删除用墓碑传播 ---------- */
  function mergeList(localArr, remoteArr, localTomb, remoteTomb, tsKey) {
    var map = {};
    var i, it;
    for (i = 0; i < localArr.length; i++) { it = localArr[i]; if (it && it.id) map[it.id] = it; }
    for (i = 0; i < remoteArr.length; i++) {
      it = remoteArr[i];
      if (!it || !it.id) continue;
      var cur = map[it.id];
      if (!cur) {
        map[it.id] = it;
      } else {
        var a = Number(cur[tsKey]) || Number(cur.createdAt) || 0;
        var b = Number(it[tsKey]) || Number(it.createdAt) || 0;
        if (b >= a) map[it.id] = it;
      }
    }
    // 合并墓碑（谁的新听谁的）
    var tomb = {};
    for (var k in localTomb) tomb[k] = localTomb[k];
    for (var k2 in remoteTomb) {
      if (!tomb[k2] || Number(remoteTomb[k2]) > Number(tomb[k2])) tomb[k2] = remoteTomb[k2];
    }
    // 应用墓碑：删除时间 ≥ 实体更新时间 才真的删
    var out = [];
    for (var id in map) {
      var tv = Number(tomb[id]) || 0;
      var ev = Number(map[id][tsKey]) || Number(map[id].createdAt) || 0;
      if (tv && tv >= ev) { continue; }        // 已删除
      out.push(map[id]);
    }
    // 清理 90 天前的墓碑，避免无限膨胀
    var cut = now() - 90 * 86400000, clean = {};
    for (var id2 in tomb) { if (Number(tomb[id2]) > cut) clean[id2] = tomb[id2]; }
    return { list: out, tomb: clean };
  }

  function mergeDoc(local, remote) {
    local = normalize(local); remote = normalize(remote);
    var g = mergeList(local.goals, remote.goals, local.tombstones.goals, remote.tombstones.goals, 'updatedAt');
    var c = mergeList(local.checkins, remote.checkins, local.tombstones.checkins, remote.tombstones.checkins, 'createdAt');
    var r = mergeList(local.reviews, remote.reviews, local.tombstones.reviews, remote.tombstones.reviews, 'updatedAt');
    return {
      v: SCHEMA,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, now()),
      goals: g.list, checkins: c.list, reviews: r.list,
      tombstones: { goals: g.tomb, checkins: c.tomb, reviews: r.tomb }
    };
  }

  /* =========================================================
   *  Sync 引擎
   * ========================================================= */
  var Sync = {
    state: 'loading',       // loading / ready / syncing / offline / error
    provider: null,
    providerKey: '',
    label: '正在连接云端…',
    spaceId: '',
    secret: '',
    secret2: '',
    lastSyncAt: 0,
    lastError: '',
    doc: emptyDoc(),
    _listeners: [],
    _timer: null,
    _retrying: false,
    _pending: 0,
    _inited: false
  };

  Sync.onChange = function (fn) { Sync._listeners.push(fn); };
  Sync.emit = function () {
    for (var i = 0; i < Sync._listeners.length; i++) {
      try { Sync._listeners[i](); } catch (e) { /* 忽略单个监听异常 */ }
    }
  };
  Sync.setState = function (s, err) {
    Sync.state = s;
    if (err !== undefined) Sync.lastError = err || '';
    Sync.emit();
  };

  /* ---------- 本地缓存 ---------- */
  function readLocal() {
    try {
      var raw = localStorage.getItem(LS_DATA);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function writeLocal(doc) {
    try { localStorage.setItem(LS_DATA, JSON.stringify(doc)); } catch (e) { }
  }

  /* ---------- 空间地址（跨设备靠它） ---------- */
  function readSpaceLS() {
    try { return JSON.parse(localStorage.getItem(LS_SPACE) || 'null'); } catch (e) { return null; }
  }
  function writeSpaceLS(sp) {
    try { localStorage.setItem(LS_SPACE, JSON.stringify(sp)); } catch (e) { }
  }
  function readCustomLS() {
    try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || 'null'); } catch (e) { return null; }
  }
  function writeCustomLS(c) {
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(c)); } catch (e) { }
  }
  function getUrlSid() {
    try {
      var u = new URL(location.href);
      return u.searchParams.get('sid') || '';
    } catch (e) { return ''; }
  }
  function putUrlSid(sid) {
    try {
      var u = new URL(location.href);
      u.searchParams.set('sid', sid);
      history.replaceState(null, '', u.toString());
    } catch (e) { }
  }
  Sync.shareUrl = function () {
    try {
      var u = new URL(location.href);
      u.searchParams.set('sid', Sync.spaceId);
      return u.toString();
    } catch (e) { return location.href; }
  };

  /* ---------- 探测可用通道 ---------- */
  function orderedProviders() {
    var arr = [];
    for (var k in Providers) arr.push(Providers[k]);
    arr.sort(function (a, b) { return a.order - b.order; });
    return arr;
  }
  function usable(p) {
    if (p.needKey) return !!Sync.secret;
    if (p.needUrl) return !!(Sync.spaceId && /^https?:\/\//.test(Sync.spaceId));
    return true;
  }

  function probeCreate() {
    var list = orderedProviders().filter(usable);
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.reject(new Error('没有可用的云端通道'));
      var p = list[i++];
      return p.create(Sync.spaceId, Sync.secret).then(function (id) {
        return { p: p, id: id };
      }, function () { return next(); });
    }
    return next();
  }

  /* ---------- 初始化：先渲染本地，再拉云端 ---------- */
  Sync.init = function () {
    if (Sync._inited) return Promise.resolve();
    Sync._inited = true;

    var local = readLocal();
    if (local) { Sync.doc = local; Sync.lastSyncAt = local.updatedAt; }

    var urlSid = getUrlSid();
    var saved = readSpaceLS();
    var custom = readCustomLS();

    if (custom) { Sync.secret = custom.secret || ''; Sync.secret2 = custom.secret2 || ''; }

    var space = null;
    if (urlSid) {
      // URL 上的空间优先（换设备/换浏览器的入口）
      var m = urlSid.match(/^([a-z]+):(.+)$/);
      space = m ? { key: m[1], id: m[2] } : { key: 'jsonblob', id: urlSid };
    } else if (saved) {
      space = saved;
    }

    return Sync._attach(space).then(function () {
      return Sync.pull();
    }, function (err) {
      // 拿不到已有空间 → 尝试新建
      if (space && space.id) {
        Sync.setState('error', '云端空间连接失败，已用本地数据继续。' + (err && err.message ? '（' + err.message + '）' : ''));
        return null;
      }
      return probeCreate().then(function (r) {
        Sync.provider = r.p; Sync.providerKey = r.p.key;
        Sync.spaceId = r.id; Sync.label = r.p.label;
        writeSpaceLS({ key: r.p.key, id: r.id });
        putUrlSid(r.p.key + ':' + r.id);
        Sync.setState('syncing');
        return Sync.push(true);
      }, function (e2) {
        Sync.provider = null;
        Sync.setState('offline', '暂时连不上云端，数据已存在本机，恢复后会自动同步。' + (e2 && e2.message ? '（' + e2.message + '）' : ''));
      });
    });
  };

  Sync._attach = function (space) {
    if (!space || !space.id) return Promise.reject(new Error('没有空间地址'));
    var p = Providers[space.key];
    if (!p) return Promise.reject(new Error('未知通道'));
    if (p.needKey && !Sync.secret) return Promise.reject(new Error('缺少密钥'));
    Sync.provider = p; Sync.providerKey = p.key; Sync.spaceId = space.id; Sync.label = p.label;
    writeSpaceLS({ key: p.key, id: space.id });
    putUrlSid(p.key + ':' + space.id);
    Sync.setState('loading');
    return Promise.resolve();
  };

  /* ---------- 拉取（云端 → 本地，合并） ---------- */
  Sync.pull = function () {
    if (!Sync.provider) return Promise.reject(new Error('未连接云端'));
    Sync.setState('syncing');
    return Sync.provider.read(Sync.spaceId, Sync.secret).then(function (remote) {
      Sync.doc = mergeDoc(Sync.doc, remote);
      Sync.doc.updatedAt = now();
      writeLocal(Sync.doc);
      Sync.lastSyncAt = now();
      Sync.setState('ready');
      return Sync.doc;
    }, function (err) {
      Sync.setState('offline', '拉取云端数据失败：' + (err && err.message ? err.message : '网络异常'));
      throw err;
    });
  };

  /* ---------- 推送（本地 → 云端，先合并再写） ---------- */
  Sync.push = function (immediate) {
    if (Sync._timer) { clearTimeout(Sync._timer); Sync._timer = null; }
    if (!immediate) {
      Sync._timer = setTimeout(function () { Sync.push(true); }, 220);
      Sync._pending++; Sync.emit();
      return Promise.resolve();
    }
    if (!Sync.provider) {
      // 还没连上云端：先安全落本地，等 init 完成后自动补推，绝不静默丢数据
      writeLocal(Sync.doc);
      Sync.setState('offline', Sync.lastError || '正在连接云端…');
      return Promise.resolve(false);
    }
    Sync.setState('syncing');
    return Sync.provider.read(Sync.spaceId, Sync.secret).then(function (remote) {
      var merged = mergeDoc(Sync.doc, remote);
      Sync.doc = merged;
      return Sync.provider.write(Sync.spaceId, merged, Sync.secret).then(function () {
        Sync.doc.updatedAt = now();
        writeLocal(Sync.doc);
        Sync.lastSyncAt = now();
        Sync._pending = 0;
        Sync.setState('ready');
        return true;
      });
    }, function (err) {
      // 读失败时仍然尝试直接写（有些通道读受限但可写）
      return Sync.provider.write(Sync.spaceId, Sync.doc, Sync.secret).then(function () {
        writeLocal(Sync.doc);
        Sync.lastSyncAt = now(); Sync._pending = 0;
        Sync.setState('ready');
        return true;
      }, function (e2) {
        writeLocal(Sync.doc);
        Sync._pending++;
        Sync.setState('offline', '写入云端失败：' + (e2 && e2.message ? e2.message : '网络异常'));
        throw e2;
      });
    });
  };

  /* ---------- 手动重新同步 ---------- */
  Sync.forceSync = function () {
    if (!Sync.provider) {
      return Sync.init().then(function () { return Sync.push(true); });
    }
    return Sync.push(true).then(function (ok) { return Sync.pull(); }, function () {
      return Sync.pull();
    });
  };

  /* ---------- 切换通道 ---------- */
  Sync.useProvider = function (key, id, secret, secret2) {
    var p = Providers[key];
    if (!p) return Promise.reject(new Error('未知通道'));
    Sync.provider = p; Sync.providerKey = key; Sync.spaceId = id || ''; Sync.label = p.label;
    if (secret !== undefined) Sync.secret = secret;
    if (secret2 !== undefined) Sync.secret2 = secret2;
    writeSpaceLS({ key: key, id: id || '' });
    writeCustomLS({ secret: Sync.secret || '', secret2: Sync.secret2 || '' });
    if (id) putUrlSid(key + ':' + id);
    return Sync.push(true).then(function () { return Sync.pull(); }, function () { return Sync.pull(); });
  };

  /** 在指定通道上新建一个全新的云端空间 */
  Sync.createSpace = function (key, secret, secret2) {
    var p = Providers[key];
    if (!p) return Promise.reject(new Error('未知通道'));
    if (secret !== undefined) Sync.secret = secret;
    if (secret2 !== undefined) Sync.secret2 = secret2;
    return p.create(Sync.spaceId, Sync.secret).then(function (id) {
      Sync.provider = p; Sync.providerKey = key; Sync.spaceId = id; Sync.label = p.label;
      writeSpaceLS({ key: key, id: id });
      writeCustomLS({ secret: Sync.secret || '', secret2: Sync.secret2 || '' });
      putUrlSid(key + ':' + id);
      return Sync.push(true);
    });
  };

  Sync.retry = function () {
    if (Sync._retrying) return Promise.resolve();
    Sync._retrying = true;
    return Sync.forceSync().catch(function () { }).then(function () { Sync._retrying = false; });
  };

  /* =========================================================
   *  数据表读写 API（页面只通过这三个表读写）
   * ========================================================= */
  var DB = {
    /* --- 目标表 --- */
    goals: function () { return Sync.doc.goals.slice(); },
    addGoal: function (g) {
      g.id = g.id || uid(); g.updatedAt = now();
      Sync.doc.goals.push(g); delete Sync.doc.tombstones.goals[g.id];
      DB.commit(); return g;
    },
    updateGoal: function (id, patch) {
      for (var i = 0; i < Sync.doc.goals.length; i++) {
        if (Sync.doc.goals[i].id === id) {
          for (var k in patch) Sync.doc.goals[i][k] = patch[k];
          Sync.doc.goals[i].updatedAt = now();
          delete Sync.doc.tombstones.goals[id];
          DB.commit();
          return Sync.doc.goals[i];
        }
      }
      return null;
    },
    removeGoal: function (id) {
      Sync.doc.goals = Sync.doc.goals.filter(function (g) { return g.id !== id; });
      Sync.doc.checkins = Sync.doc.checkins.filter(function (c) { return c.goalId !== id; });
      Sync.doc.tombstones.goals[id] = now();
      DB.commit();
    },

    /* --- 打卡记录表 --- */
    checkins: function (goalId) {
      return Sync.doc.checkins.filter(function (c) { return !goalId || c.goalId === goalId; });
    },
    addCheckin: function (c) {
      c.id = c.id || uid(); c.createdAt = now();
      Sync.doc.checkins.push(c); delete Sync.doc.tombstones.checkins[c.id];
      DB.commit(); return c;
    },
    removeCheckin: function (id) {
      Sync.doc.checkins = Sync.doc.checkins.filter(function (c) { return c.id !== id; });
      Sync.doc.tombstones.checkins[id] = now();
      DB.commit();
    },

    /* --- 周复盘表 --- */
    reviews: function () { return Sync.doc.reviews.slice(); },
    getReview: function (weekStart) {
      for (var i = 0; i < Sync.doc.reviews.length; i++) {
        if (Sync.doc.reviews[i].weekStart === weekStart) return Sync.doc.reviews[i];
      }
      return null;
    },
    saveReview: function (weekStart, patch) {
      var r = DB.getReview(weekStart);
      if (!r) {
        r = { id: uid(), weekStart: weekStart, keep: '', problem: '', tryIt: '', nextPlan: '', updatedAt: now() };
        Sync.doc.reviews.push(r);
      }
      for (var k in patch) r[k] = patch[k];
      r.updatedAt = now();
      delete Sync.doc.tombstones.reviews[r.id];
      DB.commit();
      return r;
    },

    /* --- 全量替换（清空 / 重置示例） --- */
    replaceAll: function (goals, checkins, reviews) {
      var t = now();
      Sync.doc.goals.forEach(function (g) { Sync.doc.tombstones.goals[g.id] = t; });
      Sync.doc.checkins.forEach(function (c) { Sync.doc.tombstones.checkins[c.id] = t; });
      Sync.doc.reviews.forEach(function (r) { Sync.doc.tombstones.reviews[r.id] = t; });
      Sync.doc.goals = goals; Sync.doc.checkins = checkins; Sync.doc.reviews = reviews;
      (goals || []).forEach(function (g) { delete Sync.doc.tombstones.goals[g.id]; });
      (checkins || []).forEach(function (c) { delete Sync.doc.tombstones.checkins[c.id]; });
      (reviews || []).forEach(function (r) { delete Sync.doc.tombstones.reviews[r.id]; });
      DB.commit(true);
    },

    commit: function (immediate) {
      Sync.doc.updatedAt = now();
      writeLocal(Sync.doc);
      if (immediate) Sync.push(true); else Sync.push();
    }
  };

  Sync.DB = DB;
  Sync.uid = uid;
  Sync.emptyDoc = emptyDoc;
  Sync.localOnly = function () { return !Sync.provider; };

  global.Sync = Sync;
  global.DB = DB;
})(window);
