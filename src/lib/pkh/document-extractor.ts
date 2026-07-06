// PKH Document Extractor
// Extracts text from PDF/TXT/DOCX/XLSX files and parses wilayah + form type + records
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  FormType, PKHFormData, PKHRecord, ParseResult, MONTHS_ID,
} from './types'

const execFileAsync = promisify(execFile)
const PDF_SKILL_DIR = path.join(process.cwd(), 'skills', 'pdf')
const EXTRACT_TEXT = path.join(PDF_SKILL_DIR, 'scripts', 'pdf.py')
const TMP_DIR = path.join(process.cwd(), 'tmp', 'pkh-upload')

// Use the venv Python that has pdfplumber/pikepdf installed (the PDF skill deps).
// Fall back to system python3 if the venv doesn't exist.
const VENV_PYTHON = '/home/z/.venv/bin/python3'
function getPythonBin(): string {
  try {
    if (existsSync(VENV_PYTHON)) return VENV_PYTHON
  } catch {
    // ignore
  }
  return 'python3'
}

export type SupportedExt = 'pdf' | 'txt' | 'json' | 'csv' | 'docx' | 'xlsx'

export function getExt(filename: string): SupportedExt | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

// ---- PDF text extraction via PDF skill's extract.text ----
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    getPythonBin(),
    [EXTRACT_TEXT, 'extract.text', filePath],
    { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }
  )
  const result = JSON.parse(stdout)
  if (result.status !== 'success') {
    throw new Error(result.message || 'PDF text extraction failed')
  }
  // Combine all pages
  return (result.data.pages || []).map((p: { text: string }) => p.text).join('\n')
}

// ---- DOCX/XLSX → PDF → text via LibreOffice (convert.office) ----
export async function extractTextFromOffice(filePath: string, ext: 'docx' | 'xlsx'): Promise<string> {
  // Use libreoffice to convert to PDF first, then extract text
  const outDir = path.dirname(filePath)
  const { stdout } = await execFileAsync(
    getPythonBin(),
    [EXTRACT_TEXT, 'convert.office', filePath, '--output', outDir],
    { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }
  )
  const result = JSON.parse(stdout)
  if (result.status !== 'success') {
    throw new Error(result.message || `Office conversion failed for .${ext}`)
  }
  const convertedPdf = result.data?.output || filePath.replace(/\.(docx|xlsx)$/i, '.pdf')
  if (!existsSync(convertedPdf)) {
    throw new Error(`Converted PDF not found: ${convertedPdf}`)
  }
  return extractTextFromPDF(convertedPdf)
}

