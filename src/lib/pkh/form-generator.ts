// PKH HTML Form Generator
// Generates print-ready HTML forms matching the official
// "FORM VERIFIKASI KOMITMEN" PDF template (quarterly / triwulan format)
import {
  FormType,
  PKHFormData,
  PKHRecord,
  MonthAttendance,
  FORM_TYPE_TITLES,
  FORM_TYPE_SUBTITLES,
  FORM_TYPE_LABELS,
} from './types'

/* ============================================================
   7 SVG checkmark variations — natural handwritten look
   Each has different rotation, stroke width, opacity, and path
   ============================================================ */
const CHECKMARK_VARIANTS = [
  // Variant 1: clean, slight right tilt
  {
    rotate: 4,
    stroke: 2.6,
    opacity: 0.95,
    path: 'M7 12.5L10.5 16L17 9',
    rx: '11',
    fill: '#16a34a',
  },
  // Variant 2: left tilt, thinner
  {
    rotate: -6,
    stroke: 2.2,
    opacity: 0.88,
    path: 'M6.5 13L10 16.5L17.5 8.5',
    rx: '11',
    fill: '#15803d',
  },
  // Variant 3: bold, upright
  {
    rotate: 1,
    stroke: 3.0,
    opacity: 0.92,
    path: 'M7 12L10.5 15.5L17 8.5',
    rx: '10',
    fill: '#16a34a',
  },
  // Variant 4: heavy left tilt, thicker
  {
    rotate: -10,
    stroke: 2.8,
    opacity: 0.85,
    path: 'M6 13.5L10 17L18 9',
    rx: '12',
    fill: '#166534',
  },
  // Variant 5: right tilt, medium
  {
    rotate: 8,
    stroke: 2.4,
    opacity: 0.9,
    path: 'M7 12.5L10 16L17 8',
    rx: '11',
    fill: '#15803d',
  },
  // Variant 6: slight left, thin & light
  {
    rotate: -3,
    stroke: 2.0,
    opacity: 0.82,
    path: 'M7 13L10.5 16.5L17.5 9',
    rx: '11',
    fill: '#16a34a',
  },
  // Variant 7: right tilt, very bold
  {
    rotate: 6,
    stroke: 3.2,
    opacity: 0.96,
    path: 'M6.5 12L10 15.5L18 8',
    rx: '10',
    fill: '#166534',
  },
]

