(function(){const config=window.DropConfig;const menu=document.querySelector('#cp-menu'),toggle=document.querySelector('.cp-menu-toggle');function closeMenu(){menu.hidden=true;toggle.setAttribute('aria-expanded','false')}toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden))});menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});document.querySelectorAll('.cp-reveal input').forEach(i=>i.addEventListener('input',()=>i.parentElement.style.setProperty('--pos',i.value+'%')));const dialog=document.querySelector('#cp-cart'),items=document.querySelector('#cp-cart-items'),cart={};const storageKey='cleanpro-demo-cart-v1';let promo=false;const discount=n=>promo?Math.round(Math.round(n*100)*config.coupon.percent/100)/100:0;const subtotal=()=>Object.values(cart).reduce((sum,v)=>sum+Math.round(v.price*100)*v.qty,0)/100;const promoInput=document.querySelector('#cp-promo-code'),promoStatus=document.querySelector('#cp-promo-status');function setPromo(active){promo=active;promoInput.value=active?config.coupon.code:'';promoStatus.textContent=active?'Kod '+config.coupon.code+' aktywny · '+config.coupon.percent+'% na produkty':'Kod testowy: '+config.coupon.code;render()}document.querySelector('#cp-promo-apply').onclick=()=>{if(promoInput.value.trim().toUpperCase()===config.coupon.code&&subtotal()>0)setPromo(true);else promoStatus.textContent='Nieprawidłowy kod. Aktualny rabat pozostaje bez zmian.'};document.querySelector('#cp-promo-remove').onclick=()=>setPromo(false);function upgradeRender(){const section=document.querySelector('#cp-upgrade'),list=document.querySelector('#cp-upgrade-items');list.replaceChildren();for(const [from,to] of config.upsell){const old=cart[from];if(!old?.qty||(cart[to]?.qty||0)+old.qty>99)continue;const b=document.querySelector('[data-bundle="'+to+'"]');if(!b)continue;const price=Number(b.dataset.price),img=b.closest('.cp-bundle').querySelector('img').src;const row=document.createElement('div');row.className='cp-up-row';const picture=document.createElement('img');picture.src=img;picture.alt='';const desc=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small');title.textContent=from+' → '+to;detail.textContent='Dopłata za '+old.qty+' szt.: '+money((price-old.price)*old.qty)+(promo?' (po rabacie: '+money((price-old.price)*old.qty-discount((price-old.price)*old.qty))+')':'');desc.append(title,detail);const btn=document.createElement('button');btn.type='button';btn.textContent='Zmień na '+to;btn.onclick=()=>{const qty=old.qty;track('remove_from_cart',{value:old.price*qty,items:[item(from,old)]});delete cart[from];cart[to]={qty:(cart[to]?.qty||0)+qty,price,img};track('add_to_cart',{value:price*qty,items:[item(to,cart[to],qty)]});bar(to,price);render()};row.append(picture,desc,btn);list.append(row)}section.hidden=!list.children.length}const track=(n,p)=>window.CleanProAnalytics?.track(n,p);const item=(name,v,qty=v.qty)=>({item_id:(v.accessory?'accessory-':'cleanpro-')+name.toLowerCase().replace(/\s+/g,'-'),item_name:v.accessory?name:config.store.name+' '+name,price:v.price,quantity:qty});const snapshot=()=>{const entries=Object.entries(cart).filter(([k,v])=>v.qty>0);return {value:Math.round((subtotal()-discount(subtotal()))*100)/100,...(promo?{coupon:config.coupon.code,discount:discount(subtotal())}:{}),items:entries.map(([k,v])=>item(k,v))}};const accessories=config.accessories;function crossRender(){const section=document.querySelector('#cp-cross'),grid=document.querySelector('#cx-grid');section.hidden=!Object.values(cart).some(v=>v.qty>0&&!v.accessory);grid.replaceChildren();if(section.hidden)return;accessories.forEach(a=>{const card=document.createElement('article');card.className='cx-card';card.innerHTML='<img alt=""><b></b><strong></strong><button type="button"></button>';card.querySelector('img').src=a.img;card.querySelector('b').textContent=a.name;card.querySelector('strong').textContent=money(a.price);const btn=card.querySelector('button');btn.disabled=!!cart[a.name]?.qty;btn.textContent=btn.disabled?'✓ Dodano':'+ Dodaj';btn.onclick=()=>{cart[a.name]={qty:1,price:a.price,img:a.img,accessory:true};track('add_to_cart',{value:a.price,items:[item(a.name,cart[a.name],1)]});render()};grid.append(card)})}function render(){try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(Object.entries(cart).filter(([k,v])=>v.qty>0).map(([k,v])=>[k,v.qty]))))}catch(e){}items.replaceChildren();let total=0,count=0;Object.entries(cart).forEach(([name,v])=>{if(!v.qty)return;total+=v.qty*v.price;count+=v.qty;const row=document.createElement('div');row.className='cp-cart-row';row.innerHTML='<img alt=""><div><b></b><small></small><div class="cp-qty"><button type="button" aria-label="Zmniejsz ilość">−</button><span></span><button type="button" aria-label="Zwiększ ilość">+</button></div></div><button type="button" aria-label="Usuń produkt">×</button>';row.querySelector('img').src=v.img;row.querySelector('b').textContent=v.accessory?name:config.store.name+' '+name;row.querySelector('small').textContent=money(v.price)+' / szt.';row.querySelector('.cp-qty span').textContent=v.qty;const bs=row.querySelectorAll('button');bs[0].onclick=()=>{v.qty--;track('remove_from_cart',{value:v.price,items:[item(name,v,1)]});if(v.qty===0)delete cart[name];render()};bs[1].onclick=()=>{if(v.qty<99){v.qty++;track('add_to_cart',{value:v.price,items:[item(name,v,1)]})}render()};bs[2].onclick=()=>{track('remove_from_cart',{value:v.price*v.qty,items:[item(name,v)]});delete cart[name];render()};items.append(row)});document.querySelector('#cp-checkout-start').disabled=!count;if(!count)items.textContent='Twój koszyk jest pusty.';if(!count){promo=false;promoInput.value='';promoStatus.textContent='Kod testowy: '+config.coupon.code}document.querySelector('#cp-promo').hidden=!count;document.querySelector('#cp-promo-remove').hidden=!promo;document.querySelector('#cp-discount-row').hidden=!promo;document.querySelector('#cp-discount').textContent='−'+money(discount(subtotal()));document.querySelector('#cp-cart-total').textContent=money(subtotal()-discount(subtotal()));upgradeRender();document.querySelectorAll('.cp-count').forEach(x=>x.textContent=count);crossRender()}function bar(name,price){document.querySelector('#cp-bar-name').textContent=config.store.name+' '+name+' · demo';document.querySelector('#cp-bar-price').textContent=price+' zł'}document.querySelectorAll('[data-tab]').forEach(t=>t.addEventListener('click',()=>{const b=document.querySelector('[data-bundle="'+t.dataset.tab+'"]');bar(b.dataset.bundle,b.dataset.price)}));document.querySelectorAll('[data-bundle]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.bundle,price=Number(b.dataset.price);bar(name,price);if(!cart[name])cart[name]={qty:0,price,img:b.closest('.cp-bundle').querySelector('img').src};if(cart[name].qty<99){cart[name].qty++;track('add_to_cart',{value:price,items:[item(name,cart[name],1)]})}render();if(!dialog.open){dialog.showModal();track('view_cart',snapshot())}}));document.querySelectorAll('.cp-cart-toggle').forEach(b=>b.addEventListener('click',()=>{render();if(!dialog.open){dialog.showModal();track('view_cart',snapshot())}}));const co=document.querySelector('#cp-checkout'),form=document.querySelector('#co-form'),done=document.querySelector('#co-done'),start=document.querySelector('#cp-checkout-start');const money=n=>n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';function coRender(){let subtotal=0;const list=document.querySelector('#co-items');list.replaceChildren();Object.entries(cart).forEach(([name,v])=>{if(v.qty<=0)return;subtotal+=v.qty*v.price;const row=document.createElement('div');row.className='co-item';row.innerHTML='<img alt=""><div><b></b><small></small></div><strong></strong>';row.querySelector('img').src=v.img;row.querySelector('b').textContent=v.accessory?name:config.store.name+' '+name;row.querySelector('small').textContent='Ilość: '+v.qty;row.querySelector('strong').textContent=money(v.qty*v.price);list.append(row)});const courier=form.elements.delivery.value==='courier',ship=courier?config.delivery.courier.price:config.delivery.locker.price,fee=form.elements.payment.value==='cod'?config.codFee:0;for(const [id,active] of [['co-locker',!courier],['co-address',courier]]){const el=document.getElementById(id);el.hidden=!active;el.querySelectorAll('input').forEach(i=>i.disabled=!active)}document.querySelector('#co-sub').textContent=money(subtotal);document.querySelector('#co-ship').textContent=money(ship);document.querySelector('#co-fee').textContent=money(fee);document.querySelector('#co-discount-row').hidden=!promo;document.querySelector('#co-discount').textContent='−'+money(discount(subtotal));document.querySelector('#co-total').textContent=money(subtotal-discount(subtotal)+ship+fee)}start.onclick=()=>{if(!Object.values(cart).some(v=>v.qty>0))return;track('begin_checkout',snapshot());form.hidden=false;done.hidden=true;orderMessage('');document.querySelector('.co-steps').hidden=false;document.querySelector('#co-back').hidden=false;coRender();dialog.close();co.showModal();co.scrollTop=0};form.addEventListener('change',e=>{coRender();if(e.target.name==='delivery')track('add_shipping_info',{...snapshot(),shipping_tier:form.elements.delivery.value});if(e.target.name==='payment')track('add_payment_info',{...snapshot(),payment_type:form.elements.payment.value})});
function confirmRender(receipt){const put=(id,value)=>document.getElementById('cp-confirm-'+id).textContent=value;put('number',receipt.orderId);const list=document.getElementById('cp-confirm-items');list.replaceChildren();for(const [name,v] of Object.entries(cart)){if(v.qty<=0)continue;const row=document.createElement('div');row.className='co-item';const img=document.createElement('img');img.src=v.img;img.alt='';const desc=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small'),price=document.createElement('strong');b.textContent=v.accessory?name:config.store.name+' '+name;small.textContent='Ilość: '+v.qty;price.textContent=money(v.qty*v.price);desc.append(b,small);row.append(img,desc,price);list.append(row)}const sub=subtotal(),rebate=discount(sub),delivery=form.elements.delivery.value,payment=form.elements.payment.value,ship=config.delivery[delivery].price,fee=payment==='cod'?config.codFee:0;put('sub',money(sub));put('discount',rebate?'−'+money(rebate):money(0));put('ship',money(ship));put('fee',money(fee));put('total',money(receipt.totalGrosz / 100));put('delivery',config.delivery[delivery].label);put('payment',config.payment[payment]||'Nie wybrano')}
const orderStorageKey = 'cleanpro-test-checkout-v1';
const back = document.querySelector('#co-back');
const message = document.querySelector('#co-order-message');
const submit = form.querySelector('[type="submit"]');
const errors = {
  price_changed: 'Cena w sklepie uległa zmianie. Odśwież stronę i sprawdź koszyk.',
  items_unavailable: 'Co najmniej jeden produkt jest niedostępny. Sprawdź koszyk.',
  idempotency_conflict: 'Zapis tej próby jest niespójny. Skontaktuj się z obsługą testów.',
  checkout_disabled: 'Zapis zamówień jest dostępny wyłącznie w środowisku testowym.'
};
let submitting = false;
let pendingOrder;
try { pendingOrder = JSON.parse(sessionStorage.getItem(orderStorageKey)); } catch {}

function orderMessage(text) {
  message.hidden = !text;
  message.textContent = text;
}

function checkoutPayload() {
  const items = Object.entries(cart).map(([name, line]) => ({
    sku: line.accessory ? accessories.find(a => a.name === name).sku : name.toLowerCase(),
    quantity: line.qty
  })).sort((a, b) => a.sku.localeCompare(b.sku));
  const delivery = form.elements.delivery.value;
  const payment = form.elements.payment.value;
  const sub = subtotal();
  const ship = config.delivery[delivery].price;
  const fee = payment === 'cod' ? config.codFee : 0;
  const expectedTotalGrosz = Math.round((sub - discount(sub) + ship + fee) * 100);
  return { items, delivery, payment, coupon: promo ? config.coupon.code : null, expectedTotalGrosz };
}

function checkoutRequestId(payload) {
  const signature = JSON.stringify(payload);
  if (pendingOrder?.signature === signature) return pendingOrder.requestId;
  pendingOrder = { signature, requestId: crypto.randomUUID() };
  try { sessionStorage.setItem(orderStorageKey, JSON.stringify(pendingOrder)); } catch {}
  return pendingOrder.requestId;
}

co.addEventListener('cancel', event => {
  if (submitting) event.preventDefault();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !Object.keys(cart).length) return;

  submitting = true;
  const controls = [...form.querySelectorAll('input:not(:disabled)'), submit, back];
  controls.forEach(control => control.disabled = true);
  orderMessage('Zapisywanie zamówienia testowego…');

  try {
    const payload = checkoutPayload();
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ ...payload, requestId: checkoutRequestId(payload) })
    });
    const receipt = await response.json();
    if (!response.ok) throw new Error(receipt.error);
    if (!receipt || typeof receipt.orderId !== 'string' || !receipt.orderId ||
        receipt.totalGrosz !== payload.expectedTotalGrosz) throw new Error();

    confirmRender(receipt);
    const analytics = { ...snapshot(), value: receipt.totalGrosz / 100, shipping_tier: payload.delivery,
      payment_type: payload.payment };
    form.reset();
    Object.keys(cart).forEach(key => delete cart[key]);
    render();
    pendingOrder = undefined;
    try { sessionStorage.removeItem(orderStorageKey); } catch {}
    orderMessage('');
    form.hidden = true;
    done.hidden = false;
    document.querySelector('.co-steps').hidden = true;
    back.hidden = true;
    co.scrollTop = 0;
    document.querySelector('#cp-confirm-title').focus();
    track('demo_order_complete', analytics);
  } catch (error) {
    orderMessage(Object.hasOwn(errors, error.message) ? errors[error.message] :
      'Brak potwierdzenia zapisu zamówienia. Spróbuj ponownie z tym samym koszykiem.');
  } finally {
    controls.forEach(control => control.disabled = false);
    submitting = false;
    if (!form.hidden) coRender();
  }
});
document.querySelector('#co-back').onclick=()=>{co.close();render();dialog.showModal()};document.querySelector('#co-finish').onclick=()=>{co.close()};document.querySelector('#cp-cart-close').onclick=document.querySelector('#cp-cart-continue').onclick=()=>dialog.close();try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');document.querySelectorAll('[data-bundle]').forEach(b=>{const name=b.dataset.bundle,qty=saved[name];if(Number.isInteger(qty)&&qty>0&&qty<=99)cart[name]={qty,price:Number(b.dataset.price),img:b.closest('.cp-bundle').querySelector('img').src}});accessories.forEach(a=>{const qty=saved[a.name];if(Number.isInteger(qty)&&qty>0&&qty<=99)cart[a.name]={qty,price:a.price,img:a.img,accessory:true}})}catch(e){}
try {
  const previous = JSON.parse(pendingOrder?.signature);
  if (JSON.stringify(previous.items) === JSON.stringify(checkoutPayload().items)) {
    form.elements.delivery.value = previous.delivery;
    form.elements.payment.value = previous.payment;
    if (previous.coupon === config.coupon.code && subtotal() > 0) setPromo(true);
  }
} catch {}
render();
})();
