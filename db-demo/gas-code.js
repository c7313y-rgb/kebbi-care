/* Kebbi Care DB v3.2 Apps Script（本番コードをそのまま同梱） */
// ===== Store.gs（本番と同一） =====
/**
 * Store.gs — スプレッドシートの読み書き（Kebbi Care DB v3）
 * すべての値は文字列で保存する。シートを直接編集せず、APIと管理画面から操作する。
 */

var TZ_ = 'Asia/Tokyo';
var API_VERSION_ = '3.2';

var REC_COLS_ = ['record_id', 'revision', 'site_id', 'type', 'status', 'resident_id', 'staff_id', 'recorded_at',
  'source_text', 'ai_summary', 'confirmed_text', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_6', 'item_7', 'item_none',
  'ai_items', 'ai_model', 'ai_processed_at', 'recipient', 'duration_sec', 'device_id', 'created_at', 'updated_at', 'confirmed_at', 'confirmed_by', 'content_hash'];

var SCHEMA_ = {
  records: REC_COLS_,
  record_history: ['archived_at'].concat(REC_COLS_),
  playbacks: ['event_key', 'record_id', 'revision', 'staff_id', 'device_id', 'site_id', 'mode', 'played_at', 'received_at'],
  events: ['at', 'action', 'record_id', 'revision', 'staff_id', 'device_id', 'detail'],
  residents: ['resident_id', 'site_id', 'full_name', 'display_name', 'speech_name', 'reading', 'call_names', 'confirm_method', 'start_date', 'end_date', 'consent_checked', 'note', 'active'],
  staff: ['staff_id', 'display_name', 'role', 'job', 'site_id', 'home_office', 'scope', 'shift', 'start_date', 'end_date', 'show_since_last', 'proxy_id', 'display_mode',
    'can_input', 'can_confirm', 'can_view', 'can_play', 'active'],
  roles: ['role', 'scope', 'can_input', 'can_confirm', 'can_view', 'can_play', 'note'],
  terms: ['term_id', 'kind', 'readings', 'normal_display', 'normal_speech', 'easy_display', 'easy_speech', 'note'],
  overrides: ['entity', 'key', 'field', 'value', 'updated_at'],
  faces: ['staff_id', 'file_id', 'sha256', 'bytes', 'width', 'height', 'source_name', 'uploaded_at', 'uploaded_by'],
  sites: ['site_id', 'name', 'aliases'],
  devices: ['device_id', 'site_id', 'label', 'token_hash', 'active', 'created_at', 'last_seen_at'],
  settings: ['key', 'value'],
  import_log: ['at', 'summary']
};

var DEFAULT_ITEMS_ = ['食事', '排泄', '睡眠', 'バイタル', '服薬', '様子・気分', '特記事項']; // 仮置き。ジェネラス確定後に管理画面で変更
var ITEM_NONE_LABEL_ = '該当せず';   // 7項目のどれにも当てはまらない内容
var ITEM_KEYS_ = ['item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_6', 'item_7', 'item_none'];
// 実証の対象施設は ゆるり・あ鶴舞 の1拠点。職員の元の所属（KODOU・ほたる等）は staff.home_office に残す
var DEFAULT_SITES_ = [
  ['yururia', 'ゆるり・あ鶴舞', 'ゆるり・あ,ゆるり・あ鶴舞,ゆる鶴舞,看護小規模多機能型居宅介護 ゆるり・あ']
];
var TYPES_ = { handover: '申し送り', health: '健康チェック', notice: '連絡事項' };

function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  if (!id) throw apiError_('NOT_SETUP', 'setup_ が未実行です');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = db_().getSheetByName(name);
  if (!sh) throw apiError_('NOT_SETUP', name + ' シートがありません。setup_ を実行してください');
  return sh;
}

/** シート全体を {header, rows:[obj], rowIndex:[行番号]} で読む */
function readTable_(name) {
  var cols = SCHEMA_[name];
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return { rows: [], rowNo: [] };
  var vals = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  var rows = [], rowNo = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    var o = {};
    for (var j = 0; j < cols.length; j++) o[cols[j]] = vals[i][j];
    rows.push(o); rowNo.push(i + 2);
  }
  return { rows: rows, rowNo: rowNo };
}

function toRow_(name, o) {
  return SCHEMA_[name].map(function (c) { return safeCell_(o[c]); });
}

/** 先頭が = + - @ の文字列は数式として解釈されないよう ' を付ける（表示・取得値には ' は含まれない） */
function safeCell_(v) {
  var s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var cols = SCHEMA_[name];
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, objs.length, cols.length).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
}

function writeRow_(name, rowNo, obj) {
  var cols = SCHEMA_[name];
  sheet_(name).getRange(rowNo, 1, 1, cols.length).setNumberFormat('@').setValues([toRow_(name, obj)]);
}

/** シートの中身を丸ごと置き換える（マスタ取込用） */
function replaceTable_(name, objs) {
  var sh = sheet_(name);
  var cols = SCHEMA_[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (objs.length) sh.getRange(2, 1, objs.length, cols.length).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
}

function getSetting_(key, def) {
  var t = readTable_('settings').rows;
  for (var i = 0; i < t.length; i++) if (t[i].key === key) { try { return JSON.parse(t[i].value); } catch (e) { return def; } }
  return def;
}

function setSetting_(key, value) {
  var t = readTable_('settings');
  var v = JSON.stringify(value);
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i].key === key) { writeRow_('settings', t.rowNo[i], { key: key, value: v }); return; }
  appendRows_('settings', [{ key: key, value: v }]);
}

function itemLabels_() {
  var v = getSetting_('item_labels', DEFAULT_ITEMS_);
  return Array.isArray(v) && v.length === 7 ? v : DEFAULT_ITEMS_;
}

// ---------- 共通ユーティリティ ----------
/** 操作履歴（各アクションの日時）を1行追加する */
function logEvent_(action, o) {
  o = o || {};
  appendRows_('events', [{ at: nowIso_(), action: action, record_id: str_(o.record_id), revision: str_(o.revision), staff_id: str_(o.staff_id), device_id: str_(o.device_id), detail: str_(o.detail).slice(0, 500) }]);
}

function nowIso_() { return Utilities.formatDate(new Date(), TZ_, "yyyy-MM-dd'T'HH:mm:ssXXX"); }

/** 受け取った日時を "yyyy-MM-ddTHH:mm:ss+09:00" に正規化。読めなければ '' */
function normTime_(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v).trim();
  if (/T\d{1,2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, TZ_, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  var m = s.replace(/年|月/g, '/').replace(/日/g, ' ').replace('T', ' ').replace(/-/g, '/')
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return '';
  var z = function (n) { return ('0' + (n || 0)).slice(-2); };
  if (+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +(m[4] || 0) > 23 || +(m[5] || 0) > 59) return '';
  return m[1] + '-' + z(m[2]) + '-' + z(m[3]) + 'T' + z(m[4]) + ':' + z(m[5]) + ':' + z(m[6]) + '+09:00';
}

function sha256_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('');
}

function randomKey_(len) {
  var s = '';
  while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, len);
}

function apiError_(code, message) { var e = new Error(message); e.apiCode = code; return e; }

function str_(v) { return v === null || v === undefined ? '' : String(v); }

function todayYmd_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy/MM/dd'); }

/** 終了日を過ぎている・active=0 なら無効 */
function isActive_(o) {
  if (o.active === '0') return false;
  if (o.start_date && o.start_date.replace(/-/g, '/') > todayYmd_()) return false;
  if (o.end_date && o.end_date.replace(/-/g, '/') < todayYmd_()) return false;
  return true;
}

// ===== Masters.gs（本番と同一） =====
/**
 * Masters.gs — マスタ（利用者・職員・役割・専門用語・施設）の変換・手入力・配信
 *
 * 取込元：GENIAC実証PoC マスタ登録シート（XLSX）。管理画面でXLSXを選ぶと、ブラウザで各シートを
 * 表（2次元配列）に変換して送り、ここで正規化する。実名一覧のシート（Sheet1 等）は読まない。
 * 対象施設は ゆるり・あ鶴舞（site_id = yururia）の1拠点。
 *
 * 管理画面で入力した値（利用者の氏名、用語の発話など）は overrides シートに保存し、
 * XLSXを取り込み直しても消えないよう、読み込み時に上書きする。
 */

var XLSX_SHEETS_ = { residents: '利用者マスター', staff: '職員マスター', roles: '権限（役割別）', terms: '呼称・用語登録' };
var SITE_ID_ = 'yururia';

/** 管理画面で編集できる項目（エンティティ → 項目 → 表示名） */
var EDITABLE_ = {
  residents: { full_name: '氏名', display_name: '画面表示名', speech_name: '発話名（Kebbiが読む名前）', reading: '読み方（ひらがな）', call_names: '呼び名・ニックネーム（「、」区切り）' },
  staff: { display_mode: '表示・発話モード（normal / easy）' },
  terms: { normal_speech: '通常発話', easy_display: 'やさしい表示', easy_speech: 'やさしい発話', readings: '読み方（認識用）' }
};

function termKey_(t) { return t.kind + '|' + t.normal_display; }

/** 英字・記号を含む表記か */
function hasAscii_(s) { return /[A-Za-z%℃／\/]/.test(s); }

/** 通常発話：英字の表記は読み方へ（英字のみ→最初の読み、日本語混じり→最長の読み）。日本語の表記はそのまま */
function defaultNormalSpeech_(display, readings) {
  var rs = str_(readings).split('、').filter(String);
  if (!display) return '';
  if (!hasAscii_(display) || !rs.length) return display;
  return /^[\x00-\x7F]+$/.test(display) ? rs[0] : rs.slice().sort(function (a, b) { return b.length - a.length; })[0];
}

/** やさしい発話：「SpO2（酸素飽和度）」→「エスピーオーツー、酸素飽和度」 */
function defaultEasySpeech_(easyDisplay, normalDisplay, normalSpeech, readings) {
  var e = str_(easyDisplay).trim();
  if (!e) return normalSpeech;
  var m = e.match(/^(.*?)（(.*)）$/) || e.match(/^(.*?)\((.*)\)$/);
  var main = m ? m[1].trim() : e, gloss = m ? m[2].trim() : '';
  var mainSpeech = main === normalDisplay ? normalSpeech : defaultNormalSpeech_(main, readings);
  return gloss && gloss !== mainSpeech ? mainSpeech + '、' + gloss : mainSpeech;
}

