// API: Parse uploaded file (PDF/TXT/JSON/CSV/DOCX/XLSX) and detect form type
// Uses PDF skill's extract.text for PDF text extraction
import { NextRequest, NextResponse } from 'next/server'
import { extractFromDocument, getExt } from '@/lib/pkh/document-extractor'
import { parsePKHData } from '@/lib/pkh/parser'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      )
    }

    const ext = getExt(file.name)
    if (!ext) {
      return NextResponse.json(
        {
          success: false,
          error: `Format file tidak didukung. Didukung: PDF, TXT, JSON, CSV, DOCX, XLSX`,
        },
        { status: 400 }
      )
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Use the new document extractor (handles all types including PDF/DOCX/XLSX)
    const result = await extractFromDocument(fileBuffer, file.name)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    // Add source file info for cross-check display
    return NextResponse.json({
      ...result,
      sourceFile: file.name,
      sourceType: ext,
    })
  } catch (e) {
    console.error('Parse error:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Parse failed' },
      { status: 500 }
    )
  }
}

// GET - return info
export async function GET() {
  return NextResponse.json({
    message: 'PKH Parser API',
    supportedFormats: ['PDF', 'TXT', 'JSON', 'CSV', 'DOCX', 'XLSX'],
    endpoint: 'POST a file to /api/pkh/parse',
  })
}
