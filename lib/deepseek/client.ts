import OpenAI from 'openai';
import type { ConversationMessage, DealData, TemplateField } from '@/lib/types';

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  });
}

// Build system prompt from template fields
export function buildQuestionnairePrompt(fields: TemplateField[]): string {
  const fieldDescriptions = fields
    .map(
      (f) =>
        `- ${f.key} (${f.label}): ${f.description}${
          f.required ? ' [ОБЯЗАТЕЛЬНОЕ]' : ' [необязательное]'
        }${f.options ? `. Варианты: ${f.options.join(', ')}` : ''}`
    )
    .join('\n');

  return `Ты — помощник по подбору автозапчастей. Твоя задача — собрать информацию о нужной запчасти у клиента.

Поля для заполнения:
${fieldDescriptions}

Правила:
1. Задавай по ОДНОМУ вопросу за раз, дожидайся ответа.
2. Начни с самого важного поля (марка автомобиля).
3. Если клиент не может ответить на вопрос — переспроси максимум 2 раза, затем пропусти поле.
4. Когда все поля заполнены (или пропущены) — выведи JSON с данными в формате:
<DEAL_JSON>
{"brand": "...", "model": "...", ...}
</DEAL_JSON>
5. Общайся на русском языке, дружелюбно и кратко.
6. Не задавай несколько вопросов сразу.
7. Если клиент сразу дал много информации — извлеки её и уточни только недостающее.`;
}

// Run questionnaire step
export async function runQuestionnaireStep(
  messages: ConversationMessage[],
  userMessage: string
): Promise<{ reply: string; dealJson: DealData | null }> {
  const client = getClient();

  const updatedMessages: ConversationMessage[] = [
    ...messages,
    { role: 'user', content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: updatedMessages,
    temperature: 0.3,
    max_tokens: 1000,
  });

  const reply = response.choices[0]?.message?.content || '';

  // Extract JSON if present
  const jsonMatch = reply.match(/<DEAL_JSON>([\s\S]*?)<\/DEAL_JSON>/);
  let dealJson: DealData | null = null;

  if (jsonMatch) {
    try {
      dealJson = JSON.parse(jsonMatch[1].trim()) as DealData;
    } catch {
      dealJson = null;
    }
  }

  return { reply, dealJson };
}

// Translate deal data to English for supplier
export async function translateDealToEnglish(
  dealData: DealData,
  fields: TemplateField[]
): Promise<string> {
  const client = getClient();

  const fieldLines = fields
    .filter((f) => dealData[f.key] !== null && dealData[f.key] !== undefined)
    .map((f) => `${f.label}: ${dealData[f.key]}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content:
          'You are a translator for an auto parts business. Translate the following car parts request from Russian to clear, professional English. Keep all technical terms accurate.',
      },
      {
        role: 'user',
        content: `Please translate this auto parts request to English:\n\n${fieldLines}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || fieldLines;
}

// Translate supplier response to Russian
export async function translateToRussian(text: string): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content:
          'Ты — переводчик для бизнеса по продаже автозапчастей. Переводи сообщения от поставщиков (китайский или английский) на русский язык. Сохраняй технические термины точно.',
      },
      {
        role: 'user',
        content: `Переведи на русский:\n\n${text}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  return response.choices[0]?.message?.content || text;
}
