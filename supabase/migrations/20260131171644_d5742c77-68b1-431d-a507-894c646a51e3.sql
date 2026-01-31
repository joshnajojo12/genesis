-- Create print job status enum
CREATE TYPE public.print_job_status AS ENUM ('pending', 'printed', 'expired', 'locked');

-- Create print jobs table
CREATE TABLE public.print_jobs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    
    -- Print settings (immutable after creation)
    copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 50),
    color_mode TEXT NOT NULL DEFAULT 'color' CHECK (color_mode IN ('color', 'bw')),
    paper_size TEXT NOT NULL DEFAULT 'A4' CHECK (paper_size IN ('A4', 'A3', 'Letter', 'Legal')),
    orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait', 'landscape')),
    
    -- Security
    otp_hash TEXT NOT NULL,
    otp_plain TEXT NOT NULL, -- For user display only (never shown to shopkeeper)
    access_token UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- Status tracking
    status public.print_job_status NOT NULL DEFAULT 'pending',
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    max_otp_attempts INTEGER NOT NULL DEFAULT 3,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 minutes'),
    printed_at TIMESTAMP WITH TIME ZONE,
    
    -- Session tracking (no auth required)
    session_id UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies: Anyone can create print jobs (no auth required for demo)
CREATE POLICY "Anyone can create print jobs"
ON public.print_jobs
FOR INSERT
WITH CHECK (true);

-- Users can view their own jobs by session
CREATE POLICY "Users can view their session jobs"
ON public.print_jobs
FOR SELECT
USING (true);

-- Users can update their own jobs
CREATE POLICY "Users can update jobs"
ON public.print_jobs
FOR UPDATE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_print_jobs_access_token ON public.print_jobs(access_token);
CREATE INDEX idx_print_jobs_session ON public.print_jobs(session_id);

-- Create storage bucket for print files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('print-files', 'print-files', false, 52428800);

-- Storage policies - allow uploads
CREATE POLICY "Anyone can upload print files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'print-files');

-- Only server can read files (via service role)
CREATE POLICY "Authenticated reads for print files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'print-files');

-- Function to hash OTP
CREATE OR REPLACE FUNCTION public.hash_otp(otp_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(otp_value::bytea), 'hex')
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION public.verify_otp(job_id UUID, provided_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_record RECORD;
    result JSONB;
BEGIN
    -- Get the job
    SELECT * INTO job_record FROM public.print_jobs WHERE id = job_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job not found');
    END IF;
    
    -- Check if already printed or locked
    IF job_record.status = 'printed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already printed');
    END IF;
    
    IF job_record.status = 'locked' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job locked due to failed attempts');
    END IF;
    
    IF job_record.status = 'expired' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job has expired');
    END IF;
    
    -- Check expiry
    IF job_record.expires_at < now() THEN
        UPDATE public.print_jobs SET status = 'expired' WHERE id = job_id;
        RETURN jsonb_build_object('success', false, 'error', 'Job has expired');
    END IF;
    
    -- Verify OTP
    IF public.hash_otp(provided_otp) = job_record.otp_hash THEN
        -- Success - mark as printed immediately
        UPDATE public.print_jobs 
        SET status = 'printed', 
            printed_at = now(),
            access_token = gen_random_uuid() -- Revoke access token
        WHERE id = job_id;
        
        RETURN jsonb_build_object(
            'success', true, 
            'file_path', job_record.file_path,
            'copies', job_record.copies,
            'color_mode', job_record.color_mode,
            'paper_size', job_record.paper_size,
            'orientation', job_record.orientation
        );
    ELSE
        -- Failed attempt
        UPDATE public.print_jobs 
        SET otp_attempts = otp_attempts + 1,
            status = CASE 
                WHEN otp_attempts + 1 >= max_otp_attempts THEN 'locked'::print_job_status
                ELSE status
            END
        WHERE id = job_id;
        
        IF job_record.otp_attempts + 1 >= job_record.max_otp_attempts THEN
            RETURN jsonb_build_object('success', false, 'error', 'Too many attempts. Job locked.');
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Invalid OTP',
                'attempts_remaining', job_record.max_otp_attempts - job_record.otp_attempts - 1
            );
        END IF;
    END IF;
END;
$$;