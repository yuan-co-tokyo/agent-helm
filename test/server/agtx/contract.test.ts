import { gatewayContract } from './gateway.contract.js';
import { HttpAgtxGateway } from '../../../src/server/agtx/http-gateway.js';
import { MockAgtxGateway } from '../../../src/server/agtx/mock-gateway.js';
import { detailSchema } from '../../../src/server/agtx/schemas.js';
import { startMockAgtx } from '../../mock-agtx/server.js';
import { taskFixture, TASK_ID } from '../../mock-agtx/fixtures.js';
gatewayContract('HTTP',async () => {
 const mock = await startMockAgtx();
 return { gateway: new HttpAgtxGateway({ baseUrl: mock.url, projectName: 'agent-helm', timeoutMs: 500 }), close: mock.close };
});
gatewayContract('in-memory',async () => {
 const gateway = new MockAgtxGateway();
 gateway.setTasks([detailSchema.parse(taskFixture)]); gateway.setPane(TASK_ID,'Hello');
 return { gateway, close: async () => {} };
});
