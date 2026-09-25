import React, { useState, useEffect } from 'react';
import { Search, User } from 'lucide-react';
import api from '../utils/api.js';
import { asArray } from '../utils/dataShape.js';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/formatters.js';
import { log } from '../utils/logger.js';

export default function PersonSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    log.debug('page:mount', { route: '/person-search' });
    return () => log.debug('page:unmount', { route: '/person-search' });
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm && !fatherName) {
      toast.error('Enter at least a name or father name to search.');
      return;
    }
    setLoading(true);
    setSearched(true);
    log.info('action:person_search_start', { hasSearchTerm: !!searchTerm, hasFatherName: !!fatherName });
    try {
      const params = {};
      if (searchTerm) params.searchTerm = searchTerm;
      if (fatherName) params.fatherName = fatherName;
      const res = await api.get('/v1/record-links/person-search', { params });
      const rows = asArray(res.data?.data);
      log.info('action:person_search_success', { count: rows.length });
      setResults(rows);
    } catch (err) {
      log.error('action:person_search_failed', { err });
      toast.error(err.response?.data?.message || 'Search failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Person Search</h1>
          <p className="page-desc">Search for a person across all arrest records by name or father name.</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="card">
        <div className="card-title">
          <User size={18} aria-hidden="true" />
          <span>Search Parameters</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="ps-name">Person Name (partial match)</label>
            <input
              id="ps-name"
              type="text"
              className="form-control"
              placeholder="e.g. Ramesh Kumar…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ps-father">Father / Parent Name</label>
            <input
              id="ps-father"
              type="text"
              className="form-control"
              placeholder="e.g. Sohan Lal…"
              value={fatherName}
              onChange={e => setFatherName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="col-span-full flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Search size={16} aria-hidden="true" className="menu-icon" />
              <span>{loading ? 'Searching…' : 'Search'}</span>
            </button>
          </div>
        </div>
      </form>

      {searched && (
        <div className="card mt-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400">No arrest records found matching those details.</p>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-500 mb-3">{results.length} arrest record{results.length !== 1 ? 's' : ''} found</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm sm:text-base">
                  <thead>
                    <tr className="border-b border-slate-300 text-sm sm:text-base font-bold text-slate-700 uppercase tracking-wider">
                      <th className="text-left py-3 pr-4">Name</th>
                      <th className="text-left py-3 pr-4">Relative Name</th>
                      <th className="text-left py-3 pr-4">Gender / Age</th>
                      <th className="text-left py-3 pr-4">Address</th>
                      <th className="text-left py-3 pr-4">FIR No.</th>
                      <th className="text-left py-3 pr-4">Arrest Date</th>
                      <th className="text-left py-3 pr-4">PS</th>
                      <th className="text-left py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.person_id || r.record_id} className="border-b border-slate-200 hover:bg-slate-50/50">
                        <td className="py-3 pr-4 font-bold text-slate-900">{r.name || '—'}</td>
                        <td className="py-3 pr-4 text-slate-600 font-medium">
                          {r.relative_name || '—'}
                          {r.relative_name && r.relation_type ? ` (${r.relation_type})` : ''}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 font-medium">{[r.gender, r.age].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="py-3 pr-4 text-slate-600 font-medium">{r.address || '—'}</td>
                        <td className="py-3 pr-4 font-mono font-bold text-slate-800">{r.fir_no || '—'}</td>
                        <td className="py-3 pr-4 font-mono text-slate-600 font-semibold">
                          {r.arrest_date ? formatDate(r.arrest_date) : (r.record_date ? formatDate(r.record_date) : '—')}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 font-medium">{r.ps_name}</td>
                        <td className="py-3">
                          <span className={`text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${r.current_status === 'DRAFT' ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                            {r.current_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
