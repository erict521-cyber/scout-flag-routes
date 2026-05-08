// Google Sheets integration is intentionally parked for a later phase.
//
// Planned responsibilities:
// 1. Authorize the coordinator with Google.
// 2. Create or connect a troop-owned Google Sheet.
// 3. Read/write customers, routes, assignments, timestamps, and comments.
// 4. Cache geocoded lat/lng values so addresses are not repeatedly geocoded.
// 5. Keep drivers login-free by using a route token or published route session model.
//
// Do not add API keys or secrets to this GitHub Pages app.
// For MVP, prefer OAuth client configuration that is safe for browser-based apps.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4'
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets'

let tokenClient = null
let gapiReady = false
let gisReady = false

export async function initializeGoogleSheets() {
  if (!CLIENT_ID || !API_KEY) {
    throw new Error(
      'Missing Google API config. Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY.',
    )
  }

  await waitForGoogleScripts()

  await new Promise((resolve, reject) => {
    window.gapi.load('client', async () => {
      try {
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        })

        gapiReady = true
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  })

  gisReady = true
}

export async function authorizeGoogleSheets() {
  if (!gapiReady || !gisReady || !tokenClient) {
    await initializeGoogleSheets()
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = async (response) => {
      if (response.error) {
        reject(response)
        return
      }

      window.gapi.client.setToken(response)
      resolve(response)
    }

    tokenClient.requestAccessToken({
      prompt: 'consent',
    })
  })
}

export async function createScoutWorkspaceSheet() {
  ensureReady()

  const response = await window.gapi.client.sheets.spreadsheets.create({
    properties: {
      title: `Scout Flag Routes Workspace ${new Date().toLocaleDateString()}`,
    },

    sheets: [
      {
        properties: {
          title: 'settings',
        },
      },
      {
        properties: {
          title: 'customers',
        },
      },
      {
        properties: {
          title: 'routes',
        },
      },
      {
        properties: {
          title: 'route_stops',
        },
      },
    ],
  })

  return response.result
}

export async function writeWorkspaceData(
  spreadsheetId,
  { stops, routes, routeOptions, assignedRoutes = {} },
) {
  ensureReady()

  const valuesByRange = [
    {
      range: 'settings!A1:B5',
      values: [
        ['key', 'value'],
        ['schema_version', '1'],
        ['saved_at', new Date().toISOString()],
        ['route_options', JSON.stringify(routeOptions)],
      ],
    },

    {
      range: 'customers!A1:K',
      values: [
        [
          'id',
          'customerName',
          'address',
          'email',
          'phone',
          'instructions',
          'lat',
          'lng',
          'posted',
          'pickedUp',
          'comment',
        ],

        ...stops.map((stop) => [
          stop.id,
          stop.customerName || '',
          stop.address || '',
          stop.email || '',
          stop.phone || '',
          stop.instructions || '',
          stop.lat ?? '',
          stop.lng ?? '',
          stop.posted ? 'TRUE' : 'FALSE',
          stop.pickedUp ? 'TRUE' : 'FALSE',
          stop.comment || '',
        ]),
      ],
    },

    {
  range: 'routes!A1:G',
  values: [
    [
      'routeId',
      'routeName',
      'stopCount',
      'driverName',
      'navigatorName',
      'assignedAt',
      'savedAt',
    ],

    ...routes.map((route) => {
      const assignment = assignedRoutes[route.id] || {}

      return [
        route.id,
        route.name,
        route.stops.length,
        assignment.driverName || '',
        assignment.navigatorName || '',
        assignment.assignedAt || '',
        new Date().toISOString(),
      ]
    }),
  ],
},

    {
      range: 'route_stops!A1:F',
      values: [
        ['routeId', 'stopId', 'stopOrder', 'posted', 'pickedUp', 'comment'],

        ...routes.flatMap((route) =>
          route.stops.map((stop, index) => [
            route.id,
            stop.id,
            index + 1,
            stop.posted ? 'TRUE' : 'FALSE',
            stop.pickedUp ? 'TRUE' : 'FALSE',
            stop.comment || '',
          ]),
        ),
      ],
    },
  ]

  await window.gapi.client.sheets.spreadsheets.values.batchClear({
  spreadsheetId,

  resource: {
    ranges: [
      'settings!A:Z',
      'customers!A:Z',
      'routes!A:Z',
      'route_stops!A:Z',
    ],
  },
})

  return window.gapi.client.sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,

  resource: {
    valueInputOption: 'RAW',
    data: valuesByRange,
  },
})
}

export async function readWorkspaceData(spreadsheetId) {
  ensureReady()

  const response = await window.gapi.client.sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['settings!A:Z', 'customers!A:Z', 'route_stops!A:Z'],
  })

  const valueRanges = response.result.valueRanges || []

  const customersValues = valueRanges.find((range) => range.range.startsWith('customers!'))?.values || []
  const routeStopsValues = valueRanges.find((range) => range.range.startsWith('route_stops!'))?.values || []

  const stops = parseCustomers(customersValues)
  const routeStopMap = parseRouteStops(routeStopsValues)

  const restoredStops = stops.map((stop) => {
    const routeData = routeStopMap.get(stop.id)

    if (!routeData) return stop

    return {
      ...stop,
      manualRouteId: routeData.routeId,
      manualOrder: routeData.stopOrder - 1,
      posted: routeData.posted,
      pickedUp: routeData.pickedUp,
      comment: routeData.comment || stop.comment || '',
    }
  })

  return {
    stops: restoredStops,
  }
}

function parseCustomers(values) {
  const [headers = [], ...rows] = values

  return rows
    .map((row) => {
      const record = rowToObject(headers, row)

      return {
        id: record.id,
        customerName: record.customerName || '',
        address: record.address || '',
        email: record.email || '',
        phone: record.phone || '',
        instructions: record.instructions || '',
        lat: parseOptionalNumber(record.lat),
        lng: parseOptionalNumber(record.lng),
        posted: parseBoolean(record.posted),
        pickedUp: parseBoolean(record.pickedUp),
        comment: record.comment || '',
        postedAt: '',
        pickedUpAt: '',
      }
    })
    .filter((stop) => stop.id && stop.customerName && stop.address)
}

function parseRouteStops(values) {
  const [headers = [], ...rows] = values
  const routeStopMap = new Map()

  rows.forEach((row) => {
    const record = rowToObject(headers, row)

    if (!record.stopId) return

    routeStopMap.set(record.stopId, {
      routeId: record.routeId,
      stopOrder: Number(record.stopOrder) || 0,
      posted: parseBoolean(record.posted),
      pickedUp: parseBoolean(record.pickedUp),
      comment: record.comment || '',
    })
  })

  return routeStopMap
}

function rowToObject(headers, row) {
  return headers.reduce((record, header, index) => {
    record[header] = row[index] || ''
    return record
  }, {})
}

function parseBoolean(value) {
  return String(value || '').toUpperCase() === 'TRUE'
}

function parseOptionalNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function ensureReady() {
  if (!window.gapi?.client?.sheets) {
    throw new Error('Google Sheets is not initialized or authorized.')
  }
}

function waitForGoogleScripts() {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      attempts += 1

      if (window.gapi && window.google?.accounts?.oauth2) {
        resolve()
        return
      }

      if (attempts > 50) {
        reject(new Error('Google scripts failed to load.'))
        return
      }

      setTimeout(check, 100)
    }

    check()
  })
}