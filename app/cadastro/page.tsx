import AccountForm from '../account-form';import {ready,googleReady} from '@/lib/auth';
export const metadata={title:'Criar conta',robots:{index:false,follow:true},alternates:{canonical:'/cadastro'}};
export default function Page(){return <AccountForm register={true} enabled={ready()} google={googleReady()}/>}
