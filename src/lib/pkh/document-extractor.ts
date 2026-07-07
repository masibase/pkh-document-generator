// PKH Document Extractor
// Extracts text from PDF/TXT/DOCX/XLSX files and parses wilayah + form type + records
// Quarterly (Triwulan) model — matches Form Verifikasi Komitmen template
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync, accessSync, constants } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  FormType, PKHFormData, PKHRecord, ParseResult, MonthAttendance,
  TRIWULAN_MONTHS, DEFAULT_HARI_EFEKTIF,
} from './types'
import { randomMonthAttendance } from './form-generator'

const execFileAsync = promisify(execFile)
const PDF_SKILL_DIR = path.join(process.cwd(), 'skills', 'pdf')
const EXTRACT_TEXT = path.join(PDF_SKILL_DIR, 'scripts', 'pdf.py')
const TMP_DIR = path.join(process.cwd(), 'tmp', 'pkh-upload')

// Robust Python binary resolution — try multiple known absolute paths first,
// then fall back to PATH lookup. This prevents "Executable not found in $PATH"
// errors when the dev server's PATH doesn't include standard binary dirs.
const PYTHON_CANDIDATES = [
  '/home/z/.venv/bin/python3',  // venv with pdfplumber/pikepdf (preferred)
  '/usr/bin/python3',            // system python3 (fallback)
  '/usr/local/bin/python3',      // alt install location
]
let _resolvedPython: string | null = null
function getPythonBin(): string {
  if (_resolvedPython) return _resolvedPython
  const tried: string[] = []
  for (const candidate of PYTHON_CANDIDATES) {
    tried.push(candidate)
    try {
      if (existsSync(candidate)) {
        // Verify it's actually executable
        accessSync(candidate, constants.X_OK)
        _resolvedPython = candidate
        console.log(`[pkh] Python resolved: ${candidate}`)
        return candidate
      } else {
        console.log(`[pkh] Python candidate missing: ${candidate}`)
      }
    } catch (e) {
      console.log(`[pkh] Python candidate not executable: ${candidate} (${e instanceof Error ? e.message : 'unknown'})`)
    }
  }
  // Last resort: rely on PATH lookup
  _resolvedPython = 'python3'
  console.warn(`[pkh] WARNING: No absolute Python path found. Tried: ${tried.join(', ')}. Falling back to 'python3' PATH lookup.`)
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
  const pythonBin = getPythonBin()
  try {
    const { stdout } = await execFileAsync(
      pythonBin,
      [EXTRACT_TEXT, 'extract.text', filePath],
      { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }
    )
    const result = JSON.parse(stdout)
    if (result.status !== 'success') {
      throw new Error(result.message || 'PDF text extraction failed')
    }
    return (result.data.pages || []).map((p: { text: string }) => p.text).join('\n')
  } catch (err) {
    // Re-throw with a clearer message if the executable itself wasn't found
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOENT|not found|spawn/i.test(msg)) {
      throw new Error(`Python executable not available (${pythonBin}). Cannot extract PDF text.`)
    }
    throw err
  }
}

// ---- DOCX/XLSX → PDF → text via LibreOffice (convert.office) ----
export async function extractTextFromOffice(filePath: string, ext: 'docx' | 'xlsx'): Promise<string> {
  const pythonBin = getPythonBin()
  const outDir = path.dirname(filePath)
  try {
    const { stdout } = await execFileAsync(
      pythonBin,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOENT|not found|spawn/i.test(msg)) {
      throw new Error(`Python executable not available (${pythonBin}). Cannot convert .${ext} file.`)
    }
    throw err
  }
}

