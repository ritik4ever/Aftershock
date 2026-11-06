import { createLiveHandler } from '../packages/core/src/live.js';

const live = createLiveHandler();
export default { fetch: live };
