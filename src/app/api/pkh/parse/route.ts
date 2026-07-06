// API: Parse uploaded JSON/CSV file and detect form type
import { NextRequest, NextResponse } from 'next/server'
import { parsePKHData } from '@/lib/pkh/parser'

export const runtime = 'nodejs'

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

    const text = await file.text()
    const ext = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
    const result = parsePKHData(text, ext)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Parse failed' },
      { status: 500 }
    )
  }
}

// GET - return sample data of all types for quick demo
export async function GET() {
  return NextResponse.json({
    message: 'PKH Parser API. POST a JSON or CSV file to /api/pkh/parse',
  })
}
