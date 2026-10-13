const test = require('node:test'); const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session'); const codec = require('../src/lib/local-codec');
const { createLocalOwner } = require('../src/lib/local-owner');
const time = {wallMs:1000,ownerId:'formal-owner',monotonicMs:null,monotonicVerified:false};
const book = {id:'real-book',title:'真实书籍'.repeat(25),startPage:12,firstActions:[{id:'phone-default',text:'阅读'.repeat(75)}]};
const context = {profile:'formal',catalog:[book],catalogRevision:'catalog-12345678-256'};
const action = {type:'START_CONFIRMED',bookId:book.id,firstActionId:'phone-default',confirmed:true,catalogRevision:context.catalogRevision};
test('formal start accepts the real catalog with full120/160 budgets and retains experimental defaults', () => {
  const next = domain.transition(domain.createDocument('formal-install'), action, time, context);
  assert.equal(next.active.bookSnapshot.title,book.title); assert.equal(next.active.firstActionSnapshot.text,book.firstActions[0].text);
  assert.equal(next.counter,1); assert.throws(()=>domain.validateDocument(next));
  assert.deepEqual(domain.validateDocument(next,context),next);
  assert.throws(()=>domain.transition(domain.createDocument('experiment'),action,time));
});
test('formal codec identity is separated while old experimental record bytes remain compatible', () => {
  const next=domain.transition(domain.createDocument('formal-install'),action,time,context);
  const raw=codec.encodeRecord(1,next,context); assert.equal(JSON.parse(raw).marker,'MIRRA_LOCAL_SESSION_V1');
  assert.equal(codec.decodeRecord(raw,context).status,'valid'); assert.equal(codec.decodeRecord(raw).status,'unknown');
  const old=codec.encodeRecord(1,domain.createDocument('experiment'));
  assert.equal(codec.decodeRecord(old).status,'valid'); assert.equal(codec.decodeRecord(old,context).status,'unknown');
});
test('changed or absent catalog revision rejects start before saving', () => {
  for(const revision of [undefined,'catalog-87654321-256']) {
    assert.throws(()=>domain.transition(domain.createDocument('formal-install'),Object.assign({},action,{catalogRevision:revision}),time,context));
  }
});
test('formal owner restores long self-contained history after directory removal and never rewrites it',async()=>{
  const slots=[null,null]; let writes=0; let books=[book]; let revision=context.catalogRevision;
  const make=()=>createLocalOwner({storageQualified:true,sessionContext:{profile:'formal'},catalogProvider:()=>books,
    catalogRevisionProvider:()=>revision,backendFactory:()=>({async read(i){return slots[i]},async write(i,raw){slots[i]=raw;writes++}}),
    clock:()=>time,installationIdFactory:()=> 'formal-install'});
  const owner=make(); await owner.open(); await owner.dispatch(action);
  assert.equal(owner.snapshot().document.state,'FOCUS'); const id=owner.snapshot().document.active.id;
  books=[]; revision='catalog-00000000-32'; await owner.dispatch({type:'FINISH',endPage:null});
  assert.equal(owner.snapshot().document.pending[0].bookSnapshot.title,book.title); owner.close();
  const restored=make(); const before=writes; await restored.open();
  assert.equal(restored.snapshot().document.pending[0].id,id); assert.equal(writes,before); restored.close();
});
