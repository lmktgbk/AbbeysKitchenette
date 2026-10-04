import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../src/modules/automation/automation.repository.js', () => ({ automationRepository: {} }));
vi.mock('../src/modules/reorderSuggestions/reorderSuggestions.service.js', () => ({ reorderSuggestionsService: {} }));
vi.mock('../src/modules/wasteReduction/wasteReduction.service.js', () => ({ wasteReductionService: {} }));
vi.mock('../src/modules/reports/dailyReport.service.js', () => ({ dailyReportService: {}, reportDay: () => '2026-10-02' }));
vi.mock('../src/modules/auditLogs/auditLog.service.js', () => ({ auditLogService: {} }));
vi.mock('../src/infrastructure/integrations/ml/mlClient.js', () => ({ fetchMl: vi.fn() }));
import { createAutomationScheduler, dueRuns } from '../src/modules/automation/automation.scheduler.js';
const schedule = { reorder: { enabled: true, frequency: 'daily', time: '08:00' } };
const now = new Date('2026-10-03T00:01:00Z');
function ledger(kind = 'reorder') {
  const runs = new Map(); let owner = 0, gate = false;
  const repository = {
    settings: vi.fn(async () => ({ now, automation: { [kind]: { enabled: true, frequency: 'daily', time: '08:00' } } })),
    async enqueue(list) { for (const run of list) if (!runs.has(run.runKey)) runs.set(run.runKey, { ...run, status: 'pending', attempts: 0 }); },
    refreshSubmitted: vi.fn(async () => {}),
    pauseDisabled: vi.fn(async () => {}),
    async claim() {
      if (gate) return null;
      const run = [...runs.values()].find(run => run.status === 'pending'); if (!run) return null;
      gate = true; run.status = 'running'; run.owner = ++owner; run.attempts++;
      return { ...run };
    },
    async owns(run) { const saved = runs.get(run.runKey); return saved.owner === run.owner && saved.status === 'running'; },
    async renew(run) { return this.owns(run); },
    async complete(run, { status = 'succeeded', result = null } = {}) {
      if (!await this.owns(run)) throw Error('stale');
      Object.assign(runs.get(run.runKey), { status, result });
    },
    async fail(run) {
      if (await this.owns(run)) runs.get(run.runKey).status = ['reorder', 'waste'].includes(run.kind) && run.attempts < 3 ? 'pending' : 'blocked';
    },
    async release() { gate = false; },
  };
  return { repository, runs };
}
const make = (repository, jobs, overrides = {}) => createAutomationScheduler({ repository, jobs, audit: { logAction: async () => {} }, timeoutMs: 100, ...overrides });
it('uses the Manila date and deduplicates same-day schedule edits', () => {
  expect(dueRuns(schedule, now)[0]).toMatchObject({ runKey: 'reorder:2026-10-03', scheduledAt: new Date('2026-10-03T00:00:00Z') });
  expect(dueRuns({ reorder: { ...schedule.reorder, time: '07:30' } }, now)[0].runKey).toBe('reorder:2026-10-03');
});
it('catches up a missed daily run, never a weekly run older than 24 hours', () => {
  expect(dueRuns(schedule, new Date('2026-10-02T23:59:00Z'))[0].runKey).toBe('reorder:2026-10-02');
  expect(dueRuns({ reorder: { ...schedule.reorder, frequency: 'weekly', day: 'monday' } }, now)).toEqual([]);
});
it('handles weekly day boundaries and ignores malformed or disabled schedules', () => {
  expect(dueRuns({ reorder: { ...schedule.reorder, frequency: 'weekly', day: 'saturday' } }, now)).toHaveLength(1);
  expect(dueRuns({ reorder: { ...schedule.reorder, time: '99:00' } }, now)).toEqual([]);
  expect(dueRuns({ reorder: { ...schedule.reorder, enabled: false } }, now)).toEqual([]);
});
it('two replicas execute one admitted run and restart does not repeat success', async () => {
  const { repository } = ledger(); const generate = vi.fn(async () => {});
  await Promise.all([make(repository, { reorder: generate }).tick(), make(repository, { reorder: generate }).tick()]);
  await make(repository, { reorder: generate }).tick();
  expect(generate).toHaveBeenCalledOnce();
});
it('retries advisory failures up to three attempts', async () => {
  const { repository, runs } = ledger(); const generate = vi.fn(async () => { throw Error('provider secret'); });
  const scheduler = make(repository, { reorder: generate });
  for (let i = 0; i < 4; i++) await scheduler.tick();
  expect(generate).toHaveBeenCalledTimes(3); expect([...runs.values()][0].status).toBe('blocked');
});
it('does not automatically repeat uncertain email sends', async () => {
  const { repository, runs } = ledger('dailyReport'); const send = vi.fn(async () => { throw Error('lost SMTP acknowledgement'); });
  const scheduler = make(repository, { dailyReport: send });
  await scheduler.tick(); await scheduler.tick();
  expect(send).toHaveBeenCalledOnce(); expect([...runs.values()][0].status).toBe('blocked');
});
it('records ML submission separately from completion with its external job ID', async () => {
  const { repository, runs } = ledger('forecast');
  await make(repository, { forecast: async () => ({ jobId: 12 }) }).tick();
  expect([...runs.values()][0]).toMatchObject({ status: 'submitted', result: { jobId: 12 } });
});
it('bounds stalled work and prevents its late transaction commit', async () => {
  const { repository, runs } = ledger(); let context;
  await make(repository, { reorder: async value => { context = value; await new Promise(() => {}); } }, { timeoutMs: 20 }).tick();
  expect([...runs.values()][0].status).toBe('pending');
  await expect(context.complete({})).rejects.toThrow('AUTOMATION_INTERRUPTED');
});
it('stops admission and interrupts a running job before another side effect', async () => {
  const { repository } = ledger(); let started, context;
  const entered = new Promise(resolve => { started = resolve; });
  const scheduler = make(repository, { reorder: value => {
    context = value; started();
    return new Promise((resolve, reject) => value.signal.addEventListener('abort', () => reject(Error('stop')), { once: true }));
  } });
  const work = scheduler.tick(); await entered; await scheduler.stop(); await work;
  await expect(context.assertOwned()).rejects.toThrow();
  await scheduler.tick(); expect(repository.settings).toHaveBeenCalledOnce();
});
it('does not admit work if a settings read finishes after shutdown', async () => {
  const { repository } = ledger(); let release;
  repository.settings.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const claim = vi.spyOn(repository, 'claim');
  const scheduler = make(repository, {}); const work = scheduler.tick(); const stop = scheduler.stop();
  release({ now, automation: schedule }); await Promise.all([work, stop]);
  expect(claim).not.toHaveBeenCalled();
});
