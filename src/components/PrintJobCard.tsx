import { useState } from 'react';
import { FileText, Image, Copy, Check, Clock, Printer as PrinterIcon, Lock, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PrintJob } from '@/types/printJob';
import { toast } from 'sonner';

interface PrintJobCardProps {
  job: PrintJob;
  onPreview: (job: PrintJob) => void;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'status-pending',
  },
  printed: {
    label: 'Printed',
    icon: PrinterIcon,
    className: 'status-printed',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    className: 'status-expired',
  },
  locked: {
    label: 'Locked',
    icon: Lock,
    className: 'status-locked',
  },
};

export function PrintJobCard({ job, onPreview }: PrintJobCardProps) {
  const [copiedOTP, setCopiedOTP] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const isImage = job.file_type.startsWith('image/');
  const statusConfig = STATUS_CONFIG[job.status];
  const StatusIcon = statusConfig.icon;
  
  const printLink = `${window.location.origin}/print/${job.access_token}`;
  
  const timeRemaining = () => {
    const expires = new Date(job.expires_at);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m remaining`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
  };
  
  const copyToClipboard = async (text: string, type: 'otp' | 'link') => {
    await navigator.clipboard.writeText(text);
    if (type === 'otp') {
      setCopiedOTP(true);
      setTimeout(() => setCopiedOTP(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
    toast.success(type === 'otp' ? 'OTP copied!' : 'Link copied!');
  };
  
  return (
    <div className="bg-card rounded-xl border p-4 hover:shadow-md transition-shadow animate-fade-in">
      <div className="flex items-start gap-4">
        {/* File Icon */}
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          {isImage ? <Image className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{job.file_name}</h3>
            <Badge variant="outline" className={cn("flex-shrink-0", statusConfig.className)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground mb-3">
            {job.copies} {job.copies === 1 ? 'copy' : 'copies'} • {job.color_mode === 'color' ? 'Color' : 'B&W'} • {job.paper_size} • {job.orientation}
          </p>
          
          {job.status === 'pending' && (
            <div className="space-y-2">
              {/* OTP Display */}
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <span className="text-xs text-muted-foreground font-medium">OTP:</span>
                <code className="font-mono font-bold text-lg tracking-wider">{job.otp_plain}</code>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="ml-auto h-7"
                  onClick={() => copyToClipboard(job.otp_plain, 'otp')}
                >
                  {copiedOTP ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              
              {/* Time remaining */}
              <p className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {timeRemaining()}
              </p>
            </div>
          )}
          
          {job.status === 'printed' && job.printed_at && (
            <p className="text-sm text-success flex items-center gap-1">
              <Check className="w-4 h-4" />
              Printed at {new Date(job.printed_at).toLocaleString()}
            </p>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {job.status === 'pending' && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onPreview(job)}
              >
                <Eye className="w-3 h-3 mr-1" />
                Preview
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={() => copyToClipboard(printLink, 'link')}
              >
                {copiedLink ? <Check className="w-3 h-3 mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                Copy Link
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
