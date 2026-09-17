/**
 * Stage 9 — renders whatever /api/comparisons returned (Stage 7 exact
 * comparison + Stage 8 calculation validation). The "explanation" text
 * here is template-based, not AI — Stage 11 is where an AI-generated
 * explanation can replace or augment these strings without changing
 * this page's structure.
 */

const STATUS_ICON = { match: "✅", mismatch: "❌", warning: "⚠️", "semantic-match": "🤖" };

async function init() {
  if (!requireAuth()) return; // redirects to login.html if not signed in
  renderAccountBar();

  const params = new URLSearchParams(window.location.search);
  const comparisonId = params.get("id");

  if (comparisonId) {
    await loadFromHistory(comparisonId);
    return;
  }

  const raw = sessionStorage.getItem("comparisonResult");
  if (!raw) {
    document.getElementById("resultsEmpty").hidden = false;
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    document.getElementById("resultsEmpty").hidden = false;
    return;
  }

  const { comparedDocuments, skippedDocuments, report } = payload;
  renderAll(comparedDocuments, skippedDocuments, report);
}

/** Loads a past comparison by id (Stage 14 — linked from history.html). */
async function loadFromHistory(comparisonId) {
  try {
    const response = await fetch(`${API_BASE_URL}/comparisons/${comparisonId}`, {
      headers: { ...authHeader() },
    });

    if (response.status === 401) {
      clearAuth();
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Could not load this comparison.");
    }

    renderAll(data.documentNames, [], data.report);
  } catch (err) {
    const emptyEl = document.getElementById("resultsEmpty");
    emptyEl.hidden = false;
    emptyEl.querySelector("p").textContent = err.message || "Could not load this comparison.";
  }
}

function renderAll(comparedDocuments, skippedDocuments, report) {
  document.getElementById("resultsContent").hidden = false;

  renderSubtitle(comparedDocuments);
  renderSummary(report.summary);
  renderNotes(skippedDocuments);
  renderFieldTable(
    "documentFieldsTable",
    "Document Fields",
    comparedDocuments,
    report.documentFieldResults
  );
  renderLineItems(comparedDocuments, report.lineItemResults);
  renderCalculationIssues(comparedDocuments, report.calculationIssues);
  renderDiscrepancies(comparedDocuments, report);
}

function renderSubtitle(names) {
  document.getElementById("resultsSubtitle").textContent = names.join("  vs.  ");
}

function renderSummary(summary) {
  const stats = [
    { label: "Documents Reviewed", value: summary.documentsReviewed, cls: "" },
    { label: "Fields Checked", value: summary.fieldsChecked, cls: "" },
    { label: "Matches", value: summary.matches, cls: "stat--matches" },
    { label: "Warnings", value: summary.warnings, cls: "stat--warnings" },
    { label: "Errors", value: summary.errors, cls: "stat--errors" },
  ];

  const container = document.getElementById("summaryStrip");
  container.innerHTML = stats
    .map(
      (s) => `
        <div class="stat ${s.cls}">
          <div class="stat__value">${s.value}</div>
          <div class="stat__label">${s.label}</div>
        </div>`
    )
    .join("");
}

function renderNotes(skippedDocuments) {
  const container = document.getElementById("extractionNotes");
  if (!skippedDocuments || skippedDocuments.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = skippedDocuments
    .map(
      (d) =>
        `<div class="note-item">"${escapeHtml(d.originalName)}" wasn't included in this comparison — ${escapeHtml(d.reason || "its contents couldn't be read.")}</div>`
    )
    .join("");
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") {
    return `<span class="value-cell--empty">—</span>`;
  }
  return escapeHtml(String(value));
}

function renderResultBadge(fieldResult) {
  const labels = { match: "Match", mismatch: "Mismatch", "semantic-match": "AI Match" };
  return `
    <span class="result-badge result-badge--${fieldResult.status}">
      ${STATUS_ICON[fieldResult.status]} ${labels[fieldResult.status]}
    </span>
    ${fieldResult.difference !== undefined ? `<span class="diff-note">Diff: ${escapeHtml(fieldResult.difference)}</span>` : ""}
    ${fieldResult.status === "semantic-match" && fieldResult.aiExplanation ? `<span class="diff-note">${escapeHtml(fieldResult.aiExplanation)}</span>` : ""}
  `;
}

