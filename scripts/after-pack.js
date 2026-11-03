/* Po sestavení .app (macOS):
 * 1) zkontroluje, že pomocné procesy (Helper) se jmenují stejně jako hlavní spustitelný soubor –
 *    jinak je Electron při startu nenajde a aplikace hned spadne („trace trap“);
 * 2) na macOS dá aplikaci jen „ad-hoc“ pečeť (codesign -s -). Nejde o podpis vývojářským
 *    certifikátem – Apple Silicon ale bez jakékoli pečeti upravenou aplikaci nespustí. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const name = context.packager.appInfo.productFilename;
  const app = path.join(context.appOutDir, `${name}.app`);
  const plist = fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8');
  const exe = (plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
  if (!fs.existsSync(path.join(app, 'Contents', 'MacOS', exe || ''))) {
    throw new Error(`Hlavní spustitelný soubor „${exe}“ v aplikaci chybí.`);
  }
  for (const suffix of ['', ' (GPU)', ' (Renderer)', ' (Plugin)']) {
    const helper = path.join(app, 'Contents', 'Frameworks', `${exe} Helper${suffix}.app`, 'Contents', 'MacOS', `${exe} Helper${suffix}`);
    if (!fs.existsSync(helper)) throw new Error(`Chybí pomocný proces: ${helper}`);
  }
  console.log('  • kontrola názvů pomocných procesů: v pořádku');
  if (process.platform !== 'darwin') return;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log('  • ad-hoc pečeť (bez certifikátu):', app);
};