/** 2次元配列のシート群 → マスタ（取込前のプレビュー兼用） */
function convertWorkbook_(sheets) {
  var warn = [];
  var site = { site_id: SITE_ID_, name: DEFAULT_SITES_[0][1], aliases: DEFAULT_SITES_[0][2] };
  var isOurSite = function (v) {
    var n = normName_(v);
    return !n || site.aliases.split(',').concat([site.name, site.site_id]).some(function (a) { return normName_(a) === n; });
  };
  var isExample = function (row) { return /架空/.test(str_(row[0])) || /架空/.test(row.join('')) && /例/.test(row.join('')); };
  var findHeader = function (rows, first) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) if (str_(rows[i][0]).replace(/\s/g, '') === first) return i;
    return -1;
  };
  var ymd = function (v) {
    if (v === null || v === undefined || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ_, 'yyyy/MM/dd');
    var s = String(v).trim();
    var m = s.replace(/-/g, '/').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) return m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2);
    if (/^\d{5}(\.\d+)?$/.test(s)) return Utilities.formatDate(new Date(Math.round((parseFloat(s) - 25569) * 86400000)), 'UTC', 'yyyy/MM/dd');
    return s;
  };
  var yes = function (v) { var s = str_(v).trim(); return s === '可' ? '1' : s === '不可' ? '0' : ''; };
  var clean = function (v) { return str_(v).replace(/^\s+|\s+$/g, ''); };
  var list = function (v) { return clean(v).split(/[、,]/).map(function (x) { return x.trim(); }).filter(String).join('、'); };

  // --- 役割
  var roles = [], exceptions = {};
  var R = sheets[XLSX_SHEETS_.roles] || [];
  var hr = findHeader(R, '役割名');
  if (hr < 0) warn.push('「' + XLSX_SHEETS_.roles + '」シートが見つからないか、見出し「役割名」がありません');
  else {
    var mode = 'role';
    for (var i = hr + 1; i < R.length; i++) {
      var row = R[i] || [];
      var a = clean(row[0]);
      if (!a) continue;
      if (/例外/.test(a)) { mode = 'skip'; continue; }
      if (a === '職員ID') { mode = 'exception'; continue; }
      if (mode === 'role') roles.push({ role: a, scope: clean(row[1]), can_input: yes(row[2]), can_confirm: yes(row[3]), can_view: yes(row[4]), can_play: yes(row[5]), note: clean(row[6]) });
      else if (mode === 'exception' && !/架空/.test(a)) exceptions[a] = { can_input: yes(row[2]), can_confirm: yes(row[3]), can_view: yes(row[4]), can_play: yes(row[5]) };
    }
  }
  var roleMap = {}; roles.forEach(function (r) { roleMap[r.role] = r; });

  // --- 利用者（ゆるり・あ鶴舞のみ）
  var residents = [];
  var U = sheets[XLSX_SHEETS_.residents] || [];
  var hu = findHeader(U, '利用者ID');
  if (hu < 0) warn.push('「' + XLSX_SHEETS_.residents + '」シートが見つからないか、見出し「利用者ID」がありません');
  else {
    var seenU = {}, noConsent = [], other = [];
    for (var i = hu + 1; i < U.length; i++) {
      var row = U[i] || [];
      var id = clean(row[0]);
      if (!id || isExample(row)) continue;
      if (!/^[A-Za-z0-9_\-]{1,40}$/.test(id)) { warn.push('利用者ID「' + id + '」に使えない文字があります（英数字のみ）'); continue; }
      if (seenU[id]) { warn.push('利用者ID「' + id + '」が重複しています（後の行を無視）'); continue; }
      seenU[id] = 1;
      if (!isOurSite(row[1])) { other.push(id + '（' + clean(row[1]) + '）'); continue; }
      var r = { resident_id: id, site_id: SITE_ID_, full_name: '', start_date: ymd(row[2]), end_date: ymd(row[3]),
        display_name: clean(row[4]), speech_name: clean(row[5]), reading: clean(row[6]).replace(/　/g, ' '),
        call_names: list(row[7]), confirm_method: clean(row[8]), consent_checked: ymd(row[9]), note: clean(row[10]), active: '1' };
      if (!r.display_name) warn.push('利用者 ' + id + '：画面表示名が空です');
      if (!r.speech_name) warn.push('利用者 ' + id + '：発話名が空です（読み上げでは「ご利用者」と読みます）');
      if (!r.consent_checked) noConsent.push(id);
      residents.push(r);
    }
    if (other.length) warn.push('ゆるり・あ鶴舞以外の利用者 ' + other.length + ' 名は対象外として取り込みません（' + other.join('・') + '）');
    if (noConsent.length) warn.push('同意確認台帳の照合日が空の利用者が ' + noConsent.length + ' 名います（' + noConsent.join('・') + '）。実データの記録前に同意範囲を照合してください');
    if (residents.length) warn.push('利用者の「氏名」はXLSXに列がないため空欄です。必要な場合は管理画面「マスタ」で入力してください（再取込しても消えません）');
  }

  // --- 職員（全員を ゆるり・あ鶴舞 の職員として登録。元の所属は home_office に残す）
  var staff = [];
  var S = sheets[XLSX_SHEETS_.staff] || [];
  var hs = findHeader(S, '職員ID');
  if (hs < 0) warn.push('「' + XLSX_SHEETS_.staff + '」シートが見つからないか、見出し「職員ID」がありません');
  else {
    var seenS = {}, visitors = {};
    for (var i = hs + 1; i < S.length; i++) {
      var row = S[i] || [];
      var id = clean(row[0]);
      if (!id || isExample(row)) continue;
      if (!/^[A-Za-z0-9_\-]{1,40}$/.test(id)) { warn.push('職員ID「' + id + '」に使えない文字があります（英数字のみ）'); continue; }
      if (seenS[id]) { warn.push('職員ID「' + id + '」が重複しています（後の行を無視）'); continue; }
      seenS[id] = 1;
      var role = clean(row[2]);
      var p = exceptions[id] || roleMap[role];
      if (!p) warn.push('職員 ' + id + '：役割「' + role + '」が権限表にありません（全て不可で登録）');
      p = p || { can_input: '0', can_confirm: '0', can_view: '0', can_play: '0' };
      var home = clean(row[4]);
      if (home && !isOurSite(home)) visitors[home] = (visitors[home] || 0) + 1;
      staff.push({ staff_id: id, display_name: clean(row[1]), role: role, job: clean(row[3]), site_id: SITE_ID_, home_office: home,
        scope: clean(row[5]), shift: clean(row[6]), start_date: ymd(row[7]), end_date: ymd(row[8]), show_since_last: clean(row[9]),
        proxy_id: clean(row[11]), display_mode: role === '外国人職員' ? 'easy' : 'normal',
        can_input: p.can_input || '0', can_confirm: p.can_confirm || '0', can_view: p.can_view || '0', can_play: p.can_play || '0', active: '1' });
    }
    var vk = Object.keys(visitors);
    if (vk.length) warn.push('他事業所所属の職員（' + vk.map(function (k) { return k + ' ' + visitors[k] + '名'; }).join('・') + '）は、ゆるり・あ鶴舞で記録・再生できる職員として登録し、元の所属を残します');
  }

  // --- 専門用語（通常モード／やさしいモード別に 表示・発話 を持つ）
  var terms = [];
  var T = sheets[XLSX_SHEETS_.terms] || [];
  var ht = findHeader(T, 'ID');
  if (ht < 0) warn.push('「' + XLSX_SHEETS_.terms + '」シートが見つからないか、見出し「ID」がありません');
  else {
    var n = 0, hira = [];
    for (var i = ht + 1; i < T.length; i++) {
      var row = T[i] || [];
      if (isExample(row) || !clean(row[1]) || !clean(row[3])) continue;
      if (clean(row[1]) === '利用者名') continue; // 利用者名は利用者マスターで管理
      n++;
      var t = { term_id: clean(row[0]) || ('T' + ('00' + n).slice(-3)), kind: clean(row[1]), readings: list(row[2]),
        normal_display: clean(row[3]), easy_display: clean(row[4]), note: clean(row[5]) };
      // 表計算の連番入力で末尾の数字がずれた例（SpO2→SpO1、O2→O1）を、やさしい表示を手がかりに補正する
      var em = t.easy_display.match(/^([A-Za-z]+)(\d)(?![A-Za-z0-9])/), dm = t.normal_display.match(/^([A-Za-z]+)(\d)$/);
      if (em && dm && em[1] === dm[1] && em[2] !== dm[2]) {
        warn.push('用語「' + t.normal_display + '」を「' + em[1] + em[2] + '」に補正しました（やさしい表示「' + t.easy_display + '」に合わせました。XLSX側も修正してください）');
        t.normal_display = em[1] + em[2];
      }
      if (!t.easy_display) t.easy_display = t.normal_display;
      t.normal_speech = defaultNormalSpeech_(t.normal_display, t.readings);
      t.easy_speech = defaultEasySpeech_(t.easy_display, t.normal_display, t.normal_speech, t.readings);
      // やさしい表示が「褥瘡（じょくそう）」のように ひらがなの読み を添えた形なら、その読みを両モードの発話にする
      var gm = t.easy_display.match(/^(.*?)[（(]([ぁ-ゖー\s]+)[）)]$/);
      if (gm && gm[1].trim() === t.normal_display) { t.normal_speech = t.easy_speech = gm[2].replace(/\s/g, ''); }
      else if (/ひらがな指定/.test(t.note)) hira.push(t.normal_display);
      terms.push(t);
    }
    if (hira.length) warn.push('「読み上げはひらがな指定」の用語 ' + hira.length + ' 件（' + hira.join('・') + '）は、ひらがなの読みがXLSXにありません。管理画面「マスタ」の通常発話・やさしい発話に入力してください');
  }
  return { sites: [site], roles: roles, residents: residents, staff: staff, terms: terms, warnings: warn,
    counts: { residents: residents.length, staff: staff.length, roles: roles.length, terms: terms.length } };
}

function normName_(s) { return str_(s).replace(/[\s　・･]/g, '').toLowerCase(); }

/** 取込（管理画面から）。マスタ表を置き換える。記録・再生履歴・管理画面での入力値（overrides）は消えない */
function importMasters_(m) {
  replaceTable_('sites', m.sites);
  replaceTable_('roles', m.roles);
  replaceTable_('residents', m.residents);
  replaceTable_('staff', m.staff);
  replaceTable_('terms', m.terms);
  appendRows_('import_log', [{ at: nowIso_(), summary: JSON.stringify(m.counts) + (m.warnings.length ? ' 注意' + m.warnings.length + '件' : '') }]);
  logEvent_('マスタ取込', { detail: JSON.stringify(m.counts) });
  try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
}

/** 管理画面での入力値を反映 */
function applyOverrides_(m, ov) {
  var idx = { residents: {}, staff: {}, terms: {} };
  m.residents.forEach(function (r) { idx.residents[r.resident_id] = r; });
  m.staff.forEach(function (s) { idx.staff[s.staff_id] = s; });
  m.terms.forEach(function (t) { idx.terms[termKey_(t)] = t; });
  ov.forEach(function (o) {
    var target = idx[o.entity] && idx[o.entity][o.key];
    if (target && EDITABLE_[o.entity] && EDITABLE_[o.entity][o.field]) { target[o.field] = o.value; (target._edited = target._edited || []).push(o.field); }
  });
}

