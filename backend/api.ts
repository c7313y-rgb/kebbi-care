const URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function rest(path:string,method='GET',body?:unknown,extra:Record<string,string>={}){
 const r=await fetch(URL+'/rest/v1/'+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'return=representation',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw Error('database_request_failed'); return r.status===204?null:r.json();
}
async function audit(actor:string,action:string,target=''){await rest('kebbi_audit','POST',{actor,action,target});}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const bearer=req.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return reply({error:'unauthorized'},401);
  const ur=await fetch(URL+'/auth/v1/user',{headers:{apikey:KEY,Authorization:bearer}});
  if(!ur.ok)return reply({error:'unauthorized'},401);
  const user=await ur.json();
  const payload=JSON.parse(atob(bearer.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!payload.session_id || !await rest('rpc/kebbi_session_valid','POST',{uid:user.id,sid:payload.session_id}))return reply({error:'session_revoked'},401);
  const [member]=await rest('kebbi_members?user_id=eq.'+user.id);
  if(!member?.active)return reply({error:'staff_account_required'},403);
  const raw=await req.text();if(raw.length>20_000_000)return reply({error:'too_large'},413);
  const b=JSON.parse(raw), action=b.action;
  if(action==='profile')return reply({member});
  if(action==='password'){
   if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)return reply({error:'password_length'},400);
   const r=await fetch(URL+'/auth/v1/user',{method:'PUT',headers:{apikey:KEY,Authorization:bearer,'Content-Type':'application/json'},body:JSON.stringify({password:b.password})});
   if(!r.ok)return reply({error:'password_update_failed'},400);
   await rest('kebbi_members?user_id=eq.'+user.id,'PATCH',{must_change_password:false});await audit(user.id,'password_changed');return reply({ok:true});
  }
  if(member.must_change_password)return reply({error:'password_change_required'},403);
  if(action==='load'){
   const [master]=await rest('kebbi_master?id=eq.generous');const [state]=await rest('kebbi_states?user_id=eq.'+user.id);
   return reply({member,master:master?.payload,state:state||{revision:0,storage:{}}});
  }
  if(action==='save'){
   const allowed=['kebbi-kpi-local-v1','kebbi-kpi-export-v1','kebbi-management-v2','kebbi-master-mappings-v2','kebbi-draft-v2','kebbi-deleted-v2','kebbi-audit-v2'];
   if(!Number.isInteger(b.revision)||b.revision<0||!b.storage||Array.isArray(b.storage)||Object.entries(b.storage).some(([k,v])=>!allowed.includes(k)||typeof v!=='string'))return reply({error:'invalid_state'},400);
   const [old]=await rest('kebbi_states?user_id=eq.'+user.id);
   if((old?.revision||0)!==b.revision)return reply({error:'conflict'},409);
   let saved;
   if(!old){try{saved=await rest('kebbi_states','POST',{user_id:user.id,revision:1,storage:b.storage});}catch{return reply({error:'conflict'},409);}}
   else saved=await rest('kebbi_states?user_id=eq.'+user.id+'&revision=eq.'+b.revision,'PATCH',{revision:b.revision+1,storage:b.storage,updated_at:new Date().toISOString()});
   if(!saved?.length)return reply({error:'conflict'},409);
   return reply({revision:saved[0].revision});
  }
  if(action==='share'){
   if(typeof b.csv!=='string'||b.csv.length>5_000_000||!b.csv.includes('レコードID'))return reply({error:'invalid_csv'},400);
   await rest('kebbi_shared_exports','POST',{user_id:user.id,csv:b.csv,updated_at:new Date().toISOString()},{Prefer:'resolution=merge-duplicates,return=representation'});
   await audit(user.id,'share_measurements');return reply({ok:true});
  }
  if(action==='shared')return reply({exports:await rest('kebbi_shared_exports?select=user_id,csv,updated_at,kebbi_members(staff_code,display_name,department)')});
  if(member.role!=='admin')return reply({error:'admin_required'},403);
  if(action==='members')return reply({members:await rest('kebbi_members?order=staff_code.asc')});
  if(action==='member_update'){
   if(b.user_id===user.id)return reply({error:'cannot_change_self'},400);
   if(!['staff','admin'].includes(b.role)||typeof b.active!=='boolean')return reply({error:'invalid_member'},400);
   await rest('kebbi_members?user_id=eq.'+encodeURIComponent(b.user_id),'PATCH',{active:b.active,role:b.role});await audit(user.id,'member_update',b.user_id);return reply({ok:true});
  }
  if(action==='reset_password'){
   if(typeof b.password!=='string'||b.password.length<16)return reply({error:'password_length'},400);
   const r=await fetch(URL+'/auth/v1/admin/users/'+encodeURIComponent(b.user_id),{method:'PUT',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({password:b.password})});
   if(!r.ok)return reply({error:'reset_failed'},400);
   await rest('kebbi_members?user_id=eq.'+encodeURIComponent(b.user_id),'PATCH',{must_change_password:true});await audit(user.id,'reset_password',b.user_id);return reply({ok:true});
  }
  return reply({error:'unknown_action'},400);
 }catch{return reply({error:'request_failed'},400);}
});
