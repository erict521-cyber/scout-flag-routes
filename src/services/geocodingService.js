const APPS_SCRIPT_GEOCODER_URL = import.meta.env.VITE_APPS_SCRIPT_GEOCODER_URL
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address) {
  const suggestions = await geocodeAddressSuggestions(address, 1)
  return suggestions[0] || null
}

export async function geocodeAddressSuggestions(address, limit = 5) {
  if (!address?.trim()) return []

  if (APPS_SCRIPT_GEOCODER_URL) {
    const googleSuggestions = await safelyRunGeocoder(
      () => geocodeWithAppsScript(address, limit),
      'Apps Script Google Geocoder',
    )

    return dedupeSuggestions(googleSuggestions).slice(0, limit)
  }

  const nominatimSuggestions = await safelyRunGeocoder(
    () => geocodeWithNominatim(address, limit),
    'Nominatim development fallback',
  )

  return dedupeSuggestions(nominatimSuggestions).slice(0, limit)
}

async function geocodeWithAppsScript(address, limit) {
  const url = new URL(APPS_SCRIPT_GEOCODER_URL)

  url.searchParams.set('address', address)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Apps Script geocoder failed: ${response.status} ${text.slice(0, 120)}`)
  }

  const data = JSON.parse(text)

  return (data.suggestions || [])
    .map((suggestion) => ({
      lat: Number(suggestion.lat),
      lng: Number(suggestion.lng),
      displayName: suggestion.displayName || suggestion.formattedAddress || '',
      formattedAddress: suggestion.formattedAddress || suggestion.displayName || '',
      provider: suggestion.provider || 'Google Apps Script Maps Geocoder',
      placeId: suggestion.placeId || '',
      types: suggestion.types || [],
    }))
    .filter((suggestion) => Number.isFinite(suggestion.lat) && Number.isFinite(suggestion.lng))
}

async function geocodeWithNominatim(address, limit) {
  const url = new URL(NOMINATIM_URL)

  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('countrycodes', 'us')
  url.searchParams.set('q', address)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status} ${text.slice(0, 120)}`)
  }

  const results = JSON.parse(text)

  if (!Array.isArray(results)) return []

  return results
    .map((result) => ({
      lat: Number(result.lat),
      lng: Number(result.lon),
      displayName: result.display_name,
      formattedAddress: result.display_name,
      provider: 'OpenStreetMap Nominatim',
      importance: result.importance ?? null,
      type: result.type || '',
      category: result.category || '',
    }))
    .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng))
}

async function safelyRunGeocoder(geocoderFn, providerName) {
  try {
    return await geocoderFn()
  } catch (error) {
    console.warn(`${providerName} failed:`, error)
    return []
  }
}

function dedupeSuggestions(suggestions) {
  const seen = new Set()

  return suggestions.filter((suggestion) => {
    const key = `${roundCoordinate(suggestion.lat)}|${roundCoordinate(
      suggestion.lng,
    )}|${normalizeSpaces(suggestion.displayName).toLowerCase()}`

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function roundCoordinate(value) {
  return Number(value).toFixed(6)
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
