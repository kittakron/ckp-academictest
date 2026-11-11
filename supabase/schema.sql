-- =====================================================================
-- SciMath Test — ฐานข้อมูลบน Supabase (PostgreSQL)  เวอร์ชัน 2
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางไฟล์นี้ทั้งไฟล์ > Run
--
-- ไฟล์เดียวใช้ได้ทั้ง "ติดตั้งใหม่" และ "อัปเกรดจากเวอร์ชัน 1"
-- (รันซ้ำได้อย่างปลอดภัย ข้อมูลผู้สมัครเดิมไม่หาย)
--
-- v2 เพิ่ม: สลิปชำระเงิน + ระบบอนุมัติ · ข่าวสาร (มีเนื้อหา/รูปปก) ·
--          สมัครแบบโรงเรียน (หลายคน) + ครูที่ปรึกษา · สถิติหน้าแรก
--
-- หลักการความปลอดภัย:
--   * ผู้ใช้ทั่วไป (anon) ไม่มีสิทธิ์อ่านตารางผู้สมัคร/โรงเรียนโดยตรงเลย
--     ต้องผ่านฟังก์ชัน (RPC) ที่ตรวจตัวตนก่อนจึงได้ข้อมูลของตัวเองเท่านั้น
--   * เจ้าหน้าที่ล็อกอินผ่าน Supabase Auth และต้องอยู่ในตาราง admins
-- =====================================================================

-- ---------------------------------------------------------------------
-- ตารางพื้นฐาน
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value text
);

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- กลุ่มสมัครแบบโรงเรียน (ครูที่ปรึกษาสมัครให้นักเรียนหลายคน โอนยอดรวม สลิปเดียว)
create table if not exists public.school_batches (
  id               bigint generated always as identity primary key,
  batch_no         text unique,
  school_name      text not null,
  teacher_prefix   text,
  teacher_name     text not null,
  teacher_id_card  char(13) not null,
  teacher_phone    text not null,
  teacher_email    text,
  total_fee        integer not null default 0,
  slip_data        text,
  slip_uploaded_at timestamptz,
  approval_status  text not null default 'pending'
                   check (approval_status in ('pending','approved','rejected')),
  approval_note    text,
  created_at       timestamptz not null default now()
);

create table if not exists public.applicants (
  id               bigint generated always as identity primary key,
  app_no           text unique,
  id_card          char(13) not null unique,
  birth_date       date not null,
  prefix           text not null,
  first_name       text not null,
  last_name        text not null,
  grade            text not null,
  school           text not null,
  fee              integer not null default 0,
  guardian_name    text not null,
  guardian_phone   text not null,
  email            text,
  address          text,
  photo_data       text,
  thumb_data       text,
  exam_room        text,
  seat_no          text,
  payment_status   text not null default 'ยังไม่ชำระ'
                   check (payment_status in ('ยังไม่ชำระ','ชำระแล้ว')),   -- เลิกใช้แล้ว (คงไว้เพื่อความเข้ากันได้) ระบบซิงก์จาก approval_status
  created_by_admin boolean not null default false,
  submitted_at     timestamptz not null default now()
);

-- คอลัมน์ที่เพิ่มใน v2 (ติดตั้งใหม่หรืออัปเกรด ใช้คำสั่งเดียวกัน)
alter table public.applicants add column if not exists approval_status  text not null default 'pending';
alter table public.applicants add column if not exists approval_note    text;
alter table public.applicants add column if not exists slip_data        text;
alter table public.applicants add column if not exists slip_uploaded_at timestamptz;
alter table public.applicants add column if not exists batch_id         bigint references public.school_batches(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicants_approval_status_chk') then
    alter table public.applicants
      add constraint applicants_approval_status_chk check (approval_status in ('pending','approved','rejected'));
  end if;
end $$;

create table if not exists public.applicant_subjects (
  id           bigint generated always as identity primary key,
  applicant_id bigint not null references public.applicants(id) on delete cascade,
  subject      text not null check (subject in ('คณิตศาสตร์','วิทยาศาสตร์','ภาษาไทย','ภาษาอังกฤษ','สังคมศึกษาฯ')),
  fee          integer not null default 0,
  score        numeric(5,2),
  passed       boolean,
  unique (applicant_id, subject)
);

-- ขยายรายชื่อวิชาที่อนุญาต (รันซ้ำได้) — วิชาเดิมในข้อมูลที่มีอยู่ไม่ถูกกระทบ
alter table public.applicant_subjects drop constraint if exists applicant_subjects_subject_check;
alter table public.applicant_subjects alter column fee set default 0;

-- ข่าวสาร (ตารางเดิมชื่อ announcements — ขยายให้มีเนื้อหาเต็ม รูปปก และปักหมุด)
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text,
  link        text,
  created_at  timestamptz not null default now()
);
alter table public.announcements add column if not exists content    text;
alter table public.announcements add column if not exists image_data text;
alter table public.announcements add column if not exists pinned     boolean not null default false;
alter table public.announcements add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_applicants_submitted on public.applicants (submitted_at desc);
create index if not exists idx_applicants_batch     on public.applicants (batch_id);
create index if not exists idx_applicants_approval  on public.applicants (approval_status);
create index if not exists idx_subjects_applicant   on public.applicant_subjects (applicant_id);
create index if not exists idx_batches_teacher      on public.school_batches (teacher_id_card);

-- ---------------------------------------------------------------------
-- ตัวช่วย: ตรวจรูป base64 (กันการฝังสคริปต์) + ตัดเหลือเฉพาะตัวเลข
-- ---------------------------------------------------------------------
create or replace function public.valid_data_img(t text, maxlen integer)
returns boolean
language sql
immutable
as $$
  select coalesce(t ~ '^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$' and length(t) <= maxlen, false);
