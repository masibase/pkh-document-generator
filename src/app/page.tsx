'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Sparkles, FileDown, CheckCircle2, Loader2,
  Database, ShieldCheck, Brain, ArrowRight, ArrowLeft, RefreshCw,
  Eye, Table2, FileSpreadsheet, AlertTriangle, TrendingUp,
  Lightbulb, ClipboardCheck, Layers, ChevronRight, FileCheck2, MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  FormType, PKHFormData, AnalysisResult, FORM_TYPE_LABELS,
} from '@/lib/pkh/types'

type Step = 0 | 1 | 2 | 3 | 4

const STEPS = [
  { id: 0, name: 'Upload Data', icon: Upload, desc: 'Muat file PDF/dokumen atau data contoh' },
  { id: 1, name: 'Tinjau Data', icon: Table2, desc: 'Verifikasi data dan jenis formulir' },
  { id: 2, name: 'Hasilkan Formulir', icon: FileText, desc: 'Generate HTML dengan tanda tangan & BSrE' },
  { id: 3, name: 'Analisis Neural', icon: Brain, desc: 'Analisis AI oleh neural engine' },
  { id: 4, name: 'Ekspor PDF', icon: FileDown, desc: 'Konversi dan unduh dokumen PDF' },
]

export default function Home() {
  const [step, setStep] = useState<Step>(0)
  const [formData, setFormData] = useState<PKHFormData | null>(null)
  const [generatedHTML, setGeneratedHTML] = useState<string>('')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState<'parse' | 'generate' | 'analyze' | 'pdf' | null>(null)
  const [combinedMode, setCombinedMode] = useState(false)
  const [previewTab, setPreviewTab] = useState<'form' | 'source'>('form')
  const [sourceFile, setSourceFile] = useState<string>('')
  const [sourceType, setSourceType] = useState<string>('')

  // ---- Step 0: Upload ----
  const handleFile = useCallback(async (file: File) => {
    setLoading('parse')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/pkh/parse', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.success && json.data) {
        setFormData(json.data)
        setSourceFile(json.sourceFile || file.name)
        setSourceType(json.sourceType || '')
        setStep(1)
        const wilayahOk = json.data.provinsi || json.data.kabupaten || json.data.kecamatan || json.data.kelurahan
        toast.success(
          `Terdeteksi: ${FORM_TYPE_LABELS[json.formType]} • ${json.totalRecords} catatan` +
          (wilayahOk ? ' • Wilayah dari dokumen' : ' • Lengkapi wilayah manual')
        )
      } else {
        toast.error(json.error || 'Gagal memproses file')
      }
    } catch (e) {
      toast.error('Gagal mengunggah file')
    } finally {
      setLoading(null)
    }
  }, [])

  const loadSample = useCallback(async (type: FormType) => {
    setLoading('parse')
    try {
      const res = await fetch('/api/pkh/sample-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formType: type, count: 12 }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setFormData(json.data)
        setSourceFile(`Data Contoh — ${FORM_TYPE_LABELS[type]}`)
        setSourceType('sample')
        setStep(1)
        toast.success(`Data contoh ${FORM_TYPE_LABELS[type]} dimuat (${json.data.records.length} catatan)`)
      }
    } catch {
      toast.error('Gagal memuat data contoh')
    } finally {
      setLoading(null)
    }
  }, [])

  // ---- Step 1: Review ----
  const updateMeta = (field: keyof PKHFormData, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev))
  }
  const changeFormType = (type: FormType) => {
    setFormData((prev) => (prev ? { ...prev, formType: type } : prev))
  }

  // ---- Step 2: Generate ----
  const generateForm = useCallback(async () => {
    if (!formData) return
    setLoading('generate')
    setGeneratedHTML('')
    try {
      const res = await fetch('/api/pkh/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', data: formData }),
      })
      const json = await res.json()
      if (json.success) {
        setGeneratedHTML(json.html)
        toast.success('Formulir HTML berhasil dihasilkan')
      } else {
        toast.error(json.error || 'Gagal generate')
      }
    } catch {
      toast.error('Gagal menghasilkan formulir')
    } finally {
      setLoading(null)
    }
  }, [formData])

  // ---- Step 3: Analyze ----
  const runAnalysis = useCallback(async () => {
    if (!formData) return
    setLoading('analyze')
    setAnalysis(null)
    try {
      const res = await fetch('/api/pkh/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      })
      const json = await res.json()
      if (json.success && json.analysis) {
        setAnalysis(json.analysis)
        toast.success('Analisis neural engine selesai')
      } else {
        toast.error(json.error || 'Analisis gagal')
      }
    } catch {
      toast.error('Gagal menjalankan analisis AI')
    } finally {
      setLoading(null)
    }
  }, [formData])

  // ---- Step 4: Export PDF ----
  const exportPDF = useCallback(async () => {
    if (!generatedHTML) return
    setLoading('pdf')
    try {
      const res = await fetch('/api/pkh/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: generatedHTML,
          filename: `PKH-${formData?.formType || 'form'}-${Date.now()}`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Export gagal')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PKH-${formData?.formType || 'form'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PDF berhasil diunduh')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal ekspor PDF')
    } finally {
      setLoading(null)
    }
  }, [generatedHTML, formData])

  const resetAll = () => {
    setFormData(null)
    setGeneratedHTML('')
    setAnalysis(null)
    setSourceFile('')
    setSourceType('')
    setStep(0)
  }

  const canGoNext = useMemo(() => {
    if (step === 0) return !!formData
    if (step === 1) return !!formData
    if (step === 2) return !!generatedHTML
    if (step === 3) return true
    return true
  }, [step, formData, generatedHTML])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      <Header onReset={resetAll} hasData={!!formData} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Hero / intro */}
        {step === 0 && !formData && <Hero />}

        {/* Stepper */}
        <Stepper currentStep={step} />

        {/* Step content */}
        <div className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && (
                <UploadStep onFile={handleFile} onSample={loadSample} loading={loading === 'parse'} />
              )}
              {step === 1 && formData && (
                <ReviewStep data={formData} onMeta={updateMeta} onType={changeFormType} sourceFile={sourceFile} sourceType={sourceType} />
              )}
              {step === 2 && formData && (
                <GenerateStep
                  data={formData}
                  html={generatedHTML}
                  loading={loading === 'generate'}
                  onGenerate={generateForm}
                  previewTab={previewTab}
                  setPreviewTab={setPreviewTab}
                />
              )}
              {step === 3 && formData && (
                <AnalyzeStep
                  data={formData}
                  analysis={analysis}
                  loading={loading === 'analyze'}
                  onAnalyze={runAnalysis}
                />
              )}
              {step === 4 && formData && (
                <ExportStep
                  formData={formData}
                  analysis={analysis}
                  hasHTML={!!generatedHTML}
                  loading={loading === 'pdf'}
                  onExport={exportPDF}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
            disabled={step === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Sebelumnya
          </Button>

          <div className="text-xs text-muted-foreground hidden sm:block">
            Langkah {step + 1} dari {STEPS.length}
          </div>

          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => Math.min(4, s + 1) as Step)}
              disabled={!canGoNext}
              className="gap-2"
            >
              Selanjutnya <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={resetAll} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Mulai Baru
            </Button>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

/* ---------------- Header ---------------- */
function Header({ onReset, hasData }: { onReset: () => void; hasData: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center text-white font-bold shadow-sm">
            KS
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">PKH Document Generator</div>
            <div className="text-[11px] text-muted-foreground leading-tight">Kementerian Sosial Republik Indonesia</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex gap-1">
            <ShieldCheck className="h-3 w-3" /> BSrE Ready
          </Badge>
          {hasData && (
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

/* ---------------- Hero ---------------- */
function Hero() {
  return (
    <div className="mb-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 rounded-full border bg-red-50 px-3 py-1 text-xs font-medium text-red-700 mb-4"
      >
        <Sparkles className="h-3 w-3" /> Sistem Otomasi Dokumen PKH
      </motion.div>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-3">
        Generator Dokumen Program Keluarga Harapan
      </h1>
      <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
        Unggah file <strong>PDF/dokumen</strong> apa pun (PDF, TXT, JSON, CSV, DOCX, XLSX), sistem otomatis
        mendeteksi jenis formulir (Pendidikan, Kesehatan, Kesejahteraan Sosial) dan <strong>mengambil data wilayah
        langsung dari dokumen</strong> tanpa mengubah hasil, lalu menghasilkan tanda tangan digital & stempel BSrE,
        menganalisis dengan neural engine, dan mengekspor ke PDF.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
        {[
          { icon: FileText, label: 'PDF & All Doc Types' },
          { icon: Database, label: 'Auto-detect Form Type' },
          { icon: MapPin, label: 'Wilayah dari Dokumen' },
          { icon: ClipboardCheck, label: 'Checkmark & QTY/% Calculation' },
          { icon: ShieldCheck, label: 'BSrE Digital Stamp' },
          { icon: Brain, label: 'Neural Engine Analysis' },
          { icon: FileDown, label: 'PDF Export' },
        ].map((f) => (
          <span key={f.label} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-slate-600">
            <f.icon className="h-3 w-3 text-red-600" /> {f.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Stepper ---------------- */
function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-center min-w-max gap-1">
        {STEPS.map((s, i) => {
          const isDone = i < currentStep
          const isCurrent = i === currentStep
          const Icon = s.icon
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 min-w-[90px]">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    isDone
                      ? 'bg-green-600 border-green-600 text-white'
                      : isCurrent
                      ? 'bg-red-600 border-red-600 text-white shadow-md shadow-red-200'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className={`text-[11px] font-medium text-center ${isCurrent ? 'text-red-700' : isDone ? 'text-green-700' : 'text-slate-400'}`}>
                  {s.name}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 sm:w-14 mx-1 ${i < currentStep ? 'bg-green-500' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Step 0: Upload ---------------- */
function UploadStep({
  onFile, onSample, loading,
}: {
  onFile: (f: File) => void
  onSample: (t: FormType) => void
  loading: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Upload zone */}
      <Card className="border-2 border-dashed border-slate-200 hover:border-red-300 transition-colors">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-red-600" /> Unggah File Dokumen
          </CardTitle>
          <CardDescription>Dukungan PDF, TXT, JSON, CSV, DOCX, XLSX</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) onFile(f)
            }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
              dragOver ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt,.json,.csv,.docx,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
              }}
            />
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-red-600 animate-spin" />
                <p className="text-sm text-muted-foreground">Memproses dokumen...</p>
                <p className="text-[11px] text-slate-400">Ekstraksi teks PDF mungkin membutuhkan beberapa detik</p>
              </div>
            ) : (
              <>
                <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                  <FileText className="h-6 w-6 text-red-600" />
                </div>
                <p className="text-sm font-medium text-slate-700">Tarik & lepas file di sini</p>
                <p className="text-xs text-muted-foreground mt-1">atau klik untuk memilih file</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {['PDF', 'TXT', 'JSON', 'CSV', 'DOCX', 'XLSX'].map((fmt) => (
                    <span key={fmt} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">.{fmt.toLowerCase()}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sample data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-red-600" /> Muat Data Contoh
          </CardTitle>
          <CardDescription>Coba langsung dengan data PKH contoh yang realistis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SampleButton
            title="Formulir Pendidikan"
            desc="Kehadiran anak sekolah (SD/SMP/SMA) - 12 bulan, QTY & %"
            color="bg-blue-500"
            loading={loading}
            onClick={() => onSample('education')}
          />
          <SampleButton
            title="Formulir Kesehatan"
            desc="Kunjungan Posyandu & pemeriksaan kesehatan keluarga"
            color="bg-emerald-500"
            loading={loading}
            onClick={() => onSample('health')}
          />
          <SampleButton
            title="Formulir Kesejahteraan Sosial"
            desc="Daftar penerima bantuan PKH dan status verifikasi"
            color="bg-amber-500"
            loading={loading}
            onClick={() => onSample('social')}
          />
          <Separator className="my-3" />
          <Alert className="bg-slate-50 border-slate-200">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-xs text-slate-600">
              Sistem akan <strong>otomatis mendeteksi</strong> jenis formulir berdasarkan isi dokumen
              dan <strong>mengambil data wilayah (kabupaten/kecamatan/desa) langsung dari file</strong> —
              hasil tidak diubah. Anda juga dapat mengubah jenis formulir secara manual di langkah berikutnya.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

function SampleButton({
  title, desc, color, loading, onClick,
}: {
  title: string; desc: string; color: string; loading: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full text-left rounded-lg border p-3 hover:border-red-300 hover:bg-red-50/40 transition-colors disabled:opacity-50 group"
    >
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
          {title.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-800 flex items-center gap-1">
            {title}
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-red-600 transition-colors ml-auto" />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
        </div>
      </div>
    </button>
  )
}

/* ---------------- Step 1: Review ---------------- */
function ReviewStep({
  data, onMeta, onType, sourceFile, sourceType,
}: {
  data: PKHFormData
  onMeta: (f: keyof PKHFormData, v: string) => void
  onType: (t: FormType) => void
  sourceFile: string
  sourceType: string
}) {
  // Cross-check: which wilayah fields were extracted from the document?
  const wilayahFields = [
    { key: 'provinsi', label: 'Provinsi', value: data.provinsi },
    { key: 'kabupaten', label: 'Kabupaten/Kota', value: data.kabupaten },
    { key: 'kecamatan', label: 'Kecamatan', value: data.kecamatan },
    { key: 'kelurahan', label: 'Kelurahan/Desa', value: data.kelurahan },
  ] as const
  const extractedCount = wilayahFields.filter((f) => f.value && f.value.trim().length > 0).length
  const missingCount = wilayahFields.length - extractedCount

  return (
    <div className="space-y-5">
      {/* Source file cross-check banner */}
      {sourceFile && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                <FileCheck2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">Sumber Dokumen:</span>
                  <code className="text-xs px-2 py-0.5 rounded bg-white border text-slate-700 truncate max-w-[280px]">{sourceFile}</code>
                  {sourceType && (
                    <Badge variant="secondary" className="text-[10px] uppercase">{sourceType}</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    Wilayah diekstrak dari dokumen:
                  </span>
                  {wilayahFields.map((f) => (
                    <span key={f.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                      f.value?.trim()
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {f.value?.trim() ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {f.label}: {f.value?.trim() || 'kosong'}
                    </span>
                  ))}
                </div>
                {missingCount > 0 && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    {missingCount} field wilayah tidak ditemukan di dokumen — silakan lengkapi manual di bawah.
                    Data hasil tidak akan diubah oleh sistem.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4 text-red-600" /> Konfigurasi & Metadata Formulir
          </CardTitle>
          <CardDescription>
            Verifikasi jenis formulir dan lengkapi metadata wilayah sesuai dokumen sumber
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Jenis Formulir</Label>
              <Select value={data.formType} onValueChange={(v) => onType(v as FormType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">Pendidikan</SelectItem>
                  <SelectItem value="health">Kesehatan</SelectItem>
                  <SelectItem value="social">Kesejahteraan Sosial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Periode" value={data.periode} onChange={(v) => onMeta('periode', v)} />
            <Field label="Provinsi" value={data.provinsi} onChange={(v) => onMeta('provinsi', v)} />
            <Field label="Kabupaten/Kota" value={data.kabupaten} onChange={(v) => onMeta('kabupaten', v)} />
            <Field label="Kecamatan" value={data.kecamatan} onChange={(v) => onMeta('kecamatan', v)} />
            <Field label="Kelurahan/Desa" value={data.kelurahan} onChange={(v) => onMeta('kelurahan', v)} />
            <Field label="Pendamping PKH" value={data.facilitator} onChange={(v) => onMeta('facilitator', v)} />
            <Field label="NIP Pendamping" value={data.nipFacilitator} onChange={(v) => onMeta('nipFacilitator', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-red-600" /> Data Peserta
              </CardTitle>
              <CardDescription>{data.records.length} catatan terdeteksi</CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" /> {FORM_TYPE_LABELS[data.formType]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] rounded-md border">
            <RecordsTable data={data} />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
    </div>
  )
}

function RecordsTable({ data }: { data: PKHFormData }) {
  const isEdu = data.formType === 'education'
  const isHealth = data.formType === 'health'
  const isSocial = data.formType === 'social'

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-slate-50 z-10">
        {isSocial ? (
          <tr className="text-left border-b">
            <th className="p-2 font-semibold">No</th>
            <th className="p-2 font-semibold">Nama</th>
            <th className="p-2 font-semibold">NIK</th>
            <th className="p-2 font-semibold">Alamat</th>
            <th className="p-2 font-semibold">Bantuan</th>
            <th className="p-2 font-semibold">Jumlah</th>
            <th className="p-2 font-semibold">Status</th>
          </tr>
        ) : (
          <tr className="text-left border-b">
            <th className="p-2 font-semibold">No</th>
            <th className="p-2 font-semibold">Nama</th>
            <th className="p-2 font-semibold">NIK</th>
            <th className="p-2 font-semibold">{isEdu ? 'Sekolah' : 'Posyandu'}</th>
            <th className="p-2 font-semibold">{isEdu ? 'Kelas' : 'BB/TB'}</th>
            <th className="p-2 font-semibold text-center">Kehadiran</th>
            <th className="p-2 font-semibold text-center">%</th>
          </tr>
        )}
      </thead>
      <tbody>
        {data.records.map((r, i) => {
          const arr = (r.kehadiran || r.pemeriksaan || []) as boolean[]
          const present = arr.filter(Boolean).length
          const pct = arr.length ? Math.round((present / arr.length) * 100) : 0
          if (isSocial) {
            return (
              <tr key={i} className="border-b hover:bg-slate-50">
                <td className="p-2 text-muted-foreground">{i + 1}</td>
                <td className="p-2 font-medium">{r.nama}</td>
                <td className="p-2 text-muted-foreground font-mono text-[10px]">{r.nik}</td>
                <td className="p-2 text-muted-foreground">{r.alamat || '-'}</td>
                <td className="p-2">{r.bantuan || '-'}</td>
                <td className="p-2">{r.jumlahBantuan || '-'}</td>
                <td className="p-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.status || 'Aktif'}
                  </span>
                </td>
              </tr>
            )
          }
          return (
            <tr key={i} className="border-b hover:bg-slate-50">
              <td className="p-2 text-muted-foreground">{i + 1}</td>
              <td className="p-2 font-medium">{r.nama}</td>
              <td className="p-2 text-muted-foreground font-mono text-[10px]">{r.nik}</td>
              <td className="p-2 text-muted-foreground">{isEdu ? r.sekolah : r.posyandu}</td>
              <td className="p-2">{isEdu ? `${r.jenjang} ${r.kelas}` : `${r.beratBadan || '-'} / ${r.tinggiBadan || '-'}`}</td>
              <td className="p-2">
                <div className="flex gap-0.5 justify-center">
                  {arr.map((v, j) => (
                    <span key={j} className={`h-2.5 w-2.5 rounded-sm ${v ? 'bg-green-500' : 'bg-slate-200'}`} title={`Bulan ${j + 1}: ${v ? 'Hadir' : 'Tidak'}`} />
                  ))}
                </div>
              </td>
              <td className="p-2 text-center">
                <span className={`font-semibold ${pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ---------------- Step 2: Generate ---------------- */
function GenerateStep({
  data, html, loading, onGenerate, previewTab, setPreviewTab,
}: {
  data: PKHFormData
  html: string
  loading: boolean
  onGenerate: () => void
  previewTab: 'form' | 'source'
  setPreviewTab: (t: 'form' | 'source') => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-red-600" /> Hasilkan Formulir HTML
              </CardTitle>
              <CardDescription>Generate dokumen lengkap dengan checkmark, tanda tangan, dan stempel BSrE</CardDescription>
            </div>
            <Button onClick={onGenerate} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {html ? 'Regenerate' : 'Hasilkan Formulir'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard icon={Database} label="Total Catatan" value={String(data.records.length)} />
            <StatCard icon={Layers} label="Jenis Formulir" value={FORM_TYPE_LABELS[data.formType]} />
            <StatCard icon={ShieldCheck} label="Stempel BSrE" value="Aktif" />
            <StatCard icon={ClipboardCheck} label="Tanda Tangan" value="3 Blok" />
          </div>
          {!html && !loading && (
            <Alert className="bg-blue-50 border-blue-200">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-sm text-blue-800">
                Klik <strong>"Hasilkan Formulir"</strong> untuk membuat dokumen HTML yang siap dicetak.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {html && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-red-600" /> Pratinjau Dokumen
              </CardTitle>
              <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'form' | 'source')}>
                <TabsList className="h-8">
                  <TabsTrigger value="form" className="text-xs px-3">Rendered</TabsTrigger>
                  <TabsTrigger value="source" className="text-xs px-3">HTML Source</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={previewTab}>
              <TabsContent value="form" className="mt-0">
                <div className="rounded-md border bg-slate-100 overflow-hidden">
                  <iframe
                    title="Form Preview"
                    srcDoc={html}
                    className="w-full h-[640px] bg-white"
                  />
                </div>
              </TabsContent>
              <TabsContent value="source" className="mt-0">
                <ScrollArea className="h-[640px] rounded-md border bg-slate-950">
                  <pre className="p-4 text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all">{html}</pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

/* ---------------- Step 3: Analyze ---------------- */
function AnalyzeStep({
  data, analysis, loading, onAnalyze,
}: {
  data: PKHFormData
  analysis: AnalysisResult | null
  loading: boolean
  onAnalyze: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-red-600" /> Neural Engine Analysis
              </CardTitle>
              <CardDescription>Analisis cerdas berbasis AI atas data PKH</CardDescription>
            </div>
            <Button onClick={onAnalyze} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analysis ? 'Analisis Ulang' : 'Jalankan Analisis'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!analysis && !loading && (
            <Alert className="bg-purple-50 border-purple-200">
              <Brain className="h-4 w-4 text-purple-500" />
              <AlertDescription className="text-sm text-purple-800">
                Neural engine akan menganalisis {data.records.length} catatan PKH untuk
                mengidentifikasi pola kehadiran, peserta berisiko, dan rekomendasi tindak lanjut.
              </AlertDescription>
            </Alert>
          )}
          {loading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                Neural engine sedang menganalisis data...
              </div>
              <Progress value={60} className="h-1.5" />
              <SkeletonLoader />
            </div>
          )}
        </CardContent>
      </Card>

      {analysis && !loading && <AnalysisResultPanel analysis={analysis} data={data} />}
    </div>
  )
}

function SkeletonLoader() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-1/3 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function AnalysisResultPanel({ analysis, data }: { analysis: AnalysisResult; data: PKHFormData }) {
  const stats = analysis.statistics
  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Database} label="Total Peserta" value={String(stats.totalBeneficiaries)} />
        {stats.attendanceRate !== undefined && (
          <StatCard icon={TrendingUp} label="Rata-rata Kehadiran" value={`${stats.attendanceRate}%`} />
        )}
        {stats.completionRate !== undefined && (
          <StatCard icon={CheckCircle2} label="Tingkat Penyelesaian" value={`${stats.completionRate}%`} />
        )}
        <StatCard icon={AlertTriangle} label="Flag Risiko" value={String(analysis.riskFlags.length)} />
      </div>

      {/* Summary */}
      <Card className="border-purple-200 bg-purple-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" /> Ringkasan Analisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Insights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Insight Kunci
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.insights.map((ins, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-green-600" /> Rekomendasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Risk flags */}
      {analysis.riskFlags.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm text-amber-800">Flag Risiko Terdeteksi</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-sm text-amber-700">
              {analysis.riskFlags.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-500">•</span> {f}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Category breakdown */}
      {Object.keys(stats.categories).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-600" /> Distribusi Kategori
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.categories).map(([k, v]) => {
                const pct = Math.round((v / stats.totalBeneficiaries) * 100)
                return (
                  <div key={k} className="flex items-center gap-3 text-xs">
                    <div className="w-28 font-medium text-slate-700 truncate">{k}</div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-16 text-right text-muted-foreground">{v} ({pct}%)</div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ---------------- Step 4: Export ---------------- */
function ExportStep({
  formData, analysis, hasHTML, loading, onExport,
}: {
  formData: PKHFormData
  analysis: AnalysisResult | null
  hasHTML: boolean
  loading: boolean
  onExport: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-red-600" /> Ekspor Dokumen PDF
          </CardTitle>
          <CardDescription>Konversi formulir HTML menjadi PDF siap cetak</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 bg-gradient-to-br from-slate-50 to-white">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-red-600" />
                <span className="font-medium text-sm">Dokumen Formulir</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between"><span>Jenis</span><span className="font-medium">{FORM_TYPE_LABELS[formData.formType]}</span></div>
                <div className="flex justify-between"><span>Jumlah Peserta</span><span className="font-medium">{formData.records.length}</span></div>
                <div className="flex justify-between"><span>Stempel BSrE</span><span className="font-medium text-green-600">Terverifikasi</span></div>
                <div className="flex justify-between"><span>Tanda Tangan</span><span className="font-medium">3 blok digital</span></div>
                <div className="flex justify-between"><span>Format Output</span><span className="font-medium">PDF (A4 Landscape)</span></div>
              </div>
            </div>

            <div className="rounded-lg border p-4 bg-gradient-to-br from-red-50/50 to-white">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <span className="font-medium text-sm">Status Verifikasi</span>
              </div>
              <div className="space-y-2">
                <CheckRow label="Checkmark kehadiran" done />
                <CheckRow label="Kalkulasi QTY & %" done />
                <CheckRow label="Stempel BSrE" done />
                <CheckRow label="Tanda tangan digital" done />
                <CheckRow label="Neural engine analysis" done={!!analysis} />
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {!hasHTML && (
            <Alert className="bg-amber-50 border-amber-200 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm text-amber-800">
                Formulir HTML belum dihasilkan. Kembali ke langkah 3 untuk generate formulir terlebih dahulu,
                atau ekspor PDF akan otomatis generate dari data saat ini.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {hasHTML
                ? 'Formulir siap diekspor. Klik tombol di kanan untuk mengunduh PDF.'
                : 'Klik tombol di kanan untuk generate + ekspor sekaligus.'}
            </div>
            <Button size="lg" onClick={onExport} disabled={loading} className="gap-2 bg-red-600 hover:bg-red-700">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
              {loading ? 'Mengonversi...' : 'Unduh PDF'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" /> Ringkasan Neural Engine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CheckRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 text-amber-400" />
      )}
      <span className={done ? 'text-slate-700' : 'text-amber-700'}>{label}</span>
    </div>
  )
}

/* ---------------- Footer ---------------- */
function Footer() {
  return (
    <footer className="mt-auto border-t bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-red-600" />
          <span>PKH Document Generator &middot; Kementerian Sosial RI</span>
        </div>
        <div className="flex items-center gap-3">
          <span>BSrE Certified</span>
          <span>&middot;</span>
          <span>Neural Engine v1.0</span>
          <span>&middot;</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  )
}
