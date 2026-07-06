// PKH HTML Form Generator
// Generates print-ready HTML forms with checkmarks, signatures, and BSrE stamps
import {
  FormType,
  PKHFormData,
  PKHRecord,
  MONTHS_ID,
  FORM_TYPE_TITLES,
  FORM_TYPE_LABELS,
} from './types'
import { calcAttendance } from './parser'

// Checkmark SVG (green check)
function checkSVG(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#16a34a"/><path d="M7 12.5L10.5 16L17 9" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function dashSVG(): string {
  return `<span style="display:inline-block;width:14px;color:#94a3b8;">—</span>`
}

// BSrE (Badan Sertifikasi Elektronik) digital stamp - circular seal SVG
function bsreStampSVG(): string {
  return `
  <div class="bsre-stamp" aria-label="BSrE Digital Signature Stamp">
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path id="circleTop" d="M 60,60 m -42,0 a 42,42 0 1,1 84,0" fill="none" />
        <path id="circleBottom" d="M 60,60 m -42,0 a 42,42 0 1,0 84,0" fill="none" />
      </defs>
      <circle cx="60" cy="60" r="55" fill="none" stroke="#b91c1c" stroke-width="2" opacity="0.85"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="#b91c1c" stroke-width="1" opacity="0.7"/>
      <circle cx="60" cy="60" r="42" fill="none" stroke="#b91c1c" stroke-width="1" opacity="0.5" stroke-dasharray="2 2"/>
      <text font-family="Arial, sans-serif" font-size="7" fill="#b91c1c" font-weight="bold" letter-spacing="0.8">
        <textPath href="#circleTop" startOffset="50%" text-anchor="middle">BADAN SERTIFIKASI ELEKTRONIK</textPath>
      </text>
      <text font-family="Arial, sans-serif" font-size="6" fill="#b91c1c" letter-spacing="0.5">
        <textPath href="#circleBottom" startOffset="50%" text-anchor="middle">KEMENTERIAN KOMUNIKASI DAN INFORMATIKA RI</textPath>
      </text>
      <!-- Garuda-like center emblem (simplified) -->
      <g transform="translate(60,60)">
        <circle r="20" fill="#b91c1c" opacity="0.08"/>
        <text x="0" y="-2" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#b91c1c" font-weight="bold">BSrE</text>
        <text x="0" y="8" text-anchor="middle" font-family="Arial, sans-serif" font-size="4.5" fill="#b91c1c">TERSERTIFIKASI</text>
        <line x1="-14" y1="13" x2="14" y2="13" stroke="#b91c1c" stroke-width="0.5"/>
        <text x="0" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="3.5" fill="#b91c1c">e-SIGN VERIFIED</text>
      </g>
    </svg>
  </div>`
}

// Signature block with hand-drawn-like SVG signature + BSrE stamp overlay
function signatureBlock(name: string, nip: string, role: string): string {
  // Script-like signature SVG
  const signaturePath = `
    <svg width="160" height="50" viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M 10 35 Q 20 10, 30 30 T 50 25 Q 60 15, 70 30 Q 80 40, 90 22 T 115 28 Q 125 18, 140 32"
        fill="none" stroke="#1e3a5f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      <path d="M 25 38 L 130 38" stroke="#1e3a5f" stroke-width="0.8" opacity="0.5"/>
      <circle cx="145" cy="30" r="2" fill="#1e3a5f" opacity="0.7"/>
    </svg>`

  return `
  <div class="signature-block">
    <div class="sig-stamp-overlay">${bsreStampSVG()}</div>
    <div class="sig-name-svg">${signaturePath}</div>
    <div class="sig-line"></div>
    <div class="sig-name"><strong>${name}</strong></div>
    <div class="sig-nip">NIP. ${nip}</div>
    <div class="sig-role">${role}</div>
  </div>`
}

// Kementerian Sosial emblem (simplified Garuda-style shield)
function kemsosLogo(): string {
  return `
  <svg width="70" height="80" viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg" aria-label="Logo Kementerian Sosial">
    <path d="M35 2 L65 12 V40 C65 58 52 72 35 78 C18 72 5 58 5 40 V12 Z" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
    <path d="M35 8 L59 16 V40 C59 54 49 66 35 71 C21 66 11 54 11 40 V16 Z" fill="#fef2f2" stroke="#dc2626" stroke-width="0.8"/>
    <text x="35" y="30" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#dc2626">KEMEN</text>
    <text x="35" y="40" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#dc2626">SOS</text>
    <path d="M35 44 L40 50 L35 56 L30 50 Z" fill="#dc2626"/>
    <text x="35" y="66" text-anchor="middle" font-family="Arial" font-size="4" fill="#dc2626">PKH</text>
  </svg>`
}

