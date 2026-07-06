// PKH (Program Keluarga Harapan) Form Types
// Indonesian Ministry of Social Affairs (Kementerian Sosial)

export type FormType = 'education' | 'health' | 'social'

export interface PKHRecord {
  no: number
  nama: string
  nik: string
  tanggalLahir?: string
  jenisKelamin?: 'L' | 'P'
  alamat?: string
  kecamatan?: string
  kelurahan?: string
  // Education fields
  sekolah?: string
  kelas?: string
  jenjang?: string
  kehadiran?: boolean[] // 12 months attendance
  // Health fields
  posyandu?: string
  pemeriksaan?: boolean[] // health examination schedule
  beratBadan?: string
  tinggiBadan?: string
  // Social welfare fields
  bantuan?: string
  jumlahBantuan?: string
  status?: string
}

export interface PKHFormData {
  formType: FormType
  periode: string
  provinsi: string
  kabupaten: string
  kecamatan: string
  kelurahan: string
  facilitator: string
  nipFacilitator: string
  records: PKHRecord[]
}

export interface ParseResult {
  success: boolean
  formType?: FormType
  data?: PKHFormData
  error?: string
  detectedColumns?: string[]
  totalRecords?: number
}

export interface AnalysisResult {
  summary: string
  insights: string[]
  recommendations: string[]
  statistics: {
    totalBeneficiaries: number
    attendanceRate?: number
    completionRate?: number
    categories: Record<string, number>
  }
  riskFlags: string[]
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
  education: 'FORMULIR KEHADIRAN ANAK PENDIDIKAN',
  health: 'FORMULIR KEHADIRAN KELUARGA KESEHATAN',
  social: 'FORMULIR KEMBALI KESEJAHTERAAN SOSIAL'
}
