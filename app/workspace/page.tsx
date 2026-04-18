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

    // Parse cell range helper
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

    // SUM
    if (expr.startsWith('SUM(')) {
      const range = expr.slice(4, -1)
      return String(parseRange(range).reduce((a, b) => a + b, 0))
    }
    // AVERAGE
    if (expr.startsWith('AVERAGE(') || expr.startsWith('AVG(')) {
      const range = expr.slice(expr.indexOf('(') + 1, -1)
      const vals = parseRange(range)
      return vals.length ? String(vals.reduce((a, b) => a + b, 0) / vals.length) : '0'
    }
    // COUNT
    if (expr.startsWith('COUNT(')) {
      const range = expr.slice(6, -1)
      return String(parseRange(range).length)
    }
    // MIN
    if (expr.startsWith('MIN(')) {
      const vals = parseRange(expr.slice(4, -1))
      return vals.length ? String(Math.min(...vals)) : '0'
    }
    // MAX
    if (expr.startsWith('MAX(')) {
      const vals = parseRange(expr.slice(4, -1))
      return vals.length ? String(Math.max(...vals)) : '0'
    }
    // IF
    if (expr.startsWith('IF(')) {
      const inner = expr.slice(3, -1)
      const parts = inner.split(',')
      if (parts.length >= 3) {
        const condition = parts[0].trim()
        const ifTrue = parts[1].trim()
        const ifFalse = parts[2].trim()
        // Simple comparisons
        const match = condition.match(/([A-Z]+\d+|[\d.]+)\s*([><=!]+)\s*([A-Z]+\d+|[\d.]+)/)
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
          return result ? ifTrue.replace(/"/g, '') : ifFalse.replace(/"/g, '')
        }
      }
      return '#ERR'
    }
    // SUMIF
    if (expr.startsWith('SUMIF(')) {
      const inner = expr.slice(6, -1)
      const parts = inner.split(',')
      if (parts.length >= 3) {
        const rangeVals = parseRange(parts[0].trim())
        const criteria = parseFloat(parts[1].trim())
        const sumRange = parseRange(parts[2].trim())
        let sum = 0
        rangeVals.forEach((v, i) => { if (v === criteria && sumRange[i] !== undefined) sum += sumRange[i] })
        return String(sum)
      }
    }
    // Simple cell reference
    if (/^[A-Z]+\d+$/.test(expr)) {
      const cell = data[expr]
      if (cell?.formula) return evaluateFormula(cell.formula, data)
      return cell?.value || ''
    }
    // Simple arithmetic
    const safe = expr.replace(/[A-Z]+\d+/g, (ref) => {
      const cell = data[ref]
      return cell?.formula ? evaluateFormula(cell.formula, data) : (cell?.value || '0')
    })
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${safe})`)()
    return String(result)
  } catch { return '#ERR' }
}

// ============ NOTES COMPONENT ============
function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const saveTimer = useRef<NodeJS.Timeout>()

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    const res = await fetch('/api/notes')
    if (res.ok) setNotes(await res.json())
  }

  async function saveNote(id: string, t: string, c: string) {
    setSaving(true)
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: t, content: c })
    })
    setSaving(false)
    setNotes(prev => {
      const exists = prev.find(n => n.id === id)
      const updated = { id, title: t, content: c, updatedAt: new Date().toISOString(), preview: c.slice(0, 100) }
      if (exists) return prev.map(n => n.id === id ? updated : n).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      return [updated, ...prev]
    })
  }

  function onContentChange(val: string) {
    setContent(val)
    if (!activeId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(activeId, title, val), 500)
  }

  function onTitleChange(val: string) {
    setTitle(val)
    if (!activeId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(activeId, val, content), 500)
  }

  function newNote() {
    const id = genId()
    const note: Note = { id, title: 'Untitled', content: '', updatedAt: new Date().toISOString(), preview: '' }
    setNotes(prev => [note, ...prev])
    setActiveId(id)
    setTitle('Untitled')
    setContent('')
    saveNote(id, 'Untitled', '')
  }

  function openNote(note: Note) {
    setActiveId(note.id)
    setTitle(note.title)
    setContent(note.content || '')
    // Load full content
    fetch(`/api/notes?id=${note.id}`).then(r => r.json()).then(n => setContent(n.content || ''))
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    if (activeId === id) { setActiveId(null); setContent(''); setTitle('') }
  }

  async function saveRename(id: string) {
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: renameVal, content: id === activeId ? content : '' }) })
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title: renameVal } : n))
    if (activeId === id) setTitle(renameVal)
    setRenamingId(null)
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.preview || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #2a2d3a', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #2a2d3a' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..."
            style={{ width: '100%', padding: '8px 10px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ padding: '8px' }}>
          <button onClick={newNote} style={{ width: '100%', padding: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            + New Note
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(note => (
            <div key={note.id}
              style={{ padding: '10px 12px', cursor: 'pointer', background: activeId === note.id ? '#1e2a3a' : 'transparent', borderBottom: '1px solid #1a1d27', position: 'relative' }}
              onClick={() => openNote(note)}>
              {renamingId === note.id ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(note.id); if (e.key === 'Escape') setRenamingId(null) }}
                  onBlur={() => saveRename(note.id)}
                  style={{ width: '100%', padding: '2px 4px', background: '#0f1117', border: '1px solid #2563eb', borderRadius: 4, color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                  onClick={e => e.stopPropagation()} />
              ) : (
                <p style={{ fontSize: 13, fontWeight: 500, color: activeId === note.id ? '#93c5fd' : '#e2e8f0', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note.title}
                </p>
              )}
              <p style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {note.preview || 'Empty'}
              </p>
              <p style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
                {new Date(note.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </p>
              {activeId === note.id && (
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setRenamingId(note.id); setRenameVal(note.title) }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); deleteNote(note.id) }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>🗑</button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: 20, fontFamily: 'monospace' }}>
              {search ? 'No matching notes' : 'No notes yet'}
            </p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeId ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2d3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input value={title} onChange={e => onTitleChange(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', color: '#f1f5f9', fontSize: 16, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }} />
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{saving ? 'Saving...' : 'Saved'}</span>
            </div>
            <textarea
              value={content}
              onChange={e => onContentChange(e.target.value)}
              placeholder="Start typing your note..."
              style={{ flex: 1, padding: '16px', background: '#0f1117', border: 'none', color: '#e2e8f0', fontSize: 14, outline: 'none', resize: 'none', fontFamily: "'DM Mono', monospace", lineHeight: 1.7 }}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 40 }}>📝</div>
            <p style={{ color: '#475569', fontSize: 14, fontFamily: 'monospace' }}>Select a note or create a new one</p>
            <button onClick={newNote} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
              + New Note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ SPREADSHEET COMPONENT ============
function SheetsPanel() {
  const [sheets, setSheets] = useState<{ id: string, name: string, updatedAt: string, tabCount: number }[]>([])
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [formulaBar, setFormulaBar] = useState('')
  const [saving, setSaving] = useState(false)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [formatting, setFormatting] = useState<{ bold: boolean, italic: boolean, color: string, bg: string }>({ bold: false, italic: false, color: '#e2e8f0', bg: 'transparent' })
  const saveTimer = useRef<NodeJS.Timeout>()
  const cellInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSheets() }, [])

  async function loadSheets() {
    const res = await fetch('/api/sheets')
    if (res.ok) setSheets(await res.json())
  }

  async function openSheet(id: string) {
    setActiveSheetId(id)
    const res = await fetch(`/api/sheets?id=${id}`)
    if (res.ok) {
      const data = await res.json()
      setSheet(data)
      setActiveTab(0)
    }
  }

  async function saveSheet(s: Sheet) {
    setSaving(true)
    await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s)
    })
    setSaving(false)
  }

  function autoSave(s: Sheet) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveSheet(s), 800)
  }

  function newSheet() {
    const id = genId()
    const defaultTab: SheetTab = {
      id: genId(), name: 'Sheet1',
      data: {}, frozenRows: 1
    }
    const s: Sheet = { id, name: 'Untitled Sheet', tabs: [defaultTab], updatedAt: new Date().toISOString() }
    setSheets(prev => [{ id, name: s.name, updatedAt: s.updatedAt, tabCount: 1 }, ...prev])
    setSheet(s)
    setActiveSheetId(id)
    setActiveTab(0)
    saveSheet(s)
  }

  function updateCell(key: string, value: string) {
    if (!sheet) return
    const newSheet = { ...sheet }
    const tab = { ...newSheet.tabs[activeTab] }
    tab.data = { ...tab.data }
    if (value === '') {
      delete tab.data[key]
    } else if (value.startsWith('=')) {
      tab.data[key] = { value: '', formula: value }
    } else {
      tab.data[key] = { ...tab.data[key], value, formula: undefined }
    }
    newSheet.tabs = [...newSheet.tabs]
    newSheet.tabs[activeTab] = tab
    newSheet.updatedAt = new Date().toISOString()
    setSheet(newSheet)
    autoSave(newSheet)
  }

  function getCellDisplay(key: string): string {
    if (!sheet) return ''
    const tab = sheet.tabs[activeTab]
    const cell = tab.data[key]
    if (!cell) return ''
    if (cell.formula) return evaluateFormula(cell.formula, tab.data)
    return cell.value
  }

  function startEdit(key: string) {
    if (!sheet) return
    const tab = sheet.tabs[activeTab]
    const cell = tab.data[key]
    setEditingCell(key)
    setEditValue(cell?.formula || cell?.value || '')
    setFormulaBar(cell?.formula || cell?.value || '')
    setTimeout(() => cellInputRef.current?.focus(), 0)
  }

  function commitEdit() {
    if (editingCell) {
      updateCell(editingCell, editValue)
      setEditingCell(null)
    }
  }

  function applyFormatting(key: string, fmt: Partial<CellData>) {
    if (!sheet) return
    const newSheet = { ...sheet }
    const tab = { ...newSheet.tabs[activeTab] }
    tab.data = { ...tab.data }
    tab.data[key] = { ...tab.data[key], value: tab.data[key]?.value || '', ...fmt }
    newSheet.tabs = [...newSheet.tabs]
    newSheet.tabs[activeTab] = tab
    setSheet(newSheet)
    autoSave(newSheet)
  }

  function applyFormattingToSelected(fmt: Partial<CellData>) {
    if (!sheet) return
    const newSheet = { ...sheet }
    const tab = { ...newSheet.tabs[activeTab] }
    tab.data = { ...tab.data }
    const cells = selectedCells.size > 0 ? selectedCells : activeCell ? new Set([activeCell]) : new Set<string>()
    cells.forEach(key => {
      tab.data[key] = { ...tab.data[key], value: tab.data[key]?.value || '', ...fmt }
    })
    newSheet.tabs = [...newSheet.tabs]
    newSheet.tabs[activeTab] = tab
    setSheet(newSheet)
    autoSave(newSheet)
  }

  function addTab() {
    if (!sheet) return
    const newTab: SheetTab = { id: genId(), name: `Sheet${sheet.tabs.length + 1}`, data: {}, frozenRows: 1 }
    const newSheet = { ...sheet, tabs: [...sheet.tabs, newTab] }
    setSheet(newSheet)
    setActiveTab(newSheet.tabs.length - 1)
    autoSave(newSheet)
  }

  function deleteTab(idx: number) {
    if (!sheet || sheet.tabs.length <= 1) return
    if (!confirm(`Delete "${sheet.tabs[idx].name}"?`)) return
    const newSheet = { ...sheet, tabs: sheet.tabs.filter((_, i) => i !== idx) }
    setSheet(newSheet)
    setActiveTab(Math.min(activeTab, newSheet.tabs.length - 1))
    autoSave(newSheet)
  }

  function renameTab(idx: number, name: string) {
    if (!sheet) return
    const newSheet = { ...sheet, tabs: sheet.tabs.map((t, i) => i === idx ? { ...t, name } : t) }
    setSheet(newSheet)
    autoSave(newSheet)
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
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${sheet.name}_${tab.name}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function importCSV(file: File) {
    if (!sheet) return
    const text = await file.text()
    const rows = text.split('\n').map(r => r.split(',').map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"')))
    const newSheet = { ...sheet }
    const tab = { ...newSheet.tabs[activeTab], data: { ...newSheet.tabs[activeTab].data } }
    rows.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) tab.data[cellKey(r, c)] = { value: val }
      })
    })
    newSheet.tabs = [...newSheet.tabs]
    newSheet.tabs[activeTab] = tab
    setSheet(newSheet)
    autoSave(newSheet)
  }

  // Sort rows
  function sortByCol(col: number) {
    if (!sheet) return
    const tab = sheet.tabs[activeTab]
    const frozenRows = tab.frozenRows || 1
    const startRow = frozenRows

    // Get all data rows
    const dataRows: Array<{ r: number, vals: Record<number, CellData> }> = []
    for (let r = startRow; r < ROWS; r++) {
      const vals: Record<number, CellData> = {}
      let hasData = false
      for (let c = 0; c < COLS; c++) {
        const key = cellKey(r, c)
        if (tab.data[key]) { vals[c] = tab.data[key]; hasData = true }
      }
      if (hasData) dataRows.push({ r, vals })
    }

    const newAsc = sortCol === col ? !sortAsc : true
    setSortCol(col); setSortAsc(newAsc)

    dataRows.sort((a, b) => {
      const av = a.vals[col]?.value || getCellDisplay(cellKey(a.r, col)) || ''
      const bv = b.vals[col]?.value || getCellDisplay(cellKey(b.r, col)) || ''
      const an = parseFloat(av), bn = parseFloat(bv)
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv)
      return newAsc ? cmp : -cmp
    })

    const newSheet = { ...sheet }
    const newTab = { ...tab, data: { ...tab.data } }
    // Clear old data rows
    for (let r = startRow; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) delete newTab.data[cellKey(r, c)]
    }
    // Write sorted rows
    dataRows.forEach(({ vals }, newR) => {
      Object.entries(vals).forEach(([c, cell]) => {
        newTab.data[cellKey(newR + startRow, parseInt(c))] = cell
      })
    })
    newSheet.tabs = [...newSheet.tabs]
    newSheet.tabs[activeTab] = newTab
    setSheet(newSheet)
    autoSave(newSheet)
  }

  // Get visible rows based on filter
  function getVisibleRows(): number[] {
    if (!sheet || !filterText) return Array.from({ length: ROWS }, (_, i) => i)
    const tab = sheet.tabs[activeTab]
    const frozenRows = tab.frozenRows || 1
    const frozen = Array.from({ length: frozenRows }, (_, i) => i)
    const filtered = []
    for (let r = frozenRows; r < ROWS; r++) {
      let rowHasMatch = false
      for (let c = 0; c < COLS; c++) {
        const val = getCellDisplay(cellKey(r, c))
        if (val.toLowerCase().includes(filterText.toLowerCase())) { rowHasMatch = true; break }
      }
      if (rowHasMatch) filtered.push(r)
    }
    return [...frozen, ...filtered]
  }

  if (!sheet) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>Spreadsheets</h2>
          <button onClick={newSheet} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            + New Sheet
          </button>
        </div>
        {sheets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <p style={{ color: '#475569', fontSize: 14, fontFamily: 'monospace' }}>No spreadsheets yet</p>
            <button onClick={newSheet} style={{ marginTop: 16, padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
              Create your first sheet
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {sheets.map(s => (
              <div key={s.id} onClick={() => openSheet(s.id)}
                style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, padding: '16px', cursor: 'pointer' }}>
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
  }

  const tab = sheet.tabs[activeTab]
  const visibleRows = getVisibleRows()
  const frozenRows = tab.frozenRows || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
      {/* Sheet toolbar */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        <button onClick={() => { setSheet(null); setActiveSheetId(null) }}
          style={{ padding: '4px 8px', background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', fontSize: 12 }}>← Back</button>

        <input value={sheet.name} onChange={e => { const s = { ...sheet, name: e.target.value }; setSheet(s); autoSave(s) }}
          style={{ padding: '4px 8px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 6, color: '#e2e8f0', fontSize: 13, outline: 'none', width: 160 }} />

        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{saving ? 'Saving...' : 'Saved'}</span>

        <div style={{ flex: 1 }} />

        {/* Formatting */}
        <button onClick={() => applyFormattingToSelected({ bold: true })}
          style={{ padding: '4px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>B</button>
        <button onClick={() => applyFormattingToSelected({ italic: true })}
          style={{ padding: '4px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontStyle: 'italic' }}>I</button>

        <input type="color" value={formatting.color} onChange={e => { setFormatting(p => ({ ...p, color: e.target.value })); applyFormattingToSelected({ color: e.target.value }) }}
          title="Text color" style={{ width: 24, height: 24, padding: 0, border: '1px solid #2a2d3a', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
        <input type="color" value={formatting.bg === 'transparent' ? '#1a1d27' : formatting.bg} onChange={e => { setFormatting(p => ({ ...p, bg: e.target.value })); applyFormattingToSelected({ bg: e.target.value }) }}
          title="Cell background" style={{ width: 24, height: 24, padding: 0, border: '1px solid #2a2d3a', borderRadius: 4, cursor: 'pointer', background: 'none' }} />

        <div style={{ width: 1, height: 20, background: '#2a2d3a' }} />

        <input placeholder="Filter rows..." value={filterText} onChange={e => setFilterText(e.target.value)}
          style={{ padding: '4px 8px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none', width: 120 }} />

        <button onClick={exportCSV}
          style={{ padding: '4px 10px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↓ CSV</button>

        <label style={{ padding: '4px 10px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
          ↑ Import
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importCSV(e.target.files[0])} />
        </label>
      </div>

      {/* Formula bar */}
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', minWidth: 48 }}>{activeCell || ''}</span>
        <div style={{ width: 1, height: 16, background: '#2a2d3a' }} />
        <input value={formulaBar} onChange={e => {
          setFormulaBar(e.target.value)
          if (activeCell) { setEditValue(e.target.value); setEditingCell(activeCell) }
        }}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit() }}
          placeholder="Enter value or formula (=SUM(A1:A10))"
          style={{ flex: 1, padding: '3px 6px', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'monospace' }} />
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' as const, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 40, minWidth: 40, background: '#13151f', border: '1px solid #2a2d3a', padding: 0 }}></th>
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c} onClick={() => sortByCol(c)}
                  style={{ width: 100, minWidth: 80, background: '#13151f', border: '1px solid #2a2d3a', padding: '4px 6px', fontSize: 12, color: '#64748b', fontFamily: 'monospace', cursor: 'pointer', userSelect: 'none' as const, textAlign: 'center' as const, position: 'sticky' as const, top: 0, zIndex: 2 }}>
                  {colName(c)} {sortCol === c ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => (
              <tr key={r}>
                <td style={{ background: '#13151f', border: '1px solid #2a2d3a', padding: '2px 6px', fontSize: 11, color: '#475569', fontFamily: 'monospace', textAlign: 'center' as const, position: 'sticky' as const, left: 0, zIndex: 1,
                  ...(r < frozenRows ? { position: 'sticky' as const, top: 24, zIndex: 3 } : {}) }}>
                  {r + 1}
                </td>
                {Array.from({ length: COLS }, (_, c) => {
                  const key = cellKey(r, c)
                  const cell = tab.data[key]
                  const isActive = activeCell === key
                  const isEditing = editingCell === key
                  const isSelected = selectedCells.has(key)
                  const displayVal = isEditing ? editValue : getCellDisplay(key)

                  return (
                    <td key={c}
                      onClick={() => { setActiveCell(key); setSelectedCells(new Set([key])); setFormulaBar(cell?.formula || cell?.value || '') }}
                      onDoubleClick={() => startEdit(key)}
                      style={{
                        border: `1px solid ${isActive ? '#2563eb' : '#2a2d3a'}`,
                        padding: 0,
                        background: isSelected ? '#1e2a3a' : (cell?.bg && cell.bg !== 'transparent' ? cell.bg : '#0f1117'),
                        minWidth: 80, maxWidth: 160,
                        ...(r < frozenRows ? { position: 'sticky' as const, top: 24, zIndex: 1, background: cell?.bg || '#131820' } : {})
                      }}>
                      {isEditing ? (
                        <input ref={cellInputRef} value={editValue} onChange={e => { setEditValue(e.target.value); setFormulaBar(e.target.value) }}
                          onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { commitEdit(); setActiveCell(cellKey(r + 1, c)) }
                            if (e.key === 'Escape') { setEditingCell(null) }
                            if (e.key === 'Tab') { e.preventDefault(); commitEdit(); setActiveCell(cellKey(r, c + 1)) }
                          }}
                          style={{ width: '100%', padding: '3px 6px', background: '#1e3a5f', border: 'none', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' as const }} />
                      ) : (
                        <div style={{ padding: '3px 6px', fontSize: 13, color: cell?.color || '#e2e8f0', fontWeight: cell?.bold ? 700 : 400, fontStyle: cell?.italic ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 22, fontFamily: 'monospace' }}>
                          {displayVal}
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

      {/* Tabs bar */}
      <div style={{ borderTop: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', padding: '0 8px', background: '#13151f', overflowX: 'auto' }}>
        {sheet.tabs.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => setActiveTab(i)}
              onDoubleClick={() => {
                const name = prompt('Rename tab:', t.name)
                if (name) renameTab(i, name)
              }}
              style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: activeTab === i ? '#93c5fd' : '#64748b', background: activeTab === i ? '#1a1d27' : 'transparent', borderTop: activeTab === i ? '2px solid #2563eb' : '2px solid transparent', whiteSpace: 'nowrap' as const }}>
              {t.name}
            </div>
            {sheet.tabs.length > 1 && (
              <button onClick={() => deleteTab(i)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: '0 4px', lineHeight: 1 }}>✕</button>
            )}
          </div>
        ))}
        <button onClick={addTab}
          style={{ padding: '6px 10px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, marginLeft: 4 }}>+</button>
      </div>
    </div>
  )
}

// ============ MAIN WORKSPACE PAGE ============
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
    <div style={{ maxWidth: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #2a2d3a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>🗂 Workspace</h1>
          <div style={{ display: 'flex', gap: 2, background: '#13151f', padding: 3, borderRadius: 8 }}>
            {(['notes', 'sheets'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: tab === t ? 500 : 400, background: tab === t ? '#2563eb' : 'transparent', color: tab === t ? '#fff' : '#64748b', textTransform: 'capitalize' as const }}>
                {t === 'notes' ? '📝 Notes' : '📊 Sheets'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/files" style={{ padding: '7px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</a>
          <a href="/tools" style={{ padding: '7px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>🔧 Tools</a>
          <a href="/" style={{ padding: '7px 12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>↑ Upload</a>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'notes' ? <NotesPanel /> : <SheetsPanel />}
      </div>
    </div>
  )
}