/** マスタ一式（キャッシュ付き・入力値反映済み） */
function loadMasters_() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); var c = cache.get('masters_v3'); if (c) return JSON.parse(c); } catch (e) {}
  var m = { sites: readTable_('sites').rows, roles: readTable_('roles').rows, residents: readTable_('residents').rows,
    staff: readTable_('staff').rows, terms: readTable_('terms').rows, items: itemLabels_(),
    send_full_name: getSetting_('send_full_name_to_device', false) === true };
  applyOverrides_(m, readTable_('overrides').rows);
  m.version = sha256_(JSON.stringify(m)).slice(0, 16);
  try { if (cache) cache.put('masters_v3', JSON.stringify(m), 300); } catch (e) {}
  return m;
}

/** 管理画面からの入力（氏名・発話名・用語の発話など） */
function setOverride_(entity, key, field, value) {
  if (!EDITABLE_[entity] || !EDITABLE_[entity][field]) throw new Error('この項目は編集できません');
  if (entity === 'staff' && field === 'display_mode' && ['normal', 'easy'].indexOf(value) < 0) throw new Error('表示・発話モードは normal か easy です');
  if (str_(value).length > 500) throw new Error('長すぎます（500文字まで）');
  var t = readTable_('overrides');
  for (var i = 0; i < t.rows.length; i++) {
    var o = t.rows[i];
    if (o.entity === entity && o.key === key && o.field === field) { o.value = str_(value); o.updated_at = nowIso_(); writeRow_('overrides', t.rowNo[i], o); return; }
  }
  appendRows_('overrides', [{ entity: entity, key: key, field: field, value: str_(value), updated_at: nowIso_() }]);
}

function findStaff_(m, id) { for (var i = 0; i < m.staff.length; i++) if (m.staff[i].staff_id === id) return m.staff[i]; return null; }
function findResident_(m, id) { for (var i = 0; i < m.residents.length; i++) if (m.residents[i].resident_id === id) return m.residents[i]; return null; }

/**
 * 本文の専門用語をモード別に置き換える
 *   target='display'：通常→通常表示のまま／やさしい→やさしい表示（例 SpO2 → SpO2（酸素飽和度））
 *   target='speech' ：通常→通常発話（エスピーオーツー）／やさしい→やさしい発話（エスピーオーツー、酸素飽和度）
 * 確定本文は通常表示で書かれている前提。1文字の表記（尿・便・g 等）は語の一部と区別できないため置き換えない。
 */
function applyTerms_(text, terms, mode, target) {
  var easy = mode === 'easy';
  var list = terms.map(function (t) {
    var to = target === 'display' ? (easy ? t.easy_display : t.normal_display) : (easy ? t.easy_speech : t.normal_speech);
    return { from: t.normal_display, to: to };
  }).filter(function (x) { return x.from && x.to && x.to !== x.from && x.from.length >= 2; });
  list.sort(function (a, b) { return b.from.length - a.from.length; });
  // 1回の走査で置換する（置換後の文字列を再置換しない）
  if (!list.length) return target === 'display' ? str_(text) : speakUnits_(text);
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); };
  var re = new RegExp(list.map(function (x) { return esc(x.from); }).join('|'), 'g');
  var map = {}; list.forEach(function (x) { if (!(x.from in map)) map[x.from] = x.to; });
  var s = str_(text);
  var out = s.replace(re, function (hit, offset) {
    var before = s.charAt(offset - 1), after = s.charAt(offset + hit.length);
    if (/^[A-Za-z]/.test(hit) && /[A-Za-z]/.test(before)) return hit;   // SpO2 の中の O2 など
    if (/[A-Za-z0-9]$/.test(hit) && /[A-Za-z]/.test(after)) return hit;
    if (target === 'display' && (after === '（' || after === '(')) return hit; // すでに説明が付いている
    return map[hit];
  });
  return target === 'display' ? out : speakUnits_(out);
}

/** 発話用：数字の後ろの記号単位を読みに（1文字の用語は誤置換を避けて登録で扱わないため） */
function speakUnits_(s) {
  return str_(s).replace(/(\d)\s*[%％]/g, '$1パーセント').replace(/(\d)\s*℃/g, '$1ど').replace(/(\d)\s*㎏/g, '$1キロ');
}

function honorific_(name) {
  var n = str_(name).trim();
  if (!n) return 'ご利用者';
  return /(さん|様|さま|くん|ちゃん)$/.test(n) ? n : n + 'さん';
}

/** 端末に配る内容。AIの指示文に入れる文脈・音声認識の語彙・モード別の用語を含む */
function mastersForDevice_(m) {
  var residents = m.residents.filter(function (r) { return r.site_id === SITE_ID_ && isActive_(r); }).map(function (r) {
    var o = { resident_id: r.resident_id, display_name: r.display_name, speech_name: honorific_(r.speech_name), reading: r.reading,
      nicknames: r.call_names ? r.call_names.split('、').filter(String) : [], confirm_method: r.confirm_method };
    if (m.send_full_name) o.full_name = r.full_name;
    return o;
  });
  var staff = m.staff.filter(isActive_).map(function (s) {
    return { staff_id: s.staff_id, display_name: s.display_name, role: s.role, home_office: s.home_office, display_mode: s.display_mode === 'easy' ? 'easy' : 'normal',
      can_input: s.can_input === '1', can_confirm: s.can_confirm === '1', can_view: s.can_view === '1', can_play: s.can_play === '1' };
  });
  var terms = m.terms.map(function (t) {
    return { kind: t.kind, readings: t.readings ? t.readings.split('、').filter(String) : [],
      normal: { display: t.normal_display, speech: t.normal_speech }, easy: { display: t.easy_display, speech: t.easy_speech }, note: t.note };
  });
  var items = m.items.map(function (label, i) { return { key: 'item_' + (i + 1), label: label }; }).concat([{ key: 'item_none', label: ITEM_NONE_LABEL_ }]);
  var asr = [];
  residents.forEach(function (r) { r.nicknames.forEach(function (c) { asr.push(c); }); });
  terms.forEach(function (t) { t.readings.forEach(function (c) { asr.push(c); }); });
  asr = asr.filter(function (x, i) { return x && asr.indexOf(x) === i; });
  var site = m.sites[0] || { site_id: SITE_ID_, name: DEFAULT_SITES_[0][1] };
  var ctx = [];
  ctx.push('【施設】' + site.name);
  ctx.push('【利用者】利用者ID：表示名（呼び名・ニックネーム／読み方）。発話に該当する利用者が1人に決まらない場合は推測せず resident_id を空にし、職員に確認する。1回の発話に複数の利用者が含まれる場合は利用者ごとに分ける。');
  residents.forEach(function (r) { ctx.push(r.resident_id + '：' + r.display_name + (r.full_name ? '（氏名 ' + r.full_name + '）' : '') + '（' + r.nicknames.join('、') + '／' + r.reading + '）'); });
  ctx.push('【用語】話し言葉 → 記録での表記（通常表示）');
  terms.forEach(function (t) { if (t.readings.length) ctx.push(t.readings.join('／') + ' → ' + t.normal.display + (t.note ? '（注：' + t.note + '）' : '')); });
  ctx.push('【仕分け】内容を次の8区分に仕分ける：' + items.map(function (it) { return it.key + '=' + it.label; }).join('、') +
    '。7項目のどれにも当てはまらない内容は item_none（該当せず）に入れ、捨てない。該当する発話がない項目は空欄にする。数値・単位は発話どおりに残し、推測で補わない。');
  return { masters_version: m.version, site: { site_id: site.site_id, name: site.name }, items: items, residents: residents, staff: staff,
    terms: terms, asr_phrases: asr, ai_context: ctx.join('\n') };
}

// ===== Code.gs（本番と同一） =====
/**
 * Code.gs — Kebbi Care DB v3.2 API（Kebbi端末用）と管理画面の入口
 *
 * Kebbi端末：POST（JSON）。{ "token": 端末トークン, "action": "...", ...パラメータ }
 * 管理画面：GET（ブラウザで開く）。アクセスキーで認証。
 * 仕様は docs/開発者向け仕様書 を参照。
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kebbi Care DB 管理画面')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || ''); }
  catch (err) { return json_({ ok: false, error: { code: 'BAD_JSON', message: 'JSONとして読めません' } }); }
  try {
    var dev = authDevice_(body.token);
    var res = handle_(dev, String(body.action || ''), body);
    res.ok = true;
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: { code: err.apiCode || 'SERVER_ERROR', message: err.apiCode ? err.message : 'サーバーで予期しないエラーが発生しました：' + err.message } });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function authDevice_(token) {
  if (!token || typeof token !== 'string' || token.length < 20) throw apiError_('UNAUTHORIZED', '端末トークンがありません');
  var h = sha256_(token);
  var t = readTable_('devices');
  for (var i = 0; i < t.rows.length; i++) {
    var d = t.rows[i];
    if (d.token_hash === h) {
      if (d.active !== '1') throw apiError_('UNAUTHORIZED', 'この端末は停止されています');
      var now = nowIso_();
      if (d.last_seen_at.slice(0, 16) !== now.slice(0, 16)) { d.last_seen_at = now; try { writeRow_('devices', t.rowNo[i], d); } catch (e) {} }
      return d;
    }
  }
  throw apiError_('UNAUTHORIZED', '端末トークンが正しくありません');
}

function handle_(dev, action, b) {
  switch (action) {
    case 'ping': return { api_version: API_VERSION_, server_time: nowIso_(), device: { device_id: dev.device_id, site_id: dev.site_id, label: dev.label } };
    case 'masters.get': {
      var m = loadMasters_();
      if (b.since_version && b.since_version === m.version) return { unchanged: true, masters_version: m.version };
      return mastersForDevice_(m);
    }
    case 'records.save': return withLock_(function () { return saveRecord_(dev, b.record || {}, b.base_revision); });
    case 'records.confirm': return withLock_(function () { return confirmRecord_(dev, b); });
    case 'records.get': return { record: publicRecord_(getRecordForDevice_(dev, b.record_id, b.staff_id)) };
    case 'records.last': return { record: lastRecord_(dev, b) };
    case 'records.list': return listRecords_(dev, b);
    case 'playback.list': return playbackList_(dev, b);
    case 'playback.done': return withLock_(function () { return playbackDone_(dev, b); });
    case 'faces.list': return facesList_(dev);
    case 'faces.get': return faceGet_(dev, b);
    default: throw apiError_('UNKNOWN_ACTION', '不明な action：' + action);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('BUSY', '混み合っています。数秒後に同じ内容で再送してください');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- 職員の権限 ----------
function requireStaff_(m, staffId, perm) {
  var s = findStaff_(m, str_(staffId));
  if (!s) throw apiError_('STAFF_UNKNOWN', '職員ID「' + str_(staffId) + '」が登録されていません');
  if (!isActive_(s)) throw apiError_('STAFF_INACTIVE', '職員ID「' + s.staff_id + '」は利用停止中です');
  if (perm && s[perm] !== '1') {
    var label = { can_input: '入力・訂正', can_confirm: '内容の確定', can_view: '閲覧', can_play: 'Kebbi音声再生' }[perm];
    throw apiError_('PERMISSION_DENIED', s.display_name + '（' + s.role + '）には「' + label + '」の権限がありません');
  }
  return s;
}

// ---------- 記録 ----------
var TEXT_LIMIT_ = 20000;

/**
 * 申し送り・健康チェック・連絡事項の保存
 *   要約前後：source_text（音声認識の結果）→ ai_summary（国産AIの要約）→ confirmed_text（職員が確認した本文）
 *   仕分け　：ai_items（AIの仕分け）と items（職員確認後）を別々に保持。7項目＋item_none（該当せず）
 *   日時　　：recorded_at（記録の日時）・ai_processed_at（AI処理）・created_at／updated_at／confirmed_at（サーバー）・操作履歴（events）
 */
