const STORAGE_KEYS = {
  requests: "otm_requests",
  drivers: "otm_drivers",
  settings: "otm_settings",
};

const TRUCK_TYPES = {
  bakkie: { label: "Bakkie / half-ton", base: 420, perKm: 9, handlingFee: 90, loadFactor: 0.96, order: 1 },
  "one-ton": { label: "1-ton truck", base: 650, perKm: 11, handlingFee: 120, loadFactor: 1, order: 2 },
  "one-point-five-ton": { label: "1.5-ton truck", base: 920, perKm: 14, handlingFee: 160, loadFactor: 1.1, order: 3 },
  "three-ton": { label: "3-ton truck", base: 1380, perKm: 18, handlingFee: 220, loadFactor: 1.2, order: 4 },
};

const LOAD_DENSITY = {
  light: { multiplier: 0.92 },
  standard: { multiplier: 1 },
  heavy: { multiplier: 1.18 },
};

const DEFAULT_SETTINGS = {
  operatorEmail: "dispatch@onthemove.co.za",
};

const GEOAPIFY_ENDPOINTS = {
  autocomplete: "/api/geoapify-autocomplete",
  route: "/api/geoapify-route",
};

const AUTOCOMPLETE_MIN_CHARS = 3;

const ui = {
  requestForm: document.querySelector("#request-form"),
  driverForm: document.querySelector("#driver-form"),
  operatorEmailInput: document.querySelector("#operator-email"),
  requestSubmitButton: document.querySelector("#request-submit"),
  driverFeedback: document.querySelector("#driver-feedback"),
  requestResult: document.querySelector("#request-result"),
  requestResultCopy: document.querySelector("#request-result-copy"),
  emailLink: document.querySelector("#email-link"),
  copySummaryButton: document.querySelector("#copy-summary"),
  quote: {
    title: document.querySelector("#quote-title"),
    total: document.querySelector("#quote-total"),
    distance: document.querySelector("#quote-distance"),
    truck: document.querySelector("#quote-truck"),
    base: document.querySelector("#breakdown-base"),
    distanceCharge: document.querySelector("#breakdown-distance"),
    helpers: document.querySelector("#breakdown-helpers"),
    stairs: document.querySelector("#breakdown-stairs"),
    load: document.querySelector("#breakdown-load"),
    service: document.querySelector("#breakdown-service"),
    message: document.querySelector("#quote-message"),
  },
  stats: {
    requests: document.querySelector("#stat-requests"),
    drivers: document.querySelector("#stat-drivers"),
    matches: document.querySelector("#stat-matches"),
  },
  lists: {
    requests: document.querySelector("#requests-list"),
    drivers: document.querySelector("#drivers-list"),
  },
  addressFields: {
    from: {
      input: document.querySelector('input[name="fromAddress"]'),
      coordinates: document.querySelector('input[name="fromCoordinates"]'),
      list: document.querySelector("#from-suggestions"),
      helper: document.querySelector("#from-address-helper"),
    },
    to: {
      input: document.querySelector('input[name="toAddress"]'),
      coordinates: document.querySelector('input[name="toCoordinates"]'),
      list: document.querySelector("#to-suggestions"),
      helper: document.querySelector("#to-address-helper"),
    },
  },
};

let lastSummary = "";
let geoapifyAutocompleteEnabled = true;

init();

function init() {
  const settings = loadSettings();

  if (ui.operatorEmailInput) {
    ui.operatorEmailInput.value = settings.operatorEmail;
    ui.operatorEmailInput.addEventListener("input", handleOperatorEmailInput);
  }

  if (ui.requestForm) {
    ui.requestForm.addEventListener("submit", handleRequestSubmit);
    if (ui.requestForm.elements.moveDate) {
      ui.requestForm.elements.moveDate.value = todayIsoDate();
    }
    setupAddressAutocomplete("from", ui.addressFields.from);
    setupAddressAutocomplete("to", ui.addressFields.to);
  }

  if (ui.driverForm) {
    ui.driverForm.addEventListener("submit", handleDriverSubmit);
  }

  if (ui.copySummaryButton) {
    ui.copySummaryButton.addEventListener("click", copyLastSummary);
  }

  renderDashboard();
}

