# Authentication & Authorization Setup

This project uses **Supabase Auth** for user authentication and authorization. All user data is isolated by `user_id` to ensure proper access control.

## Architecture Overview

### Backend (API)

- **Auth Middleware**: `apps/api/src/middleware/auth.ts`
  - `requireAuth`: Enforces authentication on protected routes
  - `optionalAuth`: Allows both authenticated and anonymous access
- **Protected Routes**: Projects, Threads, Artifacts, Checkpoints, Files, Memory
- **Public Routes**: Health check, Chat endpoints (with optional auth)

### Frontend (Web)

- **Auth Context**: `apps/web/src/contexts/AuthContext.tsx`
- **Auth Modal**: `apps/web/src/components/AuthModal.tsx` (Login/Signup UI)
- **Supabase Client**: `apps/web/src/lib/supabase.ts`

## Setup Instructions

### 1. Supabase Project Setup

1. Create a Supabase project at https://supabase.com
2. Enable Email Auth in **Authentication > Providers**
3. Copy your project credentials:
   - **Project URL**: `https://YOUR_PROJECT.supabase.co`
   - **Anon Key**: Found in **Settings > API > Project API keys**

### 2. Environment Variables

#### API (apps/api/.env)

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL_NAME=gpt-5-mini
PORT=3001
```

#### Web (apps/web/.env)

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_API_URL=http://localhost:3001
```

### 3. Database Schema

The existing Supabase tables already have `user_id` columns:

```sql
-- Projects table
ALTER TABLE projects
  ADD CONSTRAINT projects_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own projects
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);
```

Apply similar RLS policies to:

- `artifacts`
- `checkpoints`
- `threads` (if needed)

### 4. Testing Authentication

1. Start the API server:

   ```bash
   cd apps/api
   npm run dev
   ```

2. Start the web app:

   ```bash
   cd apps/web
   npm run dev
   ```

3. Open http://localhost:5173
4. Click "Sign Up" to create an account
5. Check your email for verification link
6. Sign in and verify protected routes work

## Authentication Flow

### Sign Up

1. User enters email/password in `AuthModal`
2. Frontend calls `supabase.auth.signUp()`
3. Supabase sends verification email
4. User clicks verification link
5. Account is activated

### Sign In

1. User enters credentials in `AuthModal`
2. Frontend calls `supabase.auth.signInWithPassword()`
3. Supabase returns JWT access token
4. Token stored in browser (localStorage via Supabase client)
5. Token automatically included in API requests via `Authorization: Bearer {token}` header

### API Request Flow

1. Frontend makes API request with `Authorization: Bearer {token}` header
2. API middleware (`requireAuth`) extracts token
3. Middleware calls `supabase.auth.getUser(token)` to verify
4. If valid, `req.userId` and `req.user` are populated
5. Route handler can access authenticated user info

## Migration from Fake User IDs

### Current State

- App.tsx generates fake user IDs: `user_${Date.now()}_${random}`
- Stored in localStorage as `zero1_userId`

### Migration Strategy

1. **Backward Compatibility**: Keep existing fake user ID system temporarily
2. **Gradual Rollout**: Auth is implemented but NOT enforced yet
3. **Next Steps**:
   - Remove fake userId generation from App.tsx
   - Replace with `useAuth().user?.id`
   - Update API calls to include `Authorization` header
   - Enforce RLS policies in Supabase

## Security Best Practices

✅ **Implemented**:

- JWT token validation on every protected API request
- Tokens automatically refresh via Supabase client
- Secure password hashing handled by Supabase
- HTTPS enforced for token transmission (in production)

🔒 **Additional Recommendations**:

- Enable Row Level Security (RLS) on all user data tables
- Use service role key only in backend, never expose to frontend
- Set up email rate limiting in Supabase dashboard
- Configure password strength requirements
- Enable Multi-Factor Authentication (MFA) for sensitive operations

## Troubleshooting

### "Unauthorized" errors

- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
- Verify token is being sent in `Authorization` header
- Check Supabase dashboard for auth errors

### Token expired errors

- Supabase tokens automatically refresh if `autoRefreshToken: true`
- Check browser console for refresh errors
- Sign out and sign in again

### RLS blocking queries

- Verify RLS policies match your `user_id` column structure
- Check that `auth.uid()` returns the correct user ID
- Temporarily disable RLS to test (NOT in production)

## Next Steps

1. ✅ Auth middleware created
2. ✅ Auth context implemented
3. ✅ Login/Signup UI added
4. ✅ Protected routes configured
5. 🔲 Enable RLS policies in Supabase
6. 🔲 Update frontend to use real user sessions
7. 🔲 Remove fake userId generation
8. 🔲 Add user profile management
9. 🔲 Implement password reset flow
10. 🔲 Add social auth providers (Google, GitHub)
