export function buildBalancedRoutes(stops, options = {}) {
  try {
    if (!Array.isArray(stops) || stops.length === 0) {
      return buildEmptyRoutes(1)
    }

    const routeCount = getRouteCount(stops.length, options)

    if (hasUsableManualRouteAssignments(stops)) {
      return buildRoutesFromManualAssignments(stops, routeCount)
    }

    if (options.routingStyle === 'balanced') {
      return buildBalancedGeographicBands(stops, routeCount)
    }

    return buildClusteredGeographicRoutes(stops, routeCount, options)
  } catch (error) {
    console.error('Route building failed, using fallback routing:', error)
    return buildFallbackRoutes(stops, getRouteCount(stops?.length || 0, options))
  }
}

function buildClusteredGeographicRoutes(stops, routeCount, options) {
  const routes = buildEmptyRoutes(routeCount)

  const geocodedStops = stops.filter(hasGeo)
  const ungeocodedStops = stops.filter((stop) => !hasGeo(stop))

  if (geocodedStops.length === 0 || geocodedStops.length < routeCount) {
    return buildFallbackRoutes(stops, routeCount)
  }

  let clusters = seedClustersBySpread(geocodedStops, routeCount)

  for (let i = 0; i < 10; i += 1) {
    const centroids = calculateCentroids(clusters)
    clusters = assignStopsToCentroids(geocodedStops, centroids)
    clusters = fillEmptyClusters(clusters)
  }

  clusters = gentlyRebalanceClusters(clusters, options)

  clusters.forEach((clusterStops, index) => {
    routes[index].stops = clusterStops
  })

  ungeocodedStops.forEach((stop) => {
    getSmallestRoute(routes).stops.push(stop)
  })

  return routes.map((route) => ({
    ...route,
    stops: orderStopsSafely(route.stops, route.id),
  }))
}

function seedClustersBySpread(stops, routeCount) {
  const sortedByLng = [...stops].sort((a, b) => Number(a.lng) - Number(b.lng))
  const sortedByLat = [...stops].sort((a, b) => Number(a.lat) - Number(b.lat))

  const lngSpread =
    Number(sortedByLng[sortedByLng.length - 1].lng) - Number(sortedByLng[0].lng)
  const latSpread =
    Number(sortedByLat[sortedByLat.length - 1].lat) - Number(sortedByLat[0].lat)

  const sorted = lngSpread >= latSpread ? sortedByLng : sortedByLat
  const clusters = Array.from({ length: routeCount }, () => [])

  sorted.forEach((stop, index) => {
    const clusterIndex = Math.min(
      routeCount - 1,
      Math.floor((index * routeCount) / sorted.length),
    )

    clusters[clusterIndex].push(stop)
  })

  return clusters
}

function calculateCentroids(clusters) {
  return clusters.map((clusterStops) => {
    if (!clusterStops.length) {
      return {
        lat: 0,
        lng: 0,
      }
    }

    const total = clusterStops.reduce(
      (sum, stop) => ({
        lat: sum.lat + Number(stop.lat),
        lng: sum.lng + Number(stop.lng),
      }),
      { lat: 0, lng: 0 },
    )

    return {
      lat: total.lat / clusterStops.length,
      lng: total.lng / clusterStops.length,
    }
  })
}

function assignStopsToCentroids(stops, centroids) {
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

function fillEmptyClusters(clusters) {
  const updated = clusters.map((cluster) => [...cluster])

  updated.forEach((cluster, emptyIndex) => {
    if (cluster.length > 0) return

    const largest = updated
      .map((candidate, index) => ({
        index,
        size: candidate.length,
      }))
      .sort((a, b) => b.size - a.size)[0]

    if (!largest || updated[largest.index].length <= 1) return

    const movedStop = updated[largest.index].pop()
    updated[emptyIndex].push(movedStop)
  })

  return updated
}

function gentlyRebalanceClusters(clusters, options) {
  const updated = clusters.map((cluster) => [...cluster])
  const totalStops = updated.reduce((sum, cluster) => sum + cluster.length, 0)

  if (totalStops === 0) return updated

  const ideal = totalStops / updated.length

  const configuredMax = Number(options?.maxStopsPerRoute)
  const configuredMin = Number(options?.minStopsPerRoute)

  const softMax = Number.isFinite(configuredMax)
    ? configuredMax
    : Math.ceil(ideal * 1.45)

  const softMin = Number.isFinite(configuredMin)
    ? Math.min(configuredMin, Math.floor(ideal * 0.75))
    : Math.floor(ideal * 0.55)

  let changed = true
  let guard = 0

  while (changed && guard < 100) {
    guard += 1
    changed = false

    const largestIndex = getLargestClusterIndex(updated)
    const smallestIndex = getSmallestClusterIndex(updated)

    if (largestIndex === smallestIndex) break

    const largest = updated[largestIndex]
    const smallest = updated[smallestIndex]

    const largestTooLarge = largest.length > softMax
    const smallestTooSmall = smallest.length < softMin

    if (!largestTooLarge && !smallestTooSmall) break
    if (largest.length <= 1) break

    const targetCentroid = getClusterCentroid(smallest)
    const moveIndex = findBestStopToMove(largest, targetCentroid)

    const [movedStop] = largest.splice(moveIndex, 1)
    smallest.push(movedStop)

    changed = true
  }

  return updated
}

function findBestStopToMove(sourceCluster, targetCentroid) {
  if (!targetCentroid || !Number.isFinite(targetCentroid.lat) || !Number.isFinite(targetCentroid.lng)) {
    return sourceCluster.length - 1
  }

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  sourceCluster.forEach((stop, index) => {
    const distance = distanceSquared(stop, targetCentroid)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
}

function getClusterCentroid(clusterStops) {
  if (!clusterStops.length) return null

  const total = clusterStops.reduce(
    (sum, stop) => ({
      lat: sum.lat + Number(stop.lat),
      lng: sum.lng + Number(stop.lng),
    }),
    { lat: 0, lng: 0 },
  )

  return {
    lat: total.lat / clusterStops.length,
    lng: total.lng / clusterStops.length,
  }
}

function getLargestClusterIndex(clusters) {
  return clusters
    .map((cluster, index) => ({
      index,
      size: cluster.length,
    }))
    .sort((a, b) => b.size - a.size)[0].index
}

function getSmallestClusterIndex(clusters) {
  return clusters
    .map((cluster, index) => ({
      index,
      size: cluster.length,
    }))
    .sort((a, b) => a.size - b.size)[0].index
}

function buildBalancedGeographicBands(stops, routeCount) {
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

  return assignedRouteIds.size > 1
}

function orderStopsSafely(stops, routeId) {
  if (!Array.isArray(stops) || stops.length <= 1) return stops || []

  const manuallyOrderedStops = stops.filter(
    (stop) => stop.manualRouteId === routeId && Number.isFinite(Number(stop.manualOrder)),
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
    if (a.lng !== b.lng) return Number(a.lng) - Number(b.lng)
    if (a.lat !== b.lat) return Number(a.lat) - Number(b.lat)
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
  if (stop?.lat === null || stop?.lat === undefined || stop?.lat === '') return false
  if (stop?.lng === null || stop?.lng === undefined || stop?.lng === '') return false

  return Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))
}