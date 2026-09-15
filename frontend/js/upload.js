/**
 * Stage 2 — Upload page behaviour.
 * Pure client-side: renders upload slots, validates file type/size,
 * and keeps a "manifest" table in sync. No network calls yet —
 * wiring to the Node.js backend happens in Stage 3/4.
 */

const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "docx", "jpg", "jpeg", "png"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // keep in sync with backend/.env.example MAX_UPLOAD_SIZE_MB
const MIN_DOCUMENTS_REQUIRED = 2;

/** @type {{id: number, file: File|null, status: 'empty'|'ready'|'error', error: string|null}[]} */
let slots = [];
let nextSlotId = 0;
let activeSlotId = null; // which slot the hidden <input type="file"> is currently filling

const slotsEl = document.getElementById("slots");
const addSlotBtn = document.getElementById("addSlotBtn");
const fileInput = document.getElementById("fileInput");
const manifestCountEl = document.getElementById("manifestCount");
const manifestEmptyEl = document.getElementById("manifestEmpty");
const manifestTableEl = document.getElementById("manifestTable");
const manifestBodyEl = document.getElementById("manifestBody");
const errorListEl = document.getElementById("errorList");
const compareBtn = document.getElementById("compareBtn");
const footerHintEl = document.getElementById("footerHint");
const maxSizeLabelEl = document.getElementById("maxSizeLabel");

function init() {
  maxSizeLabelEl.textContent = `${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}\u00A0MB`;
  addSlot();
  addSlot();
  render();

  addSlotBtn.addEventListener("click", () => {
    addSlot();
    render();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && activeSlotId !== null) {
      assignFileToSlot(activeSlotId, file);
    }
    fileInput.value = ""; // allow re-selecting the same file later
    render();
  });

  compareBtn.addEventListener("click", async () => {
    const readyFiles = slots.filter((s) => s.status === "ready").map((s) => s.file);

    compareBtn.disabled = true;
    compareBtn.textContent = "Comparing…";
    clearSubmitError();

    try {
      const uploadResult = await uploadDocuments(readyFiles);
      const documentsMeta = uploadResult.documents;

      const withFields = documentsMeta.filter((d) => d.fields);
      const skipped = documentsMeta.filter((d) => !d.fields);
      if (withFields.length < MIN_DOCUMENTS_REQUIRED) {
        throw new Error(
          "At least 2 documents need readable content to compare. " +
          "Word documents and images aren't supported yet (coming in a later stage)."
        );
      }

      const report = await runComparison(
        withFields.map((d) => d.fields),
        withFields.map((d) => d.originalName)
      );

      sessionStorage.setItem(
        "comparisonResult",
        JSON.stringify({
          // Order matches the `documents` array sent to /api/comparisons,
          // so index i here is index i in every report.values array.
          comparedDocuments: withFields.map((d) => d.originalName),
          skippedDocuments: skipped.map((d) => ({
            originalName: d.originalName,
            reason: d.extractionNote || d.extractionError,
          })),
          report,
        })
      );

      window.location.href = "results.html";
    } catch (err) {
      showSubmitError(err.message || "Something went wrong while comparing documents.");
      compareBtn.disabled = false;
      compareBtn.textContent = "Compare Documents →";
    }
  });
}

function showSubmitError(message) {
  const div = document.createElement("div");
  div.className = "error-item";
  div.textContent = message;
  errorListEl.appendChild(div);
}

function clearSubmitError() {
  errorListEl.innerHTML = "";
}

function addSlot() {
  slots.push({ id: nextSlotId++, file: null, status: "empty", error: null });
}

function getExtension(filename) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  const ext = getExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" is a .${ext || "?"} file. Accepted types: ${ACCEPTED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `"${file.name}" is ${formatSize(file.size)}, which is over the ${formatSize(MAX_FILE_SIZE_BYTES)} limit.`;
  }
  if (file.size === 0) {
    return `"${file.name}" appears to be empty.`;
  }
  return null;
}

function assignFileToSlot(slotId, file) {
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return;
  const error = validateFile(file);
  slot.file = file;
  slot.status = error ? "error" : "ready";
  slot.error = error;
}

function clearSlot(slotId) {
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return;
  slot.file = null;
  slot.status = "empty";
  slot.error = null;
}

