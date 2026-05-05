import { normalizeHeader } from '../utils/csvUtils.js'

export function parseTroopWebHostCsv(csvText) {
  const rows = parseCsv(csvText)
  if (rows.length < 2) return []

  const headers = rows[0].map(normalizeHeader)

  return rows
    .slice(1)
    .map((row, index) => rowToStop(headers, row, index))
    .filter((stop) => stop.customerName && stop.address)
}

function rowToStop(headers, row, index) {
  const get = (...names) => {
    const normalizedNames = names.map(normalizeHeader)
    const headerIndex = headers.findIndex((header) => normalizedNames.includes(header))
    return headerIndex >= 0 ? String(row[headerIndex] || '').trim() : ''
  }

  const customerName =
    get('Customer Name', 'Name', 'Purchaser Name', 'First Name') ||
    [get('First Name'), get('Last Name')].filter(Boolean).join(' ')

  const addressParts = [
    get('Address', 'Street Address', 'Address 1'),
    get('Address 2'),
    get('City'),
    get('State'),
    get('Zip', 'Zip Code', 'Postal Code'),
  ].filter(Boolean)

  return {
    id: get('Order ID', 'Invoice', 'Customer ID') || `csv-${index + 1}`,
    customerName,
    address: addressParts.join(', '),
    lat: Number(get('Latitude', 'Lat')) || null,
    lng: Number(get('Longitude', 'Lng', 'Long')) || null,
    instructions: get('Instructions', 'Notes', 'Special Instructions'),
    posted: false,
    pickedUp: false,
    postedAt: '',
    pickedUpAt: '',
    comment: '',
  }
}

// Lightweight CSV parser that handles quoted commas and escaped quotes.
// Good enough for MVP imports. Replace with PapaParse if CSV complexity grows.
function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      value += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }

  row.push(value)
  rows.push(row)

  return rows.filter((candidate) => candidate.some((cell) => String(cell).trim()))
}
