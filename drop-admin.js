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
function clear(){clearRecipient();generation++;token=null;current=[];if($('details')?.open)$('details').close();$('detailItems').replaceChildren();$('detailHistory').replaceChildren();$('detailSummary').textContent='';$('rows').replaceChildren();$('summary').textContent='';$('panel').hidden=true;$('login').hidden=false;$('password').value=''}
async function load(){
 const g=generation;
 const rows=await request('/rest/v1/orders?select=id,store_id,created_at,total_grosz,currency,payment_status,fulfillment_status,checkout_delivery,checkout_payment_method,shipping_grosz,fee_grosz,discount_grosz,shipping_source,shipping_revision,shipping_carrier,tracking_number,supplier_reference,stripe_test_started_at&order=created_at.desc&limit=100');
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
const shippingLabels = { supplier: 'Dostawca w moim imieniu', self: 'Wysyłam samodzielnie' };
let detailGeneration = 0;

function usesShipping(order) {
 return order.store_id === 'cleanpro' && Boolean(order.checkout_payment_method);
}

function readyToShip(order) {
 return !usesShipping(order) || (order.shipping_source && order.shipping_carrier &&
  order.tracking_number && (order.shipping_source !== 'supplier' || order.supplier_reference));
}

function shippingDescription(order) {
 return [shippingLabels[order.shipping_source], order.shipping_carrier, order.tracking_number,
  order.supplier_reference && 'Zlecenie dostawcy ' + order.supplier_reference].filter(Boolean).join(' · ');
}

function showShipping(order, history, visible, reload, setBusy) {
 const form = $('shippingForm'), select = $('shippingSource'), reference = $('supplierReference');
 const carrier = $('shippingCarrier'), tracking = $('trackingNumber');
 $('shippingDetails').hidden = !usesShipping(order);
 if (!usesShipping(order)) return;

 $('shippingSummary').textContent = shippingDescription(order) || 'Nie wybrano sposobu realizacji.';
 if (order.fulfillment_status === 'processing' && !readyToShip(order)) {
  $('shippingSummary').textContent += ' Przed oznaczeniem jako wysłane zapisz przewoźnika i numer śledzenia. Przy wysyłce przez dostawcę podaj także jego numer zlecenia.';
 }
 $('shippingHistory').replaceChildren();
 for (const entry of history) {
  const li = document.createElement('li');
  li.textContent = new Date(entry.changed_at).toLocaleString('pl-PL') + ' · ' +
   (entry.previous_source && entry.previous_source !== entry.shipping_source
    ? shippingLabels[entry.previous_source] + ' → ' : '') + shippingDescription(entry) + ' · ' + entry.actor_id;
  $('shippingHistory').append(li);
 }
 if (!history.length) {
  const li = document.createElement('li');
  li.textContent = 'Brak zmian danych wysyłki.';
  $('shippingHistory').append(li);
 }
 form.hidden = !['new', 'processing'].includes(order.fulfillment_status);
 select.value = order.shipping_source || '';
 carrier.value = order.shipping_carrier || '';
 tracking.value = order.tracking_number || '';
 reference.value = order.supplier_reference || '';
 const updateReference = () => {
  $('supplierReferenceLabel').hidden = reference.disabled = select.value !== 'supplier';
 };
 select.onchange = updateReference;
 updateReference();
 form.onsubmit = async event => {
  event.preventDefault();
  if (!visible() || $('saveShipping').disabled) return;
  setBusy(true);
  try {
   await request('/rest/v1/rpc/drop_save_shipping', 'POST', {
    p_order_id: order.id, p_revision: order.shipping_revision, p_source: select.value,
    p_carrier: carrier.value.trim(), p_tracking: tracking.value.trim(),
    p_supplier_reference: select.value === 'supplier' ? reference.value.trim() : null
   });
   if (visible()) await reload('Zapisano dane wysyłki.');
  } catch (error) {
   if (!visible()) return;
   if (error.status === 401 || error.status === 403) {
    clear();
    msg('Sesja wygasła lub brak dostępu. Zaloguj się ponownie.');
   } else if (error.status === 409) {
    $('detailMessage').textContent = 'Zamówienie zmieniło się. Zamknij szczegóły i odśwież listę.';
    form.hidden = true;
   } else {
    $('detailMessage').textContent = error.status === 422
     ? 'Sprawdź format i długość numerów wysyłki.' : 'Brak potwierdzenia zapisu wysyłki. Odśwież listę.';
   }
  } finally {
   if (visible()) setBusy(false);
  }
 };
}


function nextStatuses(order) {
 const testPending = order.store_id === 'cleanpro' && Boolean(order.checkout_payment_method) &&
  order.payment_status === 'pending';
 const canProcess = order.payment_status === 'paid' || (testPending && !order.stripe_test_started_at);
 switch (order.fulfillment_status) {
  case 'new':
   return [...(canProcess ? ['processing'] : []),
    ...((['failed', 'refunded'].includes(order.payment_status) ||
     (order.payment_status === 'pending' && !order.stripe_test_started_at)) ? ['cancelled'] : [])];
  case 'processing':
   return [...(canProcess && readyToShip(order) ? ['shipped'] : []),
    ...(testPending || order.payment_status === 'refunded' ? ['cancelled'] : [])];
  case 'shipped':
   return ['delivered'];
  default:
   return [];
 }
}

function clearRecipient() {
 $('recipientDetails').hidden = true;
 $('recipientFields').replaceChildren();
 $('supplierDraft').hidden = true;
 $('supplierOrderText').value = '';
 $('supplierCopyMessage').textContent = '';
}

function showRecipient(order, recipient, items, visible) {
 if (!usesShipping(order)) return;
 $('recipientDetails').hidden = false;
 const fieldList = $('recipientFields');
 if (!recipient) {
  const missing = document.createElement('dd');
  missing.textContent = 'Brak danych dostawy. Zamówienie zapisano bez danych odbiorcy.';
  fieldList.append(missing);
  return;
 }
 const fields = [
  ['Odbiorca', recipient.name], ['E-mail', recipient.email], ['Telefon', recipient.phone]
 ];
 if (order.checkout_delivery === 'locker') fields.push(['Paczkomat', recipient.lockerCode]);
 else fields.push(['Ulica i numer', recipient.street], ['Kod pocztowy', recipient.postalCode], ['Miasto', recipient.city]);
 for (const [label, value] of fields) {
  const term = document.createElement('dt'), description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  fieldList.append(term, description);
 }
 if (order.shipping_source !== 'supplier' || order.fulfillment_status === 'cancelled') return;

 const draft = $('supplierOrderText'), copyMessage = $('supplierCopyMessage');
 $('supplierDraft').hidden = false;
 draft.value = [
  'ZLECENIE TESTOWE – NIE NADAWAĆ',
  'Zamówienie CleanPro ' + order.id,
  'Proszę o przygotowanie wysyłki w imieniu CleanPro.',
  'Dostawa: ' + deliveryLabels[order.checkout_delivery],
  ...(order.checkout_payment_method === 'cod' ? ['Sposób płatności: za pobraniem (symulacja)'] : []),
  ...fields.map(([label, value]) => label + ': ' + value),
  '', 'Pozycje:',
  ...items.map(item => item.sku + ' · ' + item.name + ' · ' + item.quantity + ' szt.')
 ].join('\n');
 $('copySupplierOrder').onclick = async () => {
  try {
   await navigator.clipboard.writeText(draft.value);
   if (visible()) copyMessage.textContent = 'Skopiowano zlecenie.';
  } catch {
   if (!visible()) return;
   draft.select();
   copyMessage.textContent = 'Automatyczne kopiowanie jest niedostępne. Skopiuj zaznaczony tekst ręcznie.';
  }
 };
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
 $('shippingDetails').hidden = true;
 clearRecipient();
 const setBusy = busy => { save.disabled = $('saveShipping').disabled = busy; };
 const reload = async message => {
  await load();
  if (visible()) {
   const updated = current.find(row => row.id === order.id);
   if (updated) await details(updated, message);
   else dialog.close();
  }
 };
 if (!dialog.open) dialog.showModal();

 try {
  const [items, history, shippingHistory, recipient] = await Promise.all([
   request('/rest/v1/order_items?select=name,sku,quantity,unit_grosz&order_id=eq.' + encodeURIComponent(order.id)),
   request('/rest/v1/rpc/drop_get_fulfillment_history', 'POST', { p_order_id: order.id }),
   usesShipping(order) ? request('/rest/v1/rpc/drop_get_shipping_history', 'POST', { p_order_id: order.id }) : [],
   usesShipping(order) ? request('/rest/v1/rpc/drop_get_delivery_details', 'POST', { p_order_id: order.id }) : null
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
  showShipping(order, shippingHistory, visible, reload, setBusy);
  showRecipient(order, recipient, items, visible);
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
 setBusy(false);
 statusForm.hidden = !statuses.length;
 statusForm.onsubmit = async event => {
  event.preventDefault();
  if (save.disabled || !statuses.includes(select.value) || !visible()) return;
  const next = select.value;
  select.disabled = true;
  setBusy(true);
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
     $('shippingForm').hidden = true;
     $('detailMessage').textContent = 'Status zamówienia uległ zmianie. Zamknij szczegóły i odśwież listę.';
    } else {
     $('detailMessage').textContent = 'Brak potwierdzenia zapisu. Odśwież listę i sprawdź historię.';
     statusForm.hidden = true;
     $('shippingForm').hidden = true;
    }
   }
  }
 };
}
for(const id of ['storeFilter','statusFilter','searchOrder'])$(id)?.addEventListener('input',()=>render(current));
$('details').addEventListener('close', () => { if (!$('details').open) clearRecipient(); });
$('closeDetails')?.addEventListener('click',()=>$('details').close());
$('login').hidden=false;msg('Zaloguj się na konto administratora.');
$('form').addEventListener('submit',async e=>{
 e.preventDefault();
 const submit = $('submit');
 if (submit.disabled) return;
 submit.disabled = true;
 const g = ++generation;
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
 }catch{if(g===generation){clear();msg('Logowanie lub odczyt danych nie powiódł się.')}}finally{$('password').value='';submit.disabled=false}
});
$('refresh').onclick=async()=>{const g=generation;try{await load()}catch(e){if(g!==generation)return;if(e.status===401||e.status===403){clear();msg('Sesja wygasła lub brak dostępu. Zaloguj się ponownie.')}else msg('Nie udało się odświeżyć zamówień.')}};
$('logout').onclick=async()=>{const old=token;clear();msg('Wylogowano lokalnie.');try{if(old)await request('/auth/v1/logout?scope=local','POST',undefined,old)}catch{}};
})();