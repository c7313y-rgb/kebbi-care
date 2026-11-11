// Google Apps Script の模擬環境（テスト専用）。SpreadsheetApp / Utilities 等の使う範囲だけを再現する。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function makeEnv(opts = {}) {
  const logs = [];
  const fmt = (d, tz, p) => {
    const o = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    if (o.hour === '24') o.hour = '00';
    let off = '';
    if (/XXX/.test(p)) { const ms = new Date(d.toLocaleString('en-US', { timeZone: tz })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })); const m = Math.round(ms / 60000); off = (m >= 0 ? '+' : '-') + String(Math.floor(Math.abs(m) / 60)).padStart(2, '0') + ':' + String(Math.abs(m) % 60).padStart(2, '0'); if (tz === 'UTC') off = 'Z'; }
    return p.replace("'T'", 'T').replace('yyyy', o.year).replace('MM', o.month).replace('dd', o.day).replace('HH', o.hour).replace('mm', o.minute).replace('ss', o.second).replace('XXX', off);
  };
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
    getDisplayValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { let v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; v = v == null ? '' : String(v); row.push(v.startsWith("'") ? v.slice(1) : v); } o.push(row); } return o; }
    getValues() { return this.getDisplayValues(); }
    getDisplayValue() { return this.getDisplayValues()[0][0]; }
    setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues size ${v.length}x${v[0].length} != ${this.nr}x${this.nc}`); v.forEach((row, i) => { const R = this.r - 1 + i; while (this.sh.d.length <= R) this.sh.d.push([]); row.forEach((x, j) => { if (typeof x === 'string' && /^=/.test(x)) throw new Error('数式が書き込まれました: ' + x); this.sh.d[R][this.c - 1 + j] = x; }); }); return this; }
    setValue(x) { return this.setValues([[x]]); }
    setNumberFormat() { return this; }
    clearContent() { for (let i = 0; i < this.nr; i++) { const R = this.r - 1 + i; if (this.sh.d[R]) for (let j = 0; j < this.nc; j++) this.sh.d[R][this.c - 1 + j] = ''; } return this; }
  }
  class Sheet {
    constructor(n) { this.n = n; this.d = []; }
    getName() { return this.n; } setName(n) { this.n = n; }
    getLastRow() { let l = 0; this.d.forEach((r, i) => { if (r.some(v => v !== '' && v != null)) l = i + 1; }); return l; }
    getMaxRows() { return Math.max(1000, this.d.length); }
    getRange(r, c, nr, nc) { if (r < 1 || c < 1 || (nr !== undefined && nr < 1)) throw new Error('bad range'); return new Range(this, r, c, nr, nc); }
    setFrozenRows() {} deleteRow(i) { this.d.splice(i - 1, 1); }
  }
  class SS {
    constructor() { this.id = 'SS_TEST_1'; this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
    getSheetByName(n) { return this.sheets.find(s => s.n === n) || null; } getSheets() { return this.sheets; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  }
  const ss = new SS(); const props = {}; const cache = {};
  const g = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    SpreadsheetApp: { create: () => ss, openById: id => { if (id !== ss.id) throw new Error('not found'); return ss; } },
    DriveApp: { getFileById: () => ({ moveTo: () => {} }), getFolderById: () => ({}) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    Utilities: {
      formatDate: fmt, getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b))
    },
    ContentService: { createTextOutput: c => ({ c, getContent() { return this.c; }, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    Logger: { log: m => logs.push(String(m)) }
  };
  vm.createContext(g);
  const dir = opts.dir || path.join(__dirname, '..', 'db-demo');
  for (const f of ['gas-code.js','mail-import.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), g, { filename: f });
  return { g, ss, props, cache, logs, fmt };
}
module.exports = { makeEnv };
