// API: Generate HTML form(s) from PKH data
import { NextRequest, NextResponse } from 'next/server'
import { PKHFormData } from '@/lib/pkh/types'
import { generateFormHTML, generateCombinedHTML } from '@/lib/pkh/form-generator'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mode, data, forms } = body as {
      mode: 'single' | 'combined'
      data?: PKHFormData
      forms?: PKHFormData[]
    }

    if (mode === 'combined' && Array.isArray(forms)) {
      const html = generateCombinedHTML(forms)
      return NextResponse.json({ success: true, html, mode: 'combined', count: forms.length })
    }

    if (mode === 'single' && data) {
      const html = generateFormHTML(data)
      return NextResponse.json({ success: true, html, mode: 'single' })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request: provide mode=data (single) or mode=combined with forms[]' },
      { status: 400 }
    )
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
