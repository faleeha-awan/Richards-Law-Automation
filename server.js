// ─────────────────────────────────────────────────
// Richards & Law Automation Server
// Main Express app — routes + orchestration logic
// ─────────────────────────────────────────────────
require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

const clioAuth    = require('./src/auth/clio');
const clioService = require('./src/services/clio');
const extractor   = require('./src/services/extractor');
const emailSvc    = require('./src/services/email');
const helpers     = require('./src/utils/helpers');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ─────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// File upload config — store in /uploads temporarily
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  },
});

// In-memory store for pending verifications
// { [token]: { extractedData, matterId, filePath, createdAt } }
const pendingVerifications = {};

// ── Ensure uploads dir exists ──────────────────────
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ═══════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════

// Step 1: Redirect user to Clio login
app.get('/auth/clio', (req, res) => {
  const url = clioAuth.getAuthorizationUrl();
  res.redirect(url);
});

// Step 2: Clio redirects back here with auth code
app.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;

  console.log('Callback received. Code:', code?.substring(0, 10), 'Error:', error);

  if (error) {
    return res.send(`<h2>Auth Error</h2><p>${error}</p>`);
  }

  if (!code) {
    return res.send('<h2>No code received from Clio</h2>');
  }

  try {
    await clioAuth.exchangeCodeForTokens(code);
    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.status(500).send(`
      <h2>Failed to authenticate with Clio</h2>
      <p>${err.message}</p>
      <p><a href="/auth/clio">Try again</a></p>
    `);
  }
});

// Auth status check
app.get('/auth/status', (req, res) => {
  res.json({ authenticated: clioAuth.isAuthenticated() });
});

// ═══════════════════════════════════════════════════
// MAIN WORKFLOW ROUTES
// ═══════════════════════════════════════════════════

