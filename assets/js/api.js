// =====================================================================
// ชั้นเชื่อมต่อฐานข้อมูล (Supabase) — ทุกการเรียกข้อมูลอยู่ในไฟล์นี้ที่เดียว
// =====================================================================
(function () {
  const cfg = window.APP_CONFIG || {};
  const configured =
    !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 &&
    cfg.SUPABASE_ANON_KEY.indexOf('YOUR-ANON') === -1;

  let sb = null;
  if (configured && window.supabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  function friendly(err) {
    // error บางชนิด (เช่น proxy ตอบ HTML / ฐานข้อมูลถูกพักโปรเจกต์) ไม่มีข้อความ ต้องไม่แสดงเป็น [object Object]
    const m = (err && typeof err.message === 'string' && err.message) ||
      (typeof err === 'string' ? err : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ (โค้ด ' + ((err && (err.code || err.status)) || 'ไม่ทราบ') + ') — ตรวจสอบค่าใน config.js และว่าโปรเจกต์ Supabase ยังเปิดใช้งานอยู่');
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    if (err && err.code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่ในระบบ (เช่น เลขประจำตัวประชาชนซ้ำ)';
    if (/invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/row-level security|permission denied/i.test(m)) return 'ไม่มีสิทธิ์ดำเนินการนี้ กรุณาเข้าสู่ระบบเจ้าหน้าที่อีกครั้ง';
    if (/payload too large|request entity too large/i.test(m)) return 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป กรุณาลดขนาดรูปหรือจำนวนรายการ';
    return m;
  }
  function must(res) {
    if (res.error) {
      const err = res.error;
      if (typeof err === 'object' && err.status == null && res.status) err.status = res.status;
      const e = new Error(friendly(err)); e.code = err.code; throw e;
    }
    return res.data;
  }
  function need() { if (!sb) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล'); return sb; }
  const rpc = async (name, args) => must(await need().rpc(name, args));

  const LIST_COLS =
    'id,app_no,id_card,birth_date,prefix,first_name,last_name,grade,school,fee,guardian_name,guardian_phone,' +
    'email,address,thumb_data,exam_room,seat_no,approval_status,approval_note,slip_uploaded_at,batch_id,submitted_at,' +
    'applicant_subjects(subject,score,passed)';
  const NEWS_LIST_COLS = 'id,title,description,link,pinned,created_at,image_data';
  const BATCH_COLS = 'id,batch_no,school_name,teacher_prefix,teacher_name,teacher_id_card,teacher_phone,teacher_email,' +
    'total_fee,slip_uploaded_at,approval_status,approval_note,created_at,applicants(count)';

  window.API = {
    configured: configured && !!sb,

    // ---------- ข้อมูลสาธารณะ ----------
    async getSettings() {
      const rows = must(await need().from('settings').select('key,value'));
      const o = {}; rows.forEach(r => { o[r.key] = r.value; }); return o;
    },
    publicStats() { return rpc('public_stats', {}); },
    register(payload) { return rpc('register_applicant', { p: payload }); },
    studentLogin(idCard, birth) { return rpc('student_login', { p_id_card: idCard, p_birth: birth }); },
    uploadSlip(idCard, birth, slip) { return rpc('upload_slip', { p_id_card: idCard, p_birth: birth, p_slip: slip }); },
    checkResults(idCard, birth) { return rpc('check_results', { p_id_card: idCard, p_birth: birth }); },
    publicLeaderboard() { return rpc('public_leaderboard', {}); },

    // ---------- ข่าวสาร (สาธารณะ) ----------
    async listNews(from, to) {
      return must(await need().from('announcements').select(NEWS_LIST_COLS)
        .order('pinned', { ascending: false }).order('created_at', { ascending: false }).range(from, to));
    },
    async getNews(id) {
      return must(await need().from('announcements').select('*').eq('id', id).maybeSingle());
    },

    // ---------- สมัครแบบโรงเรียน / ครูที่ปรึกษา ----------
    registerSchool(payload) { return rpc('register_school', { p: payload }); },
    teacherLogin(idCard, phone) { return rpc('teacher_login', { p_id_card: idCard, p_phone: phone }); },
    teacherUploadSlip(idCard, phone, batchId, slip) {
      return rpc('teacher_upload_slip', { p_id_card: idCard, p_phone: phone, p_batch_id: batchId, p_slip: slip });
    },
    teacherSetPhoto(idCard, phone, applicantId, photo, thumb) {
      return rpc('teacher_set_photo', { p_id_card: idCard, p_phone: phone, p_applicant_id: applicantId, p_photo: photo, p_thumb: thumb });
    },
    teacherGetCards(idCard, phone, batchId) {
      return rpc('teacher_get_cards', { p_id_card: idCard, p_phone: phone, p_batch_id: batchId });
    },

    // ---------- เจ้าหน้าที่: ล็อกอิน ----------
    async adminSignIn(email, password) {
      const c = need();
      must(await c.auth.signInWithPassword({ email, password }));
      const ok = must(await c.rpc('am_i_admin'));
      if (!ok) { await c.auth.signOut(); throw new Error('บัญชีนี้ไม่มีสิทธิ์เจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ'); }
      return true;
    },
    async adminSession() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return null;
      const r = await sb.rpc('am_i_admin');
      if (r.error || !r.data) return null;
      return { email: data.session.user.email };
    },
    async adminSignOut() { if (sb) await sb.auth.signOut(); },
    async changePassword(newPassword) { must(await need().auth.updateUser({ password: newPassword })); },

    // ---------- เจ้าหน้าที่: ผู้สมัคร ----------
    async listApplicants() {
      const c = need(); const size = 1000; let from = 0; let all = [];
      for (;;) {
        const rows = must(await c.from('applicants').select(LIST_COLS)
          .order('submitted_at', { ascending: false }).range(from, from + size - 1));
        all = all.concat(rows);
        if (rows.length < size) break;
        from += size;
      }
      return all;
    },
    async getApplicantFull(id) {
      return must(await need().from('applicants').select('*,applicant_subjects(subject,score,passed)').eq('id', id).single());
    },
    // totalFee = ค่าสมัครรวมของผู้สมัครคนนี้ (app.js คำนวณตามวิธีคิดใน ตั้งค่าระบบ: เหมาต่อท่าน / ตามจำนวนวิชา)
    async saveApplicant(id, fields, subjects, totalFee) {
      const c = need();
      const row = Object.assign({}, fields, { fee: Number(totalFee) || 0 });
      let applicantId = id;
      if (id) {
        must(await c.from('applicants').update(row).eq('id', id));
        const cur = must(await c.from('applicant_subjects').select('subject').eq('applicant_id', id));
        const removed = cur.map(x => x.subject).filter(s => subjects.indexOf(s) === -1);
        if (removed.length) must(await c.from('applicant_subjects').delete().eq('applicant_id', id).in('subject', removed));
      } else {
        row.created_by_admin = true;
        const ins = must(await c.from('applicants').insert(row).select('id,app_no').single());
        applicantId = ins.id;
      }
      const subjRows = subjects.map(s => ({ applicant_id: applicantId, subject: s, fee: 0 }));
      must(await c.from('applicant_subjects').upsert(subjRows, { onConflict: 'applicant_id,subject', ignoreDuplicates: true }));
      return applicantId;
    },
    async setApproval(ids, status, note) {
      must(await need().from('applicants').update({ approval_status: status, approval_note: note || null }).in('id', ids));
    },
    async deleteApplicant(id) { must(await need().from('applicants').delete().eq('id', id)); },
    async saveScore(applicantId, subject, score, passed) {
      must(await need().from('applicant_subjects').update({ score, passed }).eq('applicant_id', applicantId).eq('subject', subject));
    },

    // ---------- เจ้าหน้าที่: อันดับผลสอบ ----------
    adminRankings() { return rpc('admin_rankings', {}); },

    // ---------- เจ้าหน้าที่: กลุ่มโรงเรียน ----------
    async listBatches() {
      return must(await need().from('school_batches').select(BATCH_COLS).order('created_at', { ascending: false }));
    },
    async getBatchFull(id) {
      return must(await need().from('school_batches')
        .select('*,applicants(id,app_no,prefix,first_name,last_name,grade,approval_status,thumb_data,applicant_subjects(subject))')
        .eq('id', id).single());
    },
    setBatchStatus(id, status, note) { return rpc('admin_set_batch_status', { p_batch_id: id, p_status: status, p_note: note || null }); },

    // ---------- เจ้าหน้าที่: ตั้งค่า / ข่าว ----------
    async saveSettings(obj) {
      const rows = Object.keys(obj).map(k => ({ key: k, value: String(obj[k] == null ? '' : obj[k]) }));
      must(await need().from('settings').upsert(rows, { onConflict: 'key' }));
    },
    async saveNews(id, obj) {
      const c = need();
      if (id) must(await c.from('announcements').update(Object.assign({}, obj, { updated_at: new Date().toISOString() })).eq('id', id));
      else must(await c.from('announcements').insert(obj));
    },
    async deleteNews(id) { must(await need().from('announcements').delete().eq('id', id)); }
  };
})();