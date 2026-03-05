'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Assigned OT config ───
const FULLY_ASSIGNED = new Set(['Kempf, Mathew H.', 'Ripley, Jacob M.', 'Marler III, John D.'])
const FOREMAN_TRADES = new Set(['01-G Foreman', '02-Foreman'])
const APPRENTICE_TRADES = new Set(['93-Appr School'])
const JOURNEYMAN_TRADES = new Set(['06-Mechanic', 'PF'])

export default function Dashboard() {
  const [employees, setEmployees] = useState([])
  const [hours, setHours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')

  // Dashboard state
  const [dashSort, setDashSort] = useState({ col: 'total', dir: 'desc' })
  const [dashFilter, setDashFilter] = useState('all')
  const [dashSearch, setDashSearch] = useState('')

  // OT state
  const [sixTens, setSixTens] = useState(new Set())
  const [otEventOpen, setOtEventOpen] = useState(false)
  const [otGenerated, setOtGenerated] = useState(false)
  const [otResponses, setOtResponses] = useState({})
  const [otForm, setOtForm] = useState({ name: '', date: '', hours: '8', spots: '5' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let allE = [], allH = [], off = 0
      while (true) {
        const { data, error } = await supabase.from('employees').select('*').range(off, off + 999)
        if (error) throw error
        allE = allE.concat(data)
        if (data.length < 1000) break
        off += 1000
      }
      off = 0
      while (true) {
        const { data, error } = await supabase.from('daily_hours').select('*').order('work_date', { ascending: false }).range(off, off + 999)
        if (error) throw error
        allH = allH.concat(data)
        if (data.length < 1000) break
        off += 1000
      }
      setEmployees(allE)
      setHours(allH)
      setLoading(false)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // ─── Computed data ───
  const empSummary = useMemo(() => {
    const map = {}
    employees.forEach(e => { map[e.name] = { ...e, st: 0, ot: 0, dt: 0, total: 0, days: 0 } })
    hours.forEach(h => {
      if (map[h.employee_name]) {
        map[h.employee_name].st += parseFloat(h.straight_time || 0)
        map[h.employee_name].ot += parseFloat(h.overtime_1_5x || 0)
        map[h.employee_name].dt += parseFloat(h.double_time_2x || 0)
        map[h.employee_name].total += parseFloat(h.total_hours || 0)
        map[h.employee_name].days += 1
      }
    })
    return Object.values(map)
  }, [employees, hours])

  const totals = useMemo(() => ({
    hours: hours.reduce((s, h) => s + parseFloat(h.total_hours || 0), 0),
    st: hours.reduce((s, h) => s + parseFloat(h.straight_time || 0), 0),
    ot: hours.reduce((s, h) => s + parseFloat(h.overtime_1_5x || 0), 0),
    dt: hours.reduce((s, h) => s + parseFloat(h.double_time_2x || 0), 0),
    weeks: new Set(hours.map(h => h.week_ending)).size,
  }), [hours])

  const trades = useMemo(() => [...new Set(employees.map(e => e.trade))].sort(), [employees])

  // ─── Dashboard helpers ───
  const filteredEmps = useMemo(() => {
    let f = empSummary
    if (dashFilter !== 'all') f = f.filter(e => e.trade === dashFilter)
    if (dashSearch) f = f.filter(e => e.name.toLowerCase().includes(dashSearch.toLowerCase()))
    f.sort((a, b) => {
      const av = dashSort.col === 'name' ? a.name : (a[dashSort.col] || 0)
      const bv = dashSort.col === 'name' ? b.name : (b[dashSort.col] || 0)
      if (dashSort.col === 'name') return dashSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return dashSort.dir === 'asc' ? av - bv : bv - av
    })
    return f
  }, [empSummary, dashFilter, dashSearch, dashSort])

  function dashSortBy(col) {
    setDashSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sortIcon = (col) => dashSort.col === col
    ? (dashSort.dir === 'asc' ? ' ↑' : ' ↓')
    : <span style={{ opacity: 0.3 }}> ↕</span>

  // ─── OT helpers ───
  const otList = useMemo(() => {
    const jmen = employees.filter(e => JOURNEYMAN_TRADES.has(e.trade))
    const map = {}
    jmen.forEach(e => {
      map[e.name] = { name: e.name, trade: e.trade, first_date: e.first_date, ot_total: 0, bid_ot: 0, on610: sixTens.has(e.name) }
    })
    hours.forEach(h => {
      if (map[h.employee_name]) {
        const ot = parseFloat(h.overtime_1_5x || 0) + parseFloat(h.double_time_2x || 0)
        map[h.employee_name].ot_total += ot
        if (!FULLY_ASSIGNED.has(h.employee_name)) {
          map[h.employee_name].bid_ot += ot
        }
      }
    })
    return Object.values(map).sort((a, b) => {
      if (a.bid_ot !== b.bid_ot) return a.bid_ot - b.bid_ot
      return (a.first_date || '9999').localeCompare(b.first_date || '9999')
    })
  }, [employees, hours, sixTens])

  function toggle610(name) {
    setSixTens(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function generateOTList() {
    const eligible = otList.filter(e => !e.on610)
    const resp = {}
    eligible.forEach(e => { resp[e.name] = 'pending' })
    setOtResponses(resp)
    setOtGenerated(true)
  }

  function setOTResp(name, val) {
    setOtResponses(prev => ({ ...prev, [name]: val }))
  }

  // ─── Weekly data ───
  const weeklyData = useMemo(() => {
    const map = {}
    hours.forEach(h => {
      const we = h.week_ending
      if (!map[we]) map[we] = { week_ending: we, emps: new Set(), hours: 0, st: 0, ot: 0, dt: 0, days: new Set() }
      map[we].emps.add(h.employee_name)
      map[we].hours += parseFloat(h.total_hours || 0)
      map[we].st += parseFloat(h.straight_time || 0)
      map[we].ot += parseFloat(h.overtime_1_5x || 0)
      map[we].dt += parseFloat(h.double_time_2x || 0)
      map[we].days.add(h.work_date)
    })
    return Object.values(map)
      .map(w => ({ ...w, crew: w.emps.size, workDays: w.days.size }))
      .sort((a, b) => b.week_ending.localeCompare(a.week_ending))
  }, [hours])

  // ─── Seniority data ───
  const seniorityData = useMemo(() => {
    const empDates = {}
    hours.forEach(h => {
      if (!empDates[h.employee_name]) empDates[h.employee_name] = new Set()
      empDates[h.employee_name].add(h.work_date)
    })
    const allDates = [...new Set(hours.map(h => h.work_date))].sort()
    const workDays = allDates.filter(d => {
      const dt = new Date(d + 'T12:00:00')
      const day = dt.getDay()
      return day > 0 && day < 6
    })

    const jmen = employees.filter(e => JOURNEYMAN_TRADES.has(e.trade))
    return jmen.map(e => {
      const worked = empDates[e.name] || new Set()
      let consOff = 0
      for (let i = workDays.length - 1; i >= 0; i--) {
        if (workDays[i] < e.first_date) break
        if (!worked.has(workDays[i])) consOff++; else break
      }
      let maxStreak = 0, cur = 0
      for (const d of workDays) {
        if (d < e.first_date) continue
        if (!worked.has(d)) { cur++; maxStreak = Math.max(maxStreak, cur) } else cur = 0
      }
      return {
        name: e.name, trade: e.trade, first_date: e.first_date, last_date: e.last_date,
        days: worked.size, consOff, maxStreak, flag: consOff >= 5 || maxStreak >= 5
      }
    }).sort((a, b) => (a.first_date || '9999').localeCompare(b.first_date || '9999'))
  }, [employees, hours])

  // ─── RENDER ───
  if (loading) return (
    <div className="loading">
      <div className="spinner" />
      <div style={{ fontSize: 16, fontWeight: 600 }}>Loading...</div>
      <div style={{ color: 'var(--dim)', fontSize: 13 }}>Connecting to Supabase</div>
    </div>
  )

  if (error) return (
    <div className="loading">
      <div style={{ color: 'var(--red)', fontSize: 18, fontWeight: 700 }}>Connection Error</div>
      <div style={{ fontSize: 13 }}>{error}</div>
    </div>
  )

  const tabs = ['dashboard', 'overtime', 'weekly', 'seniority']

  function tradeBadge(trade) {
    const color = FOREMAN_TRADES.has(trade) ? 'var(--amber)' : APPRENTICE_TRADES.has(trade) ? 'var(--accent)' : 'var(--dim)'
    const bg = FOREMAN_TRADES.has(trade) ? 'var(--amber-dim)' : APPRENTICE_TRADES.has(trade) ? 'rgba(58,107,197,0.27)' : 'var(--surface-alt)'
    return <span className="badge" style={{ background: bg, color }}>{trade}</span>
  }

  // OT event derived data
  const accepted = Object.entries(otResponses).filter(([, v]) => v === 'accepted')
  const refused = Object.entries(otResponses).filter(([, v]) => v === 'refused')
  const charged = Object.entries(otResponses).filter(([, v]) => v === 'charged')
  const spots = parseInt(otForm.spots) || 0
  const eligible = otList.filter(e => !e.on610)
  const maxBidOT = otList.length ? Math.max(...otList.map(e => e.bid_ot)) : 0
  const minBidOT = otList.length ? Math.min(...otList.map(e => e.bid_ot)) : 0

  return (
    <div>
      <div className="header">
        <div>
          <h1>HFH South Campus</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>Live</span>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>
              Pipefitters 636 · {employees.length} employees · {hours.length.toLocaleString()} records
            </span>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'dashboard' ? 'Dashboard' : t === 'overtime' ? 'Overtime' : t === 'weekly' ? 'Weekly' : 'Seniority'}
          </div>
        ))}
      </div>

      <div className="content">
        {/* ══════ DASHBOARD ══════ */}
        {activeTab === 'dashboard' && (
          <>
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
                <select value={dashFilter} onChange={e => setDashFilter(e.target.value)}>
                  <option value="all">All Trades</option>
                  {trades.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>{filteredEmps.length} employees</span>
              </div>
              <div className="scroll-table">
                <table><thead><tr>
                  <th onClick={() => dashSortBy('name')}>Employee{sortIcon('name')}</th>
                  <th>Trade</th><th>Class</th>
                  <th className="right" onClick={() => dashSortBy('days')}>Days{sortIcon('days')}</th>
                  <th className="right" onClick={() => dashSortBy('st')}>ST{sortIcon('st')}</th>
                  <th className="right" onClick={() => dashSortBy('ot')}>OT 1.5x{sortIcon('ot')}</th>
                  <th className="right" onClick={() => dashSortBy('dt')}>DT 2x{sortIcon('dt')}</th>
                  <th className="right" onClick={() => dashSortBy('total')}>Total{sortIcon('total')}</th>
                </tr></thead><tbody>
                  {filteredEmps.map(e => (
                    <tr key={e.name}>
                      <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{e.name}</td>
                      <td>{tradeBadge(e.trade)}</td>
                      <td style={{ color: 'var(--dim)' }}>{e.classification}</td>
                      <td className="right">{e.days}</td>
                      <td className="right" style={{ color: 'var(--green)' }}>{e.st.toFixed(1)}</td>
                      <td className="right" style={{ color: 'var(--amber)' }}>{e.ot > 0 ? e.ot.toFixed(1) : '—'}</td>
                      <td className="right" style={{ color: 'var(--red)' }}>{e.dt > 0 ? e.dt.toFixed(1) : '—'}</td>
                      <td className="right" style={{ fontWeight: 600 }}>{e.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          </>
        )}

        {/* ══════ OVERTIME ══════ */}
        {activeTab === 'overtime' && (
          <>
            <div className="stat-row">
              <div className="stat" style={{ borderLeft: '3px solid var(--amber)' }}><div className="stat-label">Journeymen on List</div><div className="stat-val">{otList.length}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--green)' }}><div className="stat-label">Lowest Bid OT</div><div className="stat-val" style={{ color: 'var(--green)' }}>{minBidOT.toFixed(1)}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--red)' }}><div className="stat-label">Highest Bid OT</div><div className="stat-val" style={{ color: 'var(--red)' }}>{maxBidOT.toFixed(1)}</div></div>
              <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}><div className="stat-label">Spread</div><div className="stat-val" style={{ color: 'var(--purple)' }}>{(maxBidOT - minBidOT).toFixed(1)}</div></div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Bid OT Offer List</span>
                  <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>Assigned OT (Trimble/Steward) excluded · Sorted: lowest hours → earliest seniority</span>
                </div>
                <button className="btn" style={{ background: 'var(--accent)' }} onClick={() => { setOtEventOpen(!otEventOpen); setOtGenerated(false); setOtResponses({}) }}>
                  {otEventOpen ? 'Close' : '+ New OT Event'}
                </button>
              </div>

              {otEventOpen && (
                <div className="event-form">
                  <div className="row" style={{ marginBottom: 12 }}>
                    <div className="field" style={{ flex: '1 1 180px' }}><label>Event Name</label><input value={otForm.name} onChange={e => setOtForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="field" style={{ flex: '0 0 130px' }}><label>Date</label><input type="date" value={otForm.date} onChange={e => setOtForm(f => ({ ...f, date: e.target.value }))} /></div>
                    <div className="field" style={{ flex: '0 0 80px' }}><label>Hours</label><input type="number" value={otForm.hours} onChange={e => setOtForm(f => ({ ...f, hours: e.target.value }))} /></div>
                    <div className="field" style={{ flex: '0 0 80px' }}><label>Spots</label><input type="number" value={otForm.spots} onChange={e => setOtForm(f => ({ ...f, spots: e.target.value }))} /></div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" style={{ background: 'var(--green)' }} onClick={generateOTList}>Generate List</button></div>
                  </div>

                  {otGenerated && (
                    <>
                      <div className="row" style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 12 }}>Filled: <strong style={{ color: accepted.length >= spots ? 'var(--green)' : 'var(--amber)' }}>{accepted.length}/{spots}</strong></span>
                        <span style={{ fontSize: 12, color: 'var(--dim)' }}>Refused: {refused.length} | Charged: {charged.length}</span>
                      </div>
                      <div className="scroll-table" style={{ maxHeight: 350 }}>
                        <table><thead><tr>
                          <th style={{ width: 30 }}>#</th><th>Employee</th><th className="right">Bid OT</th><th>Seniority</th><th className="center">Response</th>
                        </tr></thead><tbody>
                          {eligible.map((e, i) => {
                            const r = otResponses[e.name] || 'pending'
                            return (
                              <tr key={e.name} className={r === 'accepted' ? 'accepted-row' : ''}>
                                <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                                <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{e.name}</td>
                                <td className="right">{e.bid_ot.toFixed(1)}</td>
                                <td style={{ color: 'var(--dim)' }}>{e.first_date || '—'}</td>
                                <td className="center">
                                  <button className="btn-sm" style={{ background: r === 'accepted' ? 'var(--green)' : 'var(--border)', color: r === 'accepted' ? '#fff' : 'var(--dim)' }} onClick={() => setOTResp(e.name, 'accepted')}>✓</button>{' '}
                                  <button className="btn-sm" style={{ background: r === 'refused' ? 'var(--amber)' : 'var(--border)', color: r === 'refused' ? '#fff' : 'var(--dim)' }} onClick={() => setOTResp(e.name, 'refused')}>✗</button>{' '}
                                  <button className="btn-sm" style={{ background: r === 'charged' ? 'var(--red)' : 'var(--border)', color: r === 'charged' ? '#fff' : 'var(--dim)' }} onClick={() => setOTResp(e.name, 'charged')}>⊘</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody></table>
                      </div>
                      {accepted.length > 0 && (
                        <div className="crew-output">
                          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>{otForm.name || 'OT Event'} — {otForm.date} — {otForm.hours}hrs — Crew List:</div>
                          {accepted.map(([n], i) => <div key={n} style={{ padding: '2px 0' }}>{i + 1}. {n}</div>)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="scroll-table">
                <table><thead><tr>
                  <th style={{ width: 30 }}>#</th><th>Employee</th><th>Trade</th><th>Seniority</th>
                  <th className="right">Total OT</th><th className="right">Bid OT</th>
                  <th className="center">6/10s</th><th>Bar</th>
                </tr></thead><tbody>
                  {otList.map((e, i) => {
                    const pct = maxBidOT > 0 ? (e.bid_ot / maxBidOT) * 100 : 0
                    const barColor = e.on610 ? 'var(--amber)' : pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--green)'
                    const isAssigned = FULLY_ASSIGNED.has(e.name)
                    return (
                      <tr key={e.name} className={e.on610 ? 'six10-row' : ''}>
                        <td style={{ color: 'var(--dim)', fontSize: 10 }}>{i + 1}</td>
                        <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                          {e.name}
                          {e.on610 && <span className="badge" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', marginLeft: 6, fontSize: 9 }}>6/10s</span>}
                          {isAssigned && <span className="badge" style={{ background: 'rgba(58,107,197,0.27)', color: 'var(--accent)', marginLeft: 6, fontSize: 9 }}>Assigned</span>}
                        </td>
                        <td><span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--dim)' }}>{e.trade}</span></td>
                        <td style={{ color: 'var(--dim)' }}>{e.first_date || '—'}</td>
                        <td className="right" style={{ color: 'var(--dim)' }}>{e.ot_total.toFixed(1)}</td>
                        <td className="right" style={{ fontWeight: 600, color: isAssigned ? 'var(--dim)' : 'var(--text)' }}>{e.bid_ot.toFixed(1)}</td>
                        <td className="center"><input type="checkbox" checked={e.on610} onChange={() => toggle610(e.name)} style={{ cursor: 'pointer' }} /></td>
                        <td style={{ width: 120 }}><div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: barColor }} /></div></td>
                      </tr>
                    )
                  })}
                </tbody></table>
              </div>
            </div>
          </>
        )}

        {/* ══════ WEEKLY ══════ */}
        {activeTab === 'weekly' && (
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Weekly Summary</div>
            <div className="scroll-table"><table><thead><tr>
              <th>Week Ending</th><th className="right">Crew</th><th className="right">Days</th>
              <th className="right">ST</th><th className="right">OT 1.5x</th><th className="right">DT 2x</th>
              <th className="right">Total Hrs</th><th>Distribution</th>
            </tr></thead><tbody>
              {weeklyData.map(w => {
                const sP = w.hours > 0 ? (w.st / w.hours) * 100 : 0
                const oP = w.hours > 0 ? (w.ot / w.hours) * 100 : 0
                const dP = w.hours > 0 ? (w.dt / w.hours) * 100 : 0
                return (
                  <tr key={w.week_ending}>
                    <td style={{ fontWeight: 600 }}>{w.week_ending}</td>
                    <td className="right">{w.crew}</td>
                    <td className="right" style={{ color: 'var(--dim)' }}>{w.workDays}</td>
                    <td className="right" style={{ color: 'var(--green)' }}>{w.st.toFixed(1)}</td>
                    <td className="right" style={{ color: 'var(--amber)' }}>{w.ot > 0 ? w.ot.toFixed(1) : '—'}</td>
                    <td className="right" style={{ color: 'var(--red)' }}>{w.dt > 0 ? w.dt.toFixed(1) : '—'}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{w.hours.toFixed(1)}</td>
                    <td style={{ width: 140 }}><div className="dist-bar"><div style={{ width: `${sP}%`, background: 'var(--green)' }} /><div style={{ width: `${oP}%`, background: 'var(--amber)' }} /><div style={{ width: `${dP}%`, background: 'var(--red)' }} /></div></td>
                  </tr>
                )
              })}
            </tbody></table></div>
          </div>
        )}

        {/* ══════ SENIORITY ══════ */}
        {activeTab === 'seniority' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Seniority & Attendance</span>
                <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>Journeymen — 5+ consecutive work days off triggers review</span>
              </div>
              <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{seniorityData.filter(e => e.flag).length} flagged</span>
            </div>
            <div className="scroll-table"><table><thead><tr>
              <th>Employee</th><th>Trade</th><th>Seniority Date</th><th>Last Worked</th>
              <th className="right">Days Worked</th><th className="right">Current Off</th><th className="right">Max Streak Off</th><th>Status</th>
            </tr></thead><tbody>
              {seniorityData.map(e => (
                <tr key={e.name} className={e.flag ? 'flag-row' : ''}>
                  <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{e.name}</td>
                  <td><span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--dim)' }}>{e.trade}</span></td>
                  <td>{e.first_date || '—'}</td>
                  <td style={{ color: 'var(--dim)' }}>{e.last_date || '—'}</td>
                  <td className="right">{e.days}</td>
                  <td className="right" style={{ color: e.consOff >= 5 ? 'var(--red)' : 'var(--dim)' }}>{e.consOff}</td>
                  <td className="right" style={{ color: e.maxStreak >= 5 ? 'var(--red)' : 'var(--dim)' }}>{e.maxStreak}</td>
                  <td>{e.flag
                    ? <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>Review</span>
                    : <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        )}
      </div>
    </div>
  )
}
