import axios from 'axios';
import { findNodeById, POLICE_HIERARCHY } from './hierarchyData.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create central axios client
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Helper to parse cookies
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const csrfToken = getCookie('csrfToken');
    if (csrfToken) {
      config.headers['x-csrf-token'] = csrfToken;
    }
    // Allow credentials to ensure cookies are sent back
    config.withCredentials = true;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for auto-refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    error ? prom.reject(error) : prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error && error.isMock) {
      return Promise.resolve(error.response);
    }
    const originalRequest = error.config;

    // Check if we are in mock mode (bypass standard network error)
    const debugMode = localStorage.getItem('prism_debug_api_mode') || 'production';
    if (debugMode !== 'production') {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refresh = localStorage.getItem('refresh_token');
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh });
        const newToken = res.data.data.access_token;
        localStorage.setItem('access_token', newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── MOCK & SIMULATOR INTERACTION ENGINE ─────────────────────────────────────────
// This lets the frontend operate fully offline with high fidelity mock data.
// It also allows forcing server errors (400, 401, 403, 500) to test safety boundaries.

// Helper to construct simulated server response objects
const createMockResponse = (data, status = 200) => ({
  data: { status: 'success', data },
  status,
  statusText: 'OK',
  headers: {},
  config: {},
});

const createMockError = (message, status) => {
  const err = new Error(message);
  err.response = {
    status,
    data: { status: 'error', message },
  };
  return err;
};

// Seed mock database inside localStorage if not present
const initMockDB = () => {
  if (!localStorage.getItem('prism_mock_records')) {
    // Initial mock records
    const initialRecords = [
      {
        id: 'rec-c001',
        record_type: 'CASE',
        ps_id: 'PS_NDD_PARLIAMENT_STREET',
        district_id: 'DIST_NDD',
        current_status: 'PENDING_SHO',
        current_level: 'PS',
        version: 1,
        created_by: 'usr-hc-ramesh',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        data: {
          case_type: 'cctns(manual FIR)',
          fir_no: '210/2026',
          fir_date: '2026-06-15',
          gd_no: '12A',
          gd_date: '2026-06-15',
          gd_time: '10:30',
          occurrence_date: '2026-06-15',
          occurrence_place: 'Parliament Street Market, near Pillar 4',
          brief_facts: 'A bag containing legal documents and personal cash worth Rs. 15,000 was reported stolen from a parked vehicle. Complainant noticed the broken window glass upon return.',
          local_head: 'Theft',
          act_name: 'Bharatiya Nyaya Sanhita (BNS)',
          sections: '303(2)',
          complainant_name: 'Ashok Kumar',
          complainant_address: 'Flat 104, Block C, Connaught Place, New Delhi',
          accused_name: 'Unknown thief',
          accused_address: 'N/A',
          io_name: 'SI Harish Rawat',
          io_pis: 'PIS-49281034',
          io_mobile: '9876543210',
          stolen_property: 'Black leather shoulder bag containing cash and paper transcripts',
          property_status: 'Stolen',
          status: 'Open',
          remarks: 'CCTV footage of adjacent cameras is being analysed.',
          property_description: 'Black leather shoulder bag containing cash and paper transcripts',
          recovered_property: '',
          recovered_property_status: 'NA',
          recovered_case_status: 'Open',
          recovered_remarks: '',
          cctns_flag: true,
          etheft_flag: false,
          emvt_flag: false,
          ncrp_flag: false,
          zero_fir_flag: false,
          beat_no: 'Beat 4',
          record_date: '2026-06-15',
        },
        revisions: [
          {
            revision_number: 1,
            changed_by: 'HC Ramesh Kumar',
            changed_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            level: 'PS',
            change_type: 'CREATE',
            comment: 'Initial entry of theft report',
            field_changes: [],
          }
        ],
        transitions: [
          {
            from_level: 'PS',
            to_level: 'PS',
            from_status: 'DRAFT',
            to_status: 'PENDING_SHO',
            action: 'SUBMIT',
            performed_by: 'HC Ramesh Kumar (PIS-28521904)',
            performed_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            comment: 'Record submitted for SHO review',
          }
        ],
      },
      {
        id: 'rec-a001',
        record_type: 'ARREST',
        ps_id: 'PS_NDD_PARLIAMENT_STREET',
        district_id: 'DIST_NDD',
        current_status: 'DRAFT',
        current_level: 'PS',
        version: 1,
        created_by: 'usr-hc-ramesh',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        data: {
          linked_fir_dd_no: '210/2026',
          linked_fir_dd_date: '2026-06-15',
          linked_fir_dd_time: '10:30',
          act_name: 'BNS',
          sections: '303(2)',
          arrested_first_name: 'Suraj',
          arrested_last_name: 'Pal',
          arrested_gender: 'Male',
          arrested_relation_type: 'Father',
          arrested_relative_name: 'Ram Pal',
          arrested_house_no: 'Jhuggi No. 54',
          arrested_street: 'Yamuna Pushta',
          arrested_colony: 'Yamuna Pushta',
          arrested_city_town_village: 'Delhi',
          arrested_state: 'Delhi',
          arrested_district: 'Central District',
          arrested_police_station: 'Parliament Street',
          arrested_pincode: '110001',
          arrest_date: '2026-06-16',
          arrest_time: '08:45',
          arrest_place: 'Palika Bazaar Entry Gate',
          informant_name: 'Sunder Pal (Brother)',
          informant_address: 'Jhuggi No. 54, Yamuna Pushta, Delhi',
          informant_tel: '9988776655',
          nafis_prepared: 'Yes',
          dossier_prepared: 'Pending',
          search_slip_prepared: 'Yes',
          address_verified: 'Pending',
          verifying_officer_name: 'HC Sunil Dutt',
          verifying_officer_rank: 'Head Constable',
          crime_head: 'Theft',
          record_date: '2026-06-16',
          status: 'judicial_custody',
          recovery: 'Stolen leather bag containing Rs. 5,000 cash',
          special_scheme: 'anti snatching',
        },
        revisions: [
          {
            revision_number: 1,
            changed_by: 'HC Ramesh Kumar',
            changed_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            level: 'PS',
            change_type: 'CREATE',
            comment: 'Initial arrest details logged',
            field_changes: [],
          }
        ],
        transitions: [],
      },
      {
        id: 'rec-p001',
        record_type: 'PCR_CALL',
        ps_id: 'PS_NDD_PARLIAMENT_STREET',
        district_id: 'DIST_NDD',
        current_status: 'SENT_BACK_HC',
        current_level: 'PS',
        version: 2,
        created_by: 'usr-hc-ramesh',
        created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
        data: {
          gd_no: '45B',
          gd_date: '2026-06-15',
          gd_time: '18:20',
          call_head: 'Quarrel / Public Nuisance',
          complainant_name: 'Dr. Vivek Saxena',
          complainant_address: 'Flat 12, Parliament Street Officers Flats, New Delhi',
          call_gist: 'Loud noise and verbal altercation between two groups of motorists blocking the road.',
          io_name: 'ASI Satish Kumar',
          eo_name: '',
          action_taken: 'Reached spot. Motorists warned. Blockage cleared. Mutual settlement reached on spot.',
          status: 'Closed',
          arrival_dd_no: '47B',
          arrival_date: '2026-06-15',
          arrival_time: '18:35',
          latitude: '28.6289',
          longitude: '77.2134',
          beat_no: 'Beat 2',
          record_date: '2026-06-15',
        },
        revisions: [
          {
            revision_number: 1,
            changed_by: 'HC Ramesh Kumar',
            changed_at: new Date(Date.now() - 3600000 * 8).toISOString(),
            level: 'PS',
            change_type: 'CREATE',
            comment: 'PCR incident entry',
            field_changes: [],
          },
          {
            revision_number: 2,
            changed_by: 'SHO Sanjay Sharma',
            changed_at: new Date(Date.now() - 3600000 * 1).toISOString(),
            level: 'PS',
            change_type: 'STATUS_CHANGE',
            comment: 'Sent back: Please update exact coordinates (latitude and longitude).',
            field_changes: [],
          }
        ],
        transitions: [
          {
            from_level: 'PS',
            to_level: 'PS',
            from_status: 'DRAFT',
            to_status: 'PENDING_SHO',
            action: 'SUBMIT',
            performed_by: 'HC Ramesh Kumar (PIS-28521904)',
            performed_at: new Date(Date.now() - 3600000 * 7).toISOString(),
            comment: 'Submitted for review',
          },
          {
            from_level: 'PS',
            to_level: 'PS',
            from_status: 'PENDING_SHO',
            to_status: 'SENT_BACK_HC',
            action: 'SEND_BACK',
            performed_by: 'SHO Sanjay Sharma (PIS-28523992)',
            performed_at: new Date(Date.now() - 3600000 * 1).toISOString(),
            comment: 'Please update exact coordinates (latitude and longitude).',
            target_fields: ['latitude', 'longitude'],
          }
        ],
      },
      {
        id: 'rec-u001',
        record_type: 'UIDB',
        ps_id: 'PS_NDD_PARLIAMENT_STREET',
        district_id: 'DIST_NDD',
        current_status: 'PENDING_SHO',
        current_level: 'PS',
        version: 1,
        created_by: 'usr-hc-ramesh',
        created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 3).toISOString(),
        data: {
          uidbNumber: 'UIDB-992/2026/ND',
          ddNumber: 'DD-12A',
          ddDate: '2026-06-12',
          dutyOfficer: 'ASI Krishan Dutt',
          ioName: 'Inspector Ravindra Singh',
          informantName: 'Satish Chand',
          informantMobile: '9876543210',
          foundPlace: 'Behind electricity transformer, near Palika Bazaar Gate 2',
          uidbDate: '2026-06-12',
          name: 'Unknown Male',
          age: 'Approx 35-40 years',
          gender: 'Male',
          height: "5'7\"",
          complexion: 'Shallow',
          identificationMarks: "Tattoo 'Om' on right hand wrist",
          description: 'Wearing blue shirt and khaki trousers. Body was decomposed.',
          zipnetNumber: 'ZIP-ND-2026-88912',
          identified: false,
          status: 'Autopsy report awaited. Preserved in RML Hospital Mortuary.',
          record_date: '2026-06-15',
        },
        revisions: [
          {
            revision_number: 1,
            changed_by: 'HC Ramesh Kumar',
            changed_at: new Date(Date.now() - 3600000 * 3).toISOString(),
            level: 'PS',
            change_type: 'CREATE',
            comment: 'UIDB entry logged',
            field_changes: [],
          }
        ],
        transitions: [
          {
            from_level: 'PS',
            to_level: 'PS',
            from_status: 'DRAFT',
            to_status: 'PENDING_SHO',
            action: 'SUBMIT',
            performed_by: 'HC Ramesh Kumar (PIS-28521904)',
            performed_at: new Date(Date.now() - 3600000 * 3).toISOString(),
            comment: 'Submitted for station approval',
          }
        ],
      }
    ];
    localStorage.setItem('prism_mock_records', JSON.stringify(initialRecords));
  }
};
initMockDB();

