import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath, copies, colorMode, paperSize, orientation, jobId } = await req.json();

    if (!filePath || !jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the job is actually marked as printed (security check)
    const { data: job, error: jobError } = await supabase
      .from('print_jobs')
      .select('status, file_path')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Must be just-printed status for this to work
    if (job.status !== 'printed') {
      return new Response(
        JSON.stringify({ error: 'Invalid job status' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('print-files')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine file type
    const isPDF = filePath.toLowerCase().endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png)$/i.test(filePath);

    // Generate watermark text
    const timestamp = new Date().toISOString();
    const watermarkText = `Job: ${jobId.slice(0, 8)} | Printed: ${timestamp} | ONE-TIME PRINT`;

    // Generate print-ready HTML with embedded content
    let contentHtml = '';

    if (isImage) {
      // Convert blob to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const mimeType = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      contentHtml = `
        <div class="page">
          <img src="data:${mimeType};base64,${base64}" alt="Print content" />
          <div class="watermark">${watermarkText}</div>
        </div>
      `;
    } else if (isPDF) {
      // For PDF, we use iframe for better browser compatibility
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      contentHtml = `
        <div class="page pdf-page">
          <iframe src="data:application/pdf;base64,${base64}" type="application/pdf" width="100%" height="100%" frameborder="0"></iframe>
          <div class="watermark">${watermarkText}</div>
        </div>
      `;
    }

    // Generate copies
    let copiesHtml = '';
    for (let i = 0; i < copies; i++) {
      copiesHtml += contentHtml;
      if (i < copies - 1) {
        copiesHtml += '<div class="page-break"></div>';
      }
    }

    // Paper size dimensions
    const paperSizes: Record<string, { width: string; height: string }> = {
      'A4': { width: '210mm', height: '297mm' },
      'A3': { width: '297mm', height: '420mm' },
      'Letter': { width: '8.5in', height: '11in' },
      'Legal': { width: '8.5in', height: '14in' },
    };

    const paperDimensions = paperSizes[paperSize] || paperSizes['A4'];
    const isLandscape = orientation === 'landscape';

    // Generate the complete print HTML
    const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SecurePrint - One-Time Print</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      size: ${isLandscape ? paperDimensions.height : paperDimensions.width} ${isLandscape ? paperDimensions.width : paperDimensions.height};
      margin: 10mm;
    }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        ${colorMode === 'bw' ? 'filter: grayscale(100%);' : ''}
      }
      
      .page-break {
        page-break-after: always;
      }
    }
    
    body {
      font-family: Arial, sans-serif;
      background: white;
      ${colorMode === 'bw' ? 'filter: grayscale(100%);' : ''}
    }
    
    .page {
      position: relative;
      width: 100%;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .pdf-page {
      height: 100vh;
    }
    
    .pdf-page iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .page img {
      max-width: 100%;
      max-height: calc(100vh - 60px);
      object-fit: contain;
    }
    
    .watermark {
      position: fixed;
      bottom: 5mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8pt;
      color: rgba(0, 0, 0, 0.3);
      font-family: monospace;
      pointer-events: none;
    }
    
    .page-break {
      page-break-after: always;
      height: 0;
    }
    
    /* Prevent saving/copying */
    body {
      user-select: none;
      -webkit-user-select: none;
    }
    
    img {
      pointer-events: none;
    }
  </style>
</head>
<body oncontextmenu="return false;" ondragstart="return false;">
  ${copiesHtml}
  <script>
    // Don't auto-print to avoid conflicts with client-side trigger
    // The client will call window.print() when ready
    
    // Prevent keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p' || e.key === 'c')) {
        // Allow print
        if (e.key !== 'p') {
          e.preventDefault();
          return false;
        }
      }
    });
  </script>
</body>
</html>
`;

    return new Response(
      JSON.stringify({ html: printHtml }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          // Security headers
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    );

  } catch (error) {
    console.error('Print stream error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
