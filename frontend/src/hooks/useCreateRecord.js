import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api.js';
import { formatDMY } from '../utils/dateFormat.js';

export function useCreateRecord(module) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data: formData, persons = [], properties = [] } = {}) => {
      const record_date = formData.record_date || formatDMY(new Date());
      const res = await api.post('/records', {
        record_type: module,
        record_date,
        data: formData,
        persons,
        properties,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
    }
  });
}