$$;

create or replace function public.digits(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(t,''), '\D', '', 'g');
$$;

-- ---------------------------------------------------------------------
-- Trigger: เลขที่สมัคร / เลขกลุ่มโรงเรียน / ซิงก์สถานะเก่า
-- ---------------------------------------------------------------------
create or replace function public.set_app_no()
returns trigger language plpgsql as $$
declare v_prefix text;
begin
  select value into v_prefix from public.settings where key = 'app_prefix';
  new.app_no := coalesce(v_prefix, 'SM-') || lpad(new.id::text, 4, '0');
  return new;
end;
$$;
drop trigger if exists trg_set_app_no on public.applicants;
create trigger trg_set_app_no before insert on public.applicants
  for each row execute function public.set_app_no();

create or replace function public.set_batch_no()
returns trigger language plpgsql as $$
declare v_prefix text;
begin
  select value into v_prefix from public.settings where key = 'batch_prefix';
  new.batch_no := coalesce(v_prefix, 'SCH-') || lpad(new.id::text, 4, '0');
  return new;
end;
$$;
drop trigger if exists trg_set_batch_no on public.school_batches;
create trigger trg_set_batch_no before insert on public.school_batches
  for each row execute function public.set_batch_no();

-- payment_status (เก่า) ให้ตามสถานะอนุมัติเสมอ — โค้ดเวอร์ชันเก่าที่ยังอ่านค่านี้จะไม่พัง
create or replace function public.sync_payment_status()
returns trigger language plpgsql as $$
begin
  new.payment_status := case when new.approval_status = 'approved' then 'ชำระแล้ว' else 'ยังไม่ชำระ' end;
  return new;
end;
$$;
drop trigger if exists trg_sync_payment on public.applicants;
create trigger trg_sync_payment before insert or update of approval_status on public.applicants
  for each row execute function public.sync_payment_status();

-- ---------------------------------------------------------------------
-- ตรวจสอบสิทธิ์เจ้าหน้าที่
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.settings           enable row level security;
alter table public.admins             enable row level security;
alter table public.applicants         enable row level security;
alter table public.applicant_subjects enable row level security;
alter table public.announcements      enable row level security;
alter table public.school_batches     enable row level security;

drop policy if exists settings_read   on public.settings;
drop policy if exists settings_admin  on public.settings;
create policy settings_read  on public.settings for select to anon, authenticated using (true);
create policy settings_admin on public.settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_read  on public.announcements;
drop policy if exists announcements_admin on public.announcements;
create policy announcements_read  on public.announcements for select to anon, authenticated using (true);
create policy announcements_admin on public.announcements for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists applicants_admin on public.applicants;
create policy applicants_admin on public.applicants for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists subjects_admin on public.applicant_subjects;
create policy subjects_admin on public.applicant_subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists batches_admin on public.school_batches;
create policy batches_admin on public.school_batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.admins             from anon, authenticated;
revoke all on public.applicants         from anon;
revoke all on public.applicant_subjects from anon;
revoke all on public.school_batches     from anon;

-- ---------------------------------------------------------------------
-- ค่าตั้งต้น (แก้ไขภายหลังได้ที่หน้าแอดมิน > ตั้งค่าระบบ)
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
  ('org_name',            'ศูนย์พัฒนาอัจฉริยภาพวิทยาศาสตร์-คณิตศาสตร์'),
  ('site_name',           'SciMath Test'),
  ('app_prefix',          'SM69-'),
  ('batch_prefix',        'SCH69-'),
  ('subject_fee',         '60'),
  ('pass_score',          '50'),
  ('reg_open',            '1'),
  ('reg_closed_message',  'ระบบจะเปิดรับสมัครรอบถัดไปเร็ว ๆ นี้ กรุณาติดตามประกาศ'),
  ('reg_period_display',  'สมัครได้ถึงวันที่ 31 สิงหาคม 2569'),
  ('require_photo',       '1'),
  ('require_slip',        '1'),
  ('results_published',   '0'),
  ('results_message',     'ผลสอบจะประกาศให้ทราบเร็ว ๆ นี้ กรุณากลับมาตรวจสอบอีกครั้ง'),
  ('exam_date_iso',       '2026-09-20T09:00:00+07:00'),
  ('exam_date_display',   'วันอาทิตย์ที่ 20 กันยายน 2569'),
  ('exam_time_display',   '09.00 – 12.00 น.'),
  ('exam_site_name',      'สนามสอบโรงเรียนตัวอย่างวิทยา'),
  ('exam_venue_display',  'จะประกาศห้องสอบภายหลังผ่านเมนู "เข้าสู่ระบบ"'),
  ('date_reg',            '1 – 31 สิงหาคม 2569'),
  ('date_list',           '10 กันยายน 2569'),
  ('date_card',           '14 กันยายน 2569'),
  ('date_result',         '15 ตุลาคม 2569'),
  ('contact_phone',       '053-XXX-XXX ต่อ 000'),
  ('contact_email',       'scimathtest@example.ac.th'),
  ('contact_address',     'ศูนย์พัฒนาอัจฉริยภาพวิทยาศาสตร์-คณิตศาสตร์ (แก้ไขที่อยู่ได้ที่หน้าแอดมิน > ตั้งค่าระบบ)'),
  ('bank_info',           'ธนาคารออมสิน เลขที่บัญชี 020-XXX-XXXX ชื่อบัญชี โครงการ SciMath Test')
on conflict (key) do nothing;

