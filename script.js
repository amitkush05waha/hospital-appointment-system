// ========================================================
// SmartCare - hospital appointment booking
// Patient flow + Supabase (falls back to localStorage if no DB)
// ========================================================

// Hardcoded doctor list - used until/unless the doctors table loads from Supabase
let doctorsData = [
  { id: 1, name: "Dr. Patel", specialization: "Cardiology", slots: ["9:00 AM", "10:00 AM", "2:00 PM", "4:00 PM"], rating: 4.8, experience: 15 },
  { id: 2, name: "Dr. Smith", specialization: "Dermatology", slots: ["8:00 AM", "11:00 AM", "1:00 PM", "3:00 PM"], rating: 4.6, experience: 12 },
  { id: 3, name: "Dr. Kumar", specialization: "Orthopedics", slots: ["10:00 AM", "12:00 PM", "3:00 PM"], rating: 4.9, experience: 20 },
  { id: 4, name: "Dr. Kannal", specialization: "General Medicine", slots: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM", "6:00 PM"], rating: 4.7, experience: 10 },
  { id: 5, name: "Dr. K Yadav", specialization: "Pediatrics", slots: ["8:30 AM", "10:30 AM", "1:30 PM"], rating: 4.6, experience: 8 },
  { id: 6, name: "Dr. Das", specialization: "Neurology", slots: ["10:00 AM", "11:00 AM", "3:00 PM"], rating: 4.5, experience: 18 }
];

// --- small shortcuts used everywhere below ---
const byId = id => document.getElementById(id);
const fieldValue = id => byId(id)?.value || '';

// True only when the supabase config script is loaded and a client exists
function dbReady() {
  return typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient;
}

// --- localStorage helpers (offline/testing mode) ---
function getAppointments() { return JSON.parse(localStorage.getItem('appointments') || '[]'); }
function saveAppointments(list) { localStorage.setItem('appointments', JSON.stringify(list)); }
function getPatients() { return JSON.parse(localStorage.getItem('patients') || '[]'); }
function savePatients(list) { localStorage.setItem('patients', JSON.stringify(list)); }

// Little popup message, disappears after 4s
function showToast(message, type = 'info') {
  let box = document.querySelector('.toast-container');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-container';
    document.body.appendChild(box);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  box.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Returns the raw string back if it isn't a parseable date
function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Needed wherever we dump user text into innerHTML
function escapeHtml(text) {
  if (!text) return '';
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
  return String(text).replace(/[&<>'"]/g, ch => entities[ch] || ch);
}

// ========================================================
// PATIENT SESSION
// ========================================================

const PATIENT_SESSION_KEYS = [
  'patientLoggedIn', 'patientDbId', 'patientName', 'patientPhone',
  'patientAge', 'patientGender', 'patientEmail', 'patientPin', 'patientId'
];

function getPatientSession() {
  const dbId = sessionStorage.getItem('patientDbId');
  if (!dbId) return null;
  return {
    id: parseInt(dbId),
    name: sessionStorage.getItem('patientName') || '',
    phone: sessionStorage.getItem('patientPhone') || '',
    age: sessionStorage.getItem('patientAge') || '',
    gender: sessionStorage.getItem('patientGender') || '',
    email: sessionStorage.getItem('patientEmail') || '',
    pin: sessionStorage.getItem('patientPin') || ''
  };
}

function setPatientSession(patient) {
  if (!patient || !patient.id) return;
  sessionStorage.setItem('patientLoggedIn', 'true');
  sessionStorage.setItem('patientDbId', String(patient.id));
  sessionStorage.setItem('patientName', patient.full_name || patient.name || '');
  sessionStorage.setItem('patientPhone', patient.phone || '');
  if (patient.age) sessionStorage.setItem('patientAge', String(patient.age));
  if (patient.gender) sessionStorage.setItem('patientGender', patient.gender);
  if (patient.email) sessionStorage.setItem('patientEmail', patient.email);
  if (patient.pin) sessionStorage.setItem('patientPin', patient.pin);

  // keep a local copy of the PIN so verification still works if the pin column is missing in the DB
  try {
    const saved = JSON.parse(localStorage.getItem('patient_credentials') || '{}');
    if (patient.pin) saved[patient.id] = { pin: patient.pin, phone: patient.phone, name: patient.full_name };
    localStorage.setItem('patient_credentials', JSON.stringify(saved));
  } catch (e) { }

  updatePatientBanner();
  updateNavbarAuth();
}

function clearPatientSession() {
  PATIENT_SESSION_KEYS.forEach(key => sessionStorage.removeItem(key));
  updatePatientBanner();
  updateNavbarAuth();
}

function isPatientActive() {
  return Boolean(sessionStorage.getItem('patientDbId'));
}

// Top banner + sidebar subtitle showing who is currently logged in
function updatePatientBanner() {
  const banner = byId('activePatientBanner');
  const idBadge = byId('patientIdBadge');
  const nameEl = byId('patientBannerName');
  const metaEl = byId('patientBannerMeta');
  const sidebarSub = byId('sidebarPatientSubtitle');
  const sideEntry = byId('sideEntry');

  const session = getPatientSession();
  if (session && banner) {
    banner.style.display = 'flex';
    if (idBadge) idBadge.textContent = `PID: #${session.id}`;
    if (nameEl) nameEl.textContent = session.name;
    if (metaEl) metaEl.textContent = `${session.phone ? session.phone + ' • ' : ''}${session.age ? session.age + ' yrs • ' : ''}${session.gender || ''}`;
    if (sidebarSub) sidebarSub.textContent = `Patient #${session.id}`;
    if (sideEntry) sideEntry.style.display = 'none';
  } else if (banner) {
    banner.style.display = 'none';
    if (sidebarSub) sidebarSub.textContent = 'Identification Required';
  }
}

// Show/hide the logout buttons depending on who is signed in
function updateNavbarAuth() {
  const patientLoggedIn = isPatientActive();
  const adminLoggedIn = sessionStorage.getItem('adminLoggedIn') === 'true';

  const adminLogoutBtn = byId('adminLogoutNav');
  if (adminLogoutBtn) adminLogoutBtn.style.display = adminLoggedIn ? 'inline-block' : 'none';

  const patientLogoutBtn = byId('patientLogoutNav');
  if (patientLogoutBtn) patientLogoutBtn.style.display = patientLoggedIn ? 'inline-block' : 'none';

  // generic login buttons on other pages turn into "Logout" for patients
  document.querySelectorAll('.nav-login-btn').forEach(btn => {
    if (btn.id === 'adminLogoutNav' || btn.id === 'patientLogoutNav') return;
    if (patientLoggedIn) {
      btn.style.display = 'inline-block';
      btn.textContent = 'Logout';
      btn.href = '#';
      btn.onclick = (ev) => {
        ev.preventDefault();
        patientLogout();
      };
    } else {
      btn.style.display = 'none';
      btn.textContent = '';
      btn.onclick = null;
    }
  });
}

async function patientLogout() {
  if (dbReady()) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) { }
  }
  clearPatientSession();
  const logoutBtn = byId('patientLogoutNav');
  if (logoutBtn) logoutBtn.style.display = 'none';
  updateNavbarAuth();
  showToast('Patient session ended', 'info');

  // on the portal page go back to the entry screen, anywhere else go home
  if (byId('patientEntrySection')) {
    showSection('patientEntrySection');
  } else {
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  }
}

// ========================================================
// ENTRY MODAL + TABS
// ========================================================

function openPatientEntryModal(defaultTab = 'new') {
  // already signed in -> skip the modal, go pick a doctor
  if (isPatientActive()) {
    window.location.href = 'patient.html?step=doctor';
    return;
  }
  const modal = byId('patientEntryModal');
  if (modal) {
    modal.classList.remove('hidden');
    switchEntryTab(defaultTab, 'modal');
  } else {
    // this page has no modal, send them to the portal instead
    window.location.href = 'patient.html';
  }
}

function closePatientEntryModal() {
  const modal = byId('patientEntryModal');
  if (modal) modal.classList.add('hidden');
}

// Flip between "New patient" and "Existing patient" forms (modal or in-page)
function switchEntryTab(tab, context = 'modal') {
  const prefix = context === 'modal' ? 'modal' : 'page';
  const newTab = byId(`${prefix}NewPatientTab`);
  const existTab = byId(`${prefix}ExistingPatientTab`);
  const newForm = byId(`${prefix}NewPatientForm`);
  const existForm = byId(`${prefix}ExistingPatientForm`);
  const showNew = tab === 'new';

  if (newTab) newTab.classList.toggle('active', showNew);
  if (existTab) existTab.classList.toggle('active', !showNew);
  if (newForm) newForm.classList.toggle('active', showNew);
  if (existForm) existForm.classList.toggle('active', !showNew);
}

// ========================================================
// REGISTRATION
// ========================================================

function validateRegistrationInput(data, prefix = '') {
  let allGood = true;

  // shows/hides the red error text under a field
  const flagField = (field, hasError, message) => {
    const errBox = byId(`${prefix}${field}Err`);
    if (errBox) {
      if (hasError && message) errBox.textContent = message;
      errBox.classList.toggle('active', hasError);
    }
    if (hasError) allGood = false;
  };

  flagField('NewName',
    !data.full_name || data.full_name.trim().length < 2,
    'Full name is required (at least 2 letters).');

  const ageNum = parseInt(data.age, 10);
  flagField('NewAge',
    isNaN(ageNum) || ageNum < 1 || ageNum > 120,
    'Enter a valid age between 1 and 120.');

  flagField('NewGender', !data.gender, 'Please select a gender.');

  // strip spaces, dashes, brackets and + before counting digits
  const digitsOnly = (data.phone || '').replace(/[\s\-\(\)\+]/g, '');
  flagField('NewPhone',
    !digitsOnly || digitsOnly.length < 7 || !/^\d+$/.test(digitsOnly),
    'Enter a valid phone number (at least 7 digits).');

  // email is optional, only check the format when something was typed
  const typedEmail = (data.email || '').trim();
  flagField('NewEmail',
    typedEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail),
    'Please enter a valid email format.');

  flagField('NewPin',
    !data.pin || data.pin.length < 4 || data.pin.length > 6,
    'PIN must be 4 to 6 characters (used for secure returning access).');

  return allGood;
}

async function handlePatientRegistration(formData, prefix = '', redirectDestination = 'patient.html?step=doctor') {
  if (!validateRegistrationInput(formData, prefix)) {
    showToast('Please fix the errors in the registration form', 'error');
    return;
  }

  const submitBtn = byId(`${prefix}NewSubmitBtn`);
  const btnLabel = submitBtn ? submitBtn.textContent : 'Register & Select Doctor';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering Patient...';
  }

  try {
    let newPatient = null;

    if (dbReady()) {
      const baseRow = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        age: parseInt(formData.age, 10),
        gender: formData.gender
      };

      // first try with email + pin columns
      const fullRow = {
        ...baseRow,
        email: formData.email ? formData.email.trim() : null,
        pin: formData.pin
      };

      let { data: rows, error: dbError } = await supabaseClient
        .from('patients')
        .insert([fullRow])
        .select();

      // older schema without email/pin columns -> retry with the basics only
      if (dbError && (dbError.code === 'PGRST204' || dbError.code === '42703')) {
        console.warn('email/pin columns missing in patients table, saving core fields only:', dbError.message);
        const retry = await supabaseClient
          .from('patients')
          .insert([baseRow])
          .select();
        rows = retry.data;
        dbError = retry.error;
      }

      if (dbError) {
        console.error('Supabase patient registration error:', dbError);
        throw new Error(dbError.message || 'Database error during registration.');
      }

      if (rows && rows[0]) {
        newPatient = {
          id: rows[0].id,
          full_name: rows[0].full_name,
          phone: rows[0].phone,
          age: rows[0].age || formData.age,
          gender: rows[0].gender || formData.gender,
          email: formData.email || '',
          pin: formData.pin
        };
      } else {
        throw new Error('No patient record returned from database.');
      }
    } else {
      // no DB -> store locally, timestamp doubles as the ID
      newPatient = {
        id: Date.now(),
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        age: parseInt(formData.age, 10),
        gender: formData.gender,
        email: formData.email ? formData.email.trim() : '',
        pin: formData.pin
      };

      const savedPatients = getPatients();
      savedPatients.push(newPatient);
      savePatients(savedPatients);
    }

    setPatientSession(newPatient);
    showToast(`Registration successful! Your Patient ID is #${newPatient.id}`, 'success');
    closePatientEntryModal();

    if (window.location.pathname.includes('patient.html')) {
      showSection('bookingSection');
      resetBookingWizard();
    } else {
      setTimeout(() => {
        window.location.href = redirectDestination;
      }, 700);
    }

  } catch (err) {
    console.error('Registration failure:', err);
    showToast(err.message || 'Registration failed. Please try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = btnLabel;
    }
  }
}

