const EXTENSION_ID = "pl.codesymfony.omniport-http-ext";
const DEFAULT_ENDPOINT = "https://jsonplaceholder.typicode.com/posts";

const fetchButton = document.querySelector("#fetchButton");
const endpoint = document.querySelector("#endpoint");
const disableReuse = document.querySelector("#disableReuse");
const statusBadge = document.querySelector("#status");
const response = document.querySelector("#response");

let activeRequestId = null;

endpoint.value = DEFAULT_ENDPOINT;

function setStatus(kind, text) {
  statusBadge.className = `status ${kind}`;
  statusBadge.textContent = text;
}

function getEndpoint() {
  const value = endpoint.value.trim();
  if (!value) {
    throw new Error("Podaj adres endpointu.");
  }

  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Endpoint musi zaczynac sie od http:// albo https://.");
  }
  return url.href;
}

function formatTimings(timings) {
  if (!timings) {
    return [];
  }

  const reused = timings.reusedConnection ? "tak" : "nie";
  const reuseDisabled = timings.disableReuse ? "tak" : "nie";
  return [
    "Trace:",
    `  total: ${timings.totalMs} ms`,
    `  DNS: ${timings.dnsMs} ms`,
    `  connect: ${timings.connectMs} ms`,
    `  TLS handshake: ${timings.tlsHandshakeMs} ms`,
    `  got connection: ${timings.gotConnectionMs} ms`,
    `  time to first byte: ${timings.timeToFirstByteMs} ms`,
    `  body read: ${timings.bodyReadMs} ms`,
    `  reused connection: ${reused}`,
    `  forced new connection: ${reuseDisabled}`
  ];
}

function showResponse(payload) {
  const contentType = payload.headers?.["content-type"] || "";
  let body = payload.body;

  if (contentType.includes("application/json")) {
    try {
      body = JSON.stringify(JSON.parse(payload.body), null, 2);
    } catch {
      body = payload.body;
    }
  }

  response.textContent = [
    `HTTP ${payload.status} ${payload.statusText}`,
    `URL: ${payload.url}`,
    `Czas: ${payload.elapsedMs} ms`,
    ...formatTimings(payload.timings),
    "",
    body
  ].join("\n");
}

async function fetchPosts() {
  let url;
  try {
    url = getEndpoint();
  } catch (error) {
    setStatus("error", "Blad");
    response.textContent = error.message;
    endpoint.focus();
    return;
  }

  activeRequestId = globalThis.crypto?.randomUUID?.() || String(Date.now());
  fetchButton.disabled = true;
  endpoint.disabled = true;
  disableReuse.disabled = true;
  setStatus("loading", "Pobieranie");
  response.textContent = "Extension wykonuje request...";

  try {
    await Neutralino.extensions.dispatch(EXTENSION_ID, "fetchPosts", {
      requestId: activeRequestId,
      url,
      disableReuse: disableReuse.checked
    });
  } catch (error) {
    fetchButton.disabled = false;
    endpoint.disabled = false;
    disableReuse.disabled = false;
    setStatus("error", "Blad");
    response.textContent = `Nie udalo sie wyslac zdarzenia do extension:\n${error.message || error}`;
  }
}

Neutralino.events.on("httpFetchResult", (event) => {
  const payload = event.detail;
  if (payload.requestId !== activeRequestId) {
    return;
  }

  fetchButton.disabled = false;
  endpoint.disabled = false;
  disableReuse.disabled = false;
  setStatus("ok", `HTTP ${payload.status}`);
  showResponse(payload);
});

Neutralino.events.on("httpFetchError", (event) => {
  const payload = event.detail;
  if (payload.requestId !== activeRequestId) {
    return;
  }

  fetchButton.disabled = false;
  endpoint.disabled = false;
  disableReuse.disabled = false;
  setStatus("error", "Blad");
  response.textContent = payload.message || "Extension zwrocil nieznany blad.";
});

Neutralino.events.on("ready", () => {
  fetchButton.disabled = false;
  setStatus("idle", "Gotowe");
});

fetchButton.addEventListener("click", fetchPosts);
endpoint.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    fetchPosts();
  }
});
fetchButton.disabled = true;

Neutralino.init();
