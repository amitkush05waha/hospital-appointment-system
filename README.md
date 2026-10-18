# SmartCare - Hospital Appointment System

A modern, accessible hospital appointment management system featuring a **Patient-First Workflow** connected directly to **Supabase** (PostgreSQL) with Row Level Security (RLS). Patients register or verify their identity upfront before doctor selection and booking, ensuring appointments are securely linked to verified patient records without exposing personal information.

---

## Patient-First Workflow Architecture

```
Login / Entry Page (index.html)
   │
   ├── User logs in or creates account, or goes to Patient Portal (patient.html)
   │
   ▼
Patient Entry Flow (patient.html)
   │
   ├── Option 1: New Patient Registration
   │     • Full Name, Age, Gender, Phone Number (Required)
   │     • Email (Optional)
   │     • Security PIN (4-6 digits, used for returning authentication)
   │     • Saves to Supabase `patients` table & receives generated Patient ID
   │     • Retains session in browser
   │
   ├── Option 2: Existing Patient Identity Verification
   │     • Requires Patient ID + Security PIN
   │     • (Does not identify patients by name or phone alone)
   │     • Verifies credentials & establishes authenticated patient session
   │
   ▼
Doctor & Slot Selection (Booking Wizard)
   │     • Step 1: Select doctor & filter by specialty
   │     • Step 2: Choose appointment date, available time slot, and reason for visit
   │     • Step 3: Review confirmation with locked registered patient details
   │
   ▼
Appointment Confirmation
   │     • Saves to Supabase `appointments` table with `patient_id` as Foreign Key
   │     • Displays Booking Confirmation card with unique Appointment ID & details
   │
   ▼
Patient Portal (My Appointments)
         • Loads verified patient's appointments from Supabase
         • Displays appointment stats (Total, Completed, Upcoming, Cancelled)
         • Real-time cancellation and appointment reminders
```

---

## Database Schema & Migrations

The database uses Supabase PostgreSQL. Tables and relationships:

### 1. `public.patients`
- `id`: BIGINT (Identity, Primary Key)
- `full_name`: TEXT (NOT NULL)
- `age`: INT (Required)
- `gender`: TEXT (Required)
- `phone`: TEXT (Required)
- `email`: TEXT (Optional)
- `pin`: TEXT (Secret security credential for returning patient verification)
- `created_at`: TIMESTAMPTZ (DEFAULT NOW())

### 2. `public.appointments`
- `id`: BIGINT (Identity, Primary Key)
- `patient_id`: BIGINT (Foreign Key referencing `public.patients(id)`)
- `patient_name`: TEXT (NOT NULL)
- `doctor`: TEXT (NOT NULL)
- `doctor_id`: BIGINT (References doctors catalog)
- `specialization`: TEXT (NOT NULL)
- `appointment_date`: DATE (NOT NULL)
- `appointment_time`: TEXT (NOT NULL)
- `reason`: TEXT
- `status`: TEXT (DEFAULT 'upcoming', 'cancelled', 'completed')
- `created_at`: TIMESTAMPTZ (DEFAULT NOW())

### 3. `public.doctors`
- `id`: BIGINT (Primary Key)
- `name`: TEXT (NOT NULL)
- `specialization`: TEXT (NOT NULL)
- `created_at`: TIMESTAMPTZ (DEFAULT NOW())

---

## Setup Instructions

### 1. Run the Database Migration
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** from the left navigation.
3. Open [`supabase-schema.sql`](supabase-schema.sql) in this repository.
4. Copy its content, paste into the Supabase SQL Editor, and click **Run**.
   - Applies safe column migrations (`ADD COLUMN IF NOT EXISTS`) without deleting existing data.
   - Sets up restricted Row Level Security (RLS) policies preventing patients from scraping other patients' data.
   - Installs the secure verification procedures: `verify_patient_identity` and `get_patient_appointments`.

### 2. Client Configuration
Configuration is located in [`supabase-config.js`](supabase-config.js):
```javascript
const SUPABASE_URL = 'https://nspkvwgvwktfidbgtplo.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_PUBLISHABLE_ANON_KEY';
```
> **Security Notice**: Only use the public publishable anon key. Never expose secret or service-role keys in frontend files.

---

## How to Run Locally

### Option A: Using the Included Script
Double-click `start.bat` in the project folder to start a local web server on port 3000.

### Option B: Using Python
```bash
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option C: Direct File Opening
Double-click `index.html` to open directly in any modern browser.

---

## Testing & Verification

1. **New Patient Registration**:
   - Open `index.html` (Login / Register page) or navigate to `patient.html`.
   - Under Patient portal, select **New Patient**.
   - Enter Full Name, Age (1-120), Gender, Phone Number, optional Email, and a 4-6 digit Security PIN.
   - Click **Register & Select Doctor**.
   - Verification: System registers the patient into Supabase `patients` and issues a unique Patient ID (e.g. `#4`).
2. **Doctor Selection & Booking**:
   - Select a doctor (e.g. Dr. Patel - Cardiology).
   - Pick an appointment date and available time slot (e.g. 10:00 AM).
   - Review confirmation in Step 3 (patient name and Patient ID are pre-filled).
   - Click **Confirm Booking**.
   - Verification: Saves to Supabase `appointments` with `patient_id` linked, and displays the Booking Confirmation card with the Appointment Reference ID.
3. **Appointment Listing**:
   - Click **View My Appointments** in `patient.html`.
   - Verification: Queries Supabase and displays the newly booked appointment in the patient's appointment list.
4. **Existing Patient Authentication**:
   - Click **Switch Patient** or open a new browser window.
   - Select **Existing Patient**.
   - Enter the Patient ID and the Security PIN created during registration.
   - Verification: System validates credentials against Supabase. Entering an incorrect PIN or omitting the PIN is rejected. On success, the patient's session and appointments are loaded.
5. **Cancellation**:
   - Click **Cancel** on an appointment card.
   - Verification: Updates the appointment status to `cancelled` in Supabase.
