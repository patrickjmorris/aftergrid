-- Invariant: subscription_id is unique in the retained input.
select count(*) = count(distinct subscription_id) as pass,
       (count(*) - count(distinct subscription_id))::varchar || ' duplicate subscription rows' as detail
from subscriptions
