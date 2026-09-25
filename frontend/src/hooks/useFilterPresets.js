import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api.js';
import { log } from '../utils/logger.js';

/**
 * useFilterPresets
 *
 * Wraps GET/POST/DELETE /filters/presets.
 *
 * Returns:
 *   presets      - array of saved filter preset objects
 *   isLoading    - boolean
 *   savePreset   - mutation fn: (name, filters) => void
 *   deletePreset - mutation fn: (id) => void
 */
export function useFilterPresets() {
  const queryClient = useQueryClient();

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['filters', 'presets'],
    queryFn: async () => {
      log.debug('hook:filter_presets:fetch_start', {});
      let res;
      try {
        res = await api.get('/filters/presets');
      } catch (err) {
        log.error('hook:filter_presets:fetch_error', { message: err?.message, status: err?.response?.status });
        throw err;
      }
      // Backend returns { status: 'success', data: [...] }
      const raw = res.data?.data;
      const presets = Array.isArray(raw) ? raw : [];
      log.info('hook:filter_presets:fetch_success', { count: presets.length });
      return presets;
    },
    staleTime: 5 * 60 * 1000, // 5 min — presets change infrequently
  });

  const saveMutation = useMutation({
    mutationFn: async ({ name, filters }) => {
      const conditions = [];
      if (filters.type && filters.type !== 'ALL') {
        conditions.push({ field: '_record_type', operator: 'eq', value: filters.type });
      }
      if (filters.status && filters.status !== 'ALL') {
        conditions.push({ field: '_status', operator: 'eq', value: filters.status });
      }
      if (filters.dateFrom) {
        conditions.push({ field: '_record_date', operator: 'gte', value: filters.dateFrom });
      }
      if (filters.dateTo) {
        conditions.push({ field: '_record_date', operator: 'lte', value: filters.dateTo });
      }
      if (filters.search && filters.search.trim()) {
        conditions.push({ field: '_search', operator: 'contains', value: filters.search.trim() });
      }

      // Add other properties if any
      Object.keys(filters).forEach(key => {
        if (!['type', 'status', 'dateFrom', 'dateTo', 'search'].includes(key) && filters[key]) {
          conditions.push({ field: key, operator: 'eq', value: filters[key] });
        }
      });

      const payload = {
        name,
        filter_spec: {
          logic: 'AND',
          conditions
        },
        record_types: filters.type && filters.type !== 'ALL' ? [filters.type] : ['CASE', 'ARREST', 'PCR_CALL']
      };

      log.debug('hook:filter_presets:save_start', { name, conditionsCount: conditions.length });
      const res = await api.post('/filters/presets', payload);
      log.info('hook:filter_presets:save_success', { name, presetId: res.data?.data?.id });
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success('Filter preset saved');
      queryClient.invalidateQueries({ queryKey: ['filters', 'presets'] });
    },
    onError: (err) => {
      log.error('hook:filter_presets:save_error', { message: err?.message, status: err?.response?.status });
      toast.error(err.response?.data?.message || 'Failed to save preset');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/filters/presets/${id}`);
    },
    onSuccess: () => {
      toast.success('Preset deleted');
      queryClient.invalidateQueries({ queryKey: ['filters', 'presets'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete preset');
    },
  });

  return {
    presets,
    isLoading,
    savePreset: (name, filters) => saveMutation.mutate({ name, filters }),
    deletePreset: (id) => deleteMutation.mutate(id),
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
