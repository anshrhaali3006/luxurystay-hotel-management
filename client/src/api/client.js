const API_URL = import.meta.env.VITE_API_URL || '/api';
export function getToken() {
  return sessionStorage.getItem("luxurystay_token");
}
export function setToken(token) {
  if (token) sessionStorage.setItem("luxurystay_token", token);
  else sessionStorage.removeItem("luxurystay_token");
}
export async function api(
  path,
  { method = "GET", body, query, headers = {} } = {},
) {
const url = new URL(
  `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
  window.location.origin
);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const response = await fetch(url, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...headers,
    },
    ...(body !== undefined
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const d = json.error?.details,
      specific =
        Object.values(d?.fieldErrors || {}).flat()[0] || d?.formErrors?.[0];
    throw new Error(
      specific || json.error?.message || `Request failed (${response.status})`,
    );
  }
  const data = json.data ?? json;
  if (
    json.pagination &&
    data &&
    typeof data === "object" &&
    !("pagination" in data)
  )
    Object.defineProperty(data, "pagination", {
      value: json.pagination,
      enumerable: false,
    });
  return data;
}
export async function downloadFile(path, filename) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || "Unable to download file");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
