import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  Printer,
  Clock,
  Lock,
  Check,
  AlertTriangle,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface PrintJobInfo {
  id: string;
  file_name: string;
  file_path?: string;
  file_type?: string;
  copies: number;
  color_mode: "color" | "bw";
  paper_size: string;
  orientation: string;
  status: "pending" | "printed" | "expired" | "locked";
  expires_at: string;
  otp_attempts: number;
  max_otp_attempts: number;
}

const STATUS_CONFIG = {
  pending: {
    label: "Ready to Print",
    icon: Printer,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  printed: {
    label: "Already Printed",
    icon: Check,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  locked: {
    label: "Locked",
    icon: Lock,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

export default function PrintPage() {
  const { token } = useParams<{ token: string }>();
  const [job, setJob] = useState<PrintJobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    fetchJob();
  }, [token]);

  // Fetch a preview image (blurred on-page) for image file types
  useEffect(() => {
    let mounted = true;
    let objectUrl: string | null = null;

    const fetchPreview = async () => {
      setPreviewSrc(null);
      if (!job || !job.file_path || !job.file_type?.startsWith("image/"))
        return;

      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("print-files")
          .download(job.file_path);

        if (downloadError || !fileData) return;

        // Some SDKs return a Blob-like object; ensure we create a usable URL
        let blob: Blob;
        try {
          blob = await (fileData as any).blob();
        } catch (e) {
          const arrayBuffer = await (fileData as any).arrayBuffer();
          blob = new Blob([new Uint8Array(arrayBuffer)], {
            type: job.file_type,
          });
        }

        objectUrl = URL.createObjectURL(blob);
        if (mounted) setPreviewSrc(objectUrl);
      } catch (err) {
        console.warn("Failed to fetch preview image:", err);
      }
    };

    fetchPreview();

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job]);

  const fetchJob = async () => {
    if (!token) {
      setError("Invalid print link");
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("print_jobs")
        .select(
          "id, file_name, file_path, file_type, copies, color_mode, paper_size, orientation, status, expires_at, otp_attempts, max_otp_attempts",
        )
        .eq("access_token", token)
        .single();

      if (fetchError || !data) {
        setError("Print job not found or link has expired");
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date() && data.status === "pending") {
        setError("This print job has expired");
        return;
      }

      setJob(data as PrintJobInfo);
    } catch (err) {
      console.error("Error fetching job:", err);
      setError("Failed to load print job");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsCopy = () => {
    try {
      // Minimal valid PDF content (blank white page)
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>
endobj
xref
0 4
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
223
%%EOF`;

      const blob = new Blob([pdfContent], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `Copy-${job?.file_name ? job.file_name.replace(/\.[^/.]+$/, "") : "document"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Saved as copy");
    } catch (error) {
      console.error("Error saving copy:", error);
      toast.error("Failed to save copy");
    }
  };

  const handleVerifyAndPrint = async () => {
    if (!job || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    // Open print window early (synchronously, before async ops) to bypass popup blockers
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) {
      toast.error("Popup blocker detected. Please allow popups for this site.");
      return;
    }

    // Immediately write a blurred placeholder so the popup isn't blank.
    const immediatePlaceholder = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Preparing Secure Print</title>
        <style>
          html,body{height:100%;margin:0;background:#f7f7f7;font-family:Inter, Arial, sans-serif;color:#222}
          .wrap{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;padding:24px;box-sizing:border-box}
          .img-wrap{position:relative;max-width:920px;width:100%;max-height:78vh;display:flex;align-items:center;justify-content:center}
          #preview-img{max-width:100%;max-height:100%;object-fit:contain;filter:blur(12px);-webkit-filter:blur(12px);background:linear-gradient(135deg,#eee,#ddd);}
          .veil{position:absolute;inset:0;background:rgba(255,255,255,0.6);backdrop-filter:blur(2px)}
          .note{font-size:14px;color:#444}
          .spinner{width:44px;height:44px;border-radius:50%;border:6px solid rgba(0,0,0,0.08);border-top-color:#111;animation:spin 1s linear infinite}
          @keyframes spin{to{transform:rotate(360deg)}}
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="img-wrap">
            <img id="preview-img" src="" alt="Preview" />
            <div class="veil"></div>
          </div>
          <div class="spinner" aria-hidden="true"></div>
          <div class="note">Preparing secure print — content is blurred for privacy.</div>
        </div>
      </body>
      </html>`;

    try {
      printWindow.document.open();
      printWindow.document.write(immediatePlaceholder);
      printWindow.document.close();
      printWindow.focus();
    } catch (err) {
      console.warn(
        "Could not write immediate placeholder to print window:",
        err,
      );
    }

    // Then try to fetch the actual image and replace the placeholder's src.
    (async () => {
      try {
        if (
          job?.file_path &&
          job.file_type &&
          job.file_type.startsWith("image/")
        ) {
          const { data: previewData, error: previewError } =
            await supabase.storage.from("print-files").download(job.file_path);

          if (!previewError && previewData) {
            const arrayBuffer = await previewData.arrayBuffer();
            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(arrayBuffer)),
            );
            const mime = job.file_type.toLowerCase().includes("png")
              ? "image/png"
              : job.file_type;

            try {
              // If window is still open, set the img src to the base64 data URL
              if (!printWindow.closed) {
                const img = printWindow.document.getElementById(
                  "preview-img",
                ) as HTMLImageElement | null;
                if (img) {
                  img.src = `data:${mime};base64,${base64}`;
                }
              }
            } catch (err) {
              console.warn(
                "Could not update preview image in print window:",
                err,
              );
            }
          }
        }
      } catch (err) {
        console.warn("Could not populate blurred preview:", err);
      }
    })();

    setVerifying(true);

    try {
      const { data, error: verifyError } = await supabase.rpc("verify_otp", {
        job_id: job.id,
        provided_otp: otp,
      });

      if (verifyError) throw verifyError;

      const result = data as {
        success: boolean;
        error?: string;
        attempts_remaining?: number;
        file_path?: string;
      };

      if (!result.success) {
        toast.error(result.error || "Verification failed");
        printWindow.close();

        if (
          result.error?.includes("locked") ||
          result.error?.includes("Too many")
        ) {
          setJob((prev) => (prev ? { ...prev, status: "locked" } : null));
        } else if (result.attempts_remaining !== undefined) {
          setJob((prev) =>
            prev ? { ...prev, otp_attempts: prev.otp_attempts + 1 } : null,
          );
          toast.warning(`${result.attempts_remaining} attempts remaining`);
        } else {
          // Status changed (printed, expired, etc.)
          await fetchJob();
        }
        return;
      }

      // Success! Trigger print
      setPrinting(true);
      toast.success("OTP verified! Preparing print...");

      // Call edge function to get print stream, passing the already-opened window
      await triggerPrint(
        result.file_path!,
        job.copies,
        job.color_mode,
        job.paper_size,
        job.orientation,
        printWindow,
      );

      setPrintSuccess(true);
      setJob((prev) => (prev ? { ...prev, status: "printed" } : null));
    } catch (err) {
      console.error("Verification error:", err);
      toast.error("Verification failed. Please try again.");
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
    orientation: string,
    printWindow: Window,
  ) => {
    try {
      const payload = {
        filePath,
        copies,
        colorMode,
        paperSize,
        orientation,
        jobId: job?.id,
      };

      console.debug(
        "Invoking Edge Function `print-stream` with payload:",
        payload,
      );

      // Call edge function to get the print-ready stream. Ensure JSON body and header.
      const response = await supabase.functions.invoke("print-stream", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      // Log full response for easier debugging in prod
      console.debug("Edge Function response:", response);

      if (response.error) {
        // Provide extra info when possible
        console.error("Edge Function returned error object:", response.error);
        throw response.error;
      }

      // The response.data may be a JSON string or an object depending on supabase client
      let printContent: any = response.data;
      if (typeof printContent === "string") {
        try {
          printContent = JSON.parse(printContent);
        } catch (e) {
          // If it's not JSON, keep it as string (older SDKs may return raw text)
        }
      }

      // Determine HTML string from response (handle object or raw string)
      let htmlString = "";
      if (
        printContent &&
        typeof printContent === "object" &&
        typeof printContent.html === "string"
      ) {
        htmlString = printContent.html;
      } else if (typeof printContent === "string") {
        htmlString = printContent;
      } else if (
        (response as any)?.data &&
        typeof (response as any).data === "string"
      ) {
        htmlString = (response as any).data;
      }

      if (!htmlString) {
        throw new Error("Empty print content received from function");
      }

      // Write HTML to the already-opened print window and trigger print
      try {
        // Clear the window first
        printWindow.document.write(
          "<html><head><title>Print</title></head><body></body></html>",
        );
        printWindow.document.close();

        // Use innerHTML to set the content - more reliable than document.write for dynamic content
        const htmlWithoutDoctype = htmlString
          .replace(/^<!DOCTYPE[^>]*>\s*/i, "")
          .replace(/<html[^>]*>/i, "")
          .replace(/<\/html>/i, "")
          .replace(/<head[^>]*>/i, "")
          .replace(/<\/head>/i, "")
          .replace(/<body[^>]*>/i, "")
          .replace(/<\/body>/i, "");

        // Extract and apply styles from original HTML
        const styleMatch = htmlString.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        let styleContent = "";
        if (styleMatch && styleMatch[1]) {
          styleContent = styleMatch[1];
        }

        // Create complete document with styles and content
        const completeHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Print Document</title>
            <style>
              ${styleContent}
            </style>
          </head>
          <body>
            ${htmlWithoutDoctype}
          </body>
          </html>
        `;

        // Replace document content
        printWindow.document.open();
        printWindow.document.write(completeHtml);
        printWindow.document.close();
        printWindow.focus();

        // Trigger print after content loads
        let printTriggered = false;

        const triggerPrintDialog = () => {
          if (printTriggered) return;
          printTriggered = true;

          try {
            // This triggers the browser print dialog for the window
            printWindow.print();
            toast.success("Print dialog opened");
          } catch (e) {
            console.error("Print invocation error:", e);
            toast.error("Failed to open print dialog. Please try again.");
          }

          // Close the window after giving user time to interact with print dialog
          setTimeout(() => {
            try {
              printWindow.close();
            } catch (e) {
              /* ignore */
            }
          }, 5000);
        };

        // Wait for content to load
        setTimeout(triggerPrintDialog, 1000);
      } catch (e) {
        console.error("Failed to populate/print window:", e);
        toast.error("Failed to prepare print content. Please try again.");
        throw e;
      }
    } catch (err: any) {
      // Surface useful diagnostics in console for production debugging
      console.error("Print error:", err);
      if (err && err.status) console.error("Function status:", err.status);
      if (err && err.message) console.error("Function message:", err.message);
      if (err && err.body) console.error("Function body:", err.body);
      toast.error("Failed to initiate print. Please contact support.");
    }
  };

  const timeRemaining = () => {
    if (!job) return "";
    const expires = new Date(job.expires_at);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

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
          <p className="text-muted-foreground">
            {error || "Print job not found"}
          </p>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[job.status];
  const StatusIcon = statusConfig.icon;
  const canPrint = job.status === "pending";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar - File Info & Actions */}
      <aside className="w-full md:w-96 bg-card border-r flex flex-col h-auto md:h-screen sticky top-0">
        <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Printer className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">SecurePrint</h1>
              <p className="text-xs text-muted-foreground">
                Print Verification
              </p>
            </div>
          </div>

          <Separator />

          {/* File Info */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h2
                  className="font-semibold text-base truncate"
                  title={job.file_name}
                >
                  {job.file_name}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                    {job.copies} {job.copies === 1 ? "copy" : "copies"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                    {job.color_mode === "color" ? "Color" : "B&W"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                    {job.paper_size}
                  </Badge>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "p-3 rounded-lg flex items-center gap-2 text-sm",
                statusConfig.bgColor,
                statusConfig.color,
              )}
            >
              <StatusIcon className="w-4 h-4" />
              <span className="font-medium">{statusConfig.label}</span>
            </div>

            {canPrint && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{timeRemaining()}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-4">
            {canPrint && !printSuccess && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-sm font-medium">
                    Enter OTP to Print
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="text-center text-xl tracking-widest font-mono h-12"
                    disabled={verifying || printing}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {job.max_otp_attempts - job.otp_attempts} attempts remaining
                  </p>
                </div>

                <Button
                  size="lg"
                  className="w-full h-12 text-base"
                  onClick={handleVerifyAndPrint}
                  disabled={otp.length !== 6 || verifying || printing}
                >
                  {verifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : printing ? (
                    <>
                      <Printer className="w-4 h-4 mr-2 animate-pulse" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 mr-2" />
                      Verify & Print
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Save as Copy Button */}
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={handleSaveAsCopy}
            >
              <Download className="w-4 h-4 mr-2" />
              Save as Copy
            </Button>

            {/* Success State */}
            {printSuccess && (
              <div className="text-center py-4 bg-success/5 rounded-lg border border-success/10">
                <Check className="w-8 h-8 text-success mx-auto mb-2" />
                <h3 className="font-medium text-success">Print Started</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  The print dialog has been opened.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              Secure one-time print. Document cannot be downloaded or previewed
              unblurred.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content - Preview */}
      <main className="flex-1 bg-muted/20 flex items-center justify-center p-4 min-h-[50vh] md:min-h-screen overflow-auto">
        {previewSrc ? (
          <div className="relative max-w-2xl w-full shadow-2xl rounded-lg overflow-hidden bg-white">
            <img
              src={previewSrc}
              alt="Preview"
              className="w-full h-auto object-contain filter blur-md"
              style={{ WebkitFilter: "blur(8px)" }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
              <div className="bg-background/90 backdrop-blur-md shadow-lg px-6 py-4 rounded-xl border flex flex-col items-center gap-3 text-center max-w-xs">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Preview Protected</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Content is blurred for security. Verify OTP to print.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Preview not available</p>
          </div>
        )}
      </main>
    </div>
  );
}