// Render a checkmark SVG using a specific variant (index 0-6)
function checkSVG(variantIdx = 0): string {
  const v = CHECKMARK_VARIANTS[variantIdx % CHECKMARK_VARIANTS.length]
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;transform:rotate(${v.rotate}deg);opacity:${v.opacity};"><circle cx="12" cy="12" r="${v.rx}" fill="${v.fill}"/><path d="${v.path}" stroke="#fff" stroke-width="${v.stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

// Pick a deterministic-but-varied checkmark variant for a cell
// so each cell in a row uses a different style (natural handwriting)
function checkForCell(rowIdx: number, monthIdx: number, present: boolean): string {
  if (!present) return `<span style="display:inline-block;width:15px;color:#94a3b8;font-size:13px;">—</span>`
  const variant = (rowIdx * 3 + monthIdx) % 7
  return `<span class="check-mark">${checkSVG(variant)}</span>`
}

/* ============================================================
   BSrE (Badan Siber dan Sandi Negara) digital stamp
   Circular dark-blue seal with QR simulation
   70% transparent (opacity 0.3) for natural faded ink-impression look
   ============================================================ */
function bsreStampSVG(): string {
  return `
  <div class="bsre-stamp" aria-label="BSrE Digital Signature Stamp" style="opacity:0.3;">
    <svg width="115" height="115" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path id="circleTop" d="M 60,60 m -42,0 a 42,42 0 1,1 84,0" fill="none" />
        <path id="circleBottom" d="M 60,60 m -42,0 a 42,42 0 1,0 84,0" fill="none" />
      </defs>
      <circle cx="60" cy="60" r="55" fill="none" stroke="#1e3a5f" stroke-width="2.5" opacity="1"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="#1e3a5f" stroke-width="1.2" opacity="0.85"/>
      <circle cx="60" cy="60" r="42" fill="none" stroke="#1e3a5f" stroke-width="1" opacity="0.65" stroke-dasharray="2 2"/>
      <text font-family="Arial, sans-serif" font-size="7" fill="#1e3a5f" font-weight="bold" letter-spacing="0.8">
        <textPath href="#circleTop" startOffset="50%" text-anchor="middle">BADAN SIBER DAN SANDI NEGARA</textPath>
      </text>
      <text font-family="Arial, sans-serif" font-size="6" fill="#1e3a5f" letter-spacing="0.5">
        <textPath href="#circleBottom" startOffset="50%" text-anchor="middle">SERTIFIKAT ELEKTRONIK TERVERIFIKASI</textPath>
      </text>
      <g transform="translate(60,60)">
        <circle r="20" fill="#1e3a5f" opacity="0.12"/>
        <text x="0" y="-2" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#1e3a5f" font-weight="bold">BSrE</text>
        <text x="0" y="8" text-anchor="middle" font-family="Arial, sans-serif" font-size="4.5" fill="#1e3a5f">TERSERTIFIKASI</text>
        <line x1="-14" y1="13" x2="14" y2="13" stroke="#1e3a5f" stroke-width="0.5"/>
        <text x="0" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="3.5" fill="#1e3a5f">e-SIGN VERIFIED</text>
      </g>
    </svg>
  </div>`
}

/* ============================================================
   Handwritten signature using Dancing Script cursive font
   ============================================================ */
function signatureSVG(name: string): string {
  // Generate a cursive-style signature path that varies by name length
  const len = Math.min(name.length, 20)
  const w = 150 + len * 2
  return `
  <svg width="${w}" height="55" viewBox="0 0 ${w} 55" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-2deg);">
    <path d="M 10 38 Q ${20 + len} 8, ${35 + len} 32 T ${60 + len} 28 Q ${75 + len} 14, ${90 + len} 32 Q ${105 + len} 44, ${120 + len} 22 T ${w - 15} 30"
      fill="none" stroke="#1e3a5f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
    <path d="M 18 42 L ${w - 22} 42" stroke="#1e3a5f" stroke-width="0.7" opacity="0.5"/>
    <circle cx="${w - 8}" cy="32" r="2" fill="#1e3a5f" opacity="0.7"/>
  </svg>`
}

// Single signature block (matches uploaded PDF — only 1 signer)
function signatureBlock(name: string, nip: string, role: string): string {
  return `
  <div class="signature-block">
    <div class="sig-stamp-overlay">${bsreStampSVG()}</div>
    <div class="sig-name-svg">${signatureSVG(name)}</div>
    <div class="sig-line"></div>
    <div class="sig-name"><strong>${name}</strong></div>
    <div class="sig-nip">NIP. ${nip}</div>
    <div class="sig-role">${role}</div>
  </div>`
}

/* ============================================================
   Institutional logo — uses uploaded logo image (default /pkh-logo.png)
   Falls back to an inline SVG emblem when no image is available.
   ============================================================ */
function kemsosLogo(logoUrl?: string): string {
  const src = logoUrl && logoUrl.trim() ? logoUrl.trim() : '/pkh-logo.png'
  return `<img src="${src}" alt="Logo Lembaga" width="64" height="74" style="object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';"/>
  <svg width="64" height="74" viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg" aria-label="Logo Lembaga" style="display:none;">
    <path d="M35 2 L65 12 V40 C65 58 52 72 35 78 C18 72 5 58 5 40 V12 Z" fill="#1e3a5f" stroke="#172a4a" stroke-width="1.5"/>
    <path d="M35 8 L59 16 V40 C59 54 49 66 35 71 C21 66 11 54 11 40 V16 Z" fill="#eff6ff" stroke="#1e3a5f" stroke-width="0.8"/>
    <text x="35" y="30" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#1e3a5f">KEMEN</text>
    <text x="35" y="40" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#1e3a5f">SOS</text>
    <path d="M35 44 L40 50 L35 56 L30 50 Z" fill="#1e3a5f"/>
    <text x="35" y="66" text-anchor="middle" font-family="Arial" font-size="4" fill="#1e3a5f">PKH</text>
  </svg>`
}

/* ============================================================
   Shared CSS for all forms — A4 landscape, print-ready
   ============================================================ */
function formCSS(): string {
  return `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap');
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 10px; background: #fff; }
    .page { width: 100%; }
    .form-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #1a1a1a; padding-bottom: 8px; margin-bottom: 10px; }
    .header-left { display: flex; gap: 10px; align-items: flex-start; }
    .header-title h1 { font-size: 13px; margin: 0; font-weight: bold; text-transform: uppercase; }
    .header-title h2 { font-size: 11px; margin: 2px 0; font-weight: bold; text-transform: uppercase; }
    .header-title .subtitle { font-size: 9px; margin-top: 3px; font-weight: bold; }
    .header-right { text-align: right; font-size: 9px; }
    .header-right .doc-id { font-weight: bold; border: 1px solid #1a1a1a; padding: 2px 6px; display: inline-block; margin-bottom: 4px; }
    .school-info { margin: 8px 0; font-size: 10px; line-height: 1.5; }
    .school-info .row { display: flex; gap: 4px; }
    .school-info .label { min-width: 90px; font-weight: 600; }
    .school-info .sep { font-weight: 600; }
    .school-info .inline-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .school-info .inline-row .item { display: flex; gap: 4px; }
    table.form-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9px; }
    table.form-table th, table.form-table td { border: 1px solid #1a1a1a; padding: 3px 4px; text-align: center; vertical-align: middle; }
    table.form-table th { background: #f1f5f9; font-weight: bold; font-size: 8.5px; }
    table.form-table td.nama-cell { text-align: left; }
    table.form-table .no-col { width: 28px; }
    table.form-table .month-group { background: #e2e8f0; font-weight: bold; font-size: 9px; }
    table.form-table .eff-day { background: #fef3c7; font-size: 7.5px; font-style: italic; }
    table.form-table .qty-col { background: #fef9c3; font-weight: bold; }
    table.form-table .pct-col { background: #dcfce7; font-weight: bold; }
    table.form-table .check-cell { background: #fff; width: 26px; }
    table.form-table tr:nth-child(even) td { background: #fafafa; }
    table.form-table tr:nth-child(even) td.check-cell { background: #f5f5f5; }
    .check-mark { display: inline-flex; align-items: center; justify-content: center; }
    .form-footer { margin-top: 16px; display: flex; justify-content: flex-end; gap: 20px; }
    .signature-area { width: 38%; text-align: center; }
    .signature-area .place-date { margin-bottom: 8px; font-size: 10px; }
    .signature-area .role-label { font-size: 9px; margin-bottom: 50px; }
    .signature-block { position: relative; display: inline-block; }
    .sig-stamp-overlay { position: absolute; top: -40px; left: 50%; transform: translateX(-35%) rotate(-12deg); z-index: 2; pointer-events: none; }
    .sig-name-svg { display: flex; justify-content: center; margin-bottom: 2px; }
    .sig-line { border-top: 1px solid #1a1a1a; width: 85%; margin: 0 auto 2px; }
    .sig-name { font-size: 10px; }
    .sig-nip { font-size: 9px; }
    .sig-role { font-size: 8.5px; color: #555; margin-top: 1px; }
    .bsre-stamp { display: inline-block; }
    .note-box { margin-top: 12px; padding: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 8.5px; border-radius: 3px; }
    .note-box strong { color: #1e3a5f; }
    .note-box ul { margin: 4px 0 0 16px; padding: 0; }
    .note-box li { margin-bottom: 2px; }
    .bsre-note { margin-top: 10px; padding: 8px; border: 1px solid #1e3a5f; background: #eff6ff; font-size: 8.5px; border-radius: 3px; text-align: center; }
    .bsre-note strong { color: #1e3a5f; }
    .legend { display: flex; gap: 16px; font-size: 8.5px; margin-top: 6px; align-items: center; flex-wrap: wrap; }
    .legend-item { display: flex; gap: 4px; align-items: center; }
    .form-title-banner { background: #1e3a5f; color: #fff; padding: 6px 12px; text-align: center; font-weight: bold; font-size: 12px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
    .summary-row { display: flex; gap: 12px; margin: 8px 0; font-size: 9.5px; }
    .summary-card { flex: 1; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 3px; background: #f8fafc; }
    .summary-card .label { font-size: 8px; color: #64748b; text-transform: uppercase; }
    .summary-card .value { font-size: 14px; font-weight: bold; color: #1e3a5f; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>`
}

/* ============================================================
   Random attendance generator — average 90-100%
   Generates ALPA/IZIN/SAKIT values so % falls in 90-100% range
   ============================================================ */
export function randomMonthAttendance(
  monthName: string,
  hariEfektif = 22
): MonthAttendance {
  // Target percent between 90-100%
  const targetPercent = 90 + Math.floor(Math.random() * 11) // 90-100
  const absent = Math.round(((100 - targetPercent) / 100) * hariEfektif)
  // Distribute absent days across alpa/izin/sakit (prefer izin/sakit, low alpa)
  const alpa = Math.floor(Math.random() * 2) // 0-1
  const sakit = Math.floor(Math.random() * (absent - alpa + 1))
  const izin = Math.max(0, absent - alpa - sakit)
  const jml = Math.max(0, hariEfektif - alpa - izin - sakit)
  const percent = Math.round((jml / hariEfektif) * 100)
  return { nama: monthName, hariEfektif, alpa, izin, sakit, jml, percent }
}

// Build a single student row's attendance cells for all 3 months
function buildAttendanceCells(
  record: PKHRecord,
  rowIdx: number
): string {
  const months = record.bulan || []
  return months
    .map((m, mi) => {
      const present = m.percent >= 75
      return `
      <td class="qty-col" style="font-size:8px;">${m.hariEfektif}</td>
      <td>${m.alpa}</td>
      <td>${m.izin}</td>
      <td>${m.sakit}</td>
      <td class="qty-col">${m.jml}</td>
      <td class="pct-col">${m.percent}%</td>
      <td class="check-cell">${checkForCell(rowIdx, mi, present)}</td>`
    })
    .join('')
}

// Calculate hari efektif header row for the month group
function buildEffDayRow(months: string[], sample: PKHRecord[]): string {
  return months
    .map((m) => {
      const he = sample[0]?.bulan?.find((b) => b.nama === m)?.hariEfektif || 22
      return `<td class="eff-day" colspan="7">Hari Efektif: ${he}</td>`
    })
    .join('')
}

// Sub-header row: ALPA IZIN SAKIT JML % ✓ per month
function buildSubHeaderRow(months: string[]): string {
  return months
    .map(() => {
      return `
      <td style="font-size:7px;">HE</td>
      <td style="font-size:7px;">A</td>
      <td style="font-size:7px;">I</td>
      <td style="font-size:7px;">S</td>
      <td style="font-size:7px;">JML</td>
      <td style="font-size:7px;">%</td>
      <td style="font-size:7px;">✓</td>`
    })
    .join('')
}

/* ============================================================
   Build the main attendance table (same concept for all 3 form types)
   Education: NIK Pengurus, Nama Pengurus, NIK Siswa, NISN, Nama Siswa, Tingkat
   Health:    NIK Pengurus, Nama Pengurus, NIK, Nama, Posyandu, Usia
   Social:    NIK, Nama, Alamat, Kelurahan, Jenis Bantuan, Jumlah
   ============================================================ */
function buildAttendanceTable(data: PKHFormData): string {
  const months = data.months
  const monthSpan = 7 // HE, A, I, S, JML, %, ✓

  // Form-type-specific identity columns
  let idHeaders: string
  let renderIdCells: (r: PKHRecord) => string

  if (data.formType === 'education') {
    idHeaders = `
      <th class="no-col" rowspan="3">No</th>
      <th rowspan="3">NIK Pengurus</th>
      <th rowspan="3">Nama Pengurus</th>
      <th rowspan="3">NIK Siswa</th>
      <th rowspan="3">NISN</th>
      <th rowspan="3">Nama Siswa</th>
      <th rowspan="3" style="width:70px;">Bentuk Pendidikan / Tingkat</th>`
    renderIdCells = (r) => `
      <td class="no-col">${r.no}</td>
      <td style="font-size:8px;">${r.nikPengurus || '-'}</td>
      <td class="nama-cell">${r.namaPengurus || '-'}</td>
      <td style="font-size:8px;">${r.nik}</td>
      <td style="font-size:8px;">${r.nisn || '-'}</td>
      <td class="nama-cell">${r.nama}</td>
      <td>${r.bentukPendidikan || ''} ${r.tingkat || ''}</td>`
  } else if (data.formType === 'health') {
    idHeaders = `
      <th class="no-col" rowspan="3">No</th>
      <th rowspan="3">NIK Pengurus</th>
      <th rowspan="3">Nama Pengurus</th>
      <th rowspan="3">NIK Peserta</th>
      <th rowspan="3">Nama Peserta</th>
      <th rowspan="3">Posyandu</th>
      <th rowspan="3" style="width:60px;">Usia / BB-TB</th>`
    renderIdCells = (r) => `
      <td class="no-col">${r.no}</td>
      <td style="font-size:8px;">${r.nikPengurus || '-'}</td>
      <td class="nama-cell">${r.namaPengurus || '-'}</td>
      <td style="font-size:8px;">${r.nik}</td>
      <td class="nama-cell">${r.nama}</td>
      <td class="nama-cell">${r.posyandu || '-'}</td>
      <td>${r.beratBadan ? `${r.beratBadan}/${r.tinggiBadan || '-'}` : '-'}</td>`
  } else {
    idHeaders = `
      <th class="no-col" rowspan="3">No</th>
      <th rowspan="3">NIK</th>
      <th rowspan="3">Nama Peserta</th>
      <th rowspan="3">Alamat</th>
      <th rowspan="3">Kelurahan/Desa</th>
      <th rowspan="3">Jenis Bantuan</th>
      <th rowspan="3" style="width:70px;">Jumlah / Status</th>`
    renderIdCells = (r) => `
      <td class="no-col">${r.no}</td>
      <td style="font-size:8px;">${r.nik}</td>
      <td class="nama-cell">${r.nama}</td>
      <td class="nama-cell" style="font-size:8px;">${r.alamat || '-'}</td>
      <td>${r.kelurahan || data.kelurahan || '-'}</td>
      <td>${r.jenisBantuan || 'PKH Reguler'}</td>
      <td style="font-size:8px;">${r.jumlahBantuan || '-'}<br/><span style="font-size:7px;color:${r.status === 'Aktif' ? '#16a34a' : '#1e3a5f'};">${r.status || 'Aktif'}</span></td>`
  }

  const monthGroupHeaders = months
    .map((m) => `<td class="month-group" colspan="${monthSpan}">${m}</td>`)
    .join('')

  const keteranganHeader = `<th rowspan="3" style="width:60px;">Keterangan</th><th rowspan="3" style="width:90px;">Nama Pendamping</th>`

  const rows = data.records
    .map((r, idx) => {
      const avgPct = r.bulan.length
        ? Math.round(r.bulan.reduce((s, m) => s + m.percent, 0) / r.bulan.length)
        : 0
      const keterangan = avgPct >= 75 ? 'Hadir' : 'Tidak Hadir'
      return `
      <tr>
        ${renderIdCells(r)}
        ${buildAttendanceCells(r, idx)}
        <td style="font-size:8px;font-weight:600;color:${avgPct >= 75 ? '#16a34a' : '#1e3a5f'};">${keterangan}</td>
        <td style="font-size:8px;">${r.namaPendamping || data.facilitator || '-'}</td>
      </tr>`
    })
    .join('')

  return `
  <table class="form-table">
    <thead>
      <tr>
        ${idHeaders}
        ${monthGroupHeaders}
        ${keteranganHeader}
      </tr>
      <tr>
        ${buildEffDayRow(months, data.records)}
        <td rowspan="2" style="background:#f1f5f9;"></td>
        <td rowspan="2" style="background:#f1f5f9;"></td>
      </tr>
      <tr>
        ${buildSubHeaderRow(months)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
}

/* ============================================================
   Calculate summary statistics (random avg 90-100%)
   ============================================================ */
function calcSummary(data: PKHFormData) {
  const total = data.records.length
  let avgAttendance = 0
  if (data.records.length > 0) {
    const allPercents = data.records.flatMap((r) => r.bulan.map((m) => m.percent))
    avgAttendance = Math.round(
      allPercents.reduce((a, b) => a + b, 0) / (allPercents.length || 1)
    )
  }
  return { total, avgAttendance }
}

/* ============================================================
   Build complete HTML for a single form
   ============================================================ */
export function generateFormHTML(data: PKHFormData): string {
  const title = FORM_TYPE_TITLES[data.formType]
  const subtitle = FORM_TYPE_SUBTITLES[data.formType]
  const label = FORM_TYPE_LABELS[data.formType]
  const { total, avgAttendance } = calcSummary(data)

  const tableHTML = buildAttendanceTable(data)

  // Identity info block (form-type specific)
  let identityHTML: string
  if (data.formType === 'education') {
    identityHTML = `
    <div class="school-info">
      <div class="inline-row">
        <div class="item"><span class="label">NPSN</span><span class="sep">:</span><span>${data.npsn || '-'}</span></div>
        <div class="item"><span class="label">Nama Sekolah</span><span class="sep">:</span><span>${data.namaSekolah || '-'}</span></div>
      </div>
      <div class="row"><span class="label">Alamat</span><span class="sep">:</span><span>${data.alamatSekolah || data.kelurahan || '-'}</span></div>
      <div class="row"><span class="label">Wilayah</span><span class="sep">:</span><span>Kec. ${data.kecamatan || '-'}, Kab. ${data.kabupaten || '-'}, Prov. ${data.provinsi || '-'}</span></div>
    </div>`
  } else if (data.formType === 'health') {
    identityHTML = `
    <div class="school-info">
      <div class="inline-row">
        <div class="item"><span class="label">Posyandu</span><span class="sep">:</span><span>${data.namaSekolah || '-'}</span></div>
        <div class="item"><span class="label">Kode Wilayah</span><span class="sep">:</span><span>${data.npsn || '-'}</span></div>
      </div>
      <div class="row"><span class="label">Alamat</span><span class="sep">:</span><span>${data.alamatSekolah || data.kelurahan || '-'}</span></div>
      <div class="row"><span class="label">Wilayah</span><span class="sep">:</span><span>Kec. ${data.kecamatan || '-'}, Kab. ${data.kabupaten || '-'}, Prov. ${data.provinsi || '-'}</span></div>
    </div>`
  } else {
    identityHTML = `
    <div class="school-info">
      <div class="inline-row">
        <div class="item"><span class="label">Wilayah Layanan</span><span class="sep">:</span><span>${data.namaSekolah || data.kelurahan || '-'}</span></div>
        <div class="item"><span class="label">Kode</span><span class="sep">:</span><span>${data.npsn || '-'}</span></div>
      </div>
      <div class="row"><span class="label">Alamat</span><span class="sep">:</span><span>${data.alamatSekolah || data.kelurahan || '-'}</span></div>
      <div class="row"><span class="label">Wilayah</span><span class="sep">:</span><span>Kec. ${data.kecamatan || '-'}, Kab. ${data.kabupaten || '-'}, Prov. ${data.provinsi || '-'}</span></div>
    </div>`
  }

  const summaryHTML = `
    <div class="summary-row">
      <div class="summary-card"><div class="label">Total ${data.formType === 'education' ? 'Siswa' : 'Peserta'}</div><div class="value">${total}</div></div>
      <div class="summary-card"><div class="label">Rata-rata Kehadiran</div><div class="value">${avgAttendance}%</div></div>
      <div class="summary-card"><div class="label">Periode</div><div class="value" style="font-size:10px;">${data.periode}</div></div>
      <div class="summary-card"><div class="label">Kategori</div><div class="value" style="font-size:11px;">${label}</div></div>
    </div>`

  const legendHTML = `
    <div class="legend">
      <div class="legend-item"><span class="check-mark">${checkSVG(0)}</span> Hadir/Terlayani (≥75%)</div>
      <div class="legend-item"><span style="display:inline-block;width:15px;color:#94a3b8;font-size:13px;">—</span> Tidak Hadir (&lt;75%)</div>
      <div class="legend-item"><strong>HE</strong> = Hari Efektif</div>
      <div class="legend-item"><strong>A</strong> = Alpa</div>
      <div class="legend-item"><strong>I</strong> = Izin</div>
      <div class="legend-item"><strong>S</strong> = Sakit</div>
      <div class="legend-item"><strong>JML</strong> = HE − A − I − S</div>
      <div class="legend-item"><strong>%</strong> = (JML ÷ HE) × 100</div>
    </div>`

  const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const placeDate = `${data.kelurahan || data.kecamatan || ''}${data.kelurahan ? ', ' : ''}${today}`

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - PKH</title>
  ${formCSS()}
</head>
<body>
  <div class="page">
    <div class="form-header">
      <div class="header-left">
        ${kemsosLogo(data.logoUrl)}
        <div class="header-title">
          <h1>${title}</h1>
          <h2>${subtitle}</h2>
          <div class="subtitle">PERIODE: ${data.periode}</div>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-id">PKH-${data.formType.toUpperCase().slice(0, 3)}-${data.tahun || new Date().getFullYear()}</div>
        <div>Triwulan ${data.triwulan || ''}</div>
        <div style="color:#1e3a5f;font-weight:bold;margin-top:3px;">☑ Disahkan dengan BSrE</div>
      </div>
    </div>

    ${identityHTML}
    ${summaryHTML}
    ${tableHTML}
    ${legendHTML}

    <div class="note-box">
      <strong>Catatan:</strong>
      <ul>
        <li><strong>JML</strong> = Hari Efektif − Alpa − Izin − Sakit</li>
        <li><strong>%</strong> = (JML ÷ Hari Efektif) × 100</li>
        <li>Verifikasi kehadiran telah dilakukan oleh Pendamping PKH</li>
      </ul>
    </div>

    <div class="form-footer">
      <div class="signature-area">
        <div class="place-date">${placeDate}</div>
        <div class="role-label">Mengetahui,<br/>${data.signerRole}</div>
        ${signatureBlock(data.signerName, data.signerNIP, data.signerRole)}
      </div>
    </div>

    <div class="bsre-note">
      Dokumen ini telah diverifikasi dan ditandatangani secara elektronik menggunakan sertifikat
      <strong>BSrE (Badan Siber dan Sandi Negara)</strong>.<br/>
      Status keaslian dapat diverifikasi melalui <strong>validasi.bsre.bssn.go.id</strong>
    </div>
  </div>
</body>
</html>`
}

/* ============================================================
   Build combined HTML document (multiple forms with page breaks)
   ============================================================ */
export function generateCombinedHTML(forms: PKHFormData[]): string {
  const pages = forms
    .map((f) => `<div class="page-break">${generateFormBody(f)}</div>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Dokumen Gabungan PKH - Kementerian Sosial</title>
  ${formCSS()}
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    .page-break { page-break-after: always; }
    .page-break:last-child { page-break-after: auto; }
    .cover-page { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
    .cover-page h1 { font-size: 28px; color: #1e3a5f; margin-bottom: 8px; }
    .cover-page h2 { font-size: 18px; color: #1e3a5f; }
  </style>
</head>
<body>
  <div class="cover-page">
    ${kemsosLogo().replace('width="64" height="74"', 'width="110" height="126"')}
    <h1 style="margin-top:24px;">KEMENTERIAN SOSIAL RI</h1>
    <h2>Program Keluarga Harapan</h2>
    <p style="font-size:14px;margin-top:12px;">Dokumen Gabungan Verifikasi Komitmen PKH</p>
    <p style="font-size:12px;color:#64748b;">${forms.length} Formulir • Periode ${forms[0]?.periode || ''}</p>
  </div>
  ${pages}
</body>
</html>`
}

// Form body without html/head wrapper (for combined doc)
function generateFormBody(data: PKHFormData): string {
  const full = generateFormHTML(data)
  const bodyMatch = full.match(/<body>([\s\S]*)<\/body>/)
  return bodyMatch ? bodyMatch[1] : full
}