function handleOperatorEmailInput() {
  saveStorage(STORAGE_KEYS.settings, {
    ...loadSettings(),
    operatorEmail: ui.operatorEmailInput.value.trim(),
  });
}

async function handleRequestSubmit(event) {
  event.preventDefault();

  const formData = new FormData(ui.requestForm);
  const payload = {
    customerName: formData.get("customerName").trim(),
    customerPhone: formData.get("customerPhone").trim(),
    customerEmail: formData.get("customerEmail").trim(),
    moveDate: formData.get("moveDate"),
    fromAddress: formData.get("fromAddress").trim(),
    toAddress: formData.get("toAddress").trim(),
    fromCoordinates: String(formData.get("fromCoordinates") || "").trim(),
    toCoordinates: String(formData.get("toCoordinates") || "").trim(),
    truckSize: formData.get("truckSize"),
    helpers: Number(formData.get("helpers") || 0),
    pickupFloor: Number(formData.get("pickupFloor") || 0),
    dropoffFloor: Number(formData.get("dropoffFloor") || 0),
    manualDistance: Number(formData.get("manualDistance") || 0),
    loadDensity: formData.get("loadDensity"),
    notes: formData.get("notes").trim(),
  };

  setRequestLoadingState(true);

  try {
    const route = await resolveDistance(payload);
    const estimate = calculateEstimate(payload, route.distanceKm);
    const drivers = loadStorage(STORAGE_KEYS.drivers, []);
    const suggestedDriver = findClosestDriver(drivers, payload, route);

    renderQuote(estimate, route, payload, suggestedDriver);

    const requestRecord = {
      id: createId("request"),
      createdAt: new Date().toISOString(),
      ...payload,
      route,
      estimate,
      suggestedDriverId: suggestedDriver ? suggestedDriver.id : null,
    };

    const requests = loadStorage(STORAGE_KEYS.requests, []);
    requests.unshift(requestRecord);
    saveStorage(STORAGE_KEYS.requests, requests);

    lastSummary = createRequestSummary(requestRecord, suggestedDriver);

    if (ui.emailLink) {
      ui.emailLink.href = createMailtoLink(getOperatorEmail(), requestRecord, suggestedDriver);
    }

    if (ui.requestResultCopy) {
      ui.requestResultCopy.textContent = suggestedDriver
        ? `${suggestedDriver.name} looks like the closest current match. Open the email draft to notify dispatch with the full request.`
        : "The request has been saved. No suitable driver is registered yet, so the dispatch board is waiting for you to match one manually.";
    }

    if (ui.requestResult) {
      ui.requestResult.hidden = false;
    }

    renderDashboard();
    ui.requestForm.reset();
    resetAddressAutocompleteField(ui.addressFields.from);
    resetAddressAutocompleteField(ui.addressFields.to);

    if (ui.requestForm.elements.moveDate) {
      ui.requestForm.elements.moveDate.value = todayIsoDate();
    }
  } catch (error) {
    renderErrorQuote(error.message);
  } finally {
    setRequestLoadingState(false);
  }
}

