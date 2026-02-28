// ─────────────────────────────────────────────────
// PDF Extraction Service
// Sends police report PDF to Claude API.
// We pass in the client's name from Clio so Claude
// can figure out which vehicle is ours and which
// is the defendant — rather than blindly assuming
// Vehicle 1 = client.
// ─────────────────────────────────────────────────
const axios = require('axios');
const fs = require('fs');

async function extractFromPDF(filePath, clientFirstName, clientLastName) {
  console.log(`📄 Extracting PDF for client: ${clientFirstName} ${clientLastName}`);

  const pdfBuffer = fs.readFileSync(filePath);
  const base64PDF = pdfBuffer.toString('base64');

  const clientFullName = `${clientFirstName} ${clientLastName}`.toUpperCase();

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64PDF,
              },
            },
            {
              type: 'text',
              text: `You are a legal data extraction assistant processing a New York Police Accident Report (MV-104AN).

Our client's name is: ${clientFullName}

Your job:
1. Find which vehicle (Vehicle 1 or Vehicle 2) belongs to our client by matching the driver name to "${clientFullName}". Names may appear in LAST, FIRST format on the report.
2. The OTHER vehicle's driver is the defendant.
3. Extract all fields listed below.

Return ONLY a valid JSON object with no extra text, no markdown, no explanation:

{
  "clientFirstName": "our client's first name as on the report",
  "clientLastName": "our client's last name as on the report",
  "clientSex": "our client's sex - M or F or U",
  "clientVehicleNumber": "which vehicle number is our client - 1 or 2",
  "clientVehiclePlate": "our client's license plate number",
  "defendantName": "the other driver's full name, format as First Last",
  "defendantVehiclePlate": "the other driver's license plate",
  "accidentDate": "date of accident as MM/DD/YYYY",
  "accidentLocation": "full accident location - street name and borough or city",
  "accidentDescription": "the full officer notes and accident description text",
  "numberOfInjured": "number shown in No. Injured field as an integer",
  "accidentReportNumber": "the accident or complaint number from the top of the report"
}

If any field cannot be found, use null. Return only the JSON.`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  const rawText = response.data.content[0].text.trim();
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const extracted = JSON.parse(cleaned);

  console.log(`✅ Extraction complete. Client is Vehicle ${extracted.clientVehicleNumber}`);
  console.log('   Defendant:', extracted.defendantName);
  return extracted;
}

module.exports = { extractFromPDF };