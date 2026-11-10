// =====================================================================
// ประกาศผลสอบ: คะแนนรวม · อันดับรวมทั้งหมด · อันดับในระดับชั้น · สิทธิ์ที่ได้รับ
// ตัวเลขทั้งหมดคำนวณในฐานข้อมูล (ฟังก์ชัน ranked_results) เพื่อให้ทุกหน้าตรงกัน
// =====================================================================
'use strict';

let rankingsCache = [];
let lastResult = null;

const fmtNum = (v) => (v == null ? '–' : Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 }));
function medal(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''; }

function passBadge(passed) {
  if (passed === true) return '<span class="badge-pill badge-paid">ผ่านเกณฑ์</span>';
  if (passed === false) return '<span class="badge-pill badge-unpaid">ไม่ผ่านเกณฑ์</span>';
  return '<span class="badge-pill badge-pending">รอประกาศผล</span>';
}

/* ---------------------------------------------------------------------
   การ์ดผลสอบของผู้สมัคร (ใช้ทั้งหน้า "ประกาศผลสอบ" และหน้า "บัญชีของฉัน")
--------------------------------------------------------------------- */
function rankTile(title, rank, n, sub) {
  return '<div class="rank-tile"><div class="rt-title">' + esc(title) + '</div>' +
    '<div class="rt-rank">' + (rank == null ? '–' : (medal(rank) + ' ' + esc(rank))) + '</div>' +
    '<div class="rt-sub">' + (rank == null ? esc(sub || '') : 'จาก ' + esc(n) + ' คน') + '</div></div>';
}

function resultCardHtml(r) {
  lastResult = r;
  const subjects = r.subjects || [];
  const max = Number(r.subject_max) || 100;
  const full = subjects.length * max;
  const scoredAny = subjects.some((s) => s.score != null);
  const rows = subjects.map((s) => '<tr><td>' + esc(s.subject) + '</td><td class="mono">' +
    (s.score == null ? '–' : esc(fmtNum(s.score))) + ' <span style="color:var(--ink-light);">/ ' + esc(max) + '</span></td><td>' + passBadge(s.passed) + '</td></tr>').join('');

  let body = '';
  if (!r.approved) {
    body = '<div class="note-box warn">ไม่อยู่ในรายชื่อผู้มีสิทธิ์สอบที่ได้รับการอนุมัติ จึงไม่มีการจัดอันดับ — หากสงสัย กรุณาติดต่อเจ้าหน้าที่</div>';
  } else if (!scoredAny) {
    body = '<div class="note-box info">ยังไม่มีคะแนนของผู้สมัครรายนี้ในระบบ</div>';
  } else {
    body += '<div class="total-box"><div class="tb-lab">คะแนนรวม</div><div class="tb-val">' + esc(fmtNum(r.total)) +
      ' <span>/ ' + esc(full) + '</span></div><div class="tb-pct">' + (r.pct == null ? '' : esc(fmtNum(r.pct)) + '%') + '</div></div>';
    if (r.complete) {
      body += '<div class="rank-grid">' + rankTile('อันดับรวมทั้งหมด', r.rank_all, r.n_all) +
        rankTile('อันดับในระดับชั้น ' + esc(String(r.grade || '').replace('ประถมศึกษาปีที่ ', 'ป.')), r.rank_grade, r.n_grade) + '</div>' +
        '<div class="award-box ' + (r.award ? 'has' : '') + '"><div class="ab-lab">สิทธิ์ที่ได้รับ</div>' +
        '<div class="ab-name">' + esc(r.award || 'ผู้เข้าสอบ') + '</div>' +
        (r.award_detail ? '<div class="ab-detail">' + esc(r.award_detail) + '</div>' : '') + '</div>' +
        '<p class="hint" style="margin-top:10px;">อันดับคำนวณจากคะแนนรวมทุกวิชา ผู้ที่คะแนนรวมเท่ากันได้อันดับเดียวกัน นับเฉพาะผู้ที่ได้รับการอนุมัติและมีคะแนนครบทุกวิชา</p>';
    } else {
      body += '<div class="note-box info">ผลสอบยังไม่ครบทุกวิชา จึงยังไม่จัดอันดับและยังไม่ได้รับสิทธิ์ — ระบบจะประมวลผลให้เมื่อมีคะแนนครบ</div>';
    }
  }

  return '<div class="card receipt result-card" style="text-align:left;">' +
    '<div style="text-align:center;"><div class="badge">🏆</div><h3>' + esc(r.prefix + r.first_name + ' ' + r.last_name) + '</h3>' +
    '<p style="color:var(--ink-light); font-size:.85rem; margin-top:4px;">เลขที่สมัคร ' + esc(r.app_no) + ' · ' + esc(r.grade) + ' · ' + esc(r.school) + '</p></div>' +
    '<div class="table-wrap" style="margin-top:16px;"><table><thead><tr><th>วิชา</th><th>คะแนน</th><th>ผล</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    body +
    '<div class="receipt-actions"><button class="btn btn-outline" onclick="printResultSheet()">พิมพ์ใบแจ้งผลสอบ</button></div></div>';
}

