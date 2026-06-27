'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import type { DbSupplier, DbTemplate, SessionStatus } from '@/lib/types';
import { formatDateTime, formatRelativeTime } from '@/lib/utils/helpers';
import {
  Plus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  Settings,
  Users,
  FileText,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils/helpers';

type AdminTab = 'suppliers' | 'template' | 'keys';

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('suppliers');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Администрирование</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 bg-white border-b border-gray-100">
        {([
          { value: 'suppliers', label: 'Поставщики', icon: Users },
          { value: 'template', label: 'Шаблон заявки', icon: FileText },
          { value: 'keys', label: 'API-ключи', icon: Key },
        ] as { value: AdminTab; label: string; icon: React.ElementType }[]).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === value
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'template' && <TemplateTab />}
        {tab === 'keys' && <ApiKeysTab />}
      </div>
    </div>
  );
}

// ============================================================
// Suppliers Tab
// ============================================================
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBrands, setNewBrands] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function fetchSuppliers() {
    setLoading(true);
    const res = await fetch('/api/admin/suppliers');
    const json = await res.json() as { data: DbSupplier[] };
    setSuppliers(json.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchSuppliers(); }, []);

  async function handleAddSupplier() {
    if (!newName.trim()) return;
    setAdding(true);
    const brands = newBrands.split(',').map((b) => b.trim()).filter(Boolean);
    const res = await fetch('/api/wechat/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName: newName, brands }),
    });
    const json = await res.json() as { qrCode: string };
    setQrCode(json.qrCode);
    setAdding(false);
    fetchSuppliers();
  }

  const sessionIcon = (status: SessionStatus) => {
    if (status === 'active') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === 'expiring') return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const sessionLabel = (status: SessionStatus) => {
    if (status === 'active') return 'Активна';
    if (status === 'expiring') return 'Истекает';
    return 'Неактивна';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Поставщики WeChat</h2>
        <div className="flex gap-2">
          <button onClick={fetchSuppliers} className="p-2 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Добавить поставщика
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-medium text-gray-900">Новый поставщик</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имя / Название</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Иван Ли"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Марки (через запятую)</label>
              <input
                type="text"
                value={newBrands}
                onChange={(e) => setNewBrands(e.target.value)}
                placeholder="toyota, honda, nissan"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={handleAddSupplier}
            disabled={!newName.trim() || adding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Генерация QR...' : 'Сгенерировать QR-код'}
          </button>

          {qrCode && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-sm text-gray-600 mb-3">Попросите поставщика отсканировать QR-код в WeChat:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="QR Code" className="mx-auto w-48 h-48" />
            </div>
          )}
        </div>
      )}

      {/* Suppliers list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Поставщики не добавлены</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Имя</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Марки</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Сессия</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Истекает</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {s.brands.map((b) => (
                        <span key={b} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{b}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      {sessionIcon(s.session_status)}
                      <span>{sessionLabel(s.session_status)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {s.session_expires_at ? formatRelativeTime(s.session_expires_at) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {s.is_active ? 'Активен' : 'Отключен'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Template Tab
// ============================================================
const DEFAULT_SCHEMA = {
  fields: [
    { key: 'brand', label: 'Марка автомобиля', description: 'Марка автомобиля (Toyota, BMW, Mercedes и т.д.)', required: true, type: 'text' },
    { key: 'model', label: 'Модель', description: 'Модель автомобиля (Camry, X5, E-Class и т.д.)', required: true, type: 'text' },
    { key: 'year', label: 'Год выпуска', description: 'Год выпуска автомобиля', required: true, type: 'text' },
    { key: 'vin', label: 'VIN-номер', description: 'VIN-номер автомобиля (17 символов)', required: false, type: 'text' },
    { key: 'part', label: 'Запчасть', description: 'Название нужной запчасти', required: true, type: 'text' },
    { key: 'condition', label: 'Состояние', description: 'Новая или б/у запчасть', required: false, type: 'select', options: ['новая', 'б/у', 'любое'] },
    { key: 'budget', label: 'Бюджет', description: 'Максимальный бюджет в рублях', required: false, type: 'text' },
    { key: 'urgency', label: 'Срочность', description: 'Как срочно нужна запчасть', required: false, type: 'select', options: ['срочно', 'в течение недели', 'не срочно'] },
    { key: 'city', label: 'Город', description: 'Город доставки', required: false, type: 'text' },
    { key: 'notes', label: 'Дополнительно', description: 'Любые дополнительные сведения', required: false, type: 'text' },
  ],
};

function TemplateTab() {
  const [template, setTemplate] = useState<DbTemplate | null>(null);
  const [schemaText, setSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/admin/template')
      .then((r) => r.json())
      .then((json: { data: DbTemplate }) => {
        if (json.data?.schema) {
          setTemplate(json.data);
          setSchemaText(JSON.stringify(json.data.schema, null, 2));
        }
        // если Supabase недоступен или шаблона нет — остаётся дефолтный
      })
      .catch(() => { /* оставляем дефолтный шаблон */ });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const schema = JSON.parse(schemaText);
      const res = await fetch('/api/admin/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema }),
      });
      const json = await res.json() as { data: DbTemplate; error?: string };
      if (json.error) throw new Error(json.error);
      setTemplate(json.data);
      setSuccess(true);
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Шаблон заявки</h2>
          {template && (
            <p className="text-sm text-gray-500 mt-0.5">Версия {template.version} · {formatDateTime(template.created_at)}</p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">✅ Шаблон обновлён</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-3">JSON-схема шаблона заявки. Изменения автоматически обновят промпт для DeepSeek.</p>
        <textarea
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          rows={30}
          className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ============================================================
// API Keys Tab
// ============================================================
function ApiKeysTab() {
  const [deepseekKey, setDeepseekKey] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleSaveKey(service: 'deepseek', key: string) {
    setSaving(service);
    await fetch('/api/admin/keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, key }),
    });
    setSaving(null);
    setSaved(service);
    setTimeout(() => setSaved(null), 3000);
  }

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-gray-900">API-ключи</h2>
      <p className="text-sm text-gray-500">
        Ключи хранятся в зашифрованном виде в Supabase. Для продакшена рекомендуется использовать переменные окружения.
      </p>

      <div className="space-y-4">
        {/* DeepSeek */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">DeepSeek API</h3>
          <div className="flex gap-3">
            <input
              type="password"
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleSaveKey('deepseek', deepseekKey)}
              disabled={!deepseekKey || saving === 'deepseek'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving === 'deepseek' ? 'Сохранение...' : saved === 'deepseek' ? '✅ Сохранено' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* WeChat info */}
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
          <h3 className="font-medium text-gray-900 mb-2">WeChat (wechatbot SDK)</h3>
          <p className="text-sm text-gray-600">
            API-ключи для WeChat не нужны. Авторизация происходит через QR-код в разделе{' '}
            <strong>Поставщики → Добавить поставщика</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Сессии сохраняются локально в <code>~/.wechatbot/</code> и восстанавливаются при перезапуске.
          </p>
        </div>
      </div>
    </div>
  );
}
