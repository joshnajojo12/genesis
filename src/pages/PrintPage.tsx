import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Printer, Clock, Lock, Check, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PrintJobInfo {
  id: string;
  file_name: string;
  copies: number;
  color_mode: 'color' | 'bw';
  paper_size: string;
  orientation: string;
  status: 'pending' | 'printed' | 'expired' | 'locked';
  expires_at: string;
  otp_attempts: number;
  max_otp_attempts: number;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Ready to Print',
    icon: Printer,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  printed: {
    label: 'Already Printed',
    icon: Check,
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  locked: {
    label: 'Locked',
    icon: Lock,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
};

export default function PrintPage() {
  const { token } = useParams<{ token: string }>();
  const [job, setJob] = useState<PrintJobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  useEffect(() => {
    fetchJob();
  }, [token]);

  const fetchJob = async () => {
    if (!token) {
      setError('Invalid print link');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('print_jobs')
        .select('id, file_name, copies, color_mode, paper_size, orientation, status, expires_at, otp_attempts, max_otp_attempts')
        .eq('access_token', token)
        .single();

      if (fetchError || !data) {
        setError('Print job not found or link has expired');
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date() && data.status === 'pending') {
        setError('This print job has expired');
        return;
      }

      setJob(data as PrintJobInfo);
    } catch (err) {
      console.error('Error fetching job:', err);
      setError('Failed to load print job');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndPrint = async () => {
    if (!job || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setVerifying(true);

    try {
      const { data, error: verifyError } = await supabase.rpc('verify_otp', {
        job_id: job.id,
        provided_otp: otp,
      });

      if (verifyError) throw verifyError;

      const result = data as { success: boolean; error?: string; attempts_remaining?: number; file_path?: string };

      if (!result.success) {
        toast.error(result.error || 'Verification failed');
        
        if (result.error?.includes('locked') || result.error?.includes('Too many')) {
          setJob(prev => prev ? { ...prev, status: 'locked' } : null);
        } else if (result.attempts_remaining !== undefined) {
          setJob(prev => prev ? { ...prev, otp_attempts: prev.otp_attempts + 1 } : null);
          toast.warning(`${result.attempts_remaining} attempts remaining`);
        } else {
          // Status changed (printed, expired, etc.)
          await fetchJob();
        }
        return;
      }

      // Success! Trigger print
      setPrinting(true);
      toast.success('OTP verified! Preparing print...');
      
      // Call edge function to get print stream
      await triggerPrint(result.file_path!, job.copies, job.color_mode, job.paper_size, job.orientation);
      
      setPrintSuccess(true);
      setJob(prev => prev ? { ...prev, status: 'printed' } : null);
      
    } catch (err) {
      console.error('Verification error:', err);
      toast.error('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
      setPrinting(false);
    }
  };

  const triggerPrint = async (
    filePath: string,
    copies: number,
    colorMode: string,
    paperSize: string,
    orientation: string
  ) => {
    try {
      // Call edge function to get the print-ready stream
      const response = await supabase.functions.invoke('print-stream', {
        body: {
          filePath,
          copies,
          colorMode,
          paperSize,
          orientation,
          jobId: job?.id,
        },
      });

      if (response.error) throw response.error;

      // The response should contain the print-ready HTML/image
      const printContent = response.data;
      
      // Create hidden iframe and trigger print
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(printContent.html);
        frameDoc.close();

        // Wait for content to load, then print
        printFrame.onload = () => {
          setTimeout(() => {
            printFrame.contentWindow?.print();
            // Clean up after print dialog
            setTimeout(() => {
              document.body.removeChild(printFrame);
            }, 1000);
          }, 500);
        };
      }
    } catch (err) {
      console.error('Print error:', err);
      toast.error('Failed to initiate print. Please contact support.');
    }
  };

  const timeRemaining = () => {
    if (!job) return '';
    const expires = new Date(job.expires_at);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} minutes remaining`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading print job...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card rounded-xl border p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Unable to Load</h1>
          <p className="text-muted-foreground">{error || 'Print job not found'}</p>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[job.status];
  const StatusIcon = statusConfig.icon;
  const canPrint = job.status === 'pending';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Printer className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">SecurePrint</h1>
              <p className="text-xs text-muted-foreground">Print Verification</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Shield className="w-4 h-4" />
            <span>Protected Print</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-lg">
        <div className="bg-card rounded-xl border overflow-hidden">
          {/* Status Banner */}
          <div className={cn("p-4 flex items-center justify-center gap-2", statusConfig.bgColor)}>
            <StatusIcon className={cn("w-5 h-5", statusConfig.color)} />
            <span className={cn("font-medium", statusConfig.color)}>{statusConfig.label}</span>
          </div>

          <div className="p-6 space-y-6">
            {/* File Info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                <FileText className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-lg truncate">{job.file_name}</h2>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="secondary">{job.copies} {job.copies === 1 ? 'copy' : 'copies'}</Badge>
                  <Badge variant="secondary">{job.color_mode === 'color' ? 'Color' : 'B&W'}</Badge>
                  <Badge variant="secondary">{job.paper_size}</Badge>
                  <Badge variant="secondary">{job.orientation}</Badge>
                </div>
              </div>
            </div>

            {/* Time Remaining */}
            {canPrint && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>{timeRemaining()}</span>
              </div>
            )}

            {/* OTP Input & Print Button */}
            {canPrint && !printSuccess && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-base font-medium">
                    Enter OTP to Print
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-2xl tracking-widest font-mono h-14"
                    disabled={verifying || printing}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {job.max_otp_attempts - job.otp_attempts} attempts remaining
                  </p>
                </div>

                <Button
                  size="lg"
                  className="w-full h-14 text-lg"
                  onClick={handleVerifyAndPrint}
                  disabled={otp.length !== 6 || verifying || printing}
                >
                  {verifying ? (
                    <>
                      <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : printing ? (
                    <>
                      <Printer className="w-5 h-5 mr-2 animate-pulse" />
                      Preparing Print...
                    </>
                  ) : (
                    <>
                      <Printer className="w-5 h-5 mr-2" />
                      Verify & Print
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Success State */}
            {printSuccess && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-lg font-semibold text-success mb-2">Print Triggered Successfully!</h3>
                <p className="text-muted-foreground text-sm">
                  The print dialog should appear. This link is now permanently invalid.
                </p>
              </div>
            )}

            {/* Already Printed */}
            {job.status === 'printed' && !printSuccess && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Already Printed</h3>
                <p className="text-muted-foreground text-sm">
                  This document has already been printed. Each print job can only be used once.
                </p>
              </div>
            )}

            {/* Locked State */}
            {job.status === 'locked' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-destructive mb-2">Access Locked</h3>
                <p className="text-muted-foreground text-sm">
                  Too many incorrect OTP attempts. This print job has been permanently locked for security.
                </p>
              </div>
            )}

            {/* Expired State */}
            {job.status === 'expired' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-destructive mb-2">Print Job Expired</h3>
                <p className="text-muted-foreground text-sm">
                  This print job has expired. Please request a new print link from the document owner.
                </p>
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="border-t p-4 bg-muted/30">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                This is a secure one-time print. The document cannot be downloaded, previewed, or saved. 
                Print output includes watermarks for security tracking.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
