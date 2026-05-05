import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  MapPinned,
  Plus,
  Route,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { parseTroopWebHostCsv } from './services/troopWebHostCsv.js'
import { buildBalancedRoutes } from './services/routingService.js'
import { getDashboardStats } from './services/dashboardService.js'
import { sampleStops } from './services/sampleData.js'
import './styles.css'

const ROUTE_OPTIONS_DEFAULT = {
  availableDrivers: 4,
  maxRoutes: 6,
  minStopsPerRoute: 5,
  maxStopsPerRoute: 25,
}

const EMPTY_FORM = {
  customerName: '',
  address: '',
  instructions: '',
  email: '',
  phone: '',
}

export default function App() {
  const [workspaceStatus, setWorkspaceStatus] = useState('Demo workspace only — Google Sheets phase is parked.')
  const [stops, setStops] = useState(sampleStops)
  const [routeOptions, setRouteOptions] = useState(ROUTE_OPTIONS_DEFAULT)
  const [selectedRouteId, setSelectedRouteId] = useState('route-1')
  const [appendMode, setAppendMode] = useState(false)
  const [editingStopId, setEditingStopId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const routes = useMemo(() => buildBalancedRoutes(stops, routeOptions), [stops, routeOptions])
  const dashboard = useMemo(() => getDashboardStats(routes), [routes])
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0]

  function updateRouteOption(field, value) {
    setRouteOptions((current) => ({ ...current, [field]: Number(value) }))
  }

  async function handleCsvUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const result = parseTroopWebHostCsv(text)
    const parsedStops = dedupeStops(result.stops)

    if (parsedStops.length === 0) {
      alert(
        `No usable rows found.\n\nTotal rows: ${result.summary.totalRows}\nSkipped rows: ${result.summary.skippedRows}`,
      )
      return
    }

    setStops((current) => (appendMode ? mergeStops(current, parsedStops) : parsedStops))
    setSelectedRouteId('route-1')

    const skippedMessage =
      result.summary.skippedRows > 0
        ? `\n\nSkipped rows: ${result.summary.skippedRows}\n${result.summary.skipped
            .slice(0, 5)
            .map((row) => `Row ${row.rowNumber}: ${row.reason}`)
            .join('\n')}`
        : ''

    alert(
      `CSV import complete.\n\nMode: ${appendMode ? 'Append' : 'Replace'}\nImported rows: ${result.summary.importedRows}\nTotal rows: ${result.summary.totalRows}${skippedMessage}`,
    )

    event.target.value = ''
  }

