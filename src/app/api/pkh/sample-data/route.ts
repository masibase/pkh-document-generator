// API: Generate sample PKH data for demo
import { NextRequest, NextResponse } from 'next/server'
import { FormType } from '@/lib/pkh/types'
import { generateSampleData } from '@/lib/pkh/sample-data'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { formType, count } = (await request.json()) as {
      formType: FormType
      count?: number
    }

    const validTypes: FormType[] = ['education', 'health', 'social']
    if (!validTypes.includes(formType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid formType' },
        { status: 400 }
      )
    }

    const data = generateSampleData(formType, count || 10)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed' },
      { status: 500 }
    )
  }
}
