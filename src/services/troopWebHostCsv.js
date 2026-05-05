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

  const customerName = get('Customer', 'Customer Name', 'Name')

  const address = get('Address', 'Street Address', 'Address 1')

  return {
    id: get('Order ID', 'Internet Order', 'Reference Key') || `csv-${index + 1}`,
    customerName,
    address,
    email: get('E-Mail', 'Email'),
    phone: get('Phone'),
    instructions: get('Special Instructions', 'Instructions', 'Notes'),
    lat: Number(get('Latitude', 'Lat')) || null,
    lng: Number(get('Longitude', 'Lng', 'Long')) || null,
    posted: false,
    pickedUp: false,
    postedAt: '',
    pickedUpAt: '',
    comment: '',
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  const cleanText = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < cleanText.length; i += 1) {
    const char = cleanText[i]
    const next = cleanText[i + 1]

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