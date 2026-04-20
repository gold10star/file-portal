'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// ============ TYPES ============
type Note = { id: string, title: string, content: string, updatedAt: string, preview?: string }
type CellData = { value: string, formula?: string, bold?: boolean, italic?: boolean, color?: string, bg?: string }
type SheetTab = { id: string, name: string, data: Record<string, CellData>, frozenRows: number }
type Sheet = { id: string, name: string, tabs: SheetTab[], updatedAt: string }

// ============ UTILS ============
function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function colName(i: number) {
  let s = ''; let n = i
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 }
  return s
}

function cellKey(row: number, col: number) { return `${colName(col)}${row + 1}` }

const COLS = 26
const ROWS = 100

// ============ FORMULA ENGINE ============
function evaluateFormula(formula: string, data: Record<string, CellData>): string {
  try {
    const expr = formula.replace(/^=/, '').toUpperCase()

    function parseRange(range: string): number[] {
      const [start, end] = range.split(':')
      const startCol = start.match(/[A-Z]+/)?.[0] || 'A'
      const startRow = parseInt(start.match(/\d+/)?.[0] || '1') - 1
      const endCol = end?.match(/[A-Z]+/)?.[0] || startCol
      const endRow = parseInt(end?.match(/\d+/)?.[0] || String(startRow + 1)) - 1
      const values: number[] = []
      for (let c = startCol.charCodeAt(0) - 65; c <= endCol.charCodeAt(0) - 65; c++) {
        for (let r = startRow; r <= endRow; r++) {
          const key = cellKey(r, c)
          const cell = data[key]
          const val = cell?.formula ? parseFloat(evaluateFormula(cell.formula, data)) : parseFloat(cell?.value || '0')
          if (!isNaN(val)) values.push(val)
        }
      }
      return values
    }

    if (expr.startsWith('SUM(')) return String(parseRange(expr.slice(4, -1)).reduce((a, b) => a + b, 0))
    if (expr.startsWith('AVERAGE(') || expr.startsWith('AVG(')) {
      const vals = parseRange(expr.slice(expr.indexOf('(') + 1, -1))
      return vals.length ? String(vals.reduce((a, b) => a + b, 0) / vals.length) : '0'
    }
    if (expr.startsWith('COUNT(')) return String(parseRange(expr.slice(6, -1)).length)
    if (expr.startsWith('MIN(')) { const v = parseRange(expr.slice(4, -1)); return v.length ? String(Math.min(...v)) : '0' }
    if (expr.startsWith('MAX(')) { const v = parseRange(expr.slice(4, -1)); return v.length ? String(Math.max(...v)) : '0' }
    if (expr.startsWith('IF(')) {
      const inner = expr.slice(3, -1)
      const parts = inner.split(',')
      if (parts.length >= 3) {
        const match = parts[0].trim().match(/([A-Z]+\d+|[\d.]+)\s*([><=!]+)\s*([A-Z]+\d+|[\d.]+)/)
        if (match) {
          const left = data[match[1]] ? parseFloat(data[match[1]].value || '0') : parseFloat(match[1])
          const right = data[match[3]] ? parseFloat(data[match[3]].value || '0') : parseFloat(match[3])
          const op = match[2]
          let result = false
          if (op === '>') result = left > right
          else if (op === '<') result = left < right
          else if (op === '>=') result = left >= right
          else if (op === '<=') result = left <= right
          else if (op === '==' || op === '=') result = left === right
          else if (op === '!=' || op === '<>') result = left !== right
          return result ? parts[1].trim().replace(/"/g, '') : parts[2].trim().replace(/"/g, '')
        }
      }
      return '#ERR'
    }
    if (expr.startsWith('SUMIF(')) {
      const parts = expr.slice(6, -1).split(',')
      if (parts.length >= 3) {
        const rangeVals = parseRange(parts[0].trim())
        const criteria = parseFloat(parts[1].trim())
        const sumRange = parseRange(parts[2].trim())
        let sum = 0
        rangeVals.forEach((v, i) => { if (v === criteria && sumRange[i] !== undefined) sum += sumRange[i] })
        return String(sum)
      }
    }
    if (/^[A-Z]+\d+$/.test(expr)) {
      const cell = data[expr]
      if (cell?.formula) return evaluateFormula(cell.formula, data)
      return cell?.value || ''
    }
    const safe = expr.replace(/[A-Z]+\d+/g, ref => {
      const cell = data[ref]
      return cell?.formula ? evaluateFormula(cell.formula, data) : (cell?.value || '0')
    })
    // eslint-disable-next-line no-new-func
    return String(Function(`"use strict"; return (${safe})`)())
  } catch { return '#ERR' }
}

