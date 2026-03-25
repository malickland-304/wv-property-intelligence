# MalickLand System - Master Project Context

## For use with ChatGPT, Perplexity, Claude, or any AI assistant

---

## WHO I AM / BUSINESS CONTEXT

- **Business:** MalickLand - West Virginia Real Estate Agency
- **Website:** malickland.net / malickland.com
- **Location:** Romney, WV (Eastern Panhandle of West Virginia)
- **Focus:** Land, residential, and farm properties in Hampshire County and surrounding Eastern Panhandle counties
- **Email:** <phil@malickland.net>
- **Tech stack:** Google Workspace, Google Drive, Google Sheets, GitHub, Squarespace, Cloudflare, Node.js (via nvm on macOS)
- **AI tools in use:** Claude (primary), ChatGPT, Perplexity, Cursor AI
- **Goal:** Build a fully automated, AI-powered real estate operations platform - run as much as possible through AI and automation

---

## SYSTEM OVERVIEW

This project is a two-part system:

- Project A: WV Property Intelligence Listing Hub
  Role: The product - listing creation, public pages, database, due diligence.
- Project B: AI Operations Hub / MCP Automation Layer
  Role: The engine - workflows, AI routing, automation, prompt management.

**Together they form:** `malickland-system` - a full real estate operating platform built on top of Google Workspace, GitHub, and AI tooling.

---

## UNIFIED FOLDER STRUCTURE

```text
malickland-system/
|
+-- apps/
|   +-- wv-property-intelligence/      <- Project A (listing product)
|       +-- frontend/
|       |   +-- index.html
|       |   +-- listing.html
|       |   +-- admin.html
|       |   +-- styles.css
|       |   +-- app.js
|       +-- backend/
|       |   +-- server.js
|       |   +-- routes/listings.js
|       |   +-- controllers/listingController.js
|       |   +-- services/googleDrive.js
|       |   +-- services/googleSheets.js
|       |   +-- config/auth.js
|       +-- uploads/
|       +-- .env
|       +-- README.md
|
+-- ops/
|   +-- ai-ops-hub/                    <- Project B (operations layer)
|       +-- prompts/
|       |   +-- listing-prompts/
|       |   +-- due-diligence-prompts/
|       |   +-- market-analysis-prompts/
|       |   +-- admin-prompts/
|       +-- mcp/
|       |   +-- servers/
|       |   +-- configs/
|       |   +-- tool-routing/
|       +-- workspace/
|       |   +-- dashboards/
|       |   +-- workflow-guides/
|       |   +-- templates/
|       +-- integrations/
|       |   +-- googleDrive/
|       |   +-- googleSheets/
|       |   +-- github/
|       |   +-- zapier/
|       +-- automation/
|           +-- triggers/
|           +-- pipelines/
|           +-- report-generation/
|           +-- listing-enrichment/
|
+-- shared/
|   +-- templates/
|   +-- schemas/
|   +-- utilities/
|
+-- data/
|   +-- listings/
|   +-- reports/
|   +-- media/
|
+-- config/
```

---

## PROJECT A - WV Property Intelligence Listing Hub

### Listing Hub Purpose

Central hub to create, manage, and analyze property listings focused on WV Eastern Panhandle.

### Listing Hub Core Functions

- Listing creation via admin panel
- Photo upload + Google Drive storage
- Auto-generated public listing pages
- Due diligence reports per property
- Flood + risk analysis
- Google Sheets as database
- AI-ready structure for automation

### Listing Hub Architecture

#### Frontend

- Mobile + desktop web interface
- Public listing pages
- Private admin dashboard

#### Backend

- Node.js / Express API
- Handles form submissions, file uploads, data storage, API endpoints

#### Storage

- Google Drive - images
- Google Sheets - all listing data

### Admin Panel Fields (Full Set)

**Basic Info:** Property Title, Address, City, County, State, ZIP

**Property Details:** Price, Acreage, Property Type (land/residential/farm), Bedrooms, Bathrooms, Square Footage

