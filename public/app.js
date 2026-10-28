(()=> {
  const $ = (s) => document.querySelector(s);
  let resumes = [], results = [], premiumToken = null, paypalConfig = null;
  const job = $("#jobDescription"), files = $("#files"), list = $("#resumeList"), err = $("#error");
  const paymentStatus = $("#paymentStatus"), paypalButtons = $("#paypalButtons");
  job.addEventListener("input", () => $("#jobCount").textContent = job.value.length + " characters");

  function escape(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function render() {
    list.innerHTML = resumes.map((r,i) => '<div class="resume"><span>'+escape(r.name)+' · '+r.text.length.toLocaleString()+' chars</span><button data-remove="'+i+'" aria-label="Remove resume">×</button></div>').join("") || '<p class="muted">No resumes added yet.</p>';
  }
  function add(name,text) {
    if (!text.trim()) return;
    if (resumes.length >= 50) { err.textContent = "Maximum 50 resumes per request."; return; }
    if (text.length > 100000) { err.textContent = "Resume text exceeds 100,000 characters."; return; }
    resumes.push({name:name.slice(0,120),text:text.trim()}); render();
  }
  files.addEventListener("change", async () => {
    err.textContent = "";
    for (const file of files.files) {
      try {
        if (file.name.toLowerCase().endsWith(".txt")) add(file.name.replace(/\.txt$/i,""), await file.text());
        else err.textContent = "DOCX extraction is not available in this build. Please save as TXT or paste the text.";
      } catch { err.textContent = "Could not read " + file.name; }
    }
    files.value = "";
  });
  list.addEventListener("click", (event) => {
    if (event.target.dataset.remove !== undefined) { resumes.splice(Number(event.target.dataset.remove),1); render(); }
  });
  $("#addCandidate").addEventListener("click", () => {
    err.textContent = "";
    const text = $("#candidateText").value.trim();
    if (!text) { err.textContent = "Paste resume text first."; return; }
    add($("#candidateName").value.trim() || "Candidate " + (resumes.length+1),text);
    $("#candidateName").value = ""; $("#candidateText").value = "";
  });

  function loadPayPalSdk(clientId) {
    return new Promise((resolve,reject) => {
      if (window.paypal) return resolve();
      const script = document.createElement("script");
      script.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) + "&currency=USD&intent=capture";
      script.onload = resolve; script.onerror = () => reject(new Error("PayPal checkout could not load. Check your connection and try again."));
      document.head.appendChild(script);
    });
  }
  async function setupPayments() {
    try {
      const response = await fetch("/api/paypal-config",{cache:"no-store"});
      const config = await response.json();
      if (!response.ok || !config.enabled || !config.clientId) {
        paymentStatus.textContent = "PayPal setup is not complete yet. Add your PayPal credentials in Cloudflare Pages settings.";
        return;
      }
      paypalConfig = config;
      await loadPayPalSdk(config.clientId);
      window.paypal.Buttons({
        style:{layout:"vertical",shape:"rect",label:"paypal"},
        createOrder: async () => {
          paymentStatus.textContent = "Opening secure PayPal checkout…";
          const response = await fetch("/api/paypal-create-order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({})});
          const data = await response.json();
          if (!response.ok || !data.id) throw new Error(data.error || "Could not start checkout.");
          return data.id;
        },
        onApprove: async (data) => {
          paymentStatus.textContent = "Confirming your payment securely…";
          const response = await fetch("/api/paypal-capture-order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId:data.orderID})});
          const result = await response.json();
          if (!response.ok || !result.ok || !result.premiumToken) throw new Error(result.error || "Payment could not be verified.");
          premiumToken = result.premiumToken;
          paymentStatus.textContent = "Premium is active in this open page until " + new Date(result.expiresAt).toLocaleString() + ". Keep this tab open; refreshing loses the token.";
          paymentStatus.classList.add("is-active");
          err.textContent = "";
        },
        onCancel: () => { paymentStatus.textContent = "Checkout cancelled. You can still use the free tier."; },
        onError: (error) => { paymentStatus.textContent = "PayPal checkout failed. Please try again."; err.textContent = error?.message || "PayPal checkout failed."; }
      }).render("#paypalButtons");
      paymentStatus.textContent = "Pay securely with PayPal. Premium access lasts 24 hours in this open page.";
    } catch (error) {
      paymentStatus.textContent = "PayPal checkout could not initialize. " + (error.message || "");
    }
  }

  $("#matchButton").addEventListener("click", async () => {
    err.textContent = "";
    if (job.value.trim().length < 30) { err.textContent = "Enter a job description with at least 30 characters."; return; }
    if (!resumes.length) { err.textContent = "Add at least one resume."; return; }
    if (!premiumToken && resumes.length > 1) {
      err.textContent = "The free tier allows one resume per request. Use the $5 USD Premium Pass above to compare up to 50 resumes.";
      $("#premiumHeading").scrollIntoView({behavior:"smooth",block:"center"}); return;
    }
    const button = $("#matchButton"); button.disabled = true; button.textContent = "Matching…";
    try {
      const headers = {"content-type":"application/json"};
      if (premiumToken) headers.authorization = "Bearer " + premiumToken;
      const response = await fetch("/api/match",{method:"POST",headers,body:JSON.stringify({jobDescription:job.value,resumes})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Matching failed");
      results = data.results;
      $("#metrics").innerHTML = '<div class="metric"><small>Resumes compared</small><strong>'+results.length+'</strong></div><div class="metric"><small>Average match</small><strong>'+Math.round(results.reduce((sum,r)=>sum+r.score,0)/results.length)+'%</strong></div><div class="metric"><small>Strong alignment</small><strong>'+results.filter(r=>r.score>=75).length+'</strong></div>';
      $("#resultsBody").innerHTML = results.map((r,i) => '<tr><td>'+escape(r.name)+'</td><td><b>'+r.score+'%</b></td><td>'+r.matchedCount+' / '+r.totalKeywords+'</td><td>'+r.skillCoverage+'%</td><td>'+escape(r.summary)+'</td><td><button class="secondary" data-detail="'+i+'">Details</button></td></tr>').join("");
      $("#results").hidden = false; $("#results").scrollIntoView({behavior:"smooth"});
    } catch (error) { err.textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Match resumes →"; }
  });
  $("#resultsBody").addEventListener("click", (event) => {
    if (event.target.dataset.detail === undefined) return;
    const result = results[Number(event.target.dataset.detail)], detail = $("#detail");
    detail.hidden = false;
    detail.innerHTML = '<h3>'+escape(result.name)+' — keyword evidence</h3><p>'+escape(result.note)+'</p><h4>Matched keywords</h4><p>'+result.matchedKeywords.map(escape).join(", ")+'</p><h4>Missing keywords</h4><p>'+result.missingKeywords.map(escape).join(", ")+'</p><h4>Matched skills</h4><p>'+result.matchedSkills.map(escape).join(", ")+'</p><h4>Skills not found</h4><p>'+result.missingSkills.map(escape).join(", ")+'</p>';
  });
  $("#exportCsv").addEventListener("click", () => {
    const rows = [["Candidate","Score","Matched keywords","Missing keywords","Skill coverage"],...results.map(r=>[r.name,r.score+"%",r.matchedKeywords.join("; "),r.missingKeywords.join("; "),r.skillCoverage+"%"])];
    const csv = rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
    anchor.download = "resume-match-results.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
  });
  render(); setupPayments();
})();