-- ค่าตั้งต้นของวิชา/ค่าสมัคร/เกณฑ์ผลสอบ (แก้ได้ที่ เจ้าหน้าที่ > ตั้งค่าระบบ)
insert into public.settings (key, value) values
  ('subjects',          '["คณิตศาสตร์","วิทยาศาสตร์","ภาษาไทย","ภาษาอังกฤษ","สังคมศึกษาฯ"]'),
  ('subject_desc',      '{}'),
  ('fee_mode',          'flat'),
  ('fee_flat',          '60'),
  ('subject_max',       '100'),
  ('award_rules',       '[]'),
  ('results_show_top',  '0'),
  ('results_top_n',     '10'),
  ('site_tagline',      'ระบบรับสมัครสอบวัดความรู้ ระดับประถมศึกษา'),
  ('logo_data',         '')
on conflict (key) do nothing;

create or replace function public.safe_json_array(t text)
returns jsonb language plpgsql immutable as $$
begin
  if t is null or t = '' then return '[]'::jsonb; end if;
  begin
    return case when jsonb_typeof(t::jsonb) = 'array' then t::jsonb else '[]'::jsonb end;
  exception when others then return '[]'::jsonb;
  end;
end $$;

-- รายชื่อวิชาที่เปิดสอบ (เรียงตามที่ตั้งไว้) — ถ้าตั้งค่าเสียจะใช้ 5 วิชาเริ่มต้น
create or replace function public.app_subjects()
returns text[] language plpgsql stable security definer set search_path = public as $$
declare r text[];
begin
  select array_agg(x order by o) into r
    from jsonb_array_elements_text(public.safe_json_array((select value from settings where key = 'subjects')))
         with ordinality as t(x, o);
  if r is null or array_length(r, 1) is null then
    r := array['คณิตศาสตร์','วิทยาศาสตร์','ภาษาไทย','ภาษาอังกฤษ','สังคมศึกษาฯ'];
  end if;
  return r;
end $$;

-- ค่าสมัครของผู้สมัคร 1 คน: flat = เหมาต่อท่าน, each = คูณจำนวนวิชา
create or replace function public.fee_for(n integer)
returns integer language plpgsql stable security definer set search_path = public as $$
declare m text; v_flat integer; v_each integer;
begin
  select value into m from settings where key = 'fee_mode';
  v_flat := coalesce(nullif((select value from settings where key = 'fee_flat'), '')::integer, 60);
  v_each := coalesce(nullif((select value from settings where key = 'subject_fee'), '')::integer, 60);
  if coalesce(m, 'flat') = 'each' then return coalesce(n, 0) * v_each; end if;
  return v_flat;
end $$;

-- อัปเกรดจาก v1: ผู้ที่เคย "ชำระแล้ว" ให้ถือว่า "อนุมัติแล้ว" (ทำครั้งเดียว)
do $$
declare v text;
begin
  select value into v from public.settings where key = 'schema_version';
  if v is null then
    update public.applicants set approval_status = 'approved' where payment_status = 'ชำระแล้ว';
    insert into public.settings (key, value) values ('schema_version', '2');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RPC: สถิติหน้าแรก (นับอย่างเดียว ไม่มีข้อมูลส่วนตัว)
-- ---------------------------------------------------------------------
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',    (select count(*) from applicants),
    'approved', (select count(*) from applicants where approval_status = 'approved'),
    'grades',   coalesce((select jsonb_agg(jsonb_build_object('grade', grade, 'total', t, 'approved', a) order by grade)
                          from (select grade, count(*) as t, count(*) filter (where approval_status = 'approved') as a
                                from applicants group by grade) g), '[]'::jsonb),
    'as_of',    now()
  );
$$;

