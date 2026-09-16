/**
 * Talks to the Node.js backend. Kept deliberately tiny — no framework,
 * just fetch(). Update API_BASE_URL if the backend runs somewhere other
 * than the Stage 3 default.
 */
const API_BASE_URL = "http://localhost:4000/api";

/** Redirects to login and throws, so callers can just `await` and stop caring. */
function handleUnauthorized() {
  if (typeof clearAuth === "function") clearAuth();
  window.location.href = "login.html";
  throw new Error("Session expired. Please sign in again.");
}

async function uploadDocuments(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("documents", file));

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    headers: { ...authHeader() },
    body: formData,
  });

  if (response.status === 401) return handleUnauthorized();

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Upload failed.");
  }
  return data; // { message, documents: [{ originalName, fields, extractionError, extractionNote, ... }] }
}

async function runComparison(payload) {
  const response = await fetch(`${API_BASE_URL}/comparisons`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) return handleUnauthorized();

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Comparison failed.");
  }
  return data; // ComparisonReport
}
