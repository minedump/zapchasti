'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { DbDeal, DealStatus } from '@/lib/types';
import { DEAL_STATUS_LABELS } from '@/lib/types';
import DealStatusBadge from '@/components/deals/DealStatusBadge';
import { formatDateTime } from '@/lib/utils/helpers';
import { Plus, Filter, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все статусы' },
  ...Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function DealsPage() {
  const [deals, setDeals] = useState<DbDeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const supabase = createClient();

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) params.set('status', status);
    if (brand) params.set('brand', brand);

    const res = await fetch(`/api/deals?${params}`);
    const json = await res.json() as { data: DbDeal[]; total: number };
    setDeals(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [status, brand, page]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('deals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, fetchDeals)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchDeals]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Сделки</h1>
          <p className="text-sm text-gray-500">{total} заявок</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDeals}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/deals/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Новая сделка
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Марка авто..."
          value={brand}
          onChange={(e) => { setBrand(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Клиент</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Марка / Деталь</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  Сделки не найдены
                </td>
              </tr>
            ) : (
              deals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-gray-600">{deal.deal_number}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900">
                      {(deal.client_chat as any)?.user?.display_name || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <span className="font-medium text-gray-900">
                        {deal.data.brand} {deal.data.model}
                      </span>
                      {deal.data.part && (
                        <p className="text-xs text-gray-500 mt-0.5">{deal.data.part}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <DealStatusBadge status={deal.status} />
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {formatDateTime(deal.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/deals/${deal.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                    >
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
          <span className="text-sm text-gray-500">
            Показано {Math.min((page - 1) * 20 + 1, total)}–{Math.min(page * 20, total)} из {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              ←
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
