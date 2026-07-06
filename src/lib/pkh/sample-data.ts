// Sample PKH data generator for demo/testing
import { FormType, PKHFormData, PKHRecord, MONTHS_ID } from './types'

const NAMES_M = [
  'Ahmad Fauzi', 'Budi Santoso', 'Cahyo Nugroho', 'Dimas Pratama',
  'Eko Wijaya', 'Fajar Hidayat', 'Gunawan Saputra', 'Hadi Kusuma',
  'Indra Permana', 'Joko Susilo', 'Krisna Adi', 'Lukman Hakim',
  'Made Bagus', 'Nanda Putra', 'Oka Saputra', 'Putra Mahesa',
]
const NAMES_F = [
  'Siti Aminah', 'Dewi Lestari', 'Rina Marlina', 'Sri Wahyuni',
  'Nur Hidayah', 'Fitri Handayani', 'Wati Susanti', 'Endang Sari',
  'Yuni Astuti', 'Ratna Dewi', 'Tuti Alawiyah', 'Maya Sari',
  'Diah Pitaloka', 'Nia Ramadhani', 'Rini Astuti', 'Bayu Anggraini',
]
const SCHOOLS = [
  'SDN Cidadap 01', 'SDN Coblong 02', 'SDN Dago 04', 'SDN Sukajadi 05',
  'SMPN 5 Bandung', 'SMPN 12 Bandung', 'MTs Al-Hidayah',
  'SMAN 3 Bandung', 'SMKN 4 Bandung', 'MA Persis 03',
]
const POSYANDU = [
  'Posyandu Melati', 'Posyandu Mawar', 'Posyandu Anggrek',
  'Posyandu Kenanga', 'Posyandu Cempaka', 'Posyandu Flamboyan',
]
const KELURAHAN = ['Cidadap', 'Coblong', 'Dago', 'Sukajadi', 'Lebak Gede']
const KECAMATAN = ['Coblong', 'Sukajadi', 'Cidadap']
const BANTUAN_TYPES = ['PKH Pendidikan', 'PKH Kesehatan', 'PKH Reguler', 'PKH Lanjut Usia']
const ALAMATS = [
  'Jl. Cisitu Indah No. 12', 'Jl. Ganesha No. 8', 'Jl. Ir. H. Juanda No. 45',
  'Jl. Dipatiukur No. 23', 'Jl. Cikutra No. 67', 'Jl. Tubagus Ismail No. 9',
  'Jl. Cisitu Lama No. 14', 'Jl. Sangkuriang No. 33', 'Jl. Tamansari No. 21',
]

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function genNIK(): string {
  // 16 digit - Jawa Barat (32) prefix
  let nik = '3273' // Bandung
  const year = String(randInt(60, 90))
  const month = String(randInt(1, 12)).padStart(2, '0')
  const day = String(randInt(1, 28)).padStart(2, '0')
  nik += year + month + day
  nik += String(randInt(1000, 9999))
  return nik
}
function genTanggalLahir(): string {
  const y = randInt(2008, 2018)
  const m = String(randInt(1, 12)).padStart(2, '0')
  const d = String(randInt(1, 28)).padStart(2, '0')
  return `${d}/${m}/${y}`
}

// Generate attendance pattern (some students have better attendance than others)
function genAttendance(): boolean[] {
  return MONTHS_ID.map(() => Math.random() > 0.25) // ~75% attendance
}

export function generateSampleData(
  formType: FormType,
  count: number = 10
): PKHFormData {
  const records: PKHRecord[] = []

  for (let i = 0; i < count; i++) {
    const isMale = Math.random() > 0.5
    const nama = isMale ? rand(NAMES_M) : rand(NAMES_F)
    const base: PKHRecord = {
      no: i + 1,
      nama,
      nik: genNIK(),
      tanggalLahir: genTanggalLahir(),
      jenisKelamin: isMale ? 'L' : 'P',
      alamat: rand(ALAMATS),
      kelurahan: rand(KELURAHAN),
      kecamatan: rand(KECAMATAN),
    }

    if (formType === 'education') {
      base.sekolah = rand(SCHOOLS)
      base.kelas = String(randInt(1, 9))
      const k = parseInt(base.kelas)
      base.jenjang = k <= 6 ? 'SD' : k <= 9 ? 'SMP' : 'SMA'
      base.kehadiran = genAttendance()
    } else if (formType === 'health') {
      base.posyandu = rand(POSYANDU)
      base.beratBadan = String(randInt(8, 25)) + ' kg'
      base.tinggiBadan = String(randInt(80, 130)) + ' cm'
      base.pemeriksaan = genAttendance()
    } else {
      base.bantuan = rand(BANTUAN_TYPES)
      base.jumlahBantuan = 'Rp ' + (randInt(5, 30) * 500000).toLocaleString('id-ID')
      base.status = Math.random() > 0.15 ? 'Aktif' : 'Tidak Aktif'
    }

    records.push(base)
  }

  return {
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
}
