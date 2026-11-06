import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
  runReport,
  scenarioCatalogue,
  definitions,
} from '../packages/core/src/scenario.js';
import { checkEvidence } from '../packages/core/src/evidence-check.js';
import { replayPlan, compareRuns } from '../packages/core/src/replay.js';

// A small DOM test double exercises the shipped script, including asynchronous
// responses. It does not render CSS or substitute for visual browser QA.
class Element {
  children: Element[] = [];
  parent: Element | undefined;
  value = '';
  className = '';
  disabled = false;
  hidden = false;
  href = '';
  type = '';
  private text = '';
  private listeners = new Map<string, Array<() => unknown>>();
  classList = {
    add: (value: string) => {
      this.className += ` ${value}`;
    },
  };
  get textContent(): string {
    return this.text + this.children.map((el) => el.textContent).join(' ');
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  set innerHTML(_value: string) {
    throw new Error('Untrusted markup must use textContent');
  }
  get firstChild() {
    return this.children[0];
  }
  append(...children: Element[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children: Element[]) {
    this.text = '';
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
  setAttribute(_key: string, _value: string) {}
  scrollIntoView() {}
  addEventListener(event: string, callback: () => unknown) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }
  async trigger(event: string) {
    await Promise.all(
      (this.listeners.get(event) ?? []).map((callback) => callback()),
    );
  }
}

const source = await readFile('packages/core/src/viewer/app.js', 'utf8');
const html = await readFile('packages/core/src/viewer/index.html', 'utf8');
const report = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);

async function app(
  unavailableReports: Array<{ key: string; reason: string }> = [],
) {
  const elements = new Map(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [
      match[1]!,
      new Element(),
    ]),
  );
  const el = (id: string) => {
    const value = elements.get(id);
    assert.ok(value, id);
    return value;
  };
  const key = `local:${report.runId}`;
  let empty = false;
  let finishCompare: ((response: Response) => void) | undefined;
  const requests: string[] = [];
  const completion = runInNewContext(source, {
    document: { getElementById: el, createElement: () => new Element() },
    AbortSignal,
    matchMedia: () => ({ matches: true }),
    fetch: async (path: string, options: RequestInit) => {
      assert.equal(
        options.method,
        undefined,
        'viewer only issues default GET requests',
      );
      requests.push(path);
      const url = new URL(path, 'http://127.0.0.1');
      if (url.pathname === '/api/runs')
        return Response.json({
          runs: empty
            ? []
            : [
                {
                  key,
                  runId: report.runId,
                  title: report.definition.title,
                  scenarioId: report.scenarioId,
                  source: 'Saved local run',
                  result: report.result,
                  steps: report.steps.length,
                  complete: true,
                  startedAt: report.startedAt,
                },
              ],
          unavailable: unavailableReports.length,
          unavailableReports,
          limited: false,
        });
      if (url.pathname === '/api/scenarios')
        return Response.json({
          scenarios: scenarioCatalogue.map((scenario) => ({
            ...scenario,
            definition: definitions[scenario.id],
            command: `run ${scenario.id}`,
          })),
        });
      if (url.pathname === '/api/run')
        return Response.json({ report, checks: checkEvidence(report) });
      if (url.pathname === '/api/replay')
        return Response.json(replayPlan(report));
      if (url.pathname === '/api/compare')
        return new Promise<Response>((resolve) => {
          finishCompare = resolve;
        });
      throw new Error('Unexpected UI request');
    },
  });
  await completion;
  await setImmediate();
  return {
    el,
    key,
    requests,
    clear: () => {
      empty = true;
    },
    compare: () => {
      assert.ok(finishCompare);
      finishCompare(
        Response.json(
          compareRuns(report, {
            ...report,
            runId: '44444444-4444-4444-8444-444444444444',
          }),
        ),
      );
    },
  };
}

test('shipped viewer script loads real report data, filters, exports and replay guidance', async () => {
  const ui = await app();
  assert.equal(ui.el('stat-total').textContent, '1');
  assert.equal(
    ui.el('scenario-list').children.length,
    scenarioCatalogue.length,
  );
  assert.ok(ui.el('detail-content').textContent.includes(report.runId));
  assert.ok(
    ui
      .el('detail-content')
      .textContent.includes('Exact historical replay: unavailable'),
  );
  const descendants = (element: Element): Element[] => [
    element,
    ...element.children.flatMap(descendants),
  ];
  assert.ok(
    descendants(ui.el('detail-content')).some((element) =>
      element.href.endsWith('&format=md'),
    ),
  );
  ui.el('verdict').value = 'FAIL';
  await ui.el('verdict').trigger('change');
  assert.match(ui.el('run-list').textContent, /No matching runs/);
  ui.el('verdict').value = '';
  await ui.el('verdict').trigger('change');
  await ui.el('run-list').children[0]!.trigger('click');
  assert.ok(ui.el('detail-content').textContent.includes(report.runId));
  assert.ok(ui.requests.every((path) => path.startsWith('/api/')));
});

test('refreshing an empty listing clears a previously selected report', async () => {
  const ui = await app();
  ui.clear();
  await ui.el('refresh').trigger('click');
  assert.equal(ui.el('stat-total').textContent, '0');
  assert.match(ui.el('detail-content').textContent, /No available report/);
  assert.ok(!ui.el('detail-content').textContent.includes(report.runId));
  assert.equal(ui.el('refresh').disabled, false);
});

test('viewer explains unavailable reports with safe text while retaining usable runs', async () => {
  const key = 'local:11111111-1111-4111-8111-111111111111';
  const ui = await app([{ key, reason: 'FORMAT_OR_SCHEMA' }]);
  assert.equal(ui.el('notice').hidden, false);
  assert.match(ui.el('notice').textContent, /valid runs remain available/);
  assert.match(ui.el('notice').textContent, /Invalid or unsupported/);
  assert.ok(ui.el('notice').textContent.includes(key));
  assert.equal(ui.el('stat-total').textContent, '1');
  await ui.el('refresh').trigger('click');
  assert.equal(ui.el('notice').textContent.split(key).length - 1, 1);
});

test('changing comparison inputs discards a late response for the previous selection', async () => {
  const ui = await app();
  ui.el('compare-left').value = ui.key;
  ui.el('compare-right').value = 'sample:keyed';
  const pending = ui.el('compare-button').trigger('click');
  await setImmediate();
  ui.el('compare-right').value = '';
  await ui.el('compare-right').trigger('change');
  ui.compare();
  await pending;
  assert.equal(ui.el('compare-result').textContent, '');
  assert.equal(ui.el('compare-button').disabled, false);
});
