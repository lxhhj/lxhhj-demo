// Cloudflare Worker:HTTPS 反代 58.48.54.130:41017 的全部服务
// 规则:https://<你的worker域名>/<任意路径>?<查询串>  →  http://58.48.54.130:41017/<任意路径>?<查询串>
// 例:https://xxx.workers.dev/modelView/gc.glb → http://58.48.54.130:41017/modelView/gc.glb
// 解决 GitHub Pages(HTTPS)对 HTTP 源站的混合内容拦截;顺带补全 CORS 头。
const ORIGIN = 'http://58.48.54.130:41017';

export default {
    async fetch(request) {
        const url = new URL(request.url);

        // 预检请求直接应答,不回源
        if (request.method === 'OPTIONS') {
            return new Response(null, {status: 204, headers: corsHeaders()});
        }

        // 透传(method/headers/body 原样保留)
        const upstream = await fetch(ORIGIN + url.pathname + url.search, {
            method: request.method,
            headers: request.headers,
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
            redirect: 'follow',
        });

        const headers = new Headers(upstream.headers);
        for (const [k, v] of Object.entries(corsHeaders())) {
            headers.set(k, v);
        }
        return new Response(upstream.body, {status: upstream.status, headers});
    },
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
    };
}
