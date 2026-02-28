// Handles internal verification emails to the paralegal via Gmail SMTP
// This is separate from the client email (which goes through Clio)

const nodemailer = require('nodemailer');
const { formatDateForDisplay } = require('../utils/helpers');

// Create reusable transporter
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD, // Use App Password, not your real Gmail password
    },
  });
}

// Send the verification email to the paralegal
// Contains extracted data + a link to review/edit before writing to Clio
async function sendVerificationEmail(extractedData, verificationToken, matterId) {
  const transporter = createTransporter();

  const verifyUrl = `${process.env.BASE_URL}/verify/${verificationToken}`;

  const accidentDateDisplay = formatDateForDisplay(extractedData.accident_date);
  const clientName = `${extractedData.client_first_name} ${extractedData.client_last_name}`;
  const defendantName = `${extractedData.defendant_first_name} ${extractedData.defendant_last_name}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: #1a3c5e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 24px; border: 1px solid #ddd; }
        .field-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .field-table tr { border-bottom: 1px solid #eee; }
        .field-table td { padding: 10px 8px; }
        .field-table td:first-child { font-weight: bold; color: #555; width: 40%; }
        .field-table td:last-child { color: #111; }
        .btn { display: inline-block; background: #1a3c5e; color: white !important; 
               padding: 14px 28px; text-decoration: none; border-radius: 6px; 
               font-size: 16px; font-weight: bold; margin: 20px 0; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; 
                   padding: 12px; border-radius: 4px; margin: 12px 0; font-size: 14px; }
        .footer { font-size: 12px; color: #888; padding: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin:0">📋 Police Report — Data Verification Required</h2>
        <p style="margin:4px 0 0; opacity:0.8;">Richards & Law Automation System</p>
      </div>
      <div class="content">
        <p>A police report PDF has been processed. Please review the extracted data below and confirm before it is written to Clio Manage.</p>

        <div class="warning">
          ⚠️ <strong>Action Required:</strong> This data has NOT been saved to Clio yet. 
          Click the button below to review, edit if needed, and approve.
        </div>

        <h3 style="color:#1a3c5e;">Extracted Information</h3>

        <table class="field-table">
          <tr><td>Client Name</td><td>${clientName}</td></tr>
          <tr><td>Accident Date</td><td>${accidentDateDisplay}</td></tr>
          <tr><td>Accident Location</td><td>${extractedData.accident_location || 'Not found'}</td></tr>
          <tr><td>Defendant Name</td><td>${defendantName}</td></tr>
          <tr><td>Client Vehicle Plate</td><td>${extractedData.client_plate || 'Not found'}</td></tr>
          <tr><td>No. Injured</td><td>${extractedData.num_injured ?? 'Not found'}</td></tr>
          <tr><td>Report Number</td><td>${extractedData.accident_report_number || 'Not found'}</td></tr>
          <tr><td>Accident Description</td><td>${extractedData.accident_description || 'Not found'}</td></tr>
        </table>

        <p style="text-align:center;">
          <a href="${verifyUrl}" class="btn">Review &amp; Approve in Clio →</a>
        </p>

        <p style="font-size:13px; color:#666;">
          This link will expire in 24 hours. Matter ID: ${matterId}
        </p>
      </div>
      <div class="footer">
        Richards &amp; Law Automation System — Internal Use Only
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Richards & Law Automation" <${process.env.GMAIL_USER}>`,
    to: process.env.PARALEGAL_EMAIL,
    subject: `[ACTION REQUIRED] Verify Police Report Data — ${clientName} (${accidentDateDisplay})`,
    html: htmlBody,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('✅ Verification email sent:', info.messageId);
  return info;
}

module.exports = { sendVerificationEmail };