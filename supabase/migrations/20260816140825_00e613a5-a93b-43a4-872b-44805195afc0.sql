insert into public.user_roles (user_id, role)
values ('42f641fb-01f3-4c38-affb-89ffad3a8813', 'teacher'::public.app_role)
on conflict (user_id, role) do nothing;
delete from public.user_roles where user_id = '42f641fb-01f3-4c38-affb-89ffad3a8813' and role = 'student'::public.app_role;