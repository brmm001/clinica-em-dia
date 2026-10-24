import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Orçamento odontológico grátis em PDF | Clínica em Dia",description:"Monte um orçamento odontológico com procedimentos, entrada e parcelas. Visualize e imprima em PDF gratuitamente.",robots:{index:process.env.SEO_INDEXABLE==="true",follow:process.env.SEO_INDEXABLE==="true"}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
