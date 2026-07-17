# MightyCall SDK Lab

A standalone browser test console for the MightyCall WebPhone SDK. It supports
inline and modal SDK initialization, call controls, browser preflight checks,
SDK method inspection, event monitoring, log search, and log export.

## Requirements

- Node.js 22.13 or newer
- npm
- A modern browser such as Google Chrome or Microsoft Edge
- MightyCall Account API Key and User Key for authenticated testing

## Run in Visual Studio Code

1. Extract this project and open the extracted folder in Visual Studio Code.
2. Open **Terminal → New Terminal**.
3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local address displayed in the terminal, normally:

   ```text
   http://localhost:3000
   ```

## Production test

```bash
npm run build
```

The static production files will be generated in `out/`.

## GitHub Pages

Every push to `main` runs the included GitHub Actions workflow. It builds a
static export and deploys it to GitHub Pages over HTTPS.

Repository: https://github.com/CollinsChime/mightycall-sdk-lab

Published app: https://collinschime.github.io/mightycall-sdk-lab/

## Main source files

- `app/page.tsx` — SDK loading, initialization, call controls, diagnostics, and logs
- `app/globals.css` — the complete responsive design
- `app/layout.tsx` — page metadata, fonts, and application shell

## Security notes

- Account and user keys are kept only in React state inside the current browser tab.
- They are not written to local storage, cookies, a database, or the project files.
- Do not commit real MightyCall credentials to source control.
- Microphone access requires `localhost` or an HTTPS deployment.
- Modal mode may require popups to be allowed for the site.

## SDK source

The app loads the official SDK in the browser from:

```text
https://ccapi.mightycall.com/v4/sdk/mightycall.webphone.sdk.js
```

You can change the SDK URL from the app when testing another environment or
version.
