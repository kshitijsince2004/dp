export const SECTION_KEY_ORDER = {
  CASE: [
    'acts_and_sections',
    'occurrence_info',
    'complainant_info',
    'fir_contents',
    'victim_info',
    'accused_info',
    'property_details',
    'action_taken',
    'court_details'
  ],
  ARREST: [
    'select_fir',
    'general_info',
    'arrested_info',
    'property_details',
    'investigation_officer'
  ],
  UIDB: [
    'general_info',
    'corpse_desc',
    'corpse_physical',
    'inquest_details',
    'investigation_officer'
  ],
  PCR_CALL: [
    'general_info',
    'occurrence_info',
    'complaint_details',
    'incident_details',
    'informant_contact',
    'investigation_officer'
  ],
  MISSING: [
    'general_info',
    'person_details',
    'missing_address',
    'missing_physical',
    'accompanying_children',
    'contacts_assigned',
    'investigation_officer'
  ]
};

export const REPEATER_SECTION_META = {
  property_details: { is_repeater: true, entity_type: 'property' },
  arrested_info: { is_repeater: true, entity_type: 'person', person_type: 'ARRESTED' },
  victim_info: { is_repeater: true, entity_type: 'person', person_type: 'VICTIM' },
  accused_info: { is_repeater: true, entity_type: 'person', person_type: 'ACCUSED' },
  accompanying_children: { is_repeater: true, entity_type: 'person', person_type: 'MISSING_CHILD' }
};

export const SECTION_LABELS = {
  // Case sections
  general_info: { en: 'General Information', hi: 'सामान्य जानकारी' },
  incident_details: { en: 'Incident Details', hi: 'घटना का विवरण' },
  offence_info: { en: 'Offence Information', hi: 'अपराध की जानकारी' },
  occurrence_info: { en: 'Occurrence', hi: 'घटना' },
  complainant_personal_info: { en: 'Complainant (Personal)', hi: 'शिकायतकर्ता (व्यक्तिगत)' },
  complainant_accused_info: { en: 'Complainant Details', hi: 'शिकायतकर्ता का विवरण' },
  complainant_address: { en: 'Complainant Address', hi: 'शिकायतकर्ता का पता' },
  complainant_info: { en: 'Complainant', hi: 'शिकायतकर्ता' },
  brief_facts: { en: 'FIR Contents', hi: 'प्राथमिकी विवरण' },
  fir_contents: { en: 'FIR Contents', hi: 'प्राथमिकी विवरण' },
  victim_personal_info: { en: 'Victim (Personal)', hi: 'पीड़ित (व्यक्तिगत)' },
  victim_address: { en: 'Victim Address', hi: 'पीड़ित का पता' },
  victim_info: { en: 'Victim Information', hi: 'पीड़ित का विवरण' },
  accused_personal_info: { en: 'Accused (Personal)', hi: 'आरोपी (व्यक्तिगत)' },
  accused_address: { en: 'Accused Address', hi: 'आरोपी का पता' },
  accused_info: { en: 'Accused', hi: 'आरोपी' },
  property_details: { en: 'Property of Interest', hi: 'संबद्ध संपत्ति' },
  recovered_property: { en: 'Recovered Property', hi: 'बरामद संपत्ति' },
  stolen_property: { en: 'Stolen Property', hi: 'चोरी हुई संपत्ति' },
  action_taken: { en: 'Action Taken', hi: 'की गई कार्रवाई' },
  court_details: { en: 'Court Details', hi: 'अदालत का विवरण' },
  acts_and_sections: { en: 'Acts & Sections', hi: 'अधिनियम और धाराएं' },

  // Arrest sections
  select_fir: { en: 'Select FIR', hi: 'प्राथमिकी चुनें' },
  arrest_details: { en: 'Arrest Details', hi: 'गिरफ्तारी का विवरण' },
  arrested_personal_info: { en: 'Arrested (Personal)', hi: 'गिरफ्तार व्यक्ति (व्यक्तिगत)' },
  arrested_address: { en: 'Arrested Address', hi: 'गिरफ्तार व्यक्ति का पता' },
  arrestee_info: { en: 'Arrestee Details', hi: 'गिरफ्तार व्यक्ति का विवरण' },
  arrested_info: { en: 'Arrested', hi: 'गिरफ्तार व्यक्ति' },
  custody_status: { en: 'Custody Status', hi: 'हिरासत की स्थिति' },

  // UIDB sections
  corpse_desc: { en: 'UIDB Details', hi: 'यूआईडीबी विवरण' },
  corpse_physical: { en: 'Physical Description', hi: 'शारीरिक हुलिया' },
  inquest_details: { en: 'Inquest Details', hi: 'जांच विवरण' },
  uidb_details: { en: 'UIDB Details', hi: 'UIDB विवरण' },

  // Missing sections
  person_details: { en: 'Person Details', hi: 'व्यक्ति विवरण' },
  missing_address: { en: 'Address Details', hi: 'पता विवरण' },
  missing_physical: { en: 'Physical Description', hi: 'शारीरिक हुलिया' },
  accompanying_children: { en: 'Accompanying Children', hi: 'साथ में बच्चे' },
  contacts_assigned: { en: 'Informant Contact', hi: 'सूचना प्रदाता संपर्क' },

  // Common
  complaint_details: { en: 'Complaint Details', hi: 'शिकायत विवरण' },
  investigation_officer: { en: 'Investigating Officer', hi: 'जांच अधिकारी' },
  vehicle_details: { en: 'Vehicle Details', hi: 'वाहन का विवरण' },
  financial_fraud: { en: 'Financial Fraud', hi: 'वित्तीय धोखाधड़ी' },
  special_scheme: { en: 'Special Scheme', hi: 'विशेष योजना' },
  procedure_slips: { en: 'Procedural Slips', hi: 'प्रक्रियात्मक पर्ची' }
};
