// Prepares an official Vela profile without touching the user's SDK or phone.
// Native runtime verification is currently blocked; see status and the evidence report.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const sdkHome = path.join(project, '.local', 'vela-sdk');
const vvdHome = path.join(project, '.local', 'vela-vvd');
const imageHome = path.join(sdkHome, 'system-images', 'vela-pre-4.0');
const emulatorBin = path.join(sdkHome, 'emulator', 'windows-x86_64', 'emulator.exe');
const name = 'Vela_Mirra_Band_336x480';

function manager() {
  if (process.platform !== 'win32') throw new Error('This local preparation profile requires Windows x64.');
  for (const file of [emulatorBin, path.join(imageHome, 'nuttx')]) {
    if (!fs.existsSync(file)) throw new Error(`Required official local resource is missing: ${file}`);
  }
  const { VvdManager, IVvdArchType, VelaImageType } = require('@aiot-toolkit/emulator');
  const instance = new VvdManager({ sdkHome, vvdHome });
  if (!fs.existsSync(path.join(vvdHome, `${name}.ini`))) {
    instance.createVvd({
      name, arch: IVvdArchType.arm, width: '336', height: '480', density: '320',
      shape: 'rect', flavor: 'band', customLcdRadius: '24',
      imageType: VelaImageType.PRE, imageDir: imageHome,
    });
  }
  return instance;
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === 'prepare') {
    const instance = manager();
    // This official call prepares only the explicitly configured local VVD images.
    await instance.getVvdStartCmd({ vvdName: name, grpcPort: 8558, debugPort: 10058 });
    console.log(JSON.stringify(instance.getVvdInfo(name), null, 2));
    return;
  }
  if (command === 'status') {
    const ini = path.join(vvdHome, `${name}.vvd`, 'config.ini');
    console.log(JSON.stringify({
      profilePrepared: fs.existsSync(ini),
      profile: { width: 336, height: 480, density: 320, image: 'vela-pre-4.0/20250225' },
      sdkHome, vvdHome,
      nativeRuntime: 'Blocked before application loading',
      screenshots: 'Not Run', interaction: 'Not Run',
      evidence: 'docs/evidence/module-02/emulator-report.json',
      reason: 'Windows Vela VVD lookup does not honor tested local Android directory overrides; the official out-of-tree route exits with 0xC0000005.',
    }, null, 2));
    return;
  }
  throw new Error('Usage: node scripts/emulator-local.cjs prepare|status. Native run commands are unavailable until the documented Windows isolation blocker is resolved.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