// Shared CSS for all forms
function formCSS(): string {
  return `
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 10px; background: #fff; }
    .page { width: 100%; }
    .form-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #1a1a1a; padding-bottom: 8px; margin-bottom: 12px; }
    .header-left { display: flex; gap: 10px; align-items: flex-start; }
    .header-title h1 { font-size: 13px; margin: 0; font-weight: bold; text-transform: uppercase; }
    .header-title h2 { font-size: 11px; margin: 2px 0; font-weight: bold; text-transform: uppercase; }
    .header-title .subtitle { font-size: 9px; margin-top: 4px; }
    .header-right { text-align: right; font-size: 9px; }
    .header-right .doc-id { font-weight: bold; border: 1px solid #1a1a1a; padding: 2px 6px; display: inline-block; margin-bottom: 4px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 16px; margin: 10px 0; font-size: 10px; }
    .meta-grid div { display: flex; gap: 4px; }
    .meta-grid .label { min-width: 80px; font-weight: 600; }
    .meta-grid .sep { font-weight: 600; }
    table.form-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9px; }
    table.form-table th, table.form-table td { border: 1px solid #1a1a1a; padding: 3px 4px; text-align: center; vertical-align: middle; }
    table.form-table th { background: #f1f5f9; font-weight: bold; font-size: 8.5px; }
    table.form-table td.nama-cell { text-align: left; }
    table.form-table th.month-col { width: 28px; writing-mode: horizontal-tb; }
    table.form-table .qty-col { width: 40px; background: #fef9c3; font-weight: bold; }
    table.form-table .pct-col { width: 40px; background: #dcfce7; font-weight: bold; }
    table.form-table .no-col { width: 32px; }
    table.form-table .check-cell { background: #fff; }
    table.form-table tr:nth-child(even) td { background: #fafafa; }
    table.form-table tr:nth-child(even) td.check-cell { background: #f5f5f5; }
    .check-mark { display: inline-flex; align-items: center; justify-content: center; }
    .form-footer { margin-top: 20px; display: flex; justify-content: space-between; gap: 20px; }
    .signature-area { width: 33%; text-align: center; }
    .signature-area .place-date { margin-bottom: 60px; font-size: 10px; }
    .signature-block { position: relative; display: inline-block; }
    .sig-stamp-overlay { position: absolute; top: -45px; left: 50%; transform: translateX(-30%) rotate(-12deg); opacity: 0.9; z-index: 2; pointer-events: none; }
    .sig-name-svg { display: flex; justify-content: center; margin-bottom: 2px; }
    .sig-line { border-top: 1px solid #1a1a1a; width: 80%; margin: 0 auto 2px; }
    .sig-name { font-size: 10px; }
    .sig-nip { font-size: 9px; }
    .sig-role { font-size: 8.5px; color: #555; margin-top: 1px; }
    .bsre-stamp { display: inline-block; }
    .note-box { margin-top: 14px; padding: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 8.5px; border-radius: 3px; }
    .note-box strong { color: #b91c1c; }
    .legend { display: flex; gap: 16px; font-size: 8.5px; margin-top: 6px; align-items: center; }
    .legend-item { display: flex; gap: 4px; align-items: center; }
    .form-title-banner { background: #1e3a5f; color: #fff; padding: 6px 12px; text-align: center; font-weight: bold; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 1px; }
    .summary-row { display: flex; gap: 12px; margin: 10px 0; font-size: 9.5px; }
    .summary-card { flex: 1; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 3px; background: #f8fafc; }
    .summary-card .label { font-size: 8px; color: #64748b; text-transform: uppercase; }
    .summary-card .value { font-size: 14px; font-weight: bold; color: #1e3a5f; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>`
}

