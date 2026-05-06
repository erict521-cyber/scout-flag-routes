export function buildBalancedRoutes(stops, options) {
  try {
    const routeCount = getRouteCount(stops.length, options)

    if (!Array.isArray(stops) || stops.length === 0) {
      return buildEmptyRoutes(1)
    }

    const geocodedStops = stops.filter(hasGeo)
    const ungeocodedStops = stops.filter((stop) => !hasGeo(stop))

    if (geocodedStops.length < routeCount) {
      return buildFallbackRoutes(stops, routeCount)
    }

    const routes = buildClusteredRoutes(geocodedStops, routeCount)

    ungeocodedStops.forEach((stop) => {
      getSmallestRoute(routes).stops.push(stop)
    })

    return routes.map((route, index) => ({
  ...route,
  id: `route-${index + 1}`,
  name: `Route ${index + 1}`,
  stops: orderStopsSafely(route.stops, `route-${index + 1}`),
}))
  } catch (error) {
    console.error('Route clustering failed, using fallback routing:', error)
    return buildFallbackRoutes(stops, getRouteCount(stops?.length || 0, options))
  }
}

function buildClusteredRoutes(stops, routeCount) {
  const centroids = initializeCentroids(stops, routeCount)
  let clusters = assignStops(stops, centroids)

  for (let i = 0; i < 8; i += 1) {
    const nextCentroids = recalculateCentroids(clusters, centroids)
    clusters = assignStops(stops, nextCentroids)
  }

  return clusters.map((clusterStops, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    assignedDriver: '',
    assignedNavigator: '',
    stops: clusterStops,
  }))
}

function initializeCentroids(stops, routeCount) {
  const sorted = [...stops].sort((a, b) => a.lng - b.lng || a.lat - b.lat)

  return Array.from({ length: routeCount }, (_, index) => {
    const position = Math.floor((index * sorted.length) / routeCount)
    const stop = sorted[Math.min(position, sorted.length - 1)]

    return {
      lat: stop.lat,
      lng: stop.lng,
    }
  })
}

function assignStops(stops, centroids) {
  const clusters = centroids.map(() => [])

  stops.forEach((stop) => {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    centroids.forEach((centroid, index) => {
      const distance = distanceSquared(stop, centroid)

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    clusters[bestIndex].push(stop)
  })

  return clusters
}

function recalculateCentroids(clusters, previousCentroids) {
  return clusters.map((clusterStops, index) => {
    if (!clusterStops.length) return previousCentroids[index]

    const total = clusterStops.reduce(
      (sum, stop) => ({
        lat: sum.lat + stop.lat,
        lng: sum.lng + stop.lng,
      }),
      { lat: 0, lng: 0 },
    )

    return {
      lat: total.lat / clusterStops.length,
      lng: total.lng / clusterStops.length,
    }
  })
}

function orderStopsSafely(stops, routeId) {
  if (!Array.isArray(stops) || stops.length <= 2) return stops || []

  const manuallyOrdered = stops.every(
    (stop) =>
      stop.manualRouteId === routeId &&
      Number.isFinite(Number(stop.manualOrder)),
  )

  if (manuallyOrdered) {
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

function compareByGeoThenName(a, b) {
  const aHasGeo = hasGeo(a)
  const bHasGeo = hasGeo(b)

  if (aHasGeo && bHasGeo) {
    if (a.lat !== b.lat) return a.lat - b.lat
    if (a.lng !== b.lng) return a.lng - b.lng
  }

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
