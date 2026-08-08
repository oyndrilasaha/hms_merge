'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DEMO_PASSWORD } = require('../src/database');
const { verifyPassword } = require('../src/auth');
const { assertApiError, startTestServer } = require('./helpers');

const PATIENT_INPUT = {
  firstName: 'Taylor',
  lastName: 'Example',
  dateOfBirth: '1988-05-14',
  gender: 'Non-binary',
  phone: '0400 555 010',
  email: 'taylor.example@example.test',
  address: '55 Synthetic Street, Kogarah NSW',
  emergencyContact: 'Jordan Example – 0400 555 011',
  allergies: 'Synthetic test record: no known allergies',
};

test('T-AUTH-01: login, session cookie, current user, expiry and logout', async (t) => {
  const { app, login, request } = await startTestServer(t);

  const invalid = await request('/api/auth/login', {
    method: 'POST',
    json: { username: 'doctor', password: 'WrongPass!2026' },
  });
  assertApiError(invalid, 401, 'INVALID_CREDENTIALS');
  assert.equal(invalid.payload.error.message, 'Username or password is incorrect.');

  const doctor = await login('doctor');
  assert.equal(doctor.user.role, 'Doctor');
  assert.match(doctor.setCookie, /^sgh_session=[0-9a-f]{64};/);
  assert.match(doctor.setCookie, /HttpOnly/);
  assert.match(doctor.setCookie, /SameSite=Lax/);
  assert.doesNotMatch(doctor.setCookie, new RegExp(DEMO_PASSWORD));

  const me = await request('/api/auth/me', { session: doctor });
  assert.equal(me.status, 200);
  assert.equal(me.payload.data.user.username, 'doctor');
  assert.equal(me.payload.data.csrfToken, doctor.csrfToken);

  app.db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = 2").run();
  const expired = await request('/api/auth/me', { session: doctor });
  assertApiError(expired, 401, 'AUTHENTICATION_REQUIRED');

  const nurse = await login('nurse');
  app.db.prepare('UPDATE users SET active = 0 WHERE username = ?').run('nurse');
  const inactive = await request('/api/auth/me', { session: nurse });
  assertApiError(inactive, 401, 'AUTHENTICATION_REQUIRED');

  const reception = await login('reception');
  const logout = await request('/api/auth/logout', { method: 'POST', session: reception });
  assert.equal(logout.status, 200);
  assert.equal(logout.payload.data.signedOut, true);
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  const afterLogout = await request('/api/auth/me', { session: reception });
  assertApiError(afterLogout, 401, 'AUTHENTICATION_REQUIRED');
});

test('T-AUTH-02: seeded passwords are salted slow hashes and verify safely', async (t) => {
  const { app } = await startTestServer(t);
  const users = app.db.prepare(`
    SELECT username, password_hash, password_salt FROM users ORDER BY id
  `).all();

  assert.equal(users.length, 8);
  assert.equal(new Set(users.map((user) => user.password_salt)).size, users.length);
  for (const user of users) {
    assert.notEqual(user.password_hash, DEMO_PASSWORD);
    assert.match(user.password_salt, /^[0-9a-f]{32}$/);
    assert.match(user.password_hash, /^[0-9a-f]{128}$/);
    assert.equal(verifyPassword(DEMO_PASSWORD, user.password_salt, user.password_hash), true);
    assert.equal(verifyPassword('WrongPass!2026', user.password_salt, user.password_hash), false);
  }
  assert.equal(verifyPassword(DEMO_PASSWORD, 'bad-salt', 'malformed-hash'), false);

  const authSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'auth.js'), 'utf8');
  assert.match(authSource, /scryptSync/);
  assert.match(authSource, /timingSafeEqual/);
});

