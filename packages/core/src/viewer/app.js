const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (cls) el.className = cls;
  return el;
};
const badge = (text) =>
  node('span', text, `badge ${String(text).toLowerCase()}`);
const pretty = (value) => node('pre', JSON.stringify(value, null, 2), 'data');
const date = (value) => new Date(value).toLocaleString();
let runs = [],
  selected = '',
  selection = 0,
  refresh = 0,
  comparison = 0;
function resource(path) {
  if (!globalThis.aftershockStatic) return path;
  const url = new URL(path, 'http://localhost');
  url.searchParams.sort();
  if (url.origin === 'http://localhost' && url.pathname === '/api/live')
    return url.pathname + url.search;
  const file = globalThis.aftershockStatic[url.pathname + url.search];
  if (!file) throw new Error('Unavailable in this published snapshot');
  return file;
}
async function request(path, options = {}) {
  const response = await fetch(resource(path), {
    signal: AbortSignal.timeout(path.startsWith('/api/live') ? 16000 : 10000),
    credentials: 'omit',
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw Object.assign(new Error(data.error || 'Request unavailable'), {
      status: response.status,
    });
  return data;
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
function details(label, value) {
  const el = node('details');
  el.append(node('summary', label), pretty(value));
  return el;
}
function panel(title) {
  const el = node('article', undefined, 'panel');
  el.append(node('h3', title));
  return el;
}
function keyValues(values) {
  const dl = node('dl', undefined, 'kv');
  for (const [key, value] of Object.entries(values))
    dl.append(node('dt', key), node('dd', value));
  return dl;
}
function list(values) {
  const ul = node('ul');
  for (const value of values) ul.append(node('li', value));
  return ul;
}
async function loadScenarios() {
  const target = $('scenario-list');
  $('refresh-scenarios').disabled = true;
  target.replaceChildren(node('p', 'Loading scenarios...', 'muted'));
  try {
    const data = await request('/api/scenarios');
    target.replaceChildren();
    for (const scenario of data.scenarios) {
      const card = panel(scenario.title);
      card.append(
        node('p', scenario.definition.expectedInvariant),
        details('Implemented checks', scenario.implemented),
        details('Prerequisites', scenario.definition.preconditions),
        details('Coverage limits', scenario.blocked),
        details('Source rule', {
          commit: scenario.definition.sourceCommit,
          rule: scenario.definition.sourceRule,
        }),
        node('p', 'Run manually in your terminal:', 'muted'),
        node('pre', scenario.command, 'data'),
      );
      target.append(card);
    }
  } catch (error) {
    target.replaceChildren(
      node('p', `Could not load scenarios: ${error.message}`, 'error-text'),
    );
  } finally {
    $('refresh-scenarios').disabled = false;
  }
}
function renderRuns() {
  const search = $('search').value.toLowerCase().trim(),
    verdict = $('verdict').value,
    source = $('source').value;
  const filtered = runs.filter(
    (r) =>
      (!verdict || r.result === verdict) &&
      (!source || r.source === source) &&
      `${r.title} ${r.scenarioId} ${r.runId}`.toLowerCase().includes(search),
  );
  $('run-count').textContent =
    `${filtered.length} of ${runs.length} unique recorded runs. These are genuine earlier executions, not new tests triggered by this page.`;
  const target = $('run-list');
  target.replaceChildren();
  if (!filtered.length) {
    target.append(
      node(
        'div',
        'No matching runs. Change the filters or create a run with the CLI.',
        'empty',
      ),
    );
    return;
  }
  for (const run of filtered) {
    const button = node(
      'button',
      undefined,
      `run-row${selected === run.key ? ' selected' : ''}`,
    );
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected === run.key));
    const left = node('span');
    left.append(node('span', run.title, 'run-name'));
    const meta = node('span', undefined, 'run-meta');
    for (const text of [
      run.source,
      run.runId.slice(0, 8),
      date(run.startedAt),
      `${run.steps} actions`,
      run.complete
        ? 'Recorded journal complete'
        : 'Journal incomplete / absent',
    ])
      meta.append(node('span', text));
    left.append(meta);
    const right = node('span', undefined, 'run-right');
    right.append(badge(run.result), node('span', '\u2192', 'run-arrow'));
    button.append(left, right);
    button.addEventListener('click', () => selectRun(run.key, true));
    target.append(button);
  }
}
async function loadRuns() {
  const ticket = ++refresh;
  $('refresh').disabled = true;
  notice('');
  try {
    const data = await request('/api/runs');
    if (ticket !== refresh) return;
    runs = data.runs;
    comparison += 1;
    $('compare-result').replaceChildren();
    $('stat-total').textContent = String(runs.length);
    $('stat-pass').textContent = String(
      runs.filter((r) => r.result === 'PASS').length,
    );
    $('stat-fail').textContent = String(
      runs.filter((r) => r.result === 'FAIL').length,
    );
    $('stat-evidence').textContent = String(
      runs.filter((r) => r.complete).length,
    );
    if (data.unavailable || data.limited) {
      notice(
        `${data.unavailable} reports/examples could not be loaded; valid runs remain available.${data.limited ? ' Local listing is limited to 100 report files.' : ''}`,
      );
      if (data.unavailableReports?.length) {
        const reasons = {
          FORMAT_OR_SCHEMA:
            'Invalid or unsupported report format/action validation',
          MISSING: 'File missing',
          UNREADABLE_OR_INTEGRITY:
            'Unreadable, unsafe or integrity check failed',
        };
        const detail = node('details');
        detail.append(
          node('summary', 'Show unavailable report IDs'),
          node(
            'p',
            'Original files are retained. Older formats are not silently upgraded; rerun the current CLI for new evidence.',
          ),
          list(
            data.unavailableReports.map(
              (item) => `${item.key}: ${reasons[item.reason] || 'Unavailable'}`,
            ),
          ),
        );
        $('notice').append(detail);
      }
    }
    for (const id of ['compare-left', 'compare-right']) {
      const select = $(id),
        previous = select.value;
      select.replaceChildren(
        node(
          'option',
          id === 'compare-left' ? 'Choose baseline...' : 'Choose rerun...',
        ),
      );
      select.firstChild.value = '';
      for (const run of runs) {
        const option = node(
          'option',
          `${run.scenarioId} / ${run.result} / ${run.runId.slice(0, 8)} / ${run.source}`,
        );
        option.value = run.key;
        select.append(option);
      }
      if (runs.some((r) => r.key === previous)) select.value = previous;
    }
    renderRuns();
    if (selected && runs.some((r) => r.key === selected))
      await selectRun(selected, false);
    else if (runs.length) await selectRun(runs[0].key, false);
    else {
      selected = '';
      selection += 1;
      $('detail-content').replaceChildren(
        node(
          'div',
          'No available report. Create a run with the CLI, then refresh.',
          'empty',
        ),
      );
    }
  } catch (error) {
    notice(
      `Could not refresh runs: ${error.message}. Previously loaded data, if any, may be stale.`,
    );
  } finally {
    if (ticket === refresh) $('refresh').disabled = false;
  }
}
async function selectRun(key, scroll) {
  selected = key;
  const ticket = ++selection;
  renderRuns();
  const content = $('detail-content');
  content.replaceChildren(node('div', 'Loading report...', 'empty'));
  try {
    const [reportResult, replayResult] = await Promise.allSettled([
      request(`/api/run?key=${encodeURIComponent(key)}`),
      request(`/api/replay?key=${encodeURIComponent(key)}`),
    ]);
    if (ticket !== selection) return;
    if (reportResult.status === 'rejected') throw reportResult.reason;
    const data = reportResult.value;
    renderDetail(data.report, data.checks, key, replayResult);
    if (scroll)
      $('details').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  } catch (error) {
    if (ticket === selection)
      content.replaceChildren(node('div', error.message, 'empty'));
  }
}
function renderDetail(report, checks, key, replayResult) {
  const content = $('detail-content');
  content.replaceChildren();
  const intro = panel(''),
    heading = node('div', undefined, 'detail-heading'),
    text = node('div');
  intro.firstChild.remove();
  text.append(
    node('h3', report.definition.title),
    node(
      'div',
      `${key.startsWith('sample:') ? 'Reviewed example' : 'Saved local run'} / ${report.runId}`,
      'context-line',
    ),
    node(
      'div',
      `${date(report.startedAt)} / ${report.environment.fixtureMode || 'Unknown fixture'} / ${report.endpointClass}`,
      'context-line',
    ),
  );
  heading.append(text, badge(report.result));
  intro.append(heading);
  const actions = node('div', undefined, 'detail-actions');
  for (const [label, format] of [
    ['Report JSON', 'report'],
    ['Report Markdown', 'md'],
    ['Evidence JSON', 'evidence'],
  ]) {
    if (format === 'evidence' && !report.evidence) continue;
    const link = node('a', `${label} \u2193`);
    link.href = resource(
      `/api/download?key=${encodeURIComponent(key)}&format=${format}`,
    );
    link.download = `${report.runId}.${format === 'md' ? 'md' : `${format}.json`}`;
    actions.append(link);
  }
  intro.append(
    actions,
    node('p', report.definition.expectedInvariant),
    details('Required preconditions', report.definition.preconditions),
    node(
      'p',
      'Admission, active state and execution success are separate observations. A matching offline check does not clear a recorded failure.',
    ),
  );
  content.append(intro);
  const grid = node('div', undefined, 'detail-grid');
  const timeline = panel('Action timeline');
  report.steps.forEach((step, index) => {
    const el = node('details'),
      summary = node('summary');
    summary.append(
      node('span', String(index + 1).padStart(2, '0'), 'step-index'),
      node('span', step.id.replaceAll('-', ' '), 'step-title'),
      badge(step.result),
    );
    el.append(summary, node('p', date(step.at)), pretty(step.observed));
    timeline.append(el);
  });
  const evidence = panel('Selected output checks');
  evidence.append(
    badge(checks.status),
    node(
      'p',
      `${checks.checks.length} selected checks / ${checks.notReevaluatedSteps.length} actions not fully reevaluated. Original scenario: ${checks.recordedRunResult}.`,
    ),
  );
  evidence.append(
    node(
      'p',
      'CONSISTENT means selected saved outputs match recorded responses. It is not a new live PASS or independent verification.',
    ),
  );
  for (const check of checks.checks) {
    const row = node('div', undefined, 'check'),
      label = node('div', check.stepId.replaceAll('-', ' '), 'check-label');
    label.append(
      node(
        'small',
        `${check.check} / RPC sequences ${check.rpcSequences.join(', ') || 'unavailable'}`,
      ),
    );
    row.append(label, badge(check.status));
    evidence.append(row);
  }
  evidence.append(
    details('Unreevaluated actions', checks.notReevaluatedSteps),
    details('Coverage limitations', checks.limitations),
    details('Saved-context requirements', checks.requirements),
  );
  grid.append(timeline, evidence);
  const journal = panel('Recorded RPC evidence');
  journal.classList.add('full-width');
  if (!report.evidence)
    journal.append(
      node(
        'p',
        'This historical report has no projected RPC journal. Evidence is unavailable, not inferred.',
      ),
    );
  else {
    const e = report.evidence;
    journal.append(
      keyValues({
        Recording: e.complete
          ? 'Complete filtered journal'
          : 'Incomplete recording',
        'Recorded entries': e.entries.length,
        'Omitted entries': e.omitted,
        'Unavailable reads': e.unavailable,
        Format: e.format,
      }),
      node(
        'p',
        'Filtered projections omit signing payloads, secrets and arbitrary server text. Recovered startup failures remain visible.',
      ),
    );
    const tools = node('div', undefined, 'journal-tools'),
      select = node('select');
    select.setAttribute('aria-label', 'Filter RPC evidence');
    for (const [value, label] of [
      ['all', 'All observations'],
      ['errors', 'Errors / unavailable'],
      ['results', 'Responses'],
    ]) {
      const option = node('option', label);
      option.value = value;
      select.append(option);
    }
    tools.append(node('span', 'Inspect individual responses', 'muted'), select);
    const rows = node('div', undefined, 'journal');
    const render = () => {
      rows.replaceChildren();
      const filtered = e.entries.filter(
        (entry) =>
          select.value === 'all' ||
          (select.value === 'errors'
            ? entry.outcome !== 'RESULT'
            : entry.outcome === 'RESULT'),
      );
      if (!filtered.length)
        rows.append(node('p', 'No observations match this filter.'));
      for (const entry of filtered) {
        const item = node('details'),
          summary = node('summary');
        summary.append(
          node('span', String(entry.seq), 'step-index'),
          node('span', entry.method, 'journal-method'),
          badge(entry.outcome),
        );
        item.append(summary, pretty(entry));
        rows.append(item);
      }
    };
    select.addEventListener('change', render);
    render();
    journal.append(tools, rows);
  }
  const context = panel('Source, environment & limits');
  context.classList.add('full-width');
  context.append(
    node('p', report.definition.expectedInvariant),
    details('Source rule', report.definition.sourceRule),
    details('Source pins', report.sourcePins),
    details('Observed environment', report.environment),
    details('Run limitations', report.limitations),
    details('Reproducer (display only)', report.reproducer),
  );
  const replay = panel('Fresh-state rerun');
  replay.classList.add('full-width');
  if (replayResult.status === 'fulfilled') {
    const plan = replayResult.value;
    replay.append(
      node(
        'p',
        'Exact historical replay: unavailable. This command creates a new isolated fixture. It is never executed by the viewer.',
      ),
      list(plan.requirements),
      node('pre', plan.command, 'data'),
      details('Comparison limits', plan.limitations),
    );
  } else
    replay.append(
      node(
        'p',
        `Replay plan unavailable: ${replayResult.reason.message}`,
        'error-text',
      ),
    );
  grid.append(journal, context, replay);
  content.append(grid);
}
$('compare-button').addEventListener('click', async () => {
  const ticket = ++comparison;
  const left = $('compare-left').value,
    right = $('compare-right').value,
    target = $('compare-result');
  if (!left || !right) {
    target.replaceChildren(
      node('p', 'Choose a baseline and a rerun first.', 'error-text'),
    );
    return;
  }
  $('compare-button').disabled = true;
  target.replaceChildren(node('p', 'Comparing saved runs...', 'muted'));
  try {
    const result = await request(
      `/api/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
    );
    if (ticket !== comparison) return;
    const card = node('div', undefined, 'comparison-card');
    card.append(
      node('h3', result.comparison.replaceAll('_', ' ')),
      node(
        'p',
        result.bothRunsPassed
          ? 'Both saved runs passed and their stable environment fields match.'
          : 'Matching outcomes do not imply a passing scenario. Review each recorded verdict.',
        'muted',
      ),
      keyValues({
        'Baseline verdict': result.baselineResult,
        'Rerun verdict': result.rerunResult,
        'Exact historical replay':
          result.mode === 'MINED_CHECKPOINT_RERUN'
            ? 'No / mined-checkpoint comparison'
            : result.mode === 'GENESIS_RESET_RERUN'
              ? 'No / genesis-reset comparison'
              : 'No / fresh-state comparison',
        'Environment differences':
          result.environmentDifferences.join(', ') || 'None in compared fields',
      }),
    );
    if (result.resetChecks)
      card.append(details('Reset input checks', result.resetChecks));
    const header = node('div', undefined, 'comparison-row');
    header.append(
      node('strong', 'Action'),
      node('strong', 'Baseline'),
      node('strong', 'Rerun'),
    );
    card.append(header);
    for (const action of result.actions) {
      const row = node('div', undefined, 'comparison-row');
      row.append(
        node('span', action.id.replaceAll('-', ' ')),
        badge(action.baseline),
        badge(action.rerun),
      );
      card.append(row);
    }
    target.replaceChildren(card);
  } catch (error) {
    if (ticket === comparison)
      target.replaceChildren(node('p', error.message, 'error-text'));
  } finally {
    $('compare-button').disabled = false;
  }
});
for (const id of ['compare-left', 'compare-right'])
  $(id).addEventListener('change', () => {
    comparison += 1;
    $('compare-result').replaceChildren();
  });
$('refresh-scenarios').addEventListener('click', loadScenarios);
$('refresh').addEventListener('click', loadRuns);
for (const id of ['search', 'verdict', 'source'])
  $(id).addEventListener(id === 'search' ? 'input' : 'change', renderRuns);
loadRuns();
loadScenarios();

let liveTicket = 0;
async function liveCheck(inspect) {
  const target = $('live-result'),
    hash = $('live-hash').value.trim(),
    ticket = ++liveTicket;
  if (inspect && !/^0x[a-f0-9]{64}$/i.test(hash)) {
    target.replaceChildren(
      node(
        'p',
        'Enter a valid 0x-prefixed transaction hash with 64 hexadecimal digits.',
        'error-text',
      ),
    );
    return;
  }
  $('live-inspect').disabled = true;
  $('live-network').disabled = true;
  target.replaceChildren(
    node('p', 'Querying the real public gateway now...', 'muted'),
  );
  try {
    const data = await request(
      inspect ? `/api/live?hash=${encodeURIComponent(hash)}` : '/api/live',
    );
    if (ticket !== liveTicket) return;
    const card = panel('Live gateway response'),
      info = inspect ? data.before : data.info;
    card.append(
      keyValues({
        'Observed now': date(data.observedAt),
        'Public chain ID': data.chainId,
        'Gateway version': info.version,
        'Source commit': info.commit || 'Unknown / not verified',
        'Bundling mode': info.bundlingMode,
      }),
    );
    if (inspect) {
      card.append(
        keyValues({
          'Transaction hash': data.requestedHash,
          'Current lifecycle': data.status.value?.status || 'Unavailable',
          'Admission observed': data.result.admissionObserved
            ? 'Yes'
            : 'Not established',
          'Frame execution': data.result.execution,
          'Receipt block': data.receipt.value?.blockNumber || 'Unavailable',
          'Observation issues':
            data.result.issues.join(', ') ||
            'None detected; missing fields remain unavailable',
        }),
      );
      if (data.receipt.value)
        card.append(
          details('Actual frame receipts', data.receipt.value.frameReceipts),
        );
      card.append(details('Current projected evidence', data));
    }
    card.append(
      node(
        'p',
        'Read-only observation, not a new scenario run or a source-specific invariant PASS. Missing receipts or explorer history are not replaced with recorded examples.',
        'muted',
      ),
    );
    target.replaceChildren(card);
  } catch (error) {
    if (ticket === liveTicket)
      target.replaceChildren(
        node(
          'p',
          `Live check unavailable: ${error.message}. No saved result substituted.`,
          'error-text',
        ),
      );
  } finally {
    if (ticket === liveTicket) {
      $('live-inspect').disabled = false;
      $('live-network').disabled = false;
    }
  }
}
$('live-network').addEventListener('click', () => liveCheck(false));
$('live-inspect').addEventListener('click', () => liveCheck(true));

if (globalThis.aftershockStatic) {
  $('execute-controls').hidden = true;
  $('local-runner-link').hidden = false;
}
let trackingExecution = false;
async function trackExecution(start = false) {
  if (globalThis.aftershockStatic || trackingExecution) return;
  trackingExecution = true;
  const target = $('execute-result');
  $('execute-start').disabled = true;
  try {
    let job = (await request('/api/execute')).job;
    if (!job && !start) return;
    if (!job) {
      try {
        job = await request('/api/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenarioId: $('execute-scenario').value }),
        });
      } catch (error) {
        if (error.status !== 409) throw error;
        job = (await request('/api/execute')).job;
        if (!job) throw error;
      }
    }
    while (job.state === 'RUNNING') {
      target.replaceChildren(
        node(
          'p',
          `Real isolated run ${job.id} is running. Waiting for node observations; no verdict yet.`,
          'muted',
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      job = await request(`/api/execute?job=${encodeURIComponent(job.id)}`);
    }
    if (job.state !== 'COMPLETED')
      throw new Error(job.error || 'Run did not produce a saved report');
    target.replaceChildren(
      node(
        'p',
        `Fresh run ${job.runId}: ${job.result}. Review the actual report below.`,
        'muted',
      ),
    );
    await loadRuns();
    await selectRun(`local:${job.runId}`, true);
  } catch (error) {
    target.replaceChildren(
      node('p', `Fresh execution unavailable: ${error.message}`, 'error-text'),
    );
  } finally {
    trackingExecution = false;
    $('execute-start').disabled = false;
  }
}
$('execute-start').addEventListener('click', () => trackExecution(true));
if (!globalThis.aftershockStatic) void trackExecution();