async function handleDriverSubmit(event) {
  event.preventDefault();

  const formData = new FormData(ui.driverForm);
  const driver = {
    id: createId("driver"),
    createdAt: new Date().toISOString(),
    name: formData.get("driverName").trim(),
    phone: formData.get("driverPhone").trim(),
    email: formData.get("driverEmail").trim(),
    truckSize: formData.get("driverTruckSize"),
    baseLocation: formData.get("baseLocation").trim(),
    serviceAreas: splitAreas(formData.get("serviceAreas")),
    helpersAvailable: Number(formData.get("driverHelpers") || 0),
    vehicleRegistration: formData.get("vehicleRegistration").trim(),
    notes: formData.get("driverNotes").trim(),
  };

  if (ui.driverFeedback) {
    ui.driverFeedback.textContent = "Saving driver and checking the base location...";
  }

  try {
    driver.location = await geocodeAddress(driver.baseLocation);
  } catch (error) {
    driver.location = null;
  }

  const drivers = loadStorage(STORAGE_KEYS.drivers, []);
  drivers.unshift(driver);
  saveStorage(STORAGE_KEYS.drivers, drivers);

  ui.driverForm.reset();

  if (ui.driverFeedback) {
    ui.driverFeedback.textContent = driver.location
      ? "Driver saved. Their base location was geocoded for distance-based dispatch matching."
      : "Driver saved. The profile is usable, but the base location could not be geocoded, so matching will use service-area text instead.";
  }

  renderDashboard();
}

function setRequestLoadingState(isLoading) {
  if (ui.requestSubmitButton) {
    ui.requestSubmitButton.disabled = isLoading;
    ui.requestSubmitButton.textContent = isLoading ? "Calculating..." : "Estimate and request driver";
  }

  if (ui.requestResult && isLoading) {
    ui.requestResult.hidden = true;
  }
}

function setupAddressAutocomplete(fieldKey, fieldUi) {
  if (!fieldUi.input || !fieldUi.coordinates || !fieldUi.list) {
    return;
  }

  let debounceTimer = null;
  let suggestions = [];
  let activeIndex = -1;

  fieldUi.input.addEventListener("input", () => {
    fieldUi.coordinates.value = "";
    activeIndex = -1;

    if (!geoapifyAutocompleteEnabled) {
      updateAutocompleteHelper(fieldUi, "Address suggestions are unavailable right now. You can still type the address manually.");
      hideSuggestionList(fieldUi.list);
      return;
    }

    const query = fieldUi.input.value.trim();

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    if (query.length < AUTOCOMPLETE_MIN_CHARS) {
      suggestions = [];
      hideSuggestionList(fieldUi.list);
      updateAutocompleteHelper(fieldUi, "Choose a suggested address for the most accurate route estimate.");
      return;
    }

    updateAutocompleteHelper(fieldUi, "Searching address suggestions...");

    debounceTimer = window.setTimeout(async () => {
      try {
        suggestions = await fetchAddressSuggestions(query);
        activeIndex = -1;
        renderSuggestionList(fieldKey, fieldUi, suggestions, activeIndex);

        if (!suggestions.length) {
          updateAutocompleteHelper(fieldUi, "No suggestions found yet. Keep typing or enter the address manually.");
        } else {
          updateAutocompleteHelper(fieldUi, "Select a suggested address to improve distance accuracy.");
        }
      } catch (error) {
        geoapifyAutocompleteEnabled = false;
        suggestions = [];
        hideSuggestionList(fieldUi.list);
        updateAutocompleteHelper(fieldUi, "Address suggestions are unavailable right now. You can still type the address manually.");
      }
    }, 240);
  });

  fieldUi.input.addEventListener("keydown", (event) => {
    if (!suggestions.length || fieldUi.list.hidden) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
      renderSuggestionList(fieldKey, fieldUi, suggestions, activeIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderSuggestionList(fieldKey, fieldUi, suggestions, activeIndex);
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectAddressSuggestion(fieldUi, suggestions[activeIndex]);
      suggestions = [];
      return;
    }

    if (event.key === "Escape") {
      hideSuggestionList(fieldUi.list);
    }
  });

  fieldUi.input.addEventListener("blur", () => {
    window.setTimeout(() => hideSuggestionList(fieldUi.list), 120);
  });
}

async function fetchAddressSuggestions(query) {
  const endpoint = new URL(GEOAPIFY_ENDPOINTS.autocomplete, window.location.origin);
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json();

  if (response.status === 503) {
    throw new Error(payload.error || "Autocomplete unavailable.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Could not load address suggestions.");
  }

  return payload.suggestions || [];
}

