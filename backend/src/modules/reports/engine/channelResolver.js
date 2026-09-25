import db from '../../../config/db.js';

let cachedChannelMappings = null;

export async function getChannelMappings(trx = db) {
  if (cachedChannelMappings) return cachedChannelMappings;

  try {
    const meta = await trx('system_meta').where({ key: 'channel_mappings' }).first();
    if (meta && meta.value) {
      cachedChannelMappings = typeof meta.value === 'string' ? JSON.parse(meta.value) : meta.value;
      return cachedChannelMappings;
    }
  } catch (err) {
    // Database offline or unmigrated fallback
  }

  cachedChannelMappings = {
    'eTheft': 'E_FIR',
    'eMVT': 'E_FIR',
    'MANUAL': 'MANUAL'
  };

  return cachedChannelMappings;
}

export function clearChannelCache() {
  cachedChannelMappings = null;
}

export async function resolveChannel(registrationType, trx = db) {
  const mappings = await getChannelMappings(trx);
  if (!registrationType) return 'MANUAL';

  const mapped = mappings[registrationType];
  if (mapped) return mapped;

  if (registrationType.toLowerCase().startsWith('e')) {
    return 'E_FIR';
  }
  return 'MANUAL';
}
