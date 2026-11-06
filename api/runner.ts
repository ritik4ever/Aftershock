import { createRunnerProxy } from '../packages/core/src/runner-proxy.js';

const { AFTERSHOCK_GITHUB_TOKEN: token } = process.env;
const runner = createRunnerProxy(token ? { token } : undefined);
export default { fetch: runner };
