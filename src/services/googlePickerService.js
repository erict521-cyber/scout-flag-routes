const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

const GOOGLE_SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet'

let pickerApiLoadPromise = null

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`)

    if (existingScript) {
      existingScript.addEventListener('load', resolve, { once: true })
      existingScript.addEventListener('error', reject, { once: true })

      if (window.gapi) {
        resolve()
      }

      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject

    document.head.appendChild(script)
  })
}

async function loadPickerApi() {
  if (window.google?.picker) return

  if (!pickerApiLoadPromise) {
    pickerApiLoadPromise = loadScript('https://apis.google.com/js/api.js').then(
      () =>
        new Promise((resolve, reject) => {
          if (!window.gapi) {
            reject(new Error('Google API client script did not load.'))
            return
          }

          window.gapi.load('picker', {
            callback: resolve,
            onerror: () => reject(new Error('Google Picker API failed to load.')),
            timeout: 10000,
            ontimeout: () => reject(new Error('Google Picker API load timed out.')),
          })
        }),
    )
  }

  await pickerApiLoadPromise
}

function getCurrentOAuthToken() {
  const token = window.gapi?.client?.getToken?.()

  return token?.access_token || ''
}

export async function pickGoogleSpreadsheet() {
  if (!GOOGLE_API_KEY) {
    throw new Error('Missing VITE_GOOGLE_API_KEY. Set the GitHub repository variable and redeploy.')
  }

  await loadPickerApi()

  const oauthToken = getCurrentOAuthToken()

  if (!oauthToken) {
    throw new Error('Google is connected, but no OAuth token is available. Connect Google again and retry.')
  }

  return new Promise((resolve, reject) => {
    const spreadsheetView = new window.google.picker.DocsView(
      window.google.picker.ViewId.SPREADSHEETS,
    )
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false)

    const picker = new window.google.picker.PickerBuilder()
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOAuthToken(oauthToken)
      .setTitle('Choose Scout Flag Routes Workspace Sheet')
      .setSelectableMimeTypes(GOOGLE_SHEETS_MIME_TYPE)
      .addView(spreadsheetView)
      .setCallback((data) => {
        const action = data[window.google.picker.Response.ACTION]

        if (action === window.google.picker.Action.CANCEL) {
          resolve(null)
          return
        }

        if (action !== window.google.picker.Action.PICKED) {
          return
        }

        const [document] = data[window.google.picker.Response.DOCUMENTS] || []

        if (!document) {
          reject(new Error('No spreadsheet was selected.'))
          return
        }

        const spreadsheetId = document[window.google.picker.Document.ID]
        const spreadsheetName = document[window.google.picker.Document.NAME]
        const spreadsheetUrl = document[window.google.picker.Document.URL]

        if (!spreadsheetId) {
          reject(new Error('Selected spreadsheet did not include a file ID.'))
          return
        }

        resolve({
          spreadsheetId,
          spreadsheetName,
          spreadsheetUrl:
            spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        })
      })
      .build()

    picker.setVisible(true)
  })
}