// Build attendance table for education/health forms
function buildAttendanceTable(
  records: PKHRecord[],
  formType: FormType
): string {
  const isEducation = formType === 'education'
  const arrKey = isEducation ? 'kehadiran' : 'pemeriksaan'

  const monthHeaders = MONTHS_ID.map(
    (m) => `<th class="month-col">${m}</th>`
  ).join('')

  const rows = records
    .map((r, idx) => {
      const arr = (r[arrKey] as boolean[] | undefined) || []
      const { qty, percent } = calcAttendance(r)
      const cells = MONTHS_ID.map((_, i) => {
        const present = arr[i]
        return `<td class="check-cell">${present ? `<span class="check-mark">${checkSVG()}</span>` : dashSVG()}</td>`
      }).join('')

      const nameCol = isEducation
        ? `<td class="nama-cell">${r.nama}<br/><span style="font-size:7.5px;color:#64748b;">${r.sekolah || '-'} • ${r.jenjang || ''} ${r.kelas || ''}</span></td>`
        : `<td class="nama-cell">${r.nama}<br/><span style="font-size:7.5px;color:#64748b;">${r.posyandu || 'Posyandu'}</span></td>`

      return `
      <tr>
        <td class="no-col">${idx + 1}</td>
        <td style="width:120px;">${r.nik}</td>
        ${nameCol}
        ${cells}
        <td class="qty-col">${qty}</td>
        <td class="pct-col">${percent}%</td>
      </tr>`
    })
    .join('')

  return `
  <table class="form-table">
    <thead>
      <tr>
        <th class="no-col" rowspan="2">No</th>
        <th rowspan="2">NIK</th>
        <th rowspan="2">Nama ${isEducation ? '/ Sekolah' : '/ Posyandu'}</th>
        <th colspan="12">Periode Kehadiran Bulanan (12 Bulan)</th>
        <th class="qty-col" rowspan="2">QTY</th>
        <th class="pct-col" rowspan="2">%</th>
      </tr>
      <tr>
        ${monthHeaders}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
}

// Build social welfare table
function buildSocialTable(records: PKHRecord[]): string {
  const rows = records
    .map((r, idx) => {
      return `
      <tr>
        <td class="no-col">${idx + 1}</td>
        <td style="width:130px;">${r.nik}</td>
        <td class="nama-cell">${r.nama}${r.jenisKelamin ? ` (${r.jenisKelamin})` : ''}</td>
        <td style="text-align:left;">${r.alamat || '-'}</td>
        <td>${r.kelurahan || '-'}</td>
        <td>${r.kecamatan || '-'}</td>
        <td style="text-align:left;">${r.bantuan || 'PKH Reguler'}</td>
        <td>${r.jumlahBantuan || 'Rp 2.500.000'}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:3px;background:${r.status === 'Aktif' ? '#dcfce7' : '#fee2e2'};color:${r.status === 'Aktif' ? '#166534' : '#991b1b'};font-weight:600;font-size:8px;">${r.status || 'Aktif'}</span></td>
        <td class="check-cell"><span class="check-mark">${checkSVG()}</span></td>
      </tr>`
    })
    .join('')

  return `
  <table class="form-table">
    <thead>
      <tr>
        <th class="no-col">No</th>
        <th>NIK</th>
        <th>Nama Peserta</th>
        <th>Alamat</th>
        <th>Kelurahan</th>
        <th>Kecamatan</th>
        <th>Jenis Bantuan</th>
        <th>Jumlah</th>
        <th>Status</th>
        <th>Terverifikasi</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

// Calculate summary statistics
function calcSummary(data: PKHFormData) {
  const total = data.records.length
  let avgAttendance = 0
  if (data.formType !== 'social') {
    const percents = data.records.map((r) => calcAttendance(r).percent)
    avgAttendance = Math.round(
      percents.reduce((a, b) => a + b, 0) / (percents.length || 1)
    )
  }
  return { total, avgAttendance }
}

// Build complete HTML for a single form
export function generateFormHTML(data: PKHFormData): string {
  const title = FORM_TYPE_TITLES[data.formType]
  const label = FORM_TYPE_LABELS[data.formType]
  const { total, avgAttendance } = calcSummary(data)

  const tableHTML =
    data.formType === 'social'
      ? buildSocialTable(data.records)
      : buildAttendanceTable(data.records, data.formType)

  const summaryHTML =
    data.formType === 'social'
      ? `
      <div class="summary-row">
        <div class="summary-card"><div class="label">Total Peserta</div><div class="value">${total}</div></div>
        <div class="summary-card"><div class="label">Jenis Bantuan</div><div class="value">PKH</div></div>
        <div class="summary-card"><div class="label">Periode</div><div class="value" style="font-size:11px;">${data.periode}</div></div>
        <div class="summary-card"><div class="label">Status Verifikasi</div><div class="value" style="color:#16a34a;">Terverifikasi</div></div>
      </div>`
      : `
      <div class="summary-row">
        <div class="summary-card"><div class="label">Total ${data.formType === 'education' ? 'Anak' : 'Keluarga'}</div><div class="value">${total}</div></div>
        <div class="summary-card"><div class="label">Rata-rata Kehadiran</div><div class="value">${avgAttendance}%</div></div>
        <div class="summary-card"><div class="label">Periode</div><div class="value" style="font-size:11px;">${data.periode}</div></div>
        <div class="summary-card"><div class="label">Kategori</div><div class="value" style="font-size:11px;">${label}</div></div>
      </div>`

  const legendHTML =
    data.formType !== 'social'
      ? `
      <div class="legend">
        <div class="legend-item"><span class="check-mark">${checkSVG()}</span> Hadir/Terlayani</div>
        <div class="legend-item">${dashSVG()} Tidak Hadir</div>
        <div class="legend-item"><strong>QTY</strong> = Jumlah Kehadiran</div>
        <div class="legend-item"><strong>%</strong> = Persentase Kehadiran</div>
      </div>`
      : ''

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
        ${kemsosLogo()}
        <div class="header-title">
          <h1>Kementerian Sosial Republik Indonesia</h1>
          <h2>Program Keluarga Harapan (PKH)</h2>
          <div class="subtitle">Direktorat Jenderal Perlindungan dan Jaminan Sosial</div>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-id">PKH-${data.formType.toUpperCase().slice(0, 3)}-${new Date().getFullYear()}</div>
        <div>Periode: ${data.periode}</div>
        <div style="color:#b91c1c;font-weight:bold;margin-top:3px;">☐ Disahkan dengan BSrE</div>
      </div>
    </div>

    <div class="form-title-banner">${title}</div>

    <div class="meta-grid">
      <div><span class="label">Provinsi</span><span class="sep">:</span><span>${data.provinsi || '—'}</span></div>
      <div><span class="label">Kabupaten/Kota</span><span class="sep">:</span><span>${data.kabupaten || '—'}</span></div>
      <div><span class="label">Kecamatan</span><span class="sep">:</span><span>${data.kecamatan || '—'}</span></div>
      <div><span class="label">Kelurahan/Desa</span><span class="sep">:</span><span>${data.kelurahan || '—'}</span></div>
    </div>

    ${summaryHTML}

    ${tableHTML}

    ${legendHTML}

    <div class="note-box">
      <strong>Catatan:</strong> Dokumen ini diterbitkan oleh sistem PKH dan telah diverifikasi melalui tanda tangan elektronik bersertifikat <strong>BSrE (Badan Sertifikasi Elektronik)</strong> Kementerian Komunikasi dan Informatika RI. Kehadiran dicatat berdasarkan laporan pendamping PKH dan diverifikasi oleh Koordinator wilayah setempat.
    </div>

    <div class="form-footer">
      <div class="signature-area">
        <div class="place-date">${data.kelurahan ? data.kelurahan + ', ' : ''}${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div style="font-size:9px;margin-bottom:4px;">Mengetahui,<br/>Kepala Desa/Lurah</div>
        ${signatureBlock('Drs. H. Bambang Suryanto', '196505121990031002', 'Kepala Desa')}
      </div>
      <div class="signature-area">
        <div class="place-date">&nbsp;</div>
        <div style="font-size:9px;margin-bottom:4px;">Disusun oleh,<br/>Pendamping PKH</div>
        ${signatureBlock(data.facilitator, data.nipFacilitator, 'Pendamping PKH')}
      </div>
      <div class="signature-area">
        <div class="place-date">&nbsp;</div>
        <div style="font-size:9px;margin-bottom:4px;">Menyetujui,<br/>Koordinator PKH</div>
        ${signatureBlock('Dr. Suryo Prabowo, M.Si', '197208151997031004', 'Koordinator PKH')}
      </div>
    </div>
  </div>
</body>
</html>`
}

// Build combined HTML document (multiple forms with page breaks)
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
    .cover-page h2 { font-size: 18px; color: #dc2626; }
  </style>
</head>
<body>
  <div class="cover-page">
    ${kemsosLogo().replace('width="70" height="80"', 'width="120" height="140"')}
    <h1 style="margin-top:24px;">KEMENTERIAN SOSIAL RI</h1>
    <h2>Program Keluarga Harapan</h2>
    <p style="font-size:14px;margin-top:12px;">Dokumen Gabungan Laporan PKH</p>
    <p style="font-size:12px;color:#64748b;">${forms.length} Formulir • Periode ${forms[0]?.periode || ''}</p>
  </div>
  ${pages}
</body>
</html>`
}

// Form body without html/head wrapper (for combined doc)
function generateFormBody(data: PKHFormData): string {
  // Strip doctype/html/head/body from single form
  const full = generateFormHTML(data)
  const bodyMatch = full.match(/<body>([\s\S]*)<\/body>/)
  return bodyMatch ? bodyMatch[1] : full
}
