// =====================================================================
// เจ้าหน้าที่: ตรวจสอบ/อนุมัติผู้สมัคร (ดูสลิป + รูป) · อนุมัติหลายรายการ · จัดการกลุ่มโรงเรียน
// =====================================================================
'use strict';

let reviewCtx = null;      // { type: 'applicant' | 'batch', id }
let batchesCache = [];

function openLightboxFrom(imgId) {
  const src = safeImg($(imgId).getAttribute('src'));
  if (!src) return;
  $('lightboxImg').src = src;
  $('lightbox').classList.add('show');
}
function closeLightbox() { $('lightbox').classList.remove('show'); $('lightboxImg').removeAttribute('src'); }
function closeReview() { $('reviewModal').classList.remove('show'); reviewCtx = null; }

function kv(label, value) {
  return '<div class="row"><span>' + esc(label) + '</span><span style="text-align:right;">' + (value == null || value === '' ? '—' : esc(value)) + '</span></div>';
}

/* ---------------------------------------------------------------------
   ตรวจสอบผู้สมัครรายบุคคล
--------------------------------------------------------------------- */
async function openReview(id) {
  try {
    const a = await API.getApplicantFull(id);
    const photo = safeImg(a.photo_data);
    const slip = safeImg(a.slip_data);
    reviewCtx = { type: 'applicant', id: Number(a.id) };
    $('reviewBody').innerHTML =
      '<div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">' +
      '<div><h3>' + esc(a.prefix + a.first_name + ' ' + a.last_name) + '</h3><div style="color:var(--ink-light); font-size:.85rem;" class="mono">' + esc(a.app_no) + '</div></div>' +
      '<div>' + statusPill(a.approval_status) + '</div></div>' +
      (a.batch_id ? '<div class="note-box info">ผู้สมัครรายนี้สมัครผ่านครูที่ปรึกษา — โดยปกติควรอนุมัติทั้งกลุ่มที่แท็บ "สมัครแบบโรงเรียน"</div>' : '') +
      '<div class="review-grid"><div><div class="receipt-detail" style="margin-top:0; border-top:none; padding-top:0;">' +
      kv('เลขประจำตัวประชาชน', a.id_card) + kv('วันเกิด', a.birth_date) + kv('ระดับชั้น', a.grade) + kv('โรงเรียน', a.school) +
      kv('วิชาที่สมัคร', (a.applicant_subjects || []).map((x) => x.subject).join(', ')) +
      kv('ค่าธรรมเนียม', a.fee + ' บาท') + kv('ผู้ปกครอง', a.guardian_name) + kv('เบอร์โทร', a.guardian_phone) + kv('อีเมล', a.email) +
      kv('ส่งสลิปเมื่อ', a.slip_uploaded_at ? fmtDate(a.slip_uploaded_at) : null) + '</div>' +
      '<div style="margin-top:14px;"><div class="hint" style="margin-bottom:6px;">รูปถ่ายติดบัตร</div>' +
      (photo ? '<img class="review-img" id="rvPhoto" style="max-height:200px; width:auto;" src="' + photo + '" alt="รูปถ่าย" onclick="openLightboxFrom(\'rvPhoto\')">' : '<div class="note-box warn" style="margin-top:0;">ไม่มีรูปถ่าย</div>') + '</div></div>' +
      '<div><div class="hint" style="margin-bottom:6px;">สลิปการชำระเงิน (คลิกที่รูปเพื่อขยาย)</div>' +
      (slip ? '<img class="review-img" id="rvSlip" src="' + slip + '" alt="สลิป" onclick="openLightboxFrom(\'rvSlip\')">' : '<div class="note-box warn" style="margin-top:0;">' + (a.batch_id ? 'ชำระรวมโดยครูที่ปรึกษา (ดูสลิปที่แท็บกลุ่มโรงเรียน)' : 'ยังไม่ได้แนบสลิป') + '</div>') + '</div></div>' +
      '<div class="field" style="margin-top:16px;"><label for="rvNote">หมายเหตุ / เหตุผลที่ไม่อนุมัติ (ผู้สมัครจะเห็นข้อความนี้)</label>' +
      '<textarea id="rvNote" rows="2" placeholder="เช่น สลิปไม่ชัดเจน / ยอดเงินไม่ตรง">' + esc(a.approval_note || '') + '</textarea></div>' +
      '<div class="review-actions"><button class="btn btn-teal" onclick="reviewDecide(\'approved\')">อนุมัติ</button>' +
      '<button class="btn btn-primary" onclick="reviewDecide(\'approved\', true)">อนุมัติและตรวจรายถัดไป</button>' +
      '<button class="btn btn-danger" style="padding:10px 18px; font-size:.9rem;" onclick="reviewDecide(\'rejected\')">ไม่อนุมัติ</button>' +
      (a.approval_status !== 'pending' ? '<button class="btn btn-outline" onclick="reviewDecide(\'pending\')">คืนเป็นรอตรวจสอบ</button>' : '') +
      '<button class="btn btn-outline" onclick="closeReview()">ปิด</button></div>';
    $('reviewModal').classList.add('show');
  } catch (err) { toast(err.message, true); }
}

