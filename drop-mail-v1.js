// Drop Mail Framework: pure rendering, no sending or customer data storage.
export const templates=[
  [
    "order-confirmed",
    "Potwierdzenie zamówienia",
    "Dziękujemy za zamówienie!",
    "Otrzymaliśmy zamówienie {{order_number}}. Poniżej znajdziesz jego podsumowanie.",
    "Zobacz zamówienie",
    "{{order_url}}"
  ],
  [
    "payment-confirmed",
    "Potwierdzenie płatności",
    "Płatność potwierdzona",
    "Otrzymaliśmy płatność za zamówienie {{order_number}} w kwocie {{total}}.",
    "Zobacz zamówienie",
    "{{order_url}}"
  ],
  [
    "processing",
    "Zamówienie w realizacji",
    "Przygotowujemy Twoje zamówienie",
    "Zamówienie {{order_number}} zostało przekazane do realizacji.",
    "Sprawdź status",
    "{{order_url}}"
  ],
  [
    "shipped",
    "Zamówienie wysłane",
    "Twoja przesyłka jest w drodze",
    "Zamówienie {{order_number}} zostało wysłane. Przewoźnik: {{carrier}}. Numer przesyłki: {{tracking_number}}.",
    "Śledź przesyłkę",
    "{{tracking_url}}"
  ],
  [
    "delivered",
    "Potwierdzenie dostarczenia",
    "Twoje zamówienie zostało dostarczone",
    "Przewoźnik oznaczył zamówienie {{order_number}} jako dostarczone. W razie pytań skontaktuj się z nami.",
    "Zobacz instrukcję użytkowania",
    "{{instructions_url}}"
  ],
  [
    "review",
    "Prośba o opinię",
    "Jak sprawdza się Twój zakup?",
    "Podziel się swoją rzeczywistą opinią o produkcie. Każda opinia jest dla nas cenna.",
    "Dodaj opinię",
    "{{review_url}}"
  ],
  [
    "abandoned-cart",
    "Przypomnienie o koszyku",
    "Twój koszyk czeka",
    "Jeśli nadal interesują Cię wybrane produkty, możesz wrócić do koszyka. Dostępność i ceny mogą się zmienić.",
    "Wróć do koszyka",
    "{{cart_url}}"
  ]
];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const renderEmail=(t,vars)=>{const [id,subject,heading,body,cta,url]=t;const fill=s=>s.replace(/\{\{(\w+)\}\}/g,(_,k)=>esc(vars[k]??""));const safeUrl=s=>{const v=s.replace(/\{\{(\w+)\}\}/g,(_,k)=>vars[k]??"");try{const u=new URL(v);return u.protocol==="https:"?esc(u.href):""}catch{return ""}};const link=safeUrl(url);const rows=(vars.items||[]).map(x=>`<tr><td style="padding:10px 0;border-bottom:1px solid #e4e9ec">${esc(x.name)} × ${esc(x.quantity)}</td><td align="right" style="border-bottom:1px solid #e4e9ec">${esc(x.total)}</td></tr>`).join("");return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;background:#f4f6f7;font-family:Arial,sans-serif;color:#082331"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:white;border-radius:12px"><tr><td style="background:#082331;color:#fff;padding:24px;font-size:28px;font-weight:bold">${esc(vars.store_name)}<span style="color:#b9ef37">.</span></td></tr><tr><td style="height:5px;background:#b9ef37"></td></tr><tr><td style="padding:28px 22px"><p style="font-size:12px;color:#52616a">${vars.demo?"DEMO • WIADOMOŚĆ TESTOWA":""}</p><h1 style="font-size:26px;line-height:1.2">${esc(heading)}</h1><p style="line-height:1.6">${fill(body)}</p>${id==="order-confirmed"?`<table width="100%" cellspacing="0" cellpadding="0">${rows}<tr><td style="padding-top:12px">Rabat</td><td align="right">${esc(vars.discount)}</td></tr><tr><td>Dostawa</td><td align="right">${esc(vars.shipping)}</td></tr><tr><td>Opłata za pobranie</td><td align="right">${esc(vars.cod_fee)}</td></tr><tr><td><strong>Razem</strong></td><td align="right"><strong>${esc(vars.total)}</strong></td></tr></table>`:""}${link?`<p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#082331;color:white;padding:15px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(cta)}</a></p>`:""}<p style="font-size:14px;color:#52616a">Zespół ${esc(vars.store_name)}</p></td></tr><tr><td style="padding:20px;background:#edf1f3;font-size:12px;line-height:1.6;color:#52616a">${esc(vars.seller_details||"Dane sprzedawcy do uzupełnienia")}<br>${esc(vars.support_email||"Kontakt do uzupełnienia")}${["review","abandoned-cart"].includes(id)&&safeUrl("{{unsubscribe_url}}")?`<br><a href="${safeUrl("{{unsubscribe_url}}")}">Zrezygnuj z wiadomości marketingowych</a>`:""}${vars.demo?"<br>Podgląd demonstracyjny. Wiadomość nie została wysłana.":""}</td></tr></table></td></tr></table></body></html>`};
export function canSend(id,context){if(!templates.some(t=>t[0]===id)||!context?.verifiedEvent||!context?.recipient||!context?.sellerConfigured)return false;if(['review','abandoned-cart'].includes(id))return context.marketingConsent===true&&context.unsubscribed!==true&&context.unsubscribeConfigured===true;return true;}
