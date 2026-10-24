import type {MetadataRoute} from 'next';import {siteUrl,indexable} from '@/lib/site';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',...(indexable?{allow:'/',disallow:['/api/','/entrar','/cadastro']}:{disallow:'/'})},...(indexable?{sitemap:siteUrl+'/sitemap.xml'}:{})};}
