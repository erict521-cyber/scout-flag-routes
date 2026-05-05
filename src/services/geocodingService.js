const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address) {
  const url = new URL(NOMINATIM_URL)

  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('q', address)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`)
  }

  const results = await response.json()
  const first = results[0]

  if (!first) {
    return null
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: first.display_name,
    provider: 'OpenStreetMap Nominatim',
  }
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}