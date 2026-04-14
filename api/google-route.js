export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return response.status(503).json({ error: "Google Maps API key is not configured on the server." });
  }

  const {
    originPlaceId,
    destinationPlaceId,
    originAddress,
    destinationAddress,
  } = request.body || {};

  const origin = createWaypoint(originPlaceId, originAddress);
  const destination = createWaypoint(destinationPlaceId, destinationAddress);

  if (!origin || !destination) {
    return response.status(400).json({ error: "Origin and destination are required." });
  }

  try {
    const googleResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.staticDuration,routes.legs.startLocation,routes.legs.endLocation",
      },
      body: JSON.stringify({
        origin,
        destination,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        languageCode: "en-ZA",
        regionCode: "ZA",
        units: "METRIC",
      }),
    });

    const payload = await googleResponse.json();

    if (!googleResponse.ok) {
      return response.status(googleResponse.status).json({
        error: payload.error?.message || "Google route request failed.",
      });
    }

    const route = payload.routes?.[0];
    const leg = route?.legs?.[0];

    if (!route || !leg) {
      return response.status(404).json({ error: "No driving route was found for these addresses." });
    }

    return response.status(200).json({
      distanceKm: route.distanceMeters / 1000,
      durationMinutes: parseDurationMinutes(route.duration),
      staticDurationMinutes: parseDurationMinutes(route.staticDuration),
      fromLocation: mapLegLocation(leg.startLocation),
      toLocation: mapLegLocation(leg.endLocation),
    });
  } catch (error) {
    return response.status(500).json({
      error: "Google route lookup is currently unavailable.",
    });
  }
}

function createWaypoint(placeId, address) {
  if (placeId) {
    return { placeId };
  }

  if (address) {
    return { address };
  }

  return null;
}

function mapLegLocation(location) {
  if (!location?.latLng) {
    return null;
  }

  return {
    lat: Number(location.latLng.latitude),
    lon: Number(location.latLng.longitude),
  };
}

function parseDurationMinutes(durationValue) {
  if (!durationValue) {
    return null;
  }

  const seconds = Number(String(durationValue).replace("s", ""));

  if (Number.isNaN(seconds)) {
    return null;
  }

  return Math.max(1, Math.round(seconds / 60));
}