// ========================================================
// RETURNING PATIENT LOGIN
// ========================================================
// Name/phone alone isn't enough to identify someone - we always need
// the Patient ID plus the secret PIN.

async function handlePatientVerification(patientIdRaw, pinRaw, prefix = '', redirectDestination = 'patient.html') {
  const idErrBox = byId(`${prefix}ExistIdErr`);
  const pinErrBox = byId(`${prefix}ExistPinErr`);

  if (idErrBox) idErrBox.classList.remove('active');
  if (pinErrBox) pinErrBox.classList.remove('active');

  // accepts "101" or "PID-101" - just keep the digits
  const patientId = parseInt((patientIdRaw || '').replace(/[^0-9]/g, ''), 10);
  const pin = (pinRaw || '').trim();

  if (isNaN(patientId) || patientId <= 0) {
    if (idErrBox) {
      idErrBox.textContent = 'Please enter a valid numeric Patient ID (e.g. 101 or PID-101).';
      idErrBox.classList.add('active');
    }
    showToast('Invalid Patient ID', 'error');
    return;
  }

  if (!pin || pin.length < 4) {
    if (pinErrBox) {
      pinErrBox.textContent = 'Please enter your 4-6 digit secret Security PIN.';
      pinErrBox.classList.add('active');
    }
    showToast('Security PIN is required', 'error');
    return;
  }

  const submitBtn = byId(`${prefix}ExistSubmitBtn`);
  const btnLabel = submitBtn ? submitBtn.textContent : 'Verify Identity & Continue';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Credentials...';
  }

  try {
    let verified = null;

    if (dbReady()) {
      // preferred: server-side RPC so the PIN never has to be read by the client
      try {
        const { data: rpcRows, error: rpcError } = await supabaseClient
          .rpc('verify_patient_identity', { p_id: patientId, p_pin: pin });
        if (!rpcError && rpcRows && rpcRows.length > 0) {
          verified = rpcRows[0];
          verified.pin = pin;
        }
      } catch (rpcEx) {
        console.warn('RPC verify notice:', rpcEx);
      }

      // RPC not set up -> read the row directly and compare PIN here
      if (!verified) {
        const { data: row, error: lookupError } = await supabaseClient
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (!row) {
          throw new Error(`No patient record found for Patient ID #${patientId}.`);
        }

        // PIN lives in the DB column, or in the local cache if the column doesn't exist
        let knownPin = row.pin;
        if (!knownPin) {
          try {
            const saved = JSON.parse(localStorage.getItem('patient_credentials') || '{}');
            knownPin = saved[patientId]?.pin;
          } catch (e) { }
        }

        if (knownPin && knownPin !== pin) {
          throw new Error('Authentication failed. Invalid Security PIN for this Patient ID.');
        }

        verified = {
          id: row.id,
          full_name: row.full_name,
          phone: row.phone,
          age: row.age,
          gender: row.gender,
          email: row.email || '',
          pin: pin
        };
      }
    } else {
      // offline mode
      const match = getPatients().find(p => String(p.id) === String(patientId));
      if (!match) {
        throw new Error(`No patient found with ID #${patientId}`);
      }
      if (match.pin && match.pin !== pin) {
        throw new Error('Invalid Security PIN.');
      }
      verified = match;
    }

    setPatientSession(verified);
    showToast(`Identity verified! Welcome back, ${verified.full_name}`, 'success');
    closePatientEntryModal();

    if (window.location.pathname.includes('patient.html')) {
      showSection('appointmentsSection');
      await renderPatientDashboard();
    } else {
      setTimeout(() => {
        window.location.href = redirectDestination;
      }, 700);
    }

  } catch (err) {
    console.error('Verification error:', err);
    showToast(err.message || 'Identity verification failed.', 'error');
    if (pinErrBox) {
      pinErrBox.textContent = err.message || 'Authentication failed. Please verify your credentials.';
      pinErrBox.classList.add('active');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = btnLabel;
    }
  }
}

