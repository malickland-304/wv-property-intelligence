'use strict';

const express = require('express');
const crypto = require('crypto');

const DOCUMENT_TYPES = new Set([
  'deed', 'plat', 'survey', 'tax_card', 'disclosure', 'contract',
  'listing_agreement', 'inspection', 'photo_release', 'utility',
  'hoa_or_restrictions', 'seller_note', 'buyer_note', 'marketing_source',
  'other',
]);

const SOURCE_PROVIDERS = new Set(['manual', 'google_drive', 'gmail', 'api', 'system']);
const INTEGRATION_EVENT_PROVIDERS = new Set(['google_drive', 'gmail', 'ocr', 'ai_extraction', 'api', 'system']);
const INTEGRATION_EVENT_STATUSES = new Set(['recorded', 'processed', 'failed', 'ignored']);
const DOCUMENT_STATUSES = new Set(['draft', 'active', 'superseded', 'archived', 'rejected']);
const VERSION_APPROVAL_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'superseded']);
const CLAIM_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'superseded', 'applied']);
const CLAIM_VALUE_TYPES = new Set(['string', 'number', 'boolean', 'date', 'money', 'area', 'list', 'object']);
const CLAIM_TYPES = new Set([
  'address', 'parcel_id', 'acreage', 'annual_tax', 'tax_assessed', 'owner_name',
  'road_access', 'utility', 'water_source', 'septic', 'flood_zone', 'zoning',
  'restriction', 'easement', 'mineral_rights', 'school_district', 'listing_price',
  'sale_price', 'close_date', 'disclosure_item', 'marketing_claim',
]);

const DOCUMENT_TRANSITIONS = {
  draft: new Set(['active', 'rejected']),
  active: new Set(['superseded', 'archived']),
  superseded: new Set(['archived']),
  archived: new Set([]),
  rejected: new Set(['archived']),
};

