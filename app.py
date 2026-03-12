import os
import json
import uuid
import subprocess
from functools import wraps
from threading import Lock
from flask import (
    Flask,
    request,
    session,
    redirect,
    url_for,
    render_template,
    jsonify,
    abort,
)
from datetime import date, datetime


APP_PASSWORD = os.getenv("APP_PASSWORD", "changeme")

print("App Password:" + APP_PASSWORD)

MATERIAL_TYPES = [
    s.strip()
    for s in os.getenv("MATERIAL_TYPES", "PLA,ABS,PETG").split(",")
    if s.strip()
]
USERS = [
    s.strip() for s in os.getenv("USERS", "Doug,Tony,Zander").split(",") if s.strip()
]

DATA_FILE = os.getenv("DATA_FILE", "filaments.json")

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-me")

_file_lock = Lock()


def _normalize_hex(value):
    v = str(value or "").strip().lower()
    if not v.startswith("#"):
        return None
    if len(v) == 4:
        expanded = "".join(ch * 2 for ch in v[1:])
        return f"#{expanded}"
    if len(v) == 7:
        return v
    return None


def _normalize_spool(spool):
    colors = spool.get("colors")
    normalized_colors = []

    if isinstance(colors, list):
        for entry in colors[:3]:
            if not isinstance(entry, dict):
                continue
            color_name = str(entry.get("name") or "").strip()
            color_hex = _normalize_hex(entry.get("hex"))
            if color_name and color_hex:
                normalized_colors.append({"name": color_name, "hex": color_hex})

    if not normalized_colors:
        legacy_name = str(spool.get("colorName") or "").strip()
        legacy_hex = _normalize_hex(spool.get("colorHex"))
        if legacy_name and legacy_hex:
            normalized_colors.append({"name": legacy_name, "hex": legacy_hex})

    arrangement = str(spool.get("colorArrangement") or "").strip().lower()
    if arrangement not in ("parallel", "cross-sectional"):
        arrangement = "parallel"

    if normalized_colors:
        spool["colors"] = normalized_colors
        spool["colorArrangement"] = arrangement
        spool["colorName"] = " / ".join(color["name"] for color in normalized_colors)
        spool["colorHex"] = normalized_colors[0]["hex"]

    return spool


def _build_spool_from_payload(payload, existing_spool=None):
    def req_str(k):
        v = str(payload.get(k) or "").strip()
        if not v:
            abort(400, description=f"Missing field: {k}")
        return v

    def req_float(k):
        try:
            return float(payload.get(k))
        except Exception:
            abort(400, description=f"Invalid number: {k}")

    def req_int(k):
        try:
            return int(payload.get(k))
        except Exception:
            abort(400, description=f"Invalid integer: {k}")

    name = req_str("name")
    material = req_str("material")
    arrangement = req_str("colorArrangement")
    if arrangement not in ("parallel", "cross-sectional"):
        abort(400, description="Invalid color arrangement")

    colors = []
    for idx in range(1, 4):
        name_key = f"colorName{idx}"
        hex_key = f"colorHex{idx}"
        raw_name = str(payload.get(name_key) or "").strip()
        raw_hex = str(payload.get(hex_key) or "").strip()
        if not raw_name and not raw_hex:
            continue
        if not raw_name:
            abort(400, description=f"Missing field: {name_key}")
        if not raw_hex:
            abort(400, description=f"Missing field: {hex_key}")
        color_hex = _normalize_hex(raw_hex)
        if not color_hex:
            abort(400, description=f"Invalid color hex: {hex_key}")
        colors.append({"name": raw_name, "hex": color_hex})

    if not colors:
        abort(400, description="At least one colour is required")

    spool_material = req_str("spoolMaterial")
    spool_od_mm = req_int("spoolODmm")
    spool_width_mm = req_int("spoolWidthmm")
    owner = req_str("owner")
    initial_g = req_float("initialG")
    used_g = req_float("usedG")
    price = req_float("price")

    birth_date = str(payload.get("birthDate") or "").strip()
    if not birth_date:
        birth_date = (
            existing_spool.get("birthDate")
            if existing_spool and existing_spool.get("birthDate")
            else date.today().isoformat()
        )

    try:
        date.fromisoformat(birth_date)
    except Exception:
        abort(400, description="Invalid birthDate (use YYYY-MM-DD)")

    if material not in MATERIAL_TYPES:
        abort(400, description="Invalid material type")
    if owner not in USERS:
        abort(400, description="Invalid owner")
    if initial_g <= 0:
        abort(400, description="initialG must be > 0")
    if used_g < 0:
        abort(400, description="usedG must be >= 0")
    if price < 0:
        abort(400, description="price must be >= 0")

    spool = {
        "id": existing_spool["id"] if existing_spool else str(uuid.uuid4()),
        "name": name,
        "material": material,
        "colors": colors,
        "colorArrangement": arrangement,
        "colorName": " / ".join(color["name"] for color in colors),
        "colorHex": colors[0]["hex"],
        "spoolType": {
            "material": spool_material,
            "odMm": spool_od_mm,
            "widthMm": spool_width_mm,
        },
        "owner": owner,
        "checkedOutTo": existing_spool.get("checkedOutTo") if existing_spool else None,
        "initialG": float(initial_g),
        "usedG": float(used_g),
        "price": float(price),
        "birthDate": birth_date,
    }

    if existing_spool and "checkedOutTo" in existing_spool:
        spool["checkedOutTo"] = existing_spool["checkedOutTo"]

    return spool


