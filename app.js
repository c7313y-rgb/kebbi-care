'use strict';
const BASE='https://tffilbxhcpugizctrckn.supabase.co', APIKEY='sb_publishable_2ZzafZxkhs5VNiSF86j3_w_Z0ar_9fW';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,member=null,values={},revision=0,seq=0,savedSeq=0,saving=null,saveTimer=null,conflict=false,loaded=false,lastAction=Date.now(),currentView='home';
async function auth(path,body,token){const r=await fetch(BASE+'/auth/v1/'+path,{method:'POST',headers:{apikey:APIKEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error('ログインIDまたはパスワードを確認してください。');return r.status===204?{}:r.json();}
let refreshPromise;
async function token(){if(!session)throw Error('ログインしてください');if(Date.now()/1000>session.expires_at-90){refreshPromise||=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(x=>{session=x;session.expires_at=x.expires_at||Date.now()/1000+x.expires_in;}).finally(()=>refreshPromise=null);await refreshPromise;}return session.access_token;}
async function api(action,data={}){const r=await fetch(BASE+'/functions/v1/kebbi-api',{method:'POST',cache:'no-store',headers:{apikey:APIKEY,Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({action,...data})});let j;try{j=await r.json()}catch{throw Error('通信に失敗しました。再接続してください。')}if(!r.ok){if(r.status===401){lock('セッションが終了しました。再ログインしてください。');throw Error('セッション終了')}if(r.status===409){conflict=true;throw Error('別の画面で更新されています。上書きは停止しました。「保存内容をバックアップ」で退避してから再ログインしてください。')}throw Error(({password_change_required:'パスワードの変更が必要です。',admin_required:'管理者のみ利用できます。',staff_account_required:'アカウントが停止されています。',password_update_failed:'パスワードを更新できませんでした。別のパスワードを指定してください。'})[j.error]||'操作できませんでした。入力または接続を確認してください。')}return j;}
function notice(s){$('messageText').textContent=s;$('message').hidden=!s;$('messageBackup').hidden=!conflict;$('messageRetry').hidden=conflict;if(s&&conflict)status('保存できていません');}
function status(s){$('saveStatus').textContent=s;$('saveStatus').dataset.state=s==='保存済み'?'saved':s.includes('でき')?'error':'pending';if(currentView==='completion'){const done=s==='保存済み';$('completionTitle').textContent=done?'記録を保存しました':s.includes('でき')?'まだ保存できていません':'記録を保存しています…';$('completionState').textContent=done?'この記録はサーバーに保存されています。':s.includes('でき')?'まだ保存できていません。画面を閉じず、上の案内をご確認ください。':'そのまま少しお待ちください。';}}
function changed(key,oldValue,newValue){updateHome();seq++;status('未保存・自動保存待ち');clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(e=>notice(e.message)),800);for(const f of [$('measure'),$('manage')]){if(f.contentWindow){const e=new f.contentWindow.Event('storage');Object.assign(e,{key,oldValue,newValue});f.contentWindow.dispatchEvent(e);}}}
const storage={getItem:k=>values[k]??null,setItem(k,v){const old=values[k];v=String(v);if(old===v)return;values[k]=v;changed(k,old??null,v)},removeItem(k){if(!(k in values))return;const old=values[k];delete values[k];changed(k,old,null)},key:i=>Object.keys(values)[i]??null,get length(){return Object.keys(values).length}};
async function flush(){if(saving){await saving;if(seq!==savedSeq)return flush();return}if(!loaded||seq===savedSeq)return;if(conflict)throw Error('同時編集の競合があるため保存を停止しています。バックアップを保存してください。');const captured=seq,snapshot={...values};status('サーバーへ保存中…');saving=api('save',{revision,storage:snapshot}).then(r=>{revision=r.revision;savedSeq=captured;status(savedSeq===seq?'保存済み':'未保存・自動保存待ち');if(savedSeq===seq)notice('');}).catch(e=>{status('保存できていません');throw e}).finally(()=>saving=null);await saving;if(seq!==savedSeq)return flush();}
function download(name,content,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function backup(){download('Kebbi_アカウントバックアップ.json',JSON.stringify({format:'kebbi-account-backup',exportedAt:new Date().toISOString(),staffCode:member?.staff_code,revision,storage:values},null,2));}
function lock(msg=''){clearTimeout(saveTimer);loaded=false;for(const id of ['measure','manage']){$(id).removeAttribute('src');$(id).hidden=true;}window.KebbiSession=null;session=null;member=null;values={};seq=savedSeq=revision=0;conflict=false;$('workspace').hidden=$('change').hidden=true;$('login').hidden=false;$('password').value='';$('loginMsg').textContent=msg;}
async function boot(){const r=await api('load');if(!r.master)throw Error('登録情報を読み込めませんでした。');member=r.member;values=r.state.storage||{};revision=r.state.revision;seq=savedSeq=0;loaded=true;conflict=false;window.KebbiSession={master:r.master,storage,open:openView,member,complete:recordCompleted,refreshHome:updateHome};$('identity').textContent=member.display_name;$('admin').hidden=member.role!=='admin';document.querySelector('[data-view=share]').hidden=member.staff_code==='generous';$('login').hidden=$('change').hidden=true;$('workspace').hidden=false;$('measure').src='modules/measurement.html';$('manage').src='modules/datamgmt.html';status('保存済み');openView('home');}
function updateHome(){
  if(!loaded)return;
  let j={},d;try{j=JSON.parse(values['kebbi-kpi-local-v1']||'{}');d=JSON.parse(values['kebbi-draft-v2']||'null')}catch{}
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
  const rows=['handover','receive','ai','survey'].flatMap(k=>j.data?.[k]||[]);
  $('todayLabel').textContent=new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Tokyo'});
  $('recordSummary').textContent='今日 '+rows.filter(r=>r.date===date).length+'件 ／ これまで '+rows.length+'件';
  $('resumeBox').hidden=!d;$('resumeLabel').textContent=d?({handover:'申し送りの時間',receive:'出勤後の情報確認',survey:'職員アンケート',ai:'AIの精度評価'}[d.form]||''):'';
}
let pendingRoute=null,lastRecordType='handover';
function routeMeasurement(tab='input',form){
  openView('measure',true);pendingRoute={tab,form};
  const m=$('measure').contentWindow?.KebbiModule;if(m?.navigate){m.navigate(tab,form);pendingRoute=null;}
  setNav(tab==='records'?'records':tab==='input'?'measure':'menu');
}
function setNav(view){document.querySelectorAll('.main-nav button').forEach(b=>{const selected=b.dataset.view===view;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
function openView(view,internal=false){
  if(view==='records'){routeMeasurement('records');return}
  if(view==='master'){routeMeasurement('input');$('measure').contentWindow.KebbiModule?.showMaster();return}
  if(view==='measure'&&!internal){routeMeasurement('input');return}
  currentView=view;for(const id of ['home','measure','manage','share','account','menu','help','completion'])$(id).hidden=id!==view;
  $('modules').hidden=!['measure','manage'].includes(view);setNav(['manage','account','share'].includes(view)?'menu':view);
  if(view==='home')updateHome();if(view==='share')listShared();
  if(view==='manage')$('manage').contentWindow.KebbiModule?.navigate('exchange');
  window.scrollTo(0,0);
}
function recordCompleted(record){lastRecordType=record.type;$('completionSummary').textContent=record.summary;openView('completion');status($('saveStatus').textContent);flush().catch(e=>notice(e.message));}
$('measure').addEventListener('load',()=>{if(pendingRoute){const p=pendingRoute;$('measure').contentWindow.KebbiModule?.navigate(p.tab,p.form);pendingRoute=null;}applyTextSize();});
$('manage').addEventListener('load',()=>applyTextSize());
$('resumeDraft').onclick=()=>{let d;try{d=JSON.parse(values['kebbi-draft-v2']||'null')}catch{}routeMeasurement('input',d?.form);};
$('anotherRecord').onclick=()=>routeMeasurement('input',lastRecordType);
let largeText=false;
function applyTextSize(){document.documentElement.classList.toggle('large-text',largeText);for(const id of ['measure','manage'])$(id).contentDocument?.documentElement.classList.toggle('large-text',largeText);$('textSize').textContent=largeText?'文字を元に戻す':'文字を大きく';$('textSize').setAttribute('aria-pressed',String(largeText));}
$('textSize').onclick=()=>{largeText=!largeText;applyTextSize()};
$('messageBackup').onclick=backup;$('messageRetry').onclick=()=>flush().catch(e=>notice(e.message));
$('loginForm').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;$('loginMsg').textContent='確認しています…';try{const code=$('staffCode').value.trim().toLowerCase();if(!/^[a-z0-9_-]{1,40}$/.test(code))throw Error('発行されたログインIDを入力してください。');session=await auth('token?grant_type=password',{email:code+'@staff.kebbi.invalid',password:$('password').value});session.expires_at=session.expires_at||Date.now()/1000+session.expires_in;member=(await api('profile')).member;$('password').value='';if(member.must_change_password){$('login').hidden=true;$('change').hidden=false;}else await boot();}catch(e){$('loginMsg').textContent=e.message;session=null;}finally{btn.disabled=false;}};
$('passwordForm').onsubmit=async e=>{e.preventDefault();if($('newPassword').value!==$('newPassword2').value){$('passwordMsg').textContent='入力したパスワードが一致しません。';return}const b=e.target.querySelector('button');b.disabled=true;try{await api('password',{password:$('newPassword').value});$('newPassword').value=$('newPassword2').value='';await boot();}catch(e){$('passwordMsg').textContent=e.message;}finally{b.disabled=false;}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>routeMeasurement('input',b.dataset.task));
document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>routeMeasurement(b.dataset.route));
$('saveNow').onclick=()=>flush().catch(e=>notice(e.message));
$('logout').onclick=async()=>{try{await flush();await auth('logout',{},await token());lock('ログアウトしました。');}catch(e){notice(e.message);}};
$('recovery').onclick=backup;
$('logoutAccount').onclick=()=>$('logout').click();
$('changePassword').onclick=async()=>{try{await flush();$('workspace').hidden=true;$('change').hidden=false;}catch(e){notice(e.message)}};
$('publish').onclick=async()=>{try{await flush();const x=JSON.parse(values['kebbi-kpi-export-v1']||'null');if(!x?.csv)throw Error('先に測定を保存してください。');await api('share',{csv:x.csv});$('shareStatus').textContent='測定データを職員向けに共有しました。';await listShared();}catch(e){$('shareStatus').textContent=e.message;}};
async function listShared(){try{const r=await api('shared');$('shareList').innerHTML='<table><thead><tr><th>共有した職員</th><th>所属</th><th>共有日時</th></tr></thead><tbody>'+r.exports.map(x=>`<tr><td>${esc(x.kebbi_members?.display_name)} (${esc(x.kebbi_members?.staff_code)})</td><td>${esc(x.kebbi_members?.department)}</td><td>${esc(new Date(x.updated_at).toLocaleString('ja-JP'))}</td></tr>`).join('')+'</tbody></table>';return r.exports;}catch(e){$('shareStatus').textContent=e.message;return []}}
$('collect').onclick=async()=>{try{const rows=await listShared();if(!rows.length)throw Error('共有済みの測定はありません。');const frame=$('manage').contentWindow;if(!frame.KebbiModule)throw Error('画面の読込完了後に再実行してください。');await frame.KebbiModule.importShared(rows);await flush();$('shareStatus').textContent='共有データを取り込みました。データ統合画面で件数と要確認行を確認してください。';openView('manage');}catch(e){$('shareStatus').textContent=e.message;}};
$('loadMembers').onclick=async()=>{try{const r=await api('members');$('members').innerHTML='<table><thead><tr><th>職員</th><th>所属</th><th>権限</th><th>状態</th><th>変更</th></tr></thead><tbody>'+r.members.map(x=>`<tr><td>${esc(x.display_name)} (${esc(x.staff_code)})</td><td>${esc(x.department)}</td><td>${esc(x.role)}</td><td>${x.active?'有効':'停止'}</td><td class="member-actions">${x.user_id===member.user_id?'現在ログイン中':`<button data-user="${x.user_id}" data-active="${!x.active}" data-role="${x.role}">${x.active?'停止':'再開'}</button><button data-user="${x.user_id}" data-active="${x.active}" data-role="${x.role==='admin'?'staff':'admin'}">${x.role==='admin'?'職員に変更':'管理者に変更'}</button><button data-reset="${x.user_id}">仮パスワード再発行</button>`}</td></tr>`).join('')+'</tbody></table>';$('members').querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{if(!confirm('この職員アカウントの設定を変更しますか？'))return;try{await api('member_update',{user_id:b.dataset.user,role:b.dataset.role,active:b.dataset.active==='true'});$('loadMembers').click();}catch(e){notice(e.message)}});$('members').querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{if(!confirm('仮パスワードを再発行しますか？本人に個別に渡してください。'))return;try{const p=Array.from(crypto.getRandomValues(new Uint8Array(20)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[x%55]).join('');await api('reset_password',{user_id:b.dataset.reset,password:p});download('再発行_仮パスワード.txt','仮パスワード: '+p+'\n初回ログイン時に変更してください。','text/plain');}catch(e){notice(e.message)}});}catch(e){notice(e.message)}};
window.addEventListener('beforeunload',e=>{if(loaded&&seq!==savedSeq){e.preventDefault();e.returnValue='';}});
for(const evt of ['pointerdown','keydown'])window.addEventListener(evt,()=>lastAction=Date.now());
setInterval(async()=>{if(!loaded)return;try{const p=await api('profile');if(p.member.must_change_password){await flush();$('workspace').hidden=true;$('change').hidden=false;}}catch(e){notice(e.message)}},60000);
window.addEventListener('online',()=>flush().catch(e=>notice(e.message)));
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
