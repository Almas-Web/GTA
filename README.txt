GV DATA – setup (about 15 min)
1. supabase.com -> new project -> SQL Editor -> paste schema.sql -> Run.
2. Project Settings -> API: copy URL and service_role key.
3. Edit api/index.js function provider() to match DataPlug / EasyAccess docs (endpoint, auth, fields). Put real plan codes in the plans table (Admin tab).
4. Put this folder on GitHub (or "vercel" CLI). Vercel -> Add Project. Add the variables from .env.example in Settings -> Environment Variables.
5. Paystack dashboard -> Settings -> API: set webhook URL to https://YOUR-DOMAIN/api?r=webhook
6. Register with the email you set as ADMIN_EMAIL -> that account becomes admin.
7. Test with Paystack TEST keys and small amounts first. Add the .com.ng domain in Vercel -> Domains (SSL is automatic).

DEMO MODE: if you deploy with NO environment variables, the site runs in demo mode (data saved in the browser, fake payments, fake delivery). Admin: admin@gvdata.demo / admin123.
LIVE MODE: add the variables from .env.example (and run schema.sql) and the same site switches to real mode automatically.