// ---- Wilayah extraction from text ----
// Handles both "Provinsi : Jawa Barat" (label: value) and
// "Kec. Kraton, Kab. Pasuruan, Prov. Jawa Timur" (comma-separated single line)
export function extractWilayahFromText(text: string): Partial<PKHFormData> {
  const result: Partial<PKHFormData> = {}

  // Strategy: find each field label and capture up to the next comma+label or end of line
  // This handles "Kec. Kraton, Kab. Pasuruan, Prov. Jawa Timur" → Kecamatan=Kraton, Kab=Pasuruan, Prov=Jawa Timur
  // Labels: "provinsi" or "prov." (with period). Use lookahead for separator to handle
  // the period correctly (period is not a word char, so \b after it fails).
  const fieldPatterns: Record<string, RegExp> = {
    provinsi: /\bprov(?:insi|\.)(?=\s|:|-|\n|,\s)/i,
    kabupaten: /\b(?:kabupaten|kab\.)(?=\s|:|-|\n|,\s)/i,
    kecamatan: /\b(?:kecamatan|kec\.)(?=\s|:|-|\n|,\s)/i,
    kelurahan: /\b(?:kelurahan|kel\.|desa)(?=\s|:|-|\n|,\s)/i,
  }

  // For each field, find the label, then capture the value up to the next comma+label or newline
  for (const [field, labelRegex] of Object.entries(fieldPatterns)) {
    const labelMatch = text.match(labelRegex)
    if (!labelMatch) continue
    const afterLabel = text.substring((labelMatch.index || 0) + labelMatch[0].length)
    // Capture value: up to comma+nextlabel, or end of line
    const valueMatch = afterLabel.match(/^\s*[:\-]?\s*([^,\n\r|]+?)(?=,?\s*(?:kec\.|kecamatan|kab\.|kabupaten|kel\.|kelurahan|desa|prov\.|provinsi|kota)(?:\s|:|-|\n|,)|,?\s*\n|,?\s*\r|$)/i)
    if (valueMatch && valueMatch[1]) {
      let value = valueMatch[1].trim().replace(/\s+/g, ' ')
      value = value
        .replace(/^(?:\/\s*(?:kota|desa)\s*[:\-]?\s*)/i, '')
        .replace(/[:\-;,.]+$/, '')
        .trim()
      if (value.length > 1 && value.length < 80) {
        ;(result as Record<string, unknown>)[field] = value
      }
    }
  }

  // Fallback: if kelurahan is empty but "Alamat : <place>" exists, use it as kelurahan/desa
  if (!result.kelurahan) {
    const alamatOnly = text.match(/\balamat\s*[:\-]?\s*([A-Za-z][^\n\r,|]{2,40}?)(?=,?\s*(?:kec|kab|prov|npsn|nik)\b|,?\s*\n|,?\s*\r|$)/i)
    if (alamatOnly && alamatOnly[1]) {
      const val = alamatOnly[1].trim().replace(/\s+/g, ' ')
      if (val.length > 2 && val.length < 50) {
        result.kelurahan = val
      }
    }
  }

  // Periode — TRIWULAN X TAHUN YYYY
  const triwulanMatch = text.match(/\btriwulan\s*(\d)\s*tahun\s*(\d{4})\b/i)
  if (triwulanMatch) {
    const triwulan = parseInt(triwulanMatch[1], 10)
    const tahun = parseInt(triwulanMatch[2], 10)
    result.triwulan = triwulan
    result.tahun = tahun
    result.periode = `TRIWULAN ${triwulan} TAHUN ${tahun}`
  } else {
    const periodeMatch = text.match(/\bperiode\s*[:\-]?\s*([^\n\r]+)/i)
    if (periodeMatch && periodeMatch[1]) {
      const val = periodeMatch[1].trim().replace(/\s+/g, ' ').substring(0, 60)
      result.periode = val
    }
  }

  // NPSN (8-digit school code)
  const npsnMatch = text.match(/\bnpsn\s*[:\-]?\s*(\d{8})\b/i)
  if (npsnMatch) result.npsn = npsnMatch[1]

  // Nama Sekolah / Posyandu / Wilayah
  const sekolahMatch = text.match(/\bnama\s+sekolah\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:alamat|kec|kab|prov|npsn|nik)\b|\n|\r|$)/i)
  if (sekolahMatch && sekolahMatch[1]) {
    result.namaSekolah = sekolahMatch[1].trim().replace(/\s+/g, ' ').substring(0, 100)
  }

  // Alamat Sekolah
  const alamatMatch = text.match(/\balamat\s*[:\-]?\s*([^\n\r|]+?)(?=\s+(?:kec|kab|prov|npsn|nik)\b|\n|\r|$)/i)
  if (alamatMatch && alamatMatch[1]) {
    result.alamatSekolah = alamatMatch[1].trim().replace(/\s+/g, ' ').substring(0, 120)
  }

  // Signer role — look for role labels near a NIP line
  const signerRoleMatch = text.match(/\b(kepala\s+sekolah|kepala\s+desa|kepala\s+lurah|koordinator\s+pkh|pendamping\s+pkh)\b/i)
  if (signerRoleMatch) {
    result.signerRole = signerRoleMatch[1].trim()
  }

  // Signer NIP — find any NIP line and clean it (remove stray letters/spaces from stamp overlap)
  // Example garbled: "NIP. 196 T807151993031008" → "196807151993031008"
  const nipLineMatch = text.match(/\bNIP\.?\s*[:\-]?\s*([\d\sA-Za-z]{16,24})/i)
  if (nipLineMatch && nipLineMatch[1]) {
    // Keep only digits, then validate length
    const cleaned = nipLineMatch[1].replace(/\D/g, '')
    if (cleaned.length >= 16 && cleaned.length <= 18) {
      result.signerNIP = cleaned
    }
  }

  // Signer name — look for a capitalized name between role label and NIP
  // The name may have stamp text overlapping (garbled), so find the best name-like pattern
  if (signerRoleMatch) {
    const roleEnd = (signerRoleMatch.index || 0) + signerRoleMatch[0].length
    const nipIdx = text.indexOf('NIP', roleEnd)
    if (nipIdx > roleEnd) {
      const between = text.substring(roleEnd, nipIdx)
      // Match an Indonesian name: optional honorific + 2+ capitalized words + optional academic titles
      // e.g. "H. MOH. HANSAN, S.Pd.I, M.Pd"
      // Find ALL matches and pick the best name candidate
      const namePattern = /(?:(?:H\.|Hj\.|Drs\.|Dr\.|KH\.)\s+)?[A-Z][A-Za-z.']+(?:\s+[A-Z][A-Za-z.']*){1,6}(?:,?\s*(?:S\.Pd\.I|S\.Pd|S\.Ag|S\.Si|S\.Sos|S\.Kom|M\.Pd|M\.Si|M\.Sc|M\.A|M\.Pd\.I|M\.Ag|B\.A|Ph\.D))?/g
      const allMatches = between.match(namePattern) || []
      // Score each match: prefer names with academic titles, penalize garbled text
      // (too many single-letter words = stamp overlap noise)
      const headerWords = /^(Form|Dokumen|Status|Periode|Alamat|NPSN|Nama|Sekolah|Kementerian|Program|Direktorat|Catatan|Mengetahui|Triwulan|Tahun|Verifikasi|Komitmen|Pendidikan|Kesehatan|Kesejahteraan|Sosial|Pendamping|Koordinator|Kepala|Desa|Lurah|Provinsi|Kabupaten|Kecamatan|Kelurahan|Bentuk|Tingkat|Hari|Efektif|Alpa|Izin|Sakit|Jml|Persentase|Keterangan|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|Tangan|Tanda|Diverifikasi|Ditandatangani|Secara|Elektronik|Menggunakan|Sertifikat|Badan|Siber|Sandi|Negara|Keaslian|Dapat|Melalui|Validasi|Disahkan|BSrE|PKH|RI)$/i
      const scored = allMatches
        .map((m) => {
          const trimmed = m.trim()
          const words = trimmed.split(/\s+/)
          // Count single-letter words (excluding honorifics like "H.")
          const singleLetters = words.filter((w) => w.length === 1 && !/^[HK]$/.test(w)).length
          const hasTitle = /\.(Pd|Ag|Si|Sos|Kom|Sc|A)\b/.test(trimmed) || /\b(Drs|Dr|Ph)\./.test(trimmed)
          const isHeader = headerWords.test(trimmed)
          let score = trimmed.length
          if (hasTitle) score += 50 // strong preference for academic titles
          score -= singleLetters * 10 // penalize garbled single-letter words
          if (isHeader) score -= 100
          if (singleLetters >= 2) score -= 50 // heavily penalize 2+ single letters
          return { name: trimmed, score }
        })
        .filter((s) => s.score > 0 && s.name.length > 5)
        .sort((a, b) => b.score - a.score)
      if (scored.length > 0) {
        result.signerName = scored[0].name.replace(/\s+/g, ' ').substring(0, 80)
      }
    }
  }

  // Facilitator (Pendamping PKH) name — appears in table rows after "Hadir" keyword
  const facMatch = text.match(/\bhadir\s+([A-Z][A-Z\.'\s]{3,40}?)(?=\s*(?:catatan|mengetahui|kepala|nip|form|dokumen|\n|\r))/i)
  if (facMatch && facMatch[1]) {
    const val = facMatch[1].trim().replace(/\s+/g, ' ')
    if (val.length > 3 && val.length < 50) result.facilitator = val
  }

  return result
}

// ---- Form type detection from free text ----
export function detectFormTypeFromText(text: string): FormType {
  const lower = text.toLowerCase()

  const eduScore =
    (lower.match(/pendidikan/g)?.length || 0) * 3 +
    (lower.match(/sekolah/g)?.length || 0) * 2 +
    (lower.match(/kelas\b/g)?.length || 0) +
    (lower.match(/jenjang|tingkat/g)?.length || 0) +
    (lower.match(/\b(sd|smp|sma|smk|mi|mts|ma|madrasah)\b/g)?.length || 0) * 2 +
    (lower.match(/nisn|npsn/g)?.length || 0) * 2

  const healthScore =
    (lower.match(/kesehatan/g)?.length || 0) * 2 +
    (lower.match(/posyandu/g)?.length || 0) * 3 +
    (lower.match(/pemeriksaan/g)?.length || 0) * 2 +
    (lower.match(/berat\s*badan|\bbb\b/g)?.length || 0) +
    (lower.match(/tinggi\s*badan|\btb\b/g)?.length || 0) +
    (lower.match(/keluarga\s+sehat/g)?.length || 0) * 2

  const socialScore =
    (lower.match(/kesejahteraan\s+sosial/g)?.length || 0) * 3 +
    (lower.match(/\bbantuan\b/g)?.length || 0) * 2 +
    (lower.match(/penerima\s+bantuan/g)?.length || 0) * 2 +
    (lower.match(/jumlah\s*bantuan/g)?.length || 0) +
    (lower.match(/\baktif\b|\btidak\s+aktif\b/g)?.length || 0)

  if (eduScore >= healthScore && eduScore >= socialScore && eduScore > 0) return 'education'
  if (healthScore >= socialScore && healthScore > 0) return 'health'
  if (socialScore > 0) return 'social'
  return 'social'
}

// ---- Parse ACTUAL attendance data from extracted text ----
// PDF structure (Triwulan = 3 months):
//   Line: "APRIL MEI JUNI"
//   Line: "Hari Efektif : 22 Hari Efektif : 20 Hari Efektif : 22 Keterangan Nama Pendamping"
//   Line: "ALPA IZIN SAKIT JML % ALPA IZIN SAKIT JML % ALPA IZIN SAKIT JML %"
//   Line: "0 0 1 21 95% 0 0 0 20 100% 0 1 0 21 95% Hadir ABDUL BASRI"
// Returns: { hariEfektifPerMonth[], attendanceRows[] }
export interface ParsedAttendanceRow {
  bulan: MonthAttendance[]
  keterangan: string
  namaPendamping: string
}
export function parseAttendanceFromText(
  text: string,
  months: string[]
): { hariEfektif: number[]; rows: ParsedAttendanceRow[] } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)

  // 1) Extract Hari Efektif values (3 values, one per month)
  //    Pattern: "Hari Efektif : 22" (may appear 3 times on one line or separate lines)
  const hariEfektifVals: number[] = []
  const heRegex = /hari\s*efektif\s*[:\-]?\s*(\d{1,2})/gi
  let heMatch: RegExpExecArray | null
  while ((heMatch = heRegex.exec(text)) !== null) {
    const v = parseInt(heMatch[1], 10)
    if (v > 0 && v <= 31) hariEfektifVals.push(v)
  }
  // Pad to 3 if fewer found
  while (hariEfektifVals.length < 3) {
    hariEfektifVals.push(hariEfektifVals[hariEfektifVals.length - 1] || 22)
  }

  // 2) Extract attendance data rows
  // A valid attendance line has 15 numbers: [A I S JML %] × 3 months
  // Percent values have "%" suffix. Line may also contain "Hadir"/"Tidak Hadir" + name.
  // Pattern: "0 0 1 21 95% 0 0 0 20 100% 0 1 0 21 95% Hadir ABDUL BASRI"
  const rows: ParsedAttendanceRow[] = []
  // Match 3 groups of (num num num num num%)
  const attRegex = /(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*%/

  for (const line of lines) {
    // Skip header lines
    if (/^(hari\s*efektif|alpa|izin|sakit|jml|no|nik|nama|form|program|periode|catatan|mengetahui|kepala|nip|dokumen|status)/i.test(line)) continue
    // Must start with a digit (attendance values)
    if (!/^\d/.test(line)) continue

    const m = line.match(attRegex)
    if (!m) continue

    const nums = m.slice(1, 16).map((n) => parseInt(n, 10))
    // Group into 3 months: [A,I,S,JML,%]
    const bulan: MonthAttendance[] = []
    for (let mi = 0; mi < 3; mi++) {
      const base = mi * 5
      const alpa = nums[base]
      const izin = nums[base + 1]
      const sakit = nums[base + 2]
      const jml = nums[base + 3]
      const percent = nums[base + 4]
      bulan.push({
        nama: months[mi] || `BULAN${mi + 1}`,
        hariEfektif: hariEfektifVals[mi] || 22,
        alpa,
        izin,
        sakit,
        jml,
        percent,
      })
    }

    // Extract Keterangan (Hadir / Tidak Hadir) from text after the attendance numbers
    const afterAtt = line.substring(m.index! + m[0].length).trim()
    let keterangan = 'Hadir'
    const ketMatch = afterAtt.match(/(hadir|tidak\s+hadir)/i)
    if (ketMatch) {
      keterangan = ketMatch[1].replace(/\s+/g, ' ').trim()
      keterangan = keterangan.charAt(0).toUpperCase() + keterangan.slice(1).toLowerCase()
    }

    // Extract Nama Pendamping: text after keterangan, uppercase words
    let namaPendamping = ''
    if (ketMatch && ketMatch.index !== undefined) {
      const afterKet = afterAtt.substring(ketMatch.index + ketMatch[0].length).trim()
      // Take uppercase words (Indonesian names are typically all-caps in these forms)
      const nameMatch = afterKet.match(/([A-Z][A-Z\.'\s]{2,40})/)
      if (nameMatch) {
        namaPendamping = nameMatch[1].trim().replace(/\s+/g, ' ')
      }
    }

    rows.push({ bulan, keterangan, namaPendamping })
  }

  return { hariEfektif: hariEfektifVals, rows }
}

// ---- Parse records from extracted text table ----
// Looks for NIK (14-18 digit) patterns and builds student/participant records
export function parseRecordsFromText(
  text: string,
  formType: FormType,
  months: string[],
  hariEfektif = DEFAULT_HARI_EFEKTIF
): PKHRecord[] {
  const records: PKHRecord[] = []
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)

  // Pre-parse ACTUAL attendance data from the document (not random)
  // Falls back to random only when no attendance data is found in the file
  const { rows: attRows } = parseAttendanceFromText(text, months)

  // NIK = 14-18 digit number
  const nikRegex = /\b(\d{14,18})\b/

  // Collect all NIKs in order of appearance (deduplicated)
  const seenNiks = new Set<string>()

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    // Skip NIP signature lines
    if (/^\s*nip\.?\s/i.test(line)) continue
    if (/^(kepala\s+sekolah|kepala\s+desa|pendamping\s+pkh|koordinator\s+pkh|mengetahui|disusun|menyetujui|catatan|dokumen|status|form|program|periode|alamat|npsn|nama\s+sekolah|direktorat|kementerian)/i.test(line)) continue

    const nikMatch = line.match(nikRegex)
    if (!nikMatch) continue

    const nik = nikMatch[1]
    if (seenNiks.has(nik)) continue
    seenNiks.add(nik)

    const beforeNik = line.substring(0, nikMatch.index || 0).trim()
    const afterNik = line.substring((nikMatch.index || 0) + nik.length).trim()

    // Extract No
    const noMatch = beforeNik.match(/(\d+)\s*$/)
    const no = noMatch ? parseInt(noMatch[1], 10) : records.length + 1

    // Find all NIKs (14-18 digit) and NISN (10 digit) on the line
    // Pattern from PDF: "1 3526024107900229 SOFIYATUL 3526020412090003 0095992329 MOH. QORRIFARDAN MA Kelas 10"
    const allNiks = line.match(/\b\d{14,18}\b/g) || []
    const allNisn = line.match(/\b\d{10}\b/g) || []

    let nikPengurus = ''
    let nikSiswa = nik
    let nisn = ''
    let namaPengurus = ''
    let nama = ''

    if (formType === 'education' && allNiks.length >= 2) {
      // Structured education row: No NIKPengurus NamaPengurus NIKSiswa NISN NamaSiswa Bentuk Tingkat
      nikPengurus = allNiks[0]
      nikSiswa = allNiks[1]
      // NISN is the 10-digit number after the second NIK
      nisn = allNisn.find((n) => {
        const pos = line.indexOf(n)
        return pos > line.indexOf(nikSiswa)
      }) || allNisn[0] || ''

      // Nama Pengurus = text between first NIK and second NIK
      const p1 = line.indexOf(nikPengurus)
      const p2 = line.indexOf(nikSiswa, p1 + nikPengurus.length)
      if (p2 > p1) {
        namaPengurus = line.substring(p1 + nikPengurus.length, p2).trim()
        if (namaPengurus.length > 40) namaPengurus = namaPengurus.substring(0, 40)
      }

      // Nama Siswa = text after NISN up to the Bentuk Pendidikan keyword
      if (nisn) {
        const nisnPos = line.indexOf(nisn, p2)
        if (nisnPos >= 0) {
          let afterNisn = line.substring(nisnPos + nisn.length).trim()
          // Stop at bentuk pendidikan keywords (SD, SMP, SMA, MA, MTs, MI, PAUD, TK) or "Kelas"
          const bentukStop = afterNisn.match(/\s+(?:SDN?|SMPN?|SMAN?|SMKN?|MTsN?|MAN?|MIN?|PAUD|TK|Madrasah)\b/i)
          if (bentukStop && bentukStop.index !== undefined) {
            nama = afterNisn.substring(0, bentukStop.index).trim()
          } else {
            // No bentuk found — take up to "Kelas" or first digit
            const kelasStop = afterNisn.match(/\s+Kelas\s/i)
            if (kelasStop && kelasStop.index !== undefined) {
              nama = afterNisn.substring(0, kelasStop.index).trim()
            } else {
              nama = afterNisn.split(/\s{2,}/)[0].trim()
            }
          }
        }
      }
    } else {
      // Single-NIK row (health/social/simple): name from previous line or after NIK
      if (li > 0) {
        const prevLine = lines[li - 1]
        if (
          prevLine.length > 2 &&
          prevLine.length < 60 &&
          !nikRegex.test(prevLine) &&
          !/^\s*nip\.?\s/i.test(prevLine) &&
          !/^(no|nama|nik|sekolah|posyandu|kecamatan|kelurahan|provinsi|kabupaten|kehadiran|pemeriksaan|bantuan|status|periode|total|kategori|formulir|kementerian|program|direktorat|catatan|hadir|tidak|qty|persentase|jenis|jumlah|alpa|izin|sakit|jml|hari|efektif|keterangan|pendamping|april|mei|juni|juli|agustus|september|oktober|november|desember|januari|februari|maret|triwulan|tahun|nisn|npsn|bentuk|pendidikan|tingkat|verifikasi|komitmen)/i.test(prevLine) &&
          /[A-Za-z]/.test(prevLine) &&
          !/\d{4,}/.test(prevLine)
        ) {
          nama = prevLine.replace(/[—\-•]+$/, '').trim()
        }
      }
      if (!nama) {
        const namePart = afterNik.split(/\s{2,}|\n|—|–/)[0] || ''
        if (namePart.length > 2 && /[A-Za-z]/.test(namePart) && !/^\d/.test(namePart)) {
          nama = namePart.trim()
        }
      }
      if (!nama) {
        const words = afterNik.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
        if (words.length > 0) nama = words.slice(0, 3).join(' ')
      }
    }

    nama = nama.replace(/[\d%]+$/, '').replace(/[—\-•]+$/, '').trim()
    if (nama.length > 50) nama = nama.substring(0, 50)
    if (!nama || nama.length < 2) continue

    // Tingkat/Kelas and Bentuk Pendidikan
    let tingkat = ''
    let bentukPendidikan = ''
    if (formType === 'education') {
      const kelasMatch = line.match(/(?:kelas|kls)\s*(\d{1,2})/i)
      if (kelasMatch) tingkat = `Kelas ${kelasMatch[1]}`
      const bentukMatch = line.match(/\b(SDN?|SMPN?|SMAN?|SMKN?|MTs?N?|MA[N]?|MI[N]?|PAUD|TK)\b/i)
      if (bentukMatch) bentukPendidikan = bentukMatch[1].toUpperCase()
    }

    // Posyandu (health)
    let posyandu = ''
    if (formType === 'health') {
      const posMatch = line.match(/posyandu\s+\w+/i)
      if (posMatch) posyandu = posMatch[0]
    }

    // Build the record
    // Use ACTUAL attendance data from the document if available (matched by row order).
    // Only fall back to random when the document has no attendance data.
    const attIdx = records.length // 0-based index matching attendance row to student row
    const parsedAtt = attRows[attIdx]
    const record: PKHRecord = {
      no,
      nama,
      nik: nikSiswa,
      bulan: parsedAtt
        ? parsedAtt.bulan
        : months.map((m) => randomMonthAttendance(m, hariEfektif)),
      keterangan: parsedAtt?.keterangan || 'Hadir',
      namaPendamping: parsedAtt?.namaPendamping || '',
    }

    if (nikPengurus) record.nikPengurus = nikPengurus
    if (namaPengurus) record.namaPengurus = namaPengurus
    if (nisn) record.nisn = nisn
    if (tingkat) record.tingkat = tingkat
    if (bentukPendidikan) record.bentukPendidikan = bentukPendidikan
    if (formType === 'education') {
      record.sekolah = ''
    }
    if (formType === 'health' && posyandu) record.posyandu = posyandu
    if (formType === 'social') {
      record.jenisBantuan = 'PKH Reguler'
      record.status = 'Aktif'
    }

    records.push(record)
    if (records.length >= 200) break
  }

  return records
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
      const rawText = fileBuffer.toString('utf-8')
      return parseJSONDocument(rawText)
    }
    if (ext === 'csv') {
      const rawText = fileBuffer.toString('utf-8')
      return parseCSVDocument(rawText)
    }
    if (ext === 'txt') {
      text = fileBuffer.toString('utf-8')
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

    // Determine months from triwulan (default Triwulan 2)
    const triwulan = wilayah.triwulan || 2
    const months = TRIWULAN_MONTHS[triwulan] || TRIWULAN_MONTHS[2]
    const hariEfektif = DEFAULT_HARI_EFEKTIF

    records = parseRecordsFromText(text, formType, months, hariEfektif)

    if (records.length === 0) {
      return {
        success: false,
        error: `Tidak dapat menemukan data peserta (NIK) dalam dokumen. Pastikan dokumen berisi tabel dengan kolom NIK.`,
        formType,
      }
    }

    detectedColumns = extractColumnHints(text, formType)

    // Build form data — use ONLY extracted wilayah, no hardcoded defaults
    // Facilitator fallback: use namaPendamping from first parsed attendance row
    const facilitatorFromAtt = records.find((r) => r.namaPendamping)?.namaPendamping || ''
    const data: PKHFormData = {
      formType,
      periode: wilayah.periode || `TRIWULAN 2 TAHUN ${new Date().getFullYear()}`,
      triwulan: wilayah.triwulan || 2,
      tahun: wilayah.tahun || new Date().getFullYear(),
      provinsi: wilayah.provinsi || '',
      kabupaten: wilayah.kabupaten || '',
      kecamatan: wilayah.kecamatan || '',
      kelurahan: wilayah.kelurahan || '',
      npsn: wilayah.npsn || '',
      namaSekolah: wilayah.namaSekolah || '',
      alamatSekolah: wilayah.alamatSekolah || '',
      signerName: wilayah.signerName || '',
      signerNIP: wilayah.signerNIP || '',
      signerRole: wilayah.signerRole || (formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa'),
      facilitator: wilayah.facilitator || facilitatorFromAtt || '',
      nipFacilitator: wilayah.nipFacilitator || '',
      records,
      months,
    }

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

function extractColumnHints(text: string, formType: FormType): string[] {
  const cols = ['No', 'NIK', 'Nama']
  if (formType === 'education') {
    cols.push('NIK Pengurus', 'Nama Pengurus', 'NISN', 'Tingkat', 'Bentuk Pendidikan')
  } else if (formType === 'health') {
    cols.push('Posyandu', 'BB/TB')
  } else {
    cols.push('Alamat', 'Jenis Bantuan', 'Status')
  }
  cols.push('Hari Efektif', 'Alpa', 'Izin', 'Sakit', 'JML', '%')
  return cols
}

// ---- JSON parsing (quarterly model, no hardcoded wilayah) ----
function parseJSONDocument(rawText: string): ParseResult {
  const parsed = JSON.parse(rawText)

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    const keys = Object.keys(parsed.records[0] || {})
    const formType = (parsed.formType as FormType) || detectFormTypeFromText(rawText)
    const triwulan = parsed.triwulan || 2
    const months = parsed.months || TRIWULAN_MONTHS[triwulan] || TRIWULAN_MONTHS[2]
    const hariEfektif = parsed.hariEfektif || DEFAULT_HARI_EFEKTIF

    const records = parsed.records.map((r: Record<string, unknown>, i: number) =>
      buildRecordFromObj(r, i, formType, months, hariEfektif)
    )

    const data: PKHFormData = {
      formType,
      periode: parsed.periode ?? `TRIWULAN ${triwulan} TAHUN ${new Date().getFullYear()}`,
      triwulan,
      tahun: parsed.tahun || new Date().getFullYear(),
      provinsi: parsed.provinsi ?? '',
      kabupaten: parsed.kabupaten ?? '',
      kecamatan: parsed.kecamatan ?? '',
      kelurahan: parsed.kelurahan ?? '',
      npsn: parsed.npsn ?? '',
      namaSekolah: parsed.namaSekolah ?? '',
      alamatSekolah: parsed.alamatSekolah ?? '',
      signerName: parsed.signerName ?? '',
      signerNIP: parsed.signerNIP ?? '',
      signerRole: parsed.signerRole ?? (formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa'),
      facilitator: parsed.facilitator ?? '',
      nipFacilitator: parsed.nipFacilitator ?? '',
      records,
      months,
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
    const formType = detectFormTypeFromText(rawText)
    const months = TRIWULAN_MONTHS[2]
    const records = parsed.map((r: Record<string, unknown>, i: number) =>
      buildRecordFromObj(r, i, formType, months, DEFAULT_HARI_EFEKTIF)
    )

    const data: PKHFormData = {
      formType,
      periode: `TRIWULAN 2 TAHUN ${new Date().getFullYear()}`,
      triwulan: 2,
      tahun: new Date().getFullYear(),
      provinsi: '',
      kabupaten: '',
      kecamatan: '',
      kelurahan: '',
      signerName: '',
      signerNIP: '',
      signerRole: formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa',
      facilitator: '',
      nipFacilitator: '',
      records,
      months,
    }

    return { success: true, formType, data, detectedColumns: keys, totalRecords: records.length }
  }

  return { success: false, error: 'Unsupported JSON structure' }
}

// ---- CSV parsing (quarterly model, no hardcoded wilayah) ----
function parseCSVDocument(rawText: string): ParseResult {
  const rows = parseCSVSimple(rawText)
  if (rows.length < 2) {
    return { success: false, error: 'CSV requires a header row and at least one data row' }
  }

  const header = rows[0]
  const dataRows = rows.slice(1)
  const formType = detectFormType(header)
  const triwulan = 2
  const months = TRIWULAN_MONTHS[triwulan]
  const hariEfektif = DEFAULT_HARI_EFEKTIF

  const records = dataRows.map((row, i) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = row[idx] || '' })
    return buildRecordFromObj(obj as Record<string, unknown>, i, formType, months, hariEfektif)
  })

  const wilayah = extractWilayahFromCSV(rows)

  const data: PKHFormData = {
    formType,
    periode: wilayah.periode ?? `TRIWULAN 2 TAHUN ${new Date().getFullYear()}`,
    triwulan,
    tahun: new Date().getFullYear(),
    provinsi: wilayah.provinsi ?? '',
    kabupaten: wilayah.kabupaten ?? '',
    kecamatan: wilayah.kecamatan ?? '',
    kelurahan: wilayah.kelurahan ?? '',
    signerName: wilayah.signerName ?? '',
    signerNIP: wilayah.signerNIP ?? '',
    signerRole: formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa',
    facilitator: wilayah.facilitator ?? '',
    nipFacilitator: wilayah.nipFacilitator ?? '',
    records,
    months,
  }

  return { success: true, formType, data, detectedColumns: header, totalRecords: records.length }
}

function extractWilayahFromCSV(rows: string[][]): Partial<PKHFormData> {
  const result: Partial<PKHFormData> = {}
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

// ---- Helpers ----
function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_\-\.]+/g, '')
}

