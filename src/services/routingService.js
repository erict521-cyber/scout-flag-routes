export function buildBalancedRoutes(stops, options) {
  try {
    if (!Array.isArray(stops) || stops.length === 0) {
      return buildEmptyRoutes(1)
    }

    const routeCount = getRouteCount(stops.length, options)

    if (hasUsableManualRouteAssignments(stops)) {
      return buildRoutesFromManualAssignments(stops, routeCount)
    }

    return buildGeographicBalancedRoutes(stops, routeCount)
  } catch (error) {
    console.error('Route building failed, using fallback routing:', error)
    return buildFallbackRoutes(stops, getRouteCount(stops?.length || 0, options))
  }
}

function buildGeographicBalancedRoutes(stops, routeCount) {
  const routes = buildEmptyRoutes(routeCount)

  const geocodedStops = stops.filter(hasGeo)
  const ungeocodedStops = stops.filter((stop) => !hasGeo(stop))

  if (geocodedStops.length === 0) {
    return buildFallbackRoutes(stops, routeCount)
  }

  const sortedStops = [...geocodedStops].sort(compareByGeoThenName)

  sortedStops.forEach((stop, index) => {
    const routeIndex = Math.min(
      routeCount - 1,
      Math.floor((index * routeCount) / sortedStops.length),
    )

    routes[routeIndex].stops.push(stop)
  })

  ungeocodedStops.forEach((stop) => {
    getSmallestRoute(routes).stops.push(stop)
  })

  return routes.map((route) => ({
    ...route,
    stops: orderStopsSafely(route.stops, route.id),
  }))
}

function buildRoutesFromManualAssignments(stops, routeCount) {
  const routes = buildEmptyRoutes(routeCount)

  stops.forEach((stop) => {
    const routeIndex = getRouteIndexFromRouteId(stop.manualRouteId)

    if (routeIndex >= 0 && routeIndex < routes.length) {
      routes[routeIndex].stops.push(stop)
    } else {
      getSmallestRoute(routes).stops.push(stop)
    }
  })

  return routes.map((route) => ({
    ...route,
    stops: orderStopsSafely(route.stops, route.id),
  }))
}

function hasUsableManualRouteAssignments(stops) {
  const assignedRouteIds = new Set(
    stops
      .map((stop) => stop.manualRouteId)
      .filter((routeId) => typeof routeId === 'string' && routeId.startsWith('route-')),
  )

  // Important:
  // If every stop is accidentally assigned to only route-1, ignore it and regenerate routes.
  // That prevents the "Route 1 has everything / other routes empty" failure.
  return assignedRouteIds.size > 1
}

function orderStopsSafely(stops, routeId) {
  if (!Array.isArray(stops) || stops.length <= 1) return stops || []

  const manuallyOrderedStops = stops.filter(
    (stop) =>
      stop.manualRouteId === routeId &&
      Number.isFinite(Number(stop.manualOrder)),
  )

  if (manuallyOrderedStops.length === stops.length) {
    return [...stops].sort((a, b) => Number(a.manualOrder) - Number(b.manualOrder))
  }

  const geocoded = stops.filter(hasGeo)
  const ungeocoded = stops.filter((stop) => !hasGeo(stop))

  if (geocoded.length <= 2) return [...geocoded, ...ungeocoded]

  const remaining = [...geocoded]
  const ordered = [remaining.shift()]

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1]

    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    remaining.forEach((stop, index) => {
      const distance = distanceSquared(current, stop)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    ordered.push(remaining.splice(nearestIndex, 1)[0])
  }

  return [...ordered, ...ungeocoded]
}

function buildFallbackRoutes(stops, routeCount) {
  const routes = buildEmptyRoutes(routeCount)
  const sortedStops = [...(stops || [])].sort(compareByGeoThenName)

  sortedStops.forEach((stop, index) => {
    routes[index % routeCount].stops.push(stop)
  })

  return routes
}

function buildEmptyRoutes(routeCount) {
  return Array.from({ length: Math.max(1, routeCount || 1) }, (_, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    assignedDriver: '',
    assignedNavigator: '',
    stops: [],
  }))
}

function getRouteCount(stopCount, options) {
  const available = Math.max(1, Number(options?.availableDrivers) || 1)
  const maxRoutes = Math.max(1, Number(options?.maxRoutes) || available)

  return Math.max(1, Math.min(available, maxRoutes, stopCount || 1))
}

function getSmallestRoute(routes) {
  return routes.reduce((smallest, route) =>
    route.stops.length < smallest.stops.length ? route : smallest,
  )
}

function getRouteIndexFromRouteId(routeId) {
  const match = String(routeId || '').match(/^route-(\d+)$/)
  if (!match) return -1

  return Number(match[1]) - 1
}

function compareByGeoThenName(a, b) {
  const aHasGeo = hasGeo(a)
  const bHasGeo = hasGeo(b)

  if (aHasGeo && bHasGeo) {
    if (a.lng !== b.lng) return a.lng - b.lng
    if (a.lat !== b.lat) return a.lat - b.lat
  }

  if (aHasGeo && !bHasGeo) return -1
  if (!aHasGeo && bHasGeo) return 1

  return String(a.customerName || '').localeCompare(String(b.customerName || ''))
}

function distanceSquared(a, b) {
  const latDiff = Number(a.lat) - Number(b.lat)
  const lngDiff = Number(a.lng) - Number(b.lng)

  return latDiff * latDiff + lngDiff * lngDiff
}

function hasGeo(stop) {
  return Number.isFinite(Number(stop?.lat)) && Number.isFinite(Number(stop?.lng))
}