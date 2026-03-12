let SPOOLS = [];
let syncColorCountForModal = () => {};

function el(id) { return document.getElementById(id); }

function normalizeHex(hex) {
  const v = String(hex || "").trim().toLowerCase();
  if (!v.startsWith("#")) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (v.length === 7) return v;
  return null;
}

function hexToRgb(hex) {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const intVal = Number.parseInt(norm.slice(1), 16);
  if (Number.isNaN(intVal)) return null;
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(hexA, hexB, ratio = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return normalizeHex(hexA) || normalizeHex(hexB) || "#000000";

  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  return rgbToHex(
    a.r + ((b.r - a.r) * t),
    a.g + ((b.g - a.g) * t),
    a.b + ((b.b - a.b) * t)
  );
}

function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rr:
        h = 60 * (((gg - bb) / d) % 6);
        break;
      case gg:
        h = 60 * ((bb - rr) / d + 2);
        break;
      default:
        h = 60 * ((rr - gg) / d + 4);
        break;
    }
  }

  if (h < 0) h += 360;
  return { h, s, l };
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function hueDistance(h1, h2) {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

function colorDistance(hexA, hexB) {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const hueDelta = hueDistance(a.h, b.h) / 180;
  const satDelta = Math.abs(a.s - b.s);
  const lightDelta = Math.abs(a.l - b.l);

  return Math.sqrt(
    (hueDelta * 1.5) ** 2 +
    (satDelta * 0.8) ** 2 +
    (lightDelta * 0.7) ** 2
  );
}

function colorThresholdFromSensitivity(sensitivity) {
  const s = Math.max(0, Math.min(100, Number(sensitivity) || 0)) / 100;
  return 0.04 + (s * 0.92);
}

function getSpoolColors(spool) {
  const colors = Array.isArray(spool?.colors) ? spool.colors : [];
  const normalized = colors
    .map((color) => ({
      name: String(color?.name || "").trim(),
      hex: normalizeHex(color?.hex)
    }))
    .filter((color) => color.name && color.hex)
    .slice(0, 3);

  if (normalized.length > 0) return normalized;

  const legacyHex = normalizeHex(spool?.colorHex);
  const legacyName = String(spool?.colorName || "").trim();
  return legacyName && legacyHex ? [{ name: legacyName, hex: legacyHex }] : [];
}

function getSpoolArrangement(spool) {
  return spool?.colorArrangement === "cross-sectional" ? "cross-sectional" : "parallel";
}

function formatArrangementLabel(arrangement) {
  return arrangement === "cross-sectional" ? "Cross Sectional" : "Parallel";
}

function buildLinearSmoothStops(colors) {
  if (colors.length === 1) return colors[0].hex;

  const stops = [`${colors[0].hex} 0%`];
  const segmentSize = 100 / (colors.length - 1);
  const solidPortion = 0.58;
  const transitionPortion = 1 - solidPortion;

  for (let index = 0; index < colors.length - 1; index += 1) {
    const current = colors[index].hex;
    const next = colors[index + 1].hex;
    const start = index * segmentSize;
    const solidEnd = start + (segmentSize * solidPortion);
    const mid = solidEnd + ((segmentSize * transitionPortion) / 2);
    const end = start + segmentSize;
    const blend = mixHex(current, next, 0.5);

    stops.push(`${current} ${Number(solidEnd.toFixed(2))}%`);
    stops.push(`${blend} ${Number(mid.toFixed(2))}%`);
    stops.push(`${next} ${Number(end.toFixed(2))}%`);
  }

  return stops.join(", ");
}

function buildConicSmoothStops(colors) {
  if (colors.length === 1) return colors[0].hex;

  const stops = [];
  const segmentSize = 100 / colors.length;
  const solidPortion = 0.58;
  const transitionPortion = 1 - solidPortion;

  for (let index = 0; index < colors.length; index += 1) {
    const current = colors[index].hex;
    const next = colors[(index + 1) % colors.length].hex;
    const start = index * segmentSize;
    const solidEnd = start + (segmentSize * solidPortion);
    const mid = solidEnd + ((segmentSize * transitionPortion) / 2);
    const end = start + segmentSize;
    const blend = mixHex(current, next, 0.5);

    if (index === 0) {
      stops.push(`${current} 0%`);
    }

    stops.push(`${current} ${Number(solidEnd.toFixed(2))}%`);
    stops.push(`${blend} ${Number(mid.toFixed(2))}%`);
    stops.push(`${next} ${Number(end.toFixed(2))}%`);
  }

  return stops.join(", ");
}

function buildSwatchBackground(spool) {
  const colors = getSpoolColors(spool);
  if (colors.length === 0) return "#000000";
  if (colors.length === 1) return colors[0].hex;

  if (getSpoolArrangement(spool) === "cross-sectional") {
    return `conic-gradient(from -90deg, ${buildConicSmoothStops(colors)})`;
  }
  return `linear-gradient(180deg, ${buildLinearSmoothStops(colors)})`;
}

function formatColorBadge(spool) {
  const colors = getSpoolColors(spool);
  if (colors.length === 0) return "No colour";
  return colors.map((color) => `${color.name} (${color.hex})`).join(" / ");
}

function passesColorFilter(spool, targetColorHex, sensitivity) {
  if (!targetColorHex) return true;
  return getSpoolColors(spool).some((color) =>
    colorDistance(color.hex, targetColorHex) <= colorThresholdFromSensitivity(sensitivity)
  );
}

function pctLeft(spool) {
  const initial = Number(spool.initialG || 0);
  const used = Number(spool.usedG || 0);
  if (initial <= 0) return 0;

  const left = Math.max(0, initial - used);
  const pctRaw = Math.max(0, Math.min(100, (left / initial) * 100));

  // Round DOWN to nearest 5%
  return Math.floor(pctRaw / 5) * 5;
}


function gramsLeft(spool) {
  const initial = Number(spool.initialG || 0);
  const used = Number(spool.usedG || 0);
  return Math.max(0, initial - used);
}

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

function ageSince(birthDateStr) {
  if (!birthDateStr) return "—";
  const birth = new Date(birthDateStr + "T00:00:00");
  if (isNaN(birth.getTime())) return "—";

  const now = new Date();
  const days = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
  if (days < 0) return "—";
  if (days < 30) return `${days}d`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(months / 12);
  const remMo = months % 12;
  return remMo ? `${years}y ${remMo}mo` : `${years}y`;
}


function openModal(id) { el(id).classList.add("show"); }
function closeModal(id) { el(id).classList.remove("show"); }

async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

async function apiSend(path, method, body) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return await r.json();
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function resetSpoolForm() {
  const form = el("addForm");
  form.reset();
  el("spoolId").value = "";
  el("spoolModalTitle").textContent = "Add Spool";
  el("spoolSubmitBtn").textContent = "Save";
  el("birthDate").value = todayIsoDate();
  el("colorArrangement").value = "parallel";
  el("colorCount").value = "1";
  el("colorHex1").value = "#000000";
  el("colorPicker1").value = "#000000";
  el("colorHex2").value = "#ffffff";
  el("colorPicker2").value = "#ffffff";
  el("colorHex3").value = "#888888";
  el("colorPicker3").value = "#888888";
  el("colorName1").value = "";
  el("colorName2").value = "";
  el("colorName3").value = "";
}

function getSpoolFormPayload(form) {
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());

  payload.spoolODmm = Number(payload.spoolODmm);
  payload.spoolWidthmm = Number(payload.spoolWidthmm);
  payload.initialG = Number(payload.initialG);
  payload.usedG = Number(payload.usedG);
  payload.price = Number(payload.price);

  return payload;
}

