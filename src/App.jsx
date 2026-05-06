import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flag,
  MapPinned,
  Navigation,
  Plus,
  Route,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'

import RouteMap from './components/RouteMap.jsx'
import { parseTroopWebHostCsv } from './services/troopWebHostCsv.js'
import { buildBalancedRoutes } from './services/routingService.js'
import { getDashboardStats } from './services/dashboardService.js'
import { sampleStops } from './services/sampleData.js'
import { geocodeAddress, wait } from './services/geocodingService.js'
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

const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2']

export default function App() {
  const [workspaceStatus, setWorkspaceStatus] = useState(
    'Demo workspace only — Google Sheets phase is parked.',
  )

  const [stops, setStops] = useState(() => {
    const saved = localStorage.getItem('scoutFlagRoutes.stops')
    return saved ? JSON.parse(saved) : sampleStops
  })

  const [routeOptions, setRouteOptions] = useState(ROUTE_OPTIONS_DEFAULT)
  const [selectedRouteId, setSelectedRouteId] = useState('route-1')
  const [appendMode, setAppendMode] = useState(false)
  const [editingStopId, setEditingStopId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState('')

  const routes = useMemo(() => buildBalancedRoutes(stops, routeOptions), [stops, routeOptions])
  const dashboard = useMemo(() => getDashboardStats(routes), [routes])
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0]

  const selectedRouteIndex = routes.findIndex((route) => route.id === selectedRoute?.id)
  const selectedRouteColor =
    selectedRouteIndex >= 0 ? ROUTE_COLORS[selectedRouteIndex % ROUTE_COLORS.length] : '#64748b'

  useEffect(() => {
    localStorage.setItem('scoutFlagRoutes.stops', JSON.stringify(stops))
  }, [stops])

  function updateRouteOption(field, value) {
    setRouteOptions((current) => ({ ...current, [field]: Number(value) }))
  }

  function moveStopInSelectedRoute(stopId, direction) {
    if (!selectedRoute) return

    const currentRouteStops = [...selectedRoute.stops]
    const currentIndex = currentRouteStops.findIndex((stop) => stop.id === stopId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentRouteStops.length) return

    const [movedStop] = currentRouteStops.splice(currentIndex, 1)
    currentRouteStops.splice(newIndex, 0, movedStop)

    const orderById = new Map(
      currentRouteStops.map((stop, index) => [
        stop.id,
        {
          manualRouteId: selectedRoute.id,
          manualOrder: index,
        },
      ]),
    )

    setStops((currentStops) =>
      currentStops.map((stop) =>
        orderById.has(stop.id)
          ? {
              ...stop,
              ...orderById.get(stop.id),
            }
          : stop,
      ),
    )
  }

  async function geocodeMissingAddresses() {
    const missingGeo = stops.filter(
      (stop) => !Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng)),
    )

    if (missingGeo.length === 0) {
      alert('All stops already have coordinates.')
      return
    }

    if (
      !confirm(
        `Geocode ${missingGeo.length} missing addresses? This will run slowly to respect free API limits.`,
      )
    ) {
      return
    }

    setIsGeocoding(true)

    let updatedStops = [...stops]
    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < missingGeo.length; i += 1) {
      const stop = missingGeo[i]
      setGeocodeProgress(`Geocoding ${i + 1} of ${missingGeo.length}: ${stop.customerName}`)

      try {
        const result = await geocodeAddress(stop.address)

        if (result) {
          updatedStops = updatedStops.map((currentStop) =>
            currentStop.id === stop.id
              ? {
                  ...currentStop,
                  lat: result.lat,
                  lng: result.lng,
                  geocodeDisplayName: result.displayName,
                  geocodeProvider: result.provider,
                  geocodedAt: new Date().toISOString(),
                }
              : currentStop,
          )
          successCount += 1
        } else {
          failedCount += 1
        }
      } catch (error) {
        console.error(error)
        failedCount += 1
      }

      setStops(updatedStops)

      if (i < missingGeo.length - 1) {
        await wait(1100)
      }
    }

    setIsGeocoding(false)
    setGeocodeProgress('')
    alert(`Geocoding complete.\n\nSuccess: ${successCount}\nFailed: ${failedCount}`)
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
      setStops((current) => [
        ...current,
        {
          id: `manual-${Date.now()}`,
          ...form,
          lat: null,
          lng: null,
          posted: false,
          pickedUp: false,
          postedAt: '',
          pickedUpAt: '',
          comment: '',
        },
      ])
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
          <strong>Safety guidance:</strong> Drivers should use a navigator/passenger to operate the
          app.
        </div>
      </section>

      <section className="grid two">
        <Panel icon={<MapPinned />} title="Troop Workspace">
          <p>{workspaceStatus}</p>
          <button
            className="secondary"
            onClick={() =>
              setWorkspaceStatus('Future phase: connect or create troop-owned Google Sheet.')
            }
          >
            Placeholder: Connect/Create Sheet
          </button>
        </Panel>

        <Panel icon={<Upload />} title="Import TroopWebHost CSV">
          <p>Use replace for a new clean import, or append to add another file to existing stops.</p>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={appendMode}
              onChange={(event) => setAppendMode(event.target.checked)}
            />
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
            <NumberField
              label="Available drivers/routes"
              value={routeOptions.availableDrivers}
              min="1"
              onChange={(value) => updateRouteOption('availableDrivers', value)}
            />
            <NumberField
              label="Max routes"
              value={routeOptions.maxRoutes}
              min="1"
              onChange={(value) => updateRouteOption('maxRoutes', value)}
            />
            <NumberField
              label="Min stops per route"
              value={routeOptions.minStopsPerRoute}
              min="1"
              onChange={(value) => updateRouteOption('minStopsPerRoute', value)}
            />
            <NumberField
              label="Max stops per route"
              value={routeOptions.maxStopsPerRoute}
              min="1"
              onChange={(value) => updateRouteOption('maxStopsPerRoute', value)}
            />
          </div>
        </Panel>

        <Panel icon={<Route />} title="Coordinator Dashboard">
          <button onClick={startAddStop}>
            <Plus size={16} /> Add customer
          </button>

          <button
            className="danger"
            onClick={() => {
              if (!confirm('Clear all saved local data and reload sample stops?')) return
              localStorage.removeItem('scoutFlagRoutes.stops')
              setStops(sampleStops)
              setSelectedRouteId('route-1')
            }}
          >
            Clear local data
          </button>

          <button className="secondary" onClick={geocodeMissingAddresses} disabled={isGeocoding}>
            <Navigation size={16} />
            {isGeocoding ? 'Geocoding...' : 'Geocode missing'}
          </button>

          {geocodeProgress && <p className="small">{geocodeProgress}</p>}

          <p className="small">Geocoding © OpenStreetMap contributors</p>

          <div className="route-list">
            {routes.map((route, index) => (
              <button
                className={route.id === selectedRoute?.id ? 'route-pill active' : 'route-pill'}
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
                style={{
                  background: ROUTE_COLORS[index % ROUTE_COLORS.length],
                  color: 'white',
                }}
              >
                <span className="route-color-label">{route.name}</span>
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
            <TextField
              label="Customer name"
              value={form.customerName}
              onChange={(value) => setForm({ ...form, customerName: value })}
            />
            <TextField
              label="Address"
              value={form.address}
              onChange={(value) => setForm({ ...form, address: value })}
            />
            <TextField
              label="Email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(value) => setForm({ ...form, phone: value })}
            />
          </div>

          <label className="full-field">
            <span>Special instructions</span>
            <textarea
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            />
          </label>

          <div className="actions">
            <button onClick={saveStop}>Save</button>
            <button className="secondary" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <MapPinned />
          <h2>Route Map</h2>
        </div>
        <RouteMap routes={routes} />
      </section>

      <section className="driver-view">
        <div>
          <p className="eyebrow">Driver / Navigator View</p>
          <h2>{selectedRoute?.name || 'No route selected'}</h2>
        </div>

        <div className="stop-list">
          {selectedRoute?.stops.map((stop) => (
           <article
  className="stop-card"
  key={stop.id}
  style={{ borderLeft: `6px solid ${selectedRouteColor}` }}
>
  {/* Route Identity */}
  <div
    style={{
      background: selectedRouteColor,
      color: 'white',
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: 700,
      marginBottom: '10px',
    }}
  >
    {selectedRoute?.name}
  </div>

  {/* Customer */}
  <strong
    style={{
      display: 'block',
      marginBottom: '0.75rem',
      fontSize: '1.05rem',
    }}
  >
    {stop.customerName}
  </strong>

  {/* Address */}
  <p>
    <strong>Address:</strong> {stop.address}
  </p>

  {/* Directions */}
  <div style={{ margin: '0.75rem 0 1rem' }}>
    <a
      className="button-link secondary"
      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        stop.address,
      )}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Get directions
    </a>
  </div>

  {/* Instructions */}
  {stop.instructions && (
    <p className="small">
      <strong>Instructions:</strong> {stop.instructions}
    </p>
  )}

  {/* Phone */}
  {stop.phone && (
    <p className="small">
      <strong>Phone:</strong> {stop.phone}
    </p>
  )}

  {/* Email */}
  {stop.email && (
    <p className="small">
      <strong>Email:</strong> {stop.email}
    </p>
  )}

  {/* Coordinator Controls */}
  <div
    className="actions"
    style={{
      marginTop: '1rem',
      marginBottom: '1rem',
    }}
  >
    <button
      className="secondary"
      onClick={() => moveStopInSelectedRoute(stop.id, 'up')}
    >
      <ArrowUp size={16} /> Up
    </button>

    <button
      className="secondary"
      onClick={() => moveStopInSelectedRoute(stop.id, 'down')}
    >
      <ArrowDown size={16} /> Down
    </button>

    <button
      className="secondary"
      onClick={() => startEditStop(stop)}
    >
      Edit
    </button>
  </div>

  {/* Comments */}
  <div style={{ marginTop: '1rem' }}>
    <label
      style={{
        display: 'block',
        fontWeight: 700,
        marginBottom: '0.35rem',
      }}
    >
      Comment / Issue
    </label>

    <textarea
      placeholder="Add notes, access issues, damaged flag comments, etc..."
      value={stop.comment || ''}
      onChange={(event) => updateStopComment(stop.id, event.target.value)}
    />
  </div>

  {/* Completion Actions */}
  <div
    className="actions"
    style={{
      marginTop: '1rem',
    }}
  >
    <button
      className={stop.posted ? 'success' : 'secondary'}
      onClick={() => toggleStopStatus(stop.id, 'posted')}
    >
      {stop.posted ? 'Posted ✓' : 'Mark posted'}
    </button>

    <button
      className={stop.pickedUp ? 'success' : 'secondary'}
      onClick={() => toggleStopStatus(stop.id, 'pickedUp')}
    >
      {stop.pickedUp ? 'Picked up ✓' : 'Mark pickup'}
    </button>
  </div>

  {/* Navigation Actions */}
  <div
    className="actions"
    style={{
      marginTop: '1rem',
    }}
  >
    <button className="secondary">
      Previous stop
    </button>

    <button>
      Next stop
    </button>

    <button className="secondary">
      Return to overview
    </button>
  </div>

  {/* Dangerous Coordinator Action */}
  <div
    className="actions"
    style={{
      marginTop: '1.25rem',
      borderTop: '1px solid #e2e8f0',
      paddingTop: '1rem',
    }}
  >
    <button
      className="danger"
      onClick={() => deleteStop(stop.id)}
    >
      <Trash2 size={16} /> Delete
    </button>
  </div>
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
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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