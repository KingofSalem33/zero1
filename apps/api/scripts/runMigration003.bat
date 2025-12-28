@echo off
echo Running migration 003: Add edge type tables...
echo.

set SUPABASE_URL=https://ciuxquemfnbruvvzbfth.supabase.co
set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdXhxdWVtZm5icnV2dnpiZnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTA2MDcsImV4cCI6MjA3NDc2NjYwN30.LePFhqBk-aVFajEF6yQAyXsZyOaBkF-7PMpaHTmgMbY

npx tsx scripts/runMigration003.ts

echo.
echo Migration complete!
pause
