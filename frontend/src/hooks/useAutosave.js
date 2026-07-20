import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../utils/api.js';
import { formatDMY } from '../utils/dateFormat.js';

export function useAutosave(module, recordId) {
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | unsaved
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
    onSuccess: () => {
      // Deliberately NOT invalidating the ['records', id] (or ['records'] prefix-matching
      // it) query here. This form's `activeRecordIdRef` is set straight from
      // `mutation.data` (see DynamicForm.jsx), so invalidation buys nothing for autosave
      // itself — but it used to also invalidate the *currently open* record's own detail
      // query, which is still mounted and rendering this form. React Query would refetch
      // it in the background, DynamicForm's seed effect would see new `initialValues`
      // content and call setValues() to reseed, and any field the user filled in after
      // the autosave request was sent (but before this refetch resolved) got silently
      // wiped — the exact bug reported as "date/time vanishes" and "required field looks
      // filled but Next still blocks it". Other pages (record lists, dashboards) will
      // simply pick up fresh data next time they mount.
      setSaveStatus('saved');
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
