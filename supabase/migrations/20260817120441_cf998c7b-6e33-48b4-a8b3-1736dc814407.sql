-- Demo class owned by the demo account, with the demo account also enrolled as a student
insert into public.classes (id, teacher_id, name, curriculum, subject, join_code)
values ('11111111-2222-4333-8444-555555555555', '6ead4632-4313-4e7d-a0d2-e27c28284206',
        'Demo Chemistry Class', 'IGCSE', 'Chemistry', 'DEMO01')
on conflict (id) do nothing;

insert into public.class_members (class_id, student_id)
select '11111111-2222-4333-8444-555555555555', '6ead4632-4313-4e7d-a0d2-e27c28284206'
where not exists (
  select 1 from public.class_members
  where class_id = '11111111-2222-4333-8444-555555555555'
    and student_id = '6ead4632-4313-4e7d-a0d2-e27c28284206'
);

insert into public.assignments (id, class_id, created_by, title, subject, curriculum, instructions, published)
values ('11111111-2222-4333-8444-666666666666', '11111111-2222-4333-8444-555555555555',
        '6ead4632-4313-4e7d-a0d2-e27c28284206', 'Demo Homework: Rates of Reaction', 'Chemistry', 'IGCSE',
        'A short demo homework so you can try the student experience.', true)
on conflict (id) do nothing;

insert into public.questions (assignment_id, position, question_text, mark_scheme, marks)
select '11111111-2222-4333-8444-666666666666', v.position, v.question_text, v.mark_scheme, v.marks
from (values
  (1, '1(a) Explain why the rate of a reaction decreases as the reaction proceeds.', 'reactant concentration falls (1); fewer successful collisions per second (1)', 2),
  (2, '1(b) State two ways to increase the rate of this reaction.', 'increase temperature (1); increase concentration / surface area / add catalyst (1)', 2),
  (3, '1(c) Calculate the average rate of reaction if 48 cm3 of gas is produced in 60 s. Show your working.', 'rate = volume / time (1); 0.8 cm3/s (1)', 2)
) as v(position, question_text, mark_scheme, marks)
where not exists (
  select 1 from public.questions q where q.assignment_id = '11111111-2222-4333-8444-666666666666'
);