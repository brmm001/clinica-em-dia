import type {MetadataRoute} from 'next';import {siteUrl,indexable} from '@/lib/site';
export default function sitemap():MetadataRoute.Sitemap{return indexable?['','/orcamento-odontologico','/como-fazer-orcamento-odontologico'].map(path=>({url:siteUrl+path,changeFrequency:'monthly',priority:path?0.8:1})):[];}
