-- 1.20.5: « portion » in place of « part », in the steps of the community recipes already added (the files say it too)
update recipe set notes = replace(notes, '(2 cookies par part)', '(2 cookies par portion)')
where owner_id in (select id from app_user where email = 'equipe@mybody365.invalid') and notes like '%(2 cookies par part)%';
update recipe set notes = replace(notes, '(2 crêpes par part)', '(2 crêpes par portion)')
where owner_id in (select id from app_user where email = 'equipe@mybody365.invalid') and notes like '%(2 crêpes par part)%';
update recipe set notes = replace(notes, 'une part étant une cuillère', 'une portion étant une cuillère')
where owner_id in (select id from app_user where email = 'equipe@mybody365.invalid') and notes like '%une part étant une cuillère%';
