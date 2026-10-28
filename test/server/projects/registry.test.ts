import { expect, it, vi } from 'vitest';
import { MockAgtxGateway } from '../../../src/server/agtx/mock-gateway.js';
import { MockAgtxDirectory } from '../../../src/server/agtx/directory.js';
import { ProjectRegistry, ProjectNotFound } from '../../../src/server/projects/registry.js';
import { MockOrchestratorAdapter } from '../../../src/server/orchestrator/mock-adapter.js';
import { loadConfig } from '../../../src/server/config.js';
import { PROJECT_ID, PROJECT_B_ID } from '../../mock-agtx/fixtures.js';
function setup(fixed = false) {
 let now = 0;
 const gateway = new MockAgtxGateway();
 const directory = new MockAgtxDirectory([gateway.project,{ ...gateway.project, id: PROJECT_B_ID, name: 'other' }],() => gateway.getHealth());
 const config = loadConfig({ env: {}, readFile: () => JSON.stringify({ agtx: fixed ? { projectName: 'agent-helm' } : {} }) });
 const registry = new ProjectRegistry({ config, directory, now: () => now, gatewayFactory: () => gateway, orchestratorFactory: () => new MockOrchestratorAdapter() });
 return { directory, registry, advance: () => { now += 5001; } };
}
it('caches and single-flights the directory, reuses contexts and refreshes changed targets', async () => {
 const ctx = setup(); const list = vi.spyOn(ctx.directory,'listProjects');
 await Promise.all([ctx.registry.list(),ctx.registry.list()]); expect(list).toHaveBeenCalledTimes(1);
 const first = await ctx.registry.get(PROJECT_ID); expect(await ctx.registry.get(PROJECT_ID)).toBe(first);
 ctx.directory.projects = ctx.directory.projects.map(p => ({ ...p, name: p.name + '-new' })); ctx.advance();
 first.active++;
 await expect(ctx.registry.get(PROJECT_ID)).rejects.toMatchObject({ kind: 'conflict' });
 first.active--;
 expect(await ctx.registry.get(PROJECT_ID)).not.toBe(first);
});
it('rejects invalid, unknown and removed projects', async () => {
 const ctx = setup();
 await expect(ctx.registry.get('invalid')).rejects.toBeInstanceOf(ProjectNotFound);
 await ctx.registry.get(PROJECT_B_ID); ctx.directory.projects = []; ctx.advance();
 await expect(ctx.registry.get(PROJECT_B_ID)).rejects.toBeInstanceOf(ProjectNotFound);
});
it('filters fixed projects and rejects missing or ambiguous names', async () => {
 const ctx = setup(true); expect(await ctx.registry.list()).toHaveLength(1);
 await expect(ctx.registry.get(PROJECT_B_ID)).rejects.toBeInstanceOf(ProjectNotFound);
 ctx.directory.projects[1]!.name = 'agent-helm'; ctx.advance();
 await expect(ctx.registry.list()).rejects.toMatchObject({ kind: 'project_ambiguous' });
 ctx.directory.projects = []; ctx.advance();
 await expect(ctx.registry.list()).rejects.toMatchObject({ kind: 'project_not_found' });
});

it('bounds contexts at 32 and never evicts an active request', async () => {
 const ctx = setup();
 ctx.directory.projects = Array.from({ length: 34 },(_,i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`, name: `p${i}`, path: null }));
 const first = await ctx.registry.get(ctx.directory.projects[0]!.id); first.active++;
 for (const project of ctx.directory.projects.slice(1)) await ctx.registry.get(project.id);
 expect(await ctx.registry.get(first.project.id)).toBe(first);
 first.active--;
 const all = await Promise.all(ctx.directory.projects.slice(2).map(p => ctx.registry.get(p.id)));
 for (const c of all) c.active++;
 await expect(ctx.registry.get(ctx.directory.projects[1]!.id)).rejects.toMatchObject({ kind: 'conflict' });
});