-- ---------------------------------------------------------------------
-- RPC: สมัครสอบรายบุคคล
-- ---------------------------------------------------------------------
create or replace function public.register_applicant(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open      text;
  v_req_photo text;
  v_req_slip  text;
  v_fee_each  integer;
  v_id_card   text := public.digits(p->>'id_card');
  v_birth     date;
  v_subjects  text[];
  v_photo     text := nullif(p->>'photo_data','');
  v_thumb     text := nullif(p->>'thumb_data','');
  v_slip      text := nullif(p->>'slip_data','');
  v_new_id    bigint;
  v_app_no    text;
  v_fee       integer;
  s           text;
begin
  select value into v_open      from settings where key = 'reg_open';
  select value into v_req_photo from settings where key = 'require_photo';
  select value into v_req_slip  from settings where key = 'require_slip';
  select coalesce(nullif(value,'')::integer, 60) into v_fee_each from settings where key = 'subject_fee';
  v_fee_each := coalesce(v_fee_each, 60);

  if coalesce(v_open,'1') <> '1' then raise exception 'ขณะนี้ปิดรับสมัครสอบแล้ว'; end if;
  if v_id_card !~ '^\d{13}$' then raise exception 'เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก'; end if;

  begin v_birth := (p->>'birth_date')::date;
  exception when others then raise exception 'วันเดือนปีเกิดไม่ถูกต้อง'; end;
  if v_birth is null or v_birth > current_date then raise exception 'วันเดือนปีเกิดไม่ถูกต้อง'; end if;

  if coalesce(trim(p->>'prefix'),'') = '' or coalesce(trim(p->>'first_name'),'') = ''
     or coalesce(trim(p->>'last_name'),'') = '' or coalesce(trim(p->>'grade'),'') = ''
     or coalesce(trim(p->>'school'),'') = '' or coalesce(trim(p->>'guardian_name'),'') = ''
     or coalesce(trim(p->>'guardian_phone'),'') = '' then
    raise exception 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน';
  end if;
  if length(p->>'first_name') > 100 or length(p->>'last_name') > 100 or length(p->>'school') > 200
     or length(p->>'guardian_name') > 200 or length(coalesce(p->>'address','')) > 200 then
    raise exception 'ข้อมูลยาวเกินกำหนด';
  end if;

  select array_agg(distinct x) into v_subjects
  from jsonb_array_elements_text(coalesce(p->'subjects','[]'::jsonb)) as t(x)
  where x = any(public.app_subjects());
  if v_subjects is null or array_length(v_subjects,1) = 0 then
    raise exception 'กรุณาเลือกวิชาที่ต้องการสมัครสอบอย่างน้อย 1 วิชา';
  end if;

  if coalesce(v_req_photo,'1') = '1' and v_photo is null then raise exception 'กรุณาอัปโหลดรูปถ่ายติดบัตรของนักเรียน'; end if;
  if v_photo is not null and not public.valid_data_img(v_photo, 400000) then raise exception 'รูปถ่ายไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;
  if v_thumb is not null and not public.valid_data_img(v_thumb, 30000) then v_thumb := null; end if;

  if coalesce(v_req_slip,'1') = '1' and v_slip is null then raise exception 'กรุณาอัปโหลดสลิปการชำระเงิน'; end if;
  if v_slip is not null and not public.valid_data_img(v_slip, 500000) then raise exception 'สลิปไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;

  if exists (select 1 from applicants where id_card = v_id_card) then
    raise exception 'เลขประจำตัวประชาชนนี้เคยสมัครสอบไว้แล้ว กรุณาเข้าสู่ระบบเพื่อตรวจสอบสถานะ';
  end if;

  v_fee := public.fee_for(array_length(v_subjects,1));  -- ตามวิธีคิดใน ตั้งค่าระบบ (เหมาต่อท่าน / ตามจำนวนวิชา)

  insert into applicants (id_card, birth_date, prefix, first_name, last_name, grade, school, fee,
                          guardian_name, guardian_phone, email, address, photo_data, thumb_data,
                          slip_data, slip_uploaded_at)
  values (v_id_card, v_birth, trim(p->>'prefix'), trim(p->>'first_name'), trim(p->>'last_name'),
          trim(p->>'grade'), trim(p->>'school'), v_fee, trim(p->>'guardian_name'),
          trim(p->>'guardian_phone'), nullif(trim(coalesce(p->>'email','')),''),
          nullif(trim(coalesce(p->>'address','')),''), v_photo, v_thumb,
          v_slip, case when v_slip is null then null else now() end)
  returning id, app_no into v_new_id, v_app_no;

  foreach s in array v_subjects loop
    insert into applicant_subjects (applicant_id, subject, fee) values (v_new_id, s, 0);
  end loop;

  return jsonb_build_object(
    'app_no', v_app_no, 'fee', v_fee, 'subjects', to_jsonb(v_subjects),
    'name', trim(p->>'prefix') || trim(p->>'first_name') || ' ' || trim(p->>'last_name'),
    'grade', trim(p->>'grade'), 'school', trim(p->>'school'),
    'has_slip', v_slip is not null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: ผู้สมัครเข้าสู่ระบบ / ตรวจสอบสถานะ (เลขบัตร + วันเกิด)
-- ---------------------------------------------------------------------
create or replace function public.student_login(p_id_card text, p_birth date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a       applicants%rowtype;
  v_pub   boolean;
  v_subj  jsonb;
  v_batch text;
begin
  select * into a from applicants where id_card = public.digits(p_id_card) and birth_date = p_birth;
  if not found then return null; end if;

  select coalesce(value,'0') = '1' into v_pub from settings where key = 'results_published';
  v_pub := coalesce(v_pub, false);

  select coalesce(jsonb_agg(jsonb_build_object(
           'subject', s.subject,
           'score',   case when v_pub then s.score  else null end,
           'passed',  case when v_pub then s.passed else null end
         ) order by s.subject), '[]'::jsonb)
    into v_subj from applicant_subjects s where s.applicant_id = a.id;

  select batch_no into v_batch from school_batches where id = a.batch_id;

  return jsonb_build_object(
    'app_no', a.app_no, 'id_card', a.id_card, 'prefix', a.prefix,
    'first_name', a.first_name, 'last_name', a.last_name, 'grade', a.grade, 'school', a.school,
    'fee', a.fee, 'guardian_name', a.guardian_name, 'guardian_phone', a.guardian_phone,
    'exam_room', a.exam_room, 'seat_no', a.seat_no,
    'approval_status', a.approval_status, 'approval_note', a.approval_note,
    'payment_status', a.payment_status,
    'has_slip', a.slip_uploaded_at is not null, 'batch_no', v_batch, 'is_batch', a.batch_id is not null,
    'photo_data', a.photo_data, 'results_published', v_pub, 'subjects', v_subj
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: ผู้สมัครรายบุคคลอัปโหลด/เปลี่ยนสลิป (เช่น หลังถูกให้แก้ไข)
-- ---------------------------------------------------------------------
create or replace function public.upload_slip(p_id_card text, p_birth date, p_slip text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a applicants%rowtype;
begin
  select * into a from applicants where id_card = public.digits(p_id_card) and birth_date = p_birth;
  if not found then raise exception 'ไม่พบข้อมูลผู้สมัคร'; end if;
  if a.batch_id is not null then raise exception 'ผู้สมัครแบบโรงเรียนให้ครูที่ปรึกษาเป็นผู้อัปโหลดสลิป'; end if;
  if a.approval_status = 'approved' then raise exception 'ได้รับการอนุมัติแล้ว ไม่ต้องอัปโหลดสลิปใหม่'; end if;
  if not public.valid_data_img(p_slip, 500000) then raise exception 'สลิปไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;

  update applicants
     set slip_data = p_slip, slip_uploaded_at = now(), approval_status = 'pending', approval_note = null
   where id = a.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: ตรวจสอบผลสอบ
-- ---------------------------------------------------------------------
create or replace function public.check_results(p_id_card text, p_birth date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a applicants%rowtype; v_pub text; v_msg text; v_subj jsonb; v_max numeric;
  v_rr jsonb;
begin
  select value into v_pub from settings where key = 'results_published';
  select value into v_msg from settings where key = 'results_message';
  if coalesce(v_pub,'0') <> '1' then
    return jsonb_build_object('published', false, 'message', coalesce(v_msg,''));
  end if;

  select * into a from applicants where id_card = public.digits(p_id_card) and birth_date = p_birth;
  if not found then return jsonb_build_object('published', true, 'found', false); end if;

  v_max := coalesce(nullif((select value from settings where key = 'subject_max'), '')::numeric, 100);

  select coalesce(jsonb_agg(jsonb_build_object('subject', s.subject, 'score', s.score, 'passed', s.passed)
                            order by array_position(public.app_subjects(), s.subject), s.subject), '[]'::jsonb)
    into v_subj from applicant_subjects s where s.applicant_id = a.id;

  select to_jsonb(r) into v_rr from public.ranked_results() r where r.id = a.id;   -- ว่างถ้าไม่ได้รับอนุมัติ

  return jsonb_build_object(
    'published', true, 'found', true, 'approved', a.approval_status = 'approved',
    'app_no', a.app_no, 'prefix', a.prefix, 'first_name', a.first_name, 'last_name', a.last_name,
    'grade', a.grade, 'school', a.school, 'subjects', v_subj, 'subject_max', v_max,
    'total',      v_rr->'total',
    'pct',        v_rr->'pct',
    'complete',   coalesce((v_rr->>'complete')::boolean, false),
    'rank_all',   v_rr->'rank_all',
    'n_all',      v_rr->'n_all',
    'rank_grade', v_rr->'rank_grade',
    'n_grade',    v_rr->'n_grade',
    'award',      v_rr->'award',
    'award_detail', v_rr->'award_detail');
end;
$$;


-- ---------------------------------------------------------------------
-- RPC: สมัครแบบโรงเรียน (หลายคน) — ครูที่ปรึกษากรอกครั้งเดียว โอนยอดรวม สลิปเดียว
-- p = { school_name, teacher_prefix, teacher_name, teacher_id_card, teacher_phone, teacher_email,
--       slip_data, students: [ {prefix, first_name, last_name, id_card, birth_date, grade, subjects[],
--                               guardian_name?, guardian_phone?} ... ] }
-- ---------------------------------------------------------------------
create or replace function public.register_school(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open     text;
  v_req_slip text;
  v_fee_each integer;
  v_school   text := trim(coalesce(p->>'school_name',''));
  v_t_name   text := trim(coalesce(p->>'teacher_name',''));
  v_t_id     text := public.digits(p->>'teacher_id_card');
  v_t_phone  text := trim(coalesce(p->>'teacher_phone',''));
  v_slip     text := nullif(p->>'slip_data','');
  v_students jsonb := coalesce(p->'students','[]'::jsonb);
  v_n        integer;
  v_batch_id bigint;
  v_batch_no text;
  v_total    integer := 0;
  v_out      jsonb := '[]'::jsonb;
  st         jsonb;
  i          integer := 0;
  v_idc      text;
  v_birth    date;
  v_subj     text[];
  v_aid      bigint;
  v_app_no   text;
  v_label    text;
  s          text;
  seen       text[] := '{}';
begin
  select value into v_open     from settings where key = 'reg_open';
  select value into v_req_slip from settings where key = 'require_slip';
  select coalesce(nullif(value,'')::integer, 60) into v_fee_each from settings where key = 'subject_fee';
  v_fee_each := coalesce(v_fee_each, 60);

  if coalesce(v_open,'1') <> '1' then raise exception 'ขณะนี้ปิดรับสมัครสอบแล้ว'; end if;
  if v_school = '' or v_t_name = '' then raise exception 'กรุณากรอกชื่อโรงเรียนและชื่อครูที่ปรึกษา'; end if;
  if length(v_school) > 200 or length(v_t_name) > 200 then raise exception 'ข้อมูลยาวเกินกำหนด'; end if;
  if v_t_id !~ '^\d{13}$' then raise exception 'เลขประจำตัวประชาชนครูต้องเป็นตัวเลข 13 หลัก'; end if;
  if length(public.digits(v_t_phone)) < 9 then raise exception 'กรุณากรอกเบอร์โทรศัพท์ครูให้ถูกต้อง'; end if;

  if jsonb_typeof(v_students) <> 'array' then raise exception 'ข้อมูลนักเรียนไม่ถูกต้อง'; end if;
  v_n := jsonb_array_length(v_students);
  if v_n < 1 then raise exception 'กรุณาเพิ่มรายชื่อนักเรียนอย่างน้อย 1 คน'; end if;
  if v_n > 100 then raise exception 'สมัครได้ครั้งละไม่เกิน 100 คน กรุณาแบ่งเป็นหลายกลุ่ม'; end if;

  if coalesce(v_req_slip,'1') = '1' and v_slip is null then raise exception 'กรุณาอัปโหลดสลิปการชำระเงิน'; end if;
  if v_slip is not null and not public.valid_data_img(v_slip, 500000) then raise exception 'สลิปไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;

  -- ตรวจนักเรียนทุกคนก่อนบันทึกใด ๆ (ถ้ามีข้อผิดพลาดจะบอกว่าแถวไหน)
  for st in select * from jsonb_array_elements(v_students) loop
    i := i + 1;
    v_label := 'แถวที่ ' || i;
    v_idc := public.digits(st->>'id_card');
    if v_idc !~ '^\d{13}$' then raise exception '% : เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก', v_label; end if;
    if v_idc = any(seen) then raise exception '% : เลขประจำตัวประชาชน % ซ้ำกับแถวอื่นในรายการ', v_label, v_idc; end if;
    seen := seen || v_idc;
    if exists (select 1 from applicants where id_card = v_idc) then
      raise exception '% : เลขประจำตัวประชาชน % เคยสมัครสอบไว้แล้ว', v_label, v_idc;
    end if;
    begin v_birth := (st->>'birth_date')::date;
    exception when others then raise exception '% : วันเดือนปีเกิดไม่ถูกต้อง', v_label; end;
    if v_birth is null or v_birth > current_date then raise exception '% : วันเดือนปีเกิดไม่ถูกต้อง', v_label; end if;
    if coalesce(trim(st->>'prefix'),'') = '' or coalesce(trim(st->>'first_name'),'') = ''
       or coalesce(trim(st->>'last_name'),'') = '' or coalesce(trim(st->>'grade'),'') = '' then
      raise exception '% : กรุณากรอกคำนำหน้า ชื่อ นามสกุล และระดับชั้นให้ครบ', v_label;
    end if;
    if length(st->>'first_name') > 100 or length(st->>'last_name') > 100 then raise exception '% : ข้อมูลยาวเกินกำหนด', v_label; end if;
    select array_agg(distinct x) into v_subj
      from jsonb_array_elements_text(coalesce(st->'subjects','[]'::jsonb)) as t(x)
     where x = any(public.app_subjects());
    if v_subj is null or array_length(v_subj,1) = 0 then raise exception '% : กรุณาเลือกวิชาที่สมัครอย่างน้อย 1 วิชา', v_label; end if;
    if nullif(st->>'photo_data','') is not null and not public.valid_data_img(st->>'photo_data', 400000) then
      raise exception '% : รูปถ่ายไม่ถูกต้องหรือมีขนาดใหญ่เกินไป', v_label;
    end if;
    v_total := v_total + public.fee_for(array_length(v_subj,1));
  end loop;

  insert into school_batches (school_name, teacher_prefix, teacher_name, teacher_id_card, teacher_phone,
                              teacher_email, total_fee, slip_data, slip_uploaded_at)
  values (v_school, nullif(trim(coalesce(p->>'teacher_prefix','')),''), v_t_name, v_t_id, v_t_phone,
          nullif(trim(coalesce(p->>'teacher_email','')),''), v_total, v_slip,
          case when v_slip is null then null else now() end)
  returning id, batch_no into v_batch_id, v_batch_no;

  for st in select * from jsonb_array_elements(v_students) loop
    v_idc   := public.digits(st->>'id_card');
    v_birth := (st->>'birth_date')::date;
    select array_agg(distinct x) into v_subj
      from jsonb_array_elements_text(st->'subjects') as t(x) where x = any(public.app_subjects());

    insert into applicants (id_card, birth_date, prefix, first_name, last_name, grade, school, fee,
                            guardian_name, guardian_phone, batch_id, photo_data, thumb_data)
    values (v_idc, v_birth, trim(st->>'prefix'), trim(st->>'first_name'), trim(st->>'last_name'),
            trim(st->>'grade'), v_school, public.fee_for(array_length(v_subj,1)),
            coalesce(nullif(trim(coalesce(st->>'guardian_name','')),''), 'ครู ' || v_t_name),
            coalesce(nullif(trim(coalesce(st->>'guardian_phone','')),''), v_t_phone), v_batch_id,
            nullif(st->>'photo_data',''),
            case when nullif(st->>'thumb_data','') is not null and public.valid_data_img(st->>'thumb_data', 30000)
                 then st->>'thumb_data' end)
    returning id, app_no into v_aid, v_app_no;

    foreach s in array v_subj loop
      insert into applicant_subjects (applicant_id, subject, fee) values (v_aid, s, 0);
    end loop;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'app_no', v_app_no, 'name', trim(st->>'prefix') || trim(st->>'first_name') || ' ' || trim(st->>'last_name'),
      'grade', trim(st->>'grade'), 'subjects', to_jsonb(v_subj)));
  end loop;

  return jsonb_build_object('batch_no', v_batch_no, 'total_fee', v_total, 'count', v_n,
                            'school_name', v_school, 'students', v_out);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: ครูที่ปรึกษา (เลขบัตรครู + เบอร์โทรที่กรอกไว้)
-- ---------------------------------------------------------------------
create or replace function public.teacher_login(p_id_card text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id  text := public.digits(p_id_card);
  v_ph  text := public.digits(p_phone);
  v_out jsonb;
begin
  if v_id !~ '^\d{13}$' or v_ph = '' then return null; end if;
  if not exists (select 1 from school_batches where teacher_id_card = v_id and public.digits(teacher_phone) = v_ph) then
    return null;
  end if;

  select jsonb_build_object(
    'teacher_name', (select coalesce(teacher_prefix,'') || teacher_name from school_batches
                      where teacher_id_card = v_id and public.digits(teacher_phone) = v_ph order by id desc limit 1),
    'batches', coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'batch_no', b.batch_no, 'school_name', b.school_name, 'total_fee', b.total_fee,
      'approval_status', b.approval_status, 'approval_note', b.approval_note,
      'has_slip', b.slip_uploaded_at is not null, 'created_at', b.created_at,
      'students', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'app_no', a.app_no, 'prefix', a.prefix, 'first_name', a.first_name, 'last_name', a.last_name,
          'id_card', a.id_card, 'grade', a.grade, 'approval_status', a.approval_status,
          'has_photo', a.photo_data is not null, 'thumb_data', a.thumb_data,
          'subjects', (select coalesce(jsonb_agg(s.subject order by s.subject), '[]'::jsonb)
                         from applicant_subjects s where s.applicant_id = a.id)
        ) order by a.id), '[]'::jsonb) from applicants a where a.batch_id = b.id)
    ) order by b.id desc), '[]'::jsonb))
    into v_out
    from school_batches b
   where b.teacher_id_card = v_id and public.digits(b.teacher_phone) = v_ph;

  return v_out;
