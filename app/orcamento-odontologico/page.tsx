import type {Metadata} from 'next';
import Editor from '../editor';import {ready,googleReady} from '@/lib/auth';
export const metadata:Metadata={title:'Gerador de orçamento odontológico grátis em PDF',alternates:{canonical:'/orcamento-odontologico'},description:'Crie um orçamento odontológico online com procedimentos, dentes, desconto, entrada e parcelas. Imprima ou salve em PDF sem cadastro.'};
export default function Page(){return <Editor accountsEnabled={ready()} googleEnabled={googleReady()}/>}
