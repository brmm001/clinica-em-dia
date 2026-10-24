import AccountForm from '../account-form';import {ready,googleReady} from '@/lib/auth';
export const metadata={title:'Entrar',robots:{index:false,follow:true},alternates:{canonical:'/entrar'}};
export default function Page(){return <AccountForm register={false} enabled={ready()} google={googleReady()}/>}