// POST /upload — Receive PDF, extract data, send verification email
app.post('/upload', upload.single('police_report'), async (req, res) => {
  if (!clioAuth.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated with Clio. Visit /auth/clio first.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const matterId = req.body.matterId || req.body.matter_id;
  if (!matterId) {
    return res.status(400).json({ error: 'matterId is required.' });
  }

  try {
    // 1. Get client name from Clio Matter FIRST so extractor can match correctly
    const matter = await clioService.getMatter(matterId);
    const clientName = matter.client?.name || '';
    const nameParts = clientName.trim().split(' ');
    const clientFirstName = nameParts[0] || '';
    const clientLastName = nameParts.slice(1).join(' ') || '';

    // 2. Extract data from PDF using Claude — passing client name for name-matching
    const extractedData = await extractor.extractFromPDF(
      req.file.path,
      clientFirstName,
      clientLastName
    );

    // 3. Generate a unique token for this verification session
    const token = uuidv4();
    pendingVerifications[token] = {
      extractedData,
      matterId,
      filePath: req.file.path,
      createdAt: Date.now(),
    };

    // 4. Send verification email to paralegal
    await emailSvc.sendVerificationEmail(token, extractedData, matterId);

    res.json({
      success: true,
      message: 'PDF processed. Verification email sent to paralegal.',
      token,
      extractedData,
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }

});

//Get matters
app.get('/matters', async (req, res) => {
  if (!clioAuth.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await clioService.clioRequest('GET', '/matters.json?fields=id,display_number,client{id,name}&status=open&limit=50');
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// GET /verify/:token — Show verification page (served from public/verify.html)
app.get('/verify/:token', (req, res) => {
  const { token } = req.params;
  const pending = pendingVerifications[token];

  if (!pending) {
    return res.status(404).send('<h2>Verification link not found or already used.</h2>');
  }

  // Check 24-hour expiry
  const AGE_LIMIT = 24 * 60 * 60 * 1000;
  if (Date.now() - pending.createdAt > AGE_LIMIT) {
    delete pendingVerifications[token];
    return res.status(410).send('<h2>This verification link has expired.</h2>');
  }

  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// GET /verify/:token/data — Return extracted data as JSON for the verify page
app.get('/verify/:token/data', (req, res) => {
  const { token } = req.params;
  const pending = pendingVerifications[token];
  if (!pending) return res.status(404).json({ error: 'Not found' });
  res.json(pending);
});

// POST /verify/:token/approve — Paralegal approved; write to Clio and trigger everything
app.post('/verify/:token/approve', async (req, res) => {
  const { token } = req.params;
  const pending = pendingVerifications[token];

  if (!pending) {
    return res.status(404).json({ error: 'Verification session not found or already used.' });
  }

  // Allow paralegal edits from the form to override extracted data
  const data = { ...pending.extractedData, ...req.body };
  const { matterId } = pending;

  try {
    // ── 1. Get custom field IDs from Clio ────────────
    const customFields = await clioService.getCustomFields();
    const fieldMap = {};
    customFields.forEach(f => { fieldMap[f.name] = f.id; });

    // ── 2. Calculate derived values ──────────────────
    const solDate  = helpers.calculateSOLDate(data.accidentDate);
    const pronouns = helpers.getPronounsFromSex(data.clientSex);

    // ── 3. Build custom field updates payload ────────
    const fieldUpdates = [
      { id: fieldMap['Accident Date'],             value: data.accidentDate },
      { id: fieldMap['Accident Location'],         value: data.accidentLocation },
      { id: fieldMap['Defendant Name'],            value: data.defendantName },
      { id: fieldMap['Client Vehicle Plate'],      value: data.clientVehiclePlate },
      { id: fieldMap['Number of Injured'],         value: String(data.numberOfInjured) },
      { id: fieldMap['Accident Description'],      value: data.accidentDescription },
      { id: fieldMap['Statute of Limitations Date'], value: solDate },
      { id: fieldMap['Accident Report Number'],    value: data.accidentReportNumber },
      { id: fieldMap['Client Pronoun'],            value: pronouns.pronoun },
      { id: fieldMap['Client Pronoun Subject'],    value: pronouns.pronounSubject },
    ].filter(f => f.id); // Only include fields that exist in Clio

    // ── 4. Update Clio Matter ────────────────────────
    await clioService.updateMatterCustomFields(matterId, fieldUpdates);

    // ── 5. Get matter + attorney details ────────────
    const matter = await clioService.getMatter(matterId);
    const clientName = matter.client?.name || `${data.clientFirstName} ${data.clientLastName}`;
    const responsibleAttorneyId = matter.responsible_attorney?.id;

    // ── 6. Trigger Clio document automation ─────────
    const templates = await clioService.getDocumentTemplates();
    // Just grab the first template — we only have one
    const retainerTemplate = templates[0];

    if (!retainerTemplate) {
      throw new Error('Retainer template not found in Clio. Please upload it first.');
    }

    const docResult = await clioService.generateRetainerDocument(matterId, retainerTemplate.id);
    const documentId = docResult?.document?.id;

    // ── 7. Create SOL calendar event ────────────────
    if (responsibleAttorneyId) {
      await clioService.createCalendarEntry(matterId, responsibleAttorneyId, solDate, clientName);
    }

    // ── 8. Send personalized client email via Clio ──
    const bookingLink = helpers.getSeasonalBookingLink();
    const clientContact = matter.client;

    const emailSubject = `Your Legal Representation — Richards & Law`;
    const emailBody = buildClientEmail(data, clientName, solDate, bookingLink);

    await clioService.sendClioEmail(
      matterId,
      clientContact.id,
      emailSubject,
      emailBody,
      documentId
    );

    // ── 9. Upload original police report PDF to the Clio Matter ───
    if (pending.filePath && fs.existsSync(pending.filePath)) {
      const reportFileName = `Police_Report_${data.clientLastName}_${data.accidentDate.replace(/\//g, '-')}.pdf`;
      await clioService.uploadDocumentToMatter(matterId, pending.filePath, reportFileName);
      // Clean up local temp file after upload
      fs.unlinkSync(pending.filePath);
    }
    delete pendingVerifications[token];

    res.json({
      success: true,
      message: 'All done! Clio updated, retainer generated, calendar set, client emailed.',
      solDate,
      documentId,
    });

  } catch (err) {
    console.error('Approval error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
// HELPER: Build client email body
// ═══════════════════════════════════════════════════
function buildClientEmail(data, clientName, solDate, bookingLink) {
  const firstName = data.clientFirstName || clientName.split(' ')[0];
  const solFormatted = helpers.formatDateForDisplay(solDate);

  return `
Dear ${firstName},

Thank you for reaching out to Richards & Law. We have reviewed the details of your recent accident that occurred on ${data.accidentDate} at ${data.accidentLocation}, and we are ready to represent you.

${data.accidentDescription ? `Based on the police report, our understanding of the incident is as follows: ${data.accidentDescription}` : ''}

We have prepared your Retainer Agreement, which is attached to this message for your review. This agreement outlines the scope of our representation and the terms of our engagement on your behalf.

Please note that your case has an important legal deadline — the Statute of Limitations for your claim is ${solFormatted}. It is essential that we move forward before this date.

To schedule your consultation with our team, please use the link below:

👉 Book Your Consultation: ${bookingLink}

We look forward to speaking with you and getting to work on your case right away.

Warm regards,
Richards & Law
New York Personal Injury Attorneys
  `.trim();
}

// ═══════════════════════════════════════════════════
// DEBUG ROUTES (helpful during development)
// ═══════════════════════════════════════════════════

// List all custom fields in Clio (useful for checking field IDs)
app.get('/debug/custom-fields', async (req, res) => {
  if (!clioAuth.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try{
    const fields = await clioService.getCustomFields();
    res.json(fields);
  } catch (err) {
    res.status(500).json ({error: err.response?.data || err.message })
  }
  
});

// List all document templates
app.get('/debug/templates', async (req, res) => {
  if (!clioAuth.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const templates = await clioService.getDocumentTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Get a specific matter
app.get('/debug/matter/:id', async (req, res) => {
  if (!clioAuth.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try{
    const matter = await clioService.getMatter(req.params.id);
    res.json(matter);
  } catch (err){
    res.status(500).json({ error: err.response?.data || err.message });
  }
  
});

// ─────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 Richards & Law Automation running at http://127.0.0.1:${PORT}`);
  console.log(`   → Connect Clio: http://127.0.0.1:${PORT}/auth/clio`);
  console.log(`   → Upload PDF:   http://127.0.0.1:${PORT}\n`);
});