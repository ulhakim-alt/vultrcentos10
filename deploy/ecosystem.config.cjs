module.exports = {
  apps: [
    {
      name: "mkj-pdf-server",
      cwd: "/var/www/quotation-studio/server",
      script: "index.js",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        ALLOWED_ORIGIN: "*", // same-origin via Nginx proxy, so CORS matters less here — tighten if exposing the API port directly
        // ANTHROPIC_API_KEY is intentionally NOT set here — it loads from server/.env instead,
        // which is gitignored, so the real key never ends up committed to your repo.
        // See server/.env.example and deploy/DEPLOY.md.
      },
      max_memory_restart: "500M",
      autorestart: true,
    },
  ],
};
