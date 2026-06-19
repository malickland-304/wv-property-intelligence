# Document Registry Spec — Phase 1

> Status: Phase 1 specification complete. This is a build contract, not an implementation.
> Scope: SQLite registry for property documents, human approval states, integration events, and AI-extracted claims.
> Non-goals: automatic Google Drive sync, Gmail intake, AI review UI, schema migration, and production deploy.

---

## Purpose

The Document Registry gives MalickLand one governed place to track source documents that support listing facts, due-diligence notes, marketing claims, and future AI extraction.

It must answer four questions:

1. What source document exists, and where is the authoritative file stored?
2. Which version of that document is current?
3. Which facts or claims were extracted from it?
4. Who approved, rejected, superseded, or used those claims?

Google Drive remains the authority for original files. SQLite stores metadata, approval state, extracted structured facts, and audit history.

---

## Data Authority

| Data | Authority |
|------|-----------|
| Original binary files | Google Drive or local upload storage, referenced by URL or provider ID. |
| Registry metadata | SQLite. |
| Extracted claims | SQLite, pending human approval before they can update listing fields or public copy. |
| Current listing facts | Existing `properties` table until a later implementation explicitly applies approved claims. |
| Compliance copy | Human-approved repo copy and current public pages. AI output is never authority by itself. |

---

## Phase 1 Tables

Implementation should add these tables through `api/db.js` migrations and mirror them in `database/schema.sql`.

### `documents`