// Dynamic Schema Registry Mock JSON Data
const formSchemas = {
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
        { field_key: 'arrest_place', field_type: 'TEXT', label_en: 'Place of Arrest', label_hi: 'गिरफ्तारी का स्थान', validation_rules: { required: true } },
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
        { field_key: 'mp_known', field_type: 'BOOLEAN', label_en: 'Is Missing Person Identified / Known?', label_hi: 'क्या लापता व्यक्ति की पहचान ज्ञात है?', validation_rules: { required: true } },
        {
          field_key: 'missing_name',
          field_type: 'TEXT',
          label_en: 'Name of Missing Person',
          label_hi: 'लापता व्यक्ति का नाम',
          validation_rules: { required: true },
          show_when: { field: 'mp_known', value: true }
        },
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
          field_key: 'mp_address',
          field_type: 'TEXTAREA',
          label_en: 'Present Full Address',
          label_hi: 'लापता व्यक्ति का वर्तमान पता (विस्तृत)',
          validation_rules: { required: false },
          full_width: true,
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
        { field_key: 'missing_place', field_type: 'TEXT', label_en: 'Last Seen Place', label_hi: 'अंतिम बार देखा गया स्थान', validation_rules: { required: true } },
        { field_key: 'missing_date', field_type: 'DATE', label_en: 'Date Missing Since', label_hi: 'लापता होने की तिथि', validation_rules: { required: true } },
        { field_key: 'missing_recovered_time', field_type: 'TIME', label_en: 'Time Missing / Recovered', label_hi: 'लापता होने / बरामद होने का समय', validation_rules: { required: false } },
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
        { field_key: 'mental_state', field_type: 'TEXT', label_en: 'Mental State', label_hi: 'मानसिक स्थिति', validation_rules: { required: false } },
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
        { field_key: 'identification_marks', field_type: 'TEXT', label_en: 'Identification Marks', label_hi: 'पहचान चिन्ह', validation_rules: { required: false } }
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
            { value: 'Unknown', label_en: 'Unknown', label_hi: 'अज्ञात' }
          ],
          validation_rules: { required: false }
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

