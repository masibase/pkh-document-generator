// API: Neural Engine Analysis - uses LLM to analyze PKH data
import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { PKHFormData, AnalysisResult, FormType } from '@/lib/pkh/types'
import { calcAttendance } from '@/lib/pkh/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

const FORM_TYPE_TITLES: Record<FormType, string> = {
  education: 'Pendidikan',
  health: 'Kesehatan',
  social: 'Kesejahteraan Sosial',
}

function computeStats(data: PKHFormData) {
  const total = data.records.length
  let attendanceRate: number | undefined
  let completionRate: number | undefined
  const categories: Record<string, number> = {}

  if (data.formType === 'education' || data.formType === 'health') {
    const percents = data.records.map((r) => calcAttendance(r).percent)
    attendanceRate = Math.round(percents.reduce((a, b) => a + b, 0) / (percents.length || 1))
    completionRate = Math.round((percents.filter((p) => p >= 75).length / (percents.length || 1)) * 100)
  }

  if (data.formType === 'education') {
    data.records.forEach((r) => {
      const k = r.jenjang || 'Lainnya'
      categories[k] = (categories[k] || 0) + 1
    })
  } else if (data.formType === 'health') {
    data.records.forEach((r) => {
      const k = r.posyandu || 'Lainnya'
      categories[k] = (categories[k] || 0) + 1
    })
  } else {
    data.records.forEach((r) => {
      const k = r.bantuan || 'Lainnya'
      categories[k] = (categories[k] || 0) + 1
    })
  }

  return { totalBeneficiaries: total, attendanceRate, completionRate, categories }
}

function buildRiskFlags(data: PKHFormData): string[] {
  const flags: string[] = []
  if (data.formType !== 'social') {
    const lowAttendance = data.records.filter((r) => calcAttendance(r).percent < 50)
    if (lowAttendance.length > 0) {
      flags.push(`${lowAttendance.length} peserta memiliki kehadiran di bawah 50% (perlu intervensi)`)
    }
    const arrKey = data.formType === 'education' ? 'kehadiran' : 'pemeriksaan'
    const zeroMonth = data.records.some((r) => {
      const arr = (r[arrKey] as boolean[] | undefined) || []
      return arr.every((v) => !v)
    })
    if (zeroMonth) flags.push('Ditemukan peserta dengan kehadiran 0% sepanjang periode')
  } else {
    const inactive = data.records.filter((r) => r.status !== 'Aktif')
    if (inactive.length > 0) {
      flags.push(`${inactive.length} peserta berstatus tidak aktif`)
    }
  }
  return flags
}

export async function POST(request: NextRequest) {
  try {
    const { data } = (await request.json()) as { data: PKHFormData }
    if (!data || !Array.isArray(data.records)) {
      return NextResponse.json(
        { success: false, error: 'Invalid PKH data' },
        { status: 400 }
      )
    }

    const stats = computeStats(data)
    const riskFlags = buildRiskFlags(data)

    // Build a compact data summary for the LLM
    const sampleRecords = data.records.slice(0, 8).map((r) => {
      const base: Record<string, unknown> = {
        nama: r.nama,
        nik: r.nik?.slice(0, 6) + '****',
        kelurahan: r.kelurahan,
      }
      if (data.formType === 'education') {
        base.sekolah = r.sekolah
        base.kelas = r.kelas
        base.jenjang = r.jenjang
        const { qty, percent } = calcAttendance(r)
        base.kehadiranQty = qty
        base.persentase = percent + '%'
      } else if (data.formType === 'health') {
        base.posyandu = r.posyandu
        const { qty, percent } = calcAttendance(r)
        base.pemeriksaanQty = qty
        base.persentase = percent + '%'
      } else {
        base.bantuan = r.bantuan
        base.jumlah = r.jumlahBantuan
        base.status = r.status
      }
      return base
    })

    const dataContext = {
      formType: data.formType,
      formTypeLabel: FORM_TYPE_TITLES[data.formType],
      periode: data.periode,
      wilayah: `${data.kelurahan}, ${data.kecamatan}, ${data.kabupaten}`,
      totalPeserta: stats.totalBeneficiaries,
      rataRataKehadiran: stats.attendanceRate,
      tingkatPenyelesaian: stats.completionRate,
      distribusiKategori: stats.categories,
      contohData: sampleRecords,
      riskFlags,
    }

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'Anda adalah Neural Engine analyst untuk Program Keluarga Harapan (PKH) Kementerian Sosial RI. ' +
            'Tugas Anda menganalisis data kehadiran/bantuan penerima PKH dan memberikan insight yang actionable ' +
            'dalam Bahasa Indonesia. Fokus pada: kualitas kehadiran, identifikasi peserta berisiko, ' +
            'rekomendasi tindak lanjut, dan optimasi program. Jawab HANYA dengan JSON valid sesuai format yang diminta.',
        },
        {
          role: 'user',
          content: `Analisis data PKH berikut dan berikan output JSON dengan struktur:
{
  "summary": "ringkasan 2-3 kalimat tentang kondisi data",
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "recommendations": ["rekomendasi 1", "rekomendasi 2", "rekomendasi 3"],
  "riskFlags": ["flag risiko 1", ...]
}

Data PKH (${FORM_TYPE_TITLES[data.formType]}):
${JSON.stringify(dataContext, null, 2)}

Berikan analisis yang spesifik, berbasis data, dan langsung dapat ditindaklanjuti oleh pendamping PKH.`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content || ''

    let llmResult: { summary: string; insights: string[]; recommendations: string[]; riskFlags: string[] }
    try {
      // Extract JSON from response (in case there's markdown wrapping)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      llmResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        summary: raw.slice(0, 300),
        insights: [],
        recommendations: [],
        riskFlags: [],
      }
    } catch {
      llmResult = {
        summary: raw.slice(0, 300),
        insights: [],
        recommendations: [],
        riskFlags,
      }
    }

    const result: AnalysisResult = {
      summary: llmResult.summary,
      insights: llmResult.insights?.slice(0, 6) || [],
      recommendations: llmResult.recommendations?.slice(0, 5) || [],
      statistics: stats,
      riskFlags: [...new Set([...(llmResult.riskFlags || []), ...riskFlags])].slice(0, 6),
    }

    return NextResponse.json({ success: true, analysis: result })
  } catch (e) {
    console.error('Analysis error:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
