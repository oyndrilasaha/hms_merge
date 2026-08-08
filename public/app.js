/*
 * St George Hospital Management System client.
 * All API paths are centralised here so the server/API router can be changed without
 * touching view code. API responses may be { data: ... } or a direct value.
 */
'use strict';

const API_ENDPOINTS = Object.freeze({
  login: '/api/auth/login',
  me: '/api/auth/me',
  logout: '/api/auth/logout',
  dashboard: '/api/dashboard',
  branches: '/api/branches',
  users: '/api/users',
  patients: '/api/patients',
  appointments: '/api/appointments',
  clinicalNotes: '/api/clinical-notes',
  labOrders: '/api/lab-orders',
  labOrder: (id) => `/api/lab-orders/${encodeURIComponent(id)}`,
  medications: '/api/medications',
  dispenseMedication: '/api/medications/dispense',
  invoices: '/api/invoices',
  invoice: (id) => `/api/invoices/${encodeURIComponent(id)}`,
  auditLogs: '/api/audit-logs'
});

const PAGE_META = Object.freeze({
  dashboard: {
    eyebrow: 'Overview',
    title: 'Dashboard',
    description: 'A live view of care activity across your authorised branches.'
  },
  patients: {
    eyebrow: 'Patient administration',
    title: 'Patients',
    description: 'Find and manage synthetic patient records securely.'
  },
  appointments: {
    eyebrow: 'Scheduling',
    title: 'Appointments',
    description: 'Coordinate clinicians, patients and branch availability.'
  },
  clinical: {
    eyebrow: 'Clinical workflow',
    title: 'Clinical & labs',
    description: 'Record care notes and track diagnostic requests through completion.'
  },
  pharmacy: {
    eyebrow: 'Medication management',
    title: 'Pharmacy',
    description: 'Review stock and record medication dispensing with an audit trail.'
  },
  billing: {
    eyebrow: 'Accounts',
    title: 'Billing',
    description: 'Create patient invoices and monitor payment status.'
  },
  audit: {
    eyebrow: 'Governance',
    title: 'Audit trail',
    description: 'Review security-relevant activity across the hospital system.'
  }
});

const ROLE_PAGES = Object.freeze({
  admin: ['dashboard', 'patients', 'appointments', 'clinical', 'pharmacy', 'billing', 'audit'],
  branch_manager: ['dashboard', 'patients', 'appointments', 'billing', 'audit'],
  receptionist: ['dashboard', 'patients', 'appointments', 'billing'],
  doctor: ['dashboard', 'patients', 'appointments', 'clinical'],
  nurse: ['dashboard', 'patients', 'appointments', 'clinical', 'pharmacy'],
  lab_technician: ['dashboard', 'patients', 'clinical'],
  pharmacist: ['dashboard', 'patients', 'pharmacy'],
  patient: ['dashboard', 'appointments', 'billing']
});

const FORM_PERMISSIONS = Object.freeze({
  patient: ['admin', 'branch_manager', 'receptionist'],
  editPatient: ['admin', 'branch_manager', 'receptionist'],
  appointment: ['admin', 'receptionist', 'doctor', 'patient'],
  editAppointment: ['admin', 'receptionist', 'doctor', 'patient'],
  clinicalNote: ['doctor', 'nurse'],
  nurseObservation: ['admin', 'nurse'],
  labOrder: ['doctor', 'nurse'],
  labResult: ['admin', 'lab_technician'],
  dispense: ['admin', 'pharmacist'],
  invoice: ['admin', 'receptionist'],
  markPaid: ['admin', 'receptionist']
});

const state = {
  user: null,
  csrfToken: '',
  role: '',
  activePage: 'dashboard',
  branchId: '',
  branches: [],
  doctors: [],
  patients: [],
  appointments: [],
  clinicalNotes: [],
  labOrders: [],
  medications: [],
  invoices: [],
  auditLogs: [],
  dashboard: {},
  installPrompt: null,
  currentForm: null,
  requestSequence: 0
};

const elements = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindGlobalEvents();
  updateNetworkStatus();
  registerServiceWorker();
  initChatbot();
  await restoreSession();
}

function cacheElements() {
  const ids = [
    'login-view', 'login-form', 'login-username', 'login-password', 'login-status',
    'toggle-password', 'app-shell', 'menu-toggle', 'sidebar', 'sidebar-scrim',
    'primary-nav', 'network-status', 'install-button', 'branch-select', 'profile-button',
    'profile-menu', 'logout-button', 'user-avatar', 'user-name', 'user-role',
    'main-content', 'page-eyebrow', 'page-title', 'page-description', 'page-actions',
    'page-loading', 'page-content', 'record-dialog', 'record-form', 'dialog-eyebrow',
    'dialog-title', 'dialog-description', 'dialog-fields', 'dialog-status', 'dialog-submit',
    'dialog-close', 'dialog-cancel', 'toast-region',
    'chat-widget', 'chat-toggle', 'chat-drawer', 'chat-close',
    'chat-messages', 'chat-form', 'chat-input'
  ];
  for (const id of ids) elements[toCamel(id)] = document.getElementById(id);
}

function bindGlobalEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.togglePassword.addEventListener('click', togglePasswordVisibility);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.profileButton.addEventListener('click', toggleProfileMenu);
  elements.menuToggle.addEventListener('click', toggleSidebar);
  elements.sidebarScrim.addEventListener('click', closeSidebar);
  elements.primaryNav.addEventListener('click', handleNavigation);
  elements.pageActions.addEventListener('click', handleActionClick);
  elements.pageContent.addEventListener('click', handleActionClick);
  elements.pageContent.addEventListener('input', handleTableFilter);
  elements.pageContent.addEventListener('change', handleTableFilter);
  elements.branchSelect.addEventListener('change', handleBranchChange);
  elements.dialogClose.addEventListener('click', closeRecordDialog);
  elements.dialogCancel.addEventListener('click', closeRecordDialog);
  elements.recordForm.addEventListener('submit', submitRecordForm);
  elements.recordDialog.addEventListener('click', (event) => {
    if (event.target === elements.recordDialog) closeRecordDialog();
  });
  elements.installButton.addEventListener('click', installApplication);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    elements.installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    elements.installButton.hidden = true;
    showToast('The hospital app is installed and ready.', 'success');
  });
  document.addEventListener('click', (event) => {
    if (!elements.profileButton.contains(event.target) && !elements.profileMenu.contains(event.target)) {
      closeProfileMenu();
    }
  });
}

