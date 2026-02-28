# Richards & Law — Police Report Automation

Automated pipeline for processing police report PDFs, extracting case data with AI, and generating retainer agreements inside Clio Manage.

## What It Does

1. **Paralegal uploads** a police report PDF via the web interface
2. **Claude AI extracts** all relevant case data (accident details, parties, dates)
3. **Verification email** sent to paralegal with extracted data to review/edit
4. **Paralegal approves** via a clean web form
5. **Clio Matter updated** with all custom fields populated
6. **Retainer Agreement generated** automatically via Clio document automation
7. **Statute of Limitations** calendared 8 years from accident date
8. **Client receives personalized email** with retainer PDF attached + seasonal booking link

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Fill in your values in .env
```

Required values:
- `CLIO_CLIENT_ID` and `CLIO_CLIENT_SECRET` — from https://developers.clio.com
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `GMAIL_USER` and `GMAIL_APP_PASSWORD` — Gmail with App Password enabled

### 3. Run the app
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 4. Authenticate with Clio
Visit `http://127.0.0.1:5000/auth/clio` and authorize the app.

### 5. Set up Clio
- Upload the retainer template (`Richards_Law_Retainer_Template_v2.docx`) to Clio Documents → Templates
- Ensure all custom fields are created in your Clio Matter settings

## Custom Fields Required in Clio

| Field Name | Type |
|---|---|
| Accident Date | Date |
| Accident Location | Text Area |
| Accident Description | Text Area |
| Accident Report Number | Text |
| Defendant Name | Text |
| Client Vehicle Plate | Text |
| Number of Injured | Numeric |
| Statute of Limitations Date | Date |
| Client Pronoun | Text |
| Client Pronoun Subject | Text |

## Deployment (Railway)

1. Push to GitHub
2. Connect repo to [Railway.app](https://railway.app)
3. Add environment variables in Railway dashboard
4. Update `CLIO_REDIRECT_URI` and `BASE_URL` to your Railway URL
5. Update Redirect URI in your Clio Developer App settings

## Tech Stack

- **Backend:** Node.js + Express
- **AI Extraction:** Anthropic Claude API
- **Case Management:** Clio Manage API v4
- **Internal Email:** Nodemailer + Gmail SMTP
- **Client Email:** Clio Communications API
- **Frontend:** Vanilla HTML/CSS/JS