test('T-RBAC-01 / T-CSRF-01: mutations reject missing CSRF and forbidden roles', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const reception = await login('reception');
  const withoutCsrf = await request('/api/patients', {
    method: 'POST',
    session: { cookie: reception.cookie },
    json: PATIENT_INPUT,
  });
  assertApiError(withoutCsrf, 403, 'CSRF_INVALID');

  const patient = await login('patient');
  const patientCreatesPatient = await request('/api/patients', {
    method: 'POST',
    session: patient,
    json: PATIENT_INPUT,
  });
  assertApiError(patientCreatesPatient, 403, 'FORBIDDEN');

  const receptionistClinicalWrite = await request('/api/clinical-notes', {
    method: 'POST',
    session: reception,
    json: { patientId: 1, assessment: 'Must be rejected' },
  });
  assertApiError(receptionistClinicalWrite, 403, 'FORBIDDEN');

  const pharmacist = await login('pharmacist');
  const pharmacistAuditRead = await request('/api/audit-logs', { session: pharmacist });
  assertApiError(pharmacistAuditRead, 403, 'FORBIDDEN');

  const actions = app.db.prepare(`
    SELECT action FROM audit_logs WHERE action IN ('CSRF_DENIED', 'RBAC_DENIED') ORDER BY id
  `).all().map((row) => row.action);
  assert.ok(actions.includes('CSRF_DENIED'));
  assert.equal(actions.filter((action) => action === 'RBAC_DENIED').length, 3);
});

test('T-PAT-01: receptionist creates a validated patient and unique MRN', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const reception = await login('reception');

  const invalid = await request('/api/patients', {
    method: 'POST',
    session: reception,
    json: { ...PATIENT_INPUT, dateOfBirth: '2099-01-01' },
  });
  assertApiError(invalid, 400, 'VALIDATION_ERROR');
  assert.equal(invalid.payload.error.details.field, 'dateOfBirth');

  const created = await request('/api/patients', {
    method: 'POST',
    session: reception,
    json: PATIENT_INPUT,
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.payload.data.medicalRecordNumber, 'SGH-000003');
  assert.equal(created.payload.data.createdBy, reception.user.id);
  assert.equal(created.payload.data.branchId, reception.user.branch.id);

  const stored = app.db.prepare('SELECT * FROM patients WHERE id = ?').get(created.payload.data.id);
  assert.equal(stored.medical_record_number, 'SGH-000003');
  assert.equal(stored.email, PATIENT_INPUT.email);
  assert.equal(app.db.prepare('SELECT COUNT(DISTINCT medical_record_number) AS count FROM patients').get().count, 3);
});

test('T-APT-01 / T-APT-02: doctor books an appointment and overlap is atomic 409', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const doctor = await login('doctor');
  const appointment = {
    patientId: 1,
    doctorUserId: doctor.user.id,
    startsAt: '2030-03-10T09:00:00.000Z',
    endsAt: '2030-03-10T09:30:00.000Z',
    reason: 'Synthetic follow-up appointment',
    notes: 'Automated evidence record',
  };

  const created = await request('/api/appointments', {
    method: 'POST',
    session: doctor,
    json: appointment,
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.payload.data.patientId, 1);
  assert.equal(created.payload.data.doctorUserId, doctor.user.id);
  assert.equal(created.payload.data.status, 'Scheduled');

  const conflicting = await request('/api/appointments', {
    method: 'POST',
    session: doctor,
    json: {
      ...appointment,
      startsAt: '2030-03-10T09:15:00.000Z',
      endsAt: '2030-03-10T09:45:00.000Z',
    },
  });
  assertApiError(conflicting, 409, 'APPOINTMENT_CONFLICT');
  assert.equal(conflicting.payload.error.details.conflictingAppointmentId, created.payload.data.id);

  const committed = app.db.prepare(`
    SELECT COUNT(*) AS count FROM appointments
    WHERE doctor_user_id = ? AND starts_at >= '2030-03-10T00:00:00.000Z'
  `).get(doctor.user.id).count;
  assert.equal(committed, 1);
});

test('T-CLN-01: doctor appends an attributed clinical note', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const doctor = await login('doctor');
  const before = app.db.prepare('SELECT COUNT(*) AS count FROM clinical_notes').get().count;

  const created = await request('/api/clinical-notes', {
    method: 'POST',
    session: doctor,
    json: {
      patientId: 1,
      appointmentId: 1,
      noteType: 'Progress note',
      subjective: 'Synthetic patient reports improved symptoms.',
      objective: 'Synthetic observation: pulse 70 bpm.',
      assessment: 'Stable for demonstration purposes.',
      plan: 'Continue synthetic follow-up plan.',
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.payload.data.patientId, 1);
  assert.equal(created.payload.data.clinicianUserId, doctor.user.id);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM clinical_notes').get().count, before + 1);

  const listed = await request('/api/clinical-notes?patientId=1', { session: doctor });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.data.items[0].id, created.payload.data.id);
  assert.equal(listed.payload.data.items[0].clinicianName, doctor.user.fullName);
});

