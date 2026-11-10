// =====================================================================
// จัดการรูปภาพ: โหลดรูป (แก้การหมุนจากกล้องมือถือ) · ตัดรูปถ่ายสัดส่วน 3:4 · ย่อสลิป/รูปปกข่าว · โลโก้
// ทุกอย่างทำในเบราว์เซอร์ก่อนส่ง เพื่อให้ไฟล์เล็ก ภาพไม่บิดเบี้ยว และไม่ขยายเต็มจอ
// =====================================================================
'use strict';

const PHOTO_W = 360, PHOTO_H = 480;      // ขนาดรูปถ่ายติดบัตรที่เก็บ (3:4)
const THUMB_W = 90, THUMB_H = 120;       // รูปย่อสำหรับตาราง

/* ---------------------------------------------------------------------
   โหลดรูปจากไฟล์ — ใช้ createImageBitmap (หมุนตาม EXIF ให้) ถ้าไม่ได้ค่อยใช้ FileReader + Image
--------------------------------------------------------------------- */
function mediaError(msg) { return new Error(msg); }

async function loadDrawable(file) {
  if (!file) throw mediaError('ยังไม่ได้เลือกไฟล์');
  if (file.size > 15 * 1024 * 1024) throw mediaError('ไฟล์รูปต้องมีขนาดไม่เกิน 15 MB');
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height };
    } catch (e) { /* ใช้วิธีสำรองด้านล่าง */ }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(mediaError('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(mediaError('ไฟล์นี้ไม่ใช่รูปที่ระบบรองรับ (รองรับ JPG / PNG) — ถ้าเป็นรูปจาก iPhone แบบ HEIC ให้ตั้งกล้องเป็น "เข้ากันได้สูงสุด" หรือแคปหน้าจอรูปแทน'));
      img.onload = () => resolve({ src: img, w: img.width, h: img.height });
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function newCanvas(w, h, whiteBg) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  const ctx = cv.getContext('2d');
  if (whiteBg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
  return { cv: cv, ctx: ctx };
}

// แปลงเป็น JPEG แล้วลดคุณภาพจนไม่เกิน limit (ความยาว base64)
function toJpegWithin(cv, quality, limit) {
  let q = quality, out = cv.toDataURL('image/jpeg', q);
  for (let i = 0; out.length > limit && i < 6; i++) { q = Math.max(0.4, q - 0.08); out = cv.toDataURL('image/jpeg', q); }
  if (out.length > limit) throw mediaError('รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปที่เล็กลง');
  return out;
}

// ตัดส่วน (sx,sy,sw,sh) ของรูป ไปวาดเป็นขนาด outW x outH
function cropToDataUrl(d, sx, sy, sw, sh, outW, outH, quality, limit) {
  const c = newCanvas(outW, outH, true);
  c.ctx.drawImage(d.src, sx, sy, sw, sh, 0, 0, c.cv.width, c.cv.height);
  return toJpegWithin(c.cv, quality, limit);
}

/* ---------------------------------------------------------------------
   รูปถ่ายติดบัตร
--------------------------------------------------------------------- */
// ตัดอัตโนมัติ 3:4 กึ่งกลางแนวนอน เอนไปทางบน (ใบหน้ามักอยู่ด้านบน) — ใช้กับการอัปโหลดจำนวนมาก
async function autoCropPhoto(file) {
  const d = await loadDrawable(file);
  const aspect = PHOTO_W / PHOTO_H;
  let sw = d.w, sh = d.h;
  if (d.w / d.h > aspect) sw = d.h * aspect; else sh = d.w / aspect;
  const sx = (d.w - sw) / 2;
  const sy = (d.h - sh) * 0.25;
  return {
    full: cropToDataUrl(d, sx, sy, sw, sh, PHOTO_W, PHOTO_H, 0.82, 300000),
    thumb: cropToDataUrl(d, sx, sy, sw, sh, THUMB_W, THUMB_H, 0.7, 20000)
  };
}
function compressImage(file) { return autoCropPhoto(file); }   // ชื่อเดิมที่โค้ดส่วนอื่นเรียกใช้

/* ----- ตัวปรับรูป (ลากเพื่อจัดตำแหน่ง + แถบซูม) ----- */
const CROP_VW = 270, CROP_VH = 360;
let cropState = null;

function openCropper(file) {
  return new Promise(async (resolve, reject) => {
    let d;
    try { d = await loadDrawable(file); } catch (e) { reject(e); return; }
    const base = Math.max(CROP_VW / d.w, CROP_VH / d.h);        // ขนาดพอดีกรอบ (cover)
    const scaledH = d.h * base;
    cropState = {
      d: d, base: base, zoom: 1, resolve: resolve,
      x: (CROP_VW - d.w * base) / 2,
      y: Math.min(0, Math.max(CROP_VH - scaledH, -(scaledH - CROP_VH) * 0.25))
    };
    $('cropZoom').value = '1';
    $('cropModal').classList.add('show');
    renderCrop();
  });
}

function cropScale() { return cropState.base * cropState.zoom; }
function clampCrop() {
  const s = cropScale(), d = cropState.d;
  cropState.x = Math.min(0, Math.max(CROP_VW - d.w * s, cropState.x));
  cropState.y = Math.min(0, Math.max(CROP_VH - d.h * s, cropState.y));
}
function renderCrop() {
  if (!cropState) return;
  clampCrop();
  const cv = $('cropCanvas'), ctx = cv.getContext('2d'), s = cropScale(), d = cropState.d;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CROP_VW, CROP_VH);
  ctx.drawImage(d.src, cropState.x, cropState.y, d.w * s, d.h * s);
}
function onCropZoom(value) {
  if (!cropState) return;
  const old = cropScale();
  const cx = (CROP_VW / 2 - cropState.x) / old, cy = (CROP_VH / 2 - cropState.y) / old;   // จุดกึ่งกลางในพิกัดรูป
  cropState.zoom = Number(value) || 1;
  const s = cropScale();
  cropState.x = CROP_VW / 2 - cx * s; cropState.y = CROP_VH / 2 - cy * s;
  renderCrop();
}
function cropFinish(result) {
  const st = cropState; cropState = null;
  $('cropModal').classList.remove('show');
  if (st) { if (st.d.src && st.d.src.close) { try { st.d.src.close(); } catch (e) { /* ไม่เป็นไร */ } } st.resolve(result); }
}
function confirmCrop() {
  if (!cropState) return;
  clampCrop();
  const s = cropScale(), d = cropState.d;
  const sx = -cropState.x / s, sy = -cropState.y / s, sw = CROP_VW / s, sh = CROP_VH / s;
  try {
    const out = {
      full: cropToDataUrl(d, sx, sy, sw, sh, PHOTO_W, PHOTO_H, 0.82, 300000),
      thumb: cropToDataUrl(d, sx, sy, sw, sh, THUMB_W, THUMB_H, 0.7, 20000)
    };
    cropFinish(out);
  } catch (err) { toast(err.message, true); }
}
function cancelCrop() { cropFinish(null); }

// ลากรูปในกรอบ (เมาส์/นิ้ว)
document.addEventListener('DOMContentLoaded', () => {
  const cv = $('cropCanvas');
  if (!cv) return;
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    if (!cropState) return;
    drag = { px: e.clientX, py: e.clientY, x: cropState.x, y: cropState.y };
    if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ไม่เป็นไร */ } }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !cropState) return;
    const k = CROP_VW / (cv.getBoundingClientRect().width || CROP_VW);
    cropState.x = drag.x + (e.clientX - drag.px) * k;
    cropState.y = drag.y + (e.clientY - drag.py) * k;
    renderCrop();
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('cropZoom').addEventListener('input', (e) => onCropZoom(e.target.value));
});

