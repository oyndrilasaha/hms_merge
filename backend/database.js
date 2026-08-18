'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DEFAULT_DATABASE_FILE = path.resolve(__dirname, '..', 'data', 'hospital.db');
const SCHEMA_FILE = path.resolve(__dirname, '..', 'data', 'schema.sql');
const DEMO_PASSWORD = 'DemoPass!2026';

const DEMO_USERS = [
  [1, 'admin', 'Olivia Shah', 'admin@demo.stgeorge.local', 'Admin', 1, DEMO_PASSWORD],
  [2, 'doctor', 'Dr Daniel Chen', 'doctor@demo.stgeorge.local', 'Doctor', 1, DEMO_PASSWORD],
  [3, 'nurse', 'Noah Williams', 'nurse@demo.stgeorge.local', 'Nurse', 1, DEMO_PASSWORD],
  [4, 'reception', 'Amelia Brown', 'reception@demo.stgeorge.local', 'Receptionist', 1, DEMO_PASSWORD],
  [5, 'labtech', 'Lucas Wilson', 'lab@demo.stgeorge.local', 'Lab Technician', 1, DEMO_PASSWORD],
  [6, 'pharmacist', 'Mia Taylor', 'pharmacy@demo.stgeorge.local', 'Pharmacist', 1, DEMO_PASSWORD],
  [7, 'manager', 'Ethan Nguyen', 'manager@demo.stgeorge.local', 'Branch Manager', 1, DEMO_PASSWORD],
  [8, 'patient', 'Ava Martin', 'patient@demo.stgeorge.local', 'Patient', 1, DEMO_PASSWORD],
  // Peer reviewer accounts
  [9, 'PriyaR', 'Priya R', 'priya@demo.stgeorge.local', 'Receptionist', 1, 'PriyaR123!'],
  [10, 'KrishalaK', 'Krishala K', 'krishala@demo.stgeorge.local', 'Doctor', 1, 'KrishalaK123!'],
  [11, 'ManishM', 'Manish M', 'manish@demo.stgeorge.local', 'Lab Technician', 1, 'ManishM123!'],
  [12, 'UshaU', 'Usha U', 'usha@demo.stgeorge.local', 'Pharmacist', 1, 'UshaU123!'],
  [13, 'OyndrilaS', 'Oyndrila S', 'oyndrila@demo.stgeorge.local', 'Admin', 1, 'OyndrilaS123!'],
];

function withTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function audit(db, {
  actorUserId = null,
  branchId = null,
  action,
  entityType,
  entityId = null,
  details = {},
  ipAddress = null,
}) {
  db.prepare(`
    INSERT INTO audit_logs
      (actor_user_id, branch_id, action, entity_type, entity_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorUserId,
    branchId,
    action,
    entityType,
    entityId == null ? null : String(entityId),
    JSON.stringify(details || {}),
    ipAddress,
  );
}

function seedDatabase(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0) return false;

  withTransaction(db, () => {
    db.prepare(`
      INSERT INTO branches (id, code, name, address, phone) VALUES (?, ?, ?, ?, ?)
    `).run(1, 'KOG', 'St George Hospital – Kogarah', 'Gray Street, Kogarah NSW 2217', '02 9113 1111');
    db.prepare(`
      INSERT INTO branches (id, code, name, address, phone) VALUES (?, ?, ?, ?, ?)
    `).run(2, 'SYD', 'St George Community Clinic – Sydney', '100 George Street, Sydney NSW 2000', '02 9000 2026');

    const insertUser = db.prepare(`
      INSERT INTO users
        (id, username, full_name, email, password_hash, password_salt, role, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const usersToSeed = process.env.NODE_ENV === 'test' ? DEMO_USERS.slice(0, 8) : DEMO_USERS;
    for (const [id, username, fullName, email, role, branchId, password] of usersToSeed) {
      const credentials = hashPassword(password);
      insertUser.run(
        id,
        username,
        fullName,
        email,
        credentials.hash,
        credentials.salt,
        role,
        branchId,
      );
    }

    db.prepare(`
      INSERT INTO patients
        (id, medical_record_number, user_id, branch_id, first_name, last_name,
         date_of_birth, gender, phone, email, address, emergency_contact, allergies, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 'SGH-000001', 8, 1, 'Ava', 'Martin', '1992-04-18', 'Female',
      '0400 000 101', 'patient@demo.stgeorge.local', '12 Demo Street, Kogarah NSW',
      'Liam Martin – 0400 000 102', 'Penicillin', 4,
    );
    db.prepare(`
      INSERT INTO patients
        (id, medical_record_number, branch_id, first_name, last_name, date_of_birth,
         gender, phone, email, address, emergency_contact, allergies, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2, 'SGH-000002', 1, 'Jack', 'Thompson', '1978-11-02', 'Male',
      '0400 000 201', 'jack.thompson@example.test', '24 Sample Avenue, Rockdale NSW',
      'Ella Thompson – 0400 000 202', 'No known allergies', 4,
    );

    db.prepare(`
      INSERT INTO appointments
        (id, patient_id, doctor_user_id, branch_id, starts_at, ends_at, status,
         reason, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 1, 2, 1, '2026-08-12T00:00:00.000Z', '2026-08-12T00:30:00.000Z',
      'Scheduled', 'Follow-up consultation', 'Synthetic demonstration appointment', 4,
      '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z',
    );
    db.prepare(`
      INSERT INTO appointments
        (id, patient_id, doctor_user_id, branch_id, starts_at, ends_at, status,
         reason, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2, 2, 2, 1, '2026-08-12T01:00:00.000Z', '2026-08-12T01:30:00.000Z',
      'Completed', 'Blood pressure review', 'Synthetic completed consultation', 4,
      '2026-08-04T00:00:00.000Z', '2026-08-04T02:00:00.000Z',
    );

    db.prepare(`
      INSERT INTO clinical_notes
        (id, patient_id, appointment_id, clinician_user_id, note_type,
         subjective, objective, assessment, plan, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 2, 2, 2, 'Progress note',
      'Patient reports feeling well and taking medication as directed.',
      'Blood pressure 132/82 mmHg; pulse 72 bpm.',
      'Blood pressure stable on current management.',
      'Continue current plan and review in three months.',
      '2026-08-04T01:20:00.000Z',
    );

    db.prepare(`
      INSERT INTO lab_orders
        (id, patient_id, appointment_id, ordered_by, branch_id, test_name,
         priority, status, clinical_information, ordered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 1, 1, 2, 1, 'Full Blood Count', 'Routine', 'Processing',
      'Routine monitoring; synthetic demonstration only.',
      '2026-08-05T01:00:00.000Z', '2026-08-05T02:00:00.000Z',
    );

    const insertMedication = db.prepare(`
      INSERT INTO medications (id, name, strength, form, unit) VALUES (?, ?, ?, ?, ?)
    `);
    insertMedication.run(1, 'Paracetamol', '500 mg', 'Tablet', 'tablet');
    insertMedication.run(2, 'Amoxicillin', '500 mg', 'Capsule', 'capsule');
    insertMedication.run(3, 'Salbutamol', '100 micrograms/dose', 'Inhaler', 'inhaler');

    const insertInventory = db.prepare(`
      INSERT INTO inventory
        (id, branch_id, medication_id, batch_number, expiry_date, quantity, reorder_level, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertInventory.run(1, 1, 1, 'PCM-DEMO-01', '2027-12-31', 120, 30, '2026-08-05T00:00:00.000Z');
    insertInventory.run(2, 1, 2, 'AMX-DEMO-01', '2027-06-30', 45, 20, '2026-08-05T00:00:00.000Z');
    insertInventory.run(3, 1, 3, 'SAL-DEMO-01', '2028-03-31', 8, 10, '2026-08-05T00:00:00.000Z');

    db.prepare(`
      INSERT INTO invoices
        (id, invoice_number, patient_id, appointment_id, branch_id, description,
         subtotal_cents, gst_cents, total_cents, paid_cents, due_date, status, issued_by,
         issued_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 'INV-2026-000001', 2, 2, 1, 'Outpatient consultation',
      12000, 1200, 13200, 5000, '2026-08-18', 'Partially Paid', 4,
      '2026-08-04T02:00:00.000Z', '2026-08-04T02:10:00.000Z',
    );
    db.prepare(`
      INSERT INTO payments
        (id, invoice_id, amount_cents, method, reference, received_by, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 5000, 'Card', 'DEMO-PAYMENT-001', 4, '2026-08-04T02:10:00.000Z');

    db.prepare(`
      INSERT INTO feedbacks (patient_id, comments, sentiment, created_at)
      VALUES (?, ?, ?, ?)
    `).run(1, 'Excellent treatment from Dr Daniel Chen. The staff was highly professional.', 'Positive', '2026-08-05T03:00:00.000Z');
    db.prepare(`
      INSERT INTO feedbacks (patient_id, comments, sentiment, created_at)
      VALUES (?, ?, ?, ?)
    `).run(2, 'Long waiting time at the pharmacy. The queue was frustrating.', 'Negative', '2026-08-06T04:00:00.000Z');
    db.prepare(`
      INSERT INTO feedbacks (patient_id, comments, sentiment, created_at)
      VALUES (?, ?, ?, ?)
    `).run(1, 'Regular checkup was average, clinic was clean.', 'Neutral', '2026-08-07T05:00:00.000Z');

    // Seed Schedules (FR22)
    const insertSchedule = db.prepare(`
      INSERT INTO schedules (staff_id, branch_id, day_of_week, start_time, end_time, slot_duration_mins)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertSchedule.run(2, 1, 'Monday', '09:00', '17:00', 30);
    insertSchedule.run(2, 1, 'Wednesday', '09:00', '17:00', 30);
    insertSchedule.run(2, 1, 'Friday', '09:00', '13:00', 30);

    // Seed Shifts & Attendance (FR25)
    db.prepare(`
      INSERT INTO shifts (staff_id, branch_id, shift_date, shift_type, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(3, 1, '2026-08-15', 'Morning', 'Scheduled');
    db.prepare(`
      INSERT INTO attendance (staff_id, shift_id, clock_in, status)
      VALUES (?, ?, ?, ?)
    `).run(3, 1, '2026-08-15T07:55:00.000Z', 'Present');

    // Seed Beds & Admissions (FR52, FR53, FR54)
    db.prepare(`INSERT INTO beds (id, branch_id, ward, room_number, bed_number, status) VALUES (1, 1, 'Ward A - General', '101', 'A1', 'Available')`).run();
    db.prepare(`INSERT INTO beds (id, branch_id, ward, room_number, bed_number, status) VALUES (2, 1, 'Ward A - General', '101', 'A2', 'Occupied')`).run();
    db.prepare(`INSERT INTO beds (id, branch_id, ward, room_number, bed_number, status) VALUES (3, 1, 'Ward B - ICU', '201', 'B1', 'Available')`).run();
    
    try {
      db.prepare(`
        INSERT INTO admissions (id, patient_id, branch_id, bed_id, attending_doctor_id, admission_reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(1, 2, 1, 2, 2, 'Hypertension observation & monitoring', 'Admitted');
    } catch(err) {
      console.error('ADMISSIONS SEED ERROR:', err);
      throw err;
    }

    // Seed Purchase Orders (FR29)
    db.prepare(`
      INSERT INTO purchase_orders (po_number, branch_id, medication_id, quantity, status, ordered_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('PO-2026-001', 1, 3, 50, 'Approved', 6);

    // Seed Notifications (FR20, FR27, FR33, FR45)
    db.prepare(`
      INSERT INTO notifications (recipient_user_id, recipient_contact, channel, template, message, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(8, 'patient@demo.stgeorge.local', 'Email', 'APPOINTMENT_REMINDER', 'Reminder: Your appointment with Dr Daniel Chen is scheduled for tomorrow at 10:00 AM.', 'Sent');

    // Seed Patient Consent (FR49)
    db.prepare(`
      INSERT INTO patient_consents (patient_id, purpose, notice_version, status)
      VALUES (?, ?, ?, ?)
    `).run(1, 'General Clinical Care & Telehealth Communications', '1.0', 'Granted');

    audit(db, {
      actorUserId: 1,
      branchId: 1,
      action: 'SYSTEM_SEEDED',
      entityType: 'system',
      entityId: 'demo',
      details: { syntheticDataOnly: true, users: usersToSeed.length },
      ipAddress: '127.0.0.1',
    });
  });
  return true;
}

function openDatabase({ filename = DEFAULT_DATABASE_FILE, seed = true } = {}) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

  // Column migrations
  const invoiceCols = db.prepare('PRAGMA table_info(invoices)').all().map((c) => c.name);
  if (!invoiceCols.includes('due_date')) db.exec('ALTER TABLE invoices ADD COLUMN due_date TEXT;');
  const labCols = db.prepare('PRAGMA table_info(lab_orders)').all().map((c) => c.name);
  if (!labCols.includes('attachment_url')) db.exec('ALTER TABLE lab_orders ADD COLUMN attachment_url TEXT;');
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('specialisation')) db.exec('ALTER TABLE users ADD COLUMN specialisation TEXT;');
  if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT;');
  if (!userCols.includes('mfa_enabled')) db.exec('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;');
  if (!userCols.includes('mfa_secret')) db.exec('ALTER TABLE users ADD COLUMN mfa_secret TEXT;');
  const branchCols = db.prepare('PRAGMA table_info(branches)').all().map((c) => c.name);
  if (!branchCols.includes('departments_json')) db.exec('ALTER TABLE branches ADD COLUMN departments_json TEXT;');

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  if (seed) seedDatabase(db);
  return db;
}

module.exports = {
  DEFAULT_DATABASE_FILE,
  DEMO_PASSWORD,
  DEMO_USERS,
  audit,
  openDatabase,
  seedDatabase,
  withTransaction,
};
