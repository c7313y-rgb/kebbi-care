/*
 * Kebbi Care DB v3.2 デモ用ランタイム
 * 本番の Apps Script コード（gas-code.js に同梱）を、ブラウザ内の模擬Google環境で動かす。
 * データはこのブラウザの localStorage だけに保存され、どこにも送信されない。架空データのみ。
 */
(function () {
  'use strict';
  var STORE = 'kc3demo_v32';
  var DEMO = window.KC3_DEMO = {
    adminKey: 'demo-admin', viewerKey: 'demo-viewer',
    deviceToken: 'kc3_demo_device_token_yururia_000000000001', deviceId: 'kebbi-yururia-01', siteId: 'yururia'
  };

  // ---------- SHA-256（同期版。Utilities.computeDigest の代わり） ----------
  function sha256Bytes(str) {
    var bytes = Array.isArray(str) ? Uint8Array.from(str.map(function (b) { return (b + 256) % 256; })) : new TextEncoder().encode(str);
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
    m.set(bytes); m[l] = 0x80;
    var bits = l * 8; for (var i = 0; i < 8; i++) m[withPad - 1 - i] = (bits / Math.pow(2, 8 * i)) & 0xff;
    var w = new Int32Array(64);
    for (var off = 0; off < withPad; off += 64) {
      for (i = 0; i < 16; i++) w[i] = (m[off + 4 * i] << 24) | (m[off + 4 * i + 1] << 16) | (m[off + 4 * i + 2] << 8) | m[off + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    H.forEach(function (x) { [24, 16, 8, 0].forEach(function (s) { var v = (x >>> s) & 0xff; out.push(v > 127 ? v - 256 : v); }); });
    return out;
  }

  // ---------- 日時（Utilities.formatDate の代わり） ----------
  function fmt(d, tz, p) {
    var o = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(d).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
    if (o.hour === '24') o.hour = '00';
    var off = '';
    if (/XXX/.test(p)) {
      if (tz === 'UTC') off = 'Z';
      else { var ms = new Date(d.toLocaleString('en-US', { timeZone: tz })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })); var mm = Math.round(ms / 60000); off = (mm >= 0 ? '+' : '-') + ('0' + Math.floor(Math.abs(mm) / 60)).slice(-2) + ':' + ('0' + (Math.abs(mm) % 60)).slice(-2); }
    }
    return p.replace("'T'", 'T').replace('yyyy', o.year).replace('MM', o.month).replace('dd', o.day).replace('HH', o.hour).replace('mm', o.minute).replace('ss', o.second).replace('XXX', off);
  }

  // ---------- スプレッドシートの模擬 ----------
  var state = null;
  function load() { try { state = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { state = null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { console.warn('保存できません', e); } }
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getDisplayValues = function () {
    var o = [];
    for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; v = v == null ? '' : String(v); row.push(v.charAt(0) === "'" ? v.slice(1) : v); } o.push(row); }
    return o;
  };
  Range.prototype.getValues = Range.prototype.getDisplayValues;
  Range.prototype.getDisplayValue = function () { return this.getDisplayValues()[0][0]; };
  Range.prototype.setValues = function (v) {
    var self = this;
    v.forEach(function (row, i) { var R = self.r - 1 + i; while (self.sh.d.length <= R) self.sh.d.push([]); row.forEach(function (x, j) { self.sh.d[R][self.c - 1 + j] = x; }); });
    return this;
  };
  Range.prototype.setValue = function (x) { return this.setValues([[x]]); };
  Range.prototype.setNumberFormat = function () { return this; };
  Range.prototype.clearContent = function () { for (var i = 0; i < this.nr; i++) { var R = this.r - 1 + i; if (this.sh.d[R]) for (var j = 0; j < this.nc; j++) this.sh.d[R][this.c - 1 + j] = ''; } return this; };
  function Sheet(obj) { this.o = obj; this.d = obj.d; }
  Sheet.prototype.getName = function () { return this.o.n; };
  Sheet.prototype.setName = function (n) { this.o.n = n; };
  Sheet.prototype.getLastRow = function () { var l = 0; this.d.forEach(function (r, i) { if (r.some(function (v) { return v !== '' && v != null; })) l = i + 1; }); return l; };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.d.length); };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.setFrozenRows = function () {};
  Sheet.prototype.deleteRow = function (i) { this.d.splice(i - 1, 1); };
  var SS = {
    getId: function () { return 'DEMO_SPREADSHEET'; },
    getUrl: function () { return '（デモ：このブラウザ内）'; },
    getSheetByName: function (n) { var s = state.sheets.filter(function (x) { return x.n === n; })[0]; return s ? new Sheet(s) : null; },
    getSheets: function () { return state.sheets.map(function (s) { return new Sheet(s); }); },
    insertSheet: function (n) { var s = { n: n, d: [] }; state.sheets.push(s); return new Sheet(s); }
  };
  var memCache = {};

  window.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return state.props[k] || null; }, setProperty: function (k, v) { state.props[k] = String(v); } }; } };
  window.SpreadsheetApp = { create: function () { return SS; }, openById: function () { return SS; } };
  // ドライブの模擬（顔画像の保存先）。中身は base64 文字列で localStorage に保存
  function b64ToBytes(b64) { var bin = atob(b64), out = new Array(bin.length); for (var i = 0; i < bin.length; i++) { var v = bin.charCodeAt(i); out[i] = v > 127 ? v - 256 : v; } return out; }
  function bytesToB64(bytes) { var s = '', CH = 0x8000; for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.slice(i, i + CH).map(function (b) { return (b + 256) % 256; })); return btoa(s); }
  function drive() { if (!state.drive) state.drive = { files: {}, n: 0 }; return state.drive; }
  function mkFolder(name, id) {
    return { getId: function () { return id; }, getName: function () { return name; }, createFolder: function (n) { var d = drive(); return mkFolder(n, 'FOLDER_' + (++d.n)); },
      createFile: function (blob) { var d = drive(), fid = 'FILE_' + (++d.n); d.files[fid] = { b64: bytesToB64(blob.getBytes()), trashed: false }; return { getId: function () { return fid; } }; } };
  }
  window.DriveApp = {
    createFolder: function (n) { var d = drive(); return mkFolder(n, 'FOLDER_' + (++d.n)); },
    getFolderById: function (id) { return mkFolder('Kebbi_Care_顔画像（取扱注意）', id); },
    getFileById: function (id) {
      var f = drive().files[id];
      return { moveTo: function () {}, setTrashed: function (t) { if (f) { if (t) delete drive().files[id]; } },
        getBlob: function () { if (!f) throw new Error('file not found'); return { getBytes: function () { return b64ToBytes(f.b64); } }; } };
    }
  };
  window.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {} }; } };
  window.CacheService = { getScriptCache: function () { return { get: function (k) { return k in memCache ? memCache[k] : null; }, put: function (k, v) { memCache[k] = v; }, remove: function (k) { delete memCache[k]; } }; } };
  window.Utilities = {
    formatDate: fmt,
    getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); },
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: function (alg, s) { return sha256Bytes(Array.isArray(s) ? s : String(s)); },
    base64Decode: function (s) { return b64ToBytes(String(s).replace(/\s/g, '')); },
    base64Encode: function (bytes) { return bytesToB64(bytes); },
    newBlob: function (bytes, mime, name) { return { getBytes: function () { return bytes.slice(); }, getContentType: function () { return mime; }, getName: function () { return name; } }; }
  };
  window.ContentService = { createTextOutput: function (c) { return { c: c, getContent: function () { return this.c; }, setMimeType: function () { return this; } }; }, MimeType: { JSON: 'json' } };
  window.ScriptApp = { getService: function () { return { getUrl: function () { return location.href.replace(/[^/]*$/, '') + 'kebbi.html'; } }; } };
  window.HtmlService = {};
  window.Logger = { log: function () {} };

  // ---------- 初期データ ----------
  function iso(minutesAgo) { return fmt(new Date(Date.now() - minutesAgo * 60000), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
  function seed() {
    state = { sheets: [{ n: 'Sheet1', d: [] }], props: {}, seededAt: new Date().toISOString() };
    memCache = {};
    setup_();
    state.props.ADMIN_KEY_HASH = sha256_(DEMO.adminKey);
    state.props.VIEWER_KEY_HASH = sha256_(DEMO.viewerKey);
    importMasters_(convertWorkbook_(window.KC3_DEMO_SHEETS));
    appendRows_('devices', [
      { device_id: DEMO.deviceId, site_id: DEMO.siteId, label: '1階 詰所（デモ）', token_hash: sha256_(DEMO.deviceToken), active: '1', created_at: iso(60 * 24), last_seen_at: '' }]);
    var call = function (action, body) { var r = JSON.parse(doPost({ postData: { contents: JSON.stringify(Object.assign({ token: DEMO.deviceToken, action: action }, body)) } }).getContent()); if (!r.ok) console.error('デモ初期データの登録に失敗', action, r.error); return r; };
    var H = [
      ['demo-handover-1', 300, 'U902', 'S9001', 'confirmed', '夜間は良眠。朝食は全量摂取。SpO2 97%、BP 126/74mmHg。', { item_1: '全量', item_3: '良眠', item_4: 'SpO2 97%、BP 126/74mmHg' }],
      ['demo-handover-2', 240, 'U903', 'S9001', 'confirmed', '夜間2回覚醒しトイレ誘導。Pトイレ使用。朝食は半量。ADL変化なし。', { item_1: '半量', item_2: 'Pトイレ使用', item_3: '2回覚醒', item_none: 'ADL変化なし' }],
      ['demo-handover-3', 90, 'U901', 'S9002', 'draft', '', { item_1: '8割', item_6: '穏やか', item_none: '娘さんが来週来訪予定' }]
    ];
    H.forEach(function (x, i) {
      call('records.save', { record: { record_id: x[0], type: 'handover', status: x[4], resident_id: x[2], staff_id: x[3], recorded_at: iso(x[1]), ai_processed_at: iso(x[1] - 0.3),
        source_text: '（音声認識の結果）' + (x[5] || '昼食は8割。午後は穏やかに過ごす。娘さんが来週来るって'), ai_summary: x[5] || '昼食は8割摂取。午後は穏やかに過ごした。娘さんが来週来訪予定。',
        confirmed_text: x[4] === 'confirmed' ? x[5] : '', items: x[6], ai_items: x[6], duration_sec: 70 + i * 25, ai_model: 'Weblab-MedLLM-gpt-oss-120b（デモ）' } });
    });
    call('records.save', { record: { record_id: 'demo-notice-1', type: 'notice', status: 'confirmed', staff_id: 'S9001', recorded_at: iso(120), confirmed_text: '本日15時に上野様のご家族が来訪予定です。居室の準備をお願いします。', recipient: '日勤者' } });
    call('records.save', { record: { record_id: 'demo-health-1', type: 'health', status: 'confirmed', resident_id: 'U901', staff_id: 'S9001', recorded_at: iso(60 * 26),
      source_text: '体調：良い\n痛み：なし\n食欲：ある', confirmed_text: '体調良好。痛みなし。食欲あり。' } });
    // 架空の顔画像（図形で作ったもの。実在の人物ではない）
    (window.KC3_DEMO_FACES || []).forEach(function (f) { try { uploadFace_(f.staff_id, f.b64, f.name); } catch (e) { console.error('デモの顔画像を登録できません', e); } });
    setSetting_('face_sync_to_device', true);
    call('playback.done', { record_id: 'demo-handover-1', revision: 1, staff_id: 'S9004', played_at: iso(200), mode: 'normal' });
    save();
  }

  load();
  if (!state || !state.sheets) seed();

  // ---------- 公開API ----------
  DEMO.persist = save;
  DEMO.reset = function () { localStorage.removeItem(STORE); seed(); };
  DEMO.reload = function () { load(); memCache = {}; };
  /** Kebbi端末から呼ぶのと同じ API（doPost）。通信内容も返す */
  DEMO.api = function (action, body, token) {
    DEMO.reload();
    var req = Object.assign({ token: token || DEMO.deviceToken, action: action }, body || {});
    var res = JSON.parse(doPost({ postData: { contents: JSON.stringify(req) } }).getContent());
    save();
    return { request: req, response: res };
  };
  /** 管理画面の google.script.run を、この環境の関数呼び出しに置き換える */
  window.google = { script: { run: (function () {
    function mk(ok, ng) {
      return new Proxy({}, { get: function (_, k) {
        if (k === 'withSuccessHandler') return function (h) { return mk(h, ng); };
        if (k === 'withFailureHandler') return function (h) { return mk(ok, h); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          setTimeout(function () {
            try {
              if (!/^admin[A-Za-z]+$/.test(k) || typeof window[k] !== 'function') throw new Error('呼び出せない関数です：' + k);
              DEMO.reload();
              var v = window[k].apply(null, JSON.parse(JSON.stringify(args)));
              save();
              ok && ok(JSON.parse(JSON.stringify(v === undefined ? null : v)));
            } catch (e) { ng && ng(e); }
          }, 120);
        };
      } });
    }
    return mk(null, null);
  })() } };
})();
