# HR Resume & Keyword Matcher

A stateless resume and keyword matching tool built for Cloudflare Pages and Pages Functions.

## Architecture
- `public/`: responsive static web app.
- `functions/api/match.js`: request-only matching endpoint at `POST /api/match`.
- `functions/api/paypal-config.js`: exposes only the public PayPal Client ID and product display settings.
- `functions/api/paypal-create-order.js`: creates a fixed-price PayPal order server-side.
- `functions/api/paypal-capture-order.js`: captures and validates the PayPal payment, then issues a 24-hour HMAC-signed premium token.
- No database, D1, KV, R2, Durable Objects, cookies, or browser storage.

## Free and Premium
- Free: one resume per matching request.
- Premium: $5 USD one-time payment for a 24-hour pass, allowing up to 50 resumes per matching request.
- The premium token exists in page memory only. Refreshing or closing the page loses it; there is intentionally no token persistence or customer purchase history because no database is used.
- This first release is a one-time 24-hour pass, not a recurring subscription.

## PayPal and Cloudflare setup
In PayPal Developer Dashboard, create a REST API app and copy its Client ID and Secret. Begin with sandbox credentials and test with a sandbox buyer account.

In Cloudflare Dashboard:
1. Open **Workers & Pages** and select this Pages project.
2. Open **Settings → Variables and Secrets** (label may vary).
3. Add `PAYPAL_CLIENT_ID` as a variable.
4. Add `PAYPAL_CLIENT_SECRET` as a secret.
5. Add `ACCESS_TOKEN_SECRET` as a secret. Use a randomly generated value with at least 32 characters; never commit it to GitHub.
6. Set `PAYPAL_MODE` to `sandbox` for testing. Only change it to `live` when you're ready for real payments and have added the matching live Client ID and Secret.
7. Save and redeploy the Pages project so the Functions receive the settings.

All four settings must be configured for the relevant deployment environment. Never put the PayPal Secret or access-token signing secret in frontend code, HTML, README files, or GitHub.

### Test flow
1. Configure sandbox credentials.
2. Open the deployed app and check that PayPal buttons load.
3. Use a PayPal sandbox buyer account to buy the $5.00 pass.
4. Confirm the page reports premium active after capture.
5. Try matching 2 resumes (should work with a valid pass) and then refresh and try again (the in-memory token should be gone).
6. Check PayPal sandbox activity and Cloudflare Pages Functions logs if a request fails.

Only after sandbox testing succeeds should you configure live credentials. PayPal orders are created at a fixed server-defined amount and the server validates the completed capture status, USD currency, amount, and product identifier before granting access.

## Deploy on Cloudflare Pages
- Framework preset: **None**
- Build command: leave blank
- Build output directory: `public`
- Root directory: repository root (`/`)
- Production branch: `main`

Pages Functions in `/functions` deploy automatically with Git integration.

## Use
Paste a job description of at least 30 characters. Add resume text manually or upload TXT files. DOCX/PDF extraction is not included in this build; paste text or convert to TXT first. The app accepts up to 50 resumes per request for premium use.

## Privacy and limitations
Resume text is sent to the matching endpoint for that request and processed in memory only; no persistent storage is configured. Scores reflect keyword overlap, not candidate quality or job performance. Use job-related criteria and human review for every decision.

The no-database design means the app does not retain customer identities, payment history, or tokens after the current page session. Refunds and subscription management are not automated in this one-time-pass version; manage refunds through PayPal.

## API
`POST /api/match` JSON body:
```json
{"jobDescription":"...", "resumes":[{"name":"Candidate A","text":"..."}]}
```
