export const COUNTRY_OPTS = [
  'Indian', 'Nepalese', 'Bhutanese', 'Bangladeshi', 'Pakistani', 
  'Sri Lankan', 'Afghan', 'Myanmar', 'Tibetan', 'American', 'British', 'Canadian', 'Other'
];

export const STATE_OPTS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other UT/State'
];

export const DISTRICT_OPTS = [
  "South District (SD)", "South East District (SED)", "New Delhi District (NDD)",
  "South West District (SWD)", "West District (WD)", "Outer District (OD)",
  "Dwarka District (DW)", "North West District (NWD)", "Rohini District (ROH)",
  "Outer North District (OND)", "Central District (CD)", "North District (ND)",
  "East District (ED)", "North East District (NED)", "Shahdara District (SHD)"
];

const getPersonFieldsList = (prefix, labelPrefixEn, labelPrefixHi) => {
  return [
    { field_key: `${prefix}_npr`, label_en: `${labelPrefixEn} NPR No.`, label_hi: `${labelPrefixHi} एनपीआर संख्या`, required: false, hint: 'NPR Number' },
    { field_key: `${prefix}_first_name`, label_en: `${labelPrefixEn} First Name`, label_hi: `${labelPrefixHi} पहला नाम`, required: true, hint: 'First Name' },
    { field_key: `${prefix}_middle_name`, label_en: `${labelPrefixEn} Middle Name`, label_hi: `${labelPrefixHi} मध्यम नाम`, required: false, hint: 'Middle Name' },
    { field_key: `${prefix}_last_name`, label_en: `${labelPrefixEn} Last Name`, label_hi: `${labelPrefixHi} अंतिम नाम`, required: false, hint: 'Last Name' },
    { field_key: `${prefix}_nickname`, label_en: `${labelPrefixEn} Alias`, label_hi: `${labelPrefixHi} उपनाम`, required: false, hint: 'Nickname or alias' },
    { field_key: `${prefix}_gender`, label_en: `${labelPrefixEn} Gender`, label_hi: `${labelPrefixHi} लिंग`, required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'] },
    { field_key: `${prefix}_marital_status`, label_en: `${labelPrefixEn} Marital Status`, label_hi: `${labelPrefixHi} वैवाहिक स्थिति`, required: false, options: ['Married', 'Unmarried', 'Divorced', 'Widowed', 'Single', 'Unknown'] },
    { field_key: `${prefix}_relation_type`, label_en: `${labelPrefixEn} Relation Type`, label_hi: `${labelPrefixHi} संबंध का प्रकार`, required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other'] },
    { field_key: `${prefix}_relative_name`, label_en: `${labelPrefixEn} Relative Name`, label_hi: `${labelPrefixHi} रिश्तेदार का नाम`, required: false, hint: 'Father\'s or Husband\'s Name' },
    { field_key: `${prefix}_mobile_country_code`, label_en: `${labelPrefixEn} Mobile Country Code`, label_hi: `${labelPrefixHi} मोबाइल देश कोड`, required: false, hint: 'e.g. +91' },
    { field_key: `${prefix}_mobile`, label_en: `${labelPrefixEn} Mobile No.`, label_hi: `${labelPrefixHi} मोबाइल नंबर`, required: false, hint: '10-digit mobile number' },
    { field_key: `${prefix}_qualification`, label_en: `${labelPrefixEn} Qualification`, label_hi: `${labelPrefixHi} योग्यता`, required: false, options: ['Uneducated', '10th', '10+2', 'Graduate', 'Post-Graduate'] },
    { field_key: `${prefix}_dob`, label_en: `${labelPrefixEn} Date of Birth`, label_hi: `${labelPrefixHi} जन्म तिथि`, required: false, hint: 'YYYY-MM-DD' },
    { field_key: `${prefix}_age_year`, label_en: `${labelPrefixEn} Age (Years)`, label_hi: `${labelPrefixHi} आयु (वर्ष)`, required: false, hint: 'Age in years' },
    { field_key: `${prefix}_birth_year`, label_en: `${labelPrefixEn} Year of Birth`, label_hi: `${labelPrefixHi} जन्म का वर्ष`, required: false, hint: 'e.g. 1995' },
    { field_key: `${prefix}_house_no`, label_en: `${labelPrefixEn} House No.`, label_hi: `${labelPrefixHi} मकान संख्या`, required: false, hint: 'House Number' },
    { field_key: `${prefix}_street`, label_en: `${labelPrefixEn} Street`, label_hi: `${labelPrefixHi} गली / सड़क`, required: false, hint: 'Street name' },
    { field_key: `${prefix}_colony`, label_en: `${labelPrefixEn} Colony`, label_hi: `${labelPrefixHi} कॉलोनी`, required: false, hint: 'Colony name' },
    { field_key: `${prefix}_city_town_village`, label_en: `${labelPrefixEn} Village / City / Town`, label_hi: `${labelPrefixHi} गांव / शहर / नगर`, required: false, hint: 'Village/City' },
    { field_key: `${prefix}_tehsil_block_mandal`, label_en: `${labelPrefixEn} Tehsil / Block / Mandal`, label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`, required: false, hint: 'Tehsil' },
    { field_key: `${prefix}_present_address`, label_en: `${labelPrefixEn} Full Present Address`, label_hi: `${labelPrefixHi} वर्तमान पता`, required: false, hint: 'Full residential address' },
    { field_key: `${prefix}_country`, label_en: `${labelPrefixEn} Nationality`, label_hi: `${labelPrefixHi} राष्ट्रीयता`, required: false, options: COUNTRY_OPTS },
    { field_key: `${prefix}_state`, label_en: `${labelPrefixEn} State`, label_hi: `${labelPrefixHi} राज्य`, required: false, options: STATE_OPTS },
    { field_key: `${prefix}_district`, label_en: `${labelPrefixEn} District`, label_hi: `${labelPrefixHi} जिला`, required: false, options: DISTRICT_OPTS },
    { field_key: `${prefix}_police_station`, label_en: `${labelPrefixEn} Police Station`, label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`, required: false, hint: 'Police Station' },
    { field_key: `${prefix}_pincode`, label_en: `${labelPrefixEn} Pin Code`, label_hi: `${labelPrefixHi} पिन कोड`, required: false, hint: '6-digit PIN code' }
  ];
};

const getAddressFieldsList = (prefix, labelPrefixEn, labelPrefixHi) => {
  return [
    { field_key: `${prefix}_house_no`, label_en: `${labelPrefixEn} House No.`, label_hi: `${labelPrefixHi} मकान संख्या`, required: false, hint: 'House Number' },
    { field_key: `${prefix}_street`, label_en: `${labelPrefixEn} Street`, label_hi: `${labelPrefixHi} गली / सड़क`, required: false, hint: 'Street name' },
    { field_key: `${prefix}_colony`, label_en: `${labelPrefixEn} Colony`, label_hi: `${labelPrefixHi} कॉलोनी`, required: false, hint: 'Colony name' },
    { field_key: `${prefix}_city_town_village`, label_en: `${labelPrefixEn} Village / City / Town`, label_hi: `${labelPrefixHi} गांव / शहर / नगर`, required: false, hint: 'Village/City' },
    { field_key: `${prefix}_tehsil_block_mandal`, label_en: `${labelPrefixEn} Tehsil / Block / Mandal`, label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`, required: false, hint: 'Tehsil' },
    { field_key: `${prefix}_country`, label_en: `${labelPrefixEn} Nationality`, label_hi: `${labelPrefixHi} राष्ट्रीयता`, required: false, options: COUNTRY_OPTS },
    { field_key: `${prefix}_state`, label_en: `${labelPrefixEn} State`, label_hi: `${labelPrefixHi} राज्य`, required: false, options: STATE_OPTS },
    { field_key: `${prefix}_district`, label_en: `${labelPrefixEn} District`, label_hi: `${labelPrefixHi} जिला`, required: false, options: DISTRICT_OPTS },
    { field_key: `${prefix}_police_station`, label_en: `${labelPrefixEn} Police Station`, label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`, required: false, hint: 'Police Station' },
    { field_key: `${prefix}_pincode`, label_en: `${labelPrefixEn} Pin Code`, label_hi: `${labelPrefixHi} पिन कोड`, required: false, hint: '6-digit PIN code' }
  ];
};

export const caseGeneralFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'e.g. FIR-220/2026' },
  { field_key: 'fir_date', label_en: 'FIR Date', label_hi: 'प्राथमिकी (FIR) तिथि', required: true, hint: 'YYYY-MM-DD' },
  { field_key: 'district', label_en: 'District', label_hi: 'जिला', required: true, hint: 'e.g. New Delhi District (NDD)' },
  { field_key: 'police_station', label_en: 'Police Station', label_hi: 'थाना', required: true, hint: 'e.g. Parliament Street' },
  { field_key: 'local_head', label_en: 'Local Head', label_hi: 'स्थानीय शीर्ष', required: false, hint: 'e.g. Theft / Larceny' },
  { field_key: 'under_section', label_en: 'Under Section', label_hi: 'धारा के अंतर्गत', required: false, hint: 'e.g. Section 379 IPC' },
  { field_key: 'case_type', label_en: 'Case Type', label_hi: 'मामले का प्रकार', required: false, hint: 'e.g. Property Theft' },
  //{ field_key: 'sid_number', label_en: 'SID Number', label_hi: 'एसआईडी संख्या', required: false, hint: 'e.g. SID-889021' },
  { field_key: 'cctns_number', label_en: 'CCTNS Number', label_hi: 'सीसीटीएनएस संख्या', required: false, hint: 'e.g. CCTNS-202699104' },
  { field_key: 'beat_number', label_en: 'Beat Number', label_hi: 'बीट संख्या', required: false, hint: 'e.g. Beat No. 4' },
  { field_key: 'occurrence_date', label_en: 'Occurrence Date', label_hi: 'घटना की तिथि', required: false, hint: 'YYYY-MM-DD' },
  { field_key: 'occurrence_time', label_en: 'Occurrence Time', label_hi: 'घटना का समय', required: false, hint: 'HH:MM' },
  { field_key: 'occurrence_place', label_en: 'Occurrence Place', label_hi: 'घटना का स्थान', required: false, hint: 'e.g. Patel Chowk Metro parking' },
  { field_key: 'brief_facts', label_en: 'Brief Facts of Case', label_hi: 'मामले के संक्षिप्त तथ्य', required: false, hint: 'Incident narrative' },
  { field_key: 'status_remarks', label_en: 'Status / Remarks', label_hi: ' स्थिति / टिप्पणियाँ', required: false, hint: 'e.g. Under investigation' },
  
  ...getPersonFieldsList('complainant', 'Complainant', 'शिकायतकर्ता').filter(f => f.field_key !== 'complainant_npr'),
  { field_key: 'complainant_perm_same', label_en: 'Is Complainant Permanent Same As Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  ...getAddressFieldsList('complainant_perm', 'Complainant Permanent Address', 'शिकायतकर्ता का स्थायी पता'),
  ...getAddressFieldsList('occurrence', 'Place of Occurrence Address', 'घटनास्थल का पता विवरण'),

  { field_key: 'io_name', label_en: 'IO Name', label_hi: 'जांच अधिकारी का नाम', required: false, hint: 'e.g. Inspector Ravindra Singh' },
  { field_key: 'io_pis', label_en: 'PIS Number', label_hi: 'पीआईएस संख्या', required: false, hint: 'e.g. 28080214' },
  { field_key: 'io_mobile', label_en: 'Mobile Number', label_hi: 'मोबाइल नंबर', required: false, hint: 'IO contact number' },
  { field_key: 'date_of_arrest', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि', required: false, hint: 'YYYY-MM-DD' }
];

export const caseActSectionFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  { field_key: 'act', label_en: 'Act', label_hi: 'अधिनियम', required: true, hint: 'e.g. IPC / BNS' },
  { field_key: 'sections', label_en: 'Sections', label_hi: 'धाराएं', required: true, hint: 'e.g. Sec 379/411' },
  { field_key: 'crime_head', label_en: 'Crime Head', label_hi: 'अपराध शीर्ष', required: false, hint: 'e.g. Burglary / Snatching' },
  { field_key: 'major_head', label_en: 'Major Head', label_hi: 'मुख्य शीर्ष', required: false },
  { field_key: 'minor_head', label_en: 'Minor Head', label_hi: 'लघु शीर्ष', required: false },
  { field_key: 'local_head', label_en: 'Local Head', label_hi: 'स्थानीय शीर्ष', required: false, hint: 'e.g. Snatching / Theft' }
];

export const caseVictimFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  
  // --- Victim Personal Details ---
  // { field_key: 'victim_npr', label_en: 'Victim NPR No.', label_hi: 'पीड़ित एनपीआर संख्या', required: false }, // ❌ Excluded
  { field_key: 'victim_first_name', label_en: 'Victim First Name', label_hi: 'पीड़ित पहला नाम', required: true, hint: 'First Name' },
  { field_key: 'victim_middle_name', label_en: 'Victim Middle Name', label_hi: 'पीड़ित मध्यम नाम', required: false }, // ❌ Excluded
  { field_key: 'victim_last_name', label_en: 'Victim Last Name', label_hi: 'पीड़ित अंतिम नाम', required: false },
  { field_key: 'victim_nickname', label_en: 'Victim Alias', label_hi: 'पीड़ित उपनाम', required: false }, // ❌ Excluded
  { field_key: 'victim_gender', label_en: 'Victim Gender', label_hi: 'पीड़ित लिंग', required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'] },
  { field_key: 'victim_marital_status', label_en: 'Victim Marital Status', label_hi: 'पीड़ित वैवाहिक स्थिति', required: false, options: ['Married', 'Unmarried', 'Divorced', 'Widowed', 'Single', 'Unknown'] },
  { field_key: 'victim_relation_type', label_en: 'Victim Relation Type', label_hi: 'पीड़ित संबंध का प्रकार', required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other'] },
  { field_key: 'victim_relative_name', label_en: 'Victim Relative Name', label_hi: 'पीड़ित रिश्तेदार का नाम', required: false, hint: 'Father\'s or Husband\'s Name' },
  { field_key: 'victim_mobile_country_code', label_en: 'Victim Mobile Country Code', label_hi: 'पीड़ित मोबाइल देश कोड', required: false },
  { field_key: 'victim_mobile', label_en: 'Victim Mobile No.', label_hi: 'पीड़ित मोबाइल नंबर', required: false, hint: '10-digit mobile number' },
  { field_key: 'victim_qualification', label_en: 'Victim Qualification', label_hi: 'पीड़ित योग्यता', required: false, options: ['Uneducated', '10th', '10+2', 'Graduate', 'Post-Graduate'] },
  { field_key: 'victim_dob', label_en: 'Victim Date of Birth', label_hi: 'पीड़ित जन्म तिथि', required: false, hint: 'YYYY-MM-DD' },
  { field_key: 'victim_age_year', label_en: 'Victim Age (Years)', label_hi: 'पीड़ित आयु (वर्ष)', required: false },
  { field_key: 'victim_birth_year', label_en: 'Victim Year of Birth', label_hi: 'पीड़ित जन्म का वर्ष', required: false },
  
  // --- Victim Present Address ---
  { field_key: 'victim_house_no', label_en: 'Victim House No.', label_hi: 'पीड़ित मकान संख्या', required: false },
  { field_key: 'victim_street', label_en: 'Victim Street', label_hi: 'पीड़ित गली / सड़क', required: false },
  { field_key: 'victim_colony', label_en: 'Victim Colony', label_hi: 'पीड़ित कॉलोनी', required: false },
  { field_key: 'victim_city_town_village', label_en: 'Victim Village / City / Town', label_hi: 'पीड़ित गांव / शहर / नगर', required: false },
  { field_key: 'victim_tehsil_block_mandal', label_en: 'Victim Tehsil / Block / Mandal', label_hi: 'पीड़ित तहसील / ब्लॉक / मंडल', required: false },
  { field_key: 'victim_present_address', label_en: 'Victim Full Present Address', label_hi: 'पीड़ित वर्तमान पता', required: false },
  { field_key: 'victim_country', label_en: 'Victim Nationality', label_hi: 'पीड़ित राष्ट्रीयता', required: false, options: COUNTRY_OPTS },
  { field_key: 'victim_state', label_en: 'Victim State', label_hi: 'पीड़ित राज्य', required: false, options: STATE_OPTS },
  { field_key: 'victim_district', label_en: 'Victim District', label_hi: 'पीड़ित जिला', required: false, options: DISTRICT_OPTS },
  { field_key: 'victim_police_station', label_en: 'Victim Police Station', label_hi: 'पीड़ित पुलिस स्टेशन (PS)', required: false },
  { field_key: 'victim_pincode', label_en: 'Victim Pin Code', label_hi: 'पीड़ित पिन कोड', required: false },

  // --- Victim Permanent Address Toggle ---
  { field_key: 'victim_perm_same', label_en: 'Is Victim Permanent Address Same As Present?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  
  // You can also comment out individual permanent address fields from here if needed
  ...getAddressFieldsList('victim_perm', 'Victim Permanent Address', 'पीड़ित का स्थायी पता')
];


export const caseAccusedFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  ...getPersonFieldsList('accused', 'Accused', 'अभियुक्त'),
  { field_key: 'accused_perm_same', label_en: 'Is Accused Permanent Address Same As Present?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  ...getAddressFieldsList('accused_perm', 'Accused Permanent Address', 'अभियुक्त का स्थायी पता')
];

export const casePropertyFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  { field_key: 'property_major_category', label_en: 'Property Major Category', label_hi: 'संपत्ति मुख्य श्रेणी', required: false, options: ['Vehicle', 'Mobile Phone', 'Cash', 'Jewellery', 'Electronics', 'Documents', 'Drugs', 'Arms', 'Others'] },
  { field_key: 'property_minor_category', label_en: 'Type of property', label_hi: 'संपत्ति का प्रकार', required: false },
  { field_key: 'property_details', label_en: 'Property Details / Description', label_hi: 'संपत्ति का विवरण', required: false },
  { field_key: 'property_stolen_recovered', label_en: 'Property Stolen / Recovered', label_hi: 'संपत्ति चोरी / बरामद स्थिति', required: false, options: ['Stolen', 'Recovered', 'Involved', 'Seized'] },
  { field_key: 'property_value', label_en: 'Property Value in inr', label_hi: 'संपत्ति का मूल्य (INR में)', required: false }
];

export const arrestGeneralFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'e.g. FIR-104/2026' },
  { field_key: 'fir_date', label_en: 'FIR Date', label_hi: 'प्राथमिकी (FIR) तिथि', required: false, hint: 'YYYY-MM-DD' },
  { field_key: 'district', label_en: 'District', label_hi: 'जिला', required: true, hint: 'e.g. New Delhi District (NDD)' },
  { field_key: 'police_station', label_en: 'Police Station', label_hi: 'थाना', required: true, hint: 'e.g. Parliament Street' },
  { field_key: 'date_of_arrest', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि', required: true, hint: 'YYYY-MM-DD' },
  { field_key: 'time_of_arrest', label_en: 'Time Of Arrest', label_hi: 'गिरफ्तारी का समय', required: false, hint: 'HH:MM' },
  { field_key: 'place_of_arrest', label_en: 'Place Of Arrest', label_hi: 'गिरफ्तारी का स्थान', required: true, hint: 'e.g. Nizamuddin Platform 3' },
  { field_key: 'io_name', label_en: 'IO / Officer Name', label_hi: 'जांच अधिकारी का नाम', required: false, hint: 'e.g. Inspector Ravindra Singh' },
  { field_key: 'io_pis', label_en: 'PIS No. of IO', label_hi: 'पीआईएस संख्या', required: false, hint: 'e.g. 28080214' },
  { field_key: 'io_rank', label_en: 'IO Rank', label_hi: 'पद', required: false, hint: 'e.g. SI' },
  { field_key: 'io_mobile', label_en: 'IO Mobile No.', label_hi: 'मोबाइल नंबर', required: false, hint: 'IO contact number' }
];

export const arrestActSectionFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  { field_key: 'act', label_en: 'Act', label_hi: 'अधिनियम', required: true, hint: 'e.g. IPC / BNS' },
  { field_key: 'sections', label_en: 'Sections', label_hi: 'धाराएं', required: true, hint: 'e.g. Sec 379/411' },
  { field_key: 'crime_head', label_en: 'Crime Head', label_hi: 'अपराध शीर्ष', required: false, hint: 'e.g. Burglary / Snatching' },
  { field_key: 'major_head', label_en: 'Major Head', label_hi: 'मुख्य शीर्ष', required: false },
  { field_key: 'minor_head', label_en: 'Minor Head', label_hi: 'लघु शीर्ष', required: false },
  { field_key: 'local_head', label_en: 'Local Head', label_hi: 'स्थानीय शीर्ष', required: false, hint: 'e.g. Snatching / Theft' }
];

