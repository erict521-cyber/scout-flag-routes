import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  geocodeAddressSuggestions,
  wait,
} from './services/geocodingService.js'
import './styles.css'

import {
  authorizeGoogleSheets,
  createScoutWorkspaceSheet,
  readWorkspaceData,
  updateRouteStopProgress,
  writeWorkspaceData,
} from './services/googleSheetsService.js'

import { pickGoogleSpreadsheet } from './services/googlePickerService.js'

const ROUTE_OPTIONS_DEFAULT = {
  availableDrivers: 4,
  maxRoutes: 6,
  minStopsPerRoute: 5,
  maxStopsPerRoute: 25,
  routingStyle: 'geographic',
  geographicWeight: 75,
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
const [setupStatus, setSetupStatus] = useState(() => {
  const saved = localStorage.getItem('scoutFlagRoutes.setupStatus')

  return saved
    ? JSON.parse(saved)
    : {
        isSetupComplete: false,
        setupCompletedAt: '',
        routesDeployed: false,
        routesDeployedAt: '',
      }
})
const [googleConnected, setGoogleConnected] = useState(false)

const [workspaceSpreadsheetId, setWorkspaceSpreadsheetId] = useState(
  () => localStorage.getItem('scoutFlagRoutes.workspaceSpreadsheetId') || '',
)

const [workspaceSpreadsheetUrl, setWorkspaceSpreadsheetUrl] = useState(
  () => localStorage.getItem('scoutFlagRoutes.workspaceSpreadsheetUrl') || '',
)

const [googleBusy, setGoogleBusy] = useState(false)

const [driverSyncStatus, setDriverSyncStatus] = useState({
  state: 'idle',
  lastSavedAt: '',
  error: '',
})
const [coordinatorSyncStatus, setCoordinatorSyncStatus] = useState({
  state: 'idle',
  lastRefreshedAt: '',
  error: '',
})
const [coordinatorAutoRefresh, setCoordinatorAutoRefresh] = useState(() => {
  const saved = localStorage.getItem('scoutFlagRoutes.coordinatorAutoRefresh')

  return saved ? JSON.parse(saved) : true
})
const [driverLinkParams] = useState(() => getDriverLinkParamsFromUrl())
const [driverLinkStatus, setDriverLinkStatus] = useState({
  state: 'idle',
  error: '',
})
const driverCommentSyncTimers = useRef({})
const coordinatorRefreshInFlight = useRef(false)
const driverLinkLoadStarted = useRef(false)
  const routes = useMemo(() => buildBalancedRoutes(stops, routeOptions), [stops, routeOptions])
const dashboard = useMemo(() => getDashboardStats(routes), [routes])
const reviewRoute = routes.find((route) => route.isReviewRoute)
const reviewStopCount = reviewRoute?.stops?.length || 0
const activeRoutes = routes.filter((route) => !route.isReviewRoute)
const assignedRouteCount = activeRoutes.filter((route) => {
  const assignment = assignedRoutes[route.id]

  return assignment?.driverName?.trim()
}).length
const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0]
const activeStop = selectedRoute?.stops?.[activeStopIndex] || null
const isDriverLinkMode = Boolean(driverLinkParams)

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
  localStorage.setItem(
    'scoutFlagRoutes.coordinatorAutoRefresh',
    JSON.stringify(coordinatorAutoRefresh),
  )
}, [coordinatorAutoRefresh])

useEffect(() => {
  localStorage.setItem('scoutFlagRoutes.setupStatus', JSON.stringify(setupStatus))
}, [setupStatus])

useEffect(() => {
  if (!selectedRoute?.id) return
  localStorage.setItem(
    `scoutFlagRoutes.activeStopIndex.${selectedRoute.id}`,
    String(activeStopIndex),
  )
}, [activeStopIndex, selectedRoute?.id])

useEffect(() => {
  if (!coordinatorAutoRefresh) return
  if (appView !== 'coordinator') return
  if (!setupStatus.routesDeployed) return
  if (!workspaceSpreadsheetId) return

  const intervalId = setInterval(() => {
    refreshCoordinatorProgressFromSheet({ quiet: true })
  }, 30000)

  return () => clearInterval(intervalId)
}, [
  coordinatorAutoRefresh,
  appView,
  setupStatus.routesDeployed,
  workspaceSpreadsheetId,
  googleConnected,
])

