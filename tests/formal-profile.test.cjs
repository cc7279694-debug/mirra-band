const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {identity,configureManifest}=require('../scripts/build-profiles.cjs'); const {sourceFilter}=require('../scripts/source-profile.cjs');
const root=path.resolve(__dirname,'../src');const source=require('../src/manifest.json');
test('formal profile uses retained identity and integrates the two modes with minimum file capability',()=>{
 const p=identity('live');const m=configureManifest(source,'live');assert.equal(p.standalone,true);assert.equal(p.versionName,'0.5.0');assert.equal(p.versionCode,11);
 assert.equal(m.package,'com.guanyi.mirra');assert.equal(m.router.entry,'pages/Mode');
 assert.deepEqual(Object.keys(m.router.pages).sort(),['pages/Connection','pages/Control','pages/Detail','pages/Home','pages/LocalSession','pages/Mode']);
 assert.deepEqual(m.features.map(x=>x.name).sort(),['system.crypto','system.file','system.interconnect','system.router']);assert.equal(m.config.background,undefined);assert.equal(m.permissions,undefined);
 assert.equal(m.display.backgroundColor,'#FFFFFF');
});
test('formal whitelist admits only required engine/catalog pages and excludes experiment/probe apps and generated secrets',()=>{
 const live=sourceFilter(root,'live');
 for(const file of ['formal-app.ux','lib/formal-local-runtime.js','lib/catalog-protocol.js','lib/catalog-owner.js','lib/local-session.js','lib/local-ui-flow.js','platform/probe-storage.js','pages/LocalSession/index.ux','pages/Mode/index.ux','common/local-theme.css'])assert.equal(live(path.join(root,file)),true,file);
 for(const file of ['local-app.ux','click-probe-app.ux','probe-app.ux','pages/StorageProbe/index.ux','pages/ClickProbe/index.ux','lib/probe-controller.js','lib/local-unapproved.js','common/local-brand/logo-source.png','sign/live/private.pem'])assert.equal(live(path.join(root,file)),false,file);
 for(const mode of ['demo','local-session','probe','probe-upgrade','click-probe']){
  const include=sourceFilter(root,mode);for(const file of ['formal-app.ux','lib/formal-local-runtime.js','lib/catalog-protocol.js','lib/catalog-owner.js','pages/Mode/index.ux'])assert.equal(include(path.join(root,file)),false,mode+file);
 }
});
