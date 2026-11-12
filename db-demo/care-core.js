/* Shared data rules for local review and Google Apps Script. No private data. */
var CareData = (function () {
  'use strict';
  var categories = [
    ['meal_intake','①食事量',['meal','meals','food','food_intake','food_amount','diet','meal_amount','食事','食事量','食事摂取量','食事摂取','食事状況']],
    ['urination','②排尿',['urine','urinary','urination','urine_output','排尿','排尿状況','尿']],
    ['defecation','③排便',['stool','bowel','bowel_movement','排便','排便状況','便']],
    ['condition_change','④体調変化',['physical_condition','health_condition','physical_change','condition','体調変化','体調','体調の変化','体調変化等']],
    ['restless_behavior','⑤不穏行動',['restlessness','restless','agitation','behavior','不穏','不穏行動','不穏行動等','不穏な行動']],
    ['sleep_status','⑥睡眠状況',['sleep','sleep_condition','sleep_state','睡眠','睡眠状況','睡眠状態']],
    ['medication_status','⑦服薬状況',['medication','medicine','medication_adherence','服薬','服薬状況','服薬管理','内服','内服状況']],
    ['not_applicable','⑧該当なし',['none','other','others','na','n/a','not_applicable','該当なし','該当せず','該当無し','非該当','その他','該当なし（その他）']]
  ];
  function str(v){return v==null?'':String(v).trim();}
  var normCache={},normCount=0;
  function norm(v){var s=str(v),c=normCache[s];if(c!==undefined)return c;c=s.normalize('NFKC').toLowerCase().replace(/[\s_\-()（）・]/g,'');if(s.length<=80&&normCount<5000){normCache[s]=c;normCount++;}return c;}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function unique(a){return a.filter(function(x,i){return a.indexOf(x)===i;});}
  function hash(s){var a=2166136261,b=2246822507;for(var i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),3266489909);}return (a>>>0).toString(16)+(b>>>0).toString(16);}
  function stable(o){if(Array.isArray(o))return '['+o.map(stable).join(',')+']';if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(function(k){return JSON.stringify(k)+':'+stable(o[k]);}).join(',')+'}';return JSON.stringify(o);}
  function parseCsv(text){
    text=String(text).replace(/^\uFEFF/,'');if(/[\uFFFD\x00]/.test(text))throw Error('文字コードを確認してください。');
    var rows=[],row=[],f='',quoted=false,closed=false,first=text.split(/\r?\n/,1)[0],delim=first.indexOf(',')>=0?',':first.indexOf('\t')>=0?'\t':first.indexOf(';')>=0?';':',';
    for(var i=0;i<text.length;i++){var c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else{quoted=false;closed=true;}}else f+=c;continue;}
      if(c==='"'){if(f||closed)throw Error('CSVの引用符が正しくありません。');quoted=true;continue;}
      if(c===delim||c==='\n'||c==='\r'){row.push(f);f='';closed=false;if(c!==delim){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(function(v){return str(v);}))rows.push(row);row=[];}}
      else{if(closed)throw Error('引用符の後に不要な文字があります。');f+=c;}}
    if(quoted)throw Error('CSVの引用符が閉じていません。');row.push(f);if(row.some(function(v){return str(v);}))rows.push(row);
    if(rows.length<2)throw Error('見出しとデータ行が必要です。');if(rows.length>10001)throw Error('1ファイルは10,000行以内に分割してください。');
    var heads=rows.shift().map(str);while(heads.length&&!heads[heads.length-1])heads.pop();var ns=heads.map(norm);if(ns.some(function(h,i){return !h||ns.indexOf(h)!==i;}))throw Error('見出しが空欄、または重複しています。');
    return {headers:heads,rows:rows.map(function(r,i){if(r.slice(heads.length).some(function(v){return str(v);}))throw Error((i+2)+'行目の列数が見出しより多くなっています。');var o={};heads.forEach(function(h,j){o[h]=r[j]==null?'':r[j];});return o;})};
  }
  function time(v,label){
    var s=str(v).normalize('NFKC').replace(/年|月|\//g,'-').replace(/日/g,' ').replace(/時|分/g,':').replace(/秒/g,'').replace(/\s+/g,' ').trim().replace(/:$/,'').replace(/( \d{1,2})$/,'$1:00').replace(/-$/,'');if(!s)return '';
    var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/);
    if(!m)throw Error((label||'日時')+'は YYYY-MM-DD HH:mm:ss で入力してください。');
    var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])),h=+(m[4]||0),mi=+(m[5]||0),se=+(m[6]||0);
    if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3]||h>23||mi>59||se>59)throw Error((label||'日時')+'に存在しない日付・時刻があります。');
    var z=m[7]||'+09:00';if(z!=='Z'){var zz=z.match(/[+-](\d{2}):?(\d{2})/);if(+zz[1]>23||+zz[2]>59)throw Error('タイムゾーンが正しくありません。');}
    var iso=m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2)+'T'+('0'+h).slice(-2)+':'+('0'+mi).slice(-2)+':'+('0'+se).slice(-2)+z;
    var dt=new Date(iso);if(!isFinite(dt.getTime()))throw Error('日時が読めません。');return new Date(dt.getTime()+9*3600000).toISOString().slice(0,19)+'+09:00';
  }
  function hasClock(v){return /\d\s*[T ]\s*\d{1,2}\s*[:時]/.test(str(v).normalize('NFKC').replace(/日/g,' '));}
  function idKey(v){return str(v).normalize('NFKC').toUpperCase();}
  function canon(list,field,v){v=str(v);if(!v||list.some(function(x){return x[field]===v;}))return v;var k=idKey(v),found=list.filter(function(x){return idKey(x[field])===k;});return found.length===1?found[0][field]:v;}
  function category(v){var n=norm(v);if(!n)return '';if(n==='排泄'||n==='排泄状況')throw Error('項目「'+v+'」は②排尿・③排便のどちらか判別できません。CSVの項目を「排尿」または「排便」に分けてください。');var bare=n.replace(/^[1-8][.:,、]?(?=.)/,'');for(var i=0;i<categories.length;i++){if([categories[i][0],categories[i][1],String(i+1),'item_'+(i+1)].concat(categories[i][2])  .some(function(s){s=norm(s);return s===n||s===bare;}))return categories[i][0];}if(n==='itemnone')return 'not_applicable';throw Error('項目「'+v+'」を8区分に対応付けできません。列名・項目表記を確認してください。');}
  function mastersFromSheets(sheets){
    var m={sites:[{site_id:'yururia',name:'ゆるり・あ鶴舞',aliases:['ゆるり・あ','ゆる鶴舞','ゆるり・あ鶴舞','看護小規模多機能型居宅介護 ゆるり・あ']}],residents:[],staff:[],warnings:[]};
    function read(name,first){var rows=sheets[name]||[],at=rows.findIndex(function(r){return norm(r[0])===norm(first);});if(at<0)throw Error('「'+name+'」の見出しが見つかりません。');return rows.slice(at+1);}
    var seen={};read('利用者マスター','利用者ID').forEach(function(r){var id=str(r[0]);if(!id||/架空|例/.test(id))return;if(seen['u'+id])throw Error('マスタの利用者IDが重複しています：'+id);seen['u'+id]=true;m.residents.push({resident_id:id,display_name:str(r[4])||id,site_id:siteId(str(r[1])||'yururia',m),speech_name:str(r[5])});});
    read('職員マスター','職員ID').forEach(function(r){var id=str(r[0]);if(!id||/架空|例/.test(id))return;if(seen['s'+id])throw Error('マスタの職員IDが重複しています：'+id);seen['s'+id]=true;m.staff.push({staff_id:id,display_name:str(r[1])||id,site_id:'yururia',home_office:str(r[4]),role:str(r[2])});});
    if(!m.residents.length||!m.staff.length)throw Error('マスタに利用者・職員が登録されていません。');return m;
  }
  function siteId(v,m){if(!str(v)){if(m.sites.length===1)return m.sites[0].site_id;throw Error('施設を選択してください。');}var found=m.sites.filter(function(s){var aa=Array.isArray(s.aliases)?s.aliases:str(s.aliases).split(',');return [s.site_id,s.name].concat(aa).some(function(a){return norm(a)===norm(v);});});if(found.length!==1)throw Error('施設がマスタにありません：'+v);return found[0].site_id;}
  var aliases={
    id:['record_id','handover_id','execution_id','check_id','申し送りID','実施ID','記録ID'],type:['type','record_type','種別'],site:['site_id','site','facility','facility_id','施設','拠点','所属拠点'],resident:['resident_id','user_id','利用者ID'],staff:['staff_id','sender_staff_id','recorded_by','author_id','職員ID','申し送り者ID','実施職員ID','看護師ID','記録した職員','記録した職員ID','記録職員ID','記録者ID'],
    at:['recorded_at','event_datetime','handover_datetime','handover_at','recording_started_at','checked_at','実施日時','録音開始','日時','記録日時'],date:['recorded_date','handover_date','event_date','実施日','記録日','申し送り日'],clock:['recorded_time','handover_time','記録時刻','申し送り時刻'],
    original:['source_text','original_text','original','handover_original','transcript','transcription','transcribed_text','raw_text','申し送り原文','原文','元テキスト','要約前：元テキスト（音声認識）'],summary:['ai_summary','summary','summary_text','handover_summary','申し送り要約文','申し送り要約','要約','AI要約','要約後：AI要約'],confirmed:['confirmed_text','corrected_text','確定本文','確定本文（読み上げ）'],text:['text','内容'],item:['category','item','項目'],item_value:['item_value','category_text','value','項目内容'],
    receiver:['played_by','played_staff_id','receiver_staff_id','recipient_staff_id','received_by','listener_id','受け手ID','受け手看護師ID','再生職員ID','受取職員ID'],received:['played_at','received_at','received_datetime','playback_at','受け取り日時','再生日時','受取日時'],receive_date:['received_date','playback_date','受取日','受け取り日'],receive_time:['received_time','playback_time','受取時刻','受け取り時刻'],
    question_id:['question_id','設問ID'],question:['question','設問'],answer:['answer','回答'],score:['answer_score','score','回答スコア'],result:['health_result','check_result','result','健康チェック結果','結果','状態'],health_at:['health_checked_at','health_check_at','check_datetime','健康チェック実施日時'],health_id:['health_check_id','health_id'],
    event_id:['event_key','event_id','playback_id'],mode:['mode','再生モード']
  };
  function getter(o,mapping){var keys=Object.keys(o);return function(k){var list=mapping&&mapping[k]?[mapping[k]]:aliases[k]||[k];var matches=keys.filter(function(h){return list.some(function(a){return norm(h)===norm(a);})&&str(o[h])!=='';});if(k==='received'){var pref=matches.filter(function(h){return ['playedat','playbackat','再生日時'].indexOf(norm(h))>=0;});if(pref.length)matches=pref;}if(k==='result')matches=matches.filter(function(h){return !(['状態','status'].indexOf(norm(h))>=0&&['確定','途中保存','confirmed','draft'].indexOf(str(o[h]).toLowerCase())>=0);});var vals=unique(matches.map(function(h){return str(o[h]);}));if(vals.length>1)throw Error(k+' に複数の異なる値があります。列の対応を指定してください。');return vals[0]||'';};}
  function newRecord(id,type,site,res,staff,at){return {id:id,type:type,site_id:site,resident_id:res,staff_id:staff,recorded_at:at,source_text:'',ai_summary:'',confirmed_text:'',items:{},playbacks:[],answers:[],health_result:'',sources:[]};}
  function key(r){return [r.site_id,r.type,r.id,r.resident_id].join('|');}
  function normalizeRows(csv,m,options){
    options=options||{};var records=[],events=[],errors=[],warnings=[];
    csv.rows.forEach(function(raw,i){try{
      var o=Object.assign({},raw);if(o.payload_json){var p;try{p=JSON.parse(o.payload_json);}catch(e){throw Error('payload_json が正しいJSONではありません。');}if(p&&typeof p==='object'&&!Array.isArray(p))o=Object.assign({},p,o);}
      var mapping=Object.assign({},options.mapping||{});if(raw.payload_json&&raw.record_type){var canonical={id:raw.source_record_id?'source_record_id':'record_id',type:'record_type',site:'site',resident:'resident_id',staff:'staff_id',at:'event_datetime',item:'item'};Object.keys(canonical).forEach(function(k){if(!mapping[k]&&raw[canonical[k]])mapping[k]=canonical[k];});}
      var get=getter(o,mapping),typ=get('type').toLowerCase();
      if(['playback','playbacks','receive','received','再生','再生履歴','受取'].indexOf(typ)>=0||(!get('at')&&!get('date')&&get('received')&&get('id'))){
        var player=get('receiver')||get('staff'),when=get('received')||(get('receive_date')+' '+get('receive_time')).trim();if(!player||!when)throw Error('再生履歴には再生職員IDと再生日時が必要です。');
        events.push({record_id:get('id'),resident_id:canon(m.residents,'resident_id',get('resident')),site_id:siteId(get('site')||options.site_id,m),staff_id:canon(m.staff,'staff_id',player),played_at:time(when,'再生日時'),time_unknown:!hasClock(when),row:i+2,mode:get('mode'),event_key:get('event_id'),source:options.file_name||''});return;
      }
      typ=({health_check:'health',healthcheck:'health',nurse:'handover','健康チェック':'health','申し送り':'handover','看護師申し送り':'handover','連絡事項':'notice'})[typ]||typ;
      if(!typ)typ=get('question')||get('answer')||get('result')&&!get('original')&&!get('summary')?'health':'handover';
      if(['handover','health','notice'].indexOf(typ)<0)throw Error('未対応の記録種別です：'+typ);
      var site=siteId(get('site')||options.site_id,m),resident=canon(m.residents,'resident_id',get('resident')),staff=canon(m.staff,'staff_id',get('staff'));
      if(typ!=='notice'&&!resident)throw Error('利用者IDがありません。');
      if(resident&&!m.residents.some(function(u){return u.resident_id===resident&&u.site_id===site;}))throw Error('利用者IDが施設のマスタと一致しません：'+resident);
      if(!staff||!m.staff.some(function(s){return s.staff_id===staff;}))throw Error('職員IDがマスタと一致しません：'+(staff||'空欄'));
      var rawAt=get('at')||(get('date')+' '+get('clock')).trim()||(typ==='health'?get('health_at'):'');var at=time(rawAt,'記録日時');if(!at)throw Error('記録日時がありません。');
      var body=get('original')||get('text')||(get('item')?'':get('summary')),id=get('id')||'csv-'+hash(stable([site,typ,resident,staff,at,body])),r=newRecord(id,typ,site,resident,staff,at);if(!get('id')){r.auto_id=true;r.legacy_id='csv-'+hash(stable(o));}r.time_unknown=!hasClock(rawAt);r.source_text=get('original');r.ai_summary=get('summary');r.confirmed_text=get('confirmed');
      if(!r.source_text&&!r.ai_summary&&get('text'))r.source_text=get('text');
      categories.forEach(function(c,j){var names=[c[0],c[1],j<7?'item_'+(j+1):'item_none'].concat(c[2]);var values=Object.keys(o).filter(function(h){return names.some(function(a){return norm(h)===norm(a);});}).map(function(h){return str(o[h]);}).filter(Boolean);if(unique(values).length>1)throw Error(c[1]+'に複数の異なる値があります。');if(values.length)r.items[c[0]]=values[0];});
      if(o.items){var its=typeof o.items==='string'?JSON.parse(o.items):o.items;Object.keys(its).forEach(function(k){if(str(its[k]))r.items[category(k)]=str(its[k]);});}
      if(get('item')){r.item_rows=true;r.items[category(get('item'))]=get('item_value')||get('summary')||get('text')||get('original')||'該当';}
      if(typ==='health'){var answer=get('answer');if(get('question')||answer)r.answers.push({id:get('question_id')||get('question'),question:get('question')||get('question_id'),answer:answer,score:get('score'),result:get('result')});else r.health_result=get('result');if(!r.health_result&&!r.answers.length){r.health_result=r.source_text||r.ai_summary;if(r.health_result)r.health_from_text=true;}}
      var receiver=canon(m.staff,'staff_id',get('receiver')),received=get('received')||(get('receive_date')+' '+get('receive_time')).trim();
      if(receiver||received){if(!receiver||!received)warnings.push({row:i+2,message:'受取職員IDまたは日時が不足しています。再生済みには数えません。'});else{if(!m.staff.some(function(s){return s.staff_id===receiver;}))throw Error('再生職員IDがマスタにありません：'+receiver);r.playbacks.push({staff_id:receiver,played_at:time(received,'受取日時'),time_unknown:!hasClock(received),mode:get('mode'),event_key:get('event_id')});}}
      if(!r.source_text&&!r.ai_summary&&!r.confirmed_text&&!Object.keys(r.items).length&&!r.answers.length&&!r.health_result)throw Error('本文・要約・項目・健康チェック結果のいずれかが必要です。');
      r.sources=[{file:options.file_name||'',row:i+2}];records.push(r);
      if(typ!=='health'&&get('health_at')&&get('result')){var hr=newRecord(get('health_id')||'health-'+hash(site+'|'+resident+'|'+get('health_at')+'|'+get('result')),'health',site,resident,staff,time(get('health_at'),'健康チェック日時'));hr.time_unknown=!hasClock(get('health_at'));hr.health_result=get('result');hr.sources=r.sources;records.push(hr);}
    }catch(e){errors.push({file:options.file_name||'',row:i+2,message:e.message});}});
    return {records:records,events:events,errors:errors,warnings:warnings};
  }
  function mergeRecord(old,r){
    var out=clone(old);['staff_id','recorded_at','source_text','ai_summary','confirmed_text','health_result'].forEach(function(k){if(k==='ai_summary'&&old.item_rows&&r.item_rows){out[k]=unique((old[k]+'\n'+r[k]).split('\n').filter(Boolean)).join('\n');return;}if(k==='health_result'&&r.health_from_text&&(old.answers||[]).length)return;if(old[k]&&r[k]&&old[k]!==r[k])throw Error('同じ記録ID「'+r.id+'」の'+({staff_id:'職員',recorded_at:'日時',source_text:'原文',ai_summary:'要約',confirmed_text:'確定本文',health_result:'健康結果'})[k]+'が既存の記録と異なります。自動上書きしません。');if(!out[k])out[k]=r[k];});
    Object.keys(r.items||{}).forEach(function(k){if(out.items[k]&&out.items[k]!==r.items[k]&&old.item_rows&&r.item_rows){out.items[k]=unique((out.items[k]+'\n'+r.items[k]).split('\n').filter(Boolean)).join('\n');return;}if(out.items[k]&&out.items[k]!==r.items[k])throw Error('同じ記録ID「'+r.id+'」の項目内容が異なります。');out.items[k]=r.items[k];});
    (r.answers||[]).forEach(function(a){var prev=out.answers.find(function(x){return x.id===a.id;});if(prev&&stable(prev)!==stable(a))throw Error('同じ健康チェックの設問回答が異なります。');if(!prev)out.answers.push(a);});
    (r.playbacks||[]).forEach(function(p){if(!out.playbacks.some(function(x){return x.staff_id===p.staff_id&&x.played_at===p.played_at;}))out.playbacks.push(p);});
    out.sources=(out.sources||[]).concat(r.sources||[]).filter(function(s,i,a){return a.findIndex(function(x){return x.file===s.file&&x.row===s.row;})===i;});return out;
  }
  function content(r){var x=clone(r);delete x.sources;return stable(x);}
  function plan(existing,parts,m){
    var map={},alias={},idents={},touched={},errors=[],warnings=[],input=0,added=0,updated=0,duplicates=0;
    function ident(r){return [r.site_id,r.type,r.resident_id,r.staff_id,r.recorded_at,r.source_text||(r.item_rows?'':r.ai_summary)].join('\u0001');}
    existing.forEach(function(r){var k=key(r);map[k]=clone(r);if(r.api_id&&r.api_id!==r.id)alias[[r.site_id,r.type,r.api_id,r.resident_id].join('|')]=k;if(r.auto_id||/^csv-/.test(r.id))idents[ident(r)]=k;});
    function resolve(r){var k=key(r);if(map[k])return k;if(alias[k])return alias[k];if(r.auto_id){var old=[r.site_id,r.type,r.legacy_id,r.resident_id].join('|');if(map[old])return old;if(idents[ident(r)])return idents[ident(r)];}return k;}
    parts.forEach(function(p){errors=errors.concat(p.errors);warnings=warnings.concat(p.warnings);p.records.forEach(function(r){input++;try{var k=resolve(r);touched[k]=true;if(map[k]){var x=clone(r);x.id=map[k].id;map[k]=mergeRecord(map[k],x);}else{map[k]=clone(r);if(r.auto_id)idents[ident(r)]=k;}}catch(e){errors.push({file:r.sources[0].file,row:r.sources[0].row,message:e.message});}});});
    parts.forEach(function(p){p.events.forEach(function(e){try{if(!m.staff.some(function(s){return s.staff_id===e.staff_id;}))throw Error('再生職員IDがマスタにありません：'+e.staff_id);var matches=Object.keys(map).filter(function(k){var r=map[k];return (r.id===e.record_id||r.api_id===e.record_id)&&r.site_id===e.site_id&&(!e.resident_id||r.resident_id===e.resident_id);});if(matches.length!==1)throw Error('再生履歴の対象記録を一意に照合できません：'+e.record_id);var r=map[matches[0]],p={staff_id:e.staff_id,played_at:e.played_at,time_unknown:e.time_unknown,mode:e.mode,event_key:e.event_key};input++;if(!r.playbacks.some(function(x){return x.staff_id===p.staff_id&&x.played_at===p.played_at;}))r.playbacks.push(p);else duplicates++;}catch(err){errors.push({file:e.source,row:e.row||'',message:err.message});}});});
    var old={};existing.forEach(function(r){old[key(r)]=r;});Object.keys(map).forEach(function(k){if(!old[k])added++;else if(content(old[k])!==content(map[k]))updated++;});
    Object.keys(touched).forEach(function(k){if(old[k]&&content(old[k])===content(map[k]))duplicates++;});
    return {records:Object.keys(map).map(function(k){return map[k];}),added:added,updated:updated,duplicates:duplicates,input:input,errors:errors,warnings:warnings};
  }
  function filter(records,f){f=f||{};return records.filter(function(r){var day=r.recorded_at.slice(0,10);return (!f.from||day>=f.from)&&(!f.until||day<=f.until)&&(!f.resident||r.resident_id===f.resident)&&(!f.site||r.site_id===f.site)&&(!f.type||r.type===f.type)&&(!f.query||[r.id,r.source_text,r.ai_summary,r.confirmed_text,r.health_result,r.staff_id,r.resident_id].concat(Object.keys(r.items||{}).map(function(k){return r.items[k];})).join(' ').toLowerCase().indexOf(f.query.toLowerCase())>=0);}).sort(function(a,b){return b.recorded_at.localeCompare(a.recorded_at)||a.id.localeCompare(b.id);});}
  function stats(records){var hand=records.filter(function(r){return r.type==='handover';}),health=records.filter(function(r){return r.type==='health';}),days={};records.forEach(function(r){var d=r.recorded_at.slice(0,10);if(!days[d])days[d]={date:d,handover:0,health:0,notice:0};days[d][r.type]++;});var received=hand.filter(function(r){return r.playbacks.length>0;}).length;return {total:records.length,handover:hand.length,health:health.length,received:received,unreceived:hand.length-received,rate:hand.length?received/hand.length:null,residents:unique(records.map(function(r){return r.resident_id;}).filter(Boolean)).length,days:Object.keys(days).sort().map(function(k){return days[k];}),categories:categories.map(function(c){return {key:c[0],label:c[1],count:hand.filter(function(r){return !!str(r.items[c[0]]);}).length};})};}
  function managementStats(records,masters,f,now){
    f=f||{};var current=now?new Date(now):new Date(),today=new Date(current.getTime()+9*3600000).toISOString().slice(0,10),todayDay=Date.parse(today+'T00:00:00Z');
    var rows=filter(records,f),hands=rows.filter(function(r){return r.type==='handover';}),pending=hands.filter(function(r){return !r.playbacks.length;}),buckets=[{label:'当日',count:0},{label:'1〜3日',count:0},{label:'4〜7日',count:0},{label:'8日以上',count:0}],invalidDates=0,oldest=null;
    pending.forEach(function(r){var day=Date.parse(r.recorded_at.slice(0,10)+'T00:00:00Z'),age=Math.round((todayDay-day)/86400000);if(!Number.isFinite(age)||age<0){invalidDates++;return;}buckets[age===0?0:age<=3?1:age<=7?2:3].count++;oldest=oldest==null?age:Math.max(oldest,age);});
    var delays=[],excluded=0;hands.filter(function(r){return r.playbacks.length;}).forEach(function(r){var first=r.playbacks.slice().sort(function(a,b){return a.played_at.localeCompare(b.played_at);})[0],start=Date.parse(r.recorded_at),end=Date.parse(first.played_at);if(r.time_unknown||first.time_unknown||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>current.getTime()){excluded++;return;}delays.push((end-start)/60000);});delays.sort(function(a,b){return a-b;});var n=delays.length,median=n?(n%2?delays[(n-1)/2]:(delays[n/2-1]+delays[n/2])/2):null;
    var eligible=masters.residents.filter(function(r){return (!f.site||r.site_id===f.site)&&(!f.resident||r.resident_id===f.resident);}),checked=unique(rows.filter(function(r){return r.type==='health'&&eligible.some(function(u){return u.resident_id===r.resident_id&&u.site_id===r.site_id;});}).map(function(r){return r.resident_id;}));
    return {as_of:today,pending:pending.length,buckets:buckets,invalid_dates:invalidDates,oldest_days:oldest,median_minutes:median,delay_count:n,delay_excluded:excluded,eligible_residents:eligible.length,checked_residents:checked.length,health_coverage:eligible.length?checked.length/eligible.length:null,health_without_record:eligible.length-checked.length};
  }
  function healthText(r){return [r.health_result].concat((r.answers||[]).map(function(a){return a.question+'：'+a.answer+(a.score!==''&&a.score!=null?'（'+a.score+'点）':'')+(a.result?' / '+a.result:'');})).filter(Boolean).join('\n');}
  function empty(m){return {schema:'kebbi-care-review/4',revision:0,masters:clone(m),records:[],imports:[],saved_at:''};}
  function validateBackup(v){if(!v||v.schema!=='kebbi-care-review/4'||!v.masters||!Array.isArray(v.records)||!Array.isArray(v.masters.residents)||!Array.isArray(v.masters.staff)||!Array.isArray(v.masters.sites)||!Array.isArray(v.imports))throw Error('このアプリのバックアップファイルではありません。');var seen={};v.records.forEach(function(r){if(!r.id||!['handover','health','notice'].includes(r.type)||!r.site_id||!r.items||!Array.isArray(r.playbacks)||!Array.isArray(r.answers)||!Array.isArray(r.sources))throw Error('バックアップ内の記録形式が正しくありません。');time(r.recorded_at);var k=key(r);if(seen[k])throw Error('バックアップ内の記録IDが重複しています。');seen[k]=true;});return clone(v);}
  return {categories:categories,aliases:aliases,str:str,norm:norm,hash:hash,stable:stable,parseCsv:parseCsv,time:time,category:category,mastersFromSheets:mastersFromSheets,normalizeRows:normalizeRows,plan:plan,mergeRecord:mergeRecord,filter:filter,stats:stats,managementStats:managementStats,healthText:healthText,key:key,empty:empty,validateBackup:validateBackup,clone:clone};
})();
if(typeof module!=='undefined')module.exports=CareData;
