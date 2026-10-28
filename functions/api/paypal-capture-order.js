const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const b64u=(bytes)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(payload,secret) {
  const body=b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body));
  return body+"."+b64u(sig);
}
async function accessToken(env) {
  if(!env.PAYPAL_CLIENT_ID) throw new Error("PAYPAL_CLIENT_ID is missing in this deployment environment.");
  if(!env.PAYPAL_CLIENT_SECRET) throw new Error("PAYPAL_CLIENT_SECRET is missing in this deployment environment.");
  const base=env.PAYPAL_MODE==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";
  const res=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{authorization:"Basic "+btoa(env.PAYPAL_CLIENT_ID+":"+env.PAYPAL_CLIENT_SECRET),"content-type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  const data=await res.json();
  if(!res.ok||!data.access_token) throw new Error("Could not authenticate with PayPal.");
  return {token:data.access_token,base};
}
export async function onRequestPost({request,env}) {
  if(request.headers.get("origin") && new URL(request.headers.get("origin")).host!==new URL(request.url).host) return reply({error:"Origin not allowed."},403);
  if(!env.ACCESS_TOKEN_SECRET||env.ACCESS_TOKEN_SECRET.length<32) return reply({error:"Premium access signing secret is not configured. Set ACCESS_TOKEN_SECRET in Cloudflare."},503);
  let body; try {body=await request.json()} catch {return reply({error:"Invalid JSON."},400)}
  const orderId=typeof body.orderId==="string"?body.orderId:"";
  if(!/^[A-Z0-9-]{10,}$/i.test(orderId)) return reply({error:"Invalid PayPal order ID."},400);
  try {
    const {token,base}=await accessToken(env);
    const res=await fetch(base+"/v2/checkout/orders/"+encodeURIComponent(orderId)+"/capture",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","prefer":"return=representation"}});
    const data=await res.json();
    if(!res.ok) { const issue=data.details?.[0]?.issue || data.name || "CAPTURE_FAILED"; const debugId=typeof data.debug_id==="string"?data.debug_id:null; return reply({error:"PayPal capture failed: "+issue+". If you were charged, check your PayPal activity before trying again.",paypalIssue:issue,paypalDebugId:debugId,paypalStatus:res.status},402); }
    const unit=data.purchase_units?.[0];
    const capture=unit?.payments?.captures?.[0];
    const amount=capture?.amount;
    if(data.status!=="COMPLETED"||capture?.status!=="COMPLETED"||amount?.currency_code!=="USD"||amount?.value!=="5.00"||unit?.custom_id!=="hrmatcher-premium-24h") return reply({error:"Payment could not be verified as a completed $5.00 USD premium pass."},402);
    const now=Math.floor(Date.now()/1000);
    const premiumToken=await sign({iss:"hr-resume-keyword-matcher",aud:"premium",iat:now,exp:now+270000,orderId},env.ACCESS_TOKEN_SECRET);
    return reply({ok:true,premiumToken,expiresAt:new Date((now+270000)*1000).toISOString(),message:"Premium is active for 75 hours in this open page."});
  } catch(e) { return reply({error:e.message||"Unable to verify payment."},500); }
}