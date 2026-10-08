function init() {
  if (!requireAuth()) return;
  renderAccountBar();
  loadHistory();

  // Stage 17: one delegated handler for every row's Export CSV button.
  document.getElementById("historyBody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-export-id]");
    if (!button) return;
    button.disabled = true;
    try {
      await downloadComparisonCsv(button.dataset.exportId);
    } catch (err) {
      alert(err.message || "Could not export this comparison.");
    } finally {
      button.disabled = false;
    }
  });
}

async function loadHistory() {
  const loadingEl = document.getElementById("historyLoading");
  const emptyEl = document.getElementById("historyEmpty");
  const tableEl = document.getElementById("historyTable");
  const bodyEl = document.getElementById("historyBody");

  try {
    const response = await fetch(`${API_BASE_URL}/comparisons`, {
      headers: { ...authHeader() },
    });

    if (response.status === 401) {
      clearAuth();
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to load comparison history.");
    }

    loadingEl.hidden = true;

    if (data.comparisons.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    tableEl.hidden = false;
    bodyEl.innerHTML = data.comparisons.map(renderRow).join("");
  } catch (err) {
    loadingEl.textContent = err.message || "Failed to load comparison history.";
  }
}

function renderRow(item) {
  const date = new Date(item.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `
    <tr>
      <td class="value-cell">${escapeHtml(date)}</td>
      <td class="history__doc-names">${escapeHtml(item.documentNames.join(", "))}</td>
      <td class="value-cell">${item.fieldsChecked}</td>
      <td class="value-cell">${item.matches}</td>
      <td class="value-cell">${item.warnings}</td>
      <td class="value-cell">${item.errors}</td>
      <td><a class="history__view-link" href="results.html?id=${item.id}">View details &rarr;</a></td>
      <td><button type="button" class="history__export-btn" data-export-id="${item.id}">Export CSV</button></td>
    </tr>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