// ---- Wilayah extraction from text ----
// Looks for patterns like "Provinsi : Jawa Barat" or "Kabupaten/Kota : Bandung"
// Uses \b word boundaries to avoid false matches (e.g., "KELUARGA" matching "kel")
export function extractWilayahFromText(text: string): Partial<PKHFormData> {
  const result: Partial<PKHFormData> = {}

  const patterns: Record<string, RegExp> = {
    provinsi: /\bprovinsi\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:kabupaten|kota|kecamatan|kelurahan|desa)\b|\n|\r|$)/i,
    kabupaten: /\b(?:kabupaten(?:\s*\/\s*kota)?|kab\.?|kota)\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:kecamatan|kelurahan|desa|provinsi)\b|\n|\r|$)/i,
    kecamatan: /\bkecamatan\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:kelurahan|desa|kabupaten|kota|provinsi)\b|\n|\r|$)/i,
    // Handle "Kelurahan/Desa" as combined label — consume the optional "/Desa" part
    kelurahan: /\b(?:kelurahan(?:\s*\/\s*desa)?|desa|kel\.)\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:kecamatan|kabupaten|kota|provinsi)\b|\n|\r|$)/i,
  }

  for (const [field, regex] of Object.entries(patterns)) {
    const match = text.match(regex)
    if (match && match[1]) {
      let value = match[1].trim().replace(/\s+/g, ' ')
      // Clean up: remove leading "/Kota :" or "/Desa :" artifacts and trailing punctuation
      value = value
        .replace(/^(?:\/\s*(?:kota|desa)\s*[:\-]?\s*)/i, '')
        .replace(/[:\-]+$/, '')
        .trim()
      if (value.length > 1 && value.length < 100) {
        ;(result as Record<string, unknown>)[field] = value
      }
    }
  }

  // Periode — look for "Periode:" followed by a month-year range like "Januari - Desember 2024"
  const periodeMatch = text.match(/\bperiode\s*[:\-]?\s*([A-Za-z]+\s*[-–]\s*[A-Za-z]+\s+\d{4})/i)
  if (periodeMatch && periodeMatch[1]) {
    const val = periodeMatch[1].trim().replace(/\s+/g, ' ')
    if (val.length > 3 && val.length < 80) {
      result.periode = val
    }
  }

  // Facilitator name — look for a capitalized name after "Pendamping PKH" label
  const facMatch = text.match(/\bpendamping\s+pkh\b[\s\S]{0,60}?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/i)
  if (facMatch && facMatch[1]) {
    const val = facMatch[1].trim().replace(/\s+/g, ' ')
    if (val.length > 3 && val.length < 80) {
      result.facilitator = val
    }
  }

  // NIP — find the one associated with "Pendamping PKH" (within 200 chars)
  const nipMatch = text.match(/\bpendamping\s+pkh\b[\s\S]{0,300}?\bnip\.?\s*[:\-]?\s*(\d{16,18})/i)
  if (nipMatch && nipMatch[1]) {
    result.nipFacilitator = nipMatch[1]
  }

  return result
}

// ---- Form type detection from free text ----
export function detectFormTypeFromText(text: string): FormType {
  const lower = text.toLowerCase()

  // Education indicators
  const eduScore =
    (lower.match(/kehadiran\s+anak\s+pendidikan/g)?.length || 0) * 3 +
    (lower.match(/sekolah/g)?.length || 0) * 2 +
    (lower.match(/kelas\b/g)?.length || 0) +
    (lower.match(/jenjang/g)?.length || 0) +
    (lower.match(/\b(sd|smp|sma|smk|mi|mts|ma)\b/g)?.length || 0) +
    (lower.match(/pendidikan/g)?.length || 0)

  // Health indicators
  const healthScore =
    (lower.match(/kesehatan/g)?.length || 0) * 2 +
    (lower.match(/posyandu/g)?.length || 0) * 3 +
    (lower.match(/pemeriksaan/g)?.length || 0) * 2 +
    (lower.match(/berat\s*badan|\bbb\b/g)?.length || 0) +
    (lower.match(/tinggi\s*badan|\btb\b/g)?.length || 0) +
    (lower.match(/keluarga\s+sehat/g)?.length || 0) * 2

  // Social welfare indicators
  const socialScore =
    (lower.match(/kesejahteraan\s+sosial/g)?.length || 0) * 3 +
    (lower.match(/\bbantuan\b/g)?.length || 0) * 2 +
    (lower.match(/penerima\s+bantuan/g)?.length || 0) * 2 +
    (lower.match(/jumlah\s*bantuan/g)?.length || 0) +
    (lower.match(/\baktif\b|\btidak\s+aktif\b/g)?.length || 0)

  if (eduScore >= healthScore && eduScore >= socialScore && eduScore > 0) return 'education'
  if (healthScore >= socialScore && healthScore > 0) return 'health'
  if (socialScore > 0) return 'social'

  // Default
  return 'social'
}

// ---- Parse boolean value ----
function parseBool(val: string): boolean {
  const v = val.toLowerCase().trim()
  return ['1', 'true', 'ya', 'hadir', 'v', 'x', '✓', 'check', 'lunas', 'selesai', 'baik', 'hadir/terlayani'].includes(v)
}

