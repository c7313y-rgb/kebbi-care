/* Kebbi Care DB 3.3: server-side Gmail CSV import. No credentials in this file. */
var MAIL_ACCOUNT_ = 'generousadmin@gmail.com';

function mailEnsure_() {
  ['mail_imports','mail_rows'].forEach(function(n){
    var sh=db_().getSheetByName(n);
    if(!sh){sh=db_().insertSheet(n);sh.getRange(1,1,1,SCHEMA_[n].length).setValues([SCHEMA_[n]]);sh.setFrozenRows(1);}
    if(sh.getRange(1,1,1,SCHEMA_[n].length).getDisplayValues()[0].join('|')!==SCHEMA_[n].join('|'))throw new Error(n+' の列が一致しません');
  });
}
function mailConfig_(){
  var c=getSetting_('mail_import_config',{})||{};
  return Object.assign({account:MAIL_ACCOUNT_,senders:[],subject:'',site_id:'yururia',start_date:Utilities.formatDate(new Date(),TZ_,'yyyy-MM-dd'),encoding:'UTF-8',on_open:true,enabled:false,column_map:{}},c,{account:MAIL_ACCOUNT_});
}
function mailAccount_(){
  if(typeof Gmail==='undefined')throw new Error('Gmail API が未設定です。設置手順に沿って Gmail サービスを有効にしてください');
  var account=String(Gmail.Users.getProfile('me').emailAddress||'').toLowerCase();
  if(account!==MAIL_ACCOUNT_)throw new Error('実行アカウントが '+MAIL_ACCOUNT_+' ではありません。このアカウントで設置・認証してください');
  return account;
}
function adminMailStatus(key){
  needAdmin_(key);mailEnsure_();
  var c=mailConfig_(),account='',error='';
  try{account=mailAccount_();}catch(e){error=e.message;}
  var triggers=typeof ScriptApp!=='undefined'&&ScriptApp.getProjectTriggers?ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='mailImportTrigger_';}).length:0;
  return {config:c,connected:account===MAIL_ACCOUNT_,account:account,error:error,scheduled:triggers>0,last:getSetting_('mail_import_last',null),log:readTable_('mail_imports').rows.sort(function(a,b){return b.at.localeCompare(a.at);}).slice(0,100)};
}
function adminMailConfigure(key,input){
  needAdmin_(key);mailAccount_();
  return withLock_(function(){
    mailEnsure_();input=input||{};
    var senders=Array.isArray(input.senders)?input.senders:String(input.senders||'').split(/[\s,;、]+/);
    senders=senders.map(function(s){return String(s).trim().toLowerCase();}).filter(Boolean);
    if(!senders.length||senders.length>10||senders.some(function(s){return !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s);}))throw new Error('CSV送信元のメールアドレスを1〜10件入力してください');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date))throw new Error('取込開始日を入力してください');
    mailValidTime_(input.start_date+'T00:00:00+09:00');
    if(['UTF-8','Shift_JIS'].indexOf(input.encoding)<0)throw new Error('文字コードを選択してください');
    if(!loadMasters_().sites.some(function(s){return s.site_id===input.site_id;}))throw new Error('施設を選択してください');
    var mapping=input.column_map||{};
    if(typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).length>50)throw new Error('列対応はJSONオブジェクトで入力してください');
    Object.keys(mapping).forEach(function(k){if(!/^(record_id|resident_id|staff_id|recorded_at|type|source_text|ai_summary|confirmed_text|ai_model|ai_processed_at|duration_sec|recipient|site_id|item_[1-7]|item_none)$/.test(k)||typeof mapping[k]!=='string'||mapping[k].length>100)throw new Error('列対応の項目が正しくありません：'+k);});
    var old=mailConfig_(),c={account:MAIL_ACCOUNT_,senders:senders,subject:String(input.subject||'').trim().slice(0,100),site_id:input.site_id,start_date:input.start_date,encoding:input.encoding,on_open:input.on_open===true,enabled:old.enabled,column_map:mapping};
    setSetting_('mail_import_config',c);PropertiesService.getScriptProperties().setProperty('MAIL_SCAN','');
    return c;
  });
}
function adminMailSchedule(key,on){
  needAdmin_(key);mailAccount_();
  return withLock_(function(){
    var c=mailConfig_();if(on&&!c.senders.length)throw new Error('先に送信元を保存してください');
    ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='mailImportTrigger_';}).forEach(function(t){ScriptApp.deleteTrigger(t);});
    c.enabled=false;setSetting_('mail_import_config',c);
    if(on){ScriptApp.newTrigger('mailImportTrigger_').timeBased().everyMinutes(5).create();c.enabled=true;setSetting_('mail_import_config',c);}
    return {scheduled:c.enabled};
  });
}
function mailImportTrigger_(){if(mailConfig_().enabled)return mailSync_(false);}
function adminMailSync(key,retry){needAdmin_(key);return mailSync_(retry===true);}
function adminMailOnOpen(key){needAdmin_(key);var c=mailConfig_();if(!c.on_open||!c.senders.length)return {not_configured:true};return mailSync_(false);}

