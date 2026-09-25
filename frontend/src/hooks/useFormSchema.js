import { useQuery } from '@tanstack/react-query';
import api from '../utils/api.js';
import { log } from '../utils/logger.js';

const SYSTEM_FIELDS = [
  { field_key: 'uid',              field_type: 'TEXT', label_en: 'Record UID',        label_hi: 'रिकॉर्ड यूआईडी (UID)',          readonly: true, validation_rules: { required: false } },
  { field_key: 'district',         field_type: 'TEXT', label_en: 'District',           label_hi: 'जिला',                           readonly: true, validation_rules: { required: false } },
  { field_key: 'police_station',   field_type: 'TEXT', label_en: 'Police Station',     label_hi: 'पुलिस थाना',                     readonly: true, validation_rules: { required: false } },
  { field_key: 'submission_status',field_type: 'TEXT', label_en: 'Submission Status',  label_hi: 'जमा करने की स्थिति',             readonly: true, validation_rules: { required: false } },
];

/**
 * Normalize a field from either mock (has validation_rules) or real backend
 * (may return `validation` instead of `validation_rules`).
 */
function normalizeField(f) {
  const norm = {
    ...f,
    validation_rules: f.validation_rules ?? f.validation ?? {},
    label_hi: f.label_hi || f.label_en,
  };
  if (norm.field_key === 'beat_no') {
    norm.field_type = 'NUMBER';
  }
  if (['gd_time', 'linked_fir_dd_time', 'arrest_time', 'arrival_time', 'missing_recovered_time', 'time_of_occurrence'].includes(norm.field_key)) {
    norm.field_type = 'TIME';
  }
  if (
    norm.field_key === 'uid' ||
    norm.field_key === 'person_uid' ||
    norm.field_key?.endsWith('_npr') ||
    (norm.field_key?.endsWith('_uid') && norm.field_key !== 'uidb_no')
  ) {
    norm.readonly = true;
  }
  return norm;
}

/**
 * useFormSchema - Fetches the dynamic form schema for a given record type.
 * Returns sections: [{ section, title_en, title_hi, fields: [...] }]
 *
 * @param {string} recordType - 'CASE' | 'ARREST' | 'PCR_CALL' | 'MISSING' | 'UIDB'
 * @returns {{ schema, isLoading, isError, error }}
 */
export function useFormSchema(recordType, caseType) {
  const { data: schema, isLoading, isError, error } = useQuery({
    queryKey: ['fields', 'form', recordType, caseType],
    queryFn: async () => {
      if (!recordType) return [];
      const url = `/fields/form/${recordType}${caseType ? `?caseType=${caseType}` : ''}`;
      log.debug('hook:form_schema:fetch_start', { recordType, caseType, url });
      let res;
      try {
        res = await api.get(url);
      } catch (err) {
        log.error('hook:form_schema:fetch_error', { recordType, caseType, message: err?.message, status: err?.response?.status });
        throw err;
      }
      const raw = res.data?.data;
      if (!raw) {
        log.warn('hook:form_schema:empty_response', { recordType, caseType });
        return [];
      }

      // Accept flat sections array or wrapped { sections: [...] }
      const sections = Array.isArray(raw) ? raw : (raw.sections || []);

const KEYS_TO_SKIP = new Set([
  'transfer_to', 'transferred_to_ps_id', 'transferred_to_ps', 'transferred_to_agency_id', 'transferred_to_agency', 'date_of_transfer'
]);

      // Normalize every field's validation key and add title fallback
      const normalized = sections.map((sec) => {
        const normSec = {
          ...sec,
          title_en: sec.title_en || sec.section || 'Details',
          title_hi: sec.title_hi || sec.title_en || sec.section || 'विवरण',
        };
        if (sec.sub_tabs) {
          normSec.sub_tabs = sec.sub_tabs.map((st) => ({
            ...st,
            title_en: st.title_en || st.id || 'Details',
            title_hi: st.title_hi || st.title_en || st.id || 'विवरण',
            fields: (st.fields || []).map(normalizeField).filter((f) => !KEYS_TO_SKIP.has(f.field_key)),
          }));
        } else {
          normSec.fields = (sec.fields || []).map(normalizeField).filter((f) => !KEYS_TO_SKIP.has(f.field_key));
        }
        return normSec;
      });

      // Inject readonly system fields into the first FLAT (non-repeater) section
      const firstFlatSec = normalized.find((sec) => !sec.is_repeater);
      if (firstFlatSec) {
        if (firstFlatSec.sub_tabs && firstFlatSec.sub_tabs.length > 0) {
          const firstSubTab = firstFlatSec.sub_tabs[0];
          const existingKeys = new Set(firstSubTab.fields.map((f) => f.field_key));
          const toInject = SYSTEM_FIELDS.filter((f) => !existingKeys.has(f.field_key));
          firstSubTab.fields = [...toInject, ...firstSubTab.fields];
        } else if (firstFlatSec.fields) {
          const existingKeys = new Set(firstFlatSec.fields.map((f) => f.field_key));
          const toInject = SYSTEM_FIELDS.filter((f) => !existingKeys.has(f.field_key));
          firstFlatSec.fields = [...toInject, ...firstFlatSec.fields];
        }
      }

      log.info('hook:form_schema:fetch_success', { recordType, caseType, sectionsCount: normalized.length });
      return { normalized, layout: res.data?.layout || null };
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!recordType,
  });

  return { 
    schema: schema?.normalized || [], 
    layout: schema?.layout || null,
    isLoading, 
    isError, 
    schemaError: error 
  };
}
