import * as levelContractsService from './levelContracts.service.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style.
const log = getLogger('levelContracts.controller');

const CONFIG_AS_DATA_MESSAGE =
  'Level data contracts are config-as-data: edit config/contracts/*.json and run `npm run sync-config` to change them. This API no longer accepts writes.';

export const listContracts = async (req, res) => {
  log.debug('listContracts: enter', { userId: req.user?.id, role: req.user?.role });
  try {
    const contracts = await levelContractsService.getContracts();
    log.info('listContracts: exit', { count: contracts.length });
    return res.status(200).json({ status: 'success', data: contracts });
  } catch (error) {
    log.error('listContracts: failed', { err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Mutation endpoints stay registered for backward compatibility (existing clients still
// get a defined, non-crashing response) but no longer write anything — contracts are
// synced from config/contracts/*.json (see config/README.md) and any row written directly
// via this API would (a) violate the NOT NULL `code` sync key with no value ever supplied
// by the old payload shape, and (b) be overwritten/deactivated by the next sync-config run
// regardless. 405 Method Not Allowed is the correct status for "this route exists but this
// verb is permanently unsupported here".
export const mutationNotAllowed = async (_req, res) => {
  log.warn('mutationNotAllowed: rejected — contracts are config-as-data, API is read-only', { method: _req.method, path: _req.path });
  return res.status(405).json({ status: 'error', message: CONFIG_AS_DATA_MESSAGE });
};
