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
import {
  authorizeGoogleSheets,
  createScoutWorkspaceSheet,
  writeWorkspaceData,
} from './services/googleSheetsService.js'

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
  const [appView, setAppView] = useState('coordinator')
  const [driverMode, setDriverMode] = useState('overview')
  const [activeStopIndex, setActiveStopIndex] = useState(0)
const [autoAdvanceStops, setAutoAdvanceStops] = useState(() => {
  const saved = localStorage.getItem('scoutFlagRoutes.autoAdvanceStops')
  return saved ? JSON.parse(saved) : true
})
const [assignedRoutes, setAssignedRoutes] = useState(() => {
  const saved = localStorage.getItem('scoutFlagRoutes.assignedRoutes')
  return saved ? JSON.parse(saved) : {}
})

const [googleConnected, setGoogleConnected] = useState(false)

const [workspaceSpreadsheetId, setWorkspaceSpreadsheetId] = useState(
  () => localStorage.getItem('scoutFlagRoutes.workspaceSpreadsheetId') || '',
)

const [workspaceSpreadsheetUrl, setWorkspaceSpreadsheetUrl] = useState(
  () => localStorage.getItem('scoutFlagRoutes.workspaceSpreadsheetUrl') || '',
)

const [googleBusy, setGoogleBusy] = useState(false)

  const routes = useMemo(() => buildBalancedRoutes(stops, routeOptions), [stops, routeOptions])
  const dashboard = useMemo(() => getDashboardStats(routes), [routes])
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0]
  const activeStop = selectedRoute?.stops?.[activeStopIndex] || null

  const selectedRouteIndex = routes.findIndex((route) => route.id === selectedRoute?.id)
  const selectedRouteColor =
    selectedRouteIndex >= 0 ? ROUTE_COLORS[selectedRouteIndex % ROUTE_COLORS.length] : '#64748b'

  const postedCountForRoute = selectedRoute?.stops.filter((stop) => stop.posted).length || 0
  const pickedUpCountForRoute = selectedRoute?.stops.filter((stop) => stop.pickedUp).length || 0
  const issueCountForRoute = selectedRoute?.stops.filter((stop) => stop.comment).length || 0

useEffect(() => {
  localStorage.setItem(
    'scoutFlagRoutes.workspaceSpreadsheetId',
    workspaceSpreadsheetId,
  )
}, [workspaceSpreadsheetId])

useEffect(() => {
  localStorage.setItem(
    'scoutFlagRoutes.workspaceSpreadsheetUrl',
    workspaceSpreadsheetUrl,
  )
}, [workspaceSpreadsheetUrl])

useEffect(() => {
  localStorage.setItem(
    'scoutFlagRoutes.autoAdvanceStops',
    JSON.stringify(autoAdvanceStops),
  )
}, [autoAdvanceStops])

useEffect(() => {
  localStorage.setItem('scoutFlagRoutes.assignedRoutes', JSON.stringify(assignedRoutes))
}, [assignedRoutes])

useEffect(() => {
  if (!selectedRoute?.id) return
  localStorage.setItem(
    `scoutFlagRoutes.activeStopIndex.${selectedRoute.id}`,
    String(activeStopIndex),
  )
}, [activeStopIndex, selectedRoute?.id])

  useEffect(() => {
    localStorage.setItem('scoutFlagRoutes.stops', JSON.stringify(stops))
  }, [stops])

  function updateRouteOption(field, value) {
    setRouteOptions((current) => ({ ...current, [field]: Number(value) }))
  }

  function selectRoute(routeId) {
  setSelectedRouteId(routeId)

  const savedIndex = localStorage.getItem(`scoutFlagRoutes.activeStopIndex.${routeId}`)
  setActiveStopIndex(savedIndex ? Number(savedIndex) : 0)

  setDriverMode('overview')
}

function getSelectedRouteAssignment() {
  if (!selectedRoute?.id) {
    return {
      driverName: '',
      navigatorName: '',
    }
  }

  return (
    assignedRoutes[selectedRoute.id] || {
      driverName: '',
      navigatorName: '',
    }
  )
}