Logical document record. One row per source artifact.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | Random hex or UUID-style ID. |
| `property_id` | TEXT NULL | References `properties(id)` with `ON DELETE SET NULL`. |
| `title` | TEXT NOT NULL | Human-readable title. |
| `document_type` | TEXT NOT NULL | Controlled value listed below. |
| `source_provider` | TEXT NOT NULL DEFAULT `'manual'` | `manual`, `google_drive`, `gmail`, `api`, `system`. |
| `source_uri` | TEXT NULL | Drive URL, Gmail thread URL, local file path, or external reference. |
| `source_external_id` | TEXT NULL | Provider-specific file/message ID. |
| `status` | TEXT NOT NULL DEFAULT `'draft'` | See state machine. |
| `current_version_id` | TEXT NULL | Points to latest accepted or active version. |
| `created_by` | TEXT NULL | Actor label, not a secret. |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Creation timestamp. |
| `updated_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Update timestamp. |

Recommended `document_type` values: `deed`, `plat`, `survey`, `tax_card`, `disclosure`, `contract`, `listing_agreement`, `inspection`, `photo_release`, `utility`, `hoa_or_restrictions`, `seller_note`, `buyer_note`, `marketing_source`, `other`.

Indexes:

- `idx_documents_property_id`
- `idx_documents_status`
- `idx_documents_type`
- unique partial index on `(source_provider, source_external_id)` where `source_external_id IS NOT NULL`

### `document_versions`

Immutable metadata for each file revision.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | Random hex or UUID-style ID. |
| `document_id` | TEXT NOT NULL | References `documents(id)` with `ON DELETE CASCADE`. |
| `version_number` | INTEGER NOT NULL | Starts at 1, increments per document. |
| `file_name` | TEXT NOT NULL | Display name. |
| `mime_type` | TEXT NULL | Example: `application/pdf`, `image/jpeg`. |
| `file_size_bytes` | INTEGER NULL | Size when known. |
| `sha256` | TEXT NULL | Optional integrity hash. |
| `storage_uri` | TEXT NOT NULL | Drive URL, local path, or provider reference. |
| `storage_external_id` | TEXT NULL | Drive file ID or equivalent. |
| `ocr_text` | TEXT NULL | Optional extracted raw text. |
| `ocr_status` | TEXT NOT NULL DEFAULT `'not_started'` | `not_started`, `pending`, `complete`, `failed`. |
| `approval_status` | TEXT NOT NULL DEFAULT `'pending_review'` | See state machine. |
| `approved_by` | TEXT NULL | Human actor label. |
| `approved_at` | TEXT NULL | Approval timestamp. |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Version creation timestamp. |

Constraints and indexes:

- unique `(document_id, version_number)`
- `idx_document_versions_document_id`
- `idx_document_versions_approval_status`
- unique partial index on `sha256` where `sha256 IS NOT NULL`

### `extracted_claims`

AI- or rule-extracted facts. Claims are not authoritative until approved.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | Random hex or UUID-style ID. |
| `document_id` | TEXT NOT NULL | References `documents(id)` with `ON DELETE CASCADE`. |
| `document_version_id` | TEXT NOT NULL | References `document_versions(id)` with `ON DELETE CASCADE`. |
| `property_id` | TEXT NULL | References `properties(id)` with `ON DELETE SET NULL`. |
| `claim_type` | TEXT NOT NULL | Controlled field name, such as `parcel_id` or `annual_tax`. |
| `claim_value_json` | TEXT NOT NULL | JSON-encoded value. |
| `source_quote` | TEXT NULL | Short supporting excerpt only. |
| `source_location_json` | TEXT NULL | JSON location hint: page, line, coordinates, cell, email part. |
| `confidence` | REAL NULL | 0.0 to 1.0. Not an approval substitute. |
| `status` | TEXT NOT NULL DEFAULT `'pending_review'` | See state machine. |
| `reviewed_by` | TEXT NULL | Human actor label. |
| `reviewed_at` | TEXT NULL | Review timestamp. |
| `review_note` | TEXT NULL | Human reason or correction note. |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Creation timestamp. |

Indexes: `document_id`, `property_id`, `status`, and `claim_type`.

### `integration_events`

External-system event log.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | Random hex or UUID-style ID. |
| `provider` | TEXT NOT NULL | `google_drive`, `gmail`, `ocr`, `ai_extraction`, `api`, `system`. |
| `event_type` | TEXT NOT NULL | Example: `file_imported`, `message_received`, `extraction_completed`. |
| `document_id` | TEXT NULL | References `documents(id)` with `ON DELETE SET NULL`. |
| `document_version_id` | TEXT NULL | References `document_versions(id)` with `ON DELETE SET NULL`. |
| `external_id` | TEXT NULL | Provider event/file/message ID. |
| `status` | TEXT NOT NULL DEFAULT `'recorded'` | `recorded`, `processed`, `failed`, `ignored`. |
| `payload_json` | TEXT NULL | Redacted metadata only; no secrets. |
| `error_message` | TEXT NULL | Failure detail safe for logs. |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Event timestamp. |

Indexes: provider/type, document ID, and external ID.

### `audit_events`

Internal audit trail for registry changes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | Random hex or UUID-style ID. |
| `actor` | TEXT NOT NULL | `admin`, `api`, `system`, or user label. |
| `action` | TEXT NOT NULL | Example: `document.created`, `claim.approved`. |
| `entity_type` | TEXT NOT NULL | `document`, `document_version`, `extracted_claim`, `integration_event`. |
| `entity_id` | TEXT NOT NULL | Target ID. |
| `before_json` | TEXT NULL | Redacted previous state. |
| `after_json` | TEXT NULL | Redacted new state. |
| `reason` | TEXT NULL | Human reason or system explanation. |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Event timestamp. |

Indexes: entity, actor, and created timestamp.

---

## Approval State Machines

### Document State

Allowed `documents.status` values: `draft`, `active`, `superseded`, `archived`, `rejected`.

| From | To | Rule |
|------|----|------|
| `draft` | `active` | At least one version exists. |
| `draft` | `rejected` | Reason required. |
| `active` | `superseded` | New active replacement exists. |
| `active` | `archived` | No longer relevant; preserve audit. |
| `superseded` | `archived` | Cleanup only. |
| `rejected` | `archived` | Cleanup only. |

### Document Version State

Allowed `document_versions.approval_status` values: `pending_review`, `approved`, `rejected`, `superseded`.

| From | To | Rule |
|------|----|------|
| `pending_review` | `approved` | Human review required. Sets `approved_by`, `approved_at`, and `documents.current_version_id`. |
| `pending_review` | `rejected` | Human review required. Reason recommended. |
| `approved` | `superseded` | New approved version replaces it. |
| `rejected` | `pending_review` | Only after corrected file metadata or OCR; audit reason required. |

### Extracted Claim State

Allowed `extracted_claims.status` values: `pending_review`, `approved`, `rejected`, `superseded`, `applied`.

| From | To | Rule |
|------|----|------|
| `pending_review` | `approved` | Human confirms value and support. |
| `pending_review` | `rejected` | Human rejects value or support. |
| `approved` | `applied` | Claim has been used to update a listing field, document summary, or public copy in a separate audited action. |
| `approved` | `superseded` | Newer claim replaces it. |
| `applied` | `superseded` | Corrected claim replaces it; implementation must not silently mutate public facts. |

AI confidence never authorizes `approved` or `applied`. Human review is required.

---

## API Contract Skeleton

Implementation should add a new router under `/api/documents`. Mutating routes require API key auth at minimum. Admin UI routes can be added later.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/documents` | API key | List documents with filters: `property_id`, `status`, `document_type`. |
| `GET` | `/api/documents/review/claims` | API key | List extracted claims by review status for the human review queue. Defaults to `pending_review`; supports `status`, `property_id`, `claim_type`, `document_type`, and `limit`; property filtering falls back to the document property when the claim was extracted before the document was linked; rejected/superseded source versions are excluded. |
| `GET` | `/api/documents/integration-events` | API key | List sanitized integration events with filters: `provider`, `event_type`, `status`, `document_id`, `document_version_id`, `external_id`, and `limit`. |
| `POST` | `/api/documents/integration-events` | API key | Record a sanitized external event from Drive/Gmail/OCR/AI/system automation. This is event capture only; it does not create Google watches or fetch external files. |
| `POST` | `/api/documents` | API key | Create a logical document. |
| `GET` | `/api/documents/:id` | API key | Read document, current version, versions, and claims. |
| `PATCH` | `/api/documents/:id` | API key | Update title/type/status metadata. |
| `POST` | `/api/documents/:id/versions` | API key | Register a new version. Upload handling can be separate. |
| `POST` | `/api/documents/:id/versions/:versionId/approve` | API key | Approve a version and set current version. |
| `POST` | `/api/documents/:id/versions/:versionId/reject` | API key | Reject a version. |
| `POST` | `/api/documents/:id/claims` | API key | Insert extracted claims from AI/rules. |
| `POST` | `/api/documents/:id/claims/:claimId/approve` | API key | Approve a claim. |
| `POST` | `/api/documents/:id/claims/:claimId/reject` | API key | Reject a claim. |
| `GET` | `/api/documents/:id/audit` | API key | Read audit events for one document. |

