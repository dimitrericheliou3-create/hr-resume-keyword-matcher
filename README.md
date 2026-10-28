# HR Resume & Keyword Matcher

A stateless resume screening helper built for Cloudflare Pages and Pages Functions.

## Architecture
- `public/`: responsive static web app.
- `functions/api/match.js`: request-only matching endpoint at `POST /api/match`.
- No database, D1, KV, R2, Durable Objects, cookies, or local storage.
- Matching uses transparent keyword and common-skill overlap. No external AI API key is required.

## Deploy on Cloudflare Pages
- Framework preset: **None**
- Build command: leave blank
- Build output directory: `public`
- Root directory: repository root (`/`)
- Production branch: `main`

Pages Functions in `/functions` deploy automatically with Git integration.

## Use
Paste a job description of at least 30 characters. Add resume text manually or upload TXT files. DOCX/PDF extraction is not included in this simplified web build; paste text or convert to TXT first. The app accepts up to 50 resumes per request.

## Privacy and limitations
Resume text is sent to the matching endpoint for the request and processed in memory only; no persistent storage is configured. Scores reflect keyword overlap, not candidate quality or job performance. Use job-related criteria and human review for every decision.

## API
`POST /api/match` JSON body:
```json
{"jobDescription":"...", "resumes":[{"name":"Candidate A","text":"..."}]}
```