function advanceToNextStop() {
  if (!selectedRoute?.stops?.length) return

  setActiveStopIndex((current) =>
    Math.min(selectedRoute.stops.length - 1, current + 1),
  )
}

function completeStop(stopId, field) {
  toggleStopStatus(stopId, field)

  if (!autoAdvanceStops) return

  if (field === 'posted' || field === 'pickedUp') {
    setTimeout(() => {
      advanceToNextStop()
    }, 250)
  }
}

function updateSelectedRouteAssignment(field, value) {
  if (!selectedRoute?.id) return

  setAssignedRoutes((current) => ({
    ...current,
    [selectedRoute.id]: {
      ...current[selectedRoute.id],
      [field]: value,
      assignedAt: current[selectedRoute.id]?.assignedAt || new Date().toISOString(),
    },
  }))
}

function getNextUnfinishedStopIndex(type = 'posted') {
  if (!selectedRoute?.stops?.length) return 0

  const index = selectedRoute.stops.findIndex((stop) =>
    type === 'pickedUp' ? !stop.pickedUp : !stop.posted,
  )

  return index >= 0 ? index : selectedRoute.stops.length - 1
}

function startOrContinueRoute(type = 'posted') {
  if (!selectedRoute?.id) return

  const assignment = getSelectedRouteAssignment()

  if (!assignment.driverName.trim()) {
    alert('Enter a driver name before starting the route.')
    return
  }

  setAssignedRoutes((current) => ({
    ...current,
    [selectedRoute.id]: {
      ...current[selectedRoute.id],
      driverName: assignment.driverName,
      navigatorName: assignment.navigatorName || '',
      assignedAt: current[selectedRoute.id]?.assignedAt || new Date().toISOString(),
    },
  }))

  setActiveStopIndex(getNextUnfinishedStopIndex(type))
  setDriverMode('active')
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

async function connectGoogle() {
  try {
    setGoogleBusy(true)

    await authorizeGoogleSheets()

    setGoogleConnected(true)

    alert('Google Sheets connected successfully.')
  } catch (error) {
    console.error(error)
    alert(`Google connection failed.\n\n${error.message || error}`)
  } finally {
    setGoogleBusy(false)
  }
}

async function createWorkspaceSheet() {
  try {
    setGoogleBusy(true)

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    const sheet = await createScoutWorkspaceSheet()

    setWorkspaceSpreadsheetId(sheet.spreadsheetId)
    setWorkspaceSpreadsheetUrl(sheet.spreadsheetUrl)

    alert('Workspace sheet created successfully.')
  } catch (error) {
    console.error(error)
    alert(`Failed to create workspace sheet.\n\n${error.message || error}`)
  } finally {
    setGoogleBusy(false)
  }
}

async function saveWorkspaceToGoogle() {
  try {
    setGoogleBusy(true)

    if (!workspaceSpreadsheetId) {
      alert('Create a workspace sheet first.')
      return
    }

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    await writeWorkspaceData(workspaceSpreadsheetId, {
      stops,
      routes,
      routeOptions,
    })

    alert('Workspace saved to Google Sheets.')
  } catch (error) {
    console.error(error)
    alert(`Failed to save workspace.\n\n${error.message || error}`)
  } finally {
    setGoogleBusy(false)
  }
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
    selectRoute('route-1')

    const skippedMessage =
      result.summary.skippedRows > 0
        ? `\n\nSkipped rows: ${result.summary.skippedRows}\n${result.summary.skipped
            .slice(0, 5)
            .map((row) => `Row ${row.rowNumber}: ${row.reason}`)
            .join('\n')}`
        : ''

    alert(
      `CSV import complete.\n\nMode: ${appendMode ? 'Append' : 'Replace'}\nImported rows: ${
        result.summary.importedRows
      }\nTotal rows: ${result.summary.totalRows}${skippedMessage}`,
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

  <div className="actions">
    <button
      className="secondary"
      onClick={connectGoogle}
      disabled={googleBusy}
    >
      {googleConnected ? 'Google Connected ✓' : 'Connect Google'}
    </button>

    <button
      onClick={createWorkspaceSheet}
      disabled={googleBusy}
    >
      Create Workspace Sheet
    </button>

    <button
      className="secondary"
      onClick={saveWorkspaceToGoogle}
      disabled={googleBusy}
    >
      Save to Sheet
    </button>
  </div>

  {workspaceSpreadsheetUrl && (
    <p className="small" style={{ marginTop: '1rem' }}>
      Workspace Sheet:{' '}
      <a
        href={workspaceSpreadsheetUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open Google Sheet
      </a>
    </p>
  )}
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
              selectRoute('route-1')
            }}
          >
            Clear local data
          </button>

          <button className="secondary" onClick={geocodeMissingAddresses} disabled={isGeocoding}>
            <Navigation size={16} />
            {isGeocoding ? 'Geocoding...' : 'Geocode missing'}
          </button>

          <button onClick={() => setAppView('coordinator')}>Coordinator overview</button>

          <button className="secondary" onClick={() => setAppView('editRoute')}>
            Edit route order
          </button>

          <button className="secondary" onClick={() => setAppView('driver')}>
            Driver mode
          </button>

          {geocodeProgress && <p className="small">{geocodeProgress}</p>}

          <p className="small">Geocoding © OpenStreetMap contributors</p>

          <div className="route-list">
            {routes.map((route, index) => (
              <button
  className={route.id === selectedRoute?.id ? 'route-pill active' : 'route-pill'}
  key={route.id}
  onClick={() => selectRoute(route.id)}
  style={{
    background: ROUTE_COLORS[index % ROUTE_COLORS.length],
    color: 'white',
  }}
>
  <span className="route-color-label">{route.name}</span>

  <span>{route.stops.length} stops</span>

  <span>
    Posted: {route.stops.filter((stop) => stop.posted).length}/
    {route.stops.length}
  </span>

  <span>
    Pickup: {route.stops.filter((stop) => stop.pickedUp).length}/
    {route.stops.length}
  </span>

  {route.stops.filter((stop) => stop.comment).length > 0 && (
    <span>
      Issues: {route.stops.filter((stop) => stop.comment).length}
    </span>
  )}
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

      {appView === 'coordinator' && (
        <CoordinatorOverview
          routes={routes}
          selectedRoute={selectedRoute}
          selectedRouteColor={selectedRouteColor}
          startEditStop={startEditStop}
          deleteStop={deleteStop}
          toggleStopStatus={toggleStopStatus}
          updateStopComment={updateStopComment}
        />
      )}

      {appView === 'editRoute' && (
        <EditRouteOrderView
          routes={routes}
          selectedRoute={selectedRoute}
          selectedRouteColor={selectedRouteColor}
          moveStopInSelectedRoute={moveStopInSelectedRoute}
          setAppView={setAppView}
        />
      )}

      {appView === 'driver' && (
        <DriverRouteView
          routes={routes}
          selectedRoute={selectedRoute}
          selectedRouteColor={selectedRouteColor}
          driverMode={driverMode}
          setDriverMode={setDriverMode}
          activeStop={activeStop}
          activeStopIndex={activeStopIndex}
          setActiveStopIndex={setActiveStopIndex}
          postedCountForRoute={postedCountForRoute}
          pickedUpCountForRoute={pickedUpCountForRoute}
          issueCountForRoute={issueCountForRoute}
          updateStopComment={updateStopComment}
          toggleStopStatus={toggleStopStatus}

assignment={getSelectedRouteAssignment()}
updateAssignment={updateSelectedRouteAssignment}
assignedRoutes={assignedRoutes}
startOrContinueRoute={startOrContinueRoute}
autoAdvanceStops={autoAdvanceStops}
setAutoAdvanceStops={setAutoAdvanceStops}
completeStop={completeStop}
        />
      )}
    </main>
  )
}

function CoordinatorOverview({
  routes,
  selectedRoute,
  selectedRouteColor,
  startEditStop,
  deleteStop,
  toggleStopStatus,
  updateStopComment,
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <MapPinned />
          <h2>Route Map</h2>
        </div>
        <RouteMap routes={routes} />
      </section>

      <section className="driver-view">
        <div>
          <p className="eyebrow">Coordinator Stop List</p>
          <h2>{selectedRoute?.name || 'No route selected'}</h2>
        </div>

        <div className="stop-list">
          {selectedRoute?.stops.map((stop, index) => (
            <article
              className="stop-card"
              key={stop.id}
              style={{ borderLeft: `6px solid ${selectedRouteColor}` }}
            >
              <div>
                <div
                  style={{
                    background: selectedRouteColor,
                    color: 'white',
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    marginBottom: '8px',
                  }}
                >
                  {selectedRoute?.name} — Stop {index + 1}
                </div>

                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {stop.customerName}
                </strong>

                <p>
                  <strong>Address:</strong> {stop.address}
                </p>

                <a
                  className="button-link secondary"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    stop.address,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ margin: '0.35rem 0 0.65rem' }}
                >
                  Get directions
                </a>

                {stop.instructions && (
                  <p className="small">
                    <strong>Instructions:</strong> {stop.instructions}
                  </p>
                )}

                {stop.phone && (
                  <p className="small">
                    <strong>Phone:</strong> {stop.phone}
                  </p>
                )}

                {stop.email && (
                  <p className="small">
                    <strong>Email:</strong> {stop.email}
                  </p>
                )}
              </div>

              <div className="actions">
                <button className="secondary" onClick={() => startEditStop(stop)}>
                  Edit
                </button>

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

              <textarea
                placeholder="Comment or issue..."
                value={stop.comment || ''}
                onChange={(event) => updateStopComment(stop.id, event.target.value)}
              />

              <div
                className="actions"
                style={{
                  marginTop: '1.25rem',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '1rem',
                }}
              >
                <button className="danger" onClick={() => deleteStop(stop.id)}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function EditRouteOrderView({
  routes,
  selectedRoute,
  selectedRouteColor,
  moveStopInSelectedRoute,
  setAppView,
}) {
  return (
    <section className="driver-view">
      <div>
        <p className="eyebrow">Edit Route Order</p>
        <h2>{selectedRoute?.name || 'No route selected'}</h2>

        <button className="secondary" onClick={() => setAppView('coordinator')}>
          Return to coordinator overview
        </button>
      </div>

      <RouteMap routes={routes} />

      <div className="stop-list">
        {selectedRoute?.stops.map((stop, index) => (
          <article
            className="stop-card"
            key={stop.id}
            style={{ borderLeft: `6px solid ${selectedRouteColor}` }}
          >
            <div>
              <div
                style={{
                  background: selectedRouteColor,
                  color: 'white',
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '8px',
                }}
              >
                {selectedRoute?.name} — Stop {index + 1}
              </div>

              <p>
                <strong>Address:</strong> {stop.address}
              </p>
            </div>

            <div className="actions">
              <button
                className="secondary"
                disabled={index === 0}
                onClick={() => moveStopInSelectedRoute(stop.id, 'up')}
              >
                <ArrowUp size={16} /> Up
              </button>

              <button
                className="secondary"
                disabled={index === selectedRoute.stops.length - 1}
                onClick={() => moveStopInSelectedRoute(stop.id, 'down')}
              >
                <ArrowDown size={16} /> Down
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function DriverRouteView({
  routes,
  selectedRoute,
  selectedRouteColor,
  driverMode,
  setDriverMode,
  activeStop,
  activeStopIndex,
  setActiveStopIndex,
  postedCountForRoute,
  pickedUpCountForRoute,
  issueCountForRoute,
  updateStopComment,
  toggleStopStatus,
assignment,
updateAssignment,
assignedRoutes,
startOrContinueRoute,
autoAdvanceStops,
setAutoAdvanceStops,
completeStop,
}) {
  return (
    <section className="driver-view">
      {driverMode === 'overview' ? (
        <>
          <div>
            <p className="eyebrow">Driver Route Overview</p>
            <h2>{selectedRoute?.name || 'No route selected'}</h2>
          </div>

          <div className="grid stats">
            <Stat label="Total Stops" value={selectedRoute?.stops.length || 0} icon={<MapPinned />} />
            <Stat label="Posted" value={postedCountForRoute} icon={<CheckCircle2 />} />
            <Stat label="Picked Up" value={pickedUpCountForRoute} icon={<Flag />} />
            <Stat label="Issues" value={issueCountForRoute} icon={<AlertTriangle />} />
          </div>
<label
  className="checkbox-row"
  style={{ marginTop: '1rem' }}
>
  <input
    type="checkbox"
    checked={autoAdvanceStops}
    onChange={(event) => setAutoAdvanceStops(event.target.checked)}
  />
  Auto advance to next stop after completion
</label>
         <div className="form-grid" style={{ marginTop: '1rem' }}>
  <TextField
  label="Driver name"
  value={assignment.driverName || ''}
  onChange={(value) => updateAssignment('driverName', value)}
/>

<TextField
  label="Navigator name"
  value={assignment.navigatorName || ''}
  onChange={(value) => updateAssignment('navigatorName', value)}
/>
</div>

{assignment.driverName && (
  <p className="small">
    Assigned to: <strong>{assignment.driverName}</strong>
{assignment.navigatorName ? ` / ${assignment.navigatorName}` : ''}
  </p>
)}

<div className="actions" style={{ marginTop: '1rem' }}>
  <button
    onClick={() => startOrContinueRoute('posted')}
    style={{ background: selectedRouteColor, color: 'white' }}
  >
    Start / Continue Posting
  </button>

  <button className="secondary" onClick={() => startOrContinueRoute('pickedUp')}>
    Start / Continue Pickup
  </button>
</div>

          <div style={{ marginTop: '1.5rem' }}>
            <RouteMap routes={routes} />
          </div>
        </>
      ) : (
        activeStop && (
          <article className="stop-card" style={{ borderLeft: `6px solid ${selectedRouteColor}` }}>
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

            <p className="small">
              Stop {activeStopIndex + 1} of {selectedRoute?.stops.length}
            </p>

            <strong style={{ display: 'block', marginBottom: '0.75rem', fontSize: '1.1rem' }}>
              {activeStop.customerName}
            </strong>

            <p>
              <strong>Address:</strong> {activeStop.address}
            </p>

            <div style={{ margin: '0.75rem 0 1rem' }}>
              <a
                className="button-link secondary"
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  activeStop.address,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions
              </a>
            </div>

            {activeStop.instructions && (
              <p className="small">
                <strong>Instructions:</strong> {activeStop.instructions}
              </p>
            )}

            {activeStop.phone && (
              <p className="small">
                <strong>Phone:</strong> {activeStop.phone}
              </p>
            )}

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.35rem' }}>
                Comment / Issue
              </label>

              <textarea
                placeholder="Add notes, access issues, damaged flag comments, etc..."
                value={activeStop.comment || ''}
                onChange={(event) => updateStopComment(activeStop.id, event.target.value)}
              />
            </div>

            <div className="actions" style={{ marginTop: '1rem' }}>
              <button
                className={activeStop.posted ? 'success' : 'secondary'}
                onClick={() => completeStop(activeStop.id, 'posted')}
              >
                {activeStop.posted ? 'Posted ✓' : 'Mark posted'}
              </button>

              <button
                className={activeStop.pickedUp ? 'success' : 'secondary'}
                onClick={() => completeStop(activeStop.id, 'pickedUp')}
              >
                {activeStop.pickedUp ? 'Picked up ✓' : 'Mark pickup'}
              </button>
            </div>

            <div className="actions" style={{ marginTop: '1rem' }}>
              <button
                className="secondary"
                disabled={activeStopIndex === 0}
                onClick={() => setActiveStopIndex((current) => Math.max(0, current - 1))}
              >
                Previous stop
              </button>

              <button
                disabled={activeStopIndex >= selectedRoute.stops.length - 1}
                onClick={() =>
                  setActiveStopIndex((current) =>
                    Math.min(selectedRoute.stops.length - 1, current + 1),
                  )
                }
              >
                Next stop
              </button>

              <button className="secondary" onClick={() => setDriverMode('overview')}>
                Return to overview
              </button>
            </div>
          </article>
        )
      )}
    </section>
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