function saveRecord_(dev, r, baseRevision) {
  var m = loadMasters_();
  var id = str_(r.record_id).trim();
  if (!/^[A-Za-z0-9_\-:.]{8,80}$/.test(id)) throw apiError_('VALIDATION', 'record_id は端末で作る8〜80文字の英数字（UUID推奨）にしてください');
  var type = str_(r.type);
  if (!TYPES_[type]) throw apiError_('VALIDATION', 'type は handover / health / notice のいずれかです');
  var status = str_(r.status);
  if (status !== 'draft' && status !== 'confirmed') throw apiError_('VALIDATION', 'status は draft（途中保存）か confirmed（確定）です');
  var staff = requireStaff_(m, r.staff_id, status === 'confirmed' ? 'can_confirm' : 'can_input');
  if (status === 'confirmed' && staff.can_input !== '1') requireStaff_(m, r.staff_id, 'can_input');
  var residentId = str_(r.resident_id).trim();
  if (type !== 'notice' || residentId) {
    if (!residentId) throw apiError_('VALIDATION', '申し送り・健康チェックには resident_id（対象利用者）が必要です');
    var res = findResident_(m, residentId);
    if (!res || !isActive_(res)) throw apiError_('RESIDENT_UNKNOWN', '利用者ID「' + residentId + '」が登録されていないか、利用期間外です');
    if (res.site_id !== dev.site_id) throw apiError_('SITE_MISMATCH', '利用者ID「' + residentId + '」はこの端末の施設の利用者ではありません');
  }
  var items = normalizeItems_(r.items || {}, m.items, 'items');
  var aiItems = r.ai_items ? normalizeItems_(r.ai_items, m.items, 'ai_items') : null;
  var rec = {
    record_id: id, site_id: dev.site_id, type: type, status: status, resident_id: residentId, staff_id: staff.staff_id,
    recorded_at: r.recorded_at ? normTime_(r.recorded_at) : nowIso_(),
    ai_processed_at: r.ai_processed_at ? normTime_(r.ai_processed_at) : '',
    source_text: str_(r.source_text), ai_summary: str_(r.ai_summary), confirmed_text: str_(r.confirmed_text),
    ai_items: aiItems ? JSON.stringify(aiItems) : '',
    recipient: str_(r.recipient), duration_sec: r.duration_sec === undefined || r.duration_sec === null || r.duration_sec === '' ? '' : String(Math.round(Number(r.duration_sec))),
    ai_model: str_(r.ai_model), device_id: dev.device_id
  };
  if (rec.duration_sec === 'NaN') throw apiError_('VALIDATION', 'duration_sec は秒数（数値）です');
  if (!rec.recorded_at) throw apiError_('VALIDATION', 'recorded_at の日時を読めません（例：2026-11-11T09:30:00+09:00）');
  if (r.ai_processed_at && !rec.ai_processed_at) throw apiError_('VALIDATION', 'ai_processed_at の日時を読めません');
  ITEM_KEYS_.forEach(function (k) { rec[k] = items[k]; });
  ['source_text', 'ai_summary', 'confirmed_text', 'recipient', 'ai_items'].concat(ITEM_KEYS_).forEach(function (f) {
    if (str_(rec[f]).length > TEXT_LIMIT_) throw apiError_('VALIDATION', f + ' が長すぎます（' + TEXT_LIMIT_ + '文字まで）');
  });
  if (status === 'confirmed' && !rec.confirmed_text.trim()) throw apiError_('VALIDATION', '確定（confirmed）には confirmed_text（職員が確認した本文）が必要です');
  if (!(rec.source_text + rec.ai_summary + rec.confirmed_text + ITEM_KEYS_.map(function (k) { return items[k]; }).join('')).trim())
    throw apiError_('VALIDATION', '本文（source_text / ai_summary / confirmed_text / items）がすべて空です');
  return upsert_(rec, baseRevision, staff.staff_id, status === 'confirmed' ? '確定保存' : '途中保存');
}

/** items はキー item_1〜item_7・item_none、または項目名（例：食事・該当せず）で受け付ける */
function normalizeItems_(src, labels, name) {
  var out = {};
  ITEM_KEYS_.forEach(function (k) { out[k] = ''; });
  if (typeof src !== 'object' || Array.isArray(src)) throw apiError_('VALIDATION', name + ' はオブジェクトで送ってください');
  Object.keys(src).forEach(function (key) {
    var v = Array.isArray(src[key]) ? src[key].map(str_).join('\n') : str_(src[key]);
    if (ITEM_KEYS_.indexOf(key) >= 0) { out[key] = v; return; }
    if (key === ITEM_NONE_LABEL_) { out.item_none = v; return; }
    var i = labels.indexOf(key);
    if (i >= 0) { out['item_' + (i + 1)] = v; return; }
    throw apiError_('VALIDATION', name + ' に「' + key + '」はありません（' + labels.concat([ITEM_NONE_LABEL_]).join('・') + '、または item_1〜item_7・item_none）');
  });
  return out;
}

function contentHash_(rec) {
  var f = ['type', 'status', 'resident_id', 'staff_id', 'recorded_at', 'ai_processed_at', 'source_text', 'ai_summary', 'confirmed_text',
    'ai_items', 'recipient', 'duration_sec', 'ai_model'].concat(ITEM_KEYS_);
  return sha256_(f.map(function (k) { return str_(rec[k]); }).join('\u0001')).slice(0, 24);
}

function upsert_(rec, baseRevision, actor, action) {
  var t = readTable_('records');
  var at = -1;
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i].record_id === rec.record_id) { at = i; break; }
  var now = nowIso_();
  rec.content_hash = contentHash_(rec);
  if (at < 0) {
    rec.revision = '1'; rec.created_at = now; rec.updated_at = now;
    if (rec.status === 'confirmed') { rec.confirmed_at = now; rec.confirmed_by = actor; } else { rec.confirmed_at = ''; rec.confirmed_by = ''; }
    appendRows_('records', [rec]);
    logEvent_(action + '（新規）', { record_id: rec.record_id, revision: 1, staff_id: actor, device_id: rec.device_id, detail: TYPES_[rec.type] + (rec.resident_id ? ' ' + rec.resident_id : '') });
    return { record_id: rec.record_id, revision: 1, status: rec.status, created: true };
  }
  var old = t.rows[at];
  if (old.site_id !== rec.site_id) throw apiError_('SITE_MISMATCH', 'この記録IDは別の施設の記録です');
  if (old.content_hash === rec.content_hash) return { record_id: rec.record_id, revision: Number(old.revision), status: old.status, unchanged: true };
  if (baseRevision !== undefined && baseRevision !== null && baseRevision !== '' && String(baseRevision) !== old.revision)
    throw apiError_('CONFLICT', '他の端末・管理画面で更新されています（現在の版：' + old.revision + '）。records.get で最新を取得してから保存してください');
  if (old.status === 'confirmed' && rec.status === 'draft') throw apiError_('VALIDATION', '確定済みの記録を途中保存に戻すことはできません');
  appendRows_('record_history', [Object.assign({ archived_at: now }, old)]);
  rec.revision = String(Number(old.revision) + 1);
  rec.created_at = old.created_at; rec.updated_at = now;
  var label = action;
  if (rec.status === 'confirmed') {
    var changedText = old.status !== 'confirmed' || old.confirmed_text !== rec.confirmed_text;
    rec.confirmed_at = changedText ? now : old.confirmed_at; rec.confirmed_by = changedText ? actor : old.confirmed_by;
    if (old.status === 'confirmed' && changedText) label = '確定本文の訂正';
  } else { rec.confirmed_at = ''; rec.confirmed_by = ''; }
  writeRow_('records', t.rowNo[at], rec);
  logEvent_(label, { record_id: rec.record_id, revision: rec.revision, staff_id: actor, device_id: rec.device_id, detail: '版' + old.revision + '→' + rec.revision });
  return { record_id: rec.record_id, revision: Number(rec.revision), status: rec.status, updated: true };
}

function confirmRecord_(dev, b) {
  var m = loadMasters_();
  var staff = requireStaff_(m, b.staff_id, 'can_confirm');
  var cur = getRecordForDevice_(dev, b.record_id, null);
  var rec = Object.assign({}, cur);
  rec.status = 'confirmed';
  if (b.confirmed_text !== undefined && b.confirmed_text !== null) rec.confirmed_text = str_(b.confirmed_text);
  if (!rec.confirmed_text.trim()) rec.confirmed_text = rec.ai_summary;
  if (!rec.confirmed_text.trim()) throw apiError_('VALIDATION', '確定する本文がありません。confirmed_text を指定してください');
  if (b.items) { var it = normalizeItems_(b.items, m.items, 'items'); ITEM_KEYS_.forEach(function (k) { rec[k] = it[k]; }); }
  rec.device_id = dev.device_id;
  return upsert_(rec, b.base_revision, staff.staff_id, '確定');
}

function getRecordForDevice_(dev, recordId, staffId) {
  if (staffId) requireStaff_(loadMasters_(), staffId, 'can_view');
  var t = readTable_('records');
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    if (r.record_id === str_(recordId)) {
      if (r.site_id !== dev.site_id) throw apiError_('NOT_FOUND', '記録が見つかりません');
      return r;
    }
  }
  throw apiError_('NOT_FOUND', '記録が見つかりません');
}

