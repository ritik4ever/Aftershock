import { createRunnerProxy } from '../packages/core/src/runner-proxy.js';

const {
  AFTERSHOCK_GITHUB_TOKEN: token,
  AFTERSHOCK_RUNNER_ACCESS_CODE: accessCode,
} = process.env;
const runner = createRunnerProxy(
  token && accessCode ? { token, accessCode } : undefined,
);
export default { fetch: runner };