function createDocumentsRouter({ db }) {
  const router = express.Router();

  const insertAudit = db.prepare(`
    INSERT INTO audit_events (id,actor,action,entity_type,entity_id,before_json,after_json,reason)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const selectIntegrationEvent = db.prepare('SELECT * FROM integration_events WHERE id=?');
  const selectDocument = db.prepare('SELECT * FROM documents WHERE id=?');
  const selectVersion = db.prepare('SELECT * FROM document_versions WHERE id=?');
  const selectClaim = db.prepare('SELECT * FROM extracted_claims WHERE id=?');

  function makeId(prefix) {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  function cleanString(value, max = 500) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, max);
  }

  function actorFrom(req) {
    return cleanString(req.body && (req.body.actor || req.body.reviewed_by || req.body.approved_by), 80)
      || cleanString(req.get('x-actor'), 80)
      || 'api';
  }

  function auditSafe(row) {
    if (!row) return null;
    const copy = { ...row };
    for (const key of [
      'source_uri',
      'source_external_id',
      'storage_uri',
      'storage_external_id',
      'ocr_text',
      'claim_value_json',
      'source_quote',
      'source_location_json',
      'review_note',
    ]) {
      if (copy[key] != null) copy[key] = '[redacted]';
    }
    return copy;
  }

  function writeAudit({ actor, action, entityType, entityId, before, after, reason }) {
    insertAudit.run(
      makeId('audit'),
      actor,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(auditSafe(before)) : null,
      after ? JSON.stringify(auditSafe(after)) : null,
      cleanString(reason, 500)
    );
  }

  function getDocument(id) {
    return selectDocument.get(id);
  }

  function getIntegrationEvent(id) {
    return selectIntegrationEvent.get(id);
  }

  function getVersion(id) {
    return selectVersion.get(id);
  }

  function getClaim(id) {
    return selectClaim.get(id);
  }

  function requireDocument(req, res) {
    const document = getDocument(req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return null;
    }
    return document;
  }

  function ensureKnown(value, allowed, label) {
    if (!value || !allowed.has(value)) return `${label} is invalid`;
    return null;
  }

  function ensureDocumentTransition(document, nextStatus) {
    if (document.status === nextStatus) return null;
    if (!DOCUMENT_STATUSES.has(nextStatus)) return 'status is invalid';
    if (!DOCUMENT_TRANSITIONS[document.status] || !DOCUMENT_TRANSITIONS[document.status].has(nextStatus)) {
      return `Invalid document status transition: ${document.status} -> ${nextStatus}`;
    }
    if (document.status === 'draft' && nextStatus === 'active') {
      const versionCount = db.prepare('SELECT COUNT(*) AS c FROM document_versions WHERE document_id=?').get(document.id).c;
      if (versionCount === 0) return 'Document needs at least one version before it can become active.';
    }
    return null;
  }

  function ensureVersionTransition(version, nextStatus) {
    if (!VERSION_APPROVAL_STATUSES.has(nextStatus)) return 'approval_status is invalid';
    if (version.approval_status === nextStatus) return null;
    if (version.approval_status === 'pending_review' && ['approved', 'rejected'].includes(nextStatus)) return null;
    if (version.approval_status === 'approved' && nextStatus === 'superseded') return null;
    if (version.approval_status === 'rejected' && nextStatus === 'pending_review') return null;
    return `Invalid version approval transition: ${version.approval_status} -> ${nextStatus}`;
  }

  function ensureClaimTransition(claim, nextStatus) {
    if (!CLAIM_STATUSES.has(nextStatus)) return 'status is invalid';
    if (claim.status === nextStatus) return null;
    if (claim.status === 'pending_review' && ['approved', 'rejected'].includes(nextStatus)) return null;
    if (claim.status === 'approved' && ['applied', 'superseded'].includes(nextStatus)) return null;
    if (claim.status === 'applied' && nextStatus === 'superseded') return null;
    return `Invalid claim status transition: ${claim.status} -> ${nextStatus}`;
  }

  function validateDocumentInput(body, partial = false) {
    const title = cleanString(body.title, 200);
    const documentType = cleanString(body.document_type, 80);
    const sourceProvider = cleanString(body.source_provider, 40) || 'manual';
    const status = cleanString(body.status, 40) || 'draft';

    if (!partial || body.title != null) {
      if (!title) return { error: 'title is required' };
    }
    if (!partial || body.document_type != null) {
      const err = ensureKnown(documentType, DOCUMENT_TYPES, 'document_type');
      if (err) return { error: err };
    }
    if (body.source_provider != null || !partial) {
      const err = ensureKnown(sourceProvider, SOURCE_PROVIDERS, 'source_provider');
      if (err) return { error: err };
    }
    if (body.status != null || !partial) {
      const err = ensureKnown(status, DOCUMENT_STATUSES, 'status');
      if (err) return { error: err };
    }

    return {
      values: {
        title,
        document_type: documentType,
        source_provider: sourceProvider,
        source_uri: cleanString(body.source_uri, 2048),
        source_external_id: cleanString(body.source_external_id, 300),
        status,
        property_id: cleanString(body.property_id, 80),
        created_by: cleanString(body.created_by, 80),
      },
    };
  }

  function validateClaimInput(raw) {
    const claimType = cleanString(raw.claim_type, 120);
    const valueType = cleanString(raw.value_type, 40);
    const confidence = Number(raw.confidence);
    const quote = cleanString(raw.source_quote, 500);

    if (!claimType) return { error: 'claim_type is required' };
    if (!CLAIM_TYPES.has(claimType) && !claimType.startsWith('other:')) {
      return { error: 'Unknown claim_type values must use other:<name>.' };
    }
    if (!valueType || !CLAIM_VALUE_TYPES.has(valueType)) return { error: 'value_type is invalid' };
    if (!Object.prototype.hasOwnProperty.call(raw, 'value')) return { error: 'value is required' };
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { error: 'confidence must be between 0 and 1' };
    }
    if (raw.source_quote && String(raw.source_quote).length > 500) {
      return { error: 'source_quote must be 500 characters or fewer' };
    }

    let sourceLocationJson = null;
    if (raw.source_location != null) {
      try {
        sourceLocationJson = JSON.stringify(raw.source_location);
      } catch (_) {
        return { error: 'source_location must be JSON serializable' };
      }
    }

    return {
      values: {
        claim_type: claimType,
        claim_value_json: JSON.stringify(raw.value),
        source_quote: quote,
        source_location_json: sourceLocationJson,
        confidence,
      },
    };
  }

  function redactIntegrationPayload(value) {
    if (Array.isArray(value)) return value.map(redactIntegrationPayload);
    if (!value || typeof value !== 'object') return value;
    const redacted = {};
    for (const [key, child] of Object.entries(value)) {
      if (/token|secret|authorization|credential|password|cookie|source_uri|storage_uri/i.test(key)) {
        redacted[key] = '[redacted]';
      } else {
        redacted[key] = redactIntegrationPayload(child);
      }
    }
    return redacted;
  }

  function validateIntegrationEventInput(body) {
    const provider = cleanString(body.provider, 40);
    const eventType = cleanString(body.event_type, 120);
    const status = cleanString(body.status, 40) || 'recorded';

    const providerErr = ensureKnown(provider, INTEGRATION_EVENT_PROVIDERS, 'provider');
    if (providerErr) return { error: providerErr };
    if (!eventType) return { error: 'event_type is required' };
    const statusErr = ensureKnown(status, INTEGRATION_EVENT_STATUSES, 'status');
    if (statusErr) return { error: statusErr };

    let payloadJson = null;
    if (body.payload != null) {
      try {
        payloadJson = JSON.stringify(redactIntegrationPayload(body.payload));
      } catch (_) {
        return { error: 'payload must be JSON serializable' };
      }
    }

    return {
      values: {
        provider,
        event_type: eventType,
        document_id: cleanString(body.document_id, 120),
        document_version_id: cleanString(body.document_version_id, 120),
        external_id: cleanString(body.external_id, 300),
        status,
        payload_json: payloadJson,
        error_message: cleanString(body.error_message, 500),
      },
    };
  }

  function parseJsonField(raw, fallback = null) {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function claimForReview(row) {
    return {
      id: row.id,
      document_id: row.document_id,
      document_version_id: row.document_version_id,
      property_id: row.effective_property_id,
      claim_property_id: row.claim_property_id,
      document_property_id: row.document_property_id,
      property_label: [row.property_address, row.property_city].filter(Boolean).join(', ') || null,
      document_title: row.document_title,
      document_type: row.document_type,
      document_status: row.document_status,
      version_number: row.version_number,
      version_approval_status: row.version_approval_status,
      file_name: row.file_name,
      claim_type: row.claim_type,
      value: parseJsonField(row.claim_value_json),
      source_quote: row.source_quote,
      source_location: parseJsonField(row.source_location_json),
      confidence: row.confidence,
      status: row.status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      review_note: row.review_note,
      created_at: row.created_at,
    };
  }

  router.get('/', (req, res) => {
    const conditions = [];
    const values = [];
    for (const [key, column] of [
      ['property_id', 'property_id'],
      ['status', 'status'],
      ['document_type', 'document_type'],
    ]) {
      if (req.query[key]) {
        conditions.push(`${column}=?`);
        values.push(String(req.query[key]));
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const documents = db.prepare(`
      SELECT id, property_id, title, document_type, source_provider, status,
             current_version_id, created_by, created_at, updated_at
      FROM documents
      ${where}
      ORDER BY updated_at DESC, created_at DESC
    `).all(...values);
    res.json({ documents });
  });

  router.get('/review/claims', (req, res) => {
    const status = cleanString(req.query.status, 40) || 'pending_review';
    if (!CLAIM_STATUSES.has(status)) return res.status(400).json({ error: 'status is invalid' });

    const conditions = ['c.status=?'];
    const values = [status];
    const filters = { status };
    const propertyId = cleanString(req.query.property_id, 120);
    if (propertyId) {
      filters.property_id = propertyId;
      conditions.push('COALESCE(c.property_id, d.property_id)=?');
      values.push(propertyId);
    }
    const claimType = cleanString(req.query.claim_type, 120);
    if (claimType) {
      filters.claim_type = claimType;
      conditions.push('c.claim_type=?');
      values.push(claimType);
    }
    const documentType = cleanString(req.query.document_type, 120);
    if (documentType) {
      filters.document_type = documentType;
      conditions.push('d.document_type=?');
      values.push(documentType);
    }

    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 100)
      : 50;
    filters.limit = limit;

    const claims = db.prepare(`
      SELECT
        c.id, c.document_id, c.document_version_id,
        c.property_id AS claim_property_id,
        d.property_id AS document_property_id,
        COALESCE(c.property_id, d.property_id) AS effective_property_id,
        c.claim_type,
        c.claim_value_json, c.source_quote, c.source_location_json,
        c.confidence, c.status, c.reviewed_by, c.reviewed_at, c.review_note, c.created_at,
        d.title AS document_title, d.document_type, d.status AS document_status,
        v.version_number, v.file_name, v.approval_status AS version_approval_status,
        p.address AS property_address, p.city AS property_city
      FROM extracted_claims c
      JOIN documents d ON d.id = c.document_id
      JOIN document_versions v ON v.id = c.document_version_id
      LEFT JOIN properties p ON p.id = COALESCE(c.property_id, d.property_id)
      WHERE ${conditions.join(' AND ')}
        AND v.approval_status NOT IN ('rejected', 'superseded')
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ?
    `).all(...values, limit).map(claimForReview);

    res.json({ claims, filters });
  });

  router.post('/', (req, res) => {
    const validated = validateDocumentInput(req.body || {});
    if (validated.error) return res.status(400).json({ error: validated.error });
    const f = validated.values;
    if (f.status !== 'draft') return res.status(400).json({ error: 'New documents must start in draft status.' });
    const id = makeId('doc');
    try {
      db.prepare(`
        INSERT INTO documents (
          id, property_id, title, document_type, source_provider, source_uri,
          source_external_id, status, created_by
        ) VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        id,
        f.property_id,
        f.title,
        f.document_type,
        f.source_provider,
        f.source_uri,
        f.source_external_id,
        f.status,
        f.created_by
      );
      const row = getDocument(id);
      writeAudit({
        actor: actorFrom(req),
        action: 'document.created',
        entityType: 'document',
        entityId: id,
        after: row,
        reason: req.body.reason,
      });
      res.status(201).json(row);
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Document source_external_id already exists for provider.' });
      }
      if (err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(400).json({ error: 'property_id does not exist.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  router.get('/integration-events', (req, res) => {
    const conditions = [];
    const values = [];
    const filters = {};
    for (const [key, column] of [
      ['provider', 'provider'],
      ['event_type', 'event_type'],
      ['status', 'status'],
      ['document_id', 'document_id'],
      ['document_version_id', 'document_version_id'],
      ['external_id', 'external_id'],
    ]) {
      const value = cleanString(req.query[key], 300);
      if (!value) continue;
      if (key === 'provider' && !INTEGRATION_EVENT_PROVIDERS.has(value)) {
        return res.status(400).json({ error: 'provider is invalid' });
      }
      if (key === 'status' && !INTEGRATION_EVENT_STATUSES.has(value)) {
        return res.status(400).json({ error: 'status is invalid' });
      }
      filters[key] = value;
      conditions.push(`${column}=?`);
      values.push(value);
    }

    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 100)
      : 50;
    filters.limit = limit;

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const events = db.prepare(`
      SELECT id, provider, event_type, document_id, document_version_id, external_id,
             status, payload_json, error_message, created_at
      FROM integration_events
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...values, limit);
    res.json({ events, filters });
  });

  router.post('/integration-events', (req, res) => {
    const validated = validateIntegrationEventInput(req.body || {});
    if (validated.error) return res.status(400).json({ error: validated.error });
    const f = validated.values;
    const id = makeId('evt');
    try {
      db.prepare(`
        INSERT INTO integration_events (
          id, provider, event_type, document_id, document_version_id, external_id,
          status, payload_json, error_message
        ) VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        id,
        f.provider,
        f.event_type,
        f.document_id,
        f.document_version_id,
        f.external_id,
        f.status,
        f.payload_json,
        f.error_message
      );
      const row = getIntegrationEvent(id);
      writeAudit({
        actor: actorFrom(req),
        action: 'integration_event.recorded',
        entityType: 'integration_event',
        entityId: id,
        after: row,
        reason: req.body.reason,
      });
      res.status(201).json(row);
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(400).json({ error: 'document_id or document_version_id does not exist.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to record integration event' });
    }
  });

  router.get('/:id', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const versions = db.prepare(`
      SELECT id, document_id, version_number, file_name, mime_type, file_size_bytes,
             sha256, storage_uri, storage_external_id, ocr_status, approval_status,
             approved_by, approved_at, created_at
      FROM document_versions
      WHERE document_id=?
      ORDER BY version_number DESC
    `).all(document.id);
    const claims = db.prepare(`
      SELECT id, document_id, document_version_id, property_id, claim_type, claim_value_json,
             source_quote, source_location_json, confidence, status, reviewed_by,
             reviewed_at, review_note, created_at
      FROM extracted_claims
      WHERE document_id=?
      ORDER BY created_at DESC
    `).all(document.id);
    const currentVersion = document.current_version_id ? getVersion(document.current_version_id) : null;
    res.json({ document, current_version: currentVersion, versions, claims });
  });

  router.patch('/:id', (req, res) => {
    const before = requireDocument(req, res);
    if (!before) return;
    const validated = validateDocumentInput(req.body || {}, true);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const fields = {};
    for (const key of ['title', 'document_type', 'source_provider', 'source_uri', 'source_external_id', 'status']) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) fields[key] = validated.values[key];
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'property_id')) {
      fields.property_id = validated.values.property_id;
    }
    if (fields.status) {
      const err = ensureDocumentTransition(before, fields.status);
      if (err) return res.status(400).json({ error: err });
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No document fields provided' });

    const assignments = Object.keys(fields).map((key) => `${key}=?`);
    try {
      db.prepare(`
        UPDATE documents SET ${assignments.join(', ')}, updated_at=datetime('now') WHERE id=?
      `).run(...Object.values(fields), before.id);
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Document source_external_id already exists for provider.' });
      }
      if (err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(400).json({ error: 'property_id does not exist.' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to update document' });
    }
    const after = getDocument(before.id);
    writeAudit({
      actor: actorFrom(req),
      action: 'document.updated',
      entityType: 'document',
      entityId: before.id,
      before,
      after,
      reason: req.body.reason,
    });
    res.json(after);
  });

  router.post('/:id/versions', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const fileName = cleanString(req.body.file_name, 300);
    const storageUri = cleanString(req.body.storage_uri, 2048);
    if (!fileName) return res.status(400).json({ error: 'file_name is required' });
    if (!storageUri) return res.status(400).json({ error: 'storage_uri is required' });
    const size = req.body.file_size_bytes == null ? null : Number(req.body.file_size_bytes);
    if (size != null && (!Number.isFinite(size) || size < 0)) {
      return res.status(400).json({ error: 'file_size_bytes must be a non-negative number' });
    }

    const versionNumber = db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM document_versions WHERE document_id=?
    `).get(document.id).n;
    const id = makeId('ver');
    try {
      db.prepare(`
        INSERT INTO document_versions (
          id, document_id, version_number, file_name, mime_type, file_size_bytes, sha256,
          storage_uri, storage_external_id, ocr_text, ocr_status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id,
        document.id,
        versionNumber,
        fileName,
        cleanString(req.body.mime_type, 120),
        size,
        cleanString(req.body.sha256, 128),
        storageUri,
        cleanString(req.body.storage_external_id, 300),
        null,
        cleanString(req.body.ocr_status, 40) || 'not_started'
      );
      const row = getVersion(id);
      writeAudit({
        actor: actorFrom(req),
        action: 'document_version.created',
        entityType: 'document_version',
        entityId: id,
        after: row,
        reason: req.body.reason,
      });
      res.status(201).json(row);
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Document version file hash already exists.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create document version' });
    }
  });

  router.post('/:id/versions/:versionId/approve', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const version = getVersion(req.params.versionId);
    if (!version || version.document_id !== document.id) return res.status(404).json({ error: 'Version not found' });
    if (!['draft', 'active'].includes(document.status)) {
      return res.status(400).json({ error: `Cannot approve a version while document status is ${document.status}.` });
    }
    const err = ensureVersionTransition(version, 'approved');
    if (err) return res.status(400).json({ error: err });
    const actor = actorFrom(req);

    const tx = db.transaction(() => {
      const approvedVersions = db.prepare(`
        SELECT * FROM document_versions
        WHERE document_id=? AND approval_status='approved' AND id<>?
      `).all(document.id, version.id);
      for (const approved of approvedVersions) {
        db.prepare("UPDATE document_versions SET approval_status='superseded' WHERE id=?").run(approved.id);
        writeAudit({
          actor,
          action: 'document_version.superseded',
          entityType: 'document_version',
          entityId: approved.id,
          before: approved,
          after: getVersion(approved.id),
          reason: `Replaced by ${version.id}`,
        });
      }
      db.prepare(`
        UPDATE document_versions
        SET approval_status='approved', approved_by=?, approved_at=datetime('now')
        WHERE id=?
      `).run(actor, version.id);
      db.prepare(`
        UPDATE documents
        SET status='active', current_version_id=?, updated_at=datetime('now')
        WHERE id=?
      `).run(version.id, document.id);
      writeAudit({
        actor,
        action: 'document_version.approved',
        entityType: 'document_version',
        entityId: version.id,
        before: version,
        after: getVersion(version.id),
        reason: req.body.reason,
      });
    });
    tx();
    res.json({ document: getDocument(document.id), version: getVersion(version.id) });
  });

  router.post('/:id/versions/:versionId/reject', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const version = getVersion(req.params.versionId);
    if (!version || version.document_id !== document.id) return res.status(404).json({ error: 'Version not found' });
    const err = ensureVersionTransition(version, 'rejected');
    if (err) return res.status(400).json({ error: err });
    db.prepare("UPDATE document_versions SET approval_status='rejected' WHERE id=?").run(version.id);
    writeAudit({
      actor: actorFrom(req),
      action: 'document_version.rejected',
      entityType: 'document_version',
      entityId: version.id,
      before: version,
      after: getVersion(version.id),
      reason: req.body.reason,
    });
    res.json(getVersion(version.id));
  });

  router.post('/:id/claims', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const versionId = cleanString(req.body.document_version_id, 120);
    const version = versionId ? getVersion(versionId) : null;
    if (!version || version.document_id !== document.id) {
      return res.status(400).json({ error: 'document_version_id must reference this document' });
    }
    if (!Array.isArray(req.body.claims)) return res.status(400).json({ error: 'claims must be an array' });
    if (req.body.claims.length === 0) return res.status(400).json({ error: 'claims must not be empty' });

    const prepared = [];
    for (const claim of req.body.claims) {
      const validated = validateClaimInput(claim || {});
      if (validated.error) return res.status(400).json({ error: validated.error });
      prepared.push(validated.values);
    }

    const actor = actorFrom(req);
    const rows = [];
    const tx = db.transaction(() => {
      for (const claim of prepared) {
        const id = makeId('claim');
        db.prepare(`
          INSERT INTO extracted_claims (
            id, document_id, document_version_id, property_id, claim_type, claim_value_json,
            source_quote, source_location_json, confidence
          ) VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          id,
          document.id,
          version.id,
          document.property_id,
          claim.claim_type,
          claim.claim_value_json,
          claim.source_quote,
          claim.source_location_json,
          claim.confidence
        );
        const row = getClaim(id);
        writeAudit({
          actor,
          action: 'extracted_claim.created',
          entityType: 'extracted_claim',
          entityId: id,
          after: row,
          reason: req.body.reason,
        });
        rows.push(row);
      }
    });
    tx();
    res.status(201).json({ claims: rows });
  });

  router.post('/:id/claims/:claimId/approve', (req, res) => {
    return reviewClaim(req, res, 'approved');
  });

  router.post('/:id/claims/:claimId/reject', (req, res) => {
    return reviewClaim(req, res, 'rejected');
  });

  function reviewClaim(req, res, status) {
    const document = requireDocument(req, res);
    if (!document) return;
    const claim = getClaim(req.params.claimId);
    if (!claim || claim.document_id !== document.id) return res.status(404).json({ error: 'Claim not found' });
    const err = ensureClaimTransition(claim, status);
    if (err) return res.status(400).json({ error: err });
    const actor = actorFrom(req);
    db.prepare(`
      UPDATE extracted_claims
      SET status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=?
      WHERE id=?
    `).run(status, actor, cleanString(req.body.review_note || req.body.reason, 500), claim.id);
    const after = getClaim(claim.id);
    writeAudit({
      actor,
      action: `extracted_claim.${status}`,
      entityType: 'extracted_claim',
      entityId: claim.id,
      before: claim,
      after,
      reason: req.body.reason,
    });
    res.json(after);
  }

  router.get('/:id/audit', (req, res) => {
    const document = requireDocument(req, res);
    if (!document) return;
    const entityIds = [document.id];
    for (const version of db.prepare('SELECT id FROM document_versions WHERE document_id=?').all(document.id)) {
      entityIds.push(version.id);
    }
    for (const claim of db.prepare('SELECT id FROM extracted_claims WHERE document_id=?').all(document.id)) {
      entityIds.push(claim.id);
    }
    const placeholders = entityIds.map(() => '?').join(',');
    const events = db.prepare(`
      SELECT id, actor, action, entity_type, entity_id, before_json, after_json, reason, created_at
      FROM audit_events
      WHERE entity_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
    `).all(...entityIds);
    res.json({ events });
  });

  return router;
}

module.exports = createDocumentsRouter;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.CLAIM_STATUSES = CLAIM_STATUSES;