function renderSuggestionList(fieldKey, fieldUi, suggestions, activeIndex) {
  if (!suggestions.length) {
    hideSuggestionList(fieldUi.list);
    return;
  }

  fieldUi.list.innerHTML = suggestions
    .map((suggestion, index) => {
      const isActive = index === activeIndex ? " is-active" : "";
      const label = suggestion.secondaryText
        ? `${suggestion.mainText} - ${suggestion.secondaryText}`
        : suggestion.text;

      return `
        <button
          class="autocomplete-item${isActive}"
          data-field="${escapeHtml(fieldKey)}"
          data-coordinates="${escapeHtml(suggestion.coordinates || "")}"
          data-address="${escapeHtml(suggestion.text)}"
          data-main-text="${escapeHtml(suggestion.mainText)}"
          data-secondary-text="${escapeHtml(suggestion.secondaryText || "")}"
          type="button"
          role="option"
          aria-selected="${index === activeIndex ? "true" : "false"}"
        >
          <strong>${escapeHtml(suggestion.mainText || suggestion.text)}</strong>
          <span>${escapeHtml(suggestion.secondaryText || label)}</span>
        </button>
      `;
    })
    .join("");

  fieldUi.list.hidden = false;

  fieldUi.list.querySelectorAll(".autocomplete-item").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectAddressSuggestion(fieldUi, {
        coordinates: button.dataset.coordinates,
        text: button.dataset.address,
        mainText: button.dataset.mainText,
        secondaryText: button.dataset.secondaryText,
      });
    });
  });
}

function selectAddressSuggestion(fieldUi, suggestion) {
  fieldUi.input.value = suggestion.text;
  fieldUi.coordinates.value = suggestion.coordinates || "";
  hideSuggestionList(fieldUi.list);
  updateAutocompleteHelper(fieldUi, `Selected address: ${suggestion.mainText || suggestion.text}`);
}

function resetAddressAutocompleteField(fieldUi) {
  if (!fieldUi.input || !fieldUi.coordinates) {
    return;
  }

  fieldUi.coordinates.value = "";
  hideSuggestionList(fieldUi.list);

  if (fieldUi.helper) {
    fieldUi.helper.textContent = "Choose a suggested address for the most accurate route estimate.";
  }
}

function updateAutocompleteHelper(fieldUi, message) {
  if (fieldUi.helper) {
    fieldUi.helper.textContent = message;
  }
}

function hideSuggestionList(listElement) {
  if (!listElement) {
    return;
  }

  listElement.hidden = true;
  listElement.innerHTML = "";
}

function calculateEstimate(payload, distanceKm) {
  const truck = TRUCK_TYPES[payload.truckSize];
  const loadProfile = LOAD_DENSITY[payload.loadDensity];
  const helperFee = payload.helpers * 190;
  const stairCount = Math.max(0, payload.pickupFloor) + Math.max(0, payload.dropoffFloor);
  const stairsFee = stairCount * 85;
  const distanceCharge = distanceKm * truck.perKm;
  const loadAdjustment = truck.handlingFee * (loadProfile.multiplier * truck.loadFactor - 1);
  const serviceFee = 120;
  const subtotal =
    truck.base +
    distanceCharge +
    helperFee +
    stairsFee +
    Math.max(0, loadAdjustment) +
    serviceFee;

  return {
    total: Math.round(subtotal),
    base: Math.round(truck.base),
    distanceCharge: Math.round(distanceCharge),
    helperFee: Math.round(helperFee),
    stairsFee: Math.round(stairsFee),
    loadAdjustment: Math.round(Math.max(0, loadAdjustment)),
    serviceFee: Math.round(serviceFee),
  };
}

