'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function NewDealPage() {
  const router = useRouter();
  const [data, setData] = useState({
    brand: '', model: '', year: '', vin: '',
    part: '', condition: '', budget: '', urgency: '', city: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const json = await res.json() as { data: { id: string } };
    router.push(`/deals/${json.data.id}`);
  }

  const fields = [
    { key: 'brand', label: 'Марка', required: true },
    { key: 'model', label: 'Модель', required: true },
    { key: 'year', label: 'Год выпуска', required: true },
    { key: 'vin', label: 'VIN-номер', required: false },
    { key: 'part', label: 'Запчасть', required: true },
    { key: 'condition', label: 'Состояние (новая/б/у)', required: false },
    { key: 'budget', label: 'Бюджет (руб.)', required: false },
    { key: 'urgency', label: 'Срочность', required: false },
    { key: 'city', label: 'Город', required: false },
    { key: 'notes', label: 'Примечания', required: false },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-gray-900">Новая сделка</h1>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="text"
                  value={(data as Record<string, string>)[f.key]}
                  onChange={(e) => setData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleCreate}
            disabled={!data.brand || !data.part || saving}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Создание...' : 'Создать сделку'}
          </button>
        </div>
      </div>
    </div>
  );
}
