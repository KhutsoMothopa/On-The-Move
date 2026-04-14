# On The Move

On The Move is a static multi-page website for a residential moving middleman business. It connects people who need help moving with local bakkie and small-truck drivers.

## Pages

- `index.html` - landing page and overview
- `book.html` - customer booking page
- `drivers.html` - driver registration page
- `dispatch.html` - operator dispatch board

## How To Navigate

1. Open the home page at `index.html`.
2. Click `Book a move` to simulate the customer journey.
3. Click `Drivers` to register drivers and their vehicles.
4. Click `Dispatch` to review incoming requests and the registered driver pool.

## How The Workflow Works

1. A customer opens `book.html`.
2. They enter their contact details, moving addresses, truck size, and moving details.
3. The site calculates an estimate based on truck size, distance, helpers, and stairs.
4. The request is saved in browser storage and an email draft link is prepared for the operator.
5. Drivers are added through `drivers.html`.
6. The `dispatch.html` page shows requests, registered drivers, and suggested matches.

## Local Run

Because this is a static site, you can run it with a simple local server.

### PowerShell

```powershell
cd "c:\Users\2557340\Documents\AlphKhutso's Project"
npx.cmd serve .
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:3000
```

## Vercel Deployment

This project can be deployed to Vercel as a static site.

### Basic flow

1. Push this project to a GitHub repository.
2. Sign in to Vercel.
3. Click `Add New Project`.
4. Import the GitHub repository.
5. Keep the default settings because this is a plain static HTML/CSS/JS site.
6. Deploy.

## Google Maps Integration

The `Book a move` page now supports Google-powered address suggestions and Google route distance lookup through Vercel serverless functions.

### What it uses

- Places API Autocomplete (New)
- Routes API

### Environment variable

Add this environment variable in Vercel:

```text
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### APIs to enable in Google Cloud

- Places API
- Routes API

### Notes

- The browser does not receive the Google API key directly.
- The site calls Vercel API routes in `api/google-places-autocomplete.js` and `api/google-route.js`.
- If the Google key is missing or the API is unavailable, the booking page falls back to the previous address/distance logic.

## Important MVP Limitation

This version uses `localStorage` in the browser.

That means:

- requests are stored only in the browser where they were submitted
- driver registrations are stored only in the browser where they were created
- data is not shared across devices yet

To make this a real shared live system, the next step is to connect:

- a real database
- a backend or serverless API
- a real email service

## Project Files

- `index.html` - landing page
- `book.html` - booking form
- `drivers.html` - driver registration form
- `dispatch.html` - dispatch board
- `styles.css` - shared styling
- `app.js` - shared client-side logic
