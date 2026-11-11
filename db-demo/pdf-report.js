/* Generate Japanese PDF pages locally. No network or uploaded data leaves the browser. */
var CareReport={create:async function(input){
 const {state,rows,filter,options,sample}=input,C=CareData;
 await document.fonts.ready;
 let [W,H]=options.size==='A3'?[841.89,1190.55]:[595.28,841.89];if(options.orientation==='landscape')[W,H]=[H,W];
 const doc=await PDFLib.PDFDocument.create();doc.setTitle('ジェネラス ケア記録');doc.setAuthor('Kebbi Care');
 const scale=2.5,margin=36,usable=W-margin*2,font=options.font||12,lh=font*1.6;
 let canvas,ctx,y,pages=[];
 const ink='#173b36',muted='#71817c',teal='#1a7563';
 function family(size,bold=false){return (bold?'600 ':'400 ')+size+'px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';}
 function setFont(size=font,bold=false){ctx.font=family(size,bold);ctx.textBaseline='top';}
 function newPage(){if(canvas)pages.push(canvas);canvas=document.createElement('canvas');canvas.width=Math.ceil(W*scale);canvas.height=Math.ceil(H*scale);ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);setFont(9);ctx.fillStyle=muted;ctx.fillText('GENEROUS / KEBBI CARE'+(sample?'　画面例・すべて架空データ':''),margin,22);ctx.strokeStyle='#dfe7df';ctx.beginPath();ctx.moveTo(margin,38);ctx.lineTo(W-margin,38);ctx.stroke();y=54;}
 function need(h){if(y+h>H-45)newPage();}
 function lines(text,width,size=font,bold=false){setFont(size,bold);let out=[];String(text||'未記録').split('\n').forEach(line=>{if(!line){out.push('');return;}let part='';for(const ch of Array.from(line)){if(part&&ctx.measureText(part+ch).width>width){out.push(part);part=ch;}else part+=ch;}out.push(part);});return out;}
 function paragraph(text,{size=font,bold=false,color=ink,indent=0,after=10}={}){const ls=lines(text,usable-indent,size,bold),height=size*1.6;for(const line of ls){need(height);setFont(size,bold);ctx.fillStyle=color;ctx.fillText(line,margin+indent,y);y+=height;}y+=after;}
 function title(t){need(45);paragraph(t,{size:21,bold:true,after:16});}
 function section(t){need(40);ctx.fillStyle='#edf4ed';ctx.fillRect(margin,y,usable,25);setFont(11,true);ctx.fillStyle=teal;ctx.fillText(t,margin+9,y+5);y+=34;}
 function field(label,value){need(lh*2.2);paragraph(label,{size:9,bold:true,color:muted,after:2});paragraph(value||'未記録',{after:12});}
 function person(id,kind){const a=kind==='staff'?state.masters.staff:state.masters.residents,r=a.find(x=>(kind==='staff'?x.staff_id:x.resident_id)===id);return (r?r.display_name:id?'未照合':'対象なし')+(id?'（'+id+'）':'');}
 function fmt(t,unknown=false){return t?t.slice(0,10).replace(/-/g,'/')+' '+(unknown?'時刻未記録':t.slice(11,19)):'未記録';}
 function sitename(id){return state.masters.sites.find(x=>x.site_id===id)?.name||id;}
 function table(head,data,widths){const widthsPt=widths.map(v=>usable*v);function row(vals,headRow){const lists=vals.map((v,i)=>lines(v==null?'':String(v),widthsPt[i]-12,headRow?9:Math.min(font,11),headRow));const sz=headRow?9:Math.min(font,11),rh=Math.max(...lists.map(a=>a.length))*sz*1.5+14;need(rh);if(headRow){ctx.fillStyle='#edf4ed';ctx.fillRect(margin,y,usable,rh);}let x=margin;lists.forEach((ls,i)=>{setFont(sz,headRow);ctx.fillStyle=headRow?teal:ink;ls.forEach((line,j)=>ctx.fillText(line,x+6,y+7+j*sz*1.5));x+=widthsPt[i];});ctx.strokeStyle='#e1e7e2';ctx.beginPath();ctx.moveTo(margin,y+rh);ctx.lineTo(W-margin,y+rh);ctx.stroke();y+=rh;}row(head,true);data.forEach(r=>row(r,false));y+=16;}
 newPage();title(options.content==='summary'?'ケア記録 集計レポート':'ケア記録 詳細レポート');
 paragraph('期間：'+(filter.from||'開始指定なし')+' 〜 '+(filter.until||'終了指定なし')+'　／　'+(filter.resident?person(filter.resident,'resident'):'すべての利用者'),{size:10,color:muted,after:5});
 paragraph('施設：'+(filter.site?sitename(filter.site):'すべての施設')+'　対象：'+rows.length+'件　作成：'+new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}),{size:9,color:muted,after:20});
 if(options.content==='summary'){
  const s=C.stats(rows);section('記録と受取の状況');table(['申し送り','健康チェック','受取の記録あり','受取率'],[[s.handover+'件',s.health+'件',s.received+'件',s.rate==null?'対象なし':Math.round(s.rate*100)+'%']],[.25,.25,.25,.25]);
  paragraph('受取率：再生履歴が1件以上ある申し送り ÷ 申し送り件数。受取の記録がない場合は、未受取または履歴未取込です。',{size:9,color:muted});
  const m=C.managementStats(rows,state.masters,filter);section('管理の確認ポイント');table(['指標','結果'],[['初回受取までの中央値',m.median_minutes==null?'算出対象なし':Math.round(m.median_minutes)+'分（'+m.delay_count+'件）'],['健康チェック実施記録率',m.health_coverage==null?'対象利用者なし':Math.round(m.health_coverage*100)+'%（'+m.checked_residents+' / '+m.eligible_residents+'名）'],['受取記録がない申し送り',m.pending+'件'+(m.oldest_days==null?'':'（最長 '+m.oldest_days+'日）')]],[.5,.5]);
  table(['未受取の経過日数','件数'],m.buckets.map(b=>[b.label,b.count]),[.65,.35]);paragraph('経過日数は'+m.as_of+'時点。中央値は有効な記録日時・初回再生日時がある記録のみ。健康チェック実施記録率は、期間内に記録がある利用者数 ÷ 条件に一致する登録利用者数。'+(m.invalid_dates?'未来日・日付不明 '+m.invalid_dates+'件を経過日数から除外。':''),{size:9,color:muted});
  section('日別の記録件数');table(['日付','申し送り','健康チェック','連絡事項'],s.days.map(d=>[d.date,d.handover,d.health,d.notice]),[.4,.2,.2,.2]);
  section('利用者ごとの集計');const ids=[...new Set(rows.map(r=>r.resident_id).filter(Boolean))];table(['利用者名・ID','申し送り','健康チェック','受取あり'],ids.map(id=>{const a=C.stats(rows.filter(r=>r.resident_id===id));return [person(id,'resident'),a.handover,a.health,a.received];}),[.46,.18,.18,.18]);
  if(!rows.length)paragraph('表示条件に一致する記録はありません。');
 }else{
  if(!rows.length)paragraph('表示条件に一致する記録はありません。');
  rows.forEach((r,i)=>{if(i)newPage();section((i+1)+' / '+rows.length+'　'+({handover:'申し送り',health:'健康チェック',notice:'連絡事項'})[r.type]);
   field('利用者名・利用者ID',person(r.resident_id,'resident'));field('施設 / 記録した職員・職員ID',sitename(r.site_id)+' / '+person(r.staff_id,'staff'));field('申し送り・健康チェックの実施日と時間',fmt(r.recorded_at,r.time_unknown));
   if(r.type==='health'){section('健康チェック結果');paragraph(C.healthText(r)||'未記録');}else{section('申し送りの内容');field('申し送り原文',r.source_text);field('申し送り要約文',r.ai_summary);if(r.confirmed_text)field('確定本文',r.confirmed_text);}
   if(r.type!=='health'||Object.values(r.items).some(Boolean)){section('利用者の7項目・該当なし');const pairs=[];for(let n=0;n<8;n+=2)pairs.push([C.categories[n][1],r.items[C.categories[n][0]]||'未記録',C.categories[n+1][1],r.items[C.categories[n+1][0]]||'未記録']);table(['項目','内容','項目','内容'],pairs,[.18,.32,.18,.32]);}
   section('再生した職員 / 申し送りの受取日時');if(!r.playbacks.length)paragraph('受取の記録はありません。');else r.playbacks.forEach(p=>paragraph(person(p.staff_id,'staff')+'　'+fmt(p.played_at,p.time_unknown)));
   if(r.type!=='health'&&r.resident_id){const h=C.filter(state.records,{from:filter.from,until:filter.until,site:filter.site,resident:r.resident_id,type:'health'})[0];section('表示期間内の直近の健康チェック');if(h){field('実施日と時間',fmt(h.recorded_at,h.time_unknown));paragraph(C.healthText(h));}else paragraph('表示期間内の記録はありません。');}
   paragraph('記録ID：'+r.id,{size:8,color:muted,after:0});
  });
 }
 if(canvas)pages.push(canvas);
 for(let i=0;i<pages.length;i++){const c=pages[i],cx=c.getContext('2d');cx.font=family(8);cx.textBaseline='top';cx.fillStyle=muted;cx.fillText('ジェネラス ケア記録',margin,H-25);cx.fillText((i+1)+' / '+pages.length,W-margin-45,H-25);const png=await doc.embedPng(c.toDataURL('image/png'));doc.addPage([W,H]).drawImage(png,{x:0,y:0,width:W,height:H});c.width=c.height=1;}
 return await doc.save();
}};
