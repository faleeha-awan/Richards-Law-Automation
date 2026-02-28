// Utility functions: seasonal booking links, date calculations, pronoun mapping

// Returns the correct booking link based on current month
// March (3) - August (8)  → in-office
// September (9) - February (2) → virtual
function getSeasonalBookingLink() {
  const month = new Date().getMonth() + 1; // getMonth() is 0-indexed
  const isInOfficeSeason = month >= 3 && month <= 8;

  return isInOfficeSeason
    ? process.env.BOOKING_LINK_IN_OFFICE
    : process.env.BOOKING_LINK_VIRTUAL;
}

// Calculate Statute of Limitations date
// New York personal injury = 3 years, but Andrew specifically asked for 8 years
// We follow the client's instruction and flag this as an assumption
function calculateStatuteOfLimitations(accidentDateStr) {
  const accidentDate = new Date(accidentDateStr);
  const solDate = new Date(accidentDate);
  solDate.setFullYear(solDate.getFullYear() + 8);
  return solDate.toISOString().split('T')[0]; // Return as YYYY-MM-DD
}

// Map sex field from police report to pronouns for retainer agreement
// Police reports use M/F - we map to his/her for the legal document
function getPronounsFromSex(sex) {
  const sexUpper = (sex || '').toString().toUpperCase().trim();

  if (sexUpper === 'M' || sexUpper === 'MALE') {
    return {
      pronoun: 'his',         // his cooperation, his settlement
      pronounSubject: 'he',   // he may remain responsible
    };
  } else if (sexUpper === 'F' || sexUpper === 'FEMALE') {
    return {
      pronoun: 'her',
      pronounSubject: 'she',
    };
  } else {
    // Default to neutral if unclear
    return {
      pronoun: 'their',
      pronounSubject: 'they',
    };
  }
}

// Format a date string nicely for emails and documents
// e.g. "2018-12-06" → "December 6, 2018"
function formatDateForDisplay(dateStr) {
  if (!dateStr) return 'Unknown Date';
  const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone shift
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Format date for Clio API (expects YYYY-MM-DD)
function formatDateForClio(dateStr) {
  if (!dateStr) return null;
  // Handle formats like "12/06/2018" or "2018-12-06"
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr; // Return as-is if can't parse
  return date.toISOString().split('T')[0];
}

module.exports = {
  getSeasonalBookingLink,
  calculateStatuteOfLimitations,
  getPronounsFromSex,
  formatDateForDisplay,
  formatDateForClio,
};