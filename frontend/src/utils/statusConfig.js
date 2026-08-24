/**
 * Central status styling and label dictionary.
 */
export const STATUS_CONFIG = {
  DRAFT: { label: 'Draft', colour: 'gray' },
  PS_SUBMITTED: { label: 'Pending SHO Review', colour: 'orange' },
  SHO_REVIEWED: { label: 'SHO Reviewed', colour: 'blue' },
  DISTRICT_REVIEW: { label: 'DCP Review', colour: 'purple' },
  HQ_RECEIVED: { label: 'HQ Received', colour: 'teal' },
  ACCEPTED: { label: 'Accepted', colour: 'green' },
  REJECTED: { label: 'Returned for Correction', colour: 'red' },
  IN_TRANSFER: { label: 'Transfer Pending', colour: 'amber' },
  AMENDED: { label: 'Amended', colour: 'blue' },
  PENDING_INVESTIGATION: { label: 'Pending Investigation', colour: 'amber' },
  UNDER_INVESTIGATION: { label: 'Under Investigation', colour: 'amber' },
  CHARGESHEETED: { label: 'Chargesheeted', colour: 'emerald' },
  CHALLAN: { label: 'Challan', colour: 'emerald' },
  'CHARGE SHEET': { label: 'Charge Sheet', colour: 'emerald' },
  'POLICE INVESTIGATION REPORT(PIR-JCL)': { label: 'PIR-JCL', colour: 'emerald' },
  CANCELLED: { label: 'Cancelled', colour: 'slate' },
  UNTRACED: { label: 'Untraced', colour: 'slate' },
  CONVICTED: { label: 'Convicted', colour: 'green' },
  ACQUITTED: { label: 'Acquitted', colour: 'yellow' },
  COMPOUNDED: { label: 'Compounded', colour: 'indigo' },
  DISCHARGED: { label: 'Discharged', colour: 'blue' },
  PENDING_TRIAL: { label: 'Pending Trial', colour: 'amber' },
};

export function getStatusConfig(status) {
  if (!status) return { label: 'Unknown', colour: 'gray' };
  return STATUS_CONFIG[status] || {
    label: String(status).replace(/_/g, ' '),
    colour: 'gray'
  };
}

export default {
  STATUS_CONFIG,
  getStatusConfig
};
