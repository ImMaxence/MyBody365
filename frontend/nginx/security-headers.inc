# Included in every location that answers (nginx does not inherit add_header into a location that sets its own).
# The three hashes in script-src allow three fixed one-line inline scripts and nothing else:
#   3RAH…: index.html, applies a forced light / dark theme before the first paint;
#   319H…: index.html, 1.20.2: centres the start logo on the screen in the iPhone's installed app;
#   LMY6…: Angular's critical CSS inlining, turns the deferred stylesheet on.
# e2e/landing.spec.ts fails if the build ever emits an inline script whose hash is not listed here.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-3RAHEmuuDdK5zyyTL/8LzEej3eEWGl859Q5VWr3DxHQ=' 'sha256-319HdBxoGuY2O5ctBBhkAT4vf9b8R2t+JvfxVOn6L3U=' 'sha256-LMY6wYoFV9I4wWzxaq1N/dTpl4iurQktw706UCHK3vM='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
