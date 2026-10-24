import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
export const ready=()=>Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth(){if(!ready()) throw new Error("Serviço de contas indisponível"); return instance??=createAuth();}
function createAuth(){return betterAuth({database:new Pool({connectionString:process.env.DATABASE_URL,max:3}),secret:process.env.BETTER_AUTH_SECRET,baseURL:process.env.BETTER_AUTH_URL,emailAndPassword:{enabled:true,minPasswordLength:12},rateLimit:{enabled:true,storage:"database",window:60,max:20},plugins:[nextCookies()]});}
