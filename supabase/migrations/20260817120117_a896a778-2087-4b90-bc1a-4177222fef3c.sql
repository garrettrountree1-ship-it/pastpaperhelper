update auth.users
set encrypted_password = extensions.crypt('StemHomework2026!', extensions.gen_salt('bf')),
    updated_at = now()
where id = '6ead4632-4313-4e7d-a0d2-e27c28284206';