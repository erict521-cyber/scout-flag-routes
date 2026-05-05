export function buildBalancedRoutes(stops, options) {
  const routeCount = getRouteCount(stops.length, options)
  const sortedStops = [...stops].sort(compareByGeoThenName)
  const routes = Array.from({ length: routeCount }, (_, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    assignedDriver: '',
    assignedNavigator: '',
    stops: [],
  }))

  sortedStops.forEach((stop, index) => {
    routes[index % routeCount].stops.push(stop)
  })

  return routes
}

function getRouteCount(stopCount, options) {
  const available = Math.max(1, Number(options.availableDrivers) || 1)
  const maxRoutes = Math.max(1, Number(options.maxRoutes) || available)
  const maxStops = Math.max(1, Number(options.maxStopsPerRoute) || stopCount || 1)

  const neededByMaxStops = Math.ceil(stopCount / maxStops)
  return Math.max(1, Math.min(available, maxRoutes, Math.max(neededByMaxStops, available)))
}

function compareByGeoThenName(a, b) {
  const aHasGeo = Number.isFinite(a.lat) && Number.isFinite(a.lng)
  const bHasGeo = Number.isFinite(b.lat) && Number.isFinite(b.lng)

  if (aHasGeo && bHasGeo) {
    if (a.lat !== b.lat) return a.lat - b.lat
    if (a.lng !== b.lng) return a.lng - b.lng
  }

  return String(a.customerName).localeCompare(String(b.customerName))
}
