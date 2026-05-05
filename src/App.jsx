import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Flag, MapPinned, Route, Upload, Users } from 'lucide-react'
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

export default function App() {
  const [workspaceStatus, setWorkspaceStatus] = useState('Demo workspace only — Google Sheets phase is parked.')
  const [stops, setStops] = useState(sampleStops)
  const [routeOptions, setRouteOptions] = useState(ROUTE_OPTIONS_DEFAULT)
  const [selectedRouteId, setSelectedRouteId] = useState('route-1')

  const routes = useMemo(() => buildBalancedRoutes(stops, routeOptions), [stops, routeOptions])
  const dashboard = useMemo(() => getDashboardStats(routes), [routes])
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0]

  function updateRouteOption(field, value) {
    setRouteOptions((current) => ({
      ...current,
      [field]: Number(value),
    }))
  }

  async function handleCsvUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const parsedStops = parseTroopWebHostCsv(text)

    if (parsedStops.length === 0) {
      alert('No usable rows found. Check the CSV headers and try again.')
      return
    }

    setStops(parsedStops)
    setSelectedRouteId('route-1')
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
            evening pickup without hosting troop customer data in a central database.
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
          app. The driver should not interact with the app while driving.
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
          <p>CSV upload is the only planned ingestion path for this app.</p>
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
          <p className="small">
            Current routing uses a simple geographic sort + balancing placeholder. Replace this with
            stronger clustering after the Google Sheets phase is stable.
          </p>
        </Panel>

        <Panel icon={<Route />} title="Coordinator Dashboard">
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

      <section className="driver-view">
        <div>
          <p className="eyebrow">Driver / Navigator View</p>
          <h2>{selectedRoute?.name || 'No route selected'}</h2>
          <p className="small">
            Future phase: driver enters driver/navigator name. If already assigned, show warning.
          </p>
        </div>

        <div className="stop-list">
          {selectedRoute?.stops.map((stop) => (
            <article className="stop-card" key={stop.id}>
              <div>
                <strong>{stop.customerName}</strong>
                <p>{stop.address}</p>
                {stop.instructions && <p className="small">Instructions: {stop.instructions}</p>}
              </div>

              <div className="actions">
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

  if (issues.length === 0) {
    return <p className="small">No issues or comments yet.</p>
  }

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
