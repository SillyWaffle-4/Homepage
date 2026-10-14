const SETTINGS_FILE_NAME = "new-tab-dashboard-settings.json";
const SETTINGS_KEYS = [
  "dash-layouts",
  "dash-visible",
  "dash-saved-layouts",
  "dash-font",
  "dash-theme",
  "dash-city",
  "dash-name",
  "dash-workspace",
  "dash-clock",
  "dash-unit",
  "dash-appearance",
  "dash-topbar-hidden",
  "dash-seconds",
  "dash-view",
  "planner_categories",
  "planner-calendar-default-view",
  "planner-show-one-more",
];

export function readDashboardSettings() {
  return Object.fromEntries(SETTINGS_KEYS
    .filter(key => localStorage.getItem(key) !== null)
    .map(key => [key, localStorage.getItem(key)]));
}

export function applyDashboardSettings(settings) {
  for (const key of SETTINGS_KEYS) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(settings || {})) {
    if (SETTINGS_KEYS.includes(key) && typeof value === "string") localStorage.setItem(key, value);
  }
}

async function driveRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Google needs permission to save your dashboard settings. Reconnect and approve the new Drive app-data permission."
    : "Google could not save your dashboard settings. Your browser copy is still available.");
  return response;
}

export async function syncDashboardSettings(token) {
  const query = new URLSearchParams({
    q: `name='${SETTINGS_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`,
    spaces: "appDataFolder",
    fields: "files(id,name)",
    pageSize: "10",
  });
  const listed = await driveRequest(`https://www.googleapis.com/drive/v3/files?${query}`, token);
  const files = (await listed.json()).files || [];
  const file = files.find(item => item.name === SETTINGS_FILE_NAME);
  const localSettings = readDashboardSettings();

  if (!file) {
    const boundary = `dashboard_settings_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: SETTINGS_FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] });
    const data = JSON.stringify({ version: 1, settings: localSettings });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${data}\r\n`,
      `--${boundary}--`,
    ]);
    const created = await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", token, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return { fileId: (await created.json()).id, hydrated: false };
  }

  const downloaded = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, token);
  const document = await downloaded.json();
  const cloudSettings = document?.version === 1 && document.settings && typeof document.settings === "object"
    ? document.settings
    : {};
  if (JSON.stringify(cloudSettings) !== JSON.stringify(localSettings)) {
    applyDashboardSettings(cloudSettings);
    return { fileId: file.id, hydrated: true };
  }
  return { fileId: file.id, hydrated: false };
}

export async function saveDashboardSettings(token, fileId) {
  const document = JSON.stringify({ version: 1, settings: readDashboardSettings() });
  await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: document,
  });
}
