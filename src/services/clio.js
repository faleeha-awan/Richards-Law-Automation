// ─────────────────────────────────────────────────
// Clio API Service
// Handles all interactions with Clio Manage API v4
// ─────────────────────────────────────────────────
const axios = require('axios');
axios.interceptors.response.use(
  response => response,
  error => {
    console.error('Clio Error:', error.response?.status, JSON.stringify(error.response?.data));
    return Promise.reject(error);
  }
);
const { getValidAccessToken } = require('../auth/clio');

const CLIO_API = 'https://eu.app.clio.com/api/v4';

// Helper: authenticated axios instance
async function clioRequest(method, endpoint, data = null) {
  const token = await getValidAccessToken();
  const config = {
    method,
    url: `${CLIO_API}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (err) {
  throw err;
  }
}

// ── Get all custom fields for matters ──────────────
async function getCustomFields() {
  const res = await clioRequest('GET', '/custom_fields.json?parent_type=Matter&limit=200&fields=id,name,field_type');
  return res.data;
}

// ── Get a single matter with its custom field values ──
async function getMatter(matterId) {
  const res = await clioRequest(
    'GET',
    `/matters/${matterId}.json?fields=id,display_number,description,custom_field_values{id,field_name,value,custom_field},client{id,name,email_addresses},responsible_attorney{id,name}`
  );
  return res.data;
}

// ── Search matters to find one by client name ──────
async function findMatterByClientName(firstName, lastName) {
  const query = `${firstName} ${lastName}`;
  const res = await clioRequest(
    'GET',
    `/matters.json?query=${encodeURIComponent(query)}&fields=id,display_number,client{id,name,email_addresses},custom_field_values{id,field_name,value,custom_field},responsible_attorney{id,name}`
  );
  return res.data;
}

// ── Update matter custom fields ────────────────────
// customFieldUpdates = [{ id: customFieldId, value: "..." }, ...]
async function updateMatterCustomFields(matterId, customFieldUpdates) {
  const payload = {
    data: {
      custom_field_values: customFieldUpdates.map(({ id, value }) => ({
        custom_field: { id },
        value,
      })),
    },
  };

  const res = await clioRequest('PATCH', `/matters/${matterId}.json`, payload);
  console.log('✅ Matter custom fields updated');
  return res.data;
}

// ── Trigger document automation ────────────────────
async function generateRetainerDocument(matterId, templateId) {
  const payload = {
    data: {
      matter: { id: matterId },
      template: { id: templateId },
    },
  };

  const res = await clioRequest('POST', '/document_automations.json', payload);
  console.log('✅ Document automation triggered, doc ID:', res.data?.document?.id);
  return res.data;
}

// ── Get document templates ─────────────────────────
async function getDocumentTemplates() {
  const res = await clioRequest('GET', '/document_templates.json');
  return res.data;
}

// ── Create a calendar entry (SOL date) ────────────
async function createCalendarEntry(matterId, responsibleAttorneyId, solDate, clientName) {
  const payload = {
    data: {
      summary: `⚠️ Statute of Limitations — ${clientName}`,
      description: `Statute of Limitations deadline for matter. File by this date or the claim is barred.`,
      start_at: `${solDate}T09:00:00Z`,
      end_at: `${solDate}T10:00:00Z`,
      all_day: true,
      matter: { id: matterId },
      attendees: [{ id: responsibleAttorneyId, type: 'User' }],
    },
  };

  const res = await clioRequest('POST', '/calendar_entries.json', payload);
  console.log('✅ SOL calendar entry created');
  return res.data;
}

// ── Get a document's download URL ─────────────────
async function getDocumentDownloadUrl(documentId) {
  const res = await clioRequest('GET', `/documents/${documentId}.json?fields=id,name,latest_document_version{uuid,put_url,filename}`);
  return res.data;
}

// ── Send email via Clio Communications ────────────
async function sendClioEmail(matterId, contactId, subject, body, documentId = null) {
  const payload = {
    data: {
      type: 'EmailCommunication',
      subject,
      body,
      matter: { id: matterId },
      senders: [],
      receivers: [{ id: contactId, type: 'Contact' }],
    },
  };

  if (documentId) {
    payload.data.documents = [{ id: documentId }];
  }

  const res = await clioRequest('POST', '/communications.json', payload);
  console.log('✅ Clio email sent to client');
  return res.data;
}



// ── Upload a file (e.g. police report PDF) to a Matter ──
async function uploadDocumentToMatter(matterId, filePath, fileName) {
  const fs = require('fs');
  const FormData = require('form-data');

  const token = await getValidAccessToken();

  // Step 1: Create the document record in Clio
  const createRes = await clioRequest('POST', '/documents.json', {
    data: {
      name: fileName,
      matter: { id: matterId },
      parent: { id: matterId, type: 'Matter' },
    },
  });

  const documentId = createRes.data.id;
  const putUrl = createRes.data.latest_document_version?.put_url;

  if (!putUrl) {
    console.warn('⚠️ No put_url returned from Clio for document upload');
    return createRes.data;
  }

  // Step 2: Upload the actual file bytes to the put_url (S3)
  const fileBuffer = fs.readFileSync(filePath);
  await axios.put(putUrl, fileBuffer, {
    headers: { 'Content-Type': 'application/pdf' },
  });

  // Step 3: Mark the upload as complete
  await clioRequest('PATCH', `/documents/${documentId}.json`, {
    data: { fully_uploaded: true },
  });

  console.log(`✅ Police report PDF uploaded to Clio Matter as document ID: ${documentId}`);
  return createRes.data;
}

module.exports = {
  clioRequest,
  getCustomFields,
  getMatter,
  findMatterByClientName,
  updateMatterCustomFields,
  generateRetainerDocument,
  getDocumentTemplates,
  createCalendarEntry,
  getDocumentDownloadUrl,
  sendClioEmail,
  uploadDocumentToMatter,
};