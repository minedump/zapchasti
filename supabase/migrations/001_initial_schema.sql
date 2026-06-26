-- ============================================================
-- 001_initial_schema.sql
-- Initial database schema for Zapchasti App
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE,
  wechat_id VARCHAR(255) UNIQUE,
  username VARCHAR(255),
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'client'
    CHECK (role IN ('client', 'operator', 'admin', 'supplier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_read_all_users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "service_role_all" ON public.users
  USING (auth.role() = 'service_role');

-- ============================================================
-- CHATS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_type VARCHAR(50) NOT NULL CHECK (chat_type IN ('telegram', 'wechat')),
  external_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_type, external_id)
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_read_all_chats" ON public.chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "service_role_all_chats" ON public.chats
  USING (auth.role() = 'service_role');

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  deal_id UUID, -- FK added after deals table
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  content TEXT NOT NULL DEFAULT '',
  content_translated TEXT,
  media_url TEXT,
  media_type VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (media_type IN ('photo', 'document', 'video', 'none')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_read_all_messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "service_role_all_messages" ON public.messages
  USING (auth.role() = 'service_role');

CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_deal_id ON public.messages(deal_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- ============================================================
-- TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version INTEGER NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{}',
  prompt TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_templates" ON public.templates
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "service_role_all_templates" ON public.templates
  USING (auth.role() = 'service_role');

-- ============================================================
-- DEALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_number VARCHAR(50) NOT NULL UNIQUE,
  client_chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  supplier_chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'sent_to_supplier', 'waiting', 'answer_received', 'found', 'rejected', 'closed')),
  data JSONB NOT NULL DEFAULT '{}',
  template_version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(20) NOT NULL DEFAULT 'client'
    CHECK (created_by IN ('client', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_all_deals" ON public.deals
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "service_role_all_deals" ON public.deals
  USING (auth.role() = 'service_role');

CREATE INDEX idx_deals_status ON public.deals(status);
CREATE INDEX idx_deals_client_chat ON public.deals(client_chat_id);
CREATE INDEX idx_deals_supplier_chat ON public.deals(supplier_chat_id);
CREATE INDEX idx_deals_created_at ON public.deals(created_at DESC);

-- Add FK from messages to deals
ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_deal
  FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;

-- ============================================================
-- DEAL STATUS HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deal_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_read_history" ON public.deal_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "service_role_all_history" ON public.deal_status_history
  USING (auth.role() = 'service_role');

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  brands TEXT[] NOT NULL DEFAULT '{}',
  session_id VARCHAR(255),
  session_status VARCHAR(50) NOT NULL DEFAULT 'inactive'
    CHECK (session_status IN ('active', 'expiring', 'inactive')),
  session_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_suppliers" ON public.suppliers
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "operators_read_suppliers" ON public.suppliers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('operator', 'admin')
    )
  );

CREATE POLICY "service_role_all_suppliers" ON public.suppliers
  USING (auth.role() = 'service_role');

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service VARCHAR(50) NOT NULL CHECK (service IN ('deepseek', 'ilink')),
  key_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_api_keys" ON public.api_keys
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "service_role_all_api_keys" ON public.api_keys
  USING (auth.role() = 'service_role');

-- ============================================================
-- LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'warning', 'error', 'debug')),
  source VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_logs" ON public.logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "service_role_all_logs" ON public.logs
  USING (auth.role() = 'service_role');

CREATE INDEX idx_logs_created_at ON public.logs(created_at DESC);
CREATE INDEX idx_logs_level ON public.logs(level);

-- ============================================================
-- QUESTIONNAIRE STATE (for AI conversation tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.questionnaire_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  current_field VARCHAR(100),
  retry_count INTEGER NOT NULL DEFAULT 0,
  filled_data JSONB NOT NULL DEFAULT '{}',
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id)
);

ALTER TABLE public.questionnaire_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_qs" ON public.questionnaire_states
  USING (auth.role() = 'service_role');

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qs_updated_at
  BEFORE UPDATE ON public.questionnaire_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
