-- Invariant: user_id is unique in the retained users input (a duplicate would double-count a signup).
select count(*) = count(distinct user_id) as pass,
       (count(*) - count(distinct user_id))::varchar || ' duplicate user rows' as detail
from users