function mailParseCsv_(text){
  text=String(text).replace(/^\uFEFF/,'');
  if(text.indexOf('\uFFFD')>=0||text.indexOf('\x00')>=0)throw new Error('文字コードが一致しません。UTF-8 または Shift_JIS を選び直してください');
  var rows=[],row=[],field='',quoted=false,closed=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)throw new Error('CSVの引用符が正しくありません');quoted=true;continue;}
    if(c===','||c==='\r'||c==='\n'){
      row.push(field);field='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(function(v){return v.trim()!=='';}))rows.push(row);row=[];}
    }else{if(closed)throw new Error('CSVの引用符の後に不正な文字があります');field+=c;}
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません');
  row.push(field);if(row.some(function(v){return v.trim()!=='';}))rows.push(row);
  if(rows.length<2)throw new Error('見出しとデータ行が必要です');
  if(rows.length>501)throw new Error('1ファイルの上限は500行です。分割してください');
  var heads=rows.shift().map(function(s){return s.trim();});
  if(heads.some(function(h,i){return !h||heads.indexOf(h)!==i;}))throw new Error('見出しが空欄または重複しています');
  return {heads:heads,rows:rows.map(function(r,i){if(r.length!==heads.length)throw new Error((i+2)+'行目の列数が見出しと一致しません');var o={};heads.forEach(function(h,j){o[h]=r[j];});return o;})};
}
function mailValidTime_(s){
  var source=String(s||'').replace(/年|月/g,'-').replace(/日/g,' ').replace(/\//g,'-');
  var parts=source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(parts){var check=new Date(Date.UTC(+parts[1],+parts[2]-1,+parts[3]));if(check.getUTCFullYear()!==+parts[1]||check.getUTCMonth()!==+parts[2]-1||check.getUTCDate()!==+parts[3]||+(parts[4]||0)>23||+(parts[5]||0)>59||+(parts[6]||0)>59)throw new Error('記録日時に存在しない日付・時刻があります');}
  var t=normTime_(s);if(!t)throw new Error('記録日時が読めません：YYYY-MM-DD HH:mm:ss で指定してください');
  var d=new Date(t);if(isNaN(d.getTime())||Utilities.formatDate(d,TZ_,"yyyy-MM-dd'T'HH:mm:ssXXX")!==t)throw new Error('記録日時に存在しない日付・時刻があります');return t;
}
function mailToRecords_(text,c){
  var csv=mailParseCsv_(text),heads=csv.heads,m=loadMasters_(),grouped={},records=[];
  var legacy=heads.indexOf('申し送りID')>=0?'handover':heads.indexOf('実施ID')>=0&&heads.indexOf('設問')>=0?'health':heads.indexOf('看護師ID')>=0?'nurse':'';
  function site(v){if(v&&!m.sites.some(function(s){return s.site_id===c.site_id&&[s.site_id,s.name].concat(str_(s.aliases).split(',')).indexOf(v.trim())>=0;}))throw new Error('CSVの施設と取込先の施設が一致しません');}
  function id(raw,kind,resident){return 'mail-'+sha256_([kind,c.site_id,raw,resident].join('|')).slice(0,48);}
  function addGroup(key,r,body,item,question){
    var g=grouped[key];if(!g){g=grouped[key]=r;g._parts=[];g._questions={};records.push(g);}
    if(g.staff_id!==r.staff_id||g.recorded_at!==r.recorded_at)throw new Error('同じ記録IDに異なる職員・日時があります');
    if(question){if(g._questions[question])throw new Error('同じ実施IDに設問が重複しています');g._questions[question]=true;}
    g._parts.push(body);
    if(item){var n=m.items.indexOf(item),k=ITEM_KEYS_.indexOf(item)>=0?item:item==='該当せず'?'item_none':n>=0?'item_'+(n+1):'';if(!k)throw new Error('不明な申し送り項目です：'+item);g.items[k]=(g.items[k]?g.items[k]+'\n':'')+body;}
  }
  csv.rows.forEach(function(o,index){
    try{
      if(legacy){
        site(o['拠点']);var kind=legacy==='health'?'health':'handover',raw=o['申し送りID']||o['実施ID']||o['記録ID'],res=str_(o['利用者ID']).trim();
        if(!raw)throw new Error('記録IDが空欄です');
        var r={record_id:id(raw,legacy,res),type:kind,status:'draft',resident_id:res,staff_id:str_(o['申し送り者ID']||o['実施職員ID']||o['看護師ID']).trim(),recorded_at:mailValidTime_(o['録音開始']||o['実施日時']||o['日時']),source_text:'',ai_summary:'',confirmed_text:'',items:{},duration_sec:o['録音秒数']||o['所要秒数']||'',recipient:o['受け手ID']||o['受け手看護師ID']||''};
        var body=legacy==='health'?o['設問']+'：'+o['回答']:legacy==='nurse'?o['内容']:o['要約'];
        if(!str_(body).trim()||(legacy==='health'&&!str_(o['回答']).trim()))throw new Error('本文・回答が空欄です');
        addGroup(r.record_id,r,body,legacy==='handover'?str_(o['項目']).trim():'',legacy==='health'?(o['設問ID']||o['設問']):'');return;
      }
      var aliases={record_id:['記録ID'],resident_id:['利用者ID'],staff_id:['職員ID','記録した職員'],recorded_at:['記録日時','日時','event_datetime'],type:['種別'],source_text:['元テキスト','要約前：元テキスト（音声認識）','text'],ai_summary:['AI要約','要約後：AI要約','要約'],confirmed_text:['確定本文','確定本文（読み上げ）','修正後テキスト'],ai_model:['AIモデル'],ai_processed_at:['AI処理日時'],duration_sec:['所要時間(秒)','所要時間'],recipient:['宛先'],site_id:['施設','拠点']};
      ITEM_KEYS_.forEach(function(k,i){aliases[k]=[i<7?m.items[i]:'該当せず'];aliases['ai_'+k]=['AI仕分け：'+(i<7?m.items[i]:'該当せず')];});
      function get(k){var candidates=c.column_map&&c.column_map[k]?[c.column_map[k]]:[k].concat(aliases[k]||[]);var present=candidates.filter(function(h){return heads.indexOf(h)>=0;});if(present.length>1)throw new Error(k+' に対応する列が複数あります。列対応で1つ選んでください');return present.length?o[present[0]]:'';}
      Object.keys(c.column_map||{}).forEach(function(k){if(heads.indexOf(c.column_map[k])<0)throw new Error('指定した列がありません：'+c.column_map[k]);});
      site(get('site_id'));
      var typ=get('type')||'handover';typ=({'申し送り':'handover','健康チェック':'health','連絡事項':'notice'})[typ]||typ;
      var r={type:typ,status:'draft',resident_id:get('resident_id').trim(),staff_id:get('staff_id').trim(),recorded_at:mailValidTime_(get('recorded_at')),source_text:get('source_text'),ai_summary:get('ai_summary'),confirmed_text:get('confirmed_text'),ai_model:get('ai_model'),ai_processed_at:get('ai_processed_at'),duration_sec:get('duration_sec'),recipient:get('recipient'),items:{}};
      var ai={};ITEM_KEYS_.forEach(function(k){r.items[k]=get(k);ai[k]=get('ai_'+k);});
      if(heads.indexOf('ai_items')>=0&&o.ai_items){try{r.ai_items=JSON.parse(o.ai_items);}catch(e){throw new Error('ai_items のJSONが正しくありません');}}else if(ITEM_KEYS_.some(function(k){return ai[k];}))r.ai_items=ai;
      var raw=get('record_id').trim();r.record_id=raw||'mail-'+sha256_(JSON.stringify(r)).slice(0,48);records.push(r);
    }catch(e){throw new Error((index+2)+'行目：'+e.message);}
  });
  records.forEach(function(r){if(r._parts){if(legacy==='handover')r.ai_summary=r._parts.join('\n');else r.source_text=r._parts.join('\n');delete r._parts;delete r._questions;}});
  return records;
}

function mailPlan_(text,c,fileHash){
  var incoming=mailToRecords_(text,c),existing={},receipts={},seen={},rows=[],marks=[],skipped=0;
  readTable_('records').rows.forEach(function(r){existing[r.record_id]=r;});
  readTable_('mail_rows').rows.forEach(function(r){receipts[r.key]=r.record_id;});
  incoming.forEach(function(r){
    var rec=prepareRecord_({site_id:c.site_id,device_id:'mail-import'},r),hash=sha256_(JSON.stringify(rec));
    if(seen[rec.record_id])throw new Error('同じCSV内で記録IDが重複しています：'+rec.record_id);seen[rec.record_id]=true;
    if(receipts[hash]===rec.record_id){skipped++;return;}
    rec.content_hash=contentHash_(rec);var old=existing[rec.record_id];
    if(old){if(old.site_id!==rec.site_id||(old.content_hash!==rec.content_hash&&contentHash_(Object.assign({},old,{status:'draft'}))!==rec.content_hash))throw new Error('既存記録と内容が異なるため上書きしません：'+rec.record_id);skipped++;}
    else{var now=nowIso_();Object.assign(rec,{revision:'1',created_at:now,updated_at:now,confirmed_at:'',confirmed_by:''});rows.push(rec);}
    marks.push({key:hash,record_id:rec.record_id,file_hash:fileHash,at:nowIso_()});
  });
  return {rows:rows,marks:marks,total:incoming.length,skipped:skipped};
}
function mailSaveLog_(entry){
  var t=readTable_('mail_imports'),i=t.rows.findIndex(function(r){return r.key===entry.key;});entry.at=nowIso_();
  if(i>=0)writeRow_('mail_imports',t.rowNo[i],entry);else appendRows_('mail_imports',[entry]);
}
function mailProcess_(meta,text,c,retry){
  var logs=readTable_('mail_imports').rows,hash=sha256_(text.replace(/^\uFEFF/,'')),key=sha256_(meta.message_id+'|'+meta.part_id);
  var prev=logs.filter(function(r){return r.key===key;})[0];
  if(prev&&(prev.status==='done'||prev.status==='duplicate'||(!retry&&prev.status==='error')))return {ignored:true};
  var entry=Object.assign({},meta,{key:key,file_hash:hash,status:'error',rows:'0',added:'0',skipped:'0',error:''});
  var same=logs.filter(function(r){return r.file_hash===hash&&r.status==='done';})[0];
  if(same){entry.status='duplicate';entry.rows=same.rows;entry.skipped=same.rows;mailSaveLog_(entry);return {duplicate:true};}
  try{
    var plan=mailPlan_(text,c,hash);
    appendRows_('records',plan.rows);
    appendRows_('mail_rows',plan.marks);
    appendRows_('events',plan.rows.map(function(r){return {at:nowIso_(),action:meta.message_id.indexOf('manual-')===0?'CSV手動取込（確定待ち）':'メールCSV取込（確定待ち）',record_id:r.record_id,revision:'1',staff_id:r.staff_id,device_id:'mail-import',detail:'CSVから登録'};}));
    entry.status='done';entry.rows=String(plan.total);entry.added=String(plan.rows.length);entry.skipped=String(plan.skipped);
  }catch(e){entry.error=String(e.message||e).slice(0,500);}
  mailSaveLog_(entry);return {added:Number(entry.added),skipped:Number(entry.skipped),error:entry.error};
}
function mailHeader_(m,name){var hs=(m.payload&&m.payload.headers)||[];var h=hs.filter(function(h){return h.name.toLowerCase()===name.toLowerCase();})[0];return h?h.value:'';}
function mailParts_(part){var out=[];if(part&&/\.csv$/i.test(part.filename||''))out.push(part);(part&&part.parts||[]).forEach(function(p){out=out.concat(mailParts_(p));});return out;}
function mailReadMessage_(id,c,retry,result,deadline){
  var m=Gmail.Users.Messages.get('me',id,{format:'full'});
  if((m.labelIds||[]).some(function(l){return ['SPAM','TRASH','DRAFT'].indexOf(l)>=0;}))return;
  if((m.labelIds||[]).indexOf('SENT')>=0&&(m.labelIds||[]).indexOf('INBOX')<0){
    var recipients=['To','Cc','Delivered-To'].map(function(h){return mailHeader_(m,h);}).join(',').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[];
    if(recipients.indexOf(MAIL_ACCOUNT_)<0)return;
  }
  var from=mailHeader_(m,'From'),match=from.match(/<([^<>]+)>/),sender=(match?match[1]:from).trim().toLowerCase();
  if(c.senders.indexOf(sender)<0||mailHeader_(m,'Subject').indexOf(c.subject)<0||Number(m.internalDate)<new Date(c.start_date+'T00:00:00+09:00').getTime())return;
  mailParts_(m.payload).forEach(function(p,i){
    if(deadline&&Date.now()>deadline){var stop=new Error('続きは次回実行します');stop.batchTime=true;throw stop;}
    var meta={message_id:id,part_id:p.partId||String(i),file_name:p.filename,sender:sender,received_at:Utilities.formatDate(new Date(Number(m.internalDate)),TZ_,"yyyy-MM-dd'T'HH:mm:ssXXX")};
    var old=readTable_('mail_imports').rows.filter(function(r){return r.key===sha256_(id+'|'+meta.part_id);})[0];
    if(old&&(old.status==='done'||old.status==='duplicate'||(!retry&&old.status==='error')))return;
    try{
      if((p.body&&p.body.size||0)>1048576)throw new Error('添付CSVは1MB以下にしてください');
      var b=p.body||{};if(b.attachmentId)b=Gmail.Users.Messages.Attachments.get('me',id,b.attachmentId);
      var bytes=Utilities.base64DecodeWebSafe(b.data||'');if(bytes.length>1048576)throw new Error('添付CSVは1MB以下にしてください');
      var text=Utilities.newBlob(bytes).getDataAsString(c.encoding),r=mailProcess_(meta,text,c,retry);
      result.files++;result.added+=r.added||0;result.errors+=r.error?1:0;result.duplicates+=r.duplicate?1:0;
    }catch(e){mailSaveLog_(Object.assign(meta,{key:sha256_(id+'|'+meta.part_id),status:'error',error:String(e.message||e).slice(0,500),file_hash:'',rows:'0',added:'0',skipped:'0'}));result.errors++;}
  });
}
function mailSync_(retry){
  return withLock_(function(){
    mailEnsure_();mailAccount_();var c=mailConfig_();if(!c.senders.length)throw new Error('CSVの送信元を設定してください');
    var result={at:nowIso_(),files:0,added:0,errors:0,duplicates:0,more:false},deadline=Date.now()+210000;
    try{
      if(retry){var ids=[];readTable_('mail_imports').rows.filter(function(r){return r.status==='error'&&r.message_id.indexOf('manual-')!==0;}).forEach(function(r){if(ids.indexOf(r.message_id)<0)ids.push(r.message_id);});ids.slice(0,20).forEach(function(id){mailReadMessage_(id,c,true,result,deadline);});result.more=ids.length>20;}
      else{
        var props=PropertiesService.getScriptProperties(),scan;try{scan=JSON.parse(props.getProperty('MAIL_SCAN')||'null');}catch(e){}
        var start=Math.floor(new Date(c.start_date+'T00:00:00+09:00').getTime()/1000);
        if(!scan)scan={after:start,page:''};
        if(!scan.page)scan.before=Math.ceil(Date.now()/1000)+1;
        var q='has:attachment filename:csv -in:spam -in:trash -in:drafts after:'+Math.max(start,scan.after-3600)+' before:'+scan.before+' {'+c.senders.map(function(s){return 'from:'+s;}).join(' ')+'}';
        var args={q:q,maxResults:20};if(scan.page)args.pageToken=scan.page;
        var list;
        try{list=Gmail.Users.Messages.list('me',args);}catch(e){if(scan.page){scan.page='';props.setProperty('MAIL_SCAN',JSON.stringify(scan));}throw e;}
        (list.messages||[]).forEach(function(m){mailReadMessage_(m.id,c,false,result,deadline);});
        result.more=!!list.nextPageToken;
        scan=list.nextPageToken?{after:scan.after,before:scan.before,page:list.nextPageToken}:{after:scan.before,before:Math.ceil(Date.now()/1000)+1,page:''};
        props.setProperty('MAIL_SCAN',JSON.stringify(scan));
      }
      setSetting_('mail_import_last',result);return result;
    }catch(e){if(e.batchTime){result.more=true;setSetting_('mail_import_last',result);return result;}setSetting_('mail_import_last',Object.assign(result,{error:String(e.message||e).slice(0,500)}));throw e;}
  });
}

/** Run once in the Apps Script editor while signed in as the mailbox owner. */
function setupMailImport_(){mailAccount_();setup_();mailEnsure_();Logger.log('メール取込の準備完了。管理画面の「メール取込」で送信元を設定してください。');}

function csvInput_(input){
  input=input||{};var text=str_(input.text),filename=str_(input.file_name).split(/[\\/]/).pop();
  if(!/\.csv$/i.test(filename))throw new Error('拡張子 .csv のファイルを選んでください');
  var bytes=0;for(var i=0;i<text.length;i++){var code=text.charCodeAt(i);if(code<128)bytes++;else if(code<2048)bytes+=2;else if(code>=55296&&code<=56319&&i+1<text.length&&text.charCodeAt(i+1)>=56320&&text.charCodeAt(i+1)<=57343){bytes+=4;i++;}else bytes+=3;if(bytes>1048576)throw new Error('CSVはUTF-8換算で1MB以下にしてください');}
  var c=mailConfig_();if(!loadMasters_().sites.some(function(s){return s.site_id===input.site_id;}))throw new Error('取込先の施設を選択してください');c.site_id=input.site_id;
  var hash=sha256_(text),token=sha256_(text+'|'+JSON.stringify(c));return {text:text,filename:filename,config:c,hash:hash,token:token};
}
function adminCsvPreview(key,input){
  needAdmin_(key);return withLock_(function(){mailEnsure_();var x=csvInput_(input),plan=mailPlan_(x.text,x.config,x.hash);return {token:x.token,total:plan.total,added:plan.rows.length,skipped:plan.skipped,sample:plan.rows.slice(0,5).map(function(r){return {record_id:r.record_id,resident_id:r.resident_id,staff_id:r.staff_id,recorded_at:r.recorded_at,text:(r.ai_summary||r.source_text||r.confirmed_text).slice(0,120)};})};});
}
function adminCsvImport(key,input){
  needAdmin_(key);return withLock_(function(){mailEnsure_();var x=csvInput_(input);if(!input.preview_token||input.preview_token!==x.token)throw new Error('ファイルまたは設定が変わりました。「内容を確認」をやり直してください');return mailProcess_({message_id:'manual-'+sha256_(x.config.site_id+'|'+x.hash),part_id:'0',file_name:'[手動] '+x.filename,sender:'管理者手動',received_at:nowIso_()},x.text,x.config,true);});
}

/** Demo-only: exercise the same parser and registration logic without opening Gmail. */
function adminMailDemo(key,text){
  needAdmin_(key);if(typeof KC3_DEMO==='undefined')throw new Error('この操作は公開デモ専用です');
  return withLock_(function(){mailEnsure_();var c=mailConfig_();return mailProcess_({message_id:'demo-'+sha256_(text).slice(0,20),part_id:'0',file_name:'架空CSV.csv',sender:'demo@example.invalid',received_at:nowIso_()},text,c,true);});
}
