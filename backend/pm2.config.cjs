/* global module, __dirname */
// PM2 manifest for the growth-platform API. Runs beside the site on the VPS;
// the site proxies /api/v2 to it (next.config.ts). Loaded by
// scripts/deploy.sh with `pm2 startOrRestart backend/pm2.config.cjs`.
// Secrets come from backend/.env (dotenv) — nothing sensitive lives here.
module.exports = {
  apps: [
    {
      name: "maple-studios-api",
      cwd: __dirname,
      script: "dist/server.js",
      exec_mode: "fork",
      instances: 1, // the in-process scheduler assumes a single instance
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production", PORT: 4006 },
      time: true,
    },
  ],
};