// ========================================================
// NAVBAR + FORM WIRING
// ========================================================

// Pulls the 6 registration inputs for either the modal ('modal') or the page form ('page')
function readRegistrationForm(prefix) {
  return {
    full_name: fieldValue(`${prefix}NewName`),
    age: fieldValue(`${prefix}NewAge`),
    gender: fieldValue(`${prefix}NewGender`),
    phone: fieldValue(`${prefix}NewPhone`),
    email: fieldValue(`${prefix}NewEmail`),
    pin: fieldValue(`${prefix}NewPin`)
  };
}

function initNavbar() {
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    // tap anywhere outside the navbar closes the mobile menu
    document.addEventListener('click', ev => {
      if (!ev.target.closest('.navbar')) navLinks.classList.remove('open');
    });
  }

  // hero "Book" button on the home page - open signup if nobody's logged in
  const heroBookBtn = byId('heroBookBtn');
  if (heroBookBtn) {
    heroBookBtn.addEventListener('click', (ev) => {
      if (!isPatientActive()) {
        ev.preventDefault();
        openPatientEntryModal('new');
      }
    });
  }

  // modal close (X button + clicking the dark backdrop)
  const closeBtn = byId('closePatientModal');
  if (closeBtn) closeBtn.addEventListener('click', closePatientEntryModal);

  const modalBackdrop = byId('patientEntryModal');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (ev) => {
      if (ev.target === modalBackdrop) closePatientEntryModal();
    });
  }

  // forms inside the modal
  const modalSignup = byId('modalNewPatientForm');
  if (modalSignup) {
    modalSignup.addEventListener('submit', (ev) => {
      ev.preventDefault();
      handlePatientRegistration(readRegistrationForm('modal'), 'modal');
    });
  }

  const modalLogin = byId('modalExistingPatientForm');
  if (modalLogin) {
    modalLogin.addEventListener('submit', (ev) => {
      ev.preventDefault();
      handlePatientVerification(fieldValue('modalExistId'), fieldValue('modalExistPin'), 'modal');
    });
  }

  // same forms but embedded in patient.html
  const pageSignup = byId('pageNewPatientForm');
  if (pageSignup) {
    pageSignup.addEventListener('submit', (ev) => {
      ev.preventDefault();
      handlePatientRegistration(readRegistrationForm('page'), 'page');
    });
  }

  const pageLogin = byId('pageExistingPatientForm');
  if (pageLogin) {
    pageLogin.addEventListener('submit', (ev) => {
      ev.preventDefault();
      handlePatientVerification(fieldValue('pageExistId'), fieldValue('pageExistPin'), 'page');
    });
  }

  updateNavbarAuth();
}

