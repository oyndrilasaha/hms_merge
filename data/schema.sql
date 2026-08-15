PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  departments_json TEXT DEFAULT '["General Medicine", "Cardiology", "Pediatrics", "Emergency", "Orthopedics"]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Lab Technician',
    'Pharmacist', 'Branch Manager', 'Patient'
  )),
  specialisation TEXT,
  phone TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  branch_id INTEGER REFERENCES branches(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  medical_record_number TEXT NOT NULL UNIQUE,
  user_id INTEGER UNIQUE REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'Not specified' CHECK (gender IN (
    'Female', 'Male', 'Non-binary', 'Other', 'Not specified'
  )),
  phone TEXT,
  email TEXT,
  address TEXT,
  emergency_contact TEXT,
  allergies TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_user_id INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN (
    'Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'
  )),
  reason TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  clinician_user_id INTEGER NOT NULL REFERENCES users(id),
  note_type TEXT NOT NULL DEFAULT 'Progress note',
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS lab_orders (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  ordered_by INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  test_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Routine' CHECK (priority IN ('Routine', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Ordered' CHECK (status IN (
    'Ordered', 'Collected', 'Processing', 'Completed', 'Cancelled'
  )),
  clinical_information TEXT,
  result TEXT,
  result_units TEXT,
  reference_range TEXT,
  resulted_by INTEGER REFERENCES users(id),
  ordered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resulted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  strength TEXT NOT NULL,
  form TEXT NOT NULL,
  unit TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (name, strength, form)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  medication_id INTEGER NOT NULL REFERENCES medications(id),
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 10 CHECK (reorder_level >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (branch_id, medication_id, batch_number)
);

CREATE TABLE IF NOT EXISTS dispensings (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  medication_id INTEGER NOT NULL REFERENCES medications(id),
  inventory_id INTEGER NOT NULL REFERENCES inventory(id),
  prescription_reference TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  dispensed_by INTEGER NOT NULL REFERENCES users(id),
  instructions TEXT,
  dispensed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  description TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  gst_cents INTEGER NOT NULL DEFAULT 0 CHECK (gst_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Issued' CHECK (status IN (
    'Draft', 'Issued', 'Partially Paid', 'Paid', 'Void'
  )),
  issued_by INTEGER NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (total_cents = subtotal_cents + gst_cents),
  CHECK (paid_cents <= total_cents)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('Cash', 'Card', 'Bank Transfer', 'Medicare', 'Other')),
  reference TEXT,
  received_by INTEGER NOT NULL REFERENCES users(id),
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  branch_id INTEGER REFERENCES branches(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id),
  comments TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('Positive', 'Negative', 'Neutral')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_mins INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  shift_date TEXT NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('Morning', 'Afternoon', 'Night', 'On-Call')),
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Completed', 'Absent', 'Cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id),
  shift_id INTEGER REFERENCES shifts(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  status TEXT NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Late', 'Half Day', 'On Leave'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  medication_id INTEGER NOT NULL REFERENCES medications(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Fulfilled', 'Cancelled')),
  ordered_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER REFERENCES users(id),
  recipient_contact TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('Email', 'SMS', 'In-App')),
  template TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Sent' CHECK (status IN ('Queued', 'Sent', 'Failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  ward TEXT NOT NULL,
  room_number TEXT NOT NULL,
  bed_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Occupied', 'Maintenance', 'Reserved')),
  UNIQUE (branch_id, ward, room_number, bed_number)
);

CREATE TABLE IF NOT EXISTS admissions (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  bed_id INTEGER REFERENCES beds(id),
  attending_doctor_id INTEGER REFERENCES users(id),
  admission_reason TEXT NOT NULL,
  admitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  discharged_at TEXT,
  discharge_summary TEXT,
  status TEXT NOT NULL DEFAULT 'Admitted' CHECK (status IN ('Admitted', 'Transferred', 'Discharged'))
);

CREATE TABLE IF NOT EXISTS patient_consents (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  purpose TEXT NOT NULL,
  notice_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'Granted' CHECK (status IN ('Granted', 'Withdrawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_type TEXT NOT NULL DEFAULT 'Full Automated',
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Failed', 'Restore Test Passed')),
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_branch_role ON users(branch_id, role);
CREATE INDEX IF NOT EXISTS idx_patients_branch_name ON patients(branch_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time ON appointments(doctor_user_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON appointments(patient_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_status ON lab_orders(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_medication ON inventory(branch_id, medication_id);
CREATE INDEX IF NOT EXISTS idx_dispensings_patient ON dispensings(patient_id, dispensed_at);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_status ON invoices(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_branch_time ON audit_logs(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_schedules_staff ON schedules(staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(branch_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_beds_branch_status ON beds(branch_id, status);