**Land / Specialty:** Road frontage, Water access, Utilities (multi-select), Terrain (flat/rolling/mountain), Timber/cleared %

**Legal / Tax:** Parcel ID, Deed Book/Page, Annual Taxes

**Description:** Short description, Full marketing description

**Due Diligence:** Flood zone result, Septic status, Well status, Restrictions, HOA (yes/no)

**Media:** Multi-file photo upload, Optional video link

### Photo Upload System

1. Admin uploads photos
2. Backend compresses + renames: `propertyname_1.jpg`
3. Files sent to Google Drive folder: `/Listings/{PropertyName}/`
4. Returned URLs stored in Google Sheets

### Database Structure (Google Sheets - Sheet: Listings)

| Field        | Description        |
|--------------|--------------------|
| ID           | Unique listing ID  |
| Title        | Property name      |
| Address      | Full address       |
| County       | Key for filtering  |
| Price        | Numeric            |
| Acreage      | Numeric            |
| Type         | Land / Home / Farm |
| Description  | Full text          |
| Flood Zone   | Pass / Fail        |
| Utilities    | Stored string      |
| Image URLs   | Comma-separated    |
| Created Date | Timestamp          |

### API Endpoints

| Method | Endpoint          | Action                         |
|--------|-------------------|--------------------------------|
| POST   | /api/listings     | Create listing + upload photos |
| GET    | /api/listings     | Get all listings               |
| GET    | /api/listings/:id | Get single listing             |
| DELETE | /api/listings/:id | Remove listing                 |

### Public Listing Page Displays

- Title, Price, Key stats
- Photo gallery
- Full description
- Due diligence summary
- Map (planned)

### Flood + Risk System

- **Current:** Admin manually enters flood pass/fail + notes
- **Planned:** FEMA / WV flood tool integration, auto-flagging

### Due Diligence Report (Per Listing)

- Property overview
- Flood status
- Utilities summary
- Access details
- Restrictions
- Risk flags

> This is the differentiator vs Zillow/Realtor - investor-grade due diligence at the listing level

### Authentication

- **Current:** Password-protected admin page
- **Upgrade path:** JWT login, role-based access

### End-to-End Workflow

1. Open Admin Panel
2. Enter property data
3. Upload photos
4. Submit -> backend uploads images + stores data
5. Listing goes live on public page
6. Generate due diligence report

### Planned Upgrades

**Immediate:** Image compression, map integration, filter/search listings

**Advanced:** MLS auto-fill, AI valuation tool, buyer lead capture, CRM integration

---

## PROJECT B - AI Operations Hub / MCP Automation Layer

### Operations Hub Purpose

Central hub for AI workflows, MCP tools, automation, prompts, and structured business operations. The engine room behind Project A.

### Operations Hub Core Role

- Runs the workflow behind the listing hub
- Standardizes intake, reports, and AI handoffs
- Connects Claude, ChatGPT, Google Workspace, and GitHub
- Manages prompt libraries and reusable templates
- Handles MCP server configs and tool routing

### Operations Architecture Layers

**Workspace Layer** - Central launch point for listing workflows, report generation, AI tasks, integrations, reusable prompts

**AI Orchestration Layer** - Routes tasks between Claude, ChatGPT, connected tools, and MCP servers

**Automation Layer** - Trigger-based actions, listing analysis, report generation, standardized outputs

**Integration Layer** - Google Drive, Google Sheets, GitHub, MCP servers, future CRM

### Operations Core Functions

### A. Prompt Management

Stores versioned, reusable prompts for: listing descriptions, due diligence summaries, property analysis, admin cleanup, AI review tasks

### B. Workflow Standardization

Repeatable flows for: new listing intake, photo processing, flood/risk review, due diligence reports, AI handoffs

### C. AI Task Routing

Defines what Claude handles vs. ChatGPT vs. automated vs. manual

### D. MCP / Tool Infrastructure

Server configs, connectors, reusable tool chains, secure structured task execution

### Recommended Modules

#### Module 1 - Prompt Library

Master prompts by category: listings, flood analysis, valuation review, marketing copy, admin cleanup

