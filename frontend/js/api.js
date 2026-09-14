/**
 * Talks to the Node.js backend. Kept deliberately tiny — no framework,
 * just fetch(). Update API_BASE_URL if the backend runs somewhere other
 * than the Stage 3 default.
 */
const API_BASE_URL = "http://localhost:4000/api";

async function uploadDocuments(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("documents", file));

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Upload failed.");
  }
  return data; // { message, documents: [{ originalName, fields, extractionError, extractionNote, ... }] }
}

async function runComparison(documentsFields) {
  const response = await fetch(`${API_BASE_URL}/comparisons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents: documentsFields }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Comparison failed.");
  }
  return data; // ComparisonReport
}
