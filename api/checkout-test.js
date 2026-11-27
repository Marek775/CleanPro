const crypto = require('node:crypto');
module.exports = async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 const {DROP_STAGING_CHECKOUT,DROP_STAGING_TOKEN,DROP_STAGING_SUPABASE_URL,DROP_STAGING_SERVICE_KEY}=process.env;
 if(process.env.VERCEL_ENV!=='preview'||DROP_STAGING_CHECKOUT!=='enabled'||!DROP_STAGING_TOKEN||DROP_STAGING_TOKEN.length<32||!DROP_STAGING_SERVICE_KEY)return res.status(503).json({error:'Staging checkout disabled'});
 const digest=s=>crypto.createHash('sha256').update(s).digest();
 if(!crypto.timingSafeEqual(digest(req.headers.authorization||''),digest('Bearer '+DROP_STAGING_TOKEN)))return res.status(401).json({error:'Unauthorized'});
 let base;
 try{const u=new URL(DROP_STAGING_SUPABASE_URL);if(u.protocol!=='https:'||!/^[a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error();base=u.origin}catch{return res.status(503).json({error:'Invalid staging configuration'});}
 const b=req.body;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['requestId','items'].includes(k))||typeof b.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.requestId)||!Array.isArray(b.items)||b.items.length<1||b.items.length>3)return res.status(400).json({error:'Invalid request'});
 const seen=new Set();
 for(const item of b.items){if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['sku','quantity'].includes(k))||!['basic','plus','premium'].includes(item.sku)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99||seen.has(item.sku))return res.status(400).json({error:'Invalid item'});seen.add(item.sku);}
 try{
 const r=await fetch(base+'/rest/v1/rpc/drop_create_order',{method:'POST',headers:{apikey:DROP_STAGING_SERVICE_KEY,Authorization:'Bearer '+DROP_STAGING_SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_request_id:b.requestId,p_store:'cleanpro',p_items:b.items}),redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)return res.status(r.status>=500?502:422).json({error:'Order rejected'});
 const orderId=await r.json();return res.status(200).json({orderId,environment:'staging'});
 }catch{return res.status(502).json({error:'Staging database unavailable'});}
};
