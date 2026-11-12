-- =============================================================
--  Test Bot — Supabase sxemasi
--  Supabase Dashboard -> SQL Editor -> shu faylni TO'LIQ run qiling.
--  Eski sxema ustiga ham xavfsiz ishlaydi (create if not exists / or replace).
--
--  Xavfsizlik modeli:
--   • Jadvallarda RLS yoqilgan va policy yo'q — to'g'ridan-to'g'ri kirish yopiq.
--   • Barcha funksiyalar FAQAT service_role uchun ochiq. Ularni server API
--     (api/index.js yoki supabase/functions/api) chaqiradi: u Telegram
--     initData imzosini tekshiradi va user_id ni o'zi aniqlaydi.
--   • Shuning uchun brauzerdan anon kalit bilan birovning nomidan ish qilib,
--     javoblarni ko'rib yoki testni o'chirib bo'lmaydi.
-- =============================================================

create extension if not exists pgcrypto;

-- ----------------------------- jadvallar ----------------------------------

create table if not exists public.tests (
  id                 uuid primary key default gen_random_uuid(),
  token              text unique not null,
  title              text not null,
  test_type          text not null default 'closed',   -- closed | open | mixed
  question_count     int  not null check (question_count between 1 and 200),
  time_limit_minutes int,                              -- null = vaqt cheklanmagan
  once_only          boolean not null default false,
  show_answers       boolean not null default true,
  answer_key         jsonb not null,                   -- [{"n":1,"type":"closed","answer":"A"}]
  owner_id           bigint not null,                  -- Telegram user id (faqat ustoz uchun)
  owner_name         text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references public.tests(id) on delete cascade,
  user_id       bigint,                                -- null = Telegramsiz (anonim) urinish
  user_name     text,
  given         jsonb not null,                        -- {"1":"A","2":"C"}
  correct       int not null,
  total         int not null,
  percent       numeric(5,2) not null,
  spent_seconds int,
  created_at    timestamptz not null default now()
);

-- Eski bazada user_id "not null" bo'lgan bo'lsa, olib tashlaymiz
alter table public.attempts alter column user_id drop not null;

create index if not exists attempts_test_idx on public.attempts (test_id, created_at desc);
create index if not exists attempts_user_idx on public.attempts (user_id, created_at desc);
create index if not exists tests_owner_idx   on public.tests (owner_id, created_at desc);

-- RLS yoqilgan, policy yo'q => anon kalit bilan jadvallarga to'g'ridan-to'g'ri
-- kirib bo'lmaydi. Faqat quyidagi SECURITY DEFINER funksiyalar ishlaydi.
alter table public.tests    enable row level security;
alter table public.attempts enable row level security;

-- ----------------------------- yordamchilar --------------------------------

create or replace function public.make_token()
returns text language sql volatile as $$
  select lower(concat_ws('-',
    substr(md5(random()::text || clock_timestamp()::text), 1, 4),
    substr(md5(random()::text || clock_timestamp()::text), 1, 4),
    substr(md5(random()::text || clock_timestamp()::text), 1, 4)));
$$;

