import {test} from "node:test";import assert from "node:assert/strict";
import {normalizePhone,formatPhone} from "../lib/phone.ts";
import {engagement,remaining,duration,relative,suggestion,type Temperature} from "../lib/engagement.ts";
import {expiresAt} from "../lib/quote.ts";

// Phone
test("BR mobile 11 digits → 55 prefix",()=>assert.equal(normalizePhone("(41) 99999-0000"),"5541999990000"));
test("BR landline 10 digits → 55 prefix",()=>assert.equal(normalizePhone("41 3333-0000"),"554133330000"));
test("already has DDI",()=>assert.equal(normalizePhone("+5541999990000"),"5541999990000"));
test("invalid short",()=>assert.equal(normalizePhone("123"),null));
test("format BR mobile",()=>assert.equal(formatPhone("5541999990000"),"+55 (41) 99999-0000"));

// Engagement scoring
test("no views → score 0 and not_opened",()=>{
  const e=engagement({views:[],now:new Date()});
  assert.equal(e.temperature,"not_opened" as Temperature);
  assert.equal(e.score,0);
  assert.equal(e.live,false);
});
test("one short view → cold",()=>{
  const now=new Date();
  const e=engagement({views:[{startedAt:new Date(now.getTime()-60000),lastSeenAt:new Date(now.getTime()-50000),activeMs:10000,maxScroll:20,sections:{}}],now});
  assert.equal(e.temperature,"cold" as Temperature);
  assert.ok(e.score>=20 && e.score<=50);
});
test("hot detection",()=>{
  const now=new Date();
  const e=engagement({
    views:[
      {startedAt:new Date(now.getTime()-300000),lastSeenAt:new Date(now.getTime()-5000),activeMs:200000,maxScroll:95,sections:{pagamento:25000,procedimentos:40000}},
      {startedAt:new Date(now.getTime()-86400000),lastSeenAt:new Date(now.getTime()-86000000),activeMs:30000,maxScroll:60,sections:{}},
    ],questions:1,now
  });
  assert.equal(e.temperature,"hot" as Temperature);
  assert.ok(e.score>=60);
  assert.equal(e.opens,2);
});
test("live when heartbeat recent",()=>{
  const now=new Date();
  const e=engagement({views:[{startedAt:now,lastSeenAt:new Date(now.getTime()-5000),activeMs:5000,maxScroll:10,sections:{}}],now});
  assert.equal(e.live,true);
});
test("won overrides everything",()=>{
  const e=engagement({acceptedAt:new Date(),views:[],now:new Date()});
  assert.equal(e.temperature,"won" as Temperature);
});
test("expired overrides opens",()=>{
  const now=new Date();
  const e=engagement({expiresAt:new Date(now.getTime()-1),views:[{startedAt:now,lastSeenAt:now,activeMs:100000,maxScroll:100,sections:{}}],now});
  assert.equal(e.temperature,"expired" as Temperature);
});

// Suggestion
test("live → suggest immediate contact",()=>{
  const now=new Date();
  const e=engagement({views:[{startedAt:now,lastSeenAt:new Date(now.getTime()-3000),activeMs:3000,maxScroll:10,sections:{}}],now});
  const s=suggestion(e,{now});
  assert.equal(s.urgency,"now");
  assert.equal(s.messageId,"agora");
});

// Helpers
test("remaining under 2 days",()=>{
  const now=new Date();
  assert.ok(remaining(new Date(now.getTime()+3*3600000),now)!.includes("h"));
});
test("remaining expired",()=>{
  assert.equal(remaining(new Date("2020-01-01"),new Date()),null);
});
test("duration formats",()=>{
  assert.equal(duration(30000),"30s");
  assert.equal(duration(125000),"2min 05s");
});
test("relative time",()=>{
  const now=new Date();
  assert.equal(relative(new Date(now.getTime()-5000),now),"agora");
  assert.equal(relative(new Date(now.getTime()-3600000),now),"há 1 h");
});

// expiresAt
test("expiresAt → end of day Brasília",()=>{
  const d=expiresAt("2025-03-15");
  assert.equal(d.toISOString(),"2025-03-16T02:59:59.000Z"); // 23:59:59 BRT = 02:59:59 UTC
});
