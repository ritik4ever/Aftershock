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
  if (
    url.origin === 'http://localhost' &&
    ['/api/live', '/api/runner', '/api/test'].includes(url.pathname)
  )
    return url.pathname + url.search;
  const file = globalThis.aftershockStatic[url.pathname + url.search];
  if (!file) throw new Error('Unavailable in this published snapshot');
  return file;
}
async function request(path, options = {}) {
  const response = await fetch(resource(path), {
    signal: AbortSignal.timeout(
      path === '/api/test'
        ? 55000
        : path.startsWith('/api/runner')
          ? 19000
          : path.startsWith('/api/live')
            ? 16000
            : 10000,
    ),
    credentials: 'omit',
    ...options,
  });
  const data = await response.json();
  if (
    !response.ok ||
    (data.error &&
      !(
        (path.startsWith('/api/execute') ||
          path.startsWith('/api/runner') ||
          path.startsWith('/api/contract-run')) &&
        data.state === 'ERROR'
      ))
  )
    throw Object.assign(new Error(data.error || 'Request unavailable'), {
      status: response.status,
      activeRun: response.status === 409 ? data.activeRun : undefined,
    });
  return data;
}
function showActiveWorkflow(target, error) {
  const id = error.activeRun?.id;
  if (error.status !== 409 || !/^[1-9][0-9]{0,15}$/.test(id || '')) return;
  target.append(
    node(
      'p',
      `Shared workflow ${id} is already queued or running. It may be testing another visitor's input; it is not a result for your requested test. No new job was started.`,
      'muted',
    ),
  );
  const link = node('a', 'Watch active GitHub workflow', 'button');
  link.href = `https://github.com/ritik4ever/Aftershock/actions/runs/${id}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  target.append(link);
}
async function readRemoteJob(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(path);
    } catch (error) {
      if (
        attempt >= 2 ||
        (error.status && error.status < 500) ||
        (!error.status &&
          !['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(
            error.name,
          ))
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
let contractEndpoint = '',
  contractExample = null,
  contractTracking = false,
  contractJob = '',
  contractRequest = '';
function enableContractLab(example, endpoint) {
  if (!example) return;
  contractEndpoint = endpoint;
  contractExample = example;
  $('contract-controls').hidden = false;
  $('contract-availability').textContent =
    endpoint === '/api/runner'
      ? 'Ready on GitHub-hosted isolated nodes. Setup and mining take several minutes. Shared execution limits apply.'
      : 'Ready on this local isolated Docker runner.';
  try {
    contractJob =
      globalThis.sessionStorage?.getItem(
        `aftershock-contract-job:${endpoint}`,
      ) || '';
    contractRequest =
      globalThis.sessionStorage?.getItem(
        `aftershock-contract-request:${endpoint}`,
      ) || '';
  } catch {
    /* The accepted job link remains visible without storage. */
  }
  if (
    contractJob &&
    (endpoint === '/api/runner'
      ? /^[1-9][0-9]{0,15}$/
      : /^[a-f0-9-]{36}$/i
    ).test(contractJob)
  )
    void trackContractPlan(false);
}
$('contract-example').addEventListener('click', () => {
  $('contract-plan').value = JSON.stringify(contractExample, null, 2);
});
$('contract-file').addEventListener('change', async () => {
  const file = $('contract-file').files?.[0];
  if (!file) return;
  if (file.size > 49152) {
    $('contract-result').textContent = 'Plan file exceeds 48 KiB.';
    return;
  }
  try {
    $('contract-plan').value = await file.text();
  } catch {
    $('contract-result').textContent = 'Cannot read the selected plan file.';
  }
});
async function trackContractPlan(start) {
  if (!contractEndpoint || contractTracking) return;
  contractTracking = true;
  const target = $('contract-result'),
    button = $('contract-start');
  button.disabled = true;
  try {
    let job = contractJob
      ? await readRemoteJob(
          `${contractEndpoint}?job=${encodeURIComponent(contractJob)}`,
        )
      : null;
    if (start && job?.state !== 'RUNNING') job = null;
    if (!job && !start) return;
    if (!job) {
      const plan = JSON.parse($('contract-plan').value);
      if (JSON.stringify(plan).length > 48000)
        throw new Error('Plan exceeds 48 KB');
      if (!contractRequest) contractRequest = crypto.randomUUID();
      try {
        globalThis.sessionStorage?.setItem(
          `aftershock-contract-request:${contractEndpoint}`,
          contractRequest,
        );
      } catch {
        /* Keep in memory. */
      }
      job = await request(contractEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: contractRequest,
          plan,
          ...(contractEndpoint === '/api/runner'
            ? { scenarioId: 'custom-contract' }
            : {}),
        }),
      });
      contractJob = job.id;
      contractRequest = '';
      try {
        globalThis.sessionStorage?.setItem(
          `aftershock-contract-job:${contractEndpoint}`,
          contractJob,
        );
        globalThis.sessionStorage?.removeItem(
          `aftershock-contract-request:${contractEndpoint}`,
        );
      } catch {
        /* Show job ID below. */
      }
    }
    while (job.state === 'RUNNING') {
      target.replaceChildren(
        node(
          'p',
          `Contract job ${job.id}: queued or executing real deployment and transactions. No result yet.`,
          'muted',
        ),
        ...executionDetails(job),
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      job = await readRemoteJob(
        `${contractEndpoint}?job=${encodeURIComponent(job.id)}`,
      );
    }
    if (job.state !== 'COMPLETED')
      throw new Error(job.error || 'No verified contract report');
    const { report } = await readRemoteJob(
      `${contractEndpoint}?job=${encodeURIComponent(job.id)}&format=detail`,
    );
    const download = node(
      'a',
      'Download actual contract report JSON ↓',
      'button',
    );
    download.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`;
    download.setAttribute('download', `${report.runId}.contract-report.json`);
    target.replaceChildren(
      node('h3', `${report.plan.name}: ${report.result}`),
      node(
        'p',
        `New isolated run ${report.runId}. Plan SHA-256 ${report.planSha256}.`,
        'muted',
      ),
      download,
      ...executionDetails(job),
      details('Executed public plan', report.plan),
    );
    for (const step of report.steps)
      target.append(details(`${step.id}: ${step.result}`, step.observed));
  } catch (error) {
    target.replaceChildren(
      node('p', `Contract test unavailable: ${error.message}`, 'error-text'),
    );
    showActiveWorkflow(target, error);
    if (contractJob) {
      const reconnect = node(
        'button',
        'Reconnect to this contract run',
        'button',
      );
      reconnect.addEventListener('click', () => trackContractPlan(false));
      target.append(
        node(
          'p',
          `Retained job ${contractJob}; a connection error does not prove execution failed.`,
          'muted',
        ),
        reconnect,
      );
    }
  } finally {
    contractTracking = false;
    button.disabled = false;
  }
}
$('contract-start').addEventListener('click', () => trackContractPlan(true));
function userTestMode() {
  const contract = $('user-kind').value === 'contract';
  $('user-transaction').hidden = contract;
  $('user-contract').hidden = !contract;
  $('user-test-result').replaceChildren();
}
$('user-kind').addEventListener('change', userTestMode);
$('user-contract-example').addEventListener('click', () => {
  $('user-to').value = '0x1b7d32025F7cA633943BbCC9Ec61a98ef66187b6';
  $('user-from').value = '0x0000000000000000000000000000000000000001';
  $('user-data').value = '0x95d89b41';
  $('user-value').value = '0x0';
  $('user-gas').value = '0xf4240';
  $('user-expected').value =
    '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000045745544800000000000000000000000000000000000000000000000000000000';
  $('user-test-result').replaceChildren(
    node(
      'p',
      'Documented sponsor-devnet WETH address; availability is checked only when you run the test. You can replace every field with your own deployed contract call.',
      'muted',
    ),
  );
});
$('user-test-start').addEventListener('click', async () => {
  const button = $('user-test-start'),
    target = $('user-test-result');
  button.disabled = true;
  target.replaceChildren(
    node('p', 'Checking your input against current devnet state…', 'muted'),
  );
  const kind = $('user-kind').value;
  try {
    const expected = $('user-expected').value.trim();
    const input =
      kind === 'transaction'
        ? { kind, raw: $('user-raw').value.trim() }
        : {
            kind,
            to: $('user-to').value.trim(),
            from: $('user-from').value.trim(),
            data: $('user-data').value.trim() || '0x',
            value: $('user-value').value.trim() || '0x0',
            gas: $('user-gas').value.trim() || '0xf4240',
            ...(expected ? { expectedReturn: expected } : {}),
          };
    const result = await request('/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const download = node('a', 'Download this dry-run report JSON ↓', 'button');
    download.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`;
    download.setAttribute('download', `aftershock-${kind}-dry-run.json`);
    target.replaceChildren(
      node('h3', `Your ${kind} dry run: ${result.result}`),
      node('p', result.scope, 'muted'),
      node(
        'p',
        `Observed ${date(result.observedAt)} · Chain ${result.chainId} · Block ${result.block.number}`,
        'muted',
      ),
      node(
        'p',
        'Alternative-mempool admission and mining: NOT TESTED. A PASS applies only to the checks below.',
        'muted',
      ),
      download,
      details('Input summary', result.summary),
    );
    for (const check of result.checks)
      target.append(details(`${check.name}: ${check.result}`, check.observed));
  } catch (error) {
    target.replaceChildren(
      node('p', `Your test is unavailable: ${error.message}`, 'error-text'),
    );
  } finally {
    button.disabled = false;
  }
});
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
      `${key.startsWith('remote:') ? 'Fresh GitHub-hosted isolated run' : key.startsWith('sample:') ? 'Reviewed example' : 'Saved local run'} / ${report.runId}`,
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
      key.startsWith('remote:')
        ? `/api/runner?job=${encodeURIComponent(key.slice(7))}&format=${format}`
        : `/api/download?key=${encodeURIComponent(key)}&format=${format}`,
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
let remoteAvailable = false;
let remoteJob = '';
let remoteRequest = '';
function remoteRequestId() {
  if (!remoteRequest) remoteRequest = globalThis.crypto.randomUUID();
  try {
    globalThis.sessionStorage?.setItem(
      'aftershock-remote-request',
      remoteRequest,
    );
  } catch {
    $('remote-status').textContent =
      'Retry recovery unavailable. Check the GitHub workflow if a request times out.';
  }
  return remoteRequest;
}
function storeRemoteJob(id) {
  remoteJob = id;
  try {
    globalThis.sessionStorage?.setItem('aftershock-remote-job', id);
  } catch {
    $('remote-status').textContent =
      'Browser storage unavailable. Keep this tab open until the run finishes.';
  }
}
function executionDetails(job) {
  const parts = [];
  if (
    job.workflowUrl &&
    /^https:\/\/github\.com\/ritik4ever\/Aftershock\/actions\/runs\/[0-9]+$/.test(
      job.workflowUrl,
    )
  ) {
    const link = node('a', 'Open live GitHub workflow progress');
    link.href = job.workflowUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    parts.push(link);
  }
  if (job.startedAt)
    parts.push(
      node(
        'p',
        `Started ${date(job.startedAt)}. Last update ${date(job.updatedAt || job.startedAt)}. ${job.completedChecks ?? 0} checks completed.`,
        'muted',
      ),
    );
  if (job.progress?.length) {
    const timeline = node('ol');
    for (const event of job.progress.slice(-8))
      timeline.append(
        node(
          'li',
          `${date(event.at)} · ${event.phase}: ${event.label}${event.result ? ` — ${event.result}` : ''}`,
        ),
      );
    parts.push(timeline);
  }
  if (job.guidance)
    parts.push(
      node('p', `${job.guidance.code}: ${job.guidance.message}`, 'muted'),
    );
  return parts;
}
async function trackExecution(start = false) {
  if ((globalThis.aftershockStatic && !remoteAvailable) || trackingExecution)
    return;
  trackingExecution = true;
  const target = $('execute-result');
  $('execute-start').disabled = true;
  try {
    let job = remoteAvailable
      ? remoteJob
        ? await readRemoteJob(
            `/api/runner?job=${encodeURIComponent(remoteJob)}`,
          )
        : null
      : (await request('/api/execute')).job;
    if (remoteAvailable && start && job?.state !== 'RUNNING') job = null;
    if (!job && !start) return;
    if (!job) {
      try {
        job = await request(remoteAvailable ? '/api/runner' : '/api/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scenarioId: $('execute-scenario').value,
            ...(remoteAvailable
              ? {
                  requestId: remoteRequestId(),
                }
              : {}),
          }),
        });
        if (remoteAvailable) {
          storeRemoteJob(job.id);
          remoteRequest = '';
          try {
            globalThis.sessionStorage?.removeItem('aftershock-remote-request');
          } catch {
            $('remote-status').textContent =
              'The job was accepted. Refresh recovery may be unavailable.';
          }
        }
      } catch (error) {
        if (remoteAvailable || error.status !== 409) throw error;
        job = (await request('/api/execute')).job;
        if (!job) throw error;
      }
    }
    while (job.state === 'RUNNING') {
      target.replaceChildren(
        node(
          'p',
          `${remoteAvailable ? 'GitHub-hosted' : 'Real'} isolated run ${job.id} is queued or running. Waiting for observations; no verdict yet.`,
          'muted',
        ),
        ...executionDetails(job),
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      job = await (remoteAvailable ? readRemoteJob : request)(
        `${remoteAvailable ? '/api/runner' : '/api/execute'}?job=${encodeURIComponent(job.id)}`,
      );
    }
    if (job.state !== 'COMPLETED') {
      target.replaceChildren(
        node(
          'p',
          job.error || 'Run did not produce a saved report',
          'error-text',
        ),
        ...executionDetails(job),
      );
      return;
    }
    target.replaceChildren(
      node(
        'p',
        `Fresh run ${job.runId}: ${job.result}. Review the actual report below.`,
        'muted',
      ),
      ...executionDetails(job),
    );
    await loadRuns();
    if (remoteAvailable) {
      const data = await readRemoteJob(
        `/api/runner?job=${encodeURIComponent(job.id)}&format=detail`,
      );
      selection += 1;
      selected = '';
      renderDetail(data.report, data.checks, `remote:${job.id}`, {
        status: 'rejected',
        reason: new Error(
          'Start a new remote scenario to rerun it. Private signing state is not published.',
        ),
      });
      $('details').scrollIntoView({ behavior: 'smooth' });
    } else await selectRun(`local:${job.runId}`, true);
  } catch (error) {
    target.replaceChildren(
      node('p', `Fresh execution unavailable: ${error.message}`, 'error-text'),
    );
    showActiveWorkflow(target, error);
    if (remoteAvailable && remoteJob) {
      target.append(
        node(
          'p',
          `Connection to run ${remoteJob} was interrupted. This does not mean the workflow failed. Reconnect to retrieve its actual result without starting another run.`,
          'muted',
        ),
        ...executionDetails({
          workflowUrl: `https://github.com/ritik4ever/Aftershock/actions/runs/${remoteJob}`,
        }),
      );
      const reconnect = node('button', 'Reconnect to existing run');
      reconnect.addEventListener('click', () => trackExecution());
      target.append(reconnect);
    }
  } finally {
    trackingExecution = false;
    $('execute-start').disabled = false;
  }
}
$('execute-start').addEventListener('click', () => trackExecution(true));
if (!globalThis.aftershockStatic) {
  void trackExecution();
  void request('/api/contract-run')
    .then((capability) =>
      enableContractLab(capability.example, '/api/contract-run'),
    )
    .catch(() => {
      $('contract-availability').textContent =
        'Local contract runner unavailable.';
    });
} else {
  void (async () => {
    try {
      const capability = await request('/api/runner');
      if (!capability.available) return;
      remoteAvailable = true;
      if (capability.contractPlans)
        enableContractLab(capability.contractExample, '/api/runner');
      $('execution-description').textContent =
        'Runs real signed transactions and state transitions on an isolated GitHub-hosted Linux VM. No local Docker installation is required. The job creates a new report; it does not reuse an archived result.';
      $('execute-controls').hidden = false;
      $('local-runner-link').hidden = true;
      $('remote-status').textContent =
        'Anyone can start a supported test. Runs execute on GitHub-hosted Linux, not your computer. Shared capacity is limited to four starts per hour, with one active workflow. Queue and setup can take several minutes; closing your laptop does not stop the job.';
      const select = $('execute-scenario');
      select.replaceChildren();
      for (const id of capability.scenarios) {
        const option = node('option', id);
        option.value = id;
        select.append(option);
      }
      select.value = capability.scenarios[0];
      try {
        const saved = globalThis.sessionStorage?.getItem(
          'aftershock-remote-job',
        );
        if (/^[1-9][0-9]{0,15}$/.test(saved || '')) remoteJob = saved;
        const pending = globalThis.sessionStorage?.getItem(
          'aftershock-remote-request',
        );
        if (/^[a-f0-9-]{36}$/i.test(pending || '')) remoteRequest = pending;
      } catch {
        $('remote-status').append(
          node('p', 'Refresh recovery unavailable in this browser.'),
        );
      }
      if (remoteJob) await trackExecution();
    } catch {
      $('remote-status').textContent =
        'Remote execution is unavailable. Live public checks and recorded reports remain separate.';
    }
  })();
}