#### Module 2 - Listing Enrichment Pipeline

When a listing is created: pull data -> generate description -> build summary -> attach tags -> prepare due diligence output

#### Module 3 - Report Generator

Turns raw listing data into: client summary, investor summary, due diligence sheet, internal notes

#### Module 4 - AI Review Queue

Feed items to Claude or ChatGPT for cleanup, rewrite, review, or analysis

### Workflows Handled

**Listing Workflow:** Intake prompt -> AI description generation -> tagging -> photo naming -> report formatting

**Due Diligence Workflow:** Flood notes -> utility summary -> restrictions summary -> risk flags -> investor-ready output

**Admin Workflow:** File organization -> naming standards -> task routing by property -> template management

### Best Practices

- **Version prompts** - no `final_final_REALfinal.txt`
- **One naming system** - listings, reports, folders, prompt files
- **Separate lanes** - listing creation, market research, automation, and branding in separate workflows
- **Log outputs** - what was generated, by which tool, when, for which property

### How A + B Relate

| Project A (Product)    | Project B (Operations)           |
|------------------------|----------------------------------|
| Admin dashboard        | Feeds data into Project A        |
| Public listings        | Cleans and enriches outputs      |
| Image storage          | Automates repetitive tasks       |
| Google Sheets DB       | Manages AI prompts/workflows     |
| Due diligence display  | Prepares the system to scale     |

**Without B:** Project A works.

**With B:** Project A scales.

---

## EXISTING TOOLS IN PRODUCTION

### MalickLand Document Manager (malickland-docs.html)

A standalone HTML app already built and in use. Features:

- Dashboard with stats (total docs, active, closed, by type)
- Sidebar navigation by type (Listings, Selling, Possibilities) and status (Active, Closed)
- Full document table with search, filter, sort
- Add/Edit/Delete documents via modal
- Version history / edit log per document
- Google Drive link field per document
- CSV export
- localStorage persistence
- Brand colors: deep forest green (`#1E3A1E`) and warm gold (`#C4A84F`)
- Fonts: Playfair Display (headings) + DM Sans (body) + DM Mono (code/badges)

This tool manages: Listing docs, Selling docs, and Possibility (lead/prospect) docs.

---

## TECH STACK & ENVIRONMENT

| Tool                      | Purpose                                  |
|---------------------------|------------------------------------------|
| Node.js (v20 LTS via nvm) | Backend runtime                          |
| Express                   | API framework                            |
| Google Drive API          | Image storage                            |
| Google Sheets API         | Listing database                         |
| Google Workspace          | Email, Drive, Docs                       |
| GitHub                    | Code repos (private)                     |
| Squarespace               | Public website                           |
| Cloudflare                | DNS, security                            |
| Claude (Anthropic)        | Primary AI - coding, automation, content |
| ChatGPT (OpenAI)          | Secondary AI - review, cross-check       |
| Perplexity                | Research, market data                    |
| Cursor AI                 | Code editor with AI                      |
| macOS                     | Development environment                  |
| nvm                       | Node version management                  |

---

## CONTEXT FOR AI ASSISTANTS

If you are Claude, ChatGPT, Perplexity, or Cursor receiving this document:

**This is Phil's complete project context for MalickLand.**

- The business is a WV real estate agency
- The system being built is a two-part platform: listing hub (Project A) + AI ops layer (Project B)
- The unified repo is `malickland-system`
- All repos are private on GitHub connected to <phil@malickland.net>
- Storage is Google Drive (images) + Google Sheets (data)
- The existing Document Manager (`malickland-docs.html`) is already live/in use
- Node.js must be v18 or v20 LTS - do not use v22+ or experimental versions
- Brand: deep forest green + warm gold, Playfair Display + DM Sans
- Priority: functional, secure, automated, scalable

**Current status:** Both project specs are complete. The next step is producing the Unified Production Spec and beginning the actual build - starting with Project A backend (Node/Express + Google Sheets/Drive integration).

---

## Metadata

- Last updated: March 2026
- Document owner: Phil Malick - <phil@malickland.net>
