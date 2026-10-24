// ========================================================
// SmartCare - Hospital Appointment System
// Clean, simplified client script with Supabase & offline support
// ========================================================

// Doctor catalog fallback
let doctorsData = [
  { id: 1, name: "Dr. Patel", specialization: "Cardiology", slots: ["9:00 AM", "10:00 AM", "2:00 PM", "4:00 PM"], rating: 4.8, experience: 15 },
  { id: 2, name: "Dr. Smith", specialization: "Dermatology", slots: ["8:00 AM", "11:00 AM", "1:00 PM", "3:00 PM"], rating: 4.6, experience: 12 },
  { id: 3, name: "Dr. Kumar", specialization: "Orthopedics", slots: ["10:00 AM", "12:00 PM", "3:00 PM"], rating: 4.9, experience: 20 },
  { id: 4, name: "Dr. Kannal", specialization: "General Medicine", slots: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM", "6:00 PM"], rating: 4.7, experience: 10 },
  { id: 5, name: "Dr. K Yadav", specialization: "Pediatrics", slots: ["8:30 AM", "10:30 AM", "1:30 PM"], rating: 4.6, experience: 8 },
  { id: 6, name: "Dr. Das", specialization: "Neurology", slots: ["10:00 AM", "11:00 AM", "3:00 PM"], rating: 4.5, experience: 18 }
];

let pickedDoctor = null;
let pickedSlot = null;
let adminBookings = [];

// DOM & Utility helpers
const byId = id => document.getElementById(id);
const fieldValue = id => byId(id)?.value?.trim() || '';

function dbReady() {
  return typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && Boolean(supabaseClient);
}

function getAppointments() { return JSON.parse(localStorage.getItem('appointments') || '[]'); }
function saveAppointments(list) { localStorage.setItem('appointments', JSON.stringify(list)); }
function getPatients() { return JSON.parse(localStorage.getItem('patients') || '[]'); }
function savePatients(list) { localStorage.setItem('patients', JSON.stringify(list)); }

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

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));
}


// ========================================================
// PATIENT AUTH & SESSION
// ========================================================

function isPatientActive() {
  return Boolean(sessionStorage.getItem('patientDbId'));
}

function getPatientSession() {
  const dbId = sessionStorage.getItem('patientDbId');
  if (!dbId) return null;
  return {
    id: parseInt(dbId, 10),
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

  updatePatientBanner();
  updateNavbarAuth();
}

function clearPatientSession() {
  ['patientLoggedIn', 'patientDbId', 'patientName', 'patientPhone', 'patientAge', 'patientGender', 'patientEmail', 'patientPin', 'patientId']
    .forEach(k => sessionStorage.removeItem(k));
  updatePatientBanner();
  updateNavbarAuth();
}

function updatePatientBanner() {
  const banner = byId('activePatientBanner');
  if (!banner) return;
  const session = getPatientSession();
  if (session) {
    banner.style.display = 'flex';
    if (byId('patientIdBadge')) byId('patientIdBadge').textContent = `PID: #${session.id}`;
    if (byId('patientBannerName')) byId('patientBannerName').textContent = session.name;
    if (byId('patientBannerMeta')) {
      byId('patientBannerMeta').textContent = `${session.phone ? session.phone + ' • ' : ''}${session.age ? session.age + ' yrs • ' : ''}${session.gender || ''}`;
    }
  } else {
    banner.style.display = 'none';
  }
}

function updateNavbarAuth() {
  const patientActive = isPatientActive();
  const adminActive = sessionStorage.getItem('adminLoggedIn') === 'true';
  const adminBtn = byId('adminLogoutNav');
  const patientBtn = byId('patientLogoutNav');
  if (adminBtn) adminBtn.style.display = adminActive ? 'inline-block' : 'none';
  if (patientBtn) patientBtn.style.display = patientActive ? 'inline-block' : 'none';
}

async function patientLogout() {
  if (dbReady()) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
  }
  clearPatientSession();
  showToast('Patient session ended', 'info');
  if (byId('patientEntrySection')) {
    showSection('patientEntrySection');
  } else {
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  }
}


// ========================================================
// PATIENT ENTRY (REGISTRATION & VERIFICATION)
// ========================================================