function renderQuote(estimate, route, payload, suggestedDriver) {
  if (!ui.quote.title) {
    return;
  }

  const routeSourceLabel = {
    geoapify: "Geoapify driving route",
    route: "Live road route",
    aerial: "Fallback aerial estimate",
    manual: "Manual backup distance",
  }[route.source];

  ui.quote.title.textContent = "Estimated move total";
  ui.quote.total.textContent = formatCurrency(estimate.total);
  ui.quote.distance.textContent = route.durationMinutes
    ? `${route.distanceKm.toFixed(1)} km - ${routeSourceLabel} - ${route.durationMinutes} min`
    : `${route.distanceKm.toFixed(1)} km - ${routeSourceLabel}`;
  ui.quote.truck.textContent = TRUCK_TYPES[payload.truckSize].label;
  ui.quote.base.textContent = formatCurrency(estimate.base);
  ui.quote.distanceCharge.textContent = formatCurrency(estimate.distanceCharge);
  ui.quote.helpers.textContent = formatCurrency(estimate.helperFee);
  ui.quote.stairs.textContent = formatCurrency(estimate.stairsFee);
  ui.quote.load.textContent = formatCurrency(estimate.loadAdjustment);
  ui.quote.service.textContent = formatCurrency(estimate.serviceFee);
  ui.quote.message.textContent = suggestedDriver
    ? `Suggested match: ${suggestedDriver.name} in ${suggestedDriver.baseLocation}. Review and connect them with the customer once you are happy with the fit.`
    : "No registered driver matches this request yet. The estimate still works, and the request will appear on the dispatch board.";
}

function renderErrorQuote(message) {
  if (!ui.quote.title) {
    return;
  }

  ui.quote.title.textContent = "Estimate needs one more detail";
  ui.quote.total.textContent = "R0";
  ui.quote.distance.textContent = "Unavailable";
  ui.quote.truck.textContent = "Not calculated";
  ui.quote.base.textContent = "R0";
  ui.quote.distanceCharge.textContent = "R0";
  ui.quote.helpers.textContent = "R0";
  ui.quote.stairs.textContent = "R0";
  ui.quote.load.textContent = "R0";
  ui.quote.service.textContent = "R0";
  ui.quote.message.textContent = message;
}

function renderDashboard() {
  const requests = loadStorage(STORAGE_KEYS.requests, []);
  const drivers = loadStorage(STORAGE_KEYS.drivers, []);
  const matches = requests.filter((request) => request.suggestedDriverId).length;

  if (ui.stats.requests) {
    ui.stats.requests.textContent = String(requests.length);
  }

  if (ui.stats.drivers) {
    ui.stats.drivers.textContent = String(drivers.length);
  }

  if (ui.stats.matches) {
    ui.stats.matches.textContent = String(matches);
  }

  renderRequestList(requests, drivers);
  renderDriverList(drivers);
}

