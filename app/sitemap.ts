import type {MetadataRoute} from "next";
export default function sitemap():MetadataRoute.Sitemap{const url=process.env.NEXT_PUBLIC_SITE_URL;return process.env.SEO_INDEXABLE==="true"&&url?[{url,changeFrequency:"monthly",priority:1}]:[];}
