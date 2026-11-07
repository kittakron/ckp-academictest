// =====================================================================
// SciMath Test — หน้าเว็บหลัก (เชื่อมกับ Supabase ผ่าน assets/js/api.js)
// =====================================================================
'use strict';

/* ---------------------------------------------------------------------
   ตัวช่วยพื้นฐาน
--------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

// escape ข้อความก่อนใส่ใน innerHTML — ข้อมูลทุกอย่างที่ผู้ใช้กรอกต้องผ่านฟังก์ชันนี้
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// อนุญาตเฉพาะรูป base64 ที่ถูกต้องเท่านั้น
function safeImg(u) {
  return /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(u || '') ? u : '';
}
// อนุญาตเฉพาะลิงก์ http/https
function safeUrl(u) {
  try { const x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : ''; }
  catch (e) { return ''; }
}
function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '-' : d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
let toastTimer = null;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5000 : 2600);
}
function showErr(id, msg) { const el = $(id); el.textContent = msg; el.classList.add('show'); }
function clearErr(id) { const el = $(id); el.classList.remove('show'); el.textContent = ''; }
async function withBusy(btn, label, fn) {
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}
function idDigits(v) { return String(v || '').replace(/\D/g, ''); }

/* ---------------------------------------------------------------------
   สถานะรวมของแอป
--------------------------------------------------------------------- */
const DEFAULTS = {
  org_name: 'ศูนย์พัฒนาอัจฉริยภาพวิทยาศาสตร์-คณิตศาสตร์', site_name: 'SciMath Test', app_prefix: 'SM-',
  subject_fee: '60', pass_score: '50', reg_open: '1', require_photo: '1', require_slip: '1', batch_prefix: 'SCH-', date_card: '',
  reg_closed_message: '', reg_period_display: '', results_published: '0', results_message: '',
  exam_date_iso: '', exam_date_display: '', exam_time_display: '', exam_site_name: '', exam_venue_display: '',
  date_reg: '', date_list: '', date_result: '', contact_phone: '', contact_email: '', contact_address: '', bank_info: ''
};
let S = Object.assign({}, DEFAULTS);   // settings
let currentStudent = null;             // ผู้สมัครที่ล็อกอินอยู่ (เก็บในหน่วยความจำเท่านั้น)
let studentAuth = null;                // { id, birth } ใช้ตอนอัปโหลดสลิปซ้ำ
let isAdmin = false;
let adminEmail = '';
let applicantsCache = [];

const SUBJECTS = ['คณิตศาสตร์', 'วิทยาศาสตร์', 'ภาษาไทย', 'ภาษาอังกฤษ', 'สังคมศึกษาฯ'];
const feeEach = () => Number(S.subject_fee) || 60;

/* ---------------------------------------------------------------------
   การสลับหน้า (hash routing เช่น #register, #results)
--------------------------------------------------------------------- */
const ADMIN_VIEWS = ['admindash', 'applicantform'];

// #news/12 -> หน้ารายละเอียดข่าว id 12
function parseHash() {
  const h = location.hash.slice(1) || 'home';
  const m = h.match(/^news\/(\d+)$/);
  return m ? { view: 'newsdetail', id: Number(m[1]) } : { view: h };
}

function showView(view, param) {
  if (!document.getElementById('view-' + view)) view = 'home';
  if (view === 'admin' && isAdmin) view = 'admindash';
  if (ADMIN_VIEWS.indexOf(view) !== -1 && !isAdmin) view = 'admin';
  if (view === 'studentportal' && !currentStudent) view = 'studentlogin';
  if (view === 'teacherportal' && !currentTeacher) view = 'teacherlogin';

  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  const tabOf = view === 'newsdetail' ? 'news' : view === 'schoolreg' ? 'register'
    : view === 'studentportal' ? 'studentlogin' : view === 'teacherportal' ? 'teacherlogin' : view;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === tabOf));
  $('navTabs').classList.remove('open');
  window.scrollTo(0, 0);

  if (view === 'register') applyRegStatusToForm();
  if (view === 'schoolreg') applySchoolStatus();
  if (view === 'news') loadNewsPage();
  if (view === 'newsdetail') loadNewsDetail(param);
  if (view === 'admindash') loadAdminData();
}
function go(view) {
  if (location.hash === '#' + view) showView(view); else location.hash = view;
}
window.addEventListener('hashchange', () => { const p = parseHash(); showView(p.view, p.id); });
function toggleMenu() { $('navTabs').classList.toggle('open'); }

/* ---------------------------------------------------------------------
   ตั้งค่าเว็บไซต์ (โหลดจากฐานข้อมูล — แก้ได้ที่หน้าแอดมิน)
--------------------------------------------------------------------- */
function applySettings() {
  document.querySelectorAll('[data-s]').forEach((el) => {
    const v = S[el.dataset.s];
    if (v !== undefined && v !== '') el.textContent = v;
  });
  document.title = (S.site_name || 'SciMath Test') + ' — ระบบรับสมัครสอบ';
  const fee = feeEach();
  updateFeeTotal();
  $('footerBottom').textContent = '© ' + (new Date().getFullYear() + 543) + ' ' + (S.org_name || '');
  renderStatusBanner();
  applyRegStatusToForm();
  if (typeof updateSchoolTotal === 'function') updateSchoolTotal();
  if (typeof applySchoolStatus === 'function') applySchoolStatus();
}

function renderStatusBanner() {
  const el = $('statusBanner');
  if (S.reg_open === '1') {
    el.innerHTML = '<div class="status-banner open"><span class="dot"></span>เปิดรับสมัครสอบ<span class="msg">' + esc(S.reg_period_display) + '</span></div>';
  } else {
    el.innerHTML = '<div class="status-banner closed"><span class="dot"></span>ปิดรับสมัครสอบ<span class="msg">' + esc(S.reg_closed_message) + '</span></div>';
  }
}
function applyRegStatusToForm() {
  const open = S.reg_open === '1';
  $('regClosedNotice').style.display = open ? 'none' : 'block';
  $('regFormWrap').style.display = open ? 'block' : 'none';
  $('regClosedMsg').textContent = S.reg_closed_message || 'กรุณาติดตามประกาศรอบสมัครถัดไป';
}

/* นับถอยหลังวันสอบ */
function renderCountdown() {
  const el = $('countdown');
  const target = new Date(S.exam_date_iso).getTime();
  if (!target || isNaN(target)) { el.innerHTML = ''; return; }
  const diff = Math.max(0, target - Date.now());
  const parts = [
    [Math.floor(diff / 86400000), 'วัน'], [Math.floor((diff % 86400000) / 3600000), 'ชั่วโมง'],
    [Math.floor((diff % 3600000) / 60000), 'นาที'], [Math.floor((diff % 60000) / 1000), 'วินาที']
  ];
  el.innerHTML = parts.map((p) =>
    '<div class="count-box"><div class="num">' + String(p[0]).padStart(2, '0') + '</div><div class="lab">' + p[1] + '</div></div>').join('');
}

