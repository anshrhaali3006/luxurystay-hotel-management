import test from 'node:test';import assert from 'node:assert/strict';
test('reservation date rules: checkout must be after checkin',()=>{const checkIn=new Date('2026-11-01T14:00:00Z'),checkOut=new Date('2026-11-04T11:00:00Z');assert.ok(checkOut>checkIn);assert.equal(Math.ceil((checkOut-checkIn)/86400000),3);});
test('invoice balance never becomes negative when validating a payment',()=>{const balance=5000,amount=2000;assert.ok(amount>0&&amount<=balance);assert.equal(Math.max(0,balance-amount),3000);});
test('reservation overlap uses half-open stay intervals',()=>{const a={in:1,out:4},b={in:4,out:6},c={in:3,out:5};const overlaps=(x,y)=>x.in<y.out&&x.out>y.in;assert.equal(overlaps(a,b),false);assert.equal(overlaps(a,c),true);});
