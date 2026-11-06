import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {requestPasswordReset,completePasswordReset,hashToken,buildResetUrl,RESET_TOKEN_TTL_MS} from '../src/services/passwordReset.js';
import {forgotPasswordSchema,resetPasswordSchema,changePasswordSchema} from '../src/validators/schemas.js';

/** Minimal in-memory stand-in for the Mongoose User model. findOne() returns a chainable, awaitable query like Mongoose does. */
function fakeUserModel(users){
  const matches=(u,q)=>{
    if(q.email!==undefined&&u.email!==q.email)return false;
    if(q.passwordResetTokenHash!==undefined){
      if(u.passwordResetTokenHash!==q.passwordResetTokenHash)return false;
      if(q.passwordResetExpires?.$gt&&!(u.passwordResetExpires>q.passwordResetExpires.$gt))return false;
    }
    return true;
  };
  return {
    findOne(q){
      const hit=users.find(u=>matches(u,q));
      let doc=null;
      if(hit){
        doc=Object.create(hit);
        doc.save=async()=>{for(const k of Object.keys(doc))if(k!=='save')hit[k]=doc[k];return doc;};
      }
      const query={select:()=>query,then:(res,rej)=>Promise.resolve(doc).then(res,rej)};
      return query;
    },
  };
}
const makeUser=(over={})=>({name:'Ayesha Khan',email:'ayesha@example.com',active:true,passwordHash:'old',...over});

test('requestPasswordReset stores only a hash, sets a 30-minute expiry and emails a link',async()=>{
  const u=makeUser(),mails=[],now=1_700_000_000_000;
  const res=await requestPasswordReset({User:fakeUserModel([u]),sendMail:async m=>mails.push(m),email:' Ayesha@Example.com ',clientUrl:'http://localhost:5173',now});
  assert.equal(res.sent,true);
  assert.equal(mails.length,1);
  const token=new URL(mails[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  assert.match(token,/^[0-9a-f]{64}$/);
  assert.equal(u.passwordResetTokenHash,hashToken(token));
  assert.notEqual(u.passwordResetTokenHash,token,'raw token must never be stored');
  assert.equal(u.passwordResetExpires.getTime(),now+RESET_TOKEN_TTL_MS);
});

test('requestPasswordReset silently does nothing for unknown or disabled accounts',async()=>{
  const mails=[];
  const a=await requestPasswordReset({User:fakeUserModel([makeUser()]),sendMail:async m=>mails.push(m),email:'nobody@example.com'});
  const b=await requestPasswordReset({User:fakeUserModel([makeUser({active:false})]),sendMail:async m=>mails.push(m),email:'ayesha@example.com'});
  assert.deepEqual([a.sent,b.sent],[false,false]);
  assert.equal(mails.length,0);
});

test('completePasswordReset sets the new password, burns the token and records the change time',async()=>{
  const u=makeUser(),mails=[],now=1_700_000_000_000;
  const User=fakeUserModel([u]);
  await requestPasswordReset({User,sendMail:async m=>mails.push(m),email:u.email,now});
  const token=new URL(mails[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

  assert.equal(await completePasswordReset({User,token,password:'a-brand-new-passphrase',now:now+60_000}),true);
  assert.equal(await bcrypt.compare('a-brand-new-passphrase',u.passwordHash),true);
  assert.equal(u.passwordResetTokenHash,undefined);
  assert.equal(u.passwordChangedAt.getTime(),now+60_000);
  assert.equal(await completePasswordReset({User,token,password:'another-passphrase-1',now:now+90_000}),false,'a used token must not work twice');
});

test('completePasswordReset rejects expired, wrong and empty tokens',async()=>{
  const u=makeUser(),mails=[],now=1_700_000_000_000;
  const User=fakeUserModel([u]);
  await requestPasswordReset({User,sendMail:async m=>mails.push(m),email:u.email,now});
  const token=new URL(mails[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  assert.equal(await completePasswordReset({User,token,password:'a-brand-new-passphrase',now:now+RESET_TOKEN_TTL_MS+1}),false,'expired');
  assert.equal(await completePasswordReset({User,token:'f'.repeat(64),password:'a-brand-new-passphrase',now}),false,'wrong token');
  assert.equal(await completePasswordReset({User,token:'',password:'a-brand-new-passphrase',now}),false,'empty token');
  assert.equal(u.passwordHash,'old','password untouched by failed attempts');
});

test('reset link uses the first configured client origin and encodes the token',()=>{
  assert.equal(buildResetUrl('https://stay.example.com/, http://localhost:5173','abc 123'),'https://stay.example.com/reset-password?token=abc%20123');
});

test('validation: email shape, password length and change-password rules',()=>{
  assert.equal(forgotPasswordSchema.safeParse({email:'nope'}).success,false);
  assert.equal(forgotPasswordSchema.safeParse({email:'a@b.co'}).success,true);
  assert.equal(resetPasswordSchema.safeParse({token:'x'.repeat(64),password:'short'}).success,false);
  assert.equal(resetPasswordSchema.safeParse({token:'x'.repeat(64),password:'long-enough-password'}).success,true);
  assert.equal(changePasswordSchema.safeParse({currentPassword:'same-password-1',newPassword:'same-password-1'}).success,false);
  assert.equal(changePasswordSchema.safeParse({currentPassword:'old-password-1',newPassword:'new-password-22'}).success,true);
});