// ---- Parse records from extracted text table ----
// PDF table layout: [Name line] / [No NIK marks QTY %] / [School • Jenjang Kelas]
// Also handles structured (key:value) text. Skips NIP signature lines.
export function parseRecordsFromText(text: string, formType: FormType): PKHRecord[] {
  const records: PKHRecord[] = []
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)

  // NIK = 14-18 digit number (Indonesian NIK is 16 digits, but allow 14-18 for flexibility)
  // Skip NIP signature lines separately below
  const nikRegex = /\b(\d{14,18})\b/

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    // Skip NIP signature lines (e.g., "NIP. 196505121990031002 NIP. ...")
    if (/^\s*nip\.?\s/i.test(line)) continue
    // Skip lines that are clearly signature/role labels
    if (/^(kepala\s+desa|pendamping\s+pkh|koordinator\s+pkh|mengetahui|disusun|menyetujui)/i.test(line)) continue

    const nikMatch = line.match(nikRegex)
    if (!nikMatch) continue

    const nik = nikMatch[1]
    const beforeNik = line.substring(0, nikMatch.index || 0).trim()
    const afterNik = line.substring((nikMatch.index || 0) + nik.length).trim()

    // Extract No (number before NIK)
    const noMatch = beforeNik.match(/(\d+)\s*$/)
    const no = noMatch ? parseInt(noMatch[1], 10) : records.length + 1

    // Name: check the PREVIOUS line (common in PDF tables — name is above the NIK row)
    let nama = ''
    if (li > 0) {
      const prevLine = lines[li - 1]
      // Previous line should be a name (no NIK, no "NIP", not a header, has letters)
      if (
        prevLine.length > 2 &&
        prevLine.length < 60 &&
        !nikRegex.test(prevLine) &&
        !/^\s*nip\.?\s/i.test(prevLine) &&
        !/^(no|nama|nik|sekolah|posyandu|kecamatan|kelurahan|provinsi|kabupaten|kehadiran|pemeriksaan|bantuan|status|periode|total|kategori|formulir|kementerian|program|direktorat|catatan|hadir|tidak|qty|persentase|jenis|jumlah)/i.test(prevLine) &&
        /[A-Za-z]/.test(prevLine) &&
        !/\d{4,}/.test(prevLine) // avoid lines with years/numbers
      ) {
        nama = prevLine.replace(/[—\-•]+$/, '').trim()
      }
    }

    // If name not found on previous line, try after NIK on same line
    if (!nama) {
      const namePart = afterNik.split(/\s{2,}|\n|—|–/)[0] || ''
      if (namePart.length > 2 && /[A-Za-z]/.test(namePart) && !/^\d/.test(namePart)) {
        nama = namePart.trim()
      }
    }

    if (!nama) {
      // Fallback: use afterNik first words
      const words = afterNik.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
      if (words.length > 0) nama = words.slice(0, 3).join(' ')
    }

    // Clean up name
    nama = nama.replace(/[\d%]+$/, '').replace(/[—\-•]+$/, '').trim()
    if (nama.length > 50) nama = nama.substring(0, 50)

    if (!nama || nama.length < 2) continue

    // School/Posyandu info: check the NEXT line
    let extra = ''
    if (li < lines.length - 1) {
      const nextLine = lines[li + 1]
      if (formType === 'education') {
        const schoolMatch = nextLine.match(/((?:SDN?|SMPN?|SMAN?|SMKN?|MTs?|MA|PAUD)\s+\w+(?:\s+\d+)?)/i)
        if (schoolMatch) extra = schoolMatch[1]
      } else if (formType === 'health') {
        const posyanduMatch = nextLine.match(/(posyandu\s+\w+)/i)
        if (posyanduMatch) extra = posyanduMatch[1]
      }
    }
    // Also try same line for school
    if (!extra && formType === 'education') {
      const schoolMatch = line.match(/((?:SDN?|SMPN?|SMAN?|SMKN?|MTs?|MA|PAUD)\s+\w+(?:\s+\d+)?)/i)
      if (schoolMatch) extra = schoolMatch[1]
    }

    const record: PKHRecord = {
      no,
      nama,
      nik,
    }

    if (formType === 'education') {
      record.sekolah = extra
      if (extra) {
        const e = extra.toLowerCase()
        if (e.includes('paud') || e.includes('tk')) record.jenjang = 'PAUD'
        else if (e.includes('sd') || e.includes('mi')) record.jenjang = 'SD'
        else if (e.includes('smp') || e.includes('mts')) record.jenjang = 'SMP'
        else if (e.includes('sma') || e.includes('smk') || e.includes('ma')) record.jenjang = 'SMA'
      }
      // Try to find kelas number from next line (e.g., "SMP 7")
      const nextLine = li < lines.length - 1 ? lines[li + 1] : ''
      const kelasMatch = nextLine.match(/(?:SD|SMP|SMA|MI|MTs|MA)\s+(\d{1,2})\b/i) || line.match(/(?:SD|SMP|SMA|MI|MTs|MA)\s+(\d{1,2})\b/i)
      if (kelasMatch) record.kelas = kelasMatch[1]
      record.kehadiran = extractMonthlyBooleans(line, text, records.length)
    } else if (formType === 'health') {
      record.posyandu = extra
      record.pemeriksaan = extractMonthlyBooleans(line, text, records.length)
    } else {
      record.bantuan = 'PKH Reguler'
      record.status = line.match(/tidak\s+aktif/i) ? 'Tidak Aktif' : 'Aktif'
      const amountMatch = line.match(/rp\.?\s*([\d.]+)/i)
      if (amountMatch) record.jumlahBantuan = `Rp ${amountMatch[1]}`
    }

    records.push(record)
    if (records.length >= 200) break
  }

  return records
}

