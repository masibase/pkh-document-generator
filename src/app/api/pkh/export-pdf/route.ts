// API: Export HTML form to PDF using the PDF skill's html2pdf-next.js
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 120

const execFileAsync = promisify(execFile)
const PDF_SKILL_DIR = path.join(process.cwd(), 'skills', 'pdf')
const HTML2PDF = path.join(PDF_SKILL_DIR, 'scripts', 'html2pdf-next.js')
const TMP_DIR = path.join(process.cwd(), 'tmp', 'pkh-export')

export async function POST(request: NextRequest) {
  try {
    const { html, filename } = (await request.json()) as {
      html: string
      filename?: string
    }

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { success: false, error: 'HTML content is required' },
        { status: 400 }
      )
    }

    if (!existsSync(TMP_DIR)) {
      await mkdir(TMP_DIR, { recursive: true })
    }

    const jobId = randomUUID().slice(0, 8)
    const htmlPath = path.join(TMP_DIR, `form-${jobId}.html`)
    const pdfPath = path.join(TMP_DIR, `form-${jobId}.pdf`)

    await writeFile(htmlPath, html, 'utf-8')

    // Run html2pdf-next.js - use --nopaged for Chromium native pagination
    // because our forms use A4 landscape with custom @page rules
    // Use process.execPath (absolute path to current node) for reliability,
    // falling back to 'node' PATH lookup.
    const nodeBin = process.execPath || 'node'
    try {
      const { stderr } = await execFileAsync(nodeBin, [
        HTML2PDF,
        htmlPath,
        '--output', pdfPath,
        '--nopaged',
        '--title', filename || 'PKH Form - Kementerian Sosial',
      ], {
        cwd: PDF_SKILL_DIR,
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
      })

      if (stderr && process.env.NODE_ENV !== 'production') {
        console.log('html2pdf stderr:', stderr.slice(0, 500))
      }
    } catch (execErr) {
      console.error('html2pdf execution failed:', execErr)
      const msg = execErr instanceof Error ? execErr.message : String(execErr)
      if (/ENOENT|not found|spawn/i.test(msg)) {
        return NextResponse.json(
          {
            success: false,
            error: `Node executable not available (${nodeBin}). Cannot generate PDF.`,
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        {
          success: false,
          error: 'PDF generation failed: ' + msg,
        },
        { status: 500 }
      )
    }

    if (!existsSync(pdfPath)) {
      return NextResponse.json(
        { success: false, error: 'PDF file was not created' },
        { status: 500 }
      )
    }

    const pdfBuffer = await readFile(pdfPath)

    // Clean up temp files
    await Promise.allSettled([
      unlink(htmlPath).catch(() => {}),
      unlink(pdfPath).catch(() => {}),
    ])

    const safeName = (filename || 'pkh-form').replace(/[^a-zA-Z0-9\-_]/g, '_')

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (e) {
    console.error('Export PDF error:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Export failed' },
      { status: 500 }
    )
  }
}
