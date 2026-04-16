#!/usr/bin/env node
// Interactive setup script — run with: node setup.js

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

console.log('\n🎬 VodArchive Setup\n' + '─'.repeat(40));

async function main() {
  // Check if already configured
  const serverEnv = path.join(__dirname, 'server/.env');
  const clientEnv = path.join(__dirname, 'client/.env.local');

  if (fs.existsSync(serverEnv)) {
    const overwrite = await ask('\n⚠️  .env files already exist. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('\nSkipping env setup. Running npm install...');
      install();
      return done();
    }
  }

  console.log(`
To get your Twitch credentials:
  1. Go to https://dev.twitch.tv/console/apps
  2. Click "Register Your Application"
  3. Name: anything (e.g. VodArchive)
  4. OAuth Redirect URL: http://localhost:3001/auth/callback
  5. Category: Application Integration
  6. Copy the Client ID and generate a Client Secret
`);

  const clientId = (await ask('Paste your Twitch Client ID: ')).trim();
  const clientSecret = (await ask('Paste your Twitch Client Secret: ')).trim();

  if (!clientId || !clientSecret) {
    console.error('\n❌ Both fields required. Run setup again.');
    process.exit(1);
  }

  // Generate a random JWT secret
  const jwtSecret = Array.from(
    { length: 32 },
    () => Math.random().toString(36)[2]
  ).join('');

  // Write server .env
  fs.writeFileSync(serverEnv, `TWITCH_CLIENT_ID=${clientId}
TWITCH_CLIENT_SECRET=${clientSecret}
TWITCH_REDIRECT_URI=http://localhost:3001/auth/callback
JWT_SECRET=${jwtSecret}
NODE_ENV=development
PORT=3001
`);

  // Write client .env.local
  fs.writeFileSync(clientEnv, `VITE_API_URL=http://localhost:3001
VITE_TWITCH_CLIENT_ID=${clientId}
VITE_REDIRECT_URI=http://localhost:5173/auth
`);

  console.log('\n✅ Credentials saved.');
  install();
  done();
}

function install() {
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, 'server') });
    execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, 'client') });
    console.log('\n✅ Dependencies installed.');
  } catch (e) {
    console.error('\n❌ npm install failed:', e.message);
    process.exit(1);
  }
}

function done() {
  rl.close();
  console.log(`
─────────────────────────────────────
✅ Setup complete!

To start:
  npm run dev

Then open: http://localhost:5173
─────────────────────────────────────
`);
}

main().catch(e => { console.error(e); process.exit(1); });