// ========================================================
// SIDEBAR / SECTION SWITCHING
// ========================================================

function initSidebar() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', ev => {
      ev.preventDefault();
      const target = link.dataset.section;
      if (!target) return;

      // not identified yet -> bounce to the entry screen
      if (!isPatientActive() && target !== 'patientEntrySection') {
        showToast('Please register or verify your patient identity first', 'info');
        showSection('patientEntrySection');
        return;
      }

      showSection(target);
      link.closest('.sidebar-nav').querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

function showSection(sectionId) {
  const main = document.querySelector('.dashboard-main');
  if (!main) return;

  // booking/appointments are locked until the patient is identified
  if (!isPatientActive() && sectionId !== 'patientEntrySection') {
    sectionId = 'patientEntrySection';
  }

  main.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.remove('active'));
  const targetSection = byId(sectionId);
  if (targetSection) targetSection.classList.add('active');

  document.querySelectorAll('.sidebar-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === sectionId);
  });

  if (sectionId === 'bookingSection') {
    resetBookingWizard();
  }
}

// ========================================================
// DOCTORS
// ========================================================

// Replace the hardcoded list with whatever is in the doctors table (if any)
async function syncDoctorsData() {
  if (!dbReady()) return;
  try {
    const { data, error } = await supabaseClient
      .from('doctors')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data && data.length > 0) {
      doctorsData = data
        .filter(row => row.available === undefined || row.available === null || row.available === true)
        .map((row, i) => ({
          id: row.id || (i + 1),
          name: row.name,
          specialization: row.specialization,
          slots: row.slots ? (Array.isArray(row.slots) ? row.slots : JSON.parse(row.slots)) : ["9:00 AM", "10:00 AM", "2:00 PM", "4:00 PM"],
          rating: Number(row.rating) || 4.7,
          experience: Number(row.experience) || 10
        }));
    }
  } catch (e) {
    console.warn('Doctors sync notice:', e);
  }
}

function renderDoctorFilters(containerId, gridId, selectable) {
  const container = byId(containerId);
  if (!container) return;
  const categories = ['All', ...new Set(doctorsData.map(d => d.specialization))];
  container.innerHTML = categories
    .map(cat => `<button class="filter-btn${cat === 'All' ? ' active' : ''}" data-filter="${cat}">${cat}</button>`)
    .join('');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const chosen = btn.dataset.filter;
      const visible = chosen === 'All' ? doctorsData : doctorsData.filter(d => d.specialization === chosen);
      renderDoctorCards(gridId, visible, selectable);
    });
  });
}

function renderDoctorCards(gridId, doctors, selectable) {
  const grid = byId(gridId);
  if (!grid) return;
  grid.innerHTML = doctors.map(doc => {
    const initial = doc.name.replace('Dr. ', '').charAt(0);
    return `<div class="doctor-card${selectable ? ' selectable' : ''}" data-id="${doc.id}" onclick="${selectable ? `selectDoctor(${doc.id})` : ''}" id="docCard${doc.id}">
      <div class="doctor-avatar">${initial}</div>
      <h3>${doc.name}</h3>
      <p class="doctor-specialty">${doc.specialization}</p>
      <div class="doctor-meta">
        <span>Rating: ${doc.rating} / 5</span>
        <span>Experience: ${doc.experience} yrs</span>
      </div>
    </div>`;
  }).join('');
}

async function renderDoctorsPage() {
  await syncDoctorsData();
  renderDoctorCards('doctorsGrid', doctorsData, false);
}

// ========================================================
// BOOKING (one page, three stacked steps)
//   1. pick doctor  2. pick date + time  3. confirm
// ========================================================

let pickedDoctor = null;
let pickedSlot = null;

function resetBookingWizard() {
  pickedDoctor = null;
  pickedSlot = null;

  // show the form, hide any leftover confirmation card
  const confirmCard = byId('bookingStepConfirmed');
  if (confirmCard) confirmCard.style.display = 'none';

  const formWrapper = byId('bookingFormWrapper');
  if (formWrapper) formWrapper.style.display = 'block';

  renderDoctorCards('bookingDoctorsGrid', doctorsData, true);

  const dateInput = byId('apptDate');
  if (dateInput) {
    dateInput.value = '';
    dateInput.min = new Date().toISOString().split('T')[0]; // no past dates
    dateInput.onchange = function () {
      const dateLabel = byId('summaryDate');
      if (dateLabel) {
        dateLabel.textContent = this.value ? formatDate(this.value) : 'Not selected';
      }
    };
  }

  const reasonBox = byId('visitReason');
  if (reasonBox) reasonBox.value = '';

  renderTimeSlots();
  updateBookingSummary();
}

function selectDoctor(id) {
  pickedDoctor = doctorsData.find(d => d.id === id);
  pickedSlot = null; // slots differ per doctor, so clear the old pick

  document.querySelectorAll('#bookingDoctorsGrid .doctor-card').forEach(card => {
    card.classList.toggle('selected', parseInt(card.dataset.id) === id);
  });

  const heading = byId('step2Title');
  const subheading = byId('step2Sub');
  if (heading && pickedDoctor) {
    heading.textContent = `2. Choose Time - Available slots for ${pickedDoctor.name}`;
  }
  if (subheading && pickedDoctor) {
    subheading.textContent = `Select an appointment date and available slot for ${pickedDoctor.name} (${pickedDoctor.specialization})`;
  }

  renderTimeSlots();
  updateBookingSummary();
}