function openPickerForSlot(slotId) {
  activeSlotId = slotId;
  fileInput.click();
}

function render() {
  renderSlots();
  renderManifest();
  renderErrors();
  renderFooter();
}

function renderSlots() {
  slotsEl.innerHTML = "";

  slots.forEach((slot, index) => {
    const el = document.createElement("div");
    el.className = "slot" + (slot.status !== "empty" ? " slot--filled" : "");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute(
      "aria-label",
      slot.status === "empty"
        ? `Upload document ${index + 1}`
        : `Document ${index + 1}: ${slot.file.name}`
    );

    if (slot.status === "empty") {
      el.innerHTML = `
        <div class="slot__index">DOC ${String(index + 1).padStart(2, "0")}</div>
        <div class="slot__label"><strong>Click to upload</strong> or drag a file here</div>
      `;
      el.addEventListener("click", () => openPickerForSlot(slot.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPickerForSlot(slot.id);
        }
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("slot--dragover");
      });
      el.addEventListener("dragleave", () => el.classList.remove("slot--dragover"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("slot--dragover");
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
          assignFileToSlot(slot.id, file);
          render();
        }
      });
    } else {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "slot__remove";
      removeBtn.innerHTML = "&times;";
      removeBtn.setAttribute("aria-label", `Remove ${slot.file.name}`);
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearSlot(slot.id);
        render();
      });

      el.innerHTML = `
        <div class="slot__index">DOC ${String(index + 1).padStart(2, "0")}</div>
        <div class="slot__filename">${escapeHtml(slot.file.name)}</div>
        <div class="slot__meta">${formatSize(slot.file.size)} · ${slot.status === "error" ? "Rejected" : "Ready"}</div>
      `;
      el.appendChild(removeBtn);
    }

    slotsEl.appendChild(el);
  });
}

function renderManifest() {
  const filled = slots.filter((s) => s.file);
  manifestCountEl.textContent = `${filled.length} document${filled.length === 1 ? "" : "s"} added`;

  if (filled.length === 0) {
    manifestEmptyEl.hidden = false;
    manifestTableEl.hidden = true;
    return;
  }

  manifestEmptyEl.hidden = true;
  manifestTableEl.hidden = false;
  manifestBodyEl.innerHTML = "";

  filled.forEach((slot, i) => {
    const tr = document.createElement("tr");
    const ext = getExtension(slot.file.name).toUpperCase();
    tr.innerHTML = `
      <td class="manifest__filesize">${i + 1}</td>
      <td class="manifest__filename">${escapeHtml(slot.file.name)}</td>
      <td class="manifest__filetype">${ext}</td>
      <td class="manifest__filesize">${formatSize(slot.file.size)}</td>
      <td>
        <span class="status-pill ${slot.status === "ready" ? "status-pill--ready" : "status-pill--error"}">
          ${slot.status === "ready" ? "Ready" : "Rejected"}
        </span>
      </td>
      <td></td>
    `;
    const removeCell = tr.lastElementChild;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "row-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.setAttribute("aria-label", `Remove ${slot.file.name}`);
    removeBtn.addEventListener("click", () => {
      clearSlot(slot.id);
      render();
    });
    removeCell.appendChild(removeBtn);
    manifestBodyEl.appendChild(tr);
  });
}

function renderErrors() {
  const messages = slots.filter((s) => s.status === "error").map((s) => s.error);
  errorListEl.innerHTML = "";
  messages.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "error-item";
    div.textContent = msg;
    errorListEl.appendChild(div);
  });
}

function renderFooter() {
  const readyCount = slots.filter((s) => s.status === "ready").length;
  const hasErrors = slots.some((s) => s.status === "error");
  const canCompare = readyCount >= MIN_DOCUMENTS_REQUIRED && !hasErrors;

  compareBtn.disabled = !canCompare;

  if (hasErrors) {
    footerHintEl.textContent = "Fix or remove the rejected file(s) before continuing.";
  } else if (readyCount < MIN_DOCUMENTS_REQUIRED) {
    footerHintEl.textContent = `Add at least ${MIN_DOCUMENTS_REQUIRED} documents to continue (${readyCount} ready).`;
  } else {
    footerHintEl.textContent = `${readyCount} documents ready to compare.`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