useEffect(() => {
  if (!driverLinkParams) return
  if (driverLinkLoadStarted.current) return

  driverLinkLoadStarted.current = true
  loadWorkspaceFromDriverLink(driverLinkParams)
}, [driverLinkParams])

  useEffect(() => {
    localStorage.setItem('scoutFlagRoutes.stops', JSON.stringify(stops))
  }, [stops])

  function updateRouteOption(field, value) {
  if (
    setupStatus.isSetupComplete &&
    !confirm(
      'Route setup is already marked complete. Changing route settings will reopen setup and clear deployment status. Continue?',
    )
  ) {
    return
  }

  setSetupStatus((current) => ({
    ...current,
    isSetupComplete: false,
    setupCompletedAt: '',
    routesDeployed: false,
    routesDeployedAt: '',
  }))

  setRouteOptions((current) => ({
    ...current,
    [field]: field === 'routingStyle' ? value : Number(value),
  }))
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

async function syncDriverStopProgress(stop) {
  if (!stop?.id) return

  if (!workspaceSpreadsheetId) {
    setDriverSyncStatus({
      state: 'error',
      lastSavedAt: '',
      error: 'No workspace Sheet connected.',
    })
    return
  }

  try {
    setDriverSyncStatus((current) => ({
      ...current,
      state: 'saving',
      error: '',
    }))

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    await updateRouteStopProgress(workspaceSpreadsheetId, {
      stopId: stop.id,
      posted: stop.posted,
      pickedUp: stop.pickedUp,
      comment: stop.comment || '',
      postedAt: stop.postedAt || '',
      pickedUpAt: stop.pickedUpAt || '',
    })

    setDriverSyncStatus({
      state: 'saved',
      lastSavedAt: new Date().toISOString(),
      error: '',
    })
  } catch (error) {
    console.error('Driver progress sync failed:', error)

    setDriverSyncStatus({
      state: 'error',
      lastSavedAt: '',
      error:
        error?.result?.error?.message ||
        error?.message ||
        'Driver progress failed to sync.',
    })
  }
}

function queueDriverCommentSync(stop) {
  if (!stop?.id) return

  if (driverCommentSyncTimers.current[stop.id]) {
    clearTimeout(driverCommentSyncTimers.current[stop.id])
  }

  driverCommentSyncTimers.current[stop.id] = setTimeout(() => {
    syncDriverStopProgress(stop)
    delete driverCommentSyncTimers.current[stop.id]
  }, 1500)
}

async function refreshCoordinatorProgressFromSheet({ quiet = false } = {}) {
  if (!workspaceSpreadsheetId) {
    setCoordinatorSyncStatus({
      state: 'error',
      lastRefreshedAt: '',
      error: 'No workspace Sheet connected.',
    })

    if (!quiet) {
      alert('Create or connect a workspace sheet first.')
    }

    return
  }

  if (coordinatorRefreshInFlight.current) return

  try {
    coordinatorRefreshInFlight.current = true

    setCoordinatorSyncStatus((current) => ({
      ...current,
      state: 'refreshing',
      error: '',
    }))

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    const loaded = await readWorkspaceData(workspaceSpreadsheetId)
    const loadedStopsById = new Map(loaded.stops.map((stop) => [stop.id, stop]))

    setStops((currentStops) =>
      currentStops.map((stop) => {
        const loadedStop = loadedStopsById.get(stop.id)

        if (!loadedStop) return stop

        return {
          ...stop,
          posted: loadedStop.posted,
          pickedUp: loadedStop.pickedUp,
          comment: loadedStop.comment || '',
          postedAt: loadedStop.postedAt || '',
          pickedUpAt: loadedStop.pickedUpAt || '',
        }
      }),
    )

    setCoordinatorSyncStatus({
      state: 'refreshed',
      lastRefreshedAt: new Date().toISOString(),
      error: '',
    })
  } catch (error) {
    console.error('Coordinator progress refresh failed:', error)

    const message =
      error?.result?.error?.message ||
      error?.message ||
      'Coordinator progress refresh failed.'

    setCoordinatorSyncStatus({
      state: 'error',
      lastRefreshedAt: '',
      error: message,
    })

    if (!quiet) {
      alert(`Failed to refresh route progress.\n\n${message}`)
    }
  } finally {
    coordinatorRefreshInFlight.current = false
  }
}

function handleCoordinatorAutoRefreshChange(checked) {
  setCoordinatorAutoRefresh(checked)

  if (checked) {
    refreshCoordinatorProgressFromSheet({ quiet: true })
  }
}

function completeStop(stopId, field) {
  toggleStopStatus(stopId, field)

  if (!autoAdvanceStops) return

  if (field === 'posted' || field === 'pickedUp') {
    setTimeout(() => {
      advanceToNextStop()
    }, 1200)
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

  if (!driverLinkParams && !assignment.driverName.trim()) {
    alert('Enter a driver name before starting the route.')
    return
  }

  if (!driverLinkParams) {
    setAssignedRoutes((current) => ({
      ...current,
      [selectedRoute.id]: {
        ...current[selectedRoute.id],
        driverName: assignment.driverName,
        navigatorName: assignment.navigatorName || '',
        assignedAt: current[selectedRoute.id]?.assignedAt || new Date().toISOString(),
      },
    }))
  }

  setActiveStopIndex(getNextUnfinishedStopIndex(type))
  setDriverMode('active')
}

  function moveStopInSelectedRoute(stopId, direction) {
  if (!selectedRoute) return

  if (
    setupStatus.isSetupComplete &&
    !confirm(
      'Route setup is already marked complete. Editing route order will reopen setup and clear deployment status. Continue?',
    )
  ) {
    return
  }

  if (setupStatus.isSetupComplete) {
    setSetupStatus((current) => ({
      ...current,
      isSetupComplete: false,
      setupCompletedAt: '',
      routesDeployed: false,
      routesDeployedAt: '',
    }))
  }

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

function hasValidCoordinates(stop) {
  if (stop.lat === null || stop.lat === undefined || stop.lat === '') return false
  if (stop.lng === null || stop.lng === undefined || stop.lng === '') return false

  const lat = Number(stop.lat)
  const lng = Number(stop.lng)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false

  // Reject null-equivalent bad coordinates and impossible campaign locations.
  if (lat === 0 && lng === 0) return false

  // MVP safety bounds for US-based Scout flag routes.
  // This prevents bad geocodes from sending the map to oceans/other continents.
  if (lat < 18 || lat > 72) return false
  if (lng < -180 || lng > -50) return false

  return true
}

function recalculateRoutes() {
  const message = setupStatus.isSetupComplete
    ? 'Route setup is already marked complete. Recalculating will reopen setup, clear deployment status, and clear manual route order edits. Continue?'
    : 'Recalculate routes? This will clear manual route order edits.'

  if (!confirm(message)) return

  setSetupStatus((current) => ({
    ...current,
    isSetupComplete: false,
    setupCompletedAt: '',
    routesDeployed: false,
    routesDeployedAt: '',
  }))

  setStops((currentStops) =>
    currentStops.map((stop) => {
      const updatedStop = { ...stop }

      delete updatedStop.manualRouteId
      delete updatedStop.manualOrder

      return updatedStop
    }),
  )

  selectRoute('route-1')
}

function markSetupComplete() {
  if (reviewStopCount > 0) {
    alert(
      `Resolve ${reviewStopCount} Needs Review stop${
        reviewStopCount === 1 ? '' : 's'
      } before marking setup complete.`,
    )

    return
  }

  if (activeRoutes.length === 0) {
    alert('Create at least one route before marking setup complete.')
    return
  }

  if (
    !confirm(
      `Mark route setup complete?\n\nThis freezes the current route plan as the working setup. You can still reopen setup later by recalculating routes or changing route settings.`,
    )
  ) {
    return
  }

  setSetupStatus({
    isSetupComplete: true,
    setupCompletedAt: new Date().toISOString(),
    routesDeployed: false,
    routesDeployedAt: '',
  })

  alert('Route setup marked complete. You can now deploy routes.')
}

async function deployRoutesToDrivers() {
  if (!setupStatus.isSetupComplete) {
    alert('Mark setup complete before deploying routes.')
    return
  }

  if (reviewStopCount > 0) {
    alert(
      `Resolve ${reviewStopCount} Needs Review stop${
        reviewStopCount === 1 ? '' : 's'
      } before deploying routes.`,
    )

    return
  }

  const unassignedRoutes = activeRoutes.filter((route) => {
    const assignment = assignedRoutes[route.id]

    return !assignment?.driverName?.trim()
  })

  if (
    unassignedRoutes.length > 0 &&
    !confirm(
      `${unassignedRoutes.length} route${
        unassignedRoutes.length === 1 ? ' is' : 's are'
      } missing a driver name. Deploy anyway?`,
    )
  ) {
    return
  }

  const nextSetupStatus = {
    ...setupStatus,
    isSetupComplete: true,
    routesDeployed: true,
    routesDeployedAt: new Date().toISOString(),
  }

  setSetupStatus(nextSetupStatus)

  try {
    setGoogleBusy(true)

    if (!workspaceSpreadsheetId) {
      alert('Create a workspace sheet before deploying routes.')
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
      assignedRoutes,
      setupStatus: nextSetupStatus,
    })

    alert('Routes deployed and saved to Google Sheets.')
  } catch (error) {
    console.error('Route deployment error:', error)
    alert(
      `Failed to deploy routes.\n\n${
        error?.result?.error?.message || error?.message || JSON.stringify(error)
      }`,
    )
  } finally {
    setGoogleBusy(false)
  }
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

async function chooseExistingWorkspaceSheet() {
  try {
    setGoogleBusy(true)

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    const selectedSheet = await pickGoogleSpreadsheet()

    if (!selectedSheet) return

    setWorkspaceSpreadsheetId(selectedSheet.spreadsheetId)
    setWorkspaceSpreadsheetUrl(selectedSheet.spreadsheetUrl)

    const shouldLoadNow = confirm(
      `Connected workspace sheet:\n\n${selectedSheet.spreadsheetName || selectedSheet.spreadsheetId}\n\nLoad data from this Sheet now?`,
    )

    if (!shouldLoadNow) return

    const loaded = await readWorkspaceData(selectedSheet.spreadsheetId)

    if (!loaded.stops.length) {
      alert('No saved customer data found in this workspace sheet.')
      return
    }

    setStops(loaded.stops)

    if (loaded.routeOptions) {
      setRouteOptions((current) => ({
        ...current,
        ...loaded.routeOptions,
      }))
    }

    if (loaded.assignedRoutes) {
      setAssignedRoutes(loaded.assignedRoutes)
    }

    if (loaded.setupStatus) {
      setSetupStatus(loaded.setupStatus)
    }

    selectRoute('route-1')

    alert(`Loaded ${loaded.stops.length} stops from Google Sheets.`)
  } catch (error) {
    console.error('Google Picker error:', error)
    alert(
      `Failed to choose workspace sheet.\n\n${
        error?.result?.error?.message || error?.message || JSON.stringify(error)
      }`,
    )
  } finally {
    setGoogleBusy(false)
  }
}

async function loadWorkspaceFromDriverLink({ sheetId, routeId }) {
  try {
    setDriverLinkStatus({
      state: 'loading',
      error: '',
    })

    setWorkspaceSpreadsheetId(sheetId)
    setWorkspaceSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`)
    setAppView('driver')
    setDriverMode('overview')
    setSelectedRouteId(routeId)

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    const loaded = await readWorkspaceData(sheetId)

    if (!loaded.stops.length) {
      throw new Error('No saved route data found in this workspace sheet.')
    }

    setStops(loaded.stops)

    if (loaded.routeOptions) {
      setRouteOptions((current) => ({
        ...current,
        ...loaded.routeOptions,
      }))
    }

    if (loaded.assignedRoutes) {
      setAssignedRoutes(loaded.assignedRoutes)
    }

    if (loaded.setupStatus) {
      setSetupStatus(loaded.setupStatus)
    }

    selectRoute(routeId)
    setAppView('driver')
    setDriverMode('overview')

    setDriverLinkStatus({
      state: 'loaded',
      error: '',
    })
  } catch (error) {
    console.error('Driver route link load failed:', error)

    setDriverLinkStatus({
      state: 'error',
      error:
        error?.result?.error?.message ||
        error?.message ||
        'Failed to load driver route link.',
    })

    setAppView('driver')
  }
}

function getDriverRouteLink(routeId) {
  if (!workspaceSpreadsheetId || !routeId) return ''

  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('mode', 'driver')
  url.searchParams.set('sheet', workspaceSpreadsheetId)
  url.searchParams.set('route', routeId)

  return url.toString()
}

async function copyDriverRouteLink(routeId) {
  const url = getDriverRouteLink(routeId)

  if (!url) {
    alert('Create or connect a workspace Sheet before copying driver links.')
    return
  }

  try {
    await navigator.clipboard.writeText(url)
    alert('Driver route link copied.')
  } catch {
    window.prompt('Copy this driver route link:', url)
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
  assignedRoutes,
  setupStatus,
})

    alert('Workspace saved to Google Sheets.')
  } catch (error) {
    console.error('Google save error:', error)

alert(
  `Failed to save workspace.\n\n${
    error?.result?.error?.message ||
    error?.message ||
    JSON.stringify(error)
  }`,
)
  } finally {
    setGoogleBusy(false)
  }
}

async function loadWorkspaceFromGoogle() {
  try {
    setGoogleBusy(true)

    if (!workspaceSpreadsheetId) {
      alert('Create or connect a workspace sheet first.')
      return
    }

    if (!googleConnected) {
      await authorizeGoogleSheets()
      setGoogleConnected(true)
    }

    const loaded = await readWorkspaceData(workspaceSpreadsheetId)

    if (!loaded.stops.length) {
      alert('No saved customer data found in this workspace sheet.')
      return
    }

    setStops(loaded.stops)

if (loaded.routeOptions) {
  setRouteOptions((current) => ({
    ...current,
    ...loaded.routeOptions,
  }))
}

if (loaded.assignedRoutes) {
  setAssignedRoutes(loaded.assignedRoutes)
}

if (loaded.setupStatus) {
  setSetupStatus(loaded.setupStatus)
}

selectRoute('route-1')

    alert(`Loaded ${loaded.stops.length} stops from Google Sheets.`)
  } catch (error) {
    console.error('Google load error:', error)

    alert(
      `Failed to load workspace.\n\n${
        error?.result?.error?.message || error?.message || JSON.stringify(error)
      }`,
    )
  } finally {
    setGoogleBusy(false)
  }
}

  async function geocodeMissingAddresses() {
  const missingGeo = stops.filter((stop) => !hasValidCoordinates(stop))

  if (missingGeo.length === 0) {
    alert('All stops already have validated coordinates.')
    return
  }

  if (
    !confirm(
      `Validate ${missingGeo.length} addresses? This will check missing or failed address locations.`,
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
    let suggestions = []
    let lastError = null

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      setGeocodeProgress(
        `Validating address ${i + 1} of ${missingGeo.length}: ${
          stop.customerName
        }${attempt > 1 ? ` — retry ${attempt}` : ''}`,
      )

      try {
        suggestions = await geocodeAddressSuggestions(stop.address, 5)

        if (suggestions.length > 0) {
          break
        }
      } catch (error) {
        console.error(error)
        lastError = error
      }

      if (attempt < 3) {
        await wait(350)
      }
    }

    const result = suggestions[0]

    if (result) {
      updatedStops = updatedStops.map((currentStop) =>
        currentStop.id === stop.id
          ? {
              ...currentStop,
              lat: result.lat,
              lng: result.lng,
              geocodeDisplayName: result.displayName,
              geocodeProvider: result.provider,
              geocodeSuggestions: suggestions,
              geocodeStatus: 'success',
              geocodeError: '',
              geocodedAt: new Date().toISOString(),
            }
          : currentStop,
      )

      successCount += 1
    } else {
      updatedStops = updatedStops.map((currentStop) =>
        currentStop.id === stop.id
          ? {
              ...currentStop,
              lat: null,
              lng: null,
              geocodeStatus: 'failed',
              geocodeError:
                lastError?.message ||
                'No validated address result found after 3 attempts.',
              geocodeSuggestions: suggestions,
            }
          : currentStop,
      )

      failedCount += 1
    }

    setStops(updatedStops)

    if (i < missingGeo.length - 1) {
      await wait(250)
    }
  }

  setIsGeocoding(false)
  setGeocodeProgress('')

  alert(`Address validation complete.\n\nSuccess: ${successCount}\nFailed: ${failedCount}`)
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

function clearLocalData() {
  if (
    !confirm(
      'Clear all saved local app data and reload sample stops?\n\nThis clears local customers, route assignments, setup/deploy status, active stop position, and saved workspace links from this browser only. It does not delete anything from Google Sheets.',
    )
  ) {
    return
  }

  Object.keys(localStorage)
    .filter((key) => key.startsWith('scoutFlagRoutes.'))
    .forEach((key) => localStorage.removeItem(key))

  setStops(sampleStops)
  setRouteOptions(ROUTE_OPTIONS_DEFAULT)
  setSelectedRouteId('route-1')
  setAssignedRoutes({})
  setSetupStatus({
    isSetupComplete: false,
    setupCompletedAt: '',
    routesDeployed: false,
    routesDeployedAt: '',
  })
  setWorkspaceSpreadsheetId('')
  setWorkspaceSpreadsheetUrl('')
  setActiveStopIndex(0)
  setDriverMode('overview')
  setAppView('coordinator')
  setAutoAdvanceStops(true)
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
  const currentStop = stops.find((stop) => stop.id === stopId)

  if (!currentStop) return

  const timestampField = field === 'posted' ? 'postedAt' : 'pickedUpAt'
  const nextValue = !currentStop[field]

  const updatedStop = {
    ...currentStop,
    [field]: nextValue,
    [timestampField]: nextValue ? new Date().toISOString() : '',
  }

  setStops((currentStops) =>
    currentStops.map((stop) => (stop.id === stopId ? updatedStop : stop)),
  )

  syncDriverStopProgress(updatedStop)
}

function updateStopComment(stopId, comment) {
  const currentStop = stops.find((stop) => stop.id === stopId)

  if (!currentStop) return

  const updatedStop = {
    ...currentStop,
    comment,
  }

  setStops((currentStops) =>
    currentStops.map((stop) => (stop.id === stopId ? updatedStop : stop)),
  )

  queueDriverCommentSync(updatedStop)
}

function acceptGeocodeSuggestion(stopId, suggestion) {
  setStops((currentStops) =>
    currentStops.map((stop) =>
      stop.id === stopId
        ? {
            ...stop,
            lat: suggestion.lat,
            lng: suggestion.lng,
            geocodeDisplayName: suggestion.displayName,
            geocodeProvider: suggestion.provider,
            geocodeStatus: 'success',
            geocodeError: '',
            geocodeSuggestions: [suggestion],
            geocodedAt: new Date().toISOString(),
          }
        : stop,
    ),
  )

  recalculateRoutes()
}

  return (
    <main className="app-shell">
{!isDriverLinkMode && (
  <>
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
    <button onClick={connectGoogle} disabled={googleBusy}>
  {googleConnected ? 'Google Connected ✓' : 'Connect Google'}
</button>
<button onClick={createWorkspaceSheet} disabled={googleBusy}>
  Create Workspace Sheet
</button>
<button className="secondary" onClick={chooseExistingWorkspaceSheet} disabled={googleBusy}>
  Choose Existing Sheet
</button>
<button onClick={saveWorkspaceToGoogle} disabled={googleBusy}>
  Save to Sheet
</button>
<button onClick={loadWorkspaceFromGoogle} disabled={googleBusy}>
  Load from Sheet
</button>
  </div>

  {workspaceSpreadsheetUrl ? (
  <p className="small">
    Workspace Sheet:{' '}
    <a href={workspaceSpreadsheetUrl} target="_blank" rel="noopener noreferrer">
      Open Google Sheet
    </a>
  </p>
) : (
  <p className="small warning-text">
    No workspace Sheet connected. Create a new Sheet or choose an existing one.
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
<label>
  <span>Routing style</span>
  <select
    value={routeOptions.routingStyle}
    onChange={(event) => updateRouteOption('routingStyle', event.target.value)}
  >
    <option value="geographic">Geographic grouping</option>
    <option value="balanced">Balanced workload</option>
</select>
</label>

<label>
  <span>
    Balance vs geography: {routeOptions.geographicWeight ?? 75}%
  </span>
  <input
    type="range"
    min="0"
    max="100"
    value={routeOptions.geographicWeight ?? 75}
    onChange={(event) => updateRouteOption('geographicWeight', event.target.value)}
  />
  <span className="small">
    0 = balanced workload, 100 = cleaner geography
  </span>
</label>
          </div>
        </Panel>

        <Panel icon={<Route />} title="Coordinator Dashboard">
  <div className="status-card">
    <strong>
      Setup:{' '}
      {setupStatus.isSetupComplete ? 'Complete' : 'Open'}
    </strong>
    <span>
      Deployment:{' '}
      {setupStatus.routesDeployed ? 'Routes deployed' : 'Not deployed'}
    </span>
    {setupStatus.setupCompletedAt && (
      <span>Setup completed: {new Date(setupStatus.setupCompletedAt).toLocaleString()}</span>
    )}
    {setupStatus.routesDeployedAt && (
      <span>Routes deployed: {new Date(setupStatus.routesDeployedAt).toLocaleString()}</span>
    )}
    <span>
      Assigned routes: {assignedRouteCount}/{activeRoutes.length}
    </span>
    {reviewStopCount > 0 && (
      <span>Needs Review stops: {reviewStopCount}</span>
    )}
<label className="checkbox-row">
  <input
    type="checkbox"
    checked={coordinatorAutoRefresh}
    onChange={(event) =>
      handleCoordinatorAutoRefreshChange(event.target.checked)
    }
  />
  Auto-refresh driver progress every 30 seconds
</label>

<CoordinatorSyncStatus status={coordinatorSyncStatus} />

<button
  className="secondary"
  type="button"
  onClick={() => refreshCoordinatorProgressFromSheet({ quiet: false })}
  disabled={coordinatorSyncStatus.state === 'refreshing' || googleBusy}
>
  {coordinatorSyncStatus.state === 'refreshing'
    ? 'Refreshing progress...'
    : 'Refresh Progress from Sheet'}
</button>
{setupStatus.routesDeployed && (
  <DriverRouteLinks
    activeRoutes={activeRoutes}
    assignedRoutes={assignedRoutes}
    getDriverRouteLink={getDriverRouteLink}
    copyDriverRouteLink={copyDriverRouteLink}
  />
)}
  </div>

  <button onClick={startAddStop}>
            <Plus size={16} /> Add customer
          </button>

          <button className="danger" onClick={clearLocalData}>
  Clear local data
</button>

          <button className="secondary" onClick={geocodeMissingAddresses} disabled={isGeocoding}>
            <Navigation size={16} />
            {isGeocoding ? 'Validating...' : 'Validate Addresses'}
          </button>

          <button onClick={() => setAppView('coordinator')}>Coordinator overview</button>

          <button className="secondary" onClick={() => setAppView('editRoute')}>
            Edit route order
          </button>

<button className="secondary" onClick={recalculateRoutes}>

  Recalculate routes

</button>
<button
  className={setupStatus.isSetupComplete ? 'secondary' : ''}
  onClick={markSetupComplete}
  disabled={setupStatus.isSetupComplete}
>

  {setupStatus.isSetupComplete ? 'Setup Complete ✓' : 'Mark Setup Complete'}

</button>
<button
  onClick={deployRoutesToDrivers}
  disabled={!setupStatus.isSetupComplete || googleBusy}
>

  {setupStatus.routesDeployed ? 'Redeploy Routes' : 'Deploy Routes'}

</button>
<button className="secondary" onClick={() => setAppView('driver')}>

  Driver mode

</button>

          {geocodeProgress && <p className="small">{geocodeProgress}</p>}

         <div className="route-list">
            {routes.filter((route) => !route.isReviewRoute).map((route, index) => (
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
</>
)}

      {!isDriverLinkMode && appView === 'coordinator' && (
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

{!isDriverLinkMode && appView === 'editRoute' && (
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
  activeRoutes={
    driverLinkParams && selectedRoute
      ? [selectedRoute]
      : activeRoutes
  }
  selectedRoute={selectedRoute}
    selectedRouteColor={selectedRouteColor}
    selectRoute={selectRoute}
    setupStatus={setupStatus}
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
driverSyncStatus={driverSyncStatus}
driverLinkParams={driverLinkParams}
driverLinkStatus={driverLinkStatus}
isDriverLinkMode={isDriverLinkMode}
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
      
{routes.find((route) => route.isReviewRoute)?.stops.length > 0 && (
  <section className="panel">
    <div className="panel-heading">
      <AlertTriangle />
      <h2>Needs Address Review</h2>
    </div>

    <p className="small">
      These stops are not included in route optimization until their address is confirmed.
    </p>

    <div className="stop-list">
      {routes
        .find((route) => route.isReviewRoute)
        .stops.map((stop) => (
          <article
            className="stop-card"
            key={stop.id}
            style={{ borderLeft: '6px solid #9333ea' }}
          >
            <div>
              <div
                style={{
                  background: '#9333ea',
                  color: 'white',
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '6px',
                }}
              >
                Needs Review
              </div>

              <strong>{stop.customerName}</strong>
              <p>
                <strong>Current address:</strong> {stop.address}
              </p>

              {stop.geocodeError && (
                <p className="small">
                  <strong>Issue:</strong> {stop.geocodeError}
                </p>
              )}

              {stop.geocodeSuggestions?.length > 0 ? (
                <div>
                  <p className="small">
                    <strong>Suggested matches:</strong>
                  </p>

                  {stop.geocodeSuggestions.map((suggestion, index) => (
                    <div className="review-suggestion" key={`${stop.id}-${index}`}>
                      <p className="small">{suggestion.displayName}</p>

                      <button
                        className="secondary"
                        onClick={() => acceptGeocodeSuggestion(stop.id, suggestion)}
                      >
                        Accept this match
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small">No suggested matches found.</p>
              )}
            </div>

            <div className="actions">
              <button className="secondary" onClick={() => startEditStop(stop)}>
                Edit address
              </button>
            </div>
          </article>
        ))}
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

function DriverRouteLinks({
  activeRoutes,
  assignedRoutes,
  getDriverRouteLink,
  copyDriverRouteLink,
}) {
  if (!activeRoutes.length) return null

  return (
    <div className="driver-link-list">
      <div className="section-heading">
        <h3>Driver Route Links</h3>
        <span>{activeRoutes.length} route{activeRoutes.length === 1 ? '' : 's'}</span>
      </div>

      {activeRoutes.map((route) => {
        const assignment = assignedRoutes[route.id] || {}
        const routeLink = getDriverRouteLink(route.id)

        return (
          <article className="driver-link-card" key={route.id}>
            <div>
              <strong>{route.name}</strong>
              <p className="small">
                Driver: {assignment.driverName?.trim() || 'Unassigned'}
                {assignment.navigatorName?.trim()
                  ? ` / Navigator: ${assignment.navigatorName}`
                  : ''}
              </p>
              <p className="small">{route.stops.length} stops</p>
            </div>

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => copyDriverRouteLink(route.id)}
              >
                Copy Link
              </button>
              {routeLink && (
                <a
                  className="button-link secondary"
                  href={routeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function DriverLinkStatus({ status }) {
  if (!status || status.state === 'idle') return null

  if (status.state === 'loading') {
    return <p className="sync-status saving">Loading assigned route...</p>
  }

  if (status.state === 'error') {
    return (
      <p className="sync-status error">
        Driver link failed: {status.error || 'Unable to load route link.'}
      </p>
    )
  }

  if (status.state === 'loaded') {
    return <p className="sync-status saved">Assigned route loaded.</p>
  }

  return null
}

function CoordinatorSyncStatus({ status }) {
  if (!status || status.state === 'idle') {
    return <p className="small">Driver progress refresh is ready.</p>
  }

  if (status.state === 'refreshing') {
    return <p className="sync-status saving">Refreshing driver progress...</p>
  }

  if (status.state === 'error') {
    return (
      <p className="sync-status error">
        Refresh failed: {status.error || 'Unable to refresh driver progress.'}
      </p>
    )
  }

  if (status.state === 'refreshed' && status.lastRefreshedAt) {
    return (
      <p className="sync-status saved">
        Driver progress refreshed {new Date(status.lastRefreshedAt).toLocaleTimeString()}
      </p>
    )
  }

  return null
}

function DriverSyncStatus({ status }) {
  if (!status || status.state === 'idle') return null

  if (status.state === 'saving') {
    return <p className="sync-status saving">Saving progress...</p>
  }

  if (status.state === 'error') {
    return (
      <p className="sync-status error">
        Save failed: {status.error || 'Unable to sync driver progress.'}
      </p>
    )
  }

  if (status.state === 'saved' && status.lastSavedAt) {
    return (
      <p className="sync-status saved">
        Progress saved {new Date(status.lastSavedAt).toLocaleTimeString()}
      </p>
    )
  }

  return null
}

function DriverRouteView({
  routes,
  activeRoutes,
  selectedRoute,
  selectedRouteColor,
  selectRoute,
  setupStatus,
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
driverSyncStatus,
driverLinkParams,
driverLinkStatus,
isDriverLinkMode,
}) {
  const selectedAssignment = assignment || { driverName: '', navigatorName: '' }
  const routeIsAssigned = Boolean(selectedAssignment.driverName?.trim())
  const routeIsDeployed = Boolean(setupStatus?.routesDeployed)

  return (
    <section className="driver-view">
      {driverMode === 'overview' ? (
        <>
          <<div className={isDriverLinkMode ? 'driver-only-header' : ''}>
  <p className="eyebrow">
    {isDriverLinkMode ? 'Scout Flag Route' : 'Driver Route Overview'}
  </p>
  <h2>{selectedRoute?.name || 'No route selected'}</h2>
  <p className="small">
    Drivers should use a navigator/passenger to operate the app while the vehicle is moving.
  </p>
</div>

{driverLinkParams && <DriverLinkStatus status={driverLinkStatus} />}

{driverLinkParams && <DriverLinkStatus status={driverLinkStatus} />}

         {!routeIsDeployed && (
  <div className="driver-warning">
    <strong>Routes have not been deployed yet.</strong>
    <span>
      This driver view is available for testing, but the coordinator should deploy routes before field use.
    </span>
  </div>
)}

<DriverSyncStatus status={driverSyncStatus} />

          {!isDriverLinkMode && (
  <div className="driver-route-picker">
    <div className="section-heading">
      <h3>Choose Route</h3>
      <span>
        {activeRoutes.length} active route{activeRoutes.length === 1 ? '' : 's'}
      </span>
    </div>

    <div className="driver-route-grid">
      {activeRoutes.map((route, index) => {
        const routeAssignment = assignedRoutes[route.id] || {}
        const postedCount = route.stops.filter((stop) => stop.posted).length
        const pickedUpCount = route.stops.filter((stop) => stop.pickedUp).length
        const issueCount = route.stops.filter((stop) => stop.comment).length
        const isSelected = route.id === selectedRoute?.id
        const routeColor = ROUTE_COLORS[index % ROUTE_COLORS.length]

        return (
          <button
            className={`driver-route-card ${isSelected ? 'selected' : ''}`}
            key={route.id}
            type="button"
            onClick={() => selectRoute(route.id)}
            style={{ borderLeftColor: routeColor }}
          >
            <strong>{route.name}</strong>
            <span>{route.stops.length} stops</span>
            <span>
              Driver: {routeAssignment.driverName?.trim() || 'Unassigned'}
            </span>
            {routeAssignment.navigatorName?.trim() && (
              <span>Navigator: {routeAssignment.navigatorName}</span>
            )}
            <span>
              Posted {postedCount}/{route.stops.length} · Pickup {pickedUpCount}/
              {route.stops.length}
            </span>
            {issueCount > 0 && <span>Issues: {issueCount}</span>}
          </button>
        )
      })}
    </div>
  </div>
)}

          <div className="grid stats">
            <Stat label="Total Stops" value={selectedRoute?.stops.length || 0} icon={<MapPinned />} />
            <Stat label="Posted" value={postedCountForRoute} icon={<CheckCircle2 />} />
            <Stat label="Picked Up" value={pickedUpCountForRoute} icon={<Flag />} />
            <Stat label="Issues" value={issueCountForRoute} icon={<AlertTriangle />} />
          </div>

          <label className="checkbox-row" style={{ marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={autoAdvanceStops}
              onChange={(event) => setAutoAdvanceStops(event.target.checked)}
            />
            Auto advance to next stop after completion
          </label>

          {isDriverLinkMode ? (
  <div className="readonly-assignment-card">
    <span className="small">Assigned route team</span>
    <strong>{selectedAssignment.driverName || 'Unassigned driver'}</strong>
    {selectedAssignment.navigatorName ? (
      <span>Navigator: {selectedAssignment.navigatorName}</span>
    ) : (
      <span className="small">No navigator assigned</span>
    )}
  </div>
) : (
  <>
    <div className="form-grid" style={{ marginTop: '1rem' }}>
      <TextField
        label="Driver name"
        value={selectedAssignment.driverName || ''}
        onChange={(value) => updateAssignment('driverName', value)}
      />
      <TextField
        label="Navigator name"
        value={selectedAssignment.navigatorName || ''}
        onChange={(value) => updateAssignment('navigatorName', value)}
      />
    </div>

    {routeIsAssigned ? (
      <p className="small">
        Assigned to: <strong>{selectedAssignment.driverName}</strong>
        {selectedAssignment.navigatorName ? ` / ${selectedAssignment.navigatorName}` : ''}
      </p>
    ) : (
      <p className="small warning-text">
        This route does not have a driver assigned yet.
      </p>
    )}
  </>
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
<DriverSyncStatus status={driverSyncStatus} />

            <p className="small">
              Stop {activeStopIndex + 1} of {selectedRoute?.stops.length}
            </p>

            {routeIsAssigned && (
              <p className="small">
                Driver: <strong>{selectedAssignment.driverName}</strong>
                {selectedAssignment.navigatorName ? ` / Navigator: ${selectedAssignment.navigatorName}` : ''}
              </p>
            )}

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

function getDriverLinkParamsFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)

    if (params.get('mode') !== 'driver') return null

    const sheetId = params.get('sheet')
    const routeId = params.get('route')

    if (!sheetId || !routeId) return null

    return {
      sheetId,
      routeId,
    }
  } catch {
    return null
  }
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
