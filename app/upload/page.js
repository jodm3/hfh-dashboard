'use client'

import { useState, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

// JEG timesheet layout:
// Row 0: Job Name | value | Union | Trade | Shift | Mon | | | Tues | | | Wed | | | Thurs | | | Fri | | | Sat | | | Sun | Totals ...
// Row 1: Job Number | value | | | | date | | | date | | | date | | | date | | | date | | | date | | | date
// Row 2: Employee Name | | | | | S | 1.5 | 2 | S | 1.5 | 2 | ... | 2 | S | 1.5 | 2 | Total | Notes
// Data:  | Name | Union | Trade | Shift | 8 | 0 | 0 | 8 | 0 | 0 | ...

const DAY_NAMES = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']

function parseExcelDate(val) {
  if (!val) return null
  if (val instanceof Date) {
    const y = val.getFullYear(), m = val.getMonth() + 1, d = val.getDate()
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return null
}

function num(val) {
  if (val === null || val === undefined || val === '') return 0
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

function fmtDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function detectTimesheetFormat(json) {
  // Look for day names in the first few rows to find the header structure
  for (let r = 0; r < Math.min(json.length, 5); r++) {
    const row = json[r].map(c => String(c).trim())
    const monIdx = row.findIndex(c => /^mon/i.test(c))
    if (monIdx >= 0) {
      // Found day header row — now find dates in the next row
      const dateRow = json[r + 1] || []
      const subHeaderRow = json[r + 2] || []

      // Find each day's starting column by looking for dates in the date row
      // Each day (Mon-Sat) has 3 columns: S, 1.5, 2. Sunday has 1 column: 2
      const days = []
      let col = monIdx
      for (let di = 0; di < 7; di++) {
        const date = parseExcelDate(dateRow[col])
        const colCount = di < 6 ? 3 : 1 // Sun only has DT column
        days.push({ dayIndex: di, dayName: DAY_NAMES[di], col, colCount, date })
        col += colCount
      }

      // Totals start after Sunday
      const totalsCol = col // S, 1.5, 2, Total

      // Find employee name column (usually col 1, the column after the row label)
      let nameCol = 1
      // Find trade column
      let tradeCol = 3
      // Find notes column
      let notesCol = totalsCol + 4

      // Data rows start after the sub-header row
      const dataStartRow = r + 3

      // Week ending = Sunday date
      const weekEnding = days[6]?.date || days[5]?.date

      return {
        valid: true,
        headerRow: r,
        dataStartRow,
        nameCol,
        tradeCol,
        days,
        totalsCol,
        notesCol,
        weekEnding,
        jobName: json[r]?.[1] ? String(json[r][1]).trim() : '',
        jobNumber: json[r + 1]?.[1] ? String(json[r + 1][1]).trim() : ''
      }
    }
  }
  return { valid: false }
}

export default function UploadPage() {
  const [step, setStep] = useState('upload') // upload | review | submitting | done
  const [parsed, setParsed] = useState([])
  const [sheetInfo, setSheetInfo] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 })
  const [submitResult, setSubmitResult] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [editVals, setEditVals] = useState({})
  const [deletedRows, setDeletedRows] = useState(new Set())
  const [viewMode, setViewMode] = useState('daily') // daily | employee
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

        if (json.length < 4) { setError('File has too few rows.'); return }

        const fmt = detectTimesheetFormat(json)
        if (!fmt.valid) {
          setError('Could not detect JEG timesheet format. Make sure the sheet has Mon/Tues/Wed day headers in the first few rows.')
          return
        }

        // Parse employee rows into daily records
        const records = []
        for (let r = fmt.dataStartRow; r < json.length; r++) {
          const row = json[r]
          const name = row[fmt.nameCol]
          if (!name || String(name).trim() === '') continue
          const empName = String(name).trim()

          // Skip summary/total rows
          if (/^(total|comment|prepared|page|printed)/i.test(empName)) break
          if (/^(total|comment)/i.test(String(row[0] || '').trim())) break

          const trade = String(row[fmt.tradeCol] || '').trim()
          const notes = String(row[fmt.notesCol] || '').trim()

          // Extract each day's hours
          for (const day of fmt.days) {
            if (!day.date) continue
            let st, ot, dt
            if (day.colCount === 3) {
              st = num(row[day.col])
              ot = num(row[day.col + 1])
              dt = num(row[day.col + 2])
            } else {
              // Sunday — only DT column
              st = 0
              ot = 0
              dt = num(row[day.col])
            }
            const total = st + ot + dt
            if (total <= 0) continue // Skip days not worked

            records.push({
              employee_name: empName,
              trade,
              work_date: day.date,
              week_ending: fmt.weekEnding,
              day_name: day.dayName,
              straight_time: st,
              overtime_1_5x: ot,
              double_time_2x: dt,
              total_hours: total,
              notes
            })
          }
        }

        if (records.length === 0) {
          setError('No hour records found. Check that the sheet has employee data rows.')
          return
        }

        setSheetInfo(fmt)
        setParsed(records)
        setDeletedRows(new Set())
        setStep('review')
      } catch (err) {
        setError('Failed to parse file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Inline edit
  function startEdit(idx) { setEditRow(idx); setEditVals({ ...parsed[idx] }) }
  function cancelEdit() { setEditRow(null); setEditVals({}) }
  function saveEdit() {
    setEditVals(v => {
      const updated = { ...v, total_hours: v.straight_time + v.overtime_1_5x + v.double_time_2x }
      setParsed(prev => prev.map((r, i) => i === editRow ? { ...r, ...updated } : r))
      return updated
    })
    setEditRow(null)
  }
  function toggleDelete(idx) {
    setDeletedRows(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  const activeRows = useMemo(() => parsed.filter((_, i) => !deletedRows.has(i)), [parsed, deletedRows])

  // Employee-grouped view
  const empGroups = useMemo(() => {
    const map = {}
    activeRows.forEach(r => {
      if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name, trade: r.trade, notes: r.notes, days: [], st: 0, ot: 0, dt: 0, total: 0 }
      map[r.employee_name].days.push(r)
      map[r.employee_name].st += r.straight_time
      map[r.employee_name].ot += r.overtime_1_5x
      map[r.employee_name].dt += r.double_time_2x
      map[r.employee_name].total += r.total_hours
    })
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }, [activeRows])

  const reviewStats = useMemo(() => {
    if (!activeRows.length) return null
    const names = new Set(activeRows.map(r => r.employee_name))
    const dates = new Set(activeRows.map(r => r.work_date))
    const totalHrs = activeRows.reduce((s, r) => s + r.total_hours, 0)
    const totalST = activeRows.reduce((s, r) => s + r.straight_time, 0)
    const totalOT = activeRows.reduce((s, r) => s + r.overtime_1_5x, 0)
    const totalDT = activeRows.reduce((s, r) => s + r.double_time_2x, 0)
    const issues = []
    // Check for potential duplicates
    const dupeKey = new Set()
    activeRows.forEach(r => {
      const k = `${r.employee_name}|${r.work_date}`
      if (dupeKey.has(k)) issues.push(`Duplicate: ${r.employee_name} on ${r.work_date}`)
      dupeKey.add(k)
    })
    return { employees: names.size, records: activeRows.length, dates: dates.size, totalHrs, totalST, totalOT, totalDT, issues }
  }, [activeRows])

  async function submitData() {
    setStep('submitting')
    setSubmitProgress({ done: 0, total: activeRows.length })
    try {
      // Create any new employees with their trade from the sheet
      const empTrades = {}
      activeRows.forEach(r => { if (!empTrades[r.employee_name]) empTrades[r.employee_name] = r.trade })
      const uniqueNames = Object.keys(empTrades)
      const { data: existing } = await supabase.from('employees').select('name')
      const existingNames = new Set((existing || []).map(e => e.name))
      const newEmps = uniqueNames.filter(n => !existingNames.has(n))

      if (newEmps.length > 0) {
        const getCls = (t) => ({ 'PF': 'Journeyman', 'PFA': 'Apprentice', '01-G Foreman': 'General Foreman', '02-Foreman': 'Foreman', '06-Mechanic': 'Journeyman', '93-Appr School': 'Apprentice', '03-Operator': 'Operator', '05-Laborer': 'Laborer', '10-Welder': 'Welder' }[t] || 'Unknown')
        const inserts = newEmps.map(name => ({
          name, trade: empTrades[name] || '06-Mechanic',
          classification: getCls(empTrades[name] || '06-Mechanic'),
          is_active: true
        }))
        const { error: empErr } = await supabase.from('employees').insert(inserts)
        if (empErr) throw new Error('Failed to create employees: ' + empErr.message)
      }

      // Insert daily_hours in batches
      let done = 0
      const records = activeRows.map(r => ({
        employee_name: r.employee_name,
        work_date: r.work_date,
        week_ending: r.week_ending,
        straight_time: r.straight_time,
        overtime_1_5x: r.overtime_1_5x,
        double_time_2x: r.double_time_2x,
        total_hours: r.total_hours
      }))

      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100)
        const { error: insErr } = await supabase.from('daily_hours').insert(batch)
        if (insErr) throw new Error(`Batch ${Math.floor(i / 100) + 1} failed: ` + insErr.message)
        done += batch.length
        setSubmitProgress({ done, total: records.length })
      }

      setSubmitResult({ success: true, records: records.length, newEmployees: newEmps.length, employees: reviewStats.employees })
      setStep('done')
    } catch (err) {
      setError(err.message)
      setStep('review')
    }
  }

  function reset() {
    setStep('upload'); setParsed([]); setSheetInfo(null)
    setFileName(''); setError(null); setSubmitResult(null)
    setDeletedRows(new Set()); setEditRow(null); setViewMode('daily')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <div className="header">
        <div>
          <h1>Upload Payroll</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <a href="/" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>&larr; Back to Dashboard</a>
            {sheetInfo && <span style={{ fontSize: 11, color: 'var(--dim)' }}>&middot; {sheetInfo.jobName} ({sheetInfo.jobNumber})</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {step !== 'upload' && step !== 'done' && <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--dim)' }}>{fileName}</span>}
          <div className="upload-steps">
            <span className={`step-dot ${step === 'upload' ? 'active' : 'done'}`}>1</span>
            <span className="step-line" />
            <span className={`step-dot ${step === 'review' ? 'active' : (['submitting', 'done'].includes(step) ? 'done' : '')}`}>2</span>
            <span className="step-line" />
            <span className={`step-dot ${step === 'done' ? 'active' : ''}`}>3</span>
          </div>
        </div>
      </div>

      <div className="content">
        {error && <div className="card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)', fontSize: 11, padding: '3px 10px' }} onClick={() => setError(null)}>&times;</button>
          </div>
        </div>}

        {/* ══════ STEP 1: UPLOAD ══════ */}
        {step === 'upload' && <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="drop-zone" onClick={() => fileRef.current?.click()}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>{'\u2B06'}</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Upload Weekly Timesheet</div>
            <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 16 }}>JEG format Excel files (.xlsx, .xls)</div>
            <button className="btn" style={{ background: 'var(--accent)' }}>Choose File</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          </div>
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--dim)', maxWidth: 400, margin: '20px auto 0' }}>
            Expected format: Weekly timesheet with Mon&ndash;Sun columns, each day having S / 1.5 / 2 sub-columns, one row per employee.
          </div>
        </div>}

        {/* ══════ STEP 2: REVIEW ══════ */}
        {step === 'review' && <>
          {reviewStats && <>
            <div className="stat-row">
              <div className="stat" style={{ borderLeft: '3px solid var(--accent)' }}><div className="stat-label">Records</div><div className="stat-val">{reviewStats.records}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}><div className="stat-label">Employees</div><div className="stat-val" style={{ color: 'var(--purple)' }}>{reviewStats.employees}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--green)' }}><div className="stat-label">Straight Time</div><div className="stat-val" style={{ color: 'var(--green)' }}>{reviewStats.totalST.toFixed(1)}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--amber)' }}><div className="stat-label">Overtime 1.5x</div><div className="stat-val" style={{ color: 'var(--amber)' }}>{reviewStats.totalOT.toFixed(1)}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--red)' }}><div className="stat-label">Double Time</div><div className="stat-val" style={{ color: 'var(--red)' }}>{reviewStats.totalDT.toFixed(1)}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--dim)' }}><div className="stat-label">Total Hours</div><div className="stat-val">{reviewStats.totalHrs.toFixed(1)}</div></div>
            </div>
            {sheetInfo && <div className="card" style={{ marginBottom: 16, padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                <span><span style={{ color: 'var(--dim)' }}>Week ending:</span> <strong>{sheetInfo.weekEnding}</strong></span>
                <span><span style={{ color: 'var(--dim)' }}>Days:</span> {sheetInfo.days.filter(d => d.date).map(d => <span key={d.dayName} style={{ marginLeft: 4 }}>{d.dayName.slice(0, 3)} {fmtDate(d.date)}</span>)}</span>
              </div>
            </div>}
          </>}

          {reviewStats?.issues.length > 0 && <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--amber)', marginBottom: 4 }}>Warnings ({reviewStats.issues.length})</div>
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              {reviewStats.issues.map((issue, i) => <div key={i} style={{ fontSize: 11, color: 'var(--dim)', padding: '1px 0' }}>{issue}</div>)}
            </div>
          </div>}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Review Data</span>
                {deletedRows.size > 0 && <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)', marginLeft: 8 }}>{deletedRows.size} excluded</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={`btn`} style={{ background: viewMode === 'employee' ? 'var(--accent)' : 'var(--border)', color: viewMode === 'employee' ? '#fff' : 'var(--dim)', fontSize: 11, padding: '4px 10px' }} onClick={() => setViewMode('employee')}>By Employee</button>
                <button className={`btn`} style={{ background: viewMode === 'daily' ? 'var(--accent)' : 'var(--border)', color: viewMode === 'daily' ? '#fff' : 'var(--dim)', fontSize: 11, padding: '4px 10px' }} onClick={() => setViewMode('daily')}>All Records</button>
              </div>
            </div>

            {viewMode === 'employee' && <div className="scroll-table" style={{ maxHeight: 500 }}>
              <table><thead><tr>
                <th>Employee</th><th>Trade</th><th>Days</th>
                <th className="right">ST</th><th className="right">OT 1.5x</th><th className="right">DT 2x</th><th className="right">Total</th>
                <th>Schedule</th><th>Notes</th>
              </tr></thead><tbody>
                {empGroups.map(eg => <tr key={eg.name}>
                  <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{eg.name}</td>
                  <td><span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--dim)' }}>{eg.trade}</span></td>
                  <td>{eg.days.length}</td>
                  <td className="right" style={{ color: 'var(--green)' }}>{eg.st.toFixed(1)}</td>
                  <td className="right" style={{ color: 'var(--amber)' }}>{eg.ot > 0 ? eg.ot.toFixed(1) : '\u2014'}</td>
                  <td className="right" style={{ color: 'var(--red)' }}>{eg.dt > 0 ? eg.dt.toFixed(1) : '\u2014'}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{eg.total.toFixed(1)}</td>
                  <td style={{ fontSize: 10, color: 'var(--dim)' }}>{eg.days.map(d => fmtDay(d.work_date).slice(0, 2)).join(' ')}</td>
                  <td style={{ fontSize: 11, color: 'var(--dim)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eg.notes}</td>
                </tr>)}
              </tbody></table>
            </div>}

            {viewMode === 'daily' && <div className="scroll-table" style={{ maxHeight: 500 }}>
              <table><thead><tr>
                <th style={{ width: 30 }}>#</th>
                <th>Employee</th><th>Day</th><th>Date</th>
                <th className="right">ST</th><th className="right">OT 1.5x</th><th className="right">DT 2x</th><th className="right">Total</th>
                <th className="center" style={{ width: 36 }}>Excl</th>
                <th style={{ width: 36 }}>Edit</th>
              </tr></thead><tbody>
                {parsed.map((r, i) => {
                  const deleted = deletedRows.has(i)
                  if (editRow === i) return <tr key={i} style={{ background: 'var(--surface-alt)' }}>
                    <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                    <td><input value={editVals.employee_name} onChange={e => setEditVals(v => ({ ...v, employee_name: e.target.value }))} style={{ width: '100%' }} /></td>
                    <td style={{ color: 'var(--dim)', fontSize: 11 }}>{fmtDay(r.work_date)}</td>
                    <td><input type="date" value={editVals.work_date || ''} onChange={e => setEditVals(v => ({ ...v, work_date: e.target.value }))} /></td>
                    <td><input type="number" step="0.5" value={editVals.straight_time} onChange={e => setEditVals(v => ({ ...v, straight_time: parseFloat(e.target.value) || 0 }))} style={{ width: 55, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.5" value={editVals.overtime_1_5x} onChange={e => setEditVals(v => ({ ...v, overtime_1_5x: parseFloat(e.target.value) || 0 }))} style={{ width: 55, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.5" value={editVals.double_time_2x} onChange={e => setEditVals(v => ({ ...v, double_time_2x: parseFloat(e.target.value) || 0 }))} style={{ width: 55, textAlign: 'right' }} /></td>
                    <td style={{ fontSize: 11, color: 'var(--dim)' }}>{(editVals.straight_time + editVals.overtime_1_5x + editVals.double_time_2x).toFixed(1)}</td>
                    <td />
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-sm" style={{ background: 'var(--green)', color: '#fff' }} onClick={saveEdit}>{'\u2713'}</button>{' '}
                      <button className="btn-sm" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={cancelEdit}>{'\u2717'}</button>
                    </td>
                  </tr>
                  return <tr key={i} style={deleted ? { opacity: 0.3, textDecoration: 'line-through' } : undefined}>
                    <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                    <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{r.employee_name}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 11 }}>{fmtDay(r.work_date)}</td>
                    <td>{r.work_date}</td>
                    <td className="right" style={{ color: 'var(--green)' }}>{r.straight_time.toFixed(1)}</td>
                    <td className="right" style={{ color: 'var(--amber)' }}>{r.overtime_1_5x > 0 ? r.overtime_1_5x.toFixed(1) : '\u2014'}</td>
                    <td className="right" style={{ color: 'var(--red)' }}>{r.double_time_2x > 0 ? r.double_time_2x.toFixed(1) : '\u2014'}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{r.total_hours.toFixed(1)}</td>
                    <td className="center"><input type="checkbox" checked={deleted} onChange={() => toggleDelete(i)} style={{ cursor: 'pointer' }} /></td>
                    <td><button className="btn-sm" style={{ background: 'var(--border)', color: 'var(--accent)' }} onClick={() => startEdit(i)} disabled={deleted}>{'\u270E'}</button></td>
                  </tr>
                })}
              </tbody></table>
            </div>}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={reset}>Start Over</button>
            <button className="btn" style={{ background: 'var(--green)' }} onClick={submitData} disabled={activeRows.length === 0}>
              Submit {activeRows.length} Records to Database
            </button>
          </div>
        </>}

        {/* ══════ SUBMITTING ══════ */}
        {step === 'submitting' && <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Submitting...</div>
          <div style={{ color: 'var(--dim)', fontSize: 13, marginTop: 4 }}>{submitProgress.done} / {submitProgress.total} records</div>
          <div style={{ marginTop: 12, maxWidth: 300, margin: '12px auto 0' }}>
            <div className="bar-track" style={{ height: 8 }}><div className="bar-fill" style={{ width: `${submitProgress.total > 0 ? (submitProgress.done / submitProgress.total) * 100 : 0}%`, background: 'var(--accent)' }} /></div>
          </div>
        </div>}

        {/* ══════ DONE ══════ */}
        {step === 'done' && submitResult && <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u2705'}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Upload Complete</div>
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>
            {submitResult.records} daily records for {submitResult.employees} employees
          </div>
          {submitResult.newEmployees > 0 && <div style={{ color: 'var(--amber)', fontSize: 12, marginTop: 4 }}>
            {submitResult.newEmployees} new employee(s) created with trade from timesheet
          </div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn" style={{ background: 'var(--accent)' }} onClick={reset}>Upload Another</button>
            <a href="/" className="btn" style={{ background: 'var(--green)', display: 'inline-block', textDecoration: 'none' }}>Go to Dashboard</a>
          </div>
        </div>}
      </div>
    </div>
  )
}
