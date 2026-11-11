(function(){
  'use strict';var key='kc3_production_url';
  function valid(value){try{var u=new URL(value);return u.protocol==='https:'&&u.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password;}catch(e){return false;}}
  var input=document.getElementById('productionUrl'),msg=document.getElementById('productionStatus');
  try{input.value=localStorage.getItem(key)||'';}catch(e){}
  function state(){msg.textContent=valid(input.value)?'本番URLが登録されています。Google側の管理画面へ進みます。':'未接続：初回は「環境設定ガイド」から設置してください。';}
  state();
  document.getElementById('productionOpen').onclick=function(){var url=input.value.trim();if(!valid(url)){msg.textContent='Google Apps Scriptの /exec で終わる本番URLを入力してください。';return;}try{localStorage.setItem(key,url);}catch(e){}location.href=url;};
  document.getElementById('productionForget').onclick=function(){try{localStorage.removeItem(key);}catch(e){}input.value='';state();};
})();
