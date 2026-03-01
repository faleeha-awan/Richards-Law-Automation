const nodemailer = require('nodemailer');
const { formatDateForDisplay } = require('../utils/helpers');

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

//Email to Paralegal for verification of client details
async function sendVerificationEmail(extractedData, verificationToken, matterId) {
  const transporter = createTransporter();

  const verifyUrl = `${process.env.BASE_URL}/verify/${verificationToken}`;
  const accidentDateDisplay = extractedData.accidentDate || 'Unknown Date';
  const clientName = `${extractedData.clientFirstName} ${extractedData.clientLastName}`;
  const defendantName = extractedData.defendantName || 'Not found';

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
          <tr><td>Accident Location</td><td>${extractedData.accidentLocation || 'Not found'}</td></tr>
          <tr><td>Defendant Name</td><td>${defendantName}</td></tr>
          <tr><td>Client Vehicle Plate</td><td>${extractedData.clientVehiclePlate || 'Not found'}</td></tr>
          <tr><td>No. Injured</td><td>${extractedData.numberOfInjured ?? 'Not found'}</td></tr>
          <tr><td>Report Number</td><td>${extractedData.accidentReportNumber || 'Not found'}</td></tr>
          <tr><td>Accident Description</td><td>${extractedData.accidentDescription || 'Not found'}</td></tr>
        </table>

        <p style="text-align:center;">
          <a href="${verifyUrl}" class="btn">Review &amp; Approve →</a>
        </p>

        <!--<p style="margin-top:12px; font-size:13px; color:#666;">
          Or copy this link into your browser:<br/>
          <strong style="color:#1a3c5e; word-break:break-all;">${verifyUrl}</strong>
        </p>-->

        <p style="font-size:13px; color:#666;">
          This link expires in 24 hours. &nbsp;|&nbsp; Matter ID: ${matterId}
        </p>
      </div>
      <div class="footer">
        Richards &amp; Law Automation System — Internal Use Only
      </div>
    </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"Richards & Law Automation" <${process.env.GMAIL_USER}>`,
    to: process.env.PARALEGAL_EMAIL,
    subject: `[ACTION REQUIRED] Verify Police Report — ${clientName} (${accidentDateDisplay})`,
    html: htmlBody,
  });

  console.log('✅ Verification email sent:', info.messageId);
  return info;
}

//Email to the client with retainer agreement + booking link
async function sendClientEmail(clientEmail, clientName, extractedData, solDate, bookingLink, matterId) {
  const transporter = createTransporter();
  const firstName = clientName.split(' ')[0];

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: #1a3c5e; color: white; padding: 24px; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 28px; border: 1px solid #ddd; }
        .sol-box { background: #fff3cd; border: 1px solid #ffc107; padding: 14px; border-radius: 6px; margin: 20px 0; }
        .btn { display: inline-block; background: #1a3c5e; color: white !important;
               padding: 14px 28px; text-decoration: none; border-radius: 6px;
               font-size: 16px; font-weight: bold; margin: 20px 0; }
        .footer { font-size: 12px; color: #888; padding: 16px; text-align: center; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin:0">⚖️ Richards & Law — Your Legal Representation</h2>
        <p style="margin:6px 0 0; opacity:0.85;">Personal Injury Attorneys — New York</p>
      </div>
      <div class="content">
        <p>Dear ${firstName},</p>

        <p>Thank you for choosing Richards & Law to represent you. We have reviewed the details of your accident that occurred on <strong>${extractedData.accidentDate}</strong> at <strong>${extractedData.accidentLocation}</strong> and we are ready to get to work on your behalf.</p>

        <p>We have prepared your Retainer Agreement which will be sent to you separately through our case management system. Please review and sign it at your earliest convenience.</p>

        <div class="sol-box">
          ⚠️ <strong>Important Legal Deadline:</strong> The Statute of Limitations for your claim is <strong>${solDate}</strong>. We must file before this date or your claim will be barred.
        </div>

        <p>To schedule your consultation with our team, please use the link below:</p>

        <p style="text-align:center;">
          <a href="${bookingLink}" class="btn">📅 Book Your Consultation</a>
        </p>

        <p>If you have any questions in the meantime, please don't hesitate to reach out.</p>

        <p>Warm regards,<br/>
        <strong>Richards & Law</strong><br/>
        New York Personal Injury Attorneys</p>
      </div>
      <div class="footer">
        This email was sent regarding Matter #${matterId}. Richards &amp; Law — Internal Use Only.
      </div>
    </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"Richards & Law" <${process.env.GMAIL_USER}>`,
    to: clientEmail,
    subject: `Your Legal Representation — Richards & Law`,
    html: htmlBody,
  });

  console.log('✅ Client email sent:', info.messageId);
  return info;
}

module.exports = { sendVerificationEmail, sendClientEmail };