function parseItems_(json) { try { var o = json ? JSON.parse(json) : null; return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }

function publicRecord_(r) {
  if (!r) return null;
  var labels = itemLabels_();
  var items = {};
  ITEM_KEYS_.forEach(function (k) { items[k] = r[k]; });
  return {
    record_id: r.record_id, revision: Number(r.revision), site_id: r.site_id, type: r.type, type_label: TYPES_[r.type], status: r.status,
    resident_id: r.resident_id, staff_id: r.staff_id, recorded_at: r.recorded_at, ai_processed_at: r.ai_processed_at,
    source_text: r.source_text, ai_summary: r.ai_summary, confirmed_text: r.confirmed_text,
    items: items, ai_items: parseItems_(r.ai_items), item_labels: labels.concat([ITEM_NONE_LABEL_]), item_keys: ITEM_KEYS_,
    recipient: r.recipient, duration_sec: r.duration_sec === '' ? null : Number(r.duration_sec), ai_model: r.ai_model, device_id: r.device_id,
    created_at: r.created_at, updated_at: r.updated_at, confirmed_at: r.confirmed_at, confirmed_by: r.confirmed_by
  };
}

function filterRecords_(rows, q) {
  var from = normTime_(q.from), until = normTime_(q.until);
  return rows.filter(function (r) {
    if (q.site_id && r.site_id !== q.site_id) return false;
    if (q.type && r.type !== q.type) return false;
    if (q.status && r.status !== q.status) return false;
    if (q.resident_id && r.resident_id !== q.resident_id) return false;
    if (q.staff_id && r.staff_id !== q.staff_id) return false;
    if (from && r.recorded_at < from) return false;
    if (until && r.recorded_at >= until) return false;
    if (q.keyword) {
      var hay = [r.source_text, r.ai_summary, r.confirmed_text, r.recipient].concat(ITEM_KEYS_.map(function (k) { return r[k]; })).join(' ');
      if (hay.indexOf(q.keyword) < 0) return false;
    }
    return true;
  });
}

function lastRecord_(dev, b) {
  if (b.staff_id) requireStaff_(loadMasters_(), b.staff_id, 'can_view');
  if (!b.resident_id) throw apiError_('VALIDATION', 'resident_id が必要です');
  var rows = filterRecords_(readTable_('records').rows, { site_id: dev.site_id, resident_id: str_(b.resident_id), type: str_(b.type || ''), status: str_(b.status || '') });
  rows.sort(function (a, c) { return (c.recorded_at + c.updated_at).localeCompare(a.recorded_at + a.updated_at); });
  return publicRecord_(rows[0] || null);
}

function listRecords_(dev, b) {
  if (b.staff_id) requireStaff_(loadMasters_(), b.staff_id, 'can_view');
  var rows = filterRecords_(readTable_('records').rows, { site_id: dev.site_id, type: str_(b.type || ''), status: str_(b.status || ''),
    resident_id: str_(b.resident_id || ''), from: b.from, until: b.until });
  rows.sort(function (a, c) { return c.recorded_at.localeCompare(a.recorded_at); });
  var limit = Math.max(1, Math.min(100, parseInt(b.limit, 10) || 50)), offset = Math.max(0, parseInt(b.offset, 10) || 0);
  return { total: rows.length, records: rows.slice(offset, offset + limit).map(publicRecord_), next_offset: offset + limit < rows.length ? offset + limit : null };
}

// ---------- 再生（通常モード／やさしいモード） ----------
function speechFor_(r, m, mode) {
  var t = r.recorded_at ? Number(r.recorded_at.slice(11, 13)) + '時' + Number(r.recorded_at.slice(14, 16)) + '分、' : '';
  var body = applyTerms_(r.confirmed_text, m.terms, mode, 'speech');
  if (r.type === 'notice') return t + '連絡事項です。' + (r.recipient ? r.recipient + 'へ。' : '') + body;
  var res = findResident_(m, r.resident_id);
  var who = honorific_(res ? res.speech_name : '');
  return t + who + 'の' + TYPES_[r.type] + 'です。' + body;
}

function playbackList_(dev, b) {
  var m = loadMasters_();
  var staff = requireStaff_(m, b.staff_id, 'can_play');
  var mode = b.mode === 'easy' || b.mode === 'normal' ? b.mode : (staff.display_mode === 'easy' ? 'easy' : 'normal');
  var since = normTime_(b.since) || Utilities.formatDate(new Date(Date.now() - 36 * 3600 * 1000), TZ_, "yyyy-MM-dd'T'HH:mm:ssXXX");
  var types = b.types && b.types.length ? b.types : ['handover', 'notice'];
  var unplayed = b.unplayed !== false;
  var rows = readTable_('records').rows.filter(function (r) {
    return r.site_id === dev.site_id && r.status === 'confirmed' && types.indexOf(r.type) >= 0 && r.recorded_at >= since &&
      (!b.resident_id || r.resident_id === b.resident_id);
  });
  var played = {};
  readTable_('playbacks').rows.forEach(function (p) { if (p.staff_id === staff.staff_id) played[p.record_id + '#' + p.revision] = p.played_at; });
  if (unplayed) rows = rows.filter(function (r) { return !played[r.record_id + '#' + r.revision]; });
  rows.sort(function (a, c) { return a.recorded_at.localeCompare(c.recorded_at); }); // 古い順に読み上げる
  var limit = Math.max(1, Math.min(100, parseInt(b.limit, 10) || 30));
  return {
    staff_id: staff.staff_id, mode: mode, total: rows.length,
    items: rows.slice(0, limit).map(function (r) {
      var res = findResident_(m, r.resident_id);
      return { record_id: r.record_id, revision: Number(r.revision), type: r.type, type_label: TYPES_[r.type], recorded_at: r.recorded_at,
        confirmed_at: r.confirmed_at, resident_id: r.resident_id, resident_display_name: res ? res.display_name : '', recipient: r.recipient,
        display_text: applyTerms_(r.confirmed_text, m.terms, mode, 'display'), speech: speechFor_(r, m, mode),
        played_at: played[r.record_id + '#' + r.revision] || null };
    })
  };
}

function playbackDone_(dev, b) {
  var m = loadMasters_();
  var staff = requireStaff_(m, b.staff_id, 'can_play');
  var r = getRecordForDevice_(dev, b.record_id, null);
  var rev = String(parseInt(b.revision, 10));
  if (rev !== r.revision) throw apiError_('STALE_REVISION', 'この記録は更新されています（現在の版：' + r.revision + '）。playback.list で取り直して再生してください');
  var key = r.record_id + '#' + rev + '#' + staff.staff_id;
  var exists = readTable_('playbacks').rows.some(function (p) { return p.event_key === key; });
  if (exists) return { recorded: false, duplicate: true };
  if (b.played_at && !normTime_(b.played_at)) throw apiError_('VALIDATION', 'played_at の日時を読めません');
  var mode = b.mode === 'easy' ? 'easy' : b.mode === 'normal' ? 'normal' : (staff.display_mode === 'easy' ? 'easy' : 'normal');
  var playedAt = normTime_(b.played_at) || nowIso_();
  appendRows_('playbacks', [{ event_key: key, record_id: r.record_id, revision: rev, staff_id: staff.staff_id, device_id: dev.device_id,
    site_id: dev.site_id, mode: mode, played_at: playedAt, received_at: nowIso_() }]);
  logEvent_('再生完了', { record_id: r.record_id, revision: rev, staff_id: staff.staff_id, device_id: dev.device_id, detail: (mode === 'easy' ? 'やさしいモード' : '通常モード') + ' 再生 ' + playedAt });
  return { recorded: true };
}

// ===== Admin.gs（本番と同一） =====
/**
 * Admin.gs — 管理画面（Index.html）から google.script.run で呼ぶ関数
 * すべて第1引数にアクセスキーを取り、サーバー側で権限を確認する。
 *   管理キー：すべての操作（確定・訂正、マスタ取込、端末登録、設定）
 *   閲覧キー：記録の閲覧、再生状況、集計、CSV出力
 * 名前が _ で終わる関数は google.script.run から呼べない（エディタ専用）。
 */

function role_(key) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('auth_fail') || 0);
  if (fails >= 30) throw new Error('認証の失敗が続いたため10分間ロックしています');
  var p = PropertiesService.getScriptProperties();
  var h = sha256_(str_(key));
  if (key && h === p.getProperty('ADMIN_KEY_HASH')) return 'admin';
  if (key && h === p.getProperty('VIEWER_KEY_HASH')) return 'viewer';
  cache.put('auth_fail', String(fails + 1), 600);
  throw new Error('アクセスキーが正しくありません');
}
function needAdmin_(key) { if (role_(key) !== 'admin') throw new Error('この操作には管理キーが必要です'); }

function adminLogin(key) {
  var role = role_(key);
  var m = loadMasters_();
  return { role: role, sites: m.sites, items: m.items, item_none_label: ITEM_NONE_LABEL_, types: TYPES_, send_full_name: m.send_full_name, face_sync: role === 'admin' ? faceSyncOn_() : false, staff: m.staff.filter(isActive_).map(function (s) {
    return { staff_id: s.staff_id, display_name: s.display_name, site_id: s.site_id, can_confirm: s.can_confirm === '1' };
  }), residents: m.residents.map(function (r) { return { resident_id: r.resident_id, display_name: r.display_name, full_name: role === 'admin' ? r.full_name : '', site_id: r.site_id }; }) };
}

function playedMap_() {
  var map = {};
  readTable_('playbacks').rows.forEach(function (p) {
    var k = p.record_id + '#' + p.revision;
    (map[k] = map[k] || []).push(p);
  });
  return map;
}

function adminRecords(key, q) {
  role_(key);
  q = q || {};
  var rows = filterRecords_(readTable_('records').rows, q);
  rows.sort(function (a, c) { return c.recorded_at.localeCompare(a.recorded_at); });
  var pm = playedMap_();
  var limit = Math.min(500, parseInt(q.limit, 10) || 200), offset = Math.max(0, parseInt(q.offset, 10) || 0);
  return { total: rows.length, rows: rows.slice(offset, offset + limit).map(function (r) {
    var p = publicRecord_(r);
    p.played_count = (pm[r.record_id + '#' + r.revision] || []).length;
    p.filled = [1, 2, 3, 4, 5, 6, 7].filter(function (k) { return str_(r['item_' + k]).trim(); }).length;
    p.has_none = !!str_(r.item_none).trim();
    return p;
  }) };
}

function adminRecordDetail(key, recordId) {
  role_(key);
  var r = readTable_('records').rows.filter(function (x) { return x.record_id === recordId; })[0];
  if (!r) throw new Error('記録が見つかりません');
  var hist = readTable_('record_history').rows.filter(function (x) { return x.record_id === recordId; }).map(publicRecord_);
  var plays = readTable_('playbacks').rows.filter(function (x) { return x.record_id === recordId; });
  var events = readTable_('events').rows.filter(function (x) { return x.record_id === recordId; });
  return { record: publicRecord_(r), history: hist, playbacks: plays, events: events };
}

