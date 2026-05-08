const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address) {
  const suggestions = await geocodeAddressSuggestions(address, 1)
  return suggestions[0] || null
}

export async function geocodeAddressSuggestions(address, limit = 5) {
  const queryVariants = buildAddressQueryVariants(address)
  const allSuggestions = []

  for (const query of queryVariants) {
    const suggestions = await fetchNominatimSuggestions(query, limit)

    suggestions.forEach((suggestion) => {
      const key = `${suggestion.lat}|${suggestion.lng}|${suggestion.displayName}`

      if (!allSuggestions.some((existing) => existing.key === key)) {
        allSuggestions.push({
          ...suggestion,
          key,
          searchedQuery: query,
        })
      }
    })

    if (allSuggestions.length >= limit) break

    // Be gentle with the free geocoder.
    await wait(300)
  }

  return allSuggestions.slice(0, limit).map(({ key, ...suggestion }) => suggestion)
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
    throw new Error(`Geocoding failed: ${response.status}`)
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

function buildAddressQueryVariants(address) {
  const original = normalizeSpaces(address)

  const variants = [
    original,
    original.replace(/\bTX\b/i, 'Texas'),
    original.replace(/\bUSA\b/i, ''),
    original.replace(/\bSt\b/gi, 'Street'),
    original.replace(/\bTr\b/gi, 'Trail'),
    original.replace(/\bDr\b/gi, 'Drive'),
    original.replace(/\bCt\b/gi, 'Court'),
    original.replace(/\bLn\b/gi, 'Lane'),
    original.replace(/\bLeague City TX\b/i, 'League City Texas'),
    original.replace(/\bLeague City\s+TX\s+77573\b/i, 'League City, Texas 77573'),
  ]

  return [...new Set(variants.map(normalizeSpaces).filter(Boolean))]
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}