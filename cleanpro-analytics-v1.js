/* CleanPro demo analytics: local, in-memory only. No external tags or personal data. */
(function(){
'use strict';
const events=[],seen=new Set();
const allowed=new Set(['page_view','view_item','view_item_list','offer_click','select_item','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_shipping_info','add_payment_info','demo_order_complete','section_view','faq_open']);
function track(name,params={}){
 if(!allowed.has(name))return;
 const event={event:name,demo:true,currency:'PLN',...params};
 events.push(event);if(events.length>200)events.shift();
}
window.CleanProAnalytics=Object.freeze({track,debug:()=>JSON.parse(JSON.stringify(events))});
track('page_view');track('view_item',{items:[{item_id:'cleanpro',item_name:'CleanPro'}]});
document.addEventListener('click',e=>{
 const a=e.target.closest('a[href="#oferta"]');if(a)track('offer_click',{section:a.closest('section')?.id||'navigation'});
 const t=e.target.closest('[data-tab]');if(t)track('select_item',{items:[{item_id:'cleanpro-'+t.dataset.tab.toLowerCase(),item_name:'CleanPro '+t.dataset.tab}]});
});
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
 if(!entry.isIntersecting||seen.has(entry.target.id))return;
 const id=entry.target.id;seen.add(id);track('section_view',{section:id});
 if(id==='oferta')track('view_item_list',{item_list_id:'bundles',items:[...document.querySelectorAll('[data-bundle]')].map(b=>({item_id:'cleanpro-'+b.dataset.bundle.toLowerCase(),item_name:'CleanPro '+b.dataset.bundle,price:Number(b.dataset.price)}))});
 observer.unobserve(entry.target);
 }),{threshold:0,rootMargin:'0px 0px -25% 0px'});
 document.querySelectorAll('main section[id]').forEach(el=>observer.observe(el));
}
document.querySelectorAll('#faq details').forEach(el=>el.addEventListener('toggle',()=>{if(el.open)track('faq_open',{question_index:[...document.querySelectorAll('#faq details')].indexOf(el)+1})}));
})();