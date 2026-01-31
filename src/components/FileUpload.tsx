import { useState, useCallback } from 'react';
import { Upload, FileText, Image, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export function FileUpload({ onFileSelect, isUploading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    
    const isValidType = Object.keys(ACCEPTED_TYPES).includes(file.type);
    if (!isValidType) {
      setError('Please upload a PDF, JPG, or PNG file');
      return false;
    }
    
    if (file.size > MAX_SIZE) {
      setError('File size must be less than 50MB');
      return false;
    }
    
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFileSelect(file);
    }
  };

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return <FileText className="w-12 h-12" />;
    return <Image className="w-12 h-12" />;
  };

  return (
    <div className="w-full animate-fade-in">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200",
          isDragging 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          isUploading && "opacity-50 pointer-events-none"
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center transition-colors",
            isDragging ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <Upload className="w-10 h-10" />
          </div>
          
          <div>
            <h3 className="font-semibold text-lg mb-1">
              {isDragging ? 'Drop your file here' : 'Upload a document'}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, JPG, PNG (max 50MB)
            </p>
          </div>
          
          <label htmlFor="file-upload">
            <Button 
              variant="default" 
              size="lg"
              disabled={isUploading}
              asChild
            >
              <span className="cursor-pointer">
                {isUploading ? 'Uploading...' : 'Choose File'}
              </span>
            </Button>
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileInput}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      </div>
      
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