end;
$$;

create or replace function public.teacher_upload_slip(p_id_card text, p_phone text, p_batch_id bigint, p_slip text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b school_batches%rowtype;
begin
  select * into b from school_batches
   where id = p_batch_id and teacher_id_card = public.digits(p_id_card)
     and public.digits(teacher_phone) = public.digits(p_phone);
  if not found then raise exception 'ไม่พบกลุ่มสมัครของคุณ'; end if;
  if b.approval_status = 'approved' then raise exception 'กลุ่มนี้ได้รับการอนุมัติแล้ว'; end if;
  if not public.valid_data_img(p_slip, 500000) then raise exception 'สลิปไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;

  update school_batches set slip_data = p_slip, slip_uploaded_at = now(), approval_status = 'pending', approval_note = null
   where id = b.id;
  update applicants set approval_status = 'pending', approval_note = null where batch_id = b.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.teacher_set_photo(p_id_card text, p_phone text, p_applicant_id bigint, p_photo text, p_thumb text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.valid_data_img(p_photo, 400000) then raise exception 'รูปถ่ายไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'; end if;
  update applicants a
     set photo_data = p_photo,
         thumb_data = case when public.valid_data_img(p_thumb, 30000) then p_thumb else a.thumb_data end
   where a.id = p_applicant_id
     and exists (select 1 from school_batches b
                  where b.id = a.batch_id and b.teacher_id_card = public.digits(p_id_card)
                    and public.digits(b.teacher_phone) = public.digits(p_phone));
  if not found then raise exception 'ไม่พบนักเรียนในความดูแลของคุณ'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ข้อมูลบัตรประจำตัวผู้เข้าสอบของนักเรียนที่ "อนุมัติแล้ว" ทั้งกลุ่ม (ให้ครูพิมพ์ทีเดียว)
create or replace function public.teacher_get_cards(p_id_card text, p_phone text, p_batch_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from school_batches
                  where id = p_batch_id and teacher_id_card = public.digits(p_id_card)
                    and public.digits(teacher_phone) = public.digits(p_phone)) then
    raise exception 'ไม่พบกลุ่มสมัครของคุณ';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'app_no', a.app_no, 'id_card', a.id_card, 'prefix', a.prefix, 'first_name', a.first_name,
            'last_name', a.last_name, 'grade', a.grade, 'school', a.school,
            'exam_room', a.exam_room, 'seat_no', a.seat_no, 'photo_data', a.photo_data,
            'subjects', (select coalesce(jsonb_agg(s.subject order by s.subject), '[]'::jsonb)
                           from applicant_subjects s where s.applicant_id = a.id)
          ) order by a.id), '[]'::jsonb)
            from applicants a where a.batch_id = p_batch_id and a.approval_status = 'approved');
