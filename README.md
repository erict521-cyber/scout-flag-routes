# Scout Flag Routes

Scout Flag Routes is a GitHub Pages-ready React/Vite PWA starter for Scout troop flag service routing and field operations.

## Current scope

Built now:

- React/Vite starter app
- PWA manifest and service worker
- Mobile-friendly coordinator and driver/navigator screens
- TroopWebHost CSV import placeholder/parser
- Route planning controls
- Simple geographic route balancing placeholder
- Posting/pickup tracking with timestamps
- Issue/comment logging
- GitHub Pages deployment workflow

Intentionally parked for later:

- Google login/authorization
- Google Sheet create/connect flow
- Google Sheets read/write sync
- Geocoding service selection
- Customer email/text notifications
- App-store wrapper

## Architecture direction

- Static PWA hosted on GitHub Pages
- No central hosted database
- Each troop owns its own Google account and Google Sheet
- TroopWebHost order CSV is the only ingestion source
- Drivers should not need login
- Google Sheet delay is acceptable for Scout operations
- Geocode once, then cache latitude/longitude in the Sheet

## Local development

```bash
npm install
npm run dev
```

## Build locally

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `scout-flag-routes`.
2. Upload these files to the repository.
3. Go to **Settings → Pages**.
4. Set **Build and deployment → Source** to **GitHub Actions**.
5. Go to **Settings → Actions → General** and make sure Actions are allowed.
6. If this is a project site, add a repository variable:
   - Name: `VITE_BASE_PATH`
   - Value: `/your-repository-name/`
   - Example: `/scout-flag-routes/`
7. Push to the `main` branch.
8. Open the **Actions** tab and confirm the deploy workflow completes.
9. Use the Pages URL shown by GitHub.

## Why the deploy workflow is set up this way

GitHub Pages supports custom GitHub Actions workflows for static sites. The workflow builds the Vite app into `dist`, uploads that folder as a Pages artifact, then deploys it to the `github-pages` environment.

## Next development phase recommendation

Do not build the full Google Sheets integration yet. The next useful phase is:

1. Lock down the expected TroopWebHost CSV headers from a real export.
2. Improve the importer against that real file.
3. Build customer edit/add/delete screens.
4. Add manual lat/lng fields and cached geocode status.
5. Then start Google Sheet create/connect.

## Safety note

Drivers should use a navigator/passenger to operate the route view. Drivers should not interact with the app while driving.
