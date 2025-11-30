# Phase 1: Database Setup for Expanding Ring Architecture

## Overview
This phase sets up the PostgreSQL schema in Supabase for the Bible graph database.

## Step 1: Run SQL Migration in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `migrations/001_create_bible_schema.sql`
5. Click **Run** to execute

This will create:
- `verses` table (~31k rows)
- `cross_references` table (~343k rows)
- Indexes for fast graph traversal
- Helper functions for verse lookups

## Step 2: Import Bible Data

Once the schema is created, run the import script:

```bash
cd apps/api
npx ts-node scripts/importBibleToSupabase.ts
```

This script will:
1. Load KJV text from `data/kjv.json` (31,102 verses)
2. Load cross-references from `src/bible/crossReferencesData.json` (343k references)
3. Insert all verses into Supabase with sequential IDs
4. Insert cross-reference edges as graph connections
5. Run a test query to verify John 3:16

**Expected runtime:** 3-5 minutes total

## Step 3: Verify Installation

The import script will automatically test the installation. You should see:

```
✓ Inserted all 31102 verses
✓ Inserted all ~343000 cross-reference edges
[TEST] Querying John 3:16...
✓ Found: { id: 26137, book_abbrev: 'jn', book_name: 'John', chapter: 3, verse: 16, text: '...' }
```

## Troubleshooting

### Missing Supabase Credentials
If you see `Missing Supabase credentials`, ensure your `.env` file contains:
```
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key  # For admin operations
```

### Import Fails Midway
The script clears existing data before inserting. If it fails, you can re-run it safely.

### Slow Insert Performance
Supabase free tier may be slower. Expected times:
- Verses: 1-2 minutes
- Cross-references: 2-3 minutes

## Next Steps

Once Phase 1 is complete, we'll implement:
- **Phase 2**: Budgeted BFS graph walker (`buildContextBundle`)
- **Phase 3**: Structured Ring prompting
- **Phase 4**: Anchor resolution with regex

## Schema Details

### Verses Table
```sql
id              SERIAL PRIMARY KEY  -- Sequential ID for range queries
book_abbrev     VARCHAR(10)         -- "gn", "ex", "jn"
book_name       VARCHAR(50)         -- "Genesis", "Exodus", "John"
chapter         INT
verse           INT
text            TEXT                -- KJV verse text
```

### Cross-References Table
```sql
id              SERIAL PRIMARY KEY
from_verse_id   INT REFERENCES verses(id)  -- Source verse
to_verse_id     INT REFERENCES verses(id)  -- Target verse
```

### Key Indexes
- `idx_verses_ref`: Fast lookup by (book_abbrev, chapter, verse)
- `idx_xref_from`: Graph traversal from source verse
- `idx_xref_to`: Reverse lookups (what points to this verse)