function switchEntryTab(tab) {
  const isNew = tab === 'new';
  byId('pageNewPatientTab')?.classList.toggle('active', isNew);
  byId('pageExistingPatientTab')?.classList.toggle('active', !isNew);
  byId('pageNewPatientForm')?.classList.toggle('active', isNew);
  byId('pageExistingPatientForm')?.classList.toggle('active', !isNew);
}

function setFieldErr(id, hasErr, msg) {
  const el = byId(id);
  if (el) {
    if (hasErr && msg) el.textContent = msg;
    el.classList.toggle('active', hasErr);
  }
  return !hasErr;
}

function validateRegistration(data) {
  const validName = setFieldErr('pageNewNameErr', !data.full_name || data.full_name.trim().length < 2, 'Full name is required (at least 2 letters).');
  const age = parseInt(data.age, 10);
  const validAge = setFieldErr('pageNewAgeErr', isNaN(age) || age < 1 || age > 120, 'Enter a valid age between 1 and 120.');
  const validGender = setFieldErr('pageNewGenderErr', !data.gender, 'Please select a gender.');
  const digits = (data.phone || '').replace(/[\s\-\(\)\+]/g, '');
  const validPhone = setFieldErr('pageNewPhoneErr', !digits || digits.length < 7 || !/^\d+$/.test(digits), 'Enter a valid phone number (at least 7 digits).');
  const email = (data.email || '').trim();
  const validEmail = setFieldErr('pageNewEmailErr', email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Please enter a valid email format.');
  const validPin = setFieldErr('pageNewPinErr', !data.pin || data.pin.length < 4 || data.pin.length > 6, 'PIN must be 4 to 6 characters.');

  return validName && validAge && validGender && validPhone && validEmail && validPin;
}

async function handlePatientRegistration(formData) {
  if (!validateRegistration(formData)) {
    showToast('Please fix the errors in the registration form', 'error');
    return;
  }

  const submitBtn = byId('pageNewSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering Patient...';
  }

  try {
    let newPatient = null;

    if (dbReady()) {
      const row = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        age: parseInt(formData.age, 10),
        gender: formData.gender,
        email: formData.email ? formData.email.trim() : null,
        pin: formData.pin
      };
      const { data, error } = await supabaseClient.from('patients').insert([row]).select();
      if (error) throw error;
      if (data && data[0]) newPatient = data[0];
    } else {
      newPatient = {
        id: Date.now(),
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        age: parseInt(formData.age, 10),
        gender: formData.gender,
        email: formData.email ? formData.email.trim() : '',
        pin: formData.pin
      };
      const saved = getPatients();
      saved.push(newPatient);
      savePatients(saved);
    }

    setPatientSession(newPatient);
    showToast(`Registration successful! Your Patient ID is #${newPatient.id}`, 'success');
    showSection('bookingSection');
    resetBookingWizard();
  } catch (err) {
    console.error('Registration error:', err);
    showToast(err.message || 'Registration failed. Please try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register & Select Doctor';
    }
  }
}

async function handlePatientVerification(patientIdRaw, pinRaw) {
  setFieldErr('pageExistIdErr', false);
  setFieldErr('pageExistPinErr', false);

  const patientId = parseInt((patientIdRaw || '').replace(/[^0-9]/g, ''), 10);
  const pin = (pinRaw || '').trim();

  if (isNaN(patientId) || patientId <= 0) {
    setFieldErr('pageExistIdErr', true, 'Please enter a valid numeric Patient ID.');
    showToast('Invalid Patient ID', 'error');
    return;
  }

  if (!pin || pin.length < 4) {
    setFieldErr('pageExistPinErr', true, 'Please enter your 4-6 digit Security PIN.');
    showToast('Security PIN is required', 'error');
    return;
  }

  const submitBtn = byId('pageExistSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Credentials...';
  }

  try {
    let verified = null;

    if (dbReady()) {
      const { data: row, error } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .maybeSingle();

      if (error) throw error;
      if (!row) throw new Error(`No patient record found for Patient ID #${patientId}.`);

      if (row.pin && row.pin !== pin) {
        throw new Error('Authentication failed. Invalid Security PIN for this Patient ID.');
      }
      verified = { ...row, pin };
    } else {
      const match = getPatients().find(p => String(p.id) === String(patientId));
      if (!match) throw new Error(`No patient found with ID #${patientId}`);
      if (match.pin && match.pin !== pin) throw new Error('Invalid Security PIN.');
      verified = match;
    }

    setPatientSession(verified);
    showToast(`Identity verified! Welcome back, ${verified.full_name}`, 'success');
    showSection('appointmentsSection');
    await renderPatientDashboard();
  } catch (err) {
    console.error('Verification error:', err);
    showToast(err.message || 'Identity verification failed.', 'error');
    setFieldErr('pageExistPinErr', true, err.message || 'Authentication failed. Please verify credentials.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Identity & Continue';
    }
  }
}


