import type {MetadataRoute} from "next";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",...(process.env.SEO_INDEXABLE==="true"?{allow:"/",disallow:["/api/"]}:{disallow:"/"})}};}
