// Sample PKH data generator for demo/testing
// Quarterly (Triwulan) model with random 90-100% attendance
import {
  FormType, PKHFormData, PKHRecord, TRIWULAN_MONTHS, DEFAULT_HARI_EFEKTIF,
} from './types'
import { randomMonthAttendance } from './form-generator'

const NAMES_M = [
  'Ahmad Fauzi', 'Budi Santoso', 'Cahyo Nugroho', 'Dimas Pratama',
  'Eko Wijaya', 'Fajar Hidayat', 'Gunawan Saputra', 'Hadi Kusuma',
  'Indra Permana', 'Joko Susilo', 'Krisna Adi', 'Lukman Hakim',
  'Made Bagus', 'Nanda Putra', 'Oka Saputra', 'Putra Mahesa',
  'Moh. Qorrifardan', 'Abdul Basri', 'H. Moh. Hansan', 'Saiful Anwar',
]
const NAMES_F = [
  'Siti Aminah', 'Dewi Lestari', 'Rina Marlina', 'Sri Wahyuni',
  'Nur Hidayah', 'Fitri Handayani', 'Wati Susanti', 'Endang Sari',
  'Yuni Astuti', 'Ratna Dewi', 'Tuti Alawiyah', 'Maya Sari',
  'Diah Pitaloka', 'Nia Ramadhani', 'Rini Astuti', 'Sofiyatul',
  'Aisyah Putri', 'Khadijah Nur', 'Fatimah Az-Zahra', 'Maryam Salsa',
]
const NAMA_PENGURUS = [
  'SOFIYATUL', 'AHMAD YUSUF', 'SITI KHADIJAH', 'ABDUL RAHMAN',
  'NUR AINI', 'H. IMAM', 'FATIMAH', 'MUHAMMAD ALI',
  'SUMIATI', 'DULROHMAN', 'MAEMUNAH', 'KHOIRUL ANAM',
]
const SCHOOLS = [
  'SDN Cidadap 01', 'SDN Coblong 02', 'MTs Al-Hidayah',
  'SMAN 3 Bandung', 'MA Persis 03', 'MI Miftahul Ulum',
  'MADRASAH ALIYAH MIFTAHUL ULUM', 'SDN Sukajadi 05', 'SMPN 12 Bandung',
]
const POSYANDU = [
  'Posyandu Melati', 'Posyandu Mawar', 'Posyandu Anggrek',
  'Posyandu Kenanga', 'Posyandu Cempaka', 'Posyandu Flamboyan',
]
const KELURAHAN = ['Cidadap', 'Coblong', 'Dago', 'Sukajadi', 'Lebak Gede', 'Sidogiri']
const KECAMATAN = ['Coblong', 'Sukajadi', 'Cidadap', 'Kraton']
const KABUPATEN = ['Bandung', 'Pasuruan', 'Bandung Barat']
const PROVINSI = ['Jawa Barat', 'Jawa Timur']
const BANTUAN_TYPES = ['PKH Pendidikan', 'PKH Kesehatan', 'PKH Reguler', 'PKH Lanjut Usia']
const ALAMATS = [
  'Jl. Cisitu Indah No. 12', 'Jl. Ganesha No. 8', 'Jl. Ir. H. Juanda No. 45',
  'Jl. Dipatiukur No. 23', 'Jl. Cikutra No. 67', 'Jl. Tubagus Ismail No. 9',
  'Jl. Cisitu Lama No. 14', 'Jl. Sangkuriang No. 33', 'Jl. Tamansari No. 21',
  'Dsn. Sidogiri RT 03 RW 02', 'Dsn. Kraton RT 05 RW 01',
]
const BENTUK_PENDIDIKAN = ['MI', 'MTs', 'MA', 'SD', 'SMP', 'SMA']
const PENGURUS_NAMA = ['SOFIYATUL', 'AHMAD YUSUF', 'SITI KHADIJAH', 'ABDUL RAHMAN', 'NUR AINI']

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function genNIK(): string {
  // 16 digit NIK — Bandung (3273) or Pasuruan (3526) prefix
  const prefix = Math.random() > 0.5 ? '3273' : '3526'
  const year = String(randInt(60, 90))
  const month = String(randInt(1, 12)).padStart(2, '0')
  const day = String(randInt(1, 28)).padStart(2, '0')
  return prefix + year + month + day + String(randInt(100000, 999999))
}
function genNISN(): string {
  return String(randInt(1000000000, 9999999999))
}
function genTanggalLahir(): string {
  const y = randInt(2008, 2018)
  const m = String(randInt(1, 12)).padStart(2, '0')
  const d = String(randInt(1, 28)).padStart(2, '0')
  return `${d}/${m}/${y}`
}