// Interceptor helper to inject simulated API responses/errors
api.interceptors.request.use(
  async (config) => {
    const debugMode = localStorage.getItem('prism_debug_api_mode') || 'production';
    if (debugMode === 'production') {
      return config;
    }

    // Bypass mock interception for binary downloads/exports
    if (config.responseType === 'blob' || config.responseType === 'arraybuffer') {
      return config;
    }

    // Return custom mock responses
    const method = config.method.toUpperCase();
    const url = config.url;

    // Simulate error triggers if debug switcher requests it
    if (debugMode.startsWith('error_')) {
      const code = parseInt(debugMode.split('_')[1], 10);
      throw createMockError(`Simulated server error for code ${code}`, code);
    }

    // Handle Mock Authentication Login
    if (url.includes('/auth/login') && method === 'POST') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      const badgeNo = payload.badgeNo || payload.email || payload.badge_no || 'HC001';
      const password = payload.password;
      const selectedNodeId = payload.selectedNodeId;
      if (!badgeNo || !password) {
        throw createMockError('Missing badge number or security key', 400);
      }

      const node = findNodeById(selectedNodeId || 'PS_NDD_PARLIAMENT_STREET') || POLICE_HIERARCHY.children[0].children[1].children[0].children[0];

      let mockRole = node.type;
      const lowerB = badgeNo.toLowerCase();
      if (lowerB.includes('sho')) {
        mockRole = 'SHO';
      } else if (lowerB.includes('hc') || lowerB.includes('ramesh')) {
        mockRole = 'HC';
      } else if (lowerB.includes('dcp') || lowerB.includes('do') || lowerB.includes('priya') || lowerB.includes('vardhan')) {
        mockRole = 'DISTRICT_OFFICER';
      } else if (lowerB.includes('hq') || lowerB.includes('analyst') || lowerB.includes('anita') || lowerB.includes('vikram.singh')) {
        mockRole = 'HQ_ANALYST';
      } else if (lowerB.includes('admin') || lowerB.includes('suresh')) {
        mockRole = 'HQ_ADMIN';
      } else if (lowerB.includes('sa') || lowerB.includes('system')) {
        mockRole = 'SYSTEM_ADMIN';
      }

      const stationName = node.stationName || '';
      const psCode = node.code || stationName.split(' ').filter(w => w.length > 0).map(w => w[0].toUpperCase()).join('').substring(0, 6) || 'PS';
      const mockUser = {
        userId: 'mock-usr-' + badgeNo.toLowerCase(),
        badgeNo,
        name: node.officerName || 'Ramesh Kumar',
        role: mockRole,
        level: node.type,
        psId: node.type === 'PS' ? node.id : '',
        districtId: node.type === 'DISTRICT' ? node.id : 'DIST_NDD',
        stationName,
        districtKey: node.districtKey || '',
        psCode,
        username: node.officerName || 'Officer Ramesh',
        rank: node.rank || 'Head Constable',
        pis: node.pis || 'PIS-28521904',
      };

      const tokens = {
        access_token: 'mock-jwt-access-token',
        refresh_token: 'mock-jwt-refresh-token',
        user: mockUser
      };

      return Promise.reject({
        isMock: true,
        response: createMockResponse(tokens)
      });
    }

    if (url.includes('/auth/logout') && method === 'POST') {
      return Promise.reject({
        isMock: true,
        response: createMockResponse({ message: 'Session logged out' })
      });
    }

    if (url.includes('/auth/me') && method === 'GET') {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw createMockError('Unauthorized access', 401);
      }
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      // Extract active node user profile or default to HC
      const userJSON = localStorage.getItem('crime-diaries-auth');
      let defaultUser = {
        userId: 'mock-usr-hc001',
        badgeNo: 'HC001',
        name: 'HC Ramesh Kumar',
        role: 'PS',
        level: 'PS',
        psId: 'PS_NDD_PARLIAMENT_STREET',
        districtId: 'DIST_NDD',
        stationName: 'Parliament Street',
        districtKey: 'New Delhi District (NDD)',
        username: 'Ramesh Kumar',
        rank: 'Station Operator',
        pis: 'PIS-28521904',
      };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) defaultUser = parsed.state.user;
        } catch (e) { }
      }
      return Promise.reject({
        isMock: true,
        response: createMockResponse({ user: defaultUser })
      });
    }

    // Acts & Sections list endpoint
    if (url.includes('/acts-sections') && method === 'GET') {
      const mockActsSections = [
        {
          act: "Indian Penal Code (IPC)",
          sections: ["379", "302", "323", "406", "506", "354", "411"]
        },
        {
          act: "Arms Act",
          sections: ["25", "27", "30"]
        },
        {
          act: "NDPS Act",
          sections: ["15", "18", "20", "21", "22"]
        },
        {
          act: "Motor Vehicles Act",
          sections: ["181", "184", "185"]
        },
        {
          act: "Information Technology Act (IT Act)",
          sections: ["66", "66C", "66D", "67"]
        }
      ];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(mockActsSections)
      });
    }

    // Fields Form Schema definitions
    if (url.match(/\/fields\/form\/([A-Z_]+)/)) {
      const recordType = url.match(/\/fields\/form\/([A-Z_]+)/)[1];
      const schema = formSchemas[recordType] || [];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(schema)
      });
    }

    // Fields Register definitions
    if (url.match(/\/fields$/)) {
      const allFields = [];
      Object.keys(formSchemas).forEach(rt => {
        formSchemas[rt].forEach(section => {
          section.fields.forEach(f => {
            allFields.push({
              id: 'fld-' + f.field_key,
              field_key: f.field_key,
              field_type: f.field_type,
              applicable_record_types: [rt],
              label_en: f.label_en,
              label_hi: f.label_hi,
              options: f.options || null,
              validation_rules: f.validation_rules || {},
              section: section.section,
              is_active: true
            });
          });
        });
      });
      return Promise.reject({
        isMock: true,
        response: createMockResponse(allFields)
      });
    }

    // List Records
    if (url.match(/\/records$/) && method === 'GET') {
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      return Promise.reject({
        isMock: true,
        response: createMockResponse(allRecords)
      });
    }

    // Single Record
    if (url.match(/\/records\/([A-Za-z0-9-]+)$/) && method === 'GET') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)$/)[1];
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const record = allRecords.find(r => r.id === recId);
      if (!record) {
        throw createMockError('Record not found', 404);
      }
      return Promise.reject({
        isMock: true,
        response: createMockResponse(record)
      });
    }

    if (url.match(/\/records$/) && method === 'POST') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      const { record_type, data } = payload;
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');

      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUser = { psId: 'PS_NDD_PARLIAMENT_STREET', districtId: 'DIST_NDD', username: 'HC Ramesh Kumar' };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) currentUser = parsed.state.user;
        } catch (e) { }
      }

      const _typeCodes = { CASE: 'CSE', ARREST: 'ARR', PCR_CALL: 'PCR', MISSING: 'MSP', UIDB: 'UDB' };
      const _year = new Date().getFullYear();
      const _psCode = currentUser.psCode || (currentUser.stationName?.split(' ').filter(w => w.length > 0).map(w => w[0].toUpperCase()).join('').substring(0, 6)) || 'PS';
      const _existingCount = allRecords.filter(r => r.record_type === record_type && r.ps_id === (currentUser.psId || 'PS_NDD_PARLIAMENT_STREET')).length;
      const _typeCode = _typeCodes[record_type] || record_type.substring(0, 3).toUpperCase();
      const mockUid = `${_typeCode}/${_year}/${_psCode}/${String(_existingCount + 1).padStart(6, '0')}`;

      const newRecord = {
        id: 'rec-' + Math.random().toString(36).substring(2, 9),
        record_type,
        ps_id: currentUser.psId || 'PS_NDD_PARLIAMENT_STREET',
        district_id: currentUser.districtId || 'DIST_NDD',
        current_status: 'DRAFT',
        current_level: 'PS',
        version: 1,
        uid: mockUid,
        created_by: currentUser.username,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        data: { ...(data || {}), uid: mockUid },
        revisions: [
          {
            revision_number: 1,
            changed_by: currentUser.username,
            changed_at: new Date().toISOString(),
            level: 'PS',
            change_type: 'CREATE',
            comment: 'Draft entry initialized',
            field_changes: []
          }
        ],
        transitions: []
      };

      allRecords.push(newRecord);
      localStorage.setItem('prism_mock_records', JSON.stringify(allRecords));
      return Promise.reject({
        isMock: true,
        response: createMockResponse(newRecord)
      });
    }

    if (url.match(/\/records\/([A-Za-z0-9-]+)$/) && method === 'PUT') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)$/)[1];
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      const { data } = payload;
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const idx = allRecords.findIndex(r => r.id === recId);
      if (idx === -1) {
        throw createMockError('Record not found', 404);
      }

      const record = allRecords[idx];
      if (record.current_status !== 'DRAFT' && record.current_status !== 'SENT_BACK_HC') {
        throw createMockError('Lock violation: Record can only be modified in DRAFT or SENT_BACK state', 400);
      }

      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUsername = 'HC Ramesh Kumar';
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user?.username) currentUsername = parsed.state.user.username;
        } catch (e) { }
      }

      // Compute changes
      const changes = [];
      Object.keys(data).forEach(k => {
        if (data[k] !== record.data[k]) {
          changes.push({
            field_key: k,
            old_value: record.data[k] || '',
            new_value: data[k] || ''
          });
        }
      });

      record.data = { ...record.data, ...data };
      record.version += 1;
      record.updated_at = new Date().toISOString();
      record.revisions.unshift({
        revision_number: record.version,
        changed_by: currentUsername,
        changed_at: new Date().toISOString(),
        level: record.current_level,
        change_type: 'UPDATE',
        comment: 'Record edited',
        field_changes: changes
      });

      allRecords[idx] = record;
      localStorage.setItem('prism_mock_records', JSON.stringify(allRecords));
      return Promise.reject({
        isMock: true,
        response: createMockResponse(record)
      });
    }

    // Delete Record (DRAFT only)
    if (url.match(/\/records\/([A-Za-z0-9-]+)$/) && method === 'DELETE') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)$/)[1];
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const record = allRecords.find(r => r.id === recId);
      if (!record) {
        throw createMockError('Record not found', 404);
      }
      if (record.current_status !== 'DRAFT') {
        throw createMockError('Cannot delete non-draft record', 400);
      }
      const filtered = allRecords.filter(r => r.id !== recId);
      localStorage.setItem('prism_mock_records', JSON.stringify(filtered));
      return Promise.reject({
        isMock: true,
        response: createMockResponse({ message: 'Draft deleted successfully' })
      });
    }

    // Submit Record
    if (url.match(/\/records\/([A-Za-z0-9-]+)\/submit$/) && method === 'POST') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)\/submit$/)[1];
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const idx = allRecords.findIndex(r => r.id === recId);
      if (idx === -1) {
        throw createMockError('Record not found', 404);
      }

      const record = allRecords[idx];
      record.current_status = 'PENDING_SHO';
      record.updated_at = new Date().toISOString();
      record.transitions.unshift({
        from_level: 'PS',
        to_level: 'PS',
        from_status: 'DRAFT',
        to_status: 'PENDING_SHO',
        action: 'SUBMIT',
        performed_by: 'HC Ramesh Kumar',
        performed_at: new Date().toISOString(),
        comment: 'Submitted for station approval'
      });

      allRecords[idx] = record;
      localStorage.setItem('prism_mock_records', JSON.stringify(allRecords));
      return Promise.reject({
        isMock: true,
        response: createMockResponse(record)
      });
    }

    // Approve Record
    if (url.match(/\/records\/([A-Za-z0-9-]+)\/approve$/) && method === 'POST') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)\/approve$/)[1];
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const idx = allRecords.findIndex(r => r.id === recId);
      if (idx === -1) {
        throw createMockError('Record not found', 404);
      }

      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUser = { role: 'SHO', username: 'SHO Sanjay Sharma' };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) currentUser = parsed.state.user;
        } catch (e) { }
      }

      const record = allRecords[idx];
      const oldStatus = record.current_status;

      if (record.current_status === 'PENDING_SHO') {
        record.current_status = 'DISTRICT_REVIEW';
        record.current_level = 'DISTRICT';
      } else if (record.current_status === 'DISTRICT_REVIEW') {
        record.current_status = 'COMPILED';
        record.current_level = 'HQ';
      }

      record.updated_at = new Date().toISOString();
      record.transitions.unshift({
        from_level: oldStatus === 'PENDING_SHO' ? 'PS' : 'DISTRICT',
        to_level: record.current_level,
        from_status: oldStatus,
        to_status: record.current_status,
        action: 'APPROVE',
        performed_by: currentUser.username,
        performed_at: new Date().toISOString(),
        comment: 'Approved in operational hierarchy'
      });

      allRecords[idx] = record;
      localStorage.setItem('prism_mock_records', JSON.stringify(allRecords));
      return Promise.reject({
        isMock: true,
        response: createMockResponse(record)
      });
    }

    // Send Back Record
    if (url.match(/\/records\/([A-Za-z0-9-]+)\/send-back$/) && method === 'POST') {
      const recId = url.match(/\/records\/([A-Za-z0-9-]+)\/send-back$/)[1];
      const { comment, target_fields } = JSON.parse(config.data);
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const idx = allRecords.findIndex(r => r.id === recId);
      if (idx === -1) {
        throw createMockError('Record not found', 404);
      }

      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUser = { role: 'SHO', username: 'SHO Sanjay Sharma' };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) currentUser = parsed.state.user;
        } catch (e) { }
      }

      const record = allRecords[idx];
      const oldStatus = record.current_status;
      record.current_status = 'SENT_BACK_HC';
      record.current_level = 'PS';
      record.updated_at = new Date().toISOString();

      record.transitions.unshift({
        from_level: oldStatus === 'PENDING_SHO' ? 'PS' : 'DISTRICT',
        to_level: 'PS',
        from_status: oldStatus,
        to_status: 'SENT_BACK_HC',
        action: 'SEND_BACK',
        performed_by: currentUser.username,
        performed_at: new Date().toISOString(),
        comment: comment || 'Correction requested',
        target_fields: target_fields || []
      });

      allRecords[idx] = record;
      localStorage.setItem('prism_mock_records', JSON.stringify(allRecords));
      return Promise.reject({
        isMock: true,
        response: createMockResponse(record)
      });
    }

    // Workflow Queue for Approver
    if (url.includes('/workflow/queue') && method === 'GET') {
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUser = { role: 'SHO', psId: 'PS_NDD_PARLIAMENT_STREET', districtId: 'DIST_NDD' };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) currentUser = parsed.state.user;
        } catch (e) { }
      }

      let filteredQueue = [];
      if (currentUser.role === 'SHO') {
        filteredQueue = allRecords.filter(r => r.current_status === 'PENDING_SHO' && r.ps_id === currentUser.psId);
      } else if (currentUser.role === 'DISTRICT' || currentUser.role === 'DISTRICT_OFFICER') {
        filteredQueue = allRecords.filter(r => r.current_status === 'DISTRICT_REVIEW' && r.district_id === currentUser.districtId);
      } else {
        filteredQueue = allRecords.filter(r => r.current_status !== 'DRAFT');
      }

      return Promise.reject({
        isMock: true,
        response: createMockResponse(filteredQueue)
      });
    }

    // Workflow Queue Count
    if (url.includes('/workflow/queue/count') && method === 'GET') {
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const userJSON = localStorage.getItem('crime-diaries-auth');
      let currentUser = { role: 'SHO', psId: 'PS_NDD_PARLIAMENT_STREET', districtId: 'DIST_NDD' };
      if (userJSON) {
        try {
          const parsed = JSON.parse(userJSON);
          if (parsed.state?.user) currentUser = parsed.state.user;
        } catch (e) { }
      }

      let count = 0;
      if (currentUser.role === 'SHO') {
        count = allRecords.filter(r => r.current_status === 'PENDING_SHO' && r.ps_id === currentUser.psId).length;
      } else if (currentUser.role === 'DISTRICT' || currentUser.role === 'DISTRICT_OFFICER') {
        count = allRecords.filter(r => r.current_status === 'DISTRICT_REVIEW' && r.district_id === currentUser.districtId).length;
      }

      return Promise.reject({
        isMock: true,
        response: createMockResponse({ count })
      });
    }

    // List Compilations
    if (url.match(/\/compilations$/) && method === 'GET') {
      const comps = [
        {
          id: 'comp-001',
          source_level: 'DISTRICT',
          target_level: 'HQ',
          route: 'OPS_CHAIN',
          period: '2026-06-15',
          source_entity_id: 'DIST_NDD',
          status: 'DRAFT',
          record_ids: ['rec-c001', 'rec-p001'],
          compiled_summary: { firs: 1, arrests: 0, pcrCalls: 1, missing: 0, uidb: 0 },
          submitted_by: 'Sh. Ashok Singh, IPS',
          submitted_at: null
        }
      ];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(comps)
      });
    }

    // Create Compilation
    if (url.match(/\/compilations$/) && method === 'POST') {
      const { period, district_id } = JSON.parse(config.data);
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');

      // Filter records in district for the date
      const matched = allRecords.filter(r => r.record_date === period && r.current_status === 'COMPILED');
      const firs = matched.filter(r => r.record_type === 'CASE').length;
      const arrests = matched.filter(r => r.record_type === 'ARREST').length;
      const pcrCalls = matched.filter(r => r.record_type === 'PCR_CALL').length;
      const missing = matched.filter(r => r.record_type === 'MISSING').length;
      const uidb = matched.filter(r => r.record_type === 'UIDB').length;

      const newComp = {
        id: 'comp-' + Math.random().toString(36).substring(2, 9),
        source_level: 'DISTRICT',
        target_level: 'HQ',
        route: 'DIRECT_HQ',
        period: period || new Date().toISOString().split('T')[0],
        source_entity_id: district_id || 'DIST_NDD',
        status: 'DRAFT',
        record_ids: matched.map(r => r.id),
        compiled_summary: { firs, arrests, pcrCalls, missing, uidb },
        submitted_by: 'DCP Ashok Kumar, IPS',
        submitted_at: null
      };

      return Promise.reject({
        isMock: true,
        response: createMockResponse(newComp)
      });
    }

    // Submit Compilation
    if (url.match(/\/compilations\/([A-Za-z0-9-]+)\/submit$/) && method === 'POST') {
      const compId = url.match(/\/compilations\/([A-Za-z0-9-]+)\/submit$/)[1];
      return Promise.reject({
        isMock: true,
        response: createMockResponse({ id: compId, status: 'SUBMITTED', submitted_at: new Date().toISOString() })
      });
    }

    // Analytics Overview
    if (url.includes('/analytics/overview') && method === 'GET') {
      const allRecords = JSON.parse(localStorage.getItem('prism_mock_records') || '[]');
      const firs = allRecords.filter(r => r.record_type === 'CASE').length;
      const arrests = allRecords.filter(r => r.record_type === 'ARREST').length;
      const pcrCalls = allRecords.filter(r => r.record_type === 'PCR_CALL').length;
      const missing = allRecords.filter(r => r.record_type === 'MISSING').length;
      const uidb = allRecords.filter(r => r.record_type === 'UIDB').length;

      return Promise.reject({
        isMock: true,
        response: createMockResponse({
          arrests_today: arrests,
          pcr_today: pcrCalls,
          cases_today: firs,
          uidb_today: uidb,
          pending_approvals: allRecords.filter(r => r.current_status.startsWith('PENDING') || r.current_status.includes('REVIEW')).length
        })
      });
    }

    // Analytics by Crime Head
    if (url.includes('/analytics/by-crime-head') && method === 'GET') {
      const data = [
        { crimeHead: 'Theft', count: 12 },
        { crimeHead: 'Robbery', count: 4 },
        { crimeHead: 'Snatching', count: 8 },
        { crimeHead: 'Burglary', count: 3 },
        { crimeHead: 'Murder', count: 1 },
        { crimeHead: 'Other', count: 15 }
      ];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(data)
      });
    }

    // Analytics by PS
    if (url.includes('/analytics/by-ps') && method === 'GET') {
      const data = [
        { station: 'Parliament Street', cases: 8, arrests: 4, pcr: 15 },
        { station: 'Connaught Place', cases: 14, arrests: 7, pcr: 22 },
        { station: 'Chanakyapuri', cases: 3, arrests: 1, pcr: 9 },
        { station: 'Mandir Marg', cases: 5, arrests: 2, pcr: 11 },
        { station: 'Tughlak Road', cases: 2, arrests: 0, pcr: 6 }
      ];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(data)
      });
    }

    // Analytics Trends
    if (url.includes('/analytics/trends') && method === 'GET') {
      const data = [
        { name: 'Monday', cases: 4, arrests: 2, pcr: 12 },
        { name: 'Tuesday', cases: 5, arrests: 3, pcr: 8 },
        { name: 'Wednesday', cases: 8, arrests: 4, pcr: 18 },
        { name: 'Thursday', cases: 3, arrests: 1, pcr: 10 },
        { name: 'Friday', cases: 9, arrests: 6, pcr: 14 },
        { name: 'Saturday', cases: 11, arrests: 8, pcr: 25 },
        { name: 'Sunday', cases: 7, arrests: 5, pcr: 19 }
      ];
      return Promise.reject({
        isMock: true,
        response: createMockResponse(data)
      });
    }

    // Report generate
    if (url.includes('/reports/generate') && method === 'POST') {
      const reqId = 'rep-' + Math.random().toString(36).substring(2, 9);
      return Promise.reject({
        isMock: true,
        response: createMockResponse({ reportId: reqId, status: 'GENERATING' })
      });
    }

    // Report status check
    if (url.match(/\/reports\/status\/([A-Za-z0-9-]+)$/)) {
      const repId = url.match(/\/reports\/status\/([A-Za-z0-9-]+)$/)[1];
      return Promise.reject({
        isMock: true,
        response: createMockResponse({
          reportId: repId,
          status: 'READY',
          downloadUrl: `http://localhost:5173/mock-report-${repId}.xlsx`
        })
      });
    }

    // Hierarchy nodes list
    if (url.includes('/admin/hierarchy') && method === 'GET') {
      return Promise.reject({
        isMock: true,
        response: createMockResponse(POLICE_HIERARCHY)
      });
    }

    if (url.includes('/hierarchy/nodes') && method === 'GET') {
      const list = [];
      const traverse = (node, parentId = null) => {
        list.push({
          id: node.id,
          node_type: node.type,
          name_en: node.name,
          name_hi: node.name,
          code: node.id,
          parent_id: parentId,
          is_active: true
        });
        if (node.children) {
          node.children.forEach(child => traverse(child, node.id));
        }
      };
      traverse(POLICE_HIERARCHY);
      return Promise.reject({
        isMock: true,
        response: createMockResponse(list)
      });
    }

    // Users list (support both /users and /admin/users paths)
    if ((url.includes('/admin/users') || url.match(/\/users$/)) && method === 'GET') {
      const storedUsers = JSON.parse(localStorage.getItem('prism_mock_users') || 'null');
      const mockUsers = storedUsers || [
        { id: 'usr-1', username: 'HC Ramesh Kumar', badge_no: 'HC001', badgeNo: 'HC001', name_en: 'HC Ramesh Kumar', role: 'HC', station_id: 'PS_NDD_PARLIAMENT_STREET', psId: 'PS_NDD_PARLIAMENT_STREET', district_id: 'DIST_NDD', districtId: 'DIST_NDD', is_active: true },
        { id: 'usr-2', username: 'SHO Sanjay Sharma', badge_no: 'SHO102', badgeNo: 'SHO102', name_en: 'SHO Sanjay Sharma', role: 'SHO', station_id: 'PS_NDD_PARLIAMENT_STREET', psId: 'PS_NDD_PARLIAMENT_STREET', district_id: 'DIST_NDD', districtId: 'DIST_NDD', is_active: true },
        { id: 'usr-3', username: 'DCP Ashok Kumar', badge_no: 'DCP491', badgeNo: 'DCP491', name_en: 'DCP Ashok Kumar', role: 'DISTRICT_OFFICER', station_id: null, psId: null, district_id: 'DIST_NDD', districtId: 'DIST_NDD', is_active: true },
        { id: 'usr-4', username: 'Director Vikram Singh', badge_no: 'HQ001', badgeNo: 'HQ001', name_en: 'Director Vikram Singh', role: 'HQ_ADMIN', station_id: null, psId: null, district_id: null, districtId: null, is_active: true },
      ];
      if (!storedUsers) localStorage.setItem('prism_mock_users', JSON.stringify(mockUsers));
      return Promise.reject({ isMock: true, response: createMockResponse(mockUsers) });
    }

    // Create User (POST /users or /admin/users)
    if ((url.includes('/admin/users') || url.match(/\/users$/)) && method === 'POST') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      const users = JSON.parse(localStorage.getItem('prism_mock_users') || '[]');
      const newUser = {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        username: payload.name_en || payload.username || payload.badgeNo,
        name_en: payload.name_en || payload.username || payload.badgeNo,
        badge_no: payload.badgeNo || payload.badge_no,
        badgeNo: payload.badgeNo || payload.badge_no,
        role: payload.role || 'HC',
        station_id: payload.psId || payload.station_id || null,
        psId: payload.psId || null,
        district_id: payload.districtId || payload.district_id || null,
        districtId: payload.districtId || null,
        is_active: true
      };
      users.push(newUser);
      localStorage.setItem('prism_mock_users', JSON.stringify(users));
      return Promise.reject({ isMock: true, response: createMockResponse(newUser) });
    }

    // Update User (PUT /users/:id or /admin/users/:id)
    if ((url.match(/\/admin\/users\/([A-Za-z0-9-]+)$/) || url.match(/\/users\/([A-Za-z0-9-]+)$/)) && method === 'PUT') {
      const userId = (url.match(/\/users\/([A-Za-z0-9-]+)$/) || [])[1];
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      const users = JSON.parse(localStorage.getItem('prism_mock_users') || '[]');
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...payload };
        localStorage.setItem('prism_mock_users', JSON.stringify(users));
      }
      return Promise.reject({ isMock: true, response: createMockResponse(idx !== -1 ? users[idx] : { message: 'Updated' }) });
    }

    // Delete User (DELETE /users/:id)
    if ((url.match(/\/admin\/users\/([A-Za-z0-9-]+)$/) || url.match(/\/users\/([A-Za-z0-9-]+)$/)) && method === 'DELETE') {
      const userId = (url.match(/\/users\/([A-Za-z0-9-]+)$/) || [])[1];
      const users = JSON.parse(localStorage.getItem('prism_mock_users') || '[]');
      const updated = users.map(u => u.id === userId ? { ...u, is_active: false } : u);
      localStorage.setItem('prism_mock_users', JSON.stringify(updated));
      return Promise.reject({ isMock: true, response: createMockResponse({ message: 'User deactivated' }) });
    }

    // Audit Logs (GET /audit)
    if (url.match(/\/audit$/) && method === 'GET') {
      const mockLogs = [
        { id: 'al-1', action: 'LOGIN', table_name: 'sessions', changed_by_role: 'HC', changed_at: new Date(Date.now() - 3600000).toISOString(), ip_address: '10.0.0.1', field_name: null, reason: null },
        { id: 'al-2', action: 'CREATE', table_name: 'records', changed_by_role: 'HC', changed_at: new Date(Date.now() - 7200000).toISOString(), ip_address: '10.0.0.1', field_name: 'fir_no', reason: 'Initial FIR entry' },
        { id: 'al-3', action: 'SUBMIT', table_name: 'records', changed_by_role: 'HC', changed_at: new Date(Date.now() - 5400000).toISOString(), ip_address: '10.0.0.1', field_name: null, reason: 'Submitted for SHO review' },
        { id: 'al-4', action: 'UPDATE', table_name: 'records', changed_by_role: 'SHO', changed_at: new Date(Date.now() - 1800000).toISOString(), ip_address: '10.0.0.5', field_name: 'current_status', reason: 'Sent back to HC for correction' },
        { id: 'al-5', action: 'OVERRIDE', table_name: 'records', changed_by_role: 'DISTRICT_OFFICER', changed_at: new Date(Date.now() - 900000).toISOString(), ip_address: '10.0.0.10', field_name: 'fir_no', reason: 'DCP override - FIR number corrected' },
      ];
      return Promise.reject({ isMock: true, response: createMockResponse({ logs: mockLogs }) });
    }

    // Custom Fields listing (GET /admin/custom-fields)
    if (url.includes('/admin/custom-fields') && method === 'GET') {
      return Promise.reject({ isMock: true, response: createMockResponse({ customFields: [] }) });
    }

    // Create Custom Field (POST /admin/custom-fields)
    if (url.includes('/admin/custom-fields') && method === 'POST') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data || {});
      return Promise.reject({ isMock: true, response: createMockResponse({ id: 'cf-' + Date.now(), ...payload }) });
    }

    // If no specific mock matched, return empty success response
    return Promise.reject({
      isMock: true,
      response: createMockResponse({ message: 'Success (Mock Fallthrough)' })
    });
  },
  (error) => {
    // If it's our rejected mock promise, return the response data
    if (error && error.isMock) {
      return Promise.resolve(error.response);
    }
    return Promise.reject(error);
  }
);

export default api;
export { formSchemas };
