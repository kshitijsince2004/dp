import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder, ChevronRight, ChevronDown, Search,
  Plus, Edit2, Trash2, Save, X, AlertTriangle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

// ── Node type badge colours ───────────────────────────────────────────────────
const NODE_TYPE_STYLE = {
  RANGE:         'bg-blue-950/40 text-blue-400 border-blue-800/40',
  DISTRICT:      'bg-amber-950/40 text-amber-400 border-amber-800/40',
  SUB_DIVISION:  'bg-[var(--ux4g-bg-primary-soft)] text-[var(--primary)] border-[var(--border-color)]',
  PS:            'bg-emerald-950/40 text-emerald-400 border-emerald-800/40',
};

// ── TreeNode — recursive collapsible component ───────────────────────────────
function TreeNode({ node, nodes, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = useMemo(
    () => nodes.filter((n) => n.parent_id === node.id),
    [nodes, node.id],
  );
  const hasChildren = children.length > 0;
  const typeCls = NODE_TYPE_STYLE[node.node_type] || 'bg-zinc-800 text-zinc-400 border-zinc-700';

  return (
    <div className={`${depth > 0 ? 'pl-5 border-l border-zinc-800/60 ml-2' : ''} mt-1.5`}>
      <div
        className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-zinc-800/30 transition-colors group cursor-pointer"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors w-4 flex-shrink-0">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <Folder size={13} className="text-[var(--accent-gold)] flex-shrink-0" />
        <span className="text-zinc-200 text-xs font-semibold truncate">{node.name_en || node.name || node.id}</span>
        {node.name_hi && (
          <span className="text-zinc-500 text-[10px] truncate hidden md:inline">{node.name_hi}</span>
        )}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeCls} flex-shrink-0 ml-auto`}>
          {node.node_type}
        </span>
        {children.length > 0 && (
          <span className="text-[9px] text-zinc-600 font-mono flex-shrink-0">{children.length} sub</span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="space-y-0">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} nodes={nodes} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── NodeForm — create / edit modal ────────────────────────────────────────────
function NodeForm({ initialData, nodes, onSave, onCancel, isSaving }) {
  const isEdit = !!initialData?.id;
  const [form, setForm] = useState({
    name_en:   initialData?.name_en || '',
    name_hi:   initialData?.name_hi || '',
    node_type: initialData?.node_type || 'PS',
    parent_id: initialData?.parent_id || '',
    code:      initialData?.code || '',
  });

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name_en.trim()) { toast.error('Node name (EN) is required'); return; }
    onSave({ ...form, id: initialData?.id });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-zinc-400 font-semibold">Name (English) *</label>
          <input
            value={form.name_en}
            onChange={set('name_en')}
            placeholder="e.g. Parliament Street PS"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-[var(--accent-gold)] transition-all"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-zinc-400 font-semibold">Name (Hindi)</label>
          <input
            value={form.name_hi}
            onChange={set('name_hi')}
            placeholder="e.g. संसद मार्ग पुलिस स्टेशन"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-[var(--accent-gold)] transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-zinc-400 font-semibold">Node Type *</label>
          <select
            value={form.node_type}
            onChange={set('node_type')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-[var(--accent-gold)] transition-all cursor-pointer"
          >
            {['RANGE', 'DISTRICT', 'SUB_DIVISION', 'PS'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-zinc-400 font-semibold">Parent Node</label>
          <select
            value={form.parent_id}
            onChange={set('parent_id')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-[var(--accent-gold)] transition-all cursor-pointer"
          >
            <option value="">No parent (root)</option>
            {nodes
              .filter((n) => n.id !== initialData?.id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.node_type}] {n.name_en}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-zinc-400 font-semibold">Internal Code / Key</label>
        <input
          value={form.code}
          onChange={set('code')}
          placeholder="e.g. PS_NDD_PARLIAMENT"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-[var(--accent-gold)] transition-all font-mono"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-gold)] hover:bg-amber-600 text-zinc-950 font-bold transition-colors cursor-pointer disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {isEdit ? 'Update Node' : 'Create Node'}
        </button>
      </div>
    </form>
  );
}

// ── Main HierarchyManager ────────────────────────────────────────────────────
export default function HierarchyManager() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'SYSTEM_ADMIN';

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'table'
  const [showForm, setShowForm] = useState(false);
  const [editNode, setEditNode] = useState(null);

  useEffect(() => {
    log.debug('page:mount', { route: '/admin/hierarchy' });
    return () => log.debug('page:unmount', { route: '/admin/hierarchy' });
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data: nodes = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'hierarchy', 'nodes'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'hierarchy_nodes' });
      try {
        const res = await api.get('/hierarchy/nodes');
        const raw = res.data?.data;
        const rows = Array.isArray(raw) ? raw : [];
        log.debug('data:load_success', { what: 'hierarchy_nodes', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'hierarchy_nodes', err });
        throw err;
      }
    },
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body) => { log.info('action:hierarchy_node_create_start', { nodeType: body.node_type, name: body.name_en }); return api.post('/hierarchy/nodes', body); },
    onSuccess: (res, body) => {
      log.info('action:hierarchy_node_create_success', { nodeType: body.node_type, name: body.name_en });
      toast.success('Node created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy'] });
      setShowForm(false);
    },
    onError: (err, body) => { log.error('action:hierarchy_node_create_failed', { name: body?.name_en, err }); toast.error(err.response?.data?.message || 'Create failed'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => { log.info('action:hierarchy_node_update_start', { nodeId: id }); return api.put(`/hierarchy/nodes/${id}`, body); },
    onSuccess: (res, { id }) => {
      log.info('action:hierarchy_node_update_success', { nodeId: id });
      toast.success('Node updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy'] });
      setEditNode(null);
    },
    onError: (err, { id }) => { log.error('action:hierarchy_node_update_failed', { nodeId: id, err }); toast.error(err.response?.data?.message || 'Update failed'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => { log.info('action:hierarchy_node_delete_start', { nodeId: id }); return api.delete(`/hierarchy/nodes/${id}`); },
    onSuccess: (res, id) => {
      log.info('action:hierarchy_node_delete_success', { nodeId: id });
      toast.success('Node deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy'] });
    },
    onError: (err, id) => { log.error('action:hierarchy_node_delete_failed', { nodeId: id, err }); toast.error(err.response?.data?.message || 'Delete failed'); },
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const rootNodes = useMemo(() => nodes.filter((n) => !n.parent_id), [nodes]);

  const filteredNodes = useMemo(() => {
    if (!search) return nodes;
    const q = search.toLowerCase();
    return nodes.filter(
      (n) =>
        (n.name_en || '').toLowerCase().includes(q) ||
        (n.name_hi || '').includes(q) ||
        (n.node_type || '').toLowerCase().includes(q) ||
        (n.code || '').toLowerCase().includes(q),
    );
  }, [nodes, search]);

  const getParentName = (pid) => {
    const p = nodes.find((n) => n.id === pid);
    return p ? (p.name_en || p.id) : '—';
  };

  // Counts per node type for the summary strips (prevent undefined counts)
  const counts = React.useMemo(() => {
    const map = { RANGE: 0, DISTRICT: 0, SUB_DIVISION: 0, PS: 0 };
    nodes.forEach((n) => {
      if (n?.node_type && Object.prototype.hasOwnProperty.call(map, n.node_type)) map[n.node_type]++;
    });
    return map;
  }, [nodes]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = (data) => {
    log.debug('action:hierarchy_node_form_submit', { nodeId: data?.id, isEdit: !!data?.id });
    if (data?.id) {
      updateMutation.mutate({ id: data.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (node) => {
    log.debug('action:hierarchy_node_delete_click', { nodeId: node.id });
    if (!window.confirm(`Delete node "${node.name_en || node.id}"? This cannot be undone.`)) return;
    deleteMutation.mutate(node.id);
  };

  return (
    <div className="space-y-6 theme-admin-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">
            <span>Hierarchy Node Configurator</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            Inspect, add, or update jurisdiction nodes: Ranges, Districts, Sub-Divisions, and Police Stations.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => { setEditNode(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer border-none active:scale-95 shadow-sm"
          >
            <Plus size={14} />
            Add Node
          </button>
        )}
      </div>
 
      {/* ── Summary Strips ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {[
          { type: 'RANGE',        label: 'Ranges',         color: 'text-blue-500' },
          { type: 'DISTRICT',     label: 'Districts',      color: 'text-amber-500' },
          { type: 'SUB_DIVISION', label: 'Sub-Divisions',  color: 'text-violet-500' },
          { type: 'PS',           label: 'Police Stations', color: 'text-emerald-500' },
        ].map(({ type, label, color }) => (
          <div key={type} className="border border-slate-200 bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
            <div>
              <div className={`text-2xl font-bold tabular-numbers ${color}`}>{counts[type]}</div>
              <div className="text-slate-550 font-semibold">{label}</div>
            </div>
          </div>
        ))}
      </div>
 
      {/* ── Create / Edit Form Modal ────────────────────────────────────────── */}
      {(showForm || editNode) && (
        <div className="border border-[var(--accent-color)] bg-white rounded-xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {editNode ? 'Edit Node' : 'Create New Node'}
            </h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditNode(null); }}
              className="text-slate-500 hover:text-slate-700 cursor-pointer border-none bg-transparent"
            >
              <X size={16} />
            </button>
          </div>
          <NodeForm
            initialData={editNode}
            nodes={nodes}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditNode(null); }}
            isSaving={isSaving}
          />
        </div>
      )}
 
      {/* ── Tab Switch ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        {['tree', 'table'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-xs font-bold rounded-t transition-colors cursor-pointer capitalize border-none bg-transparent ${
              activeTab === tab
                ? 'border border-b-0 border-slate-200 bg-white text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'tree' ? 'Tree View' : 'Flat Table'}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            placeholder="Search nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-850 outline-none focus:border-[var(--accent-color)] transition-all w-48 font-semibold"
          />
        </div>
      </div>
 
      {/* ── Content ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-500">
          <Loader2 size={28} className="animate-spin mb-3 text-[var(--accent-color)]" />
          <p className="text-sm">Loading jurisdiction hierarchy…</p>
        </div>
      ) : isError ? (
        <div className="border border-red-200 bg-red-50 rounded-xl p-8 text-center shadow-sm">
          <AlertTriangle size={28} className="mx-auto text-red-500 mb-2" />
          <p className="text-red-650 text-sm font-semibold">Failed to load hierarchy nodes</p>
          <p className="text-red-700 text-xs mt-1 font-medium">Check backend connectivity and your access permissions.</p>
        </div>
      ) : activeTab === 'tree' ? (
        <div className="border border-slate-200 bg-white rounded-xl p-4 shadow-sm">
          <div className="bg-slate-50 rounded-xl p-4 max-h-[520px] overflow-y-auto">
            {(search ? filteredNodes.filter((n) => !filteredNodes.some((m) => m.parent_id === n.id && m.id === n.parent_id)) : rootNodes).length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-8">No nodes match your search.</p>
            ) : (
              (search ? filteredNodes : rootNodes).map((node) => (
                <TreeNode key={node.id} node={node} nodes={nodes} depth={0} />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 tracking-wider">
                  <th className="p-3 pl-5">Name (EN)</th>
                  <th className="p-3">Name (HI)</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Parent</th>
                  <th className="p-3">Code</th>
                  {isAdmin && <th className="p-3 pr-5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {filteredNodes.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="p-8 text-center text-slate-500">
                      No nodes match your search.
                    </td>
                  </tr>
                ) : (
                  filteredNodes.map((node) => {
                    const typeCls = NODE_TYPE_STYLE[node.node_type] || 'bg-slate-100 text-slate-500 border-slate-200';
                    return (
                      <tr key={node.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 pl-5 font-semibold text-slate-750">{node.name_en || '—'}</td>
                        <td className="p-3 text-slate-500">{node.name_hi || '—'}</td>
                        <td className="p-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${typeCls}`}>
                            {node.node_type}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">{getParentName(node.parent_id)}</td>
                        <td className="p-3 font-mono text-slate-450 text-[10px]">{node.code || '—'}</td>
                        {isAdmin && (
                          <td className="p-3 pr-5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditNode(node); setShowForm(false); }}
                                className="text-slate-450 hover:text-blue-500 transition-colors cursor-pointer p-1 rounded border-none bg-transparent"
                                title="Edit"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(node)}
                                disabled={deleteMutation.isPending}
                                className="text-slate-450 hover:text-red-500 transition-colors cursor-pointer p-1 rounded disabled:opacity-40 border-none bg-transparent"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500">
            {filteredNodes.length} of {nodes.length} nodes shown
          </div>
        </div>
      )}
    </div>
  );
}