function populateSpoolForm(spool) {
  const colors = getSpoolColors(spool);

  el("spoolId").value = spool.id;
  el("spoolModalTitle").textContent = "Edit Spool";
  el("spoolSubmitBtn").textContent = "Update";
  el("addForm").elements.name.value = spool.name || "";
  el("addForm").elements.material.value = spool.material || "";
  el("addForm").elements.colorArrangement.value = getSpoolArrangement(spool);
  el("addForm").elements.colorCount.value = String(colors.length || 1);
  el("addForm").elements.spoolMaterial.value = spool.spoolType?.material || "Cardboard";
  el("addForm").elements.spoolODmm.value = spool.spoolType?.odMm ?? 200;
  el("addForm").elements.spoolWidthmm.value = spool.spoolType?.widthMm ?? 70;
  el("addForm").elements.owner.value = spool.owner || "";
  el("addForm").elements.initialG.value = Number(spool.initialG ?? 1000);
  el("addForm").elements.usedG.value = Number(spool.usedG ?? 0);
  el("addForm").elements.price.value = Number(spool.price ?? 0).toFixed(2);
  el("addForm").elements.birthDate.value = spool.birthDate || todayIsoDate();

  const defaults = ["#000000", "#ffffff", "#888888"];
  for (let idx = 1; idx <= 3; idx += 1) {
    const color = colors[idx - 1];
    const nameInput = el(`colorName${idx}`);
    const hexInput = el(`colorHex${idx}`);
    const picker = el(`colorPicker${idx}`);
    nameInput.value = color?.name || "";
    hexInput.value = color?.hex || defaults[idx - 1];
    picker.value = color?.hex || defaults[idx - 1];
  }
}

