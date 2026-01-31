# Database Migration Guide

## Issue Fixed
The `page_count` column was missing from the `print_jobs` table, causing insert errors.

## Solution
The code now gracefully handles missing `page_count` column, but you should run the migration for full functionality.

## Run Migration

### Option 1: Using Supabase CLI (Recommended)
```bash
cd one-time-print
npx supabase migration up
```

### Option 2: Manual SQL Execution
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run this SQL:

```sql
-- Add page_count column to print_jobs table
ALTER TABLE public.print_jobs
ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1;

-- Add comment
COMMENT ON COLUMN public.print_jobs.page_count IS 'Number of pages in the document (1 for images, actual count for PDFs)';
```

## Verification
After running the migration, verify it worked:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'print_jobs' AND column_name = 'page_count';
```

You should see `page_count` with type `integer`.

## Note
The application will work without this column (it will default to 1 page), but page count detection for PDFs won't be stored in the database.