// Extract 12 monthly boolean values from a record line + surrounding context
function extractMonthlyBooleans(line: string, fullText: string, _index: number): boolean[] {
  const months = new Array(12).fill(false)

  // Look for month headers in the text to understand column positions
  // For simplicity, we check if the line contains checkmarks (✓, v, x, 1) for each month
  // This is a best-effort heuristic for PDF-extracted tables

  // Check for explicit month abbreviations followed by marks
  for (let m = 0; m < 12; m++) {
    const monthLabel = MONTHS_ID[m]
    const monthRegex = new RegExp(`${monthLabel}\\s*[:\\-]?\\s*(✓|v|x|1|0|hadir|ya|tidak)`, 'i')
    const match = line.match(monthRegex) || fullText.match(monthRegex)
    if (match) {
      const mark = match[1].toLowerCase()
      months[m] = ['✓', 'v', 'x', '1', 'hadir', 'ya'].includes(mark)
    }
  }

  // If no explicit marks found, look for a row of marks after the name
  if (months.every((m) => !m)) {
    // Look for sequences of ✓/v/x/1/0/—/- on the line
    const markSequence = line.match(/([✓vx10—\-✗\s]{12,})/g)
    if (markSequence) {
      const seq = markSequence[0].replace(/\s/g, '')
      for (let i = 0; i < Math.min(12, seq.length); i++) {
        const c = seq[i]
        if (c === '✓' || c === 'v' || c === '1' || c === 'x') months[i] = true
        else if (c === '0' || c === '—' || c === '-' || c === '✗') months[i] = false
      }
    }
  }

  return months
}