function dedupeStops(stopList) {
  const seen = new Set()

  return stopList.filter((stop) => {
    const key = getStopDedupeKey(stop)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

  function mergeStops(currentStops, newStops) {
  const existingKeys = new Set(currentStops.map(getStopDedupeKey))
  const uniqueNewStops = newStops.filter((stop) => !existingKeys.has(getStopDedupeKey(stop)))
  return [...currentStops, ...uniqueNewStops]
}

function getStopDedupeKey(stop) {
  return `${normalizeText(stop.customerName)}|${normalizeText(stop.address)}`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

  function startAddStop() {
    setEditingStopId('new')
    setForm(EMPTY_FORM)
  }

  function startEditStop(stop) {
    setEditingStopId(stop.id)
    setForm({
      customerName: stop.customerName || '',
      address: stop.address || '',
      instructions: stop.instructions || '',
      email: stop.email || '',
      phone: stop.phone || '',
    })
  }

  function cancelEdit() {
    setEditingStopId(null)
    setForm(EMPTY_FORM)
  }

  function saveStop() {
    if (!form.customerName.trim() || !form.address.trim()) {
      alert('Customer name and address are required.')
      return
    }

    if (editingStopId === 'new') {
      const newStop = {
        id: `manual-${Date.now()}`,
        ...form,
        lat: null,
        lng: null,
        posted: false,
        pickedUp: false,
        postedAt: '',
        pickedUpAt: '',
        comment: '',
      }

      setStops((current) => [...current, newStop])
    } else {
      setStops((current) =>
        current.map((stop) => (stop.id === editingStopId ? { ...stop, ...form } : stop)),
      )
    }

    cancelEdit()
  }

  function deleteStop(stopId) {
    if (!confirm('Delete this customer/stop?')) return
    setStops((current) => current.filter((stop) => stop.id !== stopId))
  }

  function toggleStopStatus(stopId, field) {
    const timestampField = field === 'posted' ? 'postedAt' : 'pickedUpAt'

    setStops((currentStops) =>
      currentStops.map((stop) =>
        stop.id === stopId
          ? {
              ...stop,
              [field]: !stop[field],
              [timestampField]: !stop[field] ? new Date().toISOString() : '',
            }
          : stop,
      ),
    )
  }

  function updateStopComment(stopId, comment) {
    setStops((currentStops) =>
      currentStops.map((stop) => (stop.id === stopId ? { ...stop, comment } : stop)),
    )
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Scout Flag Routes</p>
          <h1>Troop-owned flag route operations</h1>
          <p className="hero-copy">
            Import TroopWebHost orders, rebalance volunteer routes, and track morning posting and
            evening pickup.
          </p>
        </div>
        <div className="hero-card">
          <Flag size={42} />
          <strong>PWA starter</strong>
          <span>GitHub Pages ready</span>
        </div>
      </header>

      <section className="notice">
        <AlertTriangle size={20} />
        <div>
          <strong>Safety guidance:</strong> Drivers should use a navigator/passenger to operate the app.
        </div>
      </section>

      <section className="grid two">
        <Panel icon={<MapPinned />} title="Troop Workspace">
          <p>{workspaceStatus}</p>
          <button
            className="secondary"
            onClick={() => setWorkspaceStatus('Future phase: connect or create troop-owned Google Sheet.')}
          >
            Placeholder: Connect/Create Sheet
          </button>
        </Panel>

        <Panel icon={<Upload />} title="Import TroopWebHost CSV">
          <p>Use replace for a new clean import, or append to add another file to existing stops.</p>

          <label className="checkbox-row">
            <input type="checkbox" checked={appendMode} onChange={(event) => setAppendMode(event.target.checked)} />
            Append file instead of replacing current stops
          </label>

          <label className="file-button">
            Upload CSV
            <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
          </label>
        </Panel>
      </section>

      <section className="grid stats">
        <Stat label="Routes" value={dashboard.routeCount} icon={<Route />} />
        <Stat label="Stops" value={dashboard.stopCount} icon={<MapPinned />} />
        <Stat label="Posted" value={dashboard.postedCount} icon={<CheckCircle2 />} />
        <Stat label="Picked up" value={dashboard.pickedUpCount} icon={<Flag />} />
        <Stat label="Issues" value={dashboard.issueCount} icon={<AlertTriangle />} />
      </section>

      <section className="grid two">
        <Panel icon={<Users />} title="Route Planning Controls">
          <div className="form-grid">
            <NumberField label="Available drivers/routes" value={routeOptions.availableDrivers} min="1" onChange={(value) => updateRouteOption('availableDrivers', value)} />
            <NumberField label="Max routes" value={routeOptions.maxRoutes} min="1" onChange={(value) => updateRouteOption('maxRoutes', value)} />
            <NumberField label="Min stops per route" value={routeOptions.minStopsPerRoute} min="1" onChange={(value) => updateRouteOption('minStopsPerRoute', value)} />
            <NumberField label="Max stops per route" value={routeOptions.maxStopsPerRoute} min="1" onChange={(value) => updateRouteOption('maxStopsPerRoute', value)} />
          </div>
        </Panel>

        <Panel icon={<Route />} title="Coordinator Dashboard">
          <button onClick={startAddStop}>
            <Plus size={16} /> Add customer
          </button>

          <div className="route-list">
            {routes.map((route) => (
              <button
                className={route.id === selectedRoute?.id ? 'route-pill active' : 'route-pill'}
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
              >
                {route.name}
                <span>{route.stops.length} stops</span>
              </button>
            ))}
          </div>
          <IssueLog routes={routes} />
        </Panel>
      </section>

      {editingStopId && (
        <section className="panel editor-panel">
          <h2>{editingStopId === 'new' ? 'Add Customer' : 'Edit Customer'}</h2>

          <div className="form-grid">
            <TextField label="Customer name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
            <TextField label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
            <TextField label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
            <TextField label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          </div>

          <label className="full-field">
            <span>Special instructions</span>
            <textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
          </label>

          <div className="actions">
            <button onClick={saveStop}>Save</button>
            <button className="secondary" onClick={cancelEdit}>Cancel</button>
          </div>
        </section>
      )}

      <section className="driver-view">
        <div>
          <p className="eyebrow">Driver / Navigator View</p>
          <h2>{selectedRoute?.name || 'No route selected'}</h2>
        </div>

        <div className="stop-list">
          {selectedRoute?.stops.map((stop) => (
            <article className="stop-card" key={stop.id}>
              <div>
                <strong>{stop.customerName}</strong>
                <p>{stop.address}</p>
                {stop.instructions && <p className="small">Instructions: {stop.instructions}</p>}
                {stop.email && <p className="small">Email: {stop.email}</p>}
                {stop.phone && <p className="small">Phone: {stop.phone}</p>}
              </div>

              <div className="actions">
                <button className="secondary" onClick={() => startEditStop(stop)}>Edit</button>
                <button className="danger" onClick={() => deleteStop(stop.id)}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className={stop.posted ? 'success' : 'secondary'} onClick={() => toggleStopStatus(stop.id, 'posted')}>
                  {stop.posted ? 'Posted ✓' : 'Mark posted'}
                </button>
                <button className={stop.pickedUp ? 'success' : 'secondary'} onClick={() => toggleStopStatus(stop.id, 'pickedUp')}>
                  {stop.pickedUp ? 'Picked up ✓' : 'Mark pickup'}
                </button>
              </div>

              <textarea
                placeholder="Comment or issue..."
                value={stop.comment || ''}
                onChange={(event) => updateStopComment(stop.id, event.target.value)}
              />
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function Panel({ icon, title, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function NumberField({ label, value, onChange, min }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={min} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextField({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function IssueLog({ routes }) {
  const issues = routes.flatMap((route) =>
    route.stops
      .filter((stop) => stop.comment)
      .map((stop) => ({
        route: route.name,
        customerName: stop.customerName,
        comment: stop.comment,
      })),
  )

  if (issues.length === 0) return <p className="small">No issues or comments yet.</p>

  return (
    <div className="issue-log">
      {issues.map((issue) => (
        <p key={`${issue.route}-${issue.customerName}-${issue.comment}`}>
          <strong>{issue.route}:</strong> {issue.customerName} — {issue.comment}
        </p>
      ))}
    </div>
  )
}