export const arrestPersonFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  { field_key: 'date_of_arrest', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि', required: false, hint: 'YYYY-MM-DD' },
  { field_key: 'time_of_arrest', label_en: 'Time Of Arrest', label_hi: 'गिरफ्तारी का समय', required: false, hint: 'HH:MM' },
  ...getPersonFieldsList('arrested', 'Arrested Person', 'गिरफ्तार व्यक्ति'),
  { field_key: 'arrested_perm_same', label_en: 'Is Permanent Address same as Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: true, options: ['Yes', 'No'] },
  { field_key: 'arrested_perm_address', label_en: 'Full Permanent Address', label_hi: 'स्थायी पता', required: false },
  ...getAddressFieldsList('arrested_perm', 'Arrested Person Permanent Address', 'गिरफ्तार व्यक्ति का स्थायी पता'),
  { field_key: 'nafis_prepared', label_en: 'NAFIS Prepared', label_hi: 'नाफिस तैयार किया गया', required: false, options: ['Yes', 'No'] },
  { field_key: 'dossier_prepared', label_en: 'Dossier Prepared', label_hi: 'डोजियर तैयार किया गया', required: false, options: ['Yes', 'No'] },
  { field_key: 'prev_involvement', label_en: 'Previous involvement', label_hi: 'पूर्व संलिप्तता', required: false, options: ['Yes', 'No'] },
  { field_key: 'bad_character', label_en: 'Bad Character (BC)', label_hi: 'बुरा चरित्र (BC)', required: false, options: ['Yes', 'No'] },
  { field_key: 'proclaimed_offender', label_en: 'Proclaimed Offender (PO)', label_hi: 'घोषित अपराधी (PO)', required: false, options: ['Yes', 'No'] },
  { field_key: 'verifying_officer_name', label_en: 'Arresting Officer Name', label_hi: 'गिरफ्तार करने वाले अधिकारी का नाम', required: false },
  { field_key: 'verifying_officer_rank', label_en: 'Arresting Officer Rank', label_hi: 'गिरफ्तार करने वाले अधिकारी का पद', required: false },
  { field_key: 'status', label_en: 'Custody status', label_hi: 'हिरासत की स्थिति', required: false },
  { field_key: 'scheme_of_arrest', label_en: 'Scheme of arrest', label_hi: 'गिरफ्तारी की योजना', required: false },
  { field_key: 'kin_name', label_en: 'Relative Name', label_hi: 'रिश्तेदार का नाम', required: false },
  { field_key: 'kin_mobile', label_en: 'Mobile', label_hi: 'मोबाइल', required: false },
  { field_key: 'kin_relationship', label_en: 'Relationship', label_hi: 'संबंध', required: false },
  { field_key: 'photo_path', label_en: 'Mugshot Filename', label_hi: 'फोटो फाइल नाम', required: false }
];

export const arrestPropertyFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  { field_key: 'property_major_category', label_en: 'Property Major Category', label_hi: 'संपत्ति मुख्य श्रेणी', required: false, options: ['Vehicle', 'Mobile Phone', 'Cash', 'Jewellery', 'Electronics', 'Documents', 'Drugs', 'Arms', 'Others'] },
  { field_key: 'property_details', label_en: 'Property Details / Description', label_hi: 'संपत्ति का विवरण', required: false },
  { field_key: 'property_stolen_recovered', label_en: 'Property Stolen / Recovered', label_hi: 'संपत्ति चोरी / बरामद स्थिति', required: false, options: ['Stolen', 'Recovered', 'Involved', 'Seized'] },
  { field_key: 'property_minor_category', label_en: 'Type of property', label_hi: 'संपत्ति का प्रकार', required: false },
  { field_key: 'property_value', label_en: 'Property Value in inr', label_hi: 'संपत्ति का मूल्य (INR में)', required: false }
  // { field_key: 'property_phone_number', label_en: 'Phone Number', label_hi: 'फोन नंबर', required: false },
  // { field_key: 'phone_make', label_en: 'Phone Make / Brand', label_hi: 'फोन का ब्रांड', required: false },
  // { field_key: 'phone_model', label_en: 'Phone Model', label_hi: 'फोन का मॉडल', required: false },
  // { field_key: 'phone_imei', label_en: 'IMEI Number', label_hi: 'आईएमईआई नंबर', required: false },
  // { field_key: 'phone_color', label_en: 'Phone Color', label_hi: 'फोन का रंग', required: false }
];

export const CASE_SHEETS_CONFIG = {
  general: caseGeneralFields.map(f => f.field_key),
  victim: caseVictimFields.map(f => f.field_key),
  act_section: caseActSectionFields.map(f => f.field_key),
  accused: caseAccusedFields.map(f => f.field_key),
  property: casePropertyFields.map(f => f.field_key)
};

export const ARREST_SHEETS_CONFIG = {
  general: arrestGeneralFields.map(f => f.field_key),
  act_section: arrestActSectionFields.map(f => f.field_key),
  person: arrestPersonFields.map(f => f.field_key),
  property: arrestPropertyFields.map(f => f.field_key)
};
