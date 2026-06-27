// ============================================================
// Core Types
// ============================================================

export type UserRole = 'client' | 'operator' | 'admin' | 'supplier';
export type ChatType = 'telegram' | 'wechat';
export type MessageDirection = 'incoming' | 'outgoing';
export type MediaType = 'photo' | 'document' | 'video' | 'none';
export type DealStatus =
  | 'new'
  | 'sent_to_supplier'
  | 'waiting'
  | 'answer_received'
  | 'found'
  | 'rejected'
  | 'closed';
export interface DbUser {
  id: string;
  telegram_id: number | null;
  wechat_id: string | null;
  username: string | null;
  display_name: string | null;
  role: 'client' | 'operator' | 'admin' | 'supplier';
  created_at: string;
  updated_at: string;
}

export type SessionStatus = 'active' | 'expiring' | 'inactive' | 'pending_qr' | 'scanned' | 'error' | 'online' | 'offline';

export interface DbSupplier {
  id: string;
  user_id: string | null;
  chat_id: string | null;
  name: string;
  brands: string[];
  session_id: string | null;
  session_status: SessionStatus;
  session_expires_at: string | null;
  qr_url: string | null;
  wechat_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbChat {
  id: string;
  chat_type: ChatType;
  external_id: string;
  user_id: string;
  last_message_at: string | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
  // joined
  user?: DbUser;
}

export interface DbMessage {
  id: string;
  chat_id: string;
  deal_id: string | null;
  sender_id: string | null;
  direction: MessageDirection;
  content: string;
  content_translated: string | null;
  media_url: string | null;
  media_type: MediaType;
  is_read: boolean;
  created_at: string;
  // joined
  sender?: DbUser;
}

export interface DealData {
  brand: string | null;
  model: string | null;
  year: string | null;
  vin: string | null;
  part: string | null;
  budget: string | null;
  urgency: string | null;
  condition: string | null;
  city: string | null;
  notes: string | null;
  [key: string]: string | null;
}

export interface DbDeal {
  id: string;
  deal_number: string;
  client_chat_id: string | null;
  supplier_chat_id: string | null;
  status: DealStatus;
  data: DealData;
  template_version: number;
  created_by: 'client' | 'operator';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  // joined
  client_chat?: DbChat;
  supplier_chat?: DbChat;
}

export interface DbDealStatusHistory {
  id: string;
  deal_id: string;
  old_status: DealStatus | null;
  new_status: DealStatus;
  changed_by: string | null;
  comment: string | null;
  created_at: string;
  // joined
  changed_by_user?: DbUser;
}

export interface DbSupplier {
  id: string;
  name: string;
  contact_info: string | null;
  user_id: string | null;
  wechat_user_id: string | null;
  qr_url: string | null;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface TemplateField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  type: 'text' | 'number' | 'select';
  options?: string[];
}

export interface DbTemplate {
  id: string;
  version: number;
  schema: { fields: TemplateField[] };
  prompt: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export type ApiService = 'telegram' | 'wechat' | 'openai' | 'other';

export interface DbApiKey {
  id: string;
  service: ApiService;
  key_encrypted: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface DbLog {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// Telegram Types
// ============================================================

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  caption?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

// ============================================================
// iLink / WeChat Types
// ============================================================

export interface ILinkWebhookPayload {
  event: string;
  from: string;
  to: string;
  message: string;
  message_type: 'text' | 'image' | 'file';
  media_url?: string;
  timestamp: number;
  session_id: string;
}

export interface ILinkQRResponse {
  qr_code: string;
  session_id: string;
  expires_at: string;
}

// ============================================================
// DeepSeek / AI Types
// ============================================================

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QuestionnaireState {
  chat_id: string;
  deal_id: string | null;
  messages: ConversationMessage[];
  current_field: string | null;
  retry_count: number;
  filled_data: Partial<DealData>;
  is_complete: boolean;
}

// ============================================================
// UI / Filter Types
// ============================================================

export type ChatFilter = 'all' | 'telegram' | 'wechat' | 'with_deals' | 'unread';

export type DealFilter = {
  status?: DealStatus;
  supplier?: string;
  client?: string;
  dateFrom?: string;
  dateTo?: string;
  brand?: string;
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  new: 'Новая',
  sent_to_supplier: 'Отправлено поставщику',
  waiting: 'Ожидание',
  answer_received: 'Получен ответ',
  found: 'Найдена',
  rejected: 'Отказ',
  closed: 'Закрыта',
};

export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  sent_to_supplier: 'bg-yellow-100 text-yellow-800',
  waiting: 'bg-orange-100 text-orange-800',
  answer_received: 'bg-purple-100 text-purple-800',
  found: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-800',
};
