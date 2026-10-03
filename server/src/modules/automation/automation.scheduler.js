import { automationRepository } from './automation.repository.js';
import { reorderSuggestionsService } from '../reorderSuggestions/reorderSuggestions.service.js';
import { wasteReductionService } from '../wasteReduction/wasteReduction.service.js';
import { dailyReportService, reportDay } from '../reports/dailyReport.service.js';
import { auditLogService } from '../auditLogs/auditLog.service.js';
import { ACTIONS } from '../auditLogs/auditLog.constants.js';
import { toManilaDateString, manilaDayStart } from '../../config/time.js';
import { fetchMl } from '../../services/mlClient.js';

export const JOB_KINDS = ['forecast', 'reorder', 'waste', 'marketBasket', 'dailyReport'];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 86400000;
/** Catch up only the latest occurrence within 24 hours; never flood a restarted server. */
export function dueRuns(automation, now) {
  const today = toManilaDateString(now);
  const start = manilaDayStart(today);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return JOB_KINDS.flatMap(kind => {
    const job = automation?.[kind];
    if (!job?.enabled || !['daily', 'weekly'].includes(job.frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)) return [];
    const [hour, minute] = job.time.split(':').map(Number);
    let offset = 0;
    if (job.frequency === 'weekly') {
      const target = weekdays.indexOf(job.day);
      if (target < 0) return [];
      offset = (weekday - target + 7) % 7;
    }
    let scheduledAt = new Date(start.getTime() + (hour * 60 + minute) * 60000 - offset * DAY_MS);
    if (scheduledAt > now) scheduledAt = new Date(scheduledAt.getTime() - (job.frequency === 'daily' ? DAY_MS : 7 * DAY_MS));
    if (now - scheduledAt > DAY_MS) return [];
    // A same-day schedule edit cannot create a second run for the same job.
    return [{ runKey: `${kind}:${toManilaDateString(scheduledAt)}`, kind, scheduledAt }];
  });
}

async function submitMl(path, context) {
  await context.assertOwned();
  const response = await fetchMl(path, { method: 'POST', signal: context.signal });
  if (!response.ok) throw new Error('ML_SUBMISSION_FAILED');
  const data = await response.json();
  if (!Number.isInteger(data.job_id) || data.job_id < 1) throw new Error('ML_SUBMISSION_INVALID');
  return { jobId: data.job_id };
}
const runners = {
  forecast: context => submitMl('/forecast/demand/run', context),
  marketBasket: context => submitMl('/mba/analyze', context),
  reorder: context => reorderSuggestionsService.generate({ automation: context, signal: context.signal }),
  waste: context => wasteReductionService.generate({ automation: context, signal: context.signal }),
  dailyReport: context => dailyReportService.sendDailyReport(reportDay(context.run.scheduledAt), { assertOwned: context.assertOwned }),
};
const audits = { forecast: ACTIONS.FORECAST_RUN, marketBasket: ACTIONS.MBA_RUN, reorder: ACTIONS.REORDER_RUN, waste: ACTIONS.WASTE_RUN };

export function createAutomationScheduler({ repository = automationRepository, jobs = runners, intervalMs = 15000, timeoutMs = 240000, audit = auditLogService } = {}) {
  let stopped = false, flight = null, timer, controller;
  const api = {
    async tick() {
      if (stopped) return;
      if (flight) return flight;
      flight = (async () => {
        const settings = await repository.settings();
        if (stopped) return;
        if (settings) {
          await repository.pauseDisabled(settings.automation);
          await repository.enqueue(dueRuns(settings.automation, settings.now));
        }
        await repository.refreshSubmitted();
        if (stopped) return;
        const run = await repository.claim();
        if (!run) return;
        const runController = new AbortController();
        controller = runController;
        if (stopped) runController.abort();
        let deadline, heartbeat, renewal = null, committed = false;
        const context = {
          run, signal: runController.signal,
          async assertOwned() {
            if (runController.signal.aborted || !await repository.owns(run)) throw new Error('AUTOMATION_LEASE_LOST');
          },
          async complete(tx) {
            if (runController.signal.aborted) throw new Error('AUTOMATION_INTERRUPTED');
            await repository.complete(run, {}, tx);
            committed = true;
          },
        };
        try {
          heartbeat = setInterval(() => {
            if (renewal) return;
            renewal = repository.renew(run).then(owned => { if (!owned) runController.abort(); }, () => runController.abort())
              .finally(() => { renewal = null; });
          }, 30000);
          heartbeat.unref?.();
          const operation = (async () => {
            await context.assertOwned();
            const result = await jobs[run.kind](context);
            if (runController.signal.aborted) throw new Error('AUTOMATION_INTERRUPTED');
            if (!committed) await repository.complete(run, {
              status: ['forecast', 'marketBasket'].includes(run.kind) ? 'submitted' : 'succeeded',
              result: ['forecast', 'marketBasket'].includes(run.kind) ? result : null,
            });
            if (audits[run.kind]) await audit.logAction({ action: audits[run.kind], targetType: 'automation', details: { source: 'scheduled', runKey: run.runKey } }).catch(() => {});
          })();
          await Promise.race([operation, new Promise((resolve, reject) => {
            deadline = setTimeout(() => { runController.abort(); reject(new Error('AUTOMATION_DEADLINE')); }, timeoutMs);
          })]);
        } catch {
          // The repository decides whether retry is safe; raw provider errors stay out of logs.
          await repository.fail(run);
          console.warn(`[automation] Run deferred or blocked: ${run.kind}`);
        } finally {
          clearTimeout(deadline); clearInterval(heartbeat);
          await renewal;
          await repository.release(run);
          controller = null;
        }
      })().finally(() => { flight = null; });
      return flight;
    },
    async reschedule() {
      if (stopped) return;
      clearTimeout(timer);
      try { await api.tick(); }
      catch { console.warn('[automation] Durable scheduler unavailable; no unsaved job started'); }
      clearTimeout(timer);
      if (!stopped) { timer = setTimeout(() => { void api.reschedule(); }, intervalMs); timer.unref?.(); }
    },
    async stop() {
      stopped = true; clearTimeout(timer); controller?.abort();
      await flight?.catch(() => {});
    },
  };
  return api;
}
export const automationScheduler = createAutomationScheduler();
