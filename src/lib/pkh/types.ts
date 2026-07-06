// PKH (Program Keluarga Harapan) Form Types
// Indonesian Ministry of Social Affairs (Kementerian Sosial)
// Quarterly (Triwulan) model — matches Form Verifikasi Komitmen template

export type FormType = 'education' | 'health' | 'social'

// Monthly attendance for a single month within a triwulan (quarter)
// Matches PDF columns: Hari Efektif, ALPA, IZIN, SAKIT, JML, %
export interface MonthAttendance {
  nama: string // e.g. "APRIL"
  hariEfektif: number // total effective school/service days
  alpa: number // absent without reason
  izin: number // permitted leave
  sakit: number // sick leave
  jml: number // present = hariEfektif − alpa − izin − sakit
  percent: number // (jml ÷ hariEfektif) × 100, rounded
}

export interface PKHRecord {
  no: number
  nama: string // Nama Siswa / Peserta
  nik: string // NIK Siswa (primary NIK)
  // Pendidikan fields
  nikPengurus?: string // NIK Pengurus (family head/caretaker)
  namaPengurus?: string // Nama Pengurus
  nisn?: string // Nomor Induk Siswa Nasional
  tingkat?: string // e.g. "Kelas 10"
  bentukPendidikan?: string // MA / SD / SMP / SMA
  sekolah?: string
  // Kesehatan fields
  posyandu?: string
  beratBadan?: string
  tinggiBadan?: string
  // Kesejahteraan Sosial fields
  jenisBantuan?: string
  jumlahBantuan?: string
  status?: string
  // Common
  alamat?: string
  jenisKelamin?: 'L' | 'P'
  tanggalLahir?: string
  // Quarterly attendance (3 months) — same concept for all form types
  bulan: MonthAttendance[]
  keterangan?: string // "Hadir" / "Tidak Hadir"
  namaPendamping?: string
}

export interface PKHFormData {
  formType: FormType
  periode: string // e.g. "TRIWULAN 2 TAHUN 2026"
  triwulan?: number // 1-4
  tahun?: number
  // Wilayah (from uploaded document — never hardcoded)
  provinsi: string
  kabupaten: string
  kecamatan: string
  kelurahan: string
  // Pendidikan-specific
  npsn?: string
  namaSekolah?: string
  alamatSekolah?: string
  // Single signer (matches uploaded PDF — only 1 signature block)
  signerName: string
  signerNIP: string
  signerRole: string // "Kepala Sekolah" | "Kepala Desa" | "Koordinator PKH"
  // Facilitator
  facilitator: string
  nipFacilitator: string
  // Records
  records: PKHRecord[]
  // Months for this triwulan (3 month names)
  months: string[]
  // Optional custom logo (data URL or path). Falls back to /pkh-logo.png
  logoUrl?: string
}

export interface ParseResult {
  success: boolean
  formType?: FormType
  data?: PKHFormData
  error?: string
  detectedColumns?: string[]
  totalRecords?: number
}

// Triwulan → 3 month names (Indonesian)
export const TRIWULAN_MONTHS: Record<number, string[]> = {
  1: ['JANUARI', 'FEBRUARI', 'MARET'],
  2: ['APRIL', 'MEI', 'JUNI'],
  3: ['JULI', 'AGUSTUS', 'SEPTEMBER'],
  4: ['OKTOBER', 'NOVEMBER', 'DESEMBER'],
}

export const MONTHS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  education: 'Pendidikan',
  health: 'Kesehatan',
  social: 'Kesejahteraan Sosial'
}

export const FORM_TYPE_TITLES: Record<FormType, string> = {
  education: 'FORM VERIFIKASI KOMITMEN PENDIDIKAN',
  health: 'FORM VERIFIKASI KOMITMEN KESEHATAN',
  social: 'FORM VERIFIKASI KOMITMEN KESEJAHTERAAN SOSIAL'
}

export const FORM_TYPE_SUBTITLES: Record<FormType, string> = {
  education: 'PROGRAM KELUARGA HARAPAN (PKH)',
  health: 'PROGRAM KELUARGA HARAPAN (PKH)',
  social: 'PROGRAM KELUARGA HARAPAN (PKH)'
}

// Default effective days per month (Indonesian school calendar ~22 days/month)
export const DEFAULT_HARI_EFEKTIF = 22