function fieldResultsToTableHtml(docNames, fieldResults) {
  if (fieldResults.length === 0) {
    return `<tbody><tr><td colspan="${docNames.length + 2}" class="value-cell">No comparable fields found.</td></tr></tbody>`;
  }

  const head = `
    <thead>
      <tr>
        <th>Field</th>
        ${docNames.map((name) => `<th>${escapeHtml(name)}</th>`).join("")}
        <th>Result</th>
      </tr>
    </thead>`;

  const rows = fieldResults
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(labelForField(r.field))}</td>
          ${r.values.map((v) => `<td class="value-cell">${formatValue(v)}</td>`).join("")}
          <td>${renderResultBadge(r)}</td>
        </tr>`
    )
    .join("");

  return `${head}<tbody>${rows}</tbody>`;
}

function renderFieldTable(tableId, _title, docNames, fieldResults) {
  document.getElementById(tableId).innerHTML = fieldResultsToTableHtml(docNames, fieldResults);
}

function renderLineItems(docNames, lineItemResults) {
  const section = document.getElementById("lineItemsSection");
  if (!lineItemResults || lineItemResults.length === 0) {
    section.innerHTML = "";
    return;
  }

  section.innerHTML = lineItemResults
    .map(
      (item) => `
        <h2 class="dashboard__title">Line Item ${item.index + 1}</h2>
        <div class="table-scroll">
          <table class="data-table">${fieldResultsToTableHtml(docNames, item.fields)}</table>
        </div>`
    )
    .join("");
}

function renderCalculationIssues(docNames, issues) {
  const section = document.getElementById("calcSection");
  if (!issues || issues.length === 0) {
    section.innerHTML = "";
    return;
  }

  const rows = issues
    .map((issue) => {
      const docLabel = docNames[issue.documentIndex] ?? `Document ${issue.documentIndex + 1}`;
      const scopeLabel =
        issue.scope === "lineItem" ? `Line item ${(issue.lineItemIndex ?? 0) + 1}` : "Document total";
      return `
        <tr>
          <td>${escapeHtml(docLabel)}</td>
          <td>${escapeHtml(scopeLabel)}</td>
          <td>${escapeHtml(issue.rule)}</td>
          <td class="value-cell">${issue.expected}</td>
          <td class="value-cell">${issue.actual}</td>
          <td>
            <span class="result-badge result-badge--warning">${STATUS_ICON.warning} Warning</span>
            <span class="diff-note">Diff: ${issue.difference}</span>
            ${issue.aiExplanation ? `<span class="diff-note">${escapeHtml(issue.aiExplanation)}</span>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  section.innerHTML = `
    <h2 class="dashboard__title">Calculation Checks</h2>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Scope</th>
            <th>Rule</th>
            <th>Expected</th>
            <th>Document Shows</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderDiscrepancies(docNames, report) {
  const items = [];

  const collectFieldMismatches = (results, contextLabel) => {
    results
      .filter((r) => r.status === "mismatch")
      .forEach((r) => {
        if (r.aiExplanation) {
          items.push({
            severity: "error",
            title: `${labelForField(r.field)} does not match${contextLabel ? ` (${contextLabel})` : ""}`,
            body: r.aiExplanation,
          });
          return;
        }
        const parts = r.values.map(
          (v, i) => `${docNames[i]} shows ${v === undefined || v === null || v === "" ? "no value" : formatPlain(v)}`
        );
        items.push({
          severity: "error",
          title: `${labelForField(r.field)} does not match${contextLabel ? ` (${contextLabel})` : ""}`,
          body:
            parts.join("; ") +
            (r.difference !== undefined ? `. Difference: ${r.difference}.` : ".") +
            " Please verify which value is correct.",
        });
      });
  };

  collectFieldMismatches(report.documentFieldResults, "");
  report.lineItemResults.forEach((li) =>
    collectFieldMismatches(li.fields, `line item ${li.index + 1}`)
  );

  (report.calculationIssues || []).forEach((issue) => {
    const docLabel = docNames[issue.documentIndex] ?? `Document ${issue.documentIndex + 1}`;
    const scopeLabel =
      issue.scope === "lineItem" ? ` (line item ${(issue.lineItemIndex ?? 0) + 1})` : "";
    items.push({
      severity: "warning",
      title: `Calculation doesn't add up in ${docLabel}${scopeLabel}`,
      body:
        issue.aiExplanation ||
        `${docLabel} states ${issue.rule}, expecting ${issue.expected}, but the document shows ${issue.actual} (difference: ${issue.difference}). Please double-check this document.`,
    });
  });

  const container = document.getElementById("discrepancyList");
  const emptyEl = document.getElementById("discrepancyEmpty");

  if (items.length === 0) {
    container.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  container.innerHTML = items
    .map(
      (item) => `
        <div class="discrepancy-item discrepancy-item--${item.severity}">
          <div class="discrepancy-item__title">${STATUS_ICON[item.severity === "error" ? "mismatch" : "warning"]} ${escapeHtml(item.title)}</div>
          <div class="discrepancy-item__body">${escapeHtml(item.body)}</div>
        </div>`
    )
    .join("");
}

function labelForField(fieldKey) {
  const overrides = {
    poNumber: "PO Number",
    hsCode: "HS Code",
    unitPrice: "Unit Price",
    totalAmount: "Total Amount",
    invoiceNumber: "Invoice Number",
    containerNumber: "Container Number",
    shippingTerms: "Shipping Terms",
    grossWeight: "Gross Weight",
    netWeight: "Net Weight",
  };
  if (overrides[fieldKey]) return overrides[fieldKey];
  // camelCase -> Title Case fallback for anything not explicitly listed above.
  return fieldKey
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatPlain(value) {
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
