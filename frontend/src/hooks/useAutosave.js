import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api.js';
import { formatDMY } from '../utils/dateFormat.js';

export function useAutosave(module, recordId) {
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | unsaved
  const queryClient = useQueryClient();
  const timerRef = useRef(null);

  const mutation = useMutation({
    mutationFn: async ({ id, data, persons, properties }) => {
      if (id) {
        const res = await api.put(`/records/${id}`, {
          data,
          ...(persons !== undefined && { persons }),
          ...(properties !== undefined && { properties })
        });
        return res.data.data;
      } else {
        const record_date = data.record_date || formatDMY(new Date());
        const res = await api.post('/records', {
          record_type: module,
          record_date,
          data,
          ...(persons !== undefined && { persons }),
          ...(properties !== undefined && { properties })
        });

        return res.data.data;
      }
    },
    onSuccess: (savedRecord) => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['records'] });
      if (savedRecord?.id) {
        queryClient.invalidateQueries({ queryKey: ['records', savedRecord.id] });
      }
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('unsaved');
    }
  });

  const triggerAutosave = (data, activeId, persons, properties) => {
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      mutation.mutate({ id: activeId || recordId, data, persons, properties });
    }, 2000);
  };

  const saveImmediately = (data, activeId, persons, properties) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus('saving');
    mutation.mutate({ id: activeId || recordId, data, persons, properties });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    triggerAutosave,
    saveImmediately,
    saveStatus,
    isLoading: mutation.isPending,
    error: mutation.error,
    savedRecord: mutation.data
  };
}
