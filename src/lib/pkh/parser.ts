// PKH Data Parser - reads JSON/CSV and auto-detects form type
import { FormType, PKHFormData, PKHRecord, ParseResult, MONTHS_ID } from './types'

// Normalize a header key for matching
function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_\-\.]+/g, '')
}

// Detect form type based on detected columns / keys
export function detectFormType(keys: string[]): FormType {
  const norm = keys.map(normalizeKey)
  const has = (arr: string[], ...targets: string[]) =>
    targets.some((t) => arr.some((k) => k.includes(t)))

  // Education indicators
  if (
    has(norm, 'sekolah', 'kelas', 'jenjang', 'kehadiran') ||
    has(norm, 'nama sekolah') ||
    (has(norm, 'nik') && has(norm, 'kelas'))
  ) {
    return 'education'
  }

  // Health indicators
  if (
    has(norm, 'posyandu', 'pemeriksaan', 'beratbadan', 'tinggibadan') ||
    has(norm, 'kesehatan')
  ) {
    return 'health'
  }

  // Social welfare indicators
  if (
    has(norm, 'bantuan', 'jumlahbantuan', 'status') ||
    has(norm, 'kesejahteraan')
  ) {
    return 'social'
  }

  // Default fallback
  return 'social'
}

// Parse CSV text (simple parser supporting quoted fields)
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        current.push(field.trim())
        field = ''
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') i++
        current.push(field.trim())
        rows.push(current)
        current = []
        field = ''
      } else {
        field += char
      }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim())
    rows.push(current)
  }
  return rows.filter((r) => r.some((c) => c.length > 0))
}

// Parse a boolean-ish value: "1", "true", "ya", "hadir", "v", "x", "✓"
function parseBool(val: string): boolean {
  const v = val.toLowerCase().trim()
  return ['1', 'true', 'ya', 'hadir', 'v', 'x', '✓', 'check', 'lunas', 'selesai', 'baik'].includes(v)
}

// Build a PKHRecord from a row object (keyed by header)
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

    // 12-month attendance - detect columns m1..m12 or jan..des
    record.kehadiran = []
    for (let m = 0; m < 12; m++) {
      const monthLabel = MONTHS_ID[m].toLowerCase()
      const val =
        get(`m${m + 1}`, `bulan${m + 1}`, monthLabel, `${m + 1}`) || ''
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

// Main parse entry: accepts raw text and file extension
export function parsePKHData(
  rawText: string,
  fileExt: 'json' | 'csv' = 'json'
): ParseResult {
  try {
    if (fileExt === 'json') {
      return parseJSON(rawText)
    }
    return parseCSVText(rawText)
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown parse error',
    }
  }
}

function parseJSON(rawText: string): ParseResult {
  const parsed = JSON.parse(rawText)

  // Case 1: Full structured object with meta + records
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    const keys = Object.keys(parsed.records[0] || {})
    const formType = (parsed.formType as FormType) || detectFormType(keys)
    const records = parsed.records.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType)
    )

    const data: PKHFormData = {
      formType,
      periode: parsed.periode || 'Januari - Desember 2024',
      provinsi: parsed.provinsi || 'Jawa Barat',
      kabupaten: parsed.kabupaten || 'Bandung',
      kecamatan: parsed.kecamatan || 'Coblong',
      kelurahan: parsed.kelurahan || 'Cidadap',
      facilitator: parsed.facilitator || 'Siti Aminah, S.Sos',
      nipFacilitator: parsed.nipFacilitator || '198505152010012001',
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

  // Case 2: Array of records
  if (Array.isArray(parsed)) {
    const keys = Object.keys(parsed[0] || {})
    const formType = detectFormType(keys)
    const records = parsed.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType)
    )

    const data: PKHFormData = {
      formType,
      periode: 'Januari - Desember 2024',
      provinsi: 'Jawa Barat',
      kabupaten: 'Bandung',
      kecamatan: 'Coblong',
      kelurahan: 'Cidadap',
      facilitator: 'Siti Aminah, S.Sos',
      nipFacilitator: '198505152010012001',
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

function parseCSVText(rawText: string): ParseResult {
  const rows = parseCSV(rawText)
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

  const data: PKHFormData = {
    formType,
    periode: 'Januari - Desember 2024',
    provinsi: 'Jawa Barat',
    kabupaten: 'Bandung',
    kecamatan: 'Coblong',
    kelurahan: 'Cidadap',
    facilitator: 'Siti Aminah, S.Sos',
    nipFacilitator: '198505152010012001',
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

// Calculate attendance stats for a record
export function calcAttendance(record: PKHRecord): { qty: number; percent: number } {
  const arr = record.kehadiran || record.pemeriksaan || []
  const present = arr.filter(Boolean).length
  const total = arr.length || 1
  return {
    qty: present,
    percent: Math.round((present / total) * 100),
  }
}
