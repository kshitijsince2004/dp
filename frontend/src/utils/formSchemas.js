/**
 * Static form section/field schemas used by RecordDetail send-back field lists.
 * Live form rendering uses GET /forms/:recordType from the backend; this registry
 * is a local fallback for known field keys only.
 */

export const formSchemas = {
  CASE: [
    {
      section: 'general_info',
      title_en: 'General Case Metadata',
      title_hi: 'सामान्य मामला मेटाडेटा',
      fields: [
        {
          field_key: 'case_type',
          field_type: 'SELECT',
          label_en: 'Case Registration Type',
          label_hi: 'मामला पंजीकरण प्रकार',
          validation_rules: { required: true },
          options: [
            { value: 'cctns(manual FIR)', label_en: 'cctns(manual FIR)', label_hi: 'सीसीटीएनएस (मैनुअल एफआईआर)' },
            { value: 'eTheft', label_en: 'eTheft', label_hi: 'ई-चोरी' },
            { value: 'eMVT', label_en: 'eMVT', label_hi: 'ई-एमवीटी' },
            { value: 'NCRP', label_en: 'NCRP', label_hi: 'एनसीआरपी' },
            { value: 'zero FIR', label_en: 'zero FIR', label_hi: 'जीरो एफआईआर' }
          ]
        },
        { field_key: 'fir_no', field_type: 'TEXT', label_en: 'FIR Number,Date & Time', label_hi: 'प्राथमिकी (FIR) संख्या और दिनांक', validation_rules: { required: true } },
        { field_key: 'gd_no', field_type: 'TEXT', label_en: 'GD Entry Number', label_hi: 'जी.डी. प्रविष्टि संख्या', validation_rules: { required: true } },
        { field_key: 'record_date', field_type: 'DATE', label_en: 'Diary Record Date', label_hi: 'दैनिक डायरी तिथि', validation_rules: { required: true } },
        {
          field_key: 'status',
          field_type: 'SELECT',
          label_en: 'Case Status',
          label_hi: 'मामले की स्थिति',
          options: [
            { value: 'CHARGE SHEET', label_en: 'CHARGE SHEET', label_hi: 'आरोप पत्र (CHARGE SHEET)' },
            { value: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_en: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_hi: 'पुलिस जांच रिपोर्ट (PIR-JCL)' },
            { value: 'UNTRACED', label_en: 'UNTRACED', label_hi: 'अनट्रेस (UNTRACED)' },
            { value: 'PENDING', label_en: 'PENDING', label_hi: 'लंबित (PENDING)' },
            { value: 'CANCELLATION', label_en: 'CANCELLATION', label_hi: 'रद्दीकरण (CANCELLATION)' },
            { value: 'QUASHED', label_en: 'QUASHED', label_hi: 'खारिज (QUASHED)' },
            { value: 'CLOSURE REPORT', label_en: 'CLOSURE REPORT', label_hi: 'क्लोजर रिपोर्ट (CLOSURE REPORT)' },
            { value: 'RELEASED U/S 189 BNSS', label_en: 'RELEASED U/S 189 BNSS', label_hi: 'धारा 189 BNSS के तहत रिहा' },
            { value: 'TRANSFER', label_en: 'TRANSFER', label_hi: 'स्थानांतरण (TRANSFER)' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'is_important',
          field_type: 'BOOLEAN',
          label_en: 'Mark as Important Case',
          label_hi: 'महत्वपूर्ण मामले के रूप में चिह्नित करें',
          validation_rules: { required: false }
        },
      ]
    },
    {
      section: 'incident_details',
      title_en: 'Incident Details',
      title_hi: 'घटना का विवरण',
      fields: [
        { field_key: 'occurrence_place', field_type: 'TEXT', label_en: 'Place of Occurrence', label_hi: 'घटना का स्थान', validation_rules: { required: true } },
        { field_key: 'brief_facts', field_type: 'TEXTAREA', label_en: 'Brief Facts of the Case', label_hi: 'मामले के संक्षिप्त तथ्य', validation_rules: { required: true } },
        {
          field_key: 'local_head',
          field_type: 'SELECT',
          label_en: 'Local Case Head / Crime Class',
          label_hi: 'स्थानीय मामला श्रेणी / अपराध वर्गीकरण',
          options: [
            { value: 'Theft', label_en: 'Theft', label_hi: 'चोरी' },
            { value: 'Robbery', label_en: 'Robbery', label_hi: 'डकैती' },
            { value: 'Burglary', label_en: 'Burglary', label_hi: 'सेंधमारी' },
            { value: 'Assault', label_en: 'Assault on Public Servant', label_hi: 'लोक सेवक पर हमला' },
            { value: 'Murder', label_en: 'Murder (S.103 BNS)', label_hi: 'हत्या' },
            { value: 'Riot', label_en: 'Rioting', label_hi: 'दंगा' },
            { value: 'Other', label_en: 'Other IPC/BNS Offences', label_hi: 'अन्य आईपीसी/बीएनएस अपराध' }
          ],
          validation_rules: { required: true }
        },
        { field_key: 'act_name', field_type: 'TEXT', label_en: 'Act Name', label_hi: 'अधिनियम का नाम', validation_rules: { required: true } },
        { field_key: 'sections', field_type: 'TEXT', label_en: 'Section(s) Code', label_hi: 'संबद्ध धारा संख्या(एँ)', validation_rules: { required: true } },
        { field_key: 'beat_no', field_type: 'NUMBER', label_en: 'Police Beat Code', label_hi: 'पुलिस बीट संख्या', validation_rules: { required: false } },
      ]
    },
    {
      section: 'investigation_officer',
      title_en: 'Investigating Officer Details',
      title_hi: 'जांच अधिकारी का विवरण',
      fields: [
        { field_key: 'io_name', field_type: 'TEXT', label_en: 'Investigating Officer (IO) Name', label_hi: 'जांच अधिकारी का नाम', validation_rules: { required: true } },
        { field_key: 'io_pis', field_type: 'TEXT', label_en: 'IO PIS / Badge Number', label_hi: 'जांच अधिकारी का PIS संख्या', validation_rules: { required: true } },
        { field_key: 'io_mobile', field_type: 'PHONE', label_en: 'IO Mobile Number', label_hi: 'जांच अधिकारी का मोबाइल नंबर', validation_rules: { required: true } },
      ]
    },
    {
      section: 'property_details',
      title_en: 'Properties Involved',
      title_hi: 'शामिल संपत्ति',
      is_repeater: true,
      entity_type: 'property',
      fields: [
        {
          field_key: 'property_major_category',
          field_type: 'SELECT',
          label_en: 'Property Major Category',
          label_hi: 'संपत्ति मुख्य श्रेणी',
          options: [
            { value: 'Vehicle', label_en: 'Vehicle', label_hi: 'वाहन' },
            { value: 'Mobile Phone', label_en: 'Mobile Phone', label_hi: 'मोबाइल फोन' },
            { value: 'Cash', label_en: 'Cash', label_hi: 'नकद' },
            { value: 'Jewellery', label_en: 'Gold/Jewellery', label_hi: 'सोना/आभूषण' },
            { value: 'Electronics', label_en: 'Electronics/Gadgets', label_hi: 'इलेक्ट्रॉनिक्स' },
            { value: 'Documents', label_en: 'Official/Personal Documents', label_hi: 'दस्तावेज़' },
            { value: 'Drugs', label_en: 'Drugs/Narcotics', label_hi: 'नशीले पदार्थ' },
            { value: 'Arms', label_en: 'Arms/Ammunition', label_hi: 'हथियार' },
            { value: 'Others', label_en: 'Others', label_hi: 'अन्य' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'property_minor_category',
          field_type: 'TEXT',
          label_en: 'Property Minor Category',
          label_hi: 'संपत्ति उप श्रेणी',
          validation_rules: { required: false }
        },
        {
          field_key: 'property_details',
          field_type: 'TEXTAREA',
          label_en: 'Property Details / Description',
          label_hi: 'संपत्ति का विवरण',
          validation_rules: { required: false }
        },
        {
          field_key: 'property_stolen_recovered',
          field_type: 'SELECT',
          label_en: 'Property Stolen / Recovered',
          label_hi: 'संपत्ति चोरी / बरामद स्थिति',
          options: [
            { value: 'Stolen', label_en: 'Stolen', label_hi: 'चोरी हुई' },
            { value: 'Recovered', label_en: 'Recovered', label_hi: 'बरामद' },
            { value: 'Involved', label_en: 'Involved', label_hi: 'शामिल' },
            { value: 'Seized', label_en: 'Seized', label_hi: 'जब्त' }
          ],
          validation_rules: { required: true }
        }
      ]
    },
    {
      section: 'intranet_flags',
      title_en: 'Intranet System Reference Flags',
      title_hi: 'इंट्रानेट सिस्टम संदर्भ झंडे',
      fields: [
        { field_key: 'cctns_flag', field_type: 'BOOLEAN', label_en: 'CCTNS Sync Done', label_hi: 'CCTNS सिंक पूर्ण', validation_rules: { required: false } },
        { field_key: 'etheft_flag', field_type: 'BOOLEAN', label_en: 'e-Theft Flagged', label_hi: 'ई-चोरी चिह्नित', validation_rules: { required: false } },
        { field_key: 'emvt_flag', field_type: 'BOOLEAN', label_en: 'e-MVT Auto Record', label_hi: 'ई-एमवीटी ऑटो रिकॉर्ड', validation_rules: { required: false } },
        { field_key: 'ncrp_flag', field_type: 'BOOLEAN', label_en: 'NCRP Portal Cross-reference', label_hi: 'NCRP पोर्टल क्रॉस-संदर्भ', validation_rules: { required: false } },
        { field_key: 'zero_fir_flag', field_type: 'BOOLEAN', label_en: 'Zero FIR Status', label_hi: 'शून्य प्राथमिकी स्थिति', validation_rules: { required: false } },
      ]
    }
  ],
  ARREST: [
    {
      section: 'linkages',
      title_en: 'Case Linkage Context',
      title_hi: 'केस लिंकेज संदर्भ',
      fields: [
        { field_key: 'linked_fir_dd_no', field_type: 'TEXT', label_en: 'Linked Case FIR / DD Number', label_hi: 'संबद्ध प्राथमिकी / डी.डी. संख्या', validation_rules: { required: false } },
        { field_key: 'linked_fir_dd_date', field_type: 'DATE', label_en: 'Linked Case FIR Date', label_hi: 'संबद्ध प्राथमिकी तिथि', validation_rules: { required: false } },
        { field_key: 'linked_fir_dd_time', field_type: 'TIME', label_en: 'Linked Case Occurrence Time', label_hi: 'संबद्ध घटना का समय', validation_rules: { required: false } },
        { field_key: 'record_date', field_type: 'DATE', label_en: 'Diary Record Date', label_hi: 'दैनिक डायरी तिथि', validation_rules: { required: true } },
      ]
    },
    {
      section: 'incident_details',
      title_en: 'Incident Details',
      title_hi: 'घटना का विवरण',
      fields: [
        { field_key: 'act_name', field_type: 'TEXT', label_en: 'Act Name', label_hi: 'अधिनियम का नाम', validation_rules: { required: true } },
        { field_key: 'sections', field_type: 'TEXT', label_en: 'Sections Code', label_hi: 'धारा संख्या(एँ)', validation_rules: { required: true } },
      ]
    },
    {
      section: 'offence_info',
      title_en: 'Offence Classification',
      title_hi: 'अपराध वर्गीकरण',
      fields: [
        {
          field_key: 'crime_head',
          field_type: 'SELECT',
          label_en: 'Crime Classification Head',
          label_hi: 'अपराध वर्गीकरण श्रेणी',
          options: [
            { value: 'Theft', label_en: 'Theft', label_hi: 'चोरी' },
            { value: 'Robbery', label_en: 'Robbery', label_hi: 'डकैती' },
            { value: 'Snatching', label_en: 'Snatching', label_hi: 'झपटमारी' },
            { value: 'Extortion', label_en: 'Extortion', label_hi: 'जबरन वसूली' },
            { value: 'Assault', label_en: 'Assault', label_hi: 'हमला / बल प्रयोग' },
            { value: 'Murder', label_en: 'Murder / Attempt', label_hi: 'हत्या / हत्या का प्रयास' },
            { value: 'Other', label_en: 'Other Offences', label_hi: 'अन्य अपराध' }
          ],
          validation_rules: { required: true }
        },
      ]
    },
    {
      section: 'arrestee_info',
      title_en: 'Arrest Event Details',
      title_hi: 'गिरफ्तारी घटना का विवरण',
      fields: [
        { field_key: 'arrest_date', field_type: 'DATE', label_en: 'Date of Arrest', label_hi: 'गिरफ्तारी की तिथि', validation_rules: { required: true } },
        { field_key: 'arrest_place', field_type: 'TEXT', label_en: 'House No. of Arrest', label_hi: 'गिरफ्तारी का मकान संख्या', validation_rules: { required: true } },
        { field_key: 'arrest_street', field_type: 'TEXT', label_en: 'Street of Arrest', label_hi: 'गिरफ्तारी का गली / सड़क', validation_rules: { required: false } },
        { field_key: 'arrest_colony', field_type: 'TEXT', label_en: 'Colony of Arrest', label_hi: 'गिरफ्तारी का कॉलोनी', validation_rules: { required: false } },
        {
          field_key: 'arrest_district',
          field_type: 'SELECT',
          label_en: 'District of Arrest',
          label_hi: 'गिरफ्तारी का जिला',
          options: [
            { value: "South District (SD)", label_en: "South District (SD)", label_hi: "South District (SD)" },
            { value: "South East District (SED)", label_en: "South East District (SED)", label_hi: "South East District (SED)" },
            { value: "New Delhi District (NDD)", label_en: "New Delhi District (NDD)", label_hi: "New Delhi District (NDD)" },
            { value: "South West District (SWD)", label_en: "South West District (SWD)", label_hi: "South West District (SWD)" },
            { value: "West District (WD)", label_en: "West District (WD)", label_hi: "West District (WD)" },
            { value: "Outer District (OD)", label_en: "Outer District (OD)", label_hi: "Outer District (OD)" },
            { value: "Dwarka District (DW)", label_en: "Dwarka District (DW)", label_hi: "Dwarka District (DW)" },
            { value: "North West District (NWD)", label_en: "North West District (NWD)", label_hi: "North West District (NWD)" },
            { value: "Rohini District (RND)", label_en: "Rohini District (RND)", label_hi: "Rohini District (RND)" },
            { value: "Outer North District (OND)", label_en: "Outer North District (OND)", label_hi: "Outer North District (OND)" },
            { value: "Central District (CD)", label_en: "Central District (CD)", label_hi: "Central District (CD)" },
            { value: "North District (ND)", label_en: "North District (ND)", label_hi: "North District (ND)" },
            { value: "East District (ED)", label_en: "East District (ED)", label_hi: "East District (ED)" },
            { value: "North East District (NED)", label_en: "North East District (NED)", label_hi: "North East District (NED)" },
            { value: "Shahdara District (SHD)", label_en: "Shahdara District (SHD)", label_hi: "Shahdara District (SHD)" }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'arrest_landmark', field_type: 'TEXT', label_en: 'Landmark of Arrest', label_hi: 'गिरफ्तारी का लैंडमार्क', validation_rules: { required: false } }
      ]
    },
    {
      section: 'arrested_personal_info',
      title_en: 'Arrested Person Personal Information',
      title_hi: 'गिरफ्तार व्यक्ति की व्यक्तिगत जानकारी',
      fields: [
        { field_key: 'arrested_npr', field_type: 'TEXT', label_en: 'Arrested Person NPR No.', label_hi: 'एनपीआर संख्या', validation_rules: { required: false } },
        { field_key: 'nick_name', field_type: 'TEXT', label_en: 'Nick Name', label_hi: 'उपनाम', validation_rules: { required: false } },
        { field_key: 'arrested_first_name', field_type: 'TEXT', label_en: 'First Name', label_hi: 'पहला नाम', validation_rules: { required: true } },
        { field_key: 'arrested_middle_name', field_type: 'TEXT', label_en: 'Middle Name', label_hi: 'मध्यम नाम', validation_rules: { required: false } },
        { field_key: 'arrested_last_name', field_type: 'TEXT', label_en: 'Last Name', label_hi: 'अंतिम नाम', validation_rules: { required: false } },
        {
          field_key: 'arrested_gender',
          field_type: 'SELECT',
          label_en: 'Gender',
          label_hi: 'लिंग',
          options: [
            { value: 'Male', label_en: 'Male', label_hi: 'पुरुष' },
            { value: 'Female', label_en: 'Female', label_hi: 'महिला' },
            { value: 'Transgender', label_en: 'Transgender', label_hi: 'ट्रांसजेंडर' },
            { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'arrested_relation_type',
          field_type: 'SELECT',
          label_en: 'Relation Type',
          label_hi: 'संबंध का प्रकार',
          options: [
            { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
            { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
            { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
            { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
            { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'arrested_relative_name', field_type: 'TEXT', label_en: 'Relative Name', label_hi: 'रिश्तेदार का नाम', validation_rules: { required: false } },
        { field_key: 'arrested_mobile', field_type: 'TEXT', label_en: 'Mobile No.', label_hi: 'मोबाइल नंबर', validation_rules: { required: false } },
        {
          field_key: 'arrested_qualification',
          field_type: 'SELECT',
          label_en: 'Arrested Person Qualification',
          label_hi: 'गिरफ्तार व्यक्ति की योग्यता',
          options: [
            { value: 'Uneducated', label_en: 'Uneducated', label_hi: 'अशिक्षित' },
            { value: '10th', label_en: '10th', label_hi: '10वीं' },
            { value: '10+2', label_en: '10+2', label_hi: '12वीं' },
            { value: 'Graduate', label_en: 'Graduate', label_hi: 'स्नातक' },
            { value: 'Post-Graduate', label_en: 'Post-Graduate', label_hi: 'स्नातकोत्तर' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'scheme_of_arrest',
          field_type: 'SELECT',
          label_en: 'Scheme of Arrest',
          label_hi: 'गिरफ्तारी की योजना',
          options: [
            { value: 'Integrated Pride', label_en: 'Integrated Pride', label_hi: 'Integrated Pride' },
            { value: 'Group Patrolling', label_en: 'Group Patrolling', label_hi: 'Group Patrolling' },
            { value: 'Anti-snatching', label_en: 'Anti-snatching', label_hi: 'Anti-snatching' },
            { value: 'By Prahari', label_en: 'By Prahari', label_hi: 'By Prahari' },
            { value: 'By Eyes & Ears Scheme Members', label_en: 'By Eyes & Ears Scheme Members', label_hi: 'By Eyes & Ears Scheme Members' },
            { value: 'Special Drive', label_en: 'Special Drive', label_hi: 'Special Drive' },
            { value: 'Cyber Hawk', label_en: 'Cyber Hawk', label_hi: 'Cyber Hawk' },
            { value: 'Kawach', label_en: 'Kawach', label_hi: 'Kawach' },
            { value: 'General', label_en: 'General', label_hi: 'General' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'scheme_of_arrest_other',
          field_type: 'TEXT',
          label_en: 'Scheme of Arrest (Specify)',
          label_hi: 'गिरफ्तारी की योजना (विवरण)',
          validation_rules: { required: true },
          show_when: { field: 'scheme_of_arrest', value: 'Other' }
        },
        { field_key: 'arrested_dob', field_type: 'DATE', label_en: 'Date of Birth', label_hi: 'जन्म तिथि', validation_rules: { required: false } },
        { field_key: 'arrested_age_year', field_type: 'NUMBER', label_en: 'Age (Years)', label_hi: 'आयु (वर्ष)', validation_rules: { required: false } },
        { field_key: 'arrested_birth_year', field_type: 'NUMBER', label_en: 'Year of Birth', label_hi: 'जन्म का वर्ष', validation_rules: { required: false } },
      ]
    },
    {
      section: 'arrested_address',
      title_en: 'Arrested Person Address',
      title_hi: 'गिरफ्तार व्यक्ति का पता',
      fields: [
        { field_key: 'arrested_house_no', field_type: 'TEXT', label_en: 'House No.', label_hi: 'मकान संख्या', validation_rules: { required: false } },
        { field_key: 'arrested_street', field_type: 'TEXT', label_en: 'Street', label_hi: 'गली / सड़क', validation_rules: { required: false } },
        { field_key: 'arrested_colony', field_type: 'TEXT', label_en: 'Colony', label_hi: 'कॉलोनी', validation_rules: { required: false } },
        { field_key: 'arrested_city_town_village', field_type: 'TEXT', label_en: 'Village / City / Town', label_hi: 'गांव / शहर / नगर', validation_rules: { required: false } },
        { field_key: 'arrested_tehsil_block_mandal', field_type: 'TEXT', label_en: 'Tehsil / Block / Mandal', label_hi: 'तहसील / ब्लॉक / मंडल', validation_rules: { required: false } },
        { field_key: 'arrested_present_address', field_type: 'TEXTAREA', label_en: 'Full Present Address', label_hi: 'वर्तमान पता', validation_rules: { required: false } },
        {
          field_key: 'arrested_country',
          field_type: 'SELECT',
          label_en: 'Nationality',
          label_hi: 'राष्ट्रीयता',
          options: [
            { value: 'Indian', label_en: 'Indian', label_hi: 'भारतीय' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'arrested_state',
          field_type: 'SELECT',
          label_en: 'State',
          label_hi: 'राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'arrested_district',
          field_type: 'SELECT',
          label_en: 'District',
          label_hi: 'जिला',
          options: [
            { value: 'New Delhi District (NDD)', label_en: 'New Delhi District (NDD)', label_hi: 'नई दिल्ली जिला' },
            { value: 'Central District', label_en: 'Central District', label_hi: 'मध्य जिला' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'arrested_police_station',
          field_type: 'SELECT',
          label_en: 'Police Station',
          label_hi: 'पुलिस स्टेशन (PS)',
          options: [
            { value: 'Parliament Street', label_en: 'Parliament Street', label_hi: 'संसद मार्ग' }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'arrested_pincode', field_type: 'TEXT', label_en: 'Pin Code', label_hi: 'पिन कोड', validation_rules: { required: false } },
        {
          field_key: 'arrested_perm_same',
          field_type: 'BOOLEAN',
          label_en: 'Is Permanent Address same as Present Address?',
          label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
          validation_rules: { required: true }
        },
        {
          field_key: 'arrested_perm_address',
          field_type: 'TEXTAREA',
          label_en: 'Full Permanent Address',
          label_hi: 'स्थायी पता',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_house_no',
          field_type: 'TEXT',
          label_en: 'Permanent House No.',
          label_hi: 'स्थायी मकान संख्या',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_street',
          field_type: 'TEXT',
          label_en: 'Permanent Street',
          label_hi: 'स्थायी गली / सड़क',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_colony',
          field_type: 'TEXT',
          label_en: 'Permanent Colony',
          label_hi: 'स्थायी कॉलोनी',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_city_town_village',
          field_type: 'TEXT',
          label_en: 'Permanent Village / City / Town',
          label_hi: 'स्थायी गांव / शहर / नगर',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_tehsil_block_mandal',
          field_type: 'TEXT',
          label_en: 'Permanent Tehsil / Block / Mandal',
          label_hi: 'स्थायी तहसील / ब्लॉक / मंडल',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_country',
          field_type: 'SELECT',
          label_en: 'Permanent Nationality',
          label_hi: 'स्थायी राष्ट्रीयता',
          options: [
            { value: 'Indian', label_en: 'Indian', label_hi: 'भारतीय' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_state',
          field_type: 'SELECT',
          label_en: 'Permanent State',
          label_hi: 'स्थायी राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_district',
          field_type: 'SELECT',
          label_en: 'Permanent District',
          label_hi: 'स्थायी जिला',
          options: [
            { value: 'New Delhi District (NDD)', label_en: 'New Delhi District (NDD)', label_hi: 'नई दिल्ली जिला' },
            { value: 'Central District', label_en: 'Central District', label_hi: 'मध्य जिला' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_police_station',
          field_type: 'SELECT',
          label_en: 'Permanent Police Station',
          label_hi: 'स्थायी पुलिस स्टेशन (PS)',
          options: [
            { value: 'Parliament Street', label_en: 'Parliament Street', label_hi: 'संसद मार्ग' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
        {
          field_key: 'arrested_perm_pincode',
          field_type: 'TEXT',
          label_en: 'Permanent Pin Code',
          label_hi: 'स्थायी पिन कोड',
          validation_rules: { required: false },
          show_when: { field: 'arrested_perm_same', value: false }
        },
      ]
    },
    {
      section: 'custody_status',
      title_en: 'Custody Status & Recoveries',
      title_hi: 'हिरासत की स्थिति और बरामदगी',
      fields: [
        {
          field_key: 'status',
          field_type: 'SELECT',
          label_en: 'Arrestee Status',
          label_hi: 'बंदी की स्थिति',
          options: [
            { value: 'police_custody', label_en: 'Police Custody', label_hi: 'पुलिस हिरासत' },
            { value: 'bail', label_en: 'Released on Bail', label_hi: 'जमानत पर रिहा' },
            { value: 'judicial_custody', label_en: 'Sent to Judicial Custody', label_hi: 'न्यायिक हिरासत में' },
            { value: 'released', label_en: 'Released', label_hi: 'रिहा' },
            { value: 'others', label_en: 'Others / Discharged', label_hi: 'अन्य / आरोपमुक्त' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'other_status_reason',
          field_type: 'TEXT',
          label_en: 'Reason for Other Status',
          label_hi: 'अन्य स्थिति का कारण',
          validation_rules: { required: false },
          show_when: { field: 'status', value: 'others' }
        },
        { field_key: 'recovery', field_type: 'TEXTAREA', label_en: 'Recovered Material Items', label_hi: 'बरामद की गई सामग्री', validation_rules: { required: false } },
      ]
    },
    {
      section: 'investigation_officer',
      title_en: 'Investigating Officer Details',
      title_hi: 'जांच अधिकारी का विवरण',
      fields: [
        { field_key: 'io_name', field_type: 'TEXT', label_en: 'IO Name', label_hi: 'जांच अधिकारी का नाम', validation_rules: { required: true } },
        { field_key: 'io_rank', field_type: 'TEXT', label_en: 'IO Rank', label_hi: 'जांच अधिकारी का पद', validation_rules: { required: false } },
        { field_key: 'io_pis', field_type: 'TEXT', label_en: 'IO PIS No.', label_hi: 'जांच अधिकारी का पीआईएस नंबर', validation_rules: { required: false } },
        { field_key: 'io_mobile', field_type: 'PHONE', label_en: 'IO Mobile Number', label_hi: 'जांच अधिकारी का मोबाइल नंबर', validation_rules: { required: true } },
      ]
    },
    {
      section: 'procedure_slips',
      title_en: 'Procedural Slips & Verification',
      title_hi: 'प्रक्रियात्मक पर्ची और सत्यापन',
      fields: [
        {
          field_key: 'nafis_prepared',
          field_type: 'SELECT',
          label_en: 'NAFIS Fingerprint Card Prepared',
          label_hi: 'NAFIS फिंगरप्रिंट कार्ड तैयार किया गया',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' },
            { value: 'Not Applicable', label_en: 'Not Applicable', label_hi: 'लागू नहीं' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'dossier_prepared',
          field_type: 'SELECT',
          label_en: 'Criminal Dossier Record Filed',
          label_hi: 'अपराधिक डोजियर रिकॉर्ड दर्ज',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' },
            { value: 'Pending', label_en: 'Pending Verification', label_hi: 'सत्यापन लंबित' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'search_slip_prepared',
          field_type: 'SELECT',
          label_en: 'Search Slip Filed in Registry',
          label_hi: 'खोज पर्ची (Search Slip) दर्ज',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'listed_criminal',
          field_type: 'BOOLEAN',
          label_en: 'Listed Criminal / Bad Character (BC)',
          label_hi: 'सूचीबद्ध अपराधी / बैड कैरेक्टर (BC)',
          validation_rules: { required: false }
        },
        {
          field_key: 'address_verified',
          field_type: 'SELECT',
          label_en: 'Physical Address Verified',
          label_hi: 'भौतिक पता सत्यापित',
          options: [
            { value: 'Verified', label_en: 'Verified', label_hi: 'सत्यापित' },
            { value: 'Not Verified', label_en: 'Not Verified', label_hi: 'सत्यापित नहीं' },
            { value: 'Pending', label_en: 'Verification Pending', label_hi: 'सत्यापन लंबित' }
          ],
          validation_rules: { required: true }
        },
        { field_key: 'verifying_officer_name', field_type: 'TEXT', label_en: 'Verifying Officer Name', label_hi: 'सत्यापन अधिकारी का नाम', validation_rules: { required: false } },
        { field_key: 'verifying_officer_rank', field_type: 'TEXT', label_en: 'Verifying Officer Rank', label_hi: 'सत्यापन अधिकारी का पद', validation_rules: { required: false } },
      ]
    },
    {
      section: 'informant_contact',
      title_en: 'Arrest Informant/Relative Info',
      title_hi: 'बंदी के संबंधी/सूचना प्राप्तकर्ता का विवरण',
      fields: [
        { field_key: 'informant_name', field_type: 'TEXT', label_en: 'Informant Name', label_hi: 'सूचना प्राप्तकर्ता का नाम', validation_rules: { required: true } },
        { field_key: 'informant_address', field_type: 'TEXTAREA', label_en: 'Informant Address', label_hi: 'सूचना प्राप्तकर्ता का पता', validation_rules: { required: false } },
        { field_key: 'informant_tel', field_type: 'PHONE', label_en: 'Informant Contact Tel.', label_hi: 'सूचना प्राप्तकर्ता का दूरभाष नंबर', validation_rules: { required: true } },
      ]
    }
  ],
  PCR_CALL: [
    {
      section: 'general_info',
      title_en: 'General Diary Logs',
      title_hi: 'सामान्य डायरी लॉग',
      fields: [
        { field_key: 'gd_no', field_type: 'TEXT', label_en: 'GD Entry Number', label_hi: 'जी.डी. प्रविष्टि संख्या', validation_rules: { required: true } },
        { field_key: 'record_date', field_type: 'DATE', label_en: 'Diary Record Date', label_hi: 'दैनिक डायरी तिथि', validation_rules: { required: true } }
      ]
    },
    {
      section: 'incident_details',
      title_en: 'Incident Details',
      title_hi: 'घटना विवरण',
      fields: [
        { field_key: 'occurrence_place', field_type: 'TEXT', label_en: 'Place of Occurrence', label_hi: 'घटना का स्थान', validation_rules: { required: false } },
        { field_key: 'occurrence_landmark', field_type: 'TEXT', label_en: 'Place of Occurrence Landmark', label_hi: 'घटनास्थल लैंडमार्क', validation_rules: { required: false } },
        { field_key: 'latitude', field_type: 'TEXT', label_en: 'Latitude', label_hi: 'अक्षांश', validation_rules: { required: false } },
        { field_key: 'longitude', field_type: 'TEXT', label_en: 'Longitude', label_hi: 'रेखांश', validation_rules: { required: false } },
        { field_key: 'arrival_time', field_type: 'TIME', label_en: 'Arrival Time', label_hi: 'आगमन का समय', validation_rules: { required: false } }
      ]
    }
  ],
  MISSING: [
    {
      section: 'general_info',
      title_en: 'General Information',
      title_hi: 'सामान्य जानकारी',
      fields: [
        { field_key: 'gd_no', field_type: 'TEXT', label_en: 'GD Number, Date & Time', label_hi: 'जी.डी. नंबर, दिनांक और समय', validation_rules: { required: true } },
        {
          field_key: 'source',
          field_type: 'SELECT',
          label_en: 'Source of Information',
          label_hi: 'सूचना का स्रोत',
          options: [
            { value: 'PCR', label_en: 'PCR Call', label_hi: 'पीसीआर कॉल' },
            { value: 'DD', label_en: 'DD / Written Complaint', label_hi: 'डीडी / लिखित शिकायत' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'missing_type',
          field_type: 'SELECT',
          label_en: 'Missing / Found Type',
          label_hi: 'लापता / मिला प्रकार',
          options: [
            { value: 'Missing', label_en: 'Missing', label_hi: 'लापता' },
            { value: 'Found', label_en: 'Found', label_hi: 'मिला' }
          ],
          validation_rules: { required: true }
        },
        { field_key: 'pcr_call_flag', field_type: 'BOOLEAN', label_en: 'PCR Call (Y/N)', label_hi: 'पीसीआर कॉल (हाँ/नहीं)', validation_rules: { required: false } },
        { field_key: 'operator_name', field_type: 'TEXT', label_en: 'Operator Name to Whom MPS', label_hi: 'ऑपरेटर का नाम जिसे एमपीएस', validation_rules: { required: false } },
        {
          field_key: 'status',
          field_type: 'SELECT',
          label_en: 'Current Log Status',
          label_hi: 'वर्तमान रिकॉर्ड स्थिति',
          options: [
            { value: 'Active', label_en: 'Active Search Ongoing', label_hi: 'सक्रिय खोज जारी' },
            { value: 'Traced', label_en: 'Traced & Reunited', label_hi: 'ढूंढ लिया गया / परिजनों से मिलाया गया' },
            { value: 'Referred', label_en: 'Referred to Missing Persons Bureau', label_hi: 'लापता व्यक्ति ब्यूरो को संदर्भित' },
            { value: 'Closed', label_en: 'Closed Case', label_hi: 'मामला बंद' }
          ],
          validation_rules: { required: true }
        }
      ]
    },
    {
      section: 'person_details',
      title_en: 'Person Details',
      title_hi: 'व्यक्तिगत विवरण',
      fields: [
        // mp_known is hidden — auto-set based on missing_type (Missing=true, Found=false)
        { field_key: 'mp_known', field_type: 'BOOLEAN', label_en: 'Is Missing Person Identified / Known?', label_hi: 'क्या लापता व्यक्ति की पहचान ज्ञात है?', validation_rules: { required: true } },
        {
          field_key: 'missing_name',
          field_type: 'TEXT',
          label_en: 'Name of Missing Person',
          label_hi: 'लापता व्यक्ति का नाम',
          validation_rules: { required: true },
          show_when: { field: 'mp_known', value: true }
        },
        { field_key: 'age', field_type: 'NUMBER', label_en: 'Age', label_hi: 'उम्र', validation_rules: { required: true } },
        {
          field_key: 'gender',
          field_type: 'SELECT',
          label_en: 'Gender',
          label_hi: 'लिंग',
          options: [
            { value: 'Male', label_en: 'Male', label_hi: 'पुरुष' },
            { value: 'Female', label_en: 'Female', label_hi: 'महिला' },
            { value: 'Transgender', label_en: 'Transgender', label_hi: 'ट्रांसजेंडर' },
            { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'major_minor',
          field_type: 'RADIO',
          label_en: 'Major / Minor',
          label_hi: 'वयस्क / नाबालिग',
          options: [
            { value: 'Major', label_en: 'Major (18+)', label_hi: 'वयस्क (18+)' },
            { value: 'Minor', label_en: 'Minor (Below 18)', label_hi: 'नाबालिग (18 से कम)' }
          ],
          validation_rules: { required: true }
        },
        { field_key: 'missing_relative_name', field_type: 'TEXT', label_en: 'Relative Name', label_hi: 'रिश्तेदार का नाम', validation_rules: { required: false } },
        {
          field_key: 'missing_relation_type',
          field_type: 'SELECT',
          label_en: 'Relation Type',
          label_hi: 'संबंध का प्रकार',
          options: [
            { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
            { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
            { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
            { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
            { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'missing_relative_name', operator: 'filled' }
        },
        { field_key: 'missing_place', field_type: 'TEXT', label_en: 'Last Seen/Found Place', label_hi: 'अंतिम बार देखा गया/प्राप्त स्थान', validation_rules: { required: true } },
        { field_key: 'missing_date', field_type: 'DATE', label_en: 'Date of Missing/Found', label_hi: 'लापता/प्राप्त होने की तिथि', validation_rules: { required: true } },
        { field_key: 'missing_recovered_time', field_type: 'TIME', label_en: 'Time Missing / Recovered', label_hi: 'लापता होने / बरामद होने का समय', validation_rules: { required: false } },
        {
          field_key: 'Mental State',
          field_type: 'SELECT',
          label_en: 'Mental State',
          label_hi: 'मानसिक स्थिति',
          options: [
            { value: 'Normal', label_en: 'Normal', label_hi: 'सामान्य' },
            { value: 'Abnormal', label_en: 'Abnormal', label_hi: 'असामान्य' }
          ],
          validation_rules: { required: false }
        }
      ]
    },
    {
      section: 'missing_address',
      title_en: 'Address Details',
      title_hi: 'पता विवरण',
      fields: [
        {
          field_key: 'mp_house_no',
          field_type: 'TEXT',
          label_en: 'Present House No.',
          label_hi: 'वर्तमान मकान संख्या',
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_street',
          field_type: 'TEXT',
          label_en: 'Present Street',
          label_hi: 'वर्तमान गली / सड़क',
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_colony',
          field_type: 'TEXT',
          label_en: 'Present Colony',
          label_hi: 'वर्तमान कॉलोनी',
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_city_town_village',
          field_type: 'TEXT',
          label_en: 'Present Village / City / Town',
          label_hi: 'वर्तमान गांव / शहर / नगर',
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_state',
          field_type: 'SELECT',
          label_en: 'Present State',
          label_hi: 'वर्तमान राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_district',
          field_type: 'SELECT',
          label_en: 'Present District',
          label_hi: 'वर्तमान जिला',
          options: [
            { value: 'Central', label_en: 'Central', label_hi: 'मध्य' },
            { value: 'New Delhi', label_en: 'New Delhi', label_hi: 'नई दिल्ली' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_pincode',
          field_type: 'TEXT',
          label_en: 'Present Pin Code',
          label_hi: 'वर्तमान पिन कोड',
          validation_rules: { required: false },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_perm_same',
          field_type: 'SELECT',
          label_en: 'Is Permanent Address same as Present Address?',
          label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हां' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: true },
          show_when: { field: 'mp_known', value: true }
        },
        {
          field_key: 'mp_perm_house_no',
          field_type: 'TEXT',
          label_en: 'Permanent House No.',
          label_hi: 'स्थायी मकान संख्या',
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_street',
          field_type: 'TEXT',
          label_en: 'Permanent Street',
          label_hi: 'स्थायी गली / सड़क',
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_colony',
          field_type: 'TEXT',
          label_en: 'Permanent Colony',
          label_hi: 'स्थायी कॉलोनी',
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_city_town_village',
          field_type: 'TEXT',
          label_en: 'Permanent Village / City / Town',
          label_hi: 'स्थायी गांव / शहर / नगर',
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_state',
          field_type: 'SELECT',
          label_en: 'Permanent State',
          label_hi: 'स्थायी राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_district',
          field_type: 'SELECT',
          label_en: 'Permanent District',
          label_hi: 'स्थायी जिला',
          options: [
            { value: 'Central', label_en: 'Central', label_hi: 'मध्य' },
            { value: 'New Delhi', label_en: 'New Delhi', label_hi: 'नई दिल्ली' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'mp_perm_pincode',
          field_type: 'TEXT',
          label_en: 'Permanent Pin Code',
          label_hi: 'स्थायी पिन कोड',
          validation_rules: { required: false },
          show_when: { field: 'mp_perm_same', value: 'No' }
        },
        {
          field_key: 'missing_address',
          field_type: 'TEXTAREA',
          label_en: 'Full Permanent Address',
          label_hi: 'लापता व्यक्ति का स्थायी पता (विस्तृत)',
          validation_rules: { required: false },
          full_width: true,
          show_when: { field: 'mp_perm_same', value: 'No' }
        }
      ]
    },
    {
      section: 'missing_physical',
      title_en: 'Physical Description',
      title_hi: 'शारीरिक हुलिया',
      fields: [
        { field_key: 'height', field_type: 'TEXT', label_en: 'Height', label_hi: 'ऊंचाई', validation_rules: { required: false } },
        {
          field_key: 'built',
          field_type: 'SELECT',
          label_en: 'Built',
          label_hi: 'शारीरिक बनावट',
          options: [
            { value: 'Thin', label_en: 'Thin', label_hi: 'पतला' },
            { value: 'Medium', label_en: 'Medium', label_hi: 'मध्यम' },
            { value: 'Strong', label_en: 'Strong', label_hi: 'मजबूत' },
            { value: 'Fat', label_en: 'Fat', label_hi: 'मोटा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'complexion',
          field_type: 'SELECT',
          label_en: 'Complexion',
          label_hi: 'रंग',
          options: [
            { value: 'Fair', label_en: 'Fair', label_hi: 'गोरा' },
            { value: 'Wheatish', label_en: 'Wheatish', label_hi: 'गेहुआं' },
            { value: 'Dark', label_en: 'Dark', label_hi: 'सांवला' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'face',
          field_type: 'SELECT',
          label_en: 'Face',
          label_hi: 'चेहरा',
          options: [
            { value: 'Round', label_en: 'Round', label_hi: 'गोल' },
            { value: 'Oval', label_en: 'Oval', label_hi: 'अंडाकार' },
            { value: 'Long', label_en: 'Long', label_hi: 'लंबा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'hair',
          field_type: 'SELECT',
          label_en: 'Hair',
          label_hi: 'बाल',
          options: [
            { value: 'Black', label_en: 'Black', label_hi: 'काले' },
            { value: 'Grey', label_en: 'Grey', label_hi: 'सफेद' },
            { value: 'Bald', label_en: 'Bald', label_hi: 'गंजा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'moustache',
          field_type: 'SELECT',
          label_en: 'Moustache',
          label_hi: 'मूछें',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'beard',
          field_type: 'SELECT',
          label_en: 'Beard',
          label_hi: 'दाढ़ी',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'upper_dress_color', field_type: 'TEXT', label_en: 'Upper Dress Color', label_hi: 'ऊपरी पोशाक का रंग', validation_rules: { required: false } },
        { field_key: 'lower_dress_color', field_type: 'TEXT', label_en: 'Lower Dress Color', label_hi: 'निचली पोशाक का रंग', validation_rules: { required: false } },
        { field_key: 'physical_description', field_type: 'TEXTAREA', label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया', validation_rules: { required: true }, full_width: true }
      ]
    },
    {
      section: 'contacts_assigned',
      title_en: 'Informant Contact',
      title_hi: 'सूचना प्रदाता संपर्क',
      fields: [
        { field_key: 'informant_name', field_type: 'TEXT', label_en: 'Complainant / Informant Full Name', label_hi: 'शिकायतकर्ता / सूचना प्रदाता का नाम', validation_rules: { required: true } },
        { field_key: 'informant_contact', field_type: 'TEXT', label_en: 'Informant Contact Telephone/Mobile', label_hi: 'सूचना प्रदाता का संपर्क नंबर', validation_rules: { required: true } },
        { field_key: 'zipnet_no', field_type: 'TEXT', label_en: 'ZIPNET No.', label_hi: 'जिपनेट संख्या', validation_rules: { required: false } }
      ]
    },
    {
      section: 'investigation_officer',
      title_en: 'Investigating Officer',
      title_hi: 'जांच अधिकारी',
      fields: [
        { field_key: 'io_name', field_type: 'TEXT', label_en: 'Assigned Investigating Officer (IO)', label_hi: 'नियुक्त जांच अधिकारी (IO)', validation_rules: { required: true } },
        { field_key: 'io_rank', field_type: 'TEXT', label_en: 'IO Rank', label_hi: 'जांच अधिकारी का पद', validation_rules: { required: false } },
        { field_key: 'io_pis', field_type: 'TEXT', label_en: 'IO PIS No.', label_hi: 'जांच अधिकारी का पीआईएस नंबर', validation_rules: { required: false } },
        { field_key: 'io_mobile', field_type: 'TEXT', label_en: 'IO Mobile No.', label_hi: 'जांच अधिकारी का मोबाइल नंबर', validation_rules: { required: false } },
        { field_key: 'remarks', field_type: 'TEXTAREA', label_en: 'Remarks', label_hi: 'टिप्पणी', validation_rules: { required: false }, full_width: true }
      ]
    }
  ],
  UIDB: [
    {
      section: 'general_info',
      title_en: 'General Information',
      title_hi: 'सामान्य जानकारी',
      fields: [
        { field_key: 'uidb_no', field_type: 'TEXT', label_en: 'UIDB Gazette Number', label_hi: 'यूआईडीबी राजपत्र संख्या', validation_rules: { required: true } },
        { field_key: 'gd_no', field_type: 'TEXT', label_en: 'GD Entry Number', label_hi: 'जी.डी. प्रविष्टि संख्या', validation_rules: { required: true } },
        {
          field_key: 'act_name',
          field_type: 'SELECT',
          label_en: 'Act / Law Name',
          label_hi: 'अधिनियम / कानून का नाम',
          options: [
            { value: 'CrPC', label_en: 'CrPC', label_hi: 'सीआरपीसी' },
            { value: 'BNSS', label_en: 'BNSS', label_hi: 'बीएनएसएस' },
            { value: 'IPC', label_en: 'IPC', label_hi: 'आईपीसी' },
            { value: 'BNS', label_en: 'BNS', label_hi: 'बीएनएस' },
            { value: 'Other Act', label_en: 'Other Act', label_hi: 'अन्य अधिनियम' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'sections',
          field_type: 'SELECT',
          label_en: 'Sections',
          label_hi: 'धाराएं',
          options: [
            { value: '174 CrPC', label_en: '174 CrPC', label_hi: '174 सीआरपीसी' },
            { value: '194 BNSS', label_en: '194 BNSS', label_hi: '194 बीएनएसएस' },
            { value: '176 CrPC', label_en: '176 CrPC', label_hi: '176 सीआरपीसी' },
            { value: '196 BNSS', label_en: '196 BNSS', label_hi: '196 बीएनएसएस' },
            { value: 'Others', label_en: 'Others', label_hi: 'अन्य' }
          ],
          validation_rules: { required: true }
        },
        {
          field_key: 'status',
          field_type: 'SELECT',
          label_en: 'Status',
          label_hi: 'स्थिति',
          options: [
            { value: 'Referred to district hospital', label_en: 'Referred to district hospital', label_hi: 'जिला अस्पताल को संदर्भित' },
            { value: 'Identified', label_en: 'Identified', label_hi: 'पहचाना गया' },
            { value: 'body claimed', label_en: 'Body Claimed', label_hi: 'शव पर दावा किया गया' },
            { value: 'Unidentified', label_en: 'Unidentified', label_hi: 'अज्ञात' },
            { value: 'held in mortuary', label_en: 'Held in Mortuary', label_hi: 'मुर्दाघर में रखा गया' }
          ],
          validation_rules: { required: true }
        }
      ]
    },
    {
      section: 'corpse_desc',
      title_en: 'Corpse Description',
      title_hi: 'शव विवरण',
      fields: [
        { field_key: 'identified', field_type: 'BOOLEAN', label_en: 'Corpse Identified', label_hi: 'शव की पहचान हुई', validation_rules: { required: true } },
        {
          field_key: 'deceased_name',
          field_type: 'TEXT',
          label_en: 'Name of Deceased',
          label_hi: 'मृतक का नाम',
          validation_rules: { required: true },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_house_no',
          field_type: 'TEXT',
          label_en: 'Deceased Present House No.',
          label_hi: 'मृतक का मकान संख्या',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_street',
          field_type: 'TEXT',
          label_en: 'Deceased Present Street',
          label_hi: 'मृतक का गली / सड़क',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_colony',
          field_type: 'TEXT',
          label_en: 'Deceased Present Colony',
          label_hi: 'मृतक का कॉलोनी',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_city_town_village',
          field_type: 'TEXT',
          label_en: 'Deceased Present Village / City / Town',
          label_hi: 'मृतक का गांव / शहर / नगर',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_state',
          field_type: 'SELECT',
          label_en: 'Deceased Present State',
          label_hi: 'मृतक का राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_district',
          field_type: 'SELECT',
          label_en: 'Deceased Present District',
          label_hi: 'मृतक का जिला',
          options: [
            { value: 'Central', label_en: 'Central', label_hi: 'मध्य' },
            { value: 'New Delhi', label_en: 'New Delhi', label_hi: 'नई दिल्ली' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_pincode',
          field_type: 'TEXT',
          label_en: 'Deceased Present Pin Code',
          label_hi: 'मृतक का पिन कोड',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_address',
          field_type: 'TEXTAREA',
          label_en: 'Deceased Full Present Address',
          label_hi: 'मृतक का वर्तमान पता (विस्तृत)',
          validation_rules: { required: false },
          full_width: true,
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_perm_same',
          field_type: 'SELECT',
          label_en: 'Is Permanent Address same as Present Address?',
          label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हां' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: true },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_perm_house_no',
          field_type: 'TEXT',
          label_en: 'Deceased Permanent House No.',
          label_hi: 'मृतक का स्थायी मकान संख्या',
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_street',
          field_type: 'TEXT',
          label_en: 'Deceased Permanent Street',
          label_hi: 'मृतक का स्थायी गली / सड़क',
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_colony',
          field_type: 'TEXT',
          label_en: 'Deceased Permanent Colony',
          label_hi: 'मृतक का स्थायी कॉलोनी',
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_city_town_village',
          field_type: 'TEXT',
          label_en: 'Deceased Permanent Village / City / Town',
          label_hi: 'मृतक का स्थायी गांव / शहर / नगर',
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_state',
          field_type: 'SELECT',
          label_en: 'Deceased Permanent State',
          label_hi: 'मृतक का स्थायी राज्य',
          options: [
            { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
            { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
            { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
            { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
            { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_district',
          field_type: 'SELECT',
          label_en: 'Deceased Permanent District',
          label_hi: 'मृतक का स्थायी जिला',
          options: [
            { value: 'Central', label_en: 'Central', label_hi: 'मध्य' },
            { value: 'New Delhi', label_en: 'New Delhi', label_hi: 'नई दिल्ली' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_pincode',
          field_type: 'TEXT',
          label_en: 'Deceased Permanent Pin Code',
          label_hi: 'मृतक का स्थायी पिन कोड',
          validation_rules: { required: false },
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        {
          field_key: 'deceased_perm_address',
          field_type: 'TEXTAREA',
          label_en: 'Deceased Full Permanent Address',
          label_hi: 'मृतक का स्थायी पता (विस्तृत)',
          validation_rules: { required: false },
          full_width: true,
          show_when: { field: 'deceased_perm_same', value: 'No' }
        },
        { field_key: 'approx_age', field_type: 'TEXT', label_en: 'Estimated/Approximate Age', label_hi: 'अनुमानित आयु', validation_rules: { required: false } },
        {
          field_key: 'gender',
          field_type: 'SELECT',
          label_en: 'Gender',
          label_hi: 'लिंग',
          options: [
            { value: 'Male', label_en: 'Male', label_hi: 'पुरुष' },
            { value: 'Female', label_en: 'Female', label_hi: 'महिला' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' },
            { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
          ],
          validation_rules: { required: true }
        },
        { field_key: 'found_place', field_type: 'TEXT', label_en: 'Place Body Found', label_hi: 'शव मिलने का स्थान', validation_rules: { required: true } },
        { field_key: 'found_date', field_type: 'DATE', label_en: 'Date Body Found', label_hi: 'शव मिलने की तिथि', validation_rules: { required: true } },
        { field_key: 'found_time', field_type: 'TIME', label_en: 'Time Body Found', label_hi: 'शव मिलने का समय', validation_rules: { required: false } },
        { field_key: 'found_latitude', field_type: 'TEXT', label_en: 'Place Body Found Latitude', label_hi: 'शव मिलने का स्थान अक्षांश', validation_rules: { required: false } },
        { field_key: 'found_longitude', field_type: 'TEXT', label_en: 'Place Body Found Longitude', label_hi: 'शव मिलने का स्थान रेखांश', validation_rules: { required: false } },
        { field_key: 'zipnet_no', field_type: 'TEXT', label_en: 'ZIPNET Number', label_hi: 'ज़िपनेट नंबर', validation_rules: { required: false } },
      ]
    },
    {
      section: 'corpse_physical',
      title_en: 'Physical Description',
      title_hi: 'शारीरिक हुलिया',
      fields: [
        { field_key: 'height', field_type: 'TEXT', label_en: 'Height', label_hi: 'ऊंचाई', validation_rules: { required: false } },
        {
          field_key: 'built',
          field_type: 'SELECT',
          label_en: 'Built',
          label_hi: 'शारीरिक बनावट',
          options: [
            { value: 'Thin', label_en: 'Thin', label_hi: 'पतला' },
            { value: 'Medium', label_en: 'Medium', label_hi: 'मध्यम' },
            { value: 'Strong', label_en: 'Strong', label_hi: 'मजबूत' },
            { value: 'Fat', label_en: 'Fat', label_hi: 'मोटा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'complexion',
          field_type: 'SELECT',
          label_en: 'Complexion',
          label_hi: 'रंग',
          options: [
            { value: 'Fair', label_en: 'Fair', label_hi: 'गोरा' },
            { value: 'Wheatish', label_en: 'Wheatish', label_hi: 'गेहुआं' },
            { value: 'Dark', label_en: 'Dark', label_hi: 'सांवला' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'face',
          field_type: 'SELECT',
          label_en: 'Face',
          label_hi: 'चेहरा',
          options: [
            { value: 'Round', label_en: 'Round', label_hi: 'गोल' },
            { value: 'Oval', label_en: 'Oval', label_hi: 'अंडाकार' },
            { value: 'Long', label_en: 'Long', label_hi: 'लंबा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'hair',
          field_type: 'SELECT',
          label_en: 'Hair',
          label_hi: 'बाल',
          options: [
            { value: 'Black', label_en: 'Black', label_hi: 'काले' },
            { value: 'Grey', label_en: 'Grey', label_hi: 'सफेद' },
            { value: 'Bald', label_en: 'Bald', label_hi: 'गंजा' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'moustache',
          field_type: 'SELECT',
          label_en: 'Moustache',
          label_hi: 'मूछें',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'beard',
          field_type: 'SELECT',
          label_en: 'Beard',
          label_hi: 'दाढ़ी',
          options: [
            { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
            { value: 'No', label_en: 'No', label_hi: 'नहीं' }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'upper_dress_color', field_type: 'TEXT', label_en: 'Upper Dress Color', label_hi: 'ऊपरी पहनावे का रंग', validation_rules: { required: false } },
        { field_key: 'lower_dress_color', field_type: 'TEXT', label_en: 'Lower Dress Color', label_hi: 'निचले पहनावे का रंग', validation_rules: { required: false } },
        { field_key: 'identification_marks', field_type: 'TEXT', label_en: 'Identification Marks', label_hi: 'पहचान चिन्ह', validation_rules: { required: false } },
        { field_key: 'description', field_type: 'TEXTAREA', label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया', validation_rules: { required: false }, full_width: true }
      ]
    },
    {
      section: 'inquest_details',
      title_en: 'Inquest Details',
      title_hi: 'इन्क्वेस्ट विवरण',
      fields: [
        {
          field_key: 'cause_of_death',
          field_type: 'SELECT',
          label_en: 'Cause of Death',
          label_hi: 'मृत्यु का कारण',
          options: [
            { value: 'Accidental', label_en: 'Accidental', label_hi: 'दुर्घटना' },
            { value: 'Natural', label_en: 'Natural', label_hi: 'प्राकृतिक' },
            { value: 'Suicide', label_en: 'Suicide', label_hi: 'आत्महत्या' },
            { value: 'Murder', label_en: 'Murder', label_hi: 'हत्या' },
            { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'cause_of_death_other',
          field_type: 'TEXT',
          label_en: 'Cause of Death (Specify)',
          label_hi: 'मृत्यु का कारण (विवरण)',
          validation_rules: { required: false },
          show_when: { field: 'cause_of_death', value: 'Other' }
        },
        {
          field_key: 'deceased_relative_name',
          field_type: 'TEXT',
          label_en: 'Relative Name',
          label_hi: 'रिश्तेदार का नाम',
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'deceased_relation_type',
          field_type: 'SELECT',
          label_en: 'Relation with Deceased',
          label_hi: 'मृतक से संबंध',
          options: [
            { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
            { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
            { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
            { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
            { value: 'Brother', label_en: 'Brother', label_hi: 'भाई' },
            { value: 'Sister', label_en: 'Sister', label_hi: 'बहन' },
            { value: 'Son', label_en: 'Son', label_hi: 'पुत्र' },
            { value: 'Daughter', label_en: 'Daughter', label_hi: 'पुत्री' },
            { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
            { value: 'Friend', label_en: 'Friend', label_hi: 'मित्र' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'identified', value: true }
        },
        {
          field_key: 'filed_by_acp_sdm',
          field_type: 'SELECT',
          label_en: 'Inquest Filed by ACP / SDM',
          label_hi: 'जांच एसीपी / एसडीएम द्वारा दायर',
          options: [
            { value: 'SDM', label_en: 'SDM', label_hi: 'एसडीएम' },
            { value: 'ACP', label_en: 'ACP', label_hi: 'एसीपी' },
            { value: 'None', label_en: 'None', label_hi: 'कोई नहीं' }
          ],
          validation_rules: { required: false }
        },
        {
          field_key: 'filed_by_acp_sdm_date',
          field_type: 'DATE',
          label_en: 'Date of Filed by ACP/SDM',
          label_hi: 'एसीपी/एसडीएम द्वारा दायर करने की तिथि',
          validation_rules: { required: false },
          show_when: { field: 'filed_by_acp_sdm', value: ['SDM', 'ACP'] }
        },
        {
          field_key: 'inquest_status',
          field_type: 'SELECT',
          label_en: 'Inquest Status',
          label_hi: 'जांच स्थिति (Inquest Status)',
          options: [
            { value: 'Disposal', label_en: 'Disposal', label_hi: 'निपटान (Disposal)' },
            { value: 'Closure', label_en: 'Closure', label_hi: 'समाप्ति (Closure)' }
          ],
          validation_rules: { required: false }
        },
        { field_key: 'informant_name', field_type: 'TEXT', label_en: 'Informant Name', label_hi: 'सूचना प्रदाता का नाम', validation_rules: { required: false } },
        {
          field_key: 'informant_relation',
          field_type: 'SELECT',
          label_en: 'Relation with Deceased',
          label_hi: 'मृतक से संबंध',
          options: [
            { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
            { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
            { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
            { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
            { value: 'Brother', label_en: 'Brother', label_hi: 'भाई' },
            { value: 'Sister', label_en: 'Sister', label_hi: 'बहन' },
            { value: 'Son', label_en: 'Son', label_hi: 'पुत्र' },
            { value: 'Daughter', label_en: 'Daughter', label_hi: 'पुत्री' },
            { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
            { value: 'Friend', label_en: 'Friend', label_hi: 'मित्र' },
            { value: 'Neighbor', label_en: 'Neighbor', label_hi: 'पड़ोसी' },
            { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
          ],
          validation_rules: { required: false },
          show_when: { field: 'informant_name', operator: 'filled' }
        },
        { field_key: 'informant_mobile', field_type: 'PHONE', label_en: 'Informant Mobile', label_hi: 'सूचना प्रदाता का मोबाइल नंबर', validation_rules: { required: false } }
      ]
    },
    {
      section: 'investigation_officer',
      title_en: 'Investigating Officer Details',
      title_hi: 'जांच अधिकारी का विवरण',
      fields: [
        { field_key: 'io_name', field_type: 'TEXT', label_en: 'IO / Officer Name', label_hi: 'जांच अधिकारी का नाम', validation_rules: { required: true } },
        { field_key: 'io_rank', field_type: 'TEXT', label_en: 'IO Rank', label_hi: 'जांच अधिकारी का पद', validation_rules: { required: false } },
        { field_key: 'io_pis', field_type: 'TEXT', label_en: 'PIS No. of IO', label_hi: 'जांच अधिकारी का पीआईएस नंबर', validation_rules: { required: false } },
        { field_key: 'io_mobile', field_type: 'PHONE', label_en: 'IO Mobile No.', label_hi: 'जांच अधिकारी का मोबाइल नंबर', validation_rules: { required: true } }
      ]
    }
  ]
};