end;
$$;

-- ---------------------------------------------------------------------
-- RPC (เจ้าหน้าที่): อนุมัติ/ไม่อนุมัติทั้งกลุ่มโรงเรียนในคำสั่งเดียว
-- ---------------------------------------------------------------------
create or replace function public.admin_set_batch_status(p_batch_id bigint, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'ไม่มีสิทธิ์ดำเนินการ'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  update school_batches set approval_status = p_status, approval_note = nullif(trim(coalesce(p_note,'')),'')
   where id = p_batch_id;
  if not found then raise exception 'ไม่พบกลุ่มสมัคร'; end if;
  update applicants set approval_status = p_status, approval_note = nullif(trim(coalesce(p_note,'')),'')
   where batch_id = p_batch_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- สิทธิ์การเรียกใช้ฟังก์ชัน
-- (Supabase ให้สิทธิ์ anon เป็นค่าเริ่มต้น จึงต้อง revoke จาก anon โดยตรงสำหรับฟังก์ชันของเจ้าหน้าที่)
-- ---------------------------------------------------------------------
revoke all on function public.am_i_admin()                                   from public, anon;
revoke all on function public.is_admin()                                     from public, anon;
revoke all on function public.admin_set_batch_status(bigint, text, text)     from public, anon;
grant execute on function public.am_i_admin()                                to authenticated;
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.admin_set_batch_status(bigint, text, text)  to authenticated;

revoke all on function public.public_stats()                                    from public;
revoke all on function public.register_applicant(jsonb)                         from public;
revoke all on function public.student_login(text, date)                         from public;
revoke all on function public.upload_slip(text, date, text)                     from public;
revoke all on function public.check_results(text, date)                         from public;
revoke all on function public.register_school(jsonb)                            from public;
revoke all on function public.teacher_login(text, text)                         from public;
revoke all on function public.teacher_upload_slip(text, text, bigint, text)     from public;
revoke all on function public.teacher_set_photo(text, text, bigint, text, text) from public;
revoke all on function public.teacher_get_cards(text, text, bigint)             from public;

grant execute on function public.public_stats()                                    to anon, authenticated;
grant execute on function public.register_applicant(jsonb)                         to anon, authenticated;
grant execute on function public.student_login(text, date)                         to anon, authenticated;
grant execute on function public.upload_slip(text, date, text)                     to anon, authenticated;
grant execute on function public.check_results(text, date)                         to anon, authenticated;
grant execute on function public.register_school(jsonb)                            to anon, authenticated;
grant execute on function public.teacher_login(text, text)                         to anon, authenticated;
grant execute on function public.teacher_upload_slip(text, text, bigint, text)     to anon, authenticated;
grant execute on function public.teacher_set_photo(text, text, bigint, text, text) to anon, authenticated;
grant execute on function public.teacher_get_cards(text, text, bigint)             to anon, authenticated;

-- ---------------------------------------------------------------------
-- เพิ่มเจ้าหน้าที่คนแรก (ทำหลังสร้างผู้ใช้ใน Authentication > Users แล้ว)
-- แก้อีเมลให้ตรงกับผู้ใช้ที่สร้างไว้ แล้วรันคำสั่งนี้แยกต่างหาก:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'admin@yourschool.ac.th';
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- อันดับ: คำนวณในฐานข้อมูลที่เดียว (ผู้ได้รับอนุมัติและมีคะแนนครบทุกวิชาเท่านั้น)
-- คะแนนเท่ากัน = อันดับเดียวกัน · สิทธิ์ = ข้อแรกที่เข้าเงื่อนไขตามลำดับในตั้งค่าระบบ
-- ฟังก์ชันนี้ไม่เปิดให้เรียกตรง (ผ่าน admin_rankings / public_leaderboard / check_results เท่านั้น)
-- ---------------------------------------------------------------------
create or replace function public.ranked_results()
returns table (id bigint, app_no text, full_name text, grade text, school text,
               nsub integer, scored integer, total numeric, pct numeric, complete boolean,
               rank_all integer, n_all integer, rank_grade integer, n_grade integer,
               award text, award_detail text)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(nullif((select value from settings where key = 'subject_max'), '')::numeric, 100) as mx,
           public.safe_json_array((select value from settings where key = 'award_rules')) as rules
  ),
  base as (
    select a.id as aid, a.app_no as ano, trim(a.prefix || a.first_name || ' ' || a.last_name) as nm,
           a.grade as gr, a.school as sc,
           count(*)::integer as ns, count(s.score)::integer as sd, coalesce(sum(s.score), 0)::numeric as tt
      from applicants a join applicant_subjects s on s.applicant_id = a.id
     where a.approval_status = 'approved'
     group by a.id
  ),
  calc as (
    select b.*, (b.sd = b.ns and b.ns > 0) as done,
           case when b.ns > 0 then round(b.tt / (b.ns * (select mx from cfg)) * 100, 2) end as pc
      from base b
  ),
  ra as (
    select c.aid,
           rank() over (order by c.tt desc)::integer as r_all,
           rank() over (partition by c.gr order by c.tt desc)::integer as r_gr,
           (count(*) over ())::integer as n_a,
           (count(*) over (partition by c.gr))::integer as n_g
      from calc c where c.done
  )
  select c.aid, c.ano, c.nm, c.gr, c.sc, c.ns, c.sd, c.tt, c.pc, c.done,
         ra.r_all, ra.n_a, ra.r_gr, ra.n_g, aw.nm2, aw.dt
    from calc c
    left join ra on ra.aid = c.aid
    left join lateral (
      select r.val->>'name' as nm2, r.val->>'detail' as dt
        from jsonb_array_elements((select rules from cfg)) with ordinality as r(val, o)
       where c.done
         and (r.val->>'min_pct' is null or c.pc >= (r.val->>'min_pct')::numeric)
         and (r.val->>'max_rank_all' is null or ra.r_all <= (r.val->>'max_rank_all')::integer)
         and (r.val->>'max_rank_grade' is null or ra.r_gr <= (r.val->>'max_rank_grade')::integer)
       order by r.o limit 1
    ) aw on true;
