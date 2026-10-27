# Launch-day checklist (the hosted server)

Everything here is free until kitchens pay. Each step says where to click or what to type on the server console.

## 1. Know when the server is down (UptimeRobot, free)
1. Make a free account at uptimerobot.com.
2. Add a monitor: type **HTTP(s)**, address `https://YOUR-SITE/healthz`, every 5 minutes.
3. Add your phone for alerts (their free app).

The check reads the database and the kitchen engine, and answers "not OK" if either is down. It works while the site is still locked with the login.

## 2. Keep a copy of the kitchens off the server (Backblaze B2, free up to 10 GB)
1. Make a free account at backblaze.com and choose **B2 Cloud Storage**.
2. Create a **private** bucket, for example `smokebox-backups-freddy`.
3. Under **Application Keys**, add a key for that bucket only. Keep the page open: it shows the **keyID** and the **applicationKey** once.
4. On the server console, type `smokebox-offsite`, then type the keyID, the applicationKey, the bucket name and a backup passphrase (12 characters or more).
5. **Write the passphrase down somewhere that is not the server.** Without it the copies cannot be read.

Every night's copy then also goes to the bucket, encrypted. The staff console (`/staff`) shows the last backup in red if it failed or did not go off the server. Once a week the newest copy is restored into a scratch database to prove it works; `smokebox-restore-check` runs that by hand.

## 3. Take money (Stripe, no monthly fee)
Later: see the billing notes in the pull request that added billing. Until the three Stripe settings are in `/etc/smokebox/server.env`, every kitchen is free.

## 4. Open the doors
On the server console, type `smokebox-open`. The shared login goes away, and anyone can reach the start page; kitchens sign in with their own accounts. `smokebox-lock` puts the login back.

What protects an open site:
- **Rate limits:** wrong passwords and codes lock out for 15 minutes; starting kitchens, join codes, kitchen actions, support messages and error reports are rate-limited.
- **The voice helper** answers joined kitchen devices only.
- **Security headers** are set, and HTTPS is enforced.
- **Error log:** server errors and tablet page errors are counted on the staff console.
