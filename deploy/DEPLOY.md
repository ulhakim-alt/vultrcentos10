# Deploying to a Vultr VPS (or any Ubuntu server)

This runs both the frontend (static files) and backend (Express + Puppeteer)
on one server, served through Nginx. No serverless timeout limits, no CORS
complexity — everything's same-origin.

## 1. Initial server setup (one-time)

SSH into your Vultr instance, then:

```bash
sudo apt-get update
sudo apt-get install -y nginx git curl

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (keeps the backend running, restarts on crash/reboot)
sudo npm install -g pm2

# Install Chrome's system dependencies — Puppeteer needs these on a bare
# Ubuntu server (this is the standard, well-documented list)
sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
  libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
  wget xdg-utils
```

### If you're on a 1GB RAM instance, add swap space

Headless Chrome can spike memory usage well past what a 1GB instance has free,
especially with Nginx, Node, and PM2 also running. Without swap, Linux's OOM
killer will just silently kill the Chrome or Node process when memory runs out
— which shows up as a mysteriously broken PDF button, not a clear error. A swap
file is cheap insurance (2GB is a reasonable size for a 1GB RAM instance):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persists across reboots
```

This doesn't make Chrome faster, but it prevents outright crashes under memory
pressure. If you can afford to run a 2GB RAM instance instead, that's still the
better fix — swap is a safety net, not a substitute for enough real RAM.

## 2. Get the code onto the server

```bash
sudo mkdir -p /var/www/quotation-studio
sudo chown $USER:$USER /var/www/quotation-studio
cd /var/www/quotation-studio
git clone <your-repo-url> .
```

(If you're not using Git, `scp`/`sftp` the project folder up instead.)

## 3. Build the frontend

```bash
cd /var/www/quotation-studio
npm install
npm run build
```

This produces `dist/` — the static files Nginx will serve. Since the backend
is on the same server, you don't need `VITE_API_URL` set at all (leave it
blank in `.env` or don't create one) — the frontend's relative `/api/...`
calls will correctly hit Nginx, which proxies them to the backend.

## 4. Set up the backend

```bash
cd /var/www/quotation-studio/server
npm install
npx puppeteer browsers install chrome
```

Then start it with PM2 using the provided config:

```bash
cd /var/www/quotation-studio
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed instructions to enable auto-start on reboot
```

## 5. Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/quotation-studio
sudo nano /etc/nginx/sites-available/quotation-studio
# Replace YOUR_DOMAIN_OR_IP with your actual domain or the server's IP

sudo ln -s /etc/nginx/sites-available/quotation-studio /etc/nginx/sites-enabled/
sudo nginx -t   # test the config for syntax errors before reloading
sudo systemctl reload nginx
```

## 6. Test it

- Visit `http://YOUR_SERVER_IP/` — the calculator should load.
- Visit `http://YOUR_SERVER_IP/health` — should return `{"status":"ok"}` if
  the backend is running correctly.
- In the app, try "Generate MKJ PDF (Server)" — this is the real end-to-end test.

## 7. (Recommended) Add HTTPS

If you have a domain pointed at this server:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot edits the Nginx config automatically and sets up auto-renewal.

## Updating the app later

```bash
cd /var/www/quotation-studio
git pull
npm install && npm run build        # rebuild frontend
cd server && npm install            # update backend deps if changed
pm2 restart mkj-pdf-server          # restart backend with any code changes
```

## Useful PM2 commands

```bash
pm2 status              # is the backend running?
pm2 logs mkj-pdf-server # see real-time logs (crucial for debugging PDF failures)
pm2 restart mkj-pdf-server
```
