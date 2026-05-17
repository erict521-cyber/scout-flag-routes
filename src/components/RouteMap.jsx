import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2']
const MAX_MAP_RADIUS_MILES = 80

export default function RouteMap({
  routes,
  fitPadding = [30, 30],
  maxFitZoom = 18,
  className = 'route-map',
}) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current).setView([29.5, -95.1], 11)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapInstanceRef.current = map
    layerRef.current = L.layerGroup().addTo(map)

    setTimeout(() => map.invalidateSize({ pan: false }), 0)
    setTimeout(() => map.invalidateSize({ pan: false }), 300)
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = layerRef.current

    if (!map || !layer) return

    layer.clearLayers()

    const safeRoutes = Array.isArray(routes) ? routes : []
    const allTrustedIds = getTrustedStopIds(safeRoutes)
    const bounds = []

    safeRoutes.forEach((route, routeIndex) => {
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]
      const routePoints = (route.stops || [])
        .map((stop) => ({
          stop,
          lat: Number(stop.lat),
          lng: Number(stop.lng),
        }))
        .filter((point) => allTrustedIds.has(point.stop.id))

      if (routePoints.length > 1) {
        L.polyline(
          routePoints.map((point) => [point.lat, point.lng]),
          {
            color,
            weight: 4,
            opacity: 0.65,
          },
        ).addTo(layer)
      }

      routePoints.forEach((point, stopIndex) => {
        const latLng = [point.lat, point.lng]
        bounds.push(latLng)

        L.marker(latLng, {
          icon: L.divIcon({
            className: 'numbered-route-pin',
            html: `<span style="background:${color}">${stopIndex + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .bindPopup(`
            ${escapeHtml(route.name)}<br />
            Stop ${stopIndex + 1}<br />
            ${escapeHtml(point.stop.customerName)}<br />
            ${escapeHtml(point.stop.address)}
          `)
          .addTo(layer)
      })
    })

    function refitMap() {
      map.invalidateSize({ pan: false })

      if (bounds.length > 0) {
        map.fitBounds(bounds, {
          padding: fitPadding,
          maxZoom: maxFitZoom,
        })
      }
    }

    refitMap()
    setTimeout(refitMap, 150)
    setTimeout(refitMap, 500)
  }, [routes, fitPadding, maxFitZoom])

  return <div className={className} ref={mapRef} />
}

function getTrustedStopIds(routes) {
  const points = routes.flatMap((route) => route.stops || []).filter(hasValidCoordinateValue)

  if (points.length <= 2) return new Set(points.map((stop) => stop.id))

  const medianLat = median(points.map((stop) => Number(stop.lat)))
  const medianLng = median(points.map((stop) => Number(stop.lng)))

  return new Set(
    points
      .filter((stop) => {
        const distance = distanceMiles(
          Number(stop.lat),
          Number(stop.lng),
          medianLat,
          medianLng,
        )

        return distance <= MAX_MAP_RADIUS_MILES
      })
      .map((stop) => stop.id),
  )
}

function hasValidCoordinateValue(stop) {
  if (stop?.lat === null || stop?.lat === undefined || stop?.lat === '') return false
  if (stop?.lng === null || stop?.lng === undefined || stop?.lng === '') return false

  const lat = Number(stop.lat)
  const lng = Number(stop.lng)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  if (lat < 18 || lat > 72) return false
  if (lng < -180 || lng > -50) return false

  return true
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const earthRadiusMiles = 3958.8
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
