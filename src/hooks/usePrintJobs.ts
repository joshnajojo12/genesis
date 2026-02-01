import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, generateOTP } from '@/lib/session';
import type { PrintJob, PrintSettings } from '@/types/printJob';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';

export function usePrintJobs() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  const { user } = useAuth();
  const sessionId = user ? user.id : getSessionId();

  const fetchJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Type assertion since our DB types may not be fully generated
      setJobs((data || []) as unknown as PrintJob[]);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      toast.error('Failed to load print jobs');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchJobs();
    
    // Check for expired jobs every minute
    const interval = setInterval(() => {
      setJobs(prev => prev.map(job => {
        if (job.status === 'pending' && new Date(job.expires_at) < new Date()) {
          return { ...job, status: 'expired' as const };
        }
        return job;
      }));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const createJob = async (file: File, settings: PrintSettings): Promise<PrintJob | null> => {
    setCreating(true);
    
    try {
      // Generate OTP
      const otp = generateOTP();
      
      // Use server-side hashing to ensure consistency and avoid crypto.subtle issues in non-secure contexts
      const { data: otpHash, error: hashError } = await supabase.rpc('hash_otp', { otp_value: otp });
      
      if (hashError || !otpHash) {
        throw new Error('Failed to generate secure OTP hash');
      }
      
      // Upload file
      const fileExt = file.name.split('.').pop();
      const filePath = `${sessionId}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('print-files')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Create job record
      const { data, error } = await supabase
        .from('print_jobs')
        .insert({
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          copies: settings.copies,
          color_mode: settings.colorMode,
          paper_size: settings.paperSize,
          orientation: settings.orientation,
          otp_hash: otpHash,
          otp_plain: otp,
          session_id: sessionId,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newJob = data as unknown as PrintJob;
      setJobs(prev => [newJob, ...prev]);
      toast.success('Print job created successfully!');
      
      return newJob;
    } catch (err) {
      console.error('Error creating job:', err);
      toast.error('Failed to create print job');
      return null;
    } finally {
      setCreating(false);
    }
  };

  const clearJobs = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('print_jobs')
        .delete()
        .eq('session_id', sessionId);
      
      if (error) throw error;
      
      setJobs([]);
    } catch (err) {
      console.error('Error clearing jobs:', err);
      toast.error('Failed to clear history');
    }
  }, [sessionId]);

  return {
    jobs,
    loading,
    creating,
    createJob,
    refreshJobs: fetchJobs,
    clearJobs,
  };
}
