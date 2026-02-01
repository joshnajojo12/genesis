
-- Update storage policies to allow public access to print-files
-- This is necessary for the fallback mechanism (client-side download) when the Edge Function is unavailable.
-- Security is maintained by unguessable filenames (UUIDs) which are only revealed after OTP verification.

DROP POLICY IF EXISTS "Authenticated reads for print files" ON storage.objects;

CREATE POLICY "Allow public read access"
ON storage.objects
FOR SELECT
USING (bucket_id = 'print-files');
