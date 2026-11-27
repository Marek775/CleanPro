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
function clear(){generation++;token=null;current=[];if($('details')?.open)$('details').close();$('detailItems').replaceChildren();$('detailHistory').replaceChildren();$('detailSummary').textContent='';$('rows').replaceChildren();$('summary').textContent='';$('panel').hidden=true;$('login').hidden=false;$('password').value=''}
async function load(){
 const g=generation;
 const rows=await request('/rest/v1/orders?select=id,store_id,created_at,total_grosz,currency,payment_status,fulfillment_status,checkout_delivery,checkout_payment_method,shipping_grosz,fee_grosz,discount_grosz&order=created_at.desc&limit=100');
 if(g!==generation||!token)return;
 render(rows);
}
let current=[];
const money=n=>(Number(n)/100).toLocaleString('pl-PL',{style:'currency',currency:'PLN'});
const labels={pending:'Oczekująca',paid:'Opłacone',failed:'Nieudana',refunded:'Zwrot',new:'Nowe',processing:'W realizacji',shipped:'Wysłane',delivered:'Dostarczone',cancelled:'Anulowane'};
function render(rows){
 current=rows;
 const filtered=rows.filter(o=>(!$('storeFilter')?.value||o.store_id===$('storeFilter').value)&&(! $('statusFilter')?.value||o.fulfillment_status===$('statusFilter').value)&&(! $('searchOrder')?.value||o.id.toLowerCase().includes($('searchOrder').value.toLowerCase().trim())));
 $('rows').replaceChildren();
 for(const o of filtered){const tr=document.createElement('tr');for(const v of [o.id,o.store_id,new Date(o.created_at).toLocaleString('pl-PL'),money(o.total_grosz),labels[o.payment_status]||o.payment_status,labels[o.fulfillment_status]||o.fulfillment_status]){const td=document.createElement('td');td.textContent=v;tr.append(td)}const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='Szczegóły';btn.onclick=()=>details(o);td.append(btn);tr.append(td);$('rows').append(tr)}
 $('summary').textContent='Widoczne: '+filtered.length+' / '+rows.length+' najnowszych zamówień (maks. 100). Dane testowe.';
 if($('kpiCount')){$('kpiCount').textContent=filtered.length;$('kpiValue').textContent=money(filtered.filter(o=>o.fulfillment_status!=='cancelled').reduce((n,o)=>n+Number(o.total_grosz),0));$('kpiPaid').textContent=money(filtered.filter(o=>o.payment_status==='paid'&&o.fulfillment_status!=='cancelled').reduce((n,o)=>n+Number(o.total_grosz),0));$('kpiNew').textContent=filtered.filter(o=>o.fulfillment_status==='new').length}
}
const deliveryLabels = { locker: 'Paczkomat InPost', courier: 'Kurier' };
const paymentLabels = { blik: 'BLIK', transfer: 'Szybki przelew', card: 'Karta', cod: 'Za pobraniem' };
let detailGeneration = 0;

function nextStatuses(order) {
 const testPending = order.store_id === 'cleanpro' && Boolean(order.checkout_payment_method) &&
  order.payment_status === 'pending';
 const canProcess = order.payment_status === 'paid' || testPending;
 switch (order.fulfillment_status) {
  case 'new':
   return [...(canProcess ? ['processing'] : []),
    ...(['pending', 'failed', 'refunded'].includes(order.payment_status) ? ['cancelled'] : [])];
  case 'processing':
   return [...(canProcess ? ['shipped'] : []),
    ...(testPending || order.payment_status === 'refunded' ? ['cancelled'] : [])];
  case 'shipped':
   return ['delivered'];
  default:
   return [];
 }
}

