// =====================================================================
// สมัครแบบโรงเรียน (ครูที่ปรึกษาสมัครให้นักเรียนหลายคน) + พอร์ทัลครูที่ปรึกษา
// ใช้ฟังก์ชันกลางจาก app.js ($, esc, safeImg, toast, withBusy, compressImage, compressToDataUrl ฯลฯ)
// =====================================================================
'use strict';

const GRADES = ['ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];
const MAX_BATCH = 100;
let currentTeacher = null;   // { id, phone, data }  เก็บในหน่วยความจำเท่านั้น
let schoolRowMap = [];       // ลำดับแถวที่ส่งขึ้นเซิร์ฟเวอร์ -> เลขแถวที่ผู้ใช้เห็น

/* ---------------------------------------------------------------------
   ตารางรายชื่อนักเรียน
--------------------------------------------------------------------- */
function studentRowHtml() {
  return '<tr class="stu-row"><td class="mono rowno"></td>' +
    '<td><select class="sr-prefix"><option value="">เลือก</option><option>เด็กชาย</option><option>เด็กหญิง</option></select></td>' +
    '<td><input type="text" class="sr-first"></td><td><input type="text" class="sr-last"></td>' +
    '<td><input type="text" class="sr-id idc" inputmode="numeric" maxlength="17"></td>' +
    '<td><input type="date" class="sr-birth"></td>' +
    '<td><select class="sr-grade">' + GRADES.map((g, i) => '<option value="' + g + '">ป.' + (i + 4) + '</option>').join('') + '</select></td>' +
    '<td><div style="display:flex; gap:6px; align-items:center;"><div class="sr-thumb"><div class="mini-photo-empty"></div></div>' +
    '<span class="file-btn btn btn-outline" style="padding:5px 12px; font-size:.75rem;"><span class="sr-photo-label">เลือกรูป</span>' +
    '<input type="file" accept="image/jpeg,image/png" onchange="schoolRowPhoto(this)"></span></div></td>' +
    '<td><button type="button" class="btn btn-danger" onclick="removeStudentRow(this)" aria-label="ลบแถว">×</button></td></tr>';
}
function renumberRows() {
  document.querySelectorAll('#schStudents .rowno').forEach((el, i) => { el.textContent = i + 1; });
  updateSchoolTotal();
}
function addStudentRow(d) {
  if (document.querySelectorAll('#schStudents .stu-row').length >= MAX_BATCH) { toast('เพิ่มได้ไม่เกิน ' + MAX_BATCH + ' คนต่อครั้ง', true); return null; }
  $('schStudents').insertAdjacentHTML('beforeend', studentRowHtml());
  const tr = $('schStudents').lastElementChild;
  if (d) {
    tr.querySelector('.sr-prefix').value = d.prefix || '';
    tr.querySelector('.sr-first').value = d.first || '';
    tr.querySelector('.sr-last').value = d.last || '';
    tr.querySelector('.sr-id').value = d.id || '';
    tr.querySelector('.sr-birth').value = d.birth || '';
    if (d.grade) tr.querySelector('.sr-grade').value = d.grade;
  }
  renumberRows();
  return tr;
}
// อัปโหลดรูปถ่ายนักเรียนรายแถว (ย่อรูปในเบราว์เซอร์ก่อนส่ง เหมือนการสมัครรายบุคคล)
async function schoolRowPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const tr = input.closest('tr');
  try {
    const p = await compressImage(input.files[0]);
    tr._photo = p;
    tr.querySelector('.sr-thumb').innerHTML = '<img class="mini-photo" src="' + p.thumb + '" alt="">';
    tr.querySelector('.sr-photo-label').textContent = 'เปลี่ยนรูป';
    updateSchoolTotal();
  } catch (err) { toast(err.message, true); input.value = ''; }
}
function removeStudentRow(btn) {
  const rows = document.querySelectorAll('#schStudents .stu-row');
  if (rows.length <= 1) { toast('ต้องมีอย่างน้อย 1 แถว', true); return; }
  btn.closest('tr').remove();
  renumberRows();
}
function rowIsEmpty(tr) {
  return !tr.querySelector('.sr-first').value.trim() && !tr.querySelector('.sr-last').value.trim() && !idDigits(tr.querySelector('.sr-id').value);
}
function updateSchoolTotal() {
  const rows = Array.from(document.querySelectorAll('#schStudents .stu-row')).filter((tr) => !rowIsEmpty(tr));
  const withPhoto = rows.filter((tr) => tr._photo).length;
  // ค่าสมัครต่อคนตามวิธีคิดใน ตั้งค่าระบบ (เหมาต่อท่าน หรือตามจำนวนวิชา)
  if ($('schTotal')) $('schTotal').textContent = (rows.length * feeFor(getSubjects().length)) + ' ฿';
  if ($('schCount')) $('schCount').textContent = 'นักเรียน ' + rows.length + ' คน · แนบรูปแล้ว ' + withPhoto + ' คน';
}

