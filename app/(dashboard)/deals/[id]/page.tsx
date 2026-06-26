'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DbDeal, DbMessage, DealStatus, DbDealStatusHistory } from '@/lib/types';
import { DEAL_STATUS_LABELS } from '@/lib/types';
import DealStatusBadge from '@/components/deals/DealStatusBadge';
import { formatDateTime, formatRelativeTime } from '@/lib/utils/helpers';
import {
  ArrowLeft,
  MessageSquare,
  Building2,
  Clock,
  Send,
} from 'lucide-react';

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<DbDeal | null>(null);
  const [clientMessages, setClientMessages] = useState<DbMessage[]>([]);
  const [supplierMessages, setSupplierMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusComment, setStatusComment] = useState('');
  const [newStatus, setNewStatus] = useState<DealStatus | ''>('');
  const [updating, setUpdating] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchDeal = useCallback(async () => {
    const res = await fetch(`/api/deals/${id}`);
    const json = await res.json() as { data: DbDeal };
    setDeal(json.data);
    setLoading(false);
  }, [id]);

  const fetchMessages = useCallback(async (chatId: string, setter: (m: DbMessage[]) => void) => {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const json = await res.json() as { data: DbMessage[] };
    setter(json.data || []);
  }, []);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  useEffect(() => {
    if (deal?.client_chat_id) fetchMessages(deal.client_chat_id, setClientMessages);
    if (deal?.supplier_chat_id) fetchMessages(deal.supplier_chat_id, setSupplierMessages);
  }, [deal, fetchMessages]);

  async function handleStatusUpdate() {
    if (!newStatus || !deal) return;
    setUpdating(true);
    await fetch(`/api/deals/${deal.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, comment: statusComment }),
    });
    await fetchDeal();
    setNewStatus('');
    setStatusComment('');
    setUpdating(false);
  }

  async function handleReplyToClient() {
    if (!replyText.trim() || !deal?.client_chat_id) return;
    setSending(true);
    await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: deal.client_chat_id,
        content: replyText.trim(),
        dealId: deal.id,
      }),
    });
    setReplyText('');
    setSending(false);
    if (deal.client_chat_id) fetchMessages(deal.client_chat_id, setClientMessages);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Сделка не найдена</div>
      </div>
    );
  }

  const history = (deal as any).status_history as DbDealStatusHistory[] || [];

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-gray-900">{deal.deal_number}</h1>
            <DealStatusBadge status={deal.status} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Создана {formatDateTime(deal.created_at)}
          </p>
        </div>

        {/* Quick links */}
        <div className="flex gap-2">
          {deal.client_chat_id && (
            <Link
              href={`/chats?chat=${deal.client_chat_id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Чат с клиентом
            </Link>
          )}
          {deal.supplier_chat_id && (
            <Link
              href={`/chats?chat=${deal.supplier_chat_id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100 transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Чат с поставщиком
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-6 p-6">
        {/* Left column */}
        <div className="flex-1 space-y-6">
          {/* Deal data */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Данные заявки</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(deal.data).map(([key, value]) => {
                if (!value) return null;
                const labels: Record<string, string> = {
                  brand: 'Марка', model: 'Модель', year: 'Год',
                  vin: 'VIN', part: 'Запчасть', condition: 'Состояние',
                  budget: 'Бюджет', urgency: 'Срочность', city: 'Город', notes: 'Примечания',
                };
                return (
                  <div key={key}>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">{labels[key] || key}</dt>
                    <dd className="text-sm font-medium text-gray-900 mt-0.5">{value}</dd>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status update */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Изменить статус</h2>
            <div className="space-y-3">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as DealStatus)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Выберите статус...</option>
                {Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <textarea
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                placeholder="Комментарий (необязательно)"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleStatusUpdate}
                disabled={!newStatus || updating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updating ? 'Сохранение...' : 'Обновить статус'}
              </button>
            </div>
          </div>

          {/* Reply to client */}
          {deal.client_chat_id && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Ответить клиенту</h2>
              <div className="flex gap-3">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Текст сообщения клиенту..."
                  rows={3}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleReplyToClient}
                  disabled={!replyText.trim() || sending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors self-end"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="w-80 space-y-6">
          {/* Status history */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              История статусов
            </h2>
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">Нет истории</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">
                        {DEAL_STATUS_LABELS[h.new_status as DealStatus] || h.new_status}
                      </p>
                      {h.comment && (
                        <p className="text-xs text-gray-500 mt-0.5">{h.comment}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatRelativeTime(h.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent messages */}
          {supplierMessages.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Последние от поставщика
              </h2>
              <div className="space-y-3">
                {supplierMessages.slice(-3).map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <p className="text-gray-900">{msg.content_translated || msg.content}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(msg.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
