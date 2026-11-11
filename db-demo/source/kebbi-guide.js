/* Static guidance only: care records and personal details never enter speech. */
(function(){
 'use strict';
 const $=s=>document.querySelector(s);
 const cues={
  dashboard:{title:'記録と管理状況を、まとめて確認',text:'期間と利用者を選ぶと、表示が変わります。記録の数だけでなく、まだ受け取りの記録がないものや、健康チェックの状況を確認できます。',steps:[['CSVを選ぶ','「CSVを取り込む」を押します。','#uploadButton'],['表示を絞る','期間・利用者・施設を選びます。','#filters'],['チームの記録を確認','未受取の経過日数や健康チェックの記録状況を確認します。','#managementStats']]},
  records:{title:'必要な記録を、すぐに確認',text:'期間と利用者を選んでください。見たい記録を押すと、話した内容や要約、受け取った職員、健康チェックの結果が表示されます。',steps:[['期間・利用者を選ぶ','上の条件で表示対象を絞ります。','#filters'],['記録を開く','一覧の記録を押すと詳細が表示されます。','#recordTable'],['全項目を確認','「全項目の一覧」で左右にスクロールできます。','[data-list-mode="full"]']]},
  upload:{title:'CSVの取り込みは、3ステップ',text:'CSVファイルを選び、保存する施設を確認します。画面の順番に沿って内容をチェックし、問題がなければ取り込んでください。同じCSVをもう一度入れても、同じ記録は増えません。',steps:[['CSVを選ぶ','パソコンではドラッグもできます。スマートフォンは「ファイルを選択」を押します。','#dropZone'],['施設を確認して照合','取込先の施設を選び、「マスタと照合する」を押します。','#importSite'],['結果を確認して取込','照合結果の新規・追記・エラーを確認します。','#checkCsv']]},
  preview:{title:'保存前に、照合結果を確認',text:'新しく登録する件数と、追加する件数を確認してください。修正が必要な場合は、CSVを直してもう一度チェックします。問題がなければ、取り込むボタンを押してください。',steps:[['件数を確認','新規・追記・登録済みの件数を確認します。','#importPreview'],['エラーを確認','未登録のIDや不一致がある場合は、CSVを修正します。','#importPreview'],['確認した内容を取り込む','確定後、共有DBに保存されます。','#commitImport']]},
  drive:{title:'DriveのCSVを、そのまま取り込む',text:'初めに、Google DriveのフォルダURLを登録してください。一覧からCSVを選び、内容を確認して取り込みます。新しいファイルを自動で取り込む設定もできます。',steps:[['フォルダを登録','指定Google DriveのフォルダURLを設定します。','#driveFolderUrl'],['CSVを選ぶ','一覧を更新して対象ファイルを選択します。','#driveFileList'],['照合して取り込む','結果を確認してから保存します。','#driveCheck']]},
  settings:{title:'保存と設定を確認しましょう',text:'ここではマスタの登録、データの保存、接続の設定ができます。バックアップは、すべてのデータを保存するボタンから取得できます。',steps:[['マスタを確認','利用者と職員の登録内容を確認します。','#masterInfo'],['バックアップを保存','「すべてのデータを保存」でJSONを保存します。','#backup'],['連携を設定','Kebbi端末・メール取込の設定を確認します。','#connectionDescription']]},
  pdf:{title:'見やすいサイズで、PDFに',text:'用紙サイズ、向き、文字サイズを選び、プレビューを更新してください。内容を確認したら、PDFを保存できます。印刷するときは、PDFを開いて印刷を押してください。',steps:[['用紙と文字を選ぶ','A4・A3、縦・横、文字サイズを選べます。','#pdfSize'],['プレビューを更新','変更した設定でPDFを作り直します。','#refreshPdf'],['保存または印刷','PDFを開いた端末のメニューから印刷できます。','#printPdf']]},
  saved:{title:'取り込みが完了しました',text:'データを保存しました。ダッシュボードや記録一覧から、取り込んだ内容を確認できます。',steps:[['記録を確認','最近の記録に取り込み結果が表示されます。','#recentTable'],['一覧へ進む','記録一覧で原文・要約などを確認できます。','[data-view="records"]']]}
 };
 const manifest=window.KEBBI_VOICE_ASSETS||{};
 let current='dashboard',token=0,auto=false;
 // Reuse one media element so Safari can retain the user's playback permission.
 const audio=$('#guideAudio');
 const dialog=$('#guideDialog'),status=$('#guideAudioStatus'),play=$('#guidePlay'),stop=$('#guideStop');
 function sayStatus(text){status.textContent=text;}
 function stopAudio(){token++;audio.onended=null;audio.onerror=null;audio.pause();if(audio.readyState>0){try{audio.currentTime=0;}catch(e){}}play.disabled=!manifest[current];stop.disabled=true;play.textContent='案内を再生';}
 function syncVoice(){$('#guideVoiceBadge').textContent='Kebbi再現音声';play.disabled=!manifest[current];$('#guideAuto').disabled=!manifest[current];}
 function render(){const c=cues[current];$('#guideContext').textContent=c.title;$('#guideText').textContent=c.text;$('#guideSteps').replaceChildren();c.steps.forEach(([title,text,selector],i)=>{const li=document.createElement('li');const b=document.createElement('button');b.className='guide-step';b.innerHTML='<span class="guide-number">'+(i+1)+'</span><span><strong></strong><small></small></span><span aria-hidden="true">↗</span>';b.querySelector('strong').textContent=title;b.querySelector('small').textContent=text;b.onclick=()=>focusStep(i);li.append(b);$('#guideSteps').append(li);});$('#guideMiniText').textContent=c.title;syncVoice();}
 function focusStep(i){dialog.close();const target=$(cues[current].steps[i][2]);if(!target||!target.getClientRects().length)return;document.querySelectorAll('.guide-highlight').forEach(el=>el.classList.remove('guide-highlight'));target.classList.add('guide-highlight');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});if(target.matches('button,input,select'))target.focus({preventScroll:true});setTimeout(()=>target.classList.remove('guide-highlight'),4500);}
 async function speak(){stopAudio();const src=manifest[current];if(!src){sayStatus('この場面の音声を読み込めません。文字で手順を確認できます。');return;}const active=++token;play.disabled=true;stop.disabled=false;
  try{if(audio.getAttribute('src')!==src)audio.src=src;audio.onended=()=>{if(active===token){stopAudio();sayStatus('再生が終わりました。');}};audio.onerror=()=>{if(active===token){stopAudio();sayStatus('音声を読み込めませんでした。もう一度お試しください。');}};await audio.play();if(active===token)sayStatus('Kebbiの再現音声でご案内しています。');}
  catch(e){if(active===token){stopAudio();if(e.name==='NotAllowedError'){auto=false;$('#guideAuto').checked=false;sayStatus('この端末では再生ボタンの操作が必要です。「案内を再生」を押してください。');}else{sayStatus('音声を再生できませんでした。通信と端末の音量を確認し、もう一度再生ボタンを押してください。');}}}
 }
 function setContext(id){if(!cues[id]||id===current)return;stopAudio();current=id;render();sayStatus('');if(auto&&!document.hidden)speak();}
 function open(){const p=$('#pdfDialog');if(p.open)setContext('pdf');render();dialog.showModal();$('#guideClose').focus();}
 document.querySelectorAll('[data-guide-open]').forEach(b=>b.addEventListener('click',open));$('#guideClose').onclick=()=>{stopAudio();dialog.close();};dialog.addEventListener('cancel',stopAudio);dialog.addEventListener('close',stopAudio);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){stopAudio();dialog.close();}}});
 $('#guideAuto').onchange=e=>{auto=e.target.checked;if(auto)speak();else stopAudio();};play.onclick=speak;stop.onclick=()=>{stopAudio();sayStatus('再生を停止しました。');};
 $('#guideVoiceNote').textContent='提供されたKebbiの音声見本をもとに生成した案内です。再生ボタンで開始します。';
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();});window.addEventListener('pagehide',stopAudio);$('#logout').addEventListener('click',()=>{auto=false;$('#guideAuto').checked=false;stopAudio();});
 $('#pdfDialog').addEventListener('close',()=>setContext(window.KebbiReview?.getView?.()||'dashboard'));
 document.addEventListener('click',e=>{if(e.target.closest('[data-intake="drive"]'))setContext('drive');if(e.target.closest('[data-intake="local"]'))setContext('upload');});
 window.KebbiGuide={setContext,open,stop:stopAudio,getContext:()=>current,getCues:()=>JSON.parse(JSON.stringify(cues))};render();
})();
