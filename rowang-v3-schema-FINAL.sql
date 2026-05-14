-- ============================================================
-- rowang.id — Final Database Schema v3
-- Supabase project: rowang.id (xbaiomfbqsqmmmbxvdrk)
-- Region: ap-northeast-1 (Tokyo)
-- Owner: pt.globaloperasiminers@gmail.com
--
-- HOW TO RUN:
-- Supabase Dashboard → SQL Editor → paste everything → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS registered_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  is_registered BOOLEAN DEFAULT false,
  plan TEXT DEFAULT 'free',
  clone_status TEXT DEFAULT 'building',
  clone_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persona (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, field_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  source TEXT DEFAULT 'manual',
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_seconds INTEGER,
  transcript TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('yes','no')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS confidence_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_name TEXT,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('photo','video')),
  url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE registered_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;

-- Open policies (auth handled in app via service_role key)
DO $$ BEGIN CREATE POLICY "open" ON registered_emails FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON users FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON persona FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON memories FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON voice_recordings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON interview_sessions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON calibration FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON confidence_log FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON chat_sessions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "open" ON media_uploads FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- REGISTERED USERS — only these emails can log in
-- ============================================================
INSERT INTO registered_emails (email, name)
VALUES ('pt.globaloperasiminers@gmail.com', 'Julius Martono Sugiharto')
ON CONFLICT (email) DO NOTHING;

INSERT INTO registered_emails (email, name)
VALUES ('mediakomindo@gmail.com', 'Julius Martono Sugiharto')
ON CONFLICT (email) DO NOTHING;

-- To add more users:
-- INSERT INTO registered_emails (email, name) VALUES ('email@gmail.com', 'Name') ON CONFLICT (email) DO NOTHING;
