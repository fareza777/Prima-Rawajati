import { executePublishFlow } from '../lib/publish-flow.mjs';

if (typeof window !== 'undefined') window.PRIMA_PUBLISH_FLOW = { execute: executePublishFlow };
export { executePublishFlow };