Response shape should use JSON only and must not expose secrets, OAuth tokens, or raw provider credentials.

---

## AI Extraction JSON Contract

AI extraction must produce a strict object. The implementation should validate shape before writing `extracted_claims`.

```json
{
  "document_id": "doc_123",
  "document_version_id": "ver_123",
  "model": "provider/model-name",
  "extraction_started_at": "2026-06-18T00:00:00Z",
  "claims": [
    {
      "claim_type": "parcel_id",
      "value": "14-09-012B-0096-0000",
      "value_type": "string",
      "source_quote": "Parcel 14-09-012B-0096-0000",
      "source_location": {
        "page": 1,
        "section": "Tax parcel"
      },
      "confidence": 0.92,
      "notes": "Short support note."
    }
  ],
  "warnings": [
    {
      "code": "low_ocr_quality",
      "message": "OCR was incomplete on page 2."
    }
  ]
}
```

Allowed `value_type` values: `string`, `number`, `boolean`, `date`, `money`, `area`, `list`, `object`.

Recommended `claim_type` values for Phase 1: `address`, `parcel_id`, `acreage`, `annual_tax`, `tax_assessed`, `owner_name`, `road_access`, `utility`, `water_source`, `septic`, `flood_zone`, `zoning`, `restriction`, `easement`, `mineral_rights`, `school_district`, `listing_price`, `sale_price`, `close_date`, `disclosure_item`, `marketing_claim`.

Validation rules:

1. `claims` must be an array.
2. Every claim must have `claim_type`, `value`, `value_type`, and `confidence`.
3. `confidence` must be between 0 and 1.
4. `source_quote` must be short enough for audit display and copyright safety.
5. Unknown `claim_type` values are allowed only as `other:<name>`.
6. AI output must never directly update `properties` or public HTML.

---

## Security And Privacy Requirements

- No secrets in `payload_json`, `before_json`, `after_json`, OCR text, or claim notes.
- Mutating registry routes require API key or admin session plus CSRF, depending on mounting path.
- Public read access is out of scope for Phase 1.
- File paths and provider IDs must be treated as untrusted input.
- Claims derived from AI remain non-authoritative until approved.
- Audit rows are append-only from the application perspective.
- Deleting a document should be soft-delete/archive unless a legal or privacy reason requires hard deletion.

---

## Implementation Acceptance Criteria

A future implementation PR should satisfy all of these:

1. Tables exist in `api/db.js` migrations and `database/schema.sql`.
2. CRUD API skeleton for `/api/documents` exists behind API-key protection.
3. State transition helpers reject invalid transitions.
4. Every create/update/approve/reject action writes an `audit_events` row.
5. AI extraction payloads are validated before insertion.
6. Tests cover schema creation, document/version creation, invalid transitions, claim approval/rejection, and audit rows.
7. `bash scripts/preflight.sh` and `node tests/verify-security-fixes.test.js` pass.
8. No production deploy is implied by merge.

---

## Phase Boundaries

| Phase | Scope |
|-------|-------|
| Phase 1 spec | This document: schema, state machine, AI JSON contract, API skeleton. |
| Phase 1 implementation | SQLite tables, helpers, API skeleton, tests. |
| Phase 2 AI Review Queue | Review-queue API for extracted claims, read-only admin UI for reviewing claims, and audited application of approved facts. The queue API is implemented at `/api/documents/review/claims`; the admin review page is implemented at `/admin/document-claims`; approved, mapped claims can be applied through `/admin/document-claims/:claimId/apply`. |
| Phase 3 Drive event automation | Drive watch/import pipeline into `documents` and `document_versions`; integration event capture is available at `/api/documents/integration-events` as the safe ingest foundation. |
| Phase 4 Gmail intake | Email attachment/message ingestion into the registry. |
