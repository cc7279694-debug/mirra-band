const test=require('node:test'); const assert=require('node:assert/strict');
let factory; try { factory=require('../src/lib/formal-local-runtime').createFormalLocalRuntime; } catch(e) { if(e.code!=='MODULE_NOT_FOUND')throw e; }
const catalogLib=require('../src/lib/catalog-protocol');
function rig(files=new Map()) {
  assert.equal(typeof factory,'function','formal runtime is not implemented'); const calls=[]; let mode='LOCAL',phone=null;
  const runtime=factory({getMode:()=>mode,phoneSnapshot:()=>phone,loadModule(name){assert.equal(name,'@system.file');return {
    readText(q){calls.push({kind:'read',uri:q.uri});files.has(q.uri)?q.success({text:files.get(q.uri)}):q.fail('',301)},
    writeText(q){calls.push({kind:'write',uri:q.uri});files.set(q.uri,q.text);q.success()}
  }},clock:()=>({wallMs:1000,ownerId:'runtime-owner',monotonicMs:null,monotonicVerified:false}),installationIdFactory:()=> 'runtime-install'});
  return{runtime,files,calls,mode(v){mode=v},phone(v){phone=v}};
}
const catalog={schemaVersion:1,books:[{id:'other',title:'其他真实书籍',totalPages:100,currentPage:2,firstAction:null,isMainline:false},
  {id:'main',title:'主线真实书籍',totalPages:200,currentPage:12,firstAction:'翻到第12页，读第一段。',isMainline:true}]};
async function save(r,value=catalog){const canonical=catalogLib.canonicalCatalog(value);return r.runtime.catalogOwner.save({catalog:value,canonical,revision:catalogLib.revisionFor(canonical)})}
async function opened(r){await r.runtime.owner.open();await r.runtime.catalogOwner.open();}
function start(r){const b=r.runtime.getBooks()[0];return r.runtime.owner.dispatch({type:'START_CONFIRMED',bookId:b.id,firstActionId:b.firstActions[0].id,confirmed:true,catalogRevision:r.runtime.catalogOwner.snapshot().revision})}
test('formal storage namespaces are isolated and no directory never falls back to test books',async()=>{
 const r=rig();try{await opened(r);assert.deepEqual(r.runtime.getBooks(),[]);await save(r);assert.equal(r.runtime.getBooks()[0].id,'main');
 await start(r);assert.equal(r.runtime.owner.snapshot().document.active.bookSnapshot.id,'main');
 assert.ok(r.calls.every(q=>/^internal:\/\/files\/mirra_(?:catalog_live|local_sessions_live)_[ab]\.json$/.test(q.uri)));
 assert.ok([...r.files.keys()].some(q=>q.includes('catalog_live')));assert.ok([...r.files.keys()].some(q=>q.includes('local_sessions_live')));
 }finally{r.runtime.close()}
});
test('phone default action remains content only; fallback action still requires actual user confirmation',async()=>{
 const r=rig();try{await opened(r);await save(r);const books=r.runtime.getBooks();assert.equal(books[0].firstActions[0].text,catalog.books[1].firstAction);
 assert.equal(books[1].firstActions[0].id,'preset-read');const before=r.calls.length;
 const b=books[1];await r.runtime.owner.dispatch({type:'START_CONFIRMED',bookId:b.id,firstActionId:b.firstActions[0].id,confirmed:false,catalogRevision:r.runtime.catalogOwner.snapshot().revision});
 assert.equal(r.runtime.owner.snapshot().document,null);assert.equal(r.calls.length,before);
 }finally{r.runtime.close()}
});
test('directory replacement never changes active snapshots or removes completed pending and legal local page is only pending',async()=>{
 const r=rig();try{await opened(r);await save(r);await start(r);const active=r.runtime.owner.snapshot().document.active;
 const renamed=JSON.parse(JSON.stringify(catalog));renamed.books[1].title='手机重新命名';renamed.books[1].firstAction='打开下一页。';await save(r,renamed);
 assert.deepEqual(r.runtime.owner.snapshot().document.active,active);await r.runtime.owner.dispatch({type:'FINISH',endPage:20});
 const pending=r.runtime.owner.snapshot().document.pending;const books=r.runtime.getBooks();assert.equal(books[0].startPage,20);assert.equal(books[0].pendingPage,20);assert.equal(books[0].currentPage,12);
 await save(r,{schemaVersion:1,books:[]});assert.deepEqual(r.runtime.owner.snapshot().document.pending,pending);assert.deepEqual(r.runtime.getBooks(),[]);
 }finally{r.runtime.close()}
});
test('offline reconstruction retains directory and same self-contained Session with no migration or creation writes',async()=>{
 const r=rig();await opened(r);await save(r);await start(r);const active=r.runtime.owner.snapshot().document.active;r.runtime.close();
 const next=rig(r.files);try{await opened(next);assert.equal(next.runtime.getBooks()[0].id,'main');assert.deepEqual(next.runtime.owner.snapshot().document.active,active);
 assert.equal(next.calls.filter(q=>q.kind==='write').length,0)}finally{next.runtime.close()}
});
for(const phone of [{freshness:'fresh',body:{phase:'ACTIVE'}},{freshness:'updating',body:{phase:'PREPARING'}},{freshness:'fresh',body:{phase:'SAVING'}},{control:{busy:true}},{control:{resultCode:'RESULT_UNKNOWN'}}])test('phone ownership ambiguity blocks fresh local start without IO '+JSON.stringify(phone),async()=>{
 const r=rig();try{await opened(r);await save(r);r.phone(phone);const before=r.calls.length;await start(r);assert.equal(r.runtime.owner.snapshot().document,null);assert.equal(r.calls.length,before)}finally{r.runtime.close()}
});
test('PHONE mode cannot start local; disconnected old phone state does not manufacture current phone idle proof',async()=>{
 const r=rig();try{await opened(r);await save(r);r.mode('PHONE');await start(r);assert.equal(r.runtime.owner.snapshot().document,null);
 r.mode('LOCAL');r.phone({freshness:'expired',body:{phase:'ACTIVE'},control:{busy:false,resultCode:null}});await start(r);assert.equal(r.runtime.owner.snapshot().document.state,'FOCUS');
 }finally{r.runtime.close()}
});
