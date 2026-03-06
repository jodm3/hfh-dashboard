'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

const FULLY_ASSIGNED = new Set(['Kempf, Mathew H.', 'Ripley, Jacob M.', 'Marler III, John D.'])
const FOREMAN_TRADES = new Set(['01-G Foreman', '02-Foreman'])
const APPRENTICE_TRADES = new Set(['93-Appr School', 'PFA'])
const JOURNEYMAN_TRADES = new Set(['06-Mechanic', 'PF'])

function getCls(trade) {
  return { 'PF': 'Journeyman', 'PFA': 'Apprentice', '01-G Foreman': 'General Foreman', '02-Foreman': 'Foreman', '06-Mechanic': 'Journeyman', '93-Appr School': 'Apprentice' }[trade] || 'Unknown'
}

function TradeBadge({ trade }) {
  const color = FOREMAN_TRADES.has(trade) ? 'var(--amber)' : APPRENTICE_TRADES.has(trade) ? 'var(--accent)' : 'var(--dim)'
  const bg = FOREMAN_TRADES.has(trade) ? 'var(--amber-dim)' : APPRENTICE_TRADES.has(trade) ? 'rgba(58,107,197,0.27)' : 'var(--surface-alt)'
  return <span className="badge" style={{ background: bg, color }}>{trade}</span>
}

function SpecBadge({ specialty }) {
  if (!specialty) return null
  const colors = { 'Trimble': { bg: '#1a3a2a', color: '#4ade80' }, 'Welder': { bg: '#3a1a1a', color: '#fb923c' } }
  const c = colors[specialty] || { bg: 'var(--surface-alt)', color: 'var(--dim)' }
  return <span className="badge" style={{ background: c.bg, color: c.color, marginLeft: 4, fontSize: 9 }}>{specialty}</span>
}

function SI({ ss, col }) {
  if (ss.col === col) return ss.dir === 'asc' ? ' \u2191' : ' \u2193'
  return <span style={{ opacity: 0.3 }}> \u2195</span>
}