async function restoreSession() {
  setLoginStatus('Checking your secure session…', false);
  try {
    const response = await apiRequest(API_ENDPOINTS.me, { allowUnauthenticated: true });
    applyAuthResponse(response);
    if (!state.user) throw new Error('Session response did not include a user.');
    await enterApplication();
  } catch (error) {
    showLogin(error.status && error.status !== 401 ? 'The server is unavailable. You can try signing in again.' : '');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateForm(form)) return;

  const submitButton = form.querySelector('[type="submit"]');
  setButtonBusy(submitButton, true, 'Signing in…');
  setLoginStatus('', false);

  try {
    const response = await apiRequest(API_ENDPOINTS.login, {
      method: 'POST',
      body: {
        username: elements.loginUsername.value.trim(),
        password: elements.loginPassword.value
      },
      allowUnauthenticated: true
    });
    applyAuthResponse(response);
    if (!state.user) throw new Error('Login succeeded but no user profile was returned.');
    elements.loginPassword.value = '';
    await enterApplication();
  } catch (error) {
    setLoginStatus(error.status === 401 ? 'The username or password is incorrect.' : error.message, true);
    elements.loginPassword.focus();
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function applyAuthResponse(response) {
  const payload = unwrapData(response) || {};
  state.user = payload.user || (payload.id || payload.username ? payload : null);
  state.csrfToken = payload.csrfToken || payload.csrf_token || response?.csrfToken || response?.csrf_token || state.csrfToken;
  state.role = normaliseRole(
    state.user?.role?.name || state.user?.role || state.user?.roles?.[0]?.name || state.user?.roles?.[0] || 'patient'
  );
  const assignedBranchId = state.user?.branch?.id || state.user?.branchId || state.user?.branch_id;
  state.branchId = state.role !== 'admin' && assignedBranchId ? String(assignedBranchId) : '';
}

async function enterApplication() {
  elements.loginView.hidden = true;
  elements.appShell.hidden = false;
  updateUserInterface();
  await loadReferenceData();
  const hashPage = window.location.hash.replace('#', '');
  const initialPage = getAllowedPages().includes(hashPage) ? hashPage : 'dashboard';
  navigateTo(initialPage, { updateHash: true, focus: false });
}

function showLogin(message = '') {
  state.user = null;
  state.csrfToken = '';
  state.role = '';
  elements.appShell.hidden = true;
  elements.loginView.hidden = false;
  setLoginStatus(message, Boolean(message));
  requestAnimationFrame(() => elements.loginUsername.focus());
}

async function handleLogout() {
  closeProfileMenu();
  try {
    await apiRequest(API_ENDPOINTS.logout, { method: 'POST' });
  } catch (error) {
    if (error.status !== 401) showToast('The server could not confirm sign out, so this device session was cleared.', 'error');
  } finally {
    clearOperationalState();
    history.replaceState(null, '', window.location.pathname);
    showLogin('You have signed out.');
  }
}

function clearOperationalState() {
  for (const key of ['branches', 'doctors', 'patients', 'appointments', 'clinicalNotes', 'labOrders', 'medications', 'invoices', 'auditLogs']) {
    state[key] = [];
  }
  state.dashboard = {};
  state.branchId = '';
}

function updateUserInterface() {
  const displayName = personName(state.user) || state.user?.username || 'Authorised user';
  elements.userName.textContent = displayName;
  elements.userRole.textContent = roleLabel(state.role);
  elements.userAvatar.textContent = initials(displayName);

  const allowedPages = getAllowedPages();
  for (const item of elements.primaryNav.querySelectorAll('[data-page]')) {
    item.hidden = !allowedPages.includes(item.dataset.page);
  }
  const adminLabel = elements.primaryNav.querySelector('.nav-label--admin');
  if (adminLabel) adminLabel.hidden = !allowedPages.includes('audit');
}

async function loadReferenceData() {
  const [branchesResult, doctorsResult] = await Promise.allSettled([
    apiRequest(API_ENDPOINTS.branches),
    apiRequest(`${API_ENDPOINTS.users}?role=Doctor`)
  ]);

  if (branchesResult.status === 'fulfilled') {
    state.branches = collectionFrom(branchesResult.value, ['branches']);
    renderBranchOptions();
  } else {
    elements.branchSelect.closest('label').hidden = true;
  }

  if (doctorsResult.status === 'fulfilled') {
    state.doctors = collectionFrom(doctorsResult.value, ['users', 'doctors']);
  }
}

function renderBranchOptions() {
  const options = ['<option value="">All branches</option>'];
  for (const branch of state.branches) {
    const id = pick(branch, 'id', 'branchId', 'branch_id');
    const name = pick(branch, 'name', 'branchName', 'branch_name') || `Branch ${id}`;
    options.push(`<option value="${escapeAttribute(id)}">${escapeHtml(name)}</option>`);
  }
  elements.branchSelect.innerHTML = options.join('');
  elements.branchSelect.value = state.branchId;
  elements.branchSelect.closest('label').hidden = state.branches.length === 0;
}

function getAllowedPages() {
  return ROLE_PAGES[state.role] || ROLE_PAGES.patient;
}

function canUseForm(formName) {
  return (FORM_PERMISSIONS[formName] || []).includes(state.role);
}

function handleNavigation(event) {
  const button = event.target.closest('[data-page]');
  if (!button || button.hidden) return;
  navigateTo(button.dataset.page, { updateHash: true, focus: true });
}

function handleHashChange() {
  if (!state.user) return;
  const page = window.location.hash.replace('#', '') || 'dashboard';
  if (getAllowedPages().includes(page)) navigateTo(page, { updateHash: false, focus: true });
}

async function navigateTo(page, { updateHash = true, focus = true } = {}) {
  if (!getAllowedPages().includes(page)) page = 'dashboard';
  state.activePage = page;
  closeSidebar();
  closeProfileMenu();

  if (updateHash && window.location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
  const meta = PAGE_META[page];
  elements.pageEyebrow.textContent = meta.eyebrow;
  elements.pageTitle.textContent = meta.title;
  elements.pageDescription.textContent = meta.description;
  for (const item of elements.primaryNav.querySelectorAll('[data-page]')) {
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  renderPageActions(page);
  if (focus) elements.mainContent.focus({ preventScroll: true });
  await loadPage(page);
}

function renderPageActions(page) {
  const actions = [];
  if (page === 'patients' && canUseForm('patient')) actions.push(actionButton('patient', 'Add patient'));
  if (page === 'appointments' && canUseForm('appointment')) actions.push(actionButton('appointment', 'Book appointment'));
  if (page === 'clinical') {
    if (canUseForm('clinicalNote')) actions.push(actionButton('clinicalNote', 'Add clinical note', false));
    if (canUseForm('nurseObservation')) actions.push(actionButton('nurseObservation', 'Record vitals / observation', false));
    if (canUseForm('labOrder')) actions.push(actionButton('labOrder', 'Create lab order'));
  }
  if (page === 'pharmacy' && canUseForm('dispense')) actions.push(actionButton('dispense', 'Dispense medication'));
  if (page === 'billing' && canUseForm('invoice')) actions.push(actionButton('invoice', 'Create invoice'));
  elements.pageActions.innerHTML = actions.join('');
}

function actionButton(formName, label, primary = true) {
  return `<button class="button ${primary ? 'button--primary' : 'button--secondary'}" type="button" data-open-form="${formName}" data-testid="open-${kebab(formName)}-form"><svg aria-hidden="true"><use href="#icon-plus"></use></svg>${escapeHtml(label)}</button>`;
}

async function loadPage(page) {
  const requestId = ++state.requestSequence;
  setPageLoading(true);
  try {
    const branchQuery = state.branchId ? `?branchId=${encodeURIComponent(state.branchId)}` : '';
    if (page === 'dashboard') {
      const response = await apiRequest(`${API_ENDPOINTS.dashboard}${branchQuery}`);
      state.dashboard = unwrapData(response) || {};
    } else if (page === 'patients') {
      state.patients = collectionFrom(await apiRequest(`${API_ENDPOINTS.patients}${branchQuery}`), ['patients']);
    } else if (page === 'appointments') {
      state.appointments = collectionFrom(await apiRequest(`${API_ENDPOINTS.appointments}${branchQuery}`), ['appointments']);
    } else if (page === 'clinical') {
      const [notes, labs] = await Promise.all([
        apiRequest(`${API_ENDPOINTS.clinicalNotes}${branchQuery}`),
        apiRequest(`${API_ENDPOINTS.labOrders}${branchQuery}`)
      ]);
      state.clinicalNotes = collectionFrom(notes, ['clinicalNotes', 'clinical_notes', 'notes']);
      state.labOrders = collectionFrom(labs, ['labOrders', 'lab_orders', 'orders']);
    } else if (page === 'pharmacy') {
      state.medications = collectionFrom(await apiRequest(`${API_ENDPOINTS.medications}${branchQuery}`), ['medications', 'inventory']);
    } else if (page === 'billing') {
      state.invoices = collectionFrom(await apiRequest(`${API_ENDPOINTS.invoices}${branchQuery}`), ['invoices']);
    } else if (page === 'audit') {
      state.auditLogs = collectionFrom(await apiRequest(`${API_ENDPOINTS.auditLogs}${branchQuery}`), ['auditLogs', 'audit_logs', 'logs']);
    }

    if (requestId !== state.requestSequence) return;
    renderCurrentPage();
  } catch (error) {
    if (requestId !== state.requestSequence) return;
    elements.pageContent.innerHTML = errorState(error.message);
  } finally {
    if (requestId === state.requestSequence) setPageLoading(false);
  }
}

function renderCurrentPage() {
  const renderers = {
    dashboard: renderDashboard,
    patients: renderPatients,
    appointments: renderAppointments,
    clinical: renderClinical,
    pharmacy: renderPharmacy,
    billing: renderBilling,
    audit: renderAudit
  };
  elements.pageContent.innerHTML = renderers[state.activePage]();
}

function renderDashboard() {
  const data = state.dashboard || {};
  const metrics = data.summary || data.metrics || data.stats || data.counts || data;
  const appointments = asArray(data.recentAppointments || data.recent_appointments || data.todayAppointments || data.today_appointments || data.appointments);
  const metricCards = [
    ['Patients', pick(metrics, 'patientCount', 'patient_count', 'patients') ?? 0, 'Authorised records', 'users'],
    ['Active appointments', pick(metrics, 'activeAppointments', 'active_appointments', 'todayAppointmentCount', 'today_appointment_count') ?? appointments.length, 'Across selected branches', 'calendar'],
    ['Open lab orders', pick(metrics, 'pendingLabOrders', 'pending_lab_orders', 'openLabOrderCount', 'open_lab_order_count') ?? 0, 'Awaiting completion', 'clinical'],
    ['Outstanding invoices', pick(metrics, 'outstandingInvoices', 'outstanding_invoices', 'unpaidInvoiceCount', 'unpaid_invoice_count') ?? 0, 'Accounts requiring follow-up', 'receipt']
  ];

  return `
    <div class="metric-grid" data-testid="dashboard-metrics">
      ${metricCards.map(([label, value, meta, icon]) => metricCard(label, value, meta, icon)).join('')}
    </div>
    <div class="dashboard-grid">
      <section class="panel" aria-labelledby="today-heading">
        <header class="panel-header"><div><h2 id="today-heading">Recent appointments</h2><p>Latest activity across authorised branches</p></div><button class="button button--quiet button--small" type="button" data-go-page="appointments">View schedule</button></header>
        ${appointments.length ? `<div class="table-scroll">${appointmentsTable(appointments, false)}</div>` : emptyState('calendar', 'No recent appointments', 'The selected branch has no appointment activity to show.')}
      </section>
      <section class="panel" aria-labelledby="quick-heading">
        <header class="panel-header"><div><h2 id="quick-heading">Quick actions</h2><p>Common tasks for your role</p></div></header>
        <div class="quick-list">
          ${dashboardQuickActions() || '<p class="panel-body">No quick actions are assigned to this role.</p>'}
        </div>
      </section>
    </div>`;
}

function metricCard(label, value, meta, icon) {
  return `<article class="metric-card"><div class="metric-card__top"><span class="metric-card__label">${escapeHtml(label)}</span><span class="metric-card__icon"><svg aria-hidden="true"><use href="#icon-${icon}"></use></svg></span></div><strong class="metric-card__value">${escapeHtml(String(value))}</strong><span class="metric-card__meta">${escapeHtml(meta)}</span></article>`;
}

function dashboardQuickActions() {
  const actions = [];
  if (canUseForm('patient')) actions.push(['patient', 'Register a patient']);
  if (canUseForm('appointment')) actions.push(['appointment', 'Book an appointment']);
  if (canUseForm('clinicalNote')) actions.push(['clinicalNote', 'Record a clinical note']);
  if (canUseForm('nurseObservation')) actions.push(['nurseObservation', 'Record vitals / observation']);
  if (canUseForm('labOrder')) actions.push(['labOrder', 'Request a lab test']);
  if (canUseForm('dispense')) actions.push(['dispense', 'Dispense medication']);
  if (canUseForm('invoice')) actions.push(['invoice', 'Create an invoice']);
  return actions.slice(0, 5).map(([form, label]) => `<button class="quick-action" type="button" data-open-form="${form}"><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></button>`).join('');
}

function renderPatients() {
  return `${tableToolbar('patients', 'Search by patient name, identifier or phone')}
    <section class="table-panel" data-testid="patients-table">
      ${state.patients.length ? `<div class="table-scroll">${patientsTable(state.patients)}</div>` : emptyState('users', 'No patient records found', 'Register the first synthetic patient or change the branch filter.')}
    </section>`;
}

function patientsTable(patients) {
  const hasEdit = canUseForm('editPatient');
  const rows = patients.map((patient) => {
    const id = pick(patient, 'id', 'patientId', 'patient_id');
    const name = personName(patient) || `Patient ${id}`;
    const identifier = pick(patient, 'medicalRecordNumber', 'medical_record_number', 'mrn', 'patientNumber', 'patient_number') || id;
    const dob = pick(patient, 'dateOfBirth', 'date_of_birth', 'dob');
    const phone = pick(patient, 'phone', 'phoneNumber', 'phone_number') || '—';
    const branch = branchNameFor(pick(patient, 'branchId', 'branch_id'), pick(patient, 'branchName', 'branch_name'));
    const editBtn = hasEdit ? `<td><button class="table-action" type="button" data-open-form="editPatient" data-record-id="${id}" data-first-name="${escapeAttribute(patient.firstName || patient.first_name || '')}" data-last-name="${escapeAttribute(patient.lastName || patient.last_name || '')}" data-date-of-birth="${escapeAttribute(dob || '')}" data-gender="${escapeAttribute(patient.gender || '')}" data-phone="${escapeAttribute(phone !== '—' ? phone : '')}" data-email="${escapeAttribute(patient.email || '')}" data-address="${escapeAttribute(patient.address || '')}" data-emergency-contact="${escapeAttribute(patient.emergencyContact || patient.emergency_contact || '')}" data-allergies="${escapeAttribute(patient.allergies || '')}">Edit</button></td>` : '';
    return `<tr data-filter-row data-search="${escapeAttribute(`${name} ${identifier} ${phone} ${branch}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(name)}</strong><small>MRN ${escapeHtml(String(identifier))}</small></span></td><td>${escapeHtml(formatDate(dob))}</td><td>${escapeHtml(phone)}</td><td>${escapeHtml(branch || '—')}</td><td><span class="status-badge status-badge--active">Active</span></td>${editBtn}</tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Patient</th><th scope="col">Date of birth</th><th scope="col">Phone</th><th scope="col">Branch</th><th scope="col">Status</th>${hasEdit ? '<th scope="col">Action</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAppointments() {
  return `${tableToolbar('appointments', 'Search by patient, clinician or reason', true)}
    <section class="table-panel" data-testid="appointments-table">
      ${state.appointments.length ? `<div class="table-scroll">${appointmentsTable(state.appointments, canUseForm('clinicalNote'))}</div>` : emptyState('calendar', 'No appointments found', 'Book an appointment or change the filters to view another date.')}
    </section>`;
}

function appointmentsTable(appointments, includeAction = true) {
  const hasEdit = canUseForm('editAppointment');
  const showActionHeader = includeAction || hasEdit;
  const rows = appointments.map((appointment) => {
    const patient = pick(appointment, 'patientName', 'patient_name') || personName(appointment.patient) || `Patient ${pick(appointment, 'patientId', 'patient_id') || ''}`;
    const clinician = pick(appointment, 'doctorName', 'doctor_name', 'clinicianName', 'clinician_name') || personName(appointment.doctor || appointment.clinician) || 'Unassigned';
    const startsAt = pick(appointment, 'startsAt', 'starts_at', 'scheduledAt', 'scheduled_at');
    const status = String(pick(appointment, 'status') || 'booked').toLowerCase();
    const reason = pick(appointment, 'reason', 'appointmentReason', 'appointment_reason') || 'General consultation';
    const branch = branchNameFor(pick(appointment, 'branchId', 'branch_id'), pick(appointment, 'branchName', 'branch_name'));
    
    let actions = [];
    if (includeAction && canUseForm('clinicalNote')) {
      actions.push(`<button class="table-action" type="button" data-open-form="clinicalNote" data-patient-id="${pick(appointment, 'patientId', 'patient_id')}" data-appointment-id="${appointment.id}">Add note</button>`);
    }
    if (hasEdit) {
      actions.push(`<button class="table-action" type="button" data-open-form="editAppointment" data-record-id="${appointment.id}" data-status="${escapeAttribute(titleCase(status))}" data-doctor-user-id="${pick(appointment, 'doctorUserId', 'doctor_user_id')}" data-starts-at="${escapeAttribute(startsAt.slice(0, 16))}" data-ends-at="${escapeAttribute(pick(appointment, 'endsAt', 'ends_at').slice(0, 16))}" data-reason="${escapeAttribute(reason)}" data-notes="${escapeAttribute(pick(appointment, 'notes') || '')}">Modify</button>`);
    }
    const actionsCell = showActionHeader ? `<td><div class="row-actions">${actions.join(' ')}</div></td>` : '';
    
    return `<tr data-filter-row data-status="${escapeAttribute(status)}" data-date="${escapeAttribute(toDateInput(startsAt))}" data-search="${escapeAttribute(`${patient} ${clinician} ${reason} ${branch}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(formatTime(startsAt))}</strong><small>${escapeHtml(formatDate(startsAt))}</small></span></td><td><strong>${escapeHtml(patient)}</strong></td><td>${escapeHtml(clinician)}</td><td>${escapeHtml(reason)}</td><td>${escapeHtml(branch || '—')}</td><td><span class="status-badge status-badge--${escapeAttribute(kebab(status))}">${escapeHtml(titleCase(status))}</span></td>${actionsCell}</tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Time</th><th scope="col">Patient</th><th scope="col">Clinician</th><th scope="col">Reason</th><th scope="col">Branch</th><th scope="col">Status</th>${showActionHeader ? '<th scope="col">Action</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderClinical() {
  return `<div class="split-grid">
    <section class="table-panel" data-testid="clinical-notes-table">
      <header class="panel-header"><div><h2>Recent clinical notes</h2><p>Role-restricted care documentation</p></div></header>
      ${state.clinicalNotes.length ? `<div class="table-scroll">${clinicalNotesTable(state.clinicalNotes)}</div>` : emptyState('clinical', 'No clinical notes', 'No notes are available for the selected branch.')}
    </section>
    <section class="table-panel" data-testid="lab-orders-table">
      <header class="panel-header"><div><h2>Laboratory orders</h2><p>Requests and result status</p></div></header>
      ${state.labOrders.length ? `<div class="table-scroll">${labOrdersTable(state.labOrders)}</div>` : emptyState('clinical', 'No laboratory orders', 'Create a lab request to begin the diagnostic workflow.')}
    </section>
  </div>`;
}

function clinicalNotesTable(notes) {
  const rows = notes.map((note) => {
    const id = note.id;
    const patient = pick(note, 'patientName', 'patient_name') || personName(note.patient) || `Patient ${pick(note, 'patientId', 'patient_id') || ''}`;
    const author = pick(note, 'authorName', 'author_name', 'clinicianName', 'clinician_name') || personName(note.author || note.clinician) || 'Clinical team';
    const created = pick(note, 'createdAt', 'created_at', 'recordedAt', 'recorded_at');
    const diagnosis = pick(note, 'diagnosis', 'assessment') || 'Clinical note';
    const action = `<td><button class="table-action" type="button" data-print-note="${id}">Print</button></td>`;
    return `<tr><td><span class="cell-primary"><strong>${escapeHtml(patient)}</strong><small>${escapeHtml(formatDateTime(created))}</small></span></td><td>${escapeHtml(diagnosis)}</td><td>${escapeHtml(author)}</td>${action}</tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Patient</th><th scope="col">Assessment</th><th scope="col">Author</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function labOrdersTable(orders) {
  const rows = orders.map((order) => {
    const id = pick(order, 'id', 'labOrderId', 'lab_order_id');
    const patient = pick(order, 'patientName', 'patient_name') || personName(order.patient) || `Patient ${pick(order, 'patientId', 'patient_id') || ''}`;
    const testName = pick(order, 'testName', 'test_name') || 'Diagnostic test';
    const status = String(pick(order, 'status') || 'ordered').toLowerCase();
    const priority = String(pick(order, 'priority') || 'routine').toLowerCase();
    const attachmentUrl = pick(order, 'attachmentUrl', 'attachment_url');
    const attachmentLink = attachmentUrl 
      ? `<br><a href="${escapeAttribute(attachmentUrl)}" target="_blank" class="document-link" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 11px; font-weight: bold; color: #0055cc;"><svg style="width: 12px; height: 12px; fill: currentColor;"><use href="#icon-download"></use></svg> View Attached Report</a>` 
      : '';
    const action = canUseForm('labResult') && !['completed', 'final', 'cancelled'].includes(status)
      ? `<button class="table-action" type="button" data-open-form="labResult" data-record-id="${escapeAttribute(id)}" data-record-label="${escapeAttribute(testName)}">Record result</button>` : '—';
    return `<tr><td><span class="cell-primary"><strong>${escapeHtml(testName)}</strong><small>${escapeHtml(patient)}</small>${attachmentLink}</span></td><td><span class="status-badge status-badge--${priority === 'urgent' ? 'danger' : 'active'}">${escapeHtml(titleCase(priority))}</span></td><td><span class="status-badge status-badge--${escapeAttribute(status)}">${escapeHtml(titleCase(status))}</span></td><td>${action}</td></tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Order</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPharmacy() {
  return `${tableToolbar('pharmacy', 'Search medication name, code or supplier', true, true)}
    <section class="table-panel" data-testid="medications-table">
      ${state.medications.length ? `<div class="table-scroll">${medicationsTable(state.medications)}</div>` : emptyState('pill', 'No medication inventory found', 'Medication stock will appear here when inventory is loaded.')}
    </section>`;
}

function medicationsTable(medications) {
  const rows = medications.map((medication) => {
    const id = pick(medication, 'id', 'medicationId', 'medication_id');
    const name = pick(medication, 'name', 'medicationName', 'medication_name') || `Medication ${id}`;
    const strength = pick(medication, 'strength') || '';
    const sku = pick(medication, 'sku', 'code') || id;
    const quantity = Number(pick(medication, 'quantityOnHand', 'quantity_on_hand', 'stockQuantity', 'stock_quantity', 'quantity') || 0);
    const threshold = Number(pick(medication, 'reorderLevel', 'reorder_level', 'lowStockThreshold', 'low_stock_threshold') || 10);
    const status = quantity <= threshold ? 'warning' : 'success';
    const label = quantity <= threshold ? 'Low stock' : 'In stock';
    const action = canUseForm('dispense') ? `<button class="table-action" type="button" data-open-form="dispense" data-inventory-id="${escapeAttribute(id)}">Dispense</button>` : '—';
    return `<tr data-filter-row data-status="${status}" data-search="${escapeAttribute(`${name} ${strength} ${sku}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(name)} ${escapeHtml(strength)}</strong><small>Code ${escapeHtml(String(sku))}</small></span></td><td><strong>${escapeHtml(String(quantity))}</strong></td><td><span class="status-badge status-badge--${status}">${label}</span></td><td>${action}</td></tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Medication</th><th scope="col">On hand</th><th scope="col">Stock status</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBilling() {
  return `${tableToolbar('billing', 'Search invoice, patient or description', true)}
    <section class="table-panel" data-testid="invoices-table">
      ${state.invoices.length ? `<div class="table-scroll">${invoicesTable(state.invoices)}</div>` : emptyState('receipt', 'No invoices found', 'Create an invoice for a synthetic patient to begin billing.')}
    </section>`;
}

function invoicesTable(invoices) {
  const rows = invoices.map((invoice) => {
    const id = pick(invoice, 'id', 'invoiceId', 'invoice_id');
    const number = pick(invoice, 'invoiceNumber', 'invoice_number', 'number') || id;
    const patient = pick(invoice, 'patientName', 'patient_name') || personName(invoice.patient) || `Patient ${pick(invoice, 'patientId', 'patient_id') || ''}`;
    const description = pick(invoice, 'description') || 'Hospital services';
    const amount = pick(invoice, 'amount', 'totalAmount', 'total_amount');
    const amountCents = pick(invoice, 'totalCents', 'total_cents', 'subtotalCents', 'subtotal_cents');
    const displayAmount = amountCents !== undefined ? Number(amountCents) / 100 : Number(amount || 0);
    const balanceCents = pick(invoice, 'balanceCents', 'balance_cents') ?? amountCents ?? Math.round(displayAmount * 100);
    const issuedAt = pick(invoice, 'issuedAt', 'issued_at', 'createdAt', 'created_at', 'dueDate', 'due_date');
    const status = String(pick(invoice, 'status', 'paymentStatus', 'payment_status') || 'unpaid').toLowerCase();
    
    let actions = [];
    if (canUseForm('markPaid') && !['paid', 'void'].includes(status)) {
      actions.push(`<button class="table-action" type="button" data-open-form="markPaid" data-record-id="${escapeAttribute(id)}" data-record-label="${escapeAttribute(String(number))}" data-balance-cents="${escapeAttribute(balanceCents)}">Mark paid</button>`);
    }
    actions.push(`<button class="table-action" type="button" data-print-invoice="${id}">Print</button>`);
    const actionsCell = `<td><div class="row-actions">${actions.join(' ')}</div></td>`;

    return `<tr data-filter-row data-status="${escapeAttribute(status)}" data-search="${escapeAttribute(`${number} ${patient} ${description}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(String(number))}</strong><small>${escapeHtml(description)}</small></span></td><td>${escapeHtml(patient)}</td><td><strong>${formatCurrency(displayAmount)}</strong></td><td>${escapeHtml(formatDate(issuedAt))}</td><td><span class="status-badge status-badge--${escapeAttribute(kebab(status))}">${escapeHtml(titleCase(status))}</span></td>${actionsCell}</tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Patient</th><th scope="col">Amount</th><th scope="col">Issued</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAudit() {
  return `${tableToolbar('audit', 'Search actor, action, entity or identifier', true)}
    <section class="table-panel" data-testid="audit-logs-table">
      ${state.auditLogs.length ? `<div class="table-scroll">${auditTable(state.auditLogs)}</div>` : emptyState('shield', 'No audit events found', 'Security-relevant actions will appear here as the system is used.')}
    </section>`;
}

function auditTable(logs) {
  const rows = logs.map((log) => {
    const occurred = pick(log, 'createdAt', 'created_at', 'occurredAt', 'occurred_at', 'timestamp');
    const actor = pick(log, 'actorName', 'actor_name', 'username') || personName(log.actor || log.user) || 'System';
    const action = pick(log, 'action', 'eventType', 'event_type') || 'Event';
    const entity = pick(log, 'entityType', 'entity_type', 'resourceType', 'resource_type') || 'System';
    const entityId = pick(log, 'entityId', 'entity_id', 'resourceId', 'resource_id') || '—';
    const ip = pick(log, 'ipAddress', 'ip_address') || '—';
    return `<tr data-filter-row data-search="${escapeAttribute(`${actor} ${action} ${entity} ${entityId} ${ip}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(formatDateTime(occurred))}</strong><small>${escapeHtml(ip)}</small></span></td><td>${escapeHtml(actor)}</td><td><strong>${escapeHtml(titleCase(action))}</strong></td><td>${escapeHtml(`${titleCase(entity)} ${entityId}`)}</td></tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Time / IP</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Entity</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tableToolbar(kind, placeholder, showStatus = false, stockOnly = false) {
  let statusOptions = '';
  if (showStatus) {
    const values = kind === 'appointments' ? ['scheduled', 'checked in', 'in progress', 'completed', 'cancelled', 'no show']
      : kind === 'billing' ? ['draft', 'issued', 'partially paid', 'paid', 'void']
      : kind === 'audit' ? []
      : stockOnly ? ['success', 'warning'] : [];
    if (values.length) {
      statusOptions = `<label class="visually-hidden" for="${kind}-status">Filter by status</label><select id="${kind}-status" data-table-status><option value="">All statuses</option>${values.map((value) => `<option value="${value}">${stockOnly ? (value === 'warning' ? 'Low stock' : 'In stock') : titleCase(value)}</option>`).join('')}</select>`;
    }
  }
  const dateFilter = kind === 'appointments' ? `<label class="visually-hidden" for="${kind}-date">Filter by date</label><input id="${kind}-date" type="date" data-table-date>` : '';
  const exportBtn = `<button class="button button--secondary button--small" type="button" data-export-csv="${kind}" style="display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; margin-left: auto;" title="Export dataset to a CSV file"><svg aria-hidden="true" style="width: 16px; height: 16px;"><use href="#icon-download"></use></svg>Export CSV</button>`;
  return `<div class="toolbar"><label class="search-field" for="${kind}-search"><span class="visually-hidden">${escapeHtml(placeholder)}</span><svg aria-hidden="true"><use href="#icon-search"></use></svg><input id="${kind}-search" type="search" placeholder="${escapeAttribute(placeholder)}" data-table-search></label>${dateFilter}${statusOptions}${exportBtn}</div>`;
}

function exportToCSV(kind) {
  let headers = [];
  let rows = [];
  const filename = `${kind}_export_${new Date().toISOString().slice(0, 10)}.csv`;

  if (kind === 'patients') {
    headers = ['ID', 'MRN', 'First Name', 'Last Name', 'DOB', 'Gender', 'Phone', 'Email', 'Address', 'Emergency Contact', 'Allergies'];
    rows = state.patients.map(p => [
      p.id,
      p.medicalRecordNumber || p.medical_record_number || '',
      p.firstName || p.first_name || '',
      p.lastName || p.last_name || '',
      p.dateOfBirth || p.date_of_birth || '',
      p.gender || '',
      p.phone || '',
      p.email || '',
      p.address || '',
      p.emergencyContact || p.emergency_contact || '',
      p.allergies || ''
    ]);
  } else if (kind === 'appointments') {
    headers = ['ID', 'Patient Name', 'Clinician Name', 'Start Time', 'End Time', 'Status', 'Reason', 'Notes'];
    rows = state.appointments.map(a => [
      a.id,
      a.patientName || a.patient_name || '',
      a.doctorName || a.doctor_name || '',
      a.startsAt || a.starts_at || '',
      a.endsAt || a.ends_at || '',
      a.status || '',
      a.reason || '',
      a.notes || ''
    ]);
  } else if (kind === 'pharmacy') {
    headers = ['ID', 'Name', 'Code', 'Strength', 'Category', 'Quantity', 'Reorder Level', 'Unit Price (AUD)'];
    rows = state.medications.map(m => [
      m.id,
      m.name || '',
      m.code || '',
      m.strength || '',
      m.category || '',
      m.quantity || 0,
      m.reorderLevel || m.reorder_level || 0,
      (Number(m.unitPriceCents || m.unit_price_cents || 0) / 100).toFixed(2)
    ]);
  } else if (kind === 'billing') {
    headers = ['Invoice ID', 'Patient Name', 'Description', 'Subtotal (AUD)', 'GST (AUD)', 'Total (AUD)', 'Paid (AUD)', 'Status', 'Issued At'];
    rows = state.invoices.map(i => [
      i.id,
      i.patientName || i.patient_name || '',
      i.description || '',
      (Number(i.subtotalCents || i.subtotal_cents || 0) / 100).toFixed(2),
      (Number(i.gstCents || i.gst_cents || 0) / 100).toFixed(2),
      (Number(i.totalCents || i.total_cents || 0) / 100).toFixed(2),
      (Number(i.paidCents || i.paid_cents || 0) / 100).toFixed(2),
      i.status || '',
      i.createdAt || i.created_at || ''
    ]);
  } else if (kind === 'audit') {
    headers = ['Timestamp', 'Actor Name', 'Action', 'Entity Type', 'Entity ID', 'IP Address'];
    rows = state.auditLogs.map(l => [
      l.createdAt || l.created_at || l.occurredAt || l.occurred_at || l.timestamp || '',
      l.actorName || l.actor_name || l.username || '',
      l.action || '',
      l.entityType || l.entity_type || '',
      l.entityId || l.entity_id || '',
      l.ipAddress || l.ip_address || ''
    ]);
  } else {
    showToast('Export data not found.', 'error');
    return;
  }

  if (!rows.length) {
    showToast('No records available to export.', 'warning');
    return;
  }

  const escapeCSV = (val) => {
    let str = String(val ?? '').replace(/"/g, '""');
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Successfully exported ${rows.length} records.`, 'success');
}

function printInvoice(invoiceId) {
  const invoice = state.invoices.find(i => String(i.id) === String(invoiceId));
  if (!invoice) {
    showToast('Invoice not found.', 'error');
    return;
  }

  const id = pick(invoice, 'id', 'invoiceId', 'invoice_id');
  const number = pick(invoice, 'invoiceNumber', 'invoice_number', 'number') || id;
  const patientName = pick(invoice, 'patientName', 'patient_name') || 'Synthetic Patient';
  const description = pick(invoice, 'description') || 'Hospital services';
  const subtotalCents = pick(invoice, 'subtotalCents', 'subtotal_cents');
  const gstCents = pick(invoice, 'gstCents', 'gst_cents');
  const totalCents = pick(invoice, 'totalCents', 'total_cents');
  const paidCents = pick(invoice, 'paidCents', 'paid_cents') || 0;
  const balanceCents = totalCents - paidCents;
  const status = String(pick(invoice, 'status', 'paymentStatus', 'payment_status') || 'unpaid').toUpperCase();
  const issuedAt = pick(invoice, 'issuedAt', 'issued_at', 'createdAt', 'created_at');
  const branchName = branchNameFor(pick(invoice, 'branchId', 'branch_id')) || 'St George Hospital';

  const html = `
    <div class="print-header">
      <div>
        <h1>ST GEORGE HMS</h1>
        <p>${escapeHtml(branchName)}</p>
        <p>Iterative Prototype / PWA Demo</p>
      </div>
      <div>
        <div class="print-title">INVOICE</div>
        <p style="text-align: right;">No: ${escapeHtml(String(number))}</p>
        <p style="text-align: right;">Date: ${escapeHtml(formatDate(issuedAt))}</p>
      </div>
    </div>

    <div class="print-grid">
      <div class="print-card">
        <h3>Billed To:</h3>
        <p><strong>${escapeHtml(patientName)}</strong></p>
        <p>Synthetic Record ID: ${escapeHtml(String(pick(invoice, 'patientId', 'patient_id') || ''))}</p>
      </div>
      <div class="print-card" style="text-align: right;">
        <h3>Payment Status:</h3>
        <span class="print-badge print-badge--${status.toLowerCase() === 'paid' ? 'paid' : 'unpaid'}">${escapeHtml(status)}</span>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right;">Amount (AUD)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(description)}</td>
          <td style="text-align: right;">${formatCurrency(Number(subtotalCents || totalCents) / 100)}</td>
        </tr>
        <tr class="total-row">
          <td>Subtotal:</td>
          <td style="text-align: right;">${formatCurrency(Number(subtotalCents || (totalCents - (gstCents || 0))) / 100)}</td>
        </tr>
        <tr>
          <td>GST (10%):</td>
          <td style="text-align: right;">${formatCurrency(Number(gstCents || 0) / 100)}</td>
        </tr>
        <tr class="total-row" style="font-size: 16px;">
          <td>Total Due:</td>
          <td style="text-align: right;">${formatCurrency(Number(totalCents) / 100)}</td>
        </tr>
        <tr>
          <td>Amount Paid:</td>
          <td style="text-align: right; color: green;">${formatCurrency(Number(paidCents) / 100)}</td>
        </tr>
        <tr class="total-row" style="border-top: 1px dashed #333;">
          <td>Outstanding Balance:</td>
          <td style="text-align: right; color: ${balanceCents > 0 ? 'red' : 'black'};">${formatCurrency(Number(balanceCents) / 100)}</td>
        </tr>
      </tbody>
    </table>

    <div class="print-footer">
      <p>Thank you for using St George HMS.</p>
      <p>This is a synthetic patient invoice generated under iteration assessment guidelines. No real payments are processed.</p>
    </div>
  `;

  triggerBrowserPrint(html);
}

function printClinicalNote(noteId) {
  const note = state.clinicalNotes.find(n => String(n.id) === String(noteId));
  if (!note) {
    showToast('Clinical note not found.', 'error');
    return;
  }

  const id = note.id;
  const patientName = pick(note, 'patientName', 'patient_name') || 'Synthetic Patient';
  const authorName = pick(note, 'authorName', 'author_name', 'clinicianName', 'clinician_name') || 'Clinical team';
  const created = pick(note, 'createdAt', 'created_at', 'recordedAt', 'recorded_at');
  const noteType = pick(note, 'noteType', 'note_type') || 'Progress Note';
  const subjective = pick(note, 'subjective') || '';
  const objective = pick(note, 'objective') || '';
  const assessment = pick(note, 'diagnosis', 'assessment') || '';
  const plan = pick(note, 'plan') || '';
  const branchName = branchNameFor(pick(note, 'branchId', 'branch_id')) || 'St George Hospital';

  const html = `
    <div class="print-header">
      <div>
        <h1>ST GEORGE HMS</h1>
        <p>${escapeHtml(branchName)}</p>
        <p>Iterative Prototype / PWA Demo</p>
      </div>
      <div>
        <div class="print-title">CASE REPORT</div>
        <p style="text-align: right;">Record ID: ${escapeHtml(String(id))}</p>
        <p style="text-align: right;">Date: ${escapeHtml(formatDateTime(created))}</p>
      </div>
    </div>

    <div class="print-grid">
      <div class="print-card">
        <h3>Patient Info:</h3>
        <p><strong>${escapeHtml(patientName)}</strong></p>
        <p>Synthetic Record ID: ${escapeHtml(String(pick(note, 'patientId', 'patient_id') || ''))}</p>
      </div>
      <div class="print-card" style="text-align: right;">
        <h3>Clinician / Author:</h3>
        <p><strong>${escapeHtml(authorName)}</strong></p>
        <p>Care Team Member</p>
      </div>
    </div>

    <h2 style="font-size: 18px; border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 20px; text-transform: uppercase;">
      ${escapeHtml(noteType)}
    </h2>

    ${subjective ? `
    <div class="print-clinical-section">
      <h4>Subjective (S)</h4>
      <p>${escapeHtml(subjective)}</p>
    </div>` : ''}

    ${objective ? `
    <div class="print-clinical-section">
      <h4>Objective (O)</h4>
      <p>${escapeHtml(objective)}</p>
    </div>` : ''}

    ${assessment ? `
    <div class="print-clinical-section">
      <h4>Assessment (A)</h4>
      <p>${escapeHtml(assessment)}</p>
    </div>` : ''}

    ${plan ? `
    <div class="print-clinical-section">
      <h4>Plan (P)</h4>
      <p>${escapeHtml(plan)}</p>
    </div>` : ''}

    <div class="print-footer">
      <p>Confidential Medical Record — Authorized Access Only.</p>
      <p>This is a synthetic patient record generated under iteration assessment guidelines. No real health operations are conducted.</p>
    </div>
  `;

  triggerBrowserPrint(html);
}

function triggerBrowserPrint(htmlContent) {
  document.body.classList.add('printing-mode');
  const printContainer = document.createElement('div');
  printContainer.id = 'print-area';
  printContainer.innerHTML = htmlContent;
  document.body.appendChild(printContainer);
  window.print();
  document.body.removeChild(printContainer);
  document.body.classList.remove('printing-mode');
}

function emptyState(icon, title, message) {
  return `<div class="empty-state"><div><span class="empty-state__icon"><svg aria-hidden="true"><use href="#icon-${icon}"></use></svg></span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div></div>`;
}

function errorState(message) {
  return `<section class="panel error-state" role="alert"><div><h3>We couldn't load this page</h3><p>${escapeHtml(message || 'Please check the server connection and try again.')}</p><p class="error-state__action"><button class="button button--secondary" type="button" data-retry>Try again</button></p></div></section>`;
}

function handleTableFilter(event) {
  if (!event.target.matches('[data-table-search], [data-table-status], [data-table-date]')) return;
  const toolbar = event.target.closest('.toolbar');
  const panel = toolbar?.nextElementSibling;
  if (!panel) return;
  const search = toolbar.querySelector('[data-table-search]')?.value.trim().toLowerCase() || '';
  const status = toolbar.querySelector('[data-table-status]')?.value || '';
  const date = toolbar.querySelector('[data-table-date]')?.value || '';
  for (const row of panel.querySelectorAll('[data-filter-row]')) {
    const matchesSearch = !search || (row.dataset.search || '').includes(search);
    const matchesStatus = !status || row.dataset.status === status;
    const matchesDate = !date || row.dataset.date === date;
    row.hidden = !(matchesSearch && matchesStatus && matchesDate);
  }
}

function handleActionClick(event) {
  const exportBtn = event.target.closest('[data-export-csv]');
  if (exportBtn) {
    exportToCSV(exportBtn.dataset.exportCsv);
    return;
  }
  const printInvoiceBtn = event.target.closest('[data-print-invoice]');
  if (printInvoiceBtn) {
    printInvoice(printInvoiceBtn.dataset.printInvoice);
    return;
  }
  const printNoteBtn = event.target.closest('[data-print-note]');
  if (printNoteBtn) {
    printClinicalNote(printNoteBtn.dataset.printNote);
    return;
  }
  const goPage = event.target.closest('[data-go-page]');
  if (goPage) {
    navigateTo(goPage.dataset.goPage, { updateHash: true, focus: true });
    return;
  }
  const retry = event.target.closest('[data-retry]');
  if (retry) {
    loadPage(state.activePage);
    return;
  }
  const trigger = event.target.closest('[data-open-form]');
  if (!trigger) return;
  const formName = trigger.dataset.openForm;
  if (!canUseForm(formName)) {
    showToast('Your role does not permit this action.', 'error');
    return;
  }
  openRecordDialog(formName, trigger.dataset);
}

function formDefinitions() {
  return {
    editPatient: {
      eyebrow: 'Clinical registry',
      title: 'Edit patient profile',
      description: 'Updating patient demographics. Every profile modification is logged in the audit trail.',
      submitLabel: 'Save changes',
      method: 'PATCH',
      endpoint: (context) => `${API_ENDPOINTS.patients}/${context.recordId}`,
      success: 'Patient profile updated successfully.',
      fields: [
        field('firstName', 'First name', 'text', { required: true, autocomplete: 'off' }),
        field('lastName', 'Last name', 'text', { required: true, autocomplete: 'off' }),
        field('dateOfBirth', 'Date of birth', 'date', { required: true, max: toDateInput(new Date()) }),
        selectField('gender', 'Gender', [['Female', 'Female'], ['Male', 'Male'], ['Non-binary', 'Non-binary'], ['Other', 'Other'], ['Not specified', 'Not specified']], { required: true }),
        field('phone', 'Phone', 'tel', { placeholder: '04xx xxx xxx', pattern: '[0-9+() \\-]{8,20}' }),
        field('email', 'Email', 'email', { placeholder: 'synthetic@example.test' }),
        field('address', 'Address', 'text', { wide: true, placeholder: 'Synthetic address' }),
        field('emergencyContact', 'Emergency contact', 'text', { wide: true, placeholder: 'Synthetic contact name and phone' }),
        field('allergies', 'Allergies', 'text', { wide: true, placeholder: 'e.g. Penicillin, Pollen (or No known allergies)' })
      ]
    },
    editAppointment: {
      eyebrow: 'Scheduling',
      title: 'Modify appointment',
      description: 'Updating or cancelling an appointment. A cancellation reason is mandatory if status is set to Cancelled.',
      submitLabel: 'Save changes',
      method: 'PATCH',
      endpoint: (context) => `${API_ENDPOINTS.appointments}/${context.recordId}`,
      success: 'Appointment updated successfully.',
      fields: [
        selectField('status', 'Status', [
          ['Scheduled', 'Scheduled'],
          ['Checked In', 'Checked In'],
          ['In Progress', 'In Progress'],
          ['Completed', 'Completed'],
          ['Cancelled', 'Cancelled'],
          ['No Show', 'No Show']
        ], { required: true }),
        doctorField(true),
        field('startsAt', 'Start time', 'datetime-local', { required: true }),
        field('endsAt', 'End time', 'datetime-local', { required: true }),
        field('reason', 'Reason for appointment', 'textarea', { required: true, wide: true, maxlength: 500 }),
        field('cancellationReason', 'Cancellation reason', 'textarea', { wide: true, placeholder: 'Required only if status is Cancelled' })
      ]
    },
    nurseObservation: {
      eyebrow: 'Clinical workflow',
      title: 'Record nurse observations',
      description: 'Nurses record patient vitals (temperature, pulse, BP, respiration) as part of the care audit trail.',
      submitLabel: 'Save observations',
      method: 'POST',
      endpoint: API_ENDPOINTS.clinicalNotes,
      success: 'Observations recorded successfully.',
      transformPayload: (payload) => {
        payload.noteType = 'Observation';
        payload.subjective = 'Nurse routine check-up and vitals assessment.';
        payload.objective = `Temperature: ${payload.temp}°C, Pulse: ${payload.pulse} bpm, Blood Pressure: ${payload.bpSystolic || payload.bp_systolic || ''}/${payload.bpDiastolic || payload.bp_diastolic || ''} mmHg, Respiration Rate: ${payload.resp} /min.`;
        payload.assessment = payload.assessmentNote || 'Vitals taken and checked.';
        payload.plan = payload.planNote || 'Continue routine monitoring.';
        delete payload.temp;
        delete payload.pulse;
        delete payload.bpSystolic;
        delete payload.bp_systolic;
        delete payload.bpDiastolic;
        delete payload.bp_diastolic;
        delete payload.resp;
        delete payload.assessmentNote;
        delete payload.planNote;
        return payload;
      },
      fields: [
        patientField(true),
        field('appointmentId', 'Appointment ID', 'text', { hint: 'Optional: link to an appointment.' }),
        field('temp', 'Temperature (°C)', 'number', { required: true, min: 30, max: 45, step: 0.1 }),
        field('pulse', 'Pulse rate (bpm)', 'number', { required: true, min: 20, max: 250, step: 1 }),
        field('bpSystolic', 'BP Systolic (mmHg)', 'number', { required: true, min: 50, max: 250, step: 1 }),
        field('bpDiastolic', 'BP Diastolic (mmHg)', 'number', { required: true, min: 30, max: 180, step: 1 }),
        field('resp', 'Respiration rate (/min)', 'number', { required: true, min: 5, max: 60, step: 1 }),
        field('assessmentNote', 'Assessment details / note', 'text', { placeholder: 'e.g. Normal, febrile, hypotensive' }),
        field('planNote', 'Plan / recommendations', 'text', { placeholder: 'e.g. Patient advised to rest' })
      ]
    },
    patient: {
      eyebrow: 'Patient administration',
      title: 'Register patient',
      description: 'Create a synthetic patient record. Do not enter real personal or health information.',
      submitLabel: 'Register patient',
      method: 'POST',
      endpoint: API_ENDPOINTS.patients,
      success: 'Patient registered successfully.',
      fields: [
        field('firstName', 'First name', 'text', { required: true, autocomplete: 'off' }),
        field('lastName', 'Last name', 'text', { required: true, autocomplete: 'off' }),
        field('dateOfBirth', 'Date of birth', 'date', { required: true, max: toDateInput(new Date()) }),
        selectField('gender', 'Gender', [['Female', 'Female'], ['Male', 'Male'], ['Non-binary', 'Non-binary'], ['Other', 'Other'], ['Not specified', 'Not specified']], { required: true }),
        field('phone', 'Phone', 'tel', { placeholder: '04xx xxx xxx', pattern: '[0-9+() \\-]{8,20}' }),
        field('email', 'Email', 'email', { placeholder: 'synthetic@example.test' }),
        branchField(true),
        field('address', 'Address', 'text', { wide: true, placeholder: 'Synthetic address' }),
        field('emergencyContact', 'Emergency contact', 'text', { wide: true, placeholder: 'Synthetic contact name and phone' }),
        field('allergies', 'Allergies', 'text', { wide: true, placeholder: 'e.g. Penicillin, Pollen (or No known allergies)' })
      ]
    },
    appointment: {
      eyebrow: 'Scheduling',
      title: 'Book appointment',
      description: 'The server validates branch and clinician conflicts before confirming the booking.',
      submitLabel: 'Book appointment',
      method: 'POST',
      endpoint: API_ENDPOINTS.appointments,
      success: 'Appointment booked successfully.',
      fields: [
        patientField(true),
        doctorField(true),
        branchField(true),
        field('startsAt', 'Start time', 'datetime-local', { required: true, value: nextHalfHour() }),
        field('endsAt', 'End time', 'datetime-local', { required: true, value: nextHalfHour(30) }),
        field('reason', 'Reason for appointment', 'textarea', { required: true, wide: true, maxlength: 500 })
      ]
    },
    clinicalNote: {
      eyebrow: 'Clinical workflow',
      title: 'Record clinical note',
      description: 'Clinical documentation is restricted to authorised staff and every change is audited.',
      submitLabel: 'Save clinical note',
      method: 'POST',
      endpoint: API_ENDPOINTS.clinicalNotes,
      success: 'Clinical note saved successfully.',
      fields: [
        patientField(true),
        field('appointmentId', 'Appointment ID', 'text', { hint: 'Optional: link this note to an appointment.' }),
        field('subjective', 'Subjective notes (Patient complaints)', 'textarea', { wide: true }),
        field('objective', 'Objective observations', 'textarea', { required: true, wide: true }),
        field('assessment', 'Assessment / diagnosis', 'textarea', { required: true, wide: true }),
        field('plan', 'Treatment plan', 'textarea', { wide: true })
      ]
    },
    labOrder: {
      eyebrow: 'Laboratory',
      title: 'Create lab order',
      description: 'Request a diagnostic test for an authorised synthetic patient record.',
      submitLabel: 'Create order',
      method: 'POST',
      endpoint: API_ENDPOINTS.labOrders,
      success: 'Laboratory order created successfully.',
      fields: [
        patientField(true),
        field('testName', 'Test name', 'text', { required: true, placeholder: 'e.g. Full blood count' }),
        selectField('priority', 'Priority', [['Routine', 'Routine'], ['Urgent', 'Urgent']], { required: true }),
        field('clinicalInformation', 'Clinical information', 'textarea', { required: true, wide: true })
      ]
    },
    labResult: {
      eyebrow: 'Laboratory result',
      title: 'Record lab result',
      description: 'Enter the verified result, optional report file link, and mark completed.',
      submitLabel: 'Finalise result',
      method: 'PATCH',
      endpoint: (context) => API_ENDPOINTS.labOrder(context.recordId),
      success: 'Laboratory result recorded successfully.',
      fields: [
        field('result', 'Result', 'textarea', { required: true, wide: true }),
        field('referenceRange', 'Reference range', 'text'),
        field('attachmentUrl', 'Attachment PDF / Report Link', 'url', { placeholder: 'e.g., https://demo.stgeorge.local/reports/lab_result.pdf', wide: true }),
        selectField('status', 'Status', [['Completed', 'Completed'], ['Processing', 'Processing']], { required: true, value: 'Completed' })
      ]
    },
    dispense: {
      eyebrow: 'Pharmacy',
      title: 'Dispense medication',
      description: 'Confirm the synthetic patient, medication and instructions before dispensing.',
      submitLabel: 'Record dispensing',
      method: 'POST',
      endpoint: API_ENDPOINTS.dispenseMedication,
      success: 'Medication dispensing recorded.',
      fields: [
        patientField(true),
        medicationField(true),
        field('quantity', 'Quantity', 'number', { required: true, min: 1, step: 1, value: 1 }),
        field('instructions', 'Directions / instructions', 'textarea', { required: true, wide: true }),
        field('prescriptionReference', 'Prescription reference', 'text', { required: true, wide: true })
      ]
    },
    invoice: {
      eyebrow: 'Billing',
      title: 'Create invoice',
      description: 'Create an account entry for services delivered to a synthetic patient.',
      submitLabel: 'Create invoice',
      method: 'POST',
      endpoint: API_ENDPOINTS.invoices,
      success: 'Invoice created successfully.',
      transformPayload: (payload) => {
        payload.subtotalCents = Math.round(Number(payload.subtotalAud || 0) * 100);
        payload.gstCents = Math.round(Number(payload.gstAud || 0) * 100);
        delete payload.subtotalAud;
        delete payload.gstAud;
        return payload;
      },
      fields: [
        patientField(true),
        branchField(true),
        field('appointmentId', 'Appointment ID', 'text', { hint: 'Optional related appointment.' }),
        field('description', 'Description', 'text', { required: true, wide: true }),
        field('subtotalAud', 'Subtotal (AUD)', 'number', { required: true, min: 0, step: '0.01' }),
        field('gstAud', 'GST (AUD)', 'number', { min: 0, step: '0.01', value: 0 })
      ]
    },
    markPaid: {
      eyebrow: 'Payment',
      title: 'Mark invoice paid',
      description: 'Confirm the payment method. This status change will be recorded in the audit trail.',
      submitLabel: 'Confirm payment',
      method: 'PATCH',
      endpoint: (context) => API_ENDPOINTS.invoice(context.recordId),
      success: 'Invoice marked as paid.',
      transformPayload: (payload) => {
        payload.paymentAmountCents = Math.round(Number(payload.paymentAmountAud || 0) * 100);
        payload.reference = payload.paymentReference || '';
        delete payload.paymentAmountAud;
        delete payload.paymentReference;
        return payload;
      },
      fields: [
        field('paymentAmountAud', 'Payment amount (AUD)', 'number', { required: true, min: 0.01, step: '0.01' }),
        selectField('method', 'Payment method', [['Cash', 'Cash'], ['Card', 'Card'], ['Bank Transfer', 'Bank transfer'], ['Other', 'Other']], { required: true }),
        field('paymentReference', 'Payment reference', 'text', { wide: true })
      ]
    }
  };
}

function field(name, label, type = 'text', options = {}) {
  return { name, label, type, ...options };
}

function selectField(name, label, options, config = {}) {
  return { name, label, type: 'select', options, ...config };
}

function patientField(required = false) {
  if (state.patients.length) {
    return selectField('patientId', 'Patient', state.patients.map((patient) => [pick(patient, 'id', 'patientId', 'patient_id'), `${personName(patient)} — ${pick(patient, 'medicalRecordNumber', 'medical_record_number', 'mrn') || pick(patient, 'id')}`]), { required });
  }
  return field('patientId', 'Patient ID', 'text', { required, hint: 'Patient list unavailable; enter the synthetic record identifier.' });
}

function doctorField(required = false) {
  if (state.doctors.length) {
    return selectField('doctorUserId', 'Doctor', state.doctors.map((doctor) => [pick(doctor, 'id', 'userId', 'user_id'), personName(doctor) || doctor.username || `Doctor ${pick(doctor, 'id')}`]), { required });
  }
  return field('doctorUserId', 'Doctor user ID', 'text', { required, hint: 'Doctor directory unavailable; enter the authorised user identifier.' });
}

function branchField(required = false) {
  if (state.branches.length) {
    return selectField('branchId', 'Branch', state.branches.map((branch) => [pick(branch, 'id', 'branchId', 'branch_id'), pick(branch, 'name', 'branchName', 'branch_name') || `Branch ${pick(branch, 'id')}`]), { required, value: state.branchId });
  }
  return field('branchId', 'Branch ID', 'text', { required, value: state.branchId, hint: 'Branch list unavailable; enter the branch identifier.' });
}

function medicationField(required = false) {
  if (state.medications.length) {
    return selectField('inventoryId', 'Medication', state.medications.map((medication) => [pick(medication, 'id', 'inventoryId', 'inventory_id'), `${pick(medication, 'name', 'medicationName', 'medication_name')} ${pick(medication, 'strength') || ''}`.trim()]), { required });
  }
  return field('inventoryId', 'Inventory ID', 'text', { required, hint: 'Inventory unavailable; enter the medication inventory identifier.' });
}

async function openRecordDialog(formName, context = {}) {
  if (['appointment', 'clinicalNote', 'labOrder', 'dispense', 'invoice'].includes(formName) && !state.patients.length) {
    try {
      state.patients = collectionFrom(await apiRequest(API_ENDPOINTS.patients), ['patients']);
    } catch (_) {
      // The form has a labelled ID fallback when the patient endpoint is unavailable.
    }
  }
  if (formName === 'dispense' && !state.medications.length) {
    try {
      state.medications = collectionFrom(await apiRequest(API_ENDPOINTS.medications), ['medications', 'inventory']);
    } catch (_) {
      // The form has a labelled ID fallback when inventory is unavailable.
    }
  }

  const definition = formDefinitions()[formName];
  if (!definition) return;
  state.currentForm = { name: formName, definition, context };
  elements.dialogEyebrow.textContent = definition.eyebrow;
  elements.dialogTitle.textContent = context.recordLabel ? `${definition.title}: ${context.recordLabel}` : definition.title;
  elements.dialogDescription.textContent = definition.description;
  elements.dialogSubmit.textContent = definition.submitLabel;
  elements.dialogStatus.textContent = '';
  elements.dialogFields.innerHTML = definition.fields.map(renderFormField).join('');

  // Prefill fields from context dataset
  for (const field of definition.fields) {
    const val = context[field.name];
    if (val !== undefined) {
      const input = elements.dialogFields.querySelector(`[name="${field.name}"]`);
      if (input) input.value = val;
    }
  }

  if (context.inventoryId) {
    const input = elements.dialogFields.querySelector('[name="inventoryId"]');
    if (input) input.value = context.inventoryId;
  }
  if (formName === 'markPaid' && context.balanceCents) {
    const input = elements.dialogFields.querySelector('[name="paymentAmountAud"]');
    if (input) input.value = (Number(context.balanceCents) / 100).toFixed(2);
  }
  elements.recordDialog.showModal();
  requestAnimationFrame(() => elements.dialogFields.querySelector('input, select, textarea')?.focus());
}

function renderFormField(config) {
  const id = `field-${kebab(config.name)}`;
  const required = config.required ? ' required' : '';
  const requiredMark = config.required ? '<span class="required-mark" aria-hidden="true"> *</span>' : '';
  const attributes = [
    config.min !== undefined ? `min="${escapeAttribute(config.min)}"` : '',
    config.max !== undefined ? `max="${escapeAttribute(config.max)}"` : '',
    config.step !== undefined ? `step="${escapeAttribute(config.step)}"` : '',
    config.pattern ? `pattern="${escapeAttribute(config.pattern)}"` : '',
    config.maxlength ? `maxlength="${escapeAttribute(config.maxlength)}"` : '',
    config.placeholder ? `placeholder="${escapeAttribute(config.placeholder)}"` : '',
    config.autocomplete ? `autocomplete="${escapeAttribute(config.autocomplete)}"` : 'autocomplete="off"',
    config.value !== undefined ? `value="${escapeAttribute(config.value)}"` : ''
  ].filter(Boolean).join(' ');
  let control;
  if (config.type === 'select') {
    control = `<select id="${id}" name="${escapeAttribute(config.name)}"${required}><option value="">Select ${escapeHtml(config.label.toLowerCase())}</option>${config.options.map(([value, label]) => `<option value="${escapeAttribute(value)}"${String(config.value ?? '') === String(value) ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
  } else if (config.type === 'textarea') {
    control = `<textarea id="${id}" name="${escapeAttribute(config.name)}"${required} ${attributes}>${escapeHtml(config.value || '')}</textarea>`;
  } else {
    control = `<input id="${id}" name="${escapeAttribute(config.name)}" type="${escapeAttribute(config.type)}"${required} ${attributes}>`;
  }
  return `<div class="form-field${config.wide ? ' form-field--wide' : ''}"><label for="${id}">${escapeHtml(config.label)}${requiredMark}</label>${control}${config.hint ? `<p class="field-hint">${escapeHtml(config.hint)}</p>` : ''}</div>`;
}

async function submitRecordForm(event) {
  event.preventDefault();
  if (!state.currentForm || !validateForm(elements.recordForm)) return;
  const { definition, context } = state.currentForm;
  const formData = new FormData(elements.recordForm);
  const payload = { ...(definition.staticPayload || {}) };
  for (const [key, rawValue] of formData.entries()) {
    const config = definition.fields.find((item) => item.name === key);
    const value = String(rawValue).trim();
    if (!value && !config?.required) continue;
    if (config?.type === 'number') payload[key] = Number(value);
    else if (config?.type === 'datetime-local' && value) payload[key] = new Date(value).toISOString();
    else payload[key] = value;
  }

  const finalPayload = definition.transformPayload ? definition.transformPayload(payload) : payload;
  const endpoint = typeof definition.endpoint === 'function' ? definition.endpoint(context) : definition.endpoint;
  setButtonBusy(elements.dialogSubmit, true, 'Saving…');
  elements.dialogStatus.textContent = '';
  try {
    await apiRequest(endpoint, { method: definition.method, body: finalPayload });
    closeRecordDialog();
    showToast(definition.success, 'success');
    await loadPage(state.activePage);
  } catch (error) {
    elements.dialogStatus.textContent = error.message;
  } finally {
    setButtonBusy(elements.dialogSubmit, false);
  }
}

function closeRecordDialog() {
  if (elements.recordDialog.open) elements.recordDialog.close();
  state.currentForm = null;
  elements.recordForm.reset();
  elements.dialogStatus.textContent = '';
}

function validateForm(form) {
  let valid = true;
  for (const input of form.querySelectorAll('input, select, textarea')) {
    input.removeAttribute('aria-invalid');
    if (!input.checkValidity()) {
      input.setAttribute('aria-invalid', 'true');
      if (valid) input.focus();
      valid = false;
    }
  }
  if (!valid) {
    const status = form === elements.loginForm ? elements.loginStatus : elements.dialogStatus;
    status.textContent = 'Please complete the highlighted required fields.';
  }
  return valid;
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (state.csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) {
    headers.set('X-CSRF-Token', state.csrfToken);
  }

  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch (_) {
    const error = new Error('Unable to reach the hospital server. Check your connection and try again.');
    error.status = 0;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
  const token = response.headers.get('X-CSRF-Token') || payload?.csrfToken || payload?.csrf_token || payload?.data?.csrfToken || payload?.data?.csrf_token;
  if (token) state.csrfToken = token;

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error || friendlyStatusMessage(response.status);
    const error = new Error(typeof message === 'string' ? message : friendlyStatusMessage(response.status));
    error.status = response.status;
    error.details = payload?.error?.details || payload?.errors;
    if (response.status === 401 && !options.allowUnauthenticated && state.user) {
      clearOperationalState();
      showLogin('Your session has expired. Please sign in again.');
    }
    throw error;
  }
  return payload;
}

function friendlyStatusMessage(status) {
  const messages = {
    400: 'The submitted details are invalid. Please review the form.',
    401: 'Authentication is required.',
    403: 'Your role does not permit this action.',
    404: 'The requested record could not be found.',
    409: 'This change conflicts with an existing record. Check scheduling or duplicate details.',
    422: 'The server could not validate these details.',
    429: 'Too many requests. Wait briefly and try again.',
    500: 'The server could not complete the request.'
  };
  return messages[status] || `The request failed (${status}).`;
}

function unwrapData(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

function collectionFrom(payload, keys = []) {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data;
  for (const key of [...keys, 'items', 'results']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function handleBranchChange() {
  state.branchId = elements.branchSelect.value;
  loadPage(state.activePage);
}

function setPageLoading(isLoading) {
  elements.pageLoading.hidden = !isLoading;
  elements.pageContent.hidden = isLoading;
  elements.pageContent.setAttribute('aria-busy', String(isLoading));
}

function togglePasswordVisibility() {
  const showing = elements.loginPassword.type === 'text';
  elements.loginPassword.type = showing ? 'password' : 'text';
  elements.togglePassword.textContent = showing ? 'Show' : 'Hide';
  elements.togglePassword.setAttribute('aria-pressed', String(!showing));
  elements.loginPassword.focus();
}

function toggleProfileMenu() {
  const opening = elements.profileMenu.hidden;
  elements.profileMenu.hidden = !opening;
  elements.profileButton.setAttribute('aria-expanded', String(opening));
}

function closeProfileMenu() {
  elements.profileMenu.hidden = true;
  elements.profileButton.setAttribute('aria-expanded', 'false');
}

function toggleSidebar() {
  const open = !elements.sidebar.classList.contains('sidebar--open');
  elements.sidebar.classList.toggle('sidebar--open', open);
  elements.sidebarScrim.hidden = !open;
  elements.menuToggle.setAttribute('aria-expanded', String(open));
  elements.menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

function closeSidebar() {
  elements.sidebar.classList.remove('sidebar--open');
  elements.sidebarScrim.hidden = true;
  elements.menuToggle.setAttribute('aria-expanded', 'false');
  elements.menuToggle.setAttribute('aria-label', 'Open navigation');
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements.networkStatus.classList.toggle('network-status--offline', !online);
  elements.networkStatus.querySelector('span').textContent = online ? 'Online' : 'Offline';
  elements.networkStatus.title = online ? 'Connected to the network' : 'Offline — read-only app shell available';
}

async function installApplication() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  elements.installButton.hidden = true;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
  } catch (_) {
    // Installation is optional; the authenticated online application remains usable.
  }
}

function setLoginStatus(message, isError = true) {
  elements.loginStatus.textContent = message;
  elements.loginStatus.style.color = isError ? 'var(--red-700)' : 'var(--ink-soft)';
}

function setButtonBusy(button, busy, busyLabel = 'Working…') {
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    delete button.dataset.originalLabel;
  }
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast${type ? ` toast--${type}` : ''}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  elements.toastRegion.append(toast);
  setTimeout(() => toast.remove(), 5000);
}

function pick(object, ...keys) {
  if (!object || typeof object !== 'object') return undefined;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function personName(person) {
  if (!person || typeof person !== 'object') return '';
  return pick(person, 'displayName', 'display_name', 'fullName', 'full_name', 'name') ||
    [pick(person, 'firstName', 'first_name'), pick(person, 'lastName', 'last_name')].filter(Boolean).join(' ');
}

function branchNameFor(id, suppliedName) {
  if (suppliedName) return suppliedName;
  const branch = state.branches.find((item) => String(pick(item, 'id', 'branchId', 'branch_id')) === String(id));
  return branch ? pick(branch, 'name', 'branchName', 'branch_name') : (id ? `Branch ${id}` : '');
}

function normaliseRole(role) {
  return String(role || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function roleLabel(role) {
  return titleCase(String(role || '').replace(/_/g, ' '));
}

function titleCase(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value) {
  return String(value || 'SG').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatLongDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number.isFinite(amount) ? amount : 0);
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateTimeLocal(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function nextHalfHour(offsetMinutes = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30 + offsetMinutes);
  return toDateTimeLocal(date);
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function kebab(value) {
  return String(value).replace(/([a-z])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();
}

function initChatbot() {
  if (!elements.chatToggle) return;

  elements.chatToggle.addEventListener('click', () => {
    elements.chatDrawer.hidden = !elements.chatDrawer.hidden;
    if (!elements.chatDrawer.hidden) {
      elements.chatInput.focus();
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }
  });

  elements.chatClose.addEventListener('click', () => {
    elements.chatDrawer.hidden = true;
  });

  elements.chatMessages.addEventListener('click', (event) => {
    const chip = event.target.closest('.chat-suggestion-chip');
    if (chip) {
      const question = chip.textContent;
      askAssistant(question);
    }
  });

  elements.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = elements.chatInput.value.trim();
    if (!question) return;
    elements.chatInput.value = '';
    askAssistant(question);
  });
}

function askAssistant(message) {
  appendChatMessage(message, 'user');

  const indicator = document.createElement('div');
  indicator.className = 'chat-msg chat-msg--assistant typing-indicator';
  indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  elements.chatMessages.appendChild(indicator);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

  setTimeout(() => {
    indicator.remove();
    const reply = getAssistantReply(message);
    appendChatMessage(reply, 'assistant');
  }, 700 + Math.random() * 400);
}

function appendChatMessage(text, sender) {
  const container = document.createElement('div');
  container.className = `chat-msg chat-msg--${sender}`;
  container.innerHTML = `<p>${escapeHtml(text)}</p>`;
  elements.chatMessages.appendChild(container);
  
  if (sender === 'assistant') {
    const suggestions = document.createElement('div');
    suggestions.className = 'chat-suggestions';
    suggestions.innerHTML = `
      <button class="chat-suggestion-chip" type="button">How do I register a patient?</button>
      <button class="chat-suggestion-chip" type="button">How do I cancel an appointment?</button>
      <button class="chat-suggestion-chip" type="button">Who can record clinical notes?</button>
      <button class="chat-suggestion-chip" type="button">How can I export CSV data?</button>
    `;
    elements.chatMessages.appendChild(suggestions);
  }

  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function getAssistantReply(text) {
  const clean = String(text || '').trim().toLowerCase();
  
  if (clean.includes('register') || clean.includes('patient') && clean.includes('how')) {
    return "To register a patient, click 'Patients' in the sidebar navigation, then click the 'Add patient' button in the top header action. Patient registration is permitted for Receptionists, Branch Managers, and Administrators.";
  }
  if (clean.includes('cancel') || clean.includes('reschedule') || clean.includes('modify') || clean.includes('appointment')) {
    return "To modify or cancel a scheduled booking, go to 'Appointments' from the sidebar and click the 'Modify' button on the appointment row. Note that if you set status to 'Cancelled', a mandatory cancellation reason must be typed.";
  }
  if (clean.includes('clinical') || clean.includes('note') || clean.includes('doctor') || clean.includes('nurse')) {
    return "Clinical progress notes can be appended under the 'Clinical & Labs' view by Doctors and Nurses. SOAP details subjective complaints, objective vitals, assessment (diagnosis), and plan. Nurses can record structured vitals (temp, pulse, BP, resp) using the 'Record vitals / observation' form.";
  }
  if (clean.includes('billing') || clean.includes('invoice') || clean.includes('pay')) {
    return "Billing invoices are managed by Receptionists and Administrators under the 'Billing' panel. Unpaid invoices can be finalized by clicking 'Mark paid' and specifying the transaction type (Cash, Card, Bank Transfer).";
  }
  if (clean.includes('export') || clean.includes('csv')) {
    return "You can backup/export active lists (Patients, Appointments, Stock, Invoices, Audit logs) by clicking the 'Export CSV' button in the search toolbar of their respective pages. It downloads a spreadsheet file immediately.";
  }
  if (clean.includes('print')) {
    return "You can print tax invoices or clinical progress case reports by clicking the 'Print' button next to their list entries. This loads a clean A4 paper template in the system print dialog.";
  }
  if (clean.includes('hello') || clean.includes('hi') || clean.includes('hey') || clean.includes('help')) {
    return "Hello! I am your St George Care Assistant. I am here to help guide you on using this Hospital Management System. Select one of the quick suggestions or ask a question below!";
  }
  
  return "I'm sorry, I didn't quite capture that. Try asking about patient registration, booking appointments, billing/invoices, clinical notes, CSV exports, or select one of the suggested topics below.";
}
