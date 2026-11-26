import { describe, expect, it } from 'bun:test';
import { TimeLogsApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('TimeLogsApi', () => {
  it('getTimeLogs GETs /cards/{id}/time-logs', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new TimeLogsApi(makeClient(fetchImpl));
    await api.getTimeLogs(5);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/time-logs');
  });

  it('addTimeLog POSTs time_spent/for_date/role_id (snake_case)', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new TimeLogsApi(makeClient(fetchImpl));
    await api.addTimeLog(5, 30, '2026-07-20', 7);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/time-logs');
    expect(calls[0]!.body).toEqual({ time_spent: 30, for_date: '2026-07-20', role_id: 7 });
  });

  it('addTimeLog includes comment when given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new TimeLogsApi(makeClient(fetchImpl));
    await api.addTimeLog(5, 30, '2026-07-20', 7, 'debugging');
    expect(calls[0]!.body).toEqual({ time_spent: 30, for_date: '2026-07-20', role_id: 7, comment: 'debugging' });
  });

  it('addTimeLog omits comment when not given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new TimeLogsApi(makeClient(fetchImpl));
    await api.addTimeLog(5, 30, '2026-07-20', 7);
    expect(calls[0]!.body).not.toHaveProperty('comment');
  });
});
