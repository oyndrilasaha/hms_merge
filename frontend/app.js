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
  auditLogs: '/api/audit-logs',
  feedbacks: '/api/feedbacks',
  schedules: '/api/schedules',
  shifts: '/api/shifts',
  purchaseOrders: '/api/purchase-orders',
  notifications: '/api/notifications',
  gatewayPayment: '/api/payments/gateway-process',
  analytics: '/api/reports/analytics',
  beds: '/api/inpatients/beds',
  admissions: '/api/inpatients/admissions',
  breakGlass: '/api/clinical/break-glass',
  adminUsers: '/api/admin/users',
  adminBranches: '/api/admin/branches'
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
  inpatient: {
    eyebrow: 'Ward Management',
    title: 'Inpatient Beds & Admissions',
    description: 'Monitor real-time bed availability, room movements and patient admissions.'
  },
  pharmacy: {
    eyebrow: 'Medication management',
    title: 'Pharmacy & Stock Restocking',
    description: 'Review inventory, record dispensing and issue restocking purchase orders.'
  },
  billing: {
    eyebrow: 'Accounts & Gateway',
    title: 'Billing & Sandboxed Gateway',
    description: 'Create itemised invoices and process secure electronic payments.'
  },
  feedback: {
    eyebrow: 'Patient Relations',
    title: 'Feedback & Sentiment Analysis',
    description: 'Submit customer experience reviews and inspect service quality indices.'
  },
  'my-records': {
    eyebrow: 'Patient Portal',
    title: 'My Health Records',
    description: 'View, download and print your personal medical records, test results and treatment history.'
  },
  'admin-manage': {
    eyebrow: 'Administration',
    title: 'Staff & Branch Governance',
    description: 'Create staff accounts, configure hospital branches, assign roles and schedule shifts.'
  },
  reports: {
    eyebrow: 'Performance Analytics',
    title: 'Reports & Branch Comparison',
    description: 'View daily, weekly, monthly statistics and side-by-side department benchmarks.'
  },
  audit: {
    eyebrow: 'Governance',
    title: 'Audit trail',
    description: 'Review security-relevant activity across the hospital system.'
  }
});

const ROLE_PAGES = Object.freeze({
  admin: ['dashboard', 'patients', 'appointments', 'clinical', 'inpatient', 'pharmacy', 'billing', 'feedback', 'admin-manage', 'reports', 'audit'],
  branch_manager: ['dashboard', 'patients', 'appointments', 'billing', 'feedback', 'reports', 'audit'],
  receptionist: ['dashboard', 'patients', 'appointments', 'billing'],
  doctor: ['dashboard', 'patients', 'appointments', 'clinical', 'inpatient'],
  nurse: ['dashboard', 'patients', 'appointments', 'clinical', 'inpatient', 'pharmacy'],
  lab_technician: ['dashboard', 'patients', 'clinical'],
  pharmacist: ['dashboard', 'patients', 'pharmacy'],
  patient: ['dashboard', 'my-records', 'appointments', 'billing', 'feedback']
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
  markPaid: ['admin', 'receptionist'],
  adminUser: ['admin'],
  adminBranch: ['admin'],
  schedule: ['admin', 'doctor', 'branch_manager'],
  purchaseOrder: ['admin', 'pharmacist', 'branch_manager'],
  admission: ['admin', 'doctor', 'nurse']
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
  myRecords: { notes: [], labOrders: [], invoices: [] },
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
  initPublicSearch();
  await restoreSession();
}

function cacheElements() {
  const ids = [
    'public-portal', 'portal-toggle', 'hero-portal-btn', 'back-to-home', 'public-search', 'search-quick-tags',
    'login-view', 'login-form', 'login-username', 'login-password', 'login-status',
    'toggle-password', 'app-shell', 'menu-toggle', 'sidebar', 'sidebar-scrim',
    'primary-nav', 'bottom-nav', 'network-status', 'install-button', 'branch-select', 'profile-button',
    'profile-menu', 'logout-button', 'user-avatar', 'user-name', 'user-role',
    'main-content', 'page-eyebrow', 'page-title', 'page-description', 'page-actions',
    'page-loading', 'page-content', 'record-dialog', 'record-form', 'dialog-eyebrow',
    'dialog-title', 'dialog-description', 'dialog-fields', 'dialog-status', 'dialog-submit',
    'dialog-close', 'dialog-cancel', 'toast-region',
    'chat-widget', 'chat-toggle', 'chat-drawer', 'chat-close',
    'chat-messages', 'chat-form', 'chat-input',
    'admission-dialog', 'admission-form', 'footer-modal'
  ];
  for (const id of ids) elements[toCamel(id)] = document.getElementById(id);
}

function bindGlobalEvents() {
  elements.portalToggle?.addEventListener('click', () => showLogin());
  elements.heroPortalBtn?.addEventListener('click', () => showLogin());
  elements.backToHome?.addEventListener('click', () => showPublicPortal());
  document.querySelectorAll('.trigger-portal-link').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    showLogin();
  }));
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.togglePassword.addEventListener('click', togglePasswordVisibility);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.profileButton.addEventListener('click', toggleProfileMenu);
  elements.menuToggle.addEventListener('click', toggleSidebar);
  elements.sidebarScrim.addEventListener('click', closeSidebar);
  elements.primaryNav.addEventListener('click', handleNavigation);
  elements.bottomNav?.addEventListener('click', handleNavigation);
  elements.pageActions.addEventListener('click', handleActionClick);
  elements.pageContent.addEventListener('click', handleActionClick);
  elements.pageContent.addEventListener('click', handlePatientPortalClick);
  elements.pageContent.addEventListener('submit', handleFeedbackSubmit);
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

  // Search input Enter-key scroll down
  elements.publicSearch?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Footer directory links interaction
  document.querySelectorAll('[data-info-key]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const key = link.dataset.infoKey;
      if (key === 'online-admission-form') {
        elements.admissionDialog.showModal();
        elements.admissionForm.reset();
        document.getElementById('admission-status').textContent = '';
      } else {
        const info = FOOTER_INFO_DATABASE[key];
        if (info) {
          document.getElementById('footer-modal-category').textContent = info.category;
          document.getElementById('footer-modal-title').textContent = info.title;
          document.getElementById('footer-modal-body').textContent = info.content;
          elements.footerModal.showModal();
        }
      }
    });
  });

  // Admission Dialog controls
  document.getElementById('admission-dialog-close')?.addEventListener('click', () => elements.admissionDialog.close());
  document.getElementById('admission-dialog-cancel')?.addEventListener('click', () => elements.admissionDialog.close());
  elements.admissionForm?.addEventListener('submit', handlePublicAdmissionSubmit);

  // Footer Info Dialog controls
  document.getElementById('footer-modal-close')?.addEventListener('click', () => elements.footerModal.close());
  document.getElementById('footer-modal-ok')?.addEventListener('click', () => elements.footerModal.close());
}

