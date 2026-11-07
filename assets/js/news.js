// =====================================================================
// ข่าวสาร — ส่วนสาธารณะ (หน้าแรก / รายการ / รายละเอียด) และตัวแก้ไขข่าวของเจ้าหน้าที่
// ใช้ฟังก์ชันกลางจาก app.js ($, esc, safeImg, safeUrl, fmtDate, toast, compressToDataUrl ฯลฯ)
// =====================================================================
'use strict';

const NEWS_PAGE = 9;
let newsOffset = 0;

// แปลงข้อความธรรมดาเป็น HTML ที่ปลอดภัย: escape ทั้งหมดก่อน แล้วทำลิงก์ http/https ให้คลิกได้
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => {
    const m = u.match(/^(.*?)([.,;:!?)]*)$/);
    return '<a href="' + m[1] + '" target="_blank" rel="noopener noreferrer">' + m[1] + '</a>' + m[2];
  });
}

function newsCardHtml(n) {
  const img = safeImg(n.image_data);
  return '<a class="card news-card" href="#news/' + Number(n.id) + '">' +
    '<div class="cover">' + (img ? '<img src="' + img + '" alt="">' : '📢') + '</div>' +
    '<div class="body">' + (n.pinned ? '<span class="pin-tag">📌 ปักหมุด</span>' : '') +
    '<h4>' + esc(n.title) + '</h4><div class="a-date">' + fmtDate(n.created_at) + '</div>' +
    (n.description ? '<p>' + esc(n.description) + '</p>' : '') + '</div></a>';
}

