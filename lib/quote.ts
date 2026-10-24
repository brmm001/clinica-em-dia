import { z } from "zod";
import { normalizePhone } from "./phone.ts";
const phone=z.string().max(30).default('').refine(v=>!v.trim()||normalizePhone(v)!==null,{message:'Telefone inválido'});
export const quoteSchema = z.object({clinic:z.string().trim().min(2).max(160),professional:z.string().max(160),cro:z.string().max(40),patient:z.string().trim().min(2).max(160),patientPhone:phone,clinicPhone:phone,validity:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().max(2000),items:z.array(z.object({description:z.string().trim().min(1).max(250),tooth:z.string().max(40),quantity:z.number().int().min(1).max(100),price:z.number().finite().min(0).max(1000000)})).min(1).max(50),discount:z.number().finite().min(0).max(100),entry:z.number().finite().min(0),months:z.number().int().min(1).max(36),interest:z.number().finite().min(0).max(20)});
export type Quote = z.infer<typeof quoteSchema>;
/** Validity date (YYYY-MM-DD) is inclusive: the link expires at the end of that day, Brasília time (no DST since 2019). */
export const expiresAt=(validity:string)=>new Date(`${validity}T23:59:59-03:00`);
export function calculate(q: Pick<Quote,"items"|"discount"|"entry"|"months"|"interest">){
 const gross=Math.round(q.items.reduce((s,i)=>s+Math.round(i.price*100)*i.quantity,0));
 const net=Math.round(gross*(1-q.discount/100)); const entry=Math.min(Math.round(q.entry*100),net); const balance=net-entry; const r=q.interest/100;
 const installment=balance===0?0:Math.round(r===0?balance/q.months:balance*r/(1-Math.pow(1+r,-q.months)));
 return {gross: gross/100,net:net/100,entry:entry/100,balance:balance/100,installment:installment/100,total:(entry+installment*q.months)/100};
}
export const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
