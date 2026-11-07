// ตรวจว่าคีย์ใน assets/js/config.js เป็นคีย์สาธารณะ (anon / publishable) เท่านั้น
// ห้ามเป็น service_role หรือ secret key เพราะไฟล์นี้ถูกเผยแพร่ให้ทุกคนเห็น
const fs = require('fs');

const src = fs.readFileSync('assets/js/config.js', 'utf8');
const m = src.match(/SUPABASE_ANON_KEY\s*:\s*"([^"]*)"/);
const key = m ? m[1] : '';

function fail(msg) { console.error('::error::' + msg); process.exit(1); }

if (!key || key.indexOf('YOUR-ANON-KEY') !== -1) {
  console.log('ยังเป็นค่าตัวอย่างหรือไม่มีคีย์ — ข้ามการตรวจ (เว็บจะแสดงแถบเตือนให้ตั้งค่า)');
  process.exit(0);
}
if (key.indexOf('sb_secret_') === 0) {
  fail('พบ secret key ในหน้าเว็บ — ห้ามเผยแพร่ ให้ใช้ anon / publishable key เท่านั้น และรีบสร้างคีย์ใหม่ที่ Supabase');
}
const parts = key.split('.');
if (parts.length === 3) {
  try {
    const role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role;
    if (role === 'service_role') {
      fail('พบ service_role key ในหน้าเว็บ — ห้ามเผยแพร่ ให้ใช้ anon key เท่านั้น และรีบสร้างคีย์ใหม่ที่ Supabase');
    }
  } catch (e) { /* ไม่ใช่ JWT ที่อ่านได้ ปล่อยผ่าน */ }
}
console.log('ตรวจคีย์แล้ว: ไม่ใช่ secret key');
