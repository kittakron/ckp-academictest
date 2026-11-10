// =====================================================================
// เจ้าหน้าที่ > ตั้งค่าระบบ: โลโก้ + ชื่อ · วิชาที่เปิดสอบ + ค่าสมัคร
// =====================================================================
'use strict';

/* ---------------------------------------------------------------------
   โลโก้ และชื่อหน่วยงาน/โครงการ
--------------------------------------------------------------------- */
function renderBrandingPanel() {
  const logo = safeImg(S.logo_data);
  $('logoPreview').innerHTML = logo ? '<img src="' + logo + '" alt="โลโก้ปัจจุบัน">' : '<span class="ph">ยังไม่มีโลโก้<br>(ใช้ตราเริ่มต้น)</span>';
  $('brandOrg').value = S.org_name || '';
  $('brandSite').value = S.site_name || '';
  $('brandTagline').value = S.site_tagline || '';
}

async function handleLogoPick(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  try {
    const data = await processLogo(file);
    await API.saveSettings({ logo_data: data });
    S.logo_data = data;
    applyBranding(); renderBrandingPanel();
    toast('อัปโหลดโลโก้แล้ว — แสดงในแถบด้านบน หน้าเข้าสู่ระบบ บัตรสอบ และไอคอนแท็บ');
  } catch (err) { toast(err.message, true); }
}
async function removeLogo() {
  if (!S.logo_data || !confirm('ลบโลโก้และกลับไปใช้ตราเริ่มต้น?')) return;
  try {
    await API.saveSettings({ logo_data: '' });
    S.logo_data = '';
    applyBranding(); renderBrandingPanel();
    toast('ลบโลโก้แล้ว');
  } catch (err) { toast(err.message, true); }
}
async function saveBranding() {
  const obj = { org_name: $('brandOrg').value.trim(), site_name: $('brandSite').value.trim(), site_tagline: $('brandTagline').value.trim() };
  if (!obj.org_name || !obj.site_name) { toast('กรุณากรอกชื่อหน่วยงานและชื่อโครงการ', true); return; }
  try {
    await API.saveSettings(obj);
    Object.assign(S, obj);
    applySettings();
    toast('บันทึกชื่อเรียบร้อยแล้ว');
  } catch (err) { toast(err.message, true); }
}

/* ---------------------------------------------------------------------
   วิชาที่เปิดสอบ + ค่าสมัคร
--------------------------------------------------------------------- */
function subjectRowHtml(name, desc, i, n) {
  return '<div class="rule-row subj-row"><span class="rule-no">' + (i + 1) + '</span>' +
    '<input class="sj-name" placeholder="ชื่อวิชา" value="' + esc(name) + '">' +
    '<input class="sj-desc" style="grid-column:span 3;" placeholder="คำอธิบายสั้น ๆ (แสดงในหน้าแรก)" value="' + esc(desc) + '">' +
    '<span class="rule-btns"><button type="button" class="btn btn-outline" onclick="moveSubject(' + i + ',-1)" aria-label="เลื่อนขึ้น"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
    '<button type="button" class="btn btn-outline" onclick="moveSubject(' + i + ',1)" aria-label="เลื่อนลง"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
    '<button type="button" class="btn btn-danger" onclick="removeSubject(' + i + ')" aria-label="ลบ">×</button></span></div>';
}
function renderSubjectsEditor(list) {
  const desc = subjectDescs();
  const rows = list || getSubjects().map((n) => ({ name: n, desc: desc[n] || '' }));
  $('subjectsEditor').innerHTML = rows.map((r, i) => subjectRowHtml(r.name, r.desc, i, rows.length)).join('');
  if (!list) {   // วาดใหม่จากค่าที่บันทึกไว้เท่านั้น — การเพิ่ม/ลบ/เลื่อนแถวต้องไม่รีเซ็ตช่องที่ผู้ใช้เพิ่งแก้
    document.querySelectorAll('input[name="feeMode"]').forEach((r) => { r.checked = r.value === (S.fee_mode || 'flat'); });
    $('setFeeFlat').value = S.fee_flat || '60';
    $('setFeeEach').value = S.subject_fee || '150';
  }
}
function readSubjectRows() {
  return Array.from(document.querySelectorAll('#subjectsEditor .subj-row')).map((r) => ({
    name: r.querySelector('.sj-name').value.trim(), desc: r.querySelector('.sj-desc').value.trim()
  }));
}
function addSubject() { const r = readSubjectRows(); r.push({ name: '', desc: '' }); renderSubjectsEditor(r); }
function removeSubject(i) { const r = readSubjectRows(); r.splice(i, 1); renderSubjectsEditor(r); }
function moveSubject(i, d) {
  const r = readSubjectRows(), j = i + d;
  if (j < 0 || j >= r.length) return;
  const t = r[i]; r[i] = r[j]; r[j] = t; renderSubjectsEditor(r);
}

async function saveSubjectsConfig() {
  const rows = readSubjectRows().filter((r) => r.name || r.desc);
  if (!rows.length || rows.some((r) => !r.name)) { toast('กรุณาตั้งชื่อวิชาให้ครบทุกแถว (อย่างน้อย 1 วิชา)', true); return; }
  const names = rows.map((r) => r.name);
  if (new Set(names).size !== names.length) { toast('ชื่อวิชาซ้ำกัน กรุณาตั้งชื่อให้ต่างกัน', true); return; }
  const mode = (document.querySelector('input[name="feeMode"]:checked') || {}).value || 'flat';
  const flat = Number($('setFeeFlat').value), each = Number($('setFeeEach').value);
  if (!(flat >= 0) || !(each >= 0)) { toast('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', true); return; }

  const before = getSubjects();
  const removed = before.filter((n) => names.indexOf(n) === -1);
  if (removed.length && applicantsCache.length &&
      !confirm('มีผู้สมัครแล้ว ' + applicantsCache.length + ' คน การลบ/เปลี่ยนชื่อวิชา "' + removed.join(', ') + '" จะทำให้คะแนนของวิชาเดิมไม่ถูกนำมาคิดเป็นวิชาปัจจุบัน\n\nแนะนำให้ตั้งค่าก่อนเปิดรับสมัคร ต้องการดำเนินการต่อหรือไม่?')) return;

  const descObj = {};
  rows.forEach((r) => { if (r.desc) descObj[r.name] = r.desc; });
  const obj = { subjects: JSON.stringify(names), subject_desc: JSON.stringify(descObj), fee_mode: mode, fee_flat: String(flat), subject_fee: String(each) };
  try {
    await API.saveSettings(obj);
    Object.assign(S, obj);
    applySettings();
    renderAdminResultsTable();
    renderSubjectsEditor();
    toast('บันทึกวิชาและค่าสมัครแล้ว');
  } catch (err) { toast(err.message, true); }
}
