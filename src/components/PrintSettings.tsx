import { FileText, Image, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { PrintSettings as PrintSettingsType } from '@/types/printJob';

interface PrintSettingsProps {
  file: File;
  settings: PrintSettingsType;
  onSettingsChange: (settings: PrintSettingsType) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isCreating: boolean;
}

export function PrintSettings({ 
  file, 
  settings, 
  onSettingsChange, 
  onConfirm, 
  onCancel,
  isCreating 
}: PrintSettingsProps) {
  const isImage = file.type.startsWith('image/');
  
  return (
    <div className="bg-card rounded-xl border p-6 animate-slide-up">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {isImage ? <Image className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-semibold">{file.name}</h3>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={isCreating}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Print Settings
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="copies">Number of Copies</Label>
            <Input
              id="copies"
              type="number"
              min={1}
              max={50}
              value={settings.copies}
              onChange={(e) => onSettingsChange({ 
                ...settings, 
                copies: Math.min(50, Math.max(1, parseInt(e.target.value) || 1))
              })}
              disabled={isCreating}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="colorMode">Color Mode</Label>
            <Select
              value={settings.colorMode}
              onValueChange={(value: 'color' | 'bw') => 
                onSettingsChange({ ...settings, colorMode: value })
              }
              disabled={isCreating}
            >
              <SelectTrigger id="colorMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="color">Color</SelectItem>
                <SelectItem value="bw">Black & White</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="paperSize">Paper Size</Label>
            <Select
              value={settings.paperSize}
              onValueChange={(value: 'A4' | 'A3' | 'Letter' | 'Legal') => 
                onSettingsChange({ ...settings, paperSize: value })
              }
              disabled={isCreating}
            >
              <SelectTrigger id="paperSize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A3">A3</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="orientation">Orientation</Label>
            <Select
              value={settings.orientation}
              onValueChange={(value: 'portrait' | 'landscape') => 
                onSettingsChange({ ...settings, orientation: value })
              }
              disabled={isCreating}
            >
              <SelectTrigger id="orientation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex gap-3">
        <Button 
          variant="outline" 
          onClick={onCancel} 
          className="flex-1"
          disabled={isCreating}
        >
          Cancel
        </Button>
        <Button 
          onClick={onConfirm} 
          className="flex-1"
          disabled={isCreating}
        >
          {isCreating ? 'Creating Print Job...' : 'Create Print Job'}
        </Button>
      </div>
    </div>
  );
}