function EditModal({ employee, otAdj, onClose, onSave }) {
  const [sen, setSen] = useState(employee?.first_date || '')
  const [trade, setTrade] = useState(employee?.trade || '06-Mechanic')
  const [active, setActive] = useState(employee?.is_active !== false ? 'true' : 'false')
  const [lastD, setLastD] = useState(employee?.last_date || '')
  const [adj, setAdj] = useState(otAdj || 0)
  const [notes, setNotes] = useState(employee?.notes || '')
  const [spec, setSpec] = useState(employee?.specialty || '')
  const [saving, setSaving] = useState(false)
  if (!employee) return null
  async function save() {
    setSaving(true)
    try {
      const u = { first_date: sen || null, trade, classification: getCls(trade), is_active: active === 'true', last_date: lastD || null, notes: notes || null, specialty: spec || null }
      const { error } = await supabase.from('employees').update(u).eq('id', employee.id)
      if (error) throw error
      onSave(employee.id, u, parseFloat(adj) || 0)
    } catch (e) { alert('Error: ' + e.message) }
    setSaving(false)
  }
  return (
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Edit: {employee.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>&times;</button>
        </h2>
        <div className="modal-field"><label>Name</label><input value={employee.name} disabled /></div>
        <div className="modal-field"><label>Seniority Date</label><input type="date" value={sen} onChange={e => setSen(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}><label>Trade</label>
            <select value={trade} onChange={e => setTrade(e.target.value)}>
              <option>01-G Foreman</option><option>02-Foreman</option><option>06-Mechanic</option><option>93-Appr School</option><option>PF</option><option>PFA</option>
            </select></div>
          <div className="modal-field" style={{ flex: 1 }}><label>Classification</label><input value={getCls(trade)} disabled /></div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-field" style={{ flex: 1 }}><label>Specialty</label>
            <select value={spec} onChange={e => setSpec(e.target.value)}>
              <option value="">None</option><option>Trimble</option><option>Welder</option><option>Bang It</option>
            </select></div>
          <div className="modal-field" style={{ flex: 1 }}><label>Status</label>
            <select value={active} onChange={e => setActive(e.target.value)}>
              <option value="true">Active</option><option value="false">Inactive</option>
            </select></div>
        </div>
        <div className="modal-field"><label>Last Worked</label><input type="date" value={lastD} onChange={e => setLastD(e.target.value)} /></div>
        <div className="modal-field"><label>OT Balance Adjustment</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" step="0.5" value={adj} onChange={e => setAdj(e.target.value)} style={{ width: 100 }} />
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Add/subtract from running OT total</span>
          </div></div>
        <div className="modal-field"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Left job 1/23, Welder certified..." /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)' }} onClick={onClose}>Cancel</button>
          <button className="btn" style={{ background: 'var(--green)' }} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

// Print helper
function printDiv(title, html) {
  const w = window.open('', '_blank')
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}th{background:#333;color:#fff;font-size:10px;text-transform:uppercase}.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600}.green{background:#d1fae5;color:#065f46}.red{background:#fee2e2;color:#991b1b}.amber{background:#fef3c7;color:#92400e}.blue{background:#dbeafe;color:#1e40af}h1{font-size:18px;margin-bottom:4px}h3{font-size:13px;color:#666;margin-bottom:12px;font-weight:normal}</style></head><body>${html}</body></html>`)
  w.document.close()
  w.print()
}

export default function Dashboard() {
  const [employees, setEmployees] = useState([])
  const [hours, setHours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [dashSort, setDashSort] = useState({ col: 'total', dir: 'desc' })
  const [dashFilter, setDashFilter] = useState('all')
  const [dashSearch, setDashSearch] = useState('')
  const [sixTens, setSixTens] = useState(new Set())
  const [otEventOpen, setOtEventOpen] = useState(false)
  const [otGenerated, setOtGenerated] = useState(false)
  const [otResponses, setOtResponses] = useState({})
  const [otForm, setOtForm] = useState({ name: '', date: '', hours: '8', spots: '5' })
  const [otAdjustments, setOtAdjustments] = useState({})
  const [senSort, setSenSort] = useState({ col: 'first_date', dir: 'asc' })
  const [senFilter, setSenFilter] = useState('all')
  const [senSearch, setSenSearch] = useState('')
  const [editEmp, setEditEmp] = useState(null)
  const [otEvents, setOtEvents] = useState([])
  const [otEventDetail, setOtEventDetail] = useState(null)
  const [savingEvent, setSavingEvent] = useState(false)
  const [excludedNames, setExcludedNames] = useState(new Set())

  useEffect(() => { loadData() }, [])
  async function loadData() {
    try {
      let aE = [], aH = [], o = 0
      while (true) { const { data, error } = await supabase.from('employees').select('*').range(o, o + 999); if (error) throw error; aE = aE.concat(data); if (data.length < 1000) break; o += 1000 }
      o = 0
      while (true) { const { data, error } = await supabase.from('daily_hours').select('*').order('work_date', { ascending: false }).range(o, o + 999); if (error) throw error; aH = aH.concat(data); if (data.length < 1000) break; o += 1000 }
      // Load OT events
      let events = []
      try {
        const { data: evData } = await supabase.from('ot_events').select('*').order('event_date', { ascending: false })
        if (evData) events = evData
      } catch(e) { /* table may not exist yet */ }
      setEmployees(aE); setHours(aH); setOtEvents(events); setLoading(false)
    } catch (e) { setError(e.message); setLoading(false) }
  }

  function openEdit(name) { const emp = employees.find(e => e.name === name); if (emp) setEditEmp(emp) }
  function handleSave(id, updates, otAdj) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    const name = employees.find(e => e.id === id)?.name
    if (name) { if (otAdj !== 0) setOtAdjustments(p => ({ ...p, [name]: otAdj })); else setOtAdjustments(p => { const n = { ...p }; delete n[name]; return n }) }
    setEditEmp(null)
  }

  const empSummary = useMemo(() => {
    const map = {}
    employees.forEach(e => { map[e.name] = { ...e, st: 0, ot: 0, dt: 0, total: 0, days: 0 } })
    hours.forEach(h => { if (map[h.employee_name]) { map[h.employee_name].st += parseFloat(h.straight_time || 0); map[h.employee_name].ot += parseFloat(h.overtime_1_5x || 0); map[h.employee_name].dt += parseFloat(h.double_time_2x || 0); map[h.employee_name].total += parseFloat(h.total_hours || 0); map[h.employee_name].days += 1 } })
    return Object.values(map)
  }, [employees, hours])

  const totals = useMemo(() => ({ hours: hours.reduce((s, h) => s + parseFloat(h.total_hours || 0), 0), st: hours.reduce((s, h) => s + parseFloat(h.straight_time || 0), 0), ot: hours.reduce((s, h) => s + parseFloat(h.overtime_1_5x || 0), 0), dt: hours.reduce((s, h) => s + parseFloat(h.double_time_2x || 0), 0), weeks: new Set(hours.map(h => h.week_ending)).size }), [hours])
  const trades = useMemo(() => [...new Set(employees.map(e => e.trade))].sort(), [employees])
  const cc = useMemo(() => { const a = employees.filter(e => e.is_active !== false); return { gf: a.filter(e => e.trade === '01-G Foreman').length, fm: a.filter(e => e.trade === '02-Foreman').length, jm: a.filter(e => JOURNEYMAN_TRADES.has(e.trade)).length, ap: a.filter(e => APPRENTICE_TRADES.has(e.trade)).length, total: a.length } }, [employees])

  const filteredEmps = useMemo(() => {
    let f = [...empSummary]
    if (dashFilter !== 'all') f = f.filter(e => e.trade === dashFilter)
    if (dashSearch) f = f.filter(e => e.name.toLowerCase().includes(dashSearch.toLowerCase()))
    f.sort((a, b) => { const av = dashSort.col === 'name' ? a.name : (a[dashSort.col] || 0); const bv = dashSort.col === 'name' ? b.name : (b[dashSort.col] || 0); if (dashSort.col === 'name') return dashSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return dashSort.dir === 'asc' ? av - bv : bv - av })
    return f
  }, [empSummary, dashFilter, dashSearch, dashSort])
  function dashSortBy(c) { setDashSort(p => ({ col: c, dir: p.col === c && p.dir === 'desc' ? 'asc' : 'desc' })) }

  // OT list with specialty tags
  const otList = useMemo(() => {
    const jm = employees.filter(e => JOURNEYMAN_TRADES.has(e.trade) && e.is_active !== false)
    const map = {}
    jm.forEach(e => { map[e.name] = { name: e.name, trade: e.trade, first_date: e.first_date, specialty: e.specialty, ot_worked: 0, ot_charged: 0, total_balance: 0, on610: sixTens.has(e.name), excluded: excludedNames.has(e.name) } })
    hours.forEach(h => { if (map[h.employee_name]) { const ot = parseFloat(h.overtime_1_5x || 0) + parseFloat(h.double_time_2x || 0); map[h.employee_name].ot_worked += ot; map[h.employee_name].total_balance += ot } })
    Object.entries(otAdjustments).forEach(([n, a]) => { if (map[n]) { map[n].ot_charged += a; map[n].total_balance += a } })
    return Object.values(map).sort((a, b) => { if (a.total_balance !== b.total_balance) return a.total_balance - b.total_balance; return (a.first_date || '9999').localeCompare(b.first_date || '9999') })
  }, [employees, hours, sixTens, otAdjustments, excludedNames])

  function toggle610(n) { setSixTens(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x }) }
  function toggleExcluded(n) { setExcludedNames(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x }) }

  function genOT() {
    const el = otList.filter(e => !e.on610 && !e.excluded)
    const r = {}; el.forEach(e => { r[e.name] = 'pending' }); setOtResponses(r); setOtGenerated(true)
  }
  function setOTR(n, v) { setOtResponses(p => ({ ...p, [n]: v })) }

  // Save OT event to Supabase
  async function saveOTEvent() {
    setSavingEvent(true)
    try {
      const { data: ev, error: evErr } = await supabase.from('ot_events').insert({
        event_name: otForm.name || 'Saturday OT',
        event_date: otForm.date || new Date().toISOString().split('T')[0],
        hours_offered: parseFloat(otForm.hours) || 8,
        spots_needed: parseInt(otForm.spots) || 5,
        status: 'completed',
        excluded_reason: { '6/10s': [...sixTens], 'other': [...excludedNames] },
        completed_at: new Date().toISOString()
      }).select().single()
      if (evErr) throw evErr

      // Save responses
      const eligible = otList.filter(e => !e.on610 && !e.excluded)
      const responses = eligible.map((e, i) => ({
        event_id: ev.id,
        employee_name: e.name,
        call_order: i + 1,
        response: otResponses[e.name] || 'pending',
        classification: getCls(e.trade),
        specialty: e.specialty || null,
        ot_balance: e.total_balance,
        seniority_date: e.first_date || null,
        responded_at: otResponses[e.name] && otResponses[e.name] !== 'pending' ? new Date().toISOString() : null
      }))

      const { error: rErr } = await supabase.from('ot_responses').insert(responses)
      if (rErr) throw rErr

      setOtEvents(prev => [ev, ...prev])
      alert('OT Event saved!')
      setOtEventOpen(false); setOtGenerated(false); setOtResponses({})
    } catch (e) { alert('Error saving: ' + e.message) }
    setSavingEvent(false)
  }

  // Print callout list
  function printCallout() {
    const eligible = otList.filter(e => !e.on610 && !e.excluded)
    let html = `<h1>${otForm.name || 'OT Callout'} \u2014 ${otForm.date}</h1><h3>${otForm.hours} hours | ${otForm.spots} spots needed</h3><table><thead><tr><th>#</th><th>Employee</th><th>Seniority</th><th>OT Bal</th><th>Specialty</th><th>Response</th></tr></thead><tbody>`
    eligible.forEach((e, i) => {
      const r = otResponses[e.name] || 'pending'
      const rc = r === 'accepted' ? 'green' : r === 'refused' ? 'red' : r === 'charged' ? 'amber' : ''
      html += `<tr><td>${i+1}</td><td><strong>${e.name}</strong></td><td>${e.first_date||'\u2014'}</td><td>${e.total_balance.toFixed(1)}</td><td>${e.specialty||''}</td><td>${rc ? `<span class="badge ${rc}">${r.toUpperCase()}</span>` : 'Pending'}</td></tr>`
    })
    html += '</tbody></table>'
    const acc = Object.entries(otResponses).filter(([,v]) => v === 'accepted')
    if (acc.length > 0) {
      html += `<h3 style="margin-top:20px">Accepted Crew (${acc.length}):</h3><table><thead><tr><th>#</th><th>Employee</th><th>Specialty</th></tr></thead><tbody>`
      acc.forEach(([n], i) => { const e = eligible.find(x => x.name === n); html += `<tr><td>${i+1}</td><td><strong>${n}</strong></td><td>${e?.specialty||'Installer'}</td></tr>` })
      html += '</tbody></table>'
    }
    printDiv(otForm.name || 'OT Callout', html)
  }

  // Print crew only
  function printCrew() {
    const acc = Object.entries(otResponses).filter(([,v]) => v === 'accepted')
    const eligible = otList.filter(e => !e.on610 && !e.excluded)
    let html = `<h1>${otForm.name || 'Saturday OT'} \u2014 Final Crew</h1><h3>${otForm.date} | ${otForm.hours} hours | ${acc.length} workers</h3><table><thead><tr><th>#</th><th>Employee</th><th>Role</th></tr></thead><tbody>`
    acc.forEach(([n], i) => { const e = eligible.find(x => x.name === n); html += `<tr><td>${i+1}</td><td><strong>${n}</strong></td><td>${e?.specialty||'Installer'}</td></tr>` })
    html += '</tbody></table>'
    printDiv('Final Crew', html)
  }

  // Load OT event detail
  async function loadEventDetail(eventId) {
    try {
      const { data } = await supabase.from('ot_responses').select('*').eq('event_id', eventId).order('call_order')
      setOtEventDetail({ id: eventId, event: otEvents.find(e => e.id === eventId), responses: data || [] })
    } catch (e) { alert('Error: ' + e.message) }
  }

  function printEventDetail() {
    if (!otEventDetail) return
    const ev = otEventDetail.event
    const resp = otEventDetail.responses
    const acc = resp.filter(r => r.response === 'accepted')
    let html = `<h1>${ev.event_name}</h1><h3>${ev.event_date} | ${ev.hours_offered} hours | ${ev.spots_needed} spots</h3>`
    html += `<table><thead><tr><th>#</th><th>Employee</th><th>Seniority</th><th>OT Bal</th><th>Specialty</th><th>Response</th></tr></thead><tbody>`
    resp.forEach(r => {
      const rc = r.response === 'accepted' ? 'green' : r.response === 'refused' ? 'red' : r.response === 'charged' ? 'amber' : 'blue'
      html += `<tr><td>${r.call_order}</td><td><strong>${r.employee_name}</strong></td><td>${r.seniority_date||'\u2014'}</td><td>${r.ot_balance?.toFixed(1)||'0.0'}</td><td>${r.specialty||''}</td><td><span class="badge ${rc}">${r.response.toUpperCase()}</span></td></tr>`
    })
    html += '</tbody></table>'
    if (acc.length > 0) {
      html += `<h3 style="margin-top:20px">Final Crew (${acc.length}):</h3><table><thead><tr><th>#</th><th>Employee</th><th>Specialty</th></tr></thead><tbody>`
      acc.forEach((r, i) => { html += `<tr><td>${i+1}</td><td><strong>${r.employee_name}</strong></td><td>${r.specialty||'Installer'}</td></tr>` })
      html += '</tbody></table>'
    }
    printDiv(ev.event_name, html)
  }

  const weeklyData = useMemo(() => {
    const map = {}
    hours.forEach(h => { const we = h.week_ending; if (!map[we]) map[we] = { week_ending: we, emps: new Set(), hours: 0, st: 0, ot: 0, dt: 0, days: new Set() }; map[we].emps.add(h.employee_name); map[we].hours += parseFloat(h.total_hours || 0); map[we].st += parseFloat(h.straight_time || 0); map[we].ot += parseFloat(h.overtime_1_5x || 0); map[we].dt += parseFloat(h.double_time_2x || 0); map[we].days.add(h.work_date) })
    return Object.values(map).map(w => ({ ...w, crew: w.emps.size, workDays: w.days.size })).sort((a, b) => b.week_ending.localeCompare(a.week_ending))
  }, [hours])

  const senData = useMemo(() => {
    const ed = {}; hours.forEach(h => { if (!ed[h.employee_name]) ed[h.employee_name] = new Set(); ed[h.employee_name].add(h.work_date) })
    const ad = [...new Set(hours.map(h => h.work_date))].sort()
    const wd = ad.filter(d => { const dt = new Date(d + 'T12:00:00'); const dy = dt.getDay(); return dy > 0 && dy < 6 })
    let data = employees.map(e => {
      const w = ed[e.name] || new Set(); let co = 0
      for (let i = wd.length - 1; i >= 0; i--) { if (wd[i] < (e.first_date || '9999')) break; if (!w.has(wd[i])) co++; else break }
      let ms = 0, c = 0; for (const d of wd) { if (d < (e.first_date || '9999')) continue; if (!w.has(d)) { c++; ms = Math.max(ms, c) } else c = 0 }
      return { name: e.name, trade: e.trade, classification: getCls(e.trade), first_date: e.first_date, last_date: e.last_date, days: w.size, consOff: co, maxStreak: ms, flag: co >= 5 || ms >= 5, is_active: e.is_active }
    })
    if (senFilter !== 'all') data = data.filter(e => e.classification === senFilter)
    if (senSearch) data = data.filter(e => e.name.toLowerCase().includes(senSearch.toLowerCase()))
    data.sort((a, b) => { let av, bv; if (senSort.col === 'name') { av = a.name; bv = b.name } else if (['days', 'consOff', 'maxStreak'].includes(senSort.col)) { av = a[senSort.col]; bv = b[senSort.col] } else { av = a[senSort.col] || ''; bv = b[senSort.col] || '' }; if (typeof av === 'string') return senSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return senSort.dir === 'asc' ? av - bv : bv - av })
    return data
  }, [employees, hours, senFilter, senSearch, senSort])
  function senSortBy(c) { setSenSort(p => ({ col: c, dir: p.col === c ? (p.dir === 'asc' ? 'desc' : 'asc') : (c === 'name' ? 'asc' : 'desc') })) }
  const clsList = useMemo(() => [...new Set(employees.map(e => getCls(e.trade)))].sort(), [employees])

  if (loading) return <div className="loading"><div className="spinner" /><div style={{ fontSize: 16, fontWeight: 600 }}>Loading...</div><div style={{ color: 'var(--dim)', fontSize: 13 }}>Connecting to Supabase</div></div>
  if (error) return <div className="loading"><div style={{ color: 'var(--red)', fontSize: 18, fontWeight: 700 }}>Connection Error</div><div style={{ fontSize: 13 }}>{error}</div></div>

  const tabs = ['dashboard', 'overtime', 'ot_history', 'weekly', 'seniority']
  const acc = Object.entries(otResponses).filter(([, v]) => v === 'accepted')
  const ref = Object.entries(otResponses).filter(([, v]) => v === 'refused')
  const chg = Object.entries(otResponses).filter(([, v]) => v === 'charged')
  const sp = parseInt(otForm.spots) || 0
  const elig = otList.filter(e => !e.on610 && !e.excluded)
  const maxOT = otList.length ? Math.max(...otList.map(e => e.total_balance)) : 0
  const minOT = otList.length ? Math.min(...otList.map(e => e.total_balance)) : 0

  function CN({ name, isActive, showLeft }) {
    const emp = employees.find(e => e.name === name)
    return <td><a className="clickable-name" onClick={() => openEdit(name)} style={{ cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{name}</a>
      {emp?.specialty && <SpecBadge specialty={emp.specialty} />}
      {isActive === false && <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)', marginLeft: 6, fontSize: 9 }}>{showLeft ? 'Left' : 'Inactive'}</span>}</td>
  }

  return (<div>
    {editEmp && <EditModal employee={editEmp} otAdj={otAdjustments[editEmp.name] || 0} onClose={() => setEditEmp(null)} onSave={handleSave} />}
    <div className="header"><div><h1>HFH South Campus</h1><div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}><span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>Live</span><span style={{ fontSize: 11, color: 'var(--dim)' }}>Pipefitters 636 &middot; {employees.length} employees &middot; {hours.length.toLocaleString()} records</span></div></div></div>
    <div className="tabs">{tabs.map(t => <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
      {t === 'dashboard' ? 'Dashboard' : t === 'overtime' ? 'Overtime' : t === 'ot_history' ? 'OT History' : t === 'weekly' ? 'Weekly' : 'Seniority'}
    </div>)}</div>
    <div className="content">

    {/* ══════ DASHBOARD ══════ */}
    {activeTab === 'dashboard' && <>
      <div className="stat-row">
        <div className="stat" style={{ borderLeft: '3px solid var(--accent)' }}><div className="stat-label">Total Hours</div><div className="stat-val">{totals.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--green)' }}><div className="stat-label">Straight Time</div><div className="stat-val" style={{ color: 'var(--green)' }}>{totals.st.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--amber)' }}><div className="stat-label">Overtime 1.5x</div><div className="stat-val" style={{ color: 'var(--amber)' }}>{totals.ot.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--red)' }}><div className="stat-label">Double Time</div><div className="stat-val" style={{ color: 'var(--red)' }}>{totals.dt.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}><div className="stat-label">Employees</div><div className="stat-val" style={{ color: 'var(--purple)' }}>{employees.length}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--dim)' }}><div className="stat-label">Weeks</div><div className="stat-val">{totals.weeks}</div></div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input style={{ maxWidth: 220 }} placeholder="Search employees..." value={dashSearch} onChange={e => setDashSearch(e.target.value)} />
          <select value={dashFilter} onChange={e => setDashFilter(e.target.value)}><option value="all">All Trades</option>{trades.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{filteredEmps.length} employees</span>
        </div>
        <div className="scroll-table"><table><thead><tr>
          <th onClick={() => dashSortBy('name')}>Employee<SI ss={dashSort} col="name" /></th><th>Trade</th><th>Class</th>
          <th className="right" onClick={() => dashSortBy('days')}>Days<SI ss={dashSort} col="days" /></th>
          <th className="right" onClick={() => dashSortBy('st')}>ST<SI ss={dashSort} col="st" /></th>
          <th className="right" onClick={() => dashSortBy('ot')}>OT 1.5x<SI ss={dashSort} col="ot" /></th>
          <th className="right" onClick={() => dashSortBy('dt')}>DT 2x<SI ss={dashSort} col="dt" /></th>
          <th className="right" onClick={() => dashSortBy('total')}>Total<SI ss={dashSort} col="total" /></th>
        </tr></thead><tbody>
          {filteredEmps.map(e => <tr key={e.name}><CN name={e.name} isActive={e.is_active} /><td><TradeBadge trade={e.trade} /></td><td style={{ color: 'var(--dim)' }}>{e.classification}</td><td className="right">{e.days}</td><td className="right" style={{ color: 'var(--green)' }}>{e.st.toFixed(1)}</td><td className="right" style={{ color: 'var(--amber)' }}>{e.ot > 0 ? e.ot.toFixed(1) : '\u2014'}</td><td className="right" style={{ color: 'var(--red)' }}>{e.dt > 0 ? e.dt.toFixed(1) : '\u2014'}</td><td className="right" style={{ fontWeight: 600 }}>{e.total.toFixed(1)}</td></tr>)}
        </tbody></table></div>
      </div>
    </>}

    {/* ══════ OVERTIME ══════ */}
    {activeTab === 'overtime' && <>
      <div className="stat-row">
        <div className="stat" style={{ borderLeft: '3px solid var(--amber)' }}><div className="stat-label">Journeymen on OT List</div><div className="stat-val">{otList.length}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--green)' }}><div className="stat-label">Lowest OT</div><div className="stat-val" style={{ color: 'var(--green)' }}>{minOT.toFixed(1)}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--red)' }}><div className="stat-label">Highest OT</div><div className="stat-val" style={{ color: 'var(--red)' }}>{maxOT.toFixed(1)}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}><div className="stat-label">Spread</div><div className="stat-val" style={{ color: 'var(--purple)' }}>{(maxOT - minOT).toFixed(1)}</div></div>
      </div>
      <div className="stat-row">
        <div className="stat" style={{ borderLeft: '3px solid var(--amber)', flex: '1 1 100px' }}><div className="stat-label">G. Foremen</div><div className="stat-val" style={{ color: 'var(--amber)', fontSize: 16 }}>{cc.gf}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--amber)', flex: '1 1 100px' }}><div className="stat-label">Foremen</div><div className="stat-val" style={{ color: 'var(--amber)', fontSize: 16 }}>{cc.fm}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--accent)', flex: '1 1 100px' }}><div className="stat-label">Journeymen</div><div className="stat-val" style={{ color: 'var(--accent)', fontSize: 16 }}>{cc.jm}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--purple)', flex: '1 1 100px' }}><div className="stat-label">Apprentices</div><div className="stat-val" style={{ color: 'var(--purple)', fontSize: 16 }}>{cc.ap}</div></div>
        <div className="stat" style={{ borderLeft: '3px solid var(--text)', flex: '1 1 100px' }}><div className="stat-label">Total Active</div><div className="stat-val" style={{ fontSize: 16 }}>{cc.total}</div></div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div><span style={{ fontWeight: 600, fontSize: 14 }}>OT Offer List</span><span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>Sorted: lowest hours &rarr; earliest seniority</span></div>
          <button className="btn" style={{ background: 'var(--accent)' }} onClick={() => { setOtEventOpen(!otEventOpen); setOtGenerated(false); setOtResponses({}); setExcludedNames(new Set()) }}>{otEventOpen ? 'Close' : '+ New OT Event'}</button>
        </div>
        {otEventOpen && <div className="event-form">
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: '1 1 180px' }}><label>Event Name</label><input value={otForm.name} onChange={e => setOtForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="field" style={{ flex: '0 0 130px' }}><label>Date</label><input type="date" value={otForm.date} onChange={e => setOtForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="field" style={{ flex: '0 0 80px' }}><label>Hours</label><input type="number" value={otForm.hours} onChange={e => setOtForm(f => ({ ...f, hours: e.target.value }))} /></div>
            <div className="field" style={{ flex: '0 0 80px' }}><label>Spots</label><input type="number" value={otForm.spots} onChange={e => setOtForm(f => ({ ...f, spots: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <button className="btn" style={{ background: 'var(--green)' }} onClick={genOT}>Generate List</button>
            </div>
          </div>
          {otGenerated && <>
            <div className="row" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12 }}>Filled: <strong style={{ color: acc.length >= sp ? 'var(--green)' : 'var(--amber)' }}>{acc.length}/{sp}</strong></span>
              <span style={{ fontSize: 12, color: 'var(--dim)' }}>Refused: {ref.length} | Charged: {chg.length}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn" style={{ background: 'var(--surface-alt)', color: 'var(--dim)', fontSize: 11, padding: '4px 10px' }} onClick={printCallout}>{'\u2399'} Print Full List</button>
                {acc.length > 0 && <button className="btn" style={{ background: 'var(--surface-alt)', color: 'var(--green)', fontSize: 11, padding: '4px 10px' }} onClick={printCrew}>{'\u2399'} Print Crew</button>}
                <button className="btn" style={{ background: 'var(--accent)', fontSize: 11, padding: '4px 10px' }} onClick={saveOTEvent} disabled={savingEvent}>{savingEvent ? 'Saving...' : '\u2713 Save Event'}</button>
              </div>
            </div>
            <div className="scroll-table" style={{ maxHeight: 350 }}><table><thead><tr><th style={{ width: 30 }}>#</th><th>Employee</th><th>Specialty</th><th className="right">OT Bal</th><th>Seniority</th><th className="center">Response</th></tr></thead><tbody>
              {elig.map((e, i) => { const r = otResponses[e.name] || 'pending'; return <tr key={e.name} className={r === 'accepted' ? 'accepted-row' : ''}><td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{e.name}<SpecBadge specialty={e.specialty} /></td>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{e.specialty || 'Installer'}</td>
                <td className="right">{e.total_balance.toFixed(1)}</td>
                <td style={{ color: 'var(--dim)' }}>{e.first_date || '\u2014'}</td><td className="center">
                <button className="btn-sm" style={{ background: r === 'accepted' ? 'var(--green)' : 'var(--border)', color: r === 'accepted' ? '#fff' : 'var(--dim)' }} onClick={() => setOTR(e.name, 'accepted')}>{'\u2713'}</button>{' '}
                <button className="btn-sm" style={{ background: r === 'refused' ? 'var(--amber)' : 'var(--border)', color: r === 'refused' ? '#fff' : 'var(--dim)' }} onClick={() => setOTR(e.name, 'refused')}>{'\u2717'}</button>{' '}
                <button className="btn-sm" style={{ background: r === 'charged' ? 'var(--red)' : 'var(--border)', color: r === 'charged' ? '#fff' : 'var(--dim)' }} onClick={() => setOTR(e.name, 'charged')}>{'\u2298'}</button>
              </td></tr> })}
            </tbody></table></div>
            {acc.length > 0 && <div className="crew-output"><div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>{otForm.name || 'OT Event'} &mdash; {otForm.date} &mdash; {otForm.hours}hrs &mdash; Crew List:</div>{acc.map(([n], i) => { const e = elig.find(x => x.name === n); return <div key={n} style={{ padding: '2px 0' }}>{i + 1}. {n}{e?.specialty ? ` (${e.specialty})` : ''}</div> })}</div>}
          </>}
        </div>}
        <div className="scroll-table"><table><thead><tr><th style={{ width: 30 }}>#</th><th>Employee</th><th>Specialty</th><th>Seniority</th><th className="right">OT Worked</th><th className="right">OT Charged</th><th className="right">Total</th><th className="center">6/10s</th><th className="center">Excl</th><th>Bar</th></tr></thead><tbody>
          {otList.map((e, i) => { const pct = maxOT > 0 ? (e.total_balance / maxOT) * 100 : 0; const bc = e.on610 ? 'var(--amber)' : pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--green)'; return <tr key={e.name} style={e.on610 || e.excluded ? { opacity: 0.5 } : undefined}>
            <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
            <td><a className="clickable-name" onClick={() => openEdit(e.name)} style={{ cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{e.name}</a>{e.on610 && <span className="badge" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', marginLeft: 6, fontSize: 9 }}>6/10s</span>}</td>
            <td><SpecBadge specialty={e.specialty} />{!e.specialty && <span style={{ color: 'var(--dim)', fontSize: 11 }}>Installer</span>}</td>
            <td style={{ color: 'var(--dim)' }}>{e.first_date || '\u2014'}</td>
            <td className="right" style={{ color: 'var(--amber)' }}>{e.ot_worked.toFixed(1)}</td><td className="right" style={{ color: 'var(--dim)' }}>{e.ot_charged.toFixed(1)}</td><td className="right" style={{ fontWeight: 600 }}>{e.total_balance.toFixed(1)}</td>
            <td className="center"><input type="checkbox" checked={e.on610} onChange={() => toggle610(e.name)} style={{ cursor: 'pointer' }} /></td>
            <td className="center"><input type="checkbox" checked={e.excluded} onChange={() => toggleExcluded(e.name)} style={{ cursor: 'pointer' }} /></td>
            <td style={{ width: 100 }}><div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: bc }} /></div></td>
          </tr> })}
        </tbody></table></div>
      </div>
    </>}

    {/* ══════ OT HISTORY ══════ */}
    {activeTab === 'ot_history' && <div className="card">
      {otEventDetail ? <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--dim)', marginRight: 12, fontSize: 11, padding: '4px 10px' }} onClick={() => setOtEventDetail(null)}>&larr; Back</button>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{otEventDetail.event?.event_name}</span>
            <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>{otEventDetail.event?.event_date} | {otEventDetail.event?.hours_offered}hrs | {otEventDetail.event?.spots_needed} spots</span>
          </div>
          <button className="btn" style={{ background: 'var(--surface-alt)', color: 'var(--dim)', fontSize: 11, padding: '4px 10px' }} onClick={printEventDetail}>{'\u2399'} Print</button>
        </div>
        <div className="stat-row">
          <div className="stat" style={{ borderLeft: '3px solid var(--green)', flex: '1 1 100px' }}><div className="stat-label">Accepted</div><div className="stat-val" style={{ color: 'var(--green)', fontSize: 16 }}>{otEventDetail.responses.filter(r => r.response === 'accepted').length}</div></div>
          <div className="stat" style={{ borderLeft: '3px solid var(--red)', flex: '1 1 100px' }}><div className="stat-label">Refused</div><div className="stat-val" style={{ color: 'var(--red)', fontSize: 16 }}>{otEventDetail.responses.filter(r => r.response === 'refused').length}</div></div>
          <div className="stat" style={{ borderLeft: '3px solid var(--amber)', flex: '1 1 100px' }}><div className="stat-label">Charged</div><div className="stat-val" style={{ color: 'var(--amber)', fontSize: 16 }}>{otEventDetail.responses.filter(r => r.response === 'charged').length}</div></div>
        </div>
        <div className="scroll-table"><table><thead><tr><th>#</th><th>Employee</th><th>Classification</th><th>Specialty</th><th>Seniority</th><th className="right">OT Bal</th><th>Response</th><th>Notes</th></tr></thead><tbody>
          {otEventDetail.responses.map(r => {
            const rc = r.response === 'accepted' ? 'var(--green)' : r.response === 'refused' ? 'var(--red)' : r.response === 'charged' ? 'var(--amber)' : 'var(--dim)'
            return <tr key={r.id} className={r.response === 'accepted' ? 'accepted-row' : ''}>
              <td style={{ color: 'var(--dim)' }}>{r.call_order}</td>
              <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{r.employee_name}</td>
              <td style={{ color: 'var(--dim)' }}>{r.classification}</td>
              <td><SpecBadge specialty={r.specialty} /></td>
              <td style={{ color: 'var(--dim)' }}>{r.seniority_date || '\u2014'}</td>
              <td className="right">{r.ot_balance?.toFixed(1) || '0.0'}</td>
              <td><span className="badge" style={{ background: `${rc}22`, color: rc }}>{r.response.toUpperCase()}</span></td>
              <td style={{ color: 'var(--dim)', fontSize: 11 }}>{r.notes || ''}</td>
            </tr>
          })}
        </tbody></table></div>
      </> : <>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>OT Event History</div>
        {otEvents.length === 0 ? <div style={{ color: 'var(--dim)', padding: 20, textAlign: 'center' }}>No OT events saved yet. Create one from the Overtime tab.</div> :
        <div className="scroll-table"><table><thead><tr><th>Date</th><th>Event</th><th className="right">Hours</th><th className="right">Spots</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {otEvents.map(ev => <tr key={ev.id}>
            <td style={{ fontWeight: 600 }}>{ev.event_date}</td>
            <td>{ev.event_name}</td>
            <td className="right">{ev.hours_offered}</td>
            <td className="right">{ev.spots_needed}</td>
            <td><span className="badge" style={{ background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--amber-dim)', color: ev.status === 'completed' ? 'var(--green)' : 'var(--amber)' }}>{ev.status}</span></td>
            <td><button className="btn" style={{ background: 'var(--accent)', fontSize: 11, padding: '3px 10px' }} onClick={() => loadEventDetail(ev.id)}>View</button></td>
          </tr>)}
        </tbody></table></div>}
      </>}
    </div>}

    {/* ══════ WEEKLY ══════ */}
    {activeTab === 'weekly' && <div className="card"><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Weekly Summary</div>
      <div className="scroll-table"><table><thead><tr><th>Week Ending</th><th className="right">Crew</th><th className="right">Days</th><th className="right">ST</th><th className="right">OT 1.5x</th><th className="right">DT 2x</th><th className="right">Total Hrs</th><th>Distribution</th></tr></thead><tbody>
        {weeklyData.map(w => { const sP = w.hours > 0 ? (w.st / w.hours) * 100 : 0; const oP = w.hours > 0 ? (w.ot / w.hours) * 100 : 0; const dP = w.hours > 0 ? (w.dt / w.hours) * 100 : 0; return <tr key={w.week_ending}><td style={{ fontWeight: 600 }}>{w.week_ending}</td><td className="right">{w.crew}</td><td className="right" style={{ color: 'var(--dim)' }}>{w.workDays}</td><td className="right" style={{ color: 'var(--green)' }}>{w.st.toFixed(1)}</td><td className="right" style={{ color: 'var(--amber)' }}>{w.ot > 0 ? w.ot.toFixed(1) : '\u2014'}</td><td className="right" style={{ color: 'var(--red)' }}>{w.dt > 0 ? w.dt.toFixed(1) : '\u2014'}</td><td className="right" style={{ fontWeight: 600 }}>{w.hours.toFixed(1)}</td><td style={{ width: 140 }}><div className="dist-bar"><div style={{ width: `${sP}%`, background: 'var(--green)' }} /><div style={{ width: `${oP}%`, background: 'var(--amber)' }} /><div style={{ width: `${dP}%`, background: 'var(--red)' }} /></div></td></tr> })}
      </tbody></table></div></div>}

    {/* ══════ SENIORITY ══════ */}
    {activeTab === 'seniority' && <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div><span style={{ fontWeight: 600, fontSize: 14 }}>Seniority &amp; Attendance</span><span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>5+ consecutive work days off triggers review</span></div>
        <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{senData.filter(e => e.flag).length} flagged</span>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ maxWidth: 220 }} placeholder="Search employees..." value={senSearch} onChange={e => setSenSearch(e.target.value)} />
        <select value={senFilter} onChange={e => setSenFilter(e.target.value)}><option value="all">All Classifications</option>{clsList.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{senData.length} employees</span>
      </div>
      <div className="scroll-table"><table><thead><tr>
        <th onClick={() => senSortBy('name')}>Employee<SI ss={senSort} col="name" /></th><th>Trade</th><th>Class</th>
        <th onClick={() => senSortBy('first_date')}>Seniority Date<SI ss={senSort} col="first_date" /></th>
        <th onClick={() => senSortBy('last_date')}>Last Worked<SI ss={senSort} col="last_date" /></th>
        <th className="right" onClick={() => senSortBy('days')}>Days<SI ss={senSort} col="days" /></th>
        <th className="right" onClick={() => senSortBy('consOff')}>Current Off<SI ss={senSort} col="consOff" /></th>
        <th className="right" onClick={() => senSortBy('maxStreak')}>Max Streak<SI ss={senSort} col="maxStreak" /></th>
        <th>Status</th>
      </tr></thead><tbody>
        {senData.map(e => <tr key={e.name} className={e.flag ? 'flag-row' : ''} style={e.is_active === false ? { opacity: 0.6 } : undefined}>
          <CN name={e.name} isActive={e.is_active} showLeft={true} />
          <td><TradeBadge trade={e.trade} /></td><td style={{ color: 'var(--dim)' }}>{e.classification}</td>
          <td>{e.first_date || '\u2014'}</td><td style={{ color: 'var(--dim)' }}>{e.last_date || '\u2014'}</td>
          <td className="right">{e.days}</td>
          <td className="right" style={{ color: e.consOff >= 5 ? 'var(--red)' : 'var(--dim)' }}>{e.consOff}</td>
          <td className="right" style={{ color: e.maxStreak >= 5 ? 'var(--red)' : 'var(--dim)' }}>{e.maxStreak}</td>
          <td>{e.flag ? <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>Review</span> : <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>OK</span>}</td>
        </tr>)}
      </tbody></table></div>
    </div>}

    </div>
  </div>)
}
