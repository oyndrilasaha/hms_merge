'use strict';

const { timingSafeEqual } = require('node:crypto');
const {
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  hashPassword,
  publicUser,
  sessionCookie,
  verifyPassword,
} = require('./auth');
const { audit, withTransaction } = require('./database');
const {
  ApiError,
  camelize,
  clientIp,
  dateField,
  emailField,
  enumField,
  integerField,
  readJson,
  sendData,
  stringField,
} = require('./http-utils');

const ALL_ROLES = [
  'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Lab Technician',
  'Pharmacist', 'Branch Manager', 'Patient',
];
const GENDERS = ['Female', 'Male', 'Non-binary', 'Other', 'Not specified'];
const APPOINTMENT_STATUSES = ['Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'];
const LAB_STATUSES = ['Ordered', 'Collected', 'Processing', 'Completed', 'Cancelled'];
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Medicare', 'Other'];
const INVOICE_STATUSES = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Void'];

function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAdmin(session) {
  return session.role === 'Admin';
}

function rowOr404(row, label) {
  if (!row) throw new ApiError(404, 'NOT_FOUND', `${label} was not found.`);
  return row;
}

function ensureBranchAccess(session, branchId) {
  if (!isAdmin(session) && session.branch_id !== branchId) {
    throw new ApiError(403, 'BRANCH_ACCESS_DENIED', 'You cannot access records from another branch.');
  }
}

