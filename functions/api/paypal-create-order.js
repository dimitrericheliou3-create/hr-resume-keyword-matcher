const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function accessToken(env) {
  if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal server credentials are not configured.");
  const base=env.PAYPAL_MODE==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";
  const auth=btoa(env.PAYPAL_CLIENT_ID+":"+env.PAYPAL_CLIENT_SECRET);
  const res=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{authorization:"Basic "+auth,"content-type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  const data=await res.json();
  if(!res.ok||!data.access_token) throw new Error("Could not authenticate with PayPal.");
  return {token:data.access_token,base};
}
export async function onRequestPost({request,env}) {
  if(request.headers.get("origin") && new URL(request.headers.get("origin")).host!==new URL(request.url).host) return reply({error:"Origin not allowed."},403);
  try {
    const {token,base}=await accessToken(env);
    const res=await fetch(base+"/v2/checkout/orders",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","prefer":"return=representation"},body:JSON.stringify({intent:"CAPTURE",purchase_units:[{reference_id:"premium-pass-24h",custom_id:"hrmatcher-premium-24h",description:"HR Resume & Keyword Matcher Premium Pass (24 hours)",amount:{currency_code:"USD",value:"5.00"}}],application_context:{shipping_preference:"NO_SHIPPING",user_action:"PAY_NOW"}})});
    const data=await res.json();
    if(!res.ok||!data.id) return reply({error:"PayPal could not create the order. Please try again."},502);
    return reply({id:data.id});
  } catch(e) { return reply({error:e.message||"Unable to start PayPal checkout."},500); }
}