export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const query = String(request.query.q || "").trim();

  if (query.length < 3) {
    return response.status(200).json({ suggestions: [] });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      error: "Geoapify API key is not configured on the server.",
      suggestions: [],
    });
  }

  try {
    const endpoint = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    endpoint.searchParams.set("text", query);
    endpoint.searchParams.set("limit", "5");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("filter", "countrycode:za");
    endpoint.searchParams.set("bias", "countrycode:za");
    endpoint.searchParams.set("apiKey", apiKey);

    const geoapifyResponse = await fetch(endpoint.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const payload = await geoapifyResponse.json();

    if (!geoapifyResponse.ok) {
      return response.status(geoapifyResponse.status).json({
        error: payload.error || payload.message || "Geoapify autocomplete request failed.",
        suggestions: [],
      });
    }

    const suggestions = (payload.results || [])
      .map((result) => ({
        text: result.formatted || "",
        mainText: result.address_line1 || result.formatted || "",
        secondaryText: result.address_line2 || "",
        coordinates: `${result.lat},${result.lon}`,
      }))
      .filter((item) => item.text && item.coordinates);

    return response.status(200).json({ suggestions });
  } catch (error) {
    return response.status(500).json({
      error: "Geoapify autocomplete is currently unavailable.",
      suggestions: [],
    });
  }
}