async function restoreSession() {
  setLoginStatus('Checking your secure session…', false);
  try {
    const response = await apiRequest(API_ENDPOINTS.me, { allowUnauthenticated: true });
    applyAuthResponse(response);
    if (!state.user) throw new Error('Session response did not include a user.');
    await enterApplication();
  } catch (error) {
    showPublicPortal();
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
    const totpInput = document.getElementById('login-totp-code');
    const totpToken = totpInput ? totpInput.value.trim() : '';

    const response = await apiRequest(API_ENDPOINTS.login, {
      method: 'POST',
      body: {
        username: elements.loginUsername.value.trim(),
        password: elements.loginPassword.value,
        totpToken
      },
      allowUnauthenticated: true
    });
    const payload = unwrapData(response) || {};
    if (payload.mfaRequired) {
      setLoginStatus('🔑 2FA Required: Please enter your 6-digit authenticator code.', false);
      let totpContainer = document.getElementById('mfa-login-container');
      if (!totpContainer) {
        totpContainer = document.createElement('div');
        totpContainer.id = 'mfa-login-container';
        totpContainer.style.marginTop = '12px';
        totpContainer.innerHTML = `
          <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--ink-soft);">6-Digit Authenticator Code (2FA)</label>
          <input type="text" id="login-totp-code" name="totpToken" placeholder="123456" maxlength="6" style="width:100%;padding:10px;font-size:1.1rem;letter-spacing:4px;text-align:center;border-radius:6px;border:1px solid var(--teal-500);" required autofocus>
        `;
        form.insertBefore(totpContainer, submitButton.parentNode);
      }
      document.getElementById('login-totp-code').focus();
      return;
    }

    applyAuthResponse(response);
    if (!state.user) throw new Error('Login succeeded but no user profile was returned.');
    elements.loginPassword.value = '';
    const codeInp = document.getElementById('login-totp-code');
    if (codeInp) codeInp.value = '';
    await enterApplication();
  } catch (error) {
    setLoginStatus(error.status === 401 ? (error.message || 'The username or password is incorrect.') : error.message, true);
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

function showPublicPortal() {
  elements.appShell.hidden = true;
  elements.loginView.hidden = true;
  if (elements.publicPortal) elements.publicPortal.hidden = false;
}

function showLogin(message = '') {
  state.user = null;
  state.csrfToken = '';
  state.role = '';
  elements.appShell.hidden = true;
  if (elements.publicPortal) elements.publicPortal.hidden = true;
  elements.loginView.hidden = false;
  setLoginStatus(message, Boolean(message));
  requestAnimationFrame(() => elements.loginUsername.focus());
}

async function enterApplication() {
  if (elements.publicPortal) elements.publicPortal.hidden = true;
  elements.loginView.hidden = true;
  elements.appShell.hidden = false;
  updateUserInterface();
  await loadReferenceData();
  const hashPage = window.location.hash.replace('#', '');
  const initialPage = getAllowedPages().includes(hashPage) ? hashPage : 'dashboard';
  navigateTo(initialPage, { updateHash: true, focus: false });
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
    showPublicPortal();
    showToast('You have signed out securely.', 'info');
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

  // Apply visual Phone Frame mockup container wrapper for mobile roles
  const isMobileRole = !['admin', 'branch_manager'].includes(state.role);
  if (isMobileRole) {
    elements.appShell.classList.add('app-shell--phone-frame');
    if (elements.bottomNav) elements.bottomNav.hidden = false;
    if (elements.sidebar) elements.sidebar.hidden = true;
    renderBottomNav();
  } else {
    elements.appShell.classList.remove('app-shell--phone-frame');
    if (elements.bottomNav) elements.bottomNav.hidden = true;
    if (elements.sidebar) elements.sidebar.hidden = false;
  }
}

function renderBottomNav() {
  const allowedPages = getAllowedPages();
  const bottomNav = elements.bottomNav;
  if (!bottomNav) return;

  const pageIcons = {
    dashboard: '#icon-grid',
    patients: '#icon-users',
    appointments: '#icon-calendar',
    clinical: '#icon-clinical',
    pharmacy: '#icon-pill',
    billing: '#icon-receipt'
  };

  const pageLabels = {
    dashboard: 'Dashboard',
    patients: 'Patients',
    appointments: 'Appts',
    clinical: 'Clinical',
    pharmacy: 'Pharmacy',
    billing: 'Billing'
  };

  const html = allowedPages.map(page => {
    if (!pageIcons[page]) return '';
    const icon = pageIcons[page];
    const label = pageLabels[page];
    const activeClass = state.activePage === page ? 'bottom-nav-item--active' : '';
    return `<button class="bottom-nav-item ${activeClass}" type="button" data-page="${page}">
      <svg aria-hidden="true"><use href="${icon}"></use></svg>
      <span>${escapeHtml(label)}</span>
    </button>`;
  }).join('');

  bottomNav.innerHTML = html;
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
  if (elements.bottomNav) {
    for (const item of elements.bottomNav.querySelectorAll('[data-page]')) {
      if (item.dataset.page === page) item.classList.add('bottom-nav-item--active');
      else item.classList.remove('bottom-nav-item--active');
    }
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
  if (page === 'inpatient' && canUseForm('admission')) actions.push(actionButton('admission', 'Admit Patient'));
  if (page === 'pharmacy') {
    if (canUseForm('dispense')) actions.push(actionButton('dispense', 'Dispense medication'));
    if (canUseForm('purchaseOrder')) actions.push(actionButton('purchaseOrder', 'Create Restock PO', false));
  }
  if (page === 'billing' && canUseForm('invoice')) actions.push(actionButton('invoice', 'Create invoice'));
  if (page === 'admin-manage') {
    if (canUseForm('adminUser')) actions.push(actionButton('adminUser', 'Add Staff Account'));
    if (canUseForm('adminBranch')) actions.push(actionButton('adminBranch', 'Add Branch', false));
  }
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
      const sched = await apiRequest(API_ENDPOINTS.schedules);
      state.schedules = collectionFrom(sched, ['schedules', 'items']);
    } else if (page === 'clinical') {
      const [notes, labs] = await Promise.all([
        apiRequest(`${API_ENDPOINTS.clinicalNotes}${branchQuery}`),
        apiRequest(`${API_ENDPOINTS.labOrders}${branchQuery}`)
      ]);
      state.clinicalNotes = collectionFrom(notes, ['clinicalNotes', 'clinical_notes', 'notes']);
      state.labOrders = collectionFrom(labs, ['labOrders', 'lab_orders', 'orders']);
    } else if (page === 'inpatient') {
      const [beds, admissions] = await Promise.all([
        apiRequest(API_ENDPOINTS.beds),
        apiRequest(API_ENDPOINTS.admissions)
      ]);
      state.beds = collectionFrom(beds, ['beds', 'items']);
      state.admissions = collectionFrom(admissions, ['admissions', 'items']);
    } else if (page === 'pharmacy') {
      const [meds, pos] = await Promise.all([
        apiRequest(`${API_ENDPOINTS.medications}${branchQuery}`),
        apiRequest(API_ENDPOINTS.purchaseOrders)
      ]);
      state.medications = collectionFrom(meds, ['medications', 'inventory']);
      state.purchaseOrders = collectionFrom(pos, ['purchaseOrders', 'items']);
    } else if (page === 'billing') {
      state.invoices = collectionFrom(await apiRequest(`${API_ENDPOINTS.invoices}${branchQuery}`), ['invoices']);
    } else if (page === 'my-records') {
      const [notes, labs, bills] = await Promise.all([
        apiRequest(API_ENDPOINTS.clinicalNotes),
        apiRequest(API_ENDPOINTS.labOrders),
        apiRequest(API_ENDPOINTS.invoices)
      ]);
      state.myRecords = {
        notes: collectionFrom(notes, ['clinicalNotes', 'clinical_notes', 'notes']),
        labOrders: collectionFrom(labs, ['labOrders', 'lab_orders', 'orders']),
        invoices: collectionFrom(bills, ['invoices'])
      };
    } else if (page === 'admin-manage') {
      const [u, b, s, sh] = await Promise.all([
        apiRequest(API_ENDPOINTS.users),
        apiRequest(API_ENDPOINTS.branches),
        apiRequest(API_ENDPOINTS.schedules),
        apiRequest(API_ENDPOINTS.shifts)
      ]);
      state.users = collectionFrom(u, ['users', 'items']);
      state.branchesList = collectionFrom(b, ['branches', 'items']);
      state.schedules = collectionFrom(s, ['schedules', 'items']);
      state.shifts = collectionFrom(sh, ['shifts', 'items']);
    } else if (page === 'reports') {
      const analytics = await apiRequest(API_ENDPOINTS.analytics);
      state.analytics = unwrapData(analytics) || {};
    } else if (page === 'feedback') {
      state.feedbacks = ['admin', 'branch_manager'].includes(state.role) 
        ? collectionFrom(await apiRequest(API_ENDPOINTS.feedbacks), ['feedbacks', 'items'])
        : [];
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
    inpatient: renderInpatient,
    pharmacy: renderPharmacy,
    billing: renderBilling,
    feedback: renderFeedback,
    'my-records': renderMyRecords,
    'admin-manage': renderAdminManage,
    reports: renderReports,
    audit: renderAudit
  };
  elements.pageContent.innerHTML = renderers[state.activePage] ? renderers[state.activePage]() : errorState('Page not found');
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
  </div>
  ${renderSteganographyPanel()}`;
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
    if (!['paid', 'void'].includes(status)) {
      if (canUseForm('markPaid')) {
        actions.push(`<button class="table-action" type="button" data-open-form="markPaid" data-record-id="${escapeAttribute(id)}" data-record-label="${escapeAttribute(String(number))}" data-balance-cents="${escapeAttribute(balanceCents)}">Mark paid</button>`);
      }
      actions.push(`<button class="table-action" type="button" onclick="openGatewayModal(${id}, ${balanceCents}, '${escapeAttribute(String(number))}')">⚡ Gateway</button>`);
    }
    actions.push(`<button class="table-action" type="button" data-print-invoice="${id}">Print</button>`);
    const actionsCell = `<td><div class="row-actions">${actions.join(' ')}</div></td>`;

    return `<tr data-filter-row data-status="${escapeAttribute(status)}" data-search="${escapeAttribute(`${number} ${patient} ${description}`.toLowerCase())}"><td><span class="cell-primary"><strong>${escapeHtml(String(number))}</strong><small>${escapeHtml(description)}</small></span></td><td>${escapeHtml(patient)}</td><td><strong>${formatCurrency(displayAmount)}</strong></td><td>${escapeHtml(formatDate(issuedAt))}</td><td><span class="status-badge status-badge--${escapeAttribute(kebab(status))}">${escapeHtml(titleCase(status))}</span></td>${actionsCell}</tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Patient</th><th scope="col">Amount</th><th scope="col">Issued</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

window.openGatewayModal = function(invoiceId, balanceCents, invoiceNum) {
  const modal = document.createElement('dialog');
  modal.className = 'record-dialog';
  modal.innerHTML = `
    <div class="dialog-content" style="max-width:440px;padding:24px;">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">SANDBOXED PAYMENT GATEWAY (FR40, FR64)</p>
          <h2 style="font-size:1.2rem;">Pay Invoice #${escapeHtml(invoiceNum)}</h2>
          <p style="font-size:0.8rem;color:var(--ink-soft);">Amount due: <strong>${formatCurrency(balanceCents / 100)}</strong></p>
        </div>
      </header>
      <form id="gateway-pay-form" style="display:grid;gap:12px;margin-top:16px;">
        <label>Payment Method
          <select name="method" required style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;">
            <option value="Card">Credit / Debit Card</option>
            <option value="Medicare">Medicare / Bulk Bill</option>
            <option value="Bank Transfer">Direct EFT Transfer</option>
          </select>
        </label>
        <label>Card Number / Medicare No.
          <input type="text" name="cardNumber" required placeholder="4242 •••• •••• 4242" value="4242424242424242" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;">
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label>Expiry<input type="text" placeholder="12/28" value="12/28" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;"></label>
          <label>CVV<input type="text" placeholder="123" value="123" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;"></label>
        </div>
        <p style="font-size:0.75rem;color:var(--teal-700);">🔒 Payment tokenized via Secure Sandbox Gateway. Card details are never stored.</p>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button type="button" class="button button--secondary" onclick="this.closest('dialog').close()">Cancel</button>
          <button type="submit" class="button button--primary">Process Payment</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.showModal();

  modal.querySelector('#gateway-pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Processing...';
    try {
      const res = await apiRequest('/api/payments/gateway-process', {
        method: 'POST',
        body: {
          invoiceId,
          amountCents: balanceCents,
          method: e.target.method.value,
          cardNumber: e.target.cardNumber.value
        }
      });
      modal.close();
      modal.remove();
      showToast('Payment processed via gateway! Reference: ' + res.gatewayReference);
      loadPage(state.activePage);
    } catch (err) {
      alert('Gateway Payment Error: ' + err.message);
      btn.disabled = false;
      btn.innerText = 'Process Payment';
    }
  });
};

function renderMyRecords() {
  const { notes, labOrders, invoices } = state.myRecords || { notes: [], labOrders: [], invoices: [] };
  const user = state.user || {};
  const fullName = user.fullName || user.full_name || user.name || 'Patient';
  const email = user.email || '';

  function sectionHeader(title, subtitle, printFn, dlFn) {
    return `
      <header class="panel-header" style="padding-bottom:12px;margin-bottom:0;">
        <div><h2 style="font-size:1rem;">${escapeHtml(title)}</h2><p style="font-size:0.75rem;">${escapeHtml(subtitle)}</p></div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="button button--quiet button--small" type="button" data-portal-fn="${printFn}">
            <svg aria-hidden="true" style="width:13px;height:13px;fill:currentColor;margin-right:4px;"><use href="#icon-clinical"></use></svg>Print
          </button>
          <button class="button button--secondary button--small" type="button" data-portal-fn="${dlFn}">
            <svg aria-hidden="true" style="width:13px;height:13px;fill:currentColor;margin-right:4px;"><use href="#icon-download"></use></svg>Download
          </button>
        </div>
      </header>`;
  }

  const noteRows = notes.length ? notes.map(n => {
    const type = pick(n,'noteType','note_type') || 'Note';
    const clinician = pick(n,'clinicianName','clinician_name') || personName(n.clinician) || 'Clinician';
    const content = pick(n,'content','body','text') || '';
    const date = pick(n,'createdAt','created_at','recordedAt');
    return `<tr><td><span class="cell-primary"><strong>${escapeHtml(titleCase(type))}</strong><small>${escapeHtml(formatDate(date))}</small></span></td><td>${escapeHtml(clinician)}</td><td style="white-space:normal;max-width:340px;line-height:1.5;">${escapeHtml(content)}</td></tr>`;
  }).join('') : `<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--ink-soft);">No clinical notes recorded yet.</td></tr>`;

  const labRows = labOrders.length ? labOrders.map(l => {
    const test = pick(l,'testName','test_name') || 'Lab Test';
    const status = pick(l,'status') || 'Pending';
    const result = pick(l,'resultSummary','result_summary','result') || '—';
    const date = pick(l,'createdAt','created_at','orderedAt');
    const badge = status === 'Completed' ? 'status-badge--success' : (status === 'Cancelled' ? 'status-badge--danger' : 'status-badge--active');
    return `<tr><td><strong>${escapeHtml(test)}</strong></td><td><span class="status-badge ${badge}">${escapeHtml(status)}</span></td><td style="max-width:280px;white-space:normal;">${escapeHtml(result)}</td><td>${escapeHtml(formatDate(date))}</td></tr>`;
  }).join('') : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--ink-soft);">No lab orders found.</td></tr>`;

  const invoiceRows = invoices.length ? invoices.map(inv => {
    const num = String(pick(inv,'invoiceNumber','invoice_number') || inv.id);
    const desc = pick(inv,'description') || 'Medical service';
    const total = pick(inv,'totalCents','total_cents','total') || 0;
    const status = pick(inv,'status') || 'Issued';
    const date = pick(inv,'issuedAt','issued_at','createdAt');
    const badge = status === 'Paid' ? 'status-badge--success' : (status === 'Overdue' ? 'status-badge--danger' : 'status-badge--active');
    return `<tr>
      <td><strong>${escapeHtml(num)}</strong><br><small>${escapeHtml(desc)}</small></td>
      <td><strong>${formatCurrency(total)}</strong></td>
      <td><span class="status-badge ${badge}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(formatDate(date))}</td>
      <td><button class="button button--quiet button--small" type="button" data-print-cert="${escapeAttribute(num)}">🖨&nbsp;Certificate</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-soft);">No invoices found.</td></tr>`;

  return `
    <div class="metric-grid" style="margin-bottom:20px;">
      <article class="metric-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:18px;padding:20px 24px;">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--teal-700),var(--teal-500));display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:800;color:#fff;flex-shrink:0;">${escapeHtml(fullName.slice(0,2).toUpperCase())}</div>
        <div style="flex:1;min-width:0;"><strong style="font-size:1.05rem;display:block;">${escapeHtml(fullName)}</strong><span style="font-size:0.78rem;color:var(--ink-soft);">${escapeHtml(email)}</span></div>
        <div style="display:flex;gap:10px;flex-shrink:0;">
          <button class="button button--secondary" type="button" data-portal-fn="printSectionById:rec-clinical-notes">
            <svg aria-hidden="true" style="width:14px;height:14px;fill:currentColor;"><use href="#icon-clinical"></use></svg> Print Full Summary
          </button>
          <button class="button button--primary" type="button" data-portal-fn="downloadFullSummary">
            <svg aria-hidden="true" style="width:14px;height:14px;fill:currentColor;"><use href="#icon-download"></use></svg> Download Records
          </button>
        </div>
      </article>
    </div>

    <section class="panel rise" style="margin-bottom:16px;">
      ${sectionHeader('Clinical Notes','Consultation notes from your treating clinicians.','printSectionById:rec-clinical-notes','downloadCSVById:rec-clinical-notes:my_clinical_notes')}
      <div class="table-scroll" id="rec-clinical-notes">
        <table class="data-table"><thead><tr><th scope="col">Type</th><th scope="col">Clinician</th><th scope="col">Notes</th></tr></thead>
        <tbody>${noteRows}</tbody></table>
      </div>
    </section>

    <section class="panel rise" style="margin-bottom:16px;">
      ${sectionHeader('Diagnostic Test Results','Laboratory orders requested during your care.','printSectionById:rec-lab-results','downloadCSVById:rec-lab-results:my_lab_results')}
      <div class="table-scroll" id="rec-lab-results">
        <table class="data-table"><thead><tr><th scope="col">Test</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col">Date</th></tr></thead>
        <tbody>${labRows}</tbody></table>
      </div>
    </section>

    <section class="panel rise" style="margin-bottom:16px;">
      ${sectionHeader('Billing & Payment Records','Invoices and official payment certificates.','printSectionById:rec-billing','downloadCSVById:rec-billing:my_billing')}
      <div class="table-scroll" id="rec-billing">
        <table class="data-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col">Certificate</th></tr></thead>
        <tbody>${invoiceRows}</tbody></table>
      </div>
    </section>
  `;
}

function handlePatientPortalClick(event) {
  const btn = event.target.closest('[data-portal-fn]');
  const cert = event.target.closest('[data-print-cert]');

  if (btn) {
    const fn = btn.dataset.portalFn;
    if (fn === 'downloadFullSummary') {
      patientPortal.downloadFullSummary();
    } else if (fn.startsWith('printSectionById:')) {
      patientPortal.printSection(fn.split(':')[1]);
    } else if (fn.startsWith('downloadCSVById:')) {
      const [, tableId, filename] = fn.split(':');
      patientPortal.downloadCSV(tableId, filename);
    }
  }
  if (cert) {
    patientPortal.printCertificate(cert.dataset.printCert);
  }
}

const patientPortal = {
  printSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const user = state.user || {};
    const name = user.fullName || user.full_name || user.name || 'Patient';
    const win = window.open('', '_blank', 'width=820,height=620');
    win.document.write(`<!DOCTYPE html><html><head><title>St George HMS – Medical Record</title><style>body{font-family:Arial,sans-serif;font-size:13px;margin:36px;color:#1a1a1a}h1{font-size:18px;margin-bottom:4px;color:#0b5f66}.meta{color:#555;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{background:#0b5f66;color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{border-bottom:1px solid #e0e0e0;padding:7px 10px;vertical-align:top}.footer{margin-top:28px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px}</style></head><body><h1>St George Hospital Management System</h1><div class="meta">Patient: <strong>${name}</strong> &nbsp;|&nbsp; Printed: ${new Date().toLocaleString('en-AU')}</div>${el.innerHTML}<div class="footer">Personal use only. © St George Hospital NSW. Training environment — synthetic data.</div></body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300);
  },

  downloadCSV(tableId, filename) {
    const table = document.querySelector('#' + tableId + ' table');
    if (!table) return;
    const csv = Array.from(table.querySelectorAll('tr')).map(r =>
      Array.from(r.querySelectorAll('th,td')).map(c => '"' + c.innerText.replace(/"/g, '""').replace(/\n/g, ' ') + '"').join(',')
    ).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
  },

  downloadFullSummary() {
    const user = state.user || {};
    const name = user.fullName || user.full_name || user.name || 'Patient';
    const { notes, labOrders, invoices } = state.myRecords || {};
    let csv = 'St George Hospital – Full Medical Summary\nPatient: ' + name + '\nExported: ' + new Date().toLocaleString('en-AU') + '\n\nCLINICAL NOTES\n"Type","Clinician","Notes","Date"\n';
    (notes || []).forEach(n => { csv += '"' + (pick(n,'noteType','note_type')||'') + '","' + (pick(n,'clinicianName','clinician_name')||'') + '","' + (pick(n,'content','body','text')||'').replace(/"/g,'""') + '","' + formatDate(pick(n,'createdAt','created_at')) + '"\n'; });
    csv += '\nLAB RESULTS\n"Test","Status","Result","Date"\n';
    (labOrders || []).forEach(l => { csv += '"' + (pick(l,'testName','test_name')||'') + '","' + (pick(l,'status')||'') + '","' + (pick(l,'resultSummary','result_summary','result')||'').replace(/"/g,'""') + '","' + formatDate(pick(l,'createdAt','created_at')) + '"\n'; });
    csv += '\nBILLING\n"Invoice","Description","Amount","Status","Date"\n';
    (invoices || []).forEach(i => { csv += '"' + (pick(i,'invoiceNumber','invoice_number')||'') + '","' + (pick(i,'description')||'') + '","' + formatCurrency(pick(i,'totalCents','total_cents','total')||0) + '","' + (pick(i,'status')||'') + '","' + formatDate(pick(i,'issuedAt','issued_at','createdAt')) + '"\n'; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'medical_summary_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
  },

  printCertificate(invoiceNum) {
    const { invoices } = state.myRecords || {};
    const inv = (invoices || []).find(i => String(pick(i,'invoiceNumber','invoice_number') || i.id) === String(invoiceNum));
    const user = state.user || {};
    const name = user.fullName || user.full_name || user.name || 'Patient';
    const amount = inv ? formatCurrency(pick(inv,'totalCents','total_cents','total') || 0) : '—';
    const status = inv ? (pick(inv,'status') || '—') : '—';
    const desc = inv ? (pick(inv,'description') || '—') : '—';
    const date = inv ? formatDate(pick(inv,'issuedAt','issued_at','createdAt')) : '—';
    const win = window.open('', '_blank', 'width=680,height=520');
    win.document.write(`<!DOCTYPE html><html><head><title>Payment Certificate – ${invoiceNum}</title><style>body{font-family:Arial,sans-serif;margin:48px;color:#1a1a1a}.hdr{border-bottom:3px solid #0b5f66;padding-bottom:14px;margin-bottom:24px}.hdr h1{font-size:20px;color:#0b5f66;margin:0 0 4px}.hdr p{margin:0;font-size:12px;color:#555}.cert{border:1px solid #cde4e1;border-radius:8px;padding:24px;background:#f0fdfa}.cert h2{font-size:15px;margin:0 0 14px;color:#0b5f66}.row{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px dashed #ddd}.row:last-child{border-bottom:none}.lbl{color:#555}.val{font-weight:700}.ftr{margin-top:28px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px}.stamp{margin-top:20px;text-align:right;font-size:11px;color:#0b5f66;font-weight:bold}</style></head><body><div class="hdr"><h1>St George Hospital Management System</h1><p>Official Payment &amp; Service Certificate | NSW Health Training Environment</p></div><div class="cert"><h2>PAYMENT CERTIFICATE</h2><div class="row"><span class="lbl">Patient Name</span><span class="val">${name}</span></div><div class="row"><span class="lbl">Invoice Number</span><span class="val">${invoiceNum}</span></div><div class="row"><span class="lbl">Service Description</span><span class="val">${desc}</span></div><div class="row"><span class="lbl">Amount</span><span class="val">${amount}</span></div><div class="row"><span class="lbl">Payment Status</span><span class="val">${status}</span></div><div class="row"><span class="lbl">Invoice Date</span><span class="val">${date}</span></div><div class="row"><span class="lbl">Issued By</span><span class="val">St George Hospital, Kogarah NSW</span></div></div><div class="stamp">✓ Verified — St George Hospital Accounts Department</div><div class="ftr">For personal records only. © St George Hospital NSW. Training data only.</div></body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300);
  }
};

function renderFeedback() {
  if (state.role === 'patient') {
    return `
      <div class="split-grid rise" style="grid-template-columns: 1fr;">
        <section class="panel">
          <header class="panel-header">
            <div>
              <h2>Patient Experience Feedback</h2>
              <p>Share your thoughts about your visit to help us improve St George care services.</p>
            </div>
          </header>
          <div class="panel-body">
            <form id="feedback-form" style="display: grid; gap: 16px;">
              <div class="form-field form-field--wide">
                <label for="feedback-comments" style="font-weight: 700; font-size: 0.82rem;">Your comments <span class="required-mark">*</span></label>
                <textarea id="feedback-comments" name="comments" rows="6" required placeholder="Describe your experience with our clinics, doctors, pharmacists, or scheduling..." style="width:100%; border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-family: inherit; font-size: 0.85rem; resize: vertical; outline: none;"></textarea>
                <p class="field-hint">Your feedback will be processed dynamically for sentiment scoring to monitor service standards.</p>
              </div>
              <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px;">
                <button class="button button--primary" type="submit" id="feedback-submit">
                  Submit feedback
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  const feedbacks = state.feedbacks || [];
  const positive = feedbacks.filter(f => f.sentiment === 'Positive').length;
  const negative = feedbacks.filter(f => f.sentiment === 'Negative').length;
  const neutral = feedbacks.filter(f => f.sentiment === 'Neutral').length;
  const total = feedbacks.length;
  
  const positivePct = total ? Math.round((positive / total) * 100) : 0;
  const negativePct = total ? Math.round((negative / total) * 100) : 0;
  const neutralPct = total ? Math.round((neutral / total) * 100) : 0;

  let insights = 'No feedbacks collected yet to compile insights.';
  if (total > 0) {
    const dominant = positive >= Math.max(negative, neutral) 
      ? 'Positive' 
      : (negative >= Math.max(positive, neutral) ? 'Negative' : 'Neutral');
    
    let advice = '';
    if (dominant === 'Positive') {
      advice = 'Patient satisfaction is currently high. Continue reinforcing staff recognition and clinical care standards.';
    } else if (dominant === 'Negative') {
      advice = 'Service quality alerts triggered. Investigate clinic wait times and staff response coordinates.';
    } else {
      advice = 'Patient sentiment is neutral. Monitor clinical flow patterns to boost experience parameters.';
    }

    insights = `<strong>AI-Generated Summary:</strong> Patient experience metrics compile a total of <strong>${total}</strong> reviews. Sentiment distribution indexes at <strong>${positivePct}% Positive</strong>, <strong>${neutralPct}% Neutral</strong>, and <strong>${negativePct}% Negative</strong>. The dominant patient sentiment is <strong>${dominant}</strong>. <br/><span style="display:block; margin-top:8px; color:var(--teal-800); font-weight: 600;">${advice}</span>`;
  }

  const rows = feedbacks.map(f => {
    const date = f.createdAt || f.created_at;
    const name = f.firstName ? `${f.firstName} ${f.lastName}` : 'Anonymous Patient';
    const mrn = f.medicalRecordNumber || '—';
    const comments = f.comments;
    const sentiment = f.sentiment;

    let badgeClass = 'status-badge--active';
    if (sentiment === 'Positive') badgeClass = 'status-badge--success';
    else if (sentiment === 'Negative') badgeClass = 'status-badge--danger';

    return `
      <tr>
        <td>
          <span class="cell-primary">
            <strong>${escapeHtml(name)}</strong>
            <small>MRN: ${escapeHtml(mrn)}</small>
          </span>
        </td>
        <td style="white-space: normal; line-height: 1.4; max-width: 400px;">${escapeHtml(comments)}</td>
        <td><span class="status-badge ${badgeClass}">${escapeHtml(sentiment)}</span></td>
        <td>${escapeHtml(formatDate(date))}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="split-grid rise">
      <section class="panel" style="grid-column: 1 / -1; background: #f0fdfa; border-color: #cde4e1;">
        <header class="panel-header" style="border-bottom-color: #cde4e1;">
          <div>
            <h2 style="color: var(--teal-950); display: flex; align-items: center; gap: 8px;">
              <svg aria-hidden="true" style="width:16px; height:16px; fill:var(--teal-700);"><use href="#icon-comments"></use></svg>
              AI-Generated Report Insights
            </h2>
            <p style="color: var(--teal-800);">Automated natural language summaries of monthly experience reports.</p>
          </div>
        </header>
        <div class="panel-body" style="font-size: 0.85rem; color: #1e3a37; line-height: 1.5;">
          ${insights}
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2>Service Quality Sentiment Breakdown</h2>
            <p>Sentiment distribution index derived from patient comments.</p>
          </div>
        </header>
        <div class="panel-body" style="display: grid; gap: 14px;">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 4px;">
              <span>Positive (${positive} reviews)</span>
              <span style="color: #15803d;">${positivePct}%</span>
            </div>
            <div style="background: #e2e8f0; height: 10px; border-radius: 99px; overflow: hidden;">
              <div style="background: #15803d; width: ${positivePct}%; height: 100%;"></div>
            </div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 4px;">
              <span>Neutral (${neutral} reviews)</span>
              <span style="color: #64748b;">${neutralPct}%</span>
            </div>
            <div style="background: #e2e8f0; height: 10px; border-radius: 99px; overflow: hidden;">
              <div style="background: #64748b; width: ${neutralPct}%; height: 100%;"></div>
            </div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 4px;">
              <span>Negative (${negative} reviews)</span>
              <span style="color: #b91c1c;">${negativePct}%</span>
            </div>
            <div style="background: #e2e8f0; height: 10px; border-radius: 99px; overflow: hidden;">
              <div style="background: #b91c1c; width: ${negativePct}%; height: 100%;"></div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2>Active Patient Feedback Log</h2>
            <p>Direct service comments from patient portals.</p>
          </div>
        </header>
        <div class="panel-body" style="padding:0;">
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Comments</th>
                  <th scope="col">Sentiment</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                ${feedbacks.length ? rows : `<tr><td colspan="4" style="text-align:center; padding: 24px; color: var(--ink-soft);">No patient experience records collected yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function handleFeedbackSubmit(event) {
  if (event.target.id !== 'feedback-form') return;
  event.preventDefault();

  const submitButton = document.getElementById('feedback-submit');
  const commentsArea = document.getElementById('feedback-comments');
  if (!commentsArea || !submitButton) return;

  setButtonBusy(submitButton, true);
  try {
    const response = await apiRequest(API_ENDPOINTS.feedbacks, {
      method: 'POST',
      body: JSON.stringify({ comments: commentsArea.value })
    });
    
    const result = unwrapData(response) || {};
    showToast(`Feedback submitted successfully! Sentiment analyzed as: ${result.sentiment}`, 'success');
    commentsArea.value = '';
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function renderAudit() {
  return `${tableToolbar('audit', 'Search actor, action, entity or identifier', true)}
    <section class="table-panel" data-testid="audit-logs-table">
      ${state.auditLogs.length ? `<div class="table-scroll">${auditTable(state.auditLogs)}</div>` : emptyState('shield', 'No audit events found', 'Security-relevant actions will appear here as the system is used.')}
    </section>`;
}

// ---- Admin User & Branch Governance Renderer (FR5, FR6, FR8, FR21) ----
function renderAdminManage() {
  const users = state.users || [];
  const branches = state.branchesList || [];
  const schedules = state.schedules || [];

  const userRows = users.length ? users.map(u => {
    return `<tr>
      <td><strong>${escapeHtml(u.fullName)}</strong><br><small>${escapeHtml(u.email || '')}</small></td>
      <td><span class="status-badge status-badge--active">${escapeHtml(u.role)}</span></td>
      <td>${escapeHtml(u.branchName || 'All Branches')}</td>
      <td>${escapeHtml(u.specialisation || 'General')}</td>
      <td><span class="status-badge ${u.active ? 'status-badge--success' : 'status-badge--danger'}">${u.active ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-soft);">No staff users loaded.</td></tr>`;

  const branchRows = branches.length ? branches.map(b => {
    return `<tr>
      <td><strong>${escapeHtml(b.code)}</strong></td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.address)}</td>
      <td>${escapeHtml(b.phone)}</td>
      <td><span class="status-badge status-badge--success">Active</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-soft);">No branches loaded.</td></tr>`;

  const scheduleRows = schedules.length ? schedules.map(s => {
    return `<tr>
      <td><strong>${escapeHtml(s.doctorName || 'Doctor')}</strong></td>
      <td>${escapeHtml(s.branchName || 'Branch')}</td>
      <td><span class="status-badge status-badge--active">${escapeHtml(s.dayOfWeek)}</span></td>
      <td>${escapeHtml(s.startTime)} – ${escapeHtml(s.endTime)}</td>
      <td>${escapeHtml(String(s.slotDurationMins || 30))} mins</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-soft);">No clinician schedules set.</td></tr>`;

  return `
    <div class="split-grid rise" style="grid-template-columns: 1fr;">
      <!-- Staff Accounts -->
      <section class="panel">
        <header class="panel-header">
          <div><h2>Staff &amp; Clinician Roster (FR5, FR8, FR21)</h2><p>Manage system users, role-based access, and branch assignments.</p></div>
          <div style="display:flex;gap:8px;">
            <button class="button button--secondary button--small" type="button" onclick="openMfaSetupModal()">🔑 Configure 2FA (FR50)</button>
            <button class="button button--primary button--small" type="button" data-open-form="adminUser">+ Add Staff Account</button>
          </div>
        </header>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Staff Member</th><th>Role</th><th>Branch</th><th>Specialisation</th><th>Status</th></tr></thead><tbody>${userRows}</tbody></table></div>
      </section>

      <!-- Duplicate Patient Merging Wizard (FR62) -->
      <section class="panel" style="margin-top:20px;">
        <header class="panel-header">
          <div><h2>Fuzzy Duplicate Patient Review &amp; Merging Wizard (FR62)</h2><p>Identify potential duplicate patient registrations and merge clinical records.</p></div>
          <button class="button button--quiet button--small" type="button" onclick="loadDuplicatePatientsWizard()">🔍 Scan Duplicates</button>
        </header>
        <div id="duplicate-patients-container" style="padding:16px;">
          <p style="color:var(--ink-soft);font-size:0.85rem;">Click "Scan Duplicates" to inspect matching patient records across branches.</p>
        </div>
      </section>

      <!-- Hospital Branches -->
      <section class="panel" style="margin-top:20px;">
        <header class="panel-header">
          <div><h2>Hospital Branches (FR6)</h2><p>Configure hospital branches, locations, and departments.</p></div>
          <button class="button button--secondary button--small" type="button" data-open-form="adminBranch">+ Add Branch</button>
        </header>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Code</th><th>Branch Name</th><th>Address</th><th>Phone</th><th>Status</th></tr></thead><tbody>${branchRows}</tbody></table></div>
      </section>

      <!-- Clinician Schedules -->
      <section class="panel" style="margin-top:20px;">
        <header class="panel-header">
          <div><h2>Doctor Availability Schedules (FR17, FR22)</h2><p>Configured consultation hours and time slots by doctor and branch.</p></div>
          <button class="button button--quiet button--small" type="button" data-open-form="schedule">+ Set Schedule</button>
        </header>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Clinician</th><th>Branch</th><th>Day</th><th>Hours</th><th>Slot Duration</th></tr></thead><tbody>${scheduleRows}</tbody></table></div>
      </section>
    </div>
  `;
}

// ---- Reports & Analytics Renderer (FR41, FR42, FR44) ----
function renderReports() {
  const analytics = state.analytics || {};
  const totals = analytics.totals || { patients: 0, appointments: 0, revenueCents: 0, labOrders: 0 };
  const comparison = analytics.branchComparison || [];

  const comparisonRows = comparison.length ? comparison.map(c => {
    const rev = formatCurrency(c.revenueCents || 0);
    return `<tr>
      <td><strong>${escapeHtml(c.name)} (${escapeHtml(c.code)})</strong></td>
      <td>${escapeHtml(String(c.patientCount || 0))}</td>
      <td>${escapeHtml(String(c.appointmentCount || 0))}</td>
      <td><strong>${rev}</strong></td>
    </tr>`;
  }).join('') : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--ink-soft);">No comparison data available.</td></tr>`;

  return `
    <div class="metric-grid" style="margin-bottom:20px;">
      <article class="metric-card"><span>Total Registered Patients</span><strong>${escapeHtml(String(totals.patients))}</strong></article>
      <article class="metric-card"><span>Total Appointments</span><strong>${escapeHtml(String(totals.appointments))}</strong></article>
      <article class="metric-card"><span>Total Collected Revenue</span><strong>${formatCurrency(totals.revenueCents || 0)}</strong></article>
      <article class="metric-card"><span>Total Lab Orders</span><strong>${escapeHtml(String(totals.labOrders))}</strong></article>
    </div>

    <section class="panel rise" style="margin-bottom:20px;">
      <header class="panel-header">
        <div><h2>Branch &amp; Department Performance Benchmark (FR44)</h2><p>Side-by-side comparison of active branch operational metrics.</p></div>
        <div style="display:flex;gap:8px;">
          <button class="button button--secondary button--small" type="button" onclick="window.print()">🖨 Export PDF Report (FR42)</button>
        </div>
      </header>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Branch</th><th>Patients</th><th>Appointments</th><th>Revenue Collected</th></tr></thead>
          <tbody>${comparisonRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Backup & Restore Operations Panel (FR57, FR58) -->
    <section class="panel rise" style="border:1px solid #cde4e1;background:#f0fdfa;">
      <header class="panel-header">
        <div><h2>Backup &amp; Disaster Recovery Operations (NFR17, NFR18, FR57, FR58)</h2><p>Run automated encrypted backups and verify timed recovery drills.</p></div>
      </header>
      <div style="display:flex;gap:12px;padding:16px;">
        <button class="button button--primary" type="button" onclick="runBackupOperation('backup')">🔒 Execute Encrypted Backup (NFR17)</button>
        <button class="button button--secondary" type="button" onclick="runBackupOperation('restore')">⚡ Run 30-Min Restore Drill (NFR18)</button>
      </div>
      <p id="backup-status-msg" style="padding:0 16px 16px;font-size:0.85rem;color:var(--teal-700);font-weight:700;"></p>
    </section>
  `;
}

window.runBackupOperation = async function(type) {
  try {
    const res = await apiRequest('/api/admin/backup', { method: 'POST', body: { action: type } });
    document.getElementById('backup-status-msg').innerText = '✓ ' + (res.message || 'Operation executed successfully.');
  } catch (err) {
    document.getElementById('backup-status-msg').innerText = '✕ Error: ' + err.message;
  }
};

window.openMfaSetupModal = async function() {
  try {
    const res = await apiRequest('/api/auth/mfa/setup', { method: 'POST' });
    const data = unwrapData(res) || {};

    const modal = document.createElement('dialog');
    modal.className = 'record-dialog';
    modal.innerHTML = `
      <div class="dialog-content" style="max-width:440px;padding:24px;text-align:center;">
        <header class="dialog-header">
          <div>
            <p class="eyebrow">MULTI-FACTOR AUTHENTICATION (FR50)</p>
            <h2 style="font-size:1.2rem;">Setup Authenticator App</h2>
            <p style="font-size:0.8rem;color:var(--ink-soft);">Scan QR code with Google Authenticator or Authy</p>
          </div>
        </header>
        <div style="margin:16px 0;display:flex;justify-content:center;">
          ${data.qrSvg}
        </div>
        <p style="font-size:0.8rem;font-family:monospace;background:#f1f5f9;padding:6px;border-radius:4px;word-break:break-all;">Secret: ${escapeHtml(data.secret)}</p>
        <form id="mfa-verify-form" style="display:grid;gap:12px;margin-top:16px;text-align:left;">
          <label>Enter 6-Digit Code
            <input type="text" name="token" required placeholder="123456" maxlength="6" style="width:100%;padding:10px;font-size:1.1rem;letter-spacing:4px;text-align:center;border-radius:6px;border:1px solid #ccc;">
          </label>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button type="button" class="button button--secondary" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="button button--primary">Activate 2FA</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#mfa-verify-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = e.target.token.value;
      try {
        const vRes = await apiRequest('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ token }) });
        modal.close();
        modal.remove();
        showToast('✓ ' + (vRes.message || '2FA activated successfully!'), 'success');
      } catch (err) {
        alert('MFA Error: ' + err.message);
      }
    });
  } catch (err) {
    alert('MFA Setup Failed: ' + err.message);
  }
};

window.loadDuplicatePatientsWizard = async function() {
  const container = document.getElementById('duplicate-patients-container');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--ink-soft);">Scanning patient records...</p>';

  try {
    const res = await apiRequest('/api/admin/patients/duplicates');
    const items = unwrapData(res)?.items || [];
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--teal-700);font-weight:600;">✓ No potential duplicate patient records detected across registered branches.</p>';
      return;
    }

    const rows = items.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.primaryName)}</strong><br><small>${escapeHtml(item.primaryMrn)} (DOB: ${escapeHtml(item.primaryDob)})</small></td>
        <td><strong>${escapeHtml(item.secondaryName)}</strong><br><small>${escapeHtml(item.secondaryMrn)} (DOB: ${escapeHtml(item.secondaryDob)})</small></td>
        <td><span class="status-badge status-badge--warning">${escapeHtml(item.matchReason)}</span></td>
        <td><button class="button button--secondary button--small" type="button" onclick="mergePatientRecords(${item.primaryId}, ${item.secondaryId})">🔀 Merge Into Primary</button></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Primary Patient</th><th>Secondary Duplicate</th><th>Match Criteria</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger-700);">Error scanning duplicates: ${escapeHtml(err.message)}</p>`;
  }
};

window.mergePatientRecords = async function(primaryId, secondaryId) {
  if (!confirm(`Are you sure you want to merge secondary patient record #${secondaryId} into primary record #${primaryId}? All medical history, appointments, and invoices will be re-linked.`)) return;
  try {
    const res = await apiRequest('/api/admin/patients/merge', {
      method: 'POST',
      body: JSON.stringify({ primaryId, secondaryId })
    });
    showToast('✓ ' + (res.message || 'Records merged successfully!'), 'success');
    window.loadDuplicatePatientsWizard();
  } catch (err) {
    alert('Merge Failed: ' + err.message);
  }
};

// ---- Inpatient Beds & Admissions Renderer (FR52, FR53, FR54) ----
function renderInpatient() {
  const beds = state.beds || [];
  const admissions = state.admissions || [];

  const bedCards = beds.length ? beds.map(b => {
    let badgeClass = 'status-badge--success';
    if (b.status === 'Occupied') badgeClass = 'status-badge--danger';
    if (b.status === 'Maintenance') badgeClass = 'status-badge--warning';
    return `<article class="metric-card" style="padding:16px;min-width:160px;">
      <span style="font-size:0.75rem;color:var(--ink-soft);">${escapeHtml(b.ward)}</span>
      <strong style="font-size:1.1rem;margin:4px 0;">Room ${escapeHtml(b.roomNumber)} - Bed ${escapeHtml(b.bedNumber)}</strong>
      <span class="status-badge ${badgeClass}">${escapeHtml(b.status)}</span>
    </article>`;
  }).join('') : `<p style="padding:16px;color:var(--ink-soft);">No beds configured.</p>`;

  const admissionRows = admissions.length ? admissions.map(a => {
    return `<tr>
      <td><strong>${escapeHtml(a.patientName)}</strong><br><small>${escapeHtml(a.medicalRecordNumber)}</small></td>
      <td>${escapeHtml(a.ward || 'General')} - Bed ${escapeHtml(a.bedNumber || 'Unassigned')}</td>
      <td>${escapeHtml(a.admissionReason)}</td>
      <td>${escapeHtml(a.doctorName || 'Attending Doctor')}</td>
      <td><span class="status-badge status-badge--active">${escapeHtml(a.status)}</span></td>
      <td>${escapeHtml(formatDate(a.admittedAt))}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-soft);">No active inpatient admissions.</td></tr>`;

  return `
    <section class="panel rise" style="margin-bottom:20px;">
      <header class="panel-header">
        <div><h2>Real-Time Ward Bed Availability (FR53)</h2><p>Live occupancy tracking across hospital wards.</p></div>
      </header>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">${bedCards}</div>
    </section>

    <section class="panel rise">
      <header class="panel-header">
        <div><h2>Inpatient Admissions &amp; Ward Movements (FR52, FR54)</h2><p>Admitted patients, assigned beds, and responsible care teams.</p></div>
        <button class="button button--primary button--small" type="button" data-open-form="admission">+ Admit Patient</button>
      </header>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Patient</th><th>Bed Location</th><th>Admission Reason</th><th>Attending Clinician</th><th>Status</th><th>Admitted Date</th></tr></thead>
          <tbody>${admissionRows}</tbody>
        </table>
      </div>
    </section>
  `;
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
    adminUser: {
      eyebrow: 'Administration',
      title: 'Add Staff Account (FR5, FR21)',
      description: 'Create a new staff user with role-based access and branch assignment.',
      submitLabel: 'Create staff account',
      method: 'POST',
      endpoint: () => API_ENDPOINTS.adminUsers,
      success: 'Staff user created successfully.',
      fields: [
        field('username', 'Username', 'text', { required: true }),
        field('fullName', 'Full name', 'text', { required: true }),
        field('email', 'Email address', 'email', { required: true }),
        field('password', 'Initial Password', 'password', { required: true, minlength: 8 }),
        selectField('role', 'Role', [
          ['Admin', 'Admin'],
          ['Doctor', 'Doctor'],
          ['Nurse', 'Nurse'],
          ['Receptionist', 'Receptionist'],
          ['Lab Technician', 'Lab Technician'],
          ['Pharmacist', 'Pharmacist'],
          ['Branch Manager', 'Branch Manager']
        ], { required: true }),
        selectField('branchId', 'Branch Assignment', state.branchesList.map(b => [String(b.id), `${b.name} (${b.code})`]), { required: true }),
        field('specialisation', 'Specialisation (Doctors/Nurses)', 'text', { placeholder: 'e.g. Cardiology, Pediatrics' }),
        field('phone', 'Contact Phone', 'tel', { placeholder: '04xx xxx xxx' })
      ]
    },
    adminBranch: {
      eyebrow: 'Administration',
      title: 'Add Hospital Branch (FR6)',
      description: 'Register a new branch location in the system.',
      submitLabel: 'Create Branch',
      method: 'POST',
      endpoint: () => API_ENDPOINTS.adminBranches,
      success: 'New branch created successfully.',
      fields: [
        field('code', 'Branch Code (e.g. KOG)', 'text', { required: true }),
        field('name', 'Branch Name', 'text', { required: true }),
        field('address', 'Full Address', 'text', { wide: true, required: true }),
        field('phone', 'Phone Number', 'tel', { required: true })
      ]
    },
    schedule: {
      eyebrow: 'Scheduling',
      title: 'Set Doctor Schedule (FR17, FR22)',
      description: 'Configure consultation availability and time slots.',
      submitLabel: 'Save Schedule',
      method: 'POST',
      endpoint: () => API_ENDPOINTS.schedules,
      success: 'Doctor availability schedule saved successfully.',
      fields: [
        selectField('staffId', 'Doctor', state.doctors.map(d => [String(d.id), d.fullName]), { required: true }),
        selectField('branchId', 'Branch', state.branches.map(b => [String(b.id), b.name]), { required: true }),
        selectField('dayOfWeek', 'Day of Week', [
          ['Monday', 'Monday'], ['Tuesday', 'Tuesday'], ['Wednesday', 'Wednesday'],
          ['Thursday', 'Thursday'], ['Friday', 'Friday'], ['Saturday', 'Saturday'], ['Sunday', 'Sunday']
        ], { required: true }),
        field('startTime', 'Start Time', 'time', { required: true, value: '09:00' }),
        field('endTime', 'End Time', 'time', { required: true, value: '17:00' })
      ]
    },
    purchaseOrder: {
      eyebrow: 'Pharmacy',
      title: 'Create Restock Purchase Order (FR29)',
      description: 'Generate an approved purchase order for restocking low inventory.',
      submitLabel: 'Submit Purchase Order',
      method: 'POST',
      endpoint: () => API_ENDPOINTS.purchaseOrders,
      success: 'Purchase order created and approved.',
      fields: [
        selectField('medicationId', 'Medication Item', state.medications.map(m => [String(m.id), `${m.name} (${m.strength})`]), { required: true }),
        field('quantity', 'Quantity Units to Reorder', 'number', { required: true, min: 1, value: '50' }),
        selectField('branchId', 'Branch', state.branches.map(b => [String(b.id), b.name]), { required: true })
      ]
    },
    admission: {
      eyebrow: 'Inpatient Care',
      title: 'Admit Patient to Ward Bed (FR52, FR53)',
      description: 'Assign a patient to an available ward bed.',
      submitLabel: 'Confirm Admission',
      method: 'POST',
      endpoint: () => API_ENDPOINTS.admissions,
      success: 'Patient admitted successfully.',
      fields: [
        selectField('patientId', 'Patient', state.patients.map(p => [String(p.id), `${p.firstName} ${p.lastName} (${p.medicalRecordNumber})`]), { required: true }),
        selectField('bedId', 'Available Bed', (state.beds || []).filter(b => b.status === 'Available').map(b => [String(b.id), `${b.ward} - Room ${b.roomNumber} (Bed ${b.bedNumber})`]), { required: true }),
        field('admissionReason', 'Admission Diagnosis / Reason', 'text', { wide: true, required: true })
      ]
    },
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
      success: 'Appointment updated successfully. If cancelled, a notification has been sent to the patient.',
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
      success: 'Appointment booked successfully. A confirmation message has been sent, and a reminder will trigger 2 hours before the schedule.',
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
  const method = (options.method || 'GET').toUpperCase();

  // Queue write actions locally if offline
  if (!navigator.onLine && !['GET', 'HEAD'].includes(method)) {
    try {
      const queue = JSON.parse(localStorage.getItem('st_george_hms_sync_queue') || '[]');
      queue.push({ url, method, body: options.body });
      localStorage.setItem('st_george_hms_sync_queue', JSON.stringify(queue));
      showToast('Offline mode active. Your update has been queued locally.', 'warning');
      return { success: true, queued: true };
    } catch (_) {
      // Fallback if localStorage is full or disabled
    }
  }

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (state.csrfToken && !['GET', 'HEAD'].includes(method)) {
    headers.set('X-CSRF-Token', state.csrfToken);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
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
  if (online) {
    syncOfflineActions();
  }
}

async function syncOfflineActions() {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem('st_george_hms_sync_queue') || '[]');
  } catch (_) {
    queue = [];
  }
  if (queue.length === 0) return;

  localStorage.removeItem('st_george_hms_sync_queue');
  showToast(`Syncing ${queue.length} offline updates…`, 'info');

  let successCount = 0;
  for (const item of queue) {
    try {
      await apiRequest(item.url, {
        method: item.method,
        body: item.body,
        allowUnauthenticated: true
      });
      successCount++;
    } catch (err) {
      console.error('Failed to sync action:', item, err);
    }
  }

  if (successCount > 0) {
    showToast(`Successfully synced ${successCount} offline updates with the server.`, 'success');
    handleHashChange();
  }
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
  
function initPublicSearch() {
  if (!elements.publicSearch) return;

  function filterContent(query) {
    const clean = query.trim().toLowerCase();
    const items = document.querySelectorAll('[data-search-content]');
    items.forEach((item) => {
      const content = (item.dataset.searchContent || '').toLowerCase();
      const text = item.textContent.toLowerCase();
      const match = !clean || content.includes(clean) || text.includes(clean);
      item.style.display = match ? '' : 'none';
    });
  }

  elements.publicSearch.addEventListener('input', (e) => {
    filterContent(e.target.value);
  });

  elements.searchQuickTags?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-search-term]');
    if (btn) {
      elements.publicSearch.value = btn.dataset.searchTerm;
      filterContent(btn.dataset.searchTerm);
      elements.publicSearch.focus();
    }
  });
}

const FOOTER_INFO_DATABASE = {
  'about-hospital': {
    category: 'About Us',
    title: 'About St George Hospital',
    content: 'St George Hospital is a major accredited teaching hospital associated with the University of New South Wales (UNSW). As a Level 1 Trauma Centre and tertiary referral facility, we deliver premier clinical services to over 250,000 residents in Kogarah, southern Sydney, and surrounding regions.'
  },
  'history': {
    category: 'About Us',
    title: 'Our History & Heritage',
    content: 'Established in 1894, St George Hospital has grown from a humble cottage medical house into one of the largest health campuses in New South Wales. For over 130 years, our team has pioneered cardiology treatments, trauma responses, and advanced surgical interventions.'
  },
  'executive-team': {
    category: 'About Us',
    title: 'Executive Leadership Team',
    content: 'Our executive board is comprised of leading medical directors, nursing leaders, and healthcare operations specialists dedicated to maintaining clinical safety, professional accreditation, and high-reliability operations across the campus.'
  },
  'contact-us': {
    category: 'About Us',
    title: 'Contact Information',
    content: 'General Enquiries: (02) 9113 1111 | Fax: (02) 9113 5000 | Location: Gray Street, Kogarah NSW 2217. In the event of a medical emergency, please dial 000 immediately or visit our 24/7 Emergency Department.'
  },
  'bariatric-surgery': {
    category: 'Clinical Services',
    title: 'Bariatric & Metabolic Surgery',
    content: 'Our surgical suites are equipped for minimally invasive laparoscopic bariatric surgery, including gastric banding, bypass procedures, and metabolic assessments. All treatments are integrated with post-operative dietary and psychological care.'
  },
  'cardiology': {
    category: 'Clinical Services',
    title: 'Cardiology & Heart Care',
    content: 'The St George Cardiology department is a center of excellence, offering state-of-the-art cardiac catheterization, arrhythmia management, cardiac rehabilitation, and acute coronary care.'
  },
  'oncology': {
    category: 'Clinical Services',
    title: 'Oncology & Chemotherapy',
    content: 'We provide comprehensive cancer care services, including outpatient chemotherapy, medical oncology consults, clinical trials, and dedicated cancer care support.'
  },
  'orthopaedics': {
    category: 'Clinical Services',
    title: 'Orthopaedic Surgery',
    content: 'Our orthopaedic surgeons specialize in joint replacements (hip, knee, shoulder), advanced trauma reconstruction, and sports medicine, supported by on-site physical therapists.'
  },
  'icu': {
    category: 'Clinical Services',
    title: 'Intensive Care Unit (ICU)',
    content: 'The tertiary Intensive Care Unit at St George provides 24/7 advanced life support and intensive monitoring for critically ill medical and surgical patients, led by board-certified Intensivists.'
  },
  'research': {
    category: 'Clinical Services',
    title: 'Clinical Trials & Academic Research',
    content: 'St George Hospital hosts numerous national and international clinical trials across oncology, intensive care, and cardiovascular health, bridging research discoveries directly to bedside patient care.'
  },
  'maternity-unit': {
    category: 'Maternity Services',
    title: 'Our Maternity & Birthing Unit',
    content: 'Our modern maternity suites offer personalized care throughout your pregnancy, birth, and early parenting journey, featuring spacious labor wards, water birthing options, and special care nursery support.'
  },
  'maternity-education': {
    category: 'Maternity Services',
    title: 'Parenting & Maternity Education',
    content: 'We offer interactive prenatal classes, breastfeeding workshops, baby care basics, and hospital tours to prepare parents for a safe and confident transition to parenthood.'
  },
  'pre-admission': {
    category: 'For Patients',
    title: 'Pre-Admission Information Guide',
    content: 'Prior to your scheduled procedure, please complete your online admission details. Bring your Medicare card, private health fund details, active medications, and any recent clinical scan reports.'
  },
  'your-surgery': {
    category: 'For Patients',
    title: 'Preparing for Your Surgery',
    content: 'Please observe the fasting instructions provided by your doctor. Shower prior to arrival, do not wear cosmetics or jewelry, and arrange for an authorized adult to escort you home after discharge.'
  },
  'patient-rights': {
    category: 'For Patients',
    title: 'Patient Rights & Responsibilities',
    content: 'Under the Australian Charter of Healthcare Rights, you are entitled to safe and high-quality care, respect, clear communication, privacy, and the ability to raise questions or seek second opinions.'
  },
  'falls-prevention': {
    category: 'For Patients',
    title: 'Falls Prevention Program',
    content: 'To prevent falls during your stay, keep personal items within easy reach, wear non-slip socks or footwear, use bedside handrails, and request assistance from nursing staff before walking if you feel dizzy.'
  },
  'privacy-policy': {
    category: 'For Patients',
    title: 'Patient Privacy & Health Records',
    content: 'We handle your personal health information securely in accordance with the NSW Health Records and Information Privacy Act (HRIPA). Your clinical notes are restricted to authorized practitioners only.'
  },
  'parking': {
    category: 'For Visitors',
    title: 'Visitor Parking & Transit Rates',
    content: 'On-site underground parking is available with ticket validation. Rates: First 30 mins free, 0.5–1 hr: $6.00, 1–2 hrs: $12.00, Max daily rate: $25.00. Concession passes are available for frequent visitors.'
  },
  'visiting-hours': {
    category: 'For Visitors',
    title: 'Visiting Hours & Guidelines',
    content: 'Visiting hours are Daily from 10:00 AM – 8:00 PM. To protect patient recovery and prevent cross-infection, we request a limit of two visitors per bedside at a time. Sanitizer stations are at all ward entries.'
  },
  'public-transport': {
    category: 'For Visitors',
    title: 'Public Transport & Parking Directions',
    content: 'The hospital is a short 8-minute walk from Kogarah Train Station. Multiple direct bus routes (e.g. 476, 477) stop directly outside Gray St and Belgrave St entries.'
  },
  'gp-referrals': {
    category: 'For GPs',
    title: 'GP Referral Guidelines',
    content: 'GPs can refer patients directly to St George Specialist Outpatient Clinics by submitting referral letters via secure e-health systems (HealtLink ID: stgeorge) or secure faxing.'
  },
  'gp-education': {
    category: 'For GPs',
    title: 'GP Continuing Education & Events',
    content: 'St George Hospital hosts monthly CPD-accredited education seminars for general practitioners, presenting clinical updates in orthopaedics, oncology breakthroughs, and cardiology referral paths.'
  },
  'health-education': {
    category: 'Health Education',
    title: 'Health Education & Wellness Programs',
    content: 'We run community health classes, including diabetes management, cardiac wellness, respiratory rehabilitation, and nutrition guides to help you maintain health at home.'
  },
  'careers': {
    category: 'Careers',
    title: 'Careers & Work with Us',
    content: 'Join our team of dedicated healthcare professionals. We offer competitive NSW Health salary packaging, active professional development, research funding, and a collaborative nursing and clinical culture.'
  },
  'volunteer': {
    category: 'Careers',
    title: 'Volunteer Services',
    content: 'Our hospital volunteers provide compassionate support, including ward navigation, patient companionship, reading programs, and organizing hospital flower and gift stalls.'
  }
};

async function handlePublicAdmissionSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('admission-status');
  statusEl.textContent = 'Submitting your admission form...';
  statusEl.style.color = 'var(--ink-soft)';

  const payload = {
    firstName: form.elements.first_name.value.trim(),
    lastName: form.elements.last_name.value.trim(),
    dateOfBirth: form.elements.date_of_birth.value,
    gender: form.elements.gender.value,
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    address: form.elements.address.value.trim(),
    emergencyContact: form.elements.emergency_contact.value.trim(),
    allergies: form.elements.allergies.value.trim(),
    password: form.elements.password.value,
  };

  try {
    const response = await apiRequest('/api/public/admission', {
      method: 'POST',
      body: payload,
      allowUnauthenticated: true
    });
    
    // Successful self-admission!
    elements.admissionDialog.close();
    
    // Show confirmation modal
    document.getElementById('footer-modal-category').textContent = 'Admission Successful 🎉';
    document.getElementById('footer-modal-title').textContent = `Welcome, ${response.firstName} ${response.lastName}`;
    document.getElementById('footer-modal-body').innerHTML = `
      <div style="background: var(--teal-50); border: 1px solid var(--teal-200); padding: 16px; border-radius: 8px; margin-bottom: 16px; color: var(--teal-950); font-family: inherit;">
        <p style="margin: 0 0 8px; font-weight: 600;">Globally Unique Patient Number (MRN):</p>
        <code style="font-size: 1.5rem; font-weight: 700; color: var(--teal-800); letter-spacing: 0.1em; display: block; text-align: center; margin: 8px 0; background: #fff; padding: 8px; border-radius: 4px; border: 1px dashed var(--teal-400);">${escapeHtml(response.medicalRecordNumber)}</code>
        <p style="margin: 0; font-size: 0.875rem;">Please keep this number secure. You will need it to sign in to the patient portal and schedule your upcoming appointments.</p>
      </div>
      <p>Your electronic health record has been initialized at <strong>St George Hospital (Kogarah Campus)</strong>. Welcome to our care network.</p>
    `;
    elements.footerModal.showModal();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.style.color = 'var(--red-700)';
  }
}

// AES/LSB Steganography Implementation
function drawStGeorgeLogo(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0fdfa'; // mint background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw a cyan shield/circle
  ctx.fillStyle = '#0891b2'; // clinical teal
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2 - 10, 40, 0, Math.PI * 2);
  ctx.fill();

  // Draw a white cross
  ctx.fillStyle = '#ffffff';
  // horizontal
  ctx.fillRect(canvas.width / 2 - 25, canvas.height / 2 - 15, 50, 10);
  // vertical
  ctx.fillRect(canvas.width / 2 - 5, canvas.height / 2 - 35, 10, 50);

  // Label
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("ST GEORGE HOSPITAL", canvas.width / 2, canvas.height - 22);
  ctx.font = '7px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText("SECURE MEDICAL SHARE", canvas.width / 2, canvas.height - 8);
}

window.switchStegoTab = function(tab) {
  document.querySelectorAll('.stego-view').forEach(el => el.hidden = true);
  document.getElementById(`stego-view-${tab}`).hidden = false;

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('tab-button--active');
    btn.style.color = 'var(--ink-soft)';
    btn.style.borderBottomColor = 'transparent';
  });

  const activeBtn = document.getElementById(`stego-tab-${tab}-btn`);
  activeBtn.classList.add('tab-button--active');
  activeBtn.style.color = 'var(--clinical-teal)';
  activeBtn.style.borderBottomColor = 'var(--clinical-teal)';
};

window.handleStegoEmbed = async function(event) {
  event.preventDefault();
  const select = document.getElementById('stego-patient-id');
  const message = document.getElementById('stego-message').value.trim();
  const password = document.getElementById('stego-password-embed').value;

  if (!message || !password) return;

  const originalText = `Patient: ${select.options[select.selectedIndex].text}\nReport: ${message}`;
  
  try {
    showToast("Encrypting report via AES-256...", "info");
    const response = await apiRequest('/api/clinical/stego/encrypt', {
      method: 'POST',
      body: { plaintext: originalText, password }
    });

    const { ciphertext, salt, iv } = response;

    // Display Hex payload
    const hexDisplay = document.getElementById('stego-hex-display');
    hexDisplay.textContent = ciphertext;

    // Build Canvas LSB
    const canvas = document.getElementById('stego-canvas');
    drawStGeorgeLogo(canvas);

    const ctx = canvas.getContext('2d');
    const payloadString = JSON.stringify({ ciphertext, salt, iv });

    // String to bits
    const bits = [];
    for (let i = 0; i < payloadString.length; i++) {
      const code = payloadString.charCodeAt(i);
      for (let b = 7; b >= 0; b--) {
        bits.push((code >> b) & 1);
      }
    }
    // Terminator
    for (let i = 0; i < 16; i++) {
      bits.push(0);
    }

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    if (bits.length > data.length) {
      showToast("Clinical report is too long for this logo space!", "error");
      return;
    }

    // Embed bits into LSB of RGB channels
    for (let i = 0; i < bits.length; i++) {
      const index = i + Math.floor(i / 3);
      if (index >= data.length) break;
      data[index] = (data[index] & 0xFE) | bits[i];
    }

    ctx.putImageData(imgData, 0, 0);

    // Download Button href
    const downloadBtn = document.getElementById('stego-download-btn');
    downloadBtn.href = canvas.toDataURL('image/png');

    document.getElementById('stego-embed-output').hidden = false;
    showToast("LSB Stego-image generated successfully!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.loadStegoUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('stego-filename').textContent = file.name;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.getElementById('stego-canvas');
      if (!canvas) {
        showToast("Error: Embed a stego-image first to initialize the canvas context.", "error");
        return;
      }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      showToast("Stego-image uploaded and loaded into canvas.", "success");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.loadLastStegoCanvas = function() {
  const canvas = document.getElementById('stego-canvas');
  if (!canvas || document.getElementById('stego-embed-output').hidden === true) {
    showToast("Please generate a stego-image first using the 'Hide' tab.", "info");
    return;
  }
  showToast("Loaded last generated canvas for testing.", "success");
};

window.handleStegoExtract = async function() {
  const canvas = document.getElementById('stego-canvas');
  const password = document.getElementById('stego-password-extract').value;

  if (!canvas) return;

  try {
    showToast("Scanning pixel arrays for hidden LSB data...", "info");
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const extractedBits = [];

    let consecutiveZeros = 0;
    for (let i = 0; i < data.length; i++) {
      const index = i + Math.floor(i / 3);
      if (index >= data.length) break;

      const bit = data[index] & 1;
      extractedBits.push(bit);

      if (bit === 0) {
        consecutiveZeros++;
      } else {
        consecutiveZeros = 0;
      }

      if (consecutiveZeros === 16) {
        extractedBits.splice(-16);
        break;
      }
    }

    if (extractedBits.length === 0) {
      showToast("No steganography payload found in this image.", "error");
      return;
    }

    const bytes = [];
    for (let i = 0; i < extractedBits.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        if (i + b < extractedBits.length) {
          byte = (byte << 1) | extractedBits[i + b];
        }
      }
      bytes.push(byte);
    }

    const decodedString = String.fromCharCode(...bytes);
    let parsed;
    try {
      parsed = JSON.parse(decodedString);
    } catch {
      showToast("Extracted data is corrupt or not in correct format.", "error");
      return;
    }

    const { ciphertext, salt, iv } = parsed;

    showToast("Decrypting AES-256 payload...", "info");
    const response = await apiRequest('/api/clinical/stego/decrypt', {
      method: 'POST',
      body: { ciphertext, salt, iv, password }
    });

    const outputEl = document.getElementById('stego-extract-output');
    const textEl = document.getElementById('stego-recovered-text');
    textEl.textContent = response.plaintext;
    outputEl.hidden = false;
    showToast("Secure medical report decrypted successfully!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
};
