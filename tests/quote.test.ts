import {test} from "node:test";import assert from "node:assert/strict";import {calculate,quoteSchema} from "../lib/quote.ts";
const base={items:[{description:"Implante",tooth:"",quantity:2,price:2500}],discount:10,entry:500,months:10,interest:0};
test("discount, entry and interest-free installments",()=>assert.deepEqual(calculate(base),{gross:5000,net:4500,entry:500,balance:4000,installment:400,total:4500}));
test("entry cannot exceed total",()=>assert.equal(calculate({...base,entry:99999}).balance,0));
test("Price interest formula",()=>assert.equal(calculate({...base,interest:2}).installment,445.31));
test("reject invalid quantity and excessive term",()=>assert.equal(quoteSchema.safeParse({...base,months:0}).success,false));