function renderTimeSlots() {
  const slotBox = byId('timeSlots');
  if (!slotBox) return;

  if (!pickedDoctor) {
    slotBox.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Please click on a doctor card above to view their available time slots.</p>';
    return;
  }

  pickedSlot = null;
  slotBox.innerHTML = pickedDoctor.slots.map(slot => `
    <button type="button" class="time-slot" onclick="selectTime(this,'${slot}')">${slot}</button>
  `).join('');
}

function selectTime(btn, time) {
  pickedSlot = time;
  document.querySelectorAll('#timeSlots .time-slot').forEach(s => s.classList.remove('selected'));
  btn.classList.add('selected');
  updateBookingSummary();
}

// Keeps the "step 3" summary box in sync with whatever has been picked so far
function updateBookingSummary() {
  const doctorNameEl = byId('summaryDoctorName');
  const doctorSpecEl = byId('summaryDoctorSpec');
  const dateEl = byId('summaryDate');
  const timeEl = byId('summaryTime');
  const dateInput = byId('apptDate');

  if (doctorNameEl) {
    doctorNameEl.textContent = pickedDoctor ? pickedDoctor.name : 'None selected (please select a doctor above)';
  }
  if (doctorSpecEl) {
    doctorSpecEl.textContent = pickedDoctor ? pickedDoctor.specialization : '--';
  }
  if (dateEl) {
    dateEl.textContent = (dateInput && dateInput.value) ? formatDate(dateInput.value) : 'Not selected';
  }
  if (timeEl) {
    timeEl.textContent = pickedSlot ? pickedSlot : 'Not selected';
  }

  // patient details come from the session and can't be edited here
  const session = getPatientSession();
  const nameEl = byId('confirmPatientName');
  const idEl = byId('confirmPatientId');
  const phoneEl = byId('confirmPatientPhone');
  const hiddenName = byId('patientName');

  if (nameEl && session) nameEl.textContent = session.name;
  if (idEl && session) idEl.textContent = `#${session.id}`;
  if (phoneEl && session) phoneEl.textContent = session.phone || 'N/A';
  if (hiddenName && session) hiddenName.value = session.name;
}

