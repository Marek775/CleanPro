const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/checkout-test.js');
const token='x'.repeat(40);
function call(method,authorization,body){let result;const res={setHeader(){},status(code){this.code=code;return this},json(data){result={code:this.code,data};return result}};return handler({method,headers:{authorization},body},res)}
test('staging endpoint fails closed and validates input',async()=>{
 delete process.env.DROP_STAGING_CHECKOUT;
 assert.equal((await call('GET')).code,405);
 assert.equal((await call('POST')).code,503);
 Object.assign(process.env,{DROP_STAGING_CHECKOUT:'enabled',DROP_STAGING_TOKEN:token,DROP_STAGING_SERVICE_KEY:'fake',DROP_STAGING_SUPABASE_URL:'https://example.supabase.co'});
 assert.equal((await call('POST','wrong')).code,401);
 const body={requestId:'12345678-1234-1234-1234-123456789abc',items:[{sku:'plus',quantity:2}]};
 assert.equal((await call('POST','Bearer '+token,{...body,email:'test@example.com'})).code,400);
 assert.equal((await call('POST','Bearer '+token,{...body,items:[{sku:'plus',quantity:0}]})).code,400);
 assert.equal((await call('POST','Bearer '+token,{...body,items:[{sku:'plus',quantity:2,price:1}]})).code,400);
 const original=global.fetch;
 try{global.fetch=async(url,opts)=>{assert.equal(url,'https://example.supabase.co/rest/v1/rpc/drop_create_order');assert.deepEqual(JSON.parse(opts.body),{p_request_id:body.requestId,p_store:'cleanpro',p_items:body.items});return {ok:true,json:async()=>body.requestId}};
 assert.deepEqual(await call('POST','Bearer '+token,body),{code:200,data:{orderId:body.requestId,environment:'staging'}});
 }finally{global.fetch=original}
});
