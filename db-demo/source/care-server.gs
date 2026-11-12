/* Shared Google DB adapter. All public methods verify the application access key. */
function careEnsure_(){
  SCHEMA_.care_records=['key','api_record_id','json'];SCHEMA_.care_imports=['key','json'];
  ['care_records','care_imports'].forEach(function(n){if(!db_().getSheetByName(n)){var s=db_().insertSheet(n);s.getRange(1,1,1,SCHEMA_[n].length).setValues([SCHEMA_[n]]);s.setFrozenRows(1);}});
}
function careMasters_(){var m=loadMasters_();return {sites:m.sites,residents:m.residents.map(function(r){return {resident_id:r.resident_id,display_name:r.display_name||r.full_name||r.resident_id,site_id:r.site_id};}),staff:m.staff.map(function(s){return {staff_id:s.staff_id,display_name:s.display_name,site_id:s.site_id,home_office:s.home_office,role:s.role};})};}
function careSnapshot_(){
 careEnsure_();var m=careMasters_(),out=CareData.empty(m),extra={},plays={};
 readTable_('care_records').rows.forEach(function(x){extra[x.api_record_id]=JSON.parse(x.json);});
 readTable_('playbacks').rows.forEach(function(p){(plays[p.record_id]=plays[p.record_id]||[]).push({staff_id:p.staff_id,played_at:p.played_at,mode:p.mode,event_key:p.event_key,revision:p.revision});});
 var labels=itemLabels_();out.records=readTable_('records').rows.map(function(r){
  var x=extra[r.record_id]||{id:r.record_id,type:r.type,site_id:r.site_id,resident_id:r.resident_id,items:{},answers:[],sources:[]};x=CareData.clone(x);x.api_id=r.record_id;x.type=r.type;x.site_id=r.site_id;x.resident_id=r.resident_id;x.staff_id=r.staff_id;if(x.recorded_at&&x.recorded_at!==r.recorded_at)x.time_unknown=false;x.recorded_at=r.recorded_at;x.source_text=r.source_text;x.ai_summary=r.ai_summary;x.confirmed_text=r.confirmed_text;x.health_result=x.health_result||'';var savedPlays=x.playbacks||[];x.playbacks=(plays[r.record_id]||[]).map(function(p){var old=savedPlays.filter(function(q){return q.staff_id===p.staff_id&&q.played_at===p.played_at;})[0];if(old&&old.time_unknown)p.time_unknown=true;return p;});x.unmapped_items={};
  ITEM_KEYS_.forEach(function(k,i){if(!r[k])return;try{x.items[CareData.category(i===7?'not_applicable':labels[i])]=r[k];}catch(e){x.unmapped_items[labels[i]||k]=r[k];}});
  if(r.type==='health'&&!x.health_result&&!x.answers.length)x.health_result=r.source_text||r.ai_summary||r.confirmed_text;
  return x;
 });out.imports=readTable_('care_imports').rows.map(function(r){return JSON.parse(r.json);});out.revision=Number(getSetting_('care_revision',0));out.saved_at=getSetting_('care_saved_at','');return out;
}
function careResponse_(key){var out=careSnapshot_();out.role=role_(key);out.advanced_url=ScriptApp.getService().getUrl()+'?view=advanced';return out;}
function adminCareSnapshot(key){role_(key);return withLock_(function(){return careResponse_(key);});}
function carePrepare_(input){
 if(!input||!Array.isArray(input.files)||!input.files.length||input.files.length>20)throw new Error('CSVファイルを1〜20件指定してください');
 var snapshot=careSnapshot_();if(input.revision!==undefined&&Number(input.revision)!==snapshot.revision)throw new Error('共有データが更新されました。最新の記録を読み込み、もう一度照合してください');
 var names={record_id:'id',resident_id:'resident',staff_id:'staff',recorded_at:'at',source_text:'original',ai_summary:'summary',confirmed_text:'confirmed',site_id:'site'};var mapping={};Object.keys(input.mapping||{}).forEach(function(k){mapping[names[k]||k]=input.mapping[k];});
 var parts=input.files.map(function(f){if(!/\.csv$/i.test(f.name)||typeof f.text!=='string'||f.text.length>5000000)throw new Error('CSVの形式またはサイズを確認してください');return CareData.normalizeRows(CareData.parseCsv(f.text),snapshot.masters,{site_id:input.site_id,file_name:f.name,mapping:mapping});});
 var plan=CareData.plan(snapshot.records,parts,snapshot.masters);if(plan.errors.length)throw new Error(plan.errors.slice(0,8).map(function(e){return e.file+' '+e.row+'行目：'+e.message;}).join('\n'));
 plan.records.forEach(function(r){if(JSON.stringify(r).length>45000)throw new Error('1件の記録が長すぎます。45,000文字以内に分割してください');});
 return {snapshot:snapshot,plan:plan};
}
function careApply_(prepared,files){
 var p=prepared.plan,old={},api={},ct=readTable_('care_records'),cm={},labels=itemLabels_();
 prepared.snapshot.records.forEach(function(r){old[CareData.key(r)]=r;});readTable_('records').rows.forEach(function(r){api[r.record_id]=r;});ct.rows.forEach(function(r,i){cm[r.key]={row:ct.rowNo[i],value:r};});
 var existingPlays={};readTable_('playbacks').rows.forEach(function(p){existingPlays[p.record_id+'|'+p.staff_id+'|'+p.played_at]=1;});
 p.records.forEach(function(r){var k=CareData.key(r);if(old[k]&&CareData.stable(old[k])===CareData.stable(r))return;
  var apiId=cm[k]?cm[k].value.api_record_id:api[r.id]&&api[r.id].site_id===r.site_id&&api[r.id].resident_id===r.resident_id&&api[r.id].type===r.type?r.id:'csv-'+sha256_(k).slice(0,40);
  var rec=api[apiId]?Object.assign({},api[apiId]):{};REC_COLS_.forEach(function(c){if(rec[c]===undefined)rec[c]='';});
  Object.assign(rec,{record_id:apiId,site_id:r.site_id,type:r.type,resident_id:r.resident_id,staff_id:r.staff_id,recorded_at:r.recorded_at,source_text:r.source_text,ai_summary:r.ai_summary,confirmed_text:r.confirmed_text,device_id:rec.device_id||'csv-import',status:rec.status||'draft'});
  if(r.type==='health'&&!rec.source_text)rec.source_text=CareData.healthText(r);
  labels.forEach(function(label,i){try{var cat=CareData.category(label);if(r.items[cat])rec['item_'+(i+1)]=r.items[cat];}catch(e){}});if(r.items.not_applicable)rec.item_none=r.items.not_applicable;
  var saved=upsert_(rec,api[apiId]?api[apiId].revision:undefined,r.staff_id,'CSV取込');api[apiId]=Object.assign({},rec,{revision:String(saved.revision)});
  var entry={key:k,api_record_id:apiId,json:JSON.stringify(r)};if(cm[k])writeRow_('care_records',cm[k].row,entry);else appendRows_('care_records',[entry]);
  var newPlays=[];(r.playbacks||[]).forEach(function(q){var pk=apiId+'|'+q.staff_id+'|'+q.played_at;if(existingPlays[pk])return;existingPlays[pk]=1;newPlays.push({event_key:'csv-'+sha256_(pk),record_id:apiId,revision:saved.revision,staff_id:q.staff_id,device_id:'csv-import',site_id:r.site_id,mode:q.mode||'normal',played_at:q.played_at,received_at:nowIso_()});});appendRows_('playbacks',newPlays);
 });
 var log={at:nowIso_(),files:files,added:p.added,updated:p.updated,duplicates:p.duplicates};appendRows_('care_imports',[{key:sha256_(JSON.stringify(log)+Math.random()),json:JSON.stringify(log)}]);setSetting_('care_revision',prepared.snapshot.revision+1);setSetting_('care_saved_at',nowIso_());return log;
}
function adminCareImport(key,input){needAdmin_(key);return withLock_(function(){var prepared=carePrepare_(input);careArchiveFiles_(input.files);if(prepared.plan.added||prepared.plan.updated)careBackup_('before-import');careApply_(prepared,input.files.map(function(f){return f.name;}));return careResponse_(key);});}
function careProcessMail_(meta,text,c,retry){
 careEnsure_();var logs=readTable_('mail_imports').rows,hash=sha256_(text.replace(/^\uFEFF/,'')),key=sha256_(meta.message_id+'|'+meta.part_id),prev=logs.filter(function(r){return r.key===key;})[0];
 if(prev&&(prev.status==='done'||prev.status==='duplicate'||(!retry&&prev.status==='error')))return {ignored:true};
 var entry=Object.assign({},meta,{key:key,file_hash:hash,status:'error',rows:'0',added:'0',skipped:'0',error:''});
 if(logs.some(function(r){return r.file_hash===hash&&r.status==='done';})){entry.status='duplicate';mailSaveLog_(entry);return {duplicate:true};}
 try{var prep=carePrepare_({files:[{name:meta.file_name,text:text}],site_id:c.site_id,mapping:c.column_map||{}});careArchiveFiles_([{name:meta.file_name,text:text}]);if(prep.plan.added||prep.plan.updated)careBackup_('before-mail');var log=careApply_(prep,[meta.file_name]);entry.status='done';entry.rows=String(prep.plan.input);entry.added=String(log.added);entry.skipped=String(log.duplicates);}catch(e){entry.error=String(e.message||e).slice(0,500);}
 mailSaveLog_(entry);return {added:Number(entry.added),skipped:Number(entry.skipped),error:entry.error};
}

