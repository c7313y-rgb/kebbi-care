window.kc3MailInit=function(api){
  'use strict';
  var S=api.S,$=api.$,run=api.run,msg=api.msg,esc=api.esc,fmt=api.fmt,loadRecords=api.loadRecords,show=api.show;
  var demo=typeof KC3_DEMO!=='undefined',busy=false;
  function note(t,kind){$('#mailMsg').textContent=t;$('#mailMsg').className='banner '+(kind||'info');}
  function action(fn){if(busy)return;busy=true;document.querySelectorAll('#v-mail button').forEach(function(b){b.disabled=true;});return Promise.resolve().then(fn).catch(function(e){note(e.message||String(e),'err');}).finally(function(){busy=false;document.querySelectorAll('#v-mail button').forEach(function(b){b.disabled=demo&&b.dataset.live==='1';});});}
  function result(r){if(r.not_configured)return;note('確認完了：新規 '+(r.added||0)+' 件、エラー '+(r.errors||0)+' 件、同一ファイル '+(r.duplicates||0)+' 件。'+(r.more?'続きがあります。「今すぐ取り込む」をもう一度押すか、次の定期実行をお待ちください。':''),r.errors?'warn':'ok');loadRecords();return window.loadMail(false);}
  window.loadMail=function(fill){
    return run('adminMailStatus').then(function(s){
      $('#mailConnection').textContent=demo?'公開デモ：Gmail未接続。下の架空CSVで取込を体験できます。':s.connected?'接続済み：'+s.account:'未接続：'+s.error;
      $('#mailSchedule').textContent=s.scheduled?'定期取込：5分ごとに実行中':'定期取込：停止中';
      $('#mailLast').textContent=s.last?'最終確認 '+fmt(s.last.at)+' ／ 新規 '+(s.last.added||0)+' 件'+(s.last.error?' ／ '+s.last.error:''):'まだ取り込んでいません';
      if(fill!==false){var c=s.config;$('#mailSenders').value=c.senders.join('\n');$('#mailSubject').value=c.subject;$('#mailStart').value=c.start_date;$('#mailEncoding').value=c.encoding;$('#mailOnOpen').checked=c.on_open;$('#mailMap').value=JSON.stringify(c.column_map||{},null,2);$('#mailSite').innerHTML=S.ctx.sites.map(function(x){return '<option value="'+esc(x.site_id)+'">'+esc(x.name)+'</option>';}).join('');$('#mailSite').value=c.site_id;}
      var names={done:'取込済み',duplicate:'重複を除外',error:'要確認'};
      $('#mailLog').innerHTML='<tr><th>確認日時</th><th>ファイル</th><th>結果</th><th>新規</th><th>説明</th></tr>'+s.log.map(function(x){return '<tr><td>'+esc(fmt(x.at))+'</td><td>'+esc(x.file_name)+'</td><td>'+esc(names[x.status]||x.status)+'</td><td>'+esc(x.added||'0')+'</td><td>'+esc(x.error||('全 '+x.rows+' 件 ／ 登録済み '+x.skipped+' 件'))+'</td></tr>';}).join('');
      $('#mailDemoArea').classList.toggle('hidden',!demo);document.querySelectorAll('#v-mail [data-live]').forEach(function(el){el.disabled=demo;});
    }).catch(function(e){note(e.message||String(e),'err');});
  };
  window.mailOnOpen=function(){if(demo||S.role!=='admin')return;run('adminMailOnOpen').then(function(r){if(!r.not_configured){var t='メール確認：新規 '+r.added+' 件'+(r.errors?' ／ 要確認 '+r.errors+' 件':'');msg(esc(t)+' <a href="#mail" id="mailOpenLink">メール取込を確認</a>',r.errors?'warn':'ok');$('#mailOpenLink').onclick=function(e){e.preventDefault();show('mail');};loadRecords();}}).catch(function(e){msg('メール取込：'+esc(e.message)+' <a href="#mail" id="mailOpenLink">設定を確認</a>','warn');$('#mailOpenLink').onclick=function(e){e.preventDefault();show('mail');};});};
  $('#mailSave').onclick=function(){action(function(){var map;try{map=JSON.parse($('#mailMap').value||'{}');}catch(e){throw new Error('列対応のJSONが正しくありません');}return run('adminMailConfigure',{senders:$('#mailSenders').value,subject:$('#mailSubject').value,site_id:$('#mailSite').value,start_date:$('#mailStart').value,encoding:$('#mailEncoding').value,on_open:$('#mailOnOpen').checked,column_map:map}).then(function(){note('設定を保存しました。「今すぐ取り込む」で確認してください。','ok');return loadMail(false);});});};
  $('#mailSync').onclick=function(){action(function(){note('受信メールを確認しています…');return run('adminMailSync',false).then(result);});};
  $('#mailRetry').onclick=function(){action(function(){note('要確認のファイルを再試行しています…');return run('adminMailSync',true).then(result);});};
  $('#mailEnable').onclick=function(){action(function(){return run('adminMailSchedule',true).then(function(){note('5分ごとの定期取込を開始しました。画面を閉じても動きます。','ok');return loadMail(false);});});};
  $('#mailDisable').onclick=function(){action(function(){return run('adminMailSchedule',false).then(function(){note('定期取込を停止しました。起動時取込は別の設定です。','info');return loadMail(false);});});};
  $('#mailDemoRun').onclick=function(){action(function(){return run('adminMailDemo','record_id,type,resident_id,staff_id,recorded_at,source_text,ai_summary,item_1\nmail-demo-example-001,handover,U901,S9002,2026-11-11T09:00:00+09:00,朝食は八割食べました,朝食を8割摂取,8割\n').then(function(r){if(r.error)throw new Error(r.error);return result({added:r.added||0,errors:0,duplicates:r.duplicate?1:0});});});};
};
