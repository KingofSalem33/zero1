/**
 * Jest test setup
 *
 * Runs before each test file
 */

import "reflect-metadata";

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.OPENAI_MODEL = "gpt-4o";
process.env.PORT = "3001";
process.env.ENABLE_RATE_LIMITING = "false";
process.env.ENABLE_AUTH = "false";