async function details(order, feedback = '') {
 const g = generation, detailId = ++detailGeneration, dialog = $('details');
 const visible = () => g === generation && detailId === detailGeneration && token && dialog.open;
 const statusForm = $('fulfillmentForm'), select = $('nextStatus'), save = $('saveStatus');
 const summary = [labels[order.fulfillment_status], labels[order.payment_status]];
 if (order.checkout_payment_method) {
  summary.push(deliveryLabels[order.checkout_delivery], paymentLabels[order.checkout_payment_method],
   'Dostawa ' + money(order.shipping_grosz), 'Opłata ' + money(order.fee_grosz),
   'Rabat ' + money(order.discount_grosz));
 }
 $('detailTitle').textContent = 'Zamówienie ' + order.id;
 $('detailSummary').textContent = summary.join(' · ');
 $('detailItems').textContent = 'Pobieranie pozycji…';
 $('detailHistory').replaceChildren();
 $('detailMessage').textContent = feedback || 'Pobieranie historii…';
 statusForm.hidden = true;
 if (!dialog.open) dialog.showModal();

 try {
  const [items, history] = await Promise.all([
   request('/rest/v1/order_items?select=name,sku,quantity,unit_grosz&order_id=eq.' + encodeURIComponent(order.id)),
   request('/rest/v1/rpc/drop_get_fulfillment_history', 'POST', { p_order_id: order.id })
  ]);
  if (!visible()) return;
  $('detailItems').replaceChildren();
  for (const item of items) {
   const line = document.createElement('p');
   line.textContent = item.name + ' · ' + item.quantity + ' × ' + money(item.unit_grosz);
   $('detailItems').append(line);
  }
  if (!items.length) $('detailItems').textContent = 'Brak pozycji.';
  for (const entry of history) {
   const line = document.createElement('li');
   line.textContent = new Date(entry.changed_at).toLocaleString('pl-PL') + ' · ' +
    (labels[entry.old_status] || entry.old_status) + ' → ' +
    (labels[entry.new_status] || entry.new_status) + ' · ' + entry.actor_id;
   $('detailHistory').append(line);
  }
  if (!history.length) {
   const line = document.createElement('li');
   line.textContent = 'Brak zmian statusu.';
   $('detailHistory').append(line);
  }
  $('detailMessage').textContent = feedback;
 } catch (error) {
  if (!visible()) return;
  if (error.status === 401 || error.status === 403) {
   clear();
   msg('Sesja wygasła lub brak dostępu. Zaloguj się ponownie.');
   return;
  }
  $('detailItems').replaceChildren();
  $('detailMessage').textContent = 'Nie udało się pobrać szczegółów lub historii.';
  return;
 }

 const statuses = nextStatuses(order);
 select.replaceChildren(new Option('Wybierz status', ''));
 for (const status of statuses) select.add(new Option(labels[status], status));
 select.disabled = false;
 save.disabled = false;
 statusForm.hidden = !statuses.length;
 statusForm.onsubmit = async event => {
  event.preventDefault();
  if (save.disabled || !statuses.includes(select.value) || !visible()) return;
  const next = select.value;
  select.disabled = true;
  save.disabled = true;
  $('detailMessage').textContent = 'Zapisywanie statusu…';
  let changed = false;
  try {
   await request('/rest/v1/rpc/drop_update_fulfillment', 'POST', { p_order_id: order.id, p_status: next });
   changed = true;
   if (g !== generation) return;
   await load();
   if (visible()) await details(current.find(row => row.id === order.id) ||
    { ...order, fulfillment_status: next }, 'Zapisano status.');
  } catch (error) {
   if (g !== generation) return;
   if (error.status === 401 || error.status === 403) {
    clear();
    msg('Sesja wygasła lub brak dostępu. Zaloguj się ponownie.');
    return;
   }
   if (changed) {
    render(current.map(row => row.id === order.id ? { ...row, fulfillment_status: next } : row));
    if (visible()) await details({ ...order, fulfillment_status: next },
     'Zapisano status. Odśwież listę, aby pobrać aktualne dane.');
   } else if (visible()) {
    if (error.status === 409) {
     statusForm.hidden = true;
     $('detailMessage').textContent = 'Status zamówienia uległ zmianie. Zamknij szczegóły i odśwież listę.';
    } else {
     $('detailMessage').textContent = 'Brak potwierdzenia zapisu. Odśwież listę i sprawdź historię.';
     statusForm.hidden = true;
    }
   }
  }
 };
}
for(const id of ['storeFilter','statusFilter','searchOrder'])$(id)?.addEventListener('input',()=>render(current));
$('closeDetails')?.addEventListener('click',()=>$('details').close());
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