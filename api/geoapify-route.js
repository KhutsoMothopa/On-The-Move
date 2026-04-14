export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return response.status(503).json({ error: "Geoapify API key is not configured on the server." });
  }

  const {
    originCoordinates,
    destinationCoordinates,
    originAddress,
    destinationAddress,
  } = request.body || {};

  try {
    const origin = originCoordinates
      ? parseCoordinates(originCoordinates)
      : await geocodeAddress(originAddress, apiKey);
    const destination = destinationCoordinates
      ? parseCoordinates(destinationCoordinates)
      : await geocodeAddress(destinationAddress, apiKey);

    if (!origin || !destination) {
      return response.status(400).json({ error: "Origin and destination are required." });
    }

    const endpoint = new URL("https://api.geoapify.com/v1/routing");
    endpoint.searchParams.set("waypoints", `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`);
    endpoint.searchParams.set("mode", "drive");
    endpoint.searchParams.set("units", "metric");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("apiKey", apiKey);

    const geoapifyResponse = await fetch(endpoint.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const payload = await geoapifyResponse.json();

    if (!geoapifyResponse.ok) {
      return response.status(geoapifyResponse.status).json({
        error: payload.error || payload.message || "Geoapify route request failed.",
      });
    }

    const route = payload.results?.[0];

    if (!route) {
      return response.status(404).json({ error: "No driving route was found for these addresses." });
    }

    return response.status(200).json({
      distanceKm: Number(route.distance) / 1000,
      durationMinutes: parseDurationMinutes(route.time),
      staticDurationMinutes: parseDurationMinutes(route.time),
      fromLocation: origin,
      toLocation: destination,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Geoapify route lookup is currently unavailable.",
    });
  }
}

async function geocodeAddress(address, apiKey) {
  if (!address) {
    return null;
  }

  const endpoint = new URL("https://api.geoapify.com/v1/geocode/search");
  endpoint.searchParams.set("text", address);
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("filter", "countrycode:za");
  endpoint.searchParams.set("bias", "countrycode:za");
  endpoint.searchParams.set("apiKey", apiKey);

  const geocodeResponse = await fetch(endpoint.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await geocodeResponse.json();

  if (!geocodeResponse.ok || !payload.results?.length) {
    return null;
  }

  return {
    lat: Number(payload.results[0].lat),
    lon: Number(payload.results[0].lon),
  };
}

function parseCoordinates(value) {
  const [latText, lonText] = String(value).split(",");
  const lat = Number(latText);
  const lon = Number(lonText);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return { lat, lon };
}

function parseDurationMinutes(durationSeconds) {
  const seconds = Number(durationSeconds);

  if (Number.isNaN(seconds)) {
    return null;
  }

  return Math.max(1, Math.round(seconds / 60));
}
