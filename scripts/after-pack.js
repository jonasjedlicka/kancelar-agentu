/* Po sestavení .app: na macOS dá aplikaci jen „ad-hoc“ pečeť (codesign -s -).
 * Nejde o podpis vývojářským certifikátem – Apple Silicon ale bez jakékoli pečeti
 * upravenou aplikaci vůbec nespustí („je poškozená“). */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log('  • ad-hoc pečeť (bez certifikátu):', app);
};
