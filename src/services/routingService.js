export function buildBalancedRoutes(stops, options) {
  const routeCount = getRouteCount(stops.length, options)

  const geocodedStops = stops.filter(hasGeo)
  const ungeocodedStops = stops.filter((stop) => !hasGeo(stop))

  if (geocodedStops.length === 0) {
    return buildFallbackRoutes(stops, routeCount)
  }

  const clusteredRoutes = buildClusteredRoutes(geocodedStops, routeCount, options)

  // Put ungeocoded stops into the smallest routes so they still appear.
  ungeocodedStops.forEach((stop) => {
    const smallestRoute = clusteredRoutes.reduce((smallest, route) =>
      route.stops.length < smallest.stops.length ? route : smallest,
    )
    smallestRoute.stops.push(stop)
  })

  return clusteredRoutes.map((route, index) => ({
    ...route,
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    stops: orderStopsByNearestNeighbor(route.stops),
  }))
}

function buildClusteredRoutes(stops, routeCount, options) {
  const centroids = initializeCentroids(stops, routeCount)
  let assignments = assignStopsToCentroids(stops, centroids)

  for (let i = 0; i < 12; i += 1) {
    const newCentroids = recalculateCentroids(assignments, centroids)
    assignments = assignStopsToCentroids(stops, newCentroids)
  }

  let routes = assignments.map((clusterStops, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    assignedDriver: '',
    assignedNavigator: '',
    stops: clusterStops,
  }))

  routes = rebalanceRoutes(routes, options)

  return routes
}

function initializeCentroids(stops, routeCount) {
  const sorted = [...stops].sort((a, b) => {
    if (a.lng !== b.lng) return a.lng - b.lng
    return a.lat - b.lat
  })

  return Array.from({ length: routeCount }, (_, index) => {
    const position = Math.floor((index / routeCount) * sorted.length)
    const stop = sorted[Math.min(position, sorted.length - 1)]

    return {
      lat: stop.lat,
      lng: stop.lng,
    }
  })
}

function assignStopsToCentroids(stops, centroids) {
  const assignments = centroids.map(() => [])

  stops.forEach((stop) => {
    let bestIndex = 0
    let bestDistance = Infinity

    centroids.forEach((centroid, index) => {
      const distance = distanceSquared(stop, centroid)

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    assignments[bestIndex].push(stop)
  })

  return assignments
}

function recalculateCentroids(assignments, oldCentroids) {
  return assignments.map((clusterStops, index) => {
    if (clusterStops.length === 0) return oldCentroids[index]

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

function rebalanceRoutes(routes, options) {
  const maxStops = Number(options.maxStopsPerRoute) || Infinity
  const minStops = Number(options.minStopsPerRoute) || 0

  let changed = true

  while (changed) {
    changed = false

    const largest = [...routes].sort((a, b) => b.stops.length - a.stops.length)[0]
    const smallest = [...routes].sort((a, b) => a.stops.length - b.stops.length)[0]

    if (!largest || !smallest || largest === smallest) break

    const largestTooLarge = largest.stops.length > maxStops
    const smallestTooSmall = smallest.stops.length < minStops
    const gapTooLarge = largest.stops.length - smallest.stops.length > 1

    if ((largestTooLarge || smallestTooSmall || gapTooLarge) && largest.stops.length > 1) {
      const stopToMove = findBestStopToMove(largest.stops, smallest.stops)
      largest.stops = largest.stops.filter((stop) => stop.id !== stopToMove.id)
      smallest.stops.push(stopToMove)
      changed = true
    }
  }

  return routes
}

function findBestStopToMove(sourceStops, targetStops) {
  if (targetStops.length === 0) {
    return sourceStops[sourceStops.length - 1]
  }

  const targetCenter = getCenter(targetStops)

  return sourceStops
    .map((stop) => ({
      stop,
      distance: distanceSquared(stop, targetCenter),
    }))
    .sort((a, b) => a.distance - b.distance)[0].stop
}

function orderStopsByNearestNeighbor(stops) {
  if (stops.length <= 2) return stops

  const remaining = [...stops]
  const ordered = [remaining.shift()]

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1]

    const nearestIndex = remaining
      .map((stop, index) => ({
        index,
        distance: hasGeo(current) && hasGeo(stop) ? distanceSquared(current, stop) : Infinity,
      }))
      .sort((a, b) => a.distance - b.distance)[0].index

    ordered.push(remaining.splice(nearestIndex, 1)[0])
  }

  return ordered
}

function buildFallbackRoutes(stops, routeCount) {
  const routes = Array.from({ length: routeCount }, (_, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    assignedDriver: '',
    assignedNavigator: '',
    stops: [],
  }))

  stops.forEach((stop, index) => {
    routes[index % routeCount].stops.push(stop)
  })

  return routes
}

function getRouteCount(stopCount, options) {
  const available = Math.max(1, Number(options.availableDrivers) || 1)
  const maxRoutes = Math.max(1, Number(options.maxRoutes) || available)
  const maxStops = Math.max(1, Number(options.maxStopsPerRoute) || stopCount || 1)

  const neededByMaxStops = Math.ceil(stopCount / maxStops)

  return Math.max(1, Math.min(Math.max(available, neededByMaxStops), maxRoutes, stopCount || 1))
}

function getCenter(stops) {
  const geoStops = stops.filter(hasGeo)

  if (geoStops.length === 0) return { lat: 0, lng: 0 }

  const total = geoStops.reduce(
    (sum, stop) => ({
      lat: sum.lat + stop.lat,
      lng: sum.lng + stop.lng,
    }),
    { lat: 0, lng: 0 },
  )

  return {
    lat: total.lat / geoStops.length,
    lng: total.lng / geoStops.length,
  }
}

function distanceSquared(a, b) {
  const latDiff = a.lat - b.lat
  const lngDiff = a.lng - b.lng
  return latDiff * latDiff + lngDiff * lngDiff
}

function hasGeo(stop) {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
}