// @ts-ignore
import { createServer } from '../dist/server.cjs';

let appPromise: any = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createServer();
  }
  const app = await appPromise;
  return app(req, res);
}
