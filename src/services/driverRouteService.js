const DRIVER_ROUTE_ENDPOINT_URL = import.meta.env.VITE_APPS_SCRIPT_DRIVER_ROUTE_URL

function hasDriverRouteEndpoint() {
  return Boolean(DRIVER_ROUTE_ENDPOINT_URL)
}

async function parseJsonResponse(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(text || 'Driver route endpoint returned a non-JSON response.')
  }
}

export async function loadDriverRouteByToken(token) {
  if (!hasDriverRouteEndpoint()) {
    throw new Error('Missing VITE_APPS_SCRIPT_DRIVER_ROUTE_URL.')
  }

  const url = new URL(DRIVER_ROUTE_ENDPOINT_URL)
  url.searchParams.set('action', 'getRoute')
  url.searchParams.set('token', token)

  const response = await fetch(url.toString())
  const payload = await parseJsonResponse(response)

  if (!payload.ok) {
    throw new Error(payload.error || 'Failed to load driver route.')
  }

  return payload
}

export async function updateDriverStopProgressByToken({
  token,
  stopId,
  posted,
  pickedUp,
  comment,
  postedAt,
  pickedUpAt,
}) {
  if (!hasDriverRouteEndpoint()) {
    throw new Error('Missing VITE_APPS_SCRIPT_DRIVER_ROUTE_URL.')
  }

  const response = await fetch(DRIVER_ROUTE_ENDPOINT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'updateStopProgress',
      token,
      stopId,
      posted,
      pickedUp,
      comment,
      postedAt,
      pickedUpAt,
    }),
  })

  const payload = await parseJsonResponse(response)

  if (!payload.ok) {
    throw new Error(payload.error || 'Failed to sync driver progress.')
  }

  return payload
}