function detectFormType(keys: string[]): FormType {
  const norm = keys.map(normalizeKey)
  const has = (arr: string[], ...targets: string[]) =>
    targets.some((t) => arr.some((k) => k.includes(t)))

  if (
    has(norm, 'sekolah', 'kelas', 'jenjang', 'tingkat', 'nisn', 'npsn') ||
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

// Build a PKHRecord from a keyed object (JSON row or CSV row)
function buildRecordFromObj(
  row: Record<string, unknown>,
  index: number,
  formType: FormType,
  months: string[],
  hariEfektif: number
): PKHRecord {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const nk = normalizeKey(k)
      const found = Object.keys(row).find((rk) => normalizeKey(rk) === nk)
      if (found && row[found]) return String(row[found]).trim()
    }
    return undefined
  }

  const record: PKHRecord = {
    no: parseInt(get('no', 'nomor', 'number') || String(index + 1), 10),
    nama: get('nama', 'name', 'namasiswa', 'namalengkap', 'namapeserta') || `Peserta ${index + 1}`,
    nik: get('nik', 'niksiswa', 'nopen') || '',
    bulan: months.map((m) => randomMonthAttendance(m, hariEfektif)),
  }

  // Pendidikan
  record.nikPengurus = get('nikpengurus', 'nikkeluarga')
  record.namaPengurus = get('namapengurus', 'namakeluarga')
  record.nisn = get('nisn')
  record.tingkat = get('tingkat', 'kelas', 'class')
  record.bentukPendidikan = get('bentukpendidikan', 'jenjang', 'level') || deriveBentuk(record.tingkat)
  record.sekolah = get('sekolah', 'namasekolah', 'school')

  // Kesehatan
  record.posyandu = get('posyandu', 'namaposyandu')
  record.beratBadan = get('beratbadan', 'bb', 'weight')
  record.tinggiBadan = get('tinggibadan', 'tb', 'height')

  // Kesejahteraan Sosial
  if (formType === 'social') {
    record.jenisBantuan = get('bantuan', 'jenisbantuan', 'assistance') || 'PKH Reguler'
    record.jumlahBantuan = get('jumlahbantuan', 'jumlah', 'amount')
    record.status = get('status', 'stat') || 'Aktif'
  }

  // Common
  record.alamat = get('alamat', 'address')
  record.kelurahan = get('kelurahan', 'kel', 'desa')
  record.kecamatan = get('kecamatan', 'kec')
  record.namaPendamping = get('namapendamping', 'pendamping')
  record.keterangan = 'Hadir'

  const jk = get('jeniskelamin', 'jk', 'gender')?.toUpperCase()
  if (jk && (jk.startsWith('L') || jk.startsWith('P'))) {
    record.jenisKelamin = jk.startsWith('L') ? 'L' : 'P'
  }
  const tgl = get('tanggallahir', 'tanggal', 'tgl', 'birth')
  if (tgl) record.tanggalLahir = tgl

  // Allow explicit bulan override from JSON
  const bulanRaw = (row as Record<string, unknown>)['bulan']
  if (Array.isArray(bulanRaw) && bulanRaw.length === 3) {
    record.bulan = (bulanRaw as Array<Record<string, number>>).map((b, i) => {
      const he = b.hariEfektif ?? hariEfektif
      const alpa = b.alpa ?? 0
      const izin = b.izin ?? 0
      const sakit = b.sakit ?? 0
      const jml = b.jml ?? Math.max(0, he - alpa - izin - sakit)
      const percent = b.percent ?? Math.round((jml / he) * 100)
      return { nama: months[i] || b.nama || '', hariEfektif: he, alpa, izin, sakit, jml, percent }
    })
  }

  return record
}

function deriveBentuk(tingkat?: string): string {
  if (!tingkat) return ''
  const k = tingkat.toLowerCase()
  if (k.includes('paud') || k.includes('tk')) return 'PAUD'
  if (k.includes('sd') || k.includes('mi')) return 'MI'
  if (k.includes('smp') || k.includes('mts')) return 'MTs'
  if (k.includes('sma') || k.includes('smk') || k.includes('ma')) return 'MA'
  return ''
}
