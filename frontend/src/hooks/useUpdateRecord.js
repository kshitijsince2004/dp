import { useMutation } from '@tanstack/react-query';
import api from '../utils/api.js';
import { log } from '../utils/logger.js';

export function useUpdateRecord(module) {
  return useMutation({
    mutationFn: async ({ id, data, persons, properties }) => {
      log.debug('hook:update_record:start', { module, recordId: id, personsCount: persons?.length, propertiesCount: properties?.length });
      const res = await api.put(`/records/${id}`, {
        data,
        ...(persons !== undefined && { persons }),
        ...(properties !== undefined && { properties }),
      });
      log.info('hook:update_record:success', { module, recordId: id });
      return res.data.data;
    },
    // Deliberately NOT invalidating ['records'] / ['records', id] here — same reasoning as
    // useAutosave.js's onSuccess (see its comment). This hook's only caller, NewRecord.jsx,
    // keeps the record's own detail query (`['records', editId]`, refetchOnMount:'always' +
    // staleTime:0, #R2-2) mounted while this mutation's response is still in flight, and
    // `queryClient.invalidateQueries({queryKey:['records']})` prefix-matches — and therefore
    // also refetches — that exact query, not just the list. A refetch resolving mid-edit
    // fed DynamicForm's seed effects fresh `initialValues`/`initialPersons`/
    // `initialProperties` props, which used to reseed unconditionally and clobber whatever
    // the user had changed since. That was reported as "new victim/accused doesn't persist"
    // and "complainant name/address edits revert" (B8, 2026-07-21).
    // NOTE: removing this call alone is NOT sufficient — NewRecord.jsx's OWN submitMutation
    // (which always runs right after this hook, on the only call path that uses it) also
    // invalidates ['records'] on success, which prefix-matches the same detail query. The
    // real, sufficient fix is in DynamicForm.jsx: both seed effects now carry a
    // `formDirtyRef` guard that skips reseeding a record that's already loaded while the
    // user has unsaved-since-load edits, regardless of which mutation triggered the
    // refetch. This hook's non-invalidation is kept anyway (defense in depth, and it matches
    // useAutosave's already-established pattern) but the seed-effect guard is what actually
    // closes the bug.
    onSuccess: () => {},
    onError: (err, variables) => {
      log.error('hook:update_record:error', { module, recordId: variables?.id, message: err?.message, status: err?.response?.status });
    },
  });
}