// ---- Main entry: extract data from any supported file type ----
export async function extractFromDocument(
  fileBuffer: Buffer,
  filename: string
): Promise<ParseResult> {
  const ext = getExt(filename)
  if (!ext) {
    return { success: false, error: `Unsupported file type. Supported: PDF, TXT, JSON, CSV, DOCX, XLSX` }
  }

  try {
    let text = ''
    let wilayah: Partial<PKHFormData> = {}
    let records: PKHRecord[] = []
    let detectedColumns: string[] = []
    let formType: FormType = 'social'

    if (ext === 'json') {
      // Parse as JSON directly
      const rawText = fileBuffer.toString('utf-8')
      return parseJSONDocument(rawText)
    }

    if (ext === 'csv') {
      const rawText = fileBuffer.toString('utf-8')
      return parseCSVDocument(rawText)
    }

    if (ext === 'txt') {
      text = fileBuffer.toString('utf-8')
      // Try JSON first
      try {
        return parseJSONDocument(text)
      } catch {
        try {
          return parseCSVDocument(text)
        } catch {
          // fall through to text parsing
        }
      }
    } else if (ext === 'pdf') {
      if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true })
      const tmpPath = path.join(TMP_DIR, `upload-${randomUUID().slice(0, 8)}.pdf`)
      await writeFile(tmpPath, fileBuffer)
      try {
        text = await extractTextFromPDF(tmpPath)
      } finally {
        await unlink(tmpPath).catch(() => {})
      }
    } else if (ext === 'docx' || ext === 'xlsx') {
      if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true })
      const tmpPath = path.join(TMP_DIR, `upload-${randomUUID().slice(0, 8)}.${ext}`)
      await writeFile(tmpPath, fileBuffer)
      try {
        text = await extractTextFromOffice(tmpPath, ext)
      } finally {
        await unlink(tmpPath).catch(() => {})
      }
    }

    // For PDF/TXT/DOCX/XLSX: extract wilayah + form type + records from text
    wilayah = extractWilayahFromText(text)
    formType = detectFormTypeFromText(text)
    records = parseRecordsFromText(text, formType)

    if (records.length === 0) {
      return {
        success: false,
        error: `Tidak dapat menemukan data peserta (NIK) dalam dokumen. Pastikan dokumen berisi tabel dengan kolom NIK.`,
        formType,
      }
    }

    detectedColumns = extractColumnHints(text, formType)

    // Build form data — use ONLY extracted wilayah, no hardcoded defaults
    const data: PKHFormData = {
      formType,
      periode: wilayah.periode || '',
      provinsi: wilayah.provinsi || '',
      kabupaten: wilayah.kabupaten || '',
      kecamatan: wilayah.kecamatan || '',
      kelurahan: wilayah.kelurahan || '',
      facilitator: wilayah.facilitator || '',
      nipFacilitator: wilayah.nipFacilitator || '',
      records,
      // Track source for cross-check display
      ...(wilayah.provinsi ? {} : {}),
    } as PKHFormData

    return {
      success: true,
      formType,
      data,
      detectedColumns,
      totalRecords: records.length,
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Document extraction failed',
    }
  }
}

// Extract column hints from text for display
function extractColumnHints(text: string, formType: FormType): string[] {
  const cols = ['No', 'NIK', 'Nama']
  if (formType === 'education') {
    cols.push('Sekolah', 'Kelas', 'Jenjang', 'Kehadiran (12 bulan)', 'QTY', '%')
  } else if (formType === 'health') {
    cols.push('Posyandu', 'Pemeriksaan (12 bulan)', 'QTY', '%')
  } else {
    cols.push('Bantuan', 'Jumlah', 'Status')
  }
  return cols
}

// ---- JSON parsing (no hardcoded wilayah) ----
function parseJSONDocument(rawText: string): ParseResult {
  const parsed = JSON.parse(rawText)

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    const keys = Object.keys(parsed.records[0] || {})
    const formType = (parsed.formType as FormType) || detectFormType(keys)
    const records = parsed.records.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType)
    )

    const data: PKHFormData = {
      formType,
      // Use values from file only — empty string if not present (NO hardcoded defaults)
      periode: parsed.periode ?? '',
      provinsi: parsed.provinsi ?? '',
      kabupaten: parsed.kabupaten ?? '',
      kecamatan: parsed.kecamatan ?? '',
      kelurahan: parsed.kelurahan ?? '',
      facilitator: parsed.facilitator ?? '',
      nipFacilitator: parsed.nipFacilitator ?? '',
      records,
    }

    return {
      success: true,
      formType,
      data,
      detectedColumns: keys,
      totalRecords: records.length,
    }
  }

  if (Array.isArray(parsed)) {
    const keys = Object.keys(parsed[0] || {})
    const formType = detectFormType(keys)
    const records = parsed.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType)
    )

    const data: PKHFormData = {
      formType,
      periode: '',
      provinsi: '',
      kabupaten: '',
      kecamatan: '',
      kelurahan: '',
      facilitator: '',
      nipFacilitator: '',
      records,
    }

    return {
      success: true,
      formType,
      data,
      detectedColumns: keys,
      totalRecords: records.length,
    }
  }

  return { success: false, error: 'Unsupported JSON structure' }
}