// ============ NOTES ============
function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeIdRef = useRef<string | null>(null)
  const titleRef = useRef('')
  const contentRef = useRef('')

  useEffect(() => { loadNotes() }, [])

  // Keep refs in sync
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { titleRef.current = title }, [title])
  useEffect(() => { contentRef.current = content }, [content])

  async function loadNotes() {
    try {
      const res = await fetch('/api/notes')
      if (res.ok) setNotes(await res.json())
    } catch {}
  }

  async function doSave(id: string, t: string, c: string) {
    setSaveStatus('saving')
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: t, content: c })
      })
      setSaveStatus('saved')
      setNotes(prev => {
        const updated = { id, title: t, content: c, updatedAt: new Date().toISOString(), preview: c.slice(0, 100) }
        const exists = prev.find(n => n.id === id)
        if (exists) return prev.map(n => n.id === id ? updated : n).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        return [updated, ...prev]
      })
    } catch { setSaveStatus('unsaved') }
  }

  function scheduleSave(id: string, t: string, c: string) {
    setSaveStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(id, t, c), 800)
  }

  function onContentChange(val: string) {
    setContent(val)
    if (activeIdRef.current) scheduleSave(activeIdRef.current, titleRef.current, val)
  }

  function onTitleChange(val: string) {
    setTitle(val)
    if (activeIdRef.current) scheduleSave(activeIdRef.current, val, contentRef.current)
  }

  async function newNote() {
    const id = genId()
    const note: Note = { id, title: 'Untitled', content: '', updatedAt: new Date().toISOString(), preview: '' }
    setNotes(prev => [note, ...prev])
    setActiveId(id)
    setTitle('Untitled')
    setContent('')
    setSaveStatus('saving')
    await doSave(id, 'Untitled', '')
  }

  async function openNote(note: Note) {
    // Save current before switching
    if (activeIdRef.current) {
      clearTimeout(saveTimer.current)
      await doSave(activeIdRef.current, titleRef.current, contentRef.current)
    }
    setActiveId(note.id)
    setTitle(note.title)
    setContent('')
    setSaveStatus('saved')
    try {
      const res = await fetch(`/api/notes?id=${note.id}`)
      if (res.ok) { const n = await res.json(); setContent(n.content || '') }
    } catch {}
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    if (activeId === id) { setActiveId(null); setContent(''); setTitle('') }
  }

  async function saveRename(id: string) {
    if (!renameVal.trim()) { setRenamingId(null); return }
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: renameVal, content: id === activeId ? contentRef.current : '' })
    })
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title: renameVal } : n))
    if (activeId === id) setTitle(renameVal)
    setRenamingId(null)
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.preview || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.content || '').toLowerCase().includes(search.toLowerCase())
  )

  const statusColor = saveStatus === 'saved' ? '#4ade80' : saveStatus === 'saving' ? '#fbbf24' : '#f87171'
  const statusText = saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving...' : '⚠ Unsaved'

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', gap: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #2a2d3a', display: 'flex', flexDirection: 'column', background: '#13151f' }}>
        <div style={{ padding: 10, borderBottom: '1px solid #2a2d3a' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search notes..."
            style={{ width: '100%', padding: '7px 10px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 7, color: '#e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1d27' }}>
          <button onClick={newNote} style={{ width: '100%', padding: '7px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            + New Note
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(note => (
            <div key={note.id} onClick={() => openNote(note)}
              style={{ padding: '10px 12px', cursor: 'pointer', background: activeId === note.id ? '#1e2a3a' : 'transparent', borderBottom: '1px solid #1a1d27', position: 'relative' as const }}>
              {renamingId === note.id ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(note.id); if (e.key === 'Escape') setRenamingId(null) }}
                  onBlur={() => saveRename(note.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', padding: '2px 4px', background: '#0f1117', border: '1px solid #2563eb', borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
              ) : (
                <p style={{ fontSize: 13, fontWeight: 500, color: activeId === note.id ? '#93c5fd' : '#e2e8f0', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note.title}
                </p>
              )}
              <p style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {note.preview || 'Empty'}
              </p>
              <p style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
                {new Date(note.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
              {activeId === note.id && (
                <div style={{ position: 'absolute' as const, top: 8, right: 6, display: 'flex', gap: 2 }}>
                  <button onClick={e => { e.stopPropagation(); setRenamingId(note.id); setRenameVal(note.title) }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: '2px' }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); deleteNote(note.id) }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: '2px' }}>🗑</button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 20, fontFamily: 'monospace' }}>
              {search ? 'No matching notes' : 'No notes yet'}
            </p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeId ? (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a2d3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#13151f' }}>
              <input value={title} onChange={e => onTitleChange(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', color: '#f1f5f9', fontSize: 16, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }} />
              <span style={{ fontSize: 11, color: statusColor, fontFamily: 'monospace', marginLeft: 12 }}>{statusText}</span>
            </div>
            <textarea value={content} onChange={e => onContentChange(e.target.value)}
              placeholder="Start typing your note..."
              style={{ flex: 1, padding: '16px 20px', background: '#0f1117', border: 'none', color: '#e2e8f0', fontSize: 14, outline: 'none', resize: 'none', fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }} />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#0f1117' }}>
            <div style={{ fontSize: 40 }}>📝</div>
            <p style={{ color: '#475569', fontSize: 14, fontFamily: 'monospace' }}>Select a note or create a new one</p>
            <button onClick={newNote} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>+ New Note</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ SHEETS ============
function SheetsPanel() {
  const [sheets, setSheets] = useState<{ id: string, name: string, updatedAt: string, tabCount: number }[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [formulaBar, setFormulaBar] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [filterText, setFilterText] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sheetRef = useRef<Sheet | null>(null)
  const cellInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSheets() }, [])
  useEffect(() => { sheetRef.current = sheet }, [sheet])

  async function loadSheets() {
    try {
      const res = await fetch('/api/sheets')
      if (res.ok) setSheets(await res.json())
    } catch {}
  }

  async function doSaveSheet(s: Sheet) {
    setSaveStatus('saving')
    try {
      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      })
      setSaveStatus('saved')
    } catch { setSaveStatus('unsaved') }
  }

  function scheduleSheetSave(s: Sheet) {
    setSaveStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSaveSheet(s), 800)
  }

  async function openSheet(id: string) {
    try {
      const res = await fetch(`/api/sheets?id=${id}`)
      if (res.ok) { const data = await res.json(); setSheet(data); setActiveTab(0); setSaveStatus('saved') }
    } catch {}
  }

  function newSheet() {
    const id = genId()
    const defaultTab: SheetTab = { id: genId(), name: 'Sheet1', data: {}, frozenRows: 1 }
    const s: Sheet = { id, name: 'Untitled Sheet', tabs: [defaultTab], updatedAt: new Date().toISOString() }
    setSheets(prev => [{ id, name: s.name, updatedAt: s.updatedAt, tabCount: 1 }, ...prev])
    setSheet(s)
    setActiveTab(0)
    doSaveSheet(s)
  }

  function updateSheet(updater: (s: Sheet) => Sheet) {
    setSheet(prev => {
      if (!prev) return prev
      const next = updater({ ...prev, updatedAt: new Date().toISOString() })
      scheduleSheetSave(next)
      return next
    })
  }

  function updateCell(key: string, value: string) {
    updateSheet(s => {
      const tabs = s.tabs.map((t, i) => {
        if (i !== activeTab) return t
        const data = { ...t.data }
        if (!value) { delete data[key] }
        else if (value.startsWith('=')) { data[key] = { ...data[key], value: '', formula: value } }
        else { data[key] = { ...data[key], value, formula: undefined } }
        return { ...t, data }
      })
      return { ...s, tabs }
    })
  }

  function getCellDisplay(key: string): string {
    if (!sheet) return ''
    const cell = sheet.tabs[activeTab]?.data[key]
    if (!cell) return ''
    if (cell.formula) return evaluateFormula(cell.formula, sheet.tabs[activeTab].data)
    return cell.value
  }

  function startEdit(key: string) {
    if (!sheet) return
    const cell = sheet.tabs[activeTab]?.data[key]
    const val = cell?.formula || cell?.value || ''
    setEditingCell(key)
    setEditValue(val)
    setFormulaBar(val)
    setTimeout(() => cellInputRef.current?.focus(), 10)
  }

  function commitEdit(nextCell?: string) {
    if (editingCell) {
      updateCell(editingCell, editValue)
      setEditingCell(null)
      if (nextCell) setActiveCell(nextCell)
    }
  }

  function applyFormattingToCell(key: string, fmt: Partial<CellData>) {
    updateSheet(s => {
      const tabs = s.tabs.map((t, i) => {
        if (i !== activeTab) return t
        const data = { ...t.data, [key]: { value: '', ...t.data[key], ...fmt } }
        return { ...t, data }
      })
      return { ...s, tabs }
    })
  }

  function addTab() {
    updateSheet(s => ({ ...s, tabs: [...s.tabs, { id: genId(), name: `Sheet${s.tabs.length + 1}`, data: {}, frozenRows: 1 }] }))
    setActiveTab(prev => prev + 1)
  }

  function deleteTab(idx: number) {
    if (!sheet || sheet.tabs.length <= 1) return
    if (!confirm(`Delete "${sheet.tabs[idx].name}"?`)) return
    updateSheet(s => ({ ...s, tabs: s.tabs.filter((_, i) => i !== idx) }))
    setActiveTab(prev => Math.min(prev, sheet.tabs.length - 2))
  }

  function renameTab(idx: number, name: string) {
    updateSheet(s => ({ ...s, tabs: s.tabs.map((t, i) => i === idx ? { ...t, name } : t) }))
  }

  function exportCSV() {
    if (!sheet) return
    const tab = sheet.tabs[activeTab]
    const rows: string[][] = []
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = []
      let hasData = false
      for (let c = 0; c < COLS; c++) {
        const val = getCellDisplay(cellKey(r, c))
        if (val) hasData = true
        row.push(val)
      }
      if (hasData) rows.push(row)
    }
    if (!rows.length) return
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sheet.name}_${tab.name}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function importCSV(file: File) {
    if (!sheet) return
    const text = await file.text()
    const rows = text.split('\n').map(r => r.split(',').map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"')))
    updateSheet(s => {
      const tabs = s.tabs.map((t, i) => {
        if (i !== activeTab) return t
        const data = { ...t.data }
        rows.forEach((row, r) => { row.forEach((val, c) => { if (val) data[cellKey(r, c)] = { value: val } }) })
        return { ...t, data }
      })
      return { ...s, tabs }
    })
  }

  function sortByCol(col: number) {
    if (!sheet) return
    const tab = sheet.tabs[activeTab]
    const frozenRows = tab.frozenRows || 1
    const newAsc = sortCol === col ? !sortAsc : true
    setSortCol(col); setSortAsc(newAsc)

    const dataRows: Array<{ vals: Record<number, CellData> }> = []
    for (let r = frozenRows; r < ROWS; r++) {
      const vals: Record<number, CellData> = {}
      let hasData = false
      for (let c = 0; c < COLS; c++) {
        const key = cellKey(r, c)
        if (tab.data[key]) { vals[c] = tab.data[key]; hasData = true }
      }
      if (hasData) dataRows.push({ vals })
    }

    dataRows.sort((a, b) => {
      const av = a.vals[col]?.value || ''
      const bv = b.vals[col]?.value || ''
      const an = parseFloat(av), bn = parseFloat(bv)
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv)
      return newAsc ? cmp : -cmp
    })

    updateSheet(s => {
      const tabs = s.tabs.map((t, i) => {
        if (i !== activeTab) return t
        const data = { ...t.data }
        for (let r = frozenRows; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) delete data[cellKey(r, c)]
        }
        dataRows.forEach(({ vals }, newR) => {
          Object.entries(vals).forEach(([c, cell]) => { data[cellKey(newR + frozenRows, parseInt(c))] = cell })
        })
        return { ...t, data }
      })
      return { ...s, tabs }
    })
  }

  function getVisibleRows(): number[] {
    if (!sheet || !filterText) return Array.from({ length: ROWS }, (_, i) => i)
    const tab = sheet.tabs[activeTab]
    const frozenRows = tab.frozenRows || 1
    const frozen = Array.from({ length: frozenRows }, (_, i) => i)
    const filtered: number[] = []
    for (let r = frozenRows; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (getCellDisplay(cellKey(r, c)).toLowerCase().includes(filterText.toLowerCase())) {
          filtered.push(r); break
        }
      }
    }
    return [...frozen, ...filtered]
  }

  const statusColor = saveStatus === 'saved' ? '#4ade80' : saveStatus === 'saving' ? '#fbbf24' : '#f87171'
  const statusText = saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving...' : '⚠ Unsaved'

  if (!sheet) return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>Spreadsheets</h2>
        <button onClick={newSheet} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ New Sheet</button>
      </div>
      {sheets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <p style={{ color: '#475569', fontSize: 14, fontFamily: 'monospace' }}>No spreadsheets yet</p>
          <button onClick={newSheet} style={{ marginTop: 16, padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Create your first sheet</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {sheets.map(s => (
            <div key={s.id} onClick={() => openSheet(s.id)}
              style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, padding: 16, cursor: 'pointer' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', marginBottom: 4 }}>{s.name}</p>
              <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                {s.tabCount} tab{s.tabCount !== 1 ? 's' : ''} · {new Date(s.updatedAt).toLocaleDateString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const tab = sheet.tabs[activeTab]
  const visibleRows = getVisibleRows()
  const frozenRows = tab?.frozenRows || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, background: '#13151f' }}>
        <button onClick={() => { setSheet(null); loadSheets() }}
          style={{ padding: '4px 8px', background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', fontSize: 12 }}>← Back</button>
        <input value={sheet.name} onChange={e => updateSheet(s => ({ ...s, name: e.target.value }))}
          style={{ padding: '4px 8px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 6, color: '#e2e8f0', fontSize: 13, outline: 'none', width: 160 }} />
        <span style={{ fontSize: 11, color: statusColor, fontFamily: 'monospace' }}>{statusText}</span>
        <div style={{ flex: 1 }} />
        {activeCell && (
          <>
            <button onClick={() => applyFormattingToCell(activeCell, { bold: true })}
              style={{ padding: '3px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>B</button>
            <button onClick={() => applyFormattingToCell(activeCell, { italic: true })}
              style={{ padding: '3px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontStyle: 'italic' }}>I</button>
            <input type="color" title="Text color" defaultValue="#e2e8f0"
              onChange={e => applyFormattingToCell(activeCell, { color: e.target.value })}
              style={{ width: 22, height: 22, padding: 0, border: '1px solid #2a2d3a', borderRadius: 3, cursor: 'pointer' }} />
            <input type="color" title="Background" defaultValue="#0f1117"
              onChange={e => applyFormattingToCell(activeCell, { bg: e.target.value })}
              style={{ width: 22, height: 22, padding: 0, border: '1px solid #2a2d3a', borderRadius: 3, cursor: 'pointer' }} />
            <div style={{ width: 1, height: 18, background: '#2a2d3a' }} />
          </>
        )}
        <input placeholder="Filter..." value={filterText} onChange={e => setFilterText(e.target.value)}
          style={{ padding: '4px 8px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none', width: 100 }} />
        <button onClick={exportCSV}
          style={{ padding: '4px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↓ CSV</button>
        <label style={{ padding: '4px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
          ↑ Import<input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importCSV(e.target.files[0])} />
        </label>
      </div>

      {/* Formula bar */}
      <div style={{ padding: '3px 12px', borderBottom: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', gap: 8, background: '#0f1117' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', minWidth: 44 }}>{activeCell || ''}</span>
        <div style={{ width: 1, height: 14, background: '#2a2d3a' }} />
        <input value={formulaBar}
          onChange={e => { setFormulaBar(e.target.value); if (activeCell) { setEditValue(e.target.value); setEditingCell(activeCell) } }}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit() }}
          placeholder="Value or formula (=SUM(A1:A10))"
          style={{ flex: 1, padding: '3px 4px', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'monospace' }} />
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' as const }}>
          <thead>
            <tr>
              <th style={{ width: 36, minWidth: 36, background: '#13151f', border: '1px solid #2a2d3a', position: 'sticky' as const, top: 0, zIndex: 3 }}></th>
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c} onClick={() => sortByCol(c)}
                  style={{ width: 90, minWidth: 70, background: '#13151f', border: '1px solid #2a2d3a', padding: '3px 4px', fontSize: 11, color: '#64748b', fontFamily: 'monospace', cursor: 'pointer', userSelect: 'none' as const, textAlign: 'center' as const, position: 'sticky' as const, top: 0, zIndex: 2 }}>
                  {colName(c)}{sortCol === c ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => (
              <tr key={r}>
                <td style={{ background: '#13151f', border: '1px solid #2a2d3a', padding: '1px 4px', fontSize: 10, color: '#475569', fontFamily: 'monospace', textAlign: 'center' as const, position: 'sticky' as const, left: 0, zIndex: r < frozenRows ? 3 : 1, top: r < frozenRows ? 24 : 'auto' }}>
                  {r + 1}
                </td>
                {Array.from({ length: COLS }, (_, c) => {
                  const key = cellKey(r, c)
                  const cell = tab?.data[key]
                  const isActive = activeCell === key
                  const isEditing = editingCell === key
                  return (
                    <td key={c}
                      onClick={() => { setActiveCell(key); setFormulaBar(cell?.formula || cell?.value || '') }}
                      onDoubleClick={() => startEdit(key)}
                      style={{
                        border: `1px solid ${isActive ? '#2563eb' : '#2a2d3a'}`,
                        padding: 0, background: cell?.bg || '#0f1117',
                        minWidth: 70, maxWidth: 140,
                        position: r < frozenRows ? 'sticky' as const : 'relative' as const,
                        top: r < frozenRows ? 24 : 'auto',
                        zIndex: r < frozenRows ? 1 : 0
                      }}>
                      {isEditing ? (
                        <input ref={cellInputRef} value={editValue}
                          onChange={e => { setEditValue(e.target.value); setFormulaBar(e.target.value) }}
                          onBlur={() => commitEdit()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(cellKey(r + 1, c)) }
                            if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
                            if (e.key === 'Tab') { e.preventDefault(); commitEdit(cellKey(r, c + 1)) }
                          }}
                          style={{ width: '100%', padding: '2px 5px', background: '#1e3a5f', border: 'none', color: '#e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' as const }} />
                      ) : (
                        <div style={{ padding: '2px 5px', fontSize: 12, color: cell?.color || '#e2e8f0', fontWeight: cell?.bold ? 700 : 400, fontStyle: cell?.italic ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 20, fontFamily: 'monospace' }}>
                          {isEditing ? editValue : getCellDisplay(key)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabs */}
      <div style={{ borderTop: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', padding: '0 8px', background: '#13151f', overflowX: 'auto', flexShrink: 0 }}>
        {sheet.tabs.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div onClick={() => setActiveTab(i)}
              onDoubleClick={() => { const n = prompt('Rename:', t.name); if (n) renameTab(i, n) }}
              style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: activeTab === i ? '#93c5fd' : '#64748b', borderTop: `2px solid ${activeTab === i ? '#2563eb' : 'transparent'}`, whiteSpace: 'nowrap' as const }}>
              {t.name}
            </div>
            {sheet.tabs.length > 1 && (
              <button onClick={() => deleteTab(i)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 10, padding: '0 3px' }}>✕</button>
            )}
          </div>
        ))}
        <button onClick={addTab}
          style={{ padding: '4px 10px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>+</button>
      </div>
    </div>
  )
}

// ============ MAIN ============
export default function WorkspacePage() {
  const [authed, setAuthed] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.cookie.includes('portal_auth=')
  })
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [tab, setTab] = useState<'notes' | 'sheets'>('notes')

  async function login() {
    setPwError('')
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    if (res.ok) setAuthed(true)
    else setPwError('Wrong password')
  }

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: '#1e2a3a', border: '1px solid #2a3f5f', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 16px' }}>🗂</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>Workspace</h1>
          <p style={{ color: '#64748b', fontSize: 14, fontFamily: 'monospace' }}>Notes & Sheets</p>
        </div>
        <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '28px 24px' }}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()} placeholder="Password" autoFocus
            style={{ width: '100%', padding: '12px 14px', background: '#0f1117', border: `1px solid ${pwError ? '#7f1d1d' : '#2a2d3a'}`, borderRadius: 10, color: '#e2e8f0', fontSize: 15, outline: 'none' }} />
          {pwError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{pwError}</p>}
          <button onClick={login} style={{ width: '100%', marginTop: 12, padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Enter</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #2a2d3a', flexShrink: 0, background: '#13151f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>🗂 Workspace</h1>
          <div style={{ display: 'flex', gap: 2, background: '#0f1117', padding: 3, borderRadius: 8 }}>
            {(['notes', 'sheets'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: tab === t ? 500 : 400, background: tab === t ? '#2563eb' : 'transparent', color: tab === t ? '#fff' : '#64748b' }}>
                {t === 'notes' ? '📝 Notes' : '📊 Sheets'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/files" style={{ padding: '6px 10px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 7, color: '#94a3b8', fontSize: 12, textDecoration: 'none' }}>📂</a>
          <a href="/tools" style={{ padding: '6px 10px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 7, color: '#94a3b8', fontSize: 12, textDecoration: 'none' }}>🔧</a>
          <a href="/" style={{ padding: '6px 10px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 12, textDecoration: 'none' }}>↑</a>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'notes' ? <NotesPanel /> : <SheetsPanel />}
      </div>
    </div>
  )
}
