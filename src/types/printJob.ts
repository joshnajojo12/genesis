export type PrintJobStatus = 'pending' | 'printed' | 'expired' | 'locked';

export interface PrintJob {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  copies: number;
  color_mode: 'color' | 'bw';
  paper_size: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  otp_plain: string;
  access_token: string;
  status: PrintJobStatus;
  otp_attempts: number;
  max_otp_attempts: number;
  created_at: string;
  expires_at: string;
  printed_at: string | null;
  session_id: string;
}

export interface PrintSettings {
  copies: number;
  colorMode: 'color' | 'bw';
  paperSize: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  copies: 1,
  colorMode: 'color',
  paperSize: 'A4',
  orientation: 'portrait',
};
