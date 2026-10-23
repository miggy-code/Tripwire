import type {NextConfig} from 'next';
// Preserve the loopback origin so Clerk same-origin rewrites stay internal.
const config:NextConfig={skipProxyUrlNormalize:true,output:process.env.TRIPWIRE_STANDALONE==='1'?'standalone':undefined,outputFileTracingIncludes:{'/*':['./profiles/*.json','./config/companies.json']},poweredByHeader:false,experimental:{cpus:2},async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}];}};
export default config;