async function confirmBooking() {
  const session = getPatientSession();
  if (!session || !session.id) {
    showToast('Patient session expired. Please verify identity again.', 'error');
    showSection('patientEntrySection');
    return;
  }

  // check each step in order and scroll to the one that's missing
  if (!pickedDoctor) {
    showToast('Please select a doctor from the doctor cards above', 'error');
    byId('bookingDoctorSection')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const apptDate = byId('apptDate')?.value;
  if (!apptDate) {
    showToast('Please select an appointment date', 'error');
    byId('apptDate')?.focus();
    byId('bookingTimeSection')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (!pickedSlot) {
    showToast('Please select an available time slot', 'error');
    byId('timeSlots')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const reason = byId('visitReason')?.value?.trim() || 'General Consultation';
  const confirmBtn = byId('confirmBooking');

  // disable the button so a double click can't create two bookings
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving Appointment...';
  }

  try {
    let booking = null;

    if (dbReady()) {
      const row = {
        patient_id: session.id,
        patient_name: session.name,
        doctor: pickedDoctor.name,
        doctor_id: pickedDoctor.id,
        specialization: pickedDoctor.specialization,
        appointment_date: apptDate,
        appointment_time: pickedSlot,
        reason: reason,
        status: 'upcoming'
      };

      const { data, error } = await supabaseClient
        .from('appointments')
        .insert([row])
        .select();

      if (error) {
        console.error('Supabase appointments insert error:', error);
        if (error.code === '42501') {
          throw new Error('Supabase blocked insert due to RLS policy. Please apply the updated supabase-schema.sql.');
        }
        throw error;
      }

      if (data && data[0]) {
        booking = data[0];
      } else {
        throw new Error('No appointment record returned from database.');
      }
    } else {
      // offline mode
      booking = {
        id: Date.now(),
        patient_id: session.id,
        patient_name: session.name,
        doctor: pickedDoctor.name,
        doctor_id: pickedDoctor.id,
        specialization: pickedDoctor.specialization,
        appointment_date: apptDate,
        appointment_time: pickedSlot,
        reason: reason,
        status: 'upcoming',
        created_at: new Date().toISOString()
      };
      const stored = getAppointments();
      stored.push(booking);
      saveAppointments(stored);
    }

    showToast('Appointment successfully confirmed and registered!', 'success');
    displayBookingConfirmation(booking, session);

  } catch (err) {
    console.error('Booking confirmation error:', err);
    showToast(err.message || 'Failed to confirm booking.', 'error');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Booking';
    }
  }
}

function displayBookingConfirmation(appointment, patient) {
  const formWrapper = byId('bookingFormWrapper');
  if (formWrapper) formWrapper.style.display = 'none';

  const confirmCard = byId('bookingStepConfirmed');
  if (confirmCard) {
    confirmCard.style.display = 'block';

    const refNo = appointment.id || Date.now();
    const refEl = byId('confirmedApptId');
    if (refEl) refEl.textContent = `Appointment Reference: #APT-${refNo}`;

    const fill = (id, text) => {
      const el = byId(id);
      if (el) el.textContent = text || 'N/A';
    };

    fill('confirmedPatientName', patient.name);
    fill('confirmedPatientId', `#${patient.id}`);
    fill('confirmedDoctor', appointment.doctor);
    fill('confirmedSpecialty', appointment.specialization);
    fill('confirmedDateTime', `${formatDate(appointment.appointment_date)} at ${appointment.appointment_time}`);
    fill('confirmedReason', appointment.reason || 'General Consultation');

    confirmCard.scrollIntoView({ behavior: 'smooth' });
  }

  // refresh the history list in the background
  renderPatientDashboard();
}

// ========================================================
// PATIENT DASHBOARD
// ========================================================

async function renderPatientDashboard() {
  if (!isPatientActive()) {
    showSection('patientEntrySection');
    return;
  }

  const session = getPatientSession();
  let myAppointments = [];
  const listBox = byId('appointmentsList');

  try {
    if (dbReady()) {
      if (listBox) {
        listBox.innerHTML = '<p style="padding:1.5rem;text-align:center;color:var(--text-muted);">Loading your appointments from database...</p>';
      }

      // try the RPC first, plain query below if it isn't deployed
      let gotRows = false;
      try {
        const { data: rpcRows, error: rpcError } = await supabaseClient
          .rpc('get_patient_appointments', { p_patient_id: session.id, p_pin: session.pin || '' });
        if (!rpcError && rpcRows) {
          myAppointments = rpcRows;
          gotRows = true;
        }
      } catch (e) { }

      if (!gotRows) {
        const { data, error } = await supabaseClient
          .from('appointments')
          .select('*')
          .eq('patient_id', session.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          myAppointments = data;
        } else {
          console.warn('Appointments fetch note:', error);
        }
      }
    } else {
      myAppointments = getAppointments().filter(a => String(a.patient_id) === String(session.id));
    }
  } catch (err) {
    console.error('Error fetching patient appointments:', err);
    myAppointments = getAppointments().filter(a => String(a.patient_id) === String(session.id));
  }

  // numbers for the stat cards
  const today = new Date();
  const totalCount = myAppointments.length;
  const completedCount = myAppointments.filter(a => a.status === 'completed' || (new Date(a.appointment_date) < today && a.status !== 'cancelled')).length;
  const upcomingCount = myAppointments.filter(a => (a.status === 'upcoming' || !a.status) && new Date(a.appointment_date) >= today).length;
  const cancelledCount = myAppointments.filter(a => a.status === 'cancelled').length;

  const setText = (id, value) => { if (byId(id)) byId(id).textContent = value; };
  setText('patTotalAppt', totalCount);
  setText('patCompleted', completedCount);
  setText('patUpcoming', upcomingCount);
  setText('patCancelled', cancelledCount);

  renderReminders(myAppointments);
  renderPatientAppointments(myAppointments);
  populatePatientSettings();
}

// Reminders = non-cancelled appointments happening within the next 7 days
function renderReminders(appointments) {
  const shortList = byId('remindersList');
  const fullList = byId('allRemindersList');
  if (!shortList && !fullList) return;

  const reminders = [];
  const today = new Date();

  (appointments || []).forEach(a => {
    if (a.status === 'cancelled') return;
    const apptDay = new Date(a.appointment_date);
    const daysLeft = Math.ceil((apptDay - today) / (1000 * 60 * 60 * 24));
    if (daysLeft >= 0 && daysLeft <= 7) {
      reminders.push({
        text: `Upcoming consultation with ${a.doctor} on ${formatDate(a.appointment_date)} at ${a.appointment_time}`,
        badge: daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days`
      });
    }
  });

  if (reminders.length === 0) {
    const emptyMsg = '<p style="padding:1.5rem;text-align:center;color:var(--text-muted);">No upcoming reminders for your appointments.</p>';
    if (shortList) shortList.innerHTML = emptyMsg;
    if (fullList) fullList.innerHTML = emptyMsg;
    return;
  }

  const markup = reminders.map(r => `
    <div class="reminder-item">
      <p>${r.text}</p>
      <span class="reminder-badge">${r.badge}</span>
    </div>
  `).join('');

  if (shortList) shortList.innerHTML = markup;
  if (fullList) fullList.innerHTML = markup;
}

function renderPatientAppointments(appointments) {
  const listBox = byId('appointmentsList');
  if (!listBox) return;

  if (!appointments || appointments.length === 0) {
    listBox.innerHTML = `
      <div class="no-appointments">
        <h3>No Appointments Yet</h3>
        <p>You have not booked any appointments yet. Click "+ Book Appointment" above to schedule one with our specialists.</p>
      </div>
    `;
    return;
  }

  listBox.innerHTML = appointments.map(a => {
    const cancelled = a.status === 'cancelled';
    const confirmed = a.status === 'confirmed' || a.status === 'completed';

    let badge = '<span style="color:#0284c7;font-size:0.75rem;font-weight:600;margin-left:8px;">[Upcoming]</span>';
    if (cancelled) {
      badge = '<span style="color:var(--danger);font-size:0.75rem;font-weight:600;margin-left:8px;">[Cancelled]</span>';
    } else if (confirmed) {
      badge = '<span style="color:var(--success);font-size:0.75rem;font-weight:600;margin-left:8px;">[Confirmed]</span>';
    }

    const actionHtml = cancelled
      ? '<span style="font-size:0.8rem;color:var(--text-muted);">Cancelled</span>'
      : `<button type="button" class="btn btn-danger btn-sm" onclick="cancelAppointment('${a.id}', this)">Cancel</button>`;

    return `<div class="appointment-item" data-id="${a.id}">
      <div class="appt-details">
        <div class="appt-text">
          <h4>${a.patient_name} ${badge}</h4>
          <p>${a.doctor} (${a.specialization}) • ${formatDate(a.appointment_date)} at ${a.appointment_time}</p>
          ${a.reason ? `<p style="font-size:0.76rem;color:var(--text-secondary);margin-top:2px;">Reason: ${a.reason}</p>` : ''}
        </div>
      </div>
      <div>${actionHtml}</div>
    </div>`;
  }).join('');
}

async function cancelAppointment(id, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
  }

  // ids can be numbers (bigint) or strings depending on the table setup
  const lookupId = !isNaN(Number(id)) && String(id).trim() !== '' ? Number(id) : id;

  try {
    if (dbReady()) {
      const { error } = await supabaseClient
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', lookupId)
        .select();

      if (error) {
        console.warn('Supabase update by numericId note:', error);
        // retry once treating the id as text
        const { error: retryError } = await supabaseClient
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', String(id));
        if (retryError) throw retryError;
      }
    }

    // keep the local copy in step too
    try {
      let stored = getAppointments();
      if (Array.isArray(stored) && stored.length > 0) {
        stored = stored.map(x => (String(x.id) === String(id) || String(x.id) === String(lookupId) ? { ...x, status: 'cancelled' } : x));
        saveAppointments(stored);
      }
    } catch (lsErr) {
      console.warn('LocalStorage cancel sync note:', lsErr);
    }

    showToast('Appointment cancelled successfully', 'info');
    await renderPatientDashboard();
  } catch (err) {
    console.error('Cancellation error:', err);
    showToast(err.message || 'Failed to cancel appointment', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cancel';
    }
  }
}

// inline onclick handlers need this on window
window.cancelAppointment = cancelAppointment;

// ========================================================
// PATIENT SETTINGS
// ========================================================

async function populatePatientSettings() {
  const session = getPatientSession();
  if (!session) return;

  const nameField = byId('settingsName');
  const ageField = byId('settingsAge');
  const genderField = byId('settingsGender');
  const emailField = byId('settingsEmail');
  const phoneField = byId('settingsPhone');

  if (nameField) nameField.value = session.name || '';
  if (ageField) ageField.value = session.age || '';
  if (genderField) genderField.value = session.gender || '';
  if (emailField) emailField.value = session.email || '';
  if (phoneField) phoneField.value = session.phone || '';
}

async function savePatientSettings() {
  const session = getPatientSession();
  if (!session || !session.id) {
    showToast('Please identify as a patient first', 'error');
    return;
  }

  const nameField = byId('settingsName');
  const ageField = byId('settingsAge');
  const genderField = byId('settingsGender');
  const emailField = byId('settingsEmail');
  const phoneField = byId('settingsPhone');

  // blank field = keep whatever is already in the session
  const fullName = nameField?.value?.trim() || session.name;
  const age = ageField?.value ? parseInt(ageField.value, 10) : session.age;
  const gender = genderField?.value || session.gender;
  const email = emailField?.value?.trim() || session.email;
  const phone = phoneField?.value?.trim() || session.phone;

  try {
    if (dbReady()) {
      const changes = { full_name: fullName, phone: phone };
      if (age) changes.age = age;
      if (gender) changes.gender = gender;
      if (email) changes.email = email;

      const { error } = await supabaseClient
        .from('patients')
        .update(changes)
        .eq('id', session.id);

      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        // schema doesn't have the extra columns, just update name + phone
        await supabaseClient.from('patients').update({ full_name: fullName, phone: phone }).eq('id', session.id);
      } else if (error) {
        throw error;
      }
    }

    setPatientSession({
      id: session.id,
      full_name: fullName,
      phone: phone,
      age: age,
      gender: gender,
      email: email,
      pin: session.pin
    });

    showToast('Patient details updated successfully!', 'success');
  } catch (e) {
    console.error('Settings update error:', e);
    showToast(e.message || 'Failed to update settings', 'error');
  }
}

// ========================================================
// ADMIN - BOOKINGS
// ========================================================

let adminBookings = [];
let adminStatusFilter = 'all';
let adminSearchText = '';

async function renderAdminDashboard() {
  const listBox = byId('adminAppointments');

  if (listBox) {
    listBox.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--text-muted);">Loading booking records...</p>';
  }

  let bookings = [];

  if (dbReady()) {
    try {
      const { data, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) bookings = data;
    } catch (e) {
      console.warn('Admin fetch fallback:', e);
      bookings = getAppointments();
    }
  } else {
    bookings = getAppointments();
  }

  adminBookings = bookings || [];
  updateAdminStatusCounters();
  applyAdminFilters();
}

// Anything that isn't completed/cancelled (including 'confirmed') counts as upcoming here
function updateAdminStatusCounters() {
  let upcoming = 0;
  let completed = 0;
  let cancelled = 0;

  adminBookings.forEach(b => {
    const status = (b.status || 'upcoming').toLowerCase();
    if (status === 'completed') completed++;
    else if (status === 'cancelled') cancelled++;
    else upcoming++;
  });

  const setText = (id, value) => { if (byId(id)) byId(id).textContent = value; };
  setText('statusTotalCount', adminBookings.length);
  setText('statusUpcomingCount', upcoming);
  setText('statusCompletedCount', completed);
  setText('statusCancelledCount', cancelled);
}

function filterAdminByStatus(status) {
  adminStatusFilter = status;

  document.querySelectorAll('.status-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-filter') === status);
  });

  applyAdminFilters();
}

function handleAdminSearch(text) {
  adminSearchText = (text || '').toLowerCase().trim();
  applyAdminFilters();
}

function applyAdminFilters() {
  const listBox = byId('adminAppointments');
  const countLabel = byId('bookingResultsCount');
  if (!listBox) return;

  const visible = adminBookings.filter(b => {
    const status = (b.status || 'upcoming').toLowerCase();

    if (adminStatusFilter !== 'all') {
      if (adminStatusFilter === 'upcoming' && status !== 'upcoming') return false;
      if (adminStatusFilter === 'completed' && status !== 'completed') return false;
      if (adminStatusFilter === 'cancelled' && status !== 'cancelled') return false;
    }

    if (adminSearchText) {
      const q = adminSearchText;
      const searchable = [
        b.patient_name,
        b.doctor,
        b.specialization,
        b.contact_number,
        b.appointment_date,
        String(b.id || '')
      ].map(v => (v || '').toLowerCase());

      if (!searchable.some(v => v.includes(q)) && !status.includes(q)) return false;
    }

    return true;
  });

  if (countLabel) {
    countLabel.textContent = `${adminBookings.length} Total Bookings`;
  }

  if (visible.length === 0) {
    listBox.innerHTML = `
      <div class="no-appointments" style="padding:2.5rem 1.5rem;text-align:center;">
        <h3 style="margin-bottom:0.5rem;font-size:1.15rem;">No Bookings Found</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;">No appointments booked yet.</p>
      </div>
    `;
    return;
  }

  listBox.innerHTML = visible.map(b => {
    const patientName = b.patient_name || 'Patient';
    const status = (b.status || 'upcoming').toLowerCase();
    const phoneHtml = b.contact_number ? `<span style="color:var(--text-muted);font-size:0.82rem;"> • Tel: ${escapeHtml(b.contact_number)}</span>` : '';
    const idChip = `<span style="font-size:0.75rem;padding:2px 7px;background:var(--bg-light);border:1px solid #cbd5e1;border-radius:4px;color:var(--text-muted);font-weight:600;">ID #${b.id}</span>`;

    let badgeClass = 'status-upcoming';
    let badgeText = 'Upcoming';
    if (status === 'confirmed' || status === 'completed') {
      badgeClass = 'status-confirmed';
      badgeText = 'Confirmed';
    } else if (status === 'cancelled') {
      badgeClass = 'status-cancelled';
      badgeText = 'Cancelled';
    }

    return `
      <div class="appointment-item" data-id="${b.id}" style="align-items:center;flex-wrap:wrap;gap:1rem;padding:1.1rem 1.25rem;">
        <div class="appt-details" style="flex:1;min-width:240px;">
          <div class="appt-text">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <h4 style="margin:0;font-size:1.05rem;">${escapeHtml(patientName)}</h4>
              ${idChip}
              <span class="booking-status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <p style="margin:2px 0 0;font-size:0.88rem;color:var(--text);">
              <strong>${escapeHtml(b.doctor || 'Doctor')}</strong>
              ${b.specialization ? ` <span style="color:var(--text-muted);">(${escapeHtml(b.specialization)})</span>` : ''}
              ${phoneHtml}
            </p>
            <p style="margin:3px 0 0;font-size:0.82rem;color:var(--text-muted);">
              ${formatDate(b.appointment_date)} at ${b.appointment_time || 'N/A'}
            </p>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin:0;">Status:</label>
          <select class="status-select-control" onchange="updateBookingStatus('${b.id}', this.value, this)" title="Change booking status">
            <option value="upcoming" ${status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
            <option value="confirmed" ${(status === 'confirmed' || status === 'completed') ? 'selected' : ''}>Confirmed</option>
            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteAppointment('${b.id}')" title="Delete record">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function updateBookingStatus(id, newStatus, dropdown) {
  const previousStatus = adminBookings.find(x => String(x.id) === String(id))?.status || 'upcoming';
  if (dropdown) dropdown.disabled = true;

  try {
    const asNumber = Number(id);
    const lookupId = isNaN(asNumber) ? id : asNumber;

    if (dbReady()) {
      const { error } = await supabaseClient
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', lookupId);

      if (error) {
        if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
          throw new Error('Supabase RLS policy blocked update. Please run the SQL migration in supabase-schema.sql in your Supabase SQL Editor.');
        }
        throw error;
      }
    }

    // mirror the change in localStorage
    try {
      const stored = getAppointments().map(x => String(x.id) === String(id) ? { ...x, status: newStatus } : x);
      saveAppointments(stored);
    } catch (e) {
      console.warn('LocalStorage status sync note:', e);
    }

    // and in the list currently on screen
    adminBookings = adminBookings.map(x => String(x.id) === String(id) ? { ...x, status: newStatus } : x);

    updateAdminStatusCounters();
    applyAdminFilters();
    showToast(`Booking status updated to ${newStatus}`, 'success');
  } catch (err) {
    console.error('Update booking status error:', err);
    showToast(err.message || 'Failed to update booking status', 'error');
    if (dropdown) {
      dropdown.value = previousStatus;
      dropdown.disabled = false;
    }
  }
}

async function deleteAppointment(id) {
  if (!confirm('Are you sure you want to permanently delete this booking record?')) return;

  try {
    const asNumber = Number(id);
    const lookupId = isNaN(asNumber) ? id : asNumber;

    if (dbReady()) {
      const { error } = await supabaseClient
        .from('appointments')
        .delete()
        .eq('id', lookupId);

      if (error) throw error;
    }

    try {
      const stored = getAppointments().filter(x => String(x.id) !== String(id));
      saveAppointments(stored);
    } catch (e) {
      console.warn('LocalStorage delete sync note:', e);
    }

    adminBookings = adminBookings.filter(x => String(x.id) !== String(id));
    updateAdminStatusCounters();
    applyAdminFilters();

    showToast('Booking record deleted', 'info');
  } catch (err) {
    console.error('Delete error:', err);
    showToast(err.message || 'Failed to delete booking', 'error');
  }
}

// these get called from inline onclick/onchange attributes
window.renderAdminDashboard = renderAdminDashboard;
window.filterAdminByStatus = filterAdminByStatus;
window.handleAdminSearch = handleAdminSearch;
window.updateBookingStatus = updateBookingStatus;
window.deleteAppointment = deleteAppointment;

// --- Admin login (demo credentials) ---
function initAdminLogin() {
  const loginForm = byId('adminLoginForm');
  const logoutBtn = byId('adminLogoutNav');

  if (sessionStorage.getItem('adminLoggedIn') === 'true') {
    showDashboard();
  } else if (logoutBtn) {
    logoutBtn.style.display = 'none';
  }
  if (!loginForm) return;

  loginForm.addEventListener('submit', ev => {
    ev.preventDefault();
    const username = byId('adminUsername').value.trim();
    const password = byId('adminPassword').value.trim();
    if (username === 'admin' && password === 'admin123') {
      sessionStorage.setItem('adminLoggedIn', 'true');
      showToast('Welcome, Admin!', 'success');
      showDashboard();
    } else {
      const errMsg = byId('adminError');
      if (errMsg) errMsg.style.display = 'block';
    }
  });
}

function showDashboard() {
  const loginOverlay = byId('adminLoginOverlay');
  const dashboard = byId('dashboardContent');
  if (loginOverlay) loginOverlay.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');

  const logoutBtn = byId('adminLogoutNav');
  if (logoutBtn) logoutBtn.style.display = 'inline-block';
  updateNavbarAuth();
  renderAdminDashboard();
}

function adminLogout() {
  sessionStorage.removeItem('adminLoggedIn');
  const loginOverlay = byId('adminLoginOverlay');
  const dashboard = byId('dashboardContent');
  if (loginOverlay) loginOverlay.classList.remove('hidden');
  if (dashboard) dashboard.classList.add('hidden');

  const logoutBtn = byId('adminLogoutNav');
  if (logoutBtn) logoutBtn.style.display = 'none';
  updateNavbarAuth();
  showToast('Logged out', 'info');
}

// ========================================================
// PAGE LOAD
// ========================================================

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();
  initSidebar();
  initAdminLogin();
  updatePatientBanner();

  // public doctors listing page
  if (byId('doctorsGrid')) {
    await renderDoctorsPage();
  }

  // patient portal
  if (byId('patientEntrySection') || byId('appointmentsList')) {
    const step = new URLSearchParams(window.location.search).get('step');

    if (isPatientActive()) {
      await syncDoctorsData();
      if (step === 'doctor') {
        showSection('bookingSection');
        resetBookingWizard();
      } else {
        showSection('appointmentsSection');
        await renderPatientDashboard();
      }
    } else {
      // nobody identified yet -> force the entry screen
      showSection('patientEntrySection');
    }
  }

  // older booking wizard layout
  if (byId('bookingStep1')) {
    await syncDoctorsData();
  }
});