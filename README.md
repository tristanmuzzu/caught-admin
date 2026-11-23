# Caught admin (phone app)

A read-only phone dashboard for Caught, installable from the browser ("Add to Home Screen").
Served by GitHub Pages at https://tristanmuzzu.github.io/caught-admin/.

This repo holds no data and no secrets. The page asks for the admin key once, keeps it on the
device, and reads `https://caught.studio/api/admin` with it (`Authorization: Bearer`). The server
answers browsers only from the origins in `ADMIN_APP_ORIGINS` (default `https://tristanmuzzu.github.io`).
Anything that changes money or channels stays on the full `/admin` page, which the app links to.

Test against a local server: open the page with `?api=http://localhost:PORT` (localhost only).