test('T-LAB-01: doctor order flows to a lab-technician result', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const doctor = await login('doctor');
  const order = await request('/api/lab-orders', {
    method: 'POST',
    session: doctor,
    json: {
      patientId: 1,
      appointmentId: 1,
      testName: 'Synthetic HbA1c',
      priority: 'Routine',
      clinicalInformation: 'Automated integration evidence only.',
    },
  });
  assert.equal(order.status, 201, order.text);
  assert.equal(order.payload.data.status, 'Ordered');
  assert.equal(order.payload.data.orderedBy, doctor.user.id);

  const doctorCannotResult = await request(`/api/lab-orders/${order.payload.data.id}`, {
    method: 'PATCH',
    session: doctor,
    json: { status: 'Completed', result: '5.1' },
  });
  assertApiError(doctorCannotResult, 403, 'FORBIDDEN');

  const labtech = await login('labtech');
  const resulted = await request(`/api/lab-orders/${order.payload.data.id}`, {
    method: 'PATCH',
    session: labtech,
    json: {
      status: 'Completed',
      result: '5.1',
      resultUnits: '%',
      referenceRange: '4.0–5.6',
      attachmentUrl: 'https://demo.stgeorge.local/reports/hba1c_1.pdf',
    },
  });
  assert.equal(resulted.status, 200, resulted.text);
  assert.equal(resulted.payload.data.status, 'Completed');
  assert.equal(resulted.payload.data.result, '5.1');
  assert.equal(resulted.payload.data.attachmentUrl, 'https://demo.stgeorge.local/reports/hba1c_1.pdf');
  assert.equal(resulted.payload.data.resultedBy, labtech.user.id);
  assert.ok(resulted.payload.data.resultedAt);

  const stored = app.db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(order.payload.data.id);
  assert.equal(stored.status, 'Completed');
  assert.equal(stored.resulted_by, labtech.user.id);
});

test('T-PHM-01 / T-PHM-02: dispensing decrements stock and rejects unsafe batches', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const pharmacist = await login('pharmacist');
  const before = await request('/api/medications/dispense', { session: pharmacist });
  assert.equal(before.status, 200);
  const inventory = before.payload.data.inventory.find((item) => item.id === 1);
  assert.ok(inventory);

  const dispensed = await request('/api/medications/dispense', {
    method: 'POST',
    session: pharmacist,
    json: {
      patientId: 1,
      inventoryId: inventory.id,
      quantity: 3,
      prescriptionReference: 'RX-SYNTHETIC-001',
      instructions: 'Synthetic dispensing instruction.',
    },
  });
  assert.equal(dispensed.status, 201, dispensed.text);
  assert.equal(dispensed.payload.data.patientId, 1);
  assert.equal(dispensed.payload.data.quantity, 3);

  const after = await request('/api/medications/dispense', { session: pharmacist });
  const changed = after.payload.data.inventory.find((item) => item.id === inventory.id);
  assert.equal(changed.quantity, inventory.quantity - 3);

  const insufficient = await request('/api/medications/dispense', {
    method: 'POST',
    session: pharmacist,
    json: {
      patientId: 1,
      inventoryId: inventory.id,
      quantity: 9999,
      prescriptionReference: 'RX-SYNTHETIC-002',
    },
  });
  assertApiError(insufficient, 409, 'INSUFFICIENT_STOCK');
  assert.equal(app.db.prepare('SELECT quantity FROM inventory WHERE id = 1').get().quantity, inventory.quantity - 3);

  app.db.prepare(`
    INSERT INTO inventory
      (id, branch_id, medication_id, batch_number, expiry_date, quantity, reorder_level)
    VALUES (99, 1, 1, 'EXPIRED-EVIDENCE', '2000-01-01', 12, 2)
  `).run();
  const expired = await request('/api/medications/dispense', {
    method: 'POST',
    session: pharmacist,
    json: {
      patientId: 1,
      inventoryId: 99,
      quantity: 1,
      prescriptionReference: 'RX-SYNTHETIC-003',
    },
  });
  assertApiError(expired, 409, 'MEDICATION_EXPIRED');
  assert.equal(app.db.prepare('SELECT quantity FROM inventory WHERE id = 99').get().quantity, 12);
});