// ---- CSV parsing (no hardcoded wilayah) ----
function parseCSVDocument(rawText: string): ParseResult {
  const rows = parseCSVSimple(rawText)
  if (rows.length < 2) {
    return { success: false, error: 'CSV requires a header row and at least one data row' }
  }

  const header = rows[0]
  const dataRows = rows.slice(1)
  const formType = detectFormType(header)

  const records = dataRows.map((row, i) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = row[idx] || ''
    })
    return buildRecord(obj, i, formType)
  })

  // Try to extract wilayah from CSV header rows (first 2-3 rows before data)
  const wilayah = extractWilayahFromCSV(rows)

  const data: PKHFormData = {
    formType,
    periode: wilayah.periode ?? '',
    provinsi: wilayah.provinsi ?? '',
    kabupaten: wilayah.kabupaten ?? '',
    kecamatan: wilayah.kecamatan ?? '',
    kelurahan: wilayah.kelurahan ?? '',
    facilitator: wilayah.facilitator ?? '',
    nipFacilitator: wilayah.nipFacilitator ?? '',
    records,
  }

  return {
    success: true,
    formType,
    data,
    detectedColumns: header,
    totalRecords: records.length,
  }
}

// Look for wilayah in CSV metadata rows (rows before the actual data header)
function extractWilayahFromCSV(rows: string[][]): Partial<PKHFormData> {
  const result: Partial<PKHFormData> = {}
  // Check first 5 rows for metadata (key:value pairs)
  for (const row of rows.slice(0, 5)) {
    const joined = row.join(' ').toLowerCase()
    if (joined.includes('provinsi')) {
      const val = row.find((c) => c && !c.toLowerCase().includes('provinsi') && c.includes(' ')) || row[row.length - 1]
      if (val) result.provinsi = val.trim()
    }
    if (joined.includes('kabupaten') || joined.includes('kab.')) {
      const val = row.find((c) => c && !c.toLowerCase().includes('kabupaten') && !c.toLowerCase().includes('kab.') && c.trim().length > 2)
      if (val) result.kabupaten = val.trim()
    }
    if (joined.includes('kecamatan') || joined.includes('kec.')) {
      const val = row.find((c) => c && !c.toLowerCase().includes('kecamatan') && !c.toLowerCase().includes('kec.') && c.trim().length > 2)
      if (val) result.kecamatan = val.trim()
    }
    if (joined.includes('kelurahan') || joined.includes('desa') || joined.includes('kel.')) {
      const val = row.find((c) => c && !c.toLowerCase().includes('kelurahan') && !c.toLowerCase().includes('desa') && !c.toLowerCase().includes('kel.') && c.trim().length > 2)
      if (val) result.kelurahan = val.trim()
    }
  }
  return result
}

// ---- Helpers (moved from parser.ts to avoid circular imports) ----
function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_\-\.]+/g, '')
}