/* คำถามที่พบบ่อย */
const FAQS = [
  ['สมัครสอบได้ถึงเมื่อไหร่?', 'ดูช่วงเวลารับสมัครได้ที่แถบด้านบนของเว็บไซต์และหัวข้อ "กำหนดการ" ระบบจะหยุดรับสมัครเมื่อเจ้าหน้าที่ปิดรับสมัคร'],
  ['สมัครได้กี่วิชา?', 'สมัครครั้งเดียวสอบครบทั้ง 5 วิชา (คณิตศาสตร์ วิทยาศาสตร์ ภาษาไทย ภาษาอังกฤษ สังคมศึกษาฯ) ค่าสมัครท่านละ 60 บาท'],
  ['ถ้ากรอกข้อมูลผิด แก้ไขได้หรือไม่?', 'กรุณาติดต่อเจ้าหน้าที่ผ่านเมนู "ติดต่อ" พร้อมแจ้งเลขที่สมัคร เพื่อให้เจ้าหน้าที่แก้ไขข้อมูลให้'],
  ['ลืมเลขที่สมัครหรือไม่แน่ใจว่าชำระเงินแล้วหรือยัง ทำอย่างไร?', 'ไปที่เมนู "เข้าสู่ระบบ" แล้วกรอกเลขประจำตัวประชาชนและวันเดือนปีเกิดของนักเรียนที่ใช้ตอนสมัคร']
];
function renderFaq() {
  $('faqList').innerHTML = FAQS.map((f, i) =>
    '<div class="faq-item" id="faq-' + i + '"><div class="faq-q" onclick="toggleFaq(' + i + ')"><span>' + esc(f[0]) +
    '</span><span class="faq-plus">+</span></div><div class="faq-a">' + esc(f[1]) + '</div></div>').join('');
}
function toggleFaq(i) { $('faq-' + i).classList.toggle('open'); }

/* ประกาศ / ข่าวประชาสัมพันธ์ (หน้าแรก) */
/* ---------------------------------------------------------------------
   รูปถ่าย: ย่อรูปในเบราว์เซอร์ก่อนส่ง (รูปเต็ม + รูปย่อสำหรับตารางแอดมิน)
--------------------------------------------------------------------- */
let regPhoto = null;   // { full, thumb } จากฟอร์มสมัคร
let afPhoto = null;    // { full, thumb } จากฟอร์มแอดมิน