$$;
revoke all on function public.ranked_results() from public, anon, authenticated;

create or replace function public.admin_rankings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ไม่มีสิทธิ์ดำเนินการนี้'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'app_no', r.app_no, 'name', r.full_name, 'grade', r.grade, 'school', r.school,
             'nsub', r.nsub, 'scored', r.scored, 'total', r.total, 'pct', r.pct, 'complete', r.complete,
             'rank_all', r.rank_all, 'n_all', r.n_all, 'rank_grade', r.rank_grade, 'n_grade', r.n_grade,
             'award', r.award, 'award_detail', r.award_detail)
           order by r.rank_all nulls last, r.full_name)
      from public.ranked_results() r), '[]'::jsonb);
end $$;

create or replace function public.public_leaderboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pub text; v_show text; v_n integer;
begin
  select value into v_pub  from settings where key = 'results_published';
  select value into v_show from settings where key = 'results_show_top';
  if coalesce(v_pub, '0') <> '1' or coalesce(v_show, '0') <> '1' then
    return jsonb_build_object('enabled', false);
  end if;
  v_n := least(50, greatest(1, coalesce(nullif((select value from settings where key = 'results_top_n'), '')::integer, 10)));
  return jsonb_build_object('enabled', true, 'grades', coalesce((
    select jsonb_agg(x.g order by x.g->>'grade') from (
      select jsonb_build_object('grade', r.grade, 'rows', jsonb_agg(jsonb_build_object(
               'rank', r.rank_grade, 'name', r.full_name, 'school', r.school,
               'total', r.total, 'pct', r.pct, 'award', r.award) order by r.rank_grade, r.full_name)) as g
        from public.ranked_results() r
       where r.complete and r.rank_grade <= v_n
       group by r.grade) x), '[]'::jsonb));
end $$;