/* ---------------------------------------------------------------------
   นำเข้ารายชื่อจาก Excel / Google Sheets (วางข้อความ)
--------------------------------------------------------------------- */
function parseDateFlexible(str) {
  const t = String(str || '').trim();
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else return '';
  if (y > 2400) y -= 543;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return '';
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function normPrefix(p) {
  const t = String(p || '').replace(/\s/g, '');
  if (/^(เด็กชาย|ด\.?ช\.?)$/.test(t)) return 'เด็กชาย';
  if (/^(เด็กหญิง|ด\.?ญ\.?)$/.test(t)) return 'เด็กหญิง';
  return '';
}
function normGrade(g) {
  const m = String(g || '').match(/[456]/);
  return m ? GRADES[Number(m[0]) - 4] : '';
}

function importPasted() {
  const text = $('sch-paste').value.replace(/\r/g, '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { toast('ยังไม่ได้วางรายชื่อ', true); return; }
  // ลบแถวว่างที่มีอยู่ก่อน เพื่อให้รายชื่อที่นำเข้าเริ่มจากบนสุด
  document.querySelectorAll('#schStudents .stu-row').forEach((tr) => { if (rowIsEmpty(tr)) tr.remove(); });
  let ok = 0, skipped = 0;
  for (const line of lines) {
    const cols = (line.indexOf('\t') !== -1 ? line.split('\t') : line.split(',')).map((c) => c.trim());
    if (cols.length < 6 || idDigits(cols[3]).length !== 13) { skipped++; continue; }   // หัวตาราง/แถวไม่ครบ
    const tr = addStudentRow({
      prefix: normPrefix(cols[0]), first: cols[1], last: cols[2], id: idDigits(cols[3]),
      birth: parseDateFlexible(cols[4]), grade: normGrade(cols[5])
    });
    if (!tr) break;
    ok++;
  }
  if (!document.querySelector('#schStudents .stu-row')) addStudentRow();
  renumberRows();
  $('sch-paste').value = '';
  toast('นำเข้า ' + ok + ' คน' + (skipped ? ' · ข้าม ' + skipped + ' แถวที่ข้อมูลไม่ครบ/เลขบัตรไม่ถูกต้อง' : '') + ' — โปรดตรวจวันเกิดและคำนำหน้าในตาราง', skipped > 0 && ok === 0);
}

/* ---------------------------------------------------------------------
   ส่งใบสมัครแบบโรงเรียน
--------------------------------------------------------------------- */
function applySchoolStatus() {
  const open = S.reg_open === '1';
  if ($('schoolClosedNotice')) {
    $('schoolClosedNotice').style.display = open ? 'none' : 'block';
    $('schoolClosedMsg').textContent = S.reg_closed_message || 'กรุณาติดตามประกาศรอบสมัครถัดไป';
  }
  if ($('schoolFormWrap') && !$('schoolSuccessWrap').innerHTML) $('schoolFormWrap').style.display = open ? 'block' : 'none';
}

// เปลี่ยนเลข "แถวที่ N" ที่เซิร์ฟเวอร์รายงาน ให้ตรงกับเลขแถวที่ผู้ใช้เห็นในตาราง
function mapRowError(msg) {
  return String(msg).replace(/แถวที่ (\d+)/, (m, n) => 'แถวที่ ' + (schoolRowMap[Number(n) - 1] || n));
}

async function submitSchool(evt) {
  evt.preventDefault();
  clearErr('schError');
  if (S.reg_open !== '1') { showErr('schError', 'ขณะนี้ปิดรับสมัครสอบแล้ว'); return false; }

  const tid = idDigits($('sch-tid').value);
  if (!/^\d{13}$/.test(tid)) { showErr('schError', 'เลขประจำตัวประชาชนครูต้องเป็นตัวเลข 13 หลัก'); return false; }

  const students = [];
  schoolRowMap = [];
  const trs = Array.from(document.querySelectorAll('#schStudents .stu-row'));
  const seen = {};
  for (let i = 0; i < trs.length; i++) {
    const tr = trs[i];
    if (rowIsEmpty(tr)) continue;
    const n = i + 1;
    const o = {
      prefix: tr.querySelector('.sr-prefix').value, first_name: tr.querySelector('.sr-first').value.trim(),
      last_name: tr.querySelector('.sr-last').value.trim(), id_card: idDigits(tr.querySelector('.sr-id').value),
      birth_date: tr.querySelector('.sr-birth').value, grade: tr.querySelector('.sr-grade').value,
      subjects: getSubjects(),   // สมัครครั้งเดียวสอบครบทุกวิชาที่เปิดสอบ
      photo_data: tr._photo ? tr._photo.full : null, thumb_data: tr._photo ? tr._photo.thumb : null
    };
    const fail = (m) => { showErr('schError', 'แถวที่ ' + n + ' : ' + m); tr.scrollIntoView({ block: 'center' }); };
    if (!o.prefix) { fail('กรุณาเลือกคำนำหน้า'); return false; }
    if (!o.first_name || !o.last_name) { fail('กรุณากรอกชื่อและนามสกุล'); return false; }
    if (!/^\d{13}$/.test(o.id_card)) { fail('เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก'); return false; }
    if (seen[o.id_card]) { fail('เลขประจำตัวประชาชนซ้ำกับแถวที่ ' + seen[o.id_card]); return false; }
    seen[o.id_card] = n;
    if (!o.birth_date) { fail('กรุณาระบุวันเกิดให้ถูกต้อง'); return false; }
    students.push(o);
    schoolRowMap.push(n);
  }
  if (!students.length) { showErr('schError', 'กรุณากรอกรายชื่อนักเรียนอย่างน้อย 1 คน'); return false; }
  if (S.require_slip === '1' && !slipData.school) { showErr('schError', 'กรุณาแนบสลิปการชำระเงิน'); return false; }

  const btn = evt.target.querySelector('button[type=submit]');
  try {
    const r = await withBusy(btn, 'กำลังบันทึกข้อมูล...', () => API.registerSchool({
      school_name: $('sch-school').value, teacher_prefix: $('sch-tprefix').value, teacher_name: $('sch-tname').value,
      teacher_id_card: tid, teacher_phone: $('sch-tphone').value, teacher_email: $('sch-temail').value,
      slip_data: slipData.school, students: students
    }));
    renderSchoolSuccess(r, tid, $('sch-tphone').value);
  } catch (err) { showErr('schError', mapRowError(err.message)); }
  return false;
}

function renderSchoolSuccess(r, tid, phone) {
  $('schoolFormWrap').style.display = 'none';
  const box = $('schoolSuccessWrap');
  box.style.display = 'block';
  box.innerHTML = '<div class="card receipt" style="max-width:760px; margin:0 auto;"><div class="badge">✅</div><h3>สมัครแบบโรงเรียนสำเร็จ</h3>' +
    '<p style="color:var(--ink-light); font-size:.9rem;">เลขกลุ่มของคุณคือ</p><div class="appno">' + esc(r.batch_no) + '</div>' +
    '<div class="receipt-detail"><div class="row"><span>โรงเรียน</span><span>' + esc(r.school_name) + '</span></div>' +
    '<div class="row"><span>จำนวนนักเรียน</span><span>' + esc(r.count) + ' คน</span></div>' +
    '<div class="row"><span>ยอดรวมค่าสมัคร</span><span>' + esc(r.total_fee) + ' บาท</span></div>' +
    '<div class="row"><span>สถานะ</span><span>' + approvalBadge('pending') + '</span></div></div>' +
    '<div class="note-box info" style="margin-top:16px;">ขั้นตอนต่อไป: ' + (slipData.school ? 'รอเจ้าหน้าที่ตรวจสอบสลิป ' : 'โอนเงินและแนบสลิปที่เมนู "ครูที่ปรึกษา" ') +
    '· หากยังไม่ได้แนบรูปถ่ายนักเรียนบางคน อัปโหลดเพิ่มได้ที่เมนู "ครูที่ปรึกษา" (ใช้เลขบัตรครู + เบอร์โทรที่กรอกไว้เข้าสู่ระบบ) · เมื่ออนุมัติแล้วพิมพ์บัตรทั้งกลุ่มได้ในที่เดียว</div>' +
    '<div class="table-wrap" style="margin-top:16px; text-align:left;"><table><thead><tr><th>เลขที่สมัคร</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>วิชา</th></tr></thead><tbody>' +
    (r.students || []).map((s) => '<tr><td class="mono">' + esc(s.app_no) + '</td><td>' + esc(s.name) + '</td><td>' + esc(s.grade) + '</td><td>' + esc((s.subjects || []).join(', ')) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="receipt-actions"><button class="btn btn-primary" onclick="teacherLoginWith(\'' + esc(tid) + '\',\'' + esc(idDigits(phone)) + '\')">ไปที่พอร์ทัลครูที่ปรึกษา</button>' +
    '<button class="btn btn-outline" onclick="resetSchoolForm()">สมัครกลุ่มใหม่</button></div></div>';
  window.scrollTo(0, 0);
}
function resetSchoolForm() {
  $('schoolForm').reset();
  $('schStudents').innerHTML = '';
  for (let i = 0; i < 3; i++) addStudentRow();
  slipData.school = null;
  $('schSlipPreview').innerHTML = '<span class="ph">ยังไม่มีสลิป</span>';
  $('schoolSuccessWrap').innerHTML = '';
  $('schoolSuccessWrap').style.display = 'none';
  applySchoolStatus();
  window.scrollTo(0, 0);
}

/* =====================================================================
   ครูที่ปรึกษา: เข้าสู่ระบบ + พอร์ทัล
===================================================================== */
async function teacherLogin(evt) {
  evt.preventDefault();
  clearErr('teacherError');
  const btn = evt.target.querySelector('button[type=submit]');
  try {
    await withBusy(btn, 'กำลังเข้าสู่ระบบ...', () => teacherLoginWith(idDigits($('t-idcard').value), idDigits($('t-phone').value), true));
  } catch (err) { showErr('teacherError', err.message); }
  return false;
}
async function teacherLoginWith(id, phone, silentError) {
  try {
    if (!/^\d{13}$/.test(id)) throw new Error('เลขประจำตัวประชาชนครูต้องเป็นตัวเลข 13 หลัก');
    const data = await API.teacherLogin(id, phone);
    if (!data) throw new Error('ไม่พบข้อมูลกลุ่มสมัคร กรุณาตรวจสอบเลขบัตรและเบอร์โทรที่ใช้สมัครอีกครั้ง');
    currentTeacher = { id: id, phone: phone, data: data };
    renderTeacherPortal();
    go('teacherportal');
  } catch (err) {
    if (silentError) throw err;
    toast(err.message, true);
  }
}
async function refreshTeacher() {
  const t = currentTeacher;
  if (!t) return;
  const data = await API.teacherLogin(t.id, t.phone);
  if (data) { currentTeacher.data = data; renderTeacherPortal(); }
}
function teacherLogout() { currentTeacher = null; $('teacherContent').innerHTML = ''; go('home'); }

function renderTeacherPortal() {
  const d = currentTeacher.data;
  $('teacherContent').innerHTML =
    '<div class="portal-head" style="max-width:none; justify-content:space-between; flex-wrap:wrap;"><div style="display:flex; gap:14px; align-items:center;"><div class="av">👩‍🏫</div>' +
    '<div><h3>ครูที่ปรึกษา ' + esc(d.teacher_name) + '</h3><p>' + d.batches.length + ' กลุ่มสมัคร</p></div></div>' +
    '<div style="display:flex; gap:8px;"><a class="btn btn-teal" href="#schoolreg">+ สมัครกลุ่มใหม่</a><button class="btn btn-outline" onclick="teacherLogout()">ออกจากระบบ</button></div></div>' +
    d.batches.map(teacherBatchHtml).join('');
}

function teacherBatchHtml(b) {
  const approved = b.approval_status === 'approved';
  const noPhoto = b.students.filter((s) => !s.has_photo).length;
  let notes = '';
  if (b.approval_status === 'rejected') notes += '<div class="note-box warn"><b>เจ้าหน้าที่ไม่อนุมัติกลุ่มนี้</b>' + (b.approval_note ? '<br>เหตุผล: ' + esc(b.approval_note) : '') + '<br>กรุณาอัปโหลดสลิปที่ถูกต้องอีกครั้ง</div>';
  else if (b.approval_status === 'pending') notes += '<div class="note-box info">' + (b.has_slip ? 'ส่งสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ' : 'ยังไม่ได้แนบสลิปการชำระเงิน กรุณาโอนเงินและแนบสลิป') + '</div>';
  if (approved && noPhoto) notes += '<div class="note-box info">นักเรียน ' + noPhoto + ' คนยังไม่มีรูปถ่าย — บัตรของคนเหล่านี้จะไม่มีรูป กรุณาอัปโหลดก่อนพิมพ์</div>';

  const slipBox = approved ? '' :
    '<div class="pay-box" style="margin-top:14px;"><div class="pay-total">ยอดรวมที่ต้องชำระ <b>' + esc(b.total_fee) + ' ฿</b></div><div class="pay-info">' + esc(S.bank_info) + '</div>' +
    '<div style="margin-top:10px;"><span class="file-btn btn btn-outline" style="padding:8px 18px; font-size:.85rem;">' + (b.has_slip ? 'อัปโหลดสลิปใหม่' : 'แนบสลิปการชำระเงิน') +
    '<input type="file" accept="image/jpeg,image/png" onchange="teacherSlipPick(this,' + Number(b.id) + ')"></span></div></div>';

  const rows = b.students.map((s) => {
    const th = safeImg(s.thumb_data);
    return '<tr><td>' + (th ? '<img class="mini-photo" src="' + th + '" alt="">' : '<div class="mini-photo-empty"></div>') + '</td>' +
      '<td class="mono">' + esc(s.app_no) + '</td><td>' + esc(s.prefix + s.first_name + ' ' + s.last_name) + '</td>' +
      '<td class="mono">' + esc(s.id_card) + '</td><td>' + esc(s.grade) + '</td><td>' + esc((s.subjects || []).join(', ')) + '</td>' +
      '<td>' + statusPill(s.approval_status) + '</td>' +
      '<td><span class="file-btn btn btn-outline" style="padding:5px 12px; font-size:.75rem;">' + (s.has_photo ? 'เปลี่ยนรูป' : 'อัปโหลดรูป') +
      '<input type="file" accept="image/jpeg,image/png" onchange="teacherPhotoPick(this,' + Number(s.id) + ')"></span></td></tr>';
  }).join('');

  return '<div class="card teacher-batch"><div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">' +
    '<div><h3>' + esc(b.school_name) + '</h3><div style="color:var(--ink-light); font-size:.85rem; margin-top:4px;">เลขกลุ่ม <span class="mono">' + esc(b.batch_no) + '</span> · ' +
    b.students.length + ' คน · ยอดรวม ' + esc(b.total_fee) + ' บาท</div></div><div>' + approvalBadge(b.approval_status) + '</div></div>' +
    notes + slipBox +
    (approved ? '<div style="margin-top:14px;"><button class="btn btn-primary" onclick="teacherPrintCards(' + Number(b.id) + ')">พิมพ์บัตรประจำตัวผู้เข้าสอบทั้งกลุ่ม</button></div>' : '') +
    '<div class="table-wrap" style="margin-top:16px;"><table><thead><tr><th>รูป</th><th>เลขที่สมัคร</th><th>ชื่อ-นามสกุล</th><th>เลขบัตรประชาชน</th><th>ชั้น</th><th>วิชา</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

async function teacherPhotoPick(input, studentId) {
  if (!input.files || !input.files[0]) return;
  const t = currentTeacher;
  try {
    const p = await compressImage(input.files[0]);
    await API.teacherSetPhoto(t.id, t.phone, studentId, p.full, p.thumb);
    toast('อัปโหลดรูปถ่ายแล้ว');
    await refreshTeacher();
  } catch (err) { toast(err.message, true); input.value = ''; }
}
async function teacherSlipPick(input, batchId) {
  if (!input.files || !input.files[0]) return;
  const t = currentTeacher;
  try {
    const slip = await compressToDataUrl(input.files[0], 1200, 0.75, 450000);
    await API.teacherUploadSlip(t.id, t.phone, batchId, slip);
    toast('ส่งสลิปเรียบร้อย รอเจ้าหน้าที่ตรวจสอบ');
    await refreshTeacher();
  } catch (err) { toast(err.message, true); input.value = ''; }
}
async function teacherPrintCards(batchId) {
  const t = currentTeacher;
  try {
    const cards = await API.teacherGetCards(t.id, t.phone, batchId);
    if (!cards.length) { toast('ยังไม่มีนักเรียนที่ได้รับการอนุมัติในกลุ่มนี้', true); return; }
    showTickets(cards.map(examCardHtml));
  } catch (err) { toast(err.message, true); }
}

/* เริ่มต้น: แถวว่าง 3 แถวในตารางสมัครแบบโรงเรียน */
document.addEventListener('DOMContentLoaded', () => {
  for (let i = 0; i < 3; i++) addStudentRow();
  $('schStudents').addEventListener('input', updateSchoolTotal);
  $('schStudents').addEventListener('change', updateSchoolTotal);
});