function careStorage_(){
 var p=PropertiesService.getScriptProperties(),rootId=p.getProperty('CARE_STORAGE_FOLDER_ID');
 if(!rootId){var root=DriveApp.createFolder('Kebbi Care 共有データ');rootId=root.getId();p.setProperty('CARE_STORAGE_FOLDER_ID',rootId);p.setProperty('CARE_CSV_FOLDER_ID',root.createFolder('CSV原本').getId());p.setProperty('CARE_BACKUP_FOLDER_ID',root.createFolder('自動バックアップ').getId());}
 return {root:rootId,csv:p.getProperty('CARE_CSV_FOLDER_ID'),backup:p.getProperty('CARE_BACKUP_FOLDER_ID')};
}
function careArchiveFiles_(files){var folder=DriveApp.getFolderById(careStorage_().csv);files.forEach(function(f){var name=sha256_(f.text).slice(0,20)+'_'+f.name.replace(/[\/]/g,'_');if(!folder.getFilesByName(name).hasNext())folder.createFile(Utilities.newBlob(f.text,'text/csv',name));});}
function careBackup_(reason){
 var folders=careStorage_(),snapshot=careSnapshot_(),tables={};Object.keys(SCHEMA_).forEach(function(n){if(db_().getSheetByName(n))tables[n]=readTable_(n).rows;});
 var payload={format:'kebbi-care-cloud-backup/4',created_at:nowIso_(),reason:reason,database_id:PropertiesService.getScriptProperties().getProperty('DB_ID'),snapshot:snapshot,tables:tables};
 var file=DriveApp.getFolderById(folders.backup).createFile(Utilities.newBlob(JSON.stringify(payload),'application/json','Kebbi_'+Utilities.formatDate(new Date(),TZ_,'yyyyMMdd_HHmmss')+'_'+reason+'_'+randomKey_(5)+'.json'));
 setSetting_('care_backup_last',{at:nowIso_(),file_id:file.getId(),reason:reason});return {at:nowIso_(),file_id:file.getId()};
}
function careDailyBackup_(){return withLock_(function(){return careBackup_('daily');});}
function setupCareStorage_(){mailAccount_();careEnsure_();careStorage_();if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='careDailyBackup_';}))ScriptApp.newTrigger('careDailyBackup_').timeBased().everyDays(1).atHour(2).create();careBackup_('setup');Logger.log('共有保存・毎日のバックアップを設定しました。保存期間による自動削除はありません。');}
function adminCareStorageStatus(key){role_(key);return {last_backup:getSetting_('care_backup_last',null),daily_enabled:ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='careDailyBackup_';})};}
function adminCareBackupNow(key){needAdmin_(key);return withLock_(function(){return careBackup_('manual');});}
function adminCareRestore(key,backup,revision){needAdmin_(key);return withLock_(function(){var source=CareData.validateBackup(backup),current=careSnapshot_();if(Number(revision)!==current.revision)throw new Error('共有データが更新されました。再読み込みしてください');source.records.forEach(function(r){if(!current.masters.staff.some(function(s){return s.staff_id===r.staff_id;})||(r.resident_id&&!current.masters.residents.some(function(u){return u.resident_id===r.resident_id&&u.site_id===r.site_id;}))||r.playbacks.some(function(p){return !current.masters.staff.some(function(s){return s.staff_id===p.staff_id;});}))throw new Error('バックアップの人物IDが現在のマスタと一致しません。先にマスタを確認してください');});var plan=CareData.plan(current.records,[{records:source.records,events:[],errors:[],warnings:[]}],current.masters);if(plan.errors.length)throw new Error(plan.errors[0].message);careBackup_('before-restore');careApply_({snapshot:current,plan:plan},['JSONバックアップから追加復元']);return careResponse_(key);});}