test('T-BIL-01: invoice totals and payment-derived status remain consistent', async (t) => {
  const { app, login, request } = await startTestServer(t);
  const reception = await login('reception');
  const created = await request('/api/invoices', {
    method: 'POST',
    session: reception,
    json: {
      patientId: 1,
      appointmentId: 1,
      description: 'Synthetic outpatient consultation',
      subtotalCents: 10000,
      gstCents: 1000,
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.payload.data.totalCents, 11000);
  assert.equal(created.payload.data.balanceCents, 11000);
  assert.equal(created.payload.data.status, 'Issued');

  const paid = await request(`/api/invoices/${created.payload.data.id}`, {
    method: 'PATCH',
    session: reception,
    json: {
      paymentAmountCents: 11000,
      method: 'Card',
      reference: 'SYNTHETIC-PAYMENT-001',
    },
  });
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.payload.data.paidCents, 11000);
  assert.equal(paid.payload.data.balanceCents, 0);
  assert.equal(paid.payload.data.status, 'Paid');
  assert.equal(paid.payload.data.payments.length, 1);

  const stored = app.db.prepare('SELECT * FROM invoices WHERE id = ?').get(created.payload.data.id);
  assert.equal(stored.total_cents, stored.subtotal_cents + stored.gst_cents);
  assert.equal(stored.paid_cents, stored.total_cents);
});

test('T-AUD-01: failed authentication and material writes retain actor/object/time evidence', async (t) => {
  const { login, request } = await startTestServer(t);
  const invalid = await request('/api/auth/login', {
    method: 'POST',
    json: { username: 'admin', password: 'WrongPass!2026' },
  });
  assertApiError(invalid, 401, 'INVALID_CREDENTIALS');

  const reception = await login('reception');
  const patient = await request('/api/patients', {
    method: 'POST',
    session: reception,
    json: PATIENT_INPUT,
  });
  assert.equal(patient.status, 201, patient.text);

  const admin = await login('admin');
  const logs = await request('/api/audit-logs', { session: admin });
  assert.equal(logs.status, 200);
  const items = logs.payload.data.items;
  const failed = items.find((item) => item.action === 'LOGIN_FAILED');
  const created = items.find((item) => item.action === 'PATIENT_CREATED' && item.entityId === String(patient.payload.data.id));
  assert.ok(failed, 'Failed login must be audited.');
  assert.equal(failed.actorUserId, 1);
  assert.equal(failed.entityType, 'user');
  assert.ok(failed.createdAt);
  assert.ok(created, 'Patient creation must be audited.');
  assert.equal(created.actorUserId, reception.user.id);
  assert.equal(created.actorName, reception.user.fullName);
  assert.equal(created.details.medicalRecordNumber, patient.payload.data.medicalRecordNumber);
  assert.ok(created.ipAddress);
});

test('T-SCOPE-01: a patient sees only their own records', async (t) => {
  const { login, request } = await startTestServer(t);
  const patient = await login('patient');

  const patients = await request('/api/patients', { session: patient });
  assert.equal(patients.status, 200);
  assert.deepEqual(patients.payload.data.items.map((item) => item.id), [patient.user.patientId]);

  const appointments = await request('/api/appointments', { session: patient });
  assert.equal(appointments.status, 200);
  assert.ok(appointments.payload.data.items.length > 0);
  assert.ok(appointments.payload.data.items.every((item) => item.patientId === patient.user.patientId));

  const anotherPatientsInvoice = await request('/api/invoices/1', { session: patient });
  assertApiError(anotherPatientsInvoice, 403, 'PATIENT_ACCESS_DENIED');

  const selfBooked = await request('/api/appointments', {
    method: 'POST',
    session: patient,
    json: {
      patientId: 2,
      doctorUserId: 2,
      startsAt: '2031-04-05T08:00:00.000Z',
      endsAt: '2031-04-05T08:30:00.000Z',
      reason: 'Synthetic patient self-booking',
    },
  });
  assert.equal(selfBooked.status, 201, selfBooked.text);
  assert.equal(selfBooked.payload.data.patientId, patient.user.patientId);

  const pharmacy = await request('/api/medications/dispense', { session: patient });
  assert.equal(pharmacy.status, 200);
  assert.deepEqual(pharmacy.payload.data.inventory, []);
  assert.ok(pharmacy.payload.data.dispensings.every((item) => item.patientId === patient.user.patientId));
});

test('T-PWA-01: static shell, manifest, worker and icons are served with security headers', async (t) => {
  const { request } = await startTestServer(t);
  const index = await request('/');
  assert.equal(index.status, 200);
  assert.match(index.response.headers.get('content-type'), /text\/html/);
  assert.match(index.text, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(index.text, /<script src="\/app\.js" defer><\/script>/);
  assert.match(index.response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(index.response.headers.get('x-frame-options'), 'DENY');

  const manifest = await request('/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.response.headers.get('content-type'), /application\/manifest\+json/);
  assert.match(manifest.payload.start_url, /^\//);
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.payload.display));
  assert.ok(Array.isArray(manifest.payload.icons) && manifest.payload.icons.length > 0);

  const worker = await request('/service-worker.js');
  assert.equal(worker.status, 200);
  assert.match(worker.response.headers.get('content-type'), /text\/javascript/);
  assert.match(worker.text, /addEventListener\(['"]install['"]/);
  assert.match(worker.text, /addEventListener\(['"]fetch['"]/);

  const script = await request('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.response.headers.get('content-type'), /text\/javascript/);
  assert.match(script.text, /serviceWorker/);

  const iconPath = new URL(manifest.payload.icons[0].src, 'http://localhost').pathname;
  const icon = await request(iconPath);
  assert.equal(icon.status, 200);
  assert.match(icon.response.headers.get('content-type'), /image\//);
});

test('T-PAT-02: modify patient details via PATCH /api/patients/:id', async (t) => {
  const { login, request } = await startTestServer(t);
  const reception = await login('reception');

  // Modify patient 1 details
  const updateRes = await request('/api/patients/1', {
    method: 'PATCH',
    session: reception,
    json: {
      phone: '0499 999 999',
      allergies: 'Peanuts and Gluten'
    }
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.payload.data.phone, '0499 999 999');
  assert.equal(updateRes.payload.data.allergies, 'Peanuts and Gluten');

  // Verify updates persist
  const listRes = await request('/api/patients', { session: reception });
  const patient1 = listRes.payload.data.items.find(p => p.id === 1);
  assert.equal(patient1.phone, '0499 999 999');
  assert.equal(patient1.allergies, 'Peanuts and Gluten');
});

test('T-APT-03: modify/cancel appointment via PATCH /api/appointments/:id', async (t) => {
  const { login, request } = await startTestServer(t);
  const reception = await login('reception');

  // Attempt to cancel without cancellation reason -> should fail with 400
  const failRes = await request('/api/appointments/1', {
    method: 'PATCH',
    session: reception,
    json: {
      status: 'Cancelled'
    }
  });
  assertApiError(failRes, 400, 'VALIDATION_ERROR');

  // Cancel with cancellation reason -> should succeed
  const cancelRes = await request('/api/appointments/1', {
    method: 'PATCH',
    session: reception,
    json: {
      status: 'Cancelled',
      cancellationReason: 'Patient requested reschedule'
    }
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.payload.data.status, 'Cancelled');

  // Verify updates persist
  const listRes = await request('/api/appointments', { session: reception });
  const apt1 = listRes.payload.data.items.find(a => a.id === 1);
  assert.equal(apt1.status, 'Cancelled');
});

test('T-EXPORT-01: CSV export frontend markup and button exist in toolbar helper', async (t) => {
  const { request } = await startTestServer(t);
  const appJs = await request('/app.js');
  assert.equal(appJs.status, 200);
  assert.match(appJs.text, /data-export-csv/);
  assert.match(appJs.text, /exportToCSV/);
});

test('T-CHAT-01: care assistant chatbot drawer is served in the layout and bundle', async (t) => {
  const { request } = await startTestServer(t);
  const index = await request('/');
  assert.match(index.text, /id="chat-widget"/);
  assert.match(index.text, /id="chat-drawer"/);

  const appJs = await request('/app.js');
  assert.match(appJs.text, /initChatbot/);
  assert.match(appJs.text, /getAssistantReply/);
});

test('T-PUBLIC-01: public hospital homepage, doctor directory and portal gateway are served', async (t) => {
  const { request } = await startTestServer(t);
  
  const index = await request('/');
  assert.equal(index.status, 200);
  assert.match(index.text, /id="public-portal"/);
  assert.match(index.text, /id="public-search"/);
  assert.match(index.text, /Dr\. Daniel Chen/);
  assert.match(index.text, /MBBS \(Hons\), FRACP, FCSANZ/);
  assert.match(index.text, /id="portal-toggle"/);
  assert.match(index.text, /id="back-to-home"/);

  const appJs = await request('/app.js');
  assert.match(appJs.text, /showPublicPortal/);
  assert.match(appJs.text, /initPublicSearch/);
});




