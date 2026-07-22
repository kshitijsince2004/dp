import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api.js';
import { formatDMY } from '../utils/dateFormat.js';
import { log } from '../utils/logger.js';

export function useCreateRecord(module) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data: formData, persons = [], properties = [] } = {}) => {
      const record_date = formData.record_date || formatDMY(new Date());
      log.debug('hook:create_record:start', { module, recordDate: record_date, personsCount: persons.length, propertiesCount: properties.length });
      const res = await api.post('/records', {
        record_type: module,
        record_date,
        data: formData,
        persons,
        properties,
      });
      log.info('hook:create_record:success', { module, recordId: res.data?.data?.id });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
    },
    onError: (err) => {
      log.error('hook:create_record:error', { module, message: err?.message, status: err?.response?.status });
    },
  });
}
