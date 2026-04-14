const STORAGE_KEYS = {
  requests: "otm_requests",
  settings: "otm_settings",
};

const TRUCK_TYPES = {
  bakkie: {
    label: "Bakkie / half-ton",
    base: 490,
    minimum: 750,
    includedKm: 8,
    localPerKm: 8,
    longPerKm: 10,
    includedMinutes: 120,
    handlingMinutes: 70,
    extraTimeRate: 120,
    floorRate: 45,
    helperRate: 180,
    order: 1,
  },
  "one-ton": {
    label: "1-ton truck",
    base: 690,
    minimum: 1050,
    includedKm: 10,
    localPerKm: 10,
    longPerKm: 13,
    includedMinutes: 150,
    handlingMinutes: 90,
    extraTimeRate: 170,
    floorRate: 60,
    helperRate: 210,
    order: 2,
  },
  "one-point-five-ton": {
    label: "1.5-ton truck",
    base: 960,
    minimum: 1450,
    includedKm: 12,
    localPerKm: 12,
    longPerKm: 16,
    includedMinutes: 180,
    handlingMinutes: 115,
    extraTimeRate: 220,
    floorRate: 75,
    helperRate: 240,
    order: 3,
  },
  "three-ton": {
    label: "3-ton truck",
    base: 1450,
    minimum: 2100,
    includedKm: 15,
    localPerKm: 15,
    longPerKm: 20,
    includedMinutes: 210,
    handlingMinutes: 140,
    extraTimeRate: 290,
    floorRate: 95,
    helperRate: 280,
    order: 4,
  },
};

const LOAD_DENSITY = {
  light: { label: "Light load", timeMinutes: -10, accessMultiplier: 0.92 },
  standard: { label: "Standard move", timeMinutes: 0, accessMultiplier: 1 },
  heavy: { label: "Heavy / bulky", timeMinutes: 30, accessMultiplier: 1.24 },
};

const PRICING_RULES = {
  longDistanceThresholdKm: 35,
  stairMinutesPerFloor: 8,
  helperTimeSavingsMinutes: 12,
  platformFee: 145,
  shortNoticePremium: 0.06,
  urgentPremium: 0.1,
  saturdayPremium: 0.06,
  sundayPremium: 0.1,
  monthEndPremium: 0.08,
  premiumCap: 0.22,
};

const DEFAULT_SETTINGS = {
  operatorEmail: "dispatch@onthemove.co.za",
};

const GEOAPIFY_ENDPOINTS = {
  autocomplete: "/api/geoapify-autocomplete",
  route: "/api/geoapify-route",
};

const NOTIFICATION_ENDPOINTS = {
  requestEmail: "/api/send-request-notification",
};

const AUTOCOMPLETE_MIN_CHARS = 3;

