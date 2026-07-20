import * as levelContractsService from './levelContracts.service.js';

const CONFIG_AS_DATA_MESSAGE =
  'Level data contracts are config-as-data: edit config/contracts/*.json and run `npm run sync-config` to change them. This API no longer accepts writes.';

export const listContracts = async (req, res) => {
  try {
    const contracts = await levelContractsService.getContracts();
    return res.status(200).json({ status: 'success', data: contracts });
  } catch (error) {
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
  return res.status(405).json({ status: 'error', message: CONFIG_AS_DATA_MESSAGE });
};