// ========================================================
// SECTION NAVIGATION
// ========================================================

function showSection(sectionId) {
  const main = document.querySelector('.dashboard-main');
  if (!main) return;
  if (!isPatientActive() && sectionId !== 'patientEntrySection') {
    sectionId = 'patientEntrySection';
  }
  main.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.remove('active'));
  byId(sectionId)?.classList.add('active');
  if (sectionId === 'bookingSection') resetBookingWizard();
}


// ========================================================
// DOCTORS CATALOG & RENDERING
// ========================================================

async function syncDoctorsData() {
  if (!dbReady()) return;
  try {
    const { data, error } = await supabaseClient.from('doctors').select('*').order('id', { ascending: true });
    if (!error && data && data.length > 0) {
      doctorsData = data.filter(d => d.available !== false).map((row, i) => ({
        id: row.id || (i + 1),
        name: row.name,
        specialization: row.specialization,
        slots: row.slots ? (Array.isArray(row.slots) ? row.slots : JSON.parse(row.slots)) : ["9:00 AM", "10:00 AM", "2:00 PM", "4:00 PM"],
        rating: Number(row.rating) || 4.7,
        experience: Number(row.experience) || 10
      }));
    }
  } catch (e) {
    console.warn('Doctors sync note:', e);
  }
}

function renderDoctorCards(gridId, doctors, selectable) {
  const grid = byId(gridId);
  if (!grid) return;
  grid.innerHTML = doctors.map(doc => {
    const initial = doc.name.replace('Dr. ', '').charAt(0);
    return `
      <div class="doctor-card${selectable ? ' selectable' : ''}" data-id="${doc.id}" onclick="${selectable ? `selectDoctor(${doc.id})` : ''}" id="docCard${doc.id}">
        <div class="doctor-avatar">${initial}</div>
        <h3>${escapeHtml(doc.name)}</h3>
        <p class="doctor-specialty">${escapeHtml(doc.specialization)}</p>
        <div class="doctor-meta">
          <span>Rating: ${doc.rating} / 5</span>
          <span>Experience: ${doc.experience} yrs</span>
        </div>
      </div>
    `;
  }).join('');
}

async function renderDoctorsPage() {
  await syncDoctorsData();
  renderDoctorCards('doctorsGrid', doctorsData, false);
}


// ========================================================
// APPOINTMENT BOOKING WIZARD
// ========================================================

function resetBookingWizard() {
  pickedDoctor = null;
  pickedSlot = null;

  if (byId('bookingStepConfirmed')) byId('bookingStepConfirmed').style.display = 'none';
  if (byId('bookingFormWrapper')) byId('bookingFormWrapper').style.display = 'block';

  renderDoctorCards('bookingDoctorsGrid', doctorsData, true);

  const dateInput = byId('apptDate');
  if (dateInput) {
    dateInput.value = '';
    dateInput.min = new Date().toISOString().split('T')[0];
    dateInput.onchange = function () {
      if (byId('summaryDate')) byId('summaryDate').textContent = this.value ? formatDate(this.value) : 'Not selected';
    };
  }

  if (byId('visitReason')) byId('visitReason').value = '';
  renderTimeSlots();
  updateBookingSummary();
}

function selectDoctor(id) {
  pickedDoctor = doctorsData.find(d => d.id === id);
  pickedSlot = null;

  document.querySelectorAll('#bookingDoctorsGrid .doctor-card').forEach(c => {
    c.classList.toggle('selected', parseInt(c.dataset.id, 10) === id);
  });

  if (byId('step2Title') && pickedDoctor) {
    byId('step2Title').textContent = `2. Choose Time - Available slots for ${pickedDoctor.name}`;
  }
  if (byId('step2Sub') && pickedDoctor) {
    byId('step2Sub').textContent = `Select an appointment date and slot for ${pickedDoctor.name} (${pickedDoctor.specialization})`;
  }

  renderTimeSlots();
  updateBookingSummary();
}

