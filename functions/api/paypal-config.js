const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
export async function onRequestGet({env}) {
  if (!env.PAYPAL_CLIENT_ID) return new Response(JSON.stringify({enabled:false,error:"PayPal is not configured yet."}),{status:503,headers});
  return new Response(JSON.stringify({enabled:true,clientId:env.PAYPAL_CLIENT_ID,currency:"USD",price:"5.00",passHours:24,mode:env.PAYPAL_MODE==="live"?"live":"sandbox"}),{headers});
}