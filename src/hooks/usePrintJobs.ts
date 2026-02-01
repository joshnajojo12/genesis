import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, generateOTP, hashOTP } from '@/lib/session';
import type { PrintJob, PrintSettings } from '@/types/printJob';
import { toast } from 'sonner';
import { User } from '@supabase/supabase-js';

const SESSION_KEY = 'print_session_id';

export function usePrintJobs() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  
  // Initialize session ID from local storage or create new one
  const [sessionId, setSessionId] = useState<string>(getSessionId());

  // Handle Authentication and Session Merging
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        handleUserLogin(session.user.id);
      }
      setAuthLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await handleUserLogin(session.user.id);
      } else {
        setUser(null);
        // If logging out, we might want to reset to a new anonymous session
        // or keep the old one? Usually reset.
        // But for now, let's just ensure we have A session.
        const newAnonId = crypto.randomUUID();
        localStorage.setItem(SESSION_KEY, newAnonId);
        setSessionId(newAnonId);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUserLogin = async (userId: string) => {
    const currentLocalSession = localStorage.getItem(SESSION_KEY);
    
    // If we have an anonymous session and it's different from the user ID
    if (currentLocalSession && currentLocalSession !== userId) {
      // Merge logic: Update existing jobs from anonymous session to user ID
      try {
        const { error } = await supabase
          .from('print_jobs')
          .update({ session_id: userId })
          .eq('session_id', currentLocalSession);

        if (error) {
          console.error('Error merging sessions:', error);
        } else {
          // If successful, or even if not, we switch to user ID
          console.log('Merged anonymous session jobs to user account');
        }
      } catch (err) {
        console.error('Error in merge process:', err);
      }
    }
    
    // Set the session to the user ID
    localStorage.setItem(SESSION_KEY, userId);
    setSessionId(userId);
  };

  const fetchJobs = useCallback(async () => {
    if (!sessionId) return;

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
      const otpHash = await hashOTP(otp);
      
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
    user,
    authLoading,
  };
}
