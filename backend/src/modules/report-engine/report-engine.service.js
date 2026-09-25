import { generate as generatePHQ } from '../phq-diary/phq-diary.service.js';
import { generateDistrictDiary } from './district/district-diary.service.js';
import { generateFnDiary } from './fn/fn-diary.service.js';

/**
 * Top-level Report Engine Dispatcher
 * @param {string} reportFamily - 'PHQ_DIARY' | 'DISTRICT_DIARY' | 'FN_DIARY'
 * @param {string} scopeNodeId - hierarchy_node UUID or code
 * @param {string} cutoffDate - ISO date YYYY-MM-DD (or fnEndDate for FN_DIARY)
 * @param {Array<string>} selectedSheets - list of sheet keys
 */
export async function generateReport({ reportFamily, scopeNodeId, cutoffDate, selectedSheets }) {
  const family = (reportFamily || 'PHQ_DIARY').toUpperCase();

  if (family === 'DISTRICT_DIARY') {
    return await generateDistrictDiary(scopeNodeId, cutoffDate, selectedSheets);
  }

  if (family === 'FN_DIARY') {
    return await generateFnDiary(scopeNodeId, cutoffDate, selectedSheets);
  }

  // Fallback / PHQ Diary
  return await generatePHQ(cutoffDate, scopeNodeId, selectedSheets);
}
