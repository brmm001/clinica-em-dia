import { getAuth,ready } from "@/lib/auth";
export const runtime="nodejs";
async function handler(req:Request){if(!ready())return Response.json({message:"O cadastro estará disponível em breve. Você já pode criar e imprimir seu orçamento."},{status:503});return getAuth().handler(req);}
export {handler as GET,handler as POST};
