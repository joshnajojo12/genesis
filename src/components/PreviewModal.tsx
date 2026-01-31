import { useState, useEffect } from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { PrintJob } from '@/types/printJob';

interface PreviewModalProps {
  job: PrintJob | null;
  open: boolean;
  onClose: () => void;
}

export function PreviewModal({ job, open, onClose }: PreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (job && open) {
      loadPreview();
    }
    
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [job, open]);

  const loadPreview = async () => {
    if (!job) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.storage
        .from('print-files')
        .download(job.file_path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Preview error:', err);
      setError('Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const isImage = job?.file_type.startsWith('image/');
  const isPDF = job?.file_type === 'application/pdf';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            {job?.file_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto bg-muted/30 rounded-lg min-h-[400px] flex items-center justify-center">
          {loading && (
            <div className="text-muted-foreground">Loading preview...</div>
          )}
          
          {error && (
            <div className="text-destructive">{error}</div>
          )}
          
          {previewUrl && isImage && (
            <img 
              src={previewUrl} 
              alt={job?.file_name}
              className="max-w-full max-h-full object-contain"
            />
          )}
          
          {previewUrl && isPDF && (
            <iframe
              src={previewUrl}
              className="w-full h-full min-h-[500px]"
              title={job?.file_name}
            />
          )}
        </div>
        
        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
