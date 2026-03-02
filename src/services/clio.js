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
  console.log('Token being used:', token ? token.substring(0, 20) + '...' : 'UNDEFINED');
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
    `/matters/${matterId}.json?fields=id,display_number,custom_field_values{id,field_name,value,custom_field},client{id,name},responsible_attorney{id,name}`
  );
  return res.data;
}

async function getContactEmail(contactId) {
  const res = await clioRequest(
    'GET',
    `/contacts/${contactId}.json?fields=id,name,email_addresses{id,address,name}`
  );
  return res.data?.email_addresses?.[0]?.address || null;
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
  // First get the matter to find existing custom field value IDs
  const matter = await clioRequest('GET', `/matters/${matterId}.json?fields=custom_field_values{id,custom_field}`);
  
  // Build a map of customFieldId -> existing value record ID
  const existingValueMap = {};
  matter.data.custom_field_values.forEach(v => {
    existingValueMap[v.custom_field.id] = v.id;
  });

  const payload = {
    data: {
      custom_field_values: customFieldUpdates.map(({ id, value }) => {
        const entry = { custom_field: { id }, value };
        // If a value record already exists, include its ID to update it
        if (existingValueMap[id]) {
          entry.id = existingValueMap[id];
        }
        return entry;
      }),
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
      document_template: { id: templateId },
      filename: `Retainer_Agreement_${matterId}.pdf`,
      formats: ['pdf'],
    },
  };

  await clioRequest('POST', '/document_automations.json', payload);
  console.log('✅ Document automation triggered');

  // Wait for Clio to generate the document
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Fetch the most recently created document in this matter
  const docsRes = await clioRequest('GET', `/documents.json?fields=id,name,created_at&filter[matter_id]=${matterId}&order=created_at(desc)&limit=10`);
  const docs = docsRes.data;
  
  console.log('Recent matter documents:', JSON.stringify(docs?.map(d => ({ id: d.id, name: d.name }))));
  
  // Find the retainer document
  const retainerDoc = docs?.find(d => 
    d.name?.toLowerCase().includes('retainer') || 
    d.name?.toLowerCase().includes('agreement')
  ) || docs?.[0];

  if (retainerDoc) {
    console.log('✅ Retainer document found, ID:', retainerDoc.id);
    return { document: { id: retainerDoc.id, name: retainerDoc.name } };
  }

  console.warn('⚠️ Could not find retainer document after automation');
  return { document: null };
}

// ── Get document templates ─────────────────────────
async function getDocumentTemplates() {
  const res = await clioRequest('GET', '/document_templates.json');
  return res.data;
}

// ── Create a calendar entry (SOL date) ────────────
async function createCalendarEntry(matterId, responsibleAttorneyId, solDate, clientName) {
  // Get the first available calendar
  /*
  const calendarsRes = await clioRequest('GET', '/calendars.json?fields=id,name');
  const userCalendar = calendarsRes.data[0];

  if (!userCalendar) {
    console.warn('⚠️ No calendar found — skipping calendar entry');
    return null;
  }

  console.log('Using calendar:', userCalendar.id, userCalendar.name);

 const payload = {
  data: {
    summary: `⚠️ Statute of Limitations — ${clientName}`,
    description: `Statute of Limitations deadline for matter. File by this date or the claim is barred.`,
    start_at: `${solDate}T00:00:00+00:00`,
    end_at: `${solDate}T23:59:59+00:00`,
    all_day: true,
    matter: { id: matterId },
    calendar_owner: { id: responsibleAttorneyId },
  },
};

  const res = await clioRequest('POST', '/calendar_entries.json', payload);
  console.log('✅ SOL calendar entry created, ID:', res.data?.id);
  return res.data;
  */

  // TODO: Fix Clio calendar API - temporarily disabled
  console.log(`⚠️ Calendar entry skipped — SOL date ${solDate} for ${clientName} (fix pending)`);
  return null;
}

async function downloadDocument(documentId) {
  const token = await getValidAccessToken();
  
  // Get the download URL
  const res = await clioRequest('GET', `/documents/${documentId}.json?fields=id,name,latest_document_version{uuid}`);
  const uuid = res.data?.latest_document_version?.uuid;
  
  if (!uuid) {
    console.warn('⚠️ No document version UUID found');
    return null;
  }

  // Download the actual file
  const downloadRes = await axios.get(
    `${CLIO_API}/documents/${documentId}/download`,
    {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
    }
  );

  return {
    buffer: Buffer.from(downloadRes.data),
    filename: res.data.name || 'Retainer_Agreement.pdf',
  };
}

// ── Send email to Client ────────────
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


module.exports = {
  clioRequest,
  getCustomFields,
  getMatter,
  getContactEmail,
  findMatterByClientName,
  updateMatterCustomFields,
  generateRetainerDocument,
  getDocumentTemplates,
  createCalendarEntry,
  downloadDocument,
  sendClioEmail,
};