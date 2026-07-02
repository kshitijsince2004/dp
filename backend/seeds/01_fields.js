// backend/seeds/01_fields.js
// Canonical source for ALL field_registry definitions.
//
// HOW TO ADD A FIELD:
//   1. Add a row to the fields array below.
//   2. Run `npm run db:seed` (or restart via start.bat).
//   3. The field appears in the frontend via GET /api/fields/form/:record_type
//
// SHARED FIELDS: field_key is UNIQUE in field_registry. Fields used across
// multiple record types appear ONCE with a combined applicable_record_types array.
// Example: `io_name` has applicable_record_types: ['CASE','ARREST','PCR_CALL','MISSING','UIDB']
//
// This file uses ON CONFLICT (field_key) DO UPDATE so it is safe to re-run.

const L = JSON.stringify(['PS', 'DISTRICT', 'HQ']);
const E = JSON.stringify(['PS']);

const STATE_OPTS = JSON.stringify([
  { value: 'Andhra Pradesh', label_en: 'Andhra Pradesh', label_hi: 'आंध्र प्रदेश' },
  { value: 'Arunachal Pradesh', label_en: 'Arunachal Pradesh', label_hi: 'अरुणाचल प्रदेश' },
  { value: 'Assam', label_en: 'Assam', label_hi: 'असम' },
  { value: 'Bihar', label_en: 'Bihar', label_hi: 'बिहार' },
  { value: 'Chhattisgarh', label_en: 'Chhattisgarh', label_hi: 'छत्तीसगढ़' },
  { value: 'Delhi', label_en: 'Delhi', label_hi: 'दिल्ली' },
  { value: 'Goa', label_en: 'Goa', label_hi: 'गोवा' },
  { value: 'Gujarat', label_en: 'Gujarat', label_hi: 'गुजरात' },
  { value: 'Haryana', label_en: 'Haryana', label_hi: 'हरियाणा' },
  { value: 'Himachal Pradesh', label_en: 'Himachal Pradesh', label_hi: 'हिमाचल प्रदेश' },
  { value: 'Jammu & Kashmir', label_en: 'Jammu & Kashmir', label_hi: 'जम्मू और कश्मीर' },
  { value: 'Jharkhand', label_en: 'Jharkhand', label_hi: 'झारखंड' },
  { value: 'Karnataka', label_en: 'Karnataka', label_hi: 'कर्नाटक' },
  { value: 'Kerala', label_en: 'Kerala', label_hi: 'केरल' },
  { value: 'Ladakh', label_en: 'Ladakh', label_hi: 'लद्दाख' },
  { value: 'Madhya Pradesh', label_en: 'Madhya Pradesh', label_hi: 'मध्य प्रदेश' },
  { value: 'Maharashtra', label_en: 'Maharashtra', label_hi: 'महाराष्ट्र' },
  { value: 'Manipur', label_en: 'Manipur', label_hi: 'मणिपुर' },
  { value: 'Meghalaya', label_en: 'Meghalaya', label_hi: 'मेघालय' },
  { value: 'Mizoram', label_en: 'Mizoram', label_hi: 'मिजोरम' },
  { value: 'Nagaland', label_en: 'Nagaland', label_hi: 'नागालैंड' },
  { value: 'Odisha', label_en: 'Odisha', label_hi: 'ओडिशा' },
  { value: 'Puducherry', label_en: 'Puducherry', label_hi: 'पुडुचेरी' },
  { value: 'Punjab', label_en: 'Punjab', label_hi: 'पंजाब' },
  { value: 'Rajasthan', label_en: 'Rajasthan', label_hi: 'राजस्थान' },
  { value: 'Sikkim', label_en: 'Sikkim', label_hi: 'सिक्किम' },
  { value: 'Tamil Nadu', label_en: 'Tamil Nadu', label_hi: 'तमिलनाडु' },
  { value: 'Telangana', label_en: 'Telangana', label_hi: 'तेलंगाना' },
  { value: 'Tripura', label_en: 'Tripura', label_hi: 'त्रिपुरा' },
  { value: 'Uttar Pradesh', label_en: 'Uttar Pradesh', label_hi: 'उत्तर प्रदेश' },
  { value: 'Uttarakhand', label_en: 'Uttarakhand', label_hi: 'उत्तराखंड' },
  { value: 'West Bengal', label_en: 'West Bengal', label_hi: 'पश्चिम बंगाल' },
  { value: 'Other UT/State', label_en: 'Other UT/State', label_hi: 'अन्य केंद्र शासित प्रदेश/राज्य' }
]);
const DISTRICTS = [
  "South District (SD)", "South East District (SED)", "New Delhi District (NDD)",
  "South West District (SWD)", "West District (WD)", "Outer District (OD)",
  "Dwarka District (DW)", "North West District (NWD)", "Rohini District (RND)",
  "Outer North District (OND)", "Central District (CD)", "North District (ND)",
  "East District (ED)", "North East District (NED)", "Shahdara District (SHD)"
];
const DISTRICT_OPTS = JSON.stringify(DISTRICTS.map(d => ({ value: d, label_en: d, label_hi: d })));


const CRIME_HEADS = [
  'Abduction',
  'Abetment of Suicide',
  'Acid Attack',
  'Acid Attack Attempt',
  'Adultery',
  'Affray',
  'Arms Act',
  'Arson',
  'Assault on Public Servant',
  'Att. to Commit Suicide',
  'Att. to Culpable Homicide not Amounting to Murder',
  'Att. to Murder',
  'Bombay Prevention of begging Act - 1959',
  'Burglary',
  'Cattle Theft',
  'Central Motor Vehicles Rules,1989',
  'Cheating',
  'Child Labour Act-1986',
  'Child Marriage Restraint Act 1929',
  'Civil Rights Act',
  'Concealment of birth',
  'Copyright Act',
  'Counterfeiting',
  'Criminal Breach of Trust',
  'Criminal Intimadation',
  'Cruelty by Husband',
  'Culpable Homicide not Amounting to Murder',
  'Cycle Theft',
  'Dacoity',
  'Day Burglary',
  'Delhi Control of vehicular and Other Traffic on Road Act',
  'Delhi Excise Act',
  'Delhi Police Act 1978',
  'Delhi Preservation of Trees Act, 1994',
  'Dowry Death',
  'Dowry Prohibition Act-1961',
  'Drugging/ Poisoning',
  'Drugs and Cosmetics Act 1940',
  'Election Offences',
  'Electricity Act 2003',
  'Electricity Theft',
  'Encroachment on Govt. Land',
  'Environment (Protection) Act 1986',
  'Escape from Police Custody',
  'Essential Commodities Act-1955',
  'Eve Teasing',
  'Explosive Act- 1884',
  'Explosive Substances Act- 1908',
  'Extortion',
  'Fatal Accident',
  'Fire Incident',
  'Foreigners Act-1946',
  'Forgery',
  'Gambling Act',
  'Grievous Hurt',
  'House Theft',
  'House/Criminal Trespass',
  'Immoral Traffic(Prev.) Act, 1956 (SIT Act Renamed)',
  'Impersonation',
  'Information Technology Act-2000',
  'Juvenile justice Act 2006',
  'Juvenile justice Act 2010',
  'Juvenile justice Act 2015',
  'Kid. For Ransom',
  'Kidnapping',
  'M.O. Women',
  'M.V. Accessiories Theft',
  'M.V. Theft',
  'Maharashtra Control of Organised Crime Act-1999',
  'Misappropriation of Istri Dhan & cruelty by inlaws',
  'Miscarriage Etc.',
  'Mischief',
  'Mobile Phone Theft',
  'Motor Vehicle Act,1988',
  'Murder',
  'Narcotics Drugs & Psychotropic Substances Act',
  'National Security Act 1980',
  'Night Burglary',
  'Offence against Public Servent',
  'Offences Relating to religion',
  'Official Secret Act,1923',
  'Organised Crime',
  'Other Act',
  'Other BNS',
  'Other IPC',
  'Other Theft',
  'POCSO Act 2012',
  'Pasport Act-1967',
  'Personating public servent',
  'Pick Pocketing',
  'Poisions Act 1919',
  'Pre conception and pre natal diagonstic(pro)',
  'Prevention of Atocities SC/ST Act - 1989',
  'Prevention of Corruption Act-1988',
  'Prevention of Damage of Public Property Act-1984',
  'Protection of Women Domestic Violence Act 2005',
  'Protection of human rights Act 1993',
  'Public Nuisance',
  'Rape',
  'Receiver of Stolen Property',
  'Riot',
  'Robbery',
  'Sedition of Offences against State',
  'Servant Theft',
  'Simple Accident',
  'Simple Hurt',
  'Snatching',
  'Stereo Theft',
  'Terrorist Act',
  'The Delhi Prevention of Touting and Malpractices Against Tourists Ordinance Act 2010',
  'Theft in Shop',
  'Threatning',
  'Trade & Merchandise Marks Act, 1958',
  'Tresspass',
  'Un-Natural Death / Inquest Report',
  'Unlawful Activities (Prevension) Act 1967',
  'Unnatural Offences(SODOMY)',
  'Wild Life (Protection) Act-1972',
  'wrongful Confinement/restraint'
];
const CRIME_HEAD_OPTS = JSON.stringify(CRIME_HEADS.map(h => ({ value: h, label_en: h, label_hi: h })));

const PCR_CALL_HEADS = [
  'AANDHI (THUNDERSTORM)',
  'ABDUCTION',
  'ACCIDENT FATAL',
  'ACCIDENT SIMPLE',
  'ACCIDENT WITH INJURY',
  'ACCIDENT WITHOUT INJURY',
  'ACT',
  'ADDICTION ALCOHOL OR DRUGS AND NEGLECT OF FAMILY',
  'ADDICTION ALCOHOL OR DRUGS AND NEGLECT OF FAMILY (A & NF)',
  'AGITATION',
  'AIR & NOISE POLLUTION FROM GENERATOR',
  'ANTI SOCIAL SLOGAN GRAFFITI',
  'ARMS ACT',
  'ASSEMBLY ELECTION',
  'AT OTHER PLACE',
  'AT RAILWAY STATION',
  'ATM ROBBERY',
  'ATT TO MURDER',
  'ATT TO SUICIDE FEMALE',
  'ATT TO SUICIDE MALE',
  'ATT TO SUICIDE TRANSGENDER',
  'ATTACK BY BLADE',
  'ATTACK ON DOCTOR AND MEDICAL STAFF',
  'BANK ROBBERY',
  'BED AVAILABILITY',
  'BHARAT BANDH',
  'BIRD FLU',
  'BOMB BLAST',
  'BOMB INFORMATION',
  'BUILDING COLLAPSE',
  'BURGLARY',
  'BURN INJURED',
  'BURNT DEAD',
  'BY AUTO DRIVER',
  'BY BUS DRIVER',
  'BY CO-PASSENGER',
  'BY E-RICKSHAW DRIVER',
  'BY PHONE',
  'BY RTV DRIVER',
  'BY TAXI DRIVER',
  'BY USING PIN, OTP',
  'CAR JACKING',
  'CARD SWAPPING',
  'CARDACE VEHICLE BREAK DOWN',
  'CARDACE VEHICLE HIT',
  'CHAIN SNATCHING',
  'CHEATING FORGERY',
  'CHILD ABUSE',
  'CHILD DISTRESS HELPLINE',
  'CHILD LABOUR',
  'CHINESE MANJHA',
  'CHURCH',
  'COMMUMAL RIOTS',
  'COMPLAINT',
  'CONSUME',
  'CORONA',
  'CORONA INFECTED',
  'CORONA SUSPECTED',
  'COUNSELLING',
  'COW RELATED',
  'CRIME AGAINST FOREIGNERS',
  'CRIME BY FOREIGNER',
  'CRIMINAL BREACH OF TRUST',
  'DACOITY',
  'DAY BURGLARY',
  'DEAD BODY ANIMAL',
  'DEAD BODY FEMALE',
  'DEAD BODY MALE',
  'DEAD BODY TRANSGENDER',
  'DEATH',
  'DEBIT OR CREDIT CARD FRAUD OR SIM SWAP FRAUD',
  'DEMAT OR DEPOSITORY FRAUD',
  'DEMOLITION',
  'DETECTION OF MISSING VEHICLE (LPR)',
  'DIVORCE RELATED CASE',
  'DOMESTIC MENTAL TORTURE',
  'DOMESTIC VIOLENCE',
  'DOWRY DEMAND',
  'DRONE',
  'DRONE UAV',
  'DROWN',
  'DRUNKARD',
  'DSGMC ELECTION',
  'EARTHQUAKE',
  'ELECTION',
  'ELECTION DUSU',
  'ELECTRICITY',
  'ENCROACHMENT',
  'EVE TEASING',
  'EXCISE',
  'EXPLOSIVE',
  'EXTORTION',
  'EXTORTION FOR GOODS OR PROPERTY',
  'EXTORTION FOR MONEY',
  'EXTRA MARITAL RELATION OF HUSBAND',
  'EYES AND EARS',
  'FAKE CURRENCY',
  'FALLEN TREE',
  'FEMALE',
  'FIRE CRACKERS',
  'FIRE MAJOR',
  'FIRE MINOR',
  'FIRING',
  'FLOOD',
  'FOOD RELATED',
  'FOUND',
  'FOUR WHEELER',
  'GAMBLING',
  'GANDHI JAYANTI',
  'GURUDWARA',
  'Gathering Or Protest at Distribution Centers',
  'HACKING',
  'HARASSMENT BY HOTEL OR SHOP OWNER',
  'HARASSMENT BY TAXI OR AUTO DRIVER',
  'HEAVY RAIN',
  'HOLI QUARREL',
  'HOUSE THEFT',
  'HUNGER',
  'HURT',
  'ILLEGAL CONSTRUCTION',
  'ILLEGAL PARKING',
  'ILLEGAL SALE',
  'ILLEGAL SALE OF LIQUOR',
  'IN RUNNING TRAIN',
  'INDEPENDENCE DAY',
  'INFORMATION RELATED TO NGO\'S AND OTHERS',
  'INJURED',
  'INTERNET BANKING RELATED FRAUD',
  'IT ACT',
  'KIDNAPPING',
  'KIDNAPPING FOR RANSOM',
  'LOCK DOWN',
  'LOK SABHA ELECTION',
  'LOST',
  'LOUD SPEAKER FROM 10PM TO 6AM',
  'LOUD SPEAKER FROM 6AM TO 10PM',
  'M V THEFT',
  'MADRASA',
  'MAINTENANCE ALLOWANCE',
  'MALE',
  'MANDIR',
  'MANUFACTURING OF FIRE CRACKERS',
  'MASJID',
  'MASS GATHERING',
  'MAZAR',
  'MCD ELECTION',
  'MEDICAL ASSISTANCE',
  'MEDICAL EMERGENCY',
  'MEDICAL FORGERY',
  'MIGRANT LABOUR',
  'MISCELLANEOUS',
  'MISSING ANIMAL',
  'MISSING CHILD',
  'MISSING FEMALE',
  'MISSING MALE',
  'MISSING TRANSGENDER',
  'MLC',
  'MOB VIOLENCE',
  'MOBILE SNATCHING',
  'MOCK DRILL',
  'MOLESTATION',
  'MONETARY DISPUTE',
  'MURDER',
  'NDPS ACT',
  'NEW CURRENCY',
  'NIGHT BURGLARY',
  'NOISE POLLUTION',
  'NOISE POLLUTION  FROM 10PM TO 6AM',
  'NOISE POLLUTION  FROM 6AM TO 10PM',
  'NP BURSTING OF FIRE CRACKERS',
  'NP CONST MARBLE CUTTING MC  RES  AREA',
  'NP FIRE CRACKERS',
  'NP GEN SET FIVE KVA IN RES AREA TEN PM TO SIX AM',
  'NP HONKING IN SILENT ZONE',
  'NP LS OR DJ SIX AM TO TEN PM',
  'NP LS OR DJ TEN PM SIX AM',
  'NP PRESSURE HORN',
  'NP VEH MODIFIED EXHAUST AND SILENCERS',
  'OBJECTIONABLE FLAG PROTEST DEMONSTRATION',
  'ODD EVEN VEHICLE',
  'ODD EVEN VEHICLE SCHEME',
  'OFFICE ROBBERY',
  'OTHER ACCIDENT',
  'OTHER ACT',
  'OTHER ELECTION',
  'OTHER FESTIVAL',
  'OTHER FLYING OBJECTS',
  'OTHER SNATCHING',
  'OTHER THEFT',
  'OTHERS',
  'OXYGEN CYLINDER',
  'PARKING DISPUTE',
  'PICK POCKETING',
  'PICK-POCKETING IN MARKET',
  'PICK-POCKETING IN OTHER PLACE',
  'PICK-POCKETING IN PUBLIC TRANSPORT',
  'PIG RELATED',
  'PLANE ACCIDENT',
  'POCSO ACT',
  'POLICE PERSONNEL INFECTED',
  'POLICE PERSONNEL SUSPECTED',
  'PROPERTY DISPUTE',
  'QUARREL',
  'QUARREL WITH SOME PERSON',
  'RAPE',
  'RASH DRIVING',
  'RATION RELATED',
  'RECOVERY',
  'REPUBLIC DAY',
  'RIOT',
  'ROAD RAGE',
  'ROBBERY',
  'SALE AND STORAGE OF CHINESE MANJHA',
  'SELLING OF FIRE CRACKERS',
  'SERVENT THEFT',
  'SEXUAL HARASSMENT AT HOME (SHAT)',
  'SHOOTOUT',
  'SHORTAGE OF CNG',
  'SHORTAGE OF DIESEL',
  'SHORTAGE OF LPG',
  'SHORTAGE OF PETROL',
  'SHOUTING',
  'SIMPLE HURT',
  'SNATCHING',
  'SNATCHING PROPERTY',
  'SNATCHING TSR CAR JACKING',
  'SOS SR CITIZEN',
  'SR CITIZEN ABUSE',
  'SR CITIZEN CONFINEMENT',
  'SR CITIZEN HELPLINE',
  'STABBING',
  'STALKING',
  'STORAGE OF FIRE CRACKERS',
  'STUDENT UNION ELECTION',
  'SUDDEN LAW AND ORDER PROBLEM',
  'SUICIDE',
  'SUICIDE BOMBER',
  'SUICIDE F',
  'SUICIDE M',
  'SUICIDE TRANSGENDER',
  'SUSPICIOUS OBJECTS OR PERSON',
  'TAZIA',
  'TENANT LANDLORD DISPUTE',
  'TERRORIST AND DISRUPTIVE ACTIVITIES',
  'TERRORIST ATTACK',
  'THEFT',
  'THEFT IN HOUSE',
  'THEFT IN OFFICE',
  'THEFT IN OTHER PREMISES',
  'THEFT IN SHOP',
  'THREAT TO WOMEN',
  'THREE WHEELER',
  'TO AUTO DRIVER',
  'TO BUS DRIVER',
  'TO OTHER PERSON',
  'TO PEDESTRIAN',
  'TO RICKSHAW DRIVER',
  'TO RTV DRIVER',
  'TO TAXI DRIVER',
  'TO TRUCK DRIVER',
  'TOURISM RELATED INFORMATION',
  'TRACED',
  'TRADE FARE',
  'TRAFFIC CONGESTION',
  'TRAFFIC JAM',
  'TRAIN ACCIDENT',
  'TRANSGENDER',
  'TSR REFUSAL DRIVER TO WOMEN EIGHT AM TO EIGHT PM',
  'TSR REFUSAL TO WOMEN EIGHT PM TO EIGHT AM',
  'TSR REFUSED',
  'TWO WHEELER',
  'TWO WHEELER ACCIDENT',
  'UNAUTHORISED CONSTRUCTION',
  'UNCLAIMED CHILD',
  'UNCLAIMED PERSON',
  'UNCLAIMED PROPERTY',
  'UNCLAIMED VEHICLE',
  'UNCONSCIOUS',
  'UNEMPLOYMENT AND ECONOMIC DIFFICULTY-(U & ED)',
  'UNIDENTIFIED',
  'UNIDENTIFIED PERSON FOUND',
  'WATER',
  'WATER LOGGING',
  'WILD LIFE',
  'WITH NEIGHBOURS',
  'WOMEN ABUSE',
  'WOMEN THREAT',
  'e-FIR Property Theft'
];
const PCR_CALL_HEAD_OPTS = JSON.stringify(PCR_CALL_HEADS.map(h => ({ value: h, label_en: h, label_hi: h })));