/** 管理画面での確定・本文訂正。確定権限のある職員IDを指定する */
function adminConfirm(key, recordId, staffId, confirmedText, baseRevision) {
  needAdmin_(key);
  return withLock_(function () {
    var m = loadMasters_();
    var staff = requireStaff_(m, staffId, 'can_confirm');
    var cur = readTable_('records').rows.filter(function (x) { return x.record_id === recordId; })[0];
    if (!cur) throw new Error('記録が見つかりません');
    var rec = Object.assign({}, cur, { status: 'confirmed', confirmed_text: str_(confirmedText), device_id: 'admin' });
    if (!rec.confirmed_text.trim()) throw new Error('確定する本文が空です');
    return upsert_(rec, baseRevision, staff.staff_id, '確定（管理画面）');
  });
}

function adminDashboard(key, q) {
  role_(key);
  q = q || {};
  var all = filterRecords_(readTable_('records').rows, q);
  var pm = playedMap_();
  var labels = itemLabels_();
  var conf = all.filter(function (r) { return r.status === 'confirmed'; });
  var ho = conf.filter(function (r) { return r.type === 'handover'; });
  var playable = conf.filter(function (r) { return r.type === 'handover' || r.type === 'notice'; });
  var played = playable.filter(function (r) { return (pm[r.record_id + '#' + r.revision] || []).length > 0; });
  var dur = ho.filter(function (r) { return r.duration_sec !== ''; }).map(function (r) { return Number(r.duration_sec); });
  var byDay = {};
  all.forEach(function (r) {
    var d = r.recorded_at.slice(0, 10);
    byDay[d] = byDay[d] || { handover: 0, health: 0, notice: 0 };
    byDay[d][r.type]++;
  });
  var bySite = {};
  all.forEach(function (r) {
    var s = bySite[r.site_id] = bySite[r.site_id] || { total: 0, confirmed: 0, draft: 0 };
    s.total++; s[r.status]++;
  });
  return {
    total: all.length, confirmed: conf.length, draft: all.length - conf.length,
    handover: ho.length, health: conf.filter(function (r) { return r.type === 'health'; }).length, notice: conf.filter(function (r) { return r.type === 'notice'; }).length,
    playback_rate: playable.length ? played.length / playable.length : null, playable: playable.length, played: played.length,
    avg_duration_sec: dur.length ? dur.reduce(function (a, b) { return a + b; }, 0) / dur.length : null,
    item_fill: labels.map(function (l, i) { var n = ho.filter(function (r) { return str_(r['item_' + (i + 1)]).trim(); }).length; return { label: l, filled: n, total: ho.length }; }),
    item_none: { label: ITEM_NONE_LABEL_, filled: ho.filter(function (r) { return str_(r.item_none).trim(); }).length, total: ho.length },
    ai_changed: ho.filter(function (r) { var a = parseItems_(r.ai_items); return a && ITEM_KEYS_.some(function (k) { return str_(a[k]) !== str_(r[k]); }); }).length,
    by_day: Object.keys(byDay).sort().map(function (d) { return { date: d, handover: byDay[d].handover, health: byDay[d].health, notice: byDay[d].notice }; }),
    by_site: Object.keys(bySite).map(function (s) { return { site_id: s, total: bySite[s].total, confirmed: bySite[s].confirmed, draft: bySite[s].draft }; })
  };
}

/** CSV（UTF-8 BOM付き、Excelで数式として動かないよう保護）。table = records / playbacks / residents / staff / terms */
function adminExportCsv(key, table, q) {
  var role = role_(key);
  var cols, rows;
  var labels = itemLabels_();
  if (table === 'records') {
    var pm = playedMap_();
    rows = filterRecords_(readTable_('records').rows, q || {});
    rows.sort(function (a, c) { return a.recorded_at.localeCompare(c.recorded_at); });
    cols = [['record_id', '記録ID'], ['revision', '版'], ['site_id', '施設'], ['type', '種別'], ['status', '状態'], ['resident_id', '利用者ID'], ['staff_id', '記録した職員'],
      ['recorded_at', '記録日時'], ['ai_processed_at', 'AI処理日時'], ['created_at', '初回保存日時'], ['updated_at', '最終更新日時'], ['confirmed_at', '確定日時'], ['confirmed_by', '確定者'],
      ['source_text', '要約前：元テキスト（音声認識）'], ['ai_summary', '要約後：AI要約'], ['confirmed_text', '確定本文（読み上げ）']]
      .concat(labels.map(function (l, i) { return ['item_' + (i + 1), l]; })).concat([['item_none', ITEM_NONE_LABEL_]])
      .concat(labels.map(function (l, i) { return ['ai_item_' + (i + 1), 'AI仕分け：' + l]; })).concat([['ai_item_none', 'AI仕分け：' + ITEM_NONE_LABEL_]])
      .concat([['recipient', '宛先'], ['duration_sec', '所要時間(秒)'], ['ai_model', 'AIモデル'], ['device_id', '端末'], ['played_count', '再生人数'], ['last_played_at', '最終再生日時']]);
    rows = rows.map(function (r) {
      var o = Object.assign({}, r); o.type = TYPES_[r.type]; o.status = r.status === 'confirmed' ? '確定' : '途中保存';
      var ps = pm[r.record_id + '#' + r.revision] || [];
      o.played_count = ps.length; o.last_played_at = ps.map(function (p) { return p.played_at; }).sort().pop() || '';
      var ai = parseItems_(r.ai_items) || {};
      ITEM_KEYS_.forEach(function (k) { o['ai_' + k] = ai[k] || ''; });
      return o;
    });
  } else if (table === 'playbacks' || table === 'events') {
    rows = readTable_(table).rows;
    cols = SCHEMA_[table].map(function (c) { return [c, c]; });
  } else if (['residents', 'staff', 'terms'].indexOf(table) >= 0) {
    if (role !== 'admin') throw new Error('マスタの出力には管理キーが必要です');
    rows = loadMasters_()[table];
    cols = SCHEMA_[table].map(function (c) { return [c, c]; });
  } else throw new Error('出力できない表です');
  var esc = function (v) {
    var s = str_(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var lines = [cols.map(function (c) { return esc(c[1]); }).join(',')];
  rows.forEach(function (r) { lines.push(cols.map(function (c) { return esc(r[c[0]]); }).join(',')); });
  return { filename: 'kebbi_care_' + table + '_' + Utilities.formatDate(new Date(), TZ_, 'yyyyMMdd_HHmm') + '.csv', csv: '﻿' + lines.join('\r\n') + '\r\n', count: rows.length };
}

function adminMasters(key) {
  role_(key);
  var m = loadMasters_();
  return { sites: m.sites, roles: m.roles, residents: m.residents, staff: m.staff, terms: m.terms, items: m.items, version: m.version,
    editable: EDITABLE_, send_full_name: m.send_full_name, log: readTable_('import_log').rows.slice(-10).reverse() };
}

/** マスタの手入力（氏名・ニックネーム・読み方・発話名、用語の表示・発話、職員の表示モード）。XLSXの再取込後も残る */
function adminUpdateMaster(key, entity, id, field, value) {
  needAdmin_(key);
  return withLock_(function () {
    var m = loadMasters_();
    var exists = entity === 'residents' ? !!findResident_(m, id) : entity === 'staff' ? !!findStaff_(m, id) : entity === 'terms' ? m.terms.some(function (t) { return termKey_(t) === id; }) : false;
    if (!exists) throw new Error('対象が見つかりません');
    setOverride_(entity, id, field, str_(value).trim());
    try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
    logEvent_('マスタ編集', { detail: entity + ' ' + id + ' ' + field });
    return true;
  });
}

/** 利用者の氏名をKebbiへ送るか（初期値：送らない） */
function adminSetSendFullName(key, on) {
  needAdmin_(key);
  setSetting_('send_full_name_to_device', on === true);
  try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
  logEvent_('設定変更', { detail: '氏名のKebbi送信：' + (on === true ? 'する' : 'しない') });
  return on === true;
}

/** XLSXをブラウザで表に変換したもの（{シート名: 2次元配列}）を受け取り、プレビューを返す */
function adminPreviewImport(key, sheets) {
  needAdmin_(key);
  var r = convertWorkbook_(sheets || {});
  return { counts: r.counts, warnings: r.warnings, sample: { residents: r.residents.slice(0, 5), staff: r.staff.slice(0, 5), terms: r.terms.slice(0, 5) } };
}

function adminImport(key, sheets) {
  needAdmin_(key);
  var r = convertWorkbook_(sheets || {});
  if (!r.residents.length && !r.staff.length) throw new Error('利用者・職員が1件も読み取れませんでした。取込を中止しました');
  withLock_(function () { importMasters_(r); });
  return { counts: r.counts, warnings: r.warnings };
}

function adminDevices(key) {
  needAdmin_(key);
  return readTable_('devices').rows.map(function (d) { return { device_id: d.device_id, site_id: d.site_id, label: d.label, active: d.active === '1', created_at: d.created_at, last_seen_at: d.last_seen_at }; });
}

/** 端末を登録し、トークンを1回だけ返す（再表示はできない。紛失時は停止して再登録） */
function adminRegisterDevice(key, deviceId, siteId, label) {
  needAdmin_(key);
  deviceId = str_(deviceId).trim();
  if (!/^[A-Za-z0-9_\-]{3,40}$/.test(deviceId)) throw new Error('端末IDは3〜40文字の英数字にしてください（例：kebbi-yururia-01）');
  if (!loadMasters_().sites.some(function (s) { return s.site_id === siteId; })) throw new Error('施設を選んでください');
  return withLock_(function () {
    var t = readTable_('devices');
    if (t.rows.some(function (d) { return d.device_id === deviceId; })) throw new Error('この端末IDは登録済みです。停止してから別のIDで登録してください');
    var token = 'kc3_' + randomKey_(40);
    appendRows_('devices', [{ device_id: deviceId, site_id: siteId, label: str_(label), token_hash: sha256_(token), active: '1', created_at: nowIso_(), last_seen_at: '' }]);
    logEvent_('端末登録', { device_id: deviceId, detail: str_(label) });
    var url = ScriptApp.getService().getUrl();
    return { config: { endpoint: url, token: token, device_id: deviceId, site_id: siteId } };
  });
}

function adminSetDeviceActive(key, deviceId, active) {
  needAdmin_(key);
  return withLock_(function () {
    var t = readTable_('devices');
    for (var i = 0; i < t.rows.length; i++) if (t.rows[i].device_id === deviceId) { t.rows[i].active = active ? '1' : '0'; writeRow_('devices', t.rowNo[i], t.rows[i]); logEvent_(active ? '端末再開' : '端末停止', { device_id: deviceId }); return true; }
    throw new Error('端末が見つかりません');
  });
}

function adminSaveItemLabels(key, labels) {
  needAdmin_(key);
  if (!Array.isArray(labels) || labels.length !== 7 || labels.some(function (l) { return !str_(l).trim(); })) throw new Error('7項目すべてに名称を入れてください');
  var clean = labels.map(function (l) { return str_(l).trim(); });
  if (clean.filter(function (l, i) { return clean.indexOf(l) === i; }).length !== 7) throw new Error('項目名が重複しています');
  setSetting_('item_labels', clean);
  logEvent_('設定変更', { detail: '7項目名：' + clean.join('・') });
  try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
  return clean;
}

// ===== Faces.gs（本番と同一） =====
/**
 * Faces.gs — 職員の顔画像（Kebbiの顔認証に使う登録画像）
 *
 * 保存先：Googleドライブの専用フォルダ（「Kebbi_Care_顔画像（取扱注意）」。共有しない）。
 *         スプレッドシートの faces シートには、ファイルID・ハッシュ・大きさ・登録日時だけを持つ。
 * 登録：管理画面（管理キー）から。ブラウザで縮小・再圧縮してから送るため、撮影日時・位置情報（GPS）などのメタデータは残らない。
 *       メタデータ（Exif）が残った画像はサーバー側でも拒否する。
 * Kebbiへの配信：管理画面「設定」で「顔画像をKebbiへ配信する」を有効にしたときだけ（初期値：配信しない）。
 *       faces.list で一覧（職員ID・ハッシュ）、faces.get で1人分の画像（base64）。配信は操作履歴に残る。
 * 利用者の顔画像は扱わない（職員のログイン用のみ）。
 */

var FACE_MAX_BYTES_ = 400 * 1024;
var FACE_MIN_PX_ = 160, FACE_MAX_PX_ = 1600;
var FACE_FOLDER_NAME_ = 'Kebbi_Care_顔画像（取扱注意）';

function faceFolder_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('FACE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 削除されていれば作り直す */ } }
  var parent = null, pid = p.getProperty('FOLDER_ID');
  if (pid) { try { parent = DriveApp.getFolderById(pid); } catch (e) { parent = null; } }
  var f = (parent || DriveApp).createFolder(FACE_FOLDER_NAME_);
  p.setProperty('FACE_FOLDER_ID', f.getId());
  return f;
}

function faceSyncOn_() { return getSetting_('face_sync_to_device', false) === true; }

function bytesHex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) { return ((b + 256) % 256).toString(16).replace(/^(.)$/, '0$1'); }).join('');
}

