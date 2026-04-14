# On The Move

On The Move is a static multi-page website for a residential moving middleman business. It helps customers get an estimate and send a move request to a middleman who then coordinates the right bakkie or small truck manually.

## Pages

- `index.html` - landing page and overview
- `book.html` - customer booking page
- `dispatch.html` - operator dispatch board

## How To Navigate

1. Open the home page at `index.html`.
2. Click `Book a move` to simulate the customer journey.
3. Click `Dispatch` to review incoming requests and the operator workflow.

## How The Workflow Works

1. A customer opens `book.html`.
2. They enter their contact details, moving addresses, truck size, and moving details.
3. The site calculates an estimate based on truck size, distance, route time, helpers, access, and date demand.
4. The customer can then confirm the request or cancel it.
5. Once confirmed, the request is saved in browser storage and the operator can be notified automatically by email.
6. The `dispatch.html` page shows incoming customer requests for manual follow-up by the middleman.

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

## Geoapify Integration

The `Book a move` page now supports Geoapify-powered address suggestions and route distance lookup through Vercel serverless functions.

### What it uses

- Geoapify Address Autocomplete API
- Geoapify Routing API

### Environment variable

Add this environment variable in Vercel:

```text
GEOAPIFY_API_KEY=your_geoapify_api_key
```

### What to set up

1. Create a Geoapify account and project.
2. Copy your Geoapify API key.
3. Add it to Vercel as `GEOAPIFY_API_KEY`.

### Notes

- The browser does not receive the Geoapify API key directly.
- The site calls Vercel API routes in `api/geoapify-autocomplete.js` and `api/geoapify-route.js`.
- If the Geoapify key is missing or the API is unavailable, the booking page falls back to the previous address and distance logic.
- Geoapify's pricing page says the free plan can be used commercially with attribution.

## Automated Email Notifications

Confirmed move requests can send an operator notification email through a Vercel serverless function in `api/send-request-notification.js`.

### Environment variables

Add these environment variables in Vercel:

```text
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=On The Move <alerts@yourdomain.com>
OPERATOR_NOTIFICATION_EMAIL=dispatch@yourdomain.com
```

### What to set up

1. Create a Resend account.
2. Generate a Resend API key.
3. Verify the domain you want to send from.
4. Add the three variables above in Vercel.

### Notes

- The booking page now calculates the estimate first, then asks the customer to confirm or cancel the request.
- The operator notification is sent only after the customer confirms the request.
- A backup mailto draft still appears in the UI even when automated email is enabled.
- Resend requires a verified sending domain if you want to send to recipients other than your own test address.

## Important MVP Limitation

This version uses `localStorage` in the browser.

That means:

- requests are stored only in the browser where they were submitted
- data is not shared across devices yet

To make this a real shared live system, the next step is to connect:

- a real shared database
- a shared backend

## Project Files

- `index.html` - landing page
- `book.html` - booking form
- `dispatch.html` - dispatch board
- `styles.css` - shared styling
- `app.js` - shared client-side logic