function renderToDataUrl(img, maxH, quality) {
  let w = img.width, h = img.height;
  if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', quality);
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) { reject(new Error('ไฟล์รูปต้องมีขนาดไม่เกิน 8 MB')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพที่ถูกต้อง'));
      img.onload = () => {
        let full = renderToDataUrl(img, 480, 0.8);
        if (full.length > 300000) full = renderToDataUrl(img, 420, 0.6);
        resolve({ full: full, thumb: renderToDataUrl(img, 96, 0.7) });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
async function handlePhotoPick(input, previewId, target) {
  if (!input.files || !input.files[0]) return;
  const box = $(previewId);
  box.innerHTML = '<span class="ph">กำลังประมวลผล...</span>';
  try {
    const p = await compressImage(input.files[0]);
    if (target === 'reg') regPhoto = p; else afPhoto = p;
    box.innerHTML = '<img src="' + p.full + '" alt="รูปตัวอย่าง">';
  } catch (err) {
    box.innerHTML = '<span class="ph">ยังไม่มีรูป</span>';
    input.value = '';
    if (target === 'reg') regPhoto = null; else afPhoto = null;
    toast(err.message, true);
  }
}

// ย่อรูปทั่วไป (สลิป / รูปปกข่าว): ด้านยาวไม่เกิน maxSide แล้วลดคุณภาพจนไฟล์ไม่เกิน limit (ตัวอักษร base64)
function compressToDataUrl(file, maxSide, quality, limit) {
  return new Promise((resolve, reject) => {
    if (file.size > 12 * 1024 * 1024) { reject(new Error('ไฟล์รูปต้องมีขนาดไม่เกิน 12 MB')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพที่ถูกต้อง'));
      img.onload = () => {
        let side = maxSide, q = quality, out = '';
        for (let i = 0; i < 5; i++) {
          const k = Math.min(1, side / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (out.length <= limit) { resolve(out); return; }
          side = Math.round(side * 0.8); q = Math.max(0.5, q - 0.08);
        }
        reject(new Error('รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปที่เล็กลง'));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const slipData = { reg: null, school: null, portal: null };
async function handleSlipPick(input, previewId, target) {
  if (!input.files || !input.files[0]) return;
  const box = $(previewId);
  box.innerHTML = '<span class="ph">กำลังประมวลผล...</span>';
  try {
    slipData[target] = await compressToDataUrl(input.files[0], 1200, 0.75, 450000);
    box.innerHTML = '<img src="' + slipData[target] + '" alt="สลิป">';
  } catch (err) {
    slipData[target] = null; input.value = '';
    box.innerHTML = '<span class="ph">ยังไม่มีสลิป</span>';
    toast(err.message, true);
  }
}

/* สถิติหน้าแรก */
async function loadHomeStats() {
  try {
    const st = await API.publicStats();
    $('hsTotal').textContent = st.total;
    $('hsApproved').textContent = st.approved;
    const rows = (st.grades || []).map((g) =>
      '<tr><td>' + esc(g.grade) + '</td><td class="mono">' + esc(g.total) + '</td><td class="mono">' + esc(g.approved) + '</td></tr>').join('');
    $('hsGrades').innerHTML = rows
      ? rows + '<tr style="font-weight:600; background:var(--paper-dim);"><td>รวม</td><td class="mono">' + esc(st.total) + '</td><td class="mono">' + esc(st.approved) + '</td></tr>'
      : '<tr><td colspan="3" style="color:var(--ink-light);">ยังไม่มีผู้สมัคร</td></tr>';
    const d = new Date(st.as_of);
    $('statsAsOf').textContent = isNaN(d) ? '' : 'ข้อมูล ณ ' + d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) { $('statsSection').style.display = 'none'; }
}

/* ---------------------------------------------------------------------
   สมัครสอบ
--------------------------------------------------------------------- */
function updateFeeTotal() {
  // ค่าสมัครเหมาต่อคน: เลือกอย่างน้อย 1 วิชา = ท่านละ feeEach() บาท
  const total = document.querySelectorAll('.subj-check:checked').length ? feeEach() : 0;
  $('feeTotalDisplay').textContent = total + ' ฿';
  if ($('payTotal')) $('payTotal').textContent = total + ' ฿';
}

async function submitRegistration(evt) {
  evt.preventDefault();
  clearErr('regError');
  const idcard = idDigits($('f-idcard').value);
  const subjects = document.querySelector('.subj-check:checked') ? SUBJECTS.slice() : []; // ติ๊กเดียว = สอบครบทั้ง 5 วิชา

  if (S.reg_open !== '1') { showErr('regError', 'ขณะนี้ปิดรับสมัครสอบแล้ว'); return false; }
  if (!/^\d{13}$/.test(idcard)) { showErr('regError', 'เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก'); return false; }
  if (!subjects.length) { showErr('regError', 'กรุณาติ๊กเลือก "สอบวัดความรู้ ทั้ง 5 วิชา" เพื่อสมัครสอบ'); return false; }
  if (S.require_photo === '1' && !regPhoto) { showErr('regError', 'กรุณาอัปโหลดรูปถ่ายติดบัตรของนักเรียน'); return false; }
  if (S.require_slip === '1' && !slipData.reg) { showErr('regError', 'กรุณาแนบสลิปการชำระเงิน'); return false; }

  const btn = evt.target.querySelector('button[type=submit]');
  try {
    const r = await withBusy(btn, 'กำลังบันทึกข้อมูล...', () => API.register({
      prefix: $('f-prefix').value, first_name: $('f-first').value, last_name: $('f-last').value,
      id_card: idcard, birth_date: $('f-bday').value, grade: $('f-grade').value, school: $('f-school').value,
      subjects: subjects, guardian_name: $('f-guardian').value, guardian_phone: $('f-phone').value,
      email: $('f-email').value, address: $('f-address').value,
      photo_data: regPhoto ? regPhoto.full : null, thumb_data: regPhoto ? regPhoto.thumb : null,
      slip_data: slipData.reg
    }));
    renderReceipt(r);
    $('regFormWrap').style.display = 'none';
    $('regSuccessWrap').style.display = 'block';
    window.scrollTo(0, 0);
  } catch (err) {
    showErr('regError', err.message);
  }
  return false;
}

function renderReceipt(r) {
  $('regSuccessWrap').innerHTML =
    '<div class="card receipt"><div class="badge">✅</div><h3>สมัครสอบสำเร็จ</h3>' +
    '<p style="color:var(--ink-light); font-size:.9rem;">กรุณาบันทึกเลขที่สมัครไว้ ' +
    (r.has_slip ? 'เจ้าหน้าที่จะตรวจสอบสลิปและอนุมัติให้ภายหลัง ตรวจสถานะได้ที่เมนู "เข้าสู่ระบบ"'
                : 'และชำระค่าสมัครแล้วแนบสลิปที่เมนู "เข้าสู่ระบบ" เพื่อให้เจ้าหน้าที่ตรวจสอบ') + '</p>' +
    '<div class="appno">' + esc(r.app_no) + '</div><div class="receipt-detail">' +
    '<div class="row"><span>ชื่อผู้สมัคร</span><span>' + esc(r.name) + '</span></div>' +
    '<div class="row"><span>ระดับชั้น</span><span>' + esc(r.grade) + '</span></div>' +
    '<div class="row"><span>โรงเรียน</span><span>' + esc(r.school) + '</span></div>' +
    '<div class="row"><span>วิชาที่สมัคร</span><span>' + esc((r.subjects || []).join(', ')) + '</span></div>' +
    '<div class="row"><span>ค่าธรรมเนียม</span><span>' + esc(r.fee) + ' บาท</span></div>' +
    '<div class="row"><span>สถานะ</span><span>' + approvalBadge('pending') + '</span></div></div>' +
    '<div class="receipt-actions"><button class="btn btn-outline" onclick="window.print()">พิมพ์ใบสมัคร</button>' +
    '<button class="btn btn-primary" onclick="resetRegistration()">กลับหน้าแรก</button></div></div>';
}
function resetRegistration() {
  $('regForm').reset();
  regPhoto = null; slipData.reg = null;
  $('photoPreview').innerHTML = '<span class="ph">ยังไม่มีรูป</span>';
  $('slipPreview').innerHTML = '<span class="ph">ยังไม่มีสลิป</span>';
  $('regSuccessWrap').style.display = 'none';
  $('regSuccessWrap').innerHTML = '';
  updateFeeTotal();
  applyRegStatusToForm();
  go('home');
}

/* ---------------------------------------------------------------------
   แสดงผลสอบ / สถานะ (ใช้ร่วมกันหลายหน้า)
--------------------------------------------------------------------- */
function approvalBadge(status) {
  if (status === 'approved') return '<span class="badge-pill badge-paid">อนุมัติแล้ว — มีสิทธิ์สอบ</span>';
  if (status === 'rejected') return '<span class="badge-pill badge-unpaid">ไม่อนุมัติ — ต้องแก้ไข</span>';
  return '<span class="badge-pill badge-pending">รอเจ้าหน้าที่ตรวจสอบ</span>';
}
function statusLabel(st) { return { pending: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' }[st] || st; }
function resultRowsHtml(subjects) {
  return (subjects || []).map((s) => {
    if (s.score == null) {
      return '<div class="row"><span>' + esc(s.subject) + '</span><span><span class="badge-pill badge-pending">รอประกาศผล</span></span></div>';
    }
    const badge = s.passed ? '<span class="badge-pill badge-paid">ผ่านเกณฑ์</span>' : '<span class="badge-pill badge-unpaid">ไม่ผ่านเกณฑ์</span>';
    return '<div class="row"><span>' + esc(s.subject) + '</span><span>' + esc(Number(s.score)) + ' คะแนน &nbsp; ' + badge + '</span></div>';
  }).join('');
}
function subjectNames(rec) {
  return (rec.subjects || []).map((x) => (typeof x === 'string' ? x : x.subject));
}

/* ---------------------------------------------------------------------
   ตรวจสอบสถานะ (ไม่ต้องล็อกอิน)
--------------------------------------------------------------------- */
async function checkStatus(evt) {
  evt.preventDefault();
  clearErr('statusError');
  $('statusResult').innerHTML = '';
  const btn = evt.target.querySelector('button[type=submit]');
  try {
    const rec = await withBusy(btn, 'กำลังตรวจสอบ...', () => API.studentLogin(idDigits($('s-idcard').value), $('s-bday').value));
    if (!rec) { showErr('statusError', 'ไม่พบข้อมูลการสมัครสอบ กรุณาตรวจสอบเลขประจำตัวประชาชนและวันเดือนปีเกิดอีกครั้ง'); return false; }
    $('statusResult').innerHTML =
      '<div class="card receipt" style="text-align:left;"><h3 style="text-align:center;">' + esc(rec.app_no) + '</h3>' +
      '<div style="text-align:center; margin:10px 0 20px;">' + approvalBadge(rec.approval_status) + '</div>' +
      '<div class="receipt-detail" style="margin-top:0;">' +
      '<div class="row"><span>ชื่อผู้สมัคร</span><span>' + esc(rec.prefix + rec.first_name + ' ' + rec.last_name) + '</span></div>' +
      '<div class="row"><span>ระดับชั้น</span><span>' + esc(rec.grade) + '</span></div>' +
      '<div class="row"><span>โรงเรียน</span><span>' + esc(rec.school) + '</span></div>' +
      '<div class="row"><span>วิชาที่สมัคร</span><span>' + esc(subjectNames(rec).join(', ')) + '</span></div>' +
      '<div class="row"><span>ค่าธรรมเนียม</span><span>' + esc(rec.fee) + ' บาท</span></div></div>' +
      (rec.approval_status === 'approved'
        ? '<div class="receipt-actions"><button class="btn btn-primary" onclick="go(\'studentlogin\')">เข้าสู่ระบบเพื่อพิมพ์บัตรประจำตัวผู้เข้าสอบ</button></div>'
        : '<p style="text-align:center; color:var(--ink-light); font-size:.85rem; margin-top:16px;">พิมพ์บัตรประจำตัวผู้เข้าสอบได้เมื่อได้รับการอนุมัติแล้ว</p>') +
      '</div>';
  } catch (err) { showErr('statusError', err.message); }
  return false;
}

/* ---------------------------------------------------------------------
   เข้าสู่ระบบผู้สมัคร + บัญชีของฉัน
--------------------------------------------------------------------- */
async function studentLogin(evt) {
  evt.preventDefault();
  clearErr('loginError');
  const idcard = idDigits($('l-idcard').value);
  if (!/^\d{13}$/.test(idcard)) { showErr('loginError', 'เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก'); return false; }
  const btn = evt.target.querySelector('button[type=submit]');
  try {
    const rec = await withBusy(btn, 'กำลังเข้าสู่ระบบ...', () => API.studentLogin(idcard, $('l-bday').value));
    if (!rec) { showErr('loginError', 'ไม่พบข้อมูลผู้สมัครสอบ กรุณาตรวจสอบเลขบัตรและวันเกิดอีกครั้ง หรือสมัครสอบก่อนเข้าสู่ระบบ'); return false; }
    currentStudent = rec;
    studentAuth = { id: idcard, birth: $('l-bday').value };
    renderPortal(rec);
    evt.target.reset();
    go('studentportal');
  } catch (err) { showErr('loginError', err.message); }
  return false;
}

function renderPortal(rec) {
  const photo = safeImg(rec.photo_data);
  const showResults = rec.results_published;
  $('portalContent').innerHTML =
    '<div class="portal-head">' +
    (photo ? '<img class="photo-thumb" style="width:52px; height:68px;" src="' + photo + '" alt="รูปของฉัน">' : '<div class="av">🎓</div>') +
    '<div><h3>ยินดีต้อนรับ ' + esc(rec.prefix + rec.first_name + ' ' + rec.last_name) + '</h3><p>เลขที่สมัคร ' + esc(rec.app_no) + '</p></div></div>' +
    '<div class="card receipt" style="text-align:left;"><div style="text-align:center; margin-bottom:18px;">' + approvalBadge(rec.approval_status) + '</div>' +
    '<div class="receipt-detail" style="margin-top:0;">' +
    '<div class="row"><span>ระดับชั้น</span><span>' + esc(rec.grade) + '</span></div>' +
    '<div class="row"><span>โรงเรียน</span><span>' + esc(rec.school) + '</span></div>' +
    '<div class="row"><span>วิชาที่สมัคร</span><span>' + esc(subjectNames(rec).join(', ')) + '</span></div>' +
    '<div class="row"><span>ห้องสอบ / ที่นั่ง</span><span>' + esc([rec.exam_room, rec.seat_no].filter(Boolean).join(' / ') || 'จะประกาศภายหลัง') + '</span></div>' +
    '<div class="row"><span>ค่าธรรมเนียม</span><span>' + esc(rec.fee) + ' บาท</span></div>' +
    '<div class="row"><span>ผู้ปกครอง</span><span>' + esc(rec.guardian_name) + ' (' + esc(rec.guardian_phone) + ')</span></div></div>' +
    '<div class="receipt-actions">' +
    (rec.approval_status === 'approved' ? '<button class="btn btn-primary" onclick="printTicket(currentStudent)">พิมพ์บัตรประจำตัวผู้เข้าสอบ</button>' : '') +
    '<button class="btn btn-outline" onclick="studentLogout()">ออกจากระบบ</button></div>' +
    (rec.approval_status !== 'approved' ? '<p style="text-align:center; color:var(--ink-light); font-size:.85rem; margin-top:14px;">พิมพ์บัตรประจำตัวผู้เข้าสอบได้เมื่อได้รับการอนุมัติแล้ว</p>' : '') +
    '</div>' + portalNotes(rec) +
    (showResults
      ? '<div class="card receipt" style="text-align:left; margin-top:18px;"><h3 style="text-align:center; margin-bottom:14px;">ผลการสอบ</h3><div class="receipt-detail" style="margin-top:0;">' + resultRowsHtml(rec.subjects) + '</div></div>'
      : '');
}
function portalNotes(rec) {
  let html = '';
  if (rec.approval_status === 'rejected') {
    html += '<div class="note-box warn"><b>เจ้าหน้าที่ไม่อนุมัติการสมัคร</b>' + (rec.approval_note ? '<br>เหตุผล: ' + esc(rec.approval_note) : '') +
      (rec.is_batch ? '<br>กรุณาติดต่อครูที่ปรึกษาเพื่อแก้ไข' : '<br>กรุณาแก้ไขและอัปโหลดสลิปใหม่ด้านล่าง') + '</div>';
  } else if (rec.approval_status === 'pending') {
    html += '<div class="note-box info">' + (rec.is_batch
      ? 'สมัครผ่านครูที่ปรึกษา (กลุ่ม ' + esc(rec.batch_no) + ') — สถานะจะเปลี่ยนเมื่อเจ้าหน้าที่อนุมัติทั้งกลุ่ม'
      : (rec.has_slip ? 'ส่งสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ ' : 'ยังไม่ได้แนบสลิปการชำระเงิน ')) + '</div>';
  } else if (rec.is_batch && !rec.photo_data) {
    html += '<div class="note-box info">ยังไม่มีรูปถ่ายบนบัตร กรุณาแจ้งครูที่ปรึกษาให้อัปโหลดรูปถ่าย</div>';
  }
  if (!rec.is_batch && rec.approval_status !== 'approved') {
    html += '<div class="card receipt" style="text-align:left; margin-top:16px;"><h3 style="font-size:1.05rem; margin-bottom:10px;">' + (rec.has_slip ? 'อัปโหลดสลิปใหม่' : 'อัปโหลดสลิปการชำระเงิน') + '</h3>' +
      '<div class="pay-box"><div class="pay-total">ยอดที่ต้องชำระ <b>' + esc(rec.fee) + ' ฿</b></div><div class="pay-info">' + esc(S.bank_info) + '</div></div>' +
      '<div class="photo-upload-row"><div class="slip-preview" id="portalSlipPreview"><span class="ph">ยังไม่ได้เลือกสลิป</span></div><div style="flex:1;">' +
      '<input type="file" accept="image/jpeg,image/png" onchange="handleSlipPick(this,\'portalSlipPreview\',\'portal\')">' +
      '<button class="btn btn-teal" style="margin-top:12px;" onclick="portalUploadSlip(this)">ส่งสลิป</button></div></div></div>';
  }
  return html;
}
async function portalUploadSlip(btn) {
  if (!slipData.portal) { toast('กรุณาเลือกไฟล์สลิปก่อน', true); return; }
  try {
    await withBusy(btn, 'กำลังส่ง...', () => API.uploadSlip(studentAuth.id, studentAuth.birth, slipData.portal));
    slipData.portal = null;
    const rec = await API.studentLogin(studentAuth.id, studentAuth.birth);
    currentStudent = rec; renderPortal(rec);
    toast('ส่งสลิปเรียบร้อย รอเจ้าหน้าที่ตรวจสอบ');
  } catch (err) { toast(err.message, true); }
}
function studentLogout() { currentStudent = null; studentAuth = null; $('portalContent').innerHTML = ''; go('home'); }

/* ---------------------------------------------------------------------
   ประกาศผลสอบ (หน้าสาธารณะ)
--------------------------------------------------------------------- */
async function checkResults(evt) {
  evt.preventDefault();
  clearErr('resultsError');
  $('resultsOutput').innerHTML = '';
  const btn = evt.target.querySelector('button[type=submit]');
  try {
    const r = await withBusy(btn, 'กำลังตรวจสอบ...', () => API.checkResults(idDigits($('rs-idcard').value), $('rs-bday').value));
    if (!r.published) {
      $('resultsOutput').innerHTML = '<div class="card receipt"><div class="badge">🕒</div><h3>ยังไม่ประกาศผลสอบ</h3><p style="color:var(--ink-light); font-size:.9rem;">' + esc(r.message) + '</p></div>';
      return false;
    }
    if (!r.found) { showErr('resultsError', 'ไม่พบข้อมูลผู้สมัครสอบ กรุณาตรวจสอบเลขประจำตัวประชาชนและวันเดือนปีเกิดอีกครั้ง'); return false; }
    $('resultsOutput').innerHTML =
      '<div class="card receipt" style="text-align:left;"><h3 style="text-align:center;">' + esc(r.prefix + r.first_name + ' ' + r.last_name) + '</h3>' +
      '<p style="text-align:center; color:var(--ink-light); font-size:.85rem;">เลขที่สมัคร ' + esc(r.app_no) + '</p>' +
      '<div class="receipt-detail" style="margin-top:14px;">' + resultRowsHtml(r.subjects) + '</div></div>';
  } catch (err) { showErr('resultsError', err.message); }
  return false;
}

/* ---------------------------------------------------------------------
   บัตรประจำตัวผู้เข้าสอบ (สไตล์ mytcas) — ใช้ร่วมกันทั้งผู้สมัครและเจ้าหน้าที่
   rec: { prefix, first_name, last_name, app_no, id_card, grade, school, subjects, exam_room, seat_no, photo_data }
--------------------------------------------------------------------- */
function examCardHtml(rec) {
  const photo = safeImg(rec.photo_data);
  const room = (rec.exam_room || '').trim();
  const seat = (rec.seat_no || '').trim();
  return '<div class="exam-card"><div class="exam-card-head">' +
    '<svg class="ec-emblem" viewBox="0 0 96 96" fill="none"><circle cx="48" cy="48" r="46" fill="none" stroke="#F5A623" stroke-width="2" stroke-dasharray="2 5"/>' +
    '<circle cx="48" cy="48" r="40" fill="#0B1226"/><circle cx="48" cy="48" r="7" fill="#F5A623"/>' +
    '<ellipse cx="48" cy="48" rx="32" ry="14" stroke="#1F9C87" stroke-width="2.5" fill="none"/>' +
    '<ellipse cx="48" cy="48" rx="32" ry="14" stroke="#F5A623" stroke-width="2.5" fill="none" transform="rotate(60 48 48)"/>' +
    '<ellipse cx="48" cy="48" rx="32" ry="14" stroke="#E85C4A" stroke-width="2.5" fill="none" transform="rotate(120 48 48)"/></svg>' +
    '<div><div class="ec-org">' + esc(S.org_name) + '</div><div class="ec-sub">บัตรประจำตัวผู้เข้าสอบ ' + esc(S.site_name) + '</div></div></div>' +
    '<div class="exam-card-body"><div class="exam-card-photo">' +
    (photo ? '<img src="' + photo + '" alt="รูปถ่ายผู้เข้าสอบ">' : '<div class="noimg">ไม่มีรูปถ่าย<br>กรุณาติดต่อเจ้าหน้าที่</div>') + '</div>' +
    '<div class="exam-card-info"><div class="exam-card-name">' + esc(rec.prefix + rec.first_name + ' ' + rec.last_name) + '</div>' +
    '<div class="exam-card-appno">เลขที่นั่งสอบ ' + esc(rec.app_no) + '</div><dl class="ec-grid">' +
    '<dt>เลขประจำตัวประชาชน</dt><dd>' + esc(rec.id_card) + '</dd>' +
    '<dt>ระดับชั้น</dt><dd>' + esc(rec.grade) + '</dd>' +
    '<dt>โรงเรียน</dt><dd>' + esc(rec.school) + '</dd>' +
    '<dt>วิชาที่สอบ</dt><dd>' + esc(subjectNames(rec).join(', ')) + '</dd>' +
    '<dt>วันสอบ</dt><dd>' + esc(S.exam_date_display) + '</dd>' +
    '<dt>เวลาสอบ</dt><dd>' + esc(S.exam_time_display) + '</dd>' +
    '<dt>สนามสอบ</dt><dd>' + esc(S.exam_site_name) + '</dd>' +
    '<dt>ห้องสอบ</dt><dd>' + esc(room || S.exam_venue_display) + '</dd>' +
    (seat ? '<dt>เลขที่นั่ง</dt><dd>' + esc(seat) + '</dd>' : '') +
    '</dl></div></div>' +
    '<div class="exam-card-foot"><div class="note-title">ระเบียบสำหรับผู้เข้าสอบ</div><ul>' +
    '<li>นำบัตรประจำตัวผู้เข้าสอบใบนี้ พร้อมบัตรประชาชนหรือบัตรนักเรียน มาแสดงในวันสอบทุกครั้ง</li>' +
    '<li>ไปถึงสนามสอบก่อนเวลาสอบอย่างน้อย 30 นาที เพื่อตรวจสอบห้องสอบและที่นั่ง</li>' +
    '<li>แต่งกายด้วยชุดนักเรียนให้เรียบร้อย ไม่อนุญาตให้นำเครื่องมือสื่อสารเข้าห้องสอบ</li>' +
    '<li>ผู้เข้าสอบที่มาสายเกิน 30 นาทีหลังเริ่มการสอบ จะไม่ได้รับอนุญาตให้เข้าห้องสอบ</li></ul></div>' +
    '<div class="exam-card-sign"><div class="sign-box"><div class="sign-line"></div>ลายมือชื่อผู้เข้าสอบ</div></div></div>';
}
function showTickets(cards) {
  $('ticketContent').innerHTML = cards.join('');
  document.body.classList.add('printing-ticket');
  $('printTicketOverlay').style.display = 'block';
  window.scrollTo(0, 0);
}
function printTicket(rec) {
  if (!rec) return;
  showTickets([examCardHtml(rec)]);
}
function closeTicket() {
  document.body.classList.remove('printing-ticket');
  $('printTicketOverlay').style.display = 'none';
}

/* =====================================================================
   ส่วนของเจ้าหน้าที่
===================================================================== */
async function adminLogin(evt) {
  evt.preventDefault();
  clearErr('adminError');
  const btn = evt.target.querySelector('button[type=submit]');
  try {
    await withBusy(btn, 'กำลังเข้าสู่ระบบ...', () => API.adminSignIn($('a-email').value.trim(), $('a-pass').value));
    isAdmin = true;
    adminEmail = $('a-email').value.trim();
    $('a-pass').value = '';
    go('admindash');
  } catch (err) { showErr('adminError', err.message); }
  return false;
}
async function adminLogout() {
  await API.adminSignOut();
  isAdmin = false; applicantsCache = [];
  go('home');
}

function switchAdminTab(tab) {
  document.querySelectorAll('#adminTabs button').forEach((b) => b.classList.toggle('active', b.dataset.atab === tab));
  document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === 'apanel-' + tab));
}

async function loadAdminData() {
  if (!isAdmin) return;
  $('statGrid').innerHTML = '<div class="loading-line" style="padding:20px;">กำลังโหลดข้อมูล...</div>';
  try {
    const rows = await API.listApplicants();
    applicantsCache = rows.map((r) => Object.assign({}, r, {
      subjects: (r.applicant_subjects || []).map((x) => x.subject)
    }));
  } catch (err) {
    toast(err.message, true);
    if (/สิทธิ์|เข้าสู่ระบบ/.test(err.message)) { isAdmin = false; go('admin'); }
    return;
  }
  renderStats();
  renderAdminTable();
  renderAdminResultsTable();
  renderSettingsPanel();
  renderAdminNews();
  loadBatches();
}

/* ----- ตารางผู้สมัคร ----- */
function renderStats() {
  const a = applicantsCache;
  const n = (st) => a.filter((x) => x.approval_status === st).length;
  const pendingSlip = a.filter((x) => x.approval_status === 'pending' && x.slip_uploaded_at && !x.batch_id).length;
  $('statGrid').innerHTML =
    '<div class="card stat-card"><div class="lab">ผู้สมัครทั้งหมด</div><div class="val">' + a.length + '</div></div>' +
    '<div class="card stat-card"><div class="lab">รอตรวจสอบ</div><div class="val" style="color:var(--amber-deep);">' + n('pending') + '</div></div>' +
    '<div class="card stat-card"><div class="lab">อนุมัติแล้ว</div><div class="val" style="color:var(--teal-deep);">' + n('approved') + '</div></div>' +
    '<div class="card stat-card"><div class="lab">ไม่อนุมัติ</div><div class="val" style="color:#B23A2A;">' + n('rejected') + '</div></div>';
  $('appPendingDot').innerHTML = pendingSlip ? '<span class="dot-badge">' + pendingSlip + '</span>' : '';
}

const ROW_LIMIT = 300;
function renderAdminTable() {
  const q = ($('admSearch').value || '').trim().toLowerCase();
  const sf = $('admSubjFilter').value;
  const pf = $('admPayFilter').value;
  const rows = applicantsCache.filter((a) => {
    const text = (a.first_name + ' ' + a.last_name + ' ' + a.id_card + ' ' + a.school + ' ' + a.app_no).toLowerCase();
    if (q && text.indexOf(q) === -1) return false;
    if (sf && a.subjects.indexOf(sf) === -1) return false;
    if (pf && a.approval_status !== pf) return false;
    return true;
  });
  const shown = rows.slice(0, ROW_LIMIT);
  $('admEmptyState').style.display = rows.length ? 'none' : 'block';
  $('admRowNote').textContent = rows.length > ROW_LIMIT ? ('แสดง ' + ROW_LIMIT + ' จาก ' + rows.length + ' รายการ — พิมพ์ในช่องค้นหาเพื่อกรองให้แคบลง') : '';
  $('admCheckAll').checked = false;

  $('admTableBody').innerHTML = shown.map((a) => {
    const thumb = safeImg(a.thumb_data);
    const id = Number(a.id);
    const roomSeat = [a.exam_room, a.seat_no].filter(Boolean).join(' / ');
    const slipTxt = a.batch_id ? '<span style="color:var(--ink-light); font-size:.75rem;">สมัครผ่านครู</span>'
      : a.slip_uploaded_at ? '<span style="color:var(--teal-deep); font-size:.75rem;">มีสลิป</span>'
      : '<span style="color:#B23A2A; font-size:.75rem;">ไม่มีสลิป</span>';
    return '<tr><td><input type="checkbox" class="row-check" value="' + id + '" aria-label="เลือก"></td>' +
      '<td>' + (thumb ? '<img class="photo-thumb" src="' + thumb + '" alt="รูป">' : '<div class="photo-thumb-empty"></div>') + '</td>' +
      '<td class="mono">' + esc(a.app_no) + '</td><td>' + esc(a.prefix + a.first_name + ' ' + a.last_name) + '</td>' +
      '<td>' + esc(a.grade) + '</td><td>' + esc(a.school) + '</td><td>' + esc(a.subjects.join(', ')) + '</td>' +
      '<td>' + (roomSeat ? esc(roomSeat) : '<span style="color:var(--ink-light);">—</span>') + '</td>' +
      '<td class="mono">' + esc(a.fee) + ' ฿</td>' +
      '<td>' + statusPill(a.approval_status) + '<br>' + slipTxt + '</td>' +
      '<td>' + esc(a.guardian_name) + '<br><span style="color:var(--ink-light)">' + esc(a.guardian_phone) + '</span></td>' +
      '<td>' + fmtDate(a.submitted_at) + '</td><td>' +
      '<button class="btn btn-primary" style="padding:6px 12px; font-size:.78rem;" onclick="openReview(' + id + ')">ตรวจสอบ</button> ' +
      '<button class="btn btn-outline" style="padding:6px 10px; font-size:.78rem;" onclick="openApplicantForm(' + id + ')">แก้ไข</button> ' +
      '<button class="btn btn-outline" style="padding:6px 10px; font-size:.78rem;" onclick="printCardFor(' + id + ')">บัตรสอบ</button> ' +
      '<button class="btn btn-danger" onclick="deleteApplicant(' + id + ')">ลบ</button></td></tr>';
  }).join('');
}
function statusPill(st) {
  const cls = st === 'approved' ? 'badge-paid' : st === 'rejected' ? 'badge-unpaid' : 'badge-pending';
  return '<span class="badge-pill ' + cls + '">' + statusLabel(st) + '</span>';
}
function toggleCheckAll(box) { document.querySelectorAll('.row-check').forEach((c) => { c.checked = box.checked; }); }

async function deleteApplicant(id) {
  const a = applicantsCache.find((x) => x.id === id);
  if (!a || !confirm('ยืนยันการลบข้อมูลของ ' + a.first_name + ' ' + a.last_name + ' ?\nการลบไม่สามารถกู้คืนได้')) return;
  try {
    await API.deleteApplicant(id);
    applicantsCache = applicantsCache.filter((x) => x.id !== id);
    renderStats(); renderAdminTable(); renderAdminResultsTable();
    toast('ลบข้อมูลผู้สมัครแล้ว');
  } catch (err) { toast(err.message, true); }
}
async function printCardFor(id) {
  try {
    const row = await API.getApplicantFull(id);
    printTicket(Object.assign({}, row, { subjects: row.applicant_subjects }));
  } catch (err) { toast(err.message, true); }
}

function exportCSV() {
  if (!applicantsCache.length) { toast('ยังไม่มีข้อมูลผู้สมัคร', true); return; }
  const head = ['เลขที่สมัคร', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เลขบัตรประชาชน', 'วันเกิด', 'ระดับชั้น', 'โรงเรียน', 'วิชาที่สมัคร',
    'ห้องสอบ', 'เลขที่นั่ง', 'ค่าธรรมเนียม', 'สถานะอนุมัติ', ...SUBJECTS.map((s) => 'คะแนน' + s), 'ผู้ปกครอง', 'เบอร์โทร', 'อีเมล', 'จังหวัด', 'วันที่สมัคร'];
  const score = (a, s) => { const x = (a.applicant_subjects || []).find((y) => y.subject === s); return x && x.score != null ? x.score : ''; };
  const rows = applicantsCache.map((a) => [a.app_no, a.prefix, a.first_name, a.last_name, a.id_card, a.birth_date, a.grade, a.school,
    a.subjects.join('/'), a.exam_room || '', a.seat_no || '', a.fee, statusLabel(a.approval_status), ...SUBJECTS.map((s) => score(a, s)),
    a.guardian_name, a.guardian_phone, a.email || '', a.address || '', a.submitted_at]);
  // ป้องกัน CSV/Excel formula injection: เติม ' หน้าค่าที่ขึ้นต้นด้วยอักขระอันตราย
  const cell = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const csv = [head].concat(rows).map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'scimath_applicants.csv';
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ----- ฟอร์มเพิ่ม / แก้ไขผู้สมัคร ----- */
async function openApplicantForm(id) {
  $('applicantForm').reset();
  afPhoto = null;
  clearErr('afError');
  $('afPhotoPreview').innerHTML = '<span class="ph">ยังไม่มีรูป</span>';
  document.querySelectorAll('.af-subj').forEach((c) => { c.checked = false; });
  $('af-photo').value = '';

  if (!id) {
    $('af-editing').value = '';
    $('afTitle').textContent = 'เพิ่มผู้สมัครเข้าระบบ';
    $('afSubmitBtn').textContent = 'เพิ่มผู้สมัคร';
    $('afPhotoHint').textContent = '';
    go('applicantform');
    return;
  }
  try {
    const r = await API.getApplicantFull(id);
    $('af-editing').value = r.id;
    $('afTitle').textContent = 'แก้ไขข้อมูลผู้สมัคร';
    $('afSubmitBtn').textContent = 'บันทึกการแก้ไข';
    $('afPhotoHint').textContent = '(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)';
    const set = (k, v) => { $(k).value = v == null ? '' : v; };
    set('af-prefix', r.prefix); set('af-grade', r.grade); set('af-first', r.first_name); set('af-last', r.last_name);
    set('af-idcard', r.id_card); set('af-bday', r.birth_date); set('af-school', r.school);
    set('af-guardian', r.guardian_name); set('af-phone', r.guardian_phone); set('af-email', r.email); set('af-address', r.address);
    set('af-room', r.exam_room); set('af-seat', r.seat_no); set('af-pay', r.approval_status || 'pending');
    (r.applicant_subjects || []).forEach((s) => {
      document.querySelectorAll('.af-subj').forEach((c) => { if (c.value === s.subject) c.checked = true; });
    });
    const ph = safeImg(r.photo_data);
    if (ph) $('afPhotoPreview').innerHTML = '<img src="' + ph + '" alt="รูปปัจจุบัน">';
    go('applicantform');
  } catch (err) { toast(err.message, true); }
}

async function saveApplicantForm(evt) {
  evt.preventDefault();
  clearErr('afError');
  const editing = $('af-editing').value;
  const id = editing ? Number(editing) : null;
  const idcard = idDigits($('af-idcard').value);
  const subjects = Array.from(document.querySelectorAll('.af-subj:checked')).map((c) => c.value);

  if (!/^\d{13}$/.test(idcard)) { showErr('afError', 'เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก'); return false; }
  if (!subjects.length) { showErr('afError', 'กรุณาเลือกวิชาที่สมัครสอบอย่างน้อย 1 วิชา'); return false; }
  if (!id && S.require_photo === '1' && !afPhoto) { showErr('afError', 'กรุณาอัปโหลดรูปถ่ายติดบัตร'); return false; }

  const fields = {
    id_card: idcard, birth_date: $('af-bday').value, prefix: $('af-prefix').value,
    first_name: $('af-first').value.trim(), last_name: $('af-last').value.trim(),
    grade: $('af-grade').value, school: $('af-school').value.trim(),
    guardian_name: $('af-guardian').value.trim(), guardian_phone: $('af-phone').value.trim(),
    email: $('af-email').value.trim() || null, address: $('af-address').value.trim() || null,
    exam_room: $('af-room').value.trim() || null, seat_no: $('af-seat').value.trim() || null,
    approval_status: $('af-pay').value
  };
  if (afPhoto) { fields.photo_data = afPhoto.full; fields.thumb_data = afPhoto.thumb; }

  try {
    await withBusy($('afSubmitBtn'), 'กำลังบันทึก...', () => API.saveApplicant(id, fields, subjects, feeEach()));
    toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้สมัครเรียบร้อยแล้ว');
    go('admindash');
  } catch (err) { showErr('afError', err.message); }
  return false;
}

/* ----- ผลสอบ ----- */
function renderAdminResultsTable() {
  const tbody = $('admResultsBody');
  if (!applicantsCache.length) {
    tbody.innerHTML = '<tr><td colspan="' + (SUBJECTS.length + 3) + '" style="text-align:center; color:var(--ink-light);">ยังไม่มีผู้สมัครสอบ</td></tr>';
    return;
  }
  tbody.innerHTML = applicantsCache.slice(0, 500).map((a) => {
    const byS = {};
    (a.applicant_subjects || []).forEach((x) => { byS[x.subject] = x; });
    const cell = (subj) => {
      const cur = byS[subj];
      if (!cur) return '<span style="color:var(--ink-light);">—</span>';
      const sel = cur.passed === true ? '1' : cur.passed === false ? '0' : '';
      return '<div class="result-cell"><input type="number" min="0" max="100" step="0.5" value="' + (cur.score == null ? '' : esc(cur.score)) +
        '" data-aid="' + Number(a.id) + '" data-subj="' + esc(subj) + '" data-f="score" oninput="autoPass(this)">' +
        '<select data-aid="' + Number(a.id) + '" data-subj="' + esc(subj) + '" data-f="passed" onchange="markDirty(this)">' +
        '<option value=""' + (sel === '' ? ' selected' : '') + '>— ยังไม่ระบุ</option>' +
        '<option value="1"' + (sel === '1' ? ' selected' : '') + '>ผ่าน</option>' +
        '<option value="0"' + (sel === '0' ? ' selected' : '') + '>ไม่ผ่าน</option></select></div>';
    };
    return '<tr data-rid="' + Number(a.id) + '"><td class="mono">' + esc(a.app_no) + '</td><td>' + esc(a.prefix + a.first_name + ' ' + a.last_name) + '</td>' +
      SUBJECTS.map((s) => '<td>' + cell(s) + '</td>').join('') +
      '<td><button class="btn btn-outline" style="padding:6px 12px; font-size:.78rem;" onclick="saveApplicantResults(' + Number(a.id) + ')">บันทึก</button></td></tr>';
  }).join('');
}
function markDirty(el) { const tr = el.closest('tr'); if (tr) tr.dataset.dirty = '1'; }
function autoPass(input) {
  markDirty(input);
  const sel = input.parentElement.querySelector('select');
  if (input.value === '') { sel.value = ''; return; }
  sel.value = Number(input.value) >= (Number(S.pass_score) || 50) ? '1' : '0';
}
async function persistResultsRow(id) {
  const a = applicantsCache.find((x) => x.id === id);
  const tr = document.querySelector('tr[data-rid="' + id + '"]');
  if (!a || !tr) return;
  for (const subj of SUBJECTS) {
    const inp = tr.querySelector('input[data-subj="' + subj + '"]');
    const sel = tr.querySelector('select[data-subj="' + subj + '"]');
    if (!inp) continue;
    let score = inp.value === '' ? null : Number(inp.value);
    if (score != null && (isNaN(score) || score < 0 || score > 100)) throw new Error('คะแนนต้องอยู่ระหว่าง 0–100');
    let passed = sel.value === '' ? null : sel.value === '1';
    if (passed === null && score != null) passed = score >= (Number(S.pass_score) || 50);
    await API.saveScore(id, subj, score, passed);
    const rec = (a.applicant_subjects || []).find((x) => x.subject === subj);
    if (rec) { rec.score = score; rec.passed = passed; }
  }
  delete tr.dataset.dirty;
}
async function saveApplicantResults(id) {
  try { await persistResultsRow(id); toast('บันทึกผลสอบแล้ว'); renderAdminResultsTable(); }
  catch (err) { toast(err.message, true); }
}
async function saveAllResults() {
  const rows = Array.from(document.querySelectorAll('#admResultsBody tr[data-dirty="1"]'));
  if (!rows.length) { toast('ยังไม่มีรายการที่แก้ไข'); return; }
  let ok = 0;
  try {
    for (const tr of rows) { await persistResultsRow(Number(tr.dataset.rid)); ok++; }
    toast('บันทึกผลสอบแล้ว ' + ok + ' รายการ');
    renderAdminResultsTable();
  } catch (err) { toast('บันทึกได้ ' + ok + ' รายการ แล้วหยุด: ' + err.message, true); }
}

async function onToggleResultsStatus() {
  const on = $('admResultsToggle').checked;
  try {
    await API.saveSettings({ results_published: on ? '1' : '0' });
    S.results_published = on ? '1' : '0';
    $('admResultsLabel').textContent = on ? 'ประกาศผลสอบแล้ว' : 'ยังไม่ประกาศผลสอบ';
    toast(on ? 'เปิดประกาศผลสอบแล้ว ผู้สมัครจะเห็นคะแนนของตนเอง' : 'ปิดการประกาศผลสอบแล้ว');
  } catch (err) { $('admResultsToggle').checked = !on; toast(err.message, true); }
}
async function saveResultsMessage() {
  try { await API.saveSettings({ results_message: $('admResultsMsg').value.trim() }); S.results_message = $('admResultsMsg').value.trim(); toast('บันทึกข้อความแล้ว'); }
  catch (err) { toast(err.message, true); }
}

/* ----- ตั้งค่าระบบ ----- */
const SETTING_FIELDS = [
  { k: 'org_name', l: 'ชื่อหน่วยงาน' }, { k: 'site_name', l: 'ชื่อโครงการ / ระบบ' },
  { k: 'app_prefix', l: 'คำนำหน้าเลขที่สมัคร (เช่น SM69-)' }, { k: 'subject_fee', l: 'ค่าสมัครสอบต่อท่าน (บาท)', t: 'number' },
  { k: 'pass_score', l: 'คะแนนผ่านเกณฑ์ (0–100)', t: 'number' }, { k: 'exam_date_iso', l: 'วัน-เวลาสอบ (ใช้นับถอยหลัง)', t: 'datetime' },
  { k: 'exam_date_display', l: 'วันสอบ (ข้อความที่แสดง)' }, { k: 'exam_time_display', l: 'เวลาสอบ (ข้อความที่แสดง)' },
  { k: 'exam_site_name', l: 'ชื่อสนามสอบ' }, { k: 'exam_venue_display', l: 'ข้อความห้องสอบ (เมื่อยังไม่กำหนดห้อง)' },
  { k: 'date_reg', l: 'กำหนดการ: ช่วงรับสมัคร' }, { k: 'date_list', l: 'กำหนดการ: ประกาศรายชื่อผู้มีสิทธิ์สอบ' },
  { k: 'date_card', l: 'กำหนดการ: พิมพ์บัตรประจำตัวผู้เข้าสอบ' }, { k: 'date_result', l: 'กำหนดการ: ประกาศผลสอบ' }, { k: 'contact_phone', l: 'เบอร์โทรติดต่อ' },
  { k: 'contact_email', l: 'อีเมลติดต่อ' }, { k: 'contact_address', l: 'ที่อยู่หน่วยงาน', wide: true },
  { k: 'bank_info', l: 'ข้อมูลบัญชีสำหรับชำระเงิน', wide: true },
  { k: 'batch_prefix', l: 'คำนำหน้าเลขกลุ่มโรงเรียน (เช่น SCH69-)' },
  { k: 'require_photo', l: 'บังคับให้ผู้สมัครอัปโหลดรูปถ่ายติดบัตร (รายบุคคล)', t: 'bool' },
  { k: 'require_slip', l: 'บังคับให้แนบสลิปการชำระเงินตอนสมัคร', t: 'bool' }
];
function renderSettingsPanel() {
  $('admOpenToggle').checked = S.reg_open === '1';
  $('admOpenLabel').textContent = S.reg_open === '1' ? 'เปิดรับสมัครอยู่' : 'ปิดรับสมัครอยู่';
  $('admPeriodMsg').value = S.reg_period_display || '';
  $('admClosedMsg').value = S.reg_closed_message || '';
  $('admResultsToggle').checked = S.results_published === '1';
  $('admResultsLabel').textContent = S.results_published === '1' ? 'ประกาศผลสอบแล้ว' : 'ยังไม่ประกาศผลสอบ';
  $('admResultsMsg').value = S.results_message || '';

  const field = (f) => {
    const v = S[f.k] == null ? '' : S[f.k];
    if (f.t === 'bool') {
      return '<div class="field"><label class="check-row" style="margin:0;"><input type="checkbox" id="gs-' + f.k + '"' + (v === '1' ? ' checked' : '') +
        '><span class="ct"><span class="t">' + esc(f.l) + '</span></span></label></div>';
    }
    if (f.t === 'datetime') {
      return '<div class="field"><label for="gs-' + f.k + '">' + esc(f.l) + '</label><input type="datetime-local" id="gs-' + f.k + '" value="' + esc(String(v).slice(0, 16)) + '"></div>';
    }
    return '<div class="field"><label for="gs-' + f.k + '">' + esc(f.l) + '</label><input type="' + (f.t === 'number' ? 'number' : 'text') + '" id="gs-' + f.k + '" value="' + esc(v) + '"></div>';
  };
  const narrow = SETTING_FIELDS.filter((f) => !f.wide && f.t !== 'bool');
  const wide = SETTING_FIELDS.filter((f) => f.wide || f.t === 'bool');
  let html = '';
  for (let i = 0; i < narrow.length; i += 2) {
    html += '<div class="field-row">' + field(narrow[i]) + (narrow[i + 1] ? field(narrow[i + 1]) : '<div></div>') + '</div>';
  }
  html += wide.map(field).join('');
  $('generalSettings').innerHTML = html;
}
async function onToggleRegStatus() {
  const on = $('admOpenToggle').checked;
  try {
    await API.saveSettings({ reg_open: on ? '1' : '0' });
    S.reg_open = on ? '1' : '0';
    $('admOpenLabel').textContent = on ? 'เปิดรับสมัครอยู่' : 'ปิดรับสมัครอยู่';
    renderStatusBanner(); applyRegStatusToForm();
    toast(on ? 'เปิดรับสมัครแล้ว' : 'ปิดรับสมัครแล้ว');
  } catch (err) { $('admOpenToggle').checked = !on; toast(err.message, true); }
}
async function saveClosedMessage() {
  try {
    const obj = { reg_period_display: $('admPeriodMsg').value.trim(), reg_closed_message: $('admClosedMsg').value.trim() };
    await API.saveSettings(obj);
    Object.assign(S, obj);
    renderStatusBanner(); applyRegStatusToForm();
    toast('บันทึกข้อความแล้ว');
  } catch (err) { toast(err.message, true); }
}
async function saveGeneralSettings() {
  const obj = {};
  for (const f of SETTING_FIELDS) {
    const el = $('gs-' + f.k);
    if (!el) continue;
    if (f.t === 'bool') obj[f.k] = el.checked ? '1' : '0';
    else if (f.t === 'datetime') obj[f.k] = el.value ? el.value + ':00+07:00' : '';
    else obj[f.k] = el.value.trim();
  }
  if (obj.subject_fee !== '' && !(Number(obj.subject_fee) >= 0)) { toast('ค่าธรรมเนียมต้องเป็นตัวเลข', true); return; }
  if (!obj.app_prefix) { toast('กรุณากรอกคำนำหน้าเลขที่สมัคร', true); return; }
  try {
    await API.saveSettings(obj);
    Object.assign(S, obj);
    applySettings();
    toast('บันทึกข้อมูลทั้งหมดแล้ว');
  } catch (err) { toast(err.message, true); }
}
async function changeAdminPassword() {
  clearErr('pwError');
  const a = $('pw-new').value, b = $('pw-confirm').value;
  if (a.length < 8) { showErr('pwError', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
  if (a !== b) { showErr('pwError', 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน'); return; }
  try { await API.changePassword(a); $('pw-new').value = ''; $('pw-confirm').value = ''; toast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'); }
  catch (err) { showErr('pwError', err.message); }
}

/* ----- ประกาศ ----- */
/* =====================================================================
   เริ่มต้นระบบ
===================================================================== */
async function boot() {
  renderFaq();
  document.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('subj-check')) updateFeeTotal(); });
  window.addEventListener('afterprint', () => { /* คงหน้าบัตรไว้ ให้ผู้ใช้กดปิดเอง */ });

  if (!API.configured) {
    $('setupBanner').innerHTML = '<div class="setup-banner">⚙️ <b>ยังไม่ได้ตั้งค่าฐานข้อมูล</b> — เปิดไฟล์ <code>assets/js/config.js</code> แล้วใส่ <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> ของคุณ (ดูขั้นตอนใน README)</div>';
    applySettings();
    setInterval(renderCountdown, 1000);
    { const p0 = parseHash(); showView(p0.view, p0.id); }
    return;
  }

  try {
    S = Object.assign({}, DEFAULTS, await API.getSettings());
  } catch (err) {
    $('setupBanner').innerHTML = '<div class="setup-banner err">เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' + esc(err.message) +
      '<br>ตรวจสอบว่ารันไฟล์ <code>supabase/schema.sql</code> แล้ว และค่าใน <code>config.js</code> ถูกต้อง</div>';
  }
  applySettings();
  renderCountdown();
  setInterval(renderCountdown, 1000);
  loadHomeStats();
  renderHomeNews();

  const adm = await API.adminSession();
  if (adm) { isAdmin = true; adminEmail = adm.email; }
  const p1 = parseHash();
  showView(p1.view, p1.id);
}
document.addEventListener('DOMContentLoaded', boot);