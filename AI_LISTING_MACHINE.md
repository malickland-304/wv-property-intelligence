# MalickLand AI Listing Machine
## Setup & Usage Guide

---

## What This Does

Every time you create or edit a listing, the system automatically:

1. Pulls all property data from the database
2. Sends ONE structured prompt to OpenAI GPT-4o
3. Receives a complete marketing package in JSON
4. Saves everything to the database + `listing.json`
5. Makes it available via the 🤖 AI button in the admin panel

**Output per listing:**
- MLS description (150–250 words, compliant)
- Investor description (ROI-focused)
- Headline + 5 highlights
- Facebook ad — short + long versions
- Instagram caption + hashtags
- 30–45 sec video script
- Email blast + subject line
- SMS blast (160 chars)
- Landing page hero + sections
- Comps context note
- Search tags

---

## Setup (One Time)

### Step 1 — Run the DB migration

```bash
cd /path/to/wv-property-intelligence/api
node db-migrate-ai.js
# or: npm run migrate:ai
```

This adds `ai_content` and `ai_generated_at` columns to your properties table.

### Step 2 — Get an OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new key → copy it
3. Add to your `.env` file:

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3 — Restart the server

```bash
cd api && npm start
```

That's it. AI content generation is now live.

---

## Cost

- GPT-4o costs roughly **$0.01–0.03 per listing** (input + output)
- For 50 listings/month ≈ **$0.50–$1.50/month total**
- You can switch to `gpt-4o-mini` in `ai-generator.js` (line: `model = 'gpt-4o'`) to cut cost by ~95% with slightly lower quality

---

## How to Use

### Auto-generation (happens automatically)
When you create a new listing via `/admin/new`, the AI runs in the background. Content is ready in ~15 seconds.

### Manual generation / regeneration
1. Go to **Admin → Listings**
2. Click the **🤖 AI** button on any listing
3. Click **Generate Now** or **Regenerate**

### Copy content
Each section in the AI view has a **Copy** button. Click → paste directly into MLS, Facebook, email, etc.

---

## Google Sheets Sync (Optional Enhancement)

To auto-save AI content to Google Sheets, add this to your `google-apps-script.gs`:

### Sheet Structure: `AI_Content` tab

| Column | Field |
|--------|-------|
| A | listing_slug |
| B | address |
| C | headline |
| D | mls_description |
| E | investor_description |
| F | facebook_short |
| G | facebook_long |
| H | instagram_caption |
| I | video_script |
| J | email_subject |
| K | email_blast |
| L | sms_blast |
| M | generated_at |

### Apps Script snippet (add to google-apps-script.gs)

```javascript
function saveAIContentToSheets(listingSlug, address, aiContent) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('AI_Content');
  if (!sheet) {
    sheet = ss.insertSheet('AI_Content');
    sheet.appendRow([
      'Slug','Address','Headline','MLS Description','Investor Pitch',
      'Facebook Short','Facebook Long','Instagram','Video Script',
      'Email Subject','Email Blast','SMS','Generated At'
    ]);
    sheet.getRange(1,1,1,13).setFontWeight('bold');
  }

  // Check if slug exists → update in place
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === listingSlug) { rowIndex = i + 1; break; }
  }

  const row = [
    listingSlug,
    address,
    aiContent.headline || '',
    aiContent.mls_description || '',
    aiContent.investor_description || '',
    aiContent.facebook_short || '',
    aiContent.facebook_long || '',
    aiContent.instagram_caption || '',
    aiContent.video_script || '',
    aiContent.email_subject || '',
    aiContent.email_blast || '',
    aiContent.sms_blast || '',
    new Date().toISOString()
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 13).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}
```

Then call `saveAIContentToSheets()` from your `/api/generate` webhook in the backend.

---

## Test it Now

Use 71 Advent Dr as your first test:
1. Open the listing in `/admin`
2. Click **🤖 AI**
3. Click **Generate Now**
4. Watch the full marketing package appear

---

## .env Variables Required

```env
# Required for AI generation
OPENAI_API_KEY=sk-proj-xxxxxxxx

# Already set (Google integrations)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_GMAIL_USER=malickland@gmail.com
NOTIFICATION_EMAIL=phil@malickland.net
GOOGLE_DRIVE_FOLDER_ID=...

# Admin
ADMIN_PASSWORD=your-secure-password
SESSION_SECRET=your-session-secret
```

---

## Files Added

```
api/
├── ai-generator.js       ← Core AI engine (new)
├── db-migrate-ai.js      ← One-time DB migration (new)
└── server.js             ← Updated: AI import + trigger + routes + admin page
```
