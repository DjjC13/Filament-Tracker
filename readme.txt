# Filament Tracker

A Flask-based web app for tracking 3D printer filament spools, checkout status, remaining material, and print cost estimates.

## Features

- Password-protected web UI (`/login`).
- Add, update, search, and delete filament spools.
- Track spool metadata:
  - Material type (configurable list)
  - Color name and hex value
  - Spool dimensions and spool material
  - Owner and checkout status
  - Initial grams, used grams, and price
  - Birth date (date added)
- Live inventory cards with:
  - Remaining grams
  - Remaining percentage (rounded down to nearest 5%)
  - Spool age
- Quote calculator for print jobs using cost-per-gram.
- JSON file persistence (`filaments.json` by default).

## Tech Stack

- Python + Flask backend
- Vanilla JavaScript frontend
- HTML templates + CSS
- File-based storage (JSON)

## Project Structure

```text
.
|-- app.py
|-- filaments.json
|-- readme.txt
|-- static/
|   |-- app.js
|   |-- styles.css
|   `-- Favicon.svg
`-- templates/
    |-- index.html
    `-- login.html
```

## Requirements

- Python 3.10+
- `pip`
- Flask

Install dependency:

```bash
pip install flask
```

## Configuration

Set these environment variables (optional unless noted):

- `APP_PASSWORD` (recommended): Login password for all users.  
  Default: `changeme`
- `SECRET_KEY` (recommended): Flask session secret.  
  Default: `dev-secret-change-me`
- `MATERIAL_TYPES`: Comma-separated materials for dropdowns/validation.  
  Default: `PLA,ABS,PETG`
- `USERS`: Comma-separated user names for owner/checkout fields.  
  Default: `Doug,Tony,Zander`
- `DATA_FILE`: JSON data file path.  
  Default: `filaments.json`
- `PORT`: Web server port.  
  Default: `5000`

### PowerShell example

```powershell
$env:APP_PASSWORD = "replace-with-strong-password"
$env:SECRET_KEY = "replace-with-random-secret"
$env:MATERIAL_TYPES = "PLA,PETG,ABS,TPU"
$env:USERS = "Doug,Tony,Zander"
python app.py
```

## Run Locally

```bash
python app.py
```

Then open:

- `http://localhost:5000` (local machine)
- `http://<your-lan-ip>:5000` (other devices on same network)

The app runs with:

- `host=0.0.0.0`
- `debug=True`

## Data Model

Each spool is stored as:

```json
{
  "id": "uuid",
  "name": "Polymaker PLA Pro - Black",
  "material": "PLA",
  "colorName": "Black",
  "colorHex": "#000000",
  "spoolType": {
    "material": "Cardboard",
    "odMm": 200,
    "widthMm": 70
  },
  "owner": "Doug",
  "checkedOutTo": null,
  "initialG": 1000.0,
  "usedG": 120.0,
  "price": 30.0,
  "birthDate": "2026-02-10"
}
```

## API Endpoints

All API routes require authentication (logged-in session).

- `GET /api/meta`  
  Returns configured `materialTypes` and `users`.

- `GET /api/spools`  
  Returns all spools.

- `POST /api/spools`  
  Creates a spool.

- `PATCH /api/spools/<spool_id>`  
  Partial updates for:
  - `usedG`
  - `checkedOutTo` (`null` or one of configured users)
  - `price`

- `DELETE /api/spools/<spool_id>`  
  Deletes a spool.

- `POST /api/quote`  
  Input: `spoolId`, `proposedG`  
  Output includes `costPerG` and `estimatedCost`.

### Quote Formula

```text
costPerG = price / initialG
estimatedCost = costPerG * proposedG
```

## Validation Rules

- `material` must be in `MATERIAL_TYPES`.
- `owner` and non-null `checkedOutTo` must be in `USERS`.
- `colorHex` must start with `#` and be 4 or 7 chars.
- `initialG > 0`
- `usedG >= 0`
- `price >= 0`
- `birthDate` must be `YYYY-MM-DD`

## Security Notes

- Change the default `APP_PASSWORD` before any real use.
- Set a strong `SECRET_KEY` in non-dev environments.
- The app currently prints the configured password to console at startup (`app.py`). Remove that for production.
- `debug=True` is enabled by default; disable in production.

## Known Limitations

- Single shared password (no per-user accounts/roles).
- JSON file storage only (no database/history/audit trail).
- No CSRF protection on form/API actions.
- No automated test suite yet.

## Future Improvements

- Add `requirements.txt` or `pyproject.toml` for reproducible installs.
- Replace JSON storage with SQLite/PostgreSQL.
- Add user accounts and role-based permissions.
- Add CSRF protection and production-grade Flask deployment settings.
- Add automated tests for API validation and UI flows.