// ใบแจ้งผลสอบสำหรับพิมพ์ / บันทึกเป็น PDF
function resultSheetHtml(r) {
  const subjects = r.subjects || [], max = Number(r.subject_max) || 100, full = subjects.length * max;
  const logo = cardEmblemHtml();
  return '<div class="exam-card result-sheet"><div class="exam-card-head">' + logo +
    '<div><div class="ec-org">' + esc(S.org_name) + '</div><div class="ec-sub">ใบแจ้งผลการสอบ ' + esc(S.site_name) + '</div></div></div>' +
    '<div style="padding:22px 24px;"><div class="exam-card-name">' + esc(r.prefix + r.first_name + ' ' + r.last_name) + '</div>' +
    '<div class="exam-card-appno">' + esc(r.app_no) + '</div>' +
    '<dl class="ec-grid"><dt>ระดับชั้น</dt><dd>' + esc(r.grade) + '</dd><dt>โรงเรียน</dt><dd>' + esc(r.school) + '</dd></dl>' +
    '<div class="table-wrap" style="margin:16px 0;"><table><thead><tr><th>วิชา</th><th>คะแนน</th><th>ผล</th></tr></thead><tbody>' +
    subjects.map((s) => '<tr><td>' + esc(s.subject) + '</td><td class="mono">' + (s.score == null ? '–' : esc(fmtNum(s.score))) + ' / ' + esc(max) + '</td><td>' +
      (s.passed === true ? 'ผ่านเกณฑ์' : s.passed === false ? 'ไม่ผ่านเกณฑ์' : '–') + '</td></tr>').join('') + '</tbody></table></div>' +
    (r.complete
      ? '<div class="total-box"><div class="tb-lab">คะแนนรวม</div><div class="tb-val">' + esc(fmtNum(r.total)) + ' <span>/ ' + esc(full) + '</span></div><div class="tb-pct">' + esc(fmtNum(r.pct)) + '%</div></div>' +
        '<div class="rank-grid">' + rankTile('อันดับรวมทั้งหมด', r.rank_all, r.n_all) + rankTile('อันดับในระดับชั้น', r.rank_grade, r.n_grade) + '</div>' +
        '<div class="award-box has"><div class="ab-lab">สิทธิ์ที่ได้รับ</div><div class="ab-name">' + esc(r.award || 'ผู้เข้าสอบ') + '</div>' +
        (r.award_detail ? '<div class="ab-detail">' + esc(r.award_detail) + '</div>' : '') + '</div>'
      : '<p>ผลสอบยังไม่ครบทุกวิชา จึงยังไม่จัดอันดับ</p>') +
    '<p style="font-size:.75rem; color:var(--ink-light); margin-top:14px;">พิมพ์เมื่อ ' + new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) + '</p></div></div>';
}
function printResultSheet() {
  if (!lastResult) return;
  showTickets([resultSheetHtml(lastResult)]);
}

/* ---------------------------------------------------------------------
   อันดับสูงสุดของแต่ละระดับชั้น (แสดงเมื่อเจ้าหน้าที่เปิดใช้)
--------------------------------------------------------------------- */
async function loadLeaderboard() {
  const box = $('leaderboardBox');
  if (!box) return;
  try {
    const lb = await API.publicLeaderboard();
    if (!lb || !lb.enabled || !(lb.grades || []).length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="section-head" style="margin-top:36px;"><div class="kicker">ประกาศอันดับ</div><h2>อันดับสูงสุดของแต่ละระดับชั้น</h2></div>' +
      lb.grades.map((g) => '<h4 style="margin:20px 0 8px;">' + esc(g.grade) + '</h4><div class="table-wrap"><table><thead><tr><th>อันดับ</th><th>ชื่อ-นามสกุล</th><th>โรงเรียน</th><th>คะแนนรวม</th><th>สิทธิ์ที่ได้รับ</th></tr></thead><tbody>' +
        g.rows.map((r) => '<tr><td class="mono">' + medal(r.rank) + ' ' + esc(r.rank) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.school) +
          '</td><td class="mono">' + esc(fmtNum(r.total)) + ' (' + esc(fmtNum(r.pct)) + '%)</td><td>' + esc(r.award || '–') + '</td></tr>').join('') +
        '</tbody></table></div>').join('');
  } catch (e) { box.innerHTML = ''; }
}