function detectFormType(keys: string[]): FormType {
  const norm = keys.map(normalizeKey)
  const has = (arr: string[], ...targets: string[]) =>
    targets.some((t) => arr.some((k) => k.includes(t)))

  if (
    has(norm, 'sekolah', 'kelas', 'jenjang', 'kehadiran') ||
    has(norm, 'namasekolah') ||
    (has(norm, 'nik') && has(norm, 'kelas'))
  ) return 'education'

  if (
    has(norm, 'posyandu', 'pemeriksaan', 'beratbadan', 'tinggibadan') ||
    has(norm, 'kesehatan')
  ) return 'health'

  if (
    has(norm, 'bantuan', 'jumlahbantuan', 'status') ||
    has(norm, 'kesejahteraan')
  ) return 'social'

  return 'social'
}

function parseCSVSimple(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++ }
      else if (char === '"') { inQuotes = false }
      else { field += char }
    } else {
      if (char === '"') { inQuotes = true }
      else if (char === ',') { current.push(field.trim()); field = '' }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') i++
        current.push(field.trim())
        rows.push(current); current = []; field = ''
      } else { field += char }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim())
    rows.push(current)
  }
  return rows.filter((r) => r.some((c) => c.length > 0))
}

function buildRecord(row: Record<string, string>, index: number, formType: FormType): PKHRecord {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const nk = normalizeKey(k)
      const found = Object.keys(row).find((rk) => normalizeKey(rk) === nk)
      if (found && row[found]) return row[found].trim()
    }
    return undefined
  }

  const record: PKHRecord = {
    no: parseInt(get('no', 'nomor', 'number') || String(index + 1), 10),
    nama: get('nama', 'name', 'namalengkap') || `Peserta ${index + 1}`,
    nik: get('nik', 'nopen') || '',
  }

  const tgl = get('tanggallahir', 'tanggal', 'tgl', 'birth')
  if (tgl) record.tanggalLahir = tgl

  const jk = get('jeniskelamin', 'jk', 'gender')?.toUpperCase()
  if (jk && (jk.startsWith('L') || jk.startsWith('P'))) {
    record.jenisKelamin = jk.startsWith('L') ? 'L' : 'P'
  }

  record.alamat = get('alamat', 'address')
  record.kecamatan = get('kecamatan', 'kec')
  record.kelurahan = get('kelurahan', 'kel', 'desa')

  if (formType === 'education') {
    record.sekolah = get('sekolah', 'namasekolah', 'school')
    record.kelas = get('kelas', 'class')
    record.jenjang = get('jenjang', 'level') || deriveJenjang(record.kelas)
    record.kehadiran = []
    for (let m = 0; m < 12; m++) {
      const monthLabel = MONTHS_ID[m].toLowerCase()
      const val = get(`m${m + 1}`, `bulan${m + 1}`, monthLabel, `${m + 1}`) || ''
      record.kehadiran.push(parseBool(val))
    }
  } else if (formType === 'health') {
    record.posyandu = get('posyandu', 'namaposyandu')
    record.beratBadan = get('beratbadan', 'bb', 'weight')
    record.tinggiBadan = get('tinggibadan', 'tb', 'height')
    record.pemeriksaan = []
    for (let m = 0; m < 12; m++) {
      const monthLabel = MONTHS_ID[m].toLowerCase()
      const val = get(`m${m + 1}`, `bulan${m + 1}`, monthLabel, `p${m + 1}`) || ''
      record.pemeriksaan.push(parseBool(val))
    }
  } else {
    record.bantuan = get('bantuan', 'jenisbantuan', 'assistance')
    record.jumlahBantuan = get('jumlahbantuan', 'jumlah', 'amount')
    record.status = get('status', 'stat') || 'Aktif'
  }

  return record
}

function deriveJenjang(kelas?: string): string {
  if (!kelas) return 'SD'
  const k = kelas.toLowerCase()
  if (k.includes('paud') || k.includes('tk')) return 'PAUD'
  if (k.includes('sd') || k.includes('mi')) return 'SD'
  if (k.includes('smp') || k.includes('mts')) return 'SMP'
  if (k.includes('sma') || k.includes('smk') || k.includes('ma')) return 'SMA'
  return 'SD'
}
