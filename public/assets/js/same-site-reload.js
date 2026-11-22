// Session cookies are SameSite=Strict, so a link opened from another site or app arrives without them.
// Reloading the same address from this page makes it a same-site request that carries the session.
location.replace(location.href);
