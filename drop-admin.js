(function(){
'use strict';
const $=id=>document.getElementById(id),cfg=window.DropAdminConfig||{};
const msg=t=>$('message').textContent=t;
let base,token=null,generation=0;
try{const u=new URL(cfg.url);if(u.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.publishableKey))throw Error();base=u.origin}catch{msg('Panel nieaktywny. Brak konfiguracji środowiska Supabase.');return}
async function request(path,method='GET',body,access=token){
 const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
 if(access)headers.Authorization='Bearer '+access;
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error'});
 if(!r.ok){const e=new Error('Request failed');e.status=r.status;throw e}
 return r.status===204?null:r.json()
}
function clear(){generation++;token=null;$('rows').replaceChildren();$('summary').textContent='';$('panel').hidden=true;$('login').hidden=false;$('password').value=''}
async function load(){
 const g=generation;
 const rows=await request('/rest/v1/orders?select=id,store_id,created_at,total_grosz,currency,payment_status,fulfillment_status&order=created_at.desc&limit=100');
 if(g!==generation||!token)return;
 $('rows').replaceChildren();
 for(const o of rows){const tr=document.createElement('tr');for(const v of [o.id,o.store_id,new Date(o.created_at).toLocaleString('pl-PL'),(Number(o.total_grosz)/100).toLocaleString('pl-PL',{style:'currency',currency:'PLN'}),o.payment_status,o.fulfillment_status]){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('rows').append(tr)}
 $('summary').textContent='Wyświetlono '+rows.length+' najnowszych zamówień (maks. 100).';
}
$('login').hidden=false;msg('Zaloguj się na konto administratora.');
$('form').addEventListener('submit',async e=>{
 e.preventDefault();$('submit').disabled=true;const g=++generation;
 try{
 const auth=await request('/auth/v1/token?grant_type=password','POST',{email:$('email').value,password:$('password').value},null);
 $('password').value='';
 if(g!==generation)return;
 if(!auth.access_token)throw Error();
 token=auth.access_token;
 const allowed=await request('/rest/v1/rpc/drop_is_admin','POST',{});
 if(g!==generation)return;
 if(allowed!==true){clear();msg('Konto nie ma uprawnień administratora.');return}
 await load();if(g!==generation)return;
 $('login').hidden=true;$('panel').hidden=false;msg('Zalogowano. Sesja nie jest zapisywana w przeglądarce.');
 }catch{if(g===generation){clear();msg('Logowanie lub odczyt danych nie powiódł się.')}}finally{$('password').value='';$('submit').disabled=false}
});
$('refresh').onclick=async()=>{const g=generation;try{await load()}catch(e){if(g!==generation)return;if(e.status===401||e.status===403){clear();msg('Sesja wygasła lub brak dostępu. Zaloguj się ponownie.')}else msg('Nie udało się odświeżyć zamówień.')}};
$('logout').onclick=async()=>{const old=token;clear();msg('Wylogowano lokalnie.');try{if(old)await request('/auth/v1/logout?scope=local','POST',undefined,old)}catch{}};
})();