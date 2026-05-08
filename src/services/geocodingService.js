const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address) {
  const suggestions = await geocodeAddressSuggestions(address, 1)
  return suggestions[0] || null
}

export async function geocodeAddressSuggestions(address, limit = 5) {
  const url = new URL(NOMINATIM_URL)

  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
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

  return results.map((result) => ({
    lat: Number(result.lat),
    lng: Number(result.lon),
    displayName: result.display_name,
    provider: 'OpenStreetMap Nominatim',
    importance: result.importance ?? null,
    type: result.type || '',
    category: result.category || '',
  }))
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}