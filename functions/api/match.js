const MAX_BODY = 1_500_000;
const MAX_RESUMES = 50;
const MAX_TEXT = 100_000;
const STOP = new Set(("a an and are as at be been being by for from has have he her hers him his i in into is it its of on or our she that the their them they this to was we were will with you your candidate experience role work using use required preferred strong including across ability skills skill responsibilities qualifications years year team teams professional proficient proficiency knowledge excellent plus etc").split(/\s+/));
const COMMON_SKILLS = [
  "javascript","typescript","python","java","c++","c#","sql","excel","power bi","tableau","salesforce","workday","adp","sap","hris","ats","recruiting","talent acquisition","sourcing","onboarding","payroll","employee relations","labor law","employment law","benefits administration","performance management","learning and development","compensation","project management","stakeholder management","data analysis","communication","leadership","customer service","budgeting","forecasting","accounting","bookkeeping","financial reporting","compliance","risk management","cloudflare","react","node.js","rest api","git","agile","scrum","marketing","seo","content strategy","crm"
];
async function hasPremiumAccess(request, secret) {
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 2) return false;
  const [body, signature] = parts;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["verify"]);
  const bytes = Uint8Array.from(atob(signature.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-signature.length%4)%4)), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
  if (!valid) return false;
  try {
    const raw = body.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-body.length%4)%4);
    const payload = JSON.parse(atob(raw));
    return payload.iss === "hr-resume-keyword-matcher" && payload.aud === "premium" && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now()/1000);
  } catch { return false; }
}
const corsHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; frame-ancestors 'none'" };
function response(data, status=200) { return new Response(JSON.stringify(data), {status, headers: corsHeaders}); }
function terms(text) {
  return (text.toLowerCase().match(/[a-z0-9+#.]+(?:[’'-][a-z0-9+#.]+)*/g) || [])
    .map(t => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(t => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}
function phrases(text) {
  const lower = text.toLowerCase();
  return COMMON_SKILLS.filter(s => lower.includes(s));
}
function topKeywords(job, limit=30) {
  const words = terms(job), counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word)||0)+1);
  const skills = phrases(job);
  const ranked = [...counts].map(([term,count])=>({term,count,skill:false,score:count + (term.length > 5 ? .35 : 0)}));
  for (const skill of skills) {
    const existing = ranked.find(x=>x.term===skill);
    if (existing) { existing.skill=true; existing.score += 3; }
    else ranked.push({term:skill,count:1,skill:true,score:4});
  }
  return ranked.sort((a,b)=>b.score-a.score || a.term.localeCompare(b.term)).slice(0,limit).map(({term,skill})=>({term,skill}));
}
function matchOne(job, resume, keywords) {
  const body = resume.text.toLowerCase();
  const found = keywords.filter(k => body.includes(k.term));
  const missing = keywords.filter(k => !body.includes(k.term));
  const coverage = keywords.length ? found.length/keywords.length : 0;
  const jobSkills = phrases(job), resumeSkills = phrases(resume.text);
  const skillCoverage = jobSkills.length ? jobSkills.filter(s=>resumeSkills.includes(s)).length/jobSkills.length : coverage;
  const score = Math.round(Math.max(0, Math.min(100, coverage*65 + skillCoverage*35)));
  return {name: String(resume.name || "Untitled resume").slice(0,120), score, matchedCount: found.length, totalKeywords: keywords.length, skillCoverage: Math.round(skillCoverage*100), matchedKeywords: found.map(x=>x.term), missingKeywords: missing.slice(0,20).map(x=>x.term), matchedSkills: jobSkills.filter(s=>resumeSkills.includes(s)), missingSkills: jobSkills.filter(s=>!resumeSkills.includes(s)), summary: score >= 75 ? "Strong keyword alignment" : score >= 50 ? "Partial keyword alignment" : "Low keyword alignment", note:"Keyword overlap is not a measure of candidate quality. Review the resume and assess job-related evidence directly."};
}
export async function onRequestPost({request,env}) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) return response({error:"Content-Type must be application/json."},415);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return response({error:"Request too large. Reduce the job description or resume text."},413);
  let payload;
  try { const raw = await request.text(); if (raw.length > MAX_BODY) return response({error:"Request too large."},413); payload = JSON.parse(raw); }
  catch { return response({error:"Request body must be valid JSON."},400); }
  const job = typeof payload?.jobDescription === "string" ? payload.jobDescription.trim() : "";
  const resumes = payload?.resumes;
  if (job.length < 30) return response({error:"Add a job description with at least 30 characters."},400);
  if (job.length > MAX_TEXT) return response({error:"Job description is too long (maximum 100,000 characters)."},413);
  if (!Array.isArray(resumes) || resumes.length < 1) return response({error:"Upload or add at least one resume."},400);
  const premium = await hasPremiumAccess(request, env.ACCESS_TOKEN_SECRET);
  if (!premium && resumes.length > 1) return response({error:"The free tier allows one resume per request. Unlock the 24-hour Premium Pass for $5 USD to compare up to 50 resumes at once.",upgradeRequired:true,price:"5.00",currency:"USD"},402);
  if (resumes.length > (premium ? MAX_RESUMES : 1)) return response({error:`Analyze no more than ${premium ? MAX_RESUMES : 1} resumes per request.`},413);
  const valid = [];
  for (let i=0;i<resumes.length;i++) {
    const r = resumes[i];
    if (!r || typeof r.text !== "string" || !r.text.trim()) return response({error:`Resume ${i+1} has no readable text.`},400);
    if (r.text.length > MAX_TEXT) return response({error:`Resume ${i+1} exceeds the 100,000 character limit.`},413);
    valid.push({name: typeof r.name === "string" ? r.name : `Candidate ${i+1}`, text:r.text.trim()});
  }
  const keywords = topKeywords(job);
  const results = valid.map(r=>matchOne(job,r,keywords)).sort((a,b)=>b.score-a.score);
  return response({results, keywords:keywords.map(k=>k.term), processedAt:new Date().toISOString(), privacy:{stored:false, message:"This request is processed in memory only; no database or persistent storage is used."}});
}
export function onRequestGet() { return response({error:"Use POST /api/match."},405); }
