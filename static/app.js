let SPOOLS = [];

function el(id) { return document.getElementById(id); }

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

function renderList() {
  const q = (el("search").value || "").trim().toLowerCase();
  const list = el("spoolList");
  list.innerHTML = "";

  const filtered = SPOOLS.filter(s => {
    if (!q) return true;
    const hay = [
      s.name, s.material, s.colorName, s.owner, s.checkedOutTo,
      s.spoolType?.material, String(s.spoolType?.odMm), String(s.spoolType?.widthMm)
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
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
    sw.style.background = s.colorHex;

    const mid = document.createElement("div");
    mid.innerHTML = `
      <div class="nameRow">
        <h3>${escapeHtml(s.name)}</h3>
      </div>

      <div class="badges">
        <span class="badge">${escapeHtml(s.material)}</span>
        <span class="badge">${escapeHtml(s.colorName)} (${escapeHtml(s.colorHex)})</span>
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

    // Delete
    const delBtn = document.createElement("button");
    delBtn.className = "btn fixed-btn bottom-delete";
    delBtn.textContent = "Delete";
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
    bottomRow.className = "row";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.gap = "8px";

    qBtn.style.flex = "1 1 auto";
    delBtn.style.flex = "0 0 auto";

    bottomRow.appendChild(qBtn);
    bottomRow.appendChild(delBtn);

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

  el("btnAdd").addEventListener("click", () => openModal("modalAdd"));
  el("btnQuote").addEventListener("click", () => {
    openModal("modalQuote");
    el("quoteResult").innerHTML = "";
  });
  el("btnRefresh").addEventListener("click", refresh);

  el("search").addEventListener("input", renderList);

  // Color picker sync
  const colorHex = el("colorHex");
  const colorPicker = el("colorPicker");
  colorPicker.addEventListener("input", () => { colorHex.value = colorPicker.value; });
  colorHex.addEventListener("input", () => {
    const v = colorHex.value.trim();
    if (v.startsWith("#")) colorPicker.value = v;
  });

  // Add spool form
  el("addForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const payload = Object.fromEntries(fd.entries());

    // Convert numeric fields
    payload.spoolODmm = Number(payload.spoolODmm);
    payload.spoolWidthmm = Number(payload.spoolWidthmm);
    payload.initialG = Number(payload.initialG);
    payload.usedG = Number(payload.usedG);
    payload.price = Number(payload.price);

    try {
      await apiSend("/api/spools", "POST", payload);
      ev.target.reset();
      // reset birthDate to today
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const bd = document.getElementById("birthDate");
      if (bd) bd.value = `${yyyy}-${mm}-${dd}`;

      // reset color defaults
      el("colorHex").value = "#000000";
      el("colorPicker").value = "#000000";
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
}

(async function init() {
  wireUI();
  await refresh();
})();