/* ----- หน้าแรก: ข่าวล่าสุด 6 รายการ ----- */
async function renderHomeNews() {
  const section = $('newsSection');
  try {
    const list = await API.listNews(0, 5);
    if (!list.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    $('homeNewsGrid').innerHTML = list.map(newsCardHtml).join('');
  } catch (e) { section.style.display = 'none'; }
}

/* ----- หน้ารายการข่าว ----- */
async function loadNewsPage() {
  newsOffset = 0;
  $('newsListGrid').innerHTML = '';
  $('newsEmpty').style.display = 'none';
  $('newsMoreBtn').style.display = 'none';
  await loadMoreNews();
}
async function loadMoreNews() {
  try {
    const list = await API.listNews(newsOffset, newsOffset + NEWS_PAGE - 1);
    $('newsListGrid').insertAdjacentHTML('beforeend', list.map(newsCardHtml).join(''));
    newsOffset += list.length;
    $('newsEmpty').style.display = newsOffset === 0 ? 'block' : 'none';
    $('newsMoreBtn').style.display = list.length === NEWS_PAGE ? 'inline-flex' : 'none';
  } catch (err) { toast(err.message, true); }
}

/* ----- หน้ารายละเอียดข่าว ----- */
async function loadNewsDetail(id) {
  const box = $('newsDetailBox');
  box.innerHTML = '<div class="loading-line" style="padding:40px; text-align:center; color:var(--ink-light);">กำลังโหลด...</div>';
  try {
    const n = id ? await API.getNews(id) : null;
    if (!n) {
      box.innerHTML = '<div class="card receipt"><h3>ไม่พบข่าวที่ต้องการ</h3><p style="color:var(--ink-light);">ข่าวนี้อาจถูกลบไปแล้ว</p><div class="receipt-actions"><a class="btn btn-primary" href="#news">กลับหน้าข่าวสาร</a></div></div>';
      return;
    }
    const img = safeImg(n.image_data);
    const link = safeUrl(n.link);
    document.title = n.title + ' — ' + (S.site_name || '');
    box.innerHTML = '<div class="news-detail"><a href="#news" style="color:var(--teal-deep); font-weight:600; font-size:.9rem;">← ข่าวสารทั้งหมด</a>' +
      '<h1 style="margin-top:14px;">' + esc(n.title) + '</h1>' +
      '<div class="meta">เผยแพร่ ' + fmtDate(n.created_at) + (n.pinned ? ' · 📌 ข่าวปักหมุด' : '') + '</div>' +
      (img ? '<img class="cover-big" src="' + img + '" alt="">' : '') +
      (n.description ? '<p style="font-size:1.05rem; color:var(--ink-light); margin:0 0 16px;">' + esc(n.description) + '</p>' : '') +
      (n.content ? '<div class="content">' + linkify(n.content) + '</div>' : '') +
      (link ? '<p style="margin-top:22px;"><a class="btn btn-teal" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">เปิดเอกสารแนบ</a></p>' : '') +
      '</div>';
  } catch (err) {
    box.innerHTML = '<div class="error-msg show">' + esc(err.message) + '</div>';
  }
}

/* =====================================================================
   เจ้าหน้าที่: จัดการข่าว (เพิ่ม / แก้ไข / ลบ / ปักหมุด / รูปปก)
===================================================================== */
let newsImage = null;   // dataURL รูปปกใหม่ที่เลือก (ถ้ามี)

async function handleNewsImagePick(input) {
  if (!input.files || !input.files[0]) return;
  const box = $('newsImgPreview');
  box.innerHTML = '<span class="ph">กำลังประมวลผล...</span>';
  try {
    newsImage = await compressToDataUrl(input.files[0], 900, 0.72, 150000);
    box.innerHTML = '<img src="' + newsImage + '" alt="รูปปก">';
  } catch (err) {
    newsImage = null; input.value = '';
    box.innerHTML = '<span class="ph">ยังไม่มีรูปปก</span>';
    toast(err.message, true);
  }
}

function resetNewsForm() {
  ['admAnnTitle', 'admAnnDesc', 'admAnnContent', 'admAnnLink', 'news-editing'].forEach((k) => { $(k).value = ''; });
  $('admAnnPinned').checked = false;
  $('news-img').value = '';
  newsImage = null;
  $('newsImgPreview').innerHTML = '<span class="ph">ยังไม่มีรูปปก</span>';
  $('newsImgHint').textContent = '';
  $('newsFormTitle').textContent = 'เพิ่มข่าวสาร';
  $('newsSaveBtn').textContent = 'เพิ่มข่าว';
  $('newsCancelBtn').style.display = 'none';
}

async function saveNews() {
  const title = $('admAnnTitle').value.trim();
  if (!title) { toast('กรุณากรอกหัวข้อข่าว', true); return; }
  const link = $('admAnnLink').value.trim();
  if (link && !safeUrl(link)) { toast('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://', true); return; }
  const editing = $('news-editing').value;
  const obj = {
    title: title,
    description: $('admAnnDesc').value.trim() || null,
    content: $('admAnnContent').value.trim() || null,
    link: link || null,
    pinned: $('admAnnPinned').checked
  };
  if (newsImage) obj.image_data = newsImage;
  try {
    await withBusy($('newsSaveBtn'), 'กำลังบันทึก...', () => API.saveNews(editing ? Number(editing) : null, obj));
    toast(editing ? 'บันทึกการแก้ไขข่าวแล้ว' : 'เพิ่มข่าวแล้ว');
    resetNewsForm();
    renderAdminNews();
    renderHomeNews();
  } catch (err) { toast(err.message, true); }
}

async function renderAdminNews() {
  const wrap = $('admAnnList');
  try {
    const list = await API.listNews(0, 199);
    wrap.innerHTML = list.length ? list.map((a) => {
      const img = safeImg(a.image_data);
      return '<div class="ann-list-item"><div style="display:flex; gap:12px; align-items:center;">' +
        (img ? '<img src="' + img + '" alt="" style="width:64px; height:44px; object-fit:cover; border-radius:6px; border:1px solid var(--line);">' : '') +
        '<div><div class="t">' + (a.pinned ? '📌 ' : '') + esc(a.title) + '</div><div class="d">' + fmtDate(a.created_at) + '</div></div></div>' +
        '<div style="display:flex; gap:6px;"><button class="btn btn-outline" style="padding:6px 12px; font-size:.78rem;" onclick="editNews(' + Number(a.id) + ')">แก้ไข</button>' +
        '<button class="btn btn-danger" onclick="deleteNews(' + Number(a.id) + ')">ลบ</button></div></div>';
    }).join('') : '<p style="color:var(--ink-light); font-size:.85rem;">ยังไม่มีข่าว</p>';
  } catch (err) { wrap.innerHTML = ''; }
}

async function editNews(id) {
  try {
    const n = await API.getNews(id);
    if (!n) { toast('ไม่พบข่าวนี้', true); return; }
    resetNewsForm();
    $('news-editing').value = n.id;
    $('admAnnTitle').value = n.title || '';
    $('admAnnDesc').value = n.description || '';
    $('admAnnContent').value = n.content || '';
    $('admAnnLink').value = n.link || '';
    $('admAnnPinned').checked = !!n.pinned;
    const img = safeImg(n.image_data);
    if (img) { $('newsImgPreview').innerHTML = '<img src="' + img + '" alt="รูปปกปัจจุบัน">'; $('newsImgHint').textContent = '(เว้นว่างไว้ถ้าไม่เปลี่ยน)'; }
    $('newsFormTitle').textContent = 'แก้ไขข่าว';
    $('newsSaveBtn').textContent = 'บันทึกการแก้ไข';
    $('newsCancelBtn').style.display = 'inline-flex';
    $('admAnnTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) { toast(err.message, true); }
}

async function deleteNews(id) {
  if (!confirm('ยืนยันการลบข่าวนี้หรือไม่?')) return;
  try {
    await API.deleteNews(id);
    if ($('news-editing').value === String(id)) resetNewsForm();
    renderAdminNews(); renderHomeNews();
    toast('ลบข่าวแล้ว');
  } catch (err) { toast(err.message, true); }
}
