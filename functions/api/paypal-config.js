const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
export async function onRequestGet({env}) {
  const hasClientId=Boolean(env.PAYPAL_CLIENT_ID);
  const hasClientSecret=Boolean(env.PAYPAL_CLIENT_SECRET);
  const hasSigningSecret=Boolean(env.ACCESS_TOKEN_SECRET && env.ACCESS_TOKEN_SECRET.length>=32);
  return new Response(JSON.stringify({
    enabled:hasClientId,
    clientId:env.PAYPAL_CLIENT_ID || null,
    currency:"USD",
    price:"5.00",
    passHours:75,
    mode:env.PAYPAL_MODE==="live"?"live":"sandbox",
    diagnostics:{hasClientId,hasClientSecret,hasSigningSecret}
  }),{headers});
}