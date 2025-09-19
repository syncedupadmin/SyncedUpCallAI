import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// Parse CSV content
function parseCSV(content: string, maxRows: number = 5): { headers: string[]; preview: any[] } {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], preview: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const preview = lines.slice(1, maxRows + 1).map((line, index) => {
    const values = line.match(/(".*?"|[^,]+)/g) || [];
    const row: any = { _row: index + 2 };
    headers.forEach((header, i) => {
      const value = values[i] || '';
      row[header] = value.trim().replace(/^"|"$/g, '');
    });
    return row;
  });

  return { headers, preview };
}

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse CSV for preview (Excel would need additional library)
    const { headers, preview } = parseCSV(content, 5);

    return NextResponse.json({
      headers,
      preview,
      totalRows: content.split('\n').filter(l => l.trim()).length - 1
    });
  } catch (error: any) {
    console.error('[BULK UPLOAD PREVIEW] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Preview failed' },
      { status: 500 }
    );
  }
}