export function generateSampleData(
  formType: FormType,
  count: number = 10
): PKHFormData {
  const triwulan = 2
  const tahun = new Date().getFullYear()
  const months = TRIWULAN_MONTHS[triwulan]
  const hariEfektif = DEFAULT_HARI_EFEKTIF
  const records: PKHRecord[] = []

  for (let i = 0; i < count; i++) {
    const isMale = Math.random() > 0.5
    const nama = isMale ? rand(NAMES_M) : rand(NAMES_F)
    const kelurahan = rand(KELURAHAN)
    const kecamatan = rand(KECAMATAN)

    const base: PKHRecord = {
      no: i + 1,
      nama,
      nik: genNIK(),
      tanggalLahir: genTanggalLahir(),
      jenisKelamin: isMale ? 'L' : 'P',
      alamat: rand(ALAMATS),
      kelurahan,
      kecamatan,
      bulan: months.map((m) => randomMonthAttendance(m, hariEfektif)),
      keterangan: 'Hadir',
      namaPendamping: 'ABDUL BASRI',
    }

    if (formType === 'education') {
      base.nikPengurus = genNIK()
      base.namaPengurus = rand(NAMA_PENGURUS)
      base.nisn = genNISN()
      const bentuk = rand(BENTUK_PENDIDIKAN)
      base.bentukPendidikan = bentuk
      const kelasMap: Record<string, number> = { MI: 6, MTs: 9, MA: 12, SD: 6, SMP: 9, SMA: 12 }
      const maxK = kelasMap[bentuk] || 6
      base.tingkat = `Kelas ${randInt(1, maxK)}`
      base.sekolah = rand(SCHOOLS)
    } else if (formType === 'health') {
      base.nikPengurus = genNIK()
      base.namaPengurus = rand(NAMA_PENGURUS)
      base.posyandu = rand(POSYANDU)
      base.beratBadan = String(randInt(8, 25))
      base.tinggiBadan = String(randInt(80, 130))
    } else {
      base.jenisBantuan = rand(BANTUAN_TYPES)
      base.jumlahBantuan = 'Rp ' + (randInt(5, 30) * 500000).toLocaleString('id-ID')
      base.status = Math.random() > 0.15 ? 'Aktif' : 'Tidak Aktif'
    }

    records.push(base)
  }

  const provinsi = rand(PROVINSI)
  const kabupaten = rand(KABUPATEN)

  return {
    formType,
    periode: `TRIWULAN ${triwulan} TAHUN ${tahun}`,
    triwulan,
    tahun,
    provinsi,
    kabupaten,
    kecamatan: rand(KECAMATAN),
    kelurahan: rand(KELURAHAN),
    npsn: String(randInt(10000000, 99999999)),
    namaSekolah: formType === 'education' ? rand(SCHOOLS) : (formType === 'health' ? rand(POSYANDU) : `Wilayah ${rand(KELURAHAN)}`),
    alamatSekolah: rand(ALAMATS),
    signerName: 'H. MOH. HANSAN, S.Pd.I, M.Pd',
    signerNIP: '196807151993031008',
    signerRole: formType === 'education' ? 'Kepala Sekolah' : (formType === 'health' ? 'Kepala Desa' : 'Koordinator PKH'),
    facilitator: 'ABDUL BASRI',
    nipFacilitator: '198505152010012001',
    records,
    months,
  }
}
