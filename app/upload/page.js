'use client'

import { useState, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

// Common column name mappings
const COL_MAPS = {
  employee_name: ['employee', 'employee name', 'employee_name', 'name', 'worker', 'emp name', 'emp_name', 'full name', 'full_name'],
  work_date: ['work date', 'work_date', 'date', 'day', 'worked'],
  week_ending: ['week ending', 'week_ending', 'we', 'w/e', 'week end', 'weekending', 'wk ending', 'wk end'],
  straight_time: ['straight time', 'straight_time', 'st', 'reg', 'regular', 'regular hours', 'reg hrs', 'reg hours', 'straight'],
  overtime_1_5x: ['overtime', 'overtime_1_5x', 'ot', 'ot 1.5', 'ot 1.5x', '1.5x', 'ot hours', 'overtime hours', 'time and a half', 'ot1.5'],
  double_time_2x: ['double time', 'double_time_2x', 'dt', 'dt 2x', '2x', 'double', 'dbl time', 'dbl'],
  total_hours: ['total hours', 'total_hours', 'total', 'total hrs', 'hours', 'hrs', 'tot hrs', 'tot hours', 'tot']
}

function matchCol(header) {
  const h = header.toLowerCase().trim()
  for (const [field, aliases] of Object.entries(COL_MAPS)) {
    if (aliases.includes(h)) return field
  }
  return null
}

function parseDate(val) {
  if (!val) return null
  // Handle Excel serial dates
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // Try M/D/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return s
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

export default function UploadPage() {
  const [step, setStep] = useState('upload') // upload | mapping | review | submitting | done
  const [rawHeaders, setRawHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [colMap, setColMap] = useState({})
  const [parsed, setParsed] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 })
  const [submitResult, setSubmitResult] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [editVals, setEditVals] = useState({})
  const [deletedRows, setDeletedRows] = useState(new Set())
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
        const wb = XLSX.read(data, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (json.length < 2) { setError('File has no data rows.'); return }

        // Find header row (first row with multiple non-empty cells)
        let headerIdx = 0
        for (let i = 0; i < Math.min(json.length, 10); i++) {
          const nonEmpty = json[i].filter(c => c !== '').length
          if (nonEmpty >= 3) { headerIdx = i; break }
        }

        const headers = json[headerIdx].map(h => String(h).trim())
        const rows = json.slice(headerIdx + 1).filter(r => r.some(c => c !== ''))

        setRawHeaders(headers)
        setRawRows(rows)

        // Auto-map columns
        const autoMap = {}
        headers.forEach((h, i) => {
          const match = matchCol(h)
          if (match) autoMap[match] = i
        })
        setColMap(autoMap)
        setStep('mapping')
      } catch (err) {
        setError('Failed to parse file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function setMapping(field, colIdx) {
    setColMap(prev => {
      const next = { ...prev }
      if (colIdx === '') { delete next[field]; return next }
      next[field] = parseInt(colIdx)
      return next
    })
  }

  const requiredFields = ['employee_name', 'work_date', 'week_ending']
  const missingRequired = requiredFields.filter(f => colMap[f] === undefined)

  function processRows() {
    const rows = rawRows.map((row, idx) => {
      const name = String(row[colMap.employee_name] || '').trim()
      if (!name) return null
      return {
        _idx: idx,
        employee_name: name,
        work_date: parseDate(row[colMap.work_date]),
        week_ending: parseDate(row[colMap.week_ending]),
        straight_time: parseNum(colMap.straight_time !== undefined ? row[colMap.straight_time] : 0),
        overtime_1_5x: parseNum(colMap.overtime_1_5x !== undefined ? row[colMap.overtime_1_5x] : 0),
        double_time_2x: parseNum(colMap.double_time_2x !== undefined ? row[colMap.double_time_2x] : 0),
        total_hours: parseNum(colMap.total_hours !== undefined ? row[colMap.total_hours] : 0)
      }
    }).filter(Boolean)

    // Auto-calc total if not mapped
    if (colMap.total_hours === undefined) {
      rows.forEach(r => { r.total_hours = r.straight_time + r.overtime_1_5x + r.double_time_2x })
    }

    setParsed(rows)
    setDeletedRows(new Set())
    setStep('review')
  }

  // Inline edit helpers
  function startEdit(idx) {
    const row = parsed[idx]
    setEditRow(idx)
    setEditVals({ ...row })
  }
  function cancelEdit() { setEditRow(null); setEditVals({}) }
  function saveEdit() {
    setParsed(prev => prev.map((r, i) => i === editRow ? { ...r, ...editVals } : r))
    setEditRow(null); setEditVals({})
  }
  function toggleDelete(idx) {
    setDeletedRows(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const activeRows = useMemo(() => parsed.filter((_, i) => !deletedRows.has(i)), [parsed, deletedRows])

  const reviewStats = useMemo(() => {
    if (!activeRows.length) return null
    const names = new Set(activeRows.map(r => r.employee_name))
    const dates = new Set(activeRows.map(r => r.work_date))
    const weeks = new Set(activeRows.map(r => r.week_ending))
    const totalHrs = activeRows.reduce((s, r) => s + r.total_hours, 0)
    const issues = []
    activeRows.forEach((r, i) => {
      if (!r.work_date || r.work_date === 'null') issues.push(`Row ${i + 1}: missing work date`)
      if (!r.week_ending || r.week_ending === 'null') issues.push(`Row ${i + 1}: missing week ending`)
      if (r.total_hours <= 0) issues.push(`Row ${i + 1} (${r.employee_name}): zero total hours`)
    })
    return { employees: names.size, records: activeRows.length, dates: dates.size, weeks: [...weeks].sort(), totalHrs, issues }
  }, [activeRows])

  async function submitData() {
    setStep('submitting')
    setSubmitProgress({ done: 0, total: activeRows.length })
    try {
      // Upsert employees (create any new ones)
      const uniqueNames = [...new Set(activeRows.map(r => r.employee_name))]
      const { data: existing } = await supabase.from('employees').select('name')
      const existingNames = new Set((existing || []).map(e => e.name))
      const newEmps = uniqueNames.filter(n => !existingNames.has(n))
      if (newEmps.length > 0) {
        const inserts = newEmps.map(name => ({ name, trade: '06-Mechanic', classification: 'Journeyman', is_active: true }))
        const { error: empErr } = await supabase.from('employees').insert(inserts)
        if (empErr) throw new Error('Failed to create employees: ' + empErr.message)
      }

      // Insert daily_hours in batches of 100
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

      setSubmitResult({ success: true, records: records.length, newEmployees: newEmps.length })
      setStep('done')
    } catch (err) {
      setError(err.message)
      setStep('review')
    }
  }

  function reset() {
    setStep('upload'); setRawHeaders([]); setRawRows([]); setColMap({})
    setParsed([]); setFileName(''); setError(null); setSubmitResult(null)
    setDeletedRows(new Set()); setEditRow(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <div className="header">
        <div>
          <h1>Upload Payroll</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <a href="/" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>&larr; Back to Dashboard</a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {step !== 'upload' && step !== 'done' && <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--dim)' }}>{fileName}</span>}
          <div className="upload-steps">
            <span className={`step-dot ${step === 'upload' ? 'active' : (step !== 'upload' ? 'done' : '')}`}>1</span>
            <span className="step-line" />
            <span className={`step-dot ${step === 'mapping' ? 'active' : (['review', 'submitting', 'done'].includes(step) ? 'done' : '')}`}>2</span>
            <span className="step-line" />
            <span className={`step-dot ${step === 'review' ? 'active' : (['submitting', 'done'].includes(step) ? 'done' : '')}`}>3</span>
            <span className="step-line" />
            <span className={`step-dot ${step === 'done' ? 'active' : ''}`}>4</span>
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
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Upload Payroll Sheet</div>
            <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 16 }}>Excel (.xlsx, .xls) or CSV files</div>
            <button className="btn" style={{ background: 'var(--accent)' }}>Choose File</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        </div>}

        {/* ══════ STEP 2: COLUMN MAPPING ══════ */}
        {step === 'mapping' && <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Map Columns</div>
          <div style={{ color: 'var(--dim)', fontSize: 11, marginBottom: 16 }}>Match your spreadsheet columns to the database fields. Auto-detected mappings are pre-filled.</div>

          <div className="mapping-grid">
            {Object.entries(COL_MAPS).map(([field]) => {
              const required = requiredFields.includes(field)
              const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              return <div key={field} className="mapping-row">
                <label style={{ minWidth: 130 }}>
                  {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
                </label>
                <select value={colMap[field] ?? ''} onChange={e => setMapping(field, e.target.value)}>
                  <option value="">-- Not mapped --</option>
                  {rawHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
                {colMap[field] !== undefined && <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>Mapped</span>}
              </div>
            })}
          </div>

          {/* Preview first 3 rows */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', marginBottom: 8 }}>Preview (first 5 rows of raw data)</div>
            <div className="scroll-table" style={{ maxHeight: 200 }}>
              <table><thead><tr>{rawHeaders.map((h, i) => <th key={i} style={{ background: Object.values(colMap).includes(i) ? 'var(--green-dim)' : 'var(--surface)' }}>{h}</th>)}</tr></thead>
                <tbody>{rawRows.slice(0, 5).map((row, ri) => <tr key={ri}>{rawHeaders.map((_, ci) => <td key={ci}>{row[ci] !== undefined ? String(row[ci]) : ''}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={reset}>Cancel</button>
            <button className="btn" style={{ background: 'var(--accent)' }} onClick={processRows} disabled={missingRequired.length > 0}>
              {missingRequired.length > 0 ? `Map required: ${missingRequired.join(', ')}` : 'Process & Review'}
            </button>
          </div>
        </div>}

        {/* ══════ STEP 3: REVIEW ══════ */}
        {step === 'review' && <>
          {reviewStats && <div className="stat-row">
            <div className="stat" style={{ borderLeft: '3px solid var(--accent)' }}><div className="stat-label">Records</div><div className="stat-val">{reviewStats.records}</div></div>
            <div className="stat" style={{ borderLeft: '3px solid var(--green)' }}><div className="stat-label">Employees</div><div className="stat-val" style={{ color: 'var(--green)' }}>{reviewStats.employees}</div></div>
            <div className="stat" style={{ borderLeft: '3px solid var(--amber)' }}><div className="stat-label">Work Days</div><div className="stat-val" style={{ color: 'var(--amber)' }}>{reviewStats.dates}</div></div>
            <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}><div className="stat-label">Total Hours</div><div className="stat-val" style={{ color: 'var(--purple)' }}>{reviewStats.totalHrs.toFixed(1)}</div></div>
            <div className="stat" style={{ borderLeft: '3px solid var(--dim)' }}><div className="stat-label">Week(s)</div><div className="stat-val">{reviewStats.weeks.join(', ')}</div></div>
          </div>}

          {reviewStats?.issues.length > 0 && <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--amber)', marginBottom: 4 }}>Warnings ({reviewStats.issues.length})</div>
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              {reviewStats.issues.map((issue, i) => <div key={i} style={{ fontSize: 11, color: 'var(--dim)', padding: '1px 0' }}>{issue}</div>)}
            </div>
          </div>}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div><span style={{ fontWeight: 600, fontSize: 14 }}>Review Data</span>
                <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>Click a row to edit, or use the delete column to exclude rows</span>
                {deletedRows.size > 0 && <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)', marginLeft: 8 }}>{deletedRows.size} excluded</span>}
              </div>
            </div>
            <div className="scroll-table" style={{ maxHeight: 500 }}>
              <table><thead><tr>
                <th style={{ width: 30 }}>#</th>
                <th>Employee</th><th>Work Date</th><th>Week Ending</th>
                <th className="right">ST</th><th className="right">OT 1.5x</th><th className="right">DT 2x</th><th className="right">Total</th>
                <th className="center" style={{ width: 40 }}>Del</th>
                <th style={{ width: 40 }}>Edit</th>
              </tr></thead><tbody>
                {parsed.map((r, i) => {
                  const deleted = deletedRows.has(i)
                  if (editRow === i) return <tr key={i} style={{ background: 'var(--surface-alt)' }}>
                    <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                    <td><input value={editVals.employee_name} onChange={e => setEditVals(v => ({ ...v, employee_name: e.target.value }))} style={{ width: '100%' }} /></td>
                    <td><input type="date" value={editVals.work_date || ''} onChange={e => setEditVals(v => ({ ...v, work_date: e.target.value }))} /></td>
                    <td><input type="date" value={editVals.week_ending || ''} onChange={e => setEditVals(v => ({ ...v, week_ending: e.target.value }))} /></td>
                    <td><input type="number" step="0.1" value={editVals.straight_time} onChange={e => setEditVals(v => ({ ...v, straight_time: parseFloat(e.target.value) || 0 }))} style={{ width: 60, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.1" value={editVals.overtime_1_5x} onChange={e => setEditVals(v => ({ ...v, overtime_1_5x: parseFloat(e.target.value) || 0 }))} style={{ width: 60, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.1" value={editVals.double_time_2x} onChange={e => setEditVals(v => ({ ...v, double_time_2x: parseFloat(e.target.value) || 0 }))} style={{ width: 60, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.1" value={editVals.total_hours} onChange={e => setEditVals(v => ({ ...v, total_hours: parseFloat(e.target.value) || 0 }))} style={{ width: 60, textAlign: 'right' }} /></td>
                    <td />
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-sm" style={{ background: 'var(--green)', color: '#fff' }} onClick={saveEdit}>{'\u2713'}</button>{' '}
                      <button className="btn-sm" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={cancelEdit}>{'\u2717'}</button>
                    </td>
                  </tr>
                  return <tr key={i} style={deleted ? { opacity: 0.3, textDecoration: 'line-through' } : undefined}>
                    <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                    <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{r.employee_name}</td>
                    <td>{r.work_date}</td><td>{r.week_ending}</td>
                    <td className="right" style={{ color: 'var(--green)' }}>{r.straight_time.toFixed(1)}</td>
                    <td className="right" style={{ color: 'var(--amber)' }}>{r.overtime_1_5x > 0 ? r.overtime_1_5x.toFixed(1) : '\u2014'}</td>
                    <td className="right" style={{ color: 'var(--red)' }}>{r.double_time_2x > 0 ? r.double_time_2x.toFixed(1) : '\u2014'}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{r.total_hours.toFixed(1)}</td>
                    <td className="center"><input type="checkbox" checked={deleted} onChange={() => toggleDelete(i)} style={{ cursor: 'pointer' }} /></td>
                    <td><button className="btn-sm" style={{ background: 'var(--border)', color: 'var(--accent)' }} onClick={() => startEdit(i)} disabled={deleted}>{'\u270E'}</button></td>
                  </tr>
                })}
              </tbody></table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={() => setStep('mapping')}>Back to Mapping</button>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={reset}>Start Over</button>
            <button className="btn" style={{ background: 'var(--green)' }} onClick={submitData} disabled={activeRows.length === 0}>
              Submit {activeRows.length} Records to Database
            </button>
          </div>
        </>}

        {/* ══════ STEP 4: SUBMITTING ══════ */}
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
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>{submitResult.records} hour records submitted</div>
          {submitResult.newEmployees > 0 && <div style={{ color: 'var(--amber)', fontSize: 12, marginTop: 4 }}>{submitResult.newEmployees} new employee(s) created (defaulted to Journeyman — update their trade in the dashboard)</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn" style={{ background: 'var(--accent)' }} onClick={reset}>Upload Another</button>
            <a href="/" className="btn" style={{ background: 'var(--green)', display: 'inline-block', textDecoration: 'none' }}>Go to Dashboard</a>
          </div>
        </div>}
      </div>
    </div>
  )
}
