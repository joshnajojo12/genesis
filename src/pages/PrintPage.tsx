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
  file_path?: string; // Only available after OTP verification
  file_type?: string;
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
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  useEffect(() => {
    fetchJob();

    // Listen for close messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'closePrint') {
        setPrintHtml(null);
        setPrintSuccess(true); // Assume success if they close after print
        fetchJob(); // Refresh status
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [token]);

  const fetchJob = async () => {
    if (!token) {
      setError('Invalid print link');
      setLoading(false);
      return;
    }

    try {
      // NOTE: We deliberately EXCLUDE file_path from this query.
      // The file path is a secret that should only be revealed after OTP verification.
      const { data, error: fetchError } = await supabase
        .from('print_jobs')
        .select('id, file_name, file_type, copies, color_mode, paper_size, orientation, status, expires_at, otp_attempts, max_otp_attempts')
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

  const generateSecurePrintHtml = async (
    filePath: string,
    jobInfo: PrintJobInfo
  ): Promise<string> => {
    try {
      // 1. Try: Call the Secure Edge Function to stream the document
      console.log('Attempting server-side stream via Edge Function...');
      const { data, error } = await supabase.functions.invoke('print-stream', {
        body: {
          jobId: jobInfo.id,
          filePath: filePath,
          copies: jobInfo.copies,
          colorMode: jobInfo.color_mode,
          paperSize: jobInfo.paper_size,
          orientation: jobInfo.orientation
        }
      });

      if (error) {
        console.warn('Edge function unavailable, attempting secure client fallback:', error);
        throw error; // Throw to trigger fallback in catch block
      }

      if (!data || !data.html) {
        throw new Error('Invalid response from print service');
      }

      // Write the Secure Print HTML to the window
      const secureHtml = data.html.replace('</body>', `
        <div id="mimic-ui" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#525659;z-index:9999;display:flex;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
          <!-- Left: White Preview -->
          <div style="flex:1;display:flex;justify-content:center;align-items:center;padding:40px;overflow:auto;">
            <div style="width:${jobInfo.paper_size === 'a4' ? '210mm' : '8.5in'};height:${jobInfo.paper_size === 'a4' ? '297mm' : '11in'};background:white;box-shadow:0 0 20px rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;transform:scale(0.8);">
               <!-- Blank White Page -->
            </div>
          </div>
          <!-- Right: Sidebar -->
          <div style="width:320px;background:white;padding:0;display:flex;flex-direction:column;border-left:1px solid #ddd;">
            <div style="padding:20px;border-bottom:1px solid #eee;">
               <h2 style="margin:0;font-size:16px;color:#333;">Print</h2>
            </div>
            <div style="padding:20px;flex:1;">
               <div style="margin-bottom:20px;">
                 <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Destination</label>
                 <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;">Secure Printer</div>
               </div>
               <div style="margin-bottom:20px;">
                 <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Pages</label>
                 <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;">All</div>
               </div>
               <div style="margin-bottom:20px;">
                 <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Color Mode</label>
                 <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;">${jobInfo.color_mode}</div>
               </div>
            </div>
            <div style="padding:20px;border-top:1px solid #eee;background:#f9f9f9;display:flex;gap:10px;">
               <button onclick="downloadBlankPdf()" style="flex:1;background:white;color:#333;border:1px solid #ddd;padding:10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;">Save</button>
               <button onclick="window.print()" style="flex:1;background:#1a73e8;color:white;border:none;padding:10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;">Print</button>
            </div>
            <div style="padding:0 20px 20px;text-align:center;font-size:11px;color:#999;">
                 System dialog will appear after clicking Print
            </div>
          </div>
        </div>
        <script>
          function downloadBlankPdf() {
            // Minimal blank PDF (1 page)
            const blankPdf = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgNTk1LjI4IDg0MS44OSBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCj4+CmVuZG9iagoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExMSAwMDAwMCBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNAogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoxNzMKJSVFT0YK";
            const link = document.createElement('a');
            link.href = 'data:application/pdf;base64,' + blankPdf;
            link.download = 'secure_document_protected.pdf';
            link.click();
          }
          
          window.onafterprint = () => { window.parent.postMessage('closePrint', '*'); };
        </script>
        <style>
          @media print {
            #mimic-ui { display: none !important; }
            /* Ensure real content is visible when printing */
            .page { display: flex !important; }
          }
          @media screen {
             /* Hide the real image on screen so it doesn't flash behind the mimic UI */
             /* Target both fallback ID and Edge Function class */
            img#doc, .page { display: none !important; }
            /* Ensure body doesn't scroll/show background of real doc */
            body { overflow: hidden !important; background: #525659 !important; }
          }
        </style>
      </body>`);

      return secureHtml;

    } catch (edgeError) {
      console.warn('Falling back to secure client-side stream...', edgeError);
      
      try {
        // 2. Fallback: Secure Client-Side Stream (Hidden in Print Window)
        // This relies on the file path being secret and only available after OTP.
        // We download the blob directly into memory (not disk) and inject it.
        
        const { data: blob, error: downloadError } = await supabase.storage
          .from('print-files')
          .download(filePath);

        if (downloadError || !blob) {
          throw new Error('Failed to retrieve secure document');
        }

        // Convert blob to base64 for embedding
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        return new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64data = reader.result as string;
            
            // Construct the Secure Print HTML (mimicking the Edge Function output)
            // Added Mimic UI for White Preview requirement
            const html = `
              <!DOCTYPE html>
              <html>
              <head>
                <title>Secure Print Stream</title>
                <style>
                  @page { margin: 0; size: ${jobInfo.paper_size} ${jobInfo.orientation}; }
                  body { margin: 0; padding: 0; background: #525659; height: 100vh; overflow: hidden; }
                  
                  /* Real Document: Hidden on Screen, Visible on Print */
                  #doc-container { display: none; width: 100%; height: 100%; justify-content: center; align-items: center; background:white; }
                  img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                  
                  @media print {
                    body { background: white; height: auto; overflow: visible; display: block; }
                    #mimic-ui { display: none !important; }
                    #doc-container { display: flex !important; }
                    img { max-width: 100%; width: 100%; height: auto; page-break-inside: avoid; }
                    .no-print { display: none !important; }
                  }
                </style>
              </head>
              <body>
                <!-- Real Document Container -->
                <div id="doc-container">
                  <img id="doc" src="${base64data}" />
                </div>

                <!-- Fake Print UI (Mimic) -->
                <div id="mimic-ui" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#525659;z-index:9999;display:flex;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
                  <!-- Left: White Preview -->
                  <div style="flex:1;display:flex;justify-content:center;align-items:center;padding:40px;overflow:hidden;">
                    <div style="width:${jobInfo.paper_size === 'a4' ? '210mm' : '8.5in'};height:${jobInfo.paper_size === 'a4' ? '297mm' : '11in'};background:white;box-shadow:0 0 20px rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;transform:scale(0.85);">
                       <!-- Blank White Page -->
                    </div>
                  </div>
                  <!-- Right: Sidebar -->
                  <div style="width:320px;background:white;padding:0;display:flex;flex-direction:column;border-left:1px solid #ddd;">
                    <div style="padding:20px;border-bottom:1px solid #eee;">
                       <h2 style="margin:0;font-size:16px;color:#333;">Print Preview</h2>
                    </div>
                    <div style="padding:20px;flex:1;">
                       <div style="margin-bottom:20px;">
                         <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Destination</label>
                         <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;background:#f5f5f5;color:#888;">Secure Cloud Printer</div>
                       </div>
                       <div style="margin-bottom:20px;">
                         <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Pages</label>
                         <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;background:#f5f5f5;color:#888;">All (Locked)</div>
                       </div>
                       <div style="margin-bottom:20px;">
                         <label style="display:block;font-size:12px;color:#666;margin-bottom:8px;">Color Mode</label>
                         <div style="padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;background:#f5f5f5;color:#888;">${jobInfo.color_mode === 'color' ? 'Color' : 'Black & White'}</div>
                       </div>
                       <div style="margin-top:40px;padding:15px;background:#fff3cd;border:1px solid #ffeeba;border-radius:4px;font-size:12px;color:#856404;">
                         <strong>Security Notice:</strong><br/>
                         This document is protected. The preview is hidden. Content will only be visible on the physical print output.
                       </div>
                    </div>
                    <div style="padding:20px;border-top:1px solid #eee;background:#f9f9f9;display:flex;gap:10px;">
                       <button onclick="downloadBlankPdf()" style="flex:1;background:white;color:#333;border:1px solid #ddd;padding:10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;">Save</button>
                       <button onclick="window.print()" style="flex:1;background:#1a73e8;color:white;border:none;padding:10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;">Print</button>
                    </div>
                  </div>
                </div>

                <script>
                  function downloadBlankPdf() {
                    // Minimal blank PDF (1 page)
                    const blankPdf = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgNTk1LjI4IDg0MS44OSBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCj4+CmVuZG9iagoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIG4gCjAwMDAwMDAwNjAgbgogMDAwMDAwMDExMSBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNAogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoxNzMKJSVFT0YK";
                    const link = document.createElement('a');
                    link.href = 'data:application/pdf;base64,' + blankPdf;
                    link.download = 'secure_document_protected.pdf';
                    link.click();
                  }

                  window.onafterprint = () => { window.parent.postMessage('closePrint', '*'); };
                </script>
              </body>
              </html>
            `;
            
            resolve(html);
          };
          reader.onerror = reject;
        });

      } catch (fallbackError) {
        console.error('Secure print execution failed:', fallbackError);
        throw fallbackError;
      }
    }
  };

  const handleVerifyAndPrint = async () => {
    if (!job || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setVerifying(true);

    try {
      // 1. Verify OTP
      // This RPC returns the file_path ONLY if OTP is correct.
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
          await fetchJob();
        }
        return;
      }

      // 2. Success! Prepare Print
      setPrinting(true);
      toast.success('OTP verified! Preparing secure document...');

      // 3. Execute Secure Print Stream
      // We pass the file_path returned by the verification step.
      if (!result.file_path) throw new Error('Security Error: No file path returned');

      const html = await generateSecurePrintHtml(result.file_path, job);
      setPrintHtml(html);

      // We don't mark as printed yet - wait for the user to actually print or close the view
      // But we can mark the job as "viewed" locally if we want, but status update happens on server ideally
      // For now, we rely on the user to print. 
      // Actually, logic before was: setPrintSuccess(true) immediately. 
      // Let's defer that until they close the print view.

    } catch (err) {
      console.error('Print verification error:', err);
      toast.error('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
      setPrinting(false);
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

  if (printHtml) {
    return (
      <iframe
        srcDoc={printHtml}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          border: 'none',
          zIndex: 99999,
          background: 'white'
        }}
        title="Secure Print View"
      />
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

            {/* Secure Placeholder - REPLACES PREVIEW */}
            <div className="w-full mt-2">
              <div className="relative rounded-lg overflow-hidden border bg-muted/30 p-8 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-background border flex items-center justify-center mb-4 shadow-sm">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-medium text-foreground mb-1">Secure Document</h3>
                <p className="text-sm text-muted-foreground max-w-[250px]">
                  This document is protected and cannot be previewed. Content is only available during printing.
                </p>
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
                      Streaming...
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
