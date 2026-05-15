'use client'

import { useState, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
type FileStatus = 'queued' | 'reading' | 'uploading' | 'processed' | 'skipped' | 'error'

type FileItem = {
  id:       string
  name:     string
  size:     number
  type:     string
  file:     File
  status:   FileStatus
  reason?:  string
  memories?: number
}

type UploadResult = {
  processed: number
  skipped:   number
  errors:    number
  totalMemoriesCreated: number
  results:   { name: string; status: string; reason?: string; memoriesCreated?: number }[]
}

// ── Constants ──────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = [
  'pdf', 'txt', 'md', 'csv', 'json', 'html',
  'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls',
  'jpg', 'jpeg', 'png', 'gif', 'webp',
]

const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE    = MAX_FILE_SIZE_MB * 1024 * 1024
const BATCH_SIZE       = 3 // Process 3 files at a time

const C = {
  cream:    '#FDF8F0',
  sand:     '#F5EDD8',
  sandMid:  '#EFE0C0',
  border:   '#E8DEC8',
  amber:    '#B47B2E',
  amberDim: '#FDF0DC',
  walnut:   '#7C5A1E',
  espresso: '#3C2A0E',
  muted:    '#A08050',
  light:    '#C8A462',
  white:    '#FFFFFF',
  green:    '#4A7C59',
  greenDim: '#EAF3EE',
  red:      '#9B3A2A',
  redDim:   '#FAEAE7',
}

