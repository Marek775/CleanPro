(function(){'use strict';
const key='cleanpro-consent-v1';let state=null;try{const x=JSON.parse(localStorage.getItem(key));if(x?.version===1&&typeof x.analytics==='boolean'&&typeof x.marketing==='boolean')state=x}catch(e){}
const d=document.getElementById('cp-consent'),a=document.getElementById('cp-consent-a'),m=document.getElementById('cp-consent-m'),prefs=document.getElementById('cp-consent-prefs');
function open(){a.checked=!!state?.analytics;m.checked=!!state?.marketing;prefs.hidden=true;if(!d.open)d.showModal()}
function save(analytics,marketing){state={version:1,analytics,marketing};try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}d.close();window.dispatchEvent(new CustomEvent('cp-consent-change',{detail:{...state}}))}
window.CleanProConsent=Object.freeze({get:()=>({analytics:!!state?.analytics,marketing:!!state?.marketing}),open});
document.getElementById('cp-consent-open').onclick=open;
document.getElementById('cp-consent-all').onclick=()=>save(true,true);
document.getElementById('cp-consent-none').onclick=()=>save(false,false);
document.getElementById('cp-consent-custom').onclick=()=>{prefs.hidden=false};
document.getElementById('cp-consent-save').onclick=()=>save(a.checked,m.checked);
d.addEventListener('cancel',e=>{e.preventDefault();d.close()});
if(!state)open();
})();