const ui = {
  requestForm: document.querySelector("#request-form"),
  operatorEmailInput: document.querySelector("#operator-email"),
  requestSubmitButton: document.querySelector("#request-submit"),
  estimateActions: document.querySelector("#estimate-actions"),
  estimateActionsTitle: document.querySelector("#estimate-actions-title"),
  estimateActionsCopy: document.querySelector("#estimate-actions-copy"),
  confirmRequestButton: document.querySelector("#confirm-request"),
  cancelRequestButton: document.querySelector("#cancel-request"),
  requestResult: document.querySelector("#request-result"),
  requestResultTitle: document.querySelector("#request-result-title"),
  requestResultCopy: document.querySelector("#request-result-copy"),
  requestResultActions: document.querySelector("#request-result-actions"),
  emailLink: document.querySelector("#email-link"),
  copySummaryButton: document.querySelector("#copy-summary"),
  quote: {
    title: document.querySelector("#quote-title"),
    total: document.querySelector("#quote-total"),
    distance: document.querySelector("#quote-distance"),
    truck: document.querySelector("#quote-truck"),
    base: document.querySelector("#breakdown-base"),
    distanceCharge: document.querySelector("#breakdown-distance"),
    time: document.querySelector("#breakdown-time"),
    helpers: document.querySelector("#breakdown-helpers"),
    access: document.querySelector("#breakdown-access"),
    schedule: document.querySelector("#breakdown-schedule"),
    minimum: document.querySelector("#breakdown-minimum"),
    service: document.querySelector("#breakdown-service"),
    message: document.querySelector("#quote-message"),
  },
  stats: {
    requests: document.querySelector("#stat-requests"),
    today: document.querySelector("#stat-today"),
    average: document.querySelector("#stat-average"),
  },
  lists: {
    requests: document.querySelector("#requests-list"),
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
let pendingRequestDraft = null;
let requestConfirmationInFlight = false;

init();

function init() {
  const settings = loadSettings();

  if (ui.operatorEmailInput) {
    ui.operatorEmailInput.value = settings.operatorEmail;
    ui.operatorEmailInput.addEventListener("input", handleOperatorEmailInput);
  }

  if (ui.requestForm) {
    ui.requestForm.addEventListener("submit", handleRequestSubmit);
    ui.requestForm.addEventListener("input", handleRequestFormMutation);
    ui.requestForm.addEventListener("change", handleRequestFormMutation);
    if (ui.requestForm.elements.moveDate) {
      ui.requestForm.elements.moveDate.value = todayIsoDate();
      ui.requestForm.elements.moveDate.min = todayIsoDate();
    }
    setupAddressAutocomplete("from", ui.addressFields.from);
    setupAddressAutocomplete("to", ui.addressFields.to);
  }

  if (ui.copySummaryButton) {
    ui.copySummaryButton.addEventListener("click", copyLastSummary);
  }

  if (ui.confirmRequestButton) {
    ui.confirmRequestButton.addEventListener("click", handleConfirmRequest);
  }

  if (ui.cancelRequestButton) {
    ui.cancelRequestButton.addEventListener("click", handleCancelRequest);
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

  const payload = getRequestPayloadFromForm();

  setRequestLoadingState(true);

  try {
    const route = await resolveDistance(payload);
    const estimate = calculateEstimate(payload, route);

    renderQuote(estimate, route, payload);
    pendingRequestDraft = {
      payload,
      route,
      estimate,
    };
    lastSummary = "";
    showEstimateActions(estimate);
    hideRequestStatus();
  } catch (error) {
    pendingRequestDraft = null;
    hideEstimateActions();
    renderErrorQuote(error.message);
  } finally {
    setRequestLoadingState(false);
  }
}

function getRequestPayloadFromForm() {
  const formData = new FormData(ui.requestForm);

  return {
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
}

function handleRequestFormMutation() {
  if (!pendingRequestDraft && (!ui.requestResult || ui.requestResult.hidden)) {
    return;
  }

  pendingRequestDraft = null;
  hideEstimateActions();
  hideRequestStatus();
  lastSummary = "";
}

async function handleConfirmRequest() {
  if (!pendingRequestDraft || requestConfirmationInFlight) {
    return;
  }

  requestConfirmationInFlight = true;
  setConfirmRequestLoadingState(true);

  const { payload, route, estimate } = pendingRequestDraft;
  const requestRecord = {
    id: createId("request"),
    createdAt: new Date().toISOString(),
    ...payload,
    route,
    estimate,
  };

  const requests = loadStorage(STORAGE_KEYS.requests, []);
  requests.unshift(requestRecord);
  saveStorage(STORAGE_KEYS.requests, requests);
  renderDashboard();

  lastSummary = createRequestSummary(requestRecord);

  if (ui.emailLink) {
    ui.emailLink.href = createMailtoLink(getOperatorEmail(), requestRecord);
  }

  try {
    await sendAutomatedNotification(requestRecord);
    showRequestStatus({
      title: "Request sent to On The Move",
      tone: "success",
      message: "The middleman has been notified by email and can now arrange a suitable truck or bakkie for the move. The backup draft is still available below if needed.",
      showActions: true,
    });
  } catch (error) {
    showRequestStatus({
      title: "Request saved, email needs attention",
      tone: "warning",
      message: `${error.message} The request is still saved, and the backup email draft below is ready to use.`,
      showActions: true,
    });
  } finally {
    pendingRequestDraft = null;
    hideEstimateActions();
    requestConfirmationInFlight = false;
    setConfirmRequestLoadingState(false);
    resetRequestForm();
  }
}

function handleCancelRequest() {
  if (!pendingRequestDraft || requestConfirmationInFlight) {
    return;
  }

  pendingRequestDraft = null;
  lastSummary = "";
  hideEstimateActions();
  showRequestStatus({
    title: "Estimate canceled",
    tone: "neutral",
    message: "Nothing was saved and no email was sent. Update any details you want and calculate again when you are ready.",
    showActions: false,
  });
}

function setRequestLoadingState(isLoading) {
  if (ui.requestSubmitButton) {
    ui.requestSubmitButton.disabled = isLoading;
    ui.requestSubmitButton.textContent = isLoading ? "Calculating..." : "Calculate estimate";
  }

  if (ui.requestResult && isLoading) {
    ui.requestResult.hidden = true;
  }
}

function setConfirmRequestLoadingState(isLoading) {
  if (ui.confirmRequestButton) {
    ui.confirmRequestButton.disabled = isLoading;
    ui.confirmRequestButton.textContent = isLoading ? "Sending request..." : "Send request";
  }

  if (ui.cancelRequestButton) {
    ui.cancelRequestButton.disabled = isLoading;
  }
}

function showEstimateActions(estimate) {
  if (!ui.estimateActions) {
    return;
  }

  if (ui.estimateActionsTitle) {
    ui.estimateActionsTitle.textContent = "Ready to request this move?";
  }

  if (ui.estimateActionsCopy) {
    ui.estimateActionsCopy.textContent = `This estimate is ready at ${formatCurrency(estimate.total)}. Confirm now to save the request and notify the middleman so they can arrange a suitable truck or bakkie for you.`;
  }

  ui.estimateActions.hidden = false;
}

function hideEstimateActions() {
  if (ui.estimateActions) {
    ui.estimateActions.hidden = true;
  }

  setConfirmRequestLoadingState(false);
}

function showRequestStatus({ title, message, tone = "neutral", showActions = false }) {
  if (!ui.requestResult) {
    return;
  }

  ui.requestResult.dataset.tone = tone;

  if (ui.requestResultTitle) {
    ui.requestResultTitle.textContent = title;
  }

  if (ui.requestResultCopy) {
    ui.requestResultCopy.textContent = message;
  }

  if (ui.requestResultActions) {
    ui.requestResultActions.hidden = !showActions;
  }

  ui.requestResult.hidden = false;
}

function hideRequestStatus() {
  if (!ui.requestResult) {
    return;
  }

  ui.requestResult.hidden = true;
  delete ui.requestResult.dataset.tone;

  if (ui.requestResultActions) {
    ui.requestResultActions.hidden = false;
  }
}

function resetRequestForm() {
  if (!ui.requestForm) {
    return;
  }

  ui.requestForm.reset();
  resetAddressAutocompleteField(ui.addressFields.from);
  resetAddressAutocompleteField(ui.addressFields.to);

  if (ui.requestForm.elements.moveDate) {
    ui.requestForm.elements.moveDate.value = todayIsoDate();
    ui.requestForm.elements.moveDate.min = todayIsoDate();
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

function calculateEstimate(payload, route) {
  const truck = TRUCK_TYPES[payload.truckSize];
  const loadProfile = LOAD_DENSITY[payload.loadDensity] || LOAD_DENSITY.standard;
  const distanceKm = Math.max(0, Number(route.distanceKm) || 0);
  const stairCount = Math.max(0, payload.pickupFloor) + Math.max(0, payload.dropoffFloor);
  const localDistanceKm = Math.max(0, Math.min(distanceKm, PRICING_RULES.longDistanceThresholdKm) - truck.includedKm);
  const longDistanceKm = Math.max(0, distanceKm - PRICING_RULES.longDistanceThresholdKm);
  const distanceCharge = localDistanceKm * truck.localPerKm + longDistanceKm * truck.longPerKm;
  const helperFee = payload.helpers * truck.helperRate;
  const routeMinutes = getRouteMinutes(route, distanceKm);
  const baseHandlingMinutes =
    truck.handlingMinutes +
    loadProfile.timeMinutes +
    stairCount * PRICING_RULES.stairMinutesPerFloor;
  const helperTimeSavings = Math.min(
    Math.max(0, baseHandlingMinutes) * 0.25,
    payload.helpers * PRICING_RULES.helperTimeSavingsMinutes
  );
  const estimatedJobMinutes = routeMinutes + Math.max(35, baseHandlingMinutes - helperTimeSavings);
  const overageMinutes = Math.max(0, estimatedJobMinutes - truck.includedMinutes);
  const timeCharge = Math.ceil(overageMinutes / 30) * truck.extraTimeRate;
  const accessFee = stairCount * truck.floorRate * loadProfile.accessMultiplier;
  const schedule = getScheduleBreakdown(payload.moveDate);
  const serviceFee = PRICING_RULES.platformFee;
  const subtotal =
    truck.base +
    distanceCharge +
    timeCharge +
    helperFee +
    accessFee;
  const scheduleFee = subtotal * schedule.multiplier;
  const minimumCharge = Math.max(0, truck.minimum - (subtotal + scheduleFee + serviceFee));
  const total = subtotal + scheduleFee + minimumCharge + serviceFee;

  return {
    total: Math.round(total),
    base: Math.round(truck.base),
    distanceCharge: Math.round(distanceCharge),
    timeCharge: Math.round(timeCharge),
    helperFee: Math.round(helperFee),
    accessFee: Math.round(accessFee),
    scheduleFee: Math.round(scheduleFee),
    minimumCharge: Math.round(minimumCharge),
    serviceFee: Math.round(serviceFee),
    routeMinutes: Math.round(routeMinutes),
    estimatedJobMinutes: Math.round(estimatedJobMinutes),
    includedMinutes: truck.includedMinutes,
    includedKm: truck.includedKm,
    scheduleLabel: schedule.label,
  };
}

function renderQuote(estimate, route, payload) {
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
  ui.quote.distance.textContent =
    route.durationMinutes || estimate.routeMinutes
      ? `${route.distanceKm.toFixed(1)} km - ${routeSourceLabel} - ${
          route.durationMinutes ? route.durationMinutes : `about ${estimate.routeMinutes}`
        } min`
      : `${route.distanceKm.toFixed(1)} km - ${routeSourceLabel}`;
  ui.quote.truck.textContent = TRUCK_TYPES[payload.truckSize].label;
  ui.quote.base.textContent = formatCurrency(estimate.base);
  ui.quote.distanceCharge.textContent = formatCurrency(estimate.distanceCharge);
  ui.quote.time.textContent = formatCurrency(estimate.timeCharge);
  ui.quote.helpers.textContent = formatCurrency(estimate.helperFee);
  ui.quote.access.textContent = formatCurrency(estimate.accessFee);
  ui.quote.schedule.textContent = formatCurrency(estimate.scheduleFee);
  ui.quote.minimum.textContent = formatCurrency(estimate.minimumCharge);
  ui.quote.service.textContent = formatCurrency(estimate.serviceFee);
  ui.quote.message.textContent = createQuoteMessage(estimate);
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
  ui.quote.time.textContent = "R0";
  ui.quote.helpers.textContent = "R0";
  ui.quote.access.textContent = "R0";
  ui.quote.schedule.textContent = "R0";
  ui.quote.minimum.textContent = "R0";
  ui.quote.service.textContent = "R0";
  ui.quote.message.textContent = message;
}

function renderDashboard() {
  const requests = loadStorage(STORAGE_KEYS.requests, []);

  if (ui.stats.requests) {
    ui.stats.requests.textContent = String(requests.length);
  }

  if (ui.stats.today) {
    ui.stats.today.textContent = String(countTodayRequests(requests));
  }

  if (ui.stats.average) {
    ui.stats.average.textContent = requests.length ? formatCurrency(getAverageQuote(requests)) : "R0";
  }

  renderRequestList(requests);
}

function renderRequestList(requests) {
  if (!ui.lists.requests) {
    return;
  }

  if (!requests.length) {
    ui.lists.requests.innerHTML =
      '<div class="empty-state">No requests yet. The first confirmed customer request will appear here for operator follow-up.</div>';
    return;
  }

  ui.lists.requests.innerHTML = requests
    .map((request) => {
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
            <span class="tag tag-teal">Operator follow-up needed</span>
            <span class="tag">Move date: ${escapeHtml(request.moveDate || "Not set")}</span>
          </div>
          <div class="tag-row">
            <span class="tag">${escapeHtml(request.customerPhone)}</span>
            <span class="tag">${request.helpers} helper(s)</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function countTodayRequests(requests) {
  const today = todayIsoDate();

  return requests.filter((request) => {
    const createdAt = new Date(request.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return false;
    }

    return createdAt.toISOString().slice(0, 10) === today;
  }).length;
}

function getAverageQuote(requests) {
  if (!requests.length) {
    return 0;
  }

  const total = requests.reduce((sum, request) => sum + Number(request.estimate?.total || 0), 0);
  return Math.round(total / requests.length);
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

function createRequestSummary(requestRecord) {
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
    `Operator action: Source a suitable truck or bakkie and contact the customer`,
    `Special notes: ${requestRecord.notes || "None"}`,
  ].join("\n");
}

function createQuoteMessage(estimate) {
  const details = [
    `Includes the first ${estimate.includedKm} km and about ${formatMinutes(estimate.includedMinutes)} of crew time for this vehicle size.`,
  ];

  if (estimate.scheduleFee > 0 && estimate.scheduleLabel) {
    details.push(`${estimate.scheduleLabel} premium is included in this estimate.`);
  }

  if (estimate.minimumCharge > 0) {
    details.push("A minimum trip charge applies so short moves still cover dispatch and scheduling time.");
  }

  details.push("Once confirmed, this request is sent to the middleman so they can arrange the right truck or bakkie for the move.");

  return details.join(" ");
}

async function sendAutomatedNotification(requestRecord) {
  const response = await fetch(NOTIFICATION_ENDPOINTS.requestEmail, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      requestId: requestRecord.id,
      subject: createNotificationSubject(requestRecord),
      customerEmail: requestRecord.customerEmail,
      summary: createRequestSummary(requestRecord),
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Automatic operator email could not be sent from this deployment.");
  }

  return payload;
}

function createNotificationSubject(requestRecord) {
  return `New On The Move request from ${requestRecord.customerName}`;
}

function createMailtoLink(operatorEmail, requestRecord) {
  const subject = createNotificationSubject(requestRecord);
  const body = createRequestSummary(requestRecord);
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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) {
    return `${remainder} min`;
  }

  if (!remainder) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
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

function getRouteMinutes(route, distanceKm) {
  if (route.durationMinutes) {
    return Number(route.durationMinutes);
  }

  if (route.staticDurationMinutes) {
    return Number(route.staticDurationMinutes);
  }

  const averageSpeedKmh = distanceKm > 40 ? 55 : 35;
  return Math.max(15, Math.round((distanceKm / averageSpeedKmh) * 60));
}

function getScheduleBreakdown(moveDate) {
  if (!moveDate) {
    return { multiplier: 0, label: "Standard weekday rate" };
  }

  const moveDateTime = new Date(`${moveDate}T12:00:00`);

  if (Number.isNaN(moveDateTime.getTime())) {
    return { multiplier: 0, label: "Standard weekday rate" };
  }

  const labels = [];
  let multiplier = 0;
  const hoursUntilMove = (moveDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const weekday = moveDateTime.getDay();
  const lastDayOfMonth = new Date(
    moveDateTime.getFullYear(),
    moveDateTime.getMonth() + 1,
    0
  ).getDate();
  const isMonthEndWindow =
    moveDateTime.getDate() >= lastDayOfMonth - 2 ||
    moveDateTime.getDate() <= 2;

  if (hoursUntilMove <= 36) {
    multiplier += PRICING_RULES.urgentPremium;
    labels.push("urgent booking");
  } else if (hoursUntilMove <= 72) {
    multiplier += PRICING_RULES.shortNoticePremium;
    labels.push("short-notice booking");
  }

  if (weekday === 6) {
    multiplier += PRICING_RULES.saturdayPremium;
    labels.push("Saturday demand");
  } else if (weekday === 0) {
    multiplier += PRICING_RULES.sundayPremium;
    labels.push("Sunday demand");
  }

  if (isMonthEndWindow) {
    multiplier += PRICING_RULES.monthEndPremium;
    labels.push("month-end demand");
  }

  return {
    multiplier: Math.min(multiplier, PRICING_RULES.premiumCap),
    label: labels.length ? labels.join(" + ") : "Standard weekday rate",
  };
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
