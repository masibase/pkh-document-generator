// PKH Data Parser — compatibility layer
// Quarterly (Triwulan) model
import { FormType, PKHFormData, PKHRecord, ParseResult, MONTHS_ID, TRIWULAN_MONTHS, DEFAULT_HARI_EFEKTIF } from './types'
import { randomMonthAttendance } from './form-generator'

// Detect form type based on detected columns / keys
export function detectFormType(keys: string[]): FormType {
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

// Calculate attendance stats for a record (quarterly model)
export function calcAttendance(record: PKHRecord): { qty: number; percent: number } {
  const bulan = record.bulan || []
  if (bulan.length === 0) return { qty: 0, percent: 0 }
  const totalJml = bulan.reduce((s, m) => s + m.jml, 0)
  const totalHe = bulan.reduce((s, m) => s + m.hariEfektif, 0)
  const percent = totalHe > 0 ? Math.round((totalJml / totalHe) * 100) : 0
  return { qty: totalJml, percent }
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

// Main parse entry: accepts raw text and file extension
// Delegates to quarterly model (random 90-100% attendance when not specified)
export function parsePKHData(
  rawText: string,
  fileExt: 'json' | 'csv' = 'json'
): ParseResult {
  try {
    if (fileExt === 'json') return parseJSON(rawText)
    return parseCSVText(rawText)
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown parse error',
    }
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_\-\.]+/g, '')
}

function parseBool(val: string): boolean {
  const v = val.toLowerCase().trim()
  return ['1', 'true', 'ya', 'hadir', 'v', 'x', '✓', 'check', 'lunas', 'selesai', 'baik'].includes(v)
}

function buildRecord(row: Record<string, string>, index: number, formType: FormType, months: string[], hariEfektif: number): PKHRecord {
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
    nama: get('nama', 'name', 'namasiswa', 'namalengkap', 'namapeserta') || `Peserta ${index + 1}`,
    nik: get('nik', 'niksiswa', 'nopen') || '',
    bulan: months.map((m) => randomMonthAttendance(m, hariEfektif)),
    keterangan: 'Hadir',
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

  // Sosial
  if (formType === 'social') {
    record.jenisBantuan = get('bantuan', 'jenisbantuan', 'assistance') || 'PKH Reguler'
    record.jumlahBantuan = get('jumlahbantuan', 'jumlah', 'amount')
    record.status = get('status', 'stat') || 'Aktif'
  }

  record.alamat = get('alamat', 'address')
  record.kecamatan = get('kecamatan', 'kec')
  record.kelurahan = get('kelurahan', 'kel', 'desa')
  record.namaPendamping = get('namapendamping', 'pendamping')

  const jk = get('jeniskelamin', 'jk', 'gender')?.toUpperCase()
  if (jk && (jk.startsWith('L') || jk.startsWith('P'))) {
    record.jenisKelamin = jk.startsWith('L') ? 'L' : 'P'
  }
  const tgl = get('tanggallahir', 'tanggal', 'tgl', 'birth')
  if (tgl) record.tanggalLahir = tgl

  // Allow explicit bulan override from JSON
  const bulanRaw = row['bulan']
  if (typeof bulanRaw === 'string') {
    try {
      const parsed = JSON.parse(bulanRaw)
      if (Array.isArray(parsed) && parsed.length === 3) {
        record.bulan = parsed.map((b: Record<string, number>, i: number) => {
          const he = b.hariEfektif ?? hariEfektif
          const alpa = b.alpa ?? 0
          const izin = b.izin ?? 0
          const sakit = b.sakit ?? 0
          const jml = b.jml ?? Math.max(0, he - alpa - izin - sakit)
          const percent = b.percent ?? Math.round((jml / he) * 100)
          return { nama: months[i] || '', hariEfektif: he, alpa, izin, sakit, jml, percent }
        })
      }
    } catch {
      // ignore
    }
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

function parseJSON(rawText: string): ParseResult {
  const parsed = JSON.parse(rawText)
  const triwulan = parsed?.triwulan || 2
  const months = parsed?.months || TRIWULAN_MONTHS[triwulan] || TRIWULAN_MONTHS[2]
  const hariEfektif = parsed?.hariEfektif || DEFAULT_HARI_EFEKTIF

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    const keys = Object.keys(parsed.records[0] || {})
    const formType = (parsed.formType as FormType) || detectFormType(keys)
    const records = parsed.records.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType, months, hariEfektif)
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
    return { success: true, formType, data, detectedColumns: keys, totalRecords: records.length }
  }

  if (Array.isArray(parsed)) {
    const keys = Object.keys(parsed[0] || {})
    const formType = detectFormType(keys)
    const records = parsed.map((r: Record<string, string>, i: number) =>
      buildRecord(r, i, formType, months, hariEfektif)
    )
    const data: PKHFormData = {
      formType,
      periode: `TRIWULAN ${triwulan} TAHUN ${new Date().getFullYear()}`,
      triwulan,
      tahun: new Date().getFullYear(),
      provinsi: '', kabupaten: '', kecamatan: '', kelurahan: '',
      signerName: '', signerNIP: '',
      signerRole: formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa',
      facilitator: '', nipFacilitator: '',
      records, months,
    }
    return { success: true, formType, data, detectedColumns: keys, totalRecords: records.length }
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
  const triwulan = 2
  const months = TRIWULAN_MONTHS[triwulan]
  const hariEfektif = DEFAULT_HARI_EFEKTIF

  const records = dataRows.map((row, i) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = row[idx] || '' })
    return buildRecord(obj, i, formType, months, hariEfektif)
  })

  const data: PKHFormData = {
    formType,
    periode: `TRIWULAN ${triwulan} TAHUN ${new Date().getFullYear()}`,
    triwulan,
    tahun: new Date().getFullYear(),
    provinsi: '', kabupaten: '', kecamatan: '', kelurahan: '',
    signerName: '', signerNIP: '',
    signerRole: formType === 'education' ? 'Kepala Sekolah' : 'Kepala Desa',
    facilitator: '', nipFacilitator: '',
    records, months,
  }
  return { success: true, formType, data, detectedColumns: header, totalRecords: records.length }
}