// ── Office file text extraction (runs in browser — no upload of raw office files) ──
async function extractTextFromOffice(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    const arrayBuffer = await file.arrayBuffer()
    const wb   = XLSX.read(arrayBuffer, { type: 'array' })
    return wb.SheetNames.map(name => {
      const ws  = wb.Sheets[name]
      return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(ws)}`
    }).join('\n\n')
  }

  if (ext === 'pptx' || ext === 'ppt') {
    // PPTX: extract text from XML inside ZIP
    // Simple approach: read as text and extract visible strings
    const text = await file.text()
    const matches = text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || []
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('\n')
  }

  if (ext === 'csv') {
    return file.text()
  }

  return file.text()
}

// ── Utility ─────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    pdf: '📄', txt: '📝', md: '📝', csv: '📊', json: '📋',
    docx: '📘', doc: '📘', pptx: '📙', ppt: '📙', xlsx: '📗', xls: '📗',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    html: '🌐', mp3: '🎵', wav: '🎵', m4a: '🎵',
  }
  return map[ext || ''] || '📁'
}

function isAccepted(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ACCEPTED_EXTENSIONS.includes(ext)
}

// ── Main component ──────────────────────────────────────────────────────────
type Props = { onComplete: () => void }

export default function BulkUpload({ onComplete }: Props) {
  const [files, setFiles]       = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [summary, setSummary]   = useState<UploadResult | null>(null)
  const [activeTab, setActiveTab] = useState<'drop' | 'results'>('drop')
  const dropRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Collect files from drop event (handles folders recursively) ─────────
  const collectFiles = async (items: DataTransferItemList): Promise<File[]> => {
    const files: File[] = []

    const readEntry = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        const file = await new Promise<File>(res => fileEntry.file(res))
        if (isAccepted(file) && file.size <= MAX_FILE_SIZE) {
          files.push(file)
        }
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry
        const reader   = dirEntry.createReader()
        const entries  = await new Promise<FileSystemEntry[]>(res =>
          reader.readEntries(res)
        )
        for (const e of entries) await readEntry(e)
      }
    }

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry()
      if (entry) await readEntry(entry)
    }

    return files
  }

  const addFiles = useCallback((newFiles: File[]) => {
    const accepted = newFiles.filter(f => isAccepted(f) && f.size <= MAX_FILE_SIZE)
    const items: FileItem[] = accepted.map(f => ({
      id:     `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      name:   f.name,
      size:   f.size,
      type:   f.type,
      file:   f,
      status: 'queued',
    }))
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`))
      return [...prev, ...items.filter(i => !existing.has(`${i.name}-${i.size}`))]
    })
  }, [])

  // ── Drag and drop handlers ───────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.items) {
      const collected = await collectFiles(e.dataTransfer.items)
      addFiles(collected)
    } else {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  // ── Upload and process ───────────────────────────────────────────────────
  const processFiles = async () => {
    const queued = files.filter(f => f.status === 'queued')
    if (!queued.length) return

    setUploading(true)
    setSummary(null)

    const totalResult: UploadResult = {
      processed: 0, skipped: 0, errors: 0,
      totalMemoriesCreated: 0, results: [],
    }

    // Process in batches
    for (let i = 0; i < queued.length; i += BATCH_SIZE) {
      const batch = queued.slice(i, i + BATCH_SIZE)

      // Mark as reading
      setFiles(prev => prev.map(f =>
        batch.find(b => b.id === f.id) ? { ...f, status: 'reading' } : f
      ))

      // Pre-process office files (extract text in browser)
      const formData = new FormData()
      for (const item of batch) {
        const ext = item.name.split('.').pop()?.toLowerCase() || ''

        if (['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'csv'].includes(ext)) {
          // Extract text in browser, send as text file
          try {
            const text = await extractTextFromOffice(item.file)
            if (text.trim().length > 50) {
              const textFile = new File([text], `${item.name}.txt`, { type: 'text/plain' })
              formData.append('files', textFile)
            }
          } catch {
            formData.append('files', item.file) // fallback: send raw
          }
        } else {
          formData.append('files', item.file)
        }
      }

      // Mark as uploading
      setFiles(prev => prev.map(f =>
        batch.find(b => b.id === f.id) ? { ...f, status: 'uploading' } : f
      ))

      try {
        const res  = await fetch('/api/upload/bulk', { method: 'POST', body: formData })
        const data: UploadResult = await res.json()

        totalResult.processed            += data.processed
        totalResult.skipped              += data.skipped
        totalResult.errors               += data.errors
        totalResult.totalMemoriesCreated += data.totalMemoriesCreated
        totalResult.results.push(...data.results)

        // Update individual file statuses
        setFiles(prev => prev.map(f => {
          const result = data.results.find(r => {
            const ext = f.name.split('.').pop()?.toLowerCase() || ''
            const sentName = ['docx','doc','xlsx','xls','pptx','ppt','csv'].includes(ext)
              ? `${f.name}.txt` : f.name
            return r.name === sentName || r.name === f.name
          })
          if (!result) return f
          return {
            ...f,
            status:   result.status as FileStatus,
            reason:   result.reason,
            memories: result.memoriesCreated,
          }
        }))

      } catch (err) {
        setFiles(prev => prev.map(f =>
          batch.find(b => b.id === f.id) ? { ...f, status: 'error', reason: 'Network error' } : f
        ))
      }
    }

    setSummary(totalResult)
    setUploading(false)
    setActiveTab('results')
    onComplete() // refresh confidence score
  }

  // ── Status helpers ───────────────────────────────────────────────────────
  const statusColor = (s: FileStatus) => ({
    queued:    C.muted,
    reading:   C.amber,
    uploading: C.amber,
    processed: C.green,
    skipped:   C.light,
    error:     C.red,
  }[s])

  const statusLabel = (f: FileItem) => {
    if (f.status === 'processed') return f.memories ? `✓ ${f.memories} insights saved` : '✓ Analyzed'
    if (f.status === 'skipped') return `Skipped: ${f.reason || 'unsupported'}`
    if (f.status === 'error') return `Error: ${f.reason || 'failed'}`
    if (f.status === 'reading') return 'Reading...'
    if (f.status === 'uploading') return 'Analyzing...'
    return 'Queued'
  }

  const queuedCount    = files.filter(f => f.status === 'queued').length
  const processedCount = files.filter(f => f.status === 'processed').length
  const totalCount     = files.length

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.espresso }}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {(['drop', 'results'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '7px 16px', borderRadius: '20px', fontFamily: 'Inter', fontSize: '13px',
            cursor: 'pointer', transition: 'all 0.15s',
            background: activeTab === t ? C.amber : 'transparent',
            color:      activeTab === t ? '#FFF8EC' : C.walnut,
            border:     `0.5px solid ${activeTab === t ? C.amber : C.border}`,
          }}>
            {t === 'drop' ? `⇣ Upload Files${totalCount > 0 ? ` (${totalCount})` : ''}` : `◎ Results${summary ? ` (${summary.processed} analyzed)` : ''}`}
          </button>
        ))}
      </div>

      {/* DROP TAB */}
      {activeTab === 'drop' && (
        <div>
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? C.amber : C.border}`,
              borderRadius: '16px',
              padding: '40px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? C.amberDim : C.sand,
              transition: 'all 0.2s',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>
              {dragging ? '📂' : '⇣'}
            </div>
            <div style={{ fontFamily: 'Lora, serif', fontSize: '16px', fontWeight: 500, color: C.espresso, marginBottom: '6px' }}>
              {dragging ? 'Drop files here' : 'Drop files or folders here'}
            </div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: '1.6', marginBottom: '12px' }}>
              PDF, Word, PowerPoint, Excel, images, text files, WhatsApp exports<br />
              Folders supported — all files inside will be processed
            </div>
            <div style={{ display: 'inline-block', padding: '8px 20px', background: C.amber, color: '#FFF8EC', borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
              Browse files
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              // @ts-ignore — webkitdirectory is not in typings but works in Chrome
              webkitdirectory=""
              accept={ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(',')}
              onChange={onInputChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Also allow regular file picker (no folder) */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <button
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.multiple = true
                inp.accept = ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(',')
                inp.onchange = (e: any) => addFiles(Array.from(e.target.files || []))
                inp.click()
              }}
              style={{ background: 'none', border: 'none', color: C.light, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Or select individual files (no folder)
            </button>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {totalCount} files ready · {formatBytes(files.reduce((s, f) => s + f.size, 0))} total
                </div>
                <button onClick={() => setFiles([])} style={{ background: 'none', border: 'none', color: C.light, fontSize: '12px', cursor: 'pointer' }}>
                  Clear all
                </button>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                {files.map(f => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px', background: C.white,
                    border: `0.5px solid ${C.border}`, borderRadius: '10px',
                  }}>
                    <span style={{ fontSize: '16px', flexShrink: 0 }}>{getFileIcon(f.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize: '11px', color: statusColor(f.status), marginTop: '1px' }}>
                        {statusLabel(f)} · {formatBytes(f.size)}
                      </div>
                    </div>
                    {/* Progress indicator */}
                    {(f.status === 'reading' || f.status === 'uploading') && (
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${C.amber}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    )}
                    {f.status === 'queued' && (
                      <button onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', color: C.light, cursor: 'pointer', fontSize: '14px', flexShrink: 0, padding: '2px' }}>✕</button>
                    )}
                    {f.status === 'processed' && <span style={{ color: C.green, fontSize: '14px', flexShrink: 0 }}>✓</span>}
                    {f.status === 'error' && <span style={{ color: C.red, fontSize: '14px', flexShrink: 0 }}>✕</span>}
                  </div>
                ))}
              </div>

              {/* Process button */}
              {queuedCount > 0 && (
                <button
                  onClick={processFiles}
                  disabled={uploading}
                  style={{
                    width: '100%', padding: '14px',
                    background: uploading ? C.sandMid : C.amber,
                    color: uploading ? C.muted : '#FFF8EC',
                    border: 'none', borderRadius: '12px',
                    fontFamily: 'Inter', fontWeight: 500, fontSize: '14px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {uploading
                    ? `Analyzing ${files.filter(f => f.status === 'uploading' || f.status === 'reading').length} files...`
                    : `⚡ Analyze ${queuedCount} file${queuedCount > 1 ? 's' : ''} — extract identity data`
                  }
                </button>
              )}

              {queuedCount === 0 && processedCount > 0 && (
                <div style={{ textAlign: 'center', padding: '14px', background: C.greenDim, border: `0.5px solid #C8E6C9`, borderRadius: '12px', color: C.green, fontSize: '14px', fontWeight: 500 }}>
                  ✓ All files processed
                </div>
              )}
            </div>
          )}

          {/* What gets extracted info */}
          <div style={{ background: C.amberDim, border: `0.5px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>What happens to your files</div>
            {[
              ['📄 PDF / Word / PowerPoint', 'Claude reads and extracts personality insights, values, communication style'],
              ['📊 Excel / CSV', 'Analyzes what topics and decisions you work with most'],
              ['🖼️ Photos', 'Claude Vision reads context — environment, activities, lifestyle, relationships'],
              ['📱 WhatsApp export (.txt)', 'Extracts how you really talk, what you care about, your humor and tone'],
              ['📝 Any text file', 'Reads for personality signals, opinions, values, expertise'],
              ['🗑️ Raw file after analysis', 'Deleted immediately — only the insights are kept in your identity database'],
            ].map(([label, desc]) => (
              <div key={label as string} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${C.border}`, fontSize: '12px' }}>
                <span style={{ flexShrink: 0, width: '200px', color: C.walnut }}>{label}</span>
                <span style={{ color: C.muted, lineHeight: '1.5' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RESULTS TAB */}
      {activeTab === 'results' && summary && (
        <div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: C.greenDim, border: `0.5px solid #C8E6C9`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Lora, serif', fontSize: '28px', fontWeight: 500, color: C.green }}>{summary.processed}</div>
              <div style={{ fontSize: '12px', color: '#4A7C59', marginTop: '2px' }}>Files analyzed</div>
            </div>
            <div style={{ background: C.amberDim, border: `0.5px solid ${C.border}`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Lora, serif', fontSize: '28px', fontWeight: 500, color: C.amber }}>{summary.totalMemoriesCreated}</div>
              <div style={{ fontSize: '12px', color: C.walnut, marginTop: '2px' }}>Identity insights saved</div>
            </div>
            <div style={{ background: C.white, border: `0.5px solid ${C.border}`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Lora, serif', fontSize: '28px', fontWeight: 500, color: C.muted }}>{summary.skipped + summary.errors}</div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Skipped / errors</div>
            </div>
          </div>

          <div style={{ background: C.greenDim, border: `0.5px solid #C8E6C9`, borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: C.green, fontWeight: 500, marginBottom: '4px' }}>
              ✓ Raw files deleted — only insights kept
            </div>
            <div style={{ fontSize: '12px', color: '#4A7C59', lineHeight: '1.6' }}>
              Your {summary.totalMemoriesCreated} new identity insights have been added to your memory database. Your confidence score is recalculating.
            </div>
          </div>

          {/* Per-file results */}
          <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {files.map(f => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', background: C.white,
                border: `0.5px solid ${f.status === 'processed' ? '#C8E6C9' : f.status === 'error' ? '#EBCFC9' : C.border}`,
                borderRadius: '10px',
              }}>
                <span style={{ fontSize: '16px' }}>{getFileIcon(f.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: '11px', color: statusColor(f.status), marginTop: '1px' }}>{statusLabel(f)}</div>
                </div>
                <span style={{ fontSize: '12px', color: statusColor(f.status), flexShrink: 0 }}>
                  {f.status === 'processed' ? '✓' : f.status === 'error' ? '✕' : '—'}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setFiles([]); setSummary(null); setActiveTab('drop') }}
            style={{ marginTop: '14px', width: '100%', padding: '12px', background: 'transparent', border: `0.5px solid ${C.border}`, borderRadius: '10px', color: C.walnut, fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer' }}
          >
            Upload more files
          </button>
        </div>
      )}

      {activeTab === 'results' && !summary && (
        <div style={{ textAlign: 'center', padding: '40px', color: C.muted, fontSize: '14px' }}>
          No results yet. Upload and analyze files first.
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@500&family=Inter:wght@400;500&display=swap');
      `}</style>
    </div>
  )
}
