require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  console.log('Testing with:', process.env.GMAIL_USER);
  console.log('Password length:', process.env.GMAIL_APP_PASSWORD?.length);

  try {
    await transporter.verify();
    console.log('✅ Gmail connection successful!');
  } catch (err) {
    console.error('❌ Gmail error:', err.message);
  }
}

test();