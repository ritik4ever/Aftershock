import { createUserTestHandler } from '../packages/core/src/user-test.js';

const handler = createUserTestHandler();
export default { fetch: handler };
