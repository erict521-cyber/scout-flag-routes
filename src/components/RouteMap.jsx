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

  const map = L.map(mapRef.current).setView([29.7604, -95.3698], 11)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  mapInstanceRef.current = map
  layerRef.current = L.layerGroup().addTo(map)

  requestAnimationFrame(() => {
    map.invalidateSize()
  })
}, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = layerRef.current

    if (!map || !layer) return

    layer.clearLayers()

    const bounds = []

    routes.forEach((route, routeIndex) => {
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]

      route.stops
        .filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng)))
        .forEach((stop, stopIndex) => {
          const latLng = [Number(stop.lat), Number(stop.lng)]
          bounds.push(latLng)

          const marker = L.circleMarker(latLng, {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
          })

          marker.bindPopup(`
            <strong>${route.name}</strong><br/>
            Stop ${stopIndex + 1}<br/>
            ${escapeHtml(stop.customerName || '')}<br/>
            ${escapeHtml(stop.address || '')}
          `)

          marker.addTo(layer)
        })
    })

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [routes])

  return <div className="route-map" ref={mapRef} />
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}