const ALL_TYPES = JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']);

const fields = [
  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED FIELDS (applicable to multiple record types — ONE row each)
  // ─────────────────────────────────────────────────────────────────────────────

  // io_name — IO / Enquiry Officer name, shared across ALL record types
  { id: 'C_17', field_key: 'io_name',           field_type: 'TEXT',   applicable_record_types: ALL_TYPES,                                             label_en: 'IO / Officer Name',           label_hi: 'जांच अधिकारी का नाम',          visible_to_levels: L, editable_by_levels: E, section: 'investigation_officer',   sort_order: 500, validation_rules: JSON.stringify({ required: false }) },

  // status — record status, shared across ALL types; TEXT so each type stores its own value
  { id: 'C_22', field_key: 'status',            field_type: 'SELECT', applicable_record_types: ALL_TYPES,                                             label_en: 'Status',                      label_hi: 'स्थिति',                        visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 333, validation_rules: JSON.stringify({ required: false }) },

  // act_name — Act / Law name, shared between CASE and ARREST
  { id: 'C_10', field_key: 'act_name',          field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),              label_en: 'Act / Law Name',              label_hi: 'अधिनियम / कानून का नाम',        visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 10, options: JSON.stringify([{ value: 'IPC', label_en: 'IPC', label_hi: 'आईपीसी (IPC)' }, { value: 'Delhi Excise Act', label_en: 'Delhi Excise Act', label_hi: 'दिल्ली उत्पाद शुल्क अधिनियम' }, { value: 'Arms Act', label_en: 'Arms Act', label_hi: 'शस्त्र अधिनियम' }, { value: 'Gambling Act', label_en: 'Gambling Act', label_hi: 'जुआ अधिनियम' }, { value: 'Other Act', label_en: 'Other Act', label_hi: 'अन्य अधिनियम' }, { value: 'CrPC', label_en: 'CrPC', label_hi: 'सीआरपीसी' }, { value: 'BNSS', label_en: 'BNSS', label_hi: 'बीएनएसएस' }, { value: 'BNS', label_en: 'BNS', label_hi: 'बीएनएस' }]) },

  // sections — IPC sections, shared between CASE and ARREST
  { id: 'C_11', field_key: 'sections',          field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),              label_en: 'Sections',                    label_hi: 'धाराएं',                        visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11 },

  // gd_no — GD details, shared globally
  { id: 'C_3',  field_key: 'gd_no',             field_type: 'TEXT',   applicable_record_types: ALL_TYPES,                                             label_en: 'GD Number, Date & Time',      label_hi: 'जीडी नंबर, दिनांक और समय',       visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 3,  validation_rules: JSON.stringify({ required: false }) },

  // gd_date — GD date, shared globally
  { id: 'C_4',  field_key: 'gd_date',           field_type: 'DATE',   applicable_record_types: JSON.stringify([]),                              label_en: 'GD Date',                     label_hi: 'जीडी दिनांक',                   visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 4 },

  // gd_time — GD time, shared globally
  { id: 'C_5',  field_key: 'gd_time',           field_type: 'TIME',   applicable_record_types: JSON.stringify([]),                              label_en: 'GD Time',                     label_hi: 'जीडी समय',                      visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 5 },

  // occurrence_place — Place of occurrence, shared by CASE and PCR_CALL
  { id: 'C_8',  field_key: 'occurrence_place',  field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE', 'PCR_CALL']),                  label_en: 'Place of Occurrence',         label_hi: 'घटना का स्थान',                 visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 8,  validation_rules: JSON.stringify({ required: false }) },

  // io_mobile — IO mobile number, shared by CASE, ARREST and UIDB
  { id: 'C_19', field_key: 'io_mobile',         field_type: 'NUMBER',   applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']),   label_en: 'IO Mobile No.',               label_hi: 'जांच अधिकारी का मोबाइल',        visible_to_levels: L, editable_by_levels: E, section: 'investigation_officer',   sort_order: 503 },

  // informant_name — Informant name, shared by MISSING and UIDB
  { id: 'MS_10',field_key: 'informant_name',    field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Informant Name',              label_hi: 'सूचना देने वाले का नाम',         visible_to_levels: L, editable_by_levels: E, section: 'contacts_assigned',       sort_order: 10 },
  // informant_relation — Informant relation with deceased, applicable to UIDB
  { id: 'MS_10_rel', field_key: 'informant_relation',   field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING','UIDB']),                       label_en: 'Relation with Deceased',      label_hi: 'मृतक से संबंध',                  visible_to_levels: L, editable_by_levels: E, section: 'contacts_assigned',       sort_order: 10.5, show_when: JSON.stringify({ field: 'informant_name', operator: 'filled' }), options: JSON.stringify([{ value: 'Father', label_en: 'Father', label_hi: 'पिता' }, { value: 'Mother', label_en: 'Mother', label_hi: 'माता' }, { value: 'Husband', label_en: 'Husband', label_hi: 'पति' }, { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' }, { value: 'Brother', label_en: 'Brother', label_hi: 'भाई' }, { value: 'Sister', label_en: 'Sister', label_hi: 'बहन' }, { value: 'Son', label_en: 'Son', label_hi: 'पुत्र' }, { value: 'Daughter', label_en: 'Daughter', label_hi: 'पुत्री' }, { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' }, { value: 'Friend', label_en: 'Friend', label_hi: 'मित्र' }, { value: 'Neighbor', label_en: 'Neighbor', label_hi: 'पड़ोसी' }, { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }]) },

  // zipnet_no — ZIPNET number, shared by MISSING and UIDB
  { id: 'MS_13',field_key: 'zipnet_no',         field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'ZIPNET No.',                  label_hi: 'जिपनेट संख्या',                 visible_to_levels: L, editable_by_levels: E, section: 'contacts_assigned',       sort_order: 13 },

  // gender — shared by MISSING and UIDB (combined options: Male/Female/Transgender/Unknown)
  { id: 'MS_5', field_key: 'gender',            field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Gender',                      label_hi: 'लिंग',                          visible_to_levels: L, editable_by_levels: E, section: 'person_details',          sort_order: 5,  validation_rules: JSON.stringify({ required: false }), options: JSON.stringify([{ value: 'Male', label_en: 'Male', label_hi: 'पुरुष' }, { value: 'Female', label_en: 'Female', label_hi: 'महिला' }, { value: 'Transgender', label_en: 'Transgender', label_hi: 'ट्रांसजेंडर' }, { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }]) },

  // Physical description fields — shared by MISSING and UIDB
  { id: 'MS_16',field_key: 'height',            field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Height',                      label_hi: 'कद',                            visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 16, is_active: true, scope_level: 'global' },
  { id: 'MS_17',field_key: 'built',             field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Built',                       label_hi: 'शरीर की बनावट',                 visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 17, is_active: true, scope_level: 'global' },
  { id: 'MS_18',field_key: 'complexion',        field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Complexion',                  label_hi: 'रंग',                           visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 18, is_active: true, scope_level: 'global' },
  { id: 'MS_20',field_key: 'face',              field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Face',                        label_hi: 'चेहरा',                         visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 20, is_active: true, scope_level: 'global' },
  { id: 'MS_21',field_key: 'hair',              field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Hair',                        label_hi: 'बाल',                           visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 21, is_active: true, scope_level: 'global' },
  { id: 'MS_22',field_key: 'moustache',         field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Moustache',                   label_hi: 'मूंछ',                          visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 22, is_active: true, scope_level: 'global' },
  { id: 'MS_26',field_key: 'beard',             field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Beard',                       label_hi: 'दाढ़ी',                         visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 23, is_active: true, scope_level: 'global' },
  { id: 'MS_27',field_key: 'upper_dress_color', field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Upper Dress Color',           label_hi: 'ऊपरी पोशाक का रंग',            visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 19, is_active: true, scope_level: 'global' },
  { id: 'MS_28',field_key: 'lower_dress_color', field_type: 'TEXT',   applicable_record_types: JSON.stringify(['MISSING', 'UIDB']),                   label_en: 'Lower Dress Color',           label_hi: 'निचली पोशाक का रंग',            visible_to_levels: L, editable_by_levels: E, section: 'person_details',    sort_order: 20, is_active: true, scope_level: 'global' },

  // ─────────────────────────────────────────────────────────────────────────────
  // CASE (FIR) MODULE — fields unique to CASE
  // ─────────────────────────────────────────────────────────────────────────────
  { id: 'C_29', field_key: 'case_type',                   field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST']), label_en: 'Case Registration Type',                  label_hi: 'मामला पंजीकरण प्रकार',                  visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 0,  validation_rules: JSON.stringify({ required: false }), options: JSON.stringify([{ value: 'cctns(manual FIR)', label_en: 'cctns(manual FIR)', label_hi: 'सीसीटीएनएस (मैनुअल एफआईआर)' }, { value: 'eTheft', label_en: 'eTheft', label_hi: 'ई-चोरी' }, { value: 'eMVT', label_en: 'eMVT', label_hi: 'ई-एमवीटी' }, { value: 'NCRP', label_en: 'NCRP', label_hi: 'एनसीआरपी' }, { value: 'zero FIR', label_en: 'zero FIR', label_hi: 'जीरो एफआईआर' }]) },

  // Coordinates and incident details in general_info
  { id: 'C_lat',       field_key: 'latitude',             field_type: 'TEXT',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Latitude',                  label_hi: 'अक्षांश',                       visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 8.1 },
  { id: 'C_lng',       field_key: 'longitude',            field_type: 'TEXT',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Longitude',                 label_hi: 'रेखांश',                        visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 8.2 },
 // { id: 'C_incident_pl',field_key: 'place_of_incident',   field_type: 'TEXT',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Place of Incident',          label_hi: 'घटना का स्थान',                 visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 1.4 },
  //{ id: 'C_incident_dt',field_key: 'incident_date_time',  field_type: 'DATETIME', applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Date & Time of Incident',    label_hi: 'घटना की तारीख और समय',          visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 1.5 },

  // Conditional section fields
  { id: 'C_sec_ipc',   field_key: 'ipc_sections',         field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Sections (IPC)',                    label_hi: 'धाराएं (आईपीसी)',               visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11.1, show_when: JSON.stringify({ field: 'act_name', value: 'IPC' }), options: JSON.stringify([{ value: 'Sec 379 IPC', label_en: 'Sec 379 IPC', label_hi: 'धारा 379 आईपीसी' }, { value: 'Sec 302 IPC', label_en: 'Sec 302 IPC', label_hi: 'धारा 302 आईपीसी' }, { value: 'Sec 323 IPC', label_en: 'Sec 323 IPC', label_hi: 'धारा 323 आईपीसी' }, { value: 'Sec 406 IPC', label_en: 'Sec 406 IPC', label_hi: 'धारा 406 आईपीसी' }, { value: 'Sec 392 IPC', label_en: 'Sec 392 IPC', label_hi: 'धारा 392 आईपीसी' }, { value: 'Sec 356 IPC', label_en: 'Sec 356 IPC', label_hi: 'धारा 356 आईपीसी' }]) },
  { id: 'C_sec_exc',   field_key: 'excise_sections',      field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Sections (Excise Act)',             label_hi: 'धाराएं (उत्पाद शुल्क अधिनियम)', visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11.2, show_when: JSON.stringify({ field: 'act_name', value: 'Delhi Excise Act' }), options: JSON.stringify([{ value: 'Sec 33 Excise Act', label_en: 'Sec 33 Excise Act', label_hi: 'धारा 33 उत्पाद शुल्क अधिनियम' }, { value: 'Sec 38 Excise Act', label_en: 'Sec 38 Excise Act', label_hi: 'धारा 38 उत्पाद शुल्क अधिनियम' }, { value: 'Sec 42 Excise Act', label_en: 'Sec 42 Excise Act', label_hi: 'धारा 42 उत्पाद शुल्क अधिनियम' }]) },
  { id: 'C_sec_arms',  field_key: 'arms_sections',        field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Sections (Arms Act)',               label_hi: 'धाराएं (शस्त्र अधिनियम)',        visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11.3, show_when: JSON.stringify({ field: 'act_name', value: 'Arms Act' }), options: JSON.stringify([{ value: 'Sec 25 Arms Act', label_en: 'Sec 25 Arms Act', label_hi: 'धारा 25 शस्त्र अधिनियम' }, { value: 'Sec 27 Arms Act', label_en: 'Sec 27 Arms Act', label_hi: 'धारा 27 शस्त्र अधिनियम' }, { value: 'Sec 30 Arms Act', label_en: 'Sec 30 Arms Act', label_hi: 'धारा 30 शस्त्र अधिनियम' }]) },
  { id: 'C_sec_gamb',  field_key: 'gambling_sections',    field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Sections (Gambling Act)',           label_hi: 'धाराएं (जुआ अधिनियम)',          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11.4, show_when: JSON.stringify({ field: 'act_name', value: 'Gambling Act' }), options: JSON.stringify([{ value: 'Sec 3 Gambling Act', label_en: 'Sec 3 Gambling Act', label_hi: 'धारा 3 जुआ अधिनियम' }, { value: 'Sec 4 Gambling Act', label_en: 'Sec 4 Gambling Act', label_hi: 'धारा 4 जुआ अधिनियम' }, { value: 'Sec 13 Gambling Act', label_en: 'Sec 13 Gambling Act', label_hi: 'धारा 13 जुआ अधिनियम' }]) },
  { id: 'C_sec_oth',   field_key: 'other_sections',       field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE']), label_en: 'Sections (Other Act)',              label_hi: 'धाराएं (अन्य अधिनियम)',          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 11.5, show_when: JSON.stringify({ field: 'act_name', value: 'Other Act' }) },

  // Conditional Major Heads
  { id: 'C_maj_ipc',   field_key: 'ipc_major_head',       field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Major Head (IPC)',                  label_hi: 'मुख्य शीर्ष (आईपीसी)',          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12.1, show_when: JSON.stringify({ field: 'act_name', value: 'IPC' }), options: JSON.stringify([{ value: 'Theft', label_en: 'Theft', label_hi: 'चोरी' }, { value: 'Murder', label_en: 'Murder', label_hi: 'हत्या' }, { value: 'Hurt', label_en: 'Hurt', label_hi: 'चोट / नुकसान' }, { value: 'Cheating', label_en: 'Cheating', label_hi: 'धोखाधड़ी' }, { value: 'Robbery', label_en: 'Robbery', label_hi: 'डकैती / लूट' }]) },
  { id: 'C_maj_exc',   field_key: 'excise_major_head',    field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Major Head (Excise)',                 label_hi: 'मुख्य शीर्ष (उत्पाद शुल्क)',    visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12.2, show_when: JSON.stringify({ field: 'act_name', value: 'Delhi Excise Act' }), options: JSON.stringify([{ value: 'Possession', label_en: 'Possession', label_hi: 'कब्जा' }, { value: 'Sale', label_en: 'Sale', label_hi: 'बिक्री' }, { value: 'Smuggling', label_en: 'Smuggling', label_hi: 'तस्करी' }]) },
  { id: 'C_maj_arms',  field_key: 'arms_major_head',      field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Major Head (Arms)',                   label_hi: 'मुख्य शीर्ष (शस्त्र)',          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12.3, show_when: JSON.stringify({ field: 'act_name', value: 'Arms Act' }), options: JSON.stringify([{ value: 'Possession of illegal arms', label_en: 'Possession of illegal arms', label_hi: 'अवैध हथियारों का कब्जा' }, { value: 'Use of illegal arms', label_en: 'Use of illegal arms', label_hi: 'अवैध हथियारों का उपयोग' }]) },
  { id: 'C_maj_gamb',  field_key: 'gambling_major_head',  field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Major Head (Gambling)',               label_hi: 'मुख्य शीर्ष (जुआ)',            visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12.4, show_when: JSON.stringify({ field: 'act_name', value: 'Gambling Act' }), options: JSON.stringify([{ value: 'Gaming House', label_en: 'Gaming House', label_hi: 'गेमिंग हाउस / जुआघर' }, { value: 'Public Gambling', label_en: 'Public Gambling', label_hi: 'सार्वजनिक जुआ' }]) },
  { id: 'C_maj_oth',   field_key: 'other_major_head',     field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Major Head (Other)',                  label_hi: 'मुख्य शीर्ष (अन्य)',            visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12.5, show_when: JSON.stringify({ field: 'act_name', value: 'Other Act' }) },

  // Conditional Minor Heads (IPC)
  { id: 'C_min_thf',   field_key: 'theft_minor_head',     field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Minor Head (Theft)',                  label_hi: 'लघु शीर्ष (चोरी)',              visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.1, show_when: JSON.stringify({ field: 'ipc_major_head', value: 'Theft' }), options: JSON.stringify([{ value: 'Simple Theft', label_en: 'Simple Theft', label_hi: 'साधारण चोरी' }, { value: 'House Theft', label_en: 'House Theft', label_hi: 'घर की चोरी' }, { value: 'Snatching', label_en: 'Snatching', label_hi: 'छीना-झपटी' }, { value: 'Pick Pocketing', label_en: 'Pick Pocketing', label_hi: 'जेब कटना' }, { value: 'Vehicle Theft', label_en: 'Vehicle Theft', label_hi: 'वाहन चोरी' }]) },
  { id: 'C_min_mrd',   field_key: 'murder_minor_head',    field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Minor Head (Murder)',                 label_hi: 'लघु शीर्ष (हत्या)',             visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.2, show_when: JSON.stringify({ field: 'ipc_major_head', value: 'Murder' }), options: JSON.stringify([{ value: 'Culpable Homicide', label_en: 'Culpable Homicide', label_hi: 'गैर-इरादतन हत्या' }, { value: 'Attempt to Murder', label_en: 'Attempt to Murder', label_hi: 'हत्या का प्रयास' }, { value: 'Dowry Death', label_en: 'Dowry Death', label_hi: 'दहेज हत्या' }]) },
  { id: 'C_min_hrt',   field_key: 'hurt_minor_head',      field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Minor Head (Hurt)',                   label_hi: 'लघु शीर्ष (चोट)',               visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.3, show_when: JSON.stringify({ field: 'ipc_major_head', value: 'Hurt' }), options: JSON.stringify([{ value: 'Simple Hurt', label_en: 'Simple Hurt', label_hi: 'साधारण चोट' }, { value: 'Grievous Hurt', label_en: 'Grievous Hurt', label_hi: 'गंभीर चोट' }, { value: 'Acid Attack', label_en: 'Acid Attack', label_hi: 'तेजाब हमला' }]) },
  { id: 'C_min_cht',   field_key: 'cheating_minor_head',  field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Minor Head (Cheating)',               label_hi: 'लघु शीर्ष (धोखाधड़ी)',          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.4, show_when: JSON.stringify({ field: 'ipc_major_head', value: 'Cheating' }), options: JSON.stringify([{ value: 'Forgery', label_en: 'Forgery', label_hi: 'जालसाजी' }, { value: 'Cheating by Impersonation', label_en: 'Cheating by Impersonation', label_hi: 'भेष बदलकर धोखाधड़ी' }, { value: 'Criminal Breach of Trust', label_en: 'Criminal Breach of Trust', label_hi: 'आपराधिक विश्वासघात' }]) },
  { id: 'C_min_rob',   field_key: 'robbery_minor_head',   field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Minor Head (Robbery)',                label_hi: 'लघु शीर्ष (डकैती)',             visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.5, show_when: JSON.stringify({ field: 'ipc_major_head', value: 'Robbery' }), options: JSON.stringify([{ value: 'Dacoity', label_en: 'Dacoity', label_hi: 'डकैती' }, { value: 'Robbery on Highway', label_en: 'Robbery on Highway', label_hi: 'राजमार्ग पर डकैती' }, { value: 'Extortion', label_en: 'Extortion', label_hi: 'जबरन वसूली' }]) },
// ── Minor Heads: Delhi Excise Act ──────────────────────────────────────────
{ id: 'C_min_exc_pos', field_key: 'excise_possession_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Excise - Possession)', label_hi: 'लघु शीर्ष (आबकारी - कब्जा)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 13.6,
  show_when: JSON.stringify({ field: 'excise_major_head', value: 'Possession' }),
  options: JSON.stringify([
    { value: 'Country Liquor', label_en: 'Country Liquor', label_hi: 'देशी शराब' },
    { value: 'Foreign Liquor', label_en: 'Foreign Liquor', label_hi: 'विदेशी शराब' },
    { value: 'Illicit Liquor', label_en: 'Illicit Liquor', label_hi: 'अवैध शराब' },
  ]) },
{ id: 'C_min_exc_sale', field_key: 'excise_sale_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Excise - Sale)', label_hi: 'लघु शीर्ष (आबकारी - बिक्री)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 13.7,
  show_when: JSON.stringify({ field: 'excise_major_head', value: 'Sale' }),
  options: JSON.stringify([
    { value: 'Without License', label_en: 'Without License', label_hi: 'बिना लाइसेंस' },
    { value: 'After Hours', label_en: 'After Permitted Hours', label_hi: 'समय के बाद' },
  ]) },
{ id: 'C_min_exc_smug', field_key: 'excise_smuggling_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Excise - Smuggling)', label_hi: 'लघु शीर्ष (आबकारी - तस्करी)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 13.8,
  show_when: JSON.stringify({ field: 'excise_major_head', value: 'Smuggling' }),
  options: JSON.stringify([
    { value: 'Inter-State', label_en: 'Inter-State', label_hi: 'अंतर-राज्यीय' },
    { value: 'Local', label_en: 'Local', label_hi: 'स्थानीय' },
  ]) },

// ── Minor Heads: Arms Act ───────────────────────────────────────────────────
{ id: 'C_min_arms_pos', field_key: 'arms_possession_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Arms - Possession)', label_hi: 'लघु शीर्ष (शस्त्र - कब्जा)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 13.9,
  show_when: JSON.stringify({ field: 'arms_major_head', value: 'Possession of illegal arms' }),
  options: JSON.stringify([
    { value: 'Unlicensed', label_en: 'Unlicensed', label_hi: 'बिना लाइसेंस' },
    { value: 'Licensed Expired', label_en: 'Licensed (Expired)', label_hi: 'लाइसेंसी (समाप्त)' },
    { value: 'Country Made', label_en: 'Country Made', label_hi: 'देशी हथियार' },
  ]) },
{ id: 'C_min_arms_use', field_key: 'arms_use_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Arms - Use)', label_hi: 'लघु शीर्ष (शस्त्र - उपयोग)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 14.0,
  show_when: JSON.stringify({ field: 'arms_major_head', value: 'Use of illegal arms' }),
  options: JSON.stringify([
    { value: 'Firing', label_en: 'Firing', label_hi: 'फायरिंग' },
    { value: 'Threat', label_en: 'Threat/Intimidation', label_hi: 'धमकी/डराना' },
    { value: 'Injury', label_en: 'Caused Injury', label_hi: 'चोट पहुंचाना' },
  ]) },

// ── Minor Heads: Gambling Act ───────────────────────────────────────────────
{ id: 'C_min_gamb_house', field_key: 'gambling_house_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Gambling - House)', label_hi: 'लघु शीर्ष (जुआ - अड्डा)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 14.1,
  show_when: JSON.stringify({ field: 'gambling_major_head', value: 'Gaming House' }),
  options: JSON.stringify([
    { value: 'Permanent Adda', label_en: 'Permanent Adda', label_hi: 'स्थायी अड्डा' },
    { value: 'Temporary Adda', label_en: 'Temporary Adda', label_hi: 'अस्थायी अड्डा' },
  ]) },
{ id: 'C_min_gamb_pub', field_key: 'gambling_public_minor_head', field_type: 'SELECT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']),
  label_en: 'Minor Head (Gambling - Public)', label_hi: 'लघु शीर्ष (जुआ - सार्वजनिक)',
  visible_to_levels: L, editable_by_levels: E,
  section: 'incident_details', sort_order: 14.2,
  show_when: JSON.stringify({ field: 'gambling_major_head', value: 'Public Gambling' }),
  options: JSON.stringify([
    { value: 'Card Game', label_en: 'Card Game', label_hi: 'ताश का खेल' },
    { value: 'Satta/Betting', label_en: 'Satta / Betting', label_hi: 'सट्टा / शर्त' },
  ]) },

  // Conditional Minor Heads (Non-IPC)
  { id: 'C_min_exc',   field_key: 'excise_minor_head',    field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']), label_en: 'Minor Head (Excise)',                 label_hi: 'लघु शीर्ष (उत्पाद शुल्क)',      visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.6, show_when: JSON.stringify({ field: 'act_name', value: 'Delhi Excise Act' }) },
  { id: 'C_min_arms',  field_key: 'arms_minor_head',      field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']), label_en: 'Minor Head (Arms)',                   label_hi: 'लघु शीर्ष (शस्त्र)',            visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.7, show_when: JSON.stringify({ field: 'act_name', value: 'Arms Act' }) },
  { id: 'C_min_gamb',  field_key: 'gambling_minor_head',  field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST','UIDB']), label_en: 'Minor Head (Gambling)',               label_hi: 'लघु शीर्ष (जुआ)',              visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 13.8, show_when: JSON.stringify({ field: 'act_name', value: 'Gambling Act' }) },
{
  id: 'C_min_oth',
  field_key: 'other_minor_head',
  field_type: 'TEXT',
  applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
  label_en: 'Minor Head (Other)',
  label_hi: 'लघु शीर्ष (अन्य)',
  visible_to_levels: L,
  editable_by_levels: E,
  section: 'incident_details',
  sort_order: 13.9,
  show_when: JSON.stringify({
    field: 'act_name',
    value: 'Other Act'
  })
},
  // Occurrence timeline fields
  { id: 'C_occ_type',  field_key: 'occurrence_time_type', field_type: 'RADIO',    applicable_record_types: JSON.stringify(['CASE']),     label_en: 'Is Time of Occurrence',               label_hi: 'क्या घटना का समय ज्ञात है?',     visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 1.0, validation_rules: JSON.stringify({ required: true }), options: JSON.stringify([{ value: 'Known', label_en: 'Known', label_hi: 'ज्ञात' }, { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }]) },
  { id: 'C_occ_from',  field_key: 'occurrence_from_date_time', field_type: 'DATETIME', applicable_record_types: JSON.stringify(['CASE']), label_en: 'From Date / Time',                        label_hi: 'दिनांक / समय से',               visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 1.1, validation_rules: JSON.stringify({ required: true }) },
  { id: 'C_occ_to',    field_key: 'occurrence_to_date_time',   field_type: 'DATETIME', applicable_record_types: JSON.stringify(['CASE']), label_en: 'To Date / Time',                          label_hi: 'दिनांक / समय तक',               visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 1.2, validation_rules: JSON.stringify({ required: true }) },
  { id: 'C_rec_ps',    field_key: 'info_received_at_ps_date_time', field_type: 'DATETIME', applicable_record_types: JSON.stringify(['CASE']), label_en: 'Information received at P.S.',            label_hi: 'थाने पर सूचना प्राप्त होने का समय',visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 1.3, validation_rules: JSON.stringify({ required: true }) },
  { id: 'C_org_crime',  field_key: 'organised_crime',      field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE']), label_en: 'Organised Crime',                   label_hi: 'संगठित अपराध',                 visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 1.4, options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },

  // Occurrence address extra fields (latitude/longitude)
  { id: 'occ_latitude',  field_key: 'occurrence_latitude',  field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Place of Occurrence Latitude',        label_hi: 'घटनास्थल का अक्षांश',           visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 4.1, is_active: true, scope_level: 'global' },
  { id: 'occ_longitude', field_key: 'occurrence_longitude', field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Place of Occurrence Longitude',       label_hi: 'घटनास्थल का रेखांश',            visible_to_levels: L, editable_by_levels: E, section: 'occurrence_info',        sort_order: 4.2, is_active: true, scope_level: 'global' },

  // Intimation details fields
  { id: 'intimation_dt', field_key: 'intimation_date_time', field_type: 'DATETIME', applicable_record_types: JSON.stringify([ 'ARREST']), label_en: 'Date & Time of Intimation',          label_hi: 'सूचना का दिनांक और समय',        visible_to_levels: L, editable_by_levels: E, section: 'intimation_details',     sort_order: 1.0, is_active: true, scope_level: 'global' },
  { id: 'intimation_rel_name', field_key: 'intimated_relative_name', field_type: 'TEXT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Name of the Relative Intimated', label_hi: 'सूचित रिश्तेदार का नाम', visible_to_levels: L, editable_by_levels: E, section: 'intimation_details', sort_order: 1.5, is_active: true, scope_level: 'global' },
  { id: 'intimation_rel_type', field_key: 'intimated_relative_relation', field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Relation with the Arrested', label_hi: 'गिरफ्तार व्यक्ति से संबंध', visible_to_levels: L, editable_by_levels: E, section: 'intimation_details', sort_order: 1.6, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Father', label_en: 'Father', label_hi: 'पिता' }, { value: 'Mother', label_en: 'Mother', label_hi: 'माता' }, { value: 'Brother', label_en: 'Brother', label_hi: 'भाई' }, { value: 'Sister', label_en: 'Sister', label_hi: 'बहन' }, { value: 'Husband', label_en: 'Husband', label_hi: 'पति' }, { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' }, { value: 'Son', label_en: 'Son', label_hi: 'पुत्र' }, { value: 'Daughter', label_en: 'Daughter', label_hi: 'पुत्री' }, { value: 'Friend', label_en: 'Friend', label_hi: 'मित्र' }, { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }]) },
  { id: 'intimation_mode', field_key: 'intimation_mode', field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Mode of Intimation', label_hi: 'सूचना का माध्यम', visible_to_levels: L, editable_by_levels: E, section: 'intimation_details', sort_order: 1.7, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'By Email', label_en: 'By Email', label_hi: 'ईमेल द्वारा' }, { value: 'By Phone', label_en: 'By Phone', label_hi: 'फोन द्वारा' }, { value: 'By Post', label_en: 'By Post', label_hi: 'डाक द्वारा' }, { value: 'By SMS', label_en: 'By SMS', label_hi: 'एसएमएस द्वारा' }, { value: 'In-Person', label_en: 'In-Person', label_hi: 'व्यक्तिगत रूप से' }, { value: 'Online', label_en: 'Online', label_hi: 'ऑनलाइन' }, { value: 'PCR Call', label_en: 'PCR Call', label_hi: 'पीसीआर कॉल' }, { value: 'WT Message', label_en: 'WT Message', label_hi: 'वायरलेस संदेश' }]) },
  { id: 'C_1',  field_key: 'fir_no',                      field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE']), label_en: 'FIR Number,Date & Time',                       label_hi: 'प्राथमिकी (FIR) संख्या और दिनांक',      visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 1,  validation_rules: JSON.stringify({ required: false }) },
  { id: 'C_2',  field_key: 'fir_date',                    field_type: 'DATE',     applicable_record_types: JSON.stringify([]),       label_en: 'FIR Date',                                label_hi: 'एफआईआर तिथि',                           visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 2,  validation_rules: JSON.stringify({ required: false }) },
  { id: 'C_2_time',  field_key: 'fir_time',           field_type: 'TIME',   applicable_record_types: JSON.stringify([]),                              label_en: 'FIR Time',                     label_hi: 'प्राथमिकी का समय',               visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 3 },
  { id: 'C_6',  field_key: 'beat_no',                     field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE']), label_en: 'Beat No.',                                label_hi: 'बीट नंबर',                              visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 6 },
  { id: 'C_7',  field_key: 'occurrence_date',             field_type: 'DATE',     applicable_record_types: JSON.stringify([]),           label_en: 'Date of Occurrence',                      label_hi: 'घटना की तिथि',                          visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 7,  validation_rules: JSON.stringify({ required: false }) },
  { id: 'C_9',  field_key: 'local_head',                  field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE','ARREST','UIDB']), label_en: 'Local Head (Crime)',                       label_hi: 'स्थानीय अपराध शीर्ष',                   visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 9,  validation_rules: JSON.stringify({ required: false }), is_active: true, scope_level: 'global', options: CRIME_HEAD_OPTS },
  { id: 'C_12', field_key: 'brief_facts',                 field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['CASE']), label_en: 'Brief Facts of the Case',                 label_hi: 'मामले का संक्षिप्त विवरण',              visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 12, validation_rules: JSON.stringify({ required: false }), full_width: true },
  { id: 'C_13', field_key: 'complainant_name',            field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),           label_en: 'Complainant Name',                         label_hi: 'शिकायतकर्ता का नाम',                    visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 13, validation_rules: JSON.stringify({ required: false }) },
  { id: 'C_14', field_key: 'complainant_address',         field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),           label_en: 'Complainant Address',                      label_hi: 'शिकायतकर्ता का पता',                    visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 14 },
  { id: 'C_18', field_key: 'io_pis',                      field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']), label_en: 'PIS No. of IO',                            label_hi: 'जांच अधिकारी का पीआईएस नंबर',           visible_to_levels: L, editable_by_levels: E, section: 'investigation_officer',   sort_order: 502 },
  { id: 'C_20', field_key: 'property_description',        field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),           label_en: 'Property Description',                    label_hi: 'संपत्ति का विवरण',                      visible_to_levels: L, editable_by_levels: E, section: 'recovered_property',      sort_order: 341, full_width: true },
  { id: 'C_21', field_key: 'property_status',             field_type: 'SELECT',   applicable_record_types: JSON.stringify([]),           label_en: 'Stolen Property Status',                  label_hi: 'चोरी संपत्ति की स्थिति',                visible_to_levels: L, editable_by_levels: E, section: 'stolen_property',         sort_order: 332, options: JSON.stringify([{ value: 'Stolen', label_en: 'Stolen', label_hi: 'चोरी हुई' }, { value: 'NA', label_en: 'N/A', label_hi: 'लागू नहीं' }]) },
  { id: 'C_23', field_key: 'remarks',                     field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),           label_en: 'Remarks (Stolen)',                         label_hi: 'टिप्पणियां (चोरी)',                     visible_to_levels: L, editable_by_levels: E, section: 'stolen_property',         sort_order: 334, full_width: true },
  { id: 'C_26', field_key: 'time_of_occurrence',          field_type: 'TIME',     applicable_record_types: JSON.stringify([]),           label_en: 'Time of Occurrence',                      label_hi: 'घटना का समय',                           visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 26, is_active: true, scope_level: 'global' },
  { id: 'C_30', field_key: 'complainant_parent_name',     field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),           label_en: 'Complainant Parent Name',                 label_hi: 'शिकायतकर्ता के माता/पिता का नाम',       visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 14, is_active: false, scope_level: 'global' },
  { id: 'C_35', field_key: 'complainant_age',             field_type: 'NUMBER',   applicable_record_types: JSON.stringify([]),           label_en: 'Complainant Age',                         label_hi: 'शिकायतकर्ता की आयु',                    visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 15, is_active: false, scope_level: 'global' },
  { id: 'C_33', field_key: 'stolen_property',             field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),           label_en: 'Property Description',                    label_hi: 'संपत्ति का विवरण',                      visible_to_levels: L, editable_by_levels: E, section: 'stolen_property',         sort_order: 331, is_active: false, scope_level: 'global', full_width: true },
  { id: 'C_34', field_key: 'recovered_property',          field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),           label_en: 'Recovery Property',                       label_hi: 'बरामद की गई संपत्ति',                   visible_to_levels: L, editable_by_levels: E, section: 'recovered_property',      sort_order: 342, is_active: true, scope_level: 'global', full_width: true },
  { id: 'C_36', field_key: 'recovered_property_status',   field_type: 'SELECT',   applicable_record_types: JSON.stringify([]),           label_en: 'Recovered Property Status',               label_hi: 'बरामद संपत्ति की स्थिति',               visible_to_levels: L, editable_by_levels: E, section: 'recovered_property',      sort_order: 343, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Recovered', label_en: 'Recovered', label_hi: 'बरामद' }, { value: 'NA', label_en: 'N/A', label_hi: 'लागू नहीं' }]) },
  { id: 'C_37', field_key: 'recovered_case_status',       field_type: 'SELECT',   applicable_record_types: JSON.stringify([]),           label_en: 'Case Status',                             label_hi: 'मामले की स्थिति',                       visible_to_levels: L, editable_by_levels: E, section: 'recovered_property',      sort_order: 344, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Open', label_en: 'Open', label_hi: 'लंबित' }, { value: 'Chargesheeted', label_en: 'Chargesheeted', label_hi: 'चार्जशीट' }, { value: 'Closed', label_en: 'Closed', label_hi: 'बंद' }]) },
  { id: 'C_38', field_key: 'recovered_remarks',           field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),           label_en: 'Remarks (Recovered)',                      label_hi: 'टिप्पणियां (बरामद)',                    visible_to_levels: L, editable_by_levels: E, section: 'recovered_property',      sort_order: 345, is_active: true, scope_level: 'global', full_width: true },

  // Phone detail fields — inside PROPERTY repeater, visible only when property_major_category = 'Mobile Phone'
  { id: 'PH_0', field_key: 'property_phone_number',       field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Phone Number',                        label_hi: 'फोन नंबर',                              visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 309, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }) },
  { id: 'PH_1', field_key: 'phone_make',                  field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Phone Make / Brand',                  label_hi: 'फोन का ब्रांड',                         visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 310, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }) },
  { id: 'PH_2', field_key: 'phone_model',                 field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Phone Model',                         label_hi: 'फोन का मॉडल',                           visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 311, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }) },
  { id: 'PH_3', field_key: 'phone_imei',                  field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'IMEI Number',                         label_hi: 'आईएमईआई नंबर',                          visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 312, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }) },
  { id: 'PH_4', field_key: 'phone_color',                 field_type: 'TEXT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Phone Color',                         label_hi: 'फोन का रंग',                            visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 313, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }) },
  { id: 'PH_5', field_key: 'phone_status',                field_type: 'SELECT',   applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Phone Recovery Status',               label_hi: 'फोन बरामदगी स्थिति',                    visible_to_levels: L, editable_by_levels: E, section: 'property_details', repeater_entity: 'PROPERTY', sort_order: 314, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'property_major_category', value: ['Mobile Phone'] }), options: JSON.stringify([{ value: 'NOT_RECOVERED', label_en: 'Not Recovered', label_hi: 'बरामद नहीं' }, { value: 'RECOVERED', label_en: 'Recovered', label_hi: 'बरामद' }, { value: 'PARTIAL', label_en: 'Partially Recovered', label_hi: 'आंशिक रूप से बरामद' }]) },

  // Daily Diary extra CASE fields
  { id: 'DD_C1',  field_key: 'complainant_father_husband_name', field_type: 'TEXT',   applicable_record_types: JSON.stringify([]),           label_en: "Complainant's Father / Husband Name",   label_hi: 'शिकायतकर्ता के पिता / पति का नाम',     visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 14, is_active: false, scope_level: 'global' },
  { id: 'DD_C2',  field_key: 'accused_name',                    field_type: 'TEXT',   applicable_record_types: JSON.stringify([]),           label_en: 'Accused Name',                          label_hi: 'अभियुक्त का नाम',                       visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 20, is_active: false, scope_level: 'global' },
  { id: 'DD_C3',  field_key: 'accused_father_name',             field_type: 'TEXT',   applicable_record_types: JSON.stringify([]),           label_en: "Accused Father's Name",                 label_hi: 'अभियुक्त के पिता का नाम',               visible_to_levels: L, editable_by_levels: E, section: 'complainant_accused_info', sort_order: 21, is_active: false, scope_level: 'global' },
  { id: 'DD_C4',  field_key: 'occurrence_time',                 field_type: 'TIME',   applicable_record_types: JSON.stringify(['CASE']),     label_en: 'Time of Occurrence',                    label_hi: 'घटना का समय',                           visible_to_levels: L, editable_by_levels: E, section: 'incident_details',        sort_order: 8,  is_active: false, scope_level: 'global' }, // duplicate of C_26 — deactivated
  // Vehicle fields — only visible when case_type is eMVT or eTheft
  { id: 'DD_C5',  field_key: 'vehicle_no',                      field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Vehicle Registration No.',               label_hi: 'वाहन पंजीकरण संख्या',                   visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 50,   is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C6',  field_key: 'vehicle_type',                    field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE']), label_en: 'Vehicle Type',                          label_hi: 'वाहन का प्रकार',                        visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51,   is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }), options: JSON.stringify([{ value: 'Car', label_en: 'Car', label_hi: 'कार' }, { value: 'Motorcycle', label_en: 'Motorcycle', label_hi: 'मोटरसाइकिल' }, { value: 'Scooter', label_en: 'Scooter', label_hi: 'स्कूटर' }, { value: 'E-Rickshaw', label_en: 'E-Rickshaw', label_hi: 'ई-रिक्शा' }, { value: 'Auto', label_en: 'Auto Rickshaw', label_hi: 'ऑटो रिक्शा' }, { value: 'Tempo', label_en: 'Tempo / Truck', label_hi: 'टेम्पो / ट्रक' }, { value: 'Cycle', label_en: 'Bicycle', label_hi: 'साइकिल' }, { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }]) },
  { id: 'DD_C6a', field_key: 'vehicle_make',                    field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Vehicle Make / Manufacturer',            label_hi: 'वाहन निर्माता / ब्रांड',                visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51.1, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C6b', field_key: 'vehicle_model',                   field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Vehicle Model',                         label_hi: 'वाहन मॉडल',                             visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51.2, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C6c', field_key: 'vehicle_color',                   field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Vehicle Color',                         label_hi: 'वाहन का रंग',                           visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51.3, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C6d', field_key: 'vehicle_chassis_no',              field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Chassis Number',                        label_hi: 'चेसिस नंबर',                            visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51.4, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C6e', field_key: 'vehicle_engine_no',               field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Engine Number',                         label_hi: 'इंजन नंबर',                             visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 51.5, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }) },
  { id: 'DD_C7',  field_key: 'cd_uploaded_24h',                 field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE']), label_en: '1st CD Uploaded Within 24 Hours',       label_hi: 'पहली सीडी 24 घंटे में अपलोड की गई',    visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 52,   is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }), options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_C8',  field_key: 'footage_collected',               field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE']), label_en: 'CCTV Footage Collected',                label_hi: 'सीसीटीवी फुटेज एकत्र किया गया',        visible_to_levels: L, editable_by_levels: E, section: 'vehicle_details', sort_order: 53,   is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'case_type', value: ['eMVT', 'eTheft'] }), options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_C9',  field_key: 'rc_no',                           field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'RC No.',                                label_hi: 'आरसी संख्या',                           visible_to_levels: L, editable_by_levels: E, section: 'investigation_details',   sort_order: 60, is_active: true, scope_level: 'global' },
  { id: 'DD_C10', field_key: 'disposal_type',                   field_type: 'SELECT', applicable_record_types: JSON.stringify(['CASE']), label_en: 'Disposal Type',                         label_hi: 'निपटान प्रकार',                         visible_to_levels: L, editable_by_levels: E, section: 'investigation_details',   sort_order: 61, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Challan', label_en: 'Challan', label_hi: 'चालान' }, { value: 'Untrace', label_en: 'Untraced', label_hi: 'अपता' }, { value: 'Cancel', label_en: 'Cancelled', label_hi: 'रद्द' }]) },
  { id: 'DD_C11', field_key: 'cause_of_death',                  field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Cause of Death',                        label_hi: 'मृत्यु का कारण',                        visible_to_levels: L, editable_by_levels: E, section: 'inquest_details',         sort_order: 70, is_active: true, scope_level: 'UIDB', options: JSON.stringify([{ value: 'Accidental', label_en: 'Accidental', label_hi: 'दुर्घटना' }, { value: 'Natural', label_en: 'Natural', label_hi: 'प्राकृतिक' }, { value: 'Suicide', label_en: 'Suicide', label_hi: 'आत्महत्या' },{ value: 'Drowning', label_en: 'Drowning', label_hi: 'डूबना' }, { value: 'Murder', label_en: 'Murder', label_hi: 'हत्या' }, { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }]) },
  { id: 'DD_C12_name', field_key: 'deceased_relative_name',    field_type: 'TEXT',   applicable_record_types: JSON.stringify(['UIDB']), label_en: "Relative Name",                         label_hi: 'रिश्तेदार का नाम',                     visible_to_levels: L, editable_by_levels: E, section: 'inquest_details',         sort_order: 71, is_active: true, scope_level: 'UIDB', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'DD_C12_rel',  field_key: 'deceased_relation_type',     field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: "Relation with Deceased",              label_hi: 'मृतक से संबंध',                          visible_to_levels: L, editable_by_levels: E, section: 'inquest_details',         sort_order: 71.5,is_active: true, scope_level: 'UIDB', show_when: JSON.stringify({ field: 'identified', value: true }), options: JSON.stringify([{ value: 'Father', label_en: 'Father', label_hi: 'पिता' }, { value: 'Mother', label_en: 'Mother', label_hi: 'माता' }, { value: 'Husband', label_en: 'Husband', label_hi: 'पति' }, { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' }, { value: 'Brother', label_en: 'Brother', label_hi: 'भाई' }, { value: 'Sister', label_en: 'Sister', label_hi: 'बहन' }, { value: 'Son', label_en: 'Son', label_hi: 'पुत्र' }, { value: 'Daughter', label_en: 'Daughter', label_hi: 'पुत्री' }, { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' }, { value: 'Friend', label_en: 'Friend', label_hi: 'मित्र' }, { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }]) },
  { id: 'DD_C13', field_key: 'is_important',                    field_type: 'BOOLEAN',applicable_record_types: JSON.stringify(['CASE']), label_en: 'Mark as Important Case',                label_hi: 'महत्वपूर्ण मामले के रूप में चिह्नित करें', visible_to_levels: L, editable_by_levels: E, section: 'general_info',         sort_order: 99, is_active: true, scope_level: 'global' },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARREST MODULE — fields unique to ARREST
  // ─────────────────────────────────────────────────────────────────────────────
  { id: 'A_1',  field_key: 'linked_fir_dd_no',            field_type: 'NUMBER',   applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Linked FIR / DD No.',              label_hi: 'संबंधित एफआईआर / डीडी संख्या',         visible_to_levels: L, editable_by_levels: E, section: 'general_info',   sort_order: 1 },
  { id: 'A_4',  field_key: 'arrested_name',               field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),           label_en: 'Name of Arrested Person',          label_hi: 'गिरफ्तार व्यक्ति का नाम',              visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 4, validation_rules: JSON.stringify({ required: false }) },
  { id: 'A_5',  field_key: 'arrested_address',            field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),           label_en: 'Address of Arrested',              label_hi: 'गिरफ्तार का पता',                       visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 5 },
  { id: 'A_6',  field_key: 'arrest_date',                 field_type: 'DATE',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Date & Time of Arrest',                   label_hi: 'गिरफ्तारी की तिथि',                    visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 6, validation_rules: JSON.stringify({ required: false }) },
  { id: 'A_7',  field_key: 'arrest_place',                field_type: 'TEXT',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Place of Arrest',                  label_hi: 'गिरफ्तारी का स्थान',                   visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 7 },
  { id: 'A_8',  field_key: 'crime_head',                  field_type: 'SELECT',   applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Crime Head',                       label_hi: 'अपराध शीर्ष',                          visible_to_levels: L, editable_by_levels: E, section: 'offence_info',   sort_order: 8, validation_rules: JSON.stringify({ required: false }), is_active: true, scope_level: 'global', options: CRIME_HEAD_OPTS },
  { id: 'A_10', field_key: 'other_status_reason',         field_type: 'SELECT',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Other Status Reason',              label_hi: 'अन्य स्थिति का कारण',                  visible_to_levels: L, editable_by_levels: E, section: 'custody_status', sort_order: 10, show_when: JSON.stringify({ field: 'status', value: 'others' }), options: JSON.stringify([
    { value: 'JC', label_en: 'JC', label_hi: 'JC' },
    { value: 'PC', label_en: 'PC', label_hi: 'PC' },
    { value: 'Bail', label_en: 'Bail', label_hi: 'जमानत' },
    { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
    { value: 'Release', label_en: 'Release', label_hi: 'रिहाई' },
    { value: 'Lockup', label_en: 'Lockup', label_hi: 'Lockup' },
    { value: 'Fine', label_en: 'Fine', label_hi: 'Fine' },
    { value: '35(3) BNS Notice', label_en: '35(3) BNS Notice', label_hi: '35(3) BNS Notice' }]) },
  { id: 'A_31', field_key: 'scheme_of_arrest',            field_type: 'SELECT',   applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Scheme of Arrest',                  label_hi: 'गिरफ्तारी की योजना',                  visible_to_levels: L, editable_by_levels: E, section: 'arrested_info', sort_order: 10.5, validation_rules: JSON.stringify({ required: false }), options: JSON.stringify([
    { value: 'Integrated Pride', label_en: 'Integrated Pride', label_hi: 'Integrated Pride' },
    { value: 'Group Patrolling', label_en: 'Group Patrolling', label_hi: 'Group Patrolling' },
    { value: 'Anti-snatching', label_en: 'Anti-snatching', label_hi: 'Anti-snatching' },
    { value: 'By Prahari', label_en: 'By Prahari', label_hi: 'By Prahari' },
    { value: 'By Eyes & Ears Scheme Members', label_en: 'By Eyes & Ears Scheme Members', label_hi: 'By Eyes & Ears Scheme Members' }]) },
    
  { id: 'A_12', field_key: 'nafis_prepared',              field_type: 'RADIO',  applicable_record_types: JSON.stringify(['ARREST']), label_en: 'NAFIS Prepared',                   label_hi: 'नाफिस तैयार किया गया',                 visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 12, show_when: JSON.stringify({ required: false }), is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'A_13', field_key: 'dossier_prepared',            field_type: 'RADIO',  applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Dossier Prepared',                 label_hi: 'डोजियर तैयार किया गया',                visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 13, show_when: JSON.stringify({ required: false }), is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'A_14', field_key: 'age_gender',                  field_type: 'TEXT',     applicable_record_types: JSON.stringify([]), label_en: 'Age / Gender',                     label_hi: 'आयु / लिंग',                           visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 14, is_active: true, scope_level: 'global' },
  { id: 'A_15', field_key: 'nick_name',                   field_type: 'TEXT',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Nick Name',                        label_hi: 'उपनाम',                                visible_to_levels: L, editable_by_levels: E, section: 'arrested_personal_info', sort_order: 403.5, is_active: true, scope_level: 'global' },
  { id: 'A_16', field_key: 'parents_name',                field_type: 'TEXT',     applicable_record_types: JSON.stringify([]), label_en: 'Parents Name',                     label_hi: 'माता-पिता का नाम',                     visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 16, is_active: true, scope_level: 'global' },
  { id: 'A_17', field_key: 'prev_involvement',            field_type: 'SELECT',   applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Prev. Involvement (Y/N)',           label_hi: 'पूर्व संलिप्तता (हाँ/नहीं)',           visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 17, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
 // { id: 'A_18', field_key: 'recovery',                    field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Recovery',                         label_hi: 'बरामदगी',                              visible_to_levels: L, editable_by_levels: E, section: 'custody_status', sort_order: 11, is_active: true, scope_level: 'global', full_width: true },
  { id: 'A_19', field_key: 'bc_or_not',                   field_type: 'SELECT',   applicable_record_types: JSON.stringify([]), label_en: 'BC or Not',                        label_hi: 'बीसी है या नहीं',                      visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 19, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'A_22', field_key: 'nafis_dossier',               field_type: 'SELECT',   applicable_record_types: JSON.stringify([]), label_en: 'NAFIS / Dossier (Y/N)',            label_hi: 'नाफिस / डोजियर (हाँ/नहीं)',           visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 22, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'A_23', field_key: 'scheme',                      field_type: 'SELECT',   applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Scheme (Special Scheme Arrest)',    label_hi: 'योजना (विशेष योजना गिरफ्तारी)',        visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 23, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Integrated PI', label_en: 'Integrated PI', label_hi: 'एकीकृत पीआई' }, { value: 'Grp patrolling', label_en: 'Group Patrolling', label_hi: 'समूह गश्त' }, { value: 'Cycle patrol', label_en: 'Cycle Patrol', label_hi: 'साइकिल गश्त' }, { value: 'Anti-snatching', label_en: 'Anti-Snatching Team', label_hi: 'छीना-झपटी रोधी दल' }, { value: 'PRAHARI', label_en: 'PRAHARI', label_hi: 'प्रहरी' }, { value: 'Eye & ear', label_en: 'Eyes & Ears Scheme Members', label_hi: 'नेत्र और कान योजना सदस्य' }]) },
  { id: 'A_25', field_key: 'io_rank',                     field_type: 'SELECT',     applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']), label_en: 'IO Rank',                          label_hi: 'जांच अधिकारी का पद',                   visible_to_levels: L, editable_by_levels: E, section: 'investigation_officer', sort_order: 501, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Constable', label_en: 'Constable', label_hi: 'कांस्टेबल' }, { value: 'Head Constable', label_en: 'Head Constable', label_hi: 'हेड कांस्टेबल' }, { value: 'Assistant Sub Inspector', label_en: 'Assistant Sub Inspector', label_hi: 'सहायक उप निरीक्षक' }, { value: 'Sub Inspector', label_en: 'Sub Inspector', label_hi: 'उप निरीक्षक' }, { value: 'Inspector', label_en: 'Inspector', label_hi: 'निरीक्षक' }, { value: 'Deputy Superintendent of Police', label_en: 'Deputy Superintendent of Police', label_hi: 'पुलिस उप अधीक्षक' }, { value: 'Superintendent of Police', label_en: 'Superintendent of Police', label_hi: 'पुलिस अधीक्षक' }])},
  { id: 'A_26', field_key: 'arrested_age',                field_type: 'NUMBER',   applicable_record_types: JSON.stringify([]),   label_en: 'Age',                              label_hi: 'आयु',                                  visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 6,  is_active: true, scope_level: 'global' },
  { id: 'A_27', field_key: 'arresting_officer_mobile',    field_type: 'TEXT',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Contact of Arresting Officer',     label_hi: 'गिरफ्तार करने वाले अधिकारी का मोबाइल', visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 25, is_active: true, scope_level: 'global' },
  { id: 'A_28', field_key: 'io_mobile_2',                 field_type: 'TEXT',     applicable_record_types: JSON.stringify([]), label_en: 'Contact of IO',                    label_hi: 'जांच अधिकारी का मोबाइल',               visible_to_levels: L, editable_by_levels: E, section: 'procedure_slips', sort_order: 26, is_active: true, scope_level: 'global' },
  { id: 'A_29', field_key: 'is_po',                       field_type: 'SELECT',   applicable_record_types: JSON.stringify([]), label_en: 'Is the person PO',                 label_hi: 'क्या व्यक्ति घोषित अपराधी (PO) है',   visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 24, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'A_30', field_key: 'arresting_officer',           field_type: 'TEXT',     applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arresting Officer',                label_hi: 'गिरफ्तार करने वाले अधिकारी',           visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 30, is_active: true, scope_level: 'global' },
  { id: 'A_31', field_key: 'arrest_time',                 field_type: 'TIME',     applicable_record_types: JSON.stringify([]), label_en: 'Time of Arrest',                   label_hi: 'गिरफ्तारी का समय',                     visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 7,  is_active: true, scope_level: 'global' },

  // Daily Diary extra ARREST fields
  { id: 'DD_A1',  field_key: 'arrested_father_husband_name', field_type: 'TEXT',   applicable_record_types: JSON.stringify([]),   label_en: "Arrested Person's Father / Husband Name", label_hi: 'गिरफ्तार व्यक्ति के पिता / पति का नाम', visible_to_levels: L, editable_by_levels: E, section: 'arrestee_info',  sort_order: 5,  is_active: true, scope_level: 'global' },
  { id: 'DD_A2',  field_key: 'bad_character',               field_type: 'SELECT', applicable_record_types: JSON.stringify([]), label_en: 'Is Bad Character (BC)',                   label_hi: 'बदमाश (बीसी) है या नहीं',               visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 20, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A3',  field_key: 'proclaimed_offender',         field_type: 'SELECT',applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Proclaimed Offender (PO)',                label_hi: 'घोषित अपराधी (पीओ)',                    visible_to_levels: L, editable_by_levels: E, section: 'arrest_details', sort_order: 21, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
{ id: 'DD_A4', field_key: 'listed_criminal', field_type: 'RADIO',
  applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Listed Criminal / Bad Character (BC)',label_hi: 'सूचीबद्ध अपराधी / बैड कैरेक्टर (BC)',visible_to_levels: L, editable_by_levels: E,
  section: 'arrest_details', sort_order: 510.5,
  is_active: true, scope_level: 'global',
  options: JSON.stringify([
    { value: true,  label_en: 'Yes', label_hi: 'हाँ' },
    { value: false, label_en: 'No',  label_hi: 'नहीं' },
  ])
},  { id: 'DD_A5',  field_key: 'integrated_pi',               field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via Integrated PI',              label_hi: 'एकीकृत पीआई से गिरफ्तार',              visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 30, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A6',  field_key: 'group_patrolling',            field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via Group Patrolling',           label_hi: 'समूह गश्त से गिरफ्तार',                visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 31, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A7',  field_key: 'cycle_patrolling',            field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via Cycle Patrolling',           label_hi: 'साइकिल गश्त से गिरफ्तार',              visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 32, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A8',  field_key: 'by_antisnatching_team',       field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via Anti-Snatching Team',        label_hi: 'छीना-झपटी रोधी दल से गिरफ्तार',       visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 33, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A9',  field_key: 'by_prahari',                  field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via PRAHARI Scheme',             label_hi: 'प्रहरी योजना से गिरफ्तार',             visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 34, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A10', field_key: 'by_eyes_ears_scheme_members', field_type: 'SELECT', applicable_record_types: JSON.stringify(['ARREST']), label_en: 'Arrested via Eyes & Ears Scheme',         label_hi: 'नेत्र और कान योजना से गिरफ्तार',      visible_to_levels: L, editable_by_levels: E, section: 'special_scheme', sort_order: 35, is_active: false, scope_level: 'global', options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'DD_A11', field_key: 'cheated_amount',              field_type: 'TEXT',   applicable_record_types: JSON.stringify(['CASE']), label_en: 'Amount Cheated / Defrauded',              label_hi: 'धोखाधड़ी की गई राशि',                  visible_to_levels: L, editable_by_levels: E, section: 'financial_fraud', sort_order: 40, is_active: true, scope_level: 'global' },
  { id: 'DD_A12', field_key: 'modus_operandi',              field_type: 'TEXTAREA',applicable_record_types: JSON.stringify(['CASE']), label_en: 'Modus Operandi',                         label_hi: 'अपराध करने का तरीका',                  visible_to_levels: L, editable_by_levels: E, section: 'financial_fraud', sort_order: 41, is_active: true, scope_level: 'global', full_width: true },

  // ── Property Section (Repeater) ──────────────────────────────────────────────────────────
  { id: 'PROP_1', field_key: 'property_major_category',   field_type: 'SELECT', repeater_entity: 'PROPERTY',   applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Property Major Category',       label_hi: 'संपत्ति मुख्य श्रेणी',                   visible_to_levels: L, editable_by_levels: E, section: 'property_details',        sort_order: 330, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Vehicle', label_en: 'Vehicle', label_hi: 'वाहन' }, { value: 'Mobile Phone', label_en: 'Mobile Phone', label_hi: 'मोबाइल फोन' }, { value: 'Cash', label_en: 'Cash', label_hi: 'नकद' }, { value: 'Jewellery', label_en: 'Gold/Jewellery', label_hi: 'सोना/आभूषण' }, { value: 'Electronics', label_en: 'Electronics/Gadgets', label_hi: 'इलेक्ट्रॉनिक्स' }, { value: 'Documents', label_en: 'Official/Personal Documents', label_hi: 'दस्तावेज़' }, { value: 'Drugs', label_en: 'Drugs/Narcotics', label_hi: 'नशीले पदार्थ' }, { value: 'Arms', label_en: 'Arms/Ammunition', label_hi: 'हथियार' }, { value: 'Others', label_en: 'Others', label_hi: 'अन्य' }]) },
  { id: 'PROP_2', field_key: 'property_minor_category',   field_type: 'TEXT',     repeater_entity: 'PROPERTY', applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Property Minor Category',       label_hi: 'संपत्ति उप श्रेणी',                      visible_to_levels: L, editable_by_levels: E, section: 'property_details',        sort_order: 331, is_active: true, scope_level: 'global' },
  { id: 'PROP_3', field_key: 'property_details',          field_type: 'TEXTAREA', repeater_entity: 'PROPERTY', applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Property Details / Description',  label_hi: 'संपत्ति का विवरण',                       visible_to_levels: L, editable_by_levels: E, section: 'property_details',        sort_order: 332, is_active: true, scope_level: 'global', full_width: true },
  { id: 'PROP_4', field_key: 'property_stolen_recovered', field_type: 'SELECT',   repeater_entity: 'PROPERTY', applicable_record_types: JSON.stringify(['CASE', 'ARREST']), label_en: 'Property Stolen / Recovered',   label_hi: 'संपत्ति चोरी / बरामद स्थिति',            visible_to_levels: L, editable_by_levels: E, section: 'property_details',        sort_order: 333, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Stolen', label_en: 'Stolen', label_hi: 'चोरी हुई' }, { value: 'Recovered', label_en: 'Recovered', label_hi: 'बरामद' }, { value: 'Involved', label_en: 'Involved', label_hi: 'शामिल' }, { value: 'Seized', label_en: 'Seized', label_hi: 'जब्त' }]) },
  // ─────────────────────────────────────────────────────────────────────────────
  // PCR / KALANDRA MODULE — fields unique to PCR_CALL
  // ─────────────────────────────────────────────────────────────────────────────
  { id: 'P_1',  field_key: 'pcr_no',                       field_type: 'TEXT',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'PCR Number',             label_hi: 'पीसीआर नंबर',                  visible_to_levels: L, editable_by_levels: E, section: 'informant_contact', sort_order: 1 },
  { id: 'P_5',  field_key: 'call_head',                    field_type: 'SELECT',   applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Call Category (Head)',    label_hi: 'कॉल श्रेणी',                   visible_to_levels: L, editable_by_levels: E, section: 'complaint_details', sort_order: 5, validation_rules: JSON.stringify({ required: false }), is_active: true, scope_level: 'global', options: PCR_CALL_HEAD_OPTS },
  { id: 'P_6',  field_key: 'call_gist',                    field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'PCR Call Gist',          label_hi: 'पीसीआर कॉल का विवरण',          visible_to_levels: L, editable_by_levels: E, section: 'complaint_details', sort_order: 6, validation_rules: JSON.stringify({ required: false }), full_width: true },
  { id: 'P_7',  field_key: 'caller_name',                  field_type: 'TEXT',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Caller Name',            label_hi: 'कॉलर का नाम',                  visible_to_levels: L, editable_by_levels: E, section: 'informant_contact', sort_order: 7 },
  { id: 'P_8',  field_key: 'caller_mobile',                field_type: 'NUMBER',   applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Caller Mobile',          label_hi: 'कॉलर का मोबाइल',               visible_to_levels: L, editable_by_levels: E, section: 'informant_contact', sort_order: 8 },
  { id: 'P_10', field_key: 'arrival_time',                 field_type: 'TIME',     applicable_record_types: JSON.stringify(['PCR_CALL']), label_en: 'Arrival Time',           label_hi: 'पहुंचने का समय',                visible_to_levels: L, editable_by_levels: E, section: 'incident_details',  sort_order: 10 },

  // ─────────────────────────────────────────────────────────────────────────────
  // MISSING PERSON MODULE — fields unique to MISSING (shared fields defined above)
  // ─────────────────────────────────────────────────────────────────────────────
    { id: 'MS_mp_known', field_key: 'mp_known',             field_type: 'RADIO', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Is Missing Person Identified / Known?', label_hi: 'क्या लापता व्यक्ति की पहचान ज्ञात है?', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.0, validation_rules: JSON.stringify({ required: true }), options: JSON.stringify([{ value: true, label_en: 'Yes', label_hi: 'हाँ' }, { value: false, label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'MS_3', field_key: 'missing_name',                 field_type: 'TEXT',     applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Name of Missing Person', label_hi: 'लापता व्यक्ति का नाम',          visible_to_levels: L, editable_by_levels: E, section: 'person_details',       sort_order: 2.05, show_when: JSON.stringify({ field: 'mp_known', value: true }), validation_rules: JSON.stringify({ required: true }) },
  
  // Missing Person Present Address fields
  { id: 'MS_mp_house_no', field_key: 'mp_house_no', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present House No.', label_hi: 'वर्तमान मकान संख्या', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.10, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_street', field_key: 'mp_street', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present Street', label_hi: 'वर्तमान गली / सड़क', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.11, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_colony', field_key: 'mp_colony', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present Colony', label_hi: 'वर्तमान कॉलोनी', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.12, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_city_town_village', field_key: 'mp_city_town_village', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present Village / City / Town', label_hi: 'वर्तमान गांव / शहर / नगर', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.13, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_state', field_key: 'mp_state', field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present State', label_hi: 'वर्तमान राज्य', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.14, is_active: true, scope_level: 'global', options: STATE_OPTS, show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_district', field_key: 'mp_district', field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present District', label_hi: 'वर्तमान जिला', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.15, is_active: true, scope_level: 'global', options: DISTRICT_OPTS, show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_mp_pincode', field_key: 'mp_pincode', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present Pin Code', label_hi: 'वर्तमान पिन कोड', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.16, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_known', value: true }) },
  { id: 'MS_15',field_key: 'mp_address',                   field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Present Full Address', label_hi: 'लापता व्यक्ति का वर्तमान पता (विस्तृत)', visible_to_levels: L, editable_by_levels: E, section: 'person_details',       sort_order: 2.18, is_active: true, scope_level: 'global', full_width: true, show_when: JSON.stringify({ field: 'mp_known', value: true }) },

  // Missing Person Permanent Address Same Toggle
  {
    id: 'mp_perm_same',
    field_key: 'mp_perm_same',
    field_type: 'SELECT',
    applicable_record_types: JSON.stringify(['MISSING']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'person_details',
    sort_order: 2.20,
    options: JSON.stringify([
      { value: 'Yes', label_en: 'Yes', label_hi: 'हां' },
      { value: 'No', label_en: 'No', label_hi: 'नहीं' }
    ]),
    show_when: JSON.stringify({ field: 'mp_known', value: true }),
    validation_rules: JSON.stringify({ required: true })
  },

  // Missing Person Permanent Address fields
  { id: 'MS_mp_perm_house_no', field_key: 'mp_perm_house_no', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent House No.', label_hi: 'स्थायी मकान संख्या', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.21, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_street', field_key: 'mp_perm_street', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent Street', label_hi: 'स्थायी गली / सड़क', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.22, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_colony', field_key: 'mp_perm_colony', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent Colony', label_hi: 'स्थायी कॉलोनी', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.23, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_city_town_village', field_key: 'mp_perm_city_town_village', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent Village / City / Town', label_hi: 'स्थायी गांव / शहर / नगर', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.24, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_state', field_key: 'mp_perm_state', field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent State', label_hi: 'स्थायी राज्य', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.25, is_active: true, scope_level: 'global', options: STATE_OPTS, show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_district', field_key: 'mp_perm_district', field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent District', label_hi: 'स्थायी जिला', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.26, is_active: true, scope_level: 'global', options: DISTRICT_OPTS, show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'MS_mp_perm_pincode', field_key: 'mp_perm_pincode', field_type: 'TEXT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Permanent Pin Code', label_hi: 'स्थायी पिन कोड', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.27, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },
  { id: 'DD_M1',  field_key: 'missing_address',            field_type: 'TEXTAREA',   applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Full Permanent Address', label_hi: 'लापता व्यक्ति का स्थायी पता (विस्तृत)', visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.29, is_active: true, scope_level: 'global', full_width: true, show_when: JSON.stringify({ field: 'mp_perm_same', value: 'No' }) },

  { id: 'MS_4', field_key: 'age',                          field_type: 'NUMBER',   applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Age',                    label_hi: 'उम्र',                          visible_to_levels: L, editable_by_levels: E, section: 'person_details',       sort_order: 2.31 },
  { id: 'MS_6', field_key: 'major_minor',                  field_type: 'RADIO',    applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Major / Minor',          label_hi: 'वयस्क / नाबालिग',              visible_to_levels: L, editable_by_levels: E, section: 'person_details',       sort_order: 2.33, options: JSON.stringify([{ value: 'Major', label_en: 'Major (18+)', label_hi: 'वयस्क (18+)' }, { value: 'Minor', label_en: 'Minor (Below 18)', label_hi: 'नाबालिग (18 से कम)' }]) },
  { id: 'MS_7', field_key: 'missing_date',                 field_type: 'DATE',     applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Date Missing Since',     label_hi: 'लापता होने की तिथि',            visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.41, validation_rules: JSON.stringify({ required: false }) },
  { id: 'MS_8', field_key: 'missing_place',                field_type: 'TEXT',     applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Last Seen Place',        label_hi: 'अंतिम बार देखा गया स्थान',     visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.42 },
  { id: 'MS_9', field_key: 'physical_description',         field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Physical Description',   label_hi: 'शारीरिक हुलिया',                visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.46, full_width: true },
  { id: 'MS_11',field_key: 'informant_mobile',             field_type: 'NUMBER',   applicable_record_types: JSON.stringify(['MISSING','UIDB']), label_en: 'Informant Mobile',       label_hi: 'सूचना देने वाले का मोबाइल',    visible_to_levels: L, editable_by_levels: E, section: 'contacts_assigned',    sort_order: 11 },
  { id: 'MS_19',field_key: 'Mental State',                  field_type: 'SELECT',     applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Mental State',          label_hi: 'मानसिक स्थिति',                 visible_to_levels: L, editable_by_levels: E, section: 'person_details', sort_order: 2.45, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Normal', label_en: 'Normal', label_hi: 'सामान्य' }, { value: 'Abnormal', label_en: 'Abnormal', label_hi: 'असामान्य' }]) },
  { id: 'MS_23',field_key: 'missing_type',                 field_type: 'SELECT',   applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Missing / Found Type',   label_hi: 'लापता / मिला प्रकार',          visible_to_levels: L, editable_by_levels: E, section: 'general_info',         sort_order: 3,  is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'Missing', label_en: 'Missing', label_hi: 'लापता' }, { value: 'Found', label_en: 'Found', label_hi: 'मिला' }]) },
 // { id: 'MS_24',field_key: 'pcr_call_flag',                field_type: 'RADIO',  applicable_record_types: JSON.stringify(['MISSING']), label_en: 'PCR Call (Y/N)',         label_hi: 'पीसीआर कॉल (हाँ/नहीं)',         visible_to_levels: L, editable_by_levels: E, section: 'general_info',         sort_order: 4,  is_active: true, scope_level: 'global', options: JSON.stringify([{ value: true, label_en: 'Yes', label_hi: 'हाँ' }, { value: false, label_en: 'No', label_hi: 'नहीं' }]) },
  { id: 'MS_25',field_key: 'operator_name',                field_type: 'TEXT',     applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Operator Name to Whom MPS', label_hi: 'ऑपरेटर का नाम जिसे एमपीएस भेजा गया', visible_to_levels: L, editable_by_levels: E, section: 'general_info',    sort_order: 5,  is_active: true, scope_level: 'global' },
  { id: 'DD_M2',  field_key: 'source',                     field_type: 'SELECT', applicable_record_types: JSON.stringify(['MISSING']), label_en: 'Source of Information',            label_hi: 'सूचना का स्रोत',                  visible_to_levels: L, editable_by_levels: E, section: 'general_info',   sort_order: 2,  is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'PCR', label_en: 'PCR Call', label_hi: 'पीसीआर कॉल' }, { value: 'DD', label_en: 'DD / Written Complaint', label_hi: 'डीडी / लिखित शिकायत' }]) },
  // ─────────────────────────────────────────────────────────────────────────────
  // UIDB (Unidentified Bodies) MODULE — fields unique to UIDB
  // ─────────────────────────────────────────────────────────────────────────────
  { id: 'U_2',  field_key: 'found_date',                   field_type: 'DATE',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Date Body Found',                label_hi: 'शव मिलने की तिथि',              visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 2, validation_rules: JSON.stringify({ required: false }) },
  { id: 'U_3',  field_key: 'found_place',                  field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Place Body Found',               label_hi: 'शव मिलने का स्थान',             visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 3, validation_rules: JSON.stringify({ required: false }) },
  { id: 'U_5',  field_key: 'approx_age',                   field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Approximate Age',                label_hi: 'अनुमानित उम्र',                 visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',       sort_order: 5 },
  { id: 'U_6',  field_key: 'description',                  field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Physical Description',           label_hi: 'शारीरिक हुलिया',                visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',       sort_order: 6, full_width: true },
{ id: 'U_10', field_key: 'identified', field_type: 'RADIO', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Body Identified', label_hi: 'शव की पहचान हुई', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.0, validation_rules: JSON.stringify({ required: true }), options: JSON.stringify([{ value: true, label_en: 'Yes', label_hi: 'हाँ' }, { value: false, label_en: 'No', label_hi: 'नहीं' }]) },  
  { id: 'U_12', field_key: 'cause',                        field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),            label_en: 'Cause',                          label_hi: 'कारण',                          visible_to_levels: L, editable_by_levels: E, section: 'uidb_details',      sort_order: 12, is_active: false, scope_level: 'global' },
  { id: 'U_13', field_key: 'uidb_physical_desc',           field_type: 'TEXTAREA', applicable_record_types: JSON.stringify([]),            label_en: 'Physical Description',           label_hi: 'शारीरिक हुलिया',                visible_to_levels: L, editable_by_levels: E, section: 'uidb_details',      sort_order: 13, is_active: false, scope_level: 'global', full_width: true },
  { id: 'U_15', field_key: 'inquest_sections',             field_type: 'TEXT',     applicable_record_types: JSON.stringify([]),            label_en: 'Under Section (If inquest)',     label_hi: 'धारा के तहत (यदि जांच हो)',    visible_to_levels: L, editable_by_levels: E, section: 'general_info',      sort_order: 3,  is_active: false, scope_level: 'global' },
  { id: 'U_16', field_key: 'deceased_name',                field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Name of Deceased',               label_hi: 'मृतक का नाम',                   visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',       sort_order: 1.05, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }), validation_rules: JSON.stringify({ required: true }) },
  
  // Deceased Present Address fields
  { id: 'U_deceased_house_no', field_key: 'deceased_house_no', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present House No.', label_hi: 'मृतक का मकान संख्या', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.10, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_street', field_key: 'deceased_street', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present Street', label_hi: 'मृतक का गली / सड़क', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.11, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_colony', field_key: 'deceased_colony', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present Colony', label_hi: 'मृतक का कॉलोनी', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.12, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_city_town_village', field_key: 'deceased_city_town_village', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present Village / City / Town', label_hi: 'मृतक का गांव / शहर / नगर', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.13, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_state', field_key: 'deceased_state', field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present State', label_hi: 'मृतक का राज्य', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.14, is_active: true, scope_level: 'global', options: STATE_OPTS, show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_district', field_key: 'deceased_district', field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present District', label_hi: 'मृतक का जिला', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.15, is_active: true, scope_level: 'global', options: DISTRICT_OPTS, show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_deceased_pincode', field_key: 'deceased_pincode', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Present Pin Code', label_hi: 'मृतक का पिन कोड', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.16, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'identified', value: true }) },
  { id: 'U_17', field_key: 'deceased_address',             field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Full Present Address', label_hi: 'मृतक का वर्तमान पता (विस्तृत)', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',       sort_order: 1.18, is_active: true, scope_level: 'global', full_width: true, show_when: JSON.stringify({ field: 'identified', value: true }) },

  // Deceased Permanent Address Same Toggle
  {
    id: 'deceased_perm_same',
    field_key: 'deceased_perm_same',
    field_type: 'SELECT',
    applicable_record_types: JSON.stringify(['UIDB']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'corpse_desc',
    sort_order: 1.20,
    options: JSON.stringify([
      { value: 'Yes', label_en: 'Yes', label_hi: 'हां' },
      { value: 'No', label_en: 'No', label_hi: 'नहीं' }
    ]),
    show_when: JSON.stringify({ field: 'identified', value: true }),
    validation_rules: JSON.stringify({ required: true })
  },

  // Deceased Permanent Address fields
  { id: 'U_deceased_perm_house_no', field_key: 'deceased_perm_house_no', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent House No.', label_hi: 'मृतक का स्थायी मकान संख्या', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.21, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_street', field_key: 'deceased_perm_street', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent Street', label_hi: 'मृतक का स्थायी गली / सड़क', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.22, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_colony', field_key: 'deceased_perm_colony', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent Colony', label_hi: 'मृतक का स्थायी कॉलोनी', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.23, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_city_town_village', field_key: 'deceased_perm_city_town_village', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent Village / City / Town', label_hi: 'मृतक का स्थायी गांव / शहर / नगर', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.24, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_state', field_key: 'deceased_perm_state', field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent State', label_hi: 'मृतक का स्थायी राज्य', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.25, is_active: true, scope_level: 'global', options: STATE_OPTS, show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_district', field_key: 'deceased_perm_district', field_type: 'SELECT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent District', label_hi: 'मृतक का स्थायी जिला', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.26, is_active: true, scope_level: 'global', options: DISTRICT_OPTS, show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_pincode', field_key: 'deceased_perm_pincode', field_type: 'TEXT', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Permanent Pin Code', label_hi: 'मृतक का स्थायी पिन कोड', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.27, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_deceased_perm_address', field_key: 'deceased_perm_address', field_type: 'TEXTAREA', applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Deceased Full Permanent Address', label_hi: 'मृतक का स्थायी पता (विस्तृत)', visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc', sort_order: 1.29, is_active: true, scope_level: 'global', full_width: true, show_when: JSON.stringify({ field: 'deceased_perm_same', value: 'No' }) },
  { id: 'U_28', field_key: 'filed_by_acp_sdm_date',        field_type: 'DATE',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Date of Filed by ACP/SDM',       label_hi: 'एसीपी/एसडीएम द्वारा दायर करने की तिथि', visible_to_levels: L, editable_by_levels: E, section: 'inquest_details', sort_order: 73, is_active: true, scope_level: 'global', show_when: JSON.stringify({ field: 'filed_by_acp_sdm', value: ['SDM', 'ACP'] }) },
  { id: 'U_29', field_key: 'uidb_no',                      field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'UIDB Gazette Number',             label_hi: 'यूआईडीबी राजपत्र संख्या',       visible_to_levels: L, editable_by_levels: E, section: 'general_info',            sort_order: 1.1, is_active: false, scope_level: 'global', validation_rules: JSON.stringify({ required: true }) },
  { id: 'U_found_time', field_key: 'found_time',           field_type: 'TIME',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Time Body Found',                 label_hi: 'शव मिलने का समय',               visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',            sort_order: 4, is_active: true, scope_level: 'global' },
  { id: 'U_found_lat', field_key: 'found_latitude',        field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Place Body Found Latitude',       label_hi: 'शव मिलने का स्थान अक्षांश',      visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',            sort_order: 4.1, is_active: true, scope_level: 'global' },
  { id: 'U_found_lng', field_key: 'found_longitude',       field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Place Body Found Longitude',      label_hi: 'शव मिलने का स्थान रेखांश',       visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',            sort_order: 4.2, is_active: true, scope_level: 'global' },
  { id: 'U_id_marks', field_key: 'identification_marks',   field_type: 'TEXT',     applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Identification Marks',            label_hi: 'पहचान चिन्ह',                   visible_to_levels: L, editable_by_levels: E, section: 'corpse_desc',            sort_order: 6.5, is_active: true, scope_level: 'global' },
  { id: 'U_filed_by_acp_sdm', field_key: 'filed_by_acp_sdm', field_type: 'SELECT',  applicable_record_types: JSON.stringify(['UIDB']), label_en: 'Inquest Filed by ACP / SDM',      label_hi: 'जांच एसीपी / एसडीएम द्वारा दायर', visible_to_levels: L, editable_by_levels: E, section: 'inquest_details',        sort_order: 72, is_active: true, scope_level: 'global', options: JSON.stringify([{ value: 'SDM', label_en: 'SDM', label_hi: 'एसडीएम' }, { value: 'ACP', label_en: 'ACP', label_hi: 'एसीपी' }, { value: 'None', label_en: 'None', label_hi: 'कोई नहीं' }]) },
];

function generatePersonFields(prefix, labelPrefixEn, labelPrefixHi, recordTypes, repeaterEntity, baseOrder = 400) {
  const typesStr = JSON.stringify(recordTypes);
  const rep = repeaterEntity ? { repeater_entity: repeaterEntity } : {};
  return [
    {
      id: `${prefix}_npr`,
      field_key: `${prefix}_npr`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} NPR No.`,
      label_hi: `${labelPrefixHi} एनपीआर संख्या`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: `${prefix}_personal_info`,
      sort_order: baseOrder,      is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_first_name`,      field_key: `${prefix}_first_name`,      field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} First Name`, label_hi: `${labelPrefixHi} पहला नाम`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 1, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false })
    },
    {
      id: `${prefix}_middle_name`,     field_key: `${prefix}_middle_name`,     field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Middle Name`, label_hi: `${labelPrefixHi} मध्यम नाम`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 2, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_last_name`,       field_key: `${prefix}_last_name`,       field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Last Name`, label_hi: `${labelPrefixHi} अंतिम नाम`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 3, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_nickname`,        field_key: `${prefix}_nickname`,        field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Nickname(s)`, label_hi: `${labelPrefixHi} उपनाम`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 3.5, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_gender`,          field_key: `${prefix}_gender`,          field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Gender`, label_hi: `${labelPrefixHi} लिंग`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 4, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false }),
      options: JSON.stringify([
        { value: 'Male', label_en: 'Male', label_hi: 'पुरुष' },
        { value: 'Female', label_en: 'Female', label_hi: 'महिला' },
        { value: 'Transgender', label_en: 'Transgender', label_hi: 'ट्रांसजेंडर' },
        { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
      ])
    },
    {
      id: `${prefix}_marital_status`,   field_key: `${prefix}_marital_status`,   field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Marital Status`, label_hi: `${labelPrefixHi} वैवाहिक स्थिति`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 4.1, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false }),
      options: JSON.stringify([
        { value: 'Married', label_en: 'Married', label_hi: 'विवाहित' },
        { value: 'Unmarried', label_en: 'Unmarried', label_hi: 'अविवाहित' },
        { value: 'Divorced', label_en: 'Divorced', label_hi: 'तलाकशुदा' },
        { value: 'Widowed', label_en: 'Widowed', label_hi: 'विधवा/विधुर' },
        { value: 'Single', label_en: 'Single', label_hi: 'अकेला' },
        { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
      ])
    },
    {
      id: `${prefix}_relation_type`,   field_key: `${prefix}_relation_type`,   field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Relation Type`, label_hi: `${labelPrefixHi} संबंध का प्रकार`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 5, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false }),
      options: JSON.stringify([
        { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
        { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
        { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
        { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
        { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
        { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
      ])
    },
    {
      id: `${prefix}_relative_name`,   field_key: `${prefix}_relative_name`,   field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Relative Name`, label_hi: `${labelPrefixHi} रिश्तेदार का नाम`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 6, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false })
    },
    {
      id: `${prefix}_mobile_country_code`, field_key: `${prefix}_mobile_country_code`, field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Mobile Country Code`, label_hi: `${labelPrefixHi} मोबाइल देश कोड`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 7.9, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_mobile`,          field_key: `${prefix}_mobile`,          field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Mobile No.`, label_hi: `${labelPrefixHi} मोबाइल नंबर`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 8, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_qualification`,   field_key: `${prefix}_qualification`,   field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Qualification`, label_hi: `${labelPrefixHi} योग्यता`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 8.5, is_active: true, scope_level: 'global',
      validation_rules: JSON.stringify({ required: false }),
      options: JSON.stringify([
        { value: 'Uneducated', label_en: 'Uneducated', label_hi: 'अशिक्षित' },
        { value: '10th', label_en: '10th', label_hi: '10वीं' },
        { value: '10+2', label_en: '10+2', label_hi: '12वीं' },
        { value: 'Graduate', label_en: 'Graduate', label_hi: 'स्नातक' },
        { value: 'Post-Graduate', label_en: 'Post-Graduate', label_hi: 'स्नातकोत्तर' }
      ])
    },
    {
      id: `${prefix}_dob`,             field_key: `${prefix}_dob`,             field_type: 'DATE',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Date of Birth`, label_hi: `${labelPrefixHi} जन्म तिथि`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 9, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_age_year`,        field_key: `${prefix}_age_year`,        field_type: 'NUMBER',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Age (Years)`, label_hi: `${labelPrefixHi} आयु (वर्ष)`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 10, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_age_month`,       field_key: `${prefix}_age_month`,       field_type: 'NUMBER',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Age (Months)`, label_hi: `${labelPrefixHi} आयु (महीने)`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 11, is_active: false, scope_level: 'global'
    },
    {
      id: `${prefix}_birth_year`,      field_key: `${prefix}_birth_year`,      field_type: 'NUMBER',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Year of Birth`, label_hi: `${labelPrefixHi} जन्म का वर्ष`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_personal_info`,
      sort_order: baseOrder + 12, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_house_no`,        field_key: `${prefix}_house_no`,        field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} House No.`, label_hi: `${labelPrefixHi} मकान संख्या`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 13, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_street`,          field_key: `${prefix}_street`,          field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Street`, label_hi: `${labelPrefixHi} गली / सड़क`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 14, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_colony`,          field_key: `${prefix}_colony`,          field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Colony`, label_hi: `${labelPrefixHi} कॉलोनी`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 15, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_city_town_village`, field_key: `${prefix}_city_town_village`, field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Village / City / Town`, label_hi: `${labelPrefixHi} गांव / शहर / नगर`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 16, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_tehsil_block_mandal`, field_key: `${prefix}_tehsil_block_mandal`, field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Tehsil / Block / Mandal`, label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 17, is_active: true, scope_level: 'global'
    },
    {
      id: `${prefix}_present_address`, field_key: `${prefix}_present_address`, field_type: 'TEXTAREA',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Full Present Address`, label_hi: `${labelPrefixHi} वर्तमान पता`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 18, is_active: true, scope_level: 'global', full_width: true
    },
    {
      id: `${prefix}_country`,         field_key: `${prefix}_country`,         field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Nationality`, label_hi: `${labelPrefixHi} राष्ट्रीयता`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 19, is_active: true, scope_level: 'global', options: COUNTRY_OPTS
    },
    {
      id: `${prefix}_state`,           field_key: `${prefix}_state`,           field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} State`, label_hi: `${labelPrefixHi} राज्य`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 20, is_active: true, scope_level: 'global', options: STATE_OPTS
    },
    {
      id: `${prefix}_district`,        field_key: `${prefix}_district`,        field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} District`, label_hi: `${labelPrefixHi} जिला`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 21, is_active: true, scope_level: 'global', options: DISTRICT_OPTS
    },
    {
      id: `${prefix}_police_station`,  field_key: `${prefix}_police_station`,  field_type: 'SELECT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Police Station`, label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 22, is_active: true, scope_level: 'global', options: JSON.stringify([])
    },
    {
      id: `${prefix}_pincode`,         field_key: `${prefix}_pincode`,         field_type: 'TEXT',
      applicable_record_types: typesStr, label_en: `${labelPrefixEn} Pin Code`, label_hi: `${labelPrefixHi} पिन कोड`,
      visible_to_levels: L, editable_by_levels: E, section: `${prefix}_address`,
      sort_order: baseOrder + 23, is_active: true, scope_level: 'global'
    }
  ].map(f => ({ ...f, ...rep }));
}

const COUNTRY_OPTS = JSON.stringify([
  { value: 'Indian', label_en: 'Indian', label_hi: 'भारतीय' },
  { value: 'Nepalese', label_en: 'Nepalese', label_hi: 'नेपाली' },
  { value: 'Bhutanese', label_en: 'Bhutanese', label_hi: 'भूटानी' },
  { value: 'Bangladeshi', label_en: 'Bangladeshi', label_hi: 'बांग्लादेशी' },
  { value: 'Pakistani', label_en: 'Pakistani', label_hi: 'पाकिस्तानी' },
  { value: 'Sri Lankan', label_en: 'Sri Lankan', label_hi: 'श्रीलंकाई' },
  { value: 'Afghan', label_en: 'Afghan', label_hi: 'अफगानी' },
  { value: 'Myanmar', label_en: 'Myanmar', label_hi: 'म्यांमार' },
  { value: 'Tibetan', label_en: 'Tibetan', label_hi: 'तिब्बती' },
  { value: 'American', label_en: 'American', label_hi: 'अमेरिकी' },
  { value: 'British', label_en: 'British', label_hi: 'ब्रिटिश' },
  { value: 'Canadian', label_en: 'Canadian', label_hi: 'कनाडाई' },
  { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
]);

function generateAddressFields(prefix, labelPrefixEn, labelPrefixHi, recordTypes, sectionOverride = null) {
  const typesStr = JSON.stringify(recordTypes);
  const targetSection = sectionOverride || `${prefix}_address`;
  return [
    {
      id: `${prefix}_house_no`,
      field_key: `${prefix}_house_no`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} House No.`,
      label_hi: `${labelPrefixHi} मकान संख्या`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.0,
      is_active: true,
      scope_level: 'global'
    },
    {
      id: `${prefix}_street`,
      field_key: `${prefix}_street`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Street`,
      label_hi: `${labelPrefixHi} गली / सड़क`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.1,
      is_active: true,
      scope_level: 'global'
    },
    {
      id: `${prefix}_colony`,
      field_key: `${prefix}_colony`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Colony`,
      label_hi: `${labelPrefixHi} कॉलोनी`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.2,
      is_active: true,
      scope_level: 'global'
    },
    {
      id: `${prefix}_city_town_village`,
      field_key: `${prefix}_city_town_village`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Village / City / Town`,
      label_hi: `${labelPrefixHi} गांव / शहर / नगर`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.3,
      is_active: true,
      scope_level: 'global'
    },
    {
      id: `${prefix}_tehsil_block_mandal`,
      field_key: `${prefix}_tehsil_block_mandal`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Tehsil / Block / Mandal`,
      label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.4,
      is_active: true,
      scope_level: 'global'
    },
    {
      id: `${prefix}_country`,
      field_key: `${prefix}_country`,
      field_type: 'SELECT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Nationality`,
      label_hi: `${labelPrefixHi} राष्ट्रीयता`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.6,
      is_active: prefix !== 'occurrence',
      scope_level: 'global',
      options: COUNTRY_OPTS
    },
    {
      id: `${prefix}_state`,
      field_key: `${prefix}_state`,
      field_type: 'SELECT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} State`,
      label_hi: `${labelPrefixHi} राज्य`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.7,
      is_active: true,
      scope_level: 'global',
      options: STATE_OPTS
    },
    {
      id: `${prefix}_district`,
      field_key: `${prefix}_district`,
      field_type: 'SELECT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} District`,
      label_hi: `${labelPrefixHi} जिला`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.8,
      is_active: true,
      scope_level: 'global',
      options: DISTRICT_OPTS
    },
    {
      id: `${prefix}_police_station`,
      field_key: `${prefix}_police_station`,
      field_type: 'SELECT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Police Station`,
      label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 3.9,
      is_active: true,
      scope_level: 'global',
      options: JSON.stringify([])
    },
    {
      id: `${prefix}_pincode`,
      field_key: `${prefix}_pincode`,
      field_type: 'TEXT',
      applicable_record_types: typesStr,
      label_en: `${labelPrefixEn} Pin Code`,
      label_hi: `${labelPrefixHi} पिन कोड`,
      visible_to_levels: L,
      editable_by_levels: E,
      section: targetSection,
      sort_order: 4.0,
      is_active: true,
      scope_level: 'global'
    }
  ];
}

const generatedFields = [
  ...generatePersonFields('complainant', 'Complainant', 'शिकायतकर्ता', ['CASE'], 'PERSON_COMPLAINANT', 400),
  ...generatePersonFields('accused',     'Accused',     'अभियुक्त',    ['CASE'], 'PERSON_ACCUSED',      430),
  ...generatePersonFields('victim',      'Victim',      'पीड़ित',       ['CASE'], 'PERSON_VICTIM',        460),
  ...generatePersonFields('arrested',    'Arrested Person', 'गिरफ्तार व्यक्ति', ['ARREST'], null, 400),
  ...generateAddressFields('occurrence', 'Place of Occurrence', 'घटनास्थल', ['CASE'], 'occurrence_info'),
  ...generateAddressFields('intimation', 'Intimation', 'सूचना/इत्तिला', ['ARREST']),
  
  // Permanent address same toggle
  {
    id: 'arrested_perm_same',
    field_key: 'arrested_perm_same',
    field_type: 'BOOLEAN',
    applicable_record_types: JSON.stringify(['ARREST']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'arrested_address',
    sort_order: 423.9,
        validation_rules: JSON.stringify({ required: true })
  },
  // Permanent address full text area
  {
    id: 'arrested_perm_address',
    field_key: 'arrested_perm_address',
    field_type: 'TEXTAREA',
    applicable_record_types: JSON.stringify(['ARREST']),
    label_en: 'Full Permanent Address',
    label_hi: 'स्थायी पता',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'arrested_address',
    sort_order: 424.5,
    full_width: true,
    show_when: JSON.stringify({ field: 'arrested_perm_same', value: false })
  },
  // Permanent address granular fields
  ...generateAddressFields('arrested_perm', 'Arrested Person Permanent', 'गिरफ्तार व्यक्ति का स्थायी पता', ['ARREST'], 'arrested_address').map((f, idx) => ({
    ...f,
    sort_order: 424.6 + idx * 0.05,
    show_when: JSON.stringify({ field: 'arrested_perm_same', value: false })
  })),

   // New fields for MISSING relative details
  // {
  //   id: 'MS_relative_name',
  //   field_key: 'missing_relative_name',
  //   field_type: 'TEXT',
  //   applicable_record_types: JSON.stringify(['MISSING']),
  //   label_en: 'Relative Name',
  //   label_hi: 'रिश्तेदार का नाम',
  //   visible_to_levels: L,
  //   editable_by_levels: E,
  //   section: 'person_details',
  //   sort_order: 17,
  //   is_active: true,
  //   scope_level: 'global'
  // },

  {
    id: 'MS_relation_type',
    field_key: 'missing_relation_type',
    field_type: 'SELECT',
    applicable_record_types: JSON.stringify(['MISSING']),
    label_en: 'Relation Type',
    label_hi: 'संबंध का प्रकार',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'person_details',
    sort_order: 18,
    is_active: true,
    scope_level: 'global',
    show_when: JSON.stringify({ field: 'missing_relative_name', operator: 'filled' }),
    options: JSON.stringify([
      { value: 'Father', label_en: 'Father', label_hi: 'पिता' },
      { value: 'Mother', label_en: 'Mother', label_hi: 'माता' },
      { value: 'Husband', label_en: 'Husband', label_hi: 'पति' },
      { value: 'Wife', label_en: 'Wife', label_hi: 'पत्नी' },
      { value: 'Guardian', label_en: 'Guardian', label_hi: 'अभिभावक' },
      { value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
    ])
  },
  {
    id: 'complainant_same_as_victim',
    field_key: 'complainant_same_as_victim',
    field_type: 'SELECT',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'Is Complainant same as Victim?',
    label_hi: 'क्या शिकायतकर्ता ही पीड़ित है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'complainant_personal_info',
    sort_order: 408.5,
    options: JSON.stringify([{ value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' }, { value: 'No', label_en: 'No', label_hi: 'नहीं' }]),
    is_active: true,
    scope_level: 'global'
  },
  {
    id: 'complainant_perm_same',
    field_key: 'complainant_perm_same',
    field_type: 'BOOLEAN',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'complainant_address',
    sort_order: 423.9,
    is_active: true,
    scope_level: 'global'
  },
  ...generateAddressFields('complainant_perm', 'Complainant Permanent', 'शिकायतकर्ता का स्थायी पता', ['CASE'], 'complainant_address').map((f, idx) => ({
    ...f,
    sort_order: 424.0 + idx * 0.05
  })),
  {
    id: 'victim_perm_same',
    field_key: 'victim_perm_same',
    field_type: 'BOOLEAN',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'victim_address',
    sort_order: 483.9,
    is_active: true,
    scope_level: 'global',
    repeater_entity: 'PERSON_VICTIM'
  },
  ...generateAddressFields('victim_perm', 'Victim Permanent', 'पीड़ित का स्थायी पता', ['CASE'], 'victim_address').map((f, idx) => ({
    ...f,
    sort_order: 484.0 + idx * 0.05,
    repeater_entity: 'PERSON_VICTIM'
  })),
  {
    id: 'accused_perm_same',
    field_key: 'accused_perm_same',
    field_type: 'BOOLEAN',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'Is Permanent Address same as Present Address?',
    label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?',
    visible_to_levels: L,
    editable_by_levels: E,
    section: 'accused_address',
    sort_order: 453.9,
    is_active: true,
    scope_level: 'global',
    repeater_entity: 'PERSON_ACCUSED'
  },
  ...generateAddressFields('accused_perm', 'Accused Permanent', 'अभियुक्त का स्थायी पता', ['CASE'], 'accused_address').map((f, idx) => ({
    ...f,
    sort_order: 454.0 + idx * 0.05,
    repeater_entity: 'PERSON_ACCUSED'
  }))
];

fields.push(...generatedFields);

const DEFAULTS = {
  is_active: true,
  scope_level: 'global',
  scope_id: null,
  created_by: null,
  section_label_en: null,
  section_label_hi: null,
  repeater_entity: null,
};

export async function seed(knex) {
  const rows = fields.map(f => ({ ...DEFAULTS, ...f }));
  
  // Clean up any obsolete fields not in the seed array
  const keys = rows.map(r => r.field_key);
  await knex('field_registry').whereNotIn('field_key', keys).del();

  await knex('field_registry')
    .insert(rows)
    .onConflict('field_key')
    .merge([
      'label_en', 'label_hi', 'field_type', 'options', 'sort_order',
      'section', 'validation_rules', 'show_when', 'is_active',
      'applicable_record_types', 'visible_to_levels', 'editable_by_levels', 'full_width',
      'repeater_entity',
    ]);
  console.log(`[01_fields] Upserted ${rows.length} fields into field_registry`);
}
