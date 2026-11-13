// Puts the labelled draft on a Cloudflare Pages address for Eugene to review, on whichever account
// Wrangler is logged in to. It stays up with the laptop closed until `npm run unshare` removes it.
//
//   npm run share      build the draft and upload it
//   npm run unshare    delete it from Cloudflare
import { spawnSync } from 'node:child_process';

const PROJECT = 'pit-wall-draft-56a388'; // deliberately says nothing about whose site this is

const wrangler = (args, stdio = 'pipe') => spawnSync(`wrangler ${args.join(' ')}`, { shell: true, encoding: 'utf8', stdio });

if (process.argv.includes('--remove')) {
  const gone = wrangler(['pages', 'project', 'delete', PROJECT, '--yes'], 'inherit');
  process.exit(gone.status ?? 1);
}

const made = wrangler(['pages', 'project', 'create', PROJECT, '--production-branch', 'main']);
if (made.status !== 0 && !/already exists/i.test(`${made.stdout}${made.stderr}`)) {
  console.error(made.stdout, made.stderr);
  process.exit(1);
}

const sent = wrangler(['pages', 'deploy', 'dist-draft', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], 'inherit');
if (sent.status !== 0) process.exit(sent.status ?? 1);

console.log(`\n  Draft link for Eugene: https://${PROJECT}.pages.dev`);
console.log('  A new address can take a minute or two to start working.');
console.log('  Take it down with: npm run unshare\n');
