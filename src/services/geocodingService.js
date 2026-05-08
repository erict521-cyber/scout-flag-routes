const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const CENSUS_GEOCODER_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

export async function geocodeAddress(address) {
  const suggestions = await geocodeAddressSuggestions(address, 1)
  return suggestions[0] || null
}

export async function geocodeAddressSuggestions(address, limit = 5) {
  const nominatimSuggestions = await geocodeWithNominatimVariants(address, limit)

  if (nominatimSuggestions.length >= limit) {
    return nominatimSuggestions.slice(0, limit)
  }

  const censusSuggestions = await geocodeWithCensus(address)

  return dedupeSuggestions([...nominatimSuggestions, ...censusSuggestions]).slice(0, limit)
}

async function geocodeWithNominatimVariants(address, limit) {
  const queryVariants = buildAddressQueryVariants(address)
  const allSuggestions = []

  for (const query of queryVariants) {
    const suggestions = await fetchNominatimSuggestions(query, limit)

    allSuggestions.push(
      ...suggestions.map((suggestion) => ({
        ...suggestion,
        searchedQuery: query,
      })),
    )

    if (allSuggestions.length >= limit) break

    await wait(300)
  }

  return dedupeSuggestions(allSuggestions)
}

async function fetchNominatimSuggestions(query, limit) {
  const url = new URL(NOMINATIM_URL)

  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('countrycodes', 'us')
  url.searchParams.set('q', query)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status}`)
  }

  const results = await response.json()

  return results
    .map((result) => ({
      lat: Number(result.lat),
      lng: Number(result.lon),
      displayName: result.display_name,
      provider: 'OpenStreetMap Nominatim',
      importance: result.importance ?? null,
      type: result.type || '',
      category: result.category || '',
    }))
    .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng))
}

async function geocodeWithCensus(address) {
  const url = new URL(CENSUS_GEOCODER_URL)

  url.searchParams.set('address', normalizeAddressForCensus(address))
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('format', 'json')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Census geocoding failed: ${response.status}`)
  }

  const data = await response.json()
  const matches = data?.result?.addressMatches || []

  return matches
    .map((match) => ({
      lat: Number(match.coordinates?.y),
      lng: Number(match.coordinates?.x),
      displayName: match.matchedAddress || normalizeAddressForCensus(address),
      provider: 'US Census Geocoder',
      importance: null,
      type: 'address_range',
      category: 'census',
    }))
    .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng))
}

function buildAddressQueryVariants(address) {
  const original = normalizeSpaces(address)
  const withoutUsa = normalizeSpaces(original.replace(/\bUSA\b/gi, ''))

  const variants = [
    original,
    withoutUsa,
    original.replace(/\bTX\b/gi, 'Texas'),
    withoutUsa.replace(/\bTX\b/gi, 'Texas'),
    original.replace(/\bSt\b/gi, 'Street'),
    original.replace(/\bTr\b/gi, 'Trail'),
    original.replace(/\bDr\b/gi, 'Drive'),
    original.replace(/\bCt\b/gi, 'Court'),
    original.replace(/\bLn\b/gi, 'Lane'),
    original.replace(/\bEastland\b/gi, 'Eastlands'),
    original.replace(/\bEastlands\b/gi, 'Eastland'),
    original.replace(/\bMetairie Court\b/gi, 'Metairie St'),
    original.replace(/\bMetairie Ct\b/gi, 'Metairie St'),
    original.replace(/\bLeague City TX\b/gi, 'League City Texas'),
    original.replace(/\bLeague City\s+TX\s+77573\b/gi, 'League City, Texas 77573'),
  ]

  return [...new Set(variants.map(normalizeSpaces).filter(Boolean))]
}

function normalizeAddressForCensus(address) {
  return normalizeSpaces(String(address || '').replace(/\bUSA\b/gi, ''))
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