function openAddSpoolModal(syncColorCount) {
  resetSpoolForm();
  syncColorCount();
  openModal("modalAdd");
}

function openEditSpoolModal(spool, syncColorCount) {
  resetSpoolForm();
  populateSpoolForm(spool);
  syncColorCount();
  openModal("modalAdd");
}

function renderList() {
  const q = (el("search").value || "").trim().toLowerCase();
  const colorFilterEnabled = Boolean(el("colorFilterEnabled")?.checked);
  const selectedColor = colorFilterEnabled ? normalizeHex(el("filterColorPicker")?.value) : null;
  const colorSensitivity = Number(el("colorSensitivity")?.value || 0);
  const list = el("spoolList");
  list.innerHTML = "";

  const filtered = SPOOLS.filter(s => {
    const colorMatch = passesColorFilter(s, selectedColor, colorSensitivity);
    if (!q) return colorMatch;
    const colorSearchText = getSpoolColors(s)
      .flatMap((color) => [color.name, color.hex])
      .join(" ");
    const hay = [
      s.name, s.material, colorSearchText, s.owner, s.checkedOutTo,
      s.spoolType?.material, String(s.spoolType?.odMm), String(s.spoolType?.widthMm)
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q) && colorMatch;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="muted">No spools found.</div>`;
    return;
  }

  for (const s of filtered) {
    const leftPct = pctLeft(s);
    const leftG = gramsLeft(s);
    const age = ageSince(s.birthDate);
    const checked = s.checkedOutTo ? s.checkedOutTo : "—";

    const item = document.createElement("div");
    item.className = "item";

    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = buildSwatchBackground(s);

    const mid = document.createElement("div");
    mid.innerHTML = `
      <div class="nameRow">
        <h3>${escapeHtml(s.name)}</h3>
      </div>

      <div class="badges">
        <span class="badge">${escapeHtml(s.material)}</span>
        <span class="badge">${escapeHtml(formatColorBadge(s))}</span>
        <span class="badge">${escapeHtml(formatArrangementLabel(getSpoolArrangement(s)))}</span>
        <span class="badge">${escapeHtml(s.spoolType.material)} • Ø${escapeHtml(String(s.spoolType.odMm))}mm • W${escapeHtml(String(s.spoolType.widthMm))}mm</span>
      </div>

      <div class="kv">
        <div>Age: <b>${escapeHtml(age)}</b></div>
        <div>Initial: <b>${Number(s.initialG).toFixed(1)}g</b></div>
        <div>Left: <b>${leftG.toFixed(1)}g</b></div>
        <div>Price: <b>$${fmtMoney(s.price)}</b></div>
      </div>

      <div class="progressRow" title="${leftPct.toFixed(0)}% left">
        <div class="progress"><div style="width:${leftPct}%;"></div></div>
        <span class="pctPill">${leftPct.toFixed(0)}%</span>
      </div>

      <div class="ownerMeta">
        <div>Owner: <b>${escapeHtml(s.owner)}</b></div>
        <div>Checked out: <b>${escapeHtml(checked)}</b></div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";

    // Used grams update
    const usedRow = document.createElement("div");
    usedRow.className = "row";
    usedRow.innerHTML = `
      <input type="number" step="0.1" min="0" value="${Number(s.usedG).toFixed(1)}" />
      <button class="btn">Set Used</button>
    `;
    const usedInput = usedRow.querySelector("input");
    const usedBtn = usedRow.querySelector("button");
    usedBtn.classList.add("fixed-btn");
    usedBtn.addEventListener("click", async () => {
      try {
        await apiSend(`/api/spools/${s.id}`, "PATCH", { usedG: Number(usedInput.value) });
        await refresh();
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });

    // Checkout
    const coRow = document.createElement("div");
    coRow.className = "row";
    const sel = document.createElement("select");
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "— Not checked out —";
    sel.appendChild(optNone);

    for (const u of window.APP_META.users) {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = u;
      if (s.checkedOutTo === u) o.selected = true;
      sel.appendChild(o);
    }

    const btnSet = document.createElement("button");
    btnSet.className = "btn icon-btn";
    btnSet.classList.add("fixed-btn");
    btnSet.setAttribute("title", "Set checkout");
    btnSet.innerHTML = `
      <div class="icon-cart-wrap">
        <svg viewBox="0 0 32 32" class="icon-cart" aria-hidden="true">
          <path d="M4 6h3l3 14h13l3-10H8" />
          <circle cx="13" cy="26" r="2.3" />
          <circle cx="23.5" cy="26" r="2.3" />
        </svg>
        <span class="cart-trail" aria-hidden="true"></span>
      </div>
      <span class="sr-only">Set checkout</span>
    `;
    btnSet.addEventListener("click", async () => {
      const launchPromise = playCartLaunchAnimation(btnSet);
      try {
        const v = sel.value || null;
        await apiSend(`/api/spools/${s.id}`, "PATCH", { checkedOutTo: v });
        await launchPromise;
        await refresh();
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });

    coRow.appendChild(sel);
    coRow.appendChild(btnSet);

    // Quick quote button
    const qBtn = document.createElement("button");
    qBtn.className = "btn primary quote-btn";
    qBtn.textContent = "Quote Spool";
    qBtn.addEventListener("click", () => {
      openModal("modalQuote");
      fillQuoteDropdown(s.id);
      el("quoteResult").innerHTML = "";
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.setAttribute("title", "Edit spool");
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true">
        <path d="M4 20l4.2-.9L19 8.3 15.7 5 4.9 15.8z" />
        <path d="M13.9 6.8l3.3 3.3" />
      </svg>
      <span class="sr-only">Edit</span>
    `;
    editBtn.addEventListener("click", () => openEditSpoolModal(s, syncColorCountForModal));

    const delBtn = document.createElement("button");
    delBtn.className = "btn fixed-btn bottom-delete";
    delBtn.setAttribute("title", "Delete spool");
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true">
        <path d="M5 7h14" />
        <path d="M9 7V4h6v3" />
        <path d="M8 7l1 12h6l1-12" />
        <path d="M10 10v6" />
        <path d="M14 10v6" />
      </svg>
      <span class="sr-only">Delete</span>
    `;
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this spool?")) return;
      try {
        await apiSend(`/api/spools/${s.id}`, "DELETE");
        await refresh();
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });

    actions.appendChild(usedRow);
    actions.appendChild(coRow);

    const bottomRow = document.createElement("div");
    bottomRow.className = "action-footer";

    const actionPair = document.createElement("div");
    actionPair.className = "action-pair";

    bottomRow.appendChild(qBtn);
    actionPair.appendChild(editBtn);
    actionPair.appendChild(delBtn);
    bottomRow.appendChild(actionPair);

    actions.appendChild(bottomRow);


    item.appendChild(sw);
    item.appendChild(mid);
    item.appendChild(actions);

    list.appendChild(item);
  }
}

function playCartLaunchAnimation(button) {
  const icon = button?.querySelector(".icon-cart");
  if (!icon) return Promise.resolve();
  icon.classList.remove("launch");
  // Force reflow so animation can restart
  void icon.offsetWidth;
  return new Promise((resolve) => {
    const handleEnd = () => {
      icon.classList.remove("launch");
      icon.removeEventListener("animationend", handleEnd);
      resolve();
    };
    icon.addEventListener("animationend", handleEnd, { once: true });
    icon.classList.add("launch");
  });
}

function fillQuoteDropdown(selectId) {
  const sel = el("quoteSpool");
  sel.innerHTML = "";
  for (const s of SPOOLS) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.name} (${s.material}) - $${fmtMoney(s.price)} / ${Number(s.initialG).toFixed(0)}g`;
    if (selectId && s.id === selectId) o.selected = true;
    sel.appendChild(o);
  }
}

function updateStats(spools) {
  const total = spools.length;
  const checkedOut = spools.filter(s => Boolean(s.checkedOutTo)).length;
  const avg = total ? Math.round(spools.reduce((sum, spool) => sum + pctLeft(spool), 0) / total) : 0;

  const updates = [
    ["statTotal", total ? String(total) : "0"],
    ["statAvg", total ? `${avg}%` : "0%"],
    ["statCheckedOut", `${checkedOut}`]
  ];

  for (const [id, value] of updates) {
    const node = el(id);
    if (node) node.textContent = value;
  }
}

async function refresh() {
  SPOOLS = await apiGet("/api/spools");
  // Sort: not checked out first, then name
  SPOOLS.sort((a, b) => {
    const ac = a.checkedOutTo ? 1 : 0;
    const bc = b.checkedOutTo ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return String(a.name).localeCompare(String(b.name));
  });
  fillQuoteDropdown(null);
  updateStats(SPOOLS);
  renderList();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function wireUI() {
  // Modal close buttons
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
  });

  el("btnAdd").addEventListener("click", () => openAddSpoolModal(syncColorCount));
  el("btnQuote").addEventListener("click", () => {
    openModal("modalQuote");
    el("quoteResult").innerHTML = "";
  });
  el("btnRefresh").addEventListener("click", refresh);

  el("search").addEventListener("input", renderList);
  const colorFilterEnabled = el("colorFilterEnabled");
  const colorFilterControls = el("colorFilterControls");
  const filterColorPicker = el("filterColorPicker");
  const colorSensitivity = el("colorSensitivity");
  const colorSensitivityValue = el("colorSensitivityValue");

  const syncColorFilterControls = () => {
    const enabled = Boolean(colorFilterEnabled.checked);
    colorFilterControls.classList.toggle("hidden", !enabled);
    colorSensitivityValue.textContent = `${colorSensitivity.value}%`;
  };

  colorFilterEnabled.addEventListener("change", () => {
    syncColorFilterControls();
    renderList();
  });
  filterColorPicker.addEventListener("input", renderList);
  colorSensitivity.addEventListener("input", () => {
    syncColorFilterControls();
    renderList();
  });
  syncColorFilterControls();

  const colorCount = el("colorCount");
  const syncColorCount = () => {
    const activeCount = Number(colorCount?.value || 1);
    document.querySelectorAll(".color-slot").forEach((slot) => {
      const slotNumber = Number(slot.getAttribute("data-color-slot") || "0");
      const isVisible = slotNumber <= activeCount;
      slot.classList.toggle("hidden", !isVisible);
      slot.querySelectorAll("input").forEach((input) => {
        const shouldRequire = isVisible && (input.name === `colorName${slotNumber}` || input.name === `colorHex${slotNumber}`);
        input.disabled = !isVisible;
        input.required = shouldRequire;
      });
    });
  };
  syncColorCountForModal = syncColorCount;
  colorCount.addEventListener("change", syncColorCount);
  syncColorCount();

  // Color picker sync
  for (let idx = 1; idx <= 3; idx += 1) {
    const colorHex = el(`colorHex${idx}`);
    const colorPicker = el(`colorPicker${idx}`);
    colorPicker.addEventListener("input", () => { colorHex.value = colorPicker.value; });
    colorHex.addEventListener("input", () => {
      const v = colorHex.value.trim();
      if (v.startsWith("#")) colorPicker.value = v;
    });
  }

  // Add spool form
  el("addForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = getSpoolFormPayload(ev.target);
    const spoolId = payload.spoolId;
    delete payload.spoolId;

    try {
      if (spoolId) {
        await apiSend(`/api/spools/${spoolId}`, "PATCH", payload);
      } else {
        await apiSend("/api/spools", "POST", payload);
      }
      resetSpoolForm();
      syncColorCount();
      closeModal("modalAdd");
      await refresh();
    } catch (e) {
      alert("Failed: " + e.message);
    }
  });

  // Quote form
  el("quoteForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const spoolId = fd.get("spoolId");
    const proposedG = Number(fd.get("proposedG"));
    try {
      const res = await apiSend("/api/quote", "POST", { spoolId, proposedG });
      el("quoteResult").innerHTML = `
        <div class="kv">
          <div>Spool: <b>${escapeHtml(res.spoolName)}</b></div>
          <div>Cost/gram: <b>$${Number(res.costPerG).toFixed(4)}</b></div>
          <div>Proposed: <b>${Number(res.proposedG).toFixed(1)}g</b></div>
          <div>Estimated cost: <b>$${Number(res.estimatedCost).toFixed(2)}</b></div>
        </div>
      `;
    } catch (e) {
      alert("Failed: " + e.message);
    }
  });

  // Click outside modal to close
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("show");
    });
  });

  resetSpoolForm();
  syncColorCount();
}

(async function init() {
  wireUI();
  await refresh();
})();