function nextPendingId(afterId) {
  const list = applicantsCache;
  const idx = list.findIndex((x) => x.id === afterId);
  for (let i = idx + 1; i < list.length; i++) {
    const x = list[i];
    if (x.approval_status === 'pending' && x.slip_uploaded_at && !x.batch_id) return x.id;
  }
  return null;
}

async function reviewDecide(status, goNext) {
  if (!reviewCtx) return;
  const note = $('rvNote') ? $('rvNote').value.trim() : '';
  if (status === 'rejected' && !note) { toast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', true); return; }
  const ctx = reviewCtx;
  try {
    if (ctx.type === 'applicant') {
      await API.setApproval([ctx.id], status, status === 'rejected' ? note : null);
      const a = applicantsCache.find((x) => x.id === ctx.id);
      const nextId = goNext ? nextPendingId(ctx.id) : null;
      if (a) { a.approval_status = status; a.approval_note = status === 'rejected' ? note : null; }
      renderStats(); renderAdminTable();
      toast(status === 'approved' ? 'อนุมัติแล้ว' : status === 'rejected' ? 'บันทึกการไม่อนุมัติแล้ว' : 'คืนเป็นรอตรวจสอบแล้ว');
      closeReview();
      if (goNext) { if (nextId) openReview(nextId); else toast('ไม่มีรายการรอตรวจสอบถัดไปแล้ว'); }
    } else {
      await API.setBatchStatus(ctx.id, status, status === 'rejected' ? note : null);
      toast(status === 'approved' ? 'อนุมัติทั้งกลุ่มแล้ว' : status === 'rejected' ? 'บันทึกการไม่อนุมัติทั้งกลุ่มแล้ว' : 'คืนเป็นรอตรวจสอบแล้ว');
      closeReview();
      await loadAdminData();
    }
  } catch (err) { toast(err.message, true); }
}

/* ---------------------------------------------------------------------
   อนุมัติหลายรายการ (ติ๊กเลือกในตาราง)
--------------------------------------------------------------------- */
async function bulkApprove() {
  const ids = Array.from(document.querySelectorAll('.row-check:checked')).map((c) => Number(c.value));
  if (!ids.length) { toast('กรุณาติ๊กเลือกผู้สมัครที่ต้องการอนุมัติก่อน', true); return; }
  const noSlip = applicantsCache.filter((a) => ids.indexOf(a.id) !== -1 && !a.batch_id && !a.slip_uploaded_at).length;
  const msg = 'อนุมัติผู้สมัคร ' + ids.length + ' รายการ?' + (noSlip ? '\n\n⚠ มี ' + noSlip + ' รายการที่ยังไม่ได้แนบสลิป' : '');
  if (!confirm(msg)) return;
  try {
    await API.setApproval(ids, 'approved', null);
    applicantsCache.forEach((a) => { if (ids.indexOf(a.id) !== -1) { a.approval_status = 'approved'; a.approval_note = null; } });
    renderStats(); renderAdminTable();
    toast('อนุมัติแล้ว ' + ids.length + ' รายการ');
  } catch (err) { toast(err.message, true); }
}

/* ---------------------------------------------------------------------
   กลุ่มสมัครแบบโรงเรียน
--------------------------------------------------------------------- */
async function loadBatches() {
  try { batchesCache = await API.listBatches(); renderBatches(); }
  catch (err) { batchesCache = []; renderBatches(); }
}
function renderBatches() {
  $('admBatchEmpty').style.display = batchesCache.length ? 'none' : 'block';
  const pend = batchesCache.filter((b) => b.approval_status === 'pending' && b.slip_uploaded_at).length;
  $('batchPendingDot').innerHTML = pend ? '<span class="dot-badge">' + pend + '</span>' : '';
  $('admBatchBody').innerHTML = batchesCache.map((b) => {
    const n = b.applicants && b.applicants[0] ? b.applicants[0].count : 0;
    return '<tr><td class="mono">' + esc(b.batch_no) + '</td><td>' + esc(b.school_name) + '</td>' +
      '<td>' + esc((b.teacher_prefix || '') + b.teacher_name) + '<br><span style="color:var(--ink-light)">' + esc(b.teacher_phone) + '</span></td>' +
      '<td class="mono">' + esc(n) + '</td><td class="mono">' + esc(b.total_fee) + ' ฿</td>' +
      '<td>' + (b.slip_uploaded_at ? '<span style="color:var(--teal-deep); font-size:.8rem;">มีสลิป</span>' : '<span style="color:#B23A2A; font-size:.8rem;">ไม่มีสลิป</span>') + '</td>' +
      '<td>' + statusPill(b.approval_status) + '</td><td>' + fmtDate(b.created_at) + '</td>' +
      '<td><button class="btn btn-primary" style="padding:6px 14px; font-size:.78rem;" onclick="openBatchReview(' + Number(b.id) + ')">ตรวจสอบ</button></td></tr>';
  }).join('');
}

async function openBatchReview(id) {
  try {
    const b = await API.getBatchFull(id);
    const slip = safeImg(b.slip_data);
    reviewCtx = { type: 'batch', id: Number(b.id) };
    const studs = (b.applicants || []).slice().sort((x, y) => x.id - y.id);
    $('reviewBody').innerHTML =
      '<div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">' +
      '<div><h3>' + esc(b.school_name) + '</h3><div style="color:var(--ink-light); font-size:.85rem;" class="mono">' + esc(b.batch_no) + '</div></div><div>' + statusPill(b.approval_status) + '</div></div>' +
      '<div class="review-grid"><div><div class="receipt-detail" style="margin-top:0; border-top:none; padding-top:0;">' +
      kv('ครูที่ปรึกษา', (b.teacher_prefix || '') + b.teacher_name) + kv('เลขบัตรครู', b.teacher_id_card) + kv('เบอร์โทร', b.teacher_phone) + kv('อีเมล', b.teacher_email) +
      kv('จำนวนนักเรียน', studs.length + ' คน') + kv('ยอดรวมที่ต้องชำระ', b.total_fee + ' บาท') +
      kv('ส่งสลิปเมื่อ', b.slip_uploaded_at ? fmtDate(b.slip_uploaded_at) : null) + '</div></div>' +
      '<div><div class="hint" style="margin-bottom:6px;">สลิปการชำระเงิน (คลิกที่รูปเพื่อขยาย)</div>' +
      (slip ? '<img class="review-img" id="rvSlip" src="' + slip + '" alt="สลิป" onclick="openLightboxFrom(\'rvSlip\')">' : '<div class="note-box warn" style="margin-top:0;">ยังไม่ได้แนบสลิป</div>') + '</div></div>' +
      '<div class="table-wrap" style="margin-top:16px; max-height:240px; overflow:auto;"><table><thead><tr><th>เลขที่สมัคร</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>วิชา</th><th>รูป</th></tr></thead><tbody>' +
      studs.map((s) => '<tr><td class="mono">' + esc(s.app_no) + '</td><td>' + esc(s.prefix + s.first_name + ' ' + s.last_name) + '</td><td>' + esc(s.grade) + '</td><td>' +
        esc((s.applicant_subjects || []).map((x) => x.subject).join(', ')) + '</td><td>' + (safeImg(s.thumb_data) ? '✓' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="field" style="margin-top:16px;"><label for="rvNote">หมายเหตุ / เหตุผลที่ไม่อนุมัติ (ครูและนักเรียนจะเห็นข้อความนี้)</label>' +
      '<textarea id="rvNote" rows="2">' + esc(b.approval_note || '') + '</textarea></div>' +
      '<div class="review-actions"><button class="btn btn-teal" onclick="reviewDecide(\'approved\')">อนุมัติทั้งกลุ่ม</button>' +
      '<button class="btn btn-danger" style="padding:10px 18px; font-size:.9rem;" onclick="reviewDecide(\'rejected\')">ไม่อนุมัติทั้งกลุ่ม</button>' +
      (b.approval_status !== 'pending' ? '<button class="btn btn-outline" onclick="reviewDecide(\'pending\')">คืนเป็นรอตรวจสอบ</button>' : '') +
      '<button class="btn btn-outline" onclick="closeReview()">ปิด</button></div>';
    $('reviewModal').classList.add('show');
  } catch (err) { toast(err.message, true); }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeLightbox(); closeReview(); }
});
