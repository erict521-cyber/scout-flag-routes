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

export async function connectTroopWorkspace() {
  throw new Error('Google Sheets integration has not been implemented yet.')
}
