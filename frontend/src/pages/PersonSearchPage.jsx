import React, { useState, useEffect } from 'react';
import { Search, User } from 'lucide-react';
import api from '../utils/api.js';
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
      const rows = res.data?.data || [];
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
              <p className="text-xs text-slate-500 mb-3">{results.length} arrest record{results.length !== 1 ? 's' : ''} found</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                      <th className="text-left py-2 pr-4">Name</th>
                      <th className="text-left py-2 pr-4">Relative Name</th>
                      <th className="text-left py-2 pr-4">Gender / Age</th>
                      <th className="text-left py-2 pr-4">Address</th>
                      <th className="text-left py-2 pr-4">FIR No.</th>
                      <th className="text-left py-2 pr-4">Arrest Date</th>
                      <th className="text-left py-2 pr-4">PS</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.person_id || r.record_id} className="border-b border-slate-800 hover:bg-slate-800/40">
                        <td className="py-2 pr-4 font-medium">{r.name || '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">
                          {r.relative_name || '—'}
                          {r.relative_name && r.relation_type ? ` (${r.relation_type})` : ''}
                        </td>
                        <td className="py-2 pr-4 text-slate-400">{[r.gender, r.age].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">{r.address || '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">{r.fir_no || '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">
                          {r.arrest_date ? formatDate(r.arrest_date) : (r.record_date ? formatDate(r.record_date) : '—')}
                        </td>
                        <td className="py-2 pr-4 text-slate-400">{r.ps_name}</td>
                        <td className="py-2">
                          <span className={`text-xs px-2 py-0.5 rounded border ${r.current_status === 'DRAFT' ? 'bg-slate-500/10 text-slate-400 border-slate-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
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