function renderTimeSlots() {
  const slotBox = byId('timeSlots');
  if (!slotBox) return;

  if (!pickedDoctor) {
    slotBox.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Please select a doctor above to view available time slots.</p>';
    return;
  }

  pickedSlot = null;
  slotBox.innerHTML = pickedDoctor.slots.map(s => `
    <button type="button" class="time-slot" onclick="selectTime(this, '${s}')">${s}</button>
  `).join('');
}

function selectTime(btn, time) {
  pickedSlot = time;
  document.querySelectorAll('#timeSlots .time-slot').forEach(s => s.classList.remove('selected'));
  btn.classList.add('selected');
  updateBookingSummary();
}

function updateBookingSummary() {
  const dateInput = byId('apptDate');
  if (byId('summaryDoctorName')) byId('summaryDoctorName').textContent = pickedDoctor ? pickedDoctor.name : 'None selected (please select a doctor above)';
  if (byId('summaryDoctorSpec')) byId('summaryDoctorSpec').textContent = pickedDoctor ? pickedDoctor.specialization : '--';
  if (byId('summaryDate')) byId('summaryDate').textContent = (dateInput && dateInput.value) ? formatDate(dateInput.value) : 'Not selected';
  if (byId('summaryTime')) byId('summaryTime').textContent = pickedSlot || 'Not selected';

  const session = getPatientSession();
  if (byId('confirmPatientName') && session) byId('confirmPatientName').textContent = session.name;
  if (byId('confirmPatientId') && session) byId('confirmPatientId').textContent = `#${session.id}`;
  if (byId('confirmPatientPhone') && session) byId('confirmPatientPhone').textContent = session.phone || 'N/A';
  if (byId('patientName') && session) byId('patientName').value = session.name;
}

