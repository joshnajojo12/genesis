import { useState } from 'react';
import { Header } from '@/components/Header';
import { FileUpload } from '@/components/FileUpload';
import { PrintSettings } from '@/components/PrintSettings';
import { PrintJobCard } from '@/components/PrintJobCard';
import { PreviewModal } from '@/components/PreviewModal';
import { usePrintJobs } from '@/hooks/usePrintJobs';
import { DEFAULT_PRINT_SETTINGS } from '@/types/printJob';
import type { PrintSettings as PrintSettingsType, PrintJob } from '@/types/printJob';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const { jobs, loading, creating, createJob, clearJobs } = usePrintJobs();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [printSettings, setPrintSettings] = useState<PrintSettingsType>(DEFAULT_PRINT_SETTINGS);
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setPrintSettings(DEFAULT_PRINT_SETTINGS);
  };

  const handleCreateJob = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    const job = await createJob(selectedFile, printSettings);
    setIsUploading(false);
    
    if (job) {
      setSelectedFile(null);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
  };

  const handleRefresh = async () => {
    await clearJobs();
    setSelectedFile(null);
    toast.success('History cleared');
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onRefresh={handleRefresh} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Upload Section */}
        <section className="mb-8">
          {!selectedFile ? (
            <FileUpload 
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
            />
          ) : (
            <PrintSettings
              file={selectedFile}
              settings={printSettings}
              onSettingsChange={setPrintSettings}
              onConfirm={handleCreateJob}
              onCancel={handleCancel}
              isCreating={creating || isUploading}
            />
          )}
        </section>

        {/* Jobs List */}
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Your Print Jobs
          </h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No print jobs yet</p>
              <p className="text-sm">Upload a document to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <PrintJobCard 
                  key={job.id} 
                  job={job}
                  onPreview={setPreviewJob}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <PreviewModal
        job={previewJob}
        open={!!previewJob}
        onClose={() => setPreviewJob(null)}
      />
    </div>
  );
};

export default Index;