/* =====================================================================
   เจ้าหน้าที่: สรุปอันดับ + ตั้งค่าเกณฑ์สิทธิ์
===================================================================== */
async function loadRankings() {
  if (!isAdmin) return;
  try { rankingsCache = await API.adminRankings(); }
  catch (err) { rankingsCache = []; toast(err.message, true); }
  renderRankings();
}

function renderRankings() {
  const grades = Array.from(new Set(rankingsCache.map((r) => r.grade))).sort();
  const sel = $('rankGrade'), cur = sel.value;
  sel.innerHTML = '<option value="">ทุกระดับชั้น</option>' + grades.map((g) => '<option>' + esc(g) + '</option>').join('');
  sel.value = grades.indexOf(cur) !== -1 ? cur : '';
  const q = ($('rankSearch').value || '').trim().toLowerCase();
  const rows = rankingsCache.filter((r) => (!sel.value || r.grade === sel.value) && (!q || (r.name + ' ' + r.app_no + ' ' + r.school).toLowerCase().indexOf(q) !== -1));
  const complete = rankingsCache.filter((r) => r.complete).length;
  $('rankSummary').textContent = 'ผู้ได้รับอนุมัติ ' + rankingsCache.length + ' คน · คะแนนครบ (จัดอันดับแล้ว) ' + complete + ' คน · ยังไม่ครบ ' + (rankingsCache.length - complete) + ' คน';
  $('admRankBody').innerHTML = rows.length ? rows.slice(0, 300).map((r) =>
    '<tr><td class="mono">' + (r.rank_all == null ? '–' : medal(r.rank_all) + ' ' + esc(r.rank_all)) + '</td><td class="mono">' + (r.rank_grade == null ? '–' : esc(r.rank_grade)) + '</td>' +
    '<td class="mono">' + esc(r.app_no) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.grade) + '</td>' +
    '<td class="mono">' + esc(fmtNum(r.total)) + '</td><td class="mono">' + (r.pct == null ? '–' : esc(fmtNum(r.pct)) + '%') + '</td>' +
    '<td>' + (r.complete ? esc(r.award || '–') : '<span class="badge-pill badge-pending">คะแนนไม่ครบ ' + esc(r.scored) + '/' + esc(r.nsub) + '</span>') + '</td></tr>').join('')
    : '<tr><td colspan="8" style="text-align:center; color:var(--ink-light);">ยังไม่มีข้อมูลอันดับ — กรอกคะแนนครบทุกวิชาของผู้ที่ได้รับอนุมัติก่อน</td></tr>';
}

function downloadRankingCsv() {
  if (!rankingsCache.length) { toast('ยังไม่มีข้อมูลอันดับ', true); return; }
  const head = ['อันดับรวม', 'อันดับในระดับชั้น', 'เลขที่สมัคร', 'ชื่อ-นามสกุล', 'ระดับชั้น', 'โรงเรียน', 'คะแนนรวม', 'ร้อยละ', 'สิทธิ์ที่ได้รับ', 'รายละเอียดสิทธิ์', 'สถานะ'];
  const rows = rankingsCache.map((r) => [r.rank_all || '', r.rank_grade || '', r.app_no, r.name, r.grade, r.school, r.total, r.pct,
    r.award || '', r.award_detail || '', r.complete ? 'คะแนนครบ' : 'คะแนนไม่ครบ']);
  downloadCSV([head].concat(rows), 'ranking.csv');
}