async function confirmBooking() {
  const session = getPatientSession();
  if (!session || !session.id) {
    showToast('Patient session expired. Please verify identity again.', 'error');
    showSection('patientEntrySection');
    return;
  }

  if (!pickedDoctor) {
    showToast('Please select a doctor from the cards above', 'error');
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
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving Appointment...';
  }

  try {
    let booking = null;
    const row = {
      patient_id: session.id,
      patient_name: session.name,
      doctor: pickedDoctor.name,
      doctor_id: pickedDoctor.id,
      specialization: pickedDoctor.specialization,
      appointment_date: apptDate,
      appointment_time: pickedSlot,
      reason,
      status: 'upcoming'
    };

    if (dbReady()) {
      const { data, error } = await supabaseClient.from('appointments').insert([row]).select();
      if (error) throw error;
      if (data && data[0]) booking = data[0];
    } else {
      booking = { ...row, id: Date.now(), created_at: new Date().toISOString() };
      const stored = getAppointments();
      stored.push(booking);
      saveAppointments(stored);
    }

    showToast('Appointment successfully confirmed!', 'success');
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
  if (byId('bookingFormWrapper')) byId('bookingFormWrapper').style.display = 'none';

  const card = byId('bookingStepConfirmed');
  if (card) {
    card.style.display = 'block';
    const fill = (id, text) => { if (byId(id)) byId(id).textContent = text || 'N/A'; };
    fill('confirmedApptId', `Appointment Reference: #APT-${appointment.id || Date.now()}`);
    fill('confirmedPatientName', patient.name);
    fill('confirmedPatientId', `#${patient.id}`);
    fill('confirmedDoctor', appointment.doctor);
    fill('confirmedSpecialty', appointment.specialization);
    fill('confirmedDateTime', `${formatDate(appointment.appointment_date)} at ${appointment.appointment_time}`);
    fill('confirmedReason', appointment.reason || 'General Consultation');
    card.scrollIntoView({ behavior: 'smooth' });
  }

  renderPatientDashboard();
}


// ========================================================
// PATIENT DASHBOARD & APPOINTMENTS HISTORY
// ========================================================

async function renderPatientDashboard() {
  if (!isPatientActive()) {
    showSection('patientEntrySection');
    return;
  }

  const session = getPatientSession();
  let myAppointments = [];
  const listBox = byId('appointmentsList');
  if (listBox) listBox.innerHTML = '<p style="padding:1.5rem;text-align:center;color:var(--text-muted);">Loading your appointments...</p>';

  try {
    if (dbReady()) {
      const { data, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('patient_id', session.id)
        .order('appointment_date', { ascending: false });
      if (!error && data) myAppointments = data;
    } else {
      myAppointments = getAppointments().filter(a => String(a.patient_id) === String(session.id));
    }
  } catch (err) {
    console.error('Error fetching appointments:', err);
    myAppointments = getAppointments().filter(a => String(a.patient_id) === String(session.id));
  }

  renderPatientAppointments(myAppointments);
  populatePatientSettings();
}

function renderPatientAppointments(appointments) {
  const listBox = byId('appointmentsList');
  if (!listBox) return;

  if (!appointments || appointments.length === 0) {
    listBox.innerHTML = `
      <div class="no-appointments">
        <h3>No Appointments Yet</h3>
        <p>You have not booked any appointments yet. Click "+ Book Appointment" above to schedule one.</p>
      </div>
    `;
    return;
  }

  listBox.innerHTML = appointments.map(a => {
    const isCancelled = a.status === 'cancelled';
    const isConfirmed = a.status === 'confirmed' || a.status === 'completed';

    let badge = '<span style="color:#0284c7;font-size:0.75rem;font-weight:600;margin-left:8px;">[Upcoming]</span>';
    if (isCancelled) badge = '<span style="color:var(--danger);font-size:0.75rem;font-weight:600;margin-left:8px;">[Cancelled]</span>';
    else if (isConfirmed) badge = '<span style="color:var(--success);font-size:0.75rem;font-weight:600;margin-left:8px;">[Confirmed]</span>';

    const action = isCancelled
      ? '<span style="font-size:0.8rem;color:var(--text-muted);">Cancelled</span>'
      : `<button type="button" class="btn btn-danger btn-sm" onclick="cancelAppointment('${a.id}', this)">Cancel</button>`;

    return `
      <div class="appointment-item" data-id="${a.id}">
        <div class="appt-details">
          <div class="appt-text">
            <h4>${escapeHtml(a.patient_name)} ${badge}</h4>
            <p>${escapeHtml(a.doctor)} (${escapeHtml(a.specialization)}) • ${formatDate(a.appointment_date)} at ${escapeHtml(a.appointment_time)}</p>
            ${a.reason ? `<p style="font-size:0.76rem;color:var(--text-secondary);margin-top:2px;">Reason: ${escapeHtml(a.reason)}</p>` : ''}
          </div>
        </div>
        <div>${action}</div>
      </div>
    `;
  }).join('');
}

async function cancelAppointment(id, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
  }

  const lookupId = !isNaN(Number(id)) && String(id).trim() !== '' ? Number(id) : id;

  try {
    if (dbReady()) {
      const { error } = await supabaseClient.from('appointments').update({ status: 'cancelled' }).eq('id', lookupId);
      if (error) throw error;
    } else {
      const stored = getAppointments().map(x => String(x.id) === String(id) ? { ...x, status: 'cancelled' } : x);
      saveAppointments(stored);
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


// ========================================================
// PATIENT SETTINGS
// ========================================================

function populatePatientSettings() {
  const session = getPatientSession();
  if (!session) return;
  if (byId('settingsName')) byId('settingsName').value = session.name || '';
  if (byId('settingsAge')) byId('settingsAge').value = session.age || '';
  if (byId('settingsGender')) byId('settingsGender').value = session.gender || '';
  if (byId('settingsEmail')) byId('settingsEmail').value = session.email || '';
  if (byId('settingsPhone')) byId('settingsPhone').value = session.phone || '';
}

async function savePatientSettings() {
  const session = getPatientSession();
  if (!session || !session.id) {
    showToast('Please identify as a patient first', 'error');
    return;
  }

  const fullName = byId('settingsName')?.value?.trim() || session.name;
  const age = byId('settingsAge')?.value ? parseInt(byId('settingsAge').value, 10) : session.age;
  const gender = byId('settingsGender')?.value || session.gender;
  const email = byId('settingsEmail')?.value?.trim() || session.email;
  const phone = byId('settingsPhone')?.value?.trim() || session.phone;

  try {
    if (dbReady()) {
      const changes = { full_name: fullName, phone };
      if (age) changes.age = age;
      if (gender) changes.gender = gender;
      if (email) changes.email = email;
      const { error } = await supabaseClient.from('patients').update(changes).eq('id', session.id);
      if (error) throw error;
    }

    setPatientSession({ id: session.id, full_name: fullName, phone, age, gender, email, pin: session.pin });
    showToast('Patient details updated successfully!', 'success');
  } catch (e) {
    console.error('Settings update error:', e);
    showToast(e.message || 'Failed to update settings', 'error');
  }
}


// ========================================================
// ADMIN DASHBOARD
// ========================================================

async function renderAdminDashboard() {
  const listBox = byId('adminAppointments');
  if (listBox) listBox.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--text-muted);">Loading booking records...</p>';

  if (dbReady()) {
    try {
      const { data, error } = await supabaseClient.from('appointments').select('*').order('created_at', { ascending: false });
      if (!error && data) adminBookings = data;
    } catch (e) {
      console.warn('Admin fetch note:', e);
      adminBookings = getAppointments();
    }
  } else {
    adminBookings = getAppointments();
  }

  renderAdminList();
}

function renderAdminList() {
  const listBox = byId('adminAppointments');
  if (!listBox) return;

  if (byId('bookingResultsCount')) {
    byId('bookingResultsCount').textContent = `${adminBookings.length} Total Bookings`;
  }

  if (adminBookings.length === 0) {
    listBox.innerHTML = `
      <div class="no-appointments" style="padding:2.5rem 1.5rem;text-align:center;">
        <h3 style="margin-bottom:0.5rem;font-size:1.15rem;">No Bookings Found</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;">No appointments booked yet.</p>
      </div>
    `;
    return;
  }

  listBox.innerHTML = adminBookings.map(b => {
    const patientName = b.patient_name || 'Patient';
    const status = (b.status || 'upcoming').toLowerCase();
    const isConf = status === 'confirmed' || status === 'completed';
    const isCanc = status === 'cancelled';
    const badgeClass = isCanc ? 'status-cancelled' : isConf ? 'status-confirmed' : 'status-upcoming';
    const badgeText = isCanc ? 'Cancelled' : isConf ? 'Confirmed' : 'Upcoming';

    return `
      <div class="appointment-item" data-id="${b.id}" style="align-items:center;flex-wrap:wrap;gap:1rem;padding:1.1rem 1.25rem;">
        <div class="appt-details" style="flex:1;min-width:240px;">
          <div class="appt-text">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <h4 style="margin:0;font-size:1.05rem;">${escapeHtml(patientName)}</h4>
              <span style="font-size:0.75rem;padding:2px 7px;background:var(--bg-light);border:1px solid #cbd5e1;border-radius:4px;color:var(--text-muted);font-weight:600;">ID #${b.id}</span>
              <span class="booking-status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <p style="margin:2px 0 0;font-size:0.88rem;color:var(--text);">
              <strong>${escapeHtml(b.doctor || 'Doctor')}</strong>
              ${b.specialization ? ` <span style="color:var(--text-muted);">(${escapeHtml(b.specialization)})</span>` : ''}
            </p>
            <p style="margin:3px 0 0;font-size:0.82rem;color:var(--text-muted);">
              ${formatDate(b.appointment_date)} at ${escapeHtml(b.appointment_time || 'N/A')}
            </p>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin:0;">Status:</label>
          <select class="status-select-control" onchange="updateBookingStatus('${b.id}', this.value, this)" title="Change booking status">
            <option value="upcoming" ${status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
            <option value="confirmed" ${isConf ? 'selected' : ''}>Confirmed</option>
            <option value="cancelled" ${isCanc ? 'selected' : ''}>Cancelled</option>
          </select>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteAppointment('${b.id}')" title="Delete record">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function updateBookingStatus(id, newStatus, dropdown) {
  const prev = adminBookings.find(x => String(x.id) === String(id))?.status || 'upcoming';
  if (dropdown) dropdown.disabled = true;

  try {
    const lookupId = !isNaN(Number(id)) ? Number(id) : id;
    if (dbReady()) {
      const { error } = await supabaseClient.from('appointments').update({ status: newStatus }).eq('id', lookupId);
      if (error) throw error;
    } else {
      const stored = getAppointments().map(x => String(x.id) === String(id) ? { ...x, status: newStatus } : x);
      saveAppointments(stored);
    }

    adminBookings = adminBookings.map(x => String(x.id) === String(id) ? { ...x, status: newStatus } : x);
    renderAdminList();
    showToast(`Booking status updated to ${newStatus}`, 'success');
  } catch (err) {
    console.error('Update status error:', err);
    showToast(err.message || 'Failed to update status', 'error');
    if (dropdown) {
      dropdown.value = prev;
      dropdown.disabled = false;
    }
  }
}

async function deleteAppointment(id) {
  if (!confirm('Are you sure you want to delete this booking record?')) return;

  try {
    const lookupId = !isNaN(Number(id)) ? Number(id) : id;
    if (dbReady()) {
      const { error } = await supabaseClient.from('appointments').delete().eq('id', lookupId);
      if (error) throw error;
    } else {
      const stored = getAppointments().filter(x => String(x.id) !== String(id));
      saveAppointments(stored);
    }

    adminBookings = adminBookings.filter(x => String(x.id) !== String(id));
    renderAdminList();
    showToast('Booking record deleted', 'info');
  } catch (err) {
    console.error('Delete error:', err);
    showToast(err.message || 'Failed to delete booking', 'error');
  }
}

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
    const u = byId('adminUsername')?.value?.trim();
    const p = byId('adminPassword')?.value?.trim();
    if (u === 'admin' && p === 'admin123') {
      sessionStorage.setItem('adminLoggedIn', 'true');
      showToast('Welcome, Admin!', 'success');
      showDashboard();
    } else if (byId('adminError')) {
      byId('adminError').style.display = 'block';
    }
  });
}

function showDashboard() {
  byId('adminLoginOverlay')?.classList.add('hidden');
  byId('dashboardContent')?.classList.remove('hidden');
  const logoutBtn = byId('adminLogoutNav');
  if (logoutBtn) logoutBtn.style.display = 'inline-block';
  updateNavbarAuth();
  renderAdminDashboard();
}

function adminLogout() {
  sessionStorage.removeItem('adminLoggedIn');
  byId('adminLoginOverlay')?.classList.remove('hidden');
  byId('dashboardContent')?.classList.add('hidden');
  const logoutBtn = byId('adminLogoutNav');
  if (logoutBtn) logoutBtn.style.display = 'none';
  updateNavbarAuth();
  showToast('Logged out', 'info');
}


// ========================================================
// GLOBAL BINDINGS (FOR HTML EVENT ATTRIBUTES)
// ========================================================

window.patientLogout = patientLogout;
window.switchEntryTab = switchEntryTab;
window.showSection = showSection;
window.selectDoctor = selectDoctor;
window.selectTime = selectTime;
window.confirmBooking = confirmBooking;
window.resetBookingWizard = resetBookingWizard;
window.cancelAppointment = cancelAppointment;
window.savePatientSettings = savePatientSettings;
window.adminLogout = adminLogout;
window.renderAdminDashboard = renderAdminDashboard;
window.updateBookingStatus = updateBookingStatus;
window.deleteAppointment = deleteAppointment;
window.isPatientActive = isPatientActive;
window.showToast = showToast;
window.getPatients = getPatients;
window.savePatients = savePatients;
window.getAppointments = getAppointments;
window.saveAppointments = saveAppointments;


// ========================================================
// PAGE INITIALIZATION
// ========================================================

function initNavbar() {
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    document.addEventListener('click', ev => {
      if (!ev.target.closest('.navbar')) navLinks.classList.remove('open');
    });
  }
  updateNavbarAuth();
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();
  initAdminLogin();
  updatePatientBanner();

  const pageSignup = byId('pageNewPatientForm');
  if (pageSignup) {
    pageSignup.addEventListener('submit', ev => {
      ev.preventDefault();
      handlePatientRegistration({
        full_name: fieldValue('pageNewName'),
        age: fieldValue('pageNewAge'),
        gender: fieldValue('pageNewGender'),
        phone: fieldValue('pageNewPhone'),
        email: fieldValue('pageNewEmail'),
        pin: fieldValue('pageNewPin')
      });
    });
  }

  const pageLogin = byId('pageExistingPatientForm');
  if (pageLogin) {
    pageLogin.addEventListener('submit', ev => {
      ev.preventDefault();
      handlePatientVerification(fieldValue('pageExistId'), fieldValue('pageExistPin'));
    });
  }

  if (byId('doctorsGrid')) {
    await renderDoctorsPage();
  }

  if (byId('patientEntrySection') || byId('appointmentsList')) {
    const step = new URLSearchParams(window.location.search).get('step');
    if (isPatientActive()) {
      await syncDoctorsData();
      if (step === 'doctor') {
        showSection('bookingSection');
      } else {
        showSection('appointmentsSection');
        await renderPatientDashboard();
      }
    } else {
      showSection('patientEntrySection');
    }
  }
});