/* ---------------------------------------------------------------------
   สลิป / รูปปกข่าว: คงสัดส่วนเดิม ด้านยาวไม่เกิน maxSide แล้วลดคุณภาพจนไม่เกิน limit
--------------------------------------------------------------------- */
async function compressToDataUrl(file, maxSide, quality, limit) {
  const d = await loadDrawable(file);
  let side = maxSide;
  for (let i = 0; i < 5; i++) {
    const k = Math.min(1, side / Math.max(d.w, d.h));
    const c = newCanvas(d.w * k, d.h * k, true);
    c.ctx.drawImage(d.src, 0, 0, c.cv.width, c.cv.height);
    let q = quality, out = c.cv.toDataURL('image/jpeg', q);
    for (let j = 0; out.length > limit && j < 3; j++) { q = Math.max(0.5, q - 0.08); out = c.cv.toDataURL('image/jpeg', q); }
    if (out.length <= limit) return out;
    side = Math.round(side * 0.8);
  }
  throw mediaError('รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปที่เล็กลง');
}

/* ---------------------------------------------------------------------
   โลโก้: คงสัดส่วนและพื้นหลังโปร่งใส (PNG) ด้านยาวไม่เกิน 256px และไฟล์ไม่เกิน ~60 KB
--------------------------------------------------------------------- */
const LOGO_LIMIT = 60000;
async function processLogo(file) {
  const d = await loadDrawable(file);
  for (const side of [256, 192, 128, 96]) {
    const k = Math.min(1, side / Math.max(d.w, d.h));
    const c = newCanvas(d.w * k, d.h * k, false);
    c.ctx.drawImage(d.src, 0, 0, c.cv.width, c.cv.height);
    const out = c.cv.toDataURL('image/png');
    if (out.length <= LOGO_LIMIT) return out;
  }
  const k = Math.min(1, 192 / Math.max(d.w, d.h));
  const c = newCanvas(d.w * k, d.h * k, true);
  c.ctx.drawImage(d.src, 0, 0, c.cv.width, c.cv.height);
  const out = c.cv.toDataURL('image/jpeg', 0.8);
  if (out.length <= LOGO_LIMIT) return out;
  throw mediaError('ไฟล์โลโก้ซับซ้อนหรือใหญ่เกินไป กรุณาใช้โลโก้ที่เรียบง่ายขึ้น');
}
