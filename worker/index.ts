import {handlePublicSiteRequest, type Env} from './routes/sites';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/sites/')) {
      const rest = url.pathname.slice('/sites/'.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx === -1) {
        return Response.redirect(`${url.origin}/sites/${rest}/`, 301);
      }
      const slug = rest.slice(0, slashIdx);
      const subPath = rest.slice(slashIdx + 1);
      return handlePublicSiteRequest(request, env, slug, subPath);
    }

    if (url.pathname === '/api/health') {
      return Response.json({status: 'ok', runtime: 'cloudflare-worker'});
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', {status: 404});
  },
};
