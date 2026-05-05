import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2']

export default function RouteMap({ routes }) {
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

    setTimeout(() => {
      map.invalidateSize()
    }, 500)
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = layerRef.current

    if (!map || !layer) return

    layer.clearLayers()

    const bounds = []

    routes.forEach((route, routeIndex) => {
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]

      route.stops.forEach((stop, stopIndex) => {
        const lat = Number(stop.lat)
        const lng = Number(stop.lng)

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        const point = [lat, lng]
        bounds.push(point)

        L.circleMarker(point, {
          radius: 8,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindPopup(`
            <strong>${route.name}</strong><br/>
            Stop ${stopIndex + 1}<br/>
            ${escapeHtml(stop.customerName)}<br/>
            ${escapeHtml(stop.address)}
          `)
          .addTo(layer)
      })
    })

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }

    setTimeout(() => {
      map.invalidateSize()
    }, 500)
  }, [routes])

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '420px',
        borderRadius: '1rem',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        marginTop: '1rem',
      }}
    />
  )
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}