function renderRequestList(requests, drivers) {
  if (!ui.lists.requests) {
    return;
  }

  if (!requests.length) {
    ui.lists.requests.innerHTML =
      '<div class="empty-state">No requests yet. The first customer booking will appear here with its estimate and suggested driver.</div>';
    return;
  }

  ui.lists.requests.innerHTML = requests
    .map((request) => {
      const driver = drivers.find((item) => item.id === request.suggestedDriverId);

      return `
        <article class="list-card">
          <div class="list-card-top">
            <h4>${escapeHtml(request.customerName)}</h4>
            <small>${escapeHtml(formatDateTime(request.createdAt))}</small>
          </div>
          <p>${escapeHtml(request.fromAddress)} to ${escapeHtml(request.toAddress)}</p>
          <div class="tag-row">
            <span class="tag tag-accent">${escapeHtml(TRUCK_TYPES[request.truckSize].label)}</span>
            <span class="tag">${formatCurrency(request.estimate.total)}</span>
            <span class="tag">${request.route.distanceKm.toFixed(1)} km</span>
          </div>
          <div class="tag-row">
            ${
              driver
                ? `<span class="tag tag-teal">Suggested driver: ${escapeHtml(driver.name)}</span>`
                : '<span class="tag">No suggested driver yet</span>'
            }
            <span class="tag">Move date: ${escapeHtml(request.moveDate || "Not set")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDriverList(drivers) {
  if (!ui.lists.drivers) {
    return;
  }

  if (!drivers.length) {
    ui.lists.drivers.innerHTML =
      '<div class="empty-state">No drivers registered yet. Save a driver profile above and it will appear here.</div>';
    return;
  }

  ui.lists.drivers.innerHTML = drivers
    .map((driver) => {
      const locationStatus = driver.location ? "Location matched" : "Text area match only";

      return `
        <article class="list-card">
          <div class="list-card-top">
            <h4>${escapeHtml(driver.name)}</h4>
            <small>${escapeHtml(driver.baseLocation)}</small>
          </div>
          <p>${escapeHtml(driver.phone)} | ${escapeHtml(driver.email)}</p>
          <div class="tag-row">
            <span class="tag tag-accent">${escapeHtml(TRUCK_TYPES[driver.truckSize].label)}</span>
            <span class="tag">${driver.helpersAvailable} helper(s)</span>
            <span class="tag">${escapeHtml(driver.vehicleRegistration)}</span>
          </div>
          <div class="tag-row">
            <span class="tag tag-teal">${escapeHtml(locationStatus)}</span>
            <span class="tag">${escapeHtml(driver.serviceAreas.join(", "))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function resolveDistance(payload) {
  const {
    fromAddress,
    toAddress,
    fromCoordinates,
    toCoordinates,
    manualDistance,
  } = payload;

  try {
    return await fetchGeoapifyRoute({
      fromAddress,
      toAddress,
      fromCoordinates,
      toCoordinates,
    });
  } catch (error) {
    // Fall through to the existing open-data/manual fallback so the page stays usable.
  }

  try {
    const [fromLocation, toLocation] = await Promise.all([
      geocodeAddress(fromAddress),
      geocodeAddress(toAddress),
    ]);

    try {
      return {
        source: "route",
        distanceKm: await fetchRouteDistance(fromLocation, toLocation),
        fromLocation,
        toLocation,
      };
    } catch (error) {
      return {
        source: "aerial",
        distanceKm: Math.max(2, haversineKm(fromLocation, toLocation) * 1.25),
        fromLocation,
        toLocation,
      };
    }
  } catch (error) {
    if (manualDistance > 0) {
      return {
        source: "manual",
        distanceKm: manualDistance,
        fromLocation: null,
        toLocation: null,
      };
    }

    throw new Error("We could not read the pickup and drop-off addresses. Add an approximate backup distance in kilometres and try again.");
  }
}

async function fetchGeoapifyRoute({ fromAddress, toAddress, fromCoordinates, toCoordinates }) {
  if (!fromAddress || !toAddress) {
    throw new Error("Origin and destination are required.");
  }

  const response = await fetch(GEOAPIFY_ENDPOINTS.route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      originCoordinates: fromCoordinates || "",
      destinationCoordinates: toCoordinates || "",
      originAddress: fromAddress,
      destinationAddress: toAddress,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Geoapify route lookup failed.");
  }

  return {
    source: "geoapify",
    distanceKm: payload.distanceKm,
    durationMinutes: payload.durationMinutes,
    staticDurationMinutes: payload.staticDurationMinutes,
    fromLocation: payload.fromLocation,
    toLocation: payload.toLocation,
  };
}

async function geocodeAddress(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Address lookup failed.");
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Address not found.");
  }

  return {
    label: results[0].display_name,
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
  };
}

async function fetchRouteDistance(fromLocation, toLocation) {
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${fromLocation.lon},${fromLocation.lat};${toLocation.lon},${toLocation.lat}`
  );
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Route lookup failed.");
  }

  const payload = await response.json();

  if (!payload.routes || payload.routes.length === 0) {
    throw new Error("Route distance unavailable.");
  }

  return payload.routes[0].distance / 1000;
}

function findClosestDriver(drivers, requestPayload, route) {
  const eligibleDrivers = drivers.filter((driver) => canHandleRequest(driver.truckSize, requestPayload.truckSize));

  if (eligibleDrivers.length === 0) {
    return null;
  }

  return eligibleDrivers
    .map((driver) => {
      const areaMatch = driver.serviceAreas.some((area) =>
        requestPayload.fromAddress.toLowerCase().includes(area.toLowerCase())
      );

      let distanceScore = Number.POSITIVE_INFINITY;

      if (route.fromLocation && driver.location) {
        distanceScore = haversineKm(driver.location, route.fromLocation);
      } else if (areaMatch) {
        distanceScore = 8;
      } else {
        distanceScore = 999;
      }

      return {
        driver,
        capacityGap: TRUCK_TYPES[driver.truckSize].order - TRUCK_TYPES[requestPayload.truckSize].order,
        distanceScore,
        areaMatch,
      };
    })
    .sort((left, right) => {
      if (left.distanceScore !== right.distanceScore) {
        return left.distanceScore - right.distanceScore;
      }

      if (left.capacityGap !== right.capacityGap) {
        return left.capacityGap - right.capacityGap;
      }

      return Number(right.areaMatch) - Number(left.areaMatch);
    })[0].driver;
}

function canHandleRequest(driverTruckSize, requestedTruckSize) {
  return TRUCK_TYPES[driverTruckSize].order >= TRUCK_TYPES[requestedTruckSize].order;
}

function createRequestSummary(requestRecord, suggestedDriver) {
  const routeSource = {
    geoapify: "Geoapify driving route",
    route: "live route",
    aerial: "aerial fallback",
    manual: "manual backup",
  }[requestRecord.route.source];

  return [
    "New On The Move request",
    `Customer: ${requestRecord.customerName}`,
    `Phone: ${requestRecord.customerPhone}`,
    `Email: ${requestRecord.customerEmail}`,
    `Move date: ${requestRecord.moveDate}`,
    `From: ${requestRecord.fromAddress}`,
    `To: ${requestRecord.toAddress}`,
    `Truck size: ${TRUCK_TYPES[requestRecord.truckSize].label}`,
    `Helpers requested: ${requestRecord.helpers}`,
    `Distance estimate: ${requestRecord.route.distanceKm.toFixed(1)} km (${routeSource})`,
    `Estimated total: ${formatCurrency(requestRecord.estimate.total)}`,
    `Special notes: ${requestRecord.notes || "None"}`,
    suggestedDriver
      ? `Suggested driver: ${suggestedDriver.name} | ${suggestedDriver.phone} | ${suggestedDriver.baseLocation}`
      : "Suggested driver: none yet",
  ].join("\n");
}

function createMailtoLink(operatorEmail, requestRecord, suggestedDriver) {
  const subject = `New On The Move request from ${requestRecord.customerName}`;
  const body = createRequestSummary(requestRecord, suggestedDriver);
  return `mailto:${encodeURIComponent(operatorEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyLastSummary() {
  if (!lastSummary || !ui.requestResultCopy) {
    return;
  }

  try {
    await navigator.clipboard.writeText(lastSummary);
    ui.requestResultCopy.textContent = "The request summary has been copied. You can paste it into WhatsApp, email, or your dispatch tools.";
  } catch (error) {
    ui.requestResultCopy.textContent = "Clipboard access was blocked by the browser, but the email draft link is still ready to use.";
  }
}

function getOperatorEmail() {
  const settings = loadSettings();

  if (ui.operatorEmailInput && ui.operatorEmailInput.value.trim()) {
    return ui.operatorEmailInput.value.trim();
  }

  return settings.operatorEmail || DEFAULT_SETTINGS.operatorEmail;
}

function loadSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...loadStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  };
}

function loadStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitAreas(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function todayIsoDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

function haversineKm(fromLocation, toLocation) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(toLocation.lat - fromLocation.lat);
  const dLon = degreesToRadians(toLocation.lon - fromLocation.lon);
  const lat1 = degreesToRadians(fromLocation.lat);
  const lat2 = degreesToRadians(toLocation.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