/** JPEGか、Exif（撮影情報・位置情報）が残っていないか、縦横の画素数を調べる */
function inspectJpeg_(bytes) {
  var u = function (i) { return (bytes[i] + 256) % 256; };
  if (bytes.length < 4 || u(0) !== 0xFF || u(1) !== 0xD8) throw new Error('JPEG画像ではありません');
  var i = 2, w = 0, h = 0;
  while (i + 4 < bytes.length) {
    if (u(i) !== 0xFF) throw new Error('JPEG画像を読み取れません');
    var mk = u(i + 1);
    if (mk === 0xD9 || mk === 0xDA) break;              // 画像データの開始・終了
    var len = (u(i + 2) << 8) | u(i + 3);
    if (mk === 0xE1) throw new Error('撮影情報（Exif・位置情報など）が残っています。管理画面から登録してください（自動で取り除きます）');
    if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { h = (u(i + 5) << 8) | u(i + 6); w = (u(i + 7) << 8) | u(i + 8); }
    i += 2 + len;
  }
  if (!w || !h) throw new Error('画像の大きさを読み取れません');
  if (Math.min(w, h) < FACE_MIN_PX_ || Math.max(w, h) > FACE_MAX_PX_) throw new Error('画像の大きさは短い辺 ' + FACE_MIN_PX_ + 'px 以上・長い辺 ' + FACE_MAX_PX_ + 'px 以下にしてください（' + w + '×' + h + '）');
  return { width: w, height: h };
}

function faceRow_(staffId) {
  var t = readTable_('faces');
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i].staff_id === staffId) return { row: t.rows[i], rowNo: t.rowNo[i] };
  return null;
}

/** 管理画面：顔画像の登録・差し替え。base64 は JPEG（data URL の場合は先頭を除く） */
function adminUploadFace(key, staffId, base64, sourceName) {
  needAdmin_(key);
  return uploadFace_(staffId, base64, sourceName);
}

function uploadFace_(staffId, base64, sourceName) {
  staffId = str_(staffId).trim();
  var m = loadMasters_();
  if (!findStaff_(m, staffId)) throw new Error('職員ID「' + staffId + '」が職員マスタにありません');
  var bytes = Utilities.base64Decode(str_(base64).replace(/^data:image\/jpeg;base64,/, ''));
  if (bytes.length > FACE_MAX_BYTES_) throw new Error('画像が大きすぎます（' + Math.round(bytes.length / 1024) + 'KB。' + FACE_MAX_BYTES_ / 1024 + 'KB まで）');
  var dim = inspectJpeg_(bytes);
  var sha = bytesHex_(bytes);
  return withLock_(function () {
    var cur = faceRow_(staffId);
    if (cur && cur.row.sha256 === sha) return { staff_id: staffId, sha256: sha, unchanged: true };
    var file = faceFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', staffId + '.jpg'));
    var row = { staff_id: staffId, file_id: file.getId(), sha256: sha, bytes: String(bytes.length), width: String(dim.width), height: String(dim.height),
      source_name: str_(sourceName).slice(0, 120), uploaded_at: nowIso_(), uploaded_by: 'admin' };
    if (cur) {
      try { DriveApp.getFileById(cur.row.file_id).setTrashed(true); } catch (e) { /* 既に無い */ }
      writeRow_('faces', cur.rowNo, row);
    } else appendRows_('faces', [row]);
    logEvent_(cur ? '顔画像の差し替え' : '顔画像の登録', { staff_id: staffId, detail: row.width + '×' + row.height + ' ' + Math.round(bytes.length / 1024) + 'KB' });
    return { staff_id: staffId, sha256: sha, created: !cur, updated: !!cur };
  });
}

/** 管理画面：登録状況（管理キーのみ。閲覧キーでは見られない） */
function adminFaces(key) {
  needAdmin_(key);
  var m = loadMasters_();
  var faces = readTable_('faces').rows;
  var by = {}; faces.forEach(function (f) { by[f.staff_id] = f; });
  return {
    sync: faceSyncOn_(),
    staff: m.staff.map(function (s) {
      var f = by[s.staff_id];
      return { staff_id: s.staff_id, display_name: s.display_name, role: s.role, home_office: s.home_office, active: isActive_(s),
        has_face: !!f, uploaded_at: f ? f.uploaded_at : '', width: f ? f.width : '', height: f ? f.height : '', bytes: f ? f.bytes : '', sha256: f ? f.sha256 : '' };
    }),
    orphans: faces.filter(function (f) { return !findStaff_(m, f.staff_id); }).map(function (f) { return f.staff_id; })
  };
}

/** 管理画面：確認用に画像を表示する（管理キーのみ） */
function adminFaceImage(key, staffId) {
  needAdmin_(key);
  var cur = faceRow_(str_(staffId));
  if (!cur) throw new Error('顔画像が登録されていません');
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(cur.row.file_id).getBlob().getBytes());
}

/** 管理画面：顔画像の削除（ドライブのファイルはごみ箱へ） */
function adminDeleteFace(key, staffId) {
  needAdmin_(key);
  return deleteFace_(staffId);
}

function deleteFace_(staffId) {
  staffId = str_(staffId);
  return withLock_(function () {
    var cur = faceRow_(staffId);
    if (!cur) return false;
    try { DriveApp.getFileById(cur.row.file_id).setTrashed(true); } catch (e) { /* 既に無い */ }
    sheet_('faces').deleteRow(cur.rowNo);
    logEvent_('顔画像の削除', { staff_id: staffId });
    return true;
  });
}

/** 顔画像をKebbiへ配信するか（初期値：配信しない） */
function adminSetFaceSync(key, on) {
  needAdmin_(key);
  setSetting_('face_sync_to_device', on === true);
  logEvent_('設定変更', { detail: '顔画像のKebbi配信：' + (on === true ? 'する' : 'しない') });
  return on === true;
}

// ---------- Kebbi端末用 ----------
function facesList_(dev) {
  if (!faceSyncOn_()) return { enabled: false, faces: [] };
  var m = loadMasters_();
  var faces = readTable_('faces').rows;
  return { enabled: true, faces: faces.map(function (f) {
    var s = findStaff_(m, f.staff_id);
    if (!s || !isActive_(s)) return null;
    return { staff_id: f.staff_id, display_name: s.display_name, sha256: f.sha256, width: Number(f.width), height: Number(f.height), updated_at: f.uploaded_at };
  }).filter(Boolean) };
}

function faceGet_(dev, b) {
  if (!faceSyncOn_()) throw apiError_('FACE_SYNC_DISABLED', '顔画像の配信は管理画面で無効になっています');
  var m = loadMasters_();
  requireStaff_(m, b.staff_id);
  var cur = faceRow_(str_(b.staff_id));
  if (!cur) throw apiError_('NOT_FOUND', '職員ID「' + str_(b.staff_id) + '」の顔画像は登録されていません');
  var data = Utilities.base64Encode(DriveApp.getFileById(cur.row.file_id).getBlob().getBytes());
  logEvent_('顔画像の配信', { staff_id: cur.row.staff_id, device_id: dev.device_id });
  return { staff_id: cur.row.staff_id, sha256: cur.row.sha256, mime: 'image/jpeg', width: Number(cur.row.width), height: Number(cur.row.height), data_base64: data };
}

// ===== Setup.gs（本番と同一） =====
/**
 * Setup.gs — 初期設定・自己診断・鍵の再発行（Apps Scriptエディタから実行する）
 *   1. setup_       データベース（スプレッドシート）を作成し、管理キー・閲覧キーを発行
 *   2. selfTest_    架空の利用者・職員・端末で 保存→確定→再生取得→再生完了→取得→顔画像の登録・配信 を実行し、後片付けする
 *   3. rotateKeys_  管理キー・閲覧キーを作り直す（漏えい・担当交代時）
 */

