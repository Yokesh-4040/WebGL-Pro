import fs from 'fs';
import { execSync } from 'child_process';

// Read the local legacy config.json file
const configPath = './config.json';
if (!fs.existsSync(configPath)) {
  console.error('config.json not found!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const ftpHost = config.ftp_host || '';
const ftpUser = config.ftp_user || '';
const ftpPass = config.ftp_pass || '';
const ftpDomain = config.ftp_domain || '';
const baseDir = config.base_dir || 'public_html';
const injectMode = config.inject_mode || 'none';
const uploadMode = config.upload_mode || 'full';
const uploadHtaccess = config.upload_htaccess !== false;

if (!config.projects) {
  console.log('No legacy projects found in config.json.');
  process.exit(0);
}

const isProd = process.argv.includes('--prod');
console.log(`Starting migration of legacy projects to Convex Cloud (${isProd ? 'Production' : 'Development'})...`);

for (const [name, proj] of Object.entries(config.projects)) {
  // If the build folder is empty, skip or warn
  if (!proj.build_folder) {
    console.log(`Skipping project "${name}" (no build folder set).`);
    continue;
  }

  const args = {
    name: name,
    buildFolder: proj.build_folder,
    ftpHost,
    ftpUser,
    ftpPass,
    ftpDomain,
    baseDir,
    injectMode,
    uploadMode,
    uploadHtaccess
  };

  console.log(`Importing: ${name} -> ${proj.build_folder}`);
  try {
    // Run npx convex run projects:add with the args JSON string
    const cmd = `npx convex run ${isProd ? '--prod ' : ''}projects:add '${JSON.stringify(args)}'`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`Successfully migrated "${name}".`);
  } catch (error) {
    console.error(`Failed to migrate "${name}":`, error.message);
  }
}

console.log('Migration finished!');