/* ----- เกณฑ์สิทธิ์ที่ได้รับ (ตารางแก้ไขได้) ----- */
function currentRules() {
  try { const a = JSON.parse(S.award_rules); if (Array.isArray(a)) return a; } catch (e) { /* ว่าง */ }
  return [];
}
function ruleRowHtml(r, i, n) {
  const v = (x) => (x == null ? '' : esc(x));
  return '<div class="rule-row"><span class="rule-no">' + (i + 1) + '</span>' +
    '<input class="rl-name" placeholder="ชื่อสิทธิ์ เช่น เหรียญทอง" value="' + v(r.name) + '">' +
    '<input class="rl-pct" type="number" min="0" max="100" step="0.5" placeholder="คะแนนรวมขั้นต่ำ (%)" value="' + v(r.min_pct) + '">' +
    '<input class="rl-all" type="number" min="1" placeholder="อันดับรวมไม่เกิน" value="' + v(r.max_rank_all) + '">' +
    '<input class="rl-grade" type="number" min="1" placeholder="อันดับในชั้นไม่เกิน" value="' + v(r.max_rank_grade) + '">' +
    '<input class="rl-detail" placeholder="สิทธิ์ที่ได้รับ / ของรางวัล" value="' + v(r.detail) + '">' +
    '<span class="rule-btns"><button type="button" class="btn btn-outline" onclick="moveRule(' + i + ',-1)" aria-label="เลื่อนขึ้น"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
    '<button type="button" class="btn btn-outline" onclick="moveRule(' + i + ',1)" aria-label="เลื่อนลง"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
    '<button type="button" class="btn btn-danger" onclick="removeRule(' + i + ')" aria-label="ลบ">×</button></span></div>';
}
function renderRulesEditor(list) {
  const rules = list || currentRules();
  $('rulesEditor').innerHTML = rules.map((r, i) => ruleRowHtml(r, i, rules.length)).join('') ||
    '<p style="color:var(--ink-light); font-size:.88rem;">ยังไม่มีเกณฑ์ — ผู้เข้าสอบจะแสดงเป็น "ผู้เข้าสอบ" และไม่มีสิทธิ์พิเศษ</p>';
  if (!list) {   // วาดใหม่จากค่าที่บันทึกไว้เท่านั้น — การเพิ่ม/ลบ/เลื่อนเกณฑ์ต้องไม่รีเซ็ตช่องที่ผู้ใช้เพิ่งแก้
    $('setPassScore').value = S.pass_score || '50';
    $('setSubjectMax').value = S.subject_max || '100';
    $('setShowTop').checked = S.results_show_top === '1';
    $('setTopN').value = S.results_top_n || '10';
  }
}
function readRules() {
  const num = (el) => (el.value.trim() === '' ? null : Number(el.value));
  const rules = [];
  const rows = Array.from(document.querySelectorAll('#rulesEditor .rule-row'));
  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i];
    const name = tr.querySelector('.rl-name').value.trim();
    if (!name) { const empty = !tr.querySelector('.rl-detail').value.trim() && !tr.querySelector('.rl-pct').value && !tr.querySelector('.rl-all').value && !tr.querySelector('.rl-grade').value; if (empty) continue; throw new Error('เกณฑ์ข้อที่ ' + (i + 1) + ' ยังไม่ได้ตั้งชื่อสิทธิ์'); }
    const rule = { name: name };
    const pct = num(tr.querySelector('.rl-pct')), all = num(tr.querySelector('.rl-all')), gr = num(tr.querySelector('.rl-grade'));
    if (pct != null) { if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('เกณฑ์ข้อที่ ' + (i + 1) + ': คะแนนขั้นต่ำต้องอยู่ระหว่าง 0–100'); rule.min_pct = pct; }
    if (all != null) { if (!(all >= 1)) throw new Error('เกณฑ์ข้อที่ ' + (i + 1) + ': อันดับรวมต้องเป็นเลข 1 ขึ้นไป'); rule.max_rank_all = Math.floor(all); }
    if (gr != null) { if (!(gr >= 1)) throw new Error('เกณฑ์ข้อที่ ' + (i + 1) + ': อันดับในชั้นต้องเป็นเลข 1 ขึ้นไป'); rule.max_rank_grade = Math.floor(gr); }
    const detail = tr.querySelector('.rl-detail').value.trim();
    if (detail) rule.detail = detail;
    rules.push(rule);
  }
  return rules;
}
function addRule() { try { const r = readRules(); r.push({ name: '' }); renderRulesEditor(r); } catch (e) { const r = currentRules(); renderRulesEditor(r); toast(e.message, true); } }
function removeRule(i) { try { const r = readRules(); r.splice(i, 1); renderRulesEditor(r); } catch (e) { toast(e.message, true); } }
function moveRule(i, d) {
  try {
    const r = readRules(), j = i + d;
    if (j < 0 || j >= r.length) return;
    const t = r[i]; r[i] = r[j]; r[j] = t; renderRulesEditor(r);
  } catch (e) { toast(e.message, true); }
}
async function saveRulesConfig() {
  try {
    const rules = readRules();
    const pass = Number($('setPassScore').value), max = Number($('setSubjectMax').value), topN = Number($('setTopN').value);
    if (!(max > 0)) throw new Error('คะแนนเต็มต่อวิชาต้องมากกว่า 0');
    if (isNaN(pass) || pass < 0 || pass > 100) throw new Error('เกณฑ์ผ่านรายวิชาต้องอยู่ระหว่าง 0–100 (%)');
    if (!(topN >= 1 && topN <= 50)) throw new Error('จำนวนอันดับที่แสดงต้องอยู่ระหว่าง 1–50');
    const obj = {
      award_rules: JSON.stringify(rules), pass_score: String(pass), subject_max: String(max),
      results_show_top: $('setShowTop').checked ? '1' : '0', results_top_n: String(Math.floor(topN))
    };
    await API.saveSettings(obj);
    Object.assign(S, obj);
    toast('บันทึกเกณฑ์แล้ว — กำลังประมวลผลอันดับใหม่');
    renderRulesEditor();
    renderAdminResultsTable();
    await loadRankings();
  } catch (err) { toast(err.message, true); }
}