def _get_git_build_info():
    repo_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        short_hash = subprocess.check_output(
            ["git", "-C", repo_dir, "rev-parse", "--short", "HEAD"],
            text=True,
        ).strip()
        commit_iso = subprocess.check_output(
            ["git", "-C", repo_dir, "show", "-s", "--format=%cI", "HEAD"],
            text=True,
        ).strip()
        commit_dt = datetime.fromisoformat(commit_iso.replace("Z", "+00:00"))
        commit_date = f"{commit_dt.strftime('%B')} {commit_dt.day}, {commit_dt.year}"
        return {"version": short_hash, "date": commit_date}
    except Exception:
        return {"version": "unknown", "date": "unknown"}


def _read_data():
    if not os.path.exists(DATA_FILE):
        return {"spools": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_data(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("authed"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)

    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        pw = (request.form.get("password") or "").strip()
        if pw == APP_PASSWORD:
            session["authed"] = True
            return redirect(url_for("index"))
        return render_template("login.html", error="Invalid password.")
    return render_template("login.html", error=None)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    build = _get_git_build_info()
    return render_template(
        "index.html",
        material_types=MATERIAL_TYPES,
        users=USERS,
        build_version=build["version"],
        build_date=build["date"],
    )


@app.route("/api/meta")
@login_required
def api_meta():
    return jsonify(
        {
            "materialTypes": MATERIAL_TYPES,
            "users": USERS,
        }
    )


@app.route("/api/spools", methods=["GET"])
@login_required
def api_list_spools():
    with _file_lock:
        data = _read_data()
    return jsonify([_normalize_spool(spool) for spool in data["spools"]])


@app.route("/api/spools", methods=["POST"])
@login_required
def api_add_spool():
    payload = request.get_json(force=True) or {}
    spool = _build_spool_from_payload(payload)

    with _file_lock:
        data = _read_data()
        data["spools"].append(spool)
        _write_data(data)

    return jsonify(spool), 201


@app.route("/api/spools/<spool_id>", methods=["PATCH"])
@login_required
def api_patch_spool(spool_id):
    payload = request.get_json(force=True) or {}

    with _file_lock:
        data = _read_data()
        spools = data["spools"]
        spool = next((s for s in spools if s["id"] == spool_id), None)
        if not spool:
            abort(404, description="Spool not found")

        full_update_fields = {
            "name",
            "material",
            "colorArrangement",
            "colorName1",
            "colorHex1",
            "colorName2",
            "colorHex2",
            "colorName3",
            "colorHex3",
            "spoolMaterial",
            "spoolODmm",
            "spoolWidthmm",
            "owner",
            "initialG",
            "usedG",
            "price",
            "birthDate",
        }

        if any(field in payload for field in full_update_fields):
            updated_spool = _build_spool_from_payload(payload, existing_spool=spool)
            spool.clear()
            spool.update(updated_spool)
        elif "usedG" in payload:
            try:
                used = float(payload["usedG"])
            except Exception:
                abort(400, description="Invalid usedG")
            if used < 0:
                abort(400, description="usedG must be >= 0")
            spool["usedG"] = used

        if "checkedOutTo" in payload:
            val = payload["checkedOutTo"]
            if val is None or val == "":
                spool["checkedOutTo"] = None
            else:
                val = str(val).strip()
                if val not in USERS:
                    abort(400, description="Invalid user")
                spool["checkedOutTo"] = val

        if "price" in payload and not any(field in payload for field in full_update_fields):
            try:
                p = float(payload["price"])
            except Exception:
                abort(400, description="Invalid price")
            if p < 0:
                abort(400, description="price must be >= 0")
            spool["price"] = p

        _write_data(data)

    return jsonify(_normalize_spool(spool))


@app.route("/api/spools/<spool_id>", methods=["DELETE"])
@login_required
def api_delete_spool(spool_id):
    with _file_lock:
        data = _read_data()
        before = len(data["spools"])
        data["spools"] = [s for s in data["spools"] if s["id"] != spool_id]
        if len(data["spools"]) == before:
            abort(404, description="Spool not found")
        _write_data(data)
    return "", 204


@app.route("/api/quote", methods=["POST"])
@login_required
def api_quote():
    payload = request.get_json(force=True) or {}
    spool_id = (payload.get("spoolId") or "").strip()
    try:
        proposed_g = float(payload.get("proposedG"))
    except Exception:
        abort(400, description="Invalid proposedG")

    if proposed_g <= 0:
        abort(400, description="proposedG must be > 0")

    with _file_lock:
        data = _read_data()
        spool = next((s for s in data["spools"] if s["id"] == spool_id), None)
        if not spool:
            abort(404, description="Spool not found")

    # cost per gram = price / initialG
    spool = _normalize_spool(spool)
    cost_per_g = (spool["price"] / spool["initialG"]) if spool["initialG"] > 0 else 0.0
    cost = cost_per_g * proposed_g

    return jsonify(
        {
            "spoolId": spool_id,
            "spoolName": spool["name"],
            "costPerG": cost_per_g,
            "proposedG": proposed_g,
            "estimatedCost": cost,
        }
    )


if __name__ == "__main__":
    # Listen on LAN by default for your use case
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