function createApi(db, { secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  const dummy = hashPassword('invalid-password', '1f75a6a2e51429d53f62225da72b7eef');
  const failedLogins = new Map();

  function log(req, session, action, entityType, entityId, details = {}) {
    audit(db, {
      actorUserId: session?.id || null,
      branchId: session?.branch_id || null,
      action,
      entityType,
      entityId,
      details,
      ipAddress: clientIp(req),
    });
  }

  function requireSession(req) {
    const session = getSession(db, req);
    if (!session) {
      log(req, null, 'AUTHENTICATION_DENIED', 'route', req.url, { method: req.method });
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Please sign in to continue.');
    }
    return session;
  }

  function requireRole(req, session, allowed) {
    if (!allowed.includes(session.role)) {
      log(req, session, 'RBAC_DENIED', 'route', req.url, {
        method: req.method,
        role: session.role,
        allowedRoles: allowed,
      });
      throw new ApiError(403, 'FORBIDDEN', 'Your role does not permit this action.');
    }
  }

  function requireCsrf(req, session) {
    const supplied = req.headers['x-csrf-token'];
    if (!safeEqualText(supplied, session.csrf_token)) {
      log(req, session, 'CSRF_DENIED', 'route', req.url, { method: req.method });
      throw new ApiError(403, 'CSRF_INVALID', 'The security token is missing or invalid. Refresh and try again.');
    }
  }

  function branchIdFor(session, requested) {
    const branchId = requested || session.branch_id;
    if (!branchId) throw new ApiError(400, 'VALIDATION_ERROR', 'A branch is required.', { field: 'branchId' });
    ensureBranchAccess(session, branchId);
    rowOr404(db.prepare('SELECT id FROM branches WHERE id = ? AND active = 1').get(branchId), 'Branch');
    return branchId;
  }

  function addBranchFilter(url, session, conditions, params, column) {
    const raw = url.searchParams.get('branchId');
    let selected = null;
    if (raw) {
      selected = Number(raw);
      if (!Number.isSafeInteger(selected) || selected < 1) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Branch filter is invalid.', { field: 'branchId' });
      }
      ensureBranchAccess(session, selected);
    } else if (!isAdmin(session)) {
      selected = session.branch_id;
    }
    if (selected) {
      conditions.push(`${column} = ?`);
      params.push(selected);
    }
    return selected;
  }

  function patientForSession(session, patientId) {
    const patient = rowOr404(db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId), 'Patient');
    if (session.role === 'Patient' && session.patient_id !== patient.id) {
      throw new ApiError(403, 'PATIENT_ACCESS_DENIED', 'Patients can only access their own record.');
    }
    ensureBranchAccess(session, patient.branch_id);
    return patient;
  }

  async function login(req, res) {
    const body = await readJson(req);
    const username = stringField(body, 'username', { required: true, min: 2, max: 80, label: 'Username' });
    const password = stringField(body, 'password', { required: true, min: 8, max: 200, label: 'Password' });
    const key = `${clientIp(req) || 'unknown'}:${username.toLowerCase()}`;
    const now = Date.now();
    const attempts = (failedLogins.get(key) || []).filter((time) => now - time < 5 * 60 * 1000);
    if (attempts.length >= 5) {
      log(req, null, 'LOGIN_RATE_LIMITED', 'user', username, { username });
      throw new ApiError(429, 'LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again in five minutes.');
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
    const valid = user
      ? verifyPassword(password, user.password_salt, user.password_hash)
      : verifyPassword(password, dummy.salt, dummy.hash);
    if (!user || !user.active || !valid) {
      attempts.push(now);
      failedLogins.set(key, attempts);
      audit(db, {
        actorUserId: user?.id || null,
        branchId: user?.branch_id || null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id || username,
        details: { username },
        ipAddress: clientIp(req),
      });
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
    }

    failedLogins.delete(key);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    const created = createSession(db, user.id);
    const session = getSession(db, { headers: { cookie: `sgh_session=${created.token}` } });
    log(req, session, 'LOGIN_SUCCEEDED', 'user', user.id, { username: user.username });
    sendData(res, {
      user: publicUser(session),
      csrfToken: created.csrfToken,
      expiresAt: created.expiresAt,
    }, 200, { 'Set-Cookie': sessionCookie(created.token, { secure: secureCookies }) });
  }

  function getPatients(req, res, url, session) {
    requireRole(req, session, ALL_ROLES);
    const conditions = [];
    const params = [];
    if (session.role === 'Patient') {
      conditions.push('p.id = ?');
      params.push(session.patient_id || -1);
    } else {
      addBranchFilter(url, session, conditions, params, 'p.branch_id');
    }
    const query = (url.searchParams.get('q') || '').trim();
    if (query) {
      conditions.push(`(
        p.first_name LIKE ? OR p.last_name LIKE ? OR p.medical_record_number LIKE ?
      )`);
      const term = `%${query.slice(0, 80)}%`;
      params.push(term, term, term);
    }
    const rows = db.prepare(`
      SELECT p.*, b.code AS branch_code, b.name AS branch_name
      FROM patients p
      JOIN branches b ON b.id = p.branch_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY p.last_name, p.first_name
      LIMIT 100
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  async function createPatient(req, res, session) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager']);
    const body = await readJson(req);
    const firstName = stringField(body, 'firstName', { required: true, min: 1, max: 80, label: 'First name' });
    const lastName = stringField(body, 'lastName', { required: true, min: 1, max: 80, label: 'Last name' });
    const dateOfBirth = dateField(body, 'dateOfBirth', { required: true, dateOnly: true, label: 'Date of birth' });
    if (dateOfBirth > new Date().toISOString().slice(0, 10)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Date of birth cannot be in the future.', { field: 'dateOfBirth' });
    }
    const sexMap = {
      female: 'Female', male: 'Male', intersex: 'Other', unspecified: 'Not specified',
    };
    const submittedGender = body.gender || sexMap[String(body.sex || '').toLowerCase()];
    const gender = submittedGender
      ? enumField({ gender: submittedGender }, 'gender', GENDERS, { label: 'Gender' })
      : 'Not specified';
    const phone = stringField(body, 'phone', { max: 40, label: 'Phone' });
    const email = emailField(body, 'email');
    const address = stringField(body, 'address', { max: 300, label: 'Address' });
    const emergencyContact = stringField(body, 'emergencyContact', { max: 200, label: 'Emergency contact' })
      || [body.emergencyContactName, body.emergencyContactPhone].filter(Boolean).join(' – ').slice(0, 200)
      || null;
    const allergies = stringField(body, 'allergies', { max: 500, label: 'Allergies' });
    const requestedBranchId = integerField(body, 'branchId');
    const branchId = branchIdFor(session, requestedBranchId);

    const patient = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM patients').get().id);
      const mrn = `SGH-${String(id).padStart(6, '0')}`;
      db.prepare(`
        INSERT INTO patients
          (id, medical_record_number, branch_id, first_name, last_name, date_of_birth,
           gender, phone, email, address, emergency_contact, allergies, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, mrn, branchId, firstName, lastName, dateOfBirth, gender,
        phone, email, address, emergencyContact, allergies, session.id,
      );
      log(req, session, 'PATIENT_CREATED', 'patient', id, { medicalRecordNumber: mrn, branchId });
      return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    });
    sendData(res, camelize(patient), 201);
  }

  function getAppointments(req, res, url, session) {
    requireRole(req, session, ALL_ROLES);
    const conditions = [];
    const params = [];
    if (session.role === 'Patient') {
      conditions.push('a.patient_id = ?');
      params.push(session.patient_id || -1);
    } else if (session.role === 'Doctor') {
      conditions.push('a.doctor_user_id = ?');
      params.push(session.id);
    } else {
      addBranchFilter(url, session, conditions, params, 'a.branch_id');
    }
    const status = url.searchParams.get('status');
    if (status && APPOINTMENT_STATUSES.includes(status)) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    const patientId = Number(url.searchParams.get('patientId'));
    if (Number.isSafeInteger(patientId) && patientId > 0 && session.role !== 'Patient') {
      conditions.push('a.patient_id = ?');
      params.push(patientId);
    }
    const rows = db.prepare(`
      SELECT a.*, p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        u.full_name AS doctor_name, b.name AS branch_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN users u ON u.id = a.doctor_user_id
      JOIN branches b ON b.id = a.branch_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY a.starts_at DESC
      LIMIT 150
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  async function createAppointment(req, res, session) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager', 'Doctor', 'Patient']);
    const body = await readJson(req);
    let patientId = integerField(body, 'patientId', { required: session.role !== 'Patient', label: 'Patient' });
    if (session.role === 'Patient') patientId = session.patient_id;
    if (!patientId) throw new ApiError(403, 'PATIENT_PROFILE_REQUIRED', 'No patient profile is linked to this account.');
    const patient = patientForSession(session, patientId);
    const doctorUserId = integerField(body, 'doctorUserId', { required: true, label: 'Doctor' });
    const startsAt = dateField(body, 'startsAt', { required: true, label: 'Start time' });
    const endsAt = dateField(body, 'endsAt', { required: true, label: 'End time' });
    if (endsAt <= startsAt) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'End time must be after start time.', { field: 'endsAt' });
    }
    if (new Date(endsAt) - new Date(startsAt) > 8 * 60 * 60 * 1000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'An appointment cannot exceed eight hours.', { field: 'endsAt' });
    }
    const reason = stringField(body, 'reason', { required: true, min: 2, max: 300, label: 'Reason' });
    const notes = stringField(body, 'notes', { max: 1000, label: 'Notes' });
    const requestedBranchId = integerField(body, 'branchId');
    const branchId = branchIdFor(session, requestedBranchId || patient.branch_id);
    if (patient.branch_id !== branchId) {
      throw new ApiError(400, 'BRANCH_MISMATCH', 'The appointment branch must match the patient branch.');
    }
    const doctor = rowOr404(db.prepare(`
      SELECT id, branch_id FROM users WHERE id = ? AND role = 'Doctor' AND active = 1
    `).get(doctorUserId), 'Doctor');
    if (doctor.branch_id !== branchId) {
      throw new ApiError(400, 'BRANCH_MISMATCH', 'The selected doctor does not work at this branch.');
    }

    const appointment = withTransaction(db, () => {
      const conflict = db.prepare(`
        SELECT id, starts_at, ends_at FROM appointments
        WHERE doctor_user_id = ?
          AND status NOT IN ('Cancelled', 'No Show')
          AND starts_at < ? AND ends_at > ?
        LIMIT 1
      `).get(doctorUserId, endsAt, startsAt);
      if (conflict) {
        throw new ApiError(409, 'APPOINTMENT_CONFLICT', 'The doctor already has an appointment during this time.', {
          conflictingAppointmentId: conflict.id,
        });
      }
      const result = db.prepare(`
        INSERT INTO appointments
          (patient_id, doctor_user_id, branch_id, starts_at, ends_at, reason, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(patientId, doctorUserId, branchId, startsAt, endsAt, reason, notes, session.id);
      const id = Number(result.lastInsertRowid);
      log(req, session, 'APPOINTMENT_CREATED', 'appointment', id, {
        patientId, doctorUserId, branchId, startsAt, endsAt,
      });
      return db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    });
    sendData(res, camelize(appointment), 201);
  }

  function getClinicalNotes(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Patient']);
    const conditions = [];
    const params = [];
    if (session.role === 'Patient') {
      conditions.push('n.patient_id = ?');
      params.push(session.patient_id || -1);
    } else {
      addBranchFilter(url, session, conditions, params, 'p.branch_id');
    }
    const patientId = Number(url.searchParams.get('patientId'));
    if (Number.isSafeInteger(patientId) && patientId > 0 && session.role !== 'Patient') {
      conditions.push('n.patient_id = ?');
      params.push(patientId);
    }
    const rows = db.prepare(`
      SELECT n.*, p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        u.full_name AS clinician_name, u.role AS clinician_role
      FROM clinical_notes n
      JOIN patients p ON p.id = n.patient_id
      JOIN users u ON u.id = n.clinician_user_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY n.created_at DESC
      LIMIT 150
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  async function createClinicalNote(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse']);
    const body = await readJson(req);
    const patientId = integerField(body, 'patientId', { required: true, label: 'Patient' });
    const patient = patientForSession(session, patientId);
    const appointmentId = integerField(body, 'appointmentId');
    if (appointmentId) {
      const appointment = rowOr404(db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId), 'Appointment');
      if (appointment.patient_id !== patientId) {
        throw new ApiError(400, 'RECORD_MISMATCH', 'The appointment does not belong to this patient.');
      }
      ensureBranchAccess(session, appointment.branch_id);
    }
    const noteType = stringField(body, 'noteType', { max: 80, label: 'Note type' }) || 'Progress note';
    const subjective = stringField(body, 'subjective', { max: 4000, label: 'Subjective notes' });
    const objective = stringField(body, 'objective', { max: 4000, label: 'Objective notes' })
      || stringField(body, 'observations', { max: 4000, label: 'Observations' });
    const assessment = stringField(body, 'assessment', { max: 4000, label: 'Assessment' })
      || stringField(body, 'diagnosis', { max: 4000, label: 'Diagnosis' });
    const plan = stringField(body, 'plan', { max: 4000, label: 'Plan' })
      || stringField(body, 'treatmentPlan', { max: 4000, label: 'Treatment plan' });
    if (![subjective, objective, assessment, plan].some(Boolean)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'At least one clinical note section is required.');
    }
    const result = db.prepare(`
      INSERT INTO clinical_notes
        (patient_id, appointment_id, clinician_user_id, note_type,
         subjective, objective, assessment, plan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(patient.id, appointmentId, session.id, noteType, subjective, objective, assessment, plan);
    const id = Number(result.lastInsertRowid);
    log(req, session, 'CLINICAL_NOTE_CREATED', 'clinical_note', id, {
      patientId: patient.id, appointmentId,
    });
    const note = db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(id);
    sendData(res, camelize(note), 201);
  }

  function getLabOrders(req, res, url, session, requestedId = null) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Lab Technician', 'Patient']);
    const conditions = [];
    const params = [];
    if (requestedId) {
      conditions.push('l.id = ?');
      params.push(requestedId);
    }
    if (session.role === 'Patient') {
      conditions.push('l.patient_id = ?');
      params.push(session.patient_id || -1);
    } else {
      addBranchFilter(url, session, conditions, params, 'l.branch_id');
    }
    const patientId = Number(url.searchParams.get('patientId'));
    if (Number.isSafeInteger(patientId) && patientId > 0 && session.role !== 'Patient') {
      conditions.push('l.patient_id = ?');
      params.push(patientId);
    }
    const status = url.searchParams.get('status');
    if (status && LAB_STATUSES.includes(status)) {
      conditions.push('l.status = ?');
      params.push(status);
    }
    const rows = db.prepare(`
      SELECT l.*, p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        ordered.full_name AS ordered_by_name,
        resulted.full_name AS resulted_by_name,
        b.name AS branch_name
      FROM lab_orders l
      JOIN patients p ON p.id = l.patient_id
      JOIN users ordered ON ordered.id = l.ordered_by
      LEFT JOIN users resulted ON resulted.id = l.resulted_by
      JOIN branches b ON b.id = l.branch_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY l.ordered_at DESC
      LIMIT 150
    `).all(...params);
    if (requestedId) sendData(res, camelize(rowOr404(rows[0], 'Lab order')));
    else sendData(res, { items: camelize(rows) });
  }

  async function createLabOrder(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse']);
    const body = await readJson(req);
    const patientId = integerField(body, 'patientId', { required: true, label: 'Patient' });
    const patient = patientForSession(session, patientId);
    const appointmentId = integerField(body, 'appointmentId');
    if (appointmentId) {
      const appointment = rowOr404(db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId), 'Appointment');
      if (appointment.patient_id !== patient.id) {
        throw new ApiError(400, 'RECORD_MISMATCH', 'The appointment does not belong to this patient.');
      }
    }
    const testName = stringField(body, 'testName', { required: true, min: 2, max: 160, label: 'Test name' });
    const normalizedPriority = body.priority
      ? `${String(body.priority).charAt(0).toUpperCase()}${String(body.priority).slice(1).toLowerCase()}`
      : null;
    const priority = enumField({ priority: normalizedPriority }, 'priority', ['Routine', 'Urgent'], { fallback: 'Routine', label: 'Priority' });
    const clinicalInformation = stringField(body, 'clinicalInformation', { max: 2000, label: 'Clinical information' });
    const requestedBranchId = integerField(body, 'branchId');
    const branchId = branchIdFor(session, requestedBranchId || patient.branch_id);
    if (patient.branch_id !== branchId) {
      throw new ApiError(400, 'BRANCH_MISMATCH', 'The lab order branch must match the patient branch.');
    }
    const result = db.prepare(`
      INSERT INTO lab_orders
        (patient_id, appointment_id, ordered_by, branch_id, test_name, priority, clinical_information)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(patient.id, appointmentId, session.id, branchId, testName, priority, clinicalInformation);
    const id = Number(result.lastInsertRowid);
    log(req, session, 'LAB_ORDER_CREATED', 'lab_order', id, {
      patientId: patient.id, appointmentId, testName, priority,
    });
    const order = db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(id);
    sendData(res, camelize(order), 201);
  }

  async function updateLabOrder(req, res, session, id) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Lab Technician']);
    const order = rowOr404(db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(id), 'Lab order');
    ensureBranchAccess(session, order.branch_id);
    const body = await readJson(req);
    const normalizedStatus = body.status
      ? String(body.status).split(' ').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join(' ')
      : null;
    const status = enumField({ status: normalizedStatus }, 'status', LAB_STATUSES, { label: 'Status' });
    const resultText = stringField(body, 'result', { max: 6000, label: 'Result' })
      || stringField(body, 'resultValue', { max: 6000, label: 'Result' });
    const resultUnits = stringField(body, 'resultUnits', { max: 80, label: 'Result units' });
    const referenceRange = stringField(body, 'referenceRange', { max: 160, label: 'Reference range' });
    if (![status, resultText, resultUnits, referenceRange].some((value) => value !== null)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one lab order field to update.');
    }
    if (session.role === 'Doctor' && status !== 'Cancelled') {
      throw new ApiError(403, 'FORBIDDEN', 'Doctors may only cancel a lab order.');
    }
    if (session.role === 'Nurse' && status !== 'Collected') {
      throw new ApiError(403, 'FORBIDDEN', 'Nurses may only mark a lab order as collected.');
    }
    if ((resultText !== null || resultUnits !== null || referenceRange !== null)
        && !['Admin', 'Lab Technician'].includes(session.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Only laboratory staff may enter results.');
    }
    const finalStatus = status || order.status;
    const finalResult = resultText !== null ? resultText : order.result;
    if (finalStatus === 'Completed' && !finalResult) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A completed lab order must include a result.', { field: 'result' });
    }
    const isResulted = finalStatus === 'Completed' || resultText !== null;
    db.prepare(`
      UPDATE lab_orders SET
        status = ?,
        result = COALESCE(?, result),
        result_units = COALESCE(?, result_units),
        reference_range = COALESCE(?, reference_range),
        resulted_by = CASE WHEN ? THEN ? ELSE resulted_by END,
        resulted_at = CASE WHEN ? THEN ? ELSE resulted_at END,
        updated_at = ?
      WHERE id = ?
    `).run(
      finalStatus, resultText, resultUnits, referenceRange,
      isResulted ? 1 : 0, session.id,
      isResulted ? 1 : 0, new Date().toISOString(),
      new Date().toISOString(), id,
    );
    log(req, session, 'LAB_ORDER_UPDATED', 'lab_order', id, {
      status: finalStatus,
      resultEntered: resultText !== null,
    });
    sendData(res, camelize(db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(id)));
  }

  function getMedicationDispensing(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Patient']);
    let inventory = [];
    if (session.role !== 'Patient') {
      const conditions = [];
      const params = [];
      addBranchFilter(url, session, conditions, params, 'i.branch_id');
      inventory = db.prepare(`
        SELECT i.*, m.name, m.strength, m.form, m.unit,
          b.name AS branch_name,
          CASE WHEN i.quantity <= i.reorder_level THEN 1 ELSE 0 END AS low_stock
        FROM inventory i
        JOIN medications m ON m.id = i.medication_id
        JOIN branches b ON b.id = i.branch_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY m.name, i.expiry_date
      `).all(...params);
    }
    const conditions = [];
    const params = [];
    if (session.role === 'Patient') {
      conditions.push('d.patient_id = ?');
      params.push(session.patient_id || -1);
    } else {
      addBranchFilter(url, session, conditions, params, 'd.branch_id');
    }
    const dispensings = db.prepare(`
      SELECT d.*, m.name, m.strength, m.form, m.unit,
        p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        u.full_name AS dispensed_by_name
      FROM dispensings d
      JOIN medications m ON m.id = d.medication_id
      JOIN patients p ON p.id = d.patient_id
      JOIN users u ON u.id = d.dispensed_by
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY d.dispensed_at DESC
      LIMIT 100
    `).all(...params);
    sendData(res, { inventory: camelize(inventory), dispensings: camelize(dispensings) });
  }

  async function dispenseMedication(req, res, session) {
    requireRole(req, session, ['Admin', 'Pharmacist']);
    const body = await readJson(req);
    const patientId = integerField(body, 'patientId', { required: true, label: 'Patient' });
    const inventoryId = integerField(
      { inventoryId: body.inventoryId ?? body.medicationId },
      'inventoryId',
      { required: true, label: 'Inventory item' },
    );
    const quantity = integerField(body, 'quantity', { required: true, min: 1, max: 10000, label: 'Quantity' });
    const prescriptionReference = stringField(body, 'prescriptionReference', {
      required: true, min: 2, max: 100, label: 'Prescription reference',
    });
    const instructions = stringField(body, 'instructions', { max: 1000, label: 'Instructions' });
    const patient = patientForSession(session, patientId);

    const dispensing = withTransaction(db, () => {
      const item = rowOr404(db.prepare(`
        SELECT i.*, m.name, m.strength FROM inventory i
        JOIN medications m ON m.id = i.medication_id
        WHERE i.id = ?
      `).get(inventoryId), 'Inventory item');
      ensureBranchAccess(session, item.branch_id);
      if (patient.branch_id !== item.branch_id) {
        throw new ApiError(400, 'BRANCH_MISMATCH', 'Patient and medication stock must belong to the same branch.');
      }
      if (item.expiry_date < new Date().toISOString().slice(0, 10)) {
        throw new ApiError(409, 'MEDICATION_EXPIRED', 'This medication batch is expired and cannot be dispensed.');
      }
      if (item.quantity < quantity) {
        throw new ApiError(409, 'INSUFFICIENT_STOCK', 'There is not enough stock to complete this dispensing.', {
          available: item.quantity,
        });
      }
      db.prepare(`
        UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?
      `).run(quantity, new Date().toISOString(), inventoryId);
      const result = db.prepare(`
        INSERT INTO dispensings
          (patient_id, branch_id, medication_id, inventory_id, prescription_reference,
           quantity, dispensed_by, instructions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patient.id, item.branch_id, item.medication_id, item.id,
        prescriptionReference, quantity, session.id, instructions,
      );
      const id = Number(result.lastInsertRowid);
      log(req, session, 'MEDICATION_DISPENSED', 'dispensing', id, {
        patientId: patient.id,
        inventoryId,
        medicationId: item.medication_id,
        quantity,
        remainingStock: item.quantity - quantity,
      });
      return db.prepare(`
        SELECT d.*, m.name, m.strength, m.form, m.unit
        FROM dispensings d JOIN medications m ON m.id = d.medication_id
        WHERE d.id = ?
      `).get(id);
    });
    sendData(res, camelize(dispensing), 201);
  }

  function invoiceDetails(id) {
    const invoice = rowOr404(db.prepare(`
      SELECT i.*, p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        b.name AS branch_name,
        i.total_cents - i.paid_cents AS balance_cents,
        ROUND(i.total_cents / 100.0, 2) AS amount
      FROM invoices i
      JOIN patients p ON p.id = i.patient_id
      JOIN branches b ON b.id = i.branch_id
      WHERE i.id = ?
    `).get(id), 'Invoice');
    const payments = db.prepare(`
      SELECT py.*, u.full_name AS received_by_name
      FROM payments py JOIN users u ON u.id = py.received_by
      WHERE py.invoice_id = ? ORDER BY py.paid_at DESC
    `).all(id);
    return { ...camelize(invoice), payments: camelize(payments) };
  }

  function getInvoices(req, res, url, session, requestedId = null) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager', 'Patient']);
    if (requestedId) {
      const details = invoiceDetails(requestedId);
      if (session.role === 'Patient' && details.patientId !== session.patient_id) {
        throw new ApiError(403, 'PATIENT_ACCESS_DENIED', 'Patients can only access their own invoices.');
      }
      ensureBranchAccess(session, details.branchId);
      sendData(res, details);
      return;
    }
    const conditions = [];
    const params = [];
    if (session.role === 'Patient') {
      conditions.push('i.patient_id = ?');
      params.push(session.patient_id || -1);
    } else {
      addBranchFilter(url, session, conditions, params, 'i.branch_id');
    }
    const status = url.searchParams.get('status');
    if (status && INVOICE_STATUSES.includes(status)) {
      conditions.push('i.status = ?');
      params.push(status);
    }
    const rows = db.prepare(`
      SELECT i.*, p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        b.name AS branch_name,
        i.total_cents - i.paid_cents AS balance_cents,
        ROUND(i.total_cents / 100.0, 2) AS amount
      FROM invoices i
      JOIN patients p ON p.id = i.patient_id
      JOIN branches b ON b.id = i.branch_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY i.issued_at DESC
      LIMIT 150
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  async function createInvoice(req, res, session) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager']);
    const body = await readJson(req);
    const patientId = integerField(body, 'patientId', { required: true, label: 'Patient' });
    const patient = patientForSession(session, patientId);
    const appointmentId = integerField(body, 'appointmentId');
    if (appointmentId) {
      const appointment = rowOr404(db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId), 'Appointment');
      if (appointment.patient_id !== patient.id) {
        throw new ApiError(400, 'RECORD_MISMATCH', 'The appointment does not belong to this patient.');
      }
    }
    const description = stringField(body, 'description', { required: true, min: 2, max: 300, label: 'Description' });
    const amountDollars = body.amount == null ? null : Number(body.amount);
    if (amountDollars !== null && (!Number.isFinite(amountDollars) || amountDollars < 0 || amountDollars > 1000000)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Amount must be a valid monetary value.', { field: 'amount' });
    }
    if (body.subtotalCents == null && amountDollars == null) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Subtotal is required.', { field: 'subtotalCents' });
    }
    const subtotalCents = body.subtotalCents != null
      ? integerField(body, 'subtotalCents', { required: true, min: 0, max: 100000000, label: 'Subtotal' })
      : Math.round(amountDollars * 100);
    if (!Number.isSafeInteger(subtotalCents)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Subtotal is required.', { field: 'subtotalCents' });
    }
    const gstCents = integerField(body, 'gstCents', { min: 0, max: 10000000, label: 'GST' }) || 0;
    const dueDate = dateField(body, 'dueDate', { dateOnly: true, label: 'Due date' });
    const requestedBranchId = integerField(body, 'branchId');
    const branchId = branchIdFor(session, requestedBranchId || patient.branch_id);
    if (branchId !== patient.branch_id) {
      throw new ApiError(400, 'BRANCH_MISMATCH', 'The invoice branch must match the patient branch.');
    }

    const invoice = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM invoices').get().id);
      const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${String(id).padStart(6, '0')}`;
      const totalCents = subtotalCents + gstCents;
      db.prepare(`
        INSERT INTO invoices
          (id, invoice_number, patient_id, appointment_id, branch_id, description,
           subtotal_cents, gst_cents, total_cents, due_date, issued_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, invoiceNumber, patient.id, appointmentId, branchId, description,
        subtotalCents, gstCents, totalCents, dueDate, session.id,
      );
      log(req, session, 'INVOICE_CREATED', 'invoice', id, {
        invoiceNumber, patientId: patient.id, totalCents,
      });
      return invoiceDetails(id);
    });
    sendData(res, invoice, 201);
  }

  async function updateInvoice(req, res, session, id) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager']);
    const invoice = rowOr404(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id), 'Invoice');
    ensureBranchAccess(session, invoice.branch_id);
    const body = await readJson(req);
    let paymentAmountCents = integerField(body, 'paymentAmountCents', {
      min: 1, max: 100000000, label: 'Payment amount',
    });
    const methodMap = {
      cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer', medicare: 'Medicare', other: 'Other',
    };
    const suppliedMethod = body.method || methodMap[String(body.paymentMethod || '').toLowerCase()];
    const method = enumField({ method: suppliedMethod }, 'method', PAYMENT_METHODS, { label: 'Payment method' });
    const reference = stringField(body, 'reference', { max: 120, label: 'Payment reference' })
      || stringField(body, 'paymentReference', { max: 120, label: 'Payment reference' });
    const normalizedInvoiceStatus = body.status
      ? String(body.status).split(' ').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join(' ')
      : null;
    let status = enumField({ status: normalizedInvoiceStatus }, 'status', INVOICE_STATUSES, { label: 'Status' });
    if (status === 'Paid' && !paymentAmountCents) {
      paymentAmountCents = invoice.total_cents - invoice.paid_cents;
      status = null;
    }
    if (!paymentAmountCents && !status) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a payment or a status update.');
    }
    if (paymentAmountCents && !method) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Payment method is required with a payment.', { field: 'method' });
    }
    if (status && session.role !== 'Admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an administrator may directly change invoice status.');
    }

    withTransaction(db, () => {
      const current = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (paymentAmountCents) {
        if (current.status === 'Void') throw new ApiError(409, 'INVOICE_VOID', 'A void invoice cannot receive payments.');
        const balance = current.total_cents - current.paid_cents;
        if (paymentAmountCents > balance) {
          throw new ApiError(409, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the invoice balance.', { balanceCents: balance });
        }
        db.prepare(`
          INSERT INTO payments (invoice_id, amount_cents, method, reference, received_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, paymentAmountCents, method, reference, session.id);
        const paidCents = current.paid_cents + paymentAmountCents;
        const calculatedStatus = paidCents === current.total_cents ? 'Paid' : 'Partially Paid';
        db.prepare(`
          UPDATE invoices SET paid_cents = ?, status = ?, updated_at = ? WHERE id = ?
        `).run(paidCents, calculatedStatus, new Date().toISOString(), id);
        log(req, session, 'PAYMENT_RECORDED', 'invoice', id, {
          amountCents: paymentAmountCents, method, paidCents, status: calculatedStatus,
        });
      }
      if (status) {
        if (['Paid', 'Partially Paid'].includes(status)) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Paid status is calculated from recorded payments.');
        }
        db.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?')
          .run(status, new Date().toISOString(), id);
        log(req, session, 'INVOICE_STATUS_UPDATED', 'invoice', id, { status });
      }
    });
    sendData(res, invoiceDetails(id));
  }

  function getDashboard(req, res, url, session) {
    requireRole(req, session, ALL_ROLES);
    const patientScope = session.role === 'Patient';
    const requestedBranch = url.searchParams.get('branchId');
    let selectedBranchId = null;
    if (!patientScope) {
      if (requestedBranch) {
        selectedBranchId = Number(requestedBranch);
        if (!Number.isSafeInteger(selectedBranchId) || selectedBranchId < 1) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Branch filter is invalid.', { field: 'branchId' });
        }
        ensureBranchAccess(session, selectedBranchId);
      } else if (!isAdmin(session)) {
        selectedBranchId = session.branch_id;
      }
    }
    const branchScope = !patientScope && Boolean(selectedBranchId);
    const patientId = session.patient_id || -1;
    const branchId = selectedBranchId || -1;
    const scalar = (sql, ...params) => Number(db.prepare(sql).get(...params).value || 0);

    const patientCount = patientScope
      ? scalar('SELECT COUNT(*) AS value FROM patients WHERE id = ?', patientId)
      : branchScope
        ? scalar('SELECT COUNT(*) AS value FROM patients WHERE branch_id = ?', branchId)
        : scalar('SELECT COUNT(*) AS value FROM patients');
    const appointmentCount = patientScope
      ? scalar(`SELECT COUNT(*) AS value FROM appointments WHERE patient_id = ? AND status IN ('Scheduled', 'Checked In', 'In Progress')`, patientId)
      : branchScope
        ? scalar(`SELECT COUNT(*) AS value FROM appointments WHERE branch_id = ? AND status IN ('Scheduled', 'Checked In', 'In Progress')`, branchId)
        : scalar(`SELECT COUNT(*) AS value FROM appointments WHERE status IN ('Scheduled', 'Checked In', 'In Progress')`);
    const pendingLabCount = patientScope
      ? scalar(`SELECT COUNT(*) AS value FROM lab_orders WHERE patient_id = ? AND status NOT IN ('Completed', 'Cancelled')`, patientId)
      : branchScope
        ? scalar(`SELECT COUNT(*) AS value FROM lab_orders WHERE branch_id = ? AND status NOT IN ('Completed', 'Cancelled')`, branchId)
        : scalar(`SELECT COUNT(*) AS value FROM lab_orders WHERE status NOT IN ('Completed', 'Cancelled')`);
    const lowStockCount = patientScope
      ? 0
      : branchScope
        ? scalar('SELECT COUNT(*) AS value FROM inventory WHERE branch_id = ? AND quantity <= reorder_level', branchId)
        : scalar('SELECT COUNT(*) AS value FROM inventory WHERE quantity <= reorder_level');
    const outstandingInvoiceCount = patientScope
      ? scalar(`SELECT COUNT(*) AS value FROM invoices WHERE patient_id = ? AND status IN ('Issued', 'Partially Paid')`, patientId)
      : branchScope
        ? scalar(`SELECT COUNT(*) AS value FROM invoices WHERE branch_id = ? AND status IN ('Issued', 'Partially Paid')`, branchId)
        : scalar(`SELECT COUNT(*) AS value FROM invoices WHERE status IN ('Issued', 'Partially Paid')`);
    const outstandingBalanceCents = patientScope
      ? scalar(`SELECT COALESCE(SUM(total_cents - paid_cents), 0) AS value FROM invoices WHERE patient_id = ? AND status IN ('Issued', 'Partially Paid')`, patientId)
      : branchScope
        ? scalar(`SELECT COALESCE(SUM(total_cents - paid_cents), 0) AS value FROM invoices WHERE branch_id = ? AND status IN ('Issued', 'Partially Paid')`, branchId)
        : scalar(`SELECT COALESCE(SUM(total_cents - paid_cents), 0) AS value FROM invoices WHERE status IN ('Issued', 'Partially Paid')`);

    const conditions = [];
    const params = [];
    if (patientScope) {
      conditions.push('a.patient_id = ?');
      params.push(patientId);
    } else if (session.role === 'Doctor') {
      conditions.push('a.doctor_user_id = ?');
      params.push(session.id);
    } else if (branchScope) {
      conditions.push('a.branch_id = ?');
      params.push(branchId);
    }
    const recentAppointments = db.prepare(`
      SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason,
        p.medical_record_number,
        p.first_name || ' ' || p.last_name AS patient_name,
        u.full_name AS doctor_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN users u ON u.id = a.doctor_user_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY a.starts_at DESC LIMIT 6
    `).all(...params);

    const today = new Date().toISOString().slice(0, 10);
    const todayAppointments = recentAppointments.filter((appointment) => appointment.starts_at.startsWith(today));
    sendData(res, {
      metrics: {
        patientCount,
        todayAppointmentCount: todayAppointments.length,
        openLabOrderCount: pendingLabCount,
        unpaidInvoiceCount: outstandingInvoiceCount,
      },
      todayAppointments: camelize(todayAppointments),
      summary: {
        patients: patientCount,
        activeAppointments: appointmentCount,
        pendingLabOrders: pendingLabCount,
        lowStockItems: lowStockCount,
        outstandingInvoices: outstandingInvoiceCount,
        outstandingBalanceCents,
      },
      recentAppointments: camelize(recentAppointments),
    });
  }

  function getAuditLogs(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Branch Manager']);
    const conditions = [];
    const params = [];
    addBranchFilter(url, session, conditions, params, 'a.branch_id');
    const action = (url.searchParams.get('action') || '').trim();
    if (action) {
      conditions.push('a.action = ?');
      params.push(action.slice(0, 80));
    }
    const rows = db.prepare(`
      SELECT a.*, u.full_name AS actor_name, u.role AS actor_role, b.name AS branch_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      LEFT JOIN branches b ON b.id = a.branch_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 250
    `).all(...params).map((row) => {
      let details = {};
      try { details = JSON.parse(row.details_json); } catch { details = {}; }
      const { details_json: ignored, ...rest } = row;
      return { ...camelize(rest), details };
    });
    sendData(res, { items: rows });
  }

  function getBranches(req, res, session) {
    requireRole(req, session, ALL_ROLES);
    const rows = isAdmin(session)
      ? db.prepare(`SELECT id, code, name, address, phone FROM branches WHERE active = 1 ORDER BY name`).all()
      : db.prepare(`SELECT id, code, name, address, phone FROM branches WHERE active = 1 AND id = ?`).all(session.branch_id);
    sendData(res, { items: camelize(rows) });
  }

  function getUsers(req, res, url, session) {
    requireRole(req, session, ALL_ROLES);
    const requestedRole = url.searchParams.get('role');
    if (requestedRole && !ALL_ROLES.includes(requestedRole)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown role filter.', { field: 'role' });
    }
    const conditions = ['u.active = 1'];
    const params = [];
    if (requestedRole) {
      conditions.push('u.role = ?');
      params.push(requestedRole);
    }
    if (!isAdmin(session)) {
      conditions.push('u.branch_id = ?');
      params.push(session.branch_id);
    }
    const rows = db.prepare(`
      SELECT u.id, u.full_name, u.role, u.branch_id, b.name AS branch_name
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.full_name
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  return async function handleApi(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false;

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const database = db.prepare('SELECT 1 AS ok').get().ok === 1 ? 'ok' : 'error';
      sendData(res, { status: 'ok', database, syntheticDataOnly: true });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      await login(req, res);
      return true;
    }

    const session = requireSession(req);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) requireCsrf(req, session);

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      sendData(res, {
        user: publicUser(session),
        csrfToken: session.csrf_token,
        expiresAt: session.expires_at,
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      log(req, session, 'LOGOUT', 'user', session.id);
      destroySession(db, session.token);
      sendData(res, { signedOut: true }, 200, {
        'Set-Cookie': clearSessionCookie({ secure: secureCookies }),
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/branches') {
      getBranches(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/users') {
      getUsers(req, res, url, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/patients') {
      getPatients(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/patients') {
      await createPatient(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/appointments') {
      getAppointments(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/appointments') {
      await createAppointment(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/clinical-notes') {
      getClinicalNotes(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/clinical-notes') {
      await createClinicalNote(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/lab-orders') {
      getLabOrders(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/lab-orders') {
      await createLabOrder(req, res, session);
      return true;
    }
    const labMatch = url.pathname.match(/^\/api\/lab-orders\/(\d+)$/);
    if (labMatch && req.method === 'GET') {
      getLabOrders(req, res, url, session, Number(labMatch[1]));
      return true;
    }
    if (labMatch && req.method === 'PATCH') {
      await updateLabOrder(req, res, session, Number(labMatch[1]));
      return true;
    }
    if (['/api/medications', '/api/medications/dispense'].includes(url.pathname) && req.method === 'GET') {
      getMedicationDispensing(req, res, url, session);
      return true;
    }
    if (url.pathname === '/api/medications/dispense' && req.method === 'POST') {
      await dispenseMedication(req, res, session);
      return true;
    }
    if (url.pathname === '/api/invoices' && req.method === 'GET') {
      getInvoices(req, res, url, session);
      return true;
    }
    if (url.pathname === '/api/invoices' && req.method === 'POST') {
      await createInvoice(req, res, session);
      return true;
    }
    const invoiceMatch = url.pathname.match(/^\/api\/invoices\/(\d+)$/);
    if (invoiceMatch && req.method === 'GET') {
      getInvoices(req, res, url, session, Number(invoiceMatch[1]));
      return true;
    }
    if (invoiceMatch && ['PATCH', 'POST'].includes(req.method)) {
      await updateInvoice(req, res, session, Number(invoiceMatch[1]));
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/audit-logs') {
      getAuditLogs(req, res, url, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      getDashboard(req, res, url, session);
      return true;
    }

    throw new ApiError(404, 'API_ROUTE_NOT_FOUND', 'The requested API route does not exist.');
  };
}

module.exports = { ALL_ROLES, createApi };
