export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const query = String(request.query.q || "").trim();

  if (query.length < 3) {
    return response.status(200).json({ suggestions: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      error: "Google Maps API key is not configured on the server.",
      suggestions: [],
    });
  }

  try {
    const googleResponse = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["za"],
        languageCode: "en",
        regionCode: "za",
      }),
    });

    const payload = await googleResponse.json();

    if (!googleResponse.ok) {
      return response.status(googleResponse.status).json({
        error: payload.error?.message || "Google autocomplete request failed.",
        suggestions: [],
      });
    }

    const suggestions = (payload.suggestions || [])
      .map((entry) => entry.placePrediction)
      .filter(Boolean)
      .map((prediction) => ({
        placeId: prediction.placeId || String(prediction.place || "").replace("places/", ""),
        text: prediction.text?.text || "",
        mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
        secondaryText: prediction.structuredFormat?.secondaryText?.text || "",
      }))
      .filter((prediction) => prediction.placeId && prediction.text)
      .slice(0, 5);

    return response.status(200).json({ suggestions });
  } catch (error) {
    return response.status(500).json({
      error: "Google autocomplete is currently unavailable.",
      suggestions: [],
    });
  }
}