function setup_() {
  var p = PropertiesService.getScriptProperties();
  var ss = null, id = p.getProperty('DB_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Kebbi_Care_DB_v3');
    id = ss.getId();
    p.setProperty('DB_ID', id);
    var folderId = p.getProperty('FOLDER_ID');
    if (folderId) { try { DriveApp.getFileById(id).moveTo(DriveApp.getFolderById(folderId)); } catch (e) { Logger.log('フォルダへの移動に失敗しました（マイドライブに作成）：' + e); } }
  }
  Object.keys(SCHEMA_).forEach(function (name, i) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = i === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0] : ss.insertSheet(name);
    if (sh.getName() !== name) sh.setName(name);
    var cols = SCHEMA_[name];
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    else {
      var cur = sh.getRange(1, 1, 1, cols.length).getDisplayValues()[0];
      if (cur.join('|') !== cols.join('|')) throw new Error(name + ' シートの見出しが想定と違います。手で編集していないか確認してください');
    }
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), cols.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
  if (readTable_('sites').rows.length === 0) appendRows_('sites', DEFAULT_SITES_.map(function (s) { return { site_id: s[0], name: s[1], aliases: s[2] }; }));
  if (!getSetting_('item_labels', null)) setSetting_('item_labels', DEFAULT_ITEMS_);
  var out = ['準備完了：' + ss.getUrl()];
  try { out.push('顔画像の保存フォルダ：' + faceFolder_().getName() + '（共有しないでください）'); } catch (e) { out.push('顔画像フォルダを作れませんでした：' + e.message); }
  if (!p.getProperty('ADMIN_KEY_HASH')) out = out.concat(issueKeys_());
  else out.push('アクセスキーは発行済みです（作り直す場合は rotateKeys_ を実行）');
  out.forEach(function (l) { Logger.log(l); });
}

function issueKeys_() {
  var p = PropertiesService.getScriptProperties();
  var admin = 'A-' + randomKey_(24), viewer = 'V-' + randomKey_(24);
  p.setProperty('ADMIN_KEY_HASH', sha256_(admin));
  p.setProperty('VIEWER_KEY_HASH', sha256_(viewer));
  return ['管理キー（管理担当だけが保管）：' + admin, '閲覧キー（記録を確認する職員用）：' + viewer, '※キーはこの画面にしか表示されません。安全な場所に控えてください'];
}

function rotateKeys_() { issueKeys_().forEach(function (l) { Logger.log(l); }); }

function deleteRowsWhere_(name, pred) {
  var t = readTable_(name);
  var sh = sheet_(name);
  for (var i = t.rows.length - 1; i >= 0; i--) if (pred(t.rows[i])) sh.deleteRow(t.rowNo[i]);
}

function selfTest_() {
  var TR = 'ZZTEST-R1', TS = 'ZZTEST-S1', TV = 'ZZTEST-S2', TD = 'zztest-device';
  var token = 'kc3_' + randomKey_(40);
  var results = [];
  var faceSyncBefore = faceSyncOn_();
  var check = function (name, fn) {
    try { var v = fn(); results.push([name, v !== false, '']); }
    catch (e) { results.push([name, false, e.message]); }
  };
  try {
    appendRows_('residents', [{ resident_id: TR, site_id: 'yururia', display_name: 'テスト', speech_name: 'てすと', reading: 'てすと', call_names: 'てすとさん', active: '1' }]);
    appendRows_('staff', [{ staff_id: TS, display_name: 'テスト確定', role: '確定担当', site_id: 'yururia', display_mode: 'normal', can_input: '1', can_confirm: '1', can_view: '1', can_play: '1', active: '1' },
      { staff_id: TV, display_name: 'テスト閲覧', role: '外国人職員', site_id: 'yururia', display_mode: 'easy', can_input: '0', can_confirm: '0', can_view: '1', can_play: '1', active: '1' }]);
    appendRows_('terms', [{ term_id: 'ZZTEST-T1', kind: '略語（英字）', readings: 'ゼットゼットティー', normal_display: 'ZZT', normal_speech: 'ゼットゼットティー', easy_display: 'ZZT（てすと用語）', easy_speech: 'ゼットゼットティー、てすと用語' }]);
    appendRows_('devices', [{ device_id: TD, site_id: 'yururia', label: 'selftest', token_hash: sha256_(token), active: '1', created_at: nowIso_() }]);
    try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
    var call = function (action, body) {
      var res = JSON.parse(doPost({ postData: { contents: JSON.stringify(Object.assign({ token: token, action: action }, body)) } }).getContent());
      if (!res.ok) throw new Error(res.error.code + ' ' + res.error.message);
      return res;
    };
    var rid = 'zztest-' + randomKey_(12);
    check('疎通（ping）', function () { return call('ping', {}).device.device_id === TD; });
    check('マスタ取得（masters.get）', function () { var m = call('masters.get', {}); return m.residents.some(function (r) { return r.resident_id === TR; }) && m.ai_context.indexOf(TR) >= 0; });
    var draft = { record_id: rid, type: 'handover', status: 'draft', resident_id: TR, staff_id: TS, recorded_at: nowIso_(), ai_processed_at: nowIso_(),
      source_text: 'ちゅうしょくぜんりょう', ai_summary: '昼食全量。SpO2 98%', items: { item_1: '全量', item_none: '家族の話' }, ai_items: { item_1: '全量', item_none: '家族の話' } };
    check('途中保存（7項目＋該当せず・AI仕分け・AI処理日時）', function () { return call('records.save', { record: draft }).revision === 1; });
    check('同じ内容の再送で版が増えない', function () { return call('records.save', { record: draft }).unchanged === true; });
    check('権限のない職員の保存を拒否', function () { try { call('records.save', { record: { record_id: rid + 'x', type: 'handover', status: 'draft', resident_id: TR, staff_id: TV, ai_summary: 'x' } }); return false; } catch (e) { return e.message.indexOf('PERMISSION_DENIED') === 0; } });
    check('確定（records.confirm）', function () { return call('records.confirm', { record_id: rid, staff_id: TS, confirmed_text: '昼食は全量摂取。ZZT 98%' }).revision === 2; });
    var item;
    check('再生取得（playback.list）', function () { var l = call('playback.list', { staff_id: TV }); item = l.items.filter(function (x) { return x.record_id === rid; })[0]; return !!item && item.speech.indexOf('てすとさん') >= 0; });
    check('再生完了（playback.done）', function () { return call('playback.done', { record_id: rid, revision: item.revision, staff_id: TV }).recorded === true; });
    check('再生済みは次回の取得に出ない', function () { return !call('playback.list', { staff_id: TV }).items.some(function (x) { return x.record_id === rid; }); });
    check('前回取得（records.last）・要約前後', function () { var r = call('records.last', { resident_id: TR, type: 'handover' }).record; return r.record_id === rid && r.source_text && r.ai_summary && r.confirmed_text && r.items.item_none === '家族の話' && r.ai_items.item_1 === '全量' && !!r.ai_processed_at; });
    check('操作履歴（保存・確定・再生）', function () { var ev = readTable_('events').rows.filter(function (e) { return e.record_id === rid; }).map(function (e) { return e.action; }); return ev.length >= 3 && ev.some(function (a) { return /再生完了/.test(a); }); });
    check('やさしいモードの表示・読み上げ', function () { return item.speech.indexOf('ゼットゼットティー、てすと用語 98パーセント') >= 0 && item.display_text.indexOf('ZZT（てすと用語）') >= 0; });
    check('顔画像の登録・配信（faces.list / faces.get）', function () {
      uploadFace_(TS, SELFTEST_FACE_, 'selftest.jpg');
      setSetting_('face_sync_to_device', true);
      var l = call('faces.list', {}), g = call('faces.get', { staff_id: TS });
      return l.faces.some(function (f) { return f.staff_id === TS; }) && g.data_base64 === SELFTEST_FACE_;
    });
  } finally {
    try { deleteFace_(TS); } catch (e) {}
    setSetting_('face_sync_to_device', faceSyncBefore);
    deleteRowsWhere_('records', function (r) { return r.resident_id === TR; });
    deleteRowsWhere_('record_history', function (r) { return r.resident_id === TR; });
    deleteRowsWhere_('playbacks', function (r) { return r.device_id === TD; });
    deleteRowsWhere_('events', function (r) { return r.device_id === TD || (r.record_id || '').indexOf('zztest-') === 0 || r.staff_id === TS || r.staff_id === TV; });
    deleteRowsWhere_('residents', function (r) { return r.resident_id === TR; });
    deleteRowsWhere_('staff', function (r) { return r.staff_id === TS || r.staff_id === TV; });
    deleteRowsWhere_('terms', function (r) { return r.term_id === 'ZZTEST-T1'; });
    deleteRowsWhere_('devices', function (r) { return r.device_id === TD; });
    try { CacheService.getScriptCache().remove('masters_v3'); } catch (e) {}
  }
  results.forEach(function (r) { Logger.log((r[1] ? '成功　' : '失敗　') + r[0] + (r[2] ? '：' + r[2] : '')); });
  var ok = results.every(function (r) { return r[1]; });
  Logger.log(ok ? 'すべて成功（テストデータは削除済み）。デプロイに進んでください。' : '失敗があります。上のログを確認してください。');
  return ok;
}

/** 自己診断用の架空の画像（灰色の人型。160×160） */
var SELFTEST_FACE_ = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCACgAKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDeooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooqNp4lOC4/DmgCSioxcRE4Dj8eKkByMjpQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFRyzLEOeSegFPkcIhY9qznYuxZupoAWSV5D8x49O1MoooAKcjshypIptFAF+GdZODw3p61LWYCQQR1FaEMnmxhu/Q0APooooAKKKKACiiigAooooAKKKKACiiigCreNyqfiaq1NdH9+3tioaACiiigAooooAKsWjYl29mFV6fEcSpj1FAGjRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFG6GJifUZqGrl4mVDjt1qnQAUUUUAFFFFABUkA3TIB65qOrNmmWLnoOBQBbooooAKKKKACiiigAooooAKKKKACiiigAIBBB6Gs+aIxPjnHY1oUjKrjDAEUAZlFWJLVgfk+YfrUDKVOGBB96AEopQCTgAk+1TJau33vlHvQBHGhkcKP/wBVaCKEUKvQUiRrGuFH4+tOoAKKKKACiiigAooooAKKKKACiiigCGa48pwu3PGetR/bP+mf6028/wBaP92q9AFr7Z/0z/Wj7Z/0z/WqtFAFr7Z/0z/Wj7Z/0z/WqtFAFr7Z/wBM/wBaPtn/AEz/AFqrRQBa+2f9M/1o+2f9M/1qrRQBa+2f9M/1p8Vz5kgXZjPfNUqltv8AXr+P8qAL9FFFABRRRQAUUUUAFFFFAFO8/wBaP92q9WLz/Wj/AHar0AFFFFABRRRQAUUUUAFFFFABUtt/r1/H+VRVLbf69fx/lQBfooooAKKKKACiiigAooooAp3n+tH+7VerF5/rR/u1XoAKKKKACiiigAooooAKKKKACpbb/Xr+P8qiqW2/16/j/KgC/RRRQAUUUUAFFFFABRRRQBTvP9aP92q9WLz/AFo/3ar0AFFFFABRRRQAUUUUAFFFFABUtt/r1/H+VRVLbf69fx/lQBfooooAKKKKAP/Z';
