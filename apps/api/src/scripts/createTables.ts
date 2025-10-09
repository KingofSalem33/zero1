import { supabase } from "../db";

async function createTables() {
  console.log("Creating threads and messages tables...");

  try {
    // Create threads table
    const { error: threadsError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS threads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID,
          title TEXT,
          context JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_threads_project_id ON threads(project_id);
        CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC);

        ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow all on threads" ON threads;
        CREATE POLICY "Allow all on threads" ON threads FOR ALL USING (true);
      `,
    });

    if (threadsError) {
      console.error("Error creating threads table:", threadsError);
    } else {
      console.log("✅ Threads table created");
    }

    // Create messages table
    const { error: messagesError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          thread_id UUID NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(thread_id, created_at DESC);

        ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow all on messages" ON messages;
        CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true);
      `,
    });

    if (messagesError) {
      console.error("Error creating messages table:", messagesError);
    } else {
      console.log("✅ Messages table created");
    }

    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
  }
}

createTables();
