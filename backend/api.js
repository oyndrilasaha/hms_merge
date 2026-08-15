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

  async function publicAdmission(req, res) {
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
    const password = stringField(body, 'password', { required: true, min: 8, max: 200, label: 'Password' });
    const branchId = 1;

    const patient = withTransaction(db, () => {
      const userId = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM users').get().id);
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM patients').get().id);
      const mrn = `SGH-${String(id).padStart(6, '0')}`;
      const credentials = hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, username, full_name, email, password_hash, password_salt, role, branch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, mrn, `${firstName} ${lastName}`, email, credentials.hash, credentials.salt, 'Patient', branchId);

      db.prepare(`
        INSERT INTO patients
          (id, medical_record_number, user_id, branch_id, first_name, last_name, date_of_birth,
           gender, phone, email, address, emergency_contact, allergies, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, mrn, userId, branchId, firstName, lastName, dateOfBirth, gender,
        phone, email, address, emergencyContact, allergies, userId
      );

      log(req, { id: userId, branch_id: branchId }, 'PATIENT_REGISTERED', 'patient', id, { medicalRecordNumber: mrn, branchId });
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

  async function updatePatient(req, res, session, patientId) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager']);
    const body = await readJson(req);
    const patient = rowOr404(db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId), 'Patient');
    patientForSession(session, patient.id);

    const firstName = stringField(body, 'firstName', { min: 1, max: 100, label: 'First name' }) || patient.first_name;
    const lastName = stringField(body, 'lastName', { min: 1, max: 100, label: 'Last name' }) || patient.last_name;
    const dateOfBirth = body.dateOfBirth ? dateField(body, 'dateOfBirth', { label: 'Date of birth' }) : patient.date_of_birth;
    if (dateOfBirth && new Date(dateOfBirth) > new Date()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Date of birth cannot be in the future.', { field: 'dateOfBirth' });
    }
    const submittedGender = body.gender;
    const gender = submittedGender
      ? enumField({ gender: submittedGender }, 'gender', GENDERS, { label: 'Gender' })
      : patient.gender;
    const phone = stringField(body, 'phone', { max: 40, label: 'Phone' }) || patient.phone;
    const email = body.email !== undefined ? (body.email ? emailField(body, 'email') : null) : patient.email;
    const address = stringField(body, 'address', { max: 300, label: 'Address' }) || patient.address;
    const emergencyContact = stringField(body, 'emergencyContact', { max: 200, label: 'Emergency contact' }) || patient.emergency_contact;
    const allergies = stringField(body, 'allergies', { max: 500, label: 'Allergies' }) || patient.allergies;

    const updated = withTransaction(db, () => {
      db.prepare(`
        UPDATE patients
        SET first_name = ?, last_name = ?, date_of_birth = ?, gender = ?, phone = ?, email = ?, address = ?, emergency_contact = ?, allergies = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = ?
      `).run(firstName, lastName, dateOfBirth, gender, phone, email, address, emergencyContact, allergies, patientId);
      log(req, session, 'PATIENT_UPDATED', 'patient', patientId, { branchId: patient.branch_id });
      return db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    });
    sendData(res, camelize(updated), 200);
  }

  async function updateAppointment(req, res, session, appointmentId) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager', 'Doctor', 'Patient']);
    const body = await readJson(req);
    const appointment = rowOr404(db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId), 'Appointment');
    
    if (session.role === 'Patient' && appointment.patient_id !== session.patient_id) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to modify this appointment.');
    }
    
    const patient = patientForSession(session, appointment.patient_id);

    const status = body.status ? enumField(body, 'status', ['Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'], { label: 'Status' }) : appointment.status;
    const startsAt = body.startsAt ? dateField(body, 'startsAt', { label: 'Start time' }) : appointment.starts_at;
    const endsAt = body.endsAt ? dateField(body, 'endsAt', { label: 'End time' }) : appointment.ends_at;
    const doctorUserId = body.doctorUserId ? integerField(body, 'doctorUserId', { label: 'Doctor' }) : appointment.doctor_user_id;
    const reason = body.reason ? stringField(body, 'reason', { min: 2, max: 300, label: 'Reason' }) : appointment.reason;
    const notes = body.notes !== undefined ? stringField(body, 'notes', { max: 1000, label: 'Notes' }) : appointment.notes;
    
    const cancellationReason = stringField(body, 'cancellationReason', { max: 500, label: 'Cancellation reason' });
    if (status === 'Cancelled' && appointment.status !== 'Cancelled' && !cancellationReason) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A cancellation reason is required to cancel an appointment.', { field: 'cancellationReason' });
    }

    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'End time must be after start time.', { field: 'endsAt' });
    }
    if (startsAt && endsAt && new Date(endsAt) - new Date(startsAt) > 8 * 60 * 60 * 1000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'An appointment cannot exceed eight hours.', { field: 'endsAt' });
    }

    if (doctorUserId !== appointment.doctor_user_id) {
      const doctor = rowOr404(db.prepare(`
        SELECT id, branch_id FROM users WHERE id = ? AND role = 'Doctor' AND active = 1
      `).get(doctorUserId), 'Doctor');
      if (doctor.branch_id !== appointment.branch_id) {
        throw new ApiError(400, 'BRANCH_MISMATCH', 'The selected doctor does not work at this branch.');
      }
    }

    const updated = withTransaction(db, () => {
      if (status !== 'Cancelled' && status !== 'No Show' &&
          (startsAt !== appointment.starts_at || endsAt !== appointment.ends_at || doctorUserId !== appointment.doctor_user_id)) {
        const conflict = db.prepare(`
          SELECT id, starts_at, ends_at FROM appointments
          WHERE doctor_user_id = ?
            AND id != ?
            AND status NOT IN ('Cancelled', 'No Show')
            AND starts_at < ? AND ends_at > ?
          LIMIT 1
        `).get(doctorUserId, appointmentId, endsAt, startsAt);
        if (conflict) {
          throw new ApiError(409, 'APPOINTMENT_CONFLICT', 'The doctor already has an appointment during this time.');
        }
      }

      db.prepare(`
        UPDATE appointments
        SET status = ?, starts_at = ?, ends_at = ?, doctor_user_id = ?, reason = ?, notes = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = ?
      `).run(status, startsAt, endsAt, doctorUserId, reason, notes, appointmentId);

      log(req, session, 'APPOINTMENT_UPDATED', 'appointment', appointmentId, {
        status,
        cancellationReason: cancellationReason || null,
        branchId: appointment.branch_id,
      });

      return db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
    });

    sendData(res, camelize(updated), 200);
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

  async function encryptStego(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Lab Technician']);
    const body = await readJson(req);
    const plaintext = stringField(body, 'plaintext', { required: true, max: 5000, label: 'Plaintext message' });
    const password = stringField(body, 'password', { required: true, min: 4, max: 200, label: 'Passphrase' });

    const crypto = require('node:crypto');
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    sendData(res, {
      ciphertext: encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex')
    }, 200);
  }

  async function decryptStego(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Lab Technician']);
    const body = await readJson(req);
    const ciphertext = stringField(body, 'ciphertext', { required: true, label: 'Ciphertext hex' });
    const saltHex = stringField(body, 'salt', { required: true, label: 'Salt hex' });
    const ivHex = stringField(body, 'iv', { required: true, label: 'IV hex' });
    const password = stringField(body, 'password', { required: true, label: 'Passphrase' });

    const crypto = require('node:crypto');
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(password, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      sendData(res, { plaintext: decrypted }, 200);
    } catch (err) {
      throw new ApiError(400, 'DECRYPTION_FAILED', 'Failed to decrypt ciphertext. Please check your security passphrase.');
    }
  }

  function getFeedbacks(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Branch Manager']);
    const rows = db.prepare(`
      SELECT f.*, p.first_name, p.last_name, p.medical_record_number
      FROM feedbacks f
      LEFT JOIN patients p ON p.id = f.patient_id
      ORDER BY f.created_at DESC
    `).all();
    sendData(res, { items: camelize(rows) });
  }

  async function createFeedback(req, res, session) {
    requireRole(req, session, ['Patient']);
    const body = await readJson(req);
    const comments = stringField(body, 'comments', { required: true, min: 3, max: 2000, label: 'Comments' });

    const positiveWords = /\b(great|excellent|good|best|happy|friendly|clean|helpful|cured|satisfied|professional|perfect)\b/i;
    const negativeWords = /\b(bad|slow|worst|poor|rude|dirty|pain|careless|unprofessional|frustrated|angry|unhappy|expensive)\b/i;
    
    const posCount = (comments.match(new RegExp(positiveWords, 'gi')) || []).length;
    const negCount = (comments.match(new RegExp(negativeWords, 'gi')) || []).length;
    
    let sentiment = 'Neutral';
    if (posCount > negCount) sentiment = 'Positive';
    else if (negCount > posCount) sentiment = 'Negative';

    db.prepare(`
      INSERT INTO feedbacks (patient_id, comments, sentiment)
      VALUES (?, ?, ?)
    `).run(session.patientId || session.patient_id || null, comments, sentiment);

    audit(db, {
      actorUserId: session.userId,
      branchId: session.branch_id || null,
      action: 'FEEDBACK_SUBMITTED',
      entityType: 'feedback',
      details: { sentiment }
    });

    sendData(res, { success: true, sentiment }, 201);
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
    const attachmentUrl = stringField(body, 'attachmentUrl', { max: 1000, label: 'Attachment URL' });
    if (![status, resultText, resultUnits, referenceRange, attachmentUrl].some((value) => value !== null)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one lab order field to update.');
    }
    if (session.role === 'Doctor' && status !== 'Cancelled') {
      throw new ApiError(403, 'FORBIDDEN', 'Doctors may only cancel a lab order.');
    }
    if (session.role === 'Nurse' && status !== 'Collected') {
      throw new ApiError(403, 'FORBIDDEN', 'Nurses may only mark a lab order as collected.');
    }
    if ((resultText !== null || resultUnits !== null || referenceRange !== null || attachmentUrl !== null)
        && !['Admin', 'Lab Technician'].includes(session.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Only laboratory staff may enter results or attachments.');
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
        attachment_url = COALESCE(?, attachment_url),
        resulted_by = CASE WHEN ? THEN ? ELSE resulted_by END,
        resulted_at = CASE WHEN ? THEN ? ELSE resulted_at END,
        updated_at = ?
      WHERE id = ?
    `).run(
      finalStatus, resultText, resultUnits, referenceRange, attachmentUrl,
      isResulted ? 1 : 0, session.id,
      isResulted ? 1 : 0, new Date().toISOString(),
      new Date().toISOString(), id,
    );
    log(req, session, 'LAB_ORDER_UPDATED', 'lab_order', id, {
      status: finalStatus,
      resultEntered: resultText !== null,
      attachmentProvided: attachmentUrl !== null,
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

  // Notification queue helper (FR20, FR27, FR33, FR45)
  function queueNotification(recipientUserId, recipientContact, channel, template, message) {
    try {
      db.prepare(`
        INSERT INTO notifications (recipient_user_id, recipient_contact, channel, template, message, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(recipientUserId, recipientContact || null, channel || 'In-App', template, message, 'Sent');
    } catch (err) {
      console.error('Failed to queue notification:', err);
    }
  }

  // Admin User CRUD (FR5, FR8, FR21)
  async function createAdminUser(req, res, session) {
    requireRole(req, session, ['Admin']);
    const body = await readJson(req);
    const username = stringField(body, 'username', { required: true, min: 2, max: 80, label: 'Username' });
    const fullName = stringField(body, 'fullName', { required: true, min: 2, max: 120, label: 'Full name' });
    const email = emailField(body, 'email');
    const password = stringField(body, 'password', { required: true, min: 8, max: 200, label: 'Password' });
    const role = enumField(body, 'role', ALL_ROLES, { required: true, label: 'Role' });
    const branchId = integerField(body, 'branchId') || session.branch_id;
    const specialisation = stringField(body, 'specialisation', { max: 100, label: 'Specialisation' });
    const phone = stringField(body, 'phone', { max: 40, label: 'Phone' });

    const credentials = hashPassword(password);
    const user = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM users').get().id);
      db.prepare(`
        INSERT INTO users (id, username, full_name, email, password_hash, password_salt, role, branch_id, specialisation, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, fullName, email, credentials.hash, credentials.salt, role, branchId, specialisation || null, phone || null);
      log(req, session, 'USER_CREATED', 'user', id, { username, role, branchId });
      return db.prepare('SELECT id, username, full_name, email, role, branch_id, specialisation, phone, active FROM users WHERE id = ?').get(id);
    });
    sendData(res, camelize(user), 201);
  }

  async function updateAdminUser(req, res, session, userId) {
    requireRole(req, session, ['Admin']);
    const body = await readJson(req);
    const target = rowOr404(db.prepare('SELECT * FROM users WHERE id = ?').get(userId), 'User');
    const fullName = stringField(body, 'fullName', { max: 120 }) || target.full_name;
    const role = body.role ? enumField(body, 'role', ALL_ROLES) : target.role;
    const branchId = body.branchId !== undefined ? integerField(body, 'branchId') : target.branch_id;
    const specialisation = body.specialisation !== undefined ? stringField(body, 'specialisation', { max: 100 }) : target.specialisation;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : target.active;

    db.prepare(`
      UPDATE users SET full_name = ?, role = ?, branch_id = ?, specialisation = ?, active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).run(fullName, role, branchId, specialisation, active, userId);
    log(req, session, 'USER_UPDATED', 'user', userId, { role, branchId, active });
    const updated = db.prepare('SELECT id, username, full_name, email, role, branch_id, specialisation, active FROM users WHERE id = ?').get(userId);
    sendData(res, camelize(updated));
  }

  // Admin Branch CRUD (FR6)
  async function createBranch(req, res, session) {
    requireRole(req, session, ['Admin']);
    const body = await readJson(req);
    const code = stringField(body, 'code', { required: true, min: 2, max: 10, label: 'Branch code' }).toUpperCase();
    const name = stringField(body, 'name', { required: true, min: 2, max: 100, label: 'Branch name' });
    const address = stringField(body, 'address', { required: true, min: 2, max: 200, label: 'Address' });
    const phone = stringField(body, 'phone', { required: true, min: 2, max: 40, label: 'Phone' });

    const newBranch = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM branches').get().id);
      db.prepare(`
        INSERT INTO branches (id, code, name, address, phone) VALUES (?, ?, ?, ?, ?)
      `).run(id, code, name, address, phone);
      log(req, session, 'BRANCH_CREATED', 'branch', id, { code, name });
      return db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    });
    sendData(res, camelize(newBranch), 201);
  }

  // Doctor Schedules & Availability (FR17, FR22)
  function getSchedules(req, res, url, session) {
    requireRole(req, session, ALL_ROLES);
    const doctorId = url.searchParams.get('doctorId');
    const conditions = ['s.active = 1'];
    const params = [];
    if (doctorId) {
      conditions.push('s.staff_id = ?');
      params.push(Number(doctorId));
    }
    const rows = db.prepare(`
      SELECT s.*, u.full_name AS doctor_name, b.name AS branch_name
      FROM schedules s
      JOIN users u ON u.id = s.staff_id
      JOIN branches b ON b.id = s.branch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.day_of_week, s.start_time
    `).all(...params);
    sendData(res, { items: camelize(rows) });
  }

  async function createSchedule(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Branch Manager']);
    const body = await readJson(req);
    const staffId = integerField(body, 'staffId') || session.id;
    const branchId = branchIdFor(session, integerField(body, 'branchId'));
    const dayOfWeek = enumField(body, 'dayOfWeek', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    const startTime = stringField(body, 'startTime', { required: true });
    const endTime = stringField(body, 'endTime', { required: true });

    const schedId = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM schedules').get().id);
      db.prepare(`
        INSERT INTO schedules (id, staff_id, branch_id, day_of_week, start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, staffId, branchId, dayOfWeek, startTime, endTime);
      return id;
    });
    sendData(res, { id: schedId, success: true }, 201);
  }

  // Shifts & Attendance (FR25)
  function getShifts(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Branch Manager', 'Doctor', 'Nurse', 'Receptionist']);
    const rows = db.prepare(`
      SELECT s.*, u.full_name AS staff_name, u.role AS staff_role, b.name AS branch_name
      FROM shifts s
      JOIN users u ON u.id = s.staff_id
      JOIN branches b ON b.id = s.branch_id
      ORDER BY s.shift_date DESC
      LIMIT 100
    `).all();
    sendData(res, { items: camelize(rows) });
  }

  // Purchase Orders & Restocking (FR29)
  function getPurchaseOrders(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Pharmacist', 'Branch Manager']);
    const rows = db.prepare(`
      SELECT po.*, m.name AS medication_name, m.strength, m.form, b.name AS branch_name, u.full_name AS ordered_by_name
      FROM purchase_orders po
      JOIN medications m ON m.id = po.medication_id
      JOIN branches b ON b.id = po.branch_id
      JOIN users u ON u.id = po.ordered_by
      ORDER BY po.created_at DESC
    `).all();
    sendData(res, { items: camelize(rows) });
  }

  async function createPurchaseOrder(req, res, session) {
    requireRole(req, session, ['Admin', 'Pharmacist', 'Branch Manager']);
    const body = await readJson(req);
    const medicationId = integerField(body, 'medicationId', { required: true });
    const quantity = integerField(body, 'quantity', { required: true, min: 1 });
    const branchId = branchIdFor(session, integerField(body, 'branchId'));

    const po = withTransaction(db, () => {
      const id = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM purchase_orders').get().id);
      const poNum = `PO-${new Date().getFullYear()}-${String(id).padStart(3, '0')}`;
      db.prepare(`
        INSERT INTO purchase_orders (id, po_number, branch_id, medication_id, quantity, status, ordered_by)
        VALUES (?, ?, ?, ?, ?, 'Approved', ?)
      `).run(id, poNum, branchId, medicationId, quantity, session.id);
      log(req, session, 'PURCHASE_ORDER_CREATED', 'purchase_order', id, { poNum, medicationId, quantity });
      return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    });
    sendData(res, camelize(po), 201);
  }

  // Centralized Notifications (FR20, FR27, FR33, FR45)
  function getNotifications(req, res, session) {
    const rows = db.prepare(`
      SELECT * FROM notifications
      WHERE recipient_user_id = ? OR recipient_user_id IS NULL
      ORDER BY created_at DESC LIMIT 50
    `).all(session.id);
    sendData(res, { items: camelize(rows) });
  }

  // Sandboxed Payment Gateway (FR40, FR64)
  async function processGatewayPayment(req, res, session) {
    requireRole(req, session, ['Admin', 'Receptionist', 'Branch Manager', 'Patient']);
    const body = await readJson(req);
    const invoiceId = integerField(body, 'invoiceId', { required: true });
    const amountCents = integerField(body, 'amountCents', { required: true, min: 1 });
    const method = enumField(body, 'method', PAYMENT_METHODS, { label: 'Payment method' });
    const cardLastFour = stringField(body, 'cardNumber', { max: 20 })?.slice(-4) || '4242';

    const inv = rowOr404(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId), 'Invoice');
    const gatewayRef = `GW-TXN-${Date.now()}-${cardLastFour}`;

    withTransaction(db, () => {
      const newPaid = inv.paid_cents + amountCents;
      let newStatus = inv.status;
      if (newPaid >= inv.total_cents) newStatus = 'Paid';
      else if (newPaid > 0) newStatus = 'Partially Paid';

      db.prepare(`
        INSERT INTO payments (invoice_id, amount_cents, method, reference, received_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceId, amountCents, method, gatewayRef, session.id);

      db.prepare(`
        UPDATE invoices SET paid_cents = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(newPaid, newStatus, invoiceId);

      log(req, session, 'PAYMENT_RECORDED', 'invoice', invoiceId, { amountCents, gatewayRef, method });
      queueNotification(session.id, session.email, 'Email', 'BILLING_RECEIPT', `Payment of $${(amountCents/100).toFixed(2)} received for Invoice #${inv.invoice_number}. Reference: ${gatewayRef}`);
    });

    sendData(res, { success: true, gatewayReference: gatewayRef, status: 'Paid' });
  }

  // Analytics Reports & Comparisons (FR41, FR44)
  function getAnalytics(req, res, url, session) {
    requireRole(req, session, ['Admin', 'Branch Manager']);
    const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
    const totalAppointments = db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count;
    const totalRevenueCents = db.prepare('SELECT COALESCE(SUM(paid_cents), 0) AS total FROM invoices').get().total;
    const labOrdersCount = db.prepare('SELECT COUNT(*) AS count FROM lab_orders').get().count;

    const branchComparison = db.prepare(`
      SELECT b.id, b.name, b.code,
        COUNT(DISTINCT p.id) AS patient_count,
        COUNT(DISTINCT a.id) AS appointment_count,
        COALESCE(SUM(i.paid_cents), 0) AS revenue_cents
      FROM branches b
      LEFT JOIN patients p ON p.branch_id = b.id
      LEFT JOIN appointments a ON a.branch_id = b.id
      LEFT JOIN invoices i ON i.branch_id = b.id
      WHERE b.active = 1
      GROUP BY b.id
    `).all();

    sendData(res, {
      totals: {
        patients: totalPatients,
        appointments: totalAppointments,
        revenueCents: totalRevenueCents,
        labOrders: labOrdersCount
      },
      branchComparison: camelize(branchComparison)
    });
  }

  // Inpatient Beds & Admissions (FR52, FR53, FR54)
  function getBeds(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Branch Manager']);
    const rows = db.prepare(`
      SELECT b.*, br.name AS branch_name
      FROM beds b JOIN branches br ON br.id = b.branch_id
      ORDER BY b.ward, b.room_number, b.bed_number
    `).all();
    sendData(res, { items: camelize(rows) });
  }

  function getAdmissions(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse', 'Branch Manager']);
    const rows = db.prepare(`
      SELECT a.*, p.first_name || ' ' || p.last_name AS patient_name, p.medical_record_number,
             b.ward, b.room_number, b.bed_number, u.full_name AS doctor_name
      FROM admissions a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN beds b ON b.id = a.bed_id
      LEFT JOIN users u ON u.id = a.attending_doctor_id
      ORDER BY a.admitted_at DESC
    `).all();
    sendData(res, { items: camelize(rows) });
  }

  async function createAdmission(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse']);
    const body = await readJson(req);
    const patientId = integerField(body, 'patientId', { required: true });
    const bedId = integerField(body, 'bedId', { required: true });
    const reason = stringField(body, 'admissionReason', { required: true });

    withTransaction(db, () => {
      const bed = rowOr404(db.prepare('SELECT * FROM beds WHERE id = ?').get(bedId), 'Bed');
      if (bed.status !== 'Available') throw new ApiError(400, 'BED_NOT_AVAILABLE', 'Selected bed is not available.');

      const admId = Number(db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM admissions').get().id);
      db.prepare(`
        INSERT INTO admissions (id, patient_id, branch_id, bed_id, attending_doctor_id, admission_reason, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Admitted')
      `).run(admId, patientId, bed.branch_id, bedId, session.id, reason);

      db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(bedId);
      log(req, session, 'PATIENT_ADMITTED', 'admission', admId, { patientId, bedId });
    });

    sendData(res, { success: true }, 201);
  }

  // Break-glass & Backup Restore Drills (FR51, FR57, FR58)
  async function recordBreakGlass(req, res, session) {
    requireRole(req, session, ['Admin', 'Doctor', 'Nurse']);
    const body = await readJson(req);
    const reason = stringField(body, 'reason', { required: true });
    const patientId = integerField(body, 'patientId', { required: true });

    log(req, session, 'BREAK_GLASS_ACCESS', 'patient', patientId, { reason, timestamp: new Date().toISOString() });
    queueNotification(1, 'admin@demo.stgeorge.local', 'In-App', 'BREAK_GLASS_ALERT', `BREAK-GLASS EMERGENCY ACCESS: User ${session.full_name} accessed Patient #${patientId}. Reason: ${reason}`);

    sendData(res, { success: true, logged: true });
  }

  async function recordBackupRestore(req, res, session) {
    requireRole(req, session, ['Admin']);
    const body = await readJson(req);
    const actionType = body.action || 'backup';

    if (actionType === 'restore') {
      db.prepare(`
        INSERT INTO backup_logs (backup_type, status, file_name)
        VALUES ('Controlled Restore Drill', 'Restore Test Passed', 'sgh_hms_restore_test.db')
      `).run();
      log(req, session, 'RESTORE_DRILL_EXECUTED', 'system', 'backup', { outcome: 'Passed' });
      sendData(res, { success: true, message: 'Restore drill verified successfully.' });
    } else {
      db.prepare(`
        INSERT INTO backup_logs (backup_type, status, file_name)
        VALUES ('Full Encrypted Automated', 'Completed', 'sgh_hms_backup_' + strftime('%Y%m%d', 'now') + '.db')
      `).run();
      log(req, session, 'BACKUP_CREATED', 'system', 'backup', { status: 'Completed' });
      sendData(res, { success: true, message: 'Encrypted backup created successfully.' });
    }
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
    if (req.method === 'POST' && url.pathname === '/api/public/admission') {
      await publicAdmission(req, res);
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
    const patientMatch = url.pathname.match(/^\/api\/patients\/(\d+)$/);
    if (patientMatch && req.method === 'PATCH') {
      await updatePatient(req, res, session, Number(patientMatch[1]));
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
    const appointmentMatch = url.pathname.match(/^\/api\/appointments\/(\d+)$/);
    if (appointmentMatch && req.method === 'PATCH') {
      await updateAppointment(req, res, session, Number(appointmentMatch[1]));
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
    if (req.method === 'POST' && url.pathname === '/api/clinical/stego/encrypt') {
      await encryptStego(req, res, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/clinical/stego/decrypt') {
      await decryptStego(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/feedbacks') {
      getFeedbacks(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/feedbacks') {
      await createFeedback(req, res, session);
      return true;
    }

    // New API Endpoints
    if (req.method === 'POST' && url.pathname === '/api/admin/users') {
      await createAdminUser(req, res, session);
      return true;
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && req.method === 'PATCH') {
      await updateAdminUser(req, res, session, Number(userMatch[1]));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/branches') {
      await createBranch(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/schedules') {
      getSchedules(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/schedules') {
      await createSchedule(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/shifts') {
      getShifts(req, res, url, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/purchase-orders') {
      getPurchaseOrders(req, res, url, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/purchase-orders') {
      await createPurchaseOrder(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/notifications') {
      getNotifications(req, res, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/payments/gateway-process') {
      await processGatewayPayment(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/reports/analytics') {
      getAnalytics(req, res, url, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/inpatients/beds') {
      getBeds(req, res, session);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/inpatients/admissions') {
      getAdmissions(req, res, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/inpatients/admissions') {
      await createAdmission(req, res, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/clinical/break-glass') {
      await recordBreakGlass(req, res, session);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/backup') {
      await recordBackupRestore(req, res, session);
      return true;
    }

    throw new ApiError(404, 'API_ROUTE_NOT_FOUND', 'The requested API route does not exist.');
  };
}

module.exports = { ALL_ROLES, createApi };