-- Token kalitga aylantirish: faqat a-z va 0-9 qoladi.
-- "A3F9-12bc–77DE", " a3f9 12bc 77de " => "a3f912bc77de"
create or replace function public.token_key(p text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g');
$$;

-- Token bo'yicha tezkor qidiruv uchun indeks (make_token faqat a-f0-9 va '-' beradi)
create index if not exists tests_token_key_idx
  on public.tests (public.token_key(token));

-- Javobni normallashtirish: ortiqcha bo'shliq tozalanadi, registr hisobga
-- olinmaydi, o'zbekcha apostroflar bitta ko'rinishga keltiriladi,
-- vergul nuqtaga aylanadi.
create or replace function public.norm_answer(a text)
returns text language sql immutable as $$
  select nullif(
    upper(btrim(
      regexp_replace(
        replace(
          regexp_replace(coalesce(a, ''), '[‘’ʻʼ`´]', '''', 'g'),
          ',', '.'),
        '\s+', ' ', 'g'))),
  '');
$$;

-- Ikki javobni solishtirish: ikkalasi ham son bo'lsa son sifatida (12 = 12.0),
-- aks holda normallashgan matn sifatida.
create or replace function public.answers_equal(a text, b text)
returns boolean language plpgsql immutable as $$
declare na text := norm_answer(a); nb text := norm_answer(b);
begin
  if na is null or nb is null then return false; end if;
  if na ~ '^-?[0-9]+(\.[0-9]+)?$' and nb ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return na::numeric = nb::numeric;
  end if;
  return na = nb;
end $$;

-- ----------------------------- test yaratish -------------------------------

create or replace function public.create_test(
  p_owner_id    bigint,
  p_owner_name  text,
  p_title       text,
  p_type        text,
  p_count       int,
  p_time_limit  int,
  p_once_only   boolean,
  p_show        boolean,
  p_answer_key  jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_id    uuid;
  v_tries int := 0;
begin
  if p_owner_id is null then
    raise exception 'Test yaratish uchun Telegram ID kerak';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Test nomi bo''sh bo''lmasligi kerak';
  end if;
  if jsonb_typeof(p_answer_key) <> 'array' or jsonb_array_length(p_answer_key) <> p_count then
    raise exception 'Javoblar soni savollar soniga mos emas';
  end if;

  loop
    v_token := make_token();
    v_tries := v_tries + 1;
    exit when not exists (select 1 from tests where token_key(token) = token_key(v_token))
              or v_tries > 10;
  end loop;

  insert into tests (token, title, test_type, question_count, time_limit_minutes,
                     once_only, show_answers, answer_key, owner_id, owner_name)
  values (v_token, btrim(p_title), coalesce(p_type, 'closed'), p_count, p_time_limit,
          coalesce(p_once_only, false), coalesce(p_show, true), p_answer_key,
          p_owner_id, p_owner_name)
  returning id into v_id;

  -- Bu token HAMMA uchun ishlaydi: owner_id faqat boshqaruv uchun ishlatiladi.
  return json_build_object('id', v_id, 'token', v_token, 'title', btrim(p_title),
                           'question_count', p_count);
end $$;

-- --------------------- test ma'lumoti (javoblarsiz!) -----------------------

create or replace function public.get_test(p_token text, p_user_id bigint default null)
returns json
language plpgsql security definer set search_path = public as $$
declare t tests; v_taken int := 0;
begin
  select * into t from tests
  where token_key(token) = token_key(p_token)
    and token_key(p_token) <> ''
  limit 1;

  if not found then
    raise exception 'Bunday kodli test topilmadi';
  end if;
  if not t.is_active then
    raise exception 'Bu test yopilgan';
  end if;
  if p_user_id is not null and t.owner_id = p_user_id then
    raise exception 'Bu sizning testingiz. Natijalarni «Mening testlarim» bo''limida ko''ring';
  end if;

  if t.once_only then
    if p_user_id is null then
      raise exception 'Bu testni topshirish uchun Telegram orqali kiring';
    end if;
    select count(*) into v_taken from attempts
    where test_id = t.id and user_id = p_user_id;
    if v_taken > 0 then
      raise exception 'Bu testni faqat bir marta topshirish mumkin';
    end if;
  end if;

  return json_build_object(
    'id', t.id, 'token', t.token, 'title', t.title, 'test_type', t.test_type,
    'question_count', t.question_count, 'time_limit_minutes', t.time_limit_minutes,
    'once_only', t.once_only, 'show_answers', t.show_answers,
    'owner_name', t.owner_name,
    'questions', (
      select coalesce(json_agg(json_build_object(
               'n', (q->>'n')::int,
               'type', coalesce(q->>'type', t.test_type)) order by (q->>'n')::int), '[]')
      from jsonb_array_elements(t.answer_key) q)
  );
end $$;

-- --------------------------- javoblarni yuborish ---------------------------

create or replace function public.submit_attempt(
  p_token   text,
  p_user_id bigint,          -- null bo'lishi mumkin
  p_name    text,
  p_given   jsonb,           -- {"1":"A","2":"12"}
  p_spent   int
) returns json
language plpgsql security definer set search_path = public as $$
declare
  t         tests;
  q         jsonb;
  v_n       int;
  v_correct int := 0;
  v_ok      boolean;
  v_review  jsonb := '[]'::jsonb;
  v_att     attempts;
begin
  select * into t from tests
  where token_key(token) = token_key(p_token)
    and token_key(p_token) <> ''
  limit 1;

  if not found then raise exception 'Test topilmadi'; end if;
  if not t.is_active then raise exception 'Bu test yopilgan'; end if;
  if p_user_id is not null and t.owner_id = p_user_id then
    raise exception 'O''z testingizni topshira olmaysiz';
  end if;

  if t.once_only then
    if p_user_id is null then
      raise exception 'Bu testni topshirish uchun Telegram orqali kiring';
    end if;
    if exists (select 1 from attempts where test_id = t.id and user_id = p_user_id) then
      raise exception 'Siz bu testni allaqachon topshirgansiz';
    end if;
  end if;

  p_given := coalesce(p_given, '{}'::jsonb);

  for q in select * from jsonb_array_elements(t.answer_key) loop
    v_n  := (q->>'n')::int;
    v_ok := answers_equal(p_given->>v_n::text, q->>'answer');
    if v_ok then v_correct := v_correct + 1; end if;

    v_review := v_review || jsonb_build_object(
      'n', v_n,
      'given', p_given->>v_n::text,
      'correct', v_ok,
      'answer', case when t.show_answers then q->>'answer' else null end);
  end loop;

  insert into attempts (test_id, user_id, user_name, given, correct, total, percent, spent_seconds)
  values (t.id, p_user_id, coalesce(nullif(btrim(p_name), ''), 'Noma''lum'), p_given,
          v_correct, t.question_count,
          round(v_correct::numeric * 100 / nullif(t.question_count, 0), 1), p_spent)
  returning * into v_att;

  return json_build_object(
    'id', v_att.id, 'test_id', t.id, 'token', t.token, 'title', t.title,
    'user_name', v_att.user_name, 'correct', v_correct, 'total', t.question_count,
    'percent', v_att.percent, 'spent_seconds', p_spent,
    'created_at', v_att.created_at, 'show_answers', t.show_answers,
    'owner_id', t.owner_id,          -- server API ustozga xabar yuborish uchun oladi va o'chiradi
    'review', v_review);
end $$;

-- ----------------------------- natijani ochish -----------------------------

create or replace function public.get_attempt(p_attempt_id uuid, p_user_id bigint default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  a        attempts;
  t        tests;
  q        jsonb;
  v_n      int;
  v_is_owner boolean;
  v_review jsonb := '[]'::jsonb;
begin
  select * into a from attempts where id = p_attempt_id;
  if not found then raise exception 'Natija topilmadi'; end if;
  select * into t from tests where id = a.test_id;

  v_is_owner := p_user_id is not null and t.owner_id = p_user_id;

  -- Natija egasi, test muallifi ko'ra oladi. Anonim urinish (user_id null)
  -- esa uning uzun tasodifiy id sini bilgan kishiga ochiq.
  if a.user_id is not null
     and a.user_id is distinct from p_user_id
     and not v_is_owner then
    raise exception 'Bu natijani ko''rishga ruxsat yo''q';
  end if;

  for q in select * from jsonb_array_elements(t.answer_key) loop
    v_n := (q->>'n')::int;
    v_review := v_review || jsonb_build_object(
      'n', v_n,
      'given', a.given->>v_n::text,
      'correct', answers_equal(a.given->>v_n::text, q->>'answer'),
      'answer', case when t.show_answers or v_is_owner then q->>'answer' else null end);
  end loop;

  return json_build_object(
    'id', a.id, 'test_id', t.id, 'token', t.token, 'title', t.title,
    'user_name', a.user_name, 'correct', a.correct, 'total', a.total,
    'percent', a.percent, 'spent_seconds', a.spent_seconds,
    'created_at', a.created_at, 'show_answers', t.show_answers, 'review', v_review);
end $$;

-- --------------------------- ro'yxatlar (admin) ----------------------------

create or replace function public.my_tests(p_owner_id bigint)
returns json
language sql security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]')
  from (
    select t.id, t.token, t.title, t.test_type, t.question_count, t.is_active,
           t.time_limit_minutes, t.once_only, t.show_answers, t.created_at,
           (select count(*) from attempts a where a.test_id = t.id) as attempts_count,
           (select round(avg(a.percent), 1) from attempts a where a.test_id = t.id) as avg_percent
    from tests t
    where t.owner_id = p_owner_id
  ) x;
$$;

create or replace function public.test_attempts(p_test_id uuid, p_owner_id bigint)
returns json
language plpgsql security definer set search_path = public as $$
declare t tests;
begin
  select * into t from tests where id = p_test_id;
  if not found then raise exception 'Test topilmadi'; end if;
  if t.owner_id <> p_owner_id then raise exception 'Ruxsat yo''q'; end if;

  return json_build_object(
    'test', json_build_object('id', t.id, 'token', t.token, 'title', t.title,
                              'question_count', t.question_count, 'is_active', t.is_active,
                              'created_at', t.created_at),
    'attempts', (select coalesce(json_agg(json_build_object(
                   'id', a.id, 'user_name', a.user_name, 'correct', a.correct,
                   'total', a.total, 'percent', a.percent, 'created_at', a.created_at)
                   order by a.percent desc, a.created_at), '[]')
                 from attempts a where a.test_id = t.id));
end $$;

create or replace function public.set_test_active(p_test_id uuid, p_owner_id bigint, p_active boolean)
returns json
language plpgsql security definer set search_path = public as $$
begin
  update tests set is_active = p_active
  where id = p_test_id and owner_id = p_owner_id;
  if not found then raise exception 'Ruxsat yo''q'; end if;
  return json_build_object('ok', true, 'is_active', p_active);
end $$;

create or replace function public.delete_test(p_test_id uuid, p_owner_id bigint)
returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from tests where id = p_test_id and owner_id = p_owner_id;
  if not found then raise exception 'Ruxsat yo''q'; end if;
  return json_build_object('ok', true);
end $$;

-- ------------------------- ro'yxat (foydalanuvchi) -------------------------

create or replace function public.my_results(p_user_id bigint)
returns json
language sql security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', a.id, 'title', t.title, 'token', t.token,
           'correct', a.correct, 'total', a.total, 'percent', a.percent,
           'created_at', a.created_at) order by a.created_at desc), '[]')
  from attempts a join tests t on t.id = a.test_id
  where a.user_id = p_user_id;
$$;

-- ------------------------------- adminlar ----------------------------------
-- Bosh adminlar (ALLOWED_CREATOR_IDS) bu jadvalda saqlanmaydi — ular hosting
-- sozlamalarida. Bu yerda ilova/bot orqali QO'SHILGAN adminlar turadi.
-- Kim kimni o'chira olishini server (access.js) hal qiladi va p_force orqali aytadi.

create table if not exists public.admins (
  user_id    bigint primary key,                -- Telegram user id
  name       text,
  added_by   bigint not null,                   -- kim qo'shgan
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin(p_user_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = p_user_id);
$$;

create or replace function public.list_admins()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'user_id', a.user_id, 'name', a.name, 'added_by', a.added_by,
           'added_by_name', b.name, 'created_at', a.created_at,
           'tests_count', (select count(*) from tests t where t.owner_id = a.user_id))
           order by a.created_at), '[]')
  from admins a left join admins b on b.user_id = a.added_by;
$$;

create or replace function public.add_admin(p_user_id bigint, p_name text, p_added_by bigint)
returns json
language plpgsql security definer set search_path = public as $$
declare v admins;
begin
  if p_user_id is null or p_user_id <= 0 then
    raise exception 'Telegram ID noto''g''ri';
  end if;
  if exists (select 1 from admins where user_id = p_user_id) then
    raise exception 'Bu foydalanuvchi allaqachon admin';
  end if;
  insert into admins (user_id, name, added_by)
  values (p_user_id, nullif(btrim(p_name), ''), p_added_by)
  returning * into v;
  return json_build_object('user_id', v.user_id, 'name', v.name,
                           'added_by', v.added_by, 'created_at', v.created_at);
end $$;

create or replace function public.remove_admin(p_user_id bigint, p_by bigint, p_force boolean default false)
returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from admins
  where user_id = p_user_id and (coalesce(p_force, false) or added_by = p_by);
  if not found then
    if exists (select 1 from admins where user_id = p_user_id) then
      raise exception 'Faqat o''zingiz qo''shgan adminni o''chira olasiz';
    end if;
    raise exception 'Bunday admin topilmadi';
  end if;
  -- Uning testlari o'chmaydi: qayta admin qilinsa, yana ko'radi.
  return json_build_object('ok', true);
end $$;

-- ------------------------------ ruxsatlar ----------------------------------
-- Supabase yangi funksiyalarga avtomatik anon/authenticated ruxsat beradi —
-- shuning uchun ularni aniq olib tashlaymiz va faqat service_role ga beramiz.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('make_token','token_key','norm_answer','answers_equal',
                        'create_test','get_test','submit_attempt','get_attempt',
                        'my_tests','test_attempts','set_test_active','delete_test','my_results',
                        'is_admin','list_admins','add_admin','remove_admin')
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- PostgREST funksiyalar ro'yxatini yangilasin
notify pgrst, 'reload schema';

-- ------------------------------ tekshirish ---------------------------------
-- SQL Editor'da (u postgres roli bilan ishlaydi):
--   select get_test('sizning-tokeningiz', 999999999);
