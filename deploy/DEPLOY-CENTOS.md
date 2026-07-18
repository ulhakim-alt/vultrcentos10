# Deploying to CentOS Stream (Vultr or any RHEL-family VPS)

Same architecture as the Ubuntu guide — Nginx serves the frontend and proxies
`/api/*` to the Node/Puppeteer backend, PM2 keeps the backend alive — but the
package manager, package names, firewall, and SELinux setup are different from
Debian/Ubuntu. This guide is for **CentOS Stream 9 or 10** specifically.

## 1. Initial server setup (one-time)

SSH into your Vultr instance, then:

```bash
sudo dnf update -y
sudo dnf install -y nginx git curl

# Install Node.js 20.x via NodeSource's RPM repo
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install PM2
sudo npm install -g pm2

# Chrome's system dependencies — RHEL/CentOS package names differ from Debian's.
# EPEL is needed for a couple of these.
sudo dnf install -y epel-release
sudo dnf install -y alsa-lib atk cups-libs gtk3 libXcomposite libXcursor \
  libXdamage libXext libXi libXrandr libXScrnSaver libXtst pango \
  at-spi2-atk mesa-libgbm nss nspr xdg-utils liberation-fonts wget
```

### If you're on a 1GB RAM instance, add swap space

Same reasoning as the Ubuntu guide — headless Chrome can spike memory usage
past what's available, and without swap, the OOM killer just silently kills
the process. The commands are identical across distros:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Get the code onto the server

```bash
sudo mkdir -p /var/www/quotation-studio
sudo chown $USER:$USER /var/www/quotation-studio
cd /var/www/quotation-studio
git clone <your-repo-url> .
```

## 3. Build the frontend

```bash
cd /var/www/quotation-studio
npm install
npm run build
```

Produces `dist/` — the static files Nginx serves. Leave `VITE_API_URL` unset
(frontend + backend are same-origin via Nginx's proxy).

## 4. Set up the backend

```bash
cd /var/www/quotation-studio/server
npm install
npx puppeteer browsers install chrome
```

```bash
cd /var/www/quotation-studio
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed instructions — works the same on CentOS Stream, since it also uses systemd
```

## 5. Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/quotation-studio.conf
sudo nano /etc/nginx/conf.d/quotation-studio.conf
# Replace YOUR_DOMAIN_OR_IP with your actual domain or the server's IP
```

**Note:** CentOS's Nginx layout uses `/etc/nginx/conf.d/*.conf` directly (all
files in that folder are auto-included) — there's no separate
`sites-available`/`sites-enabled` symlink step like on Ubuntu.

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## 6. ⚠️ SELinux — the step Ubuntu doesn't need

CentOS ships with **SELinux enforcing by default**. Without this step, Nginx
will fail to reach your Node backend even though the config is correct —
SELinux blocks Nginx from making outbound network connections to other
processes unless explicitly allowed. This is the single most common reason
a working-looking Nginx + Node reverse-proxy setup mysteriously returns
502 Bad Gateway on CentOS/RHEL specifically.

```bash
sudo setsebool -P httpd_can_network_connect 1
```

(`-P` makes it persist across reboots — without it, the setting is lost on restart.)

## 7. Firewall

CentOS Stream typically ships with `firewalld` active by default (unlike
Ubuntu, where `ufw` is usually inactive out of the box). Open the ports you need:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

If you skip this, you'll be able to reach the site from `localhost` on the
server itself (e.g. via `curl`) but not from your browser externally — a
common source of confusion since the app looks "broken" when it's actually
just the firewall.

## 8. Test it

- Visit `http://YOUR_SERVER_IP/` — the calculator should load.
- Visit `http://YOUR_SERVER_IP/health` — should return `{"status":"ok"}`.
- If you get a **502 Bad Gateway** specifically, that's almost always the
  SELinux step (6) being missed — double-check `getenforce` shows `Enforcing`
  and that you ran the `setsebool` command above.
- If the site doesn't load **at all** (connection refused/times out), that's
  more likely the firewall step (7).

## 9. (Recommended) Add HTTPS

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Updating the app later

```bash
cd /var/www/quotation-studio
git pull
npm install && npm run build
cd server && npm install
pm2 restart mkj-pdf-server
```

## Useful commands

```bash
pm2 status
pm2 logs mkj-pdf-server
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log   # if you get 502s, this shows the real reason
getenforce                               # confirm SELinux mode (should say Enforcing)
sudo firewall-cmd --list-services